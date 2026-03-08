/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║                         DRS.VIP-AI CHAT ENGINE                               ║
 * ║                     World's Most Advanced AI Operating System                ║
 * ║                         Part 4: Chat Architecture                            ║
 * ╠══════════════════════════════════════════════════════════════════════════════╣
 * ║  Version: 1.0.0                                                              ║
 * ║  Author: DRS Engineering Team                                                ║
 * ║  License: MIT                                                                ║
 * ║  Description: Advanced chat engine featuring semantic memory, context        ║
 * ║               management, voice interface, auto-complete, and rich           ║
 * ║               message rendering with markdown support.                        ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */

'use strict';

// ============================================================================
// CHAT NAMESPACE INITIALIZATION
// ============================================================================

/**
 * Chat module namespace
 * @namespace DRS.Chat
 */
DRS.Chat = DRS.Chat || {};

/**
 * Chat version information
 * @type {Object}
 */
DRS.Chat.VERSION = Object.freeze({
    major: 1,
    minor: 0,
    patch: 0,
    toString: function() {
        return `${this.major}.${this.minor}.${this.patch}`;
    }
});

// ============================================================================
// MESSAGE TYPES & CONSTANTS
// ============================================================================

/**
 * Message types enum
 */
DRS.Chat.MessageTypes = Object.freeze({
    USER: 'user',
    ASSISTANT: 'assistant',
    SYSTEM: 'system',
    ERROR: 'error',
    COMMAND: 'command',
    NOTIFICATION: 'notification'
});

/**
 * Message status enum
 */
DRS.Chat.MessageStatus = Object.freeze({
    PENDING: 'pending',
    STREAMING: 'streaming',
    COMPLETE: 'complete',
    ERROR: 'error',
    CANCELLED: 'cancelled'
});

/**
 * Command prefixes
 */
DRS.Chat.CommandPrefix = Object.freeze({
    SYSTEM: '/',
    COMMAND: '!',
    SHORTCUT: '@'
});

// ============================================================================
// SEMANTIC MEMORY
// ============================================================================

/**
 * Semantic Memory - Long-term memory with embeddings
 * @class SemanticMemory
 * @memberof DRS.Chat
 */
