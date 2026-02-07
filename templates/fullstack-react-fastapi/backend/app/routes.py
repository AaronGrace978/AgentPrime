"""
API Routes
"""

from fastapi import APIRouter, HTTPException
from typing import List
from datetime import datetime
from .models import Item, ItemCreate

router = APIRouter()

# In-memory storage (replace with database in production)
items_db: List[Item] = []
next_id = 1

@router.get("/health")
async def health_check():
    """Health check endpoint"""
    return {"status": "healthy", "timestamp": datetime.now().isoformat()}

@router.get("/items", response_model=List[Item])
async def get_items():
    """Get all items"""
    return items_db

@router.get("/items/{item_id}", response_model=Item)
async def get_item(item_id: int):
    """Get a single item by ID"""
    for item in items_db:
        if item.id == item_id:
            return item
    raise HTTPException(status_code=404, detail="Item not found")

@router.post("/items", response_model=Item)
async def create_item(item: ItemCreate):
    """Create a new item"""
    global next_id
    new_item = Item(
        id=next_id,
        name=item.name,
        created_at=datetime.now()
    )
    items_db.append(new_item)
    next_id += 1
    return new_item

@router.delete("/items/{item_id}")
async def delete_item(item_id: int):
    """Delete an item"""
    global items_db
    for i, item in enumerate(items_db):
        if item.id == item_id:
            items_db.pop(i)
            return {"message": "Item deleted"}
    raise HTTPException(status_code=404, detail="Item not found")
