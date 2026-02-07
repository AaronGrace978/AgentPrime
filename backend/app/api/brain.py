"""
AgentPrime Brain API
Exposes the orchestrator, memory, and analyzer services

Endpoints:
- /api/brain/route - Route a task to the appropriate agent/model
- /api/brain/memory - Memory operations (search, store, retrieve)
- /api/brain/analyze - Trigger workspace analysis
- /api/brain/patterns - Get detected code patterns
- /api/brain/style - Get detected coding style
- /api/brain/stats - Get brain statistics
"""

from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel
from typing import Optional, Dict, Any, List
from datetime import datetime

from ..core.memory import get_memory_store
from ..core.orchestrator import get_orchestrator, TaskType, ModelTier, AgentType
from ..core.analyzer import get_analyzer

router = APIRouter()


# ============ REQUEST/RESPONSE MODELS ============

class RouteRequest(BaseModel):
    message: str
    context: Optional[Dict[str, Any]] = None


class RouteResponse(BaseModel):
    task_type: str
    model_tier: str
    agent_type: str
    suggested_model: str
    complexity_score: float
    reasoning: str
    context_needed: List[str]
    estimated_steps: int
    confidence: float


class MemoryStoreRequest(BaseModel):
    type: str
    content: str
    metadata: Optional[Dict[str, Any]] = None


class MemorySearchRequest(BaseModel):
    query: str
    type: Optional[str] = None
    limit: int = 10


class MemorySearchResult(BaseModel):
    id: str
    type: str
    content: str
    score: float
    success_rate: float


class AnalyzeRequest(BaseModel):
    workspace_path: str
    background: bool = True


class OutcomeRequest(BaseModel):
    message: str
    success: bool
    actual_model: Optional[str] = None
    actual_steps: Optional[int] = None


class ConversationMessage(BaseModel):
    session_id: str
    role: str
    content: str
    model: Optional[str] = None
    tokens: int = 0


class PreferenceRequest(BaseModel):
    key: str
    value: Any


# ============ ROUTING ENDPOINTS ============

