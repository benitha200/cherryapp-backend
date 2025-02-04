import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { authenticateToken } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

// Create purchase
router.post('/', authenticateToken, async (req, res) => {
  const { deliveryType, totalKgs, totalPrice, grade, cwsId, collections } = req.body;

  try {
    const purchase = await prisma.purchase.create({
      data: {
        deliveryType,
        totalKgs,
        totalPrice,
        grade,
        cwsId,
        collections: {
          create: collections
        }
      },
      include: {
        collections: true
      }
    });

    res.json(purchase);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Get purchases for a CWS
router.get('/cws/:cwsId', authenticateToken, async (req, res) => {
  const { cwsId } = req.params;

  try {
    const purchases = await prisma.purchase.findMany({
      where: {
        cwsId: parseInt(cwsId)
      },
      include: {
        collections: true
      }
    });

    res.json(purchases);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

export default router;