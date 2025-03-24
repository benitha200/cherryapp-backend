import express from 'express';
import { PrismaClient } from '@prisma/client';

const router = express.Router();
const prisma = new PrismaClient();


async function updateProcessingStatus(batchNo, prismaClient) {
  // Get the processing record for this batch
  const processing = await prismaClient.processing.findFirst({
    where: { batchNo },
    include: { baggingOffs: true }
  });
  
  if (processing && processing.status === 'IN_PROGRESS' && processing.baggingOffs.length > 0) {
    // Update the processing status to indicate bagging off has started
    await prismaClient.processing.update({
      where: { id: processing.id },
      data: {
        status: 'BAGGING_STARTED'
      }
    });
    
    return true;
  }
  
  return false;
}

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
      // Update processing status if status is COMPLETED
      if (status === 'COMPLETED') {
        const processingId = processing.id;
        console.log(`Processing ${processingId}`);
        if (processingId) {
          await tx.processing.update({
            where: { id: processingId },
            data: {
              status: 'COMPLETED',
              endDate: new Date()
            }
          });
        }

      }

      let baggingOffRecords = [];

      switch (processingType) {
        case 'HONEY':
          // Handle HONEY processing
          if (outputKgs.H1) {
            const honeyOutput = {
              H1: parseFloat(outputKgs.H1) || 0
            };

            // Create new record without summing up existing data
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
          break;

        case 'NATURAL':
          // Handle NATURAL processing
          const naturalOutput = {};
          let naturalTotalKgs = 0;

          // Handle different batch naming conventions (-1/-2 or A/B)
          const isSecondaryBatch = batchNo.endsWith('-2') || batchNo.endsWith('B');

          // Fixed the bug: Now correctly handling N1 and N2 for both primary and secondary batches
          if (outputKgs.N1) {
            naturalOutput.N1 = parseFloat(outputKgs.N1) || 0;
            naturalTotalKgs += naturalOutput.N1;
          }
          if (outputKgs.N2) {
            naturalOutput.N2 = parseFloat(outputKgs.N2) || 0;
            naturalTotalKgs += naturalOutput.N2;
          }

          if (naturalTotalKgs > 0) {
            // Create new record without summing up existing data
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
            // Create new record without summing up existing data
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
          break;

        default:
          throw new Error(`Unsupported processing type: ${processingType}`);
      }

      // Update all WetTransfer records with the same batch number
      const wetTransferRecords = await tx.wetTransfer.findMany({
        where: { batchNo }
      });

      const wetTransferUpdates = wetTransferRecords.map(record =>
        tx.wetTransfer.update({
          where: { id: record.id },
          data: {
            status: status,
            outputKgs: parseFloat(outputKgs[record.grade] || 0),
            // Add any other fields you want to update
          }
        })
      );

      await Promise.all(wetTransferUpdates);
      await updateProcessingStatus(batchNo, tx);

      return baggingOffRecords.length === 1 ? baggingOffRecords[0] : baggingOffRecords;
    });

    return res.status(200).json(result);
  } catch (error) {
    console.error('Error in bagging off:', error);
    return res.status(500).json({ error: error.message });
  }
});


// router.post('/', async (req, res) => {
//   try {
//     const {
//       date,
//       outputKgs,
//       processingType,
//       existingProcessing,
//       batchNo,
//       status,
//       progressive = false // New parameter to handle progressive mode
//     } = req.body;

//     if (!date || !outputKgs || !batchNo || !processingType || !status) {
//       return res.status(400).json({ error: 'Missing required fields' });
//     }

//     // Get the processing details
//     const processing = await prisma.processing.findFirst({
//       where: { batchNo },
//       include: {
//         cws: true
//       }
//     });

//     if (!processing) {
//       return res.status(404).json({ error: 'Processing not found for this batch' });
//     }

//     // Process the bagging off in a transaction
//     const result = await prisma.$transaction(async (tx) => {

//       // Update processing status if status is COMPLETED
//       if (status === 'COMPLETED') {
//         const processingId = existingProcessing?.id || processing.id;
//         await tx.processing.update({
//           where: { id: processingId },
//           data: {
//             status: 'COMPLETED',
//             endDate: new Date()
//           }
//         });
//       }

//       let baggingOffRecords = [];

//       switch (processingType) {
//         case 'HONEY':
//           // Handle HONEY processing
//           if (outputKgs.H1) {
//             const honeyOutput = {
//               H1: parseFloat(outputKgs.H1) || 0
//             };

//             // Create new record without summing up existing data
//             const honeyBaggingOff = await tx.baggingOff.create({
//               data: {
//                 batchNo,
//                 processingId: existingProcessing?.id || processing.id,
//                 date: new Date(date),
//                 outputKgs: honeyOutput,
//                 totalOutputKgs: honeyOutput.H1,
//                 processingType: 'HONEY',
//                 status: status
//               },
//               include: {
//                 processing: {
//                   include: {
//                     cws: true
//                   }
//                 }
//               }
//             });
//             baggingOffRecords.push(honeyBaggingOff);
//           }
//           break;

//         case 'NATURAL':
//           // Handle NATURAL processing
//           const naturalOutput = {};
//           let naturalTotalKgs = 0;

//           // Handle different batch naming conventions (-1/-2 or A/B)
//           const isSecondaryBatch = batchNo.endsWith('-2') || batchNo.endsWith('B');

