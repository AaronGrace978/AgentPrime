"""
AgentPrime Orchestrator
The brain that decides which model/agent to invoke and how to route tasks

Features:
- Task complexity analysis
- Model selection based on task type
- Agent routing (electron agent vs python agent)
- Learning from past decisions
"""

import re
from typing import Optional, Dict, Any, List, Tuple
from dataclasses import dataclass
from enum import Enum
from datetime import datetime

from .memory import get_memory_store, Memory


class TaskType(Enum):
    """Types of tasks the orchestrator can route"""
    SIMPLE_CHAT = "simple_chat"           # Quick questions, greetings
    CODE_GENERATION = "code_generation"   # Writing new code
    CODE_ANALYSIS = "code_analysis"       # Understanding/explaining code
    CODE_REFACTOR = "code_refactor"       # Improving existing code
    DEBUGGING = "debugging"               # Finding and fixing bugs
    ARCHITECTURE = "architecture"         # Design decisions
    FILE_OPERATIONS = "file_operations"   # Reading/writing files
    TERMINAL_OPS = "terminal_ops"         # Running commands
    COMPLEX_TASK = "complex_task"         # Multi-step autonomous tasks


class ModelTier(Enum):
    """Model capability tiers"""
    FAST = "fast"       # Quick, simple tasks
    STANDARD = "standard"  # General purpose
    DEEP = "deep"       # Complex reasoning
    SPECIALIST = "specialist"  # Domain-specific


class AgentType(Enum):
    """Types of agents available"""
    PYTHON_CHAT = "python_chat"       # Simple Python chat (this backend)
    ELECTRON_CHAT = "electron_chat"   # Electron app chat
    ELECTRON_AGENT = "electron_agent" # Autonomous Electron agent
    BACKGROUND = "background"         # Background analysis


@dataclass
class RoutingDecision:
    """Result of orchestrator routing decision"""
    task_type: TaskType
    model_tier: ModelTier
    agent_type: AgentType
    suggested_model: str
    complexity_score: float  # 1-10
    reasoning: str
    context_needed: List[str]  # What context to include
    estimated_steps: int
    confidence: float


