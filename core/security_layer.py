"""
DRS.VIP-AI Security Layer Module
Enterprise-grade security with encryption, authentication, and threat detection
"""

import asyncio
import hashlib
import hmac
import json
import logging
import os
import secrets
import time
import uuid
from base64 import b64decode, b64encode
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
from typing import Any, Dict, List, Optional, Tuple, Union

logger = logging.getLogger(__name__)

# Try to import cryptography libraries
try:
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import rsa, padding, ec
    from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
    from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
    from cryptography.hazmat.backends import default_backend
    from cryptography.exceptions import InvalidSignature
    CRYPTO_AVAILABLE = True
except ImportError:
    CRYPTO_AVAILABLE = False
    logger.warning("Cryptography library not available. Some features disabled.")


class SecurityLevel(Enum):
    """Security classification levels"""
    PUBLIC = "public"
    INTERNAL = "internal"
    CONFIDENTIAL = "confidential"
    TOP_SECRET = "top_secret"


class AuthMethod(Enum):
    """Authentication methods"""
    PASSWORD = "password"
    API_KEY = "api_key"
    WEBAUTHN = "webauthn"
    OAUTH = "oauth"
    JWT = "jwt"
    BIOMETRIC = "biometric"


class ThreatLevel(Enum):
    """Threat severity levels"""
    NONE = 0
    LOW = 1
    MEDIUM = 2
    HIGH = 3
    CRITICAL = 4


@dataclass
class SecurityConfig:
    """Security configuration settings"""
    encryption_algorithm: str = "AES-256-GCM"
    key_derivation_iterations: int = 100000
    session_timeout_minutes: int = 60
    max_login_attempts: int = 5
    lockout_duration_minutes: int = 15
    password_min_length: int = 12
    require_mfa: bool = True
    allowed_auth_methods: List[AuthMethod] = field(default_factory=lambda: [
        AuthMethod.PASSWORD, AuthMethod.API_KEY, AuthMethod.WEBAUTHN
    ])
    jwt_expiry_hours: int = 24
    api_key_expiry_days: int = 365


@dataclass
class User:
    """User account data"""
    id: str
    username: str
    email: str
    password_hash: str
    salt: str
    security_level: SecurityLevel = SecurityLevel.INTERNAL
    roles: List[str] = field(default_factory=list)
    mfa_enabled: bool = False
    mfa_secret: Optional[str] = None
    webauthn_credentials: List[Dict] = field(default_factory=list)
    api_keys: List[Dict] = field(default_factory=list)
    created_at: datetime = field(default_factory=datetime.utcnow)
    last_login: Optional[datetime] = None
    failed_attempts: int = 0
    locked_until: Optional[datetime] = None
    metadata: Dict = field(default_factory=dict)


@dataclass
class Session:
    """User session data"""
    id: str
    user_id: str
    token: str
    created_at: datetime = field(default_factory=datetime.utcnow)
    expires_at: datetime = field(default_factory=lambda: datetime.utcnow() + timedelta(hours=1))
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    is_active: bool = True
    metadata: Dict = field(default_factory=dict)


@dataclass
class ThreatAlert:
    """Security threat alert"""
    id: str
    threat_type: str
    level: ThreatLevel
    source_ip: Optional[str]
    user_id: Optional[str]
    description: str
    timestamp: datetime = field(default_factory=datetime.utcnow)
    resolved: bool = False
    metadata: Dict = field(default_factory=dict)