//           if (isSecondaryBatch) {
//             if (outputKgs.B1) {
//               naturalOutput.B1 = parseFloat(outputKgs.B1) || 0;
//               naturalTotalKgs += naturalOutput.B1;
//             }
//             if (outputKgs.B2) {
//               naturalOutput.B2 = parseFloat(outputKgs.B2) || 0;
//               naturalTotalKgs += naturalOutput.B2;
//             }
//           } else {
//             if (outputKgs.N1) {
//               naturalOutput.N1 = parseFloat(outputKgs.N1) || 0;
//               naturalTotalKgs += naturalOutput.N1;
//             }
//             if (outputKgs.N2) {
//               naturalOutput.N2 = parseFloat(outputKgs.N2) || 0;
//               naturalTotalKgs += naturalOutput.N2;
//             }
//           }

//           if (naturalTotalKgs > 0) {
//             // Create new record without summing up existing data
//             const naturalBaggingOff = await tx.baggingOff.create({
//               data: {
//                 batchNo,
//                 processingId: existingProcessing?.id || processing.id,
//                 date: new Date(date),
//                 outputKgs: naturalOutput,
//                 totalOutputKgs: naturalTotalKgs,
//                 processingType: 'NATURAL',
//                 status: status
//               },
//               include: {
//                 processing: {
//                   include: {
//                     cws: true
//                   }
//                 }
//               }
//             });
//             baggingOffRecords.push(naturalBaggingOff);
//           }
//           break;

//         case 'FULLY WASHED':
//         case 'FULLY_WASHED':
//           // Handle FULLY WASHED processing
//           const fullyWashedOutput = {};
//           let fullyWashedTotalKgs = 0;

//           // Handle different batch naming conventions (-1/-2 or A/B)
//           const isSecondaryFWBatch = batchNo.endsWith('-2') || batchNo.endsWith('B');

//           if (isSecondaryFWBatch) {
//             if (outputKgs.B1) {
//               fullyWashedOutput.B1 = parseFloat(outputKgs.B1) || 0;
//               fullyWashedTotalKgs += fullyWashedOutput.B1;
//             }
//             if (outputKgs.B2) {
//               fullyWashedOutput.B2 = parseFloat(outputKgs.B2) || 0;
//               fullyWashedTotalKgs += fullyWashedOutput.B2;
//             }
//           } else {
//             ['A0', 'A1', 'A2', 'A3'].forEach(grade => {
//               if (outputKgs[grade]) {
//                 fullyWashedOutput[grade] = parseFloat(outputKgs[grade]) || 0;
//                 fullyWashedTotalKgs += fullyWashedOutput[grade];
//               }
//             });
//           }

//           if (fullyWashedTotalKgs > 0) {
//             // Create new record without summing up existing data
//             const fullyWashedBaggingOff = await tx.baggingOff.create({
//               data: {
//                 batchNo,
//                 processingId: existingProcessing?.id || processing.id,
//                 date: new Date(date),
//                 outputKgs: fullyWashedOutput,
//                 totalOutputKgs: fullyWashedTotalKgs,
//                 processingType: 'FULLY WASHED',
//                 status: status
//               },
//               include: {
//                 processing: {
//                   include: {
//                     cws: true
//                   }
//                 }
//               }
//             });
//             baggingOffRecords.push(fullyWashedBaggingOff);
//           }
//           break;

//         default:
//           throw new Error(`Unsupported processing type: ${processingType}`);
//       }

//       return baggingOffRecords.length === 1 ? baggingOffRecords[0] : baggingOffRecords;
//     });

