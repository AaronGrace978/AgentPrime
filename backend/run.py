import os

import uvicorn


def _env_flag(name: str, default: bool = False) -> bool:
    value = os.environ.get(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


if __name__ == "__main__":
    uvicorn.run(
        "app.main:app",
        host=os.environ.get("AGENTPRIME_BACKEND_HOST", "127.0.0.1"),
        port=int(os.environ.get("AGENTPRIME_BACKEND_PORT", "8000")),
        # Auto-managed desktop launches should avoid the reloader on Windows,
        # but developers can still opt in when working on the backend directly.
        reload=_env_flag("AGENTPRIME_BACKEND_RELOAD", default=False),
    )

