from pydantic_settings import BaseSettings
import os


def _resolve_ollama_base_url() -> str:
    """
    Keep backend compatible with both variable names:
    - OLLAMA_BASE_URL (backend-native)
    - OLLAMA_URL (desktop app / root .env)
    """
    return (
        os.environ.get("OLLAMA_BASE_URL")
        or os.environ.get("OLLAMA_URL")
        or "http://127.0.0.1:11434"
    )


class Settings(BaseSettings):
    OLLAMA_BASE_URL: str = _resolve_ollama_base_url()  # Use 127.0.0.1 to avoid IPv6 issues
    OLLAMA_MODEL: str = "qwen2.5-coder:14b"  # Local Ollama model
    OLLAMA_API_KEY: str = ""  # Set via .env or environment variable
    WORKSPACE_ROOT: str = os.environ.get("WORKSPACE_ROOT", "")
    
    class Config:
        env_file = ".env"

settings = Settings()

