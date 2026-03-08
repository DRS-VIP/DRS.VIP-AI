/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║                        DRS.VIP-AI DEFENSE API LAYER                          ║
 * ║                     World's Most Advanced AI Operating System                 ║
 * ║                          Part 3: Defense API Architecture                     ║
 * ╠══════════════════════════════════════════════════════════════════════════════╣
 * ║  Version: 1.0.0                                                               ║
 * ║  Author: DRS Engineering Team                                                 ║
 * ║  License: MIT                                                                 ║
 * ║  Description: Defense-grade API layer featuring Ollama integration,          ║
 * ║               circuit breaker pattern, rate limiting, request signing,        ║
 * ║               streaming support, and comprehensive error handling.            ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */

'use strict';

// ============================================================================
// API NAMESPACE INITIALIZATION
// ============================================================================

/**
 * API module namespace
 * @namespace DRS.API
 */
DRS.API = DRS.API || {};

/**
 * API version information
 * @type {Object}
 */
DRS.API.VERSION = Object.freeze({
    major: 1,
    minor: 0,
    patch: 0,
    toString: function() {
        return `${this.major}.${this.minor}.${this.patch}`;
    }
});

// ============================================================================
// SECURITY UTILITIES
// ============================================================================

/**
 * Security Utilities - Input sanitization and validation
 * @class SecurityUtils
 * @memberof DRS.API
 */
DRS.API.SecurityUtils = class SecurityUtils {
    /**
     * Sanitize string input
     * @param {string} input
     * @param {Object} options
     * @returns {string}
     */
    static sanitizeString(input, options = {}) {
        if (typeof input !== 'string') return '';
        
        const {
            maxLength = 10000,
            allowHtml = false,
            allowScripts = false
        } = options;
        
        let sanitized = input;
        
        // Trim to max length
        if (sanitized.length > maxLength) {
            sanitized = sanitized.substring(0, maxLength);
        }
        
        if (!allowHtml) {
            // Escape HTML entities
            sanitized = sanitized
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#x27;');
        }
        
        if (!allowScripts) {
            // Remove script tags and event handlers
            sanitized = sanitized
                .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
                .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '')
                .replace(/javascript:/gi, '');
        }
        
        // Remove null bytes
        sanitized = sanitized.replace(/\0/g, '');
        
        // Remove control characters except newlines and tabs
        sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
        
        return sanitized;
    }
    
    /**
     * Validate and sanitize object
     * @param {Object} obj
     * @param {Object} schema
     * @returns {Object}
     */
    static validateObject(obj, schema) {
        const result = { valid: true, errors: [], data: {} };
        
        if (typeof obj !== 'object' || obj === null) {
            result.valid = false;
            result.errors.push('Input must be an object');
            return result;
        }
        
        for (const [key, rules] of Object.entries(schema)) {
            const value = obj[key];
            
            // Check required
            if (rules.required && (value === undefined || value === null)) {
                result.valid = false;
                result.errors.push(`Missing required field: ${key}`);
                continue;
            }
            
            // Skip if optional and not provided
            if (value === undefined || value === null) {
                if (rules.default !== undefined) {
                    result.data[key] = rules.default;
                }
                continue;
            }
            
            // Type check
            if (rules.type) {
                const actualType = Array.isArray(value) ? 'array' : typeof value;
                if (actualType !== rules.type) {
                    result.valid = false;
                    result.errors.push(`Invalid type for ${key}: expected ${rules.type}, got ${actualType}`);
                    continue;
                }
            }
            
            // Validate string
            if (rules.type === 'string' || typeof value === 'string') {
                result.data[key] = this.sanitizeString(value, rules);
                
                if (rules.minLength && result.data[key].length < rules.minLength) {
                    result.valid = false;
                    result.errors.push(`${key} must be at least ${rules.minLength} characters`);
                }
                
                if (rules.maxLength && result.data[key].length > rules.maxLength) {
                    result.data[key] = result.data[key].substring(0, rules.maxLength);
                }
                
                if (rules.pattern && !rules.pattern.test(result.data[key])) {
                    result.valid = false;
                    result.errors.push(`${key} does not match required pattern`);
                }
            }
            
            // Validate number
            if (rules.type === 'number' || typeof value === 'number') {
                let numValue = value;
                
                if (rules.min !== undefined && numValue < rules.min) {
                    numValue = rules.min;
                }
                if (rules.max !== undefined && numValue > rules.max) {
                    numValue = rules.max;
                }
                
                result.data[key] = numValue;
            }
            
            // Validate array
            if (rules.type === 'array' && Array.isArray(value)) {
                if (rules.maxItems && value.length > rules.maxItems) {
                    result.data[key] = value.slice(0, rules.maxItems);
                } else {
                    result.data[key] = [...value];
                }
            }
        }
        
        return result;
    }
    
    /**
     * Generate secure token
     * @param {number} length
     * @returns {string}
     */
    static generateToken(length = 32) {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        const array = new Uint8Array(length);
        crypto.getRandomValues(array);
        
        return Array.from(array, x => chars[x % chars.length]).join('');
    }
    
    /**
     * Hash string using SHA-256
     * @param {string} message
     * @returns {Promise<string>}
     */
    static async hashString(message) {
        const msgBuffer = new TextEncoder().encode(message);
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }
    
    /**
     * Generate request signature
     * @param {Object} data
     * @param {string} secret
     * @returns {Promise<string>}
     */
    static async signRequest(data, secret) {
        const payload = JSON.stringify(data) + secret + Date.now();
        return await this.hashString(payload);
    }
    
    /**
     * Detect potential XSS patterns
     * @param {string} input
     * @returns {Object}
     */
    static detectXSS(input) {
        const patterns = [
            /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
            /javascript:/gi,
            /on\w+\s*=/gi,
            /<iframe/gi,
            /<embed/gi,
            /<object/gi,
            /expression\(/gi,
            /vbscript:/gi
        ];
        
        const detected = [];
        
        patterns.forEach(pattern => {
            const matches = input.match(pattern);
            if (matches) {
                detected.push(...matches);
            }
        });
        
        return {
            isClean: detected.length === 0,
            detected
        };
    }
    
    /**
     * Detect potential SQL injection patterns
     * @param {string} input
     * @returns {Object}
     */
    static detectSQLInjection(input) {
        const patterns = [
            /'\s*OR\s+'/gi,
            /'\s*AND\s+'/gi,
            /UNION\s+SELECT/gi,
            /DROP\s+TABLE/gi,
            /INSERT\s+INTO/gi,
            /DELETE\s+FROM/gi,
            /--/g,
            /;\s*DROP/gi,
            /'\s*=\s*'/gi
        ];
        
        const detected = [];
        
        patterns.forEach(pattern => {
            const matches = input.match(pattern);
            if (matches) {
                detected.push(...matches);
            }
        });
        
        return {
            isClean: detected.length === 0,
            detected
        };
    }
};

