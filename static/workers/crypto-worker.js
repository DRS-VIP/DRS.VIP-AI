/**
 * DRS.VIP-AI Crypto Worker
 * Handles cryptographic operations in a separate thread
 * @version 1.0.0
 * @author DRS.VIP-AI Engineering Team
 */

'use strict';

// ============================================================================
// CRYPTO WORKER CONFIGURATION
// ============================================================================

const CRYPTO_CONFIG = {
    hashAlgorithm: 'SHA-256',
    encryptionAlgorithm: 'AES-GCM',
    keyLength: 256,
    ivLength: 12,
    saltLength: 16,
    iterations: 100000
};

// ============================================================================
// CRYPTO UTILITIES
// ============================================================================

class CryptoUtils {
    /**
     * Convert ArrayBuffer to Base64 string
     */
    static arrayBufferToBase64(buffer) {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    }

    /**
     * Convert Base64 string to ArrayBuffer
     */
    static base64ToArrayBuffer(base64) {
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
            bytes[i] = binary.charCodeAt(i);
        }
        return bytes.buffer;
    }

    /**
     * Convert string to ArrayBuffer
     */
    static stringToArrayBuffer(str) {
        return new TextEncoder().encode(str);
    }

    /**
     * Convert ArrayBuffer to string
     */
    static arrayBufferToString(buffer) {
        return new TextDecoder().decode(buffer);
    }

    /**
     * Concatenate ArrayBuffers
     */
    static concatBuffers(...buffers) {
        const totalLength = buffers.reduce((sum, buf) => sum + buf.byteLength, 0);
        const result = new Uint8Array(totalLength);
        let offset = 0;
        for (const buffer of buffers) {
            result.set(new Uint8Array(buffer), offset);
            offset += buffer.byteLength;
        }
        return result.buffer;
    }

    /**
     * Generate random bytes
     */
    static getRandomBytes(length) {
        return crypto.getRandomValues(new Uint8Array(length));
    }

    /**
     * Generate UUID v4
     */
    static generateUUID() {
        return crypto.randomUUID();
    }
}

// ============================================================================
// HASH ENGINE
// ============================================================================

class HashEngine {
    constructor() {
        this.algorithms = {
            'SHA-1': 'SHA-1',
            'SHA-256': 'SHA-256',
            'SHA-384': 'SHA-384',
            'SHA-512': 'SHA-512'
        };
    }

    /**
     * Hash data using specified algorithm
     */
    async hash(data, algorithm = CRYPTO_CONFIG.hashAlgorithm) {
        const buffer = typeof data === 'string' 
            ? CryptoUtils.stringToArrayBuffer(data) 
            : data;

        const hashBuffer = await crypto.subtle.digest(algorithm, buffer);
        return {
            hash: CryptoUtils.arrayBufferToBase64(hashBuffer),
            algorithm,
            hex: this.bufferToHex(hashBuffer)
        };
    }

    /**
     * Create HMAC
     */
    async hmac(data, key, algorithm = CRYPTO_CONFIG.hashAlgorithm) {
        const keyBuffer = typeof key === 'string' 
            ? CryptoUtils.stringToArrayBuffer(key) 
            : key;
        
        const dataBuffer = typeof data === 'string' 
            ? CryptoUtils.stringToArrayBuffer(data) 
            : data;

        const cryptoKey = await crypto.subtle.importKey(
            'raw',
            keyBuffer,
            { name: 'HMAC', hash: algorithm },
            false,
            ['sign']
        );

        const signature = await crypto.subtle.sign('HMAC', cryptoKey, dataBuffer);
        
        return {
            signature: CryptoUtils.arrayBufferToBase64(signature),
            algorithm,
            hex: this.bufferToHex(signature)
        };
    }

    /**
     * Verify HMAC
     */
    async verifyHmac(data, signature, key, algorithm = CRYPTO_CONFIG.hashAlgorithm) {
        const keyBuffer = typeof key === 'string' 
            ? CryptoUtils.stringToArrayBuffer(key) 
            : key;
        
        const dataBuffer = typeof data === 'string' 
            ? CryptoUtils.stringToArrayBuffer(data) 
            : data;

        const signatureBuffer = typeof signature === 'string' 
            ? CryptoUtils.base64ToArrayBuffer(signature) 
            : signature;

        const cryptoKey = await crypto.subtle.importKey(
            'raw',
            keyBuffer,
            { name: 'HMAC', hash: algorithm },
            false,
            ['verify']
        );

        return await crypto.subtle.verify('HMAC', cryptoKey, signatureBuffer, dataBuffer);
    }

