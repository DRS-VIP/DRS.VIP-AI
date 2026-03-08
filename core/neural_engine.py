"""
DRS.VIP-AI Neural Engine
Advanced neural processing and inference engine
@version 1.0.0
@author DRS.VIP-AI Engineering Team
"""

import asyncio
import json
import logging
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional, AsyncGenerator, Callable
import hashlib
import numpy as np
from concurrent.futures import ThreadPoolExecutor

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class ModelStatus(Enum):
    """Model status enumeration"""
    UNLOADED = "unloaded"
    LOADING = "loading"
    LOADED = "loaded"
    ERROR = "error"


class TaskPriority(Enum):
    """Task priority levels"""
    LOW = 1
    NORMAL = 5
    HIGH = 10
    CRITICAL = 20


@dataclass
class ModelConfig:
    """Model configuration"""
    name: str
    model_type: str = "llm"
    context_window: int = 8192
    max_tokens: int = 4096
    temperature: float = 0.7
    top_p: float = 0.9
    top_k: int = 40
    repeat_penalty: float = 1.1
    stop_tokens: List[str] = field(default_factory=list)
    
    def to_dict(self) -> Dict:
        return {
            "name": self.name,
            "model_type": self.model_type,
            "context_window": self.context_window,
            "max_tokens": self.max_tokens,
            "temperature": self.temperature,
            "top_p": self.top_p,
            "top_k": self.top_k,
            "repeat_penalty": self.repeat_penalty,
            "stop_tokens": self.stop_tokens
        }


@dataclass
class GenerationRequest:
    """Generation request data class"""
    request_id: str
    prompt: str
    model: str
    system_prompt: Optional[str] = None
    context: List[int] = field(default_factory=list)
    temperature: float = 0.7
    max_tokens: int = 2048
    top_p: float = 0.9
    stop: List[str] = field(default_factory=list)
    stream: bool = False
    priority: TaskPriority = TaskPriority.NORMAL
    created_at: datetime = field(default_factory=datetime.utcnow)
    
    def to_dict(self) -> Dict:
        return {
            "request_id": self.request_id,
            "prompt": self.prompt,
            "model": self.model,
            "system_prompt": self.system_prompt,
            "temperature": self.temperature,
            "max_tokens": self.max_tokens,
            "top_p": self.top_p,
            "stop": self.stop,
            "stream": self.stream,
            "priority": self.priority.value,
            "created_at": self.created_at.isoformat()
        }


@dataclass
class GenerationResult:
    """Generation result data class"""
    request_id: str
    text: str
    model: str
    tokens_generated: int
    total_duration_ms: float
    tokens_per_second: float
    context: List[int] = field(default_factory=list)
    finish_reason: str = "stop"
    created_at: datetime = field(default_factory=datetime.utcnow)
    
    def to_dict(self) -> Dict:
        return {
            "request_id": self.request_id,
            "text": self.text,
            "model": self.model,
            "tokens_generated": self.tokens_generated,
            "total_duration_ms": self.total_duration_ms,
            "tokens_per_second": self.tokens_per_second,
            "context": self.context,
            "finish_reason": self.finish_reason,
            "created_at": self.created_at.isoformat()
        }


@dataclass
class EmbeddingResult:
    """Embedding result data class"""
    text: str
    embedding: List[float]
    model: str
    dimensions: int
    created_at: datetime = field(default_factory=datetime.utcnow)
    
    def to_dict(self) -> Dict:
        return {
            "text": self.text,
            "embedding": self.embedding,
            "model": self.model,
            "dimensions": self.dimensions,
            "created_at": self.created_at.isoformat()
        }


class ModelRegistry:
    """Registry for managing AI models"""
    
    def __init__(self):
        self.models: Dict[str, ModelConfig] = {}
        self.model_status: Dict[str, ModelStatus] = {}
        self.model_metadata: Dict[str, Dict] = {}
        self._lock = asyncio.Lock()
        
    async def register(self, config: ModelConfig) -> bool:
        """Register a model configuration"""
        async with self._lock:
            self.models[config.name] = config
            self.model_status[config.name] = ModelStatus.UNLOADED
            logger.info(f"Registered model: {config.name}")
            return True
    
    async def unregister(self, model_name: str) -> bool:
        """Unregister a model"""
        async with self._lock:
            if model_name in self.models:
                del self.models[model_name]
                del self.model_status[model_name]
                if model_name in self.model_metadata:
                    del self.model_metadata[model_name]
                logger.info(f"Unregistered model: {model_name}")
                return True
            return False
    
    async def get_config(self, model_name: str) -> Optional[ModelConfig]:
        """Get model configuration"""
        return self.models.get(model_name)
    
    async def set_status(self, model_name: str, status: ModelStatus):
        """Set model status"""
        async with self._lock:
            self.model_status[model_name] = status
    
    async def get_status(self, model_name: str) -> ModelStatus:
        """Get model status"""
        return self.model_status.get(model_name, ModelStatus.UNLOADED)
    
    async def set_metadata(self, model_name: str, metadata: Dict):
        """Set model metadata"""
        async with self._lock:
            self.model_metadata[model_name] = metadata
    
    async def get_metadata(self, model_name: str) -> Optional[Dict]:
        """Get model metadata"""
        return self.model_metadata.get(model_name)
    
    async def list_models(self) -> List[Dict]:
        """List all registered models"""
        result = []
        for name, config in self.models.items():
            result.append({
                "name": name,
                "status": self.model_status.get(name, ModelStatus.UNLOADED).value,
                "config": config.to_dict(),
                "metadata": self.model_metadata.get(name, {})
            })
        return result


