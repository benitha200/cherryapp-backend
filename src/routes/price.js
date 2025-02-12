import { Router } from 'express';
import { PrismaClient } from '@prisma/client';

const router = Router();
const prisma = new PrismaClient();

// Global Fees Routes
router.post('/global', async (req, res) => {
  const { commissionFee, transportFee } = req.body;
  
  try {
    const fees = await prisma.globalFees.create({
      data: { commissionFee, transportFee }
    });
    res.json(fees);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/global', async (req, res) => {
  try {
    const fees = await prisma.globalFees.findFirst({
      orderBy: { createdAt: 'desc' }
    });
    res.json(fees);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// CWS Pricing Routes
router.post('/cws-pricing', async (req, res) => {
  const { cwsId, gradeAPrice, transportFee } = req.body;
  
  try {
    const pricing = await prisma.cWSPricing.create({
      data: {
        cwsId: parseInt(cwsId),
        gradeAPrice,
        transportFee
      }
    });
    res.json(pricing);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/cws-pricing/:cwsId', async (req, res) => {
  const { cwsId } = req.params;
  
  try {
    const pricing = await prisma.cWSPricing.findFirst({
      where: { cwsId: parseInt(cwsId) },
      orderBy: { createdAt: 'desc' }
    });
    res.json(pricing);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Site Collection Fees Routes
router.post('/site-fees', async (req, res) => {
  const { siteCollectionId, transportFee } = req.body;
  
  try {
    const fees = await prisma.siteCollectionFees.create({
      data: {
        siteCollectionId: parseInt(siteCollectionId),
        transportFee
      }
    });
    res.json(fees);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.get('/site-fees/:siteCollectionId', async (req, res) => {
  const { siteCollectionId } = req.params;
  
  try {
    const fees = await prisma.siteCollectionFees.findFirst({
      where: { siteCollectionId: parseInt(siteCollectionId) },
      orderBy: { createdAt: 'desc' }
    });
    res.json(fees);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

export default router;