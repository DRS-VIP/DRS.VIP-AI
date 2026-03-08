"""
DRS.VIP-AI Flask Application
Main application entry point with WebSocket support and REST API
"""

import asyncio
import json
import logging
import os
import time
import uuid
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Any, Dict, List, Optional

import aiohttp
from flask import Flask, Response, abort, jsonify, request, stream_with_context
from flask_cors import CORS
from flask_sock import Sock
from simple_websocket import Server as WebSocketServer

# Import core modules
from config import Config
from neural_engine import NeuralEngine, GenerationRequest, TaskPriority
from security_layer import SecurityLayer, SecurityLevel, ThreatLevel
from prediction_engine import PredictionEngine, MetricType
from vector_memory import VectorMemorySystem

# Configure logging
logging.basicConfig(
    level=getattr(logging, os.getenv("LOG_LEVEL", "INFO")),
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# Initialize configuration
config = Config()


class DRSVIPApp:
    """Main application class managing all components"""
    
    def __init__(self, config: Config):
        self.config = config
        self.neural_engine: Optional[NeuralEngine] = None
        self.security: Optional[SecurityLayer] = None
        self.prediction: Optional[PredictionEngine] = None
        self.memory: Optional[VectorMemorySystem] = None
        self.websocket_clients: List[WebSocketServer] = []
        self._initialized = False
    
    async def initialize(self):
        """Initialize all application components"""
        logger.info("Initializing DRS.VIP-AI...")
        
        # Initialize security layer
        self.security = SecurityLayer()
        await self.security.initialize()
        logger.info("Security layer initialized")
        
        # Initialize neural engine
        self.neural_engine = NeuralEngine(
            ollama_url=self.config.OLLAMA_BASE_URL,
            default_model=self.config.DEFAULT_MODEL,
            max_context_tokens=self.config.MAX_CONTEXT_TOKENS
        )
        await self.neural_engine.start()
        logger.info("Neural engine initialized")
        
        # Initialize prediction engine
        self.prediction = PredictionEngine()
        await self.prediction.start()
        logger.info("Prediction engine initialized")
        
        # Initialize vector memory
        self.memory = VectorMemorySystem(
            embedding_dim=768,
            storage_path=self.config.MEMORY_STORAGE_PATH
        )
        await self.memory.initialize()
        logger.info("Vector memory initialized")
        
        # Register system metrics
        self.prediction.register_metric("cpu_usage", MetricType.CPU_USAGE)
        self.prediction.register_metric("memory_usage", MetricType.MEMORY_USAGE)
        self.prediction.register_metric("request_rate", MetricType.REQUEST_RATE)
        
        self._initialized = True
        logger.info("DRS.VIP-AI initialization complete")
    
    async def shutdown(self):
        """Shutdown all components"""
        logger.info("Shutting down DRS.VIP-AI...")
        
        if self.neural_engine:
            await self.neural_engine.stop()
        
        if self.prediction:
            await self.prediction.stop()
        
        if self.memory:
            await self.memory.shutdown()
        
        if self.security:
            await self.security.shutdown()
        
        self._initialized = False
        logger.info("DRS.VIP-AI shutdown complete")
    
    def is_initialized(self) -> bool:
        return self._initialized


# Create Flask app
app = Flask(__name__)
app.config.from_object(config)
CORS(app)
sock = Sock(app)

# Create application instance
drs_app = DRSVIPApp(config)


# Lifespan context manager
@asynccontextmanager
async def lifespan():
    """Application lifespan manager"""
    await drs_app.initialize()
    try:
        yield
    finally:
        await drs_app.shutdown()


# Initialize on first request workaround for Flask
@app.before_request
def ensure_initialized():
    """Ensure app is initialized before handling requests"""
    if not drs_app.is_initialized():
        # Run async initialization in sync context
        import threading
        init_event = threading.Event()
        
        def run_init():
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            loop.run_until_complete(drs_app.initialize())
            init_event.set()
        
        if not hasattr(app, '_initializing'):
            app._initializing = True
            thread = threading.Thread(target=run_init, daemon=True)
            thread.start()
            init_event.wait(timeout=30)


# ==================== Health & Status ====================

@app.route("/api/health", methods=["GET"])
def health_check():
    """Health check endpoint"""
    return jsonify({
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "version": config.VERSION
    })


@app.route("/api/status", methods=["GET"])
def get_status():
    """Get system status"""
    if not drs_app.is_initialized():
        return jsonify({"error": "System not initialized"}), 503
    
    return jsonify({
        "neural_engine": drs_app.neural_engine.get_status() if drs_app.neural_engine else None,
        "security": drs_app.security.get_security_status() if drs_app.security else None,
        "prediction": drs_app.prediction.get_status() if drs_app.prediction else None,
        "memory": drs_app.memory.get_status() if drs_app.memory else None
    })


# ==================== Authentication ====================

@app.route("/api/auth/register", methods=["POST"])
def register():
    """Register a new user"""
    data = request.get_json()
    
    if not data:
        return jsonify({"error": "No data provided"}), 400
    
    try:
        user = drs_app.security.register_user(
            username=data.get("username"),
            email=data.get("email"),
            password=data.get("password"),
            roles=data.get("roles", ["user"])
        )
        
        return jsonify({
            "user_id": user.id,
            "username": user.username,
            "message": "User registered successfully"
        }), 201
    except ValueError as e:
        return jsonify({"error": str(e)}), 400


@app.route("/api/auth/login", methods=["POST"])
def login():
    """Authenticate user"""
    data = request.get_json()
    
    if not data:
        return jsonify({"error": "No data provided"}), 400
    
    session, error = drs_app.security.authenticate(
        username=data.get("username"),
        password=data.get("password"),
        ip_address=request.remote_addr
    )
    
    if error:
        return jsonify({"error": error}), 401
    
    return jsonify({
        "session_id": session.id,
        "token": session.token,
        "expires_at": session.expires_at.isoformat()
    })


@app.route("/api/auth/logout", methods=["POST"])
def logout():
    """End user session"""
    session_id = request.headers.get("X-Session-ID")
    
    if session_id and drs_app.security.logout(session_id):
        return jsonify({"message": "Logged out successfully"})
    
    return jsonify({"error": "Invalid session"}), 400


@app.route("/api/auth/validate", methods=["GET"])
def validate_token():
    """Validate authentication token"""
    auth_header = request.headers.get("Authorization", "")
    
    if not auth_header.startswith("Bearer "):
        return jsonify({"error": "No token provided"}), 401
    
    token = auth_header[7:]
    user = drs_app.security.validate_session(token)
    
    if not user:
        return jsonify({"error": "Invalid or expired token"}), 401
    
    return jsonify({
        "user_id": user.id,
        "username": user.username,
        "roles": user.roles
    })


# ==================== AI Generation ====================

@app.route("/api/generate", methods=["POST"])
def generate():
    """Generate text completion"""
    data = request.get_json()
    
    if not data:
        return jsonify({"error": "No data provided"}), 400
    
    prompt = data.get("prompt", "")
    model = data.get("model", config.DEFAULT_MODEL)
    context_id = data.get("context_id")
    
    # Run async in sync context
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    
    try:
        result = loop.run_until_complete(
            drs_app.neural_engine.generate(
                prompt=prompt,
                model=model,
                context_id=context_id,
                temperature=data.get("temperature"),
                max_tokens=data.get("max_tokens")
            )
        )
        
        return jsonify({
            "id": result.id,
            "text": result.text,
            "model": result.model,
            "tokens_generated": result.tokens_generated,
            "tokens_per_second": result.tokens_per_second
        })
    finally:
        loop.close()


@app.route("/api/generate/stream", methods=["POST"])
def generate_stream():
    """Generate text with streaming"""
    data = request.get_json()
    
    if not data:
        return jsonify({"error": "No data provided"}), 400
    
    prompt = data.get("prompt", "")
    model = data.get("model", config.DEFAULT_MODEL)
    context_id = data.get("context_id")
    
    def generate():
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        
        async def stream():
            async for chunk in drs_app.neural_engine.generate_stream(
                prompt=prompt,
                model=model,
                context_id=context_id,
                temperature=data.get("temperature"),
                max_tokens=data.get("max_tokens")
            ):
                yield f"data: {json.dumps({'text': chunk})}\n\n"
            
            yield "data: [DONE]\n\n"
        
        gen = stream()
        
        while True:
            try:
                chunk = loop.run_until_complete(gen.__anext__())
                yield chunk
            except StopAsyncIteration:
                break
        
        loop.close()
    
    return Response(
        stream_with_context(generate()),
        mimetype="text/event-stream"
    )


@app.route("/api/chat", methods=["POST"])
def chat():
    """Chat completion endpoint"""
    data = request.get_json()
    
    if not data:
        return jsonify({"error": "No data provided"}), 400
    
    messages = data.get("messages", [])
    model = data.get("model", config.DEFAULT_MODEL)
    stream = data.get("stream", False)
    
    if not messages:
        return jsonify({"error": "No messages provided"}), 400
    
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    
    try:
        if stream:
            def generate():
                async def stream():
                    async for chunk in drs_app.neural_engine.chat(
                        messages=messages,
                        model=model,
                        temperature=data.get("temperature"),
                        stream=True
                    ):
                        yield f"data: {json.dumps({'text': chunk})}\n\n"
                    
                    yield "data: [DONE]\n\n"
                
                gen = stream()
                
                while True:
                    try:
                        chunk = loop.run_until_complete(gen.__anext__())
                        yield chunk
                    except StopAsyncIteration:
                        break
            
            return Response(
                stream_with_context(generate()),
                mimetype="text/event-stream"
            )
        else:
            result = loop.run_until_complete(
                drs_app.neural_engine.chat(
                    messages=messages,
                    model=model,
                    temperature=data.get("temperature"),
                    stream=False
                )
            )
            
            return jsonify({
                "text": result,
                "model": model
            })
    finally:
        loop.close()


# ==================== Models ====================

@app.route("/api/models", methods=["GET"])
def list_models():
    """List available AI models"""
    models = drs_app.neural_engine.registry.list_models()
    return jsonify({"models": models})


@app.route("/api/models/<model_name>", methods=["GET"])
def get_model(model_name: str):
    """Get model details"""
    model = drs_app.neural_engine.registry.get_model(model_name)
    status = drs_app.neural_engine.registry.get_status(model_name)
    
    if not model:
        return jsonify({"error": "Model not found"}), 404
    
    return jsonify({
        "name": model.name,
        "display_name": model.display_name,
        "status": status.value,
        "context_window": model.context_window,
        "max_output": model.max_output,
        "supports_vision": model.supports_vision,
        "supports_tools": model.supports_tools
    })


# ==================== Memory ====================

@app.route("/api/memory/store", methods=["POST"])
def store_memory():
    """Store a semantic memory"""
    data = request.get_json()
    
    if not data:
        return jsonify({"error": "No data provided"}), 400
    
    entry_id = drs_app.memory.store_memory(
        content=data.get("content", ""),
        embedding=data.get("embedding", []),
        metadata=data.get("metadata"),
        importance=data.get("importance", 0.5),
        source=data.get("source", "user"),
        tags=data.get("tags")
    )
    
    return jsonify({"entry_id": entry_id})


@app.route("/api/memory/recall", methods=["POST"])
def recall_memory():
    """Recall similar memories"""
    data = request.get_json()
    
    if not data:
        return jsonify({"error": "No data provided"}), 400
    
    results = drs_app.memory.recall_memories(
        query_embedding=data.get("embedding", []),
        k=data.get("k", 5),
        filters=data.get("filters")
    )
    
    return jsonify({
        "results": [
            {
                "id": r.entry.id,
                "content": r.entry.content,
                "score": r.score,
                "rank": r.rank,
                "metadata": r.entry.metadata
            }
            for r in results
        ]
    })


@app.route("/api/memory/conversations", methods=["GET"])
def list_conversations():
    """List all conversations"""
    conversations = drs_app.memory.list_conversations()
    return jsonify({"conversations": conversations})


@app.route("/api/memory/conversations/<conversation_id>", methods=["GET"])
def get_conversation(conversation_id: str):
    """Get conversation history"""
    context = drs_app.memory.get_conversation_context(
        conversation_id=conversation_id
    )
    
    return jsonify({
        "conversation_id": conversation_id,
        "turns": context
    })


@app.route("/api/memory/conversations", methods=["POST"])
def create_conversation():
    """Create a new conversation"""
    data = request.get_json() or {}
    conversation_id = data.get("conversation_id", str(uuid.uuid4()))
    
    drs_app.memory.create_conversation(conversation_id)
    
    return jsonify({
        "conversation_id": conversation_id,
        "message": "Conversation created"
    }), 201


# ==================== Predictions ====================

@app.route("/api/predictions/register", methods=["POST"])
def register_metric():
    """Register a metric for prediction tracking"""
    data = request.get_json()
    
    if not data:
        return jsonify({"error": "No data provided"}), 400
    
    drs_app.prediction.register_metric(
        metric_id=data.get("metric_id"),
        metric_type=MetricType(data.get("metric_type", "custom")),
        anomaly_threshold=data.get("anomaly_threshold", 3.0)
    )
    
    return jsonify({"message": "Metric registered"})


@app.route("/api/predictions/data", methods=["POST"])
def add_prediction_data():
    """Add data point for prediction"""
    data = request.get_json()
    
    if not data:
        return jsonify({"error": "No data provided"}), 400
    
    result = drs_app.prediction.add_data_point(
        metric_id=data.get("metric_id"),
        value=data.get("value"),
        timestamp=data.get("timestamp")
    )
    
    return jsonify({
        "anomaly": result.get("anomaly").__dict__ if result.get("anomaly") else None,
        "trend": result.get("trend").__dict__ if result.get("trend") else None
    })


@app.route("/api/predictions/forecast/<metric_id>", methods=["GET"])
def get_forecast(metric_id: str):
    """Get forecast for a metric"""
    horizon = request.args.get("horizon", 10, type=int)
    
    predictions = drs_app.prediction.get_forecast(metric_id, horizon)
    
    return jsonify({
        "metric_id": metric_id,
        "predictions": [
            {
                "value": p.predicted_value,
                "confidence": p.confidence,
                "lower_bound": p.lower_bound,
                "upper_bound": p.upper_bound,
                "horizon": p.horizon
            }
            for p in predictions
        ]
    })


# ==================== Security ====================

@app.route("/api/security/alerts", methods=["GET"])
def get_security_alerts():
    """Get security alerts"""
    from security_layer import ThreatLevel
    
    level = request.args.get("level")
    resolved = request.args.get("resolved")
    
    alerts = drs_app.security.threats.get_alerts(
        level=ThreatLevel(level) if level else None,
        resolved=resolved.lower() == "true" if resolved else None
    )
    
    return jsonify({
        "alerts": [
            {
                "id": a.id,
                "type": a.threat_type,
                "level": a.level.value,
                "description": a.description,
                "timestamp": a.timestamp,
                "resolved": a.resolved
            }
            for a in alerts
        ]
    })


@app.route("/api/security/alerts/<alert_id>/resolve", methods=["POST"])
def resolve_alert(alert_id: str):
    """Resolve a security alert"""
    if drs_app.security.threats.resolve_alert(alert_id):
        return jsonify({"message": "Alert resolved"})
    
    return jsonify({"error": "Alert not found"}), 404


@app.route("/api/security/api-keys", methods=["POST"])
def create_api_key():
    """Create a new API key"""
    data = request.get_json()
    
    if not data:
        return jsonify({"error": "No data provided"}), 400
    
    # Validate user
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return jsonify({"error": "Unauthorized"}), 401
    
    user = drs_app.security.validate_session(auth_header[7:])
    if not user:
        return jsonify({"error": "Unauthorized"}), 401
    
    key_info = drs_app.security.tokens.create_api_key(
        user_id=user.id,
        name=data.get("name", "API Key"),
        permissions=data.get("permissions"),
        expires_days=data.get("expires_days", 365)
    )
    
    return jsonify(key_info)


# ==================== WebSocket ====================

@sock.route("/ws")
def websocket_connection(ws: WebSocketServer):
    """WebSocket connection handler"""
    logger.info(f"New WebSocket connection from {request.remote_addr}")
    drs_app.websocket_clients.append(ws)
    
    try:
        while True:
            message = ws.receive()
            
            if message is None:
                break
            
            try:
                data = json.loads(message)
                response = handle_websocket_message(data, ws)
                
                if response:
                    ws.send(json.dumps(response))
            except json.JSONDecodeError:
                ws.send(json.dumps({"error": "Invalid JSON"}))
            except Exception as e:
                logger.error(f"WebSocket error: {e}")
                ws.send(json.dumps({"error": str(e)}))
    except Exception as e:
        logger.error(f"WebSocket connection error: {e}")
    finally:
        drs_app.websocket_clients.remove(ws)
        logger.info("WebSocket connection closed")


def handle_websocket_message(data: Dict, ws: WebSocketServer) -> Optional[Dict]:
    """Handle incoming WebSocket message"""
    msg_type = data.get("type")
    
    if msg_type == "ping":
        return {"type": "pong", "timestamp": time.time()}
    
    elif msg_type == "generate":
        # Handle generation request
        prompt = data.get("prompt", "")
        
        async def async_generate():
            async for chunk in drs_app.neural_engine.generate_stream(
                prompt=prompt,
                model=data.get("model"),
                context_id=data.get("context_id")
            ):
                ws.send(json.dumps({
                    "type": "generate_chunk",
                    "text": chunk
                }))
            
            ws.send(json.dumps({"type": "generate_done"}))
        
        # Run async
        loop = asyncio.new_event_loop()
        loop.run_until_complete(async_generate())
        loop.close()
        
        return None
    
    elif msg_type == "chat":
        # Handle chat request
        messages = data.get("messages", [])
        
        async def async_chat():
            async for chunk in drs_app.neural_engine.chat(
                messages=messages,
                model=data.get("model"),
                stream=True
            ):
                ws.send(json.dumps({
                    "type": "chat_chunk",
                    "text": chunk
                }))
            
            ws.send(json.dumps({"type": "chat_done"}))
        
        loop = asyncio.new_event_loop()
        loop.run_until_complete(async_chat())
        loop.close()
        
        return None
    
    elif msg_type == "subscribe":
        # Subscribe to events
        return {"type": "subscribed", "channel": data.get("channel")}
    
    else:
        return {"error": f"Unknown message type: {msg_type}"}


def broadcast_to_websockets(message: Dict):
    """Broadcast message to all WebSocket clients"""
    for client in drs_app.websocket_clients:
        try:
            client.send(json.dumps(message))
        except Exception as e:
            logger.error(f"Failed to send to WebSocket client: {e}")


# ==================== Error Handlers ====================

@app.errorhandler(400)
def bad_request(error):
    return jsonify({"error": "Bad request"}), 400


@app.errorhandler(401)
def unauthorized(error):
    return jsonify({"error": "Unauthorized"}), 401


@app.errorhandler(403)
def forbidden(error):
    return jsonify({"error": "Forbidden"}), 403


@app.errorhandler(404)
def not_found(error):
    return jsonify({"error": "Not found"}), 404


@app.errorhandler(500)
def internal_error(error):
    return jsonify({"error": "Internal server error"}), 500


# ==================== Main Entry Point ====================

if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="DRS.VIP-AI Server")
    parser.add_argument("--host", default=config.HOST, help="Host to bind to")
    parser.add_argument("--port", type=int, default=config.PORT, help="Port to bind to")
    parser.add_argument("--debug", action="store_true", help="Enable debug mode")
    args = parser.parse_args()
    
    logger.info(f"Starting DRS.VIP-AI on {args.host}:{args.port}")
    
    app.run(
        host=args.host,
        port=args.port,
        debug=args.debug or config.DEBUG,
        threaded=True
    )