// ============================================================================
// CIRCUIT BREAKER
// ============================================================================

/**
 * Circuit Breaker - Prevent cascading failures
 * @class CircuitBreaker
 * @memberof DRS.API
 */
DRS.API.CircuitBreaker = class CircuitBreaker {
    /**
     * Create a new Circuit Breaker
     * @param {Object} config
     */
    constructor(config = {}) {
        this._config = {
            failureThreshold: config.failureThreshold || 5,
            successThreshold: config.successThreshold || 3,
            timeout: config.timeout || 30000,
            resetTimeout: config.resetTimeout || 60000,
            ...config
        };
        
        this._state = 'closed'; // closed, open, half-open
        this._failureCount = 0;
        this._successCount = 0;
        this._lastFailureTime = null;
        this._lastStateChange = Date.now();
        
        this._listeners = new Map();
    }
    
    /**
     * Execute function through circuit breaker
     * @param {Function} fn
     * @returns {Promise<*>}
     */
    async execute(fn) {
        if (this._state === 'open') {
            // Check if we should transition to half-open
            if (Date.now() - this._lastStateChange >= this._config.resetTimeout) {
                this._transitionTo('half-open');
            } else {
                throw new Error('Circuit breaker is OPEN');
            }
        }
        
        try {
            const result = await fn();
            this._onSuccess();
            return result;
        } catch (error) {
            this._onFailure();
            throw error;
        }
    }
    
    /**
     * Handle successful execution
     * @private
     */
    _onSuccess() {
        this._failureCount = 0;
        
        if (this._state === 'half-open') {
            this._successCount++;
            
            if (this._successCount >= this._config.successThreshold) {
                this._transitionTo('closed');
            }
        }
    }
    
    /**
     * Handle failed execution
     * @private
     */
    _onFailure() {
        this._failureCount++;
        this._lastFailureTime = Date.now();
        
        if (this._state === 'half-open') {
            this._transitionTo('open');
        } else if (this._failureCount >= this._config.failureThreshold) {
            this._transitionTo('open');
        }
    }
    
    /**
     * Transition to new state
     * @param {string} newState
     * @private
     */
    _transitionTo(newState) {
        const oldState = this._state;
        this._state = newState;
        this._lastStateChange = Date.now();
        
        if (newState === 'closed') {
            this._successCount = 0;
            this._failureCount = 0;
        }
        
        this._notifyListeners('stateChange', { oldState, newState });
    }
    
    /**
     * Add event listener
     * @param {string} event
     * @param {Function} callback
     */
    on(event, callback) {
        if (!this._listeners.has(event)) {
            this._listeners.set(event, new Set());
        }
        this._listeners.get(event).add(callback);
    }
    
    /**
     * Notify listeners
     * @param {string} event
     * @param {*} data
     * @private
     */
    _notifyListeners(event, data) {
        this._listeners.get(event)?.forEach(cb => {
            try {
                cb(data);
            } catch (e) {
                console.error('[CircuitBreaker] Listener error:', e);
            }
        });
    }
    
    /**
     * Get current state
     * @returns {string}
     */
    getState() {
        return this._state;
    }
    
    /**
     * Get stats
     * @returns {Object}
     */
    getStats() {
        return {
            state: this._state,
            failureCount: this._failureCount,
            successCount: this._successCount,
            lastFailureTime: this._lastFailureTime,
            lastStateChange: this._lastStateChange
        };
    }
    
    /**
     * Force reset
     */
    reset() {
        this._transitionTo('closed');
    }
};

