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
      status,
      progressive = false // New parameter to handle progressive mode
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
          // Handle HONEY processing
          if (outputKgs.H1) {
            const honeyOutput = {
              H1: parseFloat(outputKgs.H1) || 0
            };

            if (progressive) {
              // Fetch existing record for progressive mode
              const existingHoneyRecord = await tx.baggingOff.findFirst({
                where: {
                  batchNo,
                  processingType: 'HONEY',
                  processingId: existingProcessing?.id || processing.id
                }
              });

              if (existingHoneyRecord) {
                // Add new output to existing output
                const updatedHoneyOutput = {
                  H1: (parseFloat(existingHoneyRecord.outputKgs.H1) || 0) + honeyOutput.H1
                };

                const honeyBaggingOff = await tx.baggingOff.update({
                  where: { id: existingHoneyRecord.id },
                  data: {
                    date: new Date(date),
                    outputKgs: updatedHoneyOutput,
                    totalOutputKgs: updatedHoneyOutput.H1,
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
                baggingOffRecords.push(honeyBaggingOff);
              } else {
                // Create new record if no existing record
                const honeyBaggingOff = await tx.baggingOff.create({
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
                baggingOffRecords.push(honeyBaggingOff);
              }
            } else {
              // Regular mode (overwrite existing record)
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
          }
          break;

        case 'NATURAL':
          // Handle NATURAL processing
          const naturalOutput = {};
          let naturalTotalKgs = 0;

          // Handle different batch naming conventions (-1/-2 or A/B)
          const isSecondaryBatch = batchNo.endsWith('-2') || batchNo.endsWith('B');

          if (isSecondaryBatch) {
            if (outputKgs.B1) {
              naturalOutput.B1 = parseFloat(outputKgs.B1) || 0;
              naturalTotalKgs += naturalOutput.B1;
            }
            if (outputKgs.B2) {
              naturalOutput.B2 = parseFloat(outputKgs.B2) || 0;
              naturalTotalKgs += naturalOutput.B2;
            }
          } else {
            if (outputKgs.N1) {
              naturalOutput.N1 = parseFloat(outputKgs.N1) || 0;
              naturalTotalKgs += naturalOutput.N1;
            }
            if (outputKgs.N2) {
              naturalOutput.N2 = parseFloat(outputKgs.N2) || 0;
              naturalTotalKgs += naturalOutput.N2;
            }
          }

          if (naturalTotalKgs > 0) {
            if (progressive) {
              // Fetch existing record for progressive mode
              const existingNaturalRecord = await tx.baggingOff.findFirst({
                where: {
                  batchNo,
                  processingType: 'NATURAL',
                  processingId: existingProcessing?.id || processing.id
                }
              });

              if (existingNaturalRecord) {
                // Add new output to existing output
                const updatedNaturalOutput = { ...existingNaturalRecord.outputKgs };
                Object.keys(naturalOutput).forEach(key => {
                  updatedNaturalOutput[key] = (parseFloat(updatedNaturalOutput[key]) || 0) + naturalOutput[key];
                });

                const naturalBaggingOff = await tx.baggingOff.update({
                  where: { id: existingNaturalRecord.id },
                  data: {
                    date: new Date(date),
                    outputKgs: updatedNaturalOutput,
                    totalOutputKgs: Object.values(updatedNaturalOutput).reduce((sum, val) => sum + val, 0),
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
                baggingOffRecords.push(naturalBaggingOff);
              } else {
                // Create new record if no existing record
                const naturalBaggingOff = await tx.baggingOff.create({
                  data: {
                    batchNo,
                    processingId: existingProcessing?.id || processing.id,
                    date: new Date(date),
                    outputKgs: naturalOutput,
                    totalOutputKgs: naturalTotalKgs,
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
                baggingOffRecords.push(naturalBaggingOff);
              }
            } else {
              // Regular mode (overwrite existing record)
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
                    totalOutputKgs: naturalTotalKgs,
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
                    totalOutputKgs: naturalTotalKgs,
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
            }
          }
          break;

        case 'FULLY WASHED':
        case 'FULLY_WASHED':
          // Handle FULLY WASHED processing
          const fullyWashedOutput = {};
          let fullyWashedTotalKgs = 0;

          // Handle different batch naming conventions (-1/-2 or A/B)
          const isSecondaryFWBatch = batchNo.endsWith('-2') || batchNo.endsWith('B');

          if (isSecondaryFWBatch) {
            if (outputKgs.B1) {
              fullyWashedOutput.B1 = parseFloat(outputKgs.B1) || 0;
              fullyWashedTotalKgs += fullyWashedOutput.B1;
            }
            if (outputKgs.B2) {
              fullyWashedOutput.B2 = parseFloat(outputKgs.B2) || 0;
              fullyWashedTotalKgs += fullyWashedOutput.B2;
            }
          } else {
            ['A0', 'A1', 'A2', 'A3'].forEach(grade => {
              if (outputKgs[grade]) {
                fullyWashedOutput[grade] = parseFloat(outputKgs[grade]) || 0;
                fullyWashedTotalKgs += fullyWashedOutput[grade];
              }
            });
          }

          if (fullyWashedTotalKgs > 0) {
            if (progressive) {
              // Fetch existing record for progressive mode
              const existingFWRecord = await tx.baggingOff.findFirst({
                where: {
                  batchNo,
                  processingType: 'FULLY WASHED',
                  processingId: existingProcessing?.id || processing.id
                }
              });

              if (existingFWRecord) {
                // Add new output to existing output
                const updatedFWOutput = { ...existingFWRecord.outputKgs };
                Object.keys(fullyWashedOutput).forEach(key => {
                  updatedFWOutput[key] = (parseFloat(updatedFWOutput[key]) || 0) + fullyWashedOutput[key];
                });

                const fullyWashedBaggingOff = await tx.baggingOff.update({
                  where: { id: existingFWRecord.id },
                  data: {
                    date: new Date(date),
                    outputKgs: updatedFWOutput,
                    totalOutputKgs: Object.values(updatedFWOutput).reduce((sum, val) => sum + val, 0),
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
                baggingOffRecords.push(fullyWashedBaggingOff);
              } else {
                // Create new record if no existing record
                const fullyWashedBaggingOff = await tx.baggingOff.create({
                  data: {
                    batchNo,
                    processingId: existingProcessing?.id || processing.id,
                    date: new Date(date),
                    outputKgs: fullyWashedOutput,
                    totalOutputKgs: fullyWashedTotalKgs,
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
                baggingOffRecords.push(fullyWashedBaggingOff);
              }
            } else {
              // Regular mode (overwrite existing record)
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
                    totalOutputKgs: fullyWashedTotalKgs,
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
                    totalOutputKgs: fullyWashedTotalKgs,
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
          }
          break;

        default:
          throw new Error(`Unsupported processing type: ${processingType}`);
      }

      return baggingOffRecords.length === 1 ? baggingOffRecords[0] : baggingOffRecords;
    });

    return res.status(200).json(result);
  } catch (error) {
    console.error('Error in bagging off:', error);
    return res.status(500).json({ error: error.message });
  }
});

// GET route to fetch bagging off records by batch number
// router.get('/batch/:batchNo', async (req, res) => {
//   try {
//     const { batchNo } = req.params;
    
//     const baggingOffs = await prisma.baggingOff.findMany({
//       where: { batchNo },
//       include: {
//         processing: {
//           include: {
//             cws: true
//           }
//         }
//       },
//       orderBy: {
//         createdAt: 'desc'
//       }
//     });
    
//     return res.status(200).json(baggingOffs);
//   } catch (error) {
//     console.error('Error fetching bagging off records:', error);
//     return res.status(500).json({ error: error.message });
//   }
// });

// GET route to fetch bagging off record by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const baggingOff = await prisma.baggingOff.findUnique({
      where: { id: parseInt(id) },
      include: {
        processing: {
          include: {
            cws: true
          }
        }
      }
    });
    
    if (!baggingOff) {
      return res.status(404).json({ error: 'Bagging off record not found' });
    }
    
    return res.status(200).json(baggingOff);
  } catch (error) {
    console.error('Error fetching bagging off record:', error);
    return res.status(500).json({ error: error.message });
  }
});

// PUT route to update a bagging off record
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      date,
      outputKgs,
      status,
      notes
    } = req.body;
    
    const parsedId = parseInt(id);
    
    // Get the existing record to calculate total output KGs
    const existingRecord = await prisma.baggingOff.findUnique({
      where: { id: parsedId }
    });
    
    if (!existingRecord) {
      return res.status(404).json({ error: 'Bagging off record not found' });
    }
    
    // Calculate total output KGs
    let totalOutputKgs = 0;
    Object.values(outputKgs).forEach(value => {
      totalOutputKgs += parseFloat(value) || 0;
    });
    
    const updatedBaggingOff = await prisma.baggingOff.update({
      where: { id: parsedId },
      data: {
        date: date ? new Date(date) : undefined,
        outputKgs: outputKgs || undefined,
        totalOutputKgs,
        status: status || undefined,
        notes: notes
      },
      include: {
        processing: {
          include: {
            cws: true
          }
        }
      }
    });
    
    return res.status(200).json(updatedBaggingOff);
  } catch (error) {
    console.error('Error updating bagging off record:', error);
    return res.status(500).json({ error: error.message });
  }
});

// DELETE route to remove a bagging off record
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    await prisma.baggingOff.delete({
      where: { id: parseInt(id) }
    });
    
    return res.status(200).json({ message: 'Bagging off record deleted successfully' });
  } catch (error) {
    console.error('Error deleting bagging off record:', error);
    return res.status(500).json({ error: error.message });
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
    
    console.log(`Fetching bagging offs for batch: ${batchNo}`); // Add debug logging
    
    const baggingOffs = await prisma.baggingOff.findMany({
      where: { 
        batchNo: batchNo.trim() // Trim any whitespace to ensure clean comparison
      },
      orderBy: { 
        createdAt: 'desc' 
      },
      include: {
        processing: {
          include: {
            cws: true
          }
        }
      }
    });

    console.log(`Found ${baggingOffs.length} bagging off records`); // Log count of results
    
    return res.status(200).json(baggingOffs); // Use explicit return with status
  } catch (error) {
    // Improve error logging
    console.error('Error fetching bagging offs by batch:', error.message);
    console.error(error.stack);
    return res.status(500).json({ 
      error: 'Failed to retrieve bagging offs',
      details: error.message // Include error details for debugging
    });
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
        },
        status:"COMPLETED"
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