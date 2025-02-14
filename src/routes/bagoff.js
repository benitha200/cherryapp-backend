import express from 'express';
import { PrismaClient } from '@prisma/client';

const router = express.Router();
const prisma = new PrismaClient();

router.post('/', async (req, res) => {
  try {
    const {
      date,
      outputKgs,
      existingProcessing,
      batchNo
    } = req.body;

    if (!date || !outputKgs || !batchNo) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Normalize outputKgs to ensure all possible grades are represented
    const normalizedOutputKgs = {
      A0: outputKgs.A0 || 0,
      A1: outputKgs.A1 || 0,
      A2: outputKgs.A2 || 0,
      A3: outputKgs.A3 || 0
    };

    const totalOutputKgs = Object.values(normalizedOutputKgs)
      .reduce((sum, kg) => sum + parseFloat(kg || 0), 0);

    const result = await prisma.$transaction(async (tx) => {
      if (existingProcessing) {
        await tx.processing.update({
          where: { id: existingProcessing.id },
          data: { status: 'COMPLETED' }
        });
      }

      const baggingOff = await tx.baggingOff.create({
        data: {
          batchNo,
          processingId: existingProcessing?.id,
          date: new Date(date),
          outputKgs: JSON.stringify(normalizedOutputKgs),
          totalOutputKgs: totalOutputKgs,
          status: 'COMPLETED'
        }
      });

      return baggingOff;
    });

    res.status(201).json(result);
  } catch (error) {
    console.error('Bagging off error:', error);
    res.status(500).json({ error: 'Failed to process bagging off' });
  }
});

router.get('/', async (req, res) => {
  try {
    const baggingOffEntries = await prisma.baggingOff.findMany({
      include: {
        processing: {
          include: {
            cws: true
          }
        },
        transfers: true
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json(baggingOffEntries);
  } catch (error) {
    console.error('Error fetching bagging off entries:', error);
    res.status(500).json({ error: 'Failed to retrieve bagging off entries' });
  }
});

router.get('/cws/:cwsId', async (req, res) => {
    try {
      const cwsId = parseInt(req.params.cwsId);
  
      if (isNaN(cwsId)) {
        return res.status(400).json({ error: 'Invalid CWS ID. Must be a number.' });
      }
  
      const baggingOffEntries = await prisma.baggingOff.findMany({
        where: {
          processing: {
            cwsId: cwsId  // Now passing as integer
          }
        },
        include: {
          processing: {
            include: {
              cws: true
            }
          },
          transfers: true
        },
        orderBy: { createdAt: 'desc' }
      });
  
      res.json(baggingOffEntries);
    } catch (error) {
      console.error('Error fetching bagging off entries by CWS:', error);
      res.status(500).json({ error: 'Failed to retrieve bagging off entries' });
    }
  });
  
  export default router;