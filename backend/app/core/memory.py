"""
AgentPrime Persistent Memory Layer
SQLite-backed memory with semantic search capabilities

Features:
- Conversation history persistence
- Code pattern storage and retrieval
- User preferences tracking
- Semantic similarity search (using simple TF-IDF when no embeddings available)
"""

import sqlite3
import json
import hashlib
import re
from datetime import datetime
from pathlib import Path
from typing import Optional, List, Dict, Any
from dataclasses import dataclass, asdict
import math
from collections import Counter


@dataclass
class Memory:
    """A single memory entry"""
    id: str
    type: str  # 'conversation', 'pattern', 'preference', 'anti_pattern', 'code_style'
    content: str
    metadata: Dict[str, Any]
    embedding: Optional[List[float]] = None
    created_at: str = ""
    updated_at: str = ""
    access_count: int = 0
    success_rate: float = 0.5


@dataclass
class SearchResult:
    """Search result with relevance score"""
    memory: Memory
    score: float
    reason: str


class MemoryStore:
    """
    Persistent memory store with semantic search
    Uses SQLite for storage and TF-IDF for similarity when embeddings unavailable
    """
    
    def __init__(self, db_path: str = None):
        if db_path is None:
            # Default to data directory
            data_dir = Path(__file__).parent.parent.parent / "data"
            data_dir.mkdir(exist_ok=True)
            db_path = str(data_dir / "agentprime_memory.db")
        
        self.db_path = db_path
        self.conn = sqlite3.connect(db_path, check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        self._init_db()
        
        # TF-IDF index for semantic search
        self._document_frequencies: Dict[str, int] = {}
        self._total_documents = 0
        self._rebuild_index()
        
        print(f"[Memory] Initialized at {db_path}")
    
    def _init_db(self):
        """Initialize database schema"""
        cursor = self.conn.cursor()
        
        # Main memories table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS memories (
                id TEXT PRIMARY KEY,
                type TEXT NOT NULL,
                content TEXT NOT NULL,
                metadata TEXT DEFAULT '{}',
                embedding TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                access_count INTEGER DEFAULT 0,
                success_rate REAL DEFAULT 0.5
            )
        """)
        
        # Create indexes for fast queries
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_type ON memories(type)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_created ON memories(created_at)")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_success ON memories(success_rate DESC)")
        
        # Conversation history table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS conversations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT NOT NULL,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                model TEXT,
                tokens INTEGER DEFAULT 0,
                timestamp TEXT NOT NULL
            )
        """)
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_session ON conversations(session_id)")
        
        # Code patterns table (extracted from workspace)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS code_patterns (
                id TEXT PRIMARY KEY,
                pattern_type TEXT NOT NULL,
                file_path TEXT,
                code_snippet TEXT,
                description TEXT,
                language TEXT,
                frequency INTEGER DEFAULT 1,
                last_seen TEXT NOT NULL
            )
        """)
        
        # User preferences
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS preferences (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
        """)
        
        self.conn.commit()
    
    def _rebuild_index(self):
        """Rebuild TF-IDF index from all memories"""
        cursor = self.conn.cursor()
        cursor.execute("SELECT content FROM memories")
        rows = cursor.fetchall()
        
        self._total_documents = len(rows)
        self._document_frequencies = Counter()
        
        for row in rows:
            words = set(self._tokenize(row['content']))
            for word in words:
                self._document_frequencies[word] += 1
    
    def _tokenize(self, text: str) -> List[str]:
        """Simple tokenization for TF-IDF"""
        # Convert to lowercase and split on non-alphanumeric
        words = re.findall(r'\b[a-z_][a-z0-9_]*\b', text.lower())
        # Filter very short words and common stop words
        stop_words = {'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 
                     'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
                     'would', 'could', 'should', 'may', 'might', 'must', 'shall',
                     'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from',
                     'as', 'or', 'and', 'but', 'if', 'then', 'else', 'when', 'this',
                     'that', 'these', 'those', 'it', 'its'}
        return [w for w in words if len(w) > 2 and w not in stop_words]
    
    def _compute_tfidf(self, text: str) -> Dict[str, float]:
        """Compute TF-IDF vector for text"""
        words = self._tokenize(text)
        if not words:
            return {}
        
        # Term frequency
        tf = Counter(words)
        max_tf = max(tf.values()) if tf else 1
        
        # TF-IDF
        tfidf = {}
        for word, count in tf.items():
            tf_score = 0.5 + 0.5 * (count / max_tf)  # Augmented TF
            df = self._document_frequencies.get(word, 0)
            idf = math.log((self._total_documents + 1) / (df + 1)) + 1  # Smoothed IDF
            tfidf[word] = tf_score * idf
        
        return tfidf
    
    def _cosine_similarity(self, vec1: Dict[str, float], vec2: Dict[str, float]) -> float:
        """Compute cosine similarity between two TF-IDF vectors"""
        if not vec1 or not vec2:
            return 0.0
        
        # Dot product
        common_words = set(vec1.keys()) & set(vec2.keys())
        dot = sum(vec1[w] * vec2[w] for w in common_words)
        
        # Magnitudes
        mag1 = math.sqrt(sum(v * v for v in vec1.values()))
        mag2 = math.sqrt(sum(v * v for v in vec2.values()))
        
        if mag1 == 0 or mag2 == 0:
            return 0.0
        
        return dot / (mag1 * mag2)
    
    def _generate_id(self, content: str, type: str) -> str:
        """Generate unique ID for memory"""
        hash_input = f"{type}:{content}:{datetime.now().isoformat()}"
        return hashlib.sha256(hash_input.encode()).hexdigest()[:16]
    
    # ============ MEMORY OPERATIONS ============
    
    def store(self, type: str, content: str, metadata: Dict[str, Any] = None) -> Memory:
        """Store a new memory"""
        now = datetime.now().isoformat()
        memory = Memory(
            id=self._generate_id(content, type),
            type=type,
            content=content,
            metadata=metadata or {},
            created_at=now,
            updated_at=now
        )
        
        cursor = self.conn.cursor()
        cursor.execute("""
            INSERT OR REPLACE INTO memories 
            (id, type, content, metadata, created_at, updated_at, access_count, success_rate)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            memory.id, memory.type, memory.content, 
            json.dumps(memory.metadata), memory.created_at, memory.updated_at,
            memory.access_count, memory.success_rate
        ))
        self.conn.commit()
        
        # Update TF-IDF index
        self._total_documents += 1
        for word in set(self._tokenize(content)):
            self._document_frequencies[word] = self._document_frequencies.get(word, 0) + 1
        
        return memory
    
    def get(self, memory_id: str) -> Optional[Memory]:
        """Get a memory by ID"""
        cursor = self.conn.cursor()
        cursor.execute("SELECT * FROM memories WHERE id = ?", (memory_id,))
        row = cursor.fetchone()
        
        if not row:
            return None
        
        # Update access count
        cursor.execute(
            "UPDATE memories SET access_count = access_count + 1 WHERE id = ?",
            (memory_id,)
        )
        self.conn.commit()
        
        return Memory(
            id=row['id'],
            type=row['type'],
            content=row['content'],
            metadata=json.loads(row['metadata']),
            created_at=row['created_at'],
            updated_at=row['updated_at'],
            access_count=row['access_count'] + 1,
            success_rate=row['success_rate']
        )
    
    def search(self, query: str, type: str = None, limit: int = 10) -> List[SearchResult]:
        """Semantic search using TF-IDF similarity"""
        query_vec = self._compute_tfidf(query)
        if not query_vec:
            return []
        
        cursor = self.conn.cursor()
        if type:
            cursor.execute("SELECT * FROM memories WHERE type = ?", (type,))
        else:
            cursor.execute("SELECT * FROM memories")
        
        rows = cursor.fetchall()
        results = []
        
        for row in rows:
            content_vec = self._compute_tfidf(row['content'])
            score = self._cosine_similarity(query_vec, content_vec)
            
            if score > 0.1:  # Minimum threshold
                memory = Memory(
                    id=row['id'],
                    type=row['type'],
                    content=row['content'],
                    metadata=json.loads(row['metadata']),
                    created_at=row['created_at'],
                    updated_at=row['updated_at'],
                    access_count=row['access_count'],
                    success_rate=row['success_rate']
                )
                
                # Boost by success rate and recency
                recency_boost = 1.0
                try:
                    days_old = (datetime.now() - datetime.fromisoformat(row['created_at'])).days
                    recency_boost = 1.0 / (1.0 + days_old / 30)  # Decay over 30 days
                except:
                    pass
                
                final_score = score * (0.5 + 0.5 * memory.success_rate) * (0.7 + 0.3 * recency_boost)
                
                results.append(SearchResult(
                    memory=memory,
                    score=final_score,
                    reason=f"Similarity: {score:.2f}, Success: {memory.success_rate:.2f}"
                ))
        
        # Sort by score descending
        results.sort(key=lambda r: r.score, reverse=True)
        return results[:limit]
    
    def update_success_rate(self, memory_id: str, success: bool):
        """Update success rate of a memory (exponential moving average)"""
        cursor = self.conn.cursor()
        cursor.execute("SELECT success_rate FROM memories WHERE id = ?", (memory_id,))
        row = cursor.fetchone()
        
        if row:
            current_rate = row['success_rate']
            alpha = 0.3  # Learning rate
            new_rate = alpha * (1.0 if success else 0.0) + (1 - alpha) * current_rate
            
            cursor.execute("""
                UPDATE memories 
                SET success_rate = ?, updated_at = ?
                WHERE id = ?
            """, (new_rate, datetime.now().isoformat(), memory_id))
            self.conn.commit()
    
    def get_by_type(self, type: str, limit: int = 50) -> List[Memory]:
        """Get memories by type, ordered by success rate"""
        cursor = self.conn.cursor()
        cursor.execute("""
            SELECT * FROM memories 
            WHERE type = ? 
            ORDER BY success_rate DESC, updated_at DESC
            LIMIT ?
        """, (type, limit))
        
        return [Memory(
            id=row['id'],
            type=row['type'],
            content=row['content'],
            metadata=json.loads(row['metadata']),
            created_at=row['created_at'],
            updated_at=row['updated_at'],
            access_count=row['access_count'],
            success_rate=row['success_rate']
        ) for row in cursor.fetchall()]
    
    # ============ CONVERSATION HISTORY ============
    
    def save_conversation(self, session_id: str, role: str, content: str, 
                         model: str = None, tokens: int = 0):
        """Save a conversation message"""
        cursor = self.conn.cursor()
        cursor.execute("""
            INSERT INTO conversations (session_id, role, content, model, tokens, timestamp)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (session_id, role, content, model, tokens, datetime.now().isoformat()))
        self.conn.commit()
    
    def get_conversation_history(self, session_id: str, limit: int = 50) -> List[Dict]:
        """Get conversation history for a session"""
        cursor = self.conn.cursor()
        cursor.execute("""
            SELECT role, content, model, tokens, timestamp 
            FROM conversations 
            WHERE session_id = ?
            ORDER BY timestamp DESC
            LIMIT ?
        """, (session_id, limit))
        
        return [dict(row) for row in cursor.fetchall()][::-1]  # Reverse to chronological
    
    def get_recent_sessions(self, limit: int = 10) -> List[Dict]:
        """Get recent conversation sessions"""
        cursor = self.conn.cursor()
        cursor.execute("""
            SELECT session_id, 
                   MIN(timestamp) as started,
                   MAX(timestamp) as last_active,
                   COUNT(*) as message_count
            FROM conversations
            GROUP BY session_id
            ORDER BY last_active DESC
            LIMIT ?
        """, (limit,))
        
        return [dict(row) for row in cursor.fetchall()]
    
    # ============ CODE PATTERNS ============
    
    def store_code_pattern(self, pattern_type: str, code_snippet: str, 
                          description: str, file_path: str = None, 
                          language: str = None):
        """Store a detected code pattern"""
        pattern_id = self._generate_id(code_snippet, f"code_{pattern_type}")
        now = datetime.now().isoformat()
        
        cursor = self.conn.cursor()
        cursor.execute("""
            INSERT INTO code_patterns 
            (id, pattern_type, file_path, code_snippet, description, language, frequency, last_seen)
            VALUES (?, ?, ?, ?, ?, ?, 1, ?)
            ON CONFLICT(id) DO UPDATE SET
                frequency = frequency + 1,
                last_seen = ?
        """, (pattern_id, pattern_type, file_path, code_snippet, description, 
              language, now, now))
        self.conn.commit()
        
        return pattern_id
    
    def get_code_patterns(self, pattern_type: str = None, 
                         language: str = None, limit: int = 20) -> List[Dict]:
        """Get code patterns, optionally filtered"""
        cursor = self.conn.cursor()
        
        query = "SELECT * FROM code_patterns WHERE 1=1"
        params = []
        
        if pattern_type:
            query += " AND pattern_type = ?"
            params.append(pattern_type)
        if language:
            query += " AND language = ?"
            params.append(language)
        
        query += " ORDER BY frequency DESC, last_seen DESC LIMIT ?"
        params.append(limit)
        
        cursor.execute(query, params)
        return [dict(row) for row in cursor.fetchall()]
    
    # ============ USER PREFERENCES ============
    
    def set_preference(self, key: str, value: Any):
        """Set a user preference"""
        cursor = self.conn.cursor()
        cursor.execute("""
            INSERT OR REPLACE INTO preferences (key, value, updated_at)
            VALUES (?, ?, ?)
        """, (key, json.dumps(value), datetime.now().isoformat()))
        self.conn.commit()
    
    def get_preference(self, key: str, default: Any = None) -> Any:
        """Get a user preference"""
        cursor = self.conn.cursor()
        cursor.execute("SELECT value FROM preferences WHERE key = ?", (key,))
        row = cursor.fetchone()
        
        if row:
            return json.loads(row['value'])
        return default
    
    def get_all_preferences(self) -> Dict[str, Any]:
        """Get all user preferences"""
        cursor = self.conn.cursor()
        cursor.execute("SELECT key, value FROM preferences")
        return {row['key']: json.loads(row['value']) for row in cursor.fetchall()}
    
    # ============ STATS ============
    
    def get_stats(self) -> Dict[str, Any]:
        """Get memory store statistics"""
        cursor = self.conn.cursor()
        
        # Count memories by type
        cursor.execute("SELECT type, COUNT(*) as count FROM memories GROUP BY type")
        memory_counts = {row['type']: row['count'] for row in cursor.fetchall()}
        
        # Total conversations
        cursor.execute("SELECT COUNT(*) as count FROM conversations")
        conv_count = cursor.fetchone()['count']
        
        # Total patterns
        cursor.execute("SELECT COUNT(*) as count FROM code_patterns")
        pattern_count = cursor.fetchone()['count']
        
        return {
            'total_memories': sum(memory_counts.values()),
            'memories_by_type': memory_counts,
            'total_conversations': conv_count,
            'total_code_patterns': pattern_count,
            'index_size': len(self._document_frequencies)
        }
    
    def close(self):
        """Close database connection"""
        self.conn.close()


# Singleton instance
_memory_store: Optional[MemoryStore] = None

def get_memory_store() -> MemoryStore:
    """Get the singleton memory store instance"""
    global _memory_store
    if _memory_store is None:
        _memory_store = MemoryStore()
    return _memory_store

