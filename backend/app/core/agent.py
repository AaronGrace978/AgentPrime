import httpx
import json
from app.config import settings

class AgentPrime:
    def __init__(self, mirror_patterns=None):
        self.model = settings.OLLAMA_MODEL
        self.base_url = settings.OLLAMA_BASE_URL
        self.mirror_patterns = mirror_patterns or []  # Learned patterns from mirror system
    
    async def _call_ollama(self, prompt: str, max_tokens: int = 2048) -> str:
        headers = {"Content-Type": "application/json"}
        if settings.OLLAMA_API_KEY:
            headers["Authorization"] = f"Bearer {settings.OLLAMA_API_KEY}"
        
        timeout = 300.0 if "cloud" in self.model else 120.0
        
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(
                f"{self.base_url}/api/generate",
                headers=headers,
                json={
                    "model": self.model,
                    "prompt": prompt,
                    "stream": False,
                    "options": {"temperature": 0.3, "num_predict": max_tokens}
                }
            )
            response.raise_for_status()
            return response.json().get("response", "")
    
    async def chat(self, message: str, file_path: str = None, file_content: str = None, selection: str = None, mirror_context: dict = None) -> str:
        prompt = "You are AgentPrime, an expert AI coding assistant. Be helpful and provide complete code examples.\n\n"
        
        # Add mirror pattern context if available
        if mirror_context and mirror_context.get('patterns'):
            prompt += "--- Learned Patterns (from Opus 4.5 MAX) ---\n"
            for pattern in mirror_context['patterns'][:5]:  # Limit to top 5 patterns
                pattern_type = pattern.get('type', 'unknown')
                description = pattern.get('description', 'N/A')
                confidence = pattern.get('confidence', 0.5)
                prompt += f"\nPattern: {pattern_type}\n"
                prompt += f"Description: {description}\n"
                prompt += f"Confidence: {confidence:.2f}\n"
            prompt += "\nApply these patterns when appropriate.\n\n"
        
        if file_path:
            prompt += f"Current file: {file_path}\n"
        if selection:
            prompt += f"Selected code:\n```\n{selection}\n```\n\n"
        elif file_content:
            prompt += f"File content:\n```\n{file_content[:5000]}\n```\n\n"
        
        prompt += f"User: {message}\n\nAgentPrime:"
        return await self._call_ollama(prompt)
    
    async def quick_action(self, action: str, code: str, language: str = "code", mirror_context: dict = None) -> str:
        prompts = {
            "explain": f"Explain this {language} code:\n\n```\n{code}\n```",
            "fix": f"Find and fix bugs in this {language}. Show complete fixed code:\n\n```\n{code}\n```",
            "refactor": f"Refactor this {language} for better readability. Show complete code:\n\n```\n{code}\n```",
            "docs": f"Add documentation to this {language}. Show complete code:\n\n```\n{code}\n```"
        }
        
        prompt = "You are AgentPrime, an expert coding assistant.\n\n"
        
        # Add mirror pattern context if available
        if mirror_context and mirror_context.get('patterns'):
            prompt += "--- Learned Patterns (from Opus 4.5 MAX) ---\n"
            for pattern in mirror_context['patterns'][:3]:  # Limit to top 3 for quick actions
                pattern_type = pattern.get('type', 'unknown')
                description = pattern.get('description', 'N/A')
                prompt += f"\n• {pattern_type}: {description}\n"
            prompt += "\n"
        
        prompt += f"{prompts.get(action, prompts['explain'])}\n\nAgentPrime:"
        return await self._call_ollama(prompt)

agent = AgentPrime()

