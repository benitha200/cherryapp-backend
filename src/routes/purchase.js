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
// const hasProcessingStarted = async (cwsId, purchaseDate) => {
//   const purchaseDateObj = new Date(purchaseDate);
//   purchaseDateObj.setUTCHours(0, 0, 0, 0);
  
//   const purchaseEndDate = new Date(purchaseDate);
//   purchaseEndDate.setUTCHours(23, 59, 59, 999);

//   const processingEntries = await prisma.processing.findMany({
//     where: {
//       cwsId: cwsId,
//       OR: [
//         {
//           startDate: {
//             gte: purchaseDateObj,
//             lte: purchaseEndDate
//           }
//         },
//         {
//           startDate: {
//             gte: purchaseDateObj
//           }
//         }
//       ],
//       status: {
//         in: ['IN_PROGRESS', 'COMPLETED']
//       }
//     }
//   });

//   const matchingEntries = processingEntries.filter(entry => {
//     const processingDate = new Date(entry.startDate);
//     return (
//       processingDate.getUTCFullYear() === purchaseDateObj.getUTCFullYear() &&
//       processingDate.getUTCMonth() === purchaseDateObj.getUTCMonth() &&
//       processingDate.getUTCDate() === purchaseDateObj.getUTCDate()
//     );
//   });

//   return matchingEntries.length > 0;
// };

