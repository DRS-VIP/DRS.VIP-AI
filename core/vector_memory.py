"""
DRS.VIP-AI Vector Memory Module
Semantic memory with vector embeddings and similarity search
"""

import asyncio
import json
import logging
import pickle
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Union

import numpy as np

logger = logging.getLogger(__name__)


@dataclass
class MemoryEntry:
    """A single memory entry with embedding"""
    id: str
    content: str
    embedding: List[float]
    metadata: Dict = field(default_factory=dict)
    created_at: float = field(default_factory=time.time)
    accessed_at: float = field(default_factory=time.time)
    access_count: int = 0
    importance: float = 0.5
    source: str = "user"
    tags: List[str] = field(default_factory=list)
    
    def to_dict(self) -> Dict:
        return {
            "id": self.id,
            "content": self.content,
            "embedding": self.embedding,
            "metadata": self.metadata,
            "created_at": self.created_at,
            "accessed_at": self.accessed_at,
            "access_count": self.access_count,
            "importance": self.importance,
            "source": self.source,
            "tags": self.tags
        }
    
    @classmethod
    def from_dict(cls, data: Dict) -> 'MemoryEntry':
        return cls(
            id=data["id"],
            content=data["content"],
            embedding=data["embedding"],
            metadata=data.get("metadata", {}),
            created_at=data.get("created_at", time.time()),
            accessed_at=data.get("accessed_at", time.time()),
            access_count=data.get("access_count", 0),
            importance=data.get("importance", 0.5),
            source=data.get("source", "user"),
            tags=data.get("tags", [])
        )


@dataclass
class SearchResult:
    """Result from memory search"""
    entry: MemoryEntry
    score: float
    rank: int


@dataclass
class ClusterInfo:
    """Information about a memory cluster"""
    id: str
    centroid: List[float]
    member_ids: List[str]
    label: Optional[str] = None
    summary: Optional[str] = None


class VectorUtils:
    """Vector utility functions"""
    
    @staticmethod
    def cosine_similarity(a: List[float], b: List[float]) -> float:
        """Calculate cosine similarity between two vectors"""
        a_arr = np.array(a)
        b_arr = np.array(b)
        
        dot_product = np.dot(a_arr, b_arr)
        norm_a = np.linalg.norm(a_arr)
        norm_b = np.linalg.norm(b_arr)
        
        if norm_a == 0 or norm_b == 0:
            return 0.0
        
        return float(dot_product / (norm_a * norm_b))
    
    @staticmethod
    def euclidean_distance(a: List[float], b: List[float]) -> float:
        """Calculate Euclidean distance between two vectors"""
        return float(np.linalg.norm(np.array(a) - np.array(b)))
    
    @staticmethod
    def manhattan_distance(a: List[float], b: List[float]) -> float:
        """Calculate Manhattan distance between two vectors"""
        return float(np.sum(np.abs(np.array(a) - np.array(b))))
    
    @staticmethod
    def normalize(vector: List[float]) -> List[float]:
        """Normalize a vector to unit length"""
        arr = np.array(vector)
        norm = np.linalg.norm(arr)
        if norm == 0:
            return vector
        return (arr / norm).tolist()
    
    @staticmethod
    def mean(vectors: List[List[float]]) -> List[float]:
        """Calculate mean vector"""
        if not vectors:
            return []
        return np.mean(vectors, axis=0).tolist()
    
    @staticmethod
    def weighted_average(
        vectors: List[List[float]],
        weights: List[float]
    ) -> List[float]:
        """Calculate weighted average of vectors"""
        if not vectors or not weights or len(vectors) != len(weights):
            return []
        
        vectors_arr = np.array(vectors)
        weights_arr = np.array(weights)
        weights_arr = weights_arr / weights_arr.sum()
        
        return np.average(vectors_arr, axis=0, weights=weights_arr).tolist()


