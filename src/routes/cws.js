// import { Router } from 'express';
// import { PrismaClient } from '@prisma/client';
// // import { authenticateToken } from '../middleware/auth';

// const router = Router();
// const prisma = new PrismaClient();

// // Create a new CWS
// router.post('/', async (req, res) => {
//   const { name, location, code, havespeciality, is_wet_parchment_sender } = req.body;
  
//   try {
//     const cws = await prisma.cWS.create({
//       data: {
//         name,
//         location,
//         code,
//         havespeciality: havespeciality || false,
//         is_wet_parchment_sender: is_wet_parchment_sender !== undefined ? is_wet_parchment_sender : true
//       },
//     });
    
//     res.json(cws);
//   } catch (error) {
//     res.status(400).json({ error: error.message });
//   }
// });

// // Get all CWS
// router.get('/', async (req, res) => {
//   try {
//     const cwsList = await prisma.cWS.findMany({
//       include: { users: true, purchases: true },
//     });
    
//     res.json(cwsList);
//   } catch (error) {
//     res.status(400).json({ error: error.message });
//   }
// });

// // Get a specific CWS by ID
// router.get('/:id', async (req, res) => {
//   const { id } = req.params;
  
//   try {
//     const cws = await prisma.cWS.findUnique({
//       where: { id: parseInt(id) },
//       include: { users: true, purchases: true },
//     });
    
//     if (!cws) return res.status(404).json({ error: 'CWS not found' });
    
//     res.json(cws);
//   } catch (error) {
//     res.status(400).json({ error: error.message });
//   }
// });

// // Update a CWS
// router.put('/:id', async (req, res) => {
//   const { id } = req.params;
//   const { name, location, code, havespeciality, is_wet_parchment_sender } = req.body;
  
//   try {
//     const cws = await prisma.cWS.update({
//       where: { id: parseInt(id) },
//       data: {
//         name,
//         location,
//         code,
//         ...(havespeciality !== undefined ? { havespeciality } : {}),
//         ...(is_wet_parchment_sender !== undefined ? { is_wet_parchment_sender } : {})
//       },
//     });
    
//     res.json(cws);
//   } catch (error) {
//     res.status(400).json({ error: error.message });
//   }
// });

// // Delete a CWS
// router.delete('/:id', async (req, res) => {
//   const { id } = req.params;
  
//   try {
//     await prisma.cWS.delete({ where: { id: parseInt(id) } });
//     res.json({ message: 'CWS deleted successfully' });
//   } catch (error) {
//     res.status(400).json({ error: error.message });
//   }
// });

// export default router;

import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { redisClient } from '../../index.js';

const router = Router();
const prisma = new PrismaClient();

// Create a new CWS
router.post('/', async (req, res) => {
  const { name, location, code, havespeciality, is_wet_parchment_sender } = req.body;
  
  try {
    const cws = await prisma.cWS.create({
      data: {
        name,
        location,
        code,
        havespeciality: havespeciality || false,
        is_wet_parchment_sender: is_wet_parchment_sender !== undefined ? is_wet_parchment_sender : true
      },
    });
    
    // Invalidate cache for CWS routes
    await redisClient.del('cws:*');
    
    res.json(cws);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Get all CWS
router.get('/', async (req, res) => {
  const cacheKey = 'cws:all';
  
  try {
    // Try to get cached data
    const cachedCws = await redisClient.get(cacheKey);
    if (cachedCws) {
      return res.json(JSON.parse(cachedCws));
    }
    
    const cwsList = await prisma.cWS.findMany({
      include: { users: true, purchases: true },
    });
    
    // Cache the result
    await redisClient.set(
      cacheKey, 
      JSON.stringify(cwsList), 
      { EX: 3600 }  // Cache for 1 hour
    );
    
    res.json(cwsList);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Get a specific CWS by ID
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  const cacheKey = `cws:${id}`;
  
  try {
    // Try to get cached data
    const cachedCws = await redisClient.get(cacheKey);
    if (cachedCws) {
      return res.json(JSON.parse(cachedCws));
    }
    
    const cws = await prisma.cWS.findUnique({
      where: { id: parseInt(id) },
      include: { users: true, purchases: true },
    });
    
    if (!cws) return res.status(404).json({ error: 'CWS not found' });
    
    // Cache the result
    await redisClient.set(
      cacheKey, 
      JSON.stringify(cws), 
      { EX: 3600 }  // Cache for 1 hour
    );
    
    res.json(cws);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Update a CWS
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { name, location, code, havespeciality, is_wet_parchment_sender } = req.body;
  
  try {
    const cws = await prisma.cWS.update({
      where: { id: parseInt(id) },
      data: {
        name,
        location,
        code,
        ...(havespeciality !== undefined ? { havespeciality } : {}),
        ...(is_wet_parchment_sender !== undefined ? { is_wet_parchment_sender } : {})
      },
    });
    
    // Invalidate specific and general cache
    await Promise.all([
      redisClient.del(`cws:${id}`),
      redisClient.del('cws:all')
    ]);
    
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
    
    // Invalidate specific and general cache
    await Promise.all([
      redisClient.del(`cws:${id}`),
      redisClient.del('cws:all')
    ]);
    
    res.json({ message: 'CWS deleted successfully' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

export default router;