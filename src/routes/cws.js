import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
// import { authenticateToken } from '../middleware/auth';

const router = Router();
const prisma = new PrismaClient();

// Create a new CWS
router.post('/', async (req, res) => {
  const { name, location, code, havespeciality } = req.body;

  try {
    const cws = await prisma.cWS.create({
      data: { 
        name, 
        location, 
        code,
        havespeciality: havespeciality || false
      },
    });

    res.json(cws);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Get all CWS
router.get('/', async (req, res) => {
  try {
    const cwsList = await prisma.cWS.findMany({
      include: { users: true, purchases: true },
    });

    res.json(cwsList);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Get a specific CWS by ID
router.get('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const cws = await prisma.cWS.findUnique({
      where: { id: parseInt(id) },
      include: { users: true, purchases: true },
    });

    if (!cws) return res.status(404).json({ error: 'CWS not found' });

    res.json(cws);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Update a CWS
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { name, location, code, havespeciality } = req.body;

  try {
    const cws = await prisma.cWS.update({
      where: { id: parseInt(id) },
      data: { 
        name, 
        location, 
        code,
        ...(havespeciality !== undefined ? { havespeciality } : {})
      },
    });

    res.json(cws);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Delete a CWS
router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    await prisma.cWS.delete({ where: { id: parseInt(id) } });
    res.json({ message: 'CWS deleted successfully' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

export default router;