class Orchestrator:
    """
    The brain of AgentPrime - routes tasks to appropriate agents and models
    """
    
    # Keyword patterns for task classification
    TASK_PATTERNS = {
        TaskType.SIMPLE_CHAT: [
            r'\b(hi|hello|hey|thanks|thank you|bye|goodbye)\b',
            r'^(what is|who is|where is|when is)\b',
            r'\b(how are you|what\'s up)\b',
        ],
        TaskType.CODE_GENERATION: [
            r'\b(create|build|make|write|generate|implement|add)\b.*\b(code|function|class|module|api|app|component)\b',
            r'\b(create|build|make)\b.*\b(project|application|website|game)\b',
        ],
        TaskType.CODE_ANALYSIS: [
            r'\b(explain|understand|analyze|what does|how does|why does)\b',
            r'\b(review|check|look at)\b.*\b(code|function|class)\b',
        ],
        TaskType.CODE_REFACTOR: [
            r'\b(refactor|improve|optimize|clean up|simplify)\b',
            r'\b(make.*better|more efficient|more readable)\b',
        ],
        TaskType.DEBUGGING: [
            r'\b(fix|debug|error|bug|issue|problem|broken|not working|fails)\b',
            r'\b(why.*not|doesn\'t work|crashed|exception)\b',
        ],
        TaskType.ARCHITECTURE: [
            r'\b(design|architect|structure|organize|plan)\b',
            r'\b(best practice|pattern|approach)\b',
            r'\b(should i|how should|what\'s the best way)\b',
        ],
        TaskType.FILE_OPERATIONS: [
            r'\b(read|write|create|delete|move|copy)\b.*\b(file|folder|directory)\b',
            r'\b(save|load|open)\b.*\b(file)\b',
        ],
        TaskType.TERMINAL_OPS: [
            r'\b(run|execute|start|stop|install|npm|pip|git)\b',
            r'\b(terminal|command|shell|bash|powershell)\b',
        ],
        TaskType.COMPLEX_TASK: [
            r'\b(build|create|implement)\b.*\b(full|complete|entire|whole)\b',
            r'\b(with|including|and also|plus)\b.*\b(tests|documentation|api)\b',
            r'\b(step by step|from scratch|end to end)\b',
        ],
    }
    
    # Complexity indicators
    COMPLEXITY_INDICATORS = {
        'high': [
            r'\b(complex|advanced|sophisticated|comprehensive)\b',
            r'\b(multiple|several|many)\b.*\b(files|components|features)\b',
            r'\b(architecture|design pattern|algorithm)\b',
            r'\b(security|performance|scalability)\b',
            r'\b(full stack|end to end|complete system)\b',
        ],
        'medium': [
            r'\b(add|modify|update|change)\b',
            r'\b(function|class|component|module)\b',
            r'\b(with|including)\b',
        ],
        'low': [
            r'\b(simple|basic|quick|small|tiny)\b',
            r'\b(just|only|single|one)\b',
            r'\b(fix typo|rename|format)\b',
        ]
    }
    
    # Model recommendations by tier
    MODEL_RECOMMENDATIONS = {
        ModelTier.FAST: [
            "devstral-small-2:24b-cloud",
            "qwen2.5-coder:7b",
            "gpt-4o-mini",
            "claude-3-haiku-20240307",
        ],
        ModelTier.STANDARD: [
            "qwen3-coder:480b-cloud",
            "glm-4.6:cloud",
            "gpt-4o",
            "claude-3-5-sonnet-20241022",
        ],
        ModelTier.DEEP: [
            "deepseek-v3.1:671b-cloud",
            "mistral-large-3:675b-cloud",
            "claude-sonnet-4-20250514",
            "gpt-4o",
        ],
        ModelTier.SPECIALIST: [
            "qwen3-coder:480b-cloud",  # Code specialist
            "deepseek-v3.1:671b-cloud",  # Reasoning specialist
        ],
    }
    
    def __init__(self):
        self.memory = get_memory_store()
        self._decision_history: List[Dict] = []
    
    def analyze_task(self, message: str, context: Dict[str, Any] = None) -> RoutingDecision:
        """
        Analyze a task and decide how to route it
        
        Args:
            message: The user's message/task
            context: Optional context (current file, workspace, etc.)
        
        Returns:
            RoutingDecision with all routing information
        """
        message_lower = message.lower()
        context = context or {}
        
        # Step 1: Classify task type
        task_type = self._classify_task(message_lower)
        
        # Step 2: Analyze complexity
        complexity_score = self._analyze_complexity(message_lower, context)
        
        # Step 3: Determine model tier
        model_tier = self._select_model_tier(task_type, complexity_score)
        
        # Step 4: Select agent type
        agent_type = self._select_agent(task_type, complexity_score, context)
        
        # Step 5: Get suggested model
        suggested_model = self._get_best_model(model_tier, task_type)
        
        # Step 6: Determine context needs
        context_needed = self._determine_context_needs(task_type, message_lower)
        
        # Step 7: Estimate steps
        estimated_steps = self._estimate_steps(task_type, complexity_score)
        
        # Build reasoning
        reasoning = self._build_reasoning(task_type, complexity_score, model_tier, agent_type)
        
        decision = RoutingDecision(
            task_type=task_type,
            model_tier=model_tier,
            agent_type=agent_type,
            suggested_model=suggested_model,
            complexity_score=complexity_score,
            reasoning=reasoning,
            context_needed=context_needed,
            estimated_steps=estimated_steps,
            confidence=self._calculate_confidence(message_lower, task_type)
        )
        
        # Store decision for learning
        self._record_decision(message, decision)
        
        return decision
    
    def _classify_task(self, message: str) -> TaskType:
        """Classify the task type based on message content"""
        scores = {}
        
        for task_type, patterns in self.TASK_PATTERNS.items():
            score = 0
            for pattern in patterns:
                if re.search(pattern, message, re.IGNORECASE):
                    score += 1
            scores[task_type] = score
        
        # Get highest scoring task type
        if not any(scores.values()):
            return TaskType.SIMPLE_CHAT
        
        best_type = max(scores, key=scores.get)
        
        # Special handling: if complex indicators present, upgrade to complex
        for pattern in self.COMPLEXITY_INDICATORS['high']:
            if re.search(pattern, message, re.IGNORECASE):
                if best_type in [TaskType.CODE_GENERATION, TaskType.CODE_REFACTOR]:
                    return TaskType.COMPLEX_TASK
        
        return best_type
    
    def _analyze_complexity(self, message: str, context: Dict) -> float:
        """Analyze task complexity on a 1-10 scale"""
        score = 5.0  # Base score
        
        # Check complexity indicators
        for pattern in self.COMPLEXITY_INDICATORS['high']:
            if re.search(pattern, message, re.IGNORECASE):
                score += 1.5
        
        for pattern in self.COMPLEXITY_INDICATORS['medium']:
            if re.search(pattern, message, re.IGNORECASE):
                score += 0.5
        
        for pattern in self.COMPLEXITY_INDICATORS['low']:
            if re.search(pattern, message, re.IGNORECASE):
                score -= 1.5
        
        # Adjust based on message length
        if len(message) > 500:
            score += 1
        elif len(message) < 50:
            score -= 1
        
        # Adjust based on context
        if context.get('file_content'):
            lines = context['file_content'].count('\n')
            if lines > 500:
                score += 1.5
            elif lines > 200:
                score += 0.5
        
        if context.get('has_errors'):
            score += 1
        
        if context.get('multiple_files'):
            score += 1.5
        
        # Clamp to 1-10
        return max(1, min(10, score))
    
    def _select_model_tier(self, task_type: TaskType, complexity: float) -> ModelTier:
        """Select the appropriate model tier"""
        if task_type == TaskType.SIMPLE_CHAT:
            return ModelTier.FAST
        
        if task_type in [TaskType.COMPLEX_TASK, TaskType.ARCHITECTURE]:
            return ModelTier.DEEP
        
        if task_type == TaskType.DEBUGGING:
            return ModelTier.DEEP if complexity > 7 else ModelTier.STANDARD
        
        if task_type in [TaskType.CODE_GENERATION, TaskType.CODE_REFACTOR]:
            if complexity >= 8:
                return ModelTier.DEEP
            elif complexity >= 5:
                return ModelTier.STANDARD
            else:
                return ModelTier.FAST
        
        # Default based on complexity
        if complexity >= 7:
            return ModelTier.DEEP
        elif complexity >= 4:
            return ModelTier.STANDARD
        else:
            return ModelTier.FAST
    
    def _select_agent(self, task_type: TaskType, complexity: float, 
                     context: Dict) -> AgentType:
        """Select which agent should handle the task"""
        # File/terminal operations need Electron agent
        if task_type in [TaskType.FILE_OPERATIONS, TaskType.TERMINAL_OPS]:
            return AgentType.ELECTRON_AGENT
        
        # Complex tasks need autonomous agent
        if task_type == TaskType.COMPLEX_TASK:
            return AgentType.ELECTRON_AGENT
        
        # Simple chat can be handled by Python
        if task_type == TaskType.SIMPLE_CHAT and complexity < 4:
            return AgentType.PYTHON_CHAT
        
        # Code generation with file writes needs Electron
        if task_type == TaskType.CODE_GENERATION:
            if context.get('workspace_path'):
                return AgentType.ELECTRON_AGENT
            return AgentType.ELECTRON_CHAT
        
        # Default to Electron chat for most coding tasks
        return AgentType.ELECTRON_CHAT
    
    def _get_best_model(self, tier: ModelTier, task_type: TaskType) -> str:
        """Get the best model for the tier, considering past performance"""
        models = self.MODEL_RECOMMENDATIONS.get(tier, 
                 self.MODEL_RECOMMENDATIONS[ModelTier.STANDARD])
        
        # Check memory for past performance
        memories = self.memory.search(
            f"model performance {task_type.value}",
            type="pattern",
            limit=5
        )
        
        # If we have good performance data, use it
        for result in memories:
            if result.memory.success_rate > 0.7:
                model_in_memory = result.memory.metadata.get('model')
                if model_in_memory in models:
                    return model_in_memory
        
        # Default to first recommendation
        return models[0] if models else "qwen3-coder:480b-cloud"
    
    def _determine_context_needs(self, task_type: TaskType, message: str) -> List[str]:
        """Determine what context is needed for this task"""
        needs = []
        
        if task_type in [TaskType.CODE_ANALYSIS, TaskType.CODE_REFACTOR, 
                        TaskType.DEBUGGING]:
            needs.append('current_file')
        
        if task_type in [TaskType.CODE_GENERATION, TaskType.ARCHITECTURE]:
            needs.append('project_structure')
        
        if task_type == TaskType.DEBUGGING:
            needs.append('error_output')
            needs.append('stack_trace')
        
        if task_type == TaskType.COMPLEX_TASK:
            needs.append('current_file')
            needs.append('project_structure')
            needs.append('dependencies')
        
        # Check for specific mentions
        if re.search(r'\b(test|testing|spec)\b', message):
            needs.append('test_files')
        
        if re.search(r'\b(style|css|design)\b', message):
            needs.append('style_files')
        
        return list(set(needs))
    
    def _estimate_steps(self, task_type: TaskType, complexity: float) -> int:
        """Estimate number of steps to complete task"""
        base_steps = {
            TaskType.SIMPLE_CHAT: 1,
            TaskType.CODE_ANALYSIS: 2,
            TaskType.CODE_GENERATION: 3,
            TaskType.CODE_REFACTOR: 3,
            TaskType.DEBUGGING: 4,
            TaskType.FILE_OPERATIONS: 2,
            TaskType.TERMINAL_OPS: 2,
            TaskType.ARCHITECTURE: 5,
            TaskType.COMPLEX_TASK: 8,
        }
        
        base = base_steps.get(task_type, 3)
        
        # Adjust by complexity
        multiplier = 1 + (complexity - 5) * 0.2
        
        return max(1, int(base * multiplier))
    
    def _build_reasoning(self, task_type: TaskType, complexity: float,
                        model_tier: ModelTier, agent_type: AgentType) -> str:
        """Build a human-readable reasoning for the decision"""
        reasons = []
        
        reasons.append(f"Task classified as: {task_type.value}")
        reasons.append(f"Complexity score: {complexity:.1f}/10")
        reasons.append(f"Selected {model_tier.value} tier model")
        reasons.append(f"Routing to: {agent_type.value}")
        
        if task_type == TaskType.COMPLEX_TASK:
            reasons.append("Multi-step autonomous execution recommended")
        
        if model_tier == ModelTier.DEEP:
            reasons.append("Using deep reasoning model for thorough analysis")
        
        return " | ".join(reasons)
    
    def _calculate_confidence(self, message: str, task_type: TaskType) -> float:
        """Calculate confidence in the routing decision"""
        confidence = 0.7  # Base confidence
        
        # Boost if clear task indicators present
        patterns = self.TASK_PATTERNS.get(task_type, [])
        matches = sum(1 for p in patterns if re.search(p, message, re.IGNORECASE))
        
        if matches >= 2:
            confidence += 0.2
        elif matches >= 1:
            confidence += 0.1
        
        # Check past similar decisions
        memories = self.memory.search(message, type="routing_decision", limit=3)
        if memories and memories[0].score > 0.7:
            past_success = memories[0].memory.success_rate
            confidence = confidence * 0.7 + past_success * 0.3
        
        return min(0.99, confidence)
    
    def _record_decision(self, message: str, decision: RoutingDecision):
        """Record the routing decision for learning"""
        self.memory.store(
            type="routing_decision",
            content=message[:200],  # Truncate for storage
            metadata={
                'task_type': decision.task_type.value,
                'model_tier': decision.model_tier.value,
                'agent_type': decision.agent_type.value,
                'suggested_model': decision.suggested_model,
                'complexity': decision.complexity_score,
                'confidence': decision.confidence,
                'timestamp': datetime.now().isoformat()
            }
        )
        
        self._decision_history.append({
            'message': message[:100],
            'decision': decision,
            'timestamp': datetime.now()
        })
        
        # Keep only recent history in memory
        if len(self._decision_history) > 100:
            self._decision_history = self._decision_history[-100:]
    
    def record_outcome(self, message: str, success: bool, 
                      actual_model: str = None, actual_steps: int = None):
        """Record the outcome of a task for learning"""
        # Update success rate of related memories
        memories = self.memory.search(message[:200], type="routing_decision", limit=1)
        
        if memories:
            self.memory.update_success_rate(memories[0].memory.id, success)
        
        # Store as pattern
        self.memory.store(
            type="pattern",
            content=f"Task outcome: {message[:100]}",
            metadata={
                'success': success,
                'model': actual_model,
                'steps': actual_steps,
                'timestamp': datetime.now().isoformat()
            }
        )
    
    def get_stats(self) -> Dict[str, Any]:
        """Get orchestrator statistics"""
        return {
            'decisions_in_session': len(self._decision_history),
            'memory_stats': self.memory.get_stats()
        }


# Singleton instance
_orchestrator: Optional[Orchestrator] = None

def get_orchestrator() -> Orchestrator:
    """Get the singleton orchestrator instance"""
    global _orchestrator
    if _orchestrator is None:
        _orchestrator = Orchestrator()
    return _orchestrator

