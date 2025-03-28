// import { Router } from 'express';
// import { PrismaClient } from '@prisma/client';
// import bcrypt from 'bcryptjs';
// import jwt from 'jsonwebtoken';

// const router = Router();
// const prisma = new PrismaClient();

// // Middleware to verify admin role
// const isAdmin = (req, res, next) => {
//   const authHeader = req.headers['authorization'];
//   const token = authHeader && authHeader.split(' ')[1];

//   if (!token) {
//     return res.status(401).json({ error: 'Access denied' });
//   }

//   try {
//     const decoded = jwt.verify(token, process.env.JWT_SECRET);
//     if (decoded.role !== 'ADMIN' && decoded.role !== 'SUPER_ADMIN') {
//       return res.status(403).json({ error: 'Admin access required' });
//     }
//     next();
//   } catch (error) {
//     res.status(403).json({ error: 'Invalid token' });
//   }
// };

// // Get all users (Admin only)
// // router.get('/users', isAdmin, async (req, res) => {
//   router.get('/users', async (req, res) => {
//     try {
//       const users = await prisma.user.findMany({
//         orderBy: {
//           id: 'desc'
//         },
//         select: {
//           id: true,
//           username: true,
//           role: true,
//           cwsId: true,
//           createdAt: true,
//           updatedAt: true,
//           cws: {
//             select: {
//               id: true,
//               name: true,
//               code: true,
//               location: true,
//               is_wet_parchment_sender: true,
//             }
//           }
//         }
//       });
//       res.json(users);
//     } catch (error) {
//       res.status(500).json({ error: error.message });
//     }
//   });

// // User Registration
// router.post('/register', async (req, res) => {
//   const { username, password, role, cwsId } = req.body;

//   try {
//     const hashedPassword = await bcrypt.hash(password, 10);

//     // Create the user data object
//     const userData = {
//       username,
//       password: hashedPassword,
//       role,
//       // Only include cwsId if it's not empty and not null
//       ...(cwsId ? { cwsId: parseInt(cwsId) } : {})
//     };

//     const user = await prisma.user.create({
//       data: userData,
//     });

//     // Don't send back the password in the response
//     const { password: _, ...userWithoutPassword } = user;
//     res.json({ 
//       message: 'User registered successfully', 
//       user: userWithoutPassword 
//     });
//   } catch (error) {
//     if (error.code === 'P2002') {
//       res.status(400).json({ error: 'Username already exists' });
//     } else {
//       res.status(400).json({ error: error.message });
//     }
//   }
// });

// // Update User (Admin and Self Only)
// router.put('/users/:id', async (req, res) => {
//   try {
//     const { id } = req.params;
//     const { username, password, role, cwsId } = req.body;
//     const authHeader = req.headers['authorization'];
//     const token = authHeader && authHeader.split(' ')[1];

//     if (!token) {
//       return res.status(401).json({ error: 'Access denied' });
//     }

//     // Verify token and get user info
//     const decoded = jwt.verify(token, process.env.JWT_SECRET);
//     const userId = parseInt(id);

//     // Only allow users to update their own account or admins to update any account
//     if (decoded.userId !== userId && 
//         decoded.role !== 'ADMIN' && 
//         decoded.role !== 'SUPER_ADMIN') {
//       return res.status(403).json({ error: 'You can only update your own account' });
//     }

//     // Prepare update data
//     const updateData = {};

//     if (username) updateData.username = username;
    
//     // Only admins can change roles
//     if (role && (decoded.role === 'ADMIN' || decoded.role === 'SUPER_ADMIN')) {
//       updateData.role = role;
//     }

//     // Only admins can change cwsId
//     if (cwsId !== undefined && (decoded.role === 'ADMIN' || decoded.role === 'SUPER_ADMIN')) {
//       updateData.cwsId = cwsId ? parseInt(cwsId) : null;
//     }

//     // Handle password update if provided
//     if (password) {
//       updateData.password = await bcrypt.hash(password, 10);
//     }

//     // Update the user
//     const updatedUser = await prisma.user.update({
//       where: { id: userId },
//       data: updateData,
//       select: {
//         id: true,
//         username: true,
//         role: true,
//         cwsId: true,
//         updatedAt: true,
//         cws: {
//           select: {
//             id: true,
//             name: true,
//             code: true,
//             location: true
//           }
//         }
//       }
//     });

