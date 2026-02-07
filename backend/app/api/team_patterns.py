"""
AgentPrime - Team Patterns API
Backend API for team pattern sharing and aggregation
"""

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from datetime import datetime
import json

router = APIRouter(prefix="/api/team-patterns", tags=["team-patterns"])


class PatternRequest(BaseModel):
    pattern_id: str
    team_id: str
    user_id: str
    pattern_data: Dict[str, Any]
    visibility: str = "team"  # public, team, private
    version: int = 1


class PatternResponse(BaseModel):
    success: bool
    pattern_id: str
    message: str
    conflicts: List[Dict[str, Any]] = []


class TeamPatternsResponse(BaseModel):
    success: bool
    patterns: List[Dict[str, Any]]
    total: int
    contributors: int


class RecommendationRequest(BaseModel):
    team_id: str
    language: Optional[str] = None
    project_type: Optional[str] = None
    task: Optional[str] = None


class RecommendationResponse(BaseModel):
    success: bool
    recommendations: List[Dict[str, Any]]


# In-memory storage (would use database in production)
team_patterns_db: Dict[str, Dict[str, Any]] = {}
team_pattern_versions: Dict[str, List[Dict[str, Any]]] = {}


@router.post("/share", response_model=PatternResponse)
async def share_pattern(pattern: PatternRequest):
    """
    Share a pattern with the team
    """
    try:
        pattern_key = f"{pattern.team_id}:{pattern.pattern_id}"
        
        # Check for duplicates
        existing = team_patterns_db.get(pattern_key)
        
        if existing:
            # Merge patterns
            merged = merge_patterns(existing, pattern.pattern_data)
            team_patterns_db[pattern_key] = merged
            
            # Store version history
            if pattern_key not in team_pattern_versions:
                team_pattern_versions[pattern_key] = []
            team_pattern_versions[pattern_key].append({
                "version": existing.get("version", 1),
                "data": existing,
                "timestamp": existing.get("shared_at", 0)
            })
            
            return PatternResponse(
                success=True,
                pattern_id=pattern.pattern_id,
                message="Pattern merged with existing",
                conflicts=[{
                    "type": "duplicate",
                    "resolved": "merged"
                }]
            )
        else:
            # New pattern
            pattern_data = {
                **pattern.pattern_data,
                "team_id": pattern.team_id,
                "user_id": pattern.user_id,
                "visibility": pattern.visibility,
                "shared_at": int(datetime.now().timestamp() * 1000),
                "version": pattern.version,
                "team_usage_count": 0,
                "team_success_rate": 0.0
            }
            
            team_patterns_db[pattern_key] = pattern_data
            
            return PatternResponse(
                success=True,
                pattern_id=pattern.pattern_id,
                message="Pattern shared successfully"
            )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/team/{team_id}", response_model=TeamPatternsResponse)
