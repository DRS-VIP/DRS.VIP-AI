"""
DRS.VIP-AI Configuration Module
World's Most Advanced AI Command Operating Environment
Configuration settings for the entire system
"""

import os
from datetime import timedelta

class Config:
    """Base configuration class"""
    
    # Application Settings
    APP_NAME = "DRS.VIP-AI"
    APP_VERSION = "1.0.0"
    APP_AUTHOR = "DRS Engineering Team"
    SECRET_KEY = os.environ.get('SECRET_KEY') or 'drs-vip-ai-secret-key-change-in-production'
    
    # Server Configuration
    HOST = os.environ.get('HOST', '0.0.0.0')
    PORT = int(os.environ.get('PORT', 5000))
    DEBUG = os.environ.get('DEBUG', 'True').lower() == 'true'
    
    # Security Settings
    SECURITY_PASSWORD_SALT = os.environ.get('SECURITY_PASSWORD_SALT', 'drs-security-salt')
    SESSION_COOKIE_SECURE = True
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = 'Lax'
    PERMANENT_SESSION_LIFETIME = timedelta(hours=24)
    
    # Rate Limiting
    RATE_LIMIT_ENABLED = True
    RATE_LIMIT_REQUESTS = 100
    RATE_LIMIT_WINDOW = 60  # seconds
    
    # CORS Settings
    CORS_ORIGINS = os.environ.get('CORS_ORIGINS', '*')
    CORS_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
    CORS_HEADERS = ['Content-Type', 'Authorization', 'X-Requested-With']
    
    # Ollama Configuration
    OLLAMA_BASE_URL = os.environ.get('OLLAMA_BASE_URL', 'http://localhost:11434')
    OLLAMA_DEFAULT_MODEL = os.environ.get('OLLAMA_DEFAULT_MODEL', 'llama3.2')
    OLLAMA_TIMEOUT = int(os.environ.get('OLLAMA_TIMEOUT', 120))
    OLLAMA_MAX_TOKENS = int(os.environ.get('OLLAMA_MAX_TOKENS', 4096))
    OLLAMA_TEMPERATURE = float(os.environ.get('OLLAMA_TEMPERATURE', 0.7))
    
    # Vector Memory Settings
    VECTOR_DIMENSION = 1536
    VECTOR_MEMORY_MAX_ENTRIES = 100000
    EMBEDDING_MODEL = os.environ.get('EMBEDDING_MODEL', 'nomic-embed-text')
    
    # Neural Engine Settings
    NEURAL_PREDICTION_ENABLED = True
    NEURAL_CONTEXT_WINDOW = 8192
    NEURAL_MAX_HISTORY = 1000
    
    # Prediction Engine Settings
    PREDICTION_MIN_SAMPLES = 5
    PREDICTION_CONFIDENCE_THRESHOLD = 0.7
    PREDICTION_MODEL_UPDATE_INTERVAL = 3600  # seconds
    
    # Logging Configuration
    LOG_LEVEL = os.environ.get('LOG_LEVEL', 'INFO')
    LOG_FORMAT = '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
    LOG_FILE = os.environ.get('LOG_FILE', 'logs/drs-vip-ai.log')
    
    # Database Settings (for persistent storage)
    DATABASE_URL = os.environ.get('DATABASE_URL', 'sqlite:///drs_vip_ai.db')
    DATABASE_POOL_SIZE = 10
    DATABASE_MAX_OVERFLOW = 20
    
    # Cache Settings
    CACHE_TYPE = 'simple'
    CACHE_DEFAULT_TIMEOUT = 300
    
    # WebSocket Settings
    WEBSOCKET_ENABLED = True
    WEBSOCKET_PORT = int(os.environ.get('WEBSOCKET_PORT', 8765))
    
    # GPU/Graphics Settings
    WEBGL_ENABLED = True
    MAX_PARTICLES = 30000
    PARTICLE_UPDATE_FREQUENCY = 60  # Hz
    
    # Feature Flags
    FEATURES = {
        'neural_prediction': True,
        'voice_interface': True,
        'biometric_auth': False,
        'offline_mode': True,
        'holographic_ui': True,
        'semantic_memory': True,
        'command_prediction': True,
        'system_monitoring': True,
        'gpu_acceleration': True
    }


class DevelopmentConfig(Config):
    """Development configuration"""
    DEBUG = True
    TESTING = False
    SESSION_COOKIE_SECURE = False


class ProductionConfig(Config):
    """Production configuration"""
    DEBUG = False
    TESTING = False
    SESSION_COOKIE_SECURE = True
    
    # Enhanced security for production
    FORCE_HTTPS = True
    HSTS_MAX_AGE = 31536000


class TestingConfig(Config):
    """Testing configuration"""
    DEBUG = True
    TESTING = True
    DATABASE_URL = 'sqlite:///:memory:'


# Configuration mapping
config_by_name = {
    'development': DevelopmentConfig,
    'production': ProductionConfig,
    'testing': TestingConfig
}


def get_config():
    """Get configuration based on environment"""
    env = os.environ.get('FLASK_ENV', 'development')
    return config_by_name.get(env, DevelopmentConfig)