//     return res.status(200).json(result);
//   } catch (error) {
//     console.error('Error in bagging off:', error);
//     return res.status(500).json({ error: error.message });
//   }
// });


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

    // Start a transaction to update both BaggingOff and Processing
    const updatedBaggingOff = await prisma.$transaction(async (prisma) => {
      // Update the BaggingOff record
      const updatedRecord = await prisma.baggingOff.update({
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

      if (status === 'COMPLETED') {
        await prisma.processing.update({
          where: { id: updatedRecord.processingId },
          data: {
            endDate: new Date(),
            status: 'COMPLETED'
          }
        });
      }

      return updatedRecord;
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
        status: "COMPLETED"
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

// GET endpoint for completed processing reports with accurate grouping by base batch number


router.get('/report/completed', async (req, res) => {
  try {
    // Get all completed processing records
    const completedProcessings = await prisma.processing.findMany({
      where: { 
        status: 'COMPLETED'
      },
      include: {
        cws: true,
        baggingOffs: {
          where: {
            status: 'COMPLETED'
          },
          include: {
            processing: true
          }
        }
      },
      orderBy: {
        endDate: 'desc'
      }
    });
    
    if (completedProcessings.length === 0) {
      return res.status(200).json({ 
        message: 'No completed processing records found',
        reports: []
      });
    }
    
    // Group processing records by their base batch number (first 9 characters)
    const groupedProcessings = {};
    
    // Track overall metrics
    let overallInputKgs = 0;
    let overallOutputKgs = 0;
    let overallNonNaturalInputKgs = 0;
    let overallNonNaturalOutputKgs = 0;
    
    for (const processing of completedProcessings) {
      // Extract the base batch number (first 9 characters)
      const baseBatchNo = processing.batchNo.substring(0, 9);
      
      // Initialize group if it doesn't exist
      if (!groupedProcessings[baseBatchNo]) {
        groupedProcessings[baseBatchNo] = [];
      }
      
      // Add processing to its group
      groupedProcessings[baseBatchNo].push(processing);
    }
    
    // Generate reports for each batch group
    const reports = [];
    
    for (const [baseBatchNo, processings] of Object.entries(groupedProcessings)) {
      // Use information from the first processing record for the batch info
      const firstProcessing = processings[0];
      const isNaturalProcessing = processings.some(p => p.processingType === 'NATURAL');
      
      // Initialize metrics
      let totalInputKgs = 0;
      let totalOutputKgs = 0;
      const outputByType = {};
      const gradeBreakdown = {};
      const allBaggingOffRecords = [];
      
      // Combine data from all processing records in this group
      for (const processing of processings) {
        // Add input KGs
        const inputKgs = processing.totalKgs || 0;
        totalInputKgs += inputKgs;
        overallInputKgs += inputKgs;
        
        // Add to non-Natural inputs if batch is not considered Natural
        if (!isNaturalProcessing) {
          overallNonNaturalInputKgs += inputKgs;
        }
        
        // Process all bagging off records
        for (const record of processing.baggingOffs) {
          const outputKgs = parseFloat(record.totalOutputKgs) || 0;
          
          // Add output KGs by type
          if (!outputByType[record.processingType]) {
            outputByType[record.processingType] = 0;
          }
          outputByType[record.processingType] += outputKgs;
          
          // Add to total output
          totalOutputKgs += outputKgs;
          overallOutputKgs += outputKgs;
          
          // Add to non-Natural outputs if batch is not considered Natural
          if (!isNaturalProcessing) {
            overallNonNaturalOutputKgs += outputKgs;
          }
          
          // Process grade breakdown
          if (typeof record.outputKgs === 'object' && record.outputKgs !== null) {
            Object.entries(record.outputKgs).forEach(([grade, kgs]) => {
              if (!gradeBreakdown[grade]) {
                gradeBreakdown[grade] = 0;
              }
              gradeBreakdown[grade] += parseFloat(kgs) || 0;
            });
          }
          
          // Remove circular references
          const { baggingOffs, ...processingWithoutBaggingOffs } = record.processing;
          
          // Add enhanced record to the list
          allBaggingOffRecords.push({
            ...record,
            processingInfo: processingWithoutBaggingOffs
          });
        }
      }
      
      // Calculate outturn
      const outturn = totalInputKgs > 0 ? ((totalOutputKgs / totalInputKgs) * 100).toFixed(2) : 0;
      
      // Create the report for this batch group
      const report = {
        batchInfo: {
          batchNo: baseBatchNo, // Use the base batch number
          relatedBatches: processings.map(p => p.batchNo), // List all related batch numbers
          station: firstProcessing.cws?.name || 'Unknown',
          processingType: isNaturalProcessing ? 'NATURAL' : firstProcessing.processingType,
          startDate: firstProcessing.startDate,
          endDate: firstProcessing.endDate,
          status: firstProcessing.status,
          totalInputKgs: totalInputKgs,
          totalOutputKgs: totalOutputKgs,
          outturn: parseFloat(outturn),
          processingInfo: {
            id: firstProcessing.id,
            batchNo: firstProcessing.batchNo,
            processingType: isNaturalProcessing ? 'NATURAL' : firstProcessing.processingType,
            totalKgs: totalInputKgs,
            grade: firstProcessing.grade,
            status: firstProcessing.status,
            notes: firstProcessing.notes
          }
        },
        metrics: {
          inputKgs: totalInputKgs,
          totalOutputKgs,
          outturn: parseFloat(outturn),
          outputByType,
          gradeBreakdown
        },
        baggingOffRecords: allBaggingOffRecords
      };
      
      reports.push(report);
    }
    
    // Calculate overall outturn (both standard and non-Natural)
    const overallOutturn = overallInputKgs > 0 
      ? parseFloat(((overallOutputKgs / overallInputKgs) * 100).toFixed(2)) 
      : 0;
    
    // Calculate overall outturn excluding Natural processing
    const overallNonNaturalOutturn = overallNonNaturalInputKgs > 0 
      ? parseFloat(((overallNonNaturalOutputKgs / overallNonNaturalInputKgs) * 100).toFixed(2)) 
      : 0;
    
    return res.status(200).json({ 
      totalRecords: reports.length,
      overallMetrics: {
        totalInputKgs: overallInputKgs,
        totalOutputKgs: overallOutputKgs,
        overallOutturn: overallOutturn,
        totalNonNaturalInputKgs: overallNonNaturalInputKgs,
        totalNonNaturalOutputKgs: overallNonNaturalOutputKgs,
        overallNonNaturalOutturn: overallNonNaturalOutturn
      },
      reports 
    });
  } catch (error) {
    console.error('Error generating completed processing reports:', error);
    return res.status(500).json({ error: error.message });
  }
});

// router.get('/report/completed', async (req, res) => {
//   try {
//     // Get all completed processing records
//     const completedProcessings = await prisma.processing.findMany({
//       where: { 
//         status: 'COMPLETED'
//       },
//       include: {
//         cws: true,
//         baggingOffs: {
//           where: {
//             status: 'COMPLETED'
//           },
//           include: {
//             processing: true
//           }
//         }
//       },
//       orderBy: {
//         endDate: 'desc'
//       }
//     });
    
//     if (completedProcessings.length === 0) {
//       return res.status(200).json({ 
//         message: 'No completed processing records found',
//         reports: []
//       });
//     }
    
//     // Group processing records by their base batch number (first 9 characters)
//     const groupedProcessings = {};
    
//     // Track overall metrics
//     let overallInputKgs = 0;
//     let overallOutputKgs = 0;
//     let overallNonNaturalInputKgs = 0;
//     let overallNonNaturalOutputKgs = 0;
    
//     for (const processing of completedProcessings) {
//       // Extract the base batch number (first 9 characters)
//       const baseBatchNo = processing.batchNo.substring(0, 9);
      
//       // Initialize group if it doesn't exist
//       if (!groupedProcessings[baseBatchNo]) {
//         groupedProcessings[baseBatchNo] = [];
//       }
      
//       // Add processing to its group
//       groupedProcessings[baseBatchNo].push(processing);
//     }
    
//     // Generate reports for each batch group
//     const reports = [];
    
//     for (const [baseBatchNo, processings] of Object.entries(groupedProcessings)) {
//       // Use information from the first processing record for the batch info
//       const firstProcessing = processings[0];
//       const isNaturalProcessing = firstProcessing.processingType === 'NATURAL';
      
//       // Initialize metrics
//       let totalInputKgs = 0;
//       let totalOutputKgs = 0;
//       const outputByType = {};
//       const gradeBreakdown = {};
//       const allBaggingOffRecords = [];
      
//       // Combine data from all processing records in this group
//       for (const processing of processings) {
//         // Add input KGs
//         const inputKgs = processing.totalKgs || 0;
//         totalInputKgs += inputKgs;
//         overallInputKgs += inputKgs;
        
//         // Add to non-Natural inputs if not Natural processing
//         if (processing.processingType !== 'NATURAL') {
//           overallNonNaturalInputKgs += inputKgs;
//         }
        
//         // Process all bagging off records
//         for (const record of processing.baggingOffs) {
//           const outputKgs = parseFloat(record.totalOutputKgs) || 0;
          
//           // Add output KGs by type
//           if (!outputByType[record.processingType]) {
//             outputByType[record.processingType] = 0;
//           }
//           outputByType[record.processingType] += outputKgs;
          
//           // Add to total output
//           totalOutputKgs += outputKgs;
//           overallOutputKgs += outputKgs;
          
//           // Add to non-Natural outputs if not Natural processing
//           if (processing.processingType !== 'NATURAL') {
//             overallNonNaturalOutputKgs += outputKgs;
//           }
          
//           // Process grade breakdown
//           if (typeof record.outputKgs === 'object' && record.outputKgs !== null) {
//             Object.entries(record.outputKgs).forEach(([grade, kgs]) => {
//               if (!gradeBreakdown[grade]) {
//                 gradeBreakdown[grade] = 0;
//               }
//               gradeBreakdown[grade] += parseFloat(kgs) || 0;
//             });
//           }
          
//           // Remove circular references
//           const { baggingOffs, ...processingWithoutBaggingOffs } = record.processing;
          
//           // Add enhanced record to the list
//           allBaggingOffRecords.push({
//             ...record,
//             processingInfo: processingWithoutBaggingOffs
//           });
//         }
//       }
      
//       // Calculate outturn
//       const outturn = totalInputKgs > 0 ? ((totalOutputKgs / totalInputKgs) * 100).toFixed(2) : 0;
      
//       // Create the report for this batch group
//       const report = {
//         batchInfo: {
//           batchNo: baseBatchNo, // Use the base batch number
//           relatedBatches: processings.map(p => p.batchNo), // List all related batch numbers
//           station: firstProcessing.cws?.name || 'Unknown',
//           processingType: processings.some(p => p.processingType === 'NATURAL') ? 'NATURAL' : firstProcessing.processingType,
//           startDate: firstProcessing.startDate,
//           endDate: firstProcessing.endDate,
//           status: firstProcessing.status,
//           totalInputKgs: totalInputKgs,
//           totalOutputKgs: totalOutputKgs,
//           outturn: parseFloat(outturn),
//           processingInfo: {
//             id: firstProcessing.id,
//             batchNo: firstProcessing.batchNo,
//             processingType: firstProcessing.processingType,
//             totalKgs: totalInputKgs,
//             grade: firstProcessing.grade,
//             status: firstProcessing.status,
//             notes: firstProcessing.notes
//           }
//         },
//         metrics: {
//           inputKgs: totalInputKgs,
//           totalOutputKgs,
//           outturn: parseFloat(outturn),
//           outputByType,
//           gradeBreakdown
//         },
//         baggingOffRecords: allBaggingOffRecords
//       };
      
//       reports.push(report);
//     }
    
//     // Calculate overall outturn (both standard and non-Natural)
//     const overallOutturn = overallInputKgs > 0 
//       ? parseFloat(((overallOutputKgs / overallInputKgs) * 100).toFixed(2)) 
//       : 0;
    
//     // Calculate overall outturn excluding Natural processing
//     const overallNonNaturalOutturn = overallNonNaturalInputKgs > 0 
//       ? parseFloat(((overallNonNaturalOutputKgs / overallNonNaturalInputKgs) * 100).toFixed(2)) 
//       : 0;
    
//     return res.status(200).json({ 
//       totalRecords: reports.length,
//       overallMetrics: {
//         totalInputKgs: overallInputKgs,
//         totalOutputKgs: overallOutputKgs,
//         overallOutturn: overallOutturn,
//         totalNonNaturalInputKgs: overallNonNaturalInputKgs,
//         totalNonNaturalOutputKgs: overallNonNaturalOutputKgs,
//         overallNonNaturalOutturn: overallNonNaturalOutturn
//       },
//       reports 
//     });
//   } catch (error) {
//     console.error('Error generating completed processing reports:', error);
//     return res.status(500).json({ error: error.message });
//   }
// });

// router.get('/report/completed', async (req, res) => {
//   try {
//     // Get all completed processing records
//     const completedProcessings = await prisma.processing.findMany({
//       where: { 
//         status: 'COMPLETED'
//       },
//       include: {
//         cws: true,
//         baggingOffs: {
//           where: {
//             status: 'COMPLETED'
//           },
//           include: {
//             processing: true
//           }
//         }
//       },
//       orderBy: {
//         endDate: 'desc'
//       }
//     });
    
//     if (completedProcessings.length === 0) {
//       return res.status(200).json({ 
//         message: 'No completed processing records found',
//         reports: []
//       });
//     }
    
//     // Group processing records by their base batch number (first 9 characters)
//     const groupedProcessings = {};
    
//     for (const processing of completedProcessings) {
//       // Extract the base batch number (first 9 characters)
//       const baseBatchNo = processing.batchNo.substring(0, 9);
      
//       // Initialize group if it doesn't exist
//       if (!groupedProcessings[baseBatchNo]) {
//         groupedProcessings[baseBatchNo] = [];
//       }
      
//       // Add processing to its group
//       groupedProcessings[baseBatchNo].push(processing);
//     }
    
//     // Generate reports for each batch group
//     const reports = [];
    
//     for (const [baseBatchNo, processings] of Object.entries(groupedProcessings)) {
//       // Use information from the first processing record for the batch info
//       const firstProcessing = processings[0];
      
//       // Initialize metrics
//       let totalInputKgs = 0;
//       let totalOutputKgs = 0;
//       const outputByType = {};
//       const gradeBreakdown = {};
//       const allBaggingOffRecords = [];
      
//       // Combine data from all processing records in this group
//       for (const processing of processings) {
//         // Add input KGs
//         totalInputKgs += processing.totalKgs || 0;
        
//         // Process all bagging off records
//         for (const record of processing.baggingOffs) {
//           // Add output KGs by type
//           if (!outputByType[record.processingType]) {
//             outputByType[record.processingType] = 0;
//           }
//           outputByType[record.processingType] += parseFloat(record.totalOutputKgs) || 0;
          
//           // Add to total output
//           totalOutputKgs += parseFloat(record.totalOutputKgs) || 0;
          
//           // Process grade breakdown
//           if (typeof record.outputKgs === 'object' && record.outputKgs !== null) {
//             Object.entries(record.outputKgs).forEach(([grade, kgs]) => {
//               if (!gradeBreakdown[grade]) {
//                 gradeBreakdown[grade] = 0;
//               }
//               gradeBreakdown[grade] += parseFloat(kgs) || 0;
//             });
//           }
          
//           // Remove circular references
//           const { baggingOffs, ...processingWithoutBaggingOffs } = record.processing;
          
//           // Add enhanced record to the list
//           allBaggingOffRecords.push({
//             ...record,
//             processingInfo: processingWithoutBaggingOffs
//           });
//         }
//       }
      
//       // Calculate outturn
//       const outturn = totalInputKgs > 0 ? ((totalOutputKgs / totalInputKgs) * 100).toFixed(2) : 0;
      
//       // Create the report for this batch group
//       const report = {
//         batchInfo: {
//           batchNo: baseBatchNo, // Use the base batch number
//           relatedBatches: processings.map(p => p.batchNo), // List all related batch numbers
//           station: firstProcessing.cws?.name || 'Unknown',
//           processingType: firstProcessing.processingType,
//           startDate: firstProcessing.startDate,
//           endDate: firstProcessing.endDate,
//           status: firstProcessing.status,
//           totalInputKgs: totalInputKgs, // Added total input KGs to batch info
//           totalOutputKgs: totalOutputKgs, // Added total output KGs to batch info
//           outturn: parseFloat(outturn), // Added outturn to batch info
//           processingInfo: {
//             id: firstProcessing.id,
//             batchNo: firstProcessing.batchNo,
//             processingType: firstProcessing.processingType,
//             totalKgs: totalInputKgs, // Use combined total KGs
//             grade: firstProcessing.grade,
//             status: firstProcessing.status,
//             notes: firstProcessing.notes
//           }
//         },
//         metrics: {
//           inputKgs: totalInputKgs,
//           totalOutputKgs,
//           outturn: parseFloat(outturn),
//           outputByType,
//           gradeBreakdown
//         },
//         baggingOffRecords: allBaggingOffRecords
//       };
      
//       reports.push(report);
//     }
    
//     return res.status(200).json({ 
//       totalRecords: reports.length,
//       reports 
//     });
//   } catch (error) {
//     console.error('Error generating completed processing reports:', error);
//     return res.status(500).json({ error: error.message });
//   }
// });


// GET endpoint for station summary with complete processing information

// router.get('/report/summary', async (req, res) => {
//   try {
//     const { cwsId, startDate, endDate } = req.query;
    
//     // Build where clause for processing records
//     const processingWhere = {
//       status: 'COMPLETED'
//     };
    
//     if (cwsId) {
//       processingWhere.cwsId = parseInt(cwsId);
//     }
    
//     if (startDate || endDate) {
//       processingWhere.endDate = {};
//       if (startDate) processingWhere.endDate.gte = new Date(startDate);
//       if (endDate) processingWhere.endDate.lte = new Date(endDate);
//     }
    
//     // Get all completed processing records with their bagging off records
//     const allProcessings = await prisma.processing.findMany({
//       where: processingWhere,
//       include: {
//         cws: true,
//         baggingOffs: {
//           where: {
//             status: 'COMPLETED'
//           }
//         }
//       },
//       orderBy: {
//         endDate: 'desc'
//       }
//     });
    
//     // Initialize data structures for summaries
//     const stationSummaries = {};
//     const batchSummaries = {};
//     let overallInputKgs = 0;
//     let overallOutputKgs = 0;
//     // Track non-Natural processing separately for outturn calculation
//     let overallNonNaturalInputKgs = 0;
//     let overallNonNaturalOutputKgs = 0;
    
//     // Process all records
//     for (const processing of allProcessings) {
//       const stationId = processing.cwsId;
//       const stationName = processing.cws?.name || 'Unknown';
//       const batchNo = processing.batchNo;
//       const inputKgs = processing.totalKgs || 0;
//       const isNaturalProcessing = processing.processingType === 'NATURAL';
      
//       // Initialize station summary if it doesn't exist
//       if (!stationSummaries[stationId]) {
//         stationSummaries[stationId] = {
//           stationId,
//           stationName,
//           totalInputKgs: 0,
//           totalOutputKgs: 0,
//           nonNaturalInputKgs: 0,  // Track non-Natural inputs separately
//           nonNaturalOutputKgs: 0, // Track non-Natural outputs separately
//           outturn: 0,
//           processingTypes: {},
//           gradeBreakdown: {},
//           processingDetails: [] // Array to store processing details by station
//         };
//       }
      
//       // Store processing details for this station
//       stationSummaries[stationId].processingDetails.push({
//         id: processing.id,
//         batchNo: processing.batchNo,
//         processingType: processing.processingType,
//         totalKgs: processing.totalKgs,
//         grade: processing.grade,
//         startDate: processing.startDate,
//         endDate: processing.endDate,
//         status: processing.status,
//         notes: processing.notes
//       });
      
//       // Initialize batch summary with complete processing info
//       batchSummaries[batchNo] = {
//         batchNo,
//         stationId,
//         stationName,
//         processingInfo: {
//           id: processing.id,
//           processingType: processing.processingType,
//           totalKgs: processing.totalKgs,
//           grade: processing.grade,
//           startDate: processing.startDate,
//           endDate: processing.endDate,
//           status: processing.status,
//           notes: processing.notes
//         },
//         inputKgs,
//         outputKgs: 0,
//         grades: {},
//         outturn: 0,
//         baggingOffSummary: [] // Array to store aggregated bagging off info
//       };
      
//       // Add input KGs to station and overall totals
//       stationSummaries[stationId].totalInputKgs += inputKgs;
//       overallInputKgs += inputKgs;
      
//       // Add to non-Natural totals if not Natural processing
//       if (!isNaturalProcessing) {
//         stationSummaries[stationId].nonNaturalInputKgs += inputKgs;
//         overallNonNaturalInputKgs += inputKgs;
//       }
      
//       // Calculate outputs from bagging off records
//       let batchOutputKgs = 0;
      
//       // Process all bagging off records for this batch
//       for (const record of processing.baggingOffs) {
//         const outputKgs = record.totalOutputKgs || 0;
//         batchOutputKgs += outputKgs;
        
//         // Add bagging off record summary
//         batchSummaries[batchNo].baggingOffSummary.push({
//           id: record.id,
//           date: record.date,
//           processingType: record.processingType,
//           outputKgs: record.outputKgs,
//           totalOutputKgs: record.totalOutputKgs,
//           status: record.status
//         });
        
//         // Update processing type breakdown for station
//         if (!stationSummaries[stationId].processingTypes[record.processingType]) {
//           stationSummaries[stationId].processingTypes[record.processingType] = 0;
//         }
//         stationSummaries[stationId].processingTypes[record.processingType] += outputKgs;
        
//         // Update grade breakdown for batch and station
//         if (typeof record.outputKgs === 'object' && record.outputKgs !== null) {
//           Object.entries(record.outputKgs).forEach(([grade, kgs]) => {
//             const gradeKgs = parseFloat(kgs) || 0;
            
//             // Update batch grade breakdown
//             if (!batchSummaries[batchNo].grades[grade]) {
//               batchSummaries[batchNo].grades[grade] = 0;
//             }
//             batchSummaries[batchNo].grades[grade] += gradeKgs;
            
//             // Update station grade breakdown
//             if (!stationSummaries[stationId].gradeBreakdown[grade]) {
//               stationSummaries[stationId].gradeBreakdown[grade] = 0;
//             }
//             stationSummaries[stationId].gradeBreakdown[grade] += gradeKgs;
//           });
//         }
//       }
      
//       // Update batch output and outturn
//       batchSummaries[batchNo].outputKgs = batchOutputKgs;
//       batchSummaries[batchNo].outturn = inputKgs > 0 ? parseFloat(((batchOutputKgs / inputKgs) * 100).toFixed(2)) : 0;
      
//       // Update station total output
//       stationSummaries[stationId].totalOutputKgs += batchOutputKgs;
//       overallOutputKgs += batchOutputKgs;
      
//       // Add to non-Natural outputs if not Natural processing
//       if (!isNaturalProcessing) {
//         stationSummaries[stationId].nonNaturalOutputKgs += batchOutputKgs;
//         overallNonNaturalOutputKgs += batchOutputKgs;
//       }
//     }
    
//     // Calculate station outturns excluding Natural processing
//     Object.values(stationSummaries).forEach(station => {
//       // Calculate outturn based on non-Natural processing only
//       if (station.nonNaturalInputKgs > 0) {
//         station.outturn = parseFloat(((station.nonNaturalOutputKgs / station.nonNaturalInputKgs) * 100).toFixed(2));
//       }
//     });
    
//     // Calculate overall outturn excluding Natural processing
//     const overallOutturn = overallNonNaturalInputKgs > 0 
//       ? parseFloat(((overallNonNaturalOutputKgs / overallNonNaturalInputKgs) * 100).toFixed(2))
//       : 0;
    
//     // Add total batch and processing counts to each station
//     Object.values(stationSummaries).forEach(station => {
//       station.totalProcessings = station.processingDetails.length;
//       station.totalBatches = [...new Set(station.processingDetails.map(p => p.batchNo))].length;
//     });
    
//     // Build the summary report
//     const report = {
//       overall: {
//         totalInputKgs: overallInputKgs,
//         totalOutputKgs: overallOutputKgs,
//         totalNonNaturalInputKgs: overallNonNaturalInputKgs,
//         totalNonNaturalOutputKgs: overallNonNaturalOutputKgs,
//         overallOutturn: overallOutturn,
//         totalStations: Object.keys(stationSummaries).length,
//         totalBatches: Object.keys(batchSummaries).length,
//         totalProcessings: allProcessings.length,
//         dateRange: {
//           startDate: startDate || "All time",
//           endDate: endDate || "Present"
//         }
//       },
//       stationSummaries: Object.values(stationSummaries),
//       batchSummaries: Object.values(batchSummaries)
//     };
    
//     return res.status(200).json(report);
//   } catch (error) {
//     console.error('Error generating summary report:', error);
//     return res.status(500).json({ error: error.message });
//   }
// });

router.get('/report/summary', async (req, res) => {
  try {
    const { cwsId, startDate, endDate } = req.query;
    
    // Build where clause for processing records
    const processingWhere = {
      status: 'COMPLETED'
    };
    
    if (cwsId) {
      processingWhere.cwsId = parseInt(cwsId);
    }
    
    if (startDate || endDate) {
      processingWhere.endDate = {};
      if (startDate) processingWhere.endDate.gte = new Date(startDate);
      if (endDate) processingWhere.endDate.lte = new Date(endDate);
    }
    
    // Get all completed processing records with their bagging off records
    const allProcessings = await prisma.processing.findMany({
      where: processingWhere,
      include: {
        cws: true,
        baggingOffs: {
          where: {
            status: 'COMPLETED'
          }
        }
      },
      orderBy: {
        endDate: 'desc'
      }
    });
    
    // Group processings by batch prefix to identify batches with both NATURAL and FULLY_WASHED
    const batchGroups = {};
    allProcessings.forEach(processing => {
      const batchPrefix = processing.batchNo.split('-')[0];
      if (!batchGroups[batchPrefix]) {
        batchGroups[batchPrefix] = [];
      }
      batchGroups[batchPrefix].push(processing);
    });
    
    // Identify batch prefixes that have NATURAL processing
    const batchesWithNatural = new Set();
    Object.entries(batchGroups).forEach(([prefix, processings]) => {
      if (processings.some(p => p.processingType === 'NATURAL')) {
        batchesWithNatural.add(prefix);
      }
    });
    
    // Initialize data structures for summaries
    const stationSummaries = {};
    const batchSummaries = {};
    let overallInputKgs = 0;
    let overallOutputKgs = 0;
    let overallNaturalInputKgs = 0;
    let overallNaturalOutputKgs = 0;
    let overallNonNaturalInputKgs = 0;
    let overallNonNaturalOutputKgs = 0;
    
    // Process all records
    for (const processing of allProcessings) {
      const stationId = processing.cwsId;
      const stationName = processing.cws?.name || 'Unknown';
      const batchNo = processing.batchNo;
      const batchPrefix = batchNo.split('-')[0];
      const inputKgs = processing.totalKgs || 0;
      
      // Check if this batch should be treated as NATURAL
      // Either it's already NATURAL or it belongs to a batch that has NATURAL processing
      const shouldTreatAsNatural = 
        processing.processingType === 'NATURAL' || 
        batchesWithNatural.has(batchPrefix);
      
      // Initialize station summary if it doesn't exist
      if (!stationSummaries[stationId]) {
        stationSummaries[stationId] = {
          stationId,
          stationName,
          totalInputKgs: 0,
          totalOutputKgs: 0,
          naturalInputKgs: 0,
          naturalOutputKgs: 0,
          nonNaturalInputKgs: 0,
          nonNaturalOutputKgs: 0,
          outturn: 0,
          processingTypes: {},
          gradeBreakdown: {},
          processingDetails: []
        };
      }
      
      // Store processing details for this station
      stationSummaries[stationId].processingDetails.push({
        id: processing.id,
        batchNo: processing.batchNo,
        processingType: processing.processingType,
        treatedAsNatural: shouldTreatAsNatural,
        totalKgs: processing.totalKgs,
        grade: processing.grade,
        startDate: processing.startDate,
        endDate: processing.endDate,
        status: processing.status,
        notes: processing.notes
      });
      
      // Initialize batch summary with complete processing info
      batchSummaries[batchNo] = {
        batchNo,
        batchPrefix,
        stationId,
        stationName,
        processingInfo: {
          id: processing.id,
          processingType: processing.processingType,
          treatedAsNatural: shouldTreatAsNatural,
          totalKgs: processing.totalKgs,
          grade: processing.grade,
          startDate: processing.startDate,
          endDate: processing.endDate,
          status: processing.status,
          notes: processing.notes
        },
        inputKgs,
        outputKgs: 0,
        grades: {},
        outturn: 0,
        baggingOffSummary: []
      };
      
      // Add input KGs to station and overall totals
      stationSummaries[stationId].totalInputKgs += inputKgs;
      overallInputKgs += inputKgs;
      
      // Add to natural or non-natural totals based on our treatment logic
      if (shouldTreatAsNatural) {
        stationSummaries[stationId].naturalInputKgs += inputKgs;
        overallNaturalInputKgs += inputKgs;
      } else {
        stationSummaries[stationId].nonNaturalInputKgs += inputKgs;
        overallNonNaturalInputKgs += inputKgs;
      }
      
      // Calculate outputs from bagging off records
      let batchOutputKgs = 0;
      
      // Process all bagging off records for this batch
      for (const record of processing.baggingOffs) {
        const outputKgs = record.totalOutputKgs || 0;
        batchOutputKgs += outputKgs;
        
        // Add bagging off record summary
        batchSummaries[batchNo].baggingOffSummary.push({
          id: record.id,
          date: record.date,
          processingType: record.processingType,
          outputKgs: record.outputKgs,
          totalOutputKgs: record.totalOutputKgs,
          status: record.status
        });
        
        // Update processing type breakdown for station
        if (!stationSummaries[stationId].processingTypes[record.processingType]) {
          stationSummaries[stationId].processingTypes[record.processingType] = 0;
        }
        stationSummaries[stationId].processingTypes[record.processingType] += outputKgs;
        
        // Update grade breakdown for batch and station
        if (typeof record.outputKgs === 'object' && record.outputKgs !== null) {
          Object.entries(record.outputKgs).forEach(([grade, kgs]) => {
            const gradeKgs = parseFloat(kgs) || 0;
            
            // Update batch grade breakdown
            if (!batchSummaries[batchNo].grades[grade]) {
              batchSummaries[batchNo].grades[grade] = 0;
            }
            batchSummaries[batchNo].grades[grade] += gradeKgs;
            
            // Update station grade breakdown
            if (!stationSummaries[stationId].gradeBreakdown[grade]) {
              stationSummaries[stationId].gradeBreakdown[grade] = 0;
            }
            stationSummaries[stationId].gradeBreakdown[grade] += gradeKgs;
          });
        }
      }
      
      // Update batch output and outturn
      batchSummaries[batchNo].outputKgs = batchOutputKgs;
      batchSummaries[batchNo].outturn = inputKgs > 0 ? parseFloat(((batchOutputKgs / inputKgs) * 100).toFixed(2)) : 0;
      
      // Update station total output
      stationSummaries[stationId].totalOutputKgs += batchOutputKgs;
      overallOutputKgs += batchOutputKgs;
      
      // Add to natural or non-natural outputs based on our treatment logic
      if (shouldTreatAsNatural) {
        stationSummaries[stationId].naturalOutputKgs += batchOutputKgs;
        overallNaturalOutputKgs += batchOutputKgs;
      } else {
        stationSummaries[stationId].nonNaturalOutputKgs += batchOutputKgs;
        overallNonNaturalOutputKgs += batchOutputKgs;
      }
    }
    
    // Calculate station outturns excluding Natural processing
    Object.values(stationSummaries).forEach(station => {
      // Calculate outturn based on non-Natural processing only
      if (station.nonNaturalInputKgs > 0) {
        station.outturn = parseFloat(((station.nonNaturalOutputKgs / station.nonNaturalInputKgs) * 100).toFixed(2));
      }
    });
    
    // Calculate overall outturn excluding Natural processing
    const overallOutturn = overallNonNaturalInputKgs > 0 
      ? parseFloat(((overallNonNaturalOutputKgs / overallNonNaturalInputKgs) * 100).toFixed(2))
      : 0;
    
    // Add total batch and processing counts to each station
    Object.values(stationSummaries).forEach(station => {
      station.totalProcessings = station.processingDetails.length;
      station.totalBatches = [...new Set(station.processingDetails.map(p => p.batchNo))].length;
    });
    
    // Build the summary report
    const report = {
      overall: {
        totalInputKgs: overallInputKgs,
        totalOutputKgs: overallOutputKgs,
        naturalInputKgs: overallNaturalInputKgs,
        naturalOutputKgs: overallNaturalOutputKgs,
        nonNaturalInputKgs: overallNonNaturalInputKgs,
        nonNaturalOutputKgs: overallNonNaturalOutputKgs,
        overallOutturn: overallOutturn,
        totalStations: Object.keys(stationSummaries).length,
        totalBatches: Object.keys(batchSummaries).length,
        totalProcessings: allProcessings.length,
        dateRange: {
          startDate: startDate || "All time",
          endDate: endDate || "Present"
        }
      },
      stationSummaries: Object.values(stationSummaries),
      batchSummaries: Object.values(batchSummaries)
    };
    
    return res.status(200).json(report);
  } catch (error) {
    console.error('Error generating summary report:', error);
    return res.status(500).json({ error: error.message });
  }
});

export default router;