class VectorIndex:
    """Efficient vector indexing with multiple index types"""
    
    def __init__(self, dimension: int = 768, index_type: str = "flat"):
        self.dimension = dimension
        self.index_type = index_type
        self.vectors: Dict[str, np.ndarray] = {}
        self.metadata: Dict[str, Dict] = {}
        self._built = False
    
    def add(self, id: str, vector: List[float], metadata: Optional[Dict] = None):
        """Add a vector to the index"""
        if len(vector) != self.dimension:
            raise ValueError(f"Vector dimension mismatch: {len(vector)} != {self.dimension}")
        
        self.vectors[id] = np.array(vector, dtype=np.float32)
        self.metadata[id] = metadata or {}
        self._built = False
    
    def remove(self, id: str) -> bool:
        """Remove a vector from the index"""
        if id in self.vectors:
            del self.vectors[id]
            del self.metadata[id]
            self._built = False
            return True
        return False
    
    def get(self, id: str) -> Optional[Tuple[List[float], Dict]]:
        """Get a vector by ID"""
        if id in self.vectors:
            return self.vectors[id].tolist(), self.metadata[id]
        return None
    
    def search(
        self,
        query: List[float],
        k: int = 10,
        metric: str = "cosine"
    ) -> List[Tuple[str, float, Dict]]:
        """Search for similar vectors"""
        if not self.vectors:
            return []
        
        query_arr = np.array(query)
        results = []
        
        for id, vec in self.vectors.items():
            if metric == "cosine":
                score = VectorUtils.cosine_similarity(query_arr.tolist(), vec.tolist())
            elif metric == "euclidean":
                dist = VectorUtils.euclidean_distance(query_arr.tolist(), vec.tolist())
                score = 1 / (1 + dist)  # Convert to similarity
            else:
                score = VectorUtils.cosine_similarity(query_arr.tolist(), vec.tolist())
            
            results.append((id, score, self.metadata[id]))
        
        # Sort by score descending
        results.sort(key=lambda x: x[1], reverse=True)
        
        return results[:k]
    
    def batch_search(
        self,
        queries: List[List[float]],
        k: int = 10,
        metric: str = "cosine"
    ) -> List[List[Tuple[str, float, Dict]]]:
        """Batch search for multiple queries"""
        return [self.search(q, k, metric) for q in queries]
    
    def get_centroid(self) -> List[float]:
        """Get the centroid of all vectors"""
        if not self.vectors:
            return [0.0] * self.dimension
        
        all_vectors = np.array(list(self.vectors.values()))
        return np.mean(all_vectors, axis=0).tolist()
    
    def get_stats(self) -> Dict:
        """Get index statistics"""
        vectors = list(self.vectors.values())
        
        if not vectors:
            return {
                "count": 0,
                "dimension": self.dimension,
                "index_type": self.index_type
            }
        
        vectors_arr = np.array(vectors)
        
        return {
            "count": len(vectors),
            "dimension": self.dimension,
            "index_type": self.index_type,
            "memory_mb": vectors_arr.nbytes / (1024 * 1024),
            "mean_norm": float(np.mean(np.linalg.norm(vectors_arr, axis=1)))
        }