const hasProcessingStarted = async (cwsId, purchaseDate, grade) => {
  const purchaseDateObj = new Date(purchaseDate);
  purchaseDateObj.setUTCHours(0, 0, 0, 0);
  
  // Get the CWS details to generate the batch number
  const cws = await prisma.cWS.findUnique({
    where: { id: cwsId }
  });
  
  if (!cws) {
    throw new Error('CWS not found');
  }

  // Generate the batch number for this purchase
  const batchNo = generateBatchNumber(cws, grade, purchaseDate);

  // Check if this specific batch is in processing
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

// router.get('/cws-aggregated', async (req, res) => {
//   try {
//     // Calculate yesterday's date range
//     const yesterday = new Date();
//     yesterday.setDate(yesterday.getDate() - 1);
//     yesterday.setUTCHours(0, 0, 0, 0);

//     const endOfYesterday = new Date(yesterday);
//     endOfYesterday.setUTCHours(23, 59, 59, 999);

//     // First get all CWS
//     const cwsList = await prisma.cWS.findMany({
//       select: {
//         id: true,
//         name: true,
//         code: true
//       }
//     });

//     // Find all batch numbers that are in processing
//     const processingBatches = await prisma.processing.findMany({
//       select: {
//         batchNo: true
//       }
//     });

//     const batchNumbersInProcessing = processingBatches.map(p => p.batchNo);

//     // Then get purchases for yesterday for each CWS that have batch numbers in processing
//     const aggregatedData = await Promise.all(cwsList.map(async (cws) => {
//       const purchases = await prisma.purchase.findMany({
//         where: {
//           cwsId: cws.id,
//           purchaseDate: {
//             gte: yesterday,
//             lte: endOfYesterday
//           },
//           batchNo: {
//             in: batchNumbersInProcessing
//           }
//         },
//         select: {
//           totalKgs: true,
//           totalPrice: true,
//           cherryPrice: true,
//           transportFee: true,
//           commissionFee: true,
//           purchaseDate: true,
//           batchNo: true
//         }
//       });

//       // Calculate totals
//       const totals = purchases.reduce((acc, purchase) => {
//         return {
//           totalKgs: acc.totalKgs + purchase.totalKgs,
//           totalPrice: acc.totalPrice + purchase.totalPrice,
//           totalCherryPrice: acc.totalCherryPrice + (purchase.totalKgs * purchase.cherryPrice),
//           totalTransportFee: acc.totalTransportFee + (purchase.totalKgs * purchase.transportFee),
//           totalCommissionFee: acc.totalCommissionFee + (purchase.totalKgs * purchase.commissionFee)
//         };
//       }, {
//         totalKgs: 0,
//         totalPrice: 0,
//         totalCherryPrice: 0,
//         totalTransportFee: 0,
//         totalCommissionFee: 0
//       });

//       return {
//         cwsId: cws.id,
//         cwsName: cws.name,
//         cwsCode: cws.code,
//         ...totals,
//         purchaseDate: yesterday
//       };
//     }));

//     // Filter out CWS with no purchases
//     const filteredData = aggregatedData.filter(cws => cws.totalKgs > 0);

//     res.json(filteredData);
//   } catch (error) {
//     res.status(500).json({
//       error: 'Failed to fetch aggregated CWS data',
//       details: error.message
//     });
//   }
// });

// Add this new endpoint to your router

router.get('/cws-aggregated', async (req, res) => {
  try {
    // Calculate yesterday's date range
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setUTCHours(0, 0, 0, 0);

    const endOfYesterday = new Date(yesterday);
    endOfYesterday.setUTCHours(23, 59, 59, 999);

    // First get all CWS
    const cwsList = await prisma.cWS.findMany({
      select: {
        id: true,
        name: true,
        code: true
      }
    });

    // Find all batch numbers that are in processing
    const processingBatches = await prisma.processing.findMany({
      select: {
        batchNo: true
      }
    });

    // Extract batch prefixes (everything before the grade letter or hyphen)
    const batchPrefixes = processingBatches.map(p => {
      // Find the last occurrence of a number before any letter or hyphen
      const match = p.batchNo.match(/^(\d+[A-Z]+\d+)/);
      return match ? match[1] : p.batchNo;
    });

    // Then get purchases for yesterday for each CWS that have matching batch prefixes
    const aggregatedData = await Promise.all(cwsList.map(async (cws) => {
      const purchases = await prisma.purchase.findMany({
        where: {
          cwsId: cws.id,
          purchaseDate: {
            gte: yesterday,
            lte: endOfYesterday
          }
        },
        select: {
          totalKgs: true,
          totalPrice: true,
          cherryPrice: true,
          transportFee: true,
          commissionFee: true,
          purchaseDate: true,
          batchNo: true
        }
      });

      // Filter purchases to only include those with matching batch prefixes
      const matchingPurchases = purchases.filter(purchase => {
        const purchaseBatchPrefix = purchase.batchNo.match(/^(\d+[A-Z]+\d+)/)?.[1];
        return purchaseBatchPrefix && batchPrefixes.some(prefix => 
          purchaseBatchPrefix.includes(prefix) || prefix.includes(purchaseBatchPrefix)
        );
      });

      // Calculate totals
      const totals = matchingPurchases.reduce((acc, purchase) => {
        return {
          totalKgs: acc.totalKgs + purchase.totalKgs,
          totalPrice: acc.totalPrice + purchase.totalPrice,
          totalCherryPrice: acc.totalCherryPrice + (purchase.totalKgs * purchase.cherryPrice),
          totalTransportFee: acc.totalTransportFee + (purchase.totalKgs * purchase.transportFee),
          totalCommissionFee: acc.totalCommissionFee + (purchase.totalKgs * purchase.commissionFee)
        };
      }, {
        totalKgs: 0,
        totalPrice: 0,
        totalCherryPrice: 0,
        totalTransportFee: 0,
        totalCommissionFee: 0
      });

      return {
        cwsId: cws.id,
        cwsName: cws.name,
        cwsCode: cws.code,
        ...totals,
        purchaseDate: yesterday
      };
    }));

    // Filter out CWS with no purchases
    const filteredData = aggregatedData.filter(cws => cws.totalKgs > 0);

    res.json(filteredData);
  } catch (error) {
    res.status(500).json({
      error: 'Failed to fetch aggregated CWS data',
      details: error.message
    });
  }
});

router.get('/cws-aggregated/date-range', async (req, res) => {
  const { startDate, endDate } = req.query;

  try {
    // Validate date parameters
    if (!startDate || !endDate || isNaN(new Date(startDate).getTime()) || isNaN(new Date(endDate).getTime())) {
      return res.status(400).json({
        error: 'Invalid date format. Please provide valid startDate and endDate in ISO format'
      });
    }

    const start = new Date(startDate);
    start.setUTCHours(0, 0, 0, 0);

    const end = new Date(endDate);
    end.setUTCHours(23, 59, 59, 999);

    // Get all CWS
    const cwsList = await prisma.cWS.findMany({
      select: {
        id: true,
        name: true,
        code: true
      }
    });

    // Find all batch numbers that are in processing
    const processingBatches = await prisma.processing.findMany({
      select: {
        batchNo: true
      }
    });

    const batchNumbersInProcessing = processingBatches.map(p => p.batchNo);

    // Get purchases for each CWS within the date range
    const aggregatedData = await Promise.all(cwsList.map(async (cws) => {
      const purchases = await prisma.purchase.findMany({
        where: {
          cwsId: cws.id,
          purchaseDate: {
            gte: start,
            lte: end
          },
          batchNo: {
            in: batchNumbersInProcessing
          }
        },
        select: {
          totalKgs: true,
          totalPrice: true,
          cherryPrice: true,
          transportFee: true,
          commissionFee: true,
          purchaseDate: true,
          batchNo: true,
          deliveryType: true,
          grade: true
        }
      });

      // Calculate totals
      const totals = purchases.reduce((acc, purchase) => {
        return {
          totalKgs: acc.totalKgs + purchase.totalKgs,
          totalPrice: acc.totalPrice + purchase.totalPrice,
          totalCherryPrice: acc.totalCherryPrice + (purchase.totalKgs * purchase.cherryPrice),
          totalTransportFee: acc.totalTransportFee + (purchase.totalKgs * purchase.transportFee),
          totalCommissionFee: acc.totalCommissionFee + (purchase.totalKgs * purchase.commissionFee)
        };
      }, {
        totalKgs: 0,
        totalPrice: 0,
        totalCherryPrice: 0,
        totalTransportFee: 0,
        totalCommissionFee: 0
      });

      // Calculate delivery type breakdown
      const deliveryTypeBreakdown = purchases.reduce((acc, purchase) => {
        if (!acc[purchase.deliveryType]) {
          acc[purchase.deliveryType] = {
            totalKgs: 0,
            totalPrice: 0
          };
        }
        acc[purchase.deliveryType].totalKgs += purchase.totalKgs;
        acc[purchase.deliveryType].totalPrice += purchase.totalPrice;
        return acc;
      }, {});

      // Calculate grade breakdown
      const gradeBreakdown = purchases.reduce((acc, purchase) => {
        if (!acc[purchase.grade]) {
          acc[purchase.grade] = {
            totalKgs: 0,
            totalPrice: 0
          };
        }
        acc[purchase.grade].totalKgs += purchase.totalKgs;
        acc[purchase.grade].totalPrice += purchase.totalPrice;
        return acc;
      }, {});

      return {
        cwsId: cws.id,
        cwsName: cws.name,
        cwsCode: cws.code,
        ...totals,
        deliveryTypeBreakdown,
        gradeBreakdown,
        numberOfPurchases: purchases.length,
        dateRange: {
          start,
          end
        }
      };
    }));

    // Filter out CWS with no purchases
    const filteredData = aggregatedData.filter(cws => cws.totalKgs > 0);

    // Calculate overall totals
    const overallTotals = filteredData.reduce((acc, cws) => {
      return {
        totalKgs: acc.totalKgs + cws.totalKgs,
        totalPrice: acc.totalPrice + cws.totalPrice,
        totalCherryPrice: acc.totalCherryPrice + cws.totalCherryPrice,
        totalTransportFee: acc.totalTransportFee + cws.totalTransportFee,
        totalCommissionFee: acc.totalCommissionFee + cws.totalCommissionFee,
        numberOfCWS: acc.numberOfCWS + 1
      };
    }, {
      totalKgs: 0,
      totalPrice: 0,
      totalCherryPrice: 0,
      totalTransportFee: 0,
      totalCommissionFee: 0,
      numberOfCWS: 0
    });

    res.json({
      data: filteredData,
      overallTotals,
      dateRange: {
        start,
        end
      }
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to fetch aggregated CWS data',
      details: error.message
    });
  }
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