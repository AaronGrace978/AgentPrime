from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from pathlib import Path
import os
from app.config import settings

router = APIRouter()

LANG_MAP = {
    '.py': 'python', '.js': 'javascript', '.ts': 'typescript', '.tsx': 'typescriptreact',
    '.html': 'html', '.css': 'css', '.json': 'json', '.md': 'markdown',
    '.yaml': 'yaml', '.yml': 'yaml', '.sql': 'sql', '.sh': 'shell'
}

IGNORE = {'.git', 'node_modules', '__pycache__', 'venv', '.venv', 'dist', 'build', '.idea', '.vscode'}

def get_workspace():
    ws = settings.WORKSPACE_ROOT
    if not ws or not os.path.isdir(ws):
        raise HTTPException(400, "No workspace configured")
    return Path(ws)

def validate_path(ws: Path, user_path: str) -> Path:
    """Validate that user_path stays within workspace boundaries (prevent path traversal)."""
    resolved = (ws / user_path).resolve()
    ws_resolved = ws.resolve()
    if not str(resolved).startswith(str(ws_resolved)):
        raise HTTPException(403, "Access denied: path traversal detected")
    return resolved

def build_tree(path: Path, depth: int = 0):
    if depth > 5:
        return []
    
    items = []
    try:
        entries = sorted(path.iterdir(), key=lambda x: (not x.is_dir(), x.name.lower()))
    except PermissionError:
        return []
    
    for entry in entries:
        if entry.name.startswith('.') or entry.name in IGNORE:
            continue
        
        rel = entry.relative_to(get_workspace())
        item = {"name": entry.name, "path": str(rel).replace("\\", "/"), "is_dir": entry.is_dir()}
        
        if entry.is_dir():
            item["children"] = build_tree(entry, depth + 1)
        else:
            item["extension"] = entry.suffix
        
        items.append(item)
    
    return items

@router.get("/tree")
async def get_tree():
    ws = get_workspace()
    return {"tree": build_tree(ws), "root": str(ws)}

@router.get("/read")
async def read_file(path: str):
    ws = get_workspace()
    file_path = validate_path(ws, path)
    
    if not file_path.exists():
        raise HTTPException(404, "File not found")
    if not file_path.is_file():
        raise HTTPException(400, "Not a file")
    
    try:
        content = file_path.read_text(encoding='utf-8')
    except:
        content = file_path.read_text(encoding='latin-1')
    
    ext = file_path.suffix.lower()
    return {
        "path": path,
        "content": content,
        "language": LANG_MAP.get(ext, "plaintext"),
        "lines": content.count('\n') + 1
    }

class WriteRequest(BaseModel):
    path: str
    content: str

@router.post("/write")
async def write_file(req: WriteRequest):
    ws = get_workspace()
    file_path = validate_path(ws, req.path)
    file_path.parent.mkdir(parents=True, exist_ok=True)
    file_path.write_text(req.content, encoding='utf-8')
    return {"success": True}

class CreateRequest(BaseModel):
    path: str
    is_dir: bool = False

@router.post("/create")
async def create_item(req: CreateRequest):
    ws = get_workspace()
    item_path = validate_path(ws, req.path)
    
    if req.is_dir:
        item_path.mkdir(parents=True, exist_ok=True)
    else:
        item_path.parent.mkdir(parents=True, exist_ok=True)
        item_path.touch()
    
    return {"success": True}

@router.delete("/delete")
async def delete_item(path: str):
    ws = get_workspace()
    item_path = validate_path(ws, path)
    
    if item_path.is_dir():
        import shutil
        shutil.rmtree(item_path)
    else:
        item_path.unlink()
    
    return {"success": True}

