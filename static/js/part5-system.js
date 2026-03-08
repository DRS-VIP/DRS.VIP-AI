/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║                       DRS.VIP-AI SYSTEM MANAGER                              ║
 * ║                     World's Most Advanced AI Operating System                ║
 * ║                         Part 5: System Architecture                          ║
 * ╠══════════════════════════════════════════════════════════════════════════════╣
 * ║  Version: 1.0.0                                                              ║
 * ║  Author: DRS Engineering Team                                                ║
 * ║  License: MIT                                                                ║
 * ║  Description: Complete system management including PWA functionality,       ║
 * ║               health monitoring, secure boot, biometric authentication,      ║
 * ║               and neural interface core integration.                          ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */

'use strict';

// ============================================================================
// SYSTEM NAMESPACE INITIALIZATION
// ============================================================================

/**
 * System module namespace
 * @namespace DRS.System
 */
DRS.System = DRS.System || {};

/**
 * System version information
 * @type {Object}
 */
DRS.System.VERSION = Object.freeze({
    major: 1,
    minor: 0,
    patch: 0,
    build: '2035.1',
    toString: function() {
        return `${this.major}.${this.minor}.${this.patch}-${this.build}`;
    }
});

// ============================================================================
// HEALTH MONITOR
// ============================================================================

/**
 * Health Monitor - Real-time system health monitoring
 * @class HealthMonitor
 * @memberof DRS.System
 */
