from fastapi import APIRouter
from pydantic import BaseModel
import subprocess
from app.config import settings

router = APIRouter()

class CommandRequest(BaseModel):
    command: str

@router.post("/run")
async def run_command(req: CommandRequest):
    try:
        result = subprocess.run(
            req.command,
            shell=True,
            capture_output=True,
            text=True,
            timeout=30,
            cwd=settings.WORKSPACE_ROOT or None
        )
        return {
            "stdout": result.stdout,
            "stderr": result.stderr,
            "success": result.returncode == 0
        }
    except subprocess.TimeoutExpired:
        return {"stdout": "", "stderr": "Command timed out", "success": False}
    except Exception as e:
        return {"stdout": "", "stderr": str(e), "success": False}