DRS.Chat.SemanticMemory = class SemanticMemory {
    /**
     * Create a new Semantic Memory
     * @param {Object} config
     */
    constructor(config = {}) {
        this._config = {
            maxEntries: config.maxEntries || 10000,
            embeddingDimension: config.embeddingDimension || 1536,
            similarityThreshold: config.similarityThreshold || 0.7,
            contextWindow: config.contextWindow || 10,
            ...config
        };
        
        this._memories = [];
        this._embeddings = [];
        this._conversations = new Map();
        this._knowledge = new Map();
        
        // IndexedDB for persistence
        this._db = null;
        this._dbName = 'drs-vip-memory';
        this._dbVersion = 1;
        
        // LRU cache for recent access
        this._cache = new Map();
        this._cacheSize = 100;
    }
    
    /**
     * Initialize IndexedDB
     * @returns {Promise<void>}
     */
    async initialize() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this._dbName, this._dbVersion);
            
            request.onerror = () => reject(request.error);
            
            request.onsuccess = () => {
                this._db = request.result;
                this._loadFromDB();
                resolve();
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                
                // Create object stores
                if (!db.objectStoreNames.contains('memories')) {
                    const store = db.createObjectStore('memories', { keyPath: 'id' });
                    store.createIndex('timestamp', 'timestamp', { unique: false });
                    store.createIndex('type', 'type', { unique: false });
                }
                
                if (!db.objectStoreNames.contains('conversations')) {
                    const store = db.createObjectStore('conversations', { keyPath: 'id' });
                    store.createIndex('timestamp', 'timestamp', { unique: false });
                }
                
                if (!db.objectStoreNames.contains('knowledge')) {
                    const store = db.createObjectStore('knowledge', { keyPath: 'id' });
                    store.createIndex('category', 'category', { unique: false });
                }
            };
        });
    }
    
    /**
     * Load data from IndexedDB
     * @private
     */
    async _loadFromDB() {
        if (!this._db) return;
        
        const transaction = this._db.transaction(['memories', 'conversations', 'knowledge'], 'readonly');
        
        // Load memories
        const memoriesStore = transaction.objectStore('memories');
        const memoriesRequest = memoriesStore.getAll();
        
        memoriesRequest.onsuccess = () => {
            this._memories = memoriesRequest.result || [];
        };
        
        // Load conversations
        const conversationsStore = transaction.objectStore('conversations');
        const conversationsRequest = conversationsStore.getAll();
        
        conversationsRequest.onsuccess = () => {
            (conversationsRequest.result || []).forEach(conv => {
                this._conversations.set(conv.id, conv);
            });
        };
        
        // Load knowledge
        const knowledgeStore = transaction.objectStore('knowledge');
        const knowledgeRequest = knowledgeStore.getAll();
        
        knowledgeRequest.onsuccess = () => {
            (knowledgeRequest.result || []).forEach(item => {
                this._knowledge.set(item.id, item);
            });
        };
    }
    
    /**
     * Store a memory
     * @param {Object} memory
     * @returns {Promise<string>}
     */
    async store(memory) {
        const id = 'mem-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
        
        const entry = {
            id,
            type: memory.type || 'general',
            content: memory.content,
            embedding: memory.embedding || null,
            metadata: memory.metadata || {},
            timestamp: Date.now(),
            accessCount: 0,
            importance: memory.importance || 0.5
        };
        
        this._memories.push(entry);
        
        // Trim if needed
        while (this._memories.length > this._config.maxEntries) {
            const removed = this._memories.shift();
            this._removeFromDB('memories', removed.id);
        }
        
        // Store in DB
        await this._storeInDB('memories', entry);
        
        return id;
    }
    
    /**
     * Store conversation
     * @param {string} conversationId
     * @param {Array} messages
     */
    async storeConversation(conversationId, messages) {
        const entry = {
            id: conversationId,
            messages,
            timestamp: Date.now(),
            messageCount: messages.length
        };
        
        this._conversations.set(conversationId, entry);
        await this._storeInDB('conversations', entry);
    }
    
    /**
     * Get conversation
     * @param {string} conversationId
     * @returns {Object}
     */
    getConversation(conversationId) {
        return this._conversations.get(conversationId);
    }
    
    /**
     * Store knowledge
     * @param {string} key
     * @param {*} value
     * @param {string} category
     */
    async storeKnowledge(key, value, category = 'general') {
        const id = 'know-' + Date.now() + '-' + key;
        
        const entry = {
            id,
            key,
            value,
            category,
            timestamp: Date.now()
        };
        
        this._knowledge.set(key, entry);
        await this._storeInDB('knowledge', entry);
    }
    
    /**
     * Get knowledge
     * @param {string} key
     * @returns {*}
     */
    getKnowledge(key) {
        return this._knowledge.get(key)?.value;
    }
    
    /**
     * Search memories by similarity
     * @param {Array} queryEmbedding
     * @param {Object} options
     * @returns {Array}
     */
    searchSimilar(queryEmbedding, options = {}) {
        const {
            limit = 10,
            threshold = this._config.similarityThreshold,
            type = null
        } = options;
        
        const results = [];
        
        for (const memory of this._memories) {
            if (!memory.embedding) continue;
            if (type && memory.type !== type) continue;
            
            const similarity = this._cosineSimilarity(queryEmbedding, memory.embedding);
            
            if (similarity >= threshold) {
                results.push({
                    ...memory,
                    similarity
                });
            }
        }
        
        // Sort by similarity
        results.sort((a, b) => b.similarity - a.similarity);
        
        return results.slice(0, limit);
    }
    
    /**
     * Calculate cosine similarity
     * @param {Array} a
     * @param {Array} b
     * @returns {number}
     * @private
     */
    _cosineSimilarity(a, b) {
        if (!a || !b || a.length !== b.length) return 0;
        
        let dotProduct = 0;
        let normA = 0;
        let normB = 0;
        
        for (let i = 0; i < a.length; i++) {
            dotProduct += a[i] * b[i];
            normA += a[i] * a[i];
            normB += b[i] * b[i];
        }
        
        if (normA === 0 || normB === 0) return 0;
        
        return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
    }
    
    /**
     * Get relevant context
     * @param {string} query
     * @param {Array} currentMessages
     * @returns {Array}
     */
    getRelevantContext(query, currentMessages = []) {
        const context = [];
        
        // Get recent messages
        const recentMessages = currentMessages.slice(-this._config.contextWindow);
        context.push(...recentMessages);
        
        // Get related memories
        // In production, would compute query embedding
        // For now, use keyword matching
        const keywords = query.toLowerCase().split(/\s+/).filter(w => w.length > 3);
        
        for (const memory of this._memories) {
            const content = memory.content.toLowerCase();
            const matchCount = keywords.filter(k => content.includes(k)).length;
            
            if (matchCount > 0) {
                context.push({
                    role: 'system',
                    content: `[Memory] ${memory.content}`,
                    relevance: matchCount / keywords.length
                });
            }
        }
        
        return context;
    }
    
    /**
     * Store in IndexedDB
     * @param {string} storeName
     * @param {Object} data
     * @private
     */
    async _storeInDB(storeName, data) {
        if (!this._db) return;
        
        return new Promise((resolve, reject) => {
            const transaction = this._db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.put(data);
            
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }
    
    /**
     * Remove from IndexedDB
     * @param {string} storeName
     * @param {string} id
     * @private
     */
    async _removeFromDB(storeName, id) {
        if (!this._db) return;
        
        return new Promise((resolve, reject) => {
            const transaction = this._db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            const request = store.delete(id);
            
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }
    
    /**
     * Clear all memories
     */
    async clear() {
        this._memories = [];
        this._conversations.clear();
        this._knowledge.clear();
        this._cache.clear();
        
        if (this._db) {
            const transaction = this._db.transaction(
                ['memories', 'conversations', 'knowledge'],
                'readwrite'
            );
            
            transaction.objectStore('memories').clear();
            transaction.objectStore('conversations').clear();
            transaction.objectStore('knowledge').clear();
        }
    }
    
    /**
     * Get statistics
     * @returns {Object}
     */
    getStats() {
        return {
            memoryCount: this._memories.length,
            conversationCount: this._conversations.size,
            knowledgeCount: this._knowledge.size,
            cacheSize: this._cache.size
        };
    }
};

// ============================================================================
// CONTEXT WINDOW MANAGER
// ============================================================================

/**
 * Context Window Manager - Manage conversation context
 * @class ContextWindowManager
 * @memberof DRS.Chat
 */
DRS.Chat.ContextWindowManager = class ContextWindowManager {
    /**
     * Create a new Context Window Manager
     * @param {Object} config
     */
    constructor(config = {}) {
        this._config = {
            maxTokens: config.maxTokens || 8192,
            reservedTokens: config.reservedTokens || 1024,
            summaryThreshold: config.summaryThreshold || 0.8,
            ...config
        };
        
        this._messages = [];
        this._tokenCounts = [];
        this._summarizedContext = null;
        this._importantIndices = new Set();
    }
    
    /**
     * Add message to context
     * @param {Object} message
     * @param {number} tokenCount
     */
    addMessage(message, tokenCount = 0) {
        // Estimate token count if not provided
        if (!tokenCount) {
            tokenCount = this._estimateTokens(message.content);
        }
        
        this._messages.push(message);
        this._tokenCounts.push(tokenCount);
        
        // Check if we need to summarize
        if (this._getCurrentTokens() > this._config.maxTokens * this._config.summaryThreshold) {
            this._summarizeOld();
        }
    }
    
    /**
     * Estimate token count for text
     * @param {string} text
     * @returns {number}
     * @private
     */
    _estimateTokens(text) {
        // Rough estimation: ~4 characters per token
        return Math.ceil(text.length / 4);
    }
    
    /**
     * Get current total tokens
     * @returns {number}
     * @private
     */
    _getCurrentTokens() {
        return this._tokenCounts.reduce((sum, count) => sum + count, 0);
    }
    
    /**
     * Summarize old messages
     * @private
     */
    _summarizeOld() {
        // Keep important messages and recent ones
        const keepCount = Math.floor(this._messages.length * 0.3);
        const toSummarize = this._messages.slice(0, -keepCount);
        const toKeep = this._messages.slice(-keepCount);
        
        // Create summary
        const summaryContent = toSummarize
            .map(m => `${m.role}: ${m.content}`)
            .join('\n');
        
        this._summarizedContext = {
            role: 'system',
            content: `[Previous conversation summary]\n${summaryContent.substring(0, 2000)}...`,
            isSummary: true
        };
        
        this._messages = toKeep;
        this._tokenCounts = this._tokenCounts.slice(-keepCount);
    }
    
    /**
     * Mark message as important
     * @param {number} index
     */
    markImportant(index) {
        this._importantIndices.add(index);
    }
    
    /**
     * Get context for API call
     * @returns {Array}
     */
    getContext() {
        const context = [];
        
        // Add system prompt
        context.push({
            role: 'system',
            content: this._getSystemPrompt()
        });
        
        // Add summarized context if exists
        if (this._summarizedContext) {
            context.push(this._summarizedContext);
        }
        
        // Add messages
        context.push(...this._messages);
        
        return context;
    }
    
    /**
     * Get system prompt
     * @returns {string}
     * @private
     */
    _getSystemPrompt() {
        return `You are DRS.VIP-AI, an advanced AI assistant with neural capabilities. You are helpful, accurate, and thoughtful. You can remember context from the conversation and provide detailed, well-structured responses. Current date: ${new Date().toISOString().split('T')[0]}`;
    }
    
    /**
     * Clear context
     */
    clear() {
        this._messages = [];
        this._tokenCounts = [];
        this._summarizedContext = null;
        this._importantIndices.clear();
    }
    
    /**
     * Get message count
     * @returns {number}
     */
    getMessageCount() {
        return this._messages.length;
    }
    
    /**
     * Get token statistics
     * @returns {Object}
     */
    getTokenStats() {
        return {
            current: this._getCurrentTokens(),
            max: this._config.maxTokens,
            available: this._config.maxTokens - this._getCurrentTokens(),
            utilization: this._getCurrentTokens() / this._config.maxTokens
        };
    }
};

// ============================================================================
// MESSAGE RENDERER
// ============================================================================

/**
 * Message Renderer - Rich message rendering with markdown
 * @class MessageRenderer
 * @memberof DRS.Chat
 */
DRS.Chat.MessageRenderer = class MessageRenderer {
    /**
     * Create a new Message Renderer
     */
    constructor() {
        this._markdownParser = new this._SimpleMarkdownParser();
        this._codeHighlighter = new this._CodeHighlighter();
        this._sanitizer = new DRS.API.SecurityUtils();
    }
    
    /**
     * Render a message
     * @param {Object} message
     * @returns {HTMLElement}
     */
    render(message) {
        const container = document.createElement('div');
        container.className = `chat-message chat-message-${message.role}`;
        container.dataset.id = message.id;
        
        // Header
        const header = this._renderHeader(message);
        container.appendChild(header);
        
        // Content
        const content = this._renderContent(message);
        container.appendChild(content);
        
        // Actions
        const actions = this._renderActions(message);
        container.appendChild(actions);
        
        return container;
    }
    
    /**
     * Render message header
     * @param {Object} message
     * @returns {HTMLElement}
     * @private
     */
    _renderHeader(message) {
        const header = document.createElement('div');
        header.className = 'message-header';
        
        const avatar = document.createElement('div');
        avatar.className = 'message-avatar';
        avatar.innerHTML = this._getAvatarIcon(message.role);
        
        const info = document.createElement('div');
        info.className = 'message-info';
        
        const role = document.createElement('span');
        role.className = 'message-role';
        role.textContent = this._getRoleName(message.role);
        
        const time = document.createElement('span');
        time.className = 'message-time';
        time.textContent = this._formatTime(message.timestamp);
        
        info.appendChild(role);
        info.appendChild(time);
        
        header.appendChild(avatar);
        header.appendChild(info);
        
        return header;
    }
    
    /**
     * Render message content
     * @param {Object} message
     * @returns {HTMLElement}
     * @private
     */
    _renderContent(message) {
        const content = document.createElement('div');
        content.className = 'message-content';
        
        // Parse markdown
        const parsed = this._markdownParser.parse(message.content);
        
        // Sanitize and insert
        content.innerHTML = parsed;
        
        // Highlight code blocks
        content.querySelectorAll('pre code').forEach(block => {
            this._codeHighlighter.highlight(block);
        });
        
        // Process LaTeX if present
        this._processLatex(content);
        
        return content;
    }
    
    /**
     * Render message actions
     * @param {Object} message
     * @returns {HTMLElement}
     * @private
     */
    _renderActions(message) {
        const actions = document.createElement('div');
        actions.className = 'message-actions';
        
        // Copy button
        const copyBtn = document.createElement('button');
        copyBtn.className = 'action-btn copy-btn';
        copyBtn.innerHTML = '📋';
        copyBtn.title = 'Copy';
        copyBtn.onclick = () => this._copyToClipboard(message.content);
        
        // Regenerate (for assistant messages)
        if (message.role === 'assistant') {
            const regenBtn = document.createElement('button');
            regenBtn.className = 'action-btn regen-btn';
            regenBtn.innerHTML = '🔄';
            regenBtn.title = 'Regenerate';
            regenBtn.onclick = () => this._onRegenerate(message);
            
            actions.appendChild(regenBtn);
        }
        
        actions.appendChild(copyBtn);
        
        return actions;
    }
    
    /**
     * Get avatar icon HTML
     * @param {string} role
     * @returns {string}
     * @private
     */
    _getAvatarIcon(role) {
        const icons = {
            user: '👤',
            assistant: '🤖',
            system: '⚙️',
            error: '⚠️',
            command: '💻',
            notification: '🔔'
        };
        return icons[role] || '💬';
    }
    
    /**
     * Get role display name
     * @param {string} role
     * @returns {string}
     * @private
     */
    _getRoleName(role) {
        const names = {
            user: 'You',
            assistant: 'DRS.VIP-AI',
            system: 'System',
            error: 'Error',
            command: 'Command',
            notification: 'Notification'
        };
        return names[role] || role;
    }
    
    /**
     * Format timestamp
     * @param {number} timestamp
     * @returns {string}
     * @private
     */
    _formatTime(timestamp) {
        const date = new Date(timestamp);
        const now = new Date();
        
        if (date.toDateString() === now.toDateString()) {
            return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }
        
        return date.toLocaleDateString([], { month: 'short', day: 'numeric' }) + 
               ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    
    /**
     * Copy text to clipboard
     * @param {string} text
     * @private
     */
    async _copyToClipboard(text) {
        try {
            await navigator.clipboard.writeText(text);
            // Show notification
            this._showNotification('Copied to clipboard');
        } catch (err) {
            console.error('Failed to copy:', err);
        }
    }
    
    /**
     * Show notification
     * @param {string} message
     * @private
     */
    _showNotification(message) {
        const notification = document.createElement('div');
        notification.className = 'notification-toast';
        notification.textContent = message;
        document.body.appendChild(notification);
        
        setTimeout(() => {
            notification.remove();
        }, 2000);
    }
    
    /**
     * Handle regenerate
     * @param {Object} message
     * @private
     */
    _onRegenerate(message) {
        // Dispatch event for chat engine to handle
        document.dispatchEvent(new CustomEvent('chat:regenerate', {
            detail: { messageId: message.id }
        }));
    }
    
    /**
     * Process LaTeX in content
     * @param {HTMLElement} content
     * @private
     */
    _processLatex(content) {
        // Simple LaTeX detection and rendering placeholder
        const latexPattern = /\$\$(.*?)\$\$|\$(.*?)\$/g;
        
        content.innerHTML = content.innerHTML.replace(latexPattern, (match, block, inline) => {
            const formula = block || inline;
            const isBlock = !!block;
            
            const span = document.createElement('span');
            span.className = isBlock ? 'latex-block' : 'latex-inline';
            span.textContent = formula;
            
            return span.outerHTML;
        });
    }
    
    /**
     * Simple Markdown Parser
     * @class
     * @private
     */
    _SimpleMarkdownParser = class {
        parse(text) {
            if (!text) return '';
            
            let html = text;
            
            // Escape HTML
            html = html
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;');
            
            // Code blocks (must be first)
            html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (match, lang, code) => {
                return `<pre><code class="language-${lang || 'text'}">${code.trim()}</code></pre>`;
            });
            
            // Inline code
            html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
            
            // Headers
            html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
            html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
            html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');
            
            // Bold and italic
            html = html.replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>');
            html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
            html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
            html = html.replace(/___(.*?)___/g, '<strong><em>$1</em></strong>');
            html = html.replace(/__(.*?)__/g, '<strong>$1</strong>');
            html = html.replace(/_(.*?)_/g, '<em>$1</em>');
            
            // Strikethrough
            html = html.replace(/~~(.*?)~~/g, '<del>$1</del>');
            
            // Links
            html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
            
            // Lists
            html = html.replace(/^\s*[-*+]\s+(.*)$/gim, '<li>$1</li>');
            html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');
            
            // Numbered lists
            html = html.replace(/^\s*\d+\.\s+(.*)$/gim, '<li>$1</li>');
            
            // Blockquotes
            html = html.replace(/^&gt;\s+(.*)$/gim, '<blockquote>$1</blockquote>');
            
            // Horizontal rules
            html = html.replace(/^---$/gim, '<hr>');
            
            // Paragraphs
            html = html.replace(/\n\n/g, '</p><p>');
            html = '<p>' + html + '</p>';
            
            // Clean up empty paragraphs
            html = html.replace(/<p>\s*<\/p>/g, '');
            
            return html;
        }
    };
    
    /**
     * Code Highlighter
     * @class
     * @private
     */
    _CodeHighlighter = class {
        highlight(element) {
            const lang = element.className.match(/language-(\w+)/)?.[1] || 'text';
            const code = element.textContent;
            
            // Basic syntax highlighting
            let highlighted = this._highlightKeywords(code, lang);
            highlighted = this._highlightStrings(highlighted);
            highlighted = this._highlightNumbers(highlighted);
            highlighted = this._highlightComments(highlighted, lang);
            
            element.innerHTML = highlighted;
            element.classList.add('highlighted');
        }
        
        _highlightKeywords(code, lang) {
            const keywords = {
                javascript: ['const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'class', 'import', 'export', 'async', 'await', 'try', 'catch', 'throw', 'new', 'this', 'true', 'false', 'null', 'undefined'],
                python: ['def', 'class', 'return', 'if', 'elif', 'else', 'for', 'while', 'import', 'from', 'as', 'try', 'except', 'raise', 'with', 'True', 'False', 'None', 'and', 'or', 'not', 'in', 'is'],
                default: ['if', 'else', 'for', 'while', 'return', 'function', 'class', 'true', 'false', 'null']
            };
            
            const words = keywords[lang] || keywords.default;
            const pattern = new RegExp(`\\b(${words.join('|')})\\b`, 'g');
            
            return code.replace(pattern, '<span class="keyword">$1</span>');
        }
        
        _highlightStrings(code) {
            return code
                .replace(/("(?:[^"\\]|\\.)*")/g, '<span class="string">$1</span>')
                .replace(/('(?:[^'\\]|\\.)*')/g, '<span class="string">$1</span>')
                .replace(/(`(?:[^`\\]|\\.)*`)/g, '<span class="string">$1</span>');
        }
        
        _highlightNumbers(code) {
            return code.replace(/\b(\d+\.?\d*)\b/g, '<span class="number">$1</span>');
        }
        
        _highlightComments(code, lang) {
            if (['python', 'ruby'].includes(lang)) {
                return code.replace(/(#.*)$/gm, '<span class="comment">$1</span>');
            }
            return code
                .replace(/(\/\/.*$)/gm, '<span class="comment">$1</span>')
                .replace(/(\/\*[\s\S]*?\*\/)/g, '<span class="comment">$1</span>');
        }
    };
};

// ============================================================================
// COMMAND ENGINE
// ============================================================================

/**
 * Command Engine - Process and execute commands
 * @class CommandEngine
 * @memberof DRS.Chat
 */
DRS.Chat.CommandEngine = class CommandEngine {
    /**
     * Create a new Command Engine
     */
    constructor() {
        this._commands = new Map();
        this._aliases = new Map();
        this._history = [];
        this._maxHistory = 100;
        
        this._registerDefaultCommands();
    }
    
    /**
     * Register default commands
     * @private
     */
    _registerDefaultCommands() {
        // System commands
        this.register('/help', {
            description: 'Show available commands',
            handler: () => this._showHelp(),
            category: 'system'
        });
        
        this.register('/clear', {
            description: 'Clear chat history',
            handler: (args, context) => {
                context.chatEngine?.clear();
                return { type: 'notification', content: 'Chat cleared' };
            },
            category: 'chat'
        });
        
        this.register('/system', {
            description: 'Show system status',
            handler: (args, context) => {
                const stats = context.state?.get('system') || {};
                return {
                    type: 'notification',
                    content: `System Status:\nCPU: ${stats.cpu || 0}%\nMemory: ${stats.memory || 0}%\nNetwork: ${stats.network || 'online'}`
                };
            },
            category: 'system'
        });
        
        this.register('/model', {
            description: 'Switch or list AI models',
            handler: (args, context) => {
                if (args.length === 0) {
                    const models = context.api?.getModels() || [];
                    return {
                        type: 'notification',
                        content: `Available models: ${models.map(m => m.name).join(', ')}`
                    };
                }
                context.state?.set('chat.model', args[0]);
                return { type: 'notification', content: `Model switched to: ${args[0]}` };
            },
            category: 'ai'
        });
        
        this.register('/theme', {
            description: 'Change UI theme',
            handler: (args, context) => {
                const themes = ['dark-neural', 'light-holo', 'quantum-glass'];
                if (args.length === 0) {
                    return { type: 'notification', content: `Themes: ${themes.join(', ')}` };
                }
                if (themes.includes(args[0])) {
                    context.state?.set('ui.theme', args[0]);
                    document.body.className = `theme-${args[0]}`;
                    return { type: 'notification', content: `Theme changed to: ${args[0]}` };
                }
                return { type: 'error', content: `Unknown theme: ${args[0]}` };
            },
            category: 'ui'
        });
        
        this.register('/memory', {
            description: 'Memory management',
            handler: (args, context) => {
                const memory = context.memory;
                if (!memory) return { type: 'error', content: 'Memory not available' };
                
                if (args[0] === 'clear') {
                    memory.clear();
                    return { type: 'notification', content: 'Memory cleared' };
                }
                
                if (args[0] === 'stats') {
                    const stats = memory.getStats();
                    return {
                        type: 'notification',
                        content: `Memory Stats:\nMemories: ${stats.memoryCount}\nConversations: ${stats.conversationCount}\nKnowledge: ${stats.knowledgeCount}`
                    };
                }
                
                return { type: 'notification', content: 'Usage: /memory [clear|stats]' };
            },
            category: 'ai'
        });
        
        this.register('/export', {
            description: 'Export conversation',
            handler: (args, context) => {
                const messages = context.state?.get('chat.messages') || [];
                const format = args[0] || 'json';
                
                let content;
                let filename;
                
                if (format === 'json') {
                    content = JSON.stringify(messages, null, 2);
                    filename = 'conversation.json';
                } else if (format === 'md' || format === 'markdown') {
                    content = messages.map(m => `**${m.role}**: ${m.content}`).join('\n\n---\n\n');
                    filename = 'conversation.md';
                } else {
                    content = messages.map(m => `[${m.role}]: ${m.content}`).join('\n\n');
                    filename = 'conversation.txt';
                }
                
                // Trigger download
                const blob = new Blob([content], { type: 'text/plain' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = filename;
                a.click();
                URL.revokeObjectURL(url);
                
                return { type: 'notification', content: `Conversation exported as ${filename}` };
            },
            category: 'utility'
        });
        
        this.register('/predict', {
            description: 'Toggle prediction engine',
            handler: (args, context) => {
                const currentState = context.state?.get('ai.predictionEnabled') ?? true;
                const newState = args[0] === 'off' ? false : args[0] === 'on' ? true : !currentState;
                context.state?.set('ai.predictionEnabled', newState);
                return { type: 'notification', content: `Prediction ${newState ? 'enabled' : 'disabled'}` };
            },
            category: 'ai'
        });
        
        // Aliases
        this.registerAlias('/h', '/help');
        this.registerAlias('/c', '/clear');
        this.registerAlias('/m', '/model');
        this.registerAlias('/t', '/theme');
    }
    
    /**
     * Register a command
     * @param {string} name
     * @param {Object} config
     */
    register(name, config) {
        this._commands.set(name.toLowerCase(), config);
    }
    
    /**
     * Register a command alias
     * @param {string} alias
     * @param {string} target
     */
    registerAlias(alias, target) {
        this._aliases.set(alias.toLowerCase(), target.toLowerCase());
    }
    
    /**
     * Parse command input
     * @param {string} input
     * @returns {Object}
     */
    parse(input) {
        const trimmed = input.trim();
        
        if (!trimmed.startsWith('/')) {
            return { isCommand: false, input: trimmed };
        }
        
        const parts = trimmed.slice(1).split(/\s+/);
        let command = '/' + parts[0].toLowerCase();
        
        // Check for alias
        if (this._aliases.has(command)) {
            command = this._aliases.get(command);
        }
        
        const args = parts.slice(1);
        
        return {
            isCommand: true,
            command,
            args,
            raw: trimmed
        };
    }
    
    /**
     * Execute a command
     * @param {string} input
     * @param {Object} context
     * @returns {Object}
     */
    execute(input, context = {}) {
        const parsed = this.parse(input);
        
        if (!parsed.isCommand) {
            return { success: false, message: 'Not a command' };
        }
        
        const command = this._commands.get(parsed.command);
        
        if (!command) {
            return {
                success: false,
                message: `Unknown command: ${parsed.command}. Type /help for available commands.`
            };
        }
        
        // Add to history
        this._history.push({
            command: parsed.command,
            args: parsed.args,
            timestamp: Date.now()
        });
        
        if (this._history.length > this._maxHistory) {
            this._history.shift();
        }
        
        try {
            const result = command.handler(parsed.args, context);
            return { success: true, ...result };
        } catch (error) {
            return { success: false, message: `Command error: ${error.message}` };
        }
    }
    
    /**
     * Show help
     * @returns {Object}
     * @private
     */
    _showHelp() {
        const categories = {};
        
        this._commands.forEach((config, name) => {
            const cat = config.category || 'general';
            if (!categories[cat]) {
                categories[cat] = [];
            }
            categories[cat].push({ name, description: config.description });
        });
        
        let help = '📚 **Available Commands**\n\n';
        
        for (const [cat, cmds] of Object.entries(categories)) {
            help += `**${cat.toUpperCase()}**\n`;
            cmds.forEach(cmd => {
                help += `  ${cmd.name} - ${cmd.description}\n`;
            });
            help += '\n';
        }
        
        return { type: 'notification', content: help };
    }
    
    /**
     * Get command completions
     * @param {string} partial
     * @returns {Array}
     */
    getCompletions(partial) {
        if (!partial.startsWith('/')) return [];
        
        const prefix = partial.toLowerCase();
        const completions = [];
        
        this._commands.forEach((config, name) => {
            if (name.startsWith(prefix)) {
                completions.push({
                    command: name,
                    description: config.description
                });
            }
        });
        
        this._aliases.forEach((target, alias) => {
            if (alias.startsWith(prefix)) {
                completions.push({
                    command: alias,
                    description: `Alias for ${target}`
                });
            }
        });
        
        return completions;
    }
    
    /**
     * Get command history
     * @returns {Array}
     */
    getHistory() {
        return [...this._history];
    }
};

// ============================================================================
// AUTO-COMPLETE AI
// ============================================================================

/**
 * Auto-Complete AI - Intelligent auto-completion
 * @class AutoCompleteAI
 * @memberof DRS.Chat
 */
DRS.Chat.AutoCompleteAI = class AutoCompleteAI {
    /**
     * Create a new Auto-Complete AI
     * @param {Object} config
     */
    constructor(config = {}) {
        this._config = {
            maxSuggestions: config.maxSuggestions || 5,
            minChars: config.minChars || 2,
            debounceMs: config.debounceMs || 150,
            ...config
        };
        
        this._dictionary = new Set();
        this._frequencies = new Map();
        this._contextWords = [];
        this._pendingRequest = null;
        
        // Initialize with common words
        this._initializeDictionary();
    }
    
    /**
     * Initialize dictionary with common terms
     * @private
     */
    _initializeDictionary() {
        const commonWords = [
            // AI/ML terms
            'artificial', 'intelligence', 'machine', 'learning', 'neural', 'network',
            'deep', 'model', 'training', 'inference', 'embedding', 'vector',
            'transformer', 'attention', 'language', 'generation', 'prediction',
            
            // Technical terms
            'function', 'variable', 'class', 'method', 'object', 'array',
            'string', 'number', 'boolean', 'null', 'undefined', 'async',
            'await', 'promise', 'callback', 'event', 'listener', 'handler',
            
            // Common verbs
            'create', 'delete', 'update', 'read', 'write', 'execute',
            'initialize', 'configure', 'enable', 'disable', 'toggle',
            'analyze', 'process', 'generate', 'transform', 'convert',
            
            // Common nouns
            'system', 'application', 'interface', 'component', 'module',
            'service', 'request', 'response', 'data', 'result', 'output',
            'configuration', 'settings', 'preferences', 'options'
        ];
        
        commonWords.forEach(word => {
            this._dictionary.add(word.toLowerCase());
        });
    }
    
    /**
     * Learn from text
     * @param {string} text
     */
    learn(text) {
        const words = text.toLowerCase().split(/\s+/).filter(w => w.length > 2);
        
        words.forEach(word => {
            this._dictionary.add(word);
            this._frequencies.set(word, (this._frequencies.get(word) || 0) + 1);
        });
    }
    
    /**
     * Update context
     * @param {string} text
     */
    updateContext(text) {
        const words = text.toLowerCase().split(/\s+/);
        this._contextWords = words.slice(-10); // Keep last 10 words
    }
    
    /**
     * Get suggestions for input
     * @param {string} input
     * @returns {Array}
     */
    getSuggestions(input) {
        const words = input.split(/\s+/);
        const lastWord = words[words.length - 1].toLowerCase();
        
        if (lastWord.length < this._config.minChars) {
            return [];
        }
        
        const suggestions = [];
        
        // Find matching words
        this._dictionary.forEach(word => {
            if (word.startsWith(lastWord) && word !== lastWord) {
                suggestions.push({
                    word,
                    frequency: this._frequencies.get(word) || 0,
                    score: this._calculateScore(word, lastWord, words)
                });
            }
        });
        
        // Sort by score
        suggestions.sort((a, b) => b.score - a.score);
        
        return suggestions.slice(0, this._config.maxSuggestions);
    }
    
    /**
     * Calculate suggestion score
     * @param {string} word
     * @param {string} prefix
     * @param {Array} context
     * @returns {number}
     * @private
     */
    _calculateScore(word, prefix, context) {
        let score = 0;
        
        // Base score from frequency
        score += Math.min(this._frequencies.get(word) || 1, 10);
        
        // Bonus for shorter words (more likely to be what user wants)
        score += Math.max(5 - word.length / 3, 0);
        
        // Context bonus
        if (this._contextWords.length > 0) {
            const contextMatch = this._contextWords.some(w => {
                // Simple co-occurrence check
                return word.includes(w) || w.includes(word);
            });
            if (contextMatch) {
                score += 5;
            }
        }
        
        // Exact prefix match bonus
        if (word === prefix) {
            score += 100;
        }
        
        return score;
    }
    
    /**
     * Clear learned data
     */
    clear() {
        this._dictionary.clear();
        this._frequencies.clear();
        this._contextWords = [];
        this._initializeDictionary();
    }
};

// ============================================================================
// VOICE INTERFACE
// ============================================================================

/**
 * Voice Interface - Speech recognition and synthesis
 * @class VoiceInterface
 * @memberof DRS.Chat
 */
DRS.Chat.VoiceInterface = class VoiceInterface {
    /**
     * Create a new Voice Interface
     * @param {Object} config
     */
    constructor(config = {}) {
        this._config = {
            recognitionLang: config.recognitionLang || 'en-US',
            synthesisLang: config.synthesisLang || 'en-US',
            rate: config.rate || 1.0,
            pitch: config.pitch || 1.0,
            ...config
        };
        
        this._recognition = null;
        this._synthesis = window.speechSynthesis;
        this._isListening = false;
        this._isSpeaking = false;
        this._currentUtterance = null;
        
        // Callbacks
        this._onResult = null;
        this._onError = null;
        this._onStart = null;
        this._onEnd = null;
        
        this._initialize();
    }
    
    /**
     * Initialize speech recognition
     * @private
     */
    _initialize() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        
        if (SpeechRecognition) {
            this._recognition = new SpeechRecognition();
            this._recognition.lang = this._config.recognitionLang;
            this._recognition.continuous = false;
            this._recognition.interimResults = true;
            
            this._recognition.onresult = (event) => {
                let interimTranscript = '';
                let finalTranscript = '';
                
                for (let i = event.resultIndex; i < event.results.length; i++) {
                    const transcript = event.results[i][0].transcript;
                    
                    if (event.results[i].isFinal) {
                        finalTranscript += transcript;
                    } else {
                        interimTranscript += transcript;
                    }
                }
                
                if (this._onResult) {
                    this._onResult({
                        interim: interimTranscript,
                        final: finalTranscript,
                        isFinal: finalTranscript.length > 0
                    });
                }
            };
            
            this._recognition.onerror = (event) => {
                this._isListening = false;
                if (this._onError) {
                    this._onError(event.error);
                }
            };
            
            this._recognition.onstart = () => {
                this._isListening = true;
                if (this._onStart) this._onStart();
            };
            
            this._recognition.onend = () => {
                this._isListening = false;
                if (this._onEnd) this._onEnd();
            };
        }
    }
    
    /**
     * Start listening
     */
    startListening() {
        if (!this._recognition) {
            console.warn('Speech recognition not supported');
            return false;
        }
        
        if (this._isListening) return false;
        
        try {
            this._recognition.start();
            return true;
        } catch (error) {
            console.error('Failed to start recognition:', error);
            return false;
        }
    }
    
    /**
     * Stop listening
     */
    stopListening() {
        if (this._recognition && this._isListening) {
            this._recognition.stop();
        }
    }
    
    /**
     * Speak text
     * @param {string} text
     * @param {Object} options
     */
    speak(text, options = {}) {
        if (!this._synthesis) {
            console.warn('Speech synthesis not supported');
            return false;
        }
        
        // Cancel current speech
        this.stopSpeaking();
        
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = options.lang || this._config.synthesisLang;
        utterance.rate = options.rate || this._config.rate;
        utterance.pitch = options.pitch || this._config.pitch;
        utterance.volume = options.volume || 1.0;
        
        // Select voice
        const voices = this._synthesis.getVoices();
        const preferredVoice = voices.find(v => 
            v.lang.startsWith('en') && v.name.includes('Google')
        ) || voices[0];
        
        if (preferredVoice) {
            utterance.voice = preferredVoice;
        }
        
        utterance.onstart = () => {
            this._isSpeaking = true;
        };
        
        utterance.onend = () => {
            this._isSpeaking = false;
            this._currentUtterance = null;
        };
        
        utterance.onerror = (event) => {
            this._isSpeaking = false;
            console.error('Speech error:', event);
        };
        
        this._currentUtterance = utterance;
        this._synthesis.speak(utterance);
        
        return true;
    }
    
    /**
     * Stop speaking
     */
    stopSpeaking() {
        if (this._synthesis) {
            this._synthesis.cancel();
            this._isSpeaking = false;
            this._currentUtterance = null;
        }
    }
    
    /**
     * Check if listening
     * @returns {boolean}
     */
    isListening() {
        return this._isListening;
    }
    
    /**
     * Check if speaking
     * @returns {boolean}
     */
    isSpeaking() {
        return this._isSpeaking;
    }
    
    /**
     * Check if supported
     * @returns {Object}
     */
    isSupported() {
        return {
            recognition: !!this._recognition,
            synthesis: !!this._synthesis
        };
    }
    
    /**
     * Set result callback
     * @param {Function} callback
     */
    onResult(callback) {
        this._onResult = callback;
    }
    
    /**
     * Set error callback
     * @param {Function} callback
     */
    onError(callback) {
        this._onError = callback;
    }
    
    /**
     * Set start callback
     * @param {Function} callback
     */
    onStart(callback) {
        this._onStart = callback;
    }
    
    /**
     * Set end callback
     * @param {Function} callback
     */
    onEnd(callback) {
        this._onEnd = callback;
    }
};

// ============================================================================
// CHAT ENGINE
// ============================================================================

/**
 * Chat Engine - Main chat orchestrator
 * @class ChatEngine
 * @memberof DRS.Chat
 */
DRS.Chat.ChatEngine = class ChatEngine {
    /**
     * Create a new Chat Engine
     * @param {Object} config
     */
    constructor(config = {}) {
        this._config = {
            maxMessages: config.maxMessages || 1000,
            streamingEnabled: config.streamingEnabled !== false,
            voiceEnabled: config.voiceEnabled !== false,
            ...config
        };
        
        // Components
        this._memory = new DRS.Chat.SemanticMemory(config.memory || {});
        this._contextManager = new DRS.Chat.ContextWindowManager(config.context || {});
        this._renderer = new DRS.Chat.MessageRenderer();
        this._commandEngine = new DRS.Chat.CommandEngine();
        this._autoComplete = new DRS.Chat.AutoCompleteAI();
        this._voice = new DRS.Chat.VoiceInterface();
        
        // State
        this._messages = [];
        this._currentConversationId = null;
        this._isProcessing = false;
        this._abortController = null;
        
        // References (set during initialization)
        this._api = null;
        this._state = null;
        this._eventBus = null;
        this._logger = null;
        
        // Container element
        this._container = null;
    }
    
    /**
     * Initialize the chat engine
     * @param {Object} core
     */
    async initialize(core) {
        this._api = core.getModule('api');
        this._state = core.state;
        this._eventBus = core.eventBus;
        this._logger = core.logger?.category('Chat') || null;
        
        // Initialize memory
        await this._memory.initialize();
        
        // Start new conversation
        this._startNewConversation();
        
        // Setup voice callbacks
        if (this._config.voiceEnabled) {
            this._voice.onResult((result) => {
                if (result.isFinal && this._onVoiceInput) {
                    this._onVoiceInput(result.final);
                }
            });
        }
        
        this._logger?.info('Chat Engine initialized');
    }
    
    /**
     * Set container element
     * @param {HTMLElement} container
     */
    setContainer(container) {
        this._container = container;
    }
    
    /**
     * Start new conversation
     * @private
     */
    _startNewConversation() {
        this._currentConversationId = 'conv-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
        this._messages = [];
        this._contextManager.clear();
    }
    
    /**
     * Send a message
     * @param {string} content
     * @param {Object} options
     * @returns {Promise<Object>}
     */
    async send(content, options = {}) {
        // Check if command
        if (content.startsWith('/')) {
            return this._executeCommand(content);
        }
        
        // Create user message
        const userMessage = this._createMessage({
            role: DRS.Chat.MessageTypes.USER,
            content
        });
        
        // Add to messages
        this._addMessage(userMessage);
        
        // Render user message
        this._renderMessage(userMessage);
        
        // Learn from input
        this._autoComplete.learn(content);
        
        // Add to context
        this._contextManager.addMessage({
            role: 'user',
            content
        });
        
        // Process with AI
        return this._processAIResponse(options);
    }
    
    /**
     * Execute a command
     * @param {string} input
     * @returns {Object}
     * @private
     */
    _executeCommand(input) {
        const result = this._commandEngine.execute(input, {
            chatEngine: this,
            state: this._state,
            memory: this._memory,
            api: this._api
        });
        
        if (result.type === 'notification' || result.type === 'error') {
            const message = this._createMessage({
                role: result.type === 'error' ? DRS.Chat.MessageTypes.ERROR : DRS.Chat.MessageTypes.NOTIFICATION,
                content: result.content || result.message
            });
            
            this._addMessage(message);
            this._renderMessage(message);
        }
        
        return result;
    }
    
    /**
     * Process AI response
     * @param {Object} options
     * @returns {Promise<Object>}
     * @private
     */
    async _processAIResponse(options = {}) {
        if (this._isProcessing) {
            return { error: 'Already processing' };
        }
        
        this._isProcessing = true;
        this._abortController = new AbortController();
        
        // Create assistant message placeholder
        const assistantMessage = this._createMessage({
            role: DRS.Chat.MessageTypes.ASSISTANT,
            content: '',
            status: DRS.Chat.MessageStatus.PENDING
        });
        
        this._addMessage(assistantMessage);
        this._renderMessage(assistantMessage);
        
        // Update state
        this._state?.set('chat.isTyping', true);
        this._eventBus?.dispatch('ai:typing', { started: true });
        
        try {
            // Get context
            const context = this._contextManager.getContext();
            
            // Get AI response
            if (this._config.streamingEnabled && this._api) {
                await this._streamResponse(context, assistantMessage);
            } else if (this._api) {
                await this._getCompleteResponse(context, assistantMessage);
            } else {
                assistantMessage.content = 'AI API not available. Please check your connection.';
                assistantMessage.status = DRS.Chat.MessageStatus.ERROR;
            }
            
            // Update status
            assistantMessage.status = DRS.Chat.MessageStatus.COMPLETE;
            
            // Add to context
            this._contextManager.addMessage({
                role: 'assistant',
                content: assistantMessage.content
            });
            
            // Learn from response
            this._autoComplete.learn(assistantMessage.content);
            
            // Store in memory
            await this._memory.store({
                type: 'conversation',
                content: assistantMessage.content,
                metadata: { conversationId: this._currentConversationId }
            });
            
            // Update message in UI
            this._updateMessageRender(assistantMessage);
            
            return { success: true, message: assistantMessage };
            
        } catch (error) {
            assistantMessage.status = DRS.Chat.MessageStatus.ERROR;
            assistantMessage.content = `Error: ${error.message}`;
            this._updateMessageRender(assistantMessage);
            
            return { error: error.message };
            
        } finally {
            this._isProcessing = false;
            this._abortController = null;
            this._state?.set('chat.isTyping', false);
            this._eventBus?.dispatch('ai:typing', { started: false });
        }
    }
    
    /**
     * Stream AI response
     * @param {Array} context
     * @param {Object} message
     * @private
     */
    async _streamResponse(context, message) {
        const model = this._state?.get('chat.model') || 'llama3.2';
        
        for await (const chunk of this._api.chatStream(context, { model })) {
            if (this._abortController?.signal.aborted) {
                message.status = DRS.Chat.MessageStatus.CANCELLED;
                break;
            }
            
            if (chunk.message?.content) {
                message.content += chunk.message.content;
                message.status = DRS.Chat.MessageStatus.STREAMING;
                this._updateMessageRender(message);
            }
        }
    }
    
    /**
     * Get complete AI response
     * @param {Array} context
     * @param {Object} message
     * @private
     */
    async _getCompleteResponse(context, message) {
        const model = this._state?.get('chat.model') || 'llama3.2';
        const response = await this._api.chat(context, { model });
        
        message.content = response.message?.content || 'No response';
    }
    
    /**
     * Create a message object
     * @param {Object} data
     * @returns {Object}
     * @private
     */
    _createMessage(data) {
        return {
            id: 'msg-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
            conversationId: this._currentConversationId,
            timestamp: Date.now(),
            status: DRS.Chat.MessageStatus.COMPLETE,
            ...data
        };
    }
    
    /**
     * Add message to list
     * @param {Object} message
     * @private
     */
    _addMessage(message) {
        this._messages.push(message);
        
        // Trim if needed
        while (this._messages.length > this._config.maxMessages) {
            this._messages.shift();
        }
        
        // Update state
        this._state?.set('chat.messages', [...this._messages]);
        this._state?.set('session.messageCount', this._messages.length);
    }
    
    /**
     * Render a message
     * @param {Object} message
     * @private
     */
    _renderMessage(message) {
        if (!this._container) return;
        
        const element = this._renderer.render(message);
        this._container.appendChild(element);
        
        // Scroll to bottom
        this._container.scrollTop = this._container.scrollHeight;
        
        // Store element reference
        message.element = element;
    }
    
    /**
     * Update message render
     * @param {Object} message
     * @private
     */
    _updateMessageRender(message) {
        if (!message.element) return;
        
        const contentEl = message.element.querySelector('.message-content');
        if (contentEl) {
            contentEl.innerHTML = this._renderer._markdownParser.parse(message.content);
        }
    }
    
    /**
     * Cancel current generation
     */
    cancel() {
        if (this._abortController) {
            this._abortController.abort();
        }
    }
    
    /**
     * Clear chat
     */
    clear() {
        // Save current conversation
        if (this._messages.length > 0) {
            this._memory.storeConversation(this._currentConversationId, this._messages);
        }
        
        // Start new conversation
        this._startNewConversation();
        
        // Clear UI
        if (this._container) {
            this._container.innerHTML = '';
        }
        
        // Update state
        this._state?.set('chat.messages', []);
    }
    
    /**
     * Get auto-complete suggestions
     * @param {string} input
     * @returns {Array}
     */
    getAutoComplete(input) {
        // Check for command completion
        if (input.startsWith('/')) {
            return this._commandEngine.getCompletions(input);
        }
        
        // Word completion
        return this._autoComplete.getSuggestions(input);
    }
    
    /**
     * Start voice input
     */
    startVoiceInput() {
        if (this._config.voiceEnabled) {
            return this._voice.startListening();
        }
        return false;
    }
    
    /**
     * Stop voice input
     */
    stopVoiceInput() {
        this._voice.stopListening();
    }
    
    /**
     * Speak a message
     * @param {string} text
     */
    speak(text) {
        if (this._config.voiceEnabled) {
            this._voice.speak(text);
        }
    }
    
    /**
     * Set voice input callback
     * @param {Function} callback
     */
    onVoiceInput(callback) {
        this._onVoiceInput = callback;
    }
    
    /**
     * Regenerate last response
     * @returns {Promise<Object>}
     */
    async regenerate() {
        // Find last user message
        const lastUserMessage = [...this._messages].reverse().find(m => m.role === 'user');
        
        if (!lastUserMessage) {
            return { error: 'No message to regenerate' };
        }
        
        // Remove last assistant message
        const lastAssistantIndex = this._messages.length - 1;
        if (this._messages[lastAssistantIndex].role === 'assistant') {
            this._messages.pop();
            
            // Remove from UI
            if (this._container && this._messages[lastAssistantIndex].element) {
                this._messages[lastAssistantIndex].element.remove();
            }
        }
        
        // Process again
        return this._processAIResponse();
    }
    
    /**
     * Get messages
     * @returns {Array}
     */
    getMessages() {
        return [...this._messages];
    }
    
    /**
     * Get memory stats
     * @returns {Object}
     */
    getMemoryStats() {
        return this._memory.getStats();
    }
    
    /**
     * Export conversation
     * @param {string} format
     * @returns {string}
     */
    export(format = 'json') {
        if (format === 'json') {
            return JSON.stringify(this._messages, null, 2);
        }
        
        if (format === 'md') {
            return this._messages.map(m => `**${m.role}**: ${m.content}`).join('\n\n---\n\n');
        }
        
        return this._messages.map(m => `[${m.role}]: ${m.content}`).join('\n\n');
    }
};

// Export to global scope
globalThis.DRS = DRS;

console.log('%c[DRS.VIP-AI] Chat Engine Loaded', 'color: #00fff2; font-weight: bold');