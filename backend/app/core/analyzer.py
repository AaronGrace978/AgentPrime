"""
AgentPrime Background Code Analyzer
Runs background analysis on workspace to detect patterns and learn coding style

Features:
- Automatic code pattern detection
- Language-specific analysis
- Coding style detection
- Dependency tracking
- Anti-pattern detection
"""

import os
import re
import asyncio
import threading
from pathlib import Path
from typing import Dict, List, Any, Optional, Set
from dataclasses import dataclass
from datetime import datetime
from collections import Counter
import json

from .memory import get_memory_store


@dataclass
class CodePattern:
    """A detected code pattern"""
    pattern_type: str
    description: str
    code_snippet: str
    file_path: str
    language: str
    confidence: float
    frequency: int = 1


@dataclass
class CodingStyle:
    """Detected coding style preferences"""
    indentation: str  # 'tabs' or 'spaces'
    indent_size: int
    quote_style: str  # 'single' or 'double'
    semicolons: bool
    trailing_commas: bool
    max_line_length: int
    naming_convention: str  # 'camelCase', 'snake_case', 'PascalCase'


@dataclass
class AnalysisResult:
    """Result of workspace analysis"""
    files_analyzed: int
    patterns_found: int
    languages: Dict[str, int]
    coding_style: Optional[CodingStyle]
    anti_patterns: List[str]
    suggestions: List[str]
    duration_seconds: float


