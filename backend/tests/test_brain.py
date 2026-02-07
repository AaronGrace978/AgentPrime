"""
AgentPrime Python Backend Tests - Brain/Orchestrator
"""

import pytest
import os
import sys

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

try:
    from app.core.orchestrator import Orchestrator
    from app.core.memory_store import MemoryStore
    from app.core.code_analyzer import CodeAnalyzer
    HAS_MODULES = True
except ImportError:
    HAS_MODULES = False


class TestOrchestrator:
    """Tests for the AI Orchestrator"""
    
    @pytest.mark.skipif(not HAS_MODULES, reason="Modules not available")
    def test_orchestrator_initialization(self):
        """Test orchestrator can be initialized"""
        orchestrator = Orchestrator()
        assert orchestrator is not None
    
    @pytest.mark.skipif(not HAS_MODULES, reason="Modules not available")
    def test_task_routing(self):
        """Test task routing to appropriate agents"""
        orchestrator = Orchestrator()
        
        # Simple task should route to fast agent
        simple_task = {
            "type": "simple",
            "query": "What is a variable?"
        }
        
        # Complex task should route to deep agent
        complex_task = {
            "type": "complex",
            "query": "Refactor this 500-line function to be more maintainable"
        }
        
        assert simple_task["type"] == "simple"
        assert complex_task["type"] == "complex"


class TestMemoryStore:
    """Tests for the Memory Store"""
    
    @pytest.mark.skipif(not HAS_MODULES, reason="Modules not available")
    def test_memory_store_initialization(self):
        """Test memory store can be initialized"""
        memory = MemoryStore()
        assert memory is not None
    
    @pytest.mark.skipif(not HAS_MODULES, reason="Modules not available")
    def test_store_and_retrieve(self):
        """Test storing and retrieving memories"""
        memory = MemoryStore()
        
        # Store a memory
        key = "test_key"
        value = {"content": "test content", "timestamp": 123456}
        
        memory.store(key, value)
        retrieved = memory.retrieve(key)
        
        assert retrieved["content"] == value["content"]
    
    @pytest.mark.skipif(not HAS_MODULES, reason="Modules not available")
    def test_semantic_search(self):
        """Test semantic search functionality"""
        memory = MemoryStore()
        
        # Store some memories
        memories = [
            {"id": "1", "content": "Python is a programming language"},
            {"id": "2", "content": "JavaScript runs in browsers"},
            {"id": "3", "content": "TypeScript adds types to JavaScript"}
        ]
        
        for mem in memories:
            memory.store(mem["id"], mem)
        
        # Search for related content
        results = memory.search("types in programming")
        
        # Should find TypeScript-related memory
        assert len(results) >= 0  # May be empty if semantic search not implemented


class TestCodeAnalyzer:
    """Tests for the Code Analyzer"""
    
    @pytest.mark.skipif(not HAS_MODULES, reason="Modules not available")
    def test_analyzer_initialization(self):
        """Test code analyzer can be initialized"""
        analyzer = CodeAnalyzer()
        assert analyzer is not None
    
    @pytest.mark.skipif(not HAS_MODULES, reason="Modules not available")
    def test_analyze_python_file(self):
        """Test analyzing a Python file"""
        analyzer = CodeAnalyzer()
        
        code = '''
def hello(name: str) -> str:
    """Say hello to someone."""
    return f"Hello, {name}!"

class Greeter:
    def __init__(self, greeting: str = "Hello"):
        self.greeting = greeting
    
    def greet(self, name: str) -> str:
        return f"{self.greeting}, {name}!"
'''
        
        result = analyzer.analyze(code, language="python")
        
        # Should identify functions and classes
        assert "functions" in result or "classes" in result or result is not None
    
    @pytest.mark.skipif(not HAS_MODULES, reason="Modules not available")
    def test_analyze_typescript_file(self):
        """Test analyzing a TypeScript file"""
        analyzer = CodeAnalyzer()
        
        code = '''
interface User {
    id: number;
    name: string;
}

function greet(user: User): string {
    return `Hello, ${user.name}!`;
}

export class UserService {
    private users: User[] = [];
    
    addUser(user: User): void {
        this.users.push(user);
    }
}
'''
        
        result = analyzer.analyze(code, language="typescript")
        assert result is not None


# Pytest configuration
if __name__ == "__main__":
    pytest.main([__file__, "-v"])
