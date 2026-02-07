/**
 * {{projectName}} - Express Backend
 * {{description}}
 */

import express from 'express';
import cors from 'cors';
import itemsRouter from './routes/items.js';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:3000'],
  credentials: true
}));
app.use(express.json());

// Routes
app.use('/api/items', itemsRouter);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Root
app.get('/', (req, res) => {
  res.json({
    message: 'Welcome to {{projectName}} API',
    health: '/api/health',
    items: '/api/items'
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 {{projectName}} backend running on http://localhost:${PORT}`);
});