    /**
     * Convert buffer to hex string
     */
    bufferToHex(buffer) {
        const bytes = new Uint8Array(buffer);
        return Array.from(bytes)
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
    }

    /**
     * Hash file in chunks
     */
    async hashFile(file, algorithm = CRYPTO_CONFIG.hashAlgorithm, chunkSize = 1024 * 1024) {
        const chunks = Math.ceil(file.size / chunkSize);
        let offset = 0;

        // For file hashing, we'll use a streaming approach
        const reader = new FileReader();
        
        return new Promise((resolve, reject) => {
            const hashChunks = [];
            
            reader.onload = async (e) => {
                const chunk = e.target.result;
                const hashBuffer = await crypto.subtle.digest(algorithm, chunk);
                hashChunks.push(new Uint8Array(hashBuffer));

                offset += chunkSize;
                
                if (offset < file.size) {
                    readNextChunk();
                } else {
                    // Combine all chunk hashes
                    const combined = CryptoUtils.concatBuffers(...hashChunks);
                    const finalHash = await crypto.subtle.digest(algorithm, combined);
                    resolve({
                        hash: CryptoUtils.arrayBufferToBase64(finalHash),
                        algorithm,
                        hex: this.bufferToHex(finalHash),
                        chunks,
                        fileSize: file.size
                    });
                }
            };

            reader.onerror = reject;

            const readNextChunk = () => {
                const end = Math.min(offset + chunkSize, file.size);
                const slice = file.slice(offset, end);
                reader.readAsArrayBuffer(slice);
            };

            readNextChunk();
        });
    }
}

// ============================================================================
// ENCRYPTION ENGINE
// ============================================================================

class EncryptionEngine {
    constructor() {
        this.algorithm = CRYPTO_CONFIG.encryptionAlgorithm;
        this.keyLength = CRYPTO_CONFIG.keyLength;
        this.ivLength = CRYPTO_CONFIG.ivLength;
    }

    /**
     * Generate a new encryption key
     */
    async generateKey() {
        const key = await crypto.subtle.generateKey(
            {
                name: this.algorithm,
                length: this.keyLength
            },
            true,
            ['encrypt', 'decrypt']
        );

        return await this.exportKey(key);
    }

    /**
     * Derive key from password
     */
    async deriveKey(password, salt = null) {
        const saltBuffer = salt 
            ? (typeof salt === 'string' ? CryptoUtils.base64ToArrayBuffer(salt) : salt)
            : CryptoUtils.getRandomBytes(CRYPTO_CONFIG.saltLength);

        const passwordBuffer = typeof password === 'string' 
            ? CryptoUtils.stringToArrayBuffer(password) 
            : password;

        const keyMaterial = await crypto.subtle.importKey(
            'raw',
            passwordBuffer,
            'PBKDF2',
            false,
            ['deriveBits', 'deriveKey']
        );

        const key = await crypto.subtle.deriveKey(
            {
                name: 'PBKDF2',
                salt: saltBuffer,
                iterations: CRYPTO_CONFIG.iterations,
                hash: 'SHA-256'
            },
            keyMaterial,
            { name: this.algorithm, length: this.keyLength },
            true,
            ['encrypt', 'decrypt']
        );

        return {
            key: await this.exportKey(key),
            salt: CryptoUtils.arrayBufferToBase64(saltBuffer)
        };
    }

    /**
     * Export key to Base64
     */
    async exportKey(key) {
        const exported = await crypto.subtle.exportKey('raw', key);
        return CryptoUtils.arrayBufferToBase64(exported);
    }

    /**
     * Import key from Base64
     */
    async importKey(keyData) {
        const keyBuffer = typeof keyData === 'string' 
            ? CryptoUtils.base64ToArrayBuffer(keyData) 
            : keyData;

        return await crypto.subtle.importKey(
            'raw',
            keyBuffer,
            { name: this.algorithm, length: this.keyLength },
            true,
            ['encrypt', 'decrypt']
        );
    }

    /**
     * Encrypt data
     */
    async encrypt(data, keyData) {
        const key = await this.importKey(keyData);
        const iv = CryptoUtils.getRandomBytes(this.ivLength);

        const dataBuffer = typeof data === 'string' 
            ? CryptoUtils.stringToArrayBuffer(data) 
            : data;

        const encrypted = await crypto.subtle.encrypt(
            {
                name: this.algorithm,
                iv: iv
            },
            key,
            dataBuffer
        );

        // Combine IV and encrypted data
        const combined = CryptoUtils.concatBuffers(iv, encrypted);

        return {
            encrypted: CryptoUtils.arrayBufferToBase64(combined),
            iv: CryptoUtils.arrayBufferToBase64(iv),
            algorithm: this.algorithm
        };
    }