class EncryptionEngine:
    """Advanced encryption with AES-256-GCM"""
    
    def __init__(self, master_key: Optional[bytes] = None):
        self.master_key = master_key or self._generate_master_key()
        self._backend = default_backend() if CRYPTO_AVAILABLE else None
    
    @staticmethod
    def _generate_master_key() -> bytes:
        """Generate a new master encryption key"""
        return secrets.token_bytes(32)
    
    def encrypt(self, plaintext: Union[str, bytes], key: Optional[bytes] = None) -> Dict:
        """Encrypt data using AES-256-GCM"""
        if not CRYPTO_AVAILABLE:
            raise RuntimeError("Cryptography library required for encryption")
        
        key = key or self.master_key
        if isinstance(plaintext, str):
            plaintext = plaintext.encode('utf-8')
        
        # Generate random IV
        iv = secrets.token_bytes(12)
        
        # Encrypt
        cipher = Cipher(
            algorithms.AES(key),
            modes.GCM(iv),
            backend=self._backend
        )
        encryptor = cipher.encryptor()
        ciphertext = encryptor.update(plaintext) + encryptor.finalize()
        
        return {
            "ciphertext": b64encode(ciphertext).decode('utf-8'),
            "iv": b64encode(iv).decode('utf-8'),
            "tag": b64encode(encryptor.tag).decode('utf-8'),
            "algorithm": "AES-256-GCM"
        }
    
    def decrypt(self, encrypted_data: Dict, key: Optional[bytes] = None) -> str:
        """Decrypt AES-256-GCM encrypted data"""
        if not CRYPTO_AVAILABLE:
            raise RuntimeError("Cryptography library required for decryption")
        
        key = key or self.master_key
        
        ciphertext = b64decode(encrypted_data["ciphertext"])
        iv = b64decode(encrypted_data["iv"])
        tag = b64decode(encrypted_data["tag"])
        
        cipher = Cipher(
            algorithms.AES(key),
            modes.GCM(iv, tag),
            backend=self._backend
        )
        decryptor = cipher.decryptor()
        plaintext = decryptor.update(ciphertext) + decryptor.finalize()
        
        return plaintext.decode('utf-8')
    
    def encrypt_file(self, file_path: str, output_path: Optional[str] = None) -> str:
        """Encrypt a file"""
        with open(file_path, 'rb') as f:
            data = f.read()
        
        encrypted = self.encrypt(data)
        
        output = output_path or f"{file_path}.enc"
        with open(output, 'w') as f:
            json.dump(encrypted, f)
        
        return output
    
    def decrypt_file(self, encrypted_path: str, output_path: Optional[str] = None) -> str:
        """Decrypt a file"""
        with open(encrypted_path, 'r') as f:
            encrypted = json.load(f)
        
        data = self.decrypt(encrypted)
        
        output = output_path or encrypted_path.replace('.enc', '')
        with open(output, 'wb') as f:
            f.write(data.encode('utf-8') if isinstance(data, str) else data)
        
        return output
    
    def derive_key(self, password: str, salt: Optional[bytes] = None) -> Tuple[bytes, bytes]:
        """Derive encryption key from password"""
        if not CRYPTO_AVAILABLE:
            # Fallback to hashlib
            salt = salt or secrets.token_bytes(16)
            key = hashlib.pbkdf2_hmac('sha256', password.encode(), salt, 100000, dklen=32)
            return key, salt
        
        salt = salt or secrets.token_bytes(16)
        kdf = PBKDF2HMAC(
            algorithm=hashes.SHA256(),
            length=32,
            salt=salt,
            iterations=100000,
            backend=self._backend
        )
        key = kdf.derive(password.encode())
        return key, salt