// ============================================================================
// RATE LIMITER
// ============================================================================

/**
 * Rate Limiter - Token bucket implementation
 * @class RateLimiter
 * @memberof DRS.API
 */
DRS.API.RateLimiter = class RateLimiter {
    /**
     * Create a new Rate Limiter
     * @param {Object} config
     */
    constructor(config = {}) {
        this._config = {
            maxTokens: config.maxTokens || 100,
            refillRate: config.refillRate || 10, // tokens per second
            refillInterval: config.refillInterval || 1000, // ms
            ...config
        };
        
        this._buckets = new Map();
        this._intervals = new Map();
    }
    
    /**
     * Check if request is allowed
     * @param {string} key - Unique identifier (e.g., user ID, IP)
     * @returns {Object}
     */
    check(key) {
        const now = Date.now();
        
        if (!this._buckets.has(key)) {
            this._buckets.set(key, {
                tokens: this._config.maxTokens,
                lastRefill: now
            });
        }
        
        const bucket = this._buckets.get(key);
        
        // Refill tokens
        const elapsed = now - bucket.lastRefill;
        const tokensToAdd = Math.floor(elapsed / this._config.refillInterval) * this._config.refillRate;
        
        bucket.tokens = Math.min(this._config.maxTokens, bucket.tokens + tokensToAdd);
        bucket.lastRefill = now;
        
        // Check if allowed
        if (bucket.tokens >= 1) {
            bucket.tokens--;
            return {
                allowed: true,
                remaining: bucket.tokens,
                resetIn: null
            };
        }
        
        // Calculate time until next token
        const resetIn = this._config.refillInterval - (elapsed % this._config.refillInterval);
        
        return {
            allowed: false,
            remaining: 0,
            resetIn,
            retryAfter: Math.ceil(resetIn / 1000)
        };
    }
    
    /**
     * Get bucket status
     * @param {string} key
     * @returns {Object}
     */
    getStatus(key) {
        if (!this._buckets.has(key)) {
            return {
                tokens: this._config.maxTokens,
                maxTokens: this._config.maxTokens
            };
        }
        
        const bucket = this._buckets.get(key);
        return {
            tokens: bucket.tokens,
            maxTokens: this._config.maxTokens,
            lastRefill: bucket.lastRefill
        };
    }
    
    /**
     * Clear bucket for key
     * @param {string} key
     */
    clear(key) {
        this._buckets.delete(key);
    }
    
    /**
     * Clear all buckets
     */
    clearAll() {
        this._buckets.clear();
    }
    
    /**
     * Get total active keys
     * @returns {number}
     */
    getActiveCount() {
        return this._buckets.size;
    }
};

// ============================================================================
// RETRY MANAGER
// ============================================================================

/**
 * Retry Manager - Intelligent retry logic with exponential backoff
 * @class RetryManager
 * @memberof DRS.API
 */
DRS.API.RetryManager = class RetryManager {
    /**
     * Create a new Retry Manager
     * @param {Object} config
     */
    constructor(config = {}) {
        this._config = {
            maxRetries: config.maxRetries || 3,
            baseDelay: config.baseDelay || 1000,
            maxDelay: config.maxDelay || 30000,
            exponentialBase: config.exponentialBase || 2,
            jitter: config.jitter !== false,
            retryableErrors: config.retryableErrors || [
                'ECONNRESET',
                'ENOTFOUND',
                'ETIMEDOUT',
                'ECONNREFUSED',
                'NetworkError',
                'TimeoutError'
            ],
            ...config
        };
        
        this._stats = {
            totalAttempts: 0,
            successfulRetries: 0,
            failedAttempts: 0
        };
    }
    
    /**
     * Execute function with retry logic
     * @param {Function} fn
     * @param {Object} options
     * @returns {Promise<*>}
     */
    async execute(fn, options = {}) {
        const config = { ...this._config, ...options };
        let lastError;
        
        for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
            this._stats.totalAttempts++;
            
            try {
                const result = await fn();
                
                if (attempt > 0) {
                    this._stats.successfulRetries++;
                }
                
                return result;
            } catch (error) {
                lastError = error;
                
                // Check if error is retryable
                if (!this._isRetryable(error, config)) {
                    this._stats.failedAttempts++;
                    throw error;
                }
                
                // Check if we have retries left
                if (attempt >= config.maxRetries) {
                    this._stats.failedAttempts++;
                    throw error;
                }
                
                // Calculate delay
                const delay = this._calculateDelay(attempt, config);
                
                // Wait before retry
                await this._sleep(delay);
            }
        }
        
        throw lastError;
    }
    
    /**
     * Check if error is retryable
     * @param {Error} error
     * @param {Object} config
     * @returns {boolean}
     * @private
     */
    _isRetryable(error, config) {
        const errorCode = error.code || error.name;
        const errorMessage = error.message || '';
        
        // Check error codes
        if (config.retryableErrors.includes(errorCode)) {
            return true;
        }
        
        // Check HTTP status codes
        if (error.status) {
            const retryableStatuses = [408, 429, 500, 502, 503, 504];
            return retryableStatuses.includes(error.status);
        }
        
        // Check message patterns
        const retryablePatterns = [/timeout/i, /network/i, /connection/i, /rate limit/i];
        return retryablePatterns.some(pattern => pattern.test(errorMessage));
    }
    
    /**
     * Calculate retry delay with exponential backoff
     * @param {number} attempt
     * @param {Object} config
     * @returns {number}
     * @private
     */
    _calculateDelay(attempt, config) {
        let delay = config.baseDelay * Math.pow(config.exponentialBase, attempt);
        
        // Cap at max delay
        delay = Math.min(delay, config.maxDelay);
        
        // Add jitter
        if (config.jitter) {
            const jitterAmount = delay * 0.3 * Math.random();
            delay = delay + jitterAmount;
        }
        
        return Math.floor(delay);
    }
    
    /**
     * Sleep utility
     * @param {number} ms
     * @returns {Promise<void>}
     * @private
     */
    _sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    /**
     * Get stats
     * @returns {Object}
     */
    getStats() {
        return { ...this._stats };
    }
    
    /**
     * Reset stats
     */
    resetStats() {
        this._stats = {
            totalAttempts: 0,
            successfulRetries: 0,
            failedAttempts: 0
        };
    }
};