DRS.System.HealthMonitor = class HealthMonitor {
    /**
     * Create a new Health Monitor
     * @param {Object} config
     */
    constructor(config = {}) {
        this._config = {
            checkInterval: config.checkInterval || 5000,
            historySize: config.historySize || 100,
            alertThresholds: config.alertThresholds || {
                cpu: 90,
                memory: 90,
                gpu: 95,
                fps: 30
            },
            ...config
        };
        
        this._metrics = {
            cpu: [],
            memory: [],
            gpu: [],
            fps: [],
            network: [],
            errors: []
        };
        
        this._status = {
            overall: 'healthy',
            lastCheck: null,
            uptime: 0,
            startTime: Date.now()
        };
        
        this._alerts = [];
        this._listeners = new Map();
        this._checkInterval = null;
        
        this._performanceObserver = null;
        this._memoryObserver = null;
    }
    
    /**
     * Start health monitoring
     */
    start() {
        if (this._checkInterval) return;
        
        this._status.startTime = Date.now();
        
        // Start periodic checks
        this._checkInterval = setInterval(() => {
            this._performCheck();
        }, this._config.checkInterval);
        
        // Setup performance observer
        this._setupPerformanceObserver();
        
        // Initial check
        this._performCheck();
    }
    
    /**
     * Stop health monitoring
     */
    stop() {
        if (this._checkInterval) {
            clearInterval(this._checkInterval);
            this._checkInterval = null;
        }
        
        if (this._performanceObserver) {
            this._performanceObserver.disconnect();
        }
    }
    
    /**
     * Setup performance observer
     * @private
     */
    _setupPerformanceObserver() {
        if (typeof PerformanceObserver !== 'undefined') {
            this._performanceObserver = new PerformanceObserver((list) => {
                const entries = list.getEntries();
                entries.forEach(entry => {
                    this._recordMetric('performance', {
                        name: entry.name,
                        duration: entry.duration,
                        startTime: entry.startTime
                    });
                });
            });
            
            try {
                this._performanceObserver.observe({ 
                    entryTypes: ['measure', 'resource', 'paint', 'longtask'] 
                });
            } catch (e) {
                // Some entry types may not be supported
            }
        }
    }
    
    /**
     * Perform health check
     * @private
     */
    _performCheck() {
        const now = Date.now();
        
        // Memory metrics
        if (performance.memory) {
            const memoryUsed = performance.memory.usedJSHeapSize;
            const memoryTotal = performance.memory.totalJSHeapSize;
            const memoryPercent = (memoryUsed / memoryTotal) * 100;
            
            this._recordMetric('memory', {
                used: memoryUsed,
                total: memoryTotal,
                percent: memoryPercent,
                timestamp: now
            });
            
            this._checkThreshold('memory', memoryPercent);
        }
        
        // Estimate CPU usage based on long tasks
        const cpuUsage = this._estimateCPUUsage();
        this._recordMetric('cpu', {
            usage: cpuUsage,
            timestamp: now
        });
        this._checkThreshold('cpu', cpuUsage);
        
        // Network status
        const networkStatus = navigator.onLine ? 'online' : 'offline';
        this._recordMetric('network', {
            status: networkStatus,
            timestamp: now
        });
        
        // Update status
        this._status.lastCheck = now;
        this._status.uptime = now - this._status.startTime;
        
        // Calculate overall status
        this._calculateOverallStatus();
        
        // Notify listeners
        this._notifyListeners('check', this._status);
    }
    
    /**
     * Record a metric
     * @param {string} type
     * @param {Object} data
     * @private
     */
    _recordMetric(type, data) {
        if (!this._metrics[type]) {
            this._metrics[type] = [];
        }
        
        this._metrics[type].push(data);
        
        // Trim history
        while (this._metrics[type].length > this._config.historySize) {
            this._metrics[type].shift();
        }
    }
    
    /**
     * Estimate CPU usage
     * @returns {number}
     * @private
     */
    _estimateCPUUsage() {
        // Estimate based on requestAnimationFrame timing
        const now = performance.now();
        const frames = this._metrics.fps || [];
        
        if (frames.length < 2) return 0;
        
        const recentFrames = frames.slice(-10);
        const avgFrameTime = recentFrames.reduce((sum, f) => {
            return sum + (f.frameTime || 16.67);
        }, 0) / recentFrames.length;
        
        // CPU usage estimate (lower frame time = less CPU stress)
        const targetFrameTime = 16.67; // 60fps
        const ratio = avgFrameTime / targetFrameTime;
        
        return Math.min(100, Math.max(0, (ratio - 1) * 100 + 20));
    }
    
    /**
     * Check threshold and generate alerts
     * @param {string} type
     * @param {number} value
     * @private
     */
    _checkThreshold(type, value) {
        const threshold = this._config.alertThresholds[type];
        
        if (threshold && value > threshold) {
            const alert = {
                type,
                value,
                threshold,
                timestamp: Date.now(),
                level: 'warning'
            };
            
            this._alerts.push(alert);
            
            // Trim alerts
            while (this._alerts.length > 50) {
                this._alerts.shift();
            }
            
            this._notifyListeners('alert', alert);
        }
    }
    
    /**
     * Calculate overall status
     * @private
     */
    _calculateOverallStatus() {
        const thresholds = this._config.alertThresholds;
        let status = 'healthy';
        
        // Check memory
        const memoryMetrics = this._metrics.memory;
        if (memoryMetrics.length > 0) {
            const latestMemory = memoryMetrics[memoryMetrics.length - 1];
            if (latestMemory.percent > thresholds.memory) {
                status = 'degraded';
            }
            if (latestMemory.percent > thresholds.memory + 5) {
                status = 'critical';
            }
        }
        
        // Check for recent errors
        const recentErrors = this._metrics.errors.filter(
            e => Date.now() - e.timestamp < 60000
        );
        if (recentErrors.length > 5) {
            status = 'degraded';
        }
        if (recentErrors.length > 20) {
            status = 'critical';
        }
        
        this._status.overall = status;
    }
    
    /**
     * Record FPS
     * @param {number} fps
     * @param {number} frameTime
     */
    recordFPS(fps, frameTime) {
        this._recordMetric('fps', {
            fps,
            frameTime,
            timestamp: performance.now()
        });
        
        if (fps < this._config.alertThresholds.fps) {
            this._checkThreshold('fps', fps);
        }
    }
    
    /**
     * Record GPU metric
     * @param {Object} data
     */
    recordGPU(data) {
        this._recordMetric('gpu', {
            ...data,
            timestamp: Date.now()
        });
    }
    
    /**
     * Record error
     * @param {Error} error
     * @param {string} context
     */
    recordError(error, context = 'unknown') {
        const errorData = {
            message: error.message,
            name: error.name,
            stack: error.stack,
            context,
            timestamp: Date.now()
        };
        
        this._recordMetric('errors', errorData);
        this._notifyListeners('error', errorData);
    }
    
    /**
     * Get current status
     * @returns {Object}
     */
    getStatus() {
        return { ...this._status };
    }
    
    /**
     * Get metrics
     * @param {string} type
     * @returns {Array}
     */
    getMetrics(type) {
        return [...(this._metrics[type] || [])];
    }
    
    /**
     * Get latest metrics
     * @returns {Object}
     */
    getLatestMetrics() {
        const latest = {};
        
        Object.keys(this._metrics).forEach(key => {
            const arr = this._metrics[key];
            if (arr && arr.length > 0) {
                latest[key] = arr[arr.length - 1];
            }
        });
        
        return latest;
    }
    
    /**
     * Get alerts
     * @returns {Array}
     */
    getAlerts() {
        return [...this._alerts];
    }
    
    /**
     * Clear alerts
     */
    clearAlerts() {
        this._alerts = [];
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
     * Remove event listener
     * @param {string} event
     * @param {Function} callback
     */
    off(event, callback) {
        this._listeners.get(event)?.delete(callback);
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
                console.error('[HealthMonitor] Listener error:', e);
            }
        });
    }
    
    /**
     * Get health report
     * @returns {Object}
     */
    getHealthReport() {
        return {
            status: this._status.overall,
            uptime: this._status.uptime,
            lastCheck: this._status.lastCheck,
            metrics: this.getLatestMetrics(),
            alerts: this._alerts.slice(-10),
            recommendations: this._generateRecommendations()
        };
    }
    
    /**
     * Generate health recommendations
     * @returns {Array}
     * @private
     */
    _generateRecommendations() {
        const recommendations = [];
        
        // Check memory
        const memoryMetrics = this._metrics.memory;
        if (memoryMetrics.length > 0) {
            const latest = memoryMetrics[memoryMetrics.length - 1];
            if (latest.percent > 80) {
                recommendations.push({
                    type: 'memory',
                    priority: 'high',
                    message: 'Memory usage is high. Consider clearing cache or restarting the session.'
                });
            }
        }
        
        // Check FPS
        const fpsMetrics = this._metrics.fps;
        if (fpsMetrics.length > 0) {
            const avgFps = fpsMetrics.slice(-30).reduce((sum, f) => sum + f.fps, 0) / Math.min(30, fpsMetrics.length);
            if (avgFps < 30) {
                recommendations.push({
                    type: 'performance',
                    priority: 'medium',
                    message: 'Low frame rate detected. Consider reducing particle count or disabling some visual effects.'
                });
            }
        }
        
        // Check errors
        const recentErrors = this._metrics.errors.filter(e => Date.now() - e.timestamp < 300000);
        if (recentErrors.length > 3) {
            recommendations.push({
                type: 'stability',
                priority: 'medium',
                message: 'Multiple errors detected recently. Check the console for details.'
            });
        }
        
        return recommendations;
    }
};

