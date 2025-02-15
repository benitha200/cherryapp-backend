import { Router } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

const generateBatchNumber = (cws, grade, purchaseDate) => {
  const now = new Date(purchaseDate);
  const year = now.getFullYear().toString().slice(-2);
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');

  return `${year}${cws.code}${day}${month}${grade}`;
};

// Helper function to check if processing has started for a specific date
const hasProcessingStarted = async (cwsId, purchaseDate) => {
  const purchaseDateObj = new Date(purchaseDate);
  purchaseDateObj.setUTCHours(0, 0, 0, 0);
  
  const purchaseEndDate = new Date(purchaseDate);
  purchaseEndDate.setUTCHours(23, 59, 59, 999);

  const processingEntries = await prisma.processing.findMany({
    where: {
      cwsId: cwsId,
      OR: [
        {
          startDate: {
            gte: purchaseDateObj,
            lte: purchaseEndDate
          }
        },
        {
          startDate: {
            gte: purchaseDateObj
          }
        }
      ],
      status: {
        in: ['IN_PROGRESS', 'COMPLETED']
      }
    }
  });

  const matchingEntries = processingEntries.filter(entry => {
    const processingDate = new Date(entry.startDate);
    return (
      processingDate.getUTCFullYear() === purchaseDateObj.getUTCFullYear() &&
      processingDate.getUTCMonth() === purchaseDateObj.getUTCMonth() &&
      processingDate.getUTCDate() === purchaseDateObj.getUTCDate()
    );
  });

  return matchingEntries.length > 0;
};

// Helper function to check if batch is already in processing
const isBatchInProcessing = async (batchNo) => {
  const processingEntry = await prisma.processing.findFirst({
    where: {
      batchNo: batchNo,
      status: {
        in: ['IN_PROGRESS', 'COMPLETED']
      }
    }
  });

  return processingEntry !== null;
};

