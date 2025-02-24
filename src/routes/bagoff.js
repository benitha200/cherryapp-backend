import express from 'express';
import { PrismaClient } from '@prisma/client';

const router = express.Router();
const prisma = new PrismaClient();

router.post('/', async (req, res) => {
  try {
    const {
      date,
      outputKgs,
      processingType,
      existingProcessing,
      batchNo
    } = req.body;

    if (!date || !outputKgs || !batchNo || !processingType) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Get the processing details
    const processing = await prisma.processing.findFirst({
      where: { batchNo },
      include: {
        cws: true
      }
    });

    if (!processing) {
      return res.status(404).json({ error: 'Processing not found for this batch' });
    }

    // Process the bagging off in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Update existing processing status if it exists
      if (existingProcessing?.id) {
        await tx.processing.update({
          where: { id: existingProcessing.id },
          data: { 
            status: 'COMPLETED',
            endDate: new Date()
          }
        });
      }

      let baggingOffRecords = [];

      switch (processingType) {
        case 'HONEY':
          // Create HONEY bagging off record
          if (outputKgs.H1) {
            const honeyOutput = {
              H1: parseFloat(outputKgs.H1) || 0
            };
            const honeyBaggingOff = await tx.baggingOff.create({
              data: {
                batchNo,
                processingId: existingProcessing?.id || processing.id,
                date: new Date(date),
                outputKgs: honeyOutput,
                totalOutputKgs: honeyOutput.H1,
                processingType: 'HONEY',
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
            baggingOffRecords.push(honeyBaggingOff);
          }

          // Create FULLY WASHED bagging off record if A0-A3 values exist
          if (outputKgs.A0 || outputKgs.A1 || outputKgs.A2 || outputKgs.A3) {
            const fullyWashedOutput = {
              A0: parseFloat(outputKgs.A0) || 0,
              A1: parseFloat(outputKgs.A1) || 0,
              A2: parseFloat(outputKgs.A2) || 0,
              A3: parseFloat(outputKgs.A3) || 0
            };
            const fullyWashedTotal = Object.values(fullyWashedOutput)
              .reduce((sum, kg) => sum + kg, 0);
            
            const fullyWashedBaggingOff = await tx.baggingOff.create({
              data: {
                batchNo,
                processingId: existingProcessing?.id || processing.id,
                date: new Date(date),
                outputKgs: fullyWashedOutput,
                totalOutputKgs: fullyWashedTotal,
                processingType: 'FULLY WASHED',
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
            baggingOffRecords.push(fullyWashedBaggingOff);
          }
          break;

        case 'NATURAL':
          const naturalOutput = batchNo.endsWith('-2') || batchNo.endsWith('B')
            ? {
                B1: parseFloat(outputKgs.B1) || 0,
                B2: parseFloat(outputKgs.B2) || 0
              }
            : {
                N1: parseFloat(outputKgs.N1) || 0,
                N2: parseFloat(outputKgs.N2) || 0
              };
          
          const naturalBaggingOff = await tx.baggingOff.create({
            data: {
              batchNo,
              processingId: existingProcessing?.id || processing.id,
              date: new Date(date),
              outputKgs: naturalOutput,
              totalOutputKgs: Object.values(naturalOutput).reduce((sum, kg) => sum + kg, 0),
              processingType: 'NATURAL',
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
          baggingOffRecords.push(naturalBaggingOff);
          break;

        case 'FULLY_WASHED':
        case 'FULLY WASHED':
          const fullyWashedOutput = batchNo.endsWith('-2') || batchNo.endsWith('B')
            ? {
                B1: parseFloat(outputKgs.B1) || 0,
                B2: parseFloat(outputKgs.B2) || 0
              }
            : {
                A0: parseFloat(outputKgs.A0) || 0,
                A1: parseFloat(outputKgs.A1) || 0,
                A2: parseFloat(outputKgs.A2) || 0,
                A3: parseFloat(outputKgs.A3) || 0
              };

          const fullyWashedBaggingOff = await tx.baggingOff.create({
            data: {
              batchNo,
              processingId: existingProcessing?.id || processing.id,
              date: new Date(date),
              outputKgs: fullyWashedOutput,
              totalOutputKgs: Object.values(fullyWashedOutput).reduce((sum, kg) => sum + kg, 0),
              processingType: 'FULLY WASHED',
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
          baggingOffRecords.push(fullyWashedBaggingOff);
          break;

        default:
          throw new Error('Invalid processing type');
      }

      return baggingOffRecords;
    });

    res.status(201).json(result);
  } catch (error) {
    console.error('Bagging off error:', error);
    res.status(500).json({ error: 'Failed to process bagging off' });
  }
});

// Keep existing GET routes unchanged
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