@router.post("/route", response_model=RouteResponse)
async def route_task(request: RouteRequest):
    """
    Route a task to the appropriate agent and model
    
    This is the main entry point for the orchestrator.
    It analyzes the task and decides:
    - Which agent should handle it (Python chat, Electron chat, Electron agent)
    - Which model tier to use (fast, standard, deep)
    - What context is needed
    """
    orchestrator = get_orchestrator()
    
    try:
        decision = orchestrator.analyze_task(request.message, request.context or {})
        
        return RouteResponse(
            task_type=decision.task_type.value,
            model_tier=decision.model_tier.value,
            agent_type=decision.agent_type.value,
            suggested_model=decision.suggested_model,
            complexity_score=decision.complexity_score,
            reasoning=decision.reasoning,
            context_needed=decision.context_needed,
            estimated_steps=decision.estimated_steps,
            confidence=decision.confidence
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/outcome")
async def record_outcome(request: OutcomeRequest):
    """
    Record the outcome of a task for learning
    
    Call this after a task completes to help the orchestrator learn.
    """
    orchestrator = get_orchestrator()
    
    try:
        orchestrator.record_outcome(
            message=request.message,
            success=request.success,
            actual_model=request.actual_model,
            actual_steps=request.actual_steps
        )
        return {"status": "recorded"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============ MEMORY ENDPOINTS ============

@router.post("/memory/store")
async def store_memory(request: MemoryStoreRequest):
    """Store a new memory"""
    memory = get_memory_store()
    
    try:
        stored = memory.store(
            type=request.type,
            content=request.content,
            metadata=request.metadata or {}
        )
        return {
            "id": stored.id,
            "type": stored.type,
            "created_at": stored.created_at
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/memory/search", response_model=List[MemorySearchResult])
async def search_memory(request: MemorySearchRequest):
    """Search memories semantically"""
    memory = get_memory_store()
    
    try:
        results = memory.search(
            query=request.query,
            type=request.type,
            limit=request.limit
        )
        
        return [
            MemorySearchResult(
                id=r.memory.id,
                type=r.memory.type,
                content=r.memory.content[:200],  # Truncate for response
                score=r.score,
                success_rate=r.memory.success_rate
            )
            for r in results
        ]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/memory/{memory_id}")
async def get_memory(memory_id: str):
    """Get a specific memory by ID"""
    memory = get_memory_store()
    
    stored = memory.get(memory_id)
    if not stored:
        raise HTTPException(status_code=404, detail="Memory not found")
    
    return {
        "id": stored.id,
        "type": stored.type,
        "content": stored.content,
        "metadata": stored.metadata,
        "created_at": stored.created_at,
        "access_count": stored.access_count,
        "success_rate": stored.success_rate
    }


@router.get("/memory/type/{memory_type}")
async def get_memories_by_type(memory_type: str, limit: int = 50):
    """Get memories by type"""
    memory = get_memory_store()
    
    memories = memory.get_by_type(memory_type, limit)
    return [
        {
            "id": m.id,
            "content": m.content[:200],
            "success_rate": m.success_rate,
            "access_count": m.access_count
        }
        for m in memories
    ]


@router.post("/memory/{memory_id}/success")
async def update_memory_success(memory_id: str, success: bool):
    """Update the success rate of a memory"""
    memory = get_memory_store()
    
    try:
        memory.update_success_rate(memory_id, success)
        return {"status": "updated"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============ CONVERSATION HISTORY ============

@router.post("/conversation")
async def save_conversation(message: ConversationMessage):
    """Save a conversation message"""
    memory = get_memory_store()
    
    try:
        memory.save_conversation(
            session_id=message.session_id,
            role=message.role,
            content=message.content,
            model=message.model,
            tokens=message.tokens
        )
        return {"status": "saved"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/conversation/{session_id}")
async def get_conversation(session_id: str, limit: int = 50):
    """Get conversation history for a session"""
    memory = get_memory_store()
    
    history = memory.get_conversation_history(session_id, limit)
    return {"messages": history}


@router.get("/sessions")
async def get_sessions(limit: int = 10):
    """Get recent conversation sessions"""
    memory = get_memory_store()
    
    sessions = memory.get_recent_sessions(limit)
    return {"sessions": sessions}


# ============ CODE ANALYSIS ============

@router.post("/analyze")
async def analyze_workspace(request: AnalyzeRequest, background_tasks: BackgroundTasks):
    """
    Analyze a workspace for code patterns
    
    If background=True (default), runs analysis in background.
    """
    analyzer = get_analyzer()
    
    if analyzer.is_running():
        return {"status": "already_running"}
    
    if request.background:
        background_tasks.add_task(
            analyzer.start_background_analysis,
            request.workspace_path
        )
        return {"status": "started", "background": True}
    else:
        result = analyzer.analyze_workspace(request.workspace_path)
        return {
            "status": "completed",
            "files_analyzed": result.files_analyzed,
            "patterns_found": result.patterns_found,
            "languages": result.languages,
            "anti_patterns": result.anti_patterns,
            "suggestions": result.suggestions,
            "duration_seconds": result.duration_seconds
        }


@router.get("/analyze/status")
async def get_analysis_status():
    """Get current analysis status"""
    analyzer = get_analyzer()
    
    is_running = analyzer.is_running()
    last_result = analyzer.get_last_analysis()
    
    return {
        "is_running": is_running,
        "last_analysis": {
            "files_analyzed": last_result.files_analyzed if last_result else 0,
            "patterns_found": last_result.patterns_found if last_result else 0,
            "languages": last_result.languages if last_result else {},
            "duration_seconds": last_result.duration_seconds if last_result else 0
        } if last_result else None
    }


@router.get("/patterns")
async def get_patterns(language: Optional[str] = None, limit: int = 20):
    """Get detected code patterns"""
    analyzer = get_analyzer()
    
    patterns = analyzer.get_patterns(language, limit)
    return {"patterns": patterns}


@router.get("/style")
async def get_coding_style():
    """Get detected coding style preferences"""
    analyzer = get_analyzer()
    
    style = analyzer.get_coding_style()
    if not style:
        return {"style": None, "message": "No style detected yet. Run analysis first."}
    
    return {"style": style}


# ============ PREFERENCES ============

@router.post("/preferences")
async def set_preference(request: PreferenceRequest):
    """Set a user preference"""
    memory = get_memory_store()
    
    try:
        memory.set_preference(request.key, request.value)
        return {"status": "saved", "key": request.key}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/preferences/{key}")
async def get_preference(key: str, default: Any = None):
    """Get a user preference"""
    memory = get_memory_store()
    
    value = memory.get_preference(key, default)
    return {"key": key, "value": value}


@router.get("/preferences")
async def get_all_preferences():
    """Get all user preferences"""
    memory = get_memory_store()
    
    return {"preferences": memory.get_all_preferences()}


# ============ STATS ============

@router.get("/stats")
async def get_brain_stats():
    """Get comprehensive brain statistics"""
    memory = get_memory_store()
    orchestrator = get_orchestrator()
    analyzer = get_analyzer()
    
    memory_stats = memory.get_stats()
    orchestrator_stats = orchestrator.get_stats()
    
    last_analysis = analyzer.get_last_analysis()
    
    return {
        "memory": memory_stats,
        "orchestrator": orchestrator_stats,
        "analyzer": {
            "is_running": analyzer.is_running(),
            "last_analysis": {
                "files": last_analysis.files_analyzed if last_analysis else 0,
                "patterns": last_analysis.patterns_found if last_analysis else 0
            }
        },
        "timestamp": datetime.now().isoformat()
    }