class SemanticMemory:
    """Semantic memory with long-term and working memory"""
    
    def __init__(
        self,
        embedding_dim: int = 768,
        working_memory_size: int = 1000,
        long_term_memory_size: int = 100000
    ):
        self.embedding_dim = embedding_dim
        self.working_memory_size = working_memory_size
        self.long_term_memory_size = long_term_memory_size
        
        self.working_memory: Dict[str, MemoryEntry] = {}
        self.long_term_memory: Dict[str, MemoryEntry] = {}
        self.index = VectorIndex(dimension=embedding_dim)
        
        self._entry_count = 0
        self._last_consolidation = time.time()
    
    def store(
        self,
        content: str,
        embedding: List[float],
        metadata: Optional[Dict] = None,
        importance: float = 0.5,
        source: str = "user",
        tags: Optional[List[str]] = None
    ) -> str:
        """Store a new memory"""
        entry_id = str(uuid.uuid4())
        
        entry = MemoryEntry(
            id=entry_id,
            content=content,
            embedding=embedding,
            metadata=metadata or {},
            importance=importance,
            source=source,
            tags=tags or []
        )
        
        # Add to working memory
        self.working_memory[entry_id] = entry
        self.index.add(entry_id, embedding, {"content": content, **metadata})
        
        self._entry_count += 1
        
        # Check if consolidation needed
        if len(self.working_memory) > self.working_memory_size:
            self._consolidate()
        
        return entry_id
    
    def retrieve(
        self,
        query_embedding: List[float],
        k: int = 5,
        min_score: float = 0.0,
        filters: Optional[Dict] = None
    ) -> List[SearchResult]:
        """Retrieve similar memories"""
        results = self.index.search(query_embedding, k * 2)  # Get extra for filtering
        
        search_results = []
        rank = 0
        
        for entry_id, score, meta in results:
            if score < min_score:
                continue
            
            # Get full entry
            entry = self.working_memory.get(entry_id) or self.long_term_memory.get(entry_id)
            if not entry:
                continue
            
            # Apply filters
            if filters:
                if not self._matches_filters(entry, filters):
                    continue
            
            # Update access stats
            entry.accessed_at = time.time()
            entry.access_count += 1
            
            rank += 1
            search_results.append(SearchResult(
                entry=entry,
                score=score,
                rank=rank
            ))
            
            if len(search_results) >= k:
                break
        
        return search_results
    
    def _matches_filters(self, entry: MemoryEntry, filters: Dict) -> bool:
        """Check if entry matches filters"""
        for key, value in filters.items():
            if key == "source" and entry.source != value:
                return False
            if key == "tag" and value not in entry.tags:
                return False
            if key == "min_importance" and entry.importance < value:
                return False
            if key.startswith("metadata."):
                meta_key = key.split(".", 1)[1]
                if entry.metadata.get(meta_key) != value:
                    return False
        return True
    
    def _consolidate(self):
        """Consolidate working memory to long-term memory"""
        if not self.working_memory:
            return
        
        # Sort by importance and recency
        entries = list(self.working_memory.values())
        
        def score_entry(e: MemoryEntry) -> float:
            recency = 1 / (1 + (time.time() - e.accessed_at) / 3600)
            frequency = min(1.0, e.access_count / 10)
            return e.importance * 0.4 + recency * 0.3 + frequency * 0.3
        
        entries.sort(key=score_entry, reverse=True)
        
        # Keep most important in working memory
        keep_count = self.working_memory_size // 2
        to_keep = {e.id for e in entries[:keep_count]}
        to_move = [e for e in entries[keep_count:]]
        
        for entry in to_move:
            # Move to long-term memory
            self.long_term_memory[entry.id] = entry
            del self.working_memory[entry.id]
            
            # Check long-term memory capacity
            if len(self.long_term_memory) > self.long_term_memory_size:
                self._prune_long_term()
        
        self._last_consolidation = time.time()
        logger.info(f"Consolidated {len(to_move)} memories to long-term storage")
    
    def _prune_long_term(self):
        """Prune least important long-term memories"""
        entries = list(self.long_term_memory.values())
        
        def score_entry(e: MemoryEntry) -> float:
            recency = 1 / (1 + (time.time() - e.accessed_at) / 86400)
            frequency = min(1.0, e.access_count / 50)
            return e.importance * 0.3 + recency * 0.3 + frequency * 0.4
        
        entries.sort(key=score_entry)
        
        # Remove lowest scoring entries
        remove_count = len(self.long_term_memory) - self.long_term_memory_size
        for entry in entries[:remove_count]:
            del self.long_term_memory[entry.id]
            self.index.remove(entry.id)
    
    def forget(self, entry_id: str) -> bool:
        """Remove a specific memory"""
        removed = False
        
        if entry_id in self.working_memory:
            del self.working_memory[entry_id]
            removed = True
        
        if entry_id in self.long_term_memory:
            del self.long_term_memory[entry_id]
            removed = True
        
        self.index.remove(entry_id)
        
        return removed
    
    def recall_by_id(self, entry_id: str) -> Optional[MemoryEntry]:
        """Recall a specific memory by ID"""
        entry = self.working_memory.get(entry_id) or self.long_term_memory.get(entry_id)
        
        if entry:
            entry.accessed_at = time.time()
            entry.access_count += 1
        
        return entry
    
    def recall_by_content(self, query: str, limit: int = 10) -> List[MemoryEntry]:
        """Recall memories by content match (simple text search)"""
        results = []
        query_lower = query.lower()
        
        all_entries = {**self.working_memory, **self.long_term_memory}
        
        for entry in all_entries.values():
            if query_lower in entry.content.lower():
                results.append(entry)
                if len(results) >= limit:
                    break
        
        return results
    
    def get_stats(self) -> Dict:
        """Get memory statistics"""
        return {
            "working_memory_count": len(self.working_memory),
            "long_term_memory_count": len(self.long_term_memory),
            "total_entries": len(self.working_memory) + len(self.long_term_memory),
            "index_stats": self.index.get_stats(),
            "last_consolidation": self._last_consolidation
        }
    
    def export_memories(self) -> List[Dict]:
        """Export all memories as list of dicts"""
        all_entries = {**self.working_memory, **self.long_term_memory}
        return [e.to_dict() for e in all_entries.values()]
    
    def import_memories(self, memories: List[Dict]):
        """Import memories from list of dicts"""
        for mem in memories:
            entry = MemoryEntry.from_dict(mem)
            self.long_term_memory[entry.id] = entry
            self.index.add(entry.id, entry.embedding, {"content": entry.content})


