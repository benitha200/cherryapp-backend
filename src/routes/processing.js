import { Router } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

router.post('/', async (req, res) => {
    const {
      batchNo,
      processingType,
      totalKgs,
      grade,
      cwsId
    } = req.body;
  
    try {
      // Validate batch exists
      const existingPurchase = await prisma.purchase.findFirst({
        where: { batchNo, grade }
      });
  
      if (!existingPurchase) {
        return res.status(404).json({ error: 'Batch not found' });
      }
  
      // Check if processing for this batch already exists
      const existingProcessing = await prisma.processing.findFirst({
        where: { batchNo }
      });
  
      if (existingProcessing) {
        return res.status(400).json({ error: 'Processing for this batch already started' });
      }
  
      const processing = await prisma.processing.create({
        data: {
          batchNo,
          processingType,
          totalKgs,
          grade,
          cwsId,
          status: 'IN_PROGRESS', // Explicitly set to IN_PROGRESS when starting
          startDate: new Date() // Explicitly set start date
        },
        include: {
        //   purchase: true,
          cws: true
        }
      });
  
      res.status(201).json(processing);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });


// Get Processing by Batch Number
router.get('/batch/:batchNo', async (req, res) => {
  const { batchNo } = req.params;

  try {
    const processing = await prisma.processing.findMany({
      where: { batchNo },
      include: {
        cws: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    if (processing.length === 0) {
      return res.status(404).json({ error: 'No processing found for this batch' });
    }

    res.json(processing);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Update Processing Status
router.put('/:id/status', async (req, res) => {
  const { id } = req.params;
  const { status, notes } = req.body;

  try {
    const updatedProcessing = await prisma.processing.update({
      where: { id: parseInt(id) },
      data: {
        status,
        ...(notes && { notes }),
        ...(status === 'COMPLETED' && { endDate: new Date() })
      },
      include: {
        cws: true
      }
    });

    res.json(updatedProcessing);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Get All Processing Entries for a CWS
router.get('/cws/:cwsId', async (req, res) => {
  const { cwsId } = req.params;
  const { status, processingType } = req.query;

  try {
    const processing = await prisma.processing.findMany({
      where: {
        cwsId: parseInt(cwsId),
        ...(status),
        ...(processingType)
      },
      include: {
        cws: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    res.json(processing);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Get Processing Statistics
router.get('/stats/:cwsId', async (req, res) => {
  const { cwsId } = req.params;

  try {
    const stats = await prisma.processing.groupBy({
      by: ['processingType', 'status'],
      where: { cwsId: parseInt(cwsId) },
      _sum: {
        totalKgs: true
      },
      _count: {
        id: true
      }
    });

    res.json(stats);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

export default router;