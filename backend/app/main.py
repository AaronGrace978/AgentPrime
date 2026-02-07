from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
import os

from app.api import files, chat, terminal, brain, team_patterns
from app.config import settings
from app.core.memory import get_memory_store
from app.core.orchestrator import get_orchestrator
from app.core.analyzer import get_analyzer

app = FastAPI(title="AgentPrime - The Brain")

# Restrict CORS to localhost origins only for security
ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://localhost:5173",
    "http://localhost:8080",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:8080",
    "file://",  # Electron file protocol
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

app.include_router(files.router, prefix="/api/files", tags=["Files"])
app.include_router(chat.router, prefix="/api/chat", tags=["Chat"])
app.include_router(terminal.router, prefix="/api/terminal", tags=["Terminal"])
app.include_router(brain.router, prefix="/api/brain", tags=["Brain"])
app.include_router(team_patterns.router, tags=["Team Patterns"])

@app.on_event("startup")
async def startup_event():
    """Initialize brain services on startup"""
    print("[Brain] Initializing memory store...")
    memory = get_memory_store()
    stats = memory.get_stats()
    print(f"[Brain] Memory loaded: {stats['total_memories']} memories, {stats['total_code_patterns']} patterns")
    
    print("[Brain] Initializing orchestrator...")
    orchestrator = get_orchestrator()
    print("[Brain] Orchestrator ready")
    
    # Start background analysis if workspace is set
    if settings.WORKSPACE_ROOT:
        print(f"[Brain] Starting background analysis of {settings.WORKSPACE_ROOT}...")
        analyzer = get_analyzer()
        analyzer.start_background_analysis(settings.WORKSPACE_ROOT)


@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup on shutdown"""
    print("[Brain] Shutting down...")
    analyzer = get_analyzer()
    analyzer.stop_analysis()
    
    memory = get_memory_store()
    memory.close()
    print("[Brain] Shutdown complete")


@app.get("/api/status")
async def status():
    """Get API status including brain stats"""
    memory = get_memory_store()
    stats = memory.get_stats()
    
    return {
        "status": "ok",
        "workspace": settings.WORKSPACE_ROOT,
        "model": settings.OLLAMA_MODEL,
        "brain": {
            "memories": stats['total_memories'],
            "patterns": stats['total_code_patterns'],
            "conversations": stats['total_conversations']
        }
    }

# Serve frontend
frontend_path = os.path.join(os.path.dirname(__file__), "..", "..", "frontend")
if os.path.exists(frontend_path):
    app.mount("/static", StaticFiles(directory=frontend_path), name="static")

@app.get("/")
async def root():
    return FileResponse(os.path.join(frontend_path, "index.html"))

print(f"""
+==============================================================+
|                    AGENT PRIME BRAIN                         |
|              The Orchestrator & Memory Layer                 |
+==============================================================+
|  Workspace: {settings.WORKSPACE_ROOT or 'Not set':<45} |
|  Model: {settings.OLLAMA_MODEL:<49} |
+--------------------------------------------------------------+
|  Features:                                                   |
|    - Persistent Memory (SQLite + TF-IDF semantic search)     |
|    - Task Orchestration (routes to best agent/model)         |
|    - Background Code Analysis (patterns, style detection)    |
|    - Learning from outcomes                                  |
+==============================================================+
""")

