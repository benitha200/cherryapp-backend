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
      batchNo,
      status
    } = req.body;

    if (!date || !outputKgs || !batchNo || !processingType || !status) {
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
      // Only update processing status if status is COMPLETED
      if (status === 'COMPLETED' && existingProcessing?.id) {
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
          // Create/Update HONEY bagging off record
          if (outputKgs.H1) {
            const honeyOutput = {
              H1: parseFloat(outputKgs.H1) || 0
            };
            
            // Check if there's an existing HONEY record for this batch
            const existingHoneyRecord = await tx.baggingOff.findFirst({
              where: {
                batchNo,
                processingType: 'HONEY',
                processingId: existingProcessing?.id || processing.id
              }
            });

            let honeyBaggingOff;
            if (existingHoneyRecord) {
              // Update existing record
              honeyBaggingOff = await tx.baggingOff.update({
                where: { id: existingHoneyRecord.id },
                data: {
                  date: new Date(date),
                  outputKgs: honeyOutput,
                  totalOutputKgs: honeyOutput.H1,
                  status: status
                },
                include: {
                  processing: {
                    include: {
                      cws: true
                    }
                  }
                }
              });
            } else {
              // Create new record
              honeyBaggingOff = await tx.baggingOff.create({
                data: {
                  batchNo,
                  processingId: existingProcessing?.id || processing.id,
                  date: new Date(date),
                  outputKgs: honeyOutput,
                  totalOutputKgs: honeyOutput.H1,
                  processingType: 'HONEY',
                  status: status
                },
                include: {
                  processing: {
                    include: {
                      cws: true
                    }
                  }
                }
              });
            }
            baggingOffRecords.push(honeyBaggingOff);
          }

          // Create/Update FULLY WASHED bagging off record if A0-A3 values exist
          if (outputKgs.A0 || outputKgs.A1 || outputKgs.A2 || outputKgs.A3) {
            const fullyWashedOutput = {
              A0: parseFloat(outputKgs.A0) || 0,
              A1: parseFloat(outputKgs.A1) || 0,
              A2: parseFloat(outputKgs.A2) || 0,
              A3: parseFloat(outputKgs.A3) || 0
            };
            const fullyWashedTotal = Object.values(fullyWashedOutput)
              .reduce((sum, kg) => sum + kg, 0);
            
            // Check if there's an existing FULLY WASHED record for this batch
            const existingFWRecord = await tx.baggingOff.findFirst({
              where: {
                batchNo,
                processingType: 'FULLY WASHED',
                processingId: existingProcessing?.id || processing.id
              }
            });

            let fullyWashedBaggingOff;
            if (existingFWRecord) {
              // Update existing record
              fullyWashedBaggingOff = await tx.baggingOff.update({
                where: { id: existingFWRecord.id },
                data: {
                  date: new Date(date),
                  outputKgs: fullyWashedOutput,
                  totalOutputKgs: fullyWashedTotal,
                  status: status
                },
                include: {
                  processing: {
                    include: {
                      cws: true
                    }
                  }
                }
              });
            } else {
              // Create new record
              fullyWashedBaggingOff = await tx.baggingOff.create({
                data: {
                  batchNo,
                  processingId: existingProcessing?.id || processing.id,
                  date: new Date(date),
                  outputKgs: fullyWashedOutput,
                  totalOutputKgs: fullyWashedTotal,
                  processingType: 'FULLY WASHED',
                  status: status
                },
                include: {
                  processing: {
                    include: {
                      cws: true
                    }
                  }
                }
              });
            }
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
          
          // Check for existing NATURAL record
          const existingNaturalRecord = await tx.baggingOff.findFirst({
            where: {
              batchNo,
              processingType: 'NATURAL',
              processingId: existingProcessing?.id || processing.id
            }
          });

          let naturalBaggingOff;
          if (existingNaturalRecord) {
            // Update existing record
            naturalBaggingOff = await tx.baggingOff.update({
              where: { id: existingNaturalRecord.id },
              data: {
                date: new Date(date),
                outputKgs: naturalOutput,
                totalOutputKgs: Object.values(naturalOutput).reduce((sum, kg) => sum + kg, 0),
                status: status
              },
              include: {
                processing: {
                  include: {
                    cws: true
                  }
                }
              }
            });
          } else {
            // Create new record
            naturalBaggingOff = await tx.baggingOff.create({
              data: {
                batchNo,
                processingId: existingProcessing?.id || processing.id,
                date: new Date(date),
                outputKgs: naturalOutput,
                totalOutputKgs: Object.values(naturalOutput).reduce((sum, kg) => sum + kg, 0),
                processingType: 'NATURAL',
                status: status
              },
              include: {
                processing: {
                  include: {
                    cws: true
                  }
                }
              }
            });
          }
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

          // Check for existing FULLY WASHED record
          const existingFWRecord = await tx.baggingOff.findFirst({
            where: {
              batchNo,
              processingType: 'FULLY WASHED',
              processingId: existingProcessing?.id || processing.id
            }
          });

          let fullyWashedBaggingOff;
          if (existingFWRecord) {
            // Update existing record
            fullyWashedBaggingOff = await tx.baggingOff.update({
              where: { id: existingFWRecord.id },
              data: {
                date: new Date(date),
                outputKgs: fullyWashedOutput,
                totalOutputKgs: Object.values(fullyWashedOutput).reduce((sum, kg) => sum + kg, 0),
                status: status
              },
              include: {
                processing: {
                  include: {
                    cws: true
                  }
                }
              }
            });
          } else {
            // Create new record
            fullyWashedBaggingOff = await tx.baggingOff.create({
              data: {
                batchNo,
                processingId: existingProcessing?.id || processing.id,
                date: new Date(date),
                outputKgs: fullyWashedOutput,
                totalOutputKgs: Object.values(fullyWashedOutput).reduce((sum, kg) => sum + kg, 0),
                processingType: 'FULLY WASHED',
                status: status
              },
              include: {
                processing: {
                  include: {
                    cws: true
                  }
                }
              }
            });
          }
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

router.get('/batch/:batchNo', async (req, res) => {
  try {
    const { batchNo } = req.params;
    
    const baggingOffs = await prisma.baggingOff.findMany({
      where: { batchNo },
      orderBy: { createdAt: 'desc' },
      include: {
        processing: {
          include: {
            cws: true
          }
        }
      }
    });

    res.json(baggingOffs);
  } catch (error) {
    console.error('Error fetching bagging offs by batch:', error);
    res.status(500).json({ error: 'Failed to retrieve bagging offs' });
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