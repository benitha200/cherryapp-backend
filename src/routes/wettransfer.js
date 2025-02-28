import { Router } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

// Create a new wet transfer
router.post('/', async (req, res) => {
    try {
      const {
        processingId,
        batchNo,
        date,
        sourceCwsId,
        destinationCwsId,
        totalKgs,
        outputKgs,
        grade,
        processingType,
        moistureContent,
        notes
      } = req.body;
  
      // Validate request
      if (!processingId || !sourceCwsId || !destinationCwsId || !grade || !processingType) {
        return res.status(400).json({ message: "Required fields missing" });
      }
  
      // Create the wet transfer record
      const wetTransfer = await prisma.wetTransfer.create({
        data: {
          processingId,
          batchNo,
          date: date ? new Date(date) : new Date(),
          sourceCwsId: parseInt(sourceCwsId),
          destinationCwsId: parseInt(destinationCwsId),
          totalKgs: parseFloat(totalKgs),
          outputKgs: parseFloat(outputKgs || 0),
          grade,
          status: "PENDING",
          processingType,
          moistureContent: parseFloat(moistureContent || 12.0),
          notes: notes || null
        },
      });
  
      // Update the processing record status to TRANSFERRED
      await prisma.processing.update({
        where: { id: parseInt(processingId) },
        data: { status: "TRANSFERRED" }
      });
  
      res.status(201).json(wetTransfer);
    } catch (error) {
      console.error('Error creating wet transfer:', error);
      res.status(500).json({ message: "Failed to create wet transfer", error: error.message });
    }
  });

// Get all wet transfers
router.get('/', async (req, res) => {
  try {
    const wetTransfers = await prisma.wetTransfer.findMany({
      include: {
        sourceCws: {
          select: {
            id: true,
            name: true,
            code: true
          }
        },
        destinationCws: {
          select: {
            id: true,
            name: true,
            code: true
          }
        }
      },
      orderBy: {
        date: 'desc'
      }
    });
    
    res.json(wetTransfers);
  } catch (error) {
    console.error('Error fetching wet transfers:', error);
    res.status(500).json({ message: "Failed to fetch wet transfers", error: error.message });
  }
});

// Get wet transfers by source CWS ID
router.get('/source/:cwsId', async (req, res) => {
  try {
    const { cwsId } = req.params;
    
    const wetTransfers = await prisma.wetTransfer.findMany({
      where: {
        sourceCwsId: parseInt(cwsId)
      },
      include: {
        sourceCws: {
          select: {
            id: true,
            name: true,
            code: true
          }
        },
        destinationCws: {
          select: {
            id: true,
            name: true,
            code: true
          }
        }
      },
      orderBy: {
        date: 'desc'
      }
    });
    
    res.json(wetTransfers);
  } catch (error) {
    console.error('Error fetching wet transfers by source CWS:', error);
    res.status(500).json({ message: "Failed to fetch wet transfers", error: error.message });
  }
});