class ContextManager:
    """Manages conversation contexts"""
    
    def __init__(self, max_contexts: int = 1000, max_tokens_per_context: int = 8192):
        self.contexts: Dict[str, Dict] = {}
        self.max_contexts = max_contexts
        self.max_tokens_per_context = max_tokens_per_context
        self._lock = asyncio.Lock()
    
    async def create_context(
        self, 
        context_id: Optional[str] = None,
        system_prompt: Optional[str] = None
    ) -> str:
        """Create a new context"""
        async with self._lock:
            # Cleanup if at capacity
            if len(self.contexts) >= self.max_contexts:
                await self._cleanup_oldest()
            
            context_id = context_id or str(uuid.uuid4())
            self.contexts[context_id] = {
                "id": context_id,
                "messages": [],
                "system_prompt": system_prompt,
                "token_count": 0,
                "created_at": datetime.utcnow(),
                "last_accessed": datetime.utcnow()
            }
            return context_id
    
    async def add_message(
        self, 
        context_id: str, 
        role: str, 
        content: str
    ) -> Optional[Dict]:
        """Add a message to a context"""
        async with self._lock:
            if context_id not in self.contexts:
                return None
            
            context = self.contexts[context_id]
            token_estimate = len(content.split()) * 2  # Rough estimate
            
            # Trim if needed
            while context["token_count"] + token_estimate > self.max_tokens_per_context:
                if not context["messages"]:
                    break
                removed = context["messages"].pop(0)
                context["token_count"] -= len(removed["content"].split()) * 2
            
            message = {
                "role": role,
                "content": content,
                "timestamp": datetime.utcnow().isoformat(),
                "token_estimate": token_estimate
            }
            
            context["messages"].append(message)
            context["token_count"] += token_estimate
            context["last_accessed"] = datetime.utcnow()
            
            return message
    
    async def get_context(self, context_id: str) -> Optional[Dict]:
        """Get context by ID"""
        async with self._lock:
            context = self.contexts.get(context_id)
            if context:
                context["last_accessed"] = datetime.utcnow()
            return context
    
    async def get_messages(self, context_id: str) -> List[Dict]:
        """Get messages from a context"""
        context = await self.get_context(context_id)
        if not context:
            return []
        
        messages = []
        if context.get("system_prompt"):
            messages.append({
                "role": "system",
                "content": context["system_prompt"]
            })
        messages.extend(context["messages"])
        return messages
    
    async def delete_context(self, context_id: str) -> bool:
        """Delete a context"""
        async with self._lock:
            if context_id in self.contexts:
                del self.contexts[context_id]
                return True
            return False
    
    async def clear_context(self, context_id: str) -> bool:
        """Clear messages from a context"""
        async with self._lock:
            if context_id in self.contexts:
                self.contexts[context_id]["messages"] = []
                self.contexts[context_id]["token_count"] = 0
                self.contexts[context_id]["last_accessed"] = datetime.utcnow()
                return True
            return False
    
    async def _cleanup_oldest(self):
        """Remove oldest contexts"""
        if not self.contexts:
            return
        
        sorted_contexts = sorted(
            self.contexts.items(),
            key=lambda x: x[1]["last_accessed"]
        )
        
        # Remove 10% oldest
        to_remove = max(1, len(sorted_contexts) // 10)
        for context_id, _ in sorted_contexts[:to_remove]:
            del self.contexts[context_id]
    
    async def get_stats(self) -> Dict:
        """Get context manager statistics"""
        return {
            "total_contexts": len(self.contexts),
            "max_contexts": self.max_contexts,
            "total_tokens": sum(c["token_count"] for c in self.contexts.values())
        }


class InferenceQueue:
    """Priority queue for inference requests"""
    
    def __init__(self, max_concurrent: int = 5):
        self.queue: asyncio.PriorityQueue = asyncio.PriorityQueue()
        self.active_requests: Dict[str, GenerationRequest] = {}
        self.max_concurrent = max_concurrent
        self._request_counter = 0
    
    async def enqueue(self, request: GenerationRequest) -> str:
        """Add request to queue"""
        self._request_counter += 1
        # Priority tuple: (inverted priority, counter, request)
        priority_tuple = (-request.priority.value, self._request_counter, request)
        await self.queue.put(priority_tuple)
        return request.request_id
    
    async def dequeue(self) -> Optional[GenerationRequest]:
        """Get next request from queue"""
        if len(self.active_requests) >= self.max_concurrent:
            return None
        
        try:
            priority_tuple = await asyncio.wait_for(self.queue.get(), timeout=0.1)
            _, _, request = priority_tuple
            self.active_requests[request.request_id] = request
            return request
        except asyncio.TimeoutError:
            return None
    
    async def complete(self, request_id: str):
        """Mark request as complete"""
        if request_id in self.active_requests:
            del self.active_requests[request_id]
    
    async def get_queue_size(self) -> int:
        """Get current queue size"""
        return self.queue.qsize()
    
    async def get_active_count(self) -> int:
        """Get number of active requests"""
        return len(self.active_requests)


class NeuralEngine:
    """Main neural processing engine"""
    
    def __init__(
        self,
        ollama_base_url: str = "http://localhost:11434",
        default_model: str = "llama3.2",
        max_concurrent: int = 5
    ):
        self.ollama_base_url = ollama_base_url
        self.default_model = default_model
        self.model_registry = ModelRegistry()
        self.context_manager = ContextManager()
        self.inference_queue = InferenceQueue(max_concurrent)
        
        self.stats = {
            "total_requests": 0,
            "successful_requests": 0,
            "failed_requests": 0,
            "total_tokens_generated": 0,
            "total_duration_ms": 0
        }
        
        self._executor = ThreadPoolExecutor(max_workers=4)
        self._running = False
    
    async def start(self):
        """Start the neural engine"""
        self._running = True
        logger.info("Neural engine started")
        
        # Initialize default model
        default_config = ModelConfig(name=self.default_model)
        await self.model_registry.register(default_config)
    
    async def stop(self):
        """Stop the neural engine"""
        self._running = False
        self._executor.shutdown(wait=True)
        logger.info("Neural engine stopped")
    
    async def health_check(self) -> Dict:
        """Check engine health"""
        return {
            "status": "healthy" if self._running else "stopped",
            "models": await self.model_registry.list_models(),
            "contexts": await self.context_manager.get_stats(),
            "queue": {
                "size": await self.inference_queue.get_queue_size(),
                "active": await self.inference_queue.get_active_count()
            },
            "stats": self.stats
        }
    
    async def generate(
        self,
        prompt: str,
        model: Optional[str] = None,
        system_prompt: Optional[str] = None,
        context_id: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 2048,
        top_p: float = 0.9,
        stop: List[str] = None,
        stream: bool = False,
        priority: TaskPriority = TaskPriority.NORMAL
    ) -> GenerationResult:
        """Generate text completion"""
        
        model = model or self.default_model
        stop = stop or []
        request_id = str(uuid.uuid4())
        
        # Get context if provided
        context = []
        if context_id:
            ctx = await self.context_manager.get_context(context_id)
            if ctx and "context" in ctx:
                context = ctx["context"]
        
        request = GenerationRequest(
            request_id=request_id,
            prompt=prompt,
            model=model,
            system_prompt=system_prompt,
            context=context,
            temperature=temperature,
            max_tokens=max_tokens,
            top_p=top_p,
            stop=stop,
            stream=stream,
            priority=priority
        )
        
        self.stats["total_requests"] += 1
        
        try:
            start_time = time.time()
            
            # Call Ollama API
            result = await self._call_ollama(request)
            
            duration_ms = (time.time() - start_time) * 1000
            tokens_per_second = result["tokens_generated"] / (duration_ms / 1000) if duration_ms > 0 else 0
            
            generation_result = GenerationResult(
                request_id=request_id,
                text=result["text"],
                model=model,
                tokens_generated=result["tokens_generated"],
                total_duration_ms=duration_ms,
                tokens_per_second=tokens_per_second,
                context=result.get("context", []),
                finish_reason=result.get("finish_reason", "stop")
            )
            
            self.stats["successful_requests"] += 1
            self.stats["total_tokens_generated"] += result["tokens_generated"]
            self.stats["total_duration_ms"] += duration_ms
            
            return generation_result
            
        except Exception as e:
            self.stats["failed_requests"] += 1
            logger.error(f"Generation failed: {e}")
            raise
    
    async def generate_stream(
        self,
        prompt: str,
        model: Optional[str] = None,
        system_prompt: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 2048,
        top_p: float = 0.9,
        stop: List[str] = None
    ) -> AsyncGenerator[str, None]:
        """Stream generation tokens"""
        
        model = model or self.default_model
        stop = stop or []
        
        request_body = {
            "model": model,
            "prompt": prompt,
            "system": system_prompt or "",
            "stream": True,
            "options": {
                "temperature": temperature,
                "num_predict": max_tokens,
                "top_p": top_p,
                "stop": stop
            }
        }
        
        try:
            import httpx
            async with httpx.AsyncClient(timeout=120.0) as client:
                async with client.stream(
                    "POST",
                    f"{self.ollama_base_url}/api/generate",
                    json=request_body
                ) as response:
                    response.raise_for_status()
                    async for line in response.aiter_lines():
                        if line:
                            data = json.loads(line)
                            if "response" in data:
                                yield data["response"]
                            if data.get("done"):
                                break
        except Exception as e:
            logger.error(f"Stream generation failed: {e}")
            raise
    
    async def chat(
        self,
        messages: List[Dict[str, str]],
        model: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 2048,
        stream: bool = False
    ) -> Dict:
        """Chat completion"""
        
        model = model or self.default_model
        
        request_body = {
            "model": model,
            "messages": messages,
            "stream": stream,
            "options": {
                "temperature": temperature,
                "num_predict": max_tokens
            }
        }
        
        try:
            import httpx
            async with httpx.AsyncClient(timeout=120.0) as client:
                response = await client.post(
                    f"{self.ollama_base_url}/api/chat",
                    json=request_body
                )
                response.raise_for_status()
                result = response.json()
                
                return {
                    "message": result.get("message", {}),
                    "model": result.get("model", model),
                    "total_duration": result.get("total_duration", 0),
                    "eval_count": result.get("eval_count", 0)
                }
        except Exception as e:
            logger.error(f"Chat failed: {e}")
            raise
    
    async def get_embeddings(
        self,
        text: str,
        model: Optional[str] = None
    ) -> EmbeddingResult:
        """Get text embeddings"""
        
        model = model or self.default_model
        
        request_body = {
            "model": model,
            "prompt": text
        }
        
        try:
            import httpx
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(
                    f"{self.ollama_base_url}/api/embeddings",
                    json=request_body
                )
                response.raise_for_status()
                result = response.json()
                
                embedding = result.get("embedding", [])
                
                return EmbeddingResult(
                    text=text,
                    embedding=embedding,
                    model=model,
                    dimensions=len(embedding)
                )
        except Exception as e:
            logger.error(f"Embedding failed: {e}")
            raise
    
    async def list_models(self) -> List[Dict]:
        """List available models"""
        try:
            import httpx
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(f"{self.ollama_base_url}/api/tags")
                response.raise_for_status()
                data = response.json()
                return data.get("models", [])
        except Exception as e:
            logger.error(f"Failed to list models: {e}")
            return []
    
    async def _call_ollama(self, request: GenerationRequest) -> Dict:
        """Make Ollama API call"""
        request_body = {
            "model": request.model,
            "prompt": request.prompt,
            "system": request.system_prompt or "",
            "context": request.context,
            "stream": False,
            "options": {
                "temperature": request.temperature,
                "num_predict": request.max_tokens,
                "top_p": request.top_p,
                "stop": request.stop
            }
        }
        
        import httpx
        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(
                f"{self.ollama_base_url}/api/generate",
                json=request_body
            )
            response.raise_for_status()
            result = response.json()
            
            return {
                "text": result.get("response", ""),
                "tokens_generated": result.get("eval_count", 0),
                "context": result.get("context", []),
                "finish_reason": "stop" if result.get("done") else "length"
            }
    
    async def get_stats(self) -> Dict:
        """Get engine statistics"""
        return {
            **self.stats,
            "average_tokens_per_second": (
                self.stats["total_tokens_generated"] / 
                (self.stats["total_duration_ms"] / 1000)
            ) if self.stats["total_duration_ms"] > 0 else 0,
            "success_rate": (
                self.stats["successful_requests"] / 
                self.stats["total_requests"] * 100
            ) if self.stats["total_requests"] > 0 else 0
        }


# Singleton instance
_neural_engine: Optional[NeuralEngine] = None


def get_neural_engine() -> NeuralEngine:
    """Get or create neural engine instance"""
    global _neural_engine
    if _neural_engine is None:
        _neural_engine = NeuralEngine()
    return _neural_engine


async def initialize_engine():
    """Initialize the neural engine"""
    engine = get_neural_engine()
    await engine.start()
    return engine