    /**
     * Decrypt data
     */
    async decrypt(encryptedData, keyData) {
        const key = await this.importKey(keyData);
        
        const combined = typeof encryptedData === 'string' 
            ? CryptoUtils.base64ToArrayBuffer(encryptedData) 
            : encryptedData;

        // Extract IV and encrypted data
        const combinedArray = new Uint8Array(combined);
        const iv = combinedArray.slice(0, this.ivLength);
        const encrypted = combinedArray.slice(this.ivLength);

        const decrypted = await crypto.subtle.decrypt(
            {
                name: this.algorithm,
                iv: iv
            },
            key,
            encrypted
        );

        return {
            decrypted: CryptoUtils.arrayBufferToString(decrypted),
            raw: decrypted
        };
    }

    /**
     * Encrypt object (JSON)
     */
    async encryptObject(obj, keyData) {
        const json = JSON.stringify(obj);
        return await this.encrypt(json, keyData);
    }

    /**
     * Decrypt to object (JSON)
     */
    async decryptObject(encryptedData, keyData) {
        const { decrypted } = await this.decrypt(encryptedData, keyData);
        return JSON.parse(decrypted);
    }
}

// ============================================================================
// KEY MANAGEMENT
// ============================================================================

class KeyManager {
    constructor() {
        this.keys = new Map();
        this.keyPairs = new Map();
    }

    /**
     * Generate RSA key pair
     */
    async generateKeyPair(modulusLength = 2048) {
        const keyPair = await crypto.subtle.generateKey(
            {
                name: 'RSA-OAEP',
                modulusLength: modulusLength,
                publicExponent: new Uint8Array([1, 0, 1]),
                hash: 'SHA-256'
            },
            true,
            ['encrypt', 'decrypt']
        );

        const publicKey = await crypto.subtle.exportKey('spki', keyPair.publicKey);
        const privateKey = await crypto.subtle.exportKey('pkcs8', keyPair.privateKey);

        return {
            publicKey: CryptoUtils.arrayBufferToBase64(publicKey),
            privateKey: CryptoUtils.arrayBufferToBase64(privateKey),
            modulusLength
        };
    }

    /**
     * Generate ECDSA key pair
     */
    async generateECDSAKeyPair(namedCurve = 'P-256') {
        const keyPair = await crypto.subtle.generateKey(
            {
                name: 'ECDSA',
                namedCurve: namedCurve
            },
            true,
            ['sign', 'verify']
        );

        const publicKey = await crypto.subtle.exportKey('spki', keyPair.publicKey);
        const privateKey = await crypto.subtle.exportKey('pkcs8', keyPair.privateKey);

        return {
            publicKey: CryptoUtils.arrayBufferToBase64(publicKey),
            privateKey: CryptoUtils.arrayBufferToBase64(privateKey),
            namedCurve
        };
    }

    /**
     * Sign data with private key
     */
    async sign(data, privateKeyData, algorithm = 'ECDSA', hash = 'SHA-256') {
        const privateKeyBuffer = typeof privateKeyData === 'string' 
            ? CryptoUtils.base64ToArrayBuffer(privateKeyData) 
            : privateKeyData;

        const dataBuffer = typeof data === 'string' 
            ? CryptoUtils.stringToArrayBuffer(data) 
            : data;

        let privateKey, signParams;

        if (algorithm === 'ECDSA') {
            privateKey = await crypto.subtle.importKey(
                'pkcs8',
                privateKeyBuffer,
                { name: 'ECDSA', namedCurve: 'P-256' },
                false,
                ['sign']
            );
            signParams = { name: 'ECDSA', hash };
        } else if (algorithm === 'RSA-PSS') {
            privateKey = await crypto.subtle.importKey(
                'pkcs8',
                privateKeyBuffer,
                { name: 'RSA-PSS', hash: 'SHA-256' },
                false,
                ['sign']
            );
            signParams = { name: 'RSA-PSS', saltLength: 32 };
        }

        const signature = await crypto.subtle.sign(signParams, privateKey, dataBuffer);
        
        return {
            signature: CryptoUtils.arrayBufferToBase64(signature),
            algorithm,
            hash
        };
    }

