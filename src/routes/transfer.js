import { Router } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

// Create new transfer
router.post('/', async (req, res) => {
  const { baggingOffId, batchNo, notes } = req.body;

  try {
    // Check if bagging off record exists and is completed
    const baggingOff = await prisma.baggingOff.findFirst({
      where: { 
        id: baggingOffId,
        status: 'COMPLETED'
      }
    });

    if (!baggingOff) {
      return res.status(404).json({ error: 'Bagging off record not found or not completed' });
    }

    // Create transfer record
    const transfer = await prisma.transfer.create({
      data: {
        batchNo,
        baggingOffId,
        notes,
        transferDate: new Date()
      },
      include: {
        baggingOff: {
          include: {
            processing: {
              include: {
                cws: true
              }
            }
          }
        }
      }
    });

    res.status(201).json(transfer);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Get all transfers
router.get('/', async (req, res) => {
  try {
    const transfers = await prisma.transfer.findMany({
      include: {
        baggingOff: {
          include: {
            processing: {
              include: {
                cws: true
              }
            }
          }
        }
      },
      orderBy: {
        transferDate: 'desc'
      }
    });

    res.json(transfers);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Get transfers by batch number
router.get('/batch/:batchNo', async (req, res) => {
  const { batchNo } = req.params;

  try {
    const transfers = await prisma.transfer.findMany({
      where: { batchNo },
      include: {
        baggingOff: {
          include: {
            processing: {
              include: {
                cws: true
              }
            }
          }
        }
      },
      orderBy: {
        transferDate: 'desc'
      }
    });

    if (transfers.length === 0) {
      return res.status(404).json({ error: 'No transfers found for this batch' });
    }

    res.json(transfers);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Get transfers by CWS
router.get('/cws/:cwsId', async (req, res) => {
  const { cwsId } = req.params;
  const { startDate, endDate } = req.query;

  try {
    const where = {
      baggingOff: {
        processing: {
          cwsId: parseInt(cwsId)
        }
      }
    };

    // Add date filtering if both dates are provided
    if (startDate && endDate) {
      where.transferDate = {
        gte: new Date(startDate),
        lte: new Date(endDate)
      };
    }

    const transfers = await prisma.transfer.findMany({
      where,
      include: {
        baggingOff: {
          include: {
            processing: {
              include: {
                cws: true
              }
            }
          }
        }
      },
      orderBy: {
        transferDate: 'desc'
      }
    });

    res.json(transfers);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Get transfer history for a specific bagging off record
router.get('/bagging-off/:baggingOffId', async (req, res) => {
  const { baggingOffId } = req.params;

  try {
    const transfers = await prisma.transfer.findMany({
      where: { 
        baggingOffId: parseInt(baggingOffId)
      },
      include: {
        baggingOff: {
          include: {
            processing: {
              include: {
                cws: true
              }
            }
          }
        }
      },
      orderBy: {
        transferDate: 'desc'
      }
    });

    res.json(transfers);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Update transfer
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { notes, status } = req.body;

  try {
    const transfer = await prisma.transfer.update({
      where: { id: parseInt(id) },
      data: {
        notes,
        status
      },
      include: {
        baggingOff: {
          include: {
            processing: {
              include: {
                cws: true
              }
            }
          }
        }
      }
    });

    res.json(transfer);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

export default router;