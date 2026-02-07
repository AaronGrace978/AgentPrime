from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional
from app.core.agent import agent

router = APIRouter()

class ChatRequest(BaseModel):
    message: str
    file_path: Optional[str] = None
    file_content: Optional[str] = None
    selection: Optional[str] = None

class QuickActionRequest(BaseModel):
    action: str
    code: str
    language: Optional[str] = "code"

@router.post("/message")
async def chat_message(req: ChatRequest):
    try:
        response = await agent.chat(
            message=req.message,
            file_path=req.file_path,
            file_content=req.file_content,
            selection=req.selection
        )
        return {"success": True, "response": response}
    except Exception as e:
        return {"success": False, "response": f"❌ Error: {str(e)}"}

@router.post("/quick")
async def quick_action(req: QuickActionRequest):
    try:
        response = await agent.quick_action(req.action, req.code, req.language)
        return {"success": True, "response": response}
    except Exception as e:
        return {"success": False, "response": f"❌ Error: {str(e)}"}

