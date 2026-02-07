"""
Pydantic models for request/response validation
"""

from pydantic import BaseModel
from datetime import datetime
from typing import Optional

class ItemCreate(BaseModel):
    name: str

class Item(BaseModel):
    id: int
    name: str
    created_at: datetime

    class Config:
        from_attributes = True

class ItemUpdate(BaseModel):
    name: Optional[str] = None