class HashEngine:
    """Secure hashing utilities"""
    
    @staticmethod
    def sha256(data: Union[str, bytes]) -> str:
        """Compute SHA-256 hash"""
        if isinstance(data, str):
            data = data.encode('utf-8')
        return hashlib.sha256(data).hexdigest()
    
    @staticmethod
    def sha512(data: Union[str, bytes]) -> str:
        """Compute SHA-512 hash"""
        if isinstance(data, str):
            data = data.encode('utf-8')
        return hashlib.sha512(data).hexdigest()
    
    @staticmethod
    def blake2b(data: Union[str, bytes], key: Optional[bytes] = None) -> str:
        """Compute BLAKE2b hash"""
        if isinstance(data, str):
            data = data.encode('utf-8')
        return hashlib.blake2b(data, key=key).hexdigest()
    
    @staticmethod
    def hmac_sha256(key: bytes, data: Union[str, bytes]) -> str:
        """Compute HMAC-SHA256"""
        if isinstance(data, str):
            data = data.encode('utf-8')
        return hmac.new(key, data, hashlib.sha256).hexdigest()
    
    @staticmethod
    def password_hash(password: str, salt: Optional[str] = None) -> Tuple[str, str]:
        """Hash password with salt"""
        salt = salt or secrets.token_hex(16)
        hash_value = hashlib.pbkdf2_hmac(
            'sha256',
            password.encode('utf-8'),
            salt.encode('utf-8'),
            100000
        )
        return hash_value.hex(), salt
    
    @staticmethod
    def verify_password(password: str, hash_value: str, salt: str) -> bool:
        """Verify password against hash"""
        new_hash, _ = HashEngine.password_hash(password, salt)
        return hmac.compare_digest(new_hash, hash_value)


