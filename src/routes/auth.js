// import { Router } from 'express';
// import { PrismaClient } from '@prisma/client';
// import bcrypt from 'bcryptjs';
// import jwt from 'jsonwebtoken';

// const router = Router();
// const prisma = new PrismaClient();

// // User Registration
// router.post('/register', async (req, res) => {
//   const { username, password, role, cwsId } = req.body;

//   try {
//     const hashedPassword = await bcrypt.hash(password, 10);

//     const user = await prisma.user.create({
//       data: {
//         username,
//         password: hashedPassword,
//         role,
//         cwsId,
//       },
//     });

//     res.json({ message: 'User registered successfully', user });
//   } catch (error) {
//     res.status(400).json({ error: error.message });
//   }
// });

// // Enhanced User Login with CWS details
// router.post('/login', async (req, res) => {
//   const { username, password } = req.body;

//   try {
//     // Get user with CWS information
//     const user = await prisma.user.findUnique({
//       where: { username },
//       include: {
//         cws: true, // Include CWS details - make sure this relation exists in your schema
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

//     // Return token, user details (excluding password), and CWS details
//     const userResponse = {
//       token,
//       user: {
//         id: user.id,
//         username: user.username,
//         role: user.role,
//         cwsId: user.cwsId,
//       },
//       cws: user.cws // CWS details from the relation
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
//         cws: true, // Include CWS details
//       },
//     });

//     res.json(user);
//   } catch (error) {
//     res.status(403).json({ error: 'Invalid token' });
//   }
// });

// export default router;

import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

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

// Get all users (Admin only)
router.get('/users', isAdmin, async (req, res) => {
  try {
    const users = await prisma.user.findMany({
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
            location: true
          }
        }
      }
    });
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

// Enhanced User Login with CWS details
router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  try {
    const user = await prisma.user.findUnique({
      where: { username },
      include: {
        cws: true,
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

    res.json(user);
  } catch (error) {
    res.status(403).json({ error: 'Invalid token' });
  }
});

export default router;