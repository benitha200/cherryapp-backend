// import jwt from 'jsonwebtoken';

// export const authenticateToken = (req, res, next) => {
//   const authHeader = req.headers['authorization'];
//   const token = authHeader && authHeader.split(' ')[1];

//   if (!token) return res.status(401).json({ error: 'Access denied' });

//   try {
//     const user = jwt.verify(token, process.env.JWT_SECRET);
//     req.user = user;
//     next();
//   } catch (error) {
//     res.status(403).json({ error: 'Invalid token' });
//   }
// };

import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access denied' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    res.status(403).json({ error: 'Invalid token' });
  }
};

export const authorizeAdmin = (req, res, next) => {
  if (req.user.role === 'ADMIN' || req.user.role === 'SUPER_ADMIN') {
    next();
  } else {
    res.status(403).json({ error: 'Access denied. Admin privileges required.' });
  }
};