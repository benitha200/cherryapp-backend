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

    // Get the processing details to check the grade and CWS details
    const processing = await prisma.processing.findFirst({
      where: { batchNo },
      include: {
        cws: true
      }
    });

    if (!processing) {
      return res.status(404).json({ error: 'Processing not found for this batch' });
    }

    // Determine output types based on CWS speciality and processing type
    let normalizedOutputKgs;
    
    if (processing.cws.havespeciality && processing.processingType === 'NATURAL') {
      if (batchNo.endsWith('-1')) {
        normalizedOutputKgs = {
          N1: outputKgs.N1 || 0,
          N2: outputKgs.N2 || 0
        };
      } else if (batchNo.endsWith('-2')) {
        normalizedOutputKgs = {
          B1: outputKgs.B1 || 0,
          B2: outputKgs.B2 || 0
        };
      }
    } else {
      // Standard processing based on grade
      if (processing.grade === 'A') {
        normalizedOutputKgs = {
          A0: outputKgs.A0 || 0,
          A1: outputKgs.A1 || 0,
          A2: outputKgs.A2 || 0,
          A3: outputKgs.A3 || 0
        };
      } else if (processing.grade === 'B') {
        normalizedOutputKgs = {
          B1: outputKgs.B1 || 0,
          B2: outputKgs.B2 || 0
        };
      }
    }

    // Validate that we have a valid output configuration
    if (!normalizedOutputKgs) {
      return res.status(400).json({ 
        error: 'Invalid processing configuration for the given batch and CWS type' 
      });
    }

    const totalOutputKgs = Object.values(normalizedOutputKgs)
      .reduce((sum, kg) => sum + parseFloat(kg || 0), 0);

    const result = await prisma.$transaction(async (tx) => {
      if (existingProcessing) {
        await tx.processing.update({
          where: { id: existingProcessing.id },
          data: { 
            status: 'COMPLETED',
            endDate: new Date()
          }
        });
      }

      const baggingOff = await tx.baggingOff.create({
        data: {
          batchNo,
          processingId: existingProcessing?.id,
          date: new Date(date),
          outputKgs: normalizedOutputKgs, // Prisma will handle JSON serialization
          totalOutputKgs,
          status: 'COMPLETED'
        },
        include: {
          processing: {
            include: {
              cws: true
            }
          }
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
            cwsId: cwsId
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