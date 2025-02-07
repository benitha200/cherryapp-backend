import express from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';
import authRoutes from './src/routes/auth.js';
import purchaseRoutes from './src/routes/purchase.js';
import cwsRoutes from './src/routes/cws.js';
import siteCollectionRoutes from './src/routes/siteCollection.js';
import processingRoutes from './src/routes/processing.js'
import BagOffRoutes from './src/routes/bagoff.js';

const prisma = new PrismaClient();
const app = express();

app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/purchases', purchaseRoutes);
app.use('/api/cws', cwsRoutes);
app.use('/api/site-collections', siteCollectionRoutes);
app.use('/api/processing', processingRoutes);
app.use('/api/bagging-off', BagOffRoutes);


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