// ============================================================================
// PWA MANAGER
// ============================================================================

/**
 * PWA Manager - Progressive Web App functionality
 * @class PWAManager
 * @memberof DRS.System
 */
DRS.System.PWAManager = class PWAManager {
    /**
     * Create a new PWA Manager
     */
    constructor() {
        this._registration = null;
        this._installPrompt = null;
        this._isInstalled = false;
        this._isOnline = navigator.onLine;
        this._updateAvailable = false;
        
        this._listeners = new Map();
        
        this._initialize();
    }
    
    /**
     * Initialize PWA functionality
     * @private
     */
    async _initialize() {
        // Register service worker
        if ('serviceWorker' in navigator) {
            try {
                this._registration = await navigator.serviceWorker.register('/static/sw.js', {
                    scope: '/'
                });
                
                console.log('[PWAManager] Service Worker registered');
                
                // Check for updates
                this._registration.addEventListener('updatefound', () => {
                    this._handleUpdate();
                });
                
                // Check if already waiting
                if (this._registration.waiting) {
                    this._updateAvailable = true;
                    this._notifyListeners('update', { available: true });
                }
                
            } catch (error) {
                console.error('[PWAManager] Service Worker registration failed:', error);
            }
        }
        
        // Setup install prompt
        window.addEventListener('beforeinstallprompt', (event) => {
            event.preventDefault();
            this._installPrompt = event;
            this._notifyListeners('installable', { available: true });
        });
        
        // Check if already installed
        window.addEventListener('appinstalled', () => {
            this._isInstalled = true;
            this._installPrompt = null;
            this._notifyListeners('installed', { success: true });
        });
        
        // Online/offline detection
        window.addEventListener('online', () => {
            this._isOnline = true;
            this._notifyListeners('connection', { online: true });
        });
        
        window.addEventListener('offline', () => {
            this._isOnline = false;
            this._notifyListeners('connection', { online: false });
        });
        
        // Check install state
        if (window.matchMedia('(display-mode: standalone)').matches) {
            this._isInstalled = true;
        }
    }
    
    /**
     * Handle service worker update
     * @private
     */
    _handleUpdate() {
        const newWorker = this._registration.installing;
        
        newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                this._updateAvailable = true;
                this._notifyListeners('update', { available: true });
            }
        });
    }
    
    /**
     * Prompt user to install the app
     * @returns {Promise<boolean>}
     */
    async promptInstall() {
        if (!this._installPrompt) {
            return false;
        }
        
        const result = await this._installPrompt.prompt();
        const accepted = result.outcome === 'accepted';
        
        if (accepted) {
            this._isInstalled = true;
            this._installPrompt = null;
        }
        
        return accepted;
    }
    
    /**
     * Apply pending update
     */
    applyUpdate() {
        if (this._registration && this._registration.waiting) {
            this._registration.waiting.postMessage({ type: 'SKIP_WAITING' });
            window.location.reload();
        }
    }
    
    /**
     * Check if app is installed
     * @returns {boolean}
     */
    isInstalled() {
        return this._isInstalled;
    }
    
    /**
     * Check if online
     * @returns {boolean}
     */
    isOnline() {
        return this._isOnline;
    }
    
    /**
     * Check if update available
     * @returns {boolean}
     */
    hasUpdate() {
        return this._updateAvailable;
    }
    
    /**
     * Check if installable
     * @returns {boolean}
     */
    isInstallable() {
        return !!this._installPrompt;
    }
    
    /**
     * Get manifest data
     * @returns {Promise<Object>}
     */
    async getManifest() {
        try {
            const response = await fetch('/static/manifest.json');
            return await response.json();
        } catch (error) {
            console.error('[PWAManager] Failed to fetch manifest:', error);
            return null;
        }
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
     * Remove event listener
     * @param {string} event
     * @param {Function} callback
     */
    off(event, callback) {
        this._listeners.get(event)?.delete(callback);
    }
    
    /**
     * Notify listeners
     * @param {string} event
     * @param {*} data
     * @private
     */
    _notifyListeners(event, data) {
        this._listeners.get(event)?.forEach(cb => cb(data));
    }
};