async def get_team_patterns(
    team_id: str,
    language: Optional[str] = None,
    project_type: Optional[str] = None
):
    """
    Get all patterns for a team
    """
    try:
        patterns = []
        
        for key, pattern_data in team_patterns_db.items():
            if pattern_data.get("team_id") == team_id:
                # Filter by language/project type if provided
                if language and pattern_data.get("characteristics", {}).get("language") != language:
                    continue
                if project_type and pattern_data.get("characteristics", {}).get("project_type") != project_type:
                    continue
                
                patterns.append(pattern_data)
        
        # Get unique contributors
        contributors = set(p.get("user_id") for p in patterns)
        
        return TeamPatternsResponse(
            success=True,
            patterns=patterns,
            total=len(patterns),
            contributors=len(contributors)
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/recommendations", response_model=RecommendationResponse)
async def get_recommendations(request: RecommendationRequest):
    """
    Get recommended patterns for a context
    """
    try:
        patterns = []
        
        for key, pattern_data in team_patterns_db.items():
            if pattern_data.get("team_id") != request.team_id:
                continue
            
            # Filter by context
            characteristics = pattern_data.get("characteristics", {})
            if request.language and characteristics.get("language") != request.language:
                continue
            if request.project_type and characteristics.get("project_type") != request.project_type:
                continue
            
            # Calculate recommendation score
            success_rate = pattern_data.get("team_success_rate", 0)
            usage_count = pattern_data.get("team_usage_count", 0)
            confidence = pattern_data.get("confidence", 0.5)
            
            score = (success_rate * 0.4 + confidence * 0.3 + min(usage_count / 100, 1.0) * 0.3)
            
            patterns.append({
                **pattern_data,
                "recommendation_score": score
            })
        
        # Sort by score
        patterns.sort(key=lambda p: p.get("recommendation_score", 0), reverse=True)
        
        return RecommendationResponse(
            success=True,
            recommendations=patterns[:10]  # Top 10
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/usage")
async def record_usage(
    team_id: str,
    pattern_id: str,
    success: bool
):
    """
    Record pattern usage and success/failure
    """
    try:
        pattern_key = f"{team_id}:{pattern_id}"
        pattern = team_patterns_db.get(pattern_key)
        
        if not pattern:
            raise HTTPException(status_code=404, detail="Pattern not found")
        
        # Update usage stats
        pattern["team_usage_count"] = pattern.get("team_usage_count", 0) + 1
        
        if success:
            pattern["team_success_count"] = pattern.get("team_success_count", 0) + 1
        
        # Calculate success rate
        pattern["team_success_rate"] = pattern.get("team_success_count", 0) / pattern["team_usage_count"]
        
        return {"success": True, "message": "Usage recorded"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/versions/{team_id}/{pattern_id}")
async def get_pattern_versions(team_id: str, pattern_id: str):
    """
    Get version history for a pattern
    """
    try:
        pattern_key = f"{team_id}:{pattern_id}"
        current = team_patterns_db.get(pattern_key)
        versions = team_pattern_versions.get(pattern_key, [])
        
        if not current:
            raise HTTPException(status_code=404, detail="Pattern not found")
        
        # Include current version
        all_versions = [{
            "version": current.get("version", 1),
            "data": current,
            "timestamp": current.get("shared_at", 0),
            "current": True
        }]
        
        # Add previous versions
        for version_data in versions:
            all_versions.append({
                **version_data,
                "current": False
            })
        
        # Sort by version
        all_versions.sort(key=lambda v: v.get("version", 0), reverse=True)
        
        return {
            "success": True,
            "versions": all_versions
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/rollback")
async def rollback_pattern(
    team_id: str,
    pattern_id: str,
    version: int,
    user_id: str
):
    """
    Rollback to a previous pattern version
    """
    try:
        pattern_key = f"{team_id}:{pattern_id}"
        versions = team_pattern_versions.get(pattern_key, [])
        
        target_version = next((v for v in versions if v.get("version") == version), None)
        
        if not target_version:
            raise HTTPException(status_code=404, detail="Version not found")
        
        # Get current pattern
        current = team_patterns_db.get(pattern_key)
        if current:
            # Save current as previous version
            if pattern_key not in team_pattern_versions:
                team_pattern_versions[pattern_key] = []
            team_pattern_versions[pattern_key].append({
                "version": current.get("version", 1),
                "data": current,
                "timestamp": current.get("shared_at", 0)
            })
        
        # Restore target version
        restored = {
            **target_version["data"],
            "version": current.get("version", 1) + 1 if current else version + 1,
            "shared_at": int(datetime.now().timestamp() * 1000),
            "user_id": user_id
        }
        
        team_patterns_db[pattern_key] = restored
        
        return {
            "success": True,
            "message": f"Rolled back to version {version}",
            "pattern": restored
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


def merge_patterns(existing: Dict[str, Any], new_data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Merge two patterns intelligently
    """
    merged = {**existing}
    
    # Merge characteristics
    existing_chars = existing.get("characteristics", {})
    new_chars = new_data.get("characteristics", {})
    merged["characteristics"] = {**existing_chars, **new_chars}
    
    # Merge examples (deduplicate)
    existing_examples = existing.get("examples", [])
    new_examples = new_data.get("examples", [])
    merged["examples"] = list(set(existing_examples + new_examples))
    
    # Use higher confidence
    merged["confidence"] = max(
        existing.get("confidence", 0),
        new_data.get("confidence", 0)
    )
    
    # Increment version
    merged["version"] = existing.get("version", 1) + 1
    
    return merged