class BackgroundAnalyzer:
    """
    Analyzes code in the background to learn patterns and preferences
    """
    
    # File extensions to analyze
    SUPPORTED_EXTENSIONS = {
        '.py': 'python',
        '.js': 'javascript',
        '.jsx': 'javascript',
        '.ts': 'typescript',
        '.tsx': 'typescript',
        '.java': 'java',
        '.go': 'go',
        '.rs': 'rust',
        '.rb': 'ruby',
        '.php': 'php',
        '.cs': 'csharp',
        '.cpp': 'cpp',
        '.c': 'c',
        '.h': 'c',
        '.hpp': 'cpp',
        '.swift': 'swift',
        '.kt': 'kotlin',
        '.scala': 'scala',
        '.vue': 'vue',
        '.svelte': 'svelte',
    }
    
    # Directories to skip
    SKIP_DIRS = {
        'node_modules', 'venv', '.venv', 'env', '.env',
        '__pycache__', '.git', '.svn', '.hg',
        'dist', 'build', 'target', 'out',
        '.next', '.nuxt', '.cache',
        'vendor', 'packages', '.idea', '.vscode'
    }
    
    # Pattern detectors by language
    PATTERN_DETECTORS = {
        'javascript': {
            'async_function': r'async\s+function\s+(\w+)',
            'arrow_function': r'(?:const|let|var)\s+(\w+)\s*=\s*(?:\([^)]*\)|[^=])\s*=>',
            'class_definition': r'class\s+(\w+)(?:\s+extends\s+(\w+))?',
            'react_component': r'(?:function|const)\s+(\w+).*(?:return|=>)\s*(?:\(?\s*<)',
            'usestate_hook': r'useState\s*\(',
            'useeffect_hook': r'useEffect\s*\(',
            'fetch_call': r'fetch\s*\(',
            'axios_call': r'axios\.\w+\s*\(',
            'express_route': r'app\.(?:get|post|put|delete|patch)\s*\(',
            'try_catch': r'try\s*\{',
            'console_log': r'console\.log\s*\(',
        },
        'typescript': {
            'interface_definition': r'interface\s+(\w+)',
            'type_definition': r'type\s+(\w+)\s*=',
            'generic_type': r'<\s*\w+(?:\s*,\s*\w+)*\s*>',
            'async_function': r'async\s+function\s+(\w+)',
            'class_definition': r'class\s+(\w+)(?:\s+extends\s+(\w+))?',
            'decorator': r'@\w+\s*(?:\([^)]*\))?',
        },
        'python': {
            'class_definition': r'class\s+(\w+)(?:\([^)]*\))?:',
            'function_definition': r'def\s+(\w+)\s*\(',
            'async_function': r'async\s+def\s+(\w+)',
            'decorator': r'@\w+(?:\([^)]*\))?',
            'list_comprehension': r'\[\s*\w+\s+for\s+\w+\s+in\s+',
            'dict_comprehension': r'\{\s*\w+:\s*\w+\s+for\s+\w+\s+in\s+',
            'context_manager': r'with\s+\w+(?:\([^)]*\))?\s+as\s+',
            'try_except': r'try\s*:',
            'import_statement': r'^(?:from\s+\w+\s+)?import\s+',
            'type_hint': r'->\s*(?:\w+|\[)',
            'dataclass': r'@dataclass',
            'pydantic_model': r'class\s+\w+\s*\(\s*BaseModel\s*\)',
        }
    }
    
    # Anti-patterns to detect
    ANTI_PATTERNS = {
        'javascript': {
            'var_usage': (r'\bvar\s+', 'Use let/const instead of var'),
            'callback_hell': (r'function\s*\([^)]*\)\s*\{[^}]*function\s*\([^)]*\)\s*\{', 
                            'Nested callbacks detected - consider async/await'),
            'magic_numbers': (r'(?<!=\s)\b\d{3,}\b(?!\s*[;,\)\]])', 
                             'Magic numbers - consider using named constants'),
            'empty_catch': (r'catch\s*\([^)]*\)\s*\{\s*\}', 
                           'Empty catch block - handle or log errors'),
        },
        'python': {
            'bare_except': (r'except\s*:', 'Bare except - specify exception type'),
            'mutable_default': (r'def\s+\w+\s*\([^)]*=\s*(?:\[\]|\{\}|\(\))', 
                               'Mutable default argument'),
            'global_usage': (r'global\s+\w+', 'Global keyword usage - consider refactoring'),
            'star_import': (r'from\s+\w+\s+import\s+\*', 'Star import - import specific names'),
        },
        'typescript': {
            'any_type': (r':\s*any\b', 'Using any type - consider specific type'),
            'ts_ignore': (r'@ts-ignore', 'Using ts-ignore - fix the type issue instead'),
        }
    }
    
    def __init__(self):
        self.memory = get_memory_store()
        self._running = False
        self._thread: Optional[threading.Thread] = None
        self._last_analysis: Optional[AnalysisResult] = None
        self._analyzed_files: Set[str] = set()
        
    def start_background_analysis(self, workspace_path: str, callback=None):
        """Start background analysis in a separate thread"""
        if self._running:
            print("[Analyzer] Analysis already running")
            return
        
        self._running = True
        self._thread = threading.Thread(
            target=self._run_analysis,
            args=(workspace_path, callback),
            daemon=True
        )
        self._thread.start()
        print(f"[Analyzer] Started background analysis of {workspace_path}")
    
    def stop_analysis(self):
        """Stop the background analysis"""
        self._running = False
        if self._thread:
            self._thread.join(timeout=5)
        print("[Analyzer] Stopped background analysis")
    
    def _run_analysis(self, workspace_path: str, callback=None):
        """Run the analysis (called in background thread)"""
        start_time = datetime.now()
        
        try:
            result = self.analyze_workspace(workspace_path)
            self._last_analysis = result
            
            if callback:
                callback(result)
                
            print(f"[Analyzer] Completed: {result.files_analyzed} files, "
                  f"{result.patterns_found} patterns in {result.duration_seconds:.2f}s")
            
        except Exception as e:
            print(f"[Analyzer] Error during analysis: {e}")
        finally:
            self._running = False
    
    def analyze_workspace(self, workspace_path: str) -> AnalysisResult:
        """Analyze a workspace directory"""
        start_time = datetime.now()
        workspace = Path(workspace_path)
        
        if not workspace.exists():
            return AnalysisResult(
                files_analyzed=0,
                patterns_found=0,
                languages={},
                coding_style=None,
                anti_patterns=[],
                suggestions=[],
                duration_seconds=0
            )
        
        files_analyzed = 0
        patterns_found = 0
        languages: Counter = Counter()
        all_patterns: List[CodePattern] = []
        all_anti_patterns: List[str] = []
        style_samples: Dict[str, List] = {
            'indent': [], 'quotes': [], 'semicolons': [], 'line_lengths': []
        }
        
        # Walk the directory
        for root, dirs, files in os.walk(workspace_path):
            # Skip excluded directories
            dirs[:] = [d for d in dirs if d not in self.SKIP_DIRS]
            
            for file in files:
                if not self._running:
                    break
                    
                ext = os.path.splitext(file)[1].lower()
                if ext not in self.SUPPORTED_EXTENSIONS:
                    continue
                
                file_path = os.path.join(root, file)
                language = self.SUPPORTED_EXTENSIONS[ext]
                
                try:
                    with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                        content = f.read()
                    
                    # Analyze file
                    file_patterns = self._analyze_file(content, file_path, language)
                    all_patterns.extend(file_patterns)
                    patterns_found += len(file_patterns)
                    
                    # Detect anti-patterns
                    file_anti_patterns = self._detect_anti_patterns(content, language)
                    all_anti_patterns.extend(file_anti_patterns)
                    
                    # Collect style samples
                    self._collect_style_samples(content, style_samples)
                    
                    files_analyzed += 1
                    languages[language] += 1
                    self._analyzed_files.add(file_path)
                    
                except Exception as e:
                    print(f"[Analyzer] Error reading {file_path}: {e}")
        
        # Store patterns in memory
        for pattern in all_patterns[:100]:  # Limit stored patterns
            self.memory.store_code_pattern(
                pattern_type=pattern.pattern_type,
                code_snippet=pattern.code_snippet[:500],
                description=pattern.description,
                file_path=pattern.file_path,
                language=pattern.language
            )
        
        # Analyze coding style
        coding_style = self._analyze_style(style_samples)
        if coding_style:
            self.memory.set_preference('coding_style', {
                'indentation': coding_style.indentation,
                'indent_size': coding_style.indent_size,
                'quote_style': coding_style.quote_style,
                'semicolons': coding_style.semicolons,
                'naming_convention': coding_style.naming_convention
            })
        
        # Generate suggestions
        suggestions = self._generate_suggestions(all_patterns, all_anti_patterns, dict(languages))
        
        duration = (datetime.now() - start_time).total_seconds()
        
        return AnalysisResult(
            files_analyzed=files_analyzed,
            patterns_found=patterns_found,
            languages=dict(languages),
            coding_style=coding_style,
            anti_patterns=list(set(all_anti_patterns))[:20],  # Unique, limited
            suggestions=suggestions,
            duration_seconds=duration
        )
    
    def _analyze_file(self, content: str, file_path: str, 
                     language: str) -> List[CodePattern]:
        """Analyze a single file for patterns"""
        patterns = []
        detectors = self.PATTERN_DETECTORS.get(language, {})
        
        for pattern_type, regex in detectors.items():
            matches = re.findall(regex, content, re.MULTILINE)
            if matches:
                # Get a sample of the pattern
                match = re.search(regex, content, re.MULTILINE)
                if match:
                    start = max(0, match.start() - 20)
                    end = min(len(content), match.end() + 50)
                    snippet = content[start:end].strip()
                    
                    patterns.append(CodePattern(
                        pattern_type=pattern_type,
                        description=f"Found {len(matches)} {pattern_type} patterns",
                        code_snippet=snippet,
                        file_path=file_path,
                        language=language,
                        confidence=min(1.0, len(matches) / 5),
                        frequency=len(matches)
                    ))
        
        return patterns
    
    def _detect_anti_patterns(self, content: str, language: str) -> List[str]:
        """Detect anti-patterns in code"""
        anti_patterns = []
        detectors = self.ANTI_PATTERNS.get(language, {})
        
        for name, (regex, message) in detectors.items():
            if re.search(regex, content, re.MULTILINE):
                anti_patterns.append(f"{name}: {message}")
        
        return anti_patterns
    
    def _collect_style_samples(self, content: str, samples: Dict):
        """Collect coding style samples from content"""
        lines = content.split('\n')
        
        for line in lines[:200]:  # Sample first 200 lines
            # Check indentation
            if line.startswith('\t'):
                samples['indent'].append('tabs')
            elif line.startswith('    '):
                samples['indent'].append('spaces_4')
            elif line.startswith('  ') and not line.startswith('   '):
                samples['indent'].append('spaces_2')
            
            # Check quotes
            if "'" in line and '"' not in line:
                samples['quotes'].append('single')
            elif '"' in line and "'" not in line:
                samples['quotes'].append('double')
            
            # Check semicolons (for JS/TS)
            stripped = line.rstrip()
            if stripped.endswith(';') and not stripped.endswith(';;'):
                samples['semicolons'].append(True)
            elif stripped and not stripped.endswith(('{', '}', ':', ',')):
                samples['semicolons'].append(False)
            
            # Line length
            if len(line) > 10:
                samples['line_lengths'].append(len(line))
    
    def _analyze_style(self, samples: Dict) -> Optional[CodingStyle]:
        """Analyze collected style samples to determine coding style"""
        if not any(samples.values()):
            return None
        
        # Determine indentation
        indent_counter = Counter(samples['indent'])
        if indent_counter:
            most_common = indent_counter.most_common(1)[0][0]
            if most_common == 'tabs':
                indentation, indent_size = 'tabs', 1
            elif most_common == 'spaces_4':
                indentation, indent_size = 'spaces', 4
            else:
                indentation, indent_size = 'spaces', 2
        else:
            indentation, indent_size = 'spaces', 2
        
        # Determine quote style
        quote_counter = Counter(samples['quotes'])
        quote_style = quote_counter.most_common(1)[0][0] if quote_counter else 'single'
        
        # Determine semicolon usage
        semi_counter = Counter(samples['semicolons'])
        semicolons = semi_counter.get(True, 0) > semi_counter.get(False, 0)
        
        # Determine max line length
        if samples['line_lengths']:
            # 90th percentile
            sorted_lengths = sorted(samples['line_lengths'])
            max_line_length = sorted_lengths[int(len(sorted_lengths) * 0.9)]
        else:
            max_line_length = 80
        
        return CodingStyle(
            indentation=indentation,
            indent_size=indent_size,
            quote_style=quote_style,
            semicolons=semicolons,
            trailing_commas=False,  # Hard to detect
            max_line_length=max_line_length,
            naming_convention='camelCase'  # Default
        )
    
    def _generate_suggestions(self, patterns: List[CodePattern], 
                             anti_patterns: List[str],
                             languages: Dict[str, int]) -> List[str]:
        """Generate suggestions based on analysis"""
        suggestions = []
        
        # Suggest based on languages
        primary_lang = max(languages.items(), key=lambda x: x[1])[0] if languages else None
        
        if primary_lang == 'javascript':
            # Check for modern patterns
            has_async = any(p.pattern_type == 'async_function' for p in patterns)
            has_hooks = any(p.pattern_type in ['usestate_hook', 'useeffect_hook'] for p in patterns)
            
            if not has_async:
                suggestions.append("Consider using async/await for asynchronous operations")
            if has_hooks:
                suggestions.append("React hooks detected - consider custom hooks for reusable logic")
        
        if primary_lang == 'python':
            has_type_hints = any(p.pattern_type == 'type_hint' for p in patterns)
            has_dataclass = any(p.pattern_type == 'dataclass' for p in patterns)
            
            if not has_type_hints:
                suggestions.append("Consider adding type hints for better code documentation")
            if not has_dataclass:
                suggestions.append("Consider using dataclasses for data structures")
        
        # Suggest based on anti-patterns
        if any('bare_except' in ap for ap in anti_patterns):
            suggestions.append("Specify exception types in except clauses")
        if any('any_type' in ap for ap in anti_patterns):
            suggestions.append("Replace 'any' types with specific TypeScript types")
        if any('var_usage' in ap for ap in anti_patterns):
            suggestions.append("Replace var with const/let for better scoping")
        
        return suggestions[:10]  # Limit suggestions
    
    def get_patterns(self, language: str = None, limit: int = 20) -> List[Dict]:
        """Get detected patterns from memory"""
        return self.memory.get_code_patterns(language=language, limit=limit)
    
    def get_coding_style(self) -> Optional[Dict]:
        """Get the detected coding style"""
        return self.memory.get_preference('coding_style')
    
    def get_last_analysis(self) -> Optional[AnalysisResult]:
        """Get the last analysis result"""
        return self._last_analysis
    
    def is_running(self) -> bool:
        """Check if analysis is currently running"""
        return self._running


# Singleton instance
_analyzer: Optional[BackgroundAnalyzer] = None

def get_analyzer() -> BackgroundAnalyzer:
    """Get the singleton analyzer instance"""
    global _analyzer
    if _analyzer is None:
        _analyzer = BackgroundAnalyzer()
    return _analyzer