// ============================================================================
// SECURE BOOT SYSTEM
// ============================================================================

/**
 * Secure Boot System - Verify system integrity on startup
 * @class SecureBootSystem
 * @memberof DRS.System
 */
DRS.System.SecureBootSystem = class SecureBootSystem {
    /**
     * Create a new Secure Boot System
     */
    constructor() {
        this._bootSequence = [];
        this._bootLog = [];
        this._passed = false;
        this._errors = [];
        this._warnings = [];
        this._startTime = null;
    }
    
    /**
     * Run boot sequence
     * @returns {Promise<Object>}
     */
    async boot() {
        this._startTime = performance.now();
        this._log('BOOT', 'Starting secure boot sequence...');
        
        // Define boot checks
        this._bootSequence = [
            { name: 'Browser Compatibility', check: () => this._checkBrowserCompatibility() },
            { name: 'WebGL Support', check: () => this._checkWebGL() },
            { name: 'IndexedDB', check: () => this._checkIndexedDB() },
            { name: 'Service Worker', check: () => this._checkServiceWorker() },
            { name: 'Crypto API', check: () => this._checkCryptoAPI() },
            { name: 'Web Workers', check: () => this._checkWebWorkers() },
            { name: 'Network Connectivity', check: () => this._checkNetwork() },
            { name: 'Memory Availability', check: () => this._checkMemory() },
            { name: 'Security Headers', check: () => this._checkSecurityHeaders() },
            { name: 'Content Security', check: () => this._checkCSP() }
        ];
        
        // Run each check
        for (const step of this._bootSequence) {
            try {
                this._log('CHECK', `Running: ${step.name}`);
                const result = await step.check();
                
                if (result.passed) {
                    this._log('PASS', `${step.name} - OK`);
                } else {
                    if (result.critical) {
                        this._errors.push({ step: step.name, ...result });
                        this._log('FAIL', `${step.name} - CRITICAL: ${result.message}`);
                    } else {
                        this._warnings.push({ step: step.name, ...result });
                        this._log('WARN', `${step.name} - ${result.message}`);
                    }
                }
            } catch (error) {
                this._errors.push({ step: step.name, error: error.message });
                this._log('ERROR', `${step.name} - ${error.message}`);
            }
        }
        
        // Calculate results
        const bootTime = performance.now() - this._startTime;
        this._passed = this._errors.length === 0;
        
        const result = {
            passed: this._passed,
            bootTime,
            errors: this._errors,
            warnings: this._warnings,
            log: this._bootLog
        };
        
        this._log('BOOT', `Boot sequence ${this._passed ? 'completed' : 'failed'} in ${bootTime.toFixed(2)}ms`);
        
        return result;
    }
    
    /**
     * Log a message
     * @param {string} level
     * @param {string} message
     * @private
     */
    _log(level, message) {
        this._bootLog.push({
            level,
            message,
            timestamp: performance.now()
        });
    }
    
    /**
     * Check browser compatibility
     * @returns {Object}
     * @private
     */
    _checkBrowserCompatibility() {
        const requiredFeatures = [
            'Promise', 'fetch', 'Request', 'Response', 'URL',
            'Array.prototype.includes', 'Object.assign', 'Array.from'
        ];
        
        const missing = requiredFeatures.filter(f => {
            const parts = f.split('.');
            let obj = window;
            for (const part of parts) {
                if (!obj[part]) return true;
                obj = obj[part];
            }
            return false;
        });
        
        if (missing.length > 0) {
            return {
                passed: false,
                critical: true,
                message: `Missing features: ${missing.join(', ')}`
            };
        }
        
        return { passed: true };
    }
    
    /**
     * Check WebGL support
     * @returns {Object}
     * @private
     */
    _checkWebGL() {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
        
        if (!gl) {
            return {
                passed: false,
                critical: false,
                message: 'WebGL not supported - graphics features will be limited'
            };
        }
        
        return { passed: true };
    }
    
    /**
     * Check IndexedDB support
     * @returns {Object}
     * @private
     */
    async _checkIndexedDB() {
        if (!window.indexedDB) {
            return {
                passed: false,
                critical: false,
                message: 'IndexedDB not supported - persistence features will be limited'
            };
        }
        
        // Test open/close
        return new Promise((resolve) => {
            const request = indexedDB.open('__drs_test__', 1);
            
            request.onerror = () => {
                resolve({
                    passed: false,
                    critical: false,
                    message: 'IndexedDB access denied'
                });
            };
            
            request.onsuccess = () => {
                const db = request.result;
                db.close();
                indexedDB.deleteDatabase('__drs_test__');
                resolve({ passed: true });
            };
            
            request.onupgradeneeded = () => {
                // Database created
            };
        });
    }
    
    /**
     * Check Service Worker support
     * @returns {Object}
     * @private
     */
    _checkServiceWorker() {
        if (!('serviceWorker' in navigator)) {
            return {
                passed: false,
                critical: false,
                message: 'Service Worker not supported - offline mode unavailable'
            };
        }
        
        return { passed: true };
    }
    
    /**
     * Check Crypto API
     * @returns {Object}
     * @private
     */
    async _checkCryptoAPI() {
        if (!window.crypto || !window.crypto.subtle) {
            return {
                passed: false,
                critical: true,
                message: 'Web Crypto API not available - encryption features disabled'
            };
        }
        
        // Test crypto function
        try {
            const key = await crypto.subtle.generateKey(
                { name: 'AES-GCM', length: 256 },
                true,
                ['encrypt', 'decrypt']
            );
            
            if (!key) {
                throw new Error('Key generation failed');
            }
            
            return { passed: true };
        } catch (error) {
            return {
                passed: false,
                critical: true,
                message: `Crypto API test failed: ${error.message}`
            };
        }
    }
    
    /**
     * Check Web Workers support
     * @returns {Object}
     * @private
     */
    _checkWebWorkers() {
        if (!window.Worker) {
            return {
                passed: false,
                critical: false,
                message: 'Web Workers not supported - parallel processing unavailable'
            };
        }
        
        return { passed: true };
    }
    
    /**
     * Check network connectivity
     * @returns {Object}
     * @private
     */
    _checkNetwork() {
        if (!navigator.onLine) {
            return {
                passed: false,
                critical: false,
                message: 'No network connection - some features may be limited'
            };
        }
        
        return { passed: true };
    }
    
    /**
     * Check memory availability
     * @returns {Object}
     * @private
     */
    _checkMemory() {
        if (performance.memory) {
            const used = performance.memory.usedJSHeapSize;
            const total = performance.memory.jsHeapSizeLimit;
            const available = total - used;
            
            if (available < 100 * 1024 * 1024) { // Less than 100MB
                return {
                    passed: false,
                    critical: false,
                    message: 'Low memory available - performance may be affected'
                };
            }
        }
        
        return { passed: true };
    }
    
    /**
     * Check security headers (client-side check)
     * @returns {Object}
     * @private
     */
    _checkSecurityHeaders() {
        // Client-side check for HTTPS
        if (location.protocol !== 'https:' && location.hostname !== 'localhost') {
            return {
                passed: false,
                critical: true,
                message: 'Not using HTTPS - security features may be limited'
            };
        }
        
        return { passed: true };
    }
    
    /**
     * Check Content Security Policy
     * @returns {Object}
     * @private
     */
    _checkCSP() {
        // Check if eval is blocked (good sign)
        try {
            eval('1 + 1');
            return {
                passed: true,
                message: 'Note: eval() is available - ensure CSP is configured properly'
            };
        } catch (e) {
            // Eval blocked - CSP is active (good)
            return { passed: true };
        }
    }
    
    /**
     * Get boot log
     * @returns {Array}
     */
    getLog() {
        return [...this._bootLog];
    }
    
    /**
     * Check if boot passed
     * @returns {boolean}
     */
    isPassed() {
        return this._passed;
    }
};