class KeyManager:
    """Cryptographic key management"""
    
    def __init__(self):
        self._keys: Dict[str, Dict] = {}
    
    def generate_rsa_keypair(self, key_size: int = 2048) -> Dict:
        """Generate RSA key pair"""
        if not CRYPTO_AVAILABLE:
            raise RuntimeError("Cryptography library required for RSA keys")
        
        private_key = rsa.generate_private_key(
            public_exponent=65537,
            key_size=key_size,
            backend=default_backend()
        )
        
        private_pem = private_key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.PKCS8,
            encryption_algorithm=serialization.NoEncryption()
        )
        
        public_pem = private_key.public_key().public_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PublicFormat.SubjectPublicKeyInfo
        )
        
        return {
            "private_key": private_pem.decode('utf-8'),
            "public_key": public_pem.decode('utf-8'),
            "key_size": key_size,
            "algorithm": "RSA"
        }
    
    def generate_ec_keypair(self, curve: str = "secp384r1") -> Dict:
        """Generate EC key pair"""
        if not CRYPTO_AVAILABLE:
            raise RuntimeError("Cryptography library required for EC keys")
        
        curves = {
            "secp256r1": ec.SECP256R1(),
            "secp384r1": ec.SECP384R1(),
            "secp521r1": ec.SECP521R1()
        }
        
        if curve not in curves:
            raise ValueError(f"Unknown curve: {curve}")
        
        private_key = ec.generate_private_key(
            curves[curve],
            backend=default_backend()
        )
        
        private_pem = private_key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.PKCS8,
            encryption_algorithm=serialization.NoEncryption()
        )
        
        public_pem = private_key.public_key().public_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PublicFormat.SubjectPublicKeyInfo
        )
        
        return {
            "private_key": private_pem.decode('utf-8'),
            "public_key": public_pem.decode('utf-8'),
            "curve": curve,
            "algorithm": "ECDSA"
        }
    
    def generate_aes_key(self, key_size: int = 256) -> Dict:
        """Generate AES key"""
        key_bytes = secrets.token_bytes(key_size // 8)
        return {
            "key": b64encode(key_bytes).decode('utf-8'),
            "key_size": key_size,
            "algorithm": "AES"
        }
    
    def store_key(self, key_id: str, key_data: Dict):
        """Store a key by ID"""
        self._keys[key_id] = {
            **key_data,
            "created_at": datetime.utcnow().isoformat()
        }
    
    def get_key(self, key_id: str) -> Optional[Dict]:
        """Retrieve a key by ID"""
        return self._keys.get(key_id)
    
    def delete_key(self, key_id: str) -> bool:
        """Delete a key"""
        if key_id in self._keys:
            del self._keys[key_id]
            return True
        return False


class TokenManager:
    """JWT and API key token management"""
    
    def __init__(self, secret_key: Optional[str] = None):
        self.secret_key = secret_key or secrets.token_urlsafe(32)
        self._tokens: Dict[str, Dict] = {}
    
    def create_jwt(
        self,
        user_id: str,
        claims: Optional[Dict] = None,
        expires_hours: int = 24
    ) -> str:
        """Create a JWT token"""
        header = b64encode(json.dumps({
            "alg": "HS256",
            "typ": "JWT"
        }).encode()).decode()
        
        now = datetime.utcnow()
        payload = {
            "sub": user_id,
            "iat": int(now.timestamp()),
            "exp": int((now + timedelta(hours=expires_hours)).timestamp()),
            "jti": str(uuid.uuid4()),
            **(claims or {})
        }
        
        payload_b64 = b64encode(json.dumps(payload).encode()).decode()
        
        # Create signature
        message = f"{header}.{payload_b64}"
        signature = HashEngine.hmac_sha256(
            self.secret_key.encode(),
            message
        )
        
        return f"{message}.{signature}"
    
    def verify_jwt(self, token: str) -> Optional[Dict]:
        """Verify and decode JWT token"""
        try:
            parts = token.split('.')
            if len(parts) != 3:
                return None
            
            header_b64, payload_b64, signature = parts
            
            # Verify signature
            message = f"{header_b64}.{payload_b64}"
            expected_sig = HashEngine.hmac_sha256(
                self.secret_key.encode(),
                message
            )
            
            if not hmac.compare_digest(signature, expected_sig):
                return None
            
            # Decode payload
            payload = json.loads(b64decode(payload_b64))
            
            # Check expiration
            if payload.get("exp", 0) < datetime.utcnow().timestamp():
                return None
            
            return payload
        except Exception as e:
            logger.error(f"JWT verification failed: {e}")
            return None
    
    def create_api_key(
        self,
        user_id: str,
        name: str,
        permissions: Optional[List[str]] = None,
        expires_days: int = 365
    ) -> Dict:
        """Create an API key"""
        key_id = str(uuid.uuid4())
        key_secret = secrets.token_urlsafe(32)
        key_hash = HashEngine.sha256(key_secret)
        
        now = datetime.utcnow()
        key_data = {
            "id": key_id,
            "user_id": user_id,
            "name": name,
            "key_hash": key_hash,
            "key_prefix": f"drsvip-{key_id[:8]}",
            "permissions": permissions or [],
            "created_at": now.isoformat(),
            "expires_at": (now + timedelta(days=expires_days)).isoformat(),
            "last_used": None,
            "usage_count": 0
        }
        
        self._tokens[key_id] = key_data
        
        return {
            "id": key_id,
            "key": f"drsvip-{key_id}:{key_secret}",
            "name": name,
            "expires_at": key_data["expires_at"]
        }
    
    def verify_api_key(self, key: str) -> Optional[Dict]:
        """Verify an API key"""
        try:
            if not key.startswith("drsvip-"):
                return None
            
            parts = key.split(":")
            if len(parts) != 2:
                return None
            
            key_id_part, key_secret = parts
            key_id = key_id_part.replace("drsvip-", "")
            
            key_data = self._tokens.get(key_id)
            if not key_data:
                return None
            
            # Verify hash
            key_hash = HashEngine.sha256(key_secret)
            if not hmac.compare_digest(key_hash, key_data["key_hash"]):
                return None
            
            # Check expiration
            expires_at = datetime.fromisoformat(key_data["expires_at"])
            if datetime.utcnow() > expires_at:
                return None
            
            # Update usage
            key_data["last_used"] = datetime.utcnow().isoformat()
            key_data["usage_count"] += 1
            
            return key_data
        except Exception as e:
            logger.error(f"API key verification failed: {e}")
            return None
    
    def revoke_token(self, token_id: str) -> bool:
        """Revoke a token by ID"""
        if token_id in self._tokens:
            del self._tokens[token_id]
            return True
        return False


class ThreatDetector:
    """Security threat detection and response"""
    
    def __init__(self):
        self.alerts: List[ThreatAlert] = []
        self.rate_limits: Dict[str, List[float]] = {}
        self.blocked_ips: Dict[str, datetime] = {}
    
    def check_rate_limit(
        self,
        identifier: str,
        max_requests: int = 100,
        window_seconds: int = 60
    ) -> bool:
        """Check if request is within rate limit"""
        now = time.time()
        window_start = now - window_seconds
        
        if identifier not in self.rate_limits:
            self.rate_limits[identifier] = []
        
        # Clean old requests
        self.rate_limits[identifier] = [
            t for t in self.rate_limits[identifier] if t > window_start
        ]
        
        if len(self.rate_limits[identifier]) >= max_requests:
            return False
        
        self.rate_limits[identifier].append(now)
        return True
    
    def detect_brute_force(
        self,
        identifier: str,
        failed_attempts: int,
        threshold: int = 5,
        window_minutes: int = 15
    ) -> bool:
        """Detect brute force attack pattern"""
        return failed_attempts >= threshold
    
    def detect_sql_injection(self, input_string: str) -> bool:
        """Detect SQL injection patterns"""
        patterns = [
            "' OR '", "' AND '", "UNION SELECT", "DROP TABLE",
            "--", "/*", "*/", ";--", "EXEC(", "EXECUTE(",
            "xp_cmdshell", "sp_executesql", "INTO OUTFILE"
        ]
        
        input_upper = input_string.upper()
        for pattern in patterns:
            if pattern.upper() in input_upper:
                return True
        return False
    
    def detect_xss(self, input_string: str) -> bool:
        """Detect XSS patterns"""
        patterns = [
            "<script", "javascript:", "onerror=", "onload=",
            "onclick=", "onmouseover=", "<iframe", "document.cookie",
            "eval(", "alert(", "setTimeout(", "setInterval("
        ]
        
        input_lower = input_string.lower()
        for pattern in patterns:
            if pattern.lower() in input_lower:
                return True
        return False
    
    def detect_path_traversal(self, input_string: str) -> bool:
        """Detect path traversal attempts"""
        patterns = ["../", "..\&quot;, "%2e%2e%2f", "%2e%2e/", "..%2f", "%2e%2e%5c"]
        
        for pattern in patterns:
            if pattern in input_string.lower():
                return True
        return False
    
    def detect_command_injection(self, input_string: str) -> bool:
        """Detect command injection patterns"""
        patterns = [
            "; ", "| ", "&&", "||", "`", "$(", "${", 
            "> ", "< ", ">>", "<<", " | ", "& ",
            "\n", "\r", "%0a", "%0d"
        ]
        
        for pattern in patterns:
            if pattern in input_string:
                return True
        return False
    
    def block_ip(self, ip_address: str, duration_minutes: int = 60):
        """Block an IP address"""
        self.blocked_ips[ip_address] = datetime.utcnow() + timedelta(minutes=duration_minutes)
    
    def is_ip_blocked(self, ip_address: str) -> bool:
        """Check if IP is blocked"""
        if ip_address not in self.blocked_ips:
            return False
        
        if datetime.utcnow() > self.blocked_ips[ip_address]:
            del self.blocked_ips[ip_address]
            return False
        
        return True
    
    def create_alert(
        self,
        threat_type: str,
        level: ThreatLevel,
        description: str,
        source_ip: Optional[str] = None,
        user_id: Optional[str] = None
    ) -> ThreatAlert:
        """Create a security alert"""
        alert = ThreatAlert(
            id=str(uuid.uuid4()),
            threat_type=threat_type,
            level=level,
            source_ip=source_ip,
            user_id=user_id,
            description=description
        )
        
        self.alerts.append(alert)
        logger.warning(f"Security alert: {threat_type} - {description}")
        
        return alert
    
    def get_alerts(
        self,
        level: Optional[ThreatLevel] = None,
        resolved: Optional[bool] = None,
        limit: int = 100
    ) -> List[ThreatAlert]:
        """Get security alerts"""
        alerts = self.alerts
        
        if level is not None:
            alerts = [a for a in alerts if a.level == level]
        
        if resolved is not None:
            alerts = [a for a in alerts if a.resolved == resolved]
        
        return alerts[-limit:]
    
    def resolve_alert(self, alert_id: str) -> bool:
        """Mark an alert as resolved"""
        for alert in self.alerts:
            if alert.id == alert_id:
                alert.resolved = True
                return True
        return False


class SecurityLayer:
    """Main security orchestration layer"""
    
    def __init__(self, config: Optional[SecurityConfig] = None):
        self.config = config or SecurityConfig()
        self.encryption = EncryptionEngine()
        self.hashing = HashEngine()
        self.keys = KeyManager()
        self.tokens = TokenManager()
        self.threats = ThreatDetector()
        
        self.users: Dict[str, User] = {}
        self.sessions: Dict[str, Session] = {}
    
    async def initialize(self):
        """Initialize security layer"""
        logger.info("Security layer initialized")
    
    async def shutdown(self):
        """Shutdown security layer"""
        self.sessions.clear()
        logger.info("Security layer shutdown complete")
    
    def register_user(
        self,
        username: str,
        email: str,
        password: str,
        security_level: SecurityLevel = SecurityLevel.INTERNAL,
        roles: Optional[List[str]] = None
    ) -> User:
        """Register a new user"""
        # Validate password
        if len(password) < self.config.password_min_length:
            raise ValueError(f"Password must be at least {self.config.password_min_length} characters")
        
        # Check for existing user
        for user in self.users.values():
            if user.username == username:
                raise ValueError("Username already exists")
            if user.email == email:
                raise ValueError("Email already registered")
        
        # Hash password
        password_hash, salt = self.hashing.password_hash(password)
        
        # Create user
        user = User(
            id=str(uuid.uuid4()),
            username=username,
            email=email,
            password_hash=password_hash,
            salt=salt,
            security_level=security_level,
            roles=roles or ["user"]
        )
        
        self.users[user.id] = user
        logger.info(f"User registered: {username}")
        
        return user
    
    def authenticate(
        self,
        username: str,
        password: str,
        ip_address: Optional[str] = None
    ) -> Tuple[Optional[Session], Optional[str]]:
        """Authenticate a user with password"""
        # Find user
        user = None
        for u in self.users.values():
            if u.username == username:
                user = u
                break
        
        if not user:
            return None, "User not found"
        
        # Check lockout
        if user.locked_until and datetime.utcnow() < user.locked_until:
            return None, "Account locked"
        
        # Verify password
        if not self.hashing.verify_password(password, user.password_hash, user.salt):
            user.failed_attempts += 1
            
            if user.failed_attempts >= self.config.max_login_attempts:
                user.locked_until = datetime.utcnow() + timedelta(
                    minutes=self.config.lockout_duration_minutes
                )
                self.threats.create_alert(
                    "brute_force",
                    ThreatLevel.HIGH,
                    f"Account locked due to failed login attempts: {username}",
                    source_ip=ip_address,
                    user_id=user.id
                )
            
            return None, "Invalid password"
        
        # Reset failed attempts
        user.failed_attempts = 0
        user.last_login = datetime.utcnow()
        
        # Create session
        session = Session(
            id=str(uuid.uuid4()),
            user_id=user.id,
            token=self.tokens.create_jwt(user.id),
            ip_address=ip_address
        )
        
        self.sessions[session.id] = session
        
        return session, None
    
    def authenticate_api_key(self, key: str) -> Tuple[Optional[User], Optional[str]]:
        """Authenticate with API key"""
        key_data = self.tokens.verify_api_key(key)
        
        if not key_data:
            return None, "Invalid API key"
        
        user = self.users.get(key_data["user_id"])
        
        if not user:
            return None, "User not found"
        
        return user, None
    
    def validate_session(self, token: str) -> Optional[User]:
        """Validate a session token"""
        payload = self.tokens.verify_jwt(token)
        
        if not payload:
            return None
        
        user_id = payload.get("sub")
        return self.users.get(user_id)
    
    def logout(self, session_id: str) -> bool:
        """End a session"""
        if session_id in self.sessions:
            self.sessions[session_id].is_active = False
            del self.sessions[session_id]
            return True
        return False
    
    def check_permission(self, user: User, permission: str) -> bool:
        """Check if user has a specific permission"""
        role_permissions = {
            "admin": ["read", "write", "delete", "admin", "manage_users"],
            "user": ["read", "write"],
            "viewer": ["read"]
        }
        
        for role in user.roles:
            if permission in role_permissions.get(role, []):
                return True
        
        return False
    
    def sanitize_input(self, input_string: str) -> str:
        """Sanitize user input"""
        # Remove potentially dangerous characters
        dangerous = ["<", ">", "&quot;", "'", "&", "\&quot;, "\n", "\r", "\t"]
        
        sanitized = input_string
        for char in dangerous:
            sanitized = sanitized.replace(char, f"\\u{ord(char):04x}")
        
        return sanitized
    
    def validate_request(
        self,
        ip_address: str,
        user_id: Optional[str],
        endpoint: str,
        payload: Optional[str] = None
    ) -> Tuple[bool, Optional[str]]:
        """Validate an incoming request"""
        # Check IP blocklist
        if self.threats.is_ip_blocked(ip_address):
            return False, "IP blocked"
        
        # Rate limiting
        if not self.threats.check_rate_limit(ip_address):
            self.threats.block_ip(ip_address, 5)
            return False, "Rate limit exceeded"
        
        # Check for injection attacks if payload exists
        if payload:
            if self.threats.detect_sql_injection(payload):
                self.threats.create_alert(
                    "sql_injection",
                    ThreatLevel.HIGH,
                    f"SQL injection attempt on {endpoint}",
                    source_ip=ip_address,
                    user_id=user_id
                )
                return False, "Invalid input detected"
            
            if self.threats.detect_xss(payload):
                self.threats.create_alert(
                    "xss",
                    ThreatLevel.MEDIUM,
                    f"XSS attempt on {endpoint}",
                    source_ip=ip_address,
                    user_id=user_id
                )
                return False, "Invalid input detected"
            
            if self.threats.detect_path_traversal(payload):
                self.threats.create_alert(
                    "path_traversal",
                    ThreatLevel.HIGH,
                    f"Path traversal attempt on {endpoint}",
                    source_ip=ip_address,
                    user_id=user_id
                )
                return False, "Invalid input detected"
            
            if self.threats.detect_command_injection(payload):
                self.threats.create_alert(
                    "command_injection",
                    ThreatLevel.CRITICAL,
                    f"Command injection attempt on {endpoint}",
                    source_ip=ip_address,
                    user_id=user_id
                )
                return False, "Invalid input detected"
        
        return True, None
    
    def get_security_status(self) -> Dict:
        """Get security status summary"""
        return {
            "users": len(self.users),
            "active_sessions": len([s for s in self.sessions.values() if s.is_active]),
            "alerts": {
                "total": len(self.threats.alerts),
                "unresolved": len([a for a in self.threats.alerts if not a.resolved]),
                "critical": len([a for a in self.threats.alerts if a.level == ThreatLevel.CRITICAL and not a.resolved])
            },
            "blocked_ips": len(self.threats.blocked_ips),
            "rate_limited": len(self.threats.rate_limits)
        }


# Export classes
__all__ = [
    "SecurityLayer",
    "SecurityConfig",
    "EncryptionEngine",
    "HashEngine",
    "KeyManager",
    "TokenManager",
    "ThreatDetector",
    "SecurityLevel",
    "AuthMethod",
    "ThreatLevel",
    "User",
    "Session",
    "ThreatAlert"
]