    /**
     * Verify signature with public key
     */
    async verify(data, signature, publicKeyData, algorithm = 'ECDSA', hash = 'SHA-256') {
        const publicKeyBuffer = typeof publicKeyData === 'string' 
            ? CryptoUtils.base64ToArrayBuffer(publicKeyData) 
            : publicKeyData;

        const dataBuffer = typeof data === 'string' 
            ? CryptoUtils.stringToArrayBuffer(data) 
            : data;

        const signatureBuffer = typeof signature === 'string' 
            ? CryptoUtils.base64ToArrayBuffer(signature) 
            : signature;

        let publicKey, verifyParams;

        if (algorithm === 'ECDSA') {
            publicKey = await crypto.subtle.importKey(
                'spki',
                publicKeyBuffer,
                { name: 'ECDSA', namedCurve: 'P-256' },
                false,
                ['verify']
            );
            verifyParams = { name: 'ECDSA', hash };
        } else if (algorithm === 'RSA-PSS') {
            publicKey = await crypto.subtle.importKey(
                'spki',
                publicKeyBuffer,
                { name: 'RSA-PSS', hash: 'SHA-256' },
                false,
                ['verify']
            );
            verifyParams = { name: 'RSA-PSS', saltLength: 32 };
        }

        return await crypto.subtle.verify(verifyParams, publicKey, signatureBuffer, dataBuffer);
    }

    /**
     * Store key in memory
     */
    storeKey(id, keyData) {
        this.keys.set(id, {
            key: keyData,
            createdAt: Date.now()
        });
    }

    /**
     * Retrieve key from memory
     */
    getKey(id) {
        const entry = this.keys.get(id);
        return entry ? entry.key : null;
    }

    /**
     * Remove key from memory
     */
    removeKey(id) {
        return this.keys.delete(id);
    }

    /**
     * List stored key IDs
     */
    listKeys() {
        return Array.from(this.keys.keys());
    }

    /**
     * Clear all stored keys
     */
    clearAll() {
        this.keys.clear();
        this.keyPairs.clear();
    }
}

// ============================================================================
// SECURE RANDOM GENERATOR
// ============================================================================

class SecureRandom {
    /**
     * Generate random integer
     */
    static randomInt(min, max) {
        const range = max - min + 1;
        const bytesNeeded = Math.ceil(Math.log2(range) / 8) || 1;
        const randomBytes = crypto.getRandomValues(new Uint8Array(bytesNeeded));
        let randomValue = 0;
        
        for (let i = 0; i < bytesNeeded; i++) {
            randomValue = (randomValue << 8) | randomBytes[i];
        }
        
        return min + (randomValue % range);
    }

    /**
     * Generate random string
     */
    static randomString(length, charset = 'alphanumeric') {
        const sets = {
            numeric: '0123456789',
            alphabetic: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ',
            alphanumeric: '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ',
            hex: '0123456789abcdef',
            base64: '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ+/',
            full: '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ!@#$%^&*()_+-=[]{}|;:,.<>?'
        };

        const chars = sets[charset] || sets.alphanumeric;
        const randomBytes = crypto.getRandomValues(new Uint8Array(length));
        let result = '';

        for (let i = 0; i < length; i++) {
            result += chars[randomBytes[i] % chars.length];
        }

        return result;
    }

    /**
     * Generate secure token
     */
    static generateToken(bytes = 32) {
        const randomBytes = crypto.getRandomValues(new Uint8Array(bytes));
        return CryptoUtils.arrayBufferToBase64(randomBytes);
    }

    /**
     * Generate API key
     */
    static generateAPIKey(prefix = 'sk') {
        const randomPart = this.randomString(32, 'alphanumeric');
        return `${prefix}_${randomPart}`;
    }

    /**
     * Shuffle array using Fisher-Yates
     */
    static shuffle(array) {
        const result = [...array];
        const randomBytes = crypto.getRandomValues(new Uint8Array(result.length));
        
        for (let i = result.length - 1; i > 0; i--) {
            const j = randomBytes[i] % (i + 1);
            [result[i], result[j]] = [result[j], result[i]];
        }
        
        return result;
    }
}

// ============================================================================
// CRYPTO WORKER MAIN CLASS
// ============================================================================

class CryptoWorker {
    constructor() {
        this.hashEngine = new HashEngine();
        this.encryptionEngine = new EncryptionEngine();
        this.keyManager = new KeyManager();
        this.stats = {
            operations: 0,
            errors: 0
        };

        this.setupMessageHandler();
    }