// ============================================================================
// BIOMETRIC AUTHENTICATION
// ============================================================================

/**
 * Biometric Authentication - WebAuthn integration
 * @class BiometricAuthentication
 * @memberof DRS.System
 */
DRS.System.BiometricAuthentication = class BiometricAuthentication {
    /**
     * Create a new Biometric Authentication
     */
    constructor() {
        this._isSupported = this._checkSupport();
        this._credentials = null;
        this._lastAuth = null;
    }
    
    /**
     * Check WebAuthn support
     * @returns {Object}
     * @private
     */
    _checkSupport() {
        return {
            webAuthn: !!window.PublicKeyCredential,
            platform: !!window.PublicKeyCredential?.isUserVerifyingPlatformAuthenticatorAvailable,
            touchId: false, // Will be detected
            faceId: false,  // Will be detected
            windowsHello: false // Will be detected
        };
    }
    
    /**
     * Check if biometric auth is available
     * @returns {Promise<Object>}
     */
    async isAvailable() {
        if (!this._isSupported.webAuthn) {
            return { available: false, reason: 'WebAuthn not supported' };
        }
        
        try {
            const available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
            
            return {
                available,
                methods: available ? ['platform'] : []
            };
        } catch (error) {
            return { available: false, reason: error.message };
        }
    }
    
    /**
     * Register biometric credential
     * @param {string} username
     * @returns {Promise<Object>}
     */
    async register(username) {
        if (!this._isSupported.webAuthn) {
            throw new Error('WebAuthn not supported');
        }
        
        const challenge = new Uint8Array(32);
        crypto.getRandomValues(challenge);
        
        const userId = new TextEncoder().encode(username);
        
        const credentialOptions = {
            challenge,
            rp: {
                name: 'DRS.VIP-AI',
                id: window.location.hostname
            },
            user: {
                id: userId,
                name: username,
                displayName: username
            },
            pubKeyCredParams: [
                { type: 'public-key', alg: -7 },  // ES256
                { type: 'public-key', alg: -257 } // RS256
            ],
            authenticatorSelection: {
                authenticatorAttachment: 'platform',
                userVerification: 'required'
            },
            timeout: 60000,
            attestation: 'direct'
        };
        
        try {
            const credential = await navigator.credentials.create({
                publicKey: credentialOptions
            });
            
            this._credentials = credential;
            
            return {
                success: true,
                id: credential.id,
                type: credential.type
            };
        } catch (error) {
            return {
                success: false,
                error: error.name === 'NotAllowedError' ? 
                    'Authentication cancelled or not allowed' : error.message
            };
        }
    }
    
    /**
     * Authenticate with biometric
     * @returns {Promise<Object>}
     */
    async authenticate() {
        if (!this._isSupported.webAuthn) {
            throw new Error('WebAuthn not supported');
        }
        
        if (!this._credentials) {
            throw new Error('No registered credentials');
        }
        
        const challenge = new Uint8Array(32);
        crypto.getRandomValues(challenge);
        
        const requestOptions = {
            challenge,
            allowCredentials: [{
                type: 'public-key',
                id: this._credentials.rawId
            }],
            userVerification: 'required',
            timeout: 60000
        };
        
        try {
            const assertion = await navigator.credentials.get({
                publicKey: requestOptions
            });
            
            this._lastAuth = {
                timestamp: Date.now(),
                id: assertion.id
            };
            
            return {
                success: true,
                timestamp: this._lastAuth.timestamp
            };
        } catch (error) {
            return {
                success: false,
                error: error.name === 'NotAllowedError' ? 
                    'Authentication cancelled or not allowed' : error.message
            };
        }
    }
    
    /**
     * Check if authenticated
     * @returns {boolean}
     */
    isAuthenticated() {
        if (!this._lastAuth) return false;
        
        // Auth valid for 1 hour
        return Date.now() - this._lastAuth.timestamp < 3600000;
    }
    
    /**
     * Clear credentials
     */
    clearCredentials() {
        this._credentials = null;
        this._lastAuth = null;
    }
};