// Get wet transfers by destination CWS ID
router.get('/destination/:cwsId', async (req, res) => {
    try {
      const { cwsId } = req.params;
      
      const transfers = await prisma.wetTransfer.findMany({
        where: { 
          destinationCwsId: parseInt(cwsId)
        },
        include: {
          sourceCws: {
            select: {
              id: true,
              name: true,
              code: true
            }
          },
          destinationCws: {
            select: {
              id: true,
              name: true,
              code: true
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        }
      });
      
      res.status(200).json(transfers);
    } catch (error) {
      console.error('Error fetching transfers:', error);
      res.status(500).json({ message: "Failed to fetch transfers", error: error.message });
    }
  });


// Receive wet transfer endpoint
router.post('/receive', async (req, res) => {
    try {
      const {
        transferId,
        receivedDate,
        receivingCwsId,
        sourceCwsId,
        notes,
        moisture,
        defectPercentage,
        cleanCupScore
      } = req.body;
  
      // Validate request
      if (!transferId || !receivingCwsId) {
        return res.status(400).json({ message: "Required fields missing" });
      }
  
      // Update the wet transfer record
      const updatedTransfer = await prisma.wetTransfer.update({
        where: { id: parseInt(transferId) },
        data: {
          status: "RECEIVED",
          // Store quality metrics in notes field
          notes: notes ? 
            `${notes}\nMoisture: ${moisture || 'N/A'}, Defects: ${defectPercentage || 'N/A'}, Cup Score: ${cleanCupScore || 'N/A'}` :
            `Moisture: ${moisture || 'N/A'}, Defects: ${defectPercentage || 'N/A'}, Cup Score: ${cleanCupScore || 'N/A'}`
        },
        include: {
          sourceCws: {
            select: {
              id: true,
              name: true,
              code: true
            }
          },
          destinationCws: {
            select: {
              id: true,
              name: true,
              code: true
            }
          }
        }
      });
  
      res.status(200).json(updatedTransfer);
    } catch (error) {
      console.error('Error receiving wet transfer:', error);
      res.status(500).json({ message: "Failed to receive wet transfer", error: error.message });
    }
  });
  
  // Reject wet transfer endpoint
  router.post('/reject', async (req, res) => {
  try {
    const { transferId, rejectionReason, receivingCwsId } = req.body;

    // Validate request
    if (!transferId || !receivingCwsId) {
      return res.status(400).json({ message: "Required fields missing" });
    }

    // Update the wet transfer record
    const updatedTransfer = await prisma.wetTransfer.update({
      where: { id: parseInt(transferId) },
      data: {
        status: "REJECTED",
        notes: rejectionReason || "Rejected by receiver"
      },
      include: {
        sourceCws: {
          select: {
            id: true,
            name: true,
            code: true
          }
        },
        destinationCws: {
          select: {
            id: true,
            name: true,
            code: true
          }
        }
      }
    });

    res.status(200).json(updatedTransfer);
  } catch (error) {
    console.error('Error rejecting wet transfer:', error);
    res.status(500).json({ message: "Failed to reject wet transfer", error: error.message });
  }
});
  
  // Get wet transfers summary by CWS (for dashboard)
  router.get('/summary/:cwsId', async (req, res) => {
    try {
      const { cwsId } = req.params;
      
      // Get sent transfers summary
      const sentTransfers = await prisma.wetTransfer.findMany({
        where: {
          sourceCwsId: parseInt(cwsId)
        },
        select: {
          id: true,
          status: true,
          outputKgs: true
        }
      });
      
      // Get received transfers summary
      const receivedTransfers = await prisma.wetTransfer.findMany({
        where: {
          destinationCwsId: parseInt(cwsId)
        },
        select: {
          id: true,
          status: true,
          outputKgs: true
        }
      });
      
      // Calculate statistics
      const summary = {
        sent: {
          total: sentTransfers.length,
          pending: sentTransfers.filter(t => t.status === 'PENDING').length,
          received: sentTransfers.filter(t => t.status === 'RECEIVED').length,
          rejected: sentTransfers.filter(t => t.status === 'REJECTED').length,
          totalKgs: sentTransfers.reduce((sum, t) => sum + parseFloat(t.outputKgs || 0), 0).toFixed(2)
        },
        received: {
          total: receivedTransfers.length,
          pending: receivedTransfers.filter(t => t.status === 'PENDING').length,
          received: receivedTransfers.filter(t => t.status === 'RECEIVED').length,
          rejected: receivedTransfers.filter(t => t.status === 'REJECTED').length,
          totalKgs: receivedTransfers.reduce((sum, t) => sum + parseFloat(t.outputKgs || 0), 0).toFixed(2)
        }
      };
      
      res.json(summary);
    } catch (error) {
      console.error('Error fetching wet transfers summary:', error);
      res.status(500).json({ message: "Failed to fetch wet transfers summary", error: error.message });
    }
  });
  
  // Get recent transfers for a CWS (both sent and received)
  router.get('/recent/:cwsId', async (req, res) => {
    try {
      const { cwsId } = req.params;
      const { limit = 5 } = req.query;
      
      // Get recent transfers where the CWS is either the source or destination
      const recentTransfers = await prisma.wetTransfer.findMany({
        where: {
          OR: [
            { sourceCwsId: parseInt(cwsId) },
            { destinationCwsId: parseInt(cwsId) }
          ]
        },
        include: {
          sourceCws: {
            select: {
              id: true,
              name: true,
              code: true
            }
          },
          destinationCws: {
            select: {
              id: true,
              name: true,
              code: true
            }
          }
        },
        orderBy: {
          date: 'desc'
        },
        take: parseInt(limit)
      });
      
      // Add direction metadata to each transfer
      const transfersWithDirection = recentTransfers.map(transfer => ({
        ...transfer,
        direction: transfer.sourceCwsId === parseInt(cwsId) ? 'OUTBOUND' : 'INBOUND'
      }));
      
      res.json(transfersWithDirection);
    } catch (error) {
      console.error('Error fetching recent wet transfers:', error);
      res.status(500).json({ message: "Failed to fetch recent wet transfers", error: error.message });
    }
  });
  
  // Get wet transfers by batch number
  router.get('/batch/:batchNo', async (req, res) => {
    try {
      const { batchNo } = req.params;
      
      const wetTransfers = await prisma.wetTransfer.findMany({
        where: {
          batchNo: {
            contains: batchNo,
            mode: 'insensitive' // Case-insensitive search
          }
        },
        include: {
          sourceCws: {
            select: {
              id: true,
              name: true,
              code: true
            }
          },
          destinationCws: {
            select: {
              id: true,
              name: true,
              code: true
            }
          }
        },
        orderBy: {
          date: 'desc'
        }
      });
      
      res.json(wetTransfers);
    } catch (error) {
      console.error('Error fetching wet transfers by batch number:', error);
      res.status(500).json({ message: "Failed to fetch wet transfers", error: error.message });
    }
  });
  
// Get a specific wet transfer by ID
router.get('/:id',  async (req, res) => {
  try {
    const { id } = req.params;
    
    const wetTransfer = await prisma.wetTransfer.findUnique({
      where: {
        id: parseInt(id)
      },
      include: {
        sourceCws: {
          select: {
            id: true,
            name: true,
            code: true
          }
        },
        destinationCws: {
          select: {
            id: true,
            name: true,
            code: true
          }
        }
      }
    });
    
    if (!wetTransfer) {
      return res.status(404).json({ message: "Wet transfer not found" });
    }
    
    res.json(wetTransfer);
  } catch (error) {
    console.error('Error fetching wet transfer by ID:', error);
    res.status(500).json({ message: "Failed to fetch wet transfer", error: error.message });
  }
});

// Update a wet transfer
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      date,
      outputKgs,
      moistureContent,
      status,
      notes
    } = req.body;
    
    const wetTransfer = await prisma.wetTransfer.update({
      where: {
        id: parseInt(id)
      },
      data: {
        date: date ? new Date(date) : undefined,
        outputKgs: outputKgs ? parseFloat(outputKgs) : undefined,
        moistureContent: moistureContent ? parseFloat(moistureContent) : undefined,
        status,
        notes
      }
    });
    
    res.json(wetTransfer);
  } catch (error) {
    console.error('Error updating wet transfer:', error);
    res.status(500).json({ message: "Failed to update wet transfer", error: error.message });
  }
});

// Delete a wet transfer
router.delete('/:id',  async (req, res) => {
  try {
    const { id } = req.params;
    
    // Get the processing ID before deleting
    const wetTransfer = await prisma.wetTransfer.findUnique({
      where: { id: parseInt(id) },
      select: { processingId: true }
    });
    
    if (!wetTransfer) {
      return res.status(404).json({ message: "Wet transfer not found" });
    }
    
    // Delete the wet transfer
    await prisma.wetTransfer.delete({
      where: { id: parseInt(id) }
    });
    
    // Update the processing status back to IN_PROGRESS
    await prisma.processing.update({
      where: { id: wetTransfer.processingId },
      data: { status: "IN_PROGRESS" }
    });
    
    res.json({ message: "Wet transfer deleted successfully" });
  } catch (error) {
    console.error('Error deleting wet transfer:', error);
    res.status(500).json({ message: "Failed to delete wet transfer", error: error.message });
  }
});

export default router;