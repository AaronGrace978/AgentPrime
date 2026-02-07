from pydantic_settings import BaseSettings
import os

class Settings(BaseSettings):
    OLLAMA_BASE_URL: str = "http://127.0.0.1:11434"  # Use 127.0.0.1 to avoid IPv6 issues
    OLLAMA_MODEL: str = "qwen2.5-coder:14b"  # Local Ollama model
    OLLAMA_API_KEY: str = ""  # Set via .env or environment variable
    WORKSPACE_ROOT: str = os.environ.get("WORKSPACE_ROOT", "")
    
    class Config:
        env_file = ".env"

settings = Settings()