class ConversationMemory:
    """Specialized memory for conversation context"""
    
    def __init__(self, max_turns: int = 50, embedding_dim: int = 768):
        self.max_turns = max_turns
        self.embedding_dim = embedding_dim
        self.turns: List[Dict] = []
        self.summary: Optional[str] = None
        self.key_entities: Dict[str, Any] = {}
        self.topics: List[str] = []
        self.sentiment_history: List[float] = []
    
    def add_turn(
        self,
        role: str,
        content: str,
        embedding: Optional[List[float]] = None,
        metadata: Optional[Dict] = None
    ):
        """Add a conversation turn"""
        turn = {
            "id": str(uuid.uuid4()),
            "role": role,
            "content": content,
            "embedding": embedding,
            "timestamp": time.time(),
            "metadata": metadata or {}
        }
        
        self.turns.append(turn)
        
        # Trim old turns if needed
        while len(self.turns) > self.max_turns:
            removed = self.turns.pop(0)
            # Keep important information in summary
            if removed["role"] == "user":
                self._update_summary(removed["content"])
        
        # Extract entities and topics
        self._extract_info(content)
    
    def _update_summary(self, content: str):
        """Update conversation summary"""
        if self.summary:
            self.summary = f"{self.summary[:500]}... + {content[:100]}"
        else:
            self.summary = content[:200]
    
    def _extract_info(self, content: str):
        """Extract entities and topics from content"""
        # Simple keyword extraction (would be enhanced with NER)
        words = content.lower().split()
        
        # Track important capitalized words as potential entities
        import re
        entities = re.findall(r'\b[A-Z][a-z]+\b', content)
        for entity in entities:
            if entity not in self.key_entities:
                self.key_entities[entity] = {"mentions": 0}
            self.key_entities[entity]["mentions"] += 1
    
    def get_relevant_context(
        self,
        query_embedding: List[float],
        max_tokens: int = 2000
    ) -> List[Dict]:
        """Get relevant context for a query"""
        relevant = []
        total_tokens = 0
        
        # Start from most recent
        for turn in reversed(self.turns):
            # Calculate similarity if embedding exists
            if turn.get("embedding"):
                similarity = VectorUtils.cosine_similarity(
                    query_embedding,
                    turn["embedding"]
                )
                turn["_similarity"] = similarity
            
            # Estimate tokens (rough: 4 chars per token)
            turn_tokens = len(turn["content"]) // 4
            
            if total_tokens + turn_tokens <= max_tokens:
                relevant.append(turn)
                total_tokens += turn_tokens
            else:
                break
        
        # Sort by similarity if available
        relevant.sort(key=lambda x: x.get("_similarity", 0), reverse=True)
        
        return relevant
    
    def get_recent_context(self, n_turns: int = 10) -> List[Dict]:
        """Get the most recent n turns"""
        return self.turns[-n_turns:]
    
    def get_full_context(self) -> str:
        """Get full conversation as string"""
        lines = []
        for turn in self.turns:
            lines.append(f"{turn['role'].upper()}: {turn['content']}")
        return "\n\n".join(lines)
    
    def clear(self):
        """Clear conversation memory"""
        self.turns = []
        self.summary = None
        self.key_entities = {}
        self.topics = []
        self.sentiment_history = []
    
    def to_dict(self) -> Dict:
        """Export conversation to dict"""
        return {
            "turns": self.turns,
            "summary": self.summary,
            "key_entities": self.key_entities,
            "topics": self.topics,
            "sentiment_history": self.sentiment_history
        }
    
    @classmethod
    def from_dict(cls, data: Dict) -> 'ConversationMemory':
        """Import conversation from dict"""
        memory = cls()
        memory.turns = data.get("turns", [])
        memory.summary = data.get("summary")
        memory.key_entities = data.get("key_entities", {})
        memory.topics = data.get("topics", [])
        memory.sentiment_history = data.get("sentiment_history", [])
        return memory


