/**
 * DRS.VIP-AI API Worker
 * Handles API requests in a separate thread for non-blocking operations
 * @version 1.0.0
 * @author DRS.VIP-AI Engineering Team
 */

'use strict';

// ============================================================================
// API WORKER CONFIGURATION
// ============================================================================

const API_CONFIG = {
    maxRetries: 3,
    retryDelay: 1000,
    timeout: 30000,
    baseUrl: '/api',
    endpoints: {
        chat: '/chat',
        stream: '/stream',
        models: '/models',
        health: '/health',
        embeddings: '/embeddings',
        predict: '/predict'
    }
};

// ============================================================================
// REQUEST QUEUE MANAGER
// ============================================================================

class RequestQueue {
    constructor(maxConcurrent = 5) {
        this.queue = [];
        this.active = new Map();
        this.maxConcurrent = maxConcurrent;
        this.requestId = 0;
    }

    enqueue(request) {
        return new Promise((resolve, reject) => {
            const id = ++this.requestId;
            const queuedRequest = {
                id,
                request,
                resolve,
                reject,
                timestamp: Date.now()
            };
            this.queue.push(queuedRequest);
            this.processQueue();
        });
    }

    processQueue() {
        while (this.queue.length > 0 && this.active.size < this.maxConcurrent) {
            const queuedRequest = this.queue.shift();
            this.executeRequest(queuedRequest);
        }
    }

    async executeRequest(queuedRequest) {
        const { id, request, resolve, reject } = queuedRequest;
        this.active.set(id, queuedRequest);

        try {
            const result = await this.performFetch(request);
            resolve(result);
        } catch (error) {
            reject(error);
        } finally {
            this.active.delete(id);
            this.processQueue();
        }
    }

    async performFetch(request) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), request.timeout || API_CONFIG.timeout);

        try {
            const response = await fetch(request.url, {
                method: request.method || 'GET',
                headers: request.headers || {},
                body: request.body ? JSON.stringify(request.body) : null,
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new APIError(`HTTP ${response.status}: ${response.statusText}`, response.status);
            }

            const contentType = response.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
                return await response.json();
            }
            return await response.text();
        } catch (error) {
            clearTimeout(timeoutId);
            if (error.name === 'AbortError') {
                throw new APIError('Request timeout', 408);
            }
            throw error;
        }
    }

    getStats() {
        return {
            queued: this.queue.length,
            active: this.active.size,
            maxConcurrent: this.maxConcurrent
        };
    }
}

// ============================================================================
// CIRCUIT BREAKER
// ============================================================================

class CircuitBreaker {
    constructor(threshold = 5, timeout = 60000) {
        this.failures = 0;
        this.threshold = threshold;
        this.timeout = timeout;
        this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
        this.lastFailure = null;
    }

    recordSuccess() {
        this.failures = 0;
        this.state = 'CLOSED';
    }

    recordFailure() {
        this.failures++;
        this.lastFailure = Date.now();

        if (this.failures >= this.threshold) {
            this.state = 'OPEN';
        }
    }

    canExecute() {
        if (this.state === 'CLOSED') return true;
        
        if (this.state === 'OPEN') {
            const elapsed = Date.now() - this.lastFailure;
            if (elapsed >= this.timeout) {
                this.state = 'HALF_OPEN';
                return true;
            }
            return false;
        }

        return true; // HALF_OPEN
    }

    getStatus() {
        return {
            state: this.state,
            failures: this.failures,
            threshold: this.threshold,
            lastFailure: this.lastFailure
        };
    }
}

// ============================================================================
// RETRY MANAGER
// ============================================================================

class RetryManager {
    constructor(maxRetries = 3, baseDelay = 1000) {
        this.maxRetries = maxRetries;
        this.baseDelay = baseDelay;
    }

    async executeWithRetry(operation, requestId) {
        let lastError;

        for (let attempt = 0; attempt < this.maxRetries; attempt++) {
            try {
                const result = await operation();
                return result;
            } catch (error) {
                lastError = error;
                
                if (!this.isRetryable(error)) {
                    throw error;
                }

                const delay = this.calculateDelay(attempt);
                postMessage({
                    type: 'RETRY_ATTEMPT',
                    payload: {
                        requestId,
                        attempt: attempt + 1,
                        maxRetries: this.maxRetries,
                        delay
                    }
                });

                await this.sleep(delay);
            }
        }

        throw lastError;
    }