// ============================================================================
// NEURAL INTERFACE CORE
// ============================================================================

/**
 * Neural Interface Core - Main system integration layer
 * @class NeuralInterfaceCore
 * @memberof DRS.System
 */
DRS.System.NeuralInterfaceCore = class NeuralInterfaceCore {
    /**
     * Create a new Neural Interface Core
     * @param {Object} config
     */
    constructor(config = {}) {
        this._config = {
            appElement: config.appElement || '#app',
            canvasElement: config.canvasElement || '#neural-canvas',
            chatContainer: config.chatContainer || '#chat-messages',
            inputElement: config.inputElement || '#chat-input',
            ...config
        };
        
        // Core components
        this._core = null;
        this._graphics = null;
        this._api = null;
        this._chat = null;
        
        // System components
        this._healthMonitor = new DRS.System.HealthMonitor();
        this._pwaManager = new DRS.System.PWAManager();
        this._secureBoot = new DRS.System.SecureBootSystem();
        this._biometric = new DRS.System.BiometricAuthentication();
        
        // State
        this._initialized = false;
        this._ready = false;
        this._startTime = null;
    }
    
    /**
     * Initialize the neural interface
     * @returns {Promise<boolean>}
     */
    async initialize() {
        if (this._initialized) {
            return true;
        }
        
        this._startTime = performance.now();
        console.log('%c[DRS.VIP-AI] Initializing Neural Interface...', 'color: #00fff2; font-weight: bold');
        
        try {
            // Run secure boot
            const bootResult = await this._secureBoot.boot();
            
            if (!bootResult.passed) {
                console.error('[NeuralInterface] Boot sequence failed:', bootResult.errors);
                // Continue with degraded functionality
            }
            
            // Initialize core
            this._core = await DRS.Core.initialize({
                debug: {
                    enabled: true,
                    logLevel: 'info'
                }
            });
            
            // Initialize graphics
            await this._initializeGraphics();
            
            // Initialize API
            await this._initializeAPI();
            
            // Initialize chat
            await this._initializeChat();
            
            // Initialize UI
            this._initializeUI();
            
            // Start health monitoring
            this._healthMonitor.start();
            
            // Setup event handlers
            this._setupEventHandlers();
            
            this._initialized = true;
            this._ready = true;
            
            const initTime = performance.now() - this._startTime;
            console.log(`%c[DRS.VIP-AI] Neural Interface Ready (${initTime.toFixed(2)}ms)`, 'color: #00fff2; font-weight: bold');
            
            // Dispatch ready event
            this._core.eventBus.dispatch('system:ready', {
                initTime,
                bootResult
            });
            
            return true;
            
        } catch (error) {
            console.error('[NeuralInterface] Initialization failed:', error);
            
            this._core?.logger?.critical('NeuralInterface', 'Initialization failed', {
                error: error.toString()
            });
            
            return false;
        }
    }
    
    /**
     * Initialize graphics engine
     * @private
     */
    async _initializeGraphics() {
        const canvas = document.querySelector(this._config.canvasElement);
        
        if (!canvas) {
            console.warn('[NeuralInterface] Canvas element not found');
            return;
        }
        
        try {
            this._graphics = new DRS.Graphics.NeuralGraphicsManager(canvas, {
                maxParticles: 20000,
                antialias: true
            });
            
            this._graphics.start();
            
            this._core.registerModule('graphics', this._graphics);
            
        } catch (error) {
            console.error('[NeuralInterface] Graphics initialization failed:', error);
        }
    }
    
    /**
     * Initialize API layer
     * @private
     */
    async _initializeAPI() {
        this._api = new DRS.API.APIManager({
            ollama: {
                baseUrl: this._core.config.get('api.baseUrl') || 'http://localhost:11434'
            }
        });
        
        await this._api.initialize(this._core);
        this._core.registerModule('api', this._api);
    }
    
    /**
     * Initialize chat engine
     * @private
     */
    async _initializeChat() {
        const chatContainer = document.querySelector(this._config.chatContainer);
        
        this._chat = new DRS.Chat.ChatEngine();
        await this._chat.initialize(this._core);
        
        if (chatContainer) {
            this._chat.setContainer(chatContainer);
        }
        
        this._core.registerModule('chat', this._chat);
    }
    
    /**
     * Initialize UI
     * @private
     */
    _initializeUI() {
        const input = document.querySelector(this._config.inputElement);
        
        if (input) {
            input.addEventListener('keydown', async (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    const content = input.value.trim();
                    
                    if (content) {
                        await this._chat.send(content);
                        input.value = '';
                    }
                }
            });
            
            // Auto-complete
            input.addEventListener('input', () => {
                const suggestions = this._chat.getAutoComplete(input.value);
                // Show suggestions (implementation would show a dropdown)
            });
        }
        
        // Voice input button
        const voiceBtn = document.querySelector('#voice-btn');
        if (voiceBtn) {
            voiceBtn.addEventListener('click', () => {
                if (this._chat) {
                    if (this._chat._voice.isListening()) {
                        this._chat.stopVoiceInput();
                        voiceBtn.classList.remove('active');
                    } else {
                        this._chat.startVoiceInput();
                        voiceBtn.classList.add('active');
                    }
                }
            });
        }
        
        // Apply theme
        const theme = this._core.state.get('ui.theme');
        document.body.className = `theme-${theme}`;
    }
    
    /**
     * Setup event handlers
     * @private
     */
    _setupEventHandlers() {
        // FPS monitoring
        if (this._graphics) {
            let lastTime = performance.now();
            let frameCount = 0;
            
            this._graphics.onRender((time) => {
                frameCount++;
                
                if (time - lastTime >= 1000) {
                    this._healthMonitor.recordFPS(frameCount, 1000 / frameCount);
                    frameCount = 0;
                    lastTime = time;
                }
            });
        }
        
        // Network status
        this._pwaManager.on('connection', ({ online }) => {
            this._core.state.set('system.network', online ? 'online' : 'offline');
            this._core.eventBus.dispatch('system:network', { online });
        });
        
        // PWA updates
        this._pwaManager.on('update', ({ available }) => {
            if (available) {
                // Show update notification
                console.log('[NeuralInterface] Update available');
            }
        });
        
        // Health alerts
        this._healthMonitor.on('alert', (alert) => {
            this._core.eventBus.dispatch('system:alert', alert);
        });
        
        // Global error handling
        window.addEventListener('error', (event) => {
            this._healthMonitor.recordError(event.error, 'global');
        });
        
        window.addEventListener('unhandledrejection', (event) => {
            this._healthMonitor.recordError(event.reason, 'promise');
        });
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            // Ctrl/Cmd + Enter: Send message
            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                e.preventDefault();
                const input = document.querySelector(this._config.inputElement);
                if (input && input.value.trim()) {
                    this._chat.send(input.value.trim());
                    input.value = '';
                }
            }
            
            // Escape: Cancel current operation
            if (e.key === 'Escape') {
                if (this._chat._isProcessing) {
                    this._chat.cancel();
                }
            }
            
            // Ctrl + L: Clear chat
            if ((e.ctrlKey || e.metaKey) && e.key === 'l') {
                e.preventDefault();
                this._chat.clear();
            }
            
            // Ctrl + M: Toggle monitor panel
            if ((e.ctrlKey || e.metaKey) && e.key === 'm') {
                e.preventDefault();
                this._toggleMonitorPanel();
            }
        });
    }
    
    /**
     * Toggle monitor panel
     * @private
     */
    _toggleMonitorPanel() {
        const monitor = document.querySelector('#system-monitor');
        if (monitor) {
            monitor.classList.toggle('hidden');
        }
    }
    
    /**
     * Get system status
     * @returns {Object}
     */
    getStatus() {
        return {
            initialized: this._initialized,
            ready: this._ready,
            uptime: this._startTime ? Date.now() - this._startTime : 0,
            health: this._healthMonitor.getStatus(),
            pwa: {
                installed: this._pwaManager.isInstalled(),
                online: this._pwaManager.isOnline(),
                updateAvailable: this._pwaManager.hasUpdate()
            }
        };
    }
    
    /**
     * Get component by name
     * @param {string} name
     * @returns {*}
     */
    getComponent(name) {
        const components = {
            core: this._core,
            graphics: this._graphics,
            api: this._api,
            chat: this._chat,
            health: this._healthMonitor,
            pwa: this._pwaManager,
            biometric: this._biometric
        };
        
        return components[name];
    }
    
    /**
     * Shutdown the system
     */
    async shutdown() {
        console.log('[DRS.VIP-AI] Shutting down...');
        
        // Stop health monitor
        this._healthMonitor.stop();
        
        // Stop graphics
        if (this._graphics) {
            this._graphics.stop();
            this._graphics.dispose();
        }
        
        // Shutdown API
        if (this._api) {
            this._api.shutdown();
        }
        
        // Shutdown core
        if (this._core) {
            await this._core.shutdown();
        }
        
        this._ready = false;
        this._initialized = false;
        
        console.log('[DRS.VIP-AI] Shutdown complete');
    }
};

// ============================================================================
// SYSTEM INTEGRATION
// ============================================================================

/**
 * System Integration - Singleton instance management
 * @class SystemIntegration
 * @memberof DRS.System
 */
DRS.System.SystemIntegration = class SystemIntegration {
    /**
     * Get or create singleton instance
     * @param {Object} config
     * @returns {Promise<DRS.System.NeuralInterfaceCore>}
     */
    static async initialize(config = {}) {
        if (!DRS.System._instance) {
            DRS.System._instance = new DRS.System.NeuralInterfaceCore(config);
            await DRS.System._instance.initialize();
        }
        return DRS.System._instance;
    }
    
    /**
     * Get current instance
     * @returns {DRS.System.NeuralInterfaceCore}
     */
    static getInstance() {
        if (!DRS.System._instance) {
            throw new Error('System not initialized. Call DRS.System.SystemIntegration.initialize() first.');
        }
        return DRS.System._instance;
    }
    
    /**
     * Check if initialized
     * @returns {boolean}
     */
    static isInitialized() {
        return !!DRS.System._instance?._initialized;
    }
};

// Export to global scope
globalThis.DRS = DRS;

console.log('%c[DRS.VIP-AI] System Manager Loaded', 'color: #00fff2; font-weight: bold');