router.post('/', async (req, res) => {
  const {
    deliveryType,
    totalKgs,
    totalPrice,
    cherryPrice,
    transportFee,
    commissionFee,
    grade,
    cwsId,
    siteCollectionId,
    purchaseDate
  } = req.body;

  try {
    const cws = await prisma.cWS.findUnique({
      where: { id: cwsId }
    });

    if (!cws) {
      return res.status(404).json({ 
        error: 'CWS not found' 
      });
    }

    if (!purchaseDate || isNaN(new Date(purchaseDate).getTime())) {
      return res.status(400).json({
        error: 'Invalid purchase date format'
      });
    }

    const processingStarted = await hasProcessingStarted(cwsId, purchaseDate);
    if (processingStarted) {
      return res.status(400).json({
        error: 'Cannot add purchase. Processing has already started for cherries from this date.'
      });
    }

    const batchNo = generateBatchNumber(cws, grade, purchaseDate);

    // Check if the batch is already in processing
    const batchInProcessing = await isBatchInProcessing(batchNo);
    if (batchInProcessing) {
      return res.status(400).json({
        error: 'That batch is already in processing, you can\'t add other purchases'
      });
    }

    const purchaseDateTime = new Date(purchaseDate);
    purchaseDateTime.setUTCHours(0, 0, 0, 0);

    const existingPurchase = await prisma.purchase.findFirst({
      where: {
        cwsId,
        grade,
        purchaseDate: {
          gte: purchaseDateTime,
          lt: new Date(purchaseDateTime.getTime() + 24 * 60 * 60 * 1000)
        },
        ...(deliveryType === 'SITE_COLLECTION' 
          ? { siteCollectionId }
          : { deliveryType }
        )
      }
    });

    if (existingPurchase) {
      const errorMessage = deliveryType === 'SITE_COLLECTION'
        ? 'A purchase for this site and grade already exists for this date'
        : `A ${deliveryType.toLowerCase()} purchase for this grade already exists for this date`;
      
      return res.status(400).json({ error: errorMessage });
    }

    const purchase = await prisma.purchase.create({
      data: {
        deliveryType,
        totalKgs,
        totalPrice,
        cherryPrice,
        transportFee,
        commissionFee,
        grade,
        cwsId,
        siteCollectionId: deliveryType === 'SITE_COLLECTION' ? siteCollectionId : null,
        batchNo,
        purchaseDate: purchaseDateTime
      },
      include: {
        cws: true,
        siteCollection: true
      }
    });

    res.json(purchase);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});
// Get all purchases
router.get('/', async (req, res) => {
  try {
    const purchases = await prisma.purchase.findMany({
      include: {
        cws: true,
        siteCollection: true
      },
      orderBy: {
        id: 'desc'
      }
    });
    
    res.json(purchases);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Get purchases for a CWS
router.get('/cws/:cwsId', async (req, res) => {
  const { cwsId } = req.params;

  try {
    const purchases = await prisma.purchase.findMany({
      where: {
        cwsId: parseInt(cwsId)
      },
      include: {
        cws: true,
        siteCollection: true
      },
      orderBy: {
        id: 'desc'
      }
    });

    res.json(purchases);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// New endpoint for grouped purchases
router.get('/grouped', async (req, res) => {
  try {
    const groupedPurchases = await prisma.purchase.groupBy({
      by: ['purchaseDate'],
      _sum: {
        totalKgs: true,
        totalPrice: true
      },
      _count: {
        id: true
      }
    });

    const detailedGroupedPurchases = await Promise.all(
      groupedPurchases.map(async (group) => {
        const deliveryTypes = await prisma.purchase.groupBy({
          by: ['deliveryType'],
          where: {
            purchaseDate: group.purchaseDate
          },
          _sum: {
            totalKgs: true,
            totalPrice: true
          },
          _count: {
            id: true
          }
        });

        return {
          date: group.purchaseDate,
          totalKgs: group._sum.totalKgs,
          totalPrice: group._sum.totalPrice,
          totalPurchases: group._count.id,
          deliveryTypes
        };
      })
    );

    res.json(detailedGroupedPurchases);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/date/:date', async (req, res) => {
  const { date } = req.params;
  try {
    const purchases = await prisma.purchase.findMany({
      where: { 
        purchaseDate: { gte: new Date(date), lt: new Date(+new Date(date) + 86400000) }
      },
      include: { cws: true, siteCollection: true },
      orderBy: { cwsId: 'asc' }
    });
    const groupedPurchases = purchases.reduce((acc, p) => {
      const cws = acc.find(c => c.cwsId === p.cwsId) || { cwsId: p.cwsId, name: p.cws.name, purchases: [] };
      cws.purchases.push(p);
      if (!acc.some(c => c.cwsId === p.cwsId)) acc.push(cws);
      return acc;
    }, []);
    res.json(groupedPurchases);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// Get a single purchase by ID
router.get('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const purchase = await prisma.purchase.findUnique({
      where: {
        id: parseInt(id)
      },
      include: {
        cws: true,
        siteCollection: true
      }
    });

    if (!purchase) {
      return res.status(404).json({ error: 'Purchase not found' });
    }

    res.json(purchase);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});


// Update a purchase
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const {
    deliveryType,
    totalKgs,
    totalPrice,
    cherryPrice,
    transportFee,
    commissionFee,
    grade,
    cwsId,
    siteCollectionId
  } = req.body;

  try {
    const existingPurchase = await prisma.purchase.findUnique({
      where: { id: parseInt(id) },
      include: { cws: true }
    });

    if (!existingPurchase) {
      return res.status(404).json({ error: 'Purchase not found' });
    }

    // Check if the grade has changed
    let batchNo = existingPurchase.batchNo;
    if (grade !== existingPurchase.grade) {
      // Get the CWS data if cwsId is changing, otherwise use the existing one
      const cws = cwsId !== existingPurchase.cwsId
        ? await prisma.cWS.findUnique({ where: { id: cwsId } })
        : existingPurchase.cws;
      
      if (!cws) {
        return res.status(404).json({ error: 'CWS not found' });
      }
      
      // Regenerate batch number with new grade
      batchNo = generateBatchNumber(cws, grade, existingPurchase.purchaseDate);
      
      // Check if the new batch is already in processing
      const batchInProcessing = await isBatchInProcessing(batchNo);
      if (batchInProcessing) {
        return res.status(400).json({
          error: 'Cannot update grade. The new batch is already in processing.'
        });
      }
    }

    const updatedPurchase = await prisma.purchase.update({
      where: {
        id: parseInt(id)
      },
      data: {
        deliveryType,
        totalKgs,
        totalPrice,
        cherryPrice,
        transportFee,
        commissionFee,
        grade,
        cwsId,
        siteCollectionId: deliveryType === 'SITE_COLLECTION' ? siteCollectionId : null,
        batchNo // Use the potentially updated batch number
      },
      include: {
        cws: true,
        siteCollection: true
      }
    });

    res.json(updatedPurchase);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Update a purchase
// router.put('/:id', async (req, res) => {
//   const { id } = req.params;
//   const {
//     deliveryType,
//     totalKgs,
//     totalPrice,
//     cherryPrice,    // New field
//     transportFee,   // New field
//     commissionFee,  // New field
//     grade,
//     cwsId,
//     siteCollectionId
//   } = req.body;

//   try {
//     const existingPurchase = await prisma.purchase.findUnique({
//       where: { id: parseInt(id) }
//     });

//     if (!existingPurchase) {
//       return res.status(404).json({ error: 'Purchase not found' });
//     }

//     const updatedPurchase = await prisma.purchase.update({
//       where: {
//         id: parseInt(id)
//       },
//       data: {
//         deliveryType,
//         totalKgs,
//         totalPrice,
//         cherryPrice,    // Update cherry price
//         transportFee,   // Update transport fee
//         commissionFee,  // Update commission fee
//         grade,
//         cwsId,
//         siteCollectionId: deliveryType === 'SITE_COLLECTION' ? siteCollectionId : null
//       },
//       include: {
//         cws: true,
//         siteCollection: true
//       }
//     });

//     res.json(updatedPurchase);
//   } catch (error) {
//     res.status(400).json({ error: error.message });
//   }
// });

// Delete a purchase
router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    // Check if purchase exists
    const existingPurchase = await prisma.purchase.findUnique({
      where: { id: parseInt(id) }
    });

    if (!existingPurchase) {
      return res.status(404).json({ error: 'Purchase not found' });
    }

    // Delete purchase
    await prisma.purchase.delete({
      where: {
        id: parseInt(id)
      }
    });

    res.json({ message: 'Purchase deleted successfully' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

export default router;