    setupMessageHandler() {
        self.onmessage = async (event) => {
            const { type, payload, requestId } = event.data;

            try {
                let result;

                switch (type) {
                    // Hash operations
                    case 'HASH':
                        result = await this.hashEngine.hash(payload.data, payload.algorithm);
                        break;

                    case 'HMAC':
                        result = await this.hashEngine.hmac(payload.data, payload.key, payload.algorithm);
                        break;

                    case 'VERIFY_HMAC':
                        result = await this.hashEngine.verifyHmac(
                            payload.data, 
                            payload.signature, 
                            payload.key, 
                            payload.algorithm
                        );
                        break;

                    // Encryption operations
                    case 'GENERATE_KEY':
                        result = await this.encryptionEngine.generateKey();
                        break;

                    case 'DERIVE_KEY':
                        result = await this.encryptionEngine.deriveKey(payload.password, payload.salt);
                        break;

                    case 'ENCRYPT':
                        result = await this.encryptionEngine.encrypt(payload.data, payload.key);
                        break;

                    case 'DECRYPT':
                        result = await this.encryptionEngine.decrypt(payload.data, payload.key);
                        break;

                    case 'ENCRYPT_OBJECT':
                        result = await this.encryptionEngine.encryptObject(payload.data, payload.key);
                        break;

                    case 'DECRYPT_OBJECT':
                        result = await this.encryptionEngine.decryptObject(payload.data, payload.key);
                        break;

                    // Key management
                    case 'GENERATE_KEY_PAIR':
                        result = await this.keyManager.generateKeyPair(payload?.modulusLength);
                        break;

                    case 'GENERATE_ECDSA_KEY_PAIR':
                        result = await this.keyManager.generateECDSAKeyPair(payload?.namedCurve);
                        break;

                    case 'SIGN':
                        result = await this.keyManager.sign(
                            payload.data, 
                            payload.privateKey, 
                            payload.algorithm,
                            payload.hash
                        );
                        break;

                    case 'VERIFY':
                        result = await this.keyManager.verify(
                            payload.data, 
                            payload.signature, 
                            payload.publicKey, 
                            payload.algorithm,
                            payload.hash
                        );
                        break;

                    case 'STORE_KEY':
                        this.keyManager.storeKey(payload.id, payload.key);
                        result = { stored: true, id: payload.id };
                        break;

                    case 'GET_KEY':
                        result = { key: this.keyManager.getKey(payload.id) };
                        break;

                    case 'REMOVE_KEY':
                        result = { removed: this.keyManager.removeKey(payload.id) };
                        break;

                    case 'LIST_KEYS':
                        result = { keys: this.keyManager.listKeys() };
                        break;

                    // Random generation
                    case 'RANDOM_INT':
                        result = { value: SecureRandom.randomInt(payload.min, payload.max) };
                        break;

                    case 'RANDOM_STRING':
                        result = { value: SecureRandom.randomString(payload.length, payload.charset) };
                        break;

                    case 'GENERATE_TOKEN':
                        result = { token: SecureRandom.generateToken(payload.bytes) };
                        break;

                    case 'GENERATE_API_KEY':
                        result = { key: SecureRandom.generateAPIKey(payload.prefix) };
                        break;

                    case 'GENERATE_UUID':
                        result = { uuid: CryptoUtils.generateUUID() };
                        break;

                    case 'SHUFFLE':
                        result = { shuffled: SecureRandom.shuffle(payload.array) };
                        break;

                    // Utility
                    case 'GET_STATS':
                        result = this.getStats();
                        break;

                    case 'CLEAR_ALL':
                        this.keyManager.clearAll();
                        result = { cleared: true };
                        break;

                    default:
                        throw new Error(`Unknown message type: ${type}`);
                }

                this.stats.operations++;

                postMessage({
                    type: 'SUCCESS',
                    requestId,
                    payload: result
                });

            } catch (error) {
                this.stats.errors++;

                postMessage({
                    type: 'ERROR',
                    requestId,
                    payload: {
                        message: error.message,
                        name: error.name
                    }
                });
            }
        };
    }

    getStats() {
        return {
            operations: this.stats.operations,
            errors: this.stats.errors,
            storedKeys: this.keyManager.listKeys().length
        };
    }
}

// ============================================================================
// INITIALIZE WORKER
// ============================================================================

const cryptoWorker = new CryptoWorker();

// Signal ready state
postMessage({
    type: 'WORKER_READY',
    payload: {
        name: 'crypto-worker',
        version: '1.0.0',
        timestamp: Date.now()
    }
});