class VectorMemorySystem:
    """Complete vector memory system combining all components"""
    
    def __init__(
        self,
        embedding_dim: int = 768,
        storage_path: Optional[str] = None
    ):
        self.embedding_dim = embedding_dim
        self.storage_path = Path(storage_path) if storage_path else None
        
        self.semantic_memory = SemanticMemory(embedding_dim=embedding_dim)
        self.conversations: Dict[str, ConversationMemory] = {}
        self.index = VectorIndex(dimension=embedding_dim)
        
        self._default_conversation = "default"
        self.conversations[self._default_conversation] = ConversationMemory()
    
    async def initialize(self):
        """Initialize the memory system"""
        if self.storage_path and self.storage_path.exists():
            await self.load()
        logger.info("Vector memory system initialized")
    
    async def shutdown(self):
        """Shutdown and persist memory"""
        if self.storage_path:
            await self.save()
        logger.info("Vector memory system shutdown")
    
    def store_memory(
        self,
        content: str,
        embedding: List[float],
        metadata: Optional[Dict] = None,
        importance: float = 0.5,
        source: str = "user",
        tags: Optional[List[str]] = None
    ) -> str:
        """Store a semantic memory"""
        return self.semantic_memory.store(
            content=content,
            embedding=embedding,
            metadata=metadata,
            importance=importance,
            source=source,
            tags=tags
        )
    
    def recall_memories(
        self,
        query_embedding: List[float],
        k: int = 5,
        filters: Optional[Dict] = None
    ) -> List[SearchResult]:
        """Recall similar memories"""
        return self.semantic_memory.retrieve(
            query_embedding=query_embedding,
            k=k,
            filters=filters
        )
    
    def add_conversation_turn(
        self,
        role: str,
        content: str,
        embedding: Optional[List[float]] = None,
        conversation_id: Optional[str] = None,
        metadata: Optional[Dict] = None
    ):
        """Add a turn to conversation memory"""
        conv_id = conversation_id or self._default_conversation
        
        if conv_id not in self.conversations:
            self.conversations[conv_id] = ConversationMemory()
        
        self.conversations[conv_id].add_turn(
            role=role,
            content=content,
            embedding=embedding,
            metadata=metadata
        )
    
    def get_conversation_context(
        self,
        query_embedding: Optional[List[float]] = None,
        conversation_id: Optional[str] = None,
        max_tokens: int = 2000
    ) -> List[Dict]:
        """Get relevant conversation context"""
        conv_id = conversation_id or self._default_conversation
        
        if conv_id not in self.conversations:
            return []
        
        conv = self.conversations[conv_id]
        
        if query_embedding:
            return conv.get_relevant_context(query_embedding, max_tokens)
        else:
            return conv.get_recent_context()
    
    def create_conversation(self, conversation_id: str) -> str:
        """Create a new conversation"""
        if conversation_id not in self.conversations:
            self.conversations[conversation_id] = ConversationMemory()
        return conversation_id
    
    def delete_conversation(self, conversation_id: str) -> bool:
        """Delete a conversation"""
        if conversation_id in self.conversations:
            del self.conversations[conversation_id]
            return True
        return False
    
    def list_conversations(self) -> List[str]:
        """List all conversation IDs"""
        return list(self.conversations.keys())
    
    async def save(self):
        """Save memory to disk"""
        if not self.storage_path:
            return
        
        self.storage_path.mkdir(parents=True, exist_ok=True)
        
        # Save semantic memory
        semantic_path = self.storage_path / "semantic_memory.json"
        with open(semantic_path, 'w') as f:
            json.dump(self.semantic_memory.export_memories(), f)
        
        # Save conversations
        conv_path = self.storage_path / "conversations.json"
        with open(conv_path, 'w') as f:
            json.dump({
                k: v.to_dict() for k, v in self.conversations.items()
            }, f)
        
        logger.info(f"Memory saved to {self.storage_path}")
    
    async def load(self):
        """Load memory from disk"""
        if not self.storage_path or not self.storage_path.exists():
            return
        
        # Load semantic memory
        semantic_path = self.storage_path / "semantic_memory.json"
        if semantic_path.exists():
            with open(semantic_path, 'r') as f:
                memories = json.load(f)
            self.semantic_memory.import_memories(memories)
        
        # Load conversations
        conv_path = self.storage_path / "conversations.json"
        if conv_path.exists():
            with open(conv_path, 'r') as f:
                conversations = json.load(f)
            for conv_id, conv_data in conversations.items():
                self.conversations[conv_id] = ConversationMemory.from_dict(conv_data)
        
        logger.info(f"Memory loaded from {self.storage_path}")
    
    def get_status(self) -> Dict:
        """Get memory system status"""
        return {
            "semantic_memory": self.semantic_memory.get_stats(),
            "conversations": len(self.conversations),
            "total_conversation_turns": sum(
                len(c.turns) for c in self.conversations.values()
            ),
            "embedding_dimension": self.embedding_dim
        }


# Export classes
__all__ = [
    "VectorMemorySystem",
    "SemanticMemory",
    "ConversationMemory",
    "VectorIndex",
    "VectorUtils",
    "MemoryEntry",
    "SearchResult",
    "ClusterInfo"
]