//     res.json({ 
//       message: 'User updated successfully', 
//       user: updatedUser 
//     });
//   } catch (error) {
//     if (error.code === 'P2002') {
//       res.status(400).json({ error: 'Username already exists' });
//     } else if (error.name === 'JsonWebTokenError') {
//       res.status(403).json({ error: 'Invalid token' });
//     } else {
//       res.status(400).json({ error: error.message });
//     }
//   }
// });

// router.post('/login', async (req, res) => {
//   const { username, password } = req.body;

//   try {
//     const user = await prisma.user.findUnique({
//       where: { username },
//       include: {
//         cws: {
//           select: {
//             id: true,
//             name: true,
//             code: true,
//             location: true,
//             havespeciality: true,
//             is_wet_parchment_sender: true,
//           }
//         }
//       }
//     });

//     if (!user) {
//       return res.status(401).json({ error: 'Invalid username or password' });
//     }

//     const isMatch = await bcrypt.compare(password, user.password);
//     if (!isMatch) {
//       return res.status(401).json({ error: 'Invalid username or password' });
//     }

//     const token = jwt.sign(
//       { userId: user.id, username: user.username, role: user.role },
//       process.env.JWT_SECRET,
//       { expiresIn: '1d' }
//     );

//     const userResponse = {
//       token,
//       user: {
//         id: user.id,
//         username: user.username,
//         role: user.role,
//         cwsId: user.cwsId,
//       },
//       cws: user.cws
//     };

//     res.json(userResponse);
//   } catch (error) {
//     res.status(400).json({ error: error.message });
//   }
// });

// // Enhanced Get Logged-in User Info with CWS details
// router.get('/me', async (req, res) => {
//   try {
//     const authHeader = req.headers['authorization'];
//     const token = authHeader && authHeader.split(' ')[1];

//     if (!token) {
//       return res.status(401).json({ error: 'Access denied' });
//     }

//     const decoded = jwt.verify(token, process.env.JWT_SECRET);

//     const user = await prisma.user.findUnique({
//       where: { id: decoded.userId },
//       select: {
//         id: true,
//         username: true,
//         role: true,
//         cwsId: true,
//         cws: true,
//       },
//     });

//     res.json(user);
//   } catch (error) {
//     res.status(403).json({ error: 'Invalid token' });
//   }
// });

// // Delete User (Admin Only)
// router.delete('/users/:id', isAdmin, async (req, res) => {
//   try {
//     const { id } = req.params;
//     const userId = parseInt(id);

//     // Check if user exists before attempting deletion
//     const existingUser = await prisma.user.findUnique({
//       where: { id: userId }
//     });

//     if (!existingUser) {
//       return res.status(404).json({ error: 'User not found' });
//     }

//     // Delete the user
//     await prisma.user.delete({
//       where: { id: userId }
//     });

//     res.json({ 
//       message: 'User deleted successfully',
//       deletedUserId: userId
//     });
//   } catch (error) {
//     res.status(500).json({ error: error.message });
//   }
// });

// export default router;

import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { redisClient } from '../../index.js';

const router = Router();
const prisma = new PrismaClient();

// Middleware to verify admin role
const isAdmin = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access denied' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.role !== 'ADMIN' && decoded.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    next();
  } catch (error) {
    res.status(403).json({ error: 'Invalid token' });
  }
};

