/**
 * Items API Routes
 */

import { Router } from 'express';

const router = Router();

// Types
interface Item {
  id: number;
  name: string;
  createdAt: string;
}

// In-memory storage (replace with database in production)
let items: Item[] = [];
let nextId = 1;

// GET all items
router.get('/', (req, res) => {
  res.json(items);
});

// GET single item
router.get('/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const item = items.find(i => i.id === id);
  
  if (!item) {
    return res.status(404).json({ error: 'Item not found' });
  }
  
  res.json(item);
});

// POST new item
router.post('/', (req, res) => {
  const { name } = req.body;
  
  if (!name || typeof name !== 'string') {
    return res.status(400).json({ error: 'Name is required' });
  }
  
  const newItem: Item = {
    id: nextId++,
    name: name.trim(),
    createdAt: new Date().toISOString()
  };
  
  items.push(newItem);
  res.status(201).json(newItem);
});

// DELETE item
router.delete('/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const index = items.findIndex(i => i.id === id);
  
  if (index === -1) {
    return res.status(404).json({ error: 'Item not found' });
  }
  
  items.splice(index, 1);
  res.json({ message: 'Item deleted' });
});

export default router;