// ============================================================================
// REQUEST QUEUE
// ============================================================================

/**
 * Request Queue - Priority-based request queue with concurrency control
 * @class RequestQueue
 * @memberof DRS.API
 */
DRS.API.RequestQueue = class RequestQueue {
    /**
     * Create a new Request Queue
     * @param {Object} config
     */
    constructor(config = {}) {
        this._config = {
            maxConcurrent: config.maxConcurrent || 5,
            maxQueueSize: config.maxQueueSize || 100,
            timeout: config.timeout || 30000,
            ...config
        };
        
        this._queue = [];
        this._active = new Map();
        this._nextId = 1;
        
        this._stats = {
            queued: 0,
            processed: 0,
            failed: 0,
            timedOut: 0
        };
    }
    
    /**
     * Add request to queue
     * @param {Function} fn
     * @param {Object} options
     * @returns {Promise<*>}
     */
    async add(fn, options = {}) {
        const {
            priority = 0,
            timeout = this._config.timeout
        } = options;
        
        // Check queue size
        if (this._queue.length >= this._config.maxQueueSize) {
            throw new Error('Request queue is full');
        }
        
        return new Promise((resolve, reject) => {
            const item = {
                id: this._nextId++,
                fn,
                priority,
                timeout,
                resolve,
                reject,
                addedAt: Date.now()
            };
            
            // Insert by priority (higher priority first)
            let insertIndex = this._queue.findIndex(q => q.priority < priority);
            if (insertIndex === -1) {
                this._queue.push(item);
            } else {
                this._queue.splice(insertIndex, 0, item);
            }
            
            this._stats.queued++;
            
            this._processQueue();
        });
    }
    
    /**
     * Process queue
     * @private
     */
    _processQueue() {
        while (this._active.size < this._config.maxConcurrent && this._queue.length > 0) {
            const item = this._queue.shift();
            this._executeItem(item);
        }
    }
    
    /**
     * Execute queue item
     * @param {Object} item
     * @private
     */
    async _executeItem(item) {
        this._active.set(item.id, item);
        
        // Setup timeout
        const timeoutId = setTimeout(() => {
            if (this._active.has(item.id)) {
                this._active.delete(item.id);
                this._stats.timedOut++;
                item.reject(new Error('Request timed out'));
                this._processQueue();
            }
        }, item.timeout);
        
        try {
            const result = await item.fn();
            clearTimeout(timeoutId);
            this._active.delete(item.id);
            this._stats.processed++;
            item.resolve(result);
        } catch (error) {
            clearTimeout(timeoutId);
            this._active.delete(item.id);
            this._stats.failed++;
            item.reject(error);
        }
        
        this._processQueue();
    }
    
    /**
     * Clear queue
     */
    clear() {
        this._queue.forEach(item => {
            item.reject(new Error('Request cancelled'));
        });
        this._queue = [];
    }
    
    /**
     * Get stats
     * @returns {Object}
     */
    getStats() {
        return {
            ...this._stats,
            queueSize: this._queue.length,
            activeCount: this._active.size
        };
    }
    
    /**
     * Check if queue is empty
     * @returns {boolean}
     */
    isEmpty() {
        return this._queue.length === 0 && this._active.size === 0;
    }
};

// ============================================================================
// STREAMING PROCESSOR
// ============================================================================

/**
 * Streaming Processor - Handle streaming responses
 * @class StreamingProcessor
 * @memberof DRS.API
 */
