// import express from 'express';
// import cors from 'cors';
// import { PrismaClient } from '@prisma/client';
// import authRoutes from './src/routes/auth.js';
// import purchaseRoutes from './src/routes/purchase.js';
// import cwsRoutes from './src/routes/cws.js';
// import siteCollectionRoutes from './src/routes/siteCollection.js';
// import processingRoutes from './src/routes/processing.js'
// import BagOffRoutes from './src/routes/bagoff.js';
// import TransferRoutes from './src/routes/transfer.js';
// import PricingRoutes from './src/routes/price.js';
// import WetTransfer from './src/routes/wettransfer.js';

// const prisma = new PrismaClient();
// const app = express();

// app.use(cors());
// app.use(express.json());

// // Routes
// app.use('/api/auth', authRoutes);
// app.use('/api/purchases', purchaseRoutes);
// app.use('/api/cws', cwsRoutes);
// app.use('/api/site-collections', siteCollectionRoutes);
// app.use('/api/processing', processingRoutes);
// app.use('/api/bagging-off', BagOffRoutes);
// app.use('/api/transfer', TransferRoutes);
// app.use('/api/pricing', PricingRoutes);
// app.use('/api/wet-transfer', WetTransfer);


// const PORT = process.env.PORT || 3000;
// app.listen(PORT, () => {
//   console.log(`Server running on port ${PORT}`);
// });

import express from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';
import { createClient } from 'redis';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Routes
import authRoutes from './src/routes/auth.js';
import purchaseRoutes from './src/routes/purchase.js';
import cwsRoutes from './src/routes/cws.js';
import siteCollectionRoutes from './src/routes/siteCollection.js';
import processingRoutes from './src/routes/processing.js';
import BagOffRoutes from './src/routes/bagoff.js';
import TransferRoutes from './src/routes/transfer.js';
import PricingRoutes from './src/routes/price.js';
import WetTransfer from './src/routes/wettransfer.js';

// Redis Configuration
const redisClient = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379'
});

// Redis Error Handling
redisClient.on('error', (err) => {
  console.error('Redis Client Error', err);
});

// Prisma Client
const prisma = new PrismaClient();

// Create Express App
const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Redis Initialization Middleware
async function initRedis() {
  if (!redisClient.isOpen) {
    try {
      await redisClient.connect();
      console.log('Connected to Redis successfully');
    } catch (error) {
      console.error('Failed to connect to Redis', error);
    }
  }
}

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/purchases', purchaseRoutes);
app.use('/api/cws', cwsRoutes);
app.use('/api/site-collections', siteCollectionRoutes);
app.use('/api/processing', processingRoutes);
app.use('/api/bagging-off', BagOffRoutes);
app.use('/api/transfer', TransferRoutes);
app.use('/api/pricing', PricingRoutes);
app.use('/api/wet-transfer', WetTransfer);

// Server Setup
const PORT = process.env.PORT || 3000;

// Initialize Server
async function startServer() {
  try {
    await initRedis();
    
    const server = app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });

    // Graceful Shutdown
    process.on('SIGINT', async () => {
      await redisClient.quit();
      server.close(() => {
        console.log('Server closed');
        process.exit(0);
      });
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Export for use in other modules
export { redisClient, prisma, app };

// Start the server
startServer();