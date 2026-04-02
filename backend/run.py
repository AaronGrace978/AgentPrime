import os
from pathlib import Path

from dotenv import load_dotenv
import uvicorn


def _env_flag(name: str, default: bool = False) -> bool:
    value = os.environ.get(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _load_env_files() -> None:
    """
    Load env files in a deterministic order:
    1) project root .env (shared with Electron app)
    2) backend/.env (backend-only overrides)
    """
    backend_dir = Path(__file__).resolve().parent
    project_root = backend_dir.parent

    load_dotenv(project_root / ".env", override=False)
    load_dotenv(backend_dir / ".env", override=True)


if __name__ == "__main__":
    _load_env_files()
    uvicorn.run(
        "app.main:app",
        host=os.environ.get("AGENTPRIME_BACKEND_HOST", "127.0.0.1"),
        port=int(os.environ.get("AGENTPRIME_BACKEND_PORT", "8000")),
        # Auto-managed desktop launches should avoid the reloader on Windows,
        # but developers can still opt in when working on the backend directly.
        reload=_env_flag("AGENTPRIME_BACKEND_RELOAD", default=False),
    )