DRS.API.StreamingProcessor = class StreamingProcessor {
    /**
     * Create a new Streaming Processor
     */
    constructor() {
        this._activeStreams = new Map();
        this._decoder = new TextDecoder();
        this._encoder = new TextEncoder();
    }
    
    /**
     * Process streaming response
     * @param {Response} response
     * @param {Object} options
     * @returns {AsyncGenerator}
     */
    async *process(response, options = {}) {
        const {
            onChunk = null,
            onComplete = null,
            onError = null,
            signal = null
        } = options;
        
        const streamId = 'stream-' + Date.now();
        this._activeStreams.set(streamId, { response, aborted: false });
        
        try {
            const reader = response.body.getReader();
            let buffer = '';
            
            while (true) {
                // Check for abort
                if (signal?.aborted || this._activeStreams.get(streamId)?.aborted) {
                    break;
                }
                
                const { done, value } = await reader.read();
                
                if (done) break;
                
                // Decode chunk
                buffer += this._decoder.decode(value, { stream: true });
                
                // Process lines
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';
                
                for (const line of lines) {
                    if (line.trim() === '') continue;
                    
                    try {
                        const data = this._parseLine(line);
                        
                        if (data) {
                            if (onChunk) {
                                onChunk(data);
                            }
                            yield data;
                        }
                    } catch (e) {
                        console.warn('[StreamingProcessor] Parse error:', e);
                    }
                }
            }
            
            // Process remaining buffer
            if (buffer.trim()) {
                const data = this._parseLine(buffer);
                if (data) {
                    yield data;
                }
            }
            
            if (onComplete) {
                onComplete();
            }
        } catch (error) {
            if (onError) {
                onError(error);
            }
            throw error;
        } finally {
            this._activeStreams.delete(streamId);
        }
    }
    
    /**
     * Parse streaming line
     * @param {string} line
     * @returns {*}
     * @private
     */
    _parseLine(line) {
        // Handle SSE format
        if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
                return { done: true };
            }
            return JSON.parse(data);
        }
        
        // Handle JSON lines
        if (line.startsWith('{') || line.startsWith('[')) {
            return JSON.parse(line);
        }
        
        // Plain text
        return { text: line };
    }
    
    /**
     * Abort a stream
     * @param {string} streamId
     */
    abort(streamId) {
        const stream = this._activeStreams.get(streamId);
        if (stream) {
            stream.aborted = true;
        }
    }
    
    /**
     * Abort all streams
     */
    abortAll() {
        this._activeStreams.forEach(stream => {
            stream.aborted = true;
        });
    }
    
    /**
     * Get active stream count
     * @returns {number}
     */
    getActiveCount() {
        return this._activeStreams.size;
    }
};

// ============================================================================
// OLLAMA CLIENT
// ============================================================================

/**
 * Ollama Client - Local LLM integration
 * @class OllamaClient
 * @memberof DRS.API
 */