// Get all users
router.get('/users', async (req, res) => {
  const cacheKey = 'users:all';

  try {
    // Try to get cached data
    const cachedUsers = await redisClient.get(cacheKey);
    if (cachedUsers) {
      return res.json(JSON.parse(cachedUsers));
    }

    const users = await prisma.user.findMany({
      orderBy: {
        id: 'desc'
      },
      select: {
        id: true,
        username: true,
        role: true,
        cwsId: true,
        createdAt: true,
        updatedAt: true,
        cws: {
          select: {
            id: true,
            name: true,
            code: true,
            location: true,
            is_wet_parchment_sender: true,
          }
        }
      }
    });

    // Cache the result
    await redisClient.set(
      cacheKey,
      JSON.stringify(users),
      { EX: 3600 } // Cache for 1 hour
    );

    res.json(users);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// User Registration
router.post('/register', async (req, res) => {
  const { username, password, role, cwsId } = req.body;

  try {
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create the user data object
    const userData = {
      username,
      password: hashedPassword,
      role,
      // Only include cwsId if it's not empty and not null
      ...(cwsId ? { cwsId: parseInt(cwsId) } : {})
    };

    const user = await prisma.user.create({
      data: userData,
    });

    // Invalidate users cache
    await redisClient.del('users:all');

    // Don't send back the password in the response
    const { password: _, ...userWithoutPassword } = user;
    res.json({ 
      message: 'User registered successfully', 
      user: userWithoutPassword 
    });
  } catch (error) {
    if (error.code === 'P2002') {
      res.status(400).json({ error: 'Username already exists' });
    } else {
      res.status(400).json({ error: error.message });
    }
  }
});

// Update User
router.put('/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { username, password, role, cwsId } = req.body;
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'Access denied' });
    }

    // Verify token and get user info
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = parseInt(id);

    // Only allow users to update their own account or admins to update any account
    if (decoded.userId !== userId && 
        decoded.role !== 'ADMIN' && 
        decoded.role !== 'SUPER_ADMIN') {
      return res.status(403).json({ error: 'You can only update your own account' });
    }

    // Prepare update data
    const updateData = {};

    if (username) updateData.username = username;
    
    // Only admins can change roles
    if (role && (decoded.role === 'ADMIN' || decoded.role === 'SUPER_ADMIN')) {
      updateData.role = role;
    }

    // Only admins can change cwsId
    if (cwsId !== undefined && (decoded.role === 'ADMIN' || decoded.role === 'SUPER_ADMIN')) {
      updateData.cwsId = cwsId ? parseInt(cwsId) : null;
    }

    // Handle password update if provided
    if (password) {
      updateData.password = await bcrypt.hash(password, 10);
    }

    // Update the user
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: updateData,
      select: {
        id: true,
        username: true,
        role: true,
        cwsId: true,
        updatedAt: true,
        cws: {
          select: {
            id: true,
            name: true,
            code: true,
            location: true
          }
        }
      }
    });

    // Invalidate cache
    await Promise.all([
      redisClient.del('users:all'),
      redisClient.del(`users:${userId}`),
      redisClient.del(`users:me:${userId}`)
    ]);

    res.json({ 
      message: 'User updated successfully', 
      user: updatedUser 
    });
  } catch (error) {
    if (error.code === 'P2002') {
      res.status(400).json({ error: 'Username already exists' });
    } else if (error.name === 'JsonWebTokenError') {
      res.status(403).json({ error: 'Invalid token' });
    } else {
      res.status(400).json({ error: error.message });
    }
  }
});

router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  try {
    const user = await prisma.user.findUnique({
      where: { username },
      include: {
        cws: {
          select: {
            id: true,
            name: true,
            code: true,
            location: true,
            havespeciality: true,
            is_wet_parchment_sender: true,
          }
        }
      }
    });

    if (!user) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const token = jwt.sign(
      { userId: user.id, username: user.username, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );

    const userResponse = {
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        cwsId: user.cwsId,
      },
      cws: user.cws
    };

    // Cache user info
    await redisClient.set(
      `users:${user.id}`,
      JSON.stringify(userResponse),
      { EX: 3600 } // Cache for 1 hour
    );

    res.json(userResponse);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Enhanced Get Logged-in User Info with CWS details
router.get('/me', async (req, res) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ error: 'Access denied' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const cacheKey = `users:me:${decoded.userId}`;

    // Try to get cached data
    const cachedUser = await redisClient.get(cacheKey);
    if (cachedUser) {
      return res.json(JSON.parse(cachedUser));
    }

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        username: true,
        role: true,
        cwsId: true,
        cws: true,
      },
    });

    // Cache the result
    await redisClient.set(
      cacheKey,
      JSON.stringify(user),
      { EX: 3600 } // Cache for 1 hour
    );

    res.json(user);
  } catch (error) {
    res.status(403).json({ error: 'Invalid token' });
  }
});

// Delete User (Admin Only)
router.delete('/users/:id', isAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = parseInt(id);

    // Check if user exists before attempting deletion
    const existingUser = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!existingUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Delete the user
    await prisma.user.delete({
      where: { id: userId }
    });

    // Invalidate cache
    await Promise.all([
      redisClient.del('users:all'),
      redisClient.del(`users:${userId}`),
      redisClient.del(`users:me:${userId}`)
    ]);

    res.json({ 
      message: 'User deleted successfully',
      deletedUserId: userId
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;