    isRetryable(error) {
        if (error instanceof APIError) {
            return error.status >= 500 || error.status === 429 || error.status === 408;
        }
        return true;
    }

    calculateDelay(attempt) {
        // Exponential backoff with jitter
        const exponentialDelay = this.baseDelay * Math.pow(2, attempt);
        const jitter = Math.random() * 1000;
        return exponentialDelay + jitter;
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// ============================================================================
// STREAMING HANDLER
// ============================================================================

class StreamingHandler {
    constructor() {
        this.activeStreams = new Map();
    }

    async handleStream(request) {
        const streamId = request.streamId || crypto.randomUUID();
        const controller = new AbortController();
        
        this.activeStreams.set(streamId, {
            controller,
            startTime: Date.now()
        });

        try {
            const response = await fetch(request.url, {
                method: request.method || 'GET',
                headers: {
                    ...request.headers,
                    'Accept': 'text/event-stream'
                },
                body: request.body ? JSON.stringify(request.body) : null,
                signal: controller.signal
            });

            if (!response.ok) {
                throw new APIError(`Stream failed: ${response.status}`, response.status);
            }

            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                
                if (done) {
                    postMessage({
                        type: 'STREAM_COMPLETE',
                        payload: { streamId }
                    });
                    break;
                }

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const data = line.slice(6);
                        if (data === '[DONE]') {
                            postMessage({
                                type: 'STREAM_COMPLETE',
                                payload: { streamId }
                            });
                            this.activeStreams.delete(streamId);
                            return;
                        }

                        try {
                            const parsed = JSON.parse(data);
                            postMessage({
                                type: 'STREAM_DATA',
                                payload: { streamId, data: parsed }
                            });
                        } catch {
                            postMessage({
                                type: 'STREAM_DATA',
                                payload: { streamId, data: { text: data } }
                            });
                        }
                    }
                }
            }
        } catch (error) {
            if (error.name === 'AbortError') {
                postMessage({
                    type: 'STREAM_ABORTED',
                    payload: { streamId }
                });
            } else {
                throw error;
            }
        } finally {
            this.activeStreams.delete(streamId);
        }

        return streamId;
    }

    abortStream(streamId) {
        const stream = this.activeStreams.get(streamId);
        if (stream) {
            stream.controller.abort();
            this.activeStreams.delete(streamId);
            return true;
        }
        return false;
    }

    getActiveStreams() {
        return Array.from(this.activeStreams.entries()).map(([id, data]) => ({
            id,
            duration: Date.now() - data.startTime
        }));
    }
}

// ============================================================================
// CACHE MANAGER
// ============================================================================

class CacheManager {
    constructor(maxSize = 100) {
        this.cache = new Map();
        this.maxSize = maxSize;
        this.hits = 0;
        this.misses = 0;
    }

    generateKey(request) {
        const bodyStr = request.body ? JSON.stringify(request.body) : '';
        const str = `${request.method || 'GET'}:${request.url}:${bodyStr}`;
        return this.hashString(str);
    }

    hashString(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return hash.toString(16);
    }

    get(request) {
        const key = this.generateKey(request);
        const cached = this.cache.get(key);

        if (cached && Date.now() < cached.expiry) {
            this.hits++;
            return cached.data;
        }

        this.misses++;
        if (cached) {
            this.cache.delete(key);
        }
        return null;
    }

    set(request, data, ttl = 60000) {
        const key = this.generateKey(request);
        
        if (this.cache.size >= this.maxSize) {
            this.evictOldest();
        }

        this.cache.set(key, {
            data,
            expiry: Date.now() + ttl,
            timestamp: Date.now()
        });
    }

    evictOldest() {
        let oldestKey = null;
        let oldestTime = Infinity;

        for (const [key, value] of this.cache) {
            if (value.timestamp < oldestTime) {
                oldestTime = value.timestamp;
                oldestKey = key;
            }
        }

        if (oldestKey) {
            this.cache.delete(oldestKey);
        }
    }

    clear() {
        this.cache.clear();
        this.hits = 0;
        this.misses = 0;
    }