DRS.API.OllamaClient = class OllamaClient {
    /**
     * Create a new Ollama Client
     * @param {Object} config
     */
    constructor(config = {}) {
        this._config = {
            baseUrl: config.baseUrl || 'http://localhost:11434',
            defaultModel: config.defaultModel || 'llama3.2',
            timeout: config.timeout || 120000,
            maxRetries: config.maxRetries || 3,
            ...config
        };
        
        this._circuitBreaker = new DRS.API.CircuitBreaker({
            failureThreshold: 5,
            resetTimeout: 60000
        });
        
        this._rateLimiter = new DRS.API.RateLimiter({
            maxTokens: 60,
            refillRate: 10
        });
        
        this._retryManager = new DRS.API.RetryManager({
            maxRetries: this._config.maxRetries
        });
        
        this._streamingProcessor = new DRS.API.StreamingProcessor();
        
        this._availableModels = [];
        this._isConnected = false;
        this._lastHealthCheck = null;
        
        // Auto health check
        this._startHealthCheck();
    }
    
    /**
     * Start periodic health check
     * @private
     */
    _startHealthCheck() {
        setInterval(() => {
            this.checkHealth();
        }, 30000); // Every 30 seconds
    }
    
    /**
     * Check Ollama server health
     * @returns {Promise<Object>}
     */
    async checkHealth() {
        try {
            const response = await fetch(`${this._config.baseUrl}/api/tags`, {
                method: 'GET',
                signal: AbortSignal.timeout(5000)
            });
            
            if (response.ok) {
                const data = await response.json();
                this._availableModels = data.models || [];
                this._isConnected = true;
                this._lastHealthCheck = Date.now();
                
                return {
                    healthy: true,
                    models: this._availableModels
                };
            }
            
            this._isConnected = false;
            return { healthy: false, error: `HTTP ${response.status}` };
        } catch (error) {
            this._isConnected = false;
            return { healthy: false, error: error.message };
        }
    }
    
    /**
     * Get available models
     * @returns {Promise<Array>}
     */
    async getModels() {
        if (this._availableModels.length === 0 || 
            Date.now() - this._lastHealthCheck > 60000) {
            await this.checkHealth();
        }
        return this._availableModels;
    }
    
    /**
     * Generate completion
     * @param {string} prompt
     * @param {Object} options
     * @returns {Promise<Object>}
     */
    async generate(prompt, options = {}) {
        const model = options.model || this._config.defaultModel;
        
        // Validate input
        const validation = DRS.API.SecurityUtils.validateObject(
            { prompt },
            {
                prompt: { type: 'string', required: true, maxLength: 32000 }
            }
        );
        
        if (!validation.valid) {
            throw new Error(`Invalid input: ${validation.errors.join(', ')}`);
        }
        
        // Rate limit check
        const rateLimit = this._rateLimiter.check('generate');
        if (!rateLimit.allowed) {
            throw new Error(`Rate limited. Retry after ${rateLimit.retryAfter} seconds`);
        }
        
        // Execute through circuit breaker and retry
        return this._circuitBreaker.execute(async () => {
            return this._retryManager.execute(async () => {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), this._config.timeout);
                
                try {
                    const response = await fetch(`${this._config.baseUrl}/api/generate`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            model,
                            prompt: validation.data.prompt,
                            stream: false,
                            options: {
                                temperature: options.temperature || 0.7,
                                num_predict: options.maxTokens || 4096,
                                top_p: options.topP || 0.9,
                                top_k: options.topK || 40,
                                ...options.ollamaOptions
                            }
                        }),
                        signal: controller.signal
                    });
                    
                    clearTimeout(timeoutId);
                    
                    if (!response.ok) {
                        throw new Error(`Ollama error: ${response.status}`);
                    }
                    
                    const data = await response.json();
                    
                    return {
                        response: data.response,
                        model: data.model,
                        context: data.context,
                        totalDuration: data.total_duration,
                        loadDuration: data.load_duration,
                        promptEvalCount: data.prompt_eval_count,
                        evalCount: data.eval_count
                    };
                } catch (error) {
                    clearTimeout(timeoutId);
                    throw error;
                }
            });
        });
    }
    
    /**
     * Generate streaming completion
     * @param {string} prompt
     * @param {Object} options
     * @returns {AsyncGenerator}
     */
    async *generateStream(prompt, options = {}) {
        const model = options.model || this._config.defaultModel;
        
        // Validate input
        const validation = DRS.API.SecurityUtils.validateObject(
            { prompt },
            {
                prompt: { type: 'string', required: true, maxLength: 32000 }
            }
        );
        
        if (!validation.valid) {
            throw new Error(`Invalid input: ${validation.errors.join(', ')}`);
        }
        
        // Rate limit check
        const rateLimit = this._rateLimiter.check('generate-stream');
        if (!rateLimit.allowed) {
            throw new Error(`Rate limited. Retry after ${rateLimit.retryAfter} seconds`);
        }
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this._config.timeout);
        
        try {
            const response = await fetch(`${this._config.baseUrl}/api/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model,
                    prompt: validation.data.prompt,
                    stream: true,
                    options: {
                        temperature: options.temperature || 0.7,
                        num_predict: options.maxTokens || 4096,
                        top_p: options.topP || 0.9,
                        top_k: options.topK || 40,
                        ...options.ollamaOptions
                    }
                }),
                signal: controller.signal
            });
            
            if (!response.ok) {
                throw new Error(`Ollama error: ${response.status}`);
            }
            
            // Process stream
            for await (const chunk of this._streamingProcessor.process(response)) {
                if (chunk.done) {
                    yield { done: true };
                    break;
                }
                
                yield {
                    response: chunk.response || '',
                    model: chunk.model,
                    done: chunk.done || false
                };
            }
        } finally {
            clearTimeout(timeoutId);
        }
    }
    
    /**
     * Chat completion
     * @param {Array} messages
     * @param {Object} options
     * @returns {Promise<Object>}
     */
    async chat(messages, options = {}) {
        const model = options.model || this._config.defaultModel;
        
        // Validate messages
        if (!Array.isArray(messages) || messages.length === 0) {
            throw new Error('Messages must be a non-empty array');
        }
        
        // Sanitize messages
        const sanitizedMessages = messages.map(msg => ({
            role: msg.role,
            content: DRS.API.SecurityUtils.sanitizeString(msg.content, { maxLength: 32000 })
        }));
        
        // Rate limit check
        const rateLimit = this._rateLimiter.check('chat');
        if (!rateLimit.allowed) {
            throw new Error(`Rate limited. Retry after ${rateLimit.retryAfter} seconds`);
        }
        
        return this._circuitBreaker.execute(async () => {
            return this._retryManager.execute(async () => {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), this._config.timeout);
                
                try {
                    const response = await fetch(`${this._config.baseUrl}/api/chat`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            model,
                            messages: sanitizedMessages,
                            stream: false,
                            options: {
                                temperature: options.temperature || 0.7,
                                num_predict: options.maxTokens || 4096,
                                ...options.ollamaOptions
                            }
                        }),
                        signal: controller.signal
                    });
                    
                    clearTimeout(timeoutId);
                    
                    if (!response.ok) {
                        throw new Error(`Ollama error: ${response.status}`);
                    }
                    
                    const data = await response.json();
                    
                    return {
                        message: data.message,
                        model: data.model,
                        totalDuration: data.total_duration,
                        evalCount: data.eval_count
                    };
                } catch (error) {
                    clearTimeout(timeoutId);
                    throw error;
                }
            });
        });
    }
    
    /**
     * Chat streaming completion
     * @param {Array} messages
     * @param {Object} options
     * @returns {AsyncGenerator}
     */
    async *chatStream(messages, options = {}) {
        const model = options.model || this._config.defaultModel;
        
        if (!Array.isArray(messages) || messages.length === 0) {
            throw new Error('Messages must be a non-empty array');
        }
        
        const sanitizedMessages = messages.map(msg => ({
            role: msg.role,
            content: DRS.API.SecurityUtils.sanitizeString(msg.content, { maxLength: 32000 })
        }));
        
        const rateLimit = this._rateLimiter.check('chat-stream');
        if (!rateLimit.allowed) {
            throw new Error(`Rate limited. Retry after ${rateLimit.retryAfter} seconds`);
        }
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this._config.timeout);
        
        try {
            const response = await fetch(`${this._config.baseUrl}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model,
                    messages: sanitizedMessages,
                    stream: true,
                    options: {
                        temperature: options.temperature || 0.7,
                        num_predict: options.maxTokens || 4096,
                        ...options.ollamaOptions
                    }
                }),
                signal: controller.signal
            });
            
            if (!response.ok) {
                throw new Error(`Ollama error: ${response.status}`);
            }
            
            for await (const chunk of this._streamingProcessor.process(response)) {
                if (chunk.done) {
                    yield { done: true };
                    break;
                }
                
                yield {
                    message: chunk.message || { content: '' },
                    model: chunk.model,
                    done: chunk.done || false
                };
            }
        } finally {
            clearTimeout(timeoutId);
        }
    }
    
    /**
     * Generate embeddings
     * @param {string} text
     * @param {Object} options
     * @returns {Promise<Object>}
     */
    async embed(text, options = {}) {
        const model = options.model || 'nomic-embed-text';
        
        const validation = DRS.API.SecurityUtils.validateObject(
            { text },
            { text: { type: 'string', required: true, maxLength: 8000 } }
        );
        
        if (!validation.valid) {
            throw new Error(`Invalid input: ${validation.errors.join(', ')}`);
        }
        
        const response = await fetch(`${this._config.baseUrl}/api/embeddings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model,
                prompt: validation.data.text
            })
        });
        
        if (!response.ok) {
            throw new Error(`Ollama embedding error: ${response.status}`);
        }
        
        const data = await response.json();
        
        return {
            embedding: data.embedding,
            model
        };
    }
    
    /**
     * Pull a model
     * @param {string} model
     * @param {Function} onProgress
     * @returns {AsyncGenerator}
     */
    async *pullModel(model, onProgress = null) {
        const response = await fetch(`${this._config.baseUrl}/api/pull`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: model, stream: true })
        });
        
        if (!response.ok) {
            throw new Error(`Ollama pull error: ${response.status}`);
        }
        
        for await (const chunk of this._streamingProcessor.process(response)) {
            if (onProgress) {
                onProgress(chunk);
            }
            yield chunk;
        }
        
        // Refresh model list
        await this.checkHealth();
    }
    
    /**
     * Get connection status
     * @returns {boolean}
     */
    isConnected() {
        return this._isConnected;
    }
    
    /**
     * Get client stats
     * @returns {Object}
     */
    getStats() {
        return {
            connected: this._isConnected,
            models: this._availableModels.length,
            circuitBreaker: this._circuitBreaker.getStats(),
            rateLimiter: {
                activeKeys: this._rateLimiter.getActiveCount()
            },
            retryManager: this._retryManager.getStats()
        };
    }
    
    /**
     * Set configuration
     * @param {Object} config
     */
    setConfig(config) {
        Object.assign(this._config, config);
    }
};

// ============================================================================
// WORKER COMMUNICATION LAYER
// ============================================================================

/**
 * Worker Communication Layer - Manage web workers for API operations
 * @class WorkerCommunicationLayer
 * @memberof DRS.API
 */
DRS.API.WorkerCommunicationLayer = class WorkerCommunicationLayer {
    /**
     * Create a new Worker Communication Layer
     * @param {string} workerPath
     */
    constructor(workerPath = '/static/workers/api-worker.js') {
        this._worker = null;
        this._pendingRequests = new Map();
        this._requestId = 0;
        this._handlers = new Map();
        this._isReady = false;
        
        this._initialize(workerPath);
    }
    
    /**
     * Initialize worker
     * @param {string} workerPath
     * @private
     */
    _initialize(workerPath) {
        try {
            this._worker = new Worker(workerPath);
            
            this._worker.onmessage = (event) => {
                this._handleMessage(event.data);
            };
            
            this._worker.onerror = (error) => {
                console.error('[WorkerCommunicationLayer] Worker error:', error);
                this._handleError(error);
            };
            
            // Wait for ready
            this._handlers.set('ready', () => {
                this._isReady = true;
            });
            
            // Send init message
            this._worker.postMessage({ type: 'init' });
        } catch (error) {
            console.warn('[WorkerCommunicationLayer] Worker initialization failed:', error);
            // Fall back to main thread
            this._isReady = true;
        }
    }
    
    /**
     * Handle worker message
     * @param {Object} data
     * @private
     */
    _handleMessage(data) {
        const { type, id, result, error } = data;
        
        // Handle by type
        if (this._handlers.has(type)) {
            this._handlers.get(type)(data);
            return;
        }
        
        // Handle pending request
        if (id && this._pendingRequests.has(id)) {
            const { resolve, reject } = this._pendingRequests.get(id);
            this._pendingRequests.delete(id);
            
            if (error) {
                reject(new Error(error));
            } else {
                resolve(result);
            }
        }
    }
    
    /**
     * Handle worker error
     * @param {Error} error
     * @private
     */
    _handleError(error) {
        // Reject all pending requests
        this._pendingRequests.forEach(({ reject }) => {
            reject(new Error('Worker error'));
        });
        this._pendingRequests.clear();
    }
    
    /**
     * Send request to worker
     * @param {string} type
     * @param {Object} payload
     * @returns {Promise<*>}
     */
    async sendRequest(type, payload = {}) {
        if (!this._worker || !this._isReady) {
            throw new Error('Worker not ready');
        }
        
        return new Promise((resolve, reject) => {
            const id = ++this._requestId;
            
            this._pendingRequests.set(id, { resolve, reject });
            
            this._worker.postMessage({
                type,
                id,
                payload
            });
            
            // Timeout
            setTimeout(() => {
                if (this._pendingRequests.has(id)) {
                    this._pendingRequests.delete(id);
                    reject(new Error('Worker request timed out'));
                }
            }, 60000);
        });
    }
    
    /**
     * Register handler for message type
     * @param {string} type
     * @param {Function} handler
     */
    on(type, handler) {
        this._handlers.set(type, handler);
    }
    
    /**
     * Terminate worker
     */
    terminate() {
        if (this._worker) {
            this._worker.terminate();
            this._worker = null;
        }
        this._pendingRequests.clear();
    }
    
    /**
     * Check if ready
     * @returns {boolean}
     */
    isReady() {
        return this._isReady;
    }
};

// ============================================================================
// API MANAGER
// ============================================================================

/**
 * API Manager - Central API orchestration
 * @class APIManager
 * @memberof DRS.API
 */
DRS.API.APIManager = class APIManager {
    /**
     * Create a new API Manager
     * @param {Object} config
     */
    constructor(config = {}) {
        this._config = config;
        
        // Initialize components
        this._ollama = new DRS.API.OllamaClient(config.ollama || {});
        this._queue = new DRS.API.RequestQueue(config.queue || {});
        this._workerLayer = null;
        
        this._initialized = false;
        this._eventBus = null;
        this._logger = null;
    }
    
    /**
     * Initialize the API manager
     * @param {Object} core
     */
    async initialize(core) {
        if (this._initialized) return;
        
        this._eventBus = core.eventBus;
        this._logger = core.logger?.category('API') || null;
        
        // Check Ollama connection
        const health = await this._ollama.checkHealth();
        
        if (!health.healthy) {
            this._logger?.warn('Ollama server not available. Some features may be limited.');
        }
        
        // Initialize worker layer
        try {
            this._workerLayer = new DRS.API.WorkerCommunicationLayer();
        } catch (e) {
            this._logger?.warn('Worker initialization failed. Using main thread.');
        }
        
        this._initialized = true;
        
        this._logger?.info('API Manager initialized');
        this._eventBus?.dispatch('api:ready', { health });
    }
    
    /**
     * Get Ollama client
     * @returns {OllamaClient}
     */
    getOllama() {
        return this._ollama;
    }
    
    /**
     * Get request queue
     * @returns {RequestQueue}
     */
    getQueue() {
        return this._queue;
    }
    
    /**
     * Send a chat message
     * @param {Array} messages
     * @param {Object} options
     * @returns {Promise<Object>}
     */
    async chat(messages, options = {}) {
        return this._queue.add(() => this._ollama.chat(messages, options));
    }
    
    /**
     * Stream chat response
     * @param {Array} messages
     * @param {Object} options
     * @returns {AsyncGenerator}
     */
    async *chatStream(messages, options = {}) {
        yield* this._ollama.chatStream(messages, options);
    }
    
    /**
     * Generate completion
     * @param {string} prompt
     * @param {Object} options
     * @returns {Promise<Object>}
     */
    async generate(prompt, options = {}) {
        return this._queue.add(() => this._ollama.generate(prompt, options));
    }
    
    /**
     * Generate embeddings
     * @param {string} text
     * @param {Object} options
     * @returns {Promise<Object>}
     */
    async embed(text, options = {}) {
        return this._ollama.embed(text, options);
    }
    
    /**
     * Get available models
     * @returns {Promise<Array>}
     */
    async getModels() {
        return this._ollama.getModels();
    }
    
    /**
     * Check API health
     * @returns {Promise<Object>}
     */
    async checkHealth() {
        return this._ollama.checkHealth();
    }
    
    /**
     * Get API stats
     * @returns {Object}
     */
    getStats() {
        return {
            ollama: this._ollama.getStats(),
            queue: this._queue.getStats()
        };
    }
    
    /**
     * Shutdown
     */
    shutdown() {
        this._queue.clear();
        this._workerLayer?.terminate();
    }
};

// Export to global scope
globalThis.DRS = DRS;

console.log('%c[DRS.VIP-AI] API Layer Loaded', 'color: #00fff2; font-weight: bold');