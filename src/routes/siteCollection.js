import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
// import { authenticateToken } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

// Create a new site collection
router.post('/', async (req, res) => {
  const { name, cwsId } = req.body;

  try {
    const siteCollection = await prisma.siteCollection.create({
      data: { 
        name, 
        cwsId: parseInt(cwsId)
      },
      include: {
        cws: true,
        purchases: true
      }
    });

    res.json(siteCollection);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Get all site collections
router.get('/', async (req, res) => {
  try {
    const siteCollections = await prisma.siteCollection.findMany({
      include: {
        cws: true,
        purchases: true
      }
    });

    res.json(siteCollections);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Get site collections for a specific CWS
router.get('/cws/:cwsId', async (req, res) => {
  const { cwsId } = req.params;

  try {
    const siteCollections = await prisma.siteCollection.findMany({
      where: {
        cwsId: parseInt(cwsId)
      },
      include: {
        cws: true,
        purchases: true
      }
    });

    res.json(siteCollections);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Get a specific site collection by ID
router.get('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const siteCollection = await prisma.siteCollection.findUnique({
      where: { id: parseInt(id) },
      include: {
        cws: true,
        purchases: true
      }
    });

    if (!siteCollection) {
      return res.status(404).json({ error: 'Site collection not found' });
    }

    res.json(siteCollection);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Update a site collection
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { name, cwsId } = req.body;

  try {
    // Check if site collection exists
    const existingSiteCollection = await prisma.siteCollection.findUnique({
      where: { id: parseInt(id) }
    });

    if (!existingSiteCollection) {
      return res.status(404).json({ error: 'Site collection not found' });
    }

    const siteCollection = await prisma.siteCollection.update({
      where: { id: parseInt(id) },
      data: { 
        name,
        cwsId: parseInt(cwsId)
      },
      include: {
        cws: true,
        purchases: true
      }
    });

    res.json(siteCollection);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Delete a site collection
router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    // Check if site collection exists
    const existingSiteCollection = await prisma.siteCollection.findUnique({
      where: { id: parseInt(id) }
    });

    if (!existingSiteCollection) {
      return res.status(404).json({ error: 'Site collection not found' });
    }

    // Check if there are any associated purchases
    const purchases = await prisma.purchase.findMany({
      where: { siteCollectionId: parseInt(id) }
    });

    if (purchases.length > 0) {
      return res.status(400).json({ 
        error: 'Cannot delete site collection with associated purchases' 
      });
    }

    await prisma.siteCollection.delete({
      where: { id: parseInt(id) }
    });

    res.json({ message: 'Site collection deleted successfully' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

export default router;