    getStats() {
        const total = this.hits + this.misses;
        return {
            size: this.cache.size,
            maxSize: this.maxSize,
            hits: this.hits,
            misses: this.misses,
            hitRate: total > 0 ? (this.hits / total * 100).toFixed(2) + '%' : '0%'
        };
    }
}

// ============================================================================
// CUSTOM ERROR CLASS
// ============================================================================

class APIError extends Error {
    constructor(message, status) {
        super(message);
        this.name = 'APIError';
        this.status = status;
    }
}

// ============================================================================
// API WORKER MAIN CLASS
// ============================================================================

class APIWorker {
    constructor() {
        this.requestQueue = new RequestQueue(5);
        this.circuitBreaker = new CircuitBreaker();
        this.retryManager = new RetryManager();
        this.streamingHandler = new StreamingHandler();
        this.cacheManager = new CacheManager();
        this.stats = {
            requestsProcessed: 0,
            errors: 0,
            totalLatency: 0
        };

        this.setupMessageHandler();
    }

    setupMessageHandler() {
        self.onmessage = async (event) => {
            const { type, payload, requestId } = event.data;

            try {
                let result;

                switch (type) {
                    case 'API_REQUEST':
                        result = await this.handleRequest(payload, requestId);
                        break;

                    case 'STREAM_REQUEST':
                        result = await this.handleStreamRequest(payload, requestId);
                        break;

                    case 'ABORT_STREAM':
                        result = this.streamingHandler.abortStream(payload.streamId);
                        break;

                    case 'GET_STATS':
                        result = this.getStats();
                        break;

                    case 'CLEAR_CACHE':
                        this.cacheManager.clear();
                        result = { cleared: true };
                        break;

                    case 'HEALTH_CHECK':
                        result = await this.healthCheck();
                        break;

                    default:
                        throw new Error(`Unknown message type: ${type}`);
                }

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
                        name: error.name,
                        status: error.status || null
                    }
                });
            }
        };
    }

    async handleRequest(request, requestId) {
        // Check cache for GET requests
        if (!request.body && request.cache !== false) {
            const cached = this.cacheManager.get(request);
            if (cached) {
                postMessage({
                    type: 'CACHE_HIT',
                    requestId,
                    payload: { cached: true }
                });
                return cached;
            }
        }

        // Check circuit breaker
        if (!this.circuitBreaker.canExecute()) {
            throw new APIError('Circuit breaker is OPEN', 503);
        }

        const startTime = Date.now();

        try {
            const result = await this.retryManager.executeWithRetry(
                () => this.requestQueue.enqueue({
                    ...request,
                    timeout: request.timeout || API_CONFIG.timeout
                }),
                requestId
            );

            this.circuitBreaker.recordSuccess();
            
            const latency = Date.now() - startTime;
            this.stats.requestsProcessed++;
            this.stats.totalLatency += latency;

            // Cache successful GET requests
            if (!request.body && request.cache !== false && latency < 5000) {
                this.cacheManager.set(request, result, request.cacheTTL);
            }

            postMessage({
                type: 'LATENCY_REPORT',
                requestId,
                payload: { latency }
            });

            return result;

        } catch (error) {
            this.circuitBreaker.recordFailure();
            throw error;
        }
    }

    async handleStreamRequest(request, requestId) {
        return await this.streamingHandler.handleStream({
            ...request,
            streamId: requestId
        });
    }

    async healthCheck() {
        try {
            const response = await fetch(`${API_CONFIG.baseUrl}${API_CONFIG.endpoints.health}`, {
                method: 'GET',
                timeout: 5000
            });
            return {
                status: 'healthy',
                backend: response.ok ? 'up' : 'down',
                timestamp: Date.now()
            };
        } catch {
            return {
                status: 'degraded',
                backend: 'down',
                timestamp: Date.now()
            };
        }
    }

    getStats() {
        return {
            requests: this.stats,
            queue: this.requestQueue.getStats(),
            circuitBreaker: this.circuitBreaker.getStatus(),
            cache: this.cacheManager.getStats(),
            streams: this.streamingHandler.getActiveStreams()
        };
    }
}

// ============================================================================
// INITIALIZE WORKER
// ============================================================================

const apiWorker = new APIWorker();

// Signal ready state
postMessage({
    type: 'WORKER_READY',
    payload: {
        name: 'api-worker',
        version: '1.0.0',
        timestamp: Date.now()
    }
});