/**
 * DRS.VIP-AI AI Worker
 * Handles AI inference and model operations in a separate thread
 * @version 1.0.0
 * @author DRS.VIP-AI Engineering Team
 */

'use strict';

// ============================================================================
// AI WORKER CONFIGURATION
// ============================================================================

const AI_CONFIG = {
    defaultModel: 'llama3.2',
    baseUrl: 'http://localhost:11434',
    timeout: 120000,
    maxTokens: 4096,
    temperature: 0.7,
    topP: 0.9,
    contextWindow: 8192,
    streamingChunkSize: 50
};

// ============================================================================
// MODEL MANAGER
// ============================================================================

class ModelManager {
    constructor() {
        this.models = new Map();
        this.loadedModels = new Set();
        this.defaultParameters = {
            temperature: AI_CONFIG.temperature,
            top_p: AI_CONFIG.topP,
            num_predict: AI_CONFIG.maxTokens
        };
    }

    async listModels() {
        try {
            const response = await fetch(`${AI_CONFIG.baseUrl}/api/tags`);
            if (!response.ok) {
                throw new Error(`Failed to fetch models: ${response.status}`);
            }
            const data = await response.json();
            
            // Store models
            for (const model of data.models || []) {
                this.models.set(model.name, {
                    name: model.name,
                    size: model.size,
                    modified_at: model.modified_at,
                    digest: model.digest
                });
            }
            
            return data.models || [];
        } catch (error) {
            console.error('Failed to list models:', error);
            return [];
        }
    }

    async loadModel(modelName) {
        try {
            const response = await fetch(`${AI_CONFIG.baseUrl}/api/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: modelName,
                    keep_alive: '10m'
                })
            });

            if (response.ok) {
                this.loadedModels.add(modelName);
                return { loaded: true, model: modelName };
            }
            
            return { loaded: false, error: 'Failed to load model' };
        } catch (error) {
            return { loaded: false, error: error.message };
        }
    }

    async unloadModel(modelName) {
        try {
            const response = await fetch(`${AI_CONFIG.baseUrl}/api/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: modelName,
                    keep_alive: 0
                })
            });

            if (response.ok) {
                this.loadedModels.delete(modelName);
                return { unloaded: true, model: modelName };
            }
            
            return { unloaded: false, error: 'Failed to unload model' };
        } catch (error) {
            return { unloaded: false, error: error.message };
        }
    }

    getModelInfo(modelName) {
        return this.models.get(modelName) || null;
    }

    getLoadedModels() {
        return Array.from(this.loadedModels);
    }
}

// ============================================================================
// INFERENCE ENGINE
// ============================================================================

class InferenceEngine {
    constructor(modelManager) {
        this.modelManager = modelManager;
        this.activeRequests = new Map();
    }

    async generate(params) {
        const {
            model = AI_CONFIG.defaultModel,
            prompt,
            system = '',
            context = [],
            temperature = AI_CONFIG.temperature,
            topP = AI_CONFIG.topP,
            maxTokens = AI_CONFIG.maxTokens,
            stop = [],
            stream = false,
            requestId
        } = params;

        const controller = new AbortController();
        this.activeRequests.set(requestId, controller);

        const requestBody = {
            model,
            prompt,
            system,
            context,
            options: {
                temperature,
                top_p: topP,
                num_predict: maxTokens,
                stop
            },
            stream
        };

        try {
            const response = await fetch(`${AI_CONFIG.baseUrl}/api/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody),
                signal: controller.signal
            });

            if (!response.ok) {
                throw new Error(`Generation failed: ${response.status}`);
            }

            if (stream) {
                return await this.handleStreamResponse(response, requestId);
            } else {
                const data = await response.json();
                return {
                    response: data.response,
                    model: data.model,
                    totalDuration: data.total_duration,
                    evalCount: data.eval_count,
                    context: data.context
                };
            }
        } catch (error) {
            if (error.name === 'AbortError') {
                return { aborted: true, requestId };
            }
            throw error;
        } finally {
            this.activeRequests.delete(requestId);
        }
    }

    async handleStreamResponse(response, requestId) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullResponse = '';
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            
            if (done) {
                postMessage({
                    type: 'GENERATION_COMPLETE',
                    payload: { requestId, fullResponse }
                });
                break;
            }

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                if (line.trim()) {
                    try {
                        const data = JSON.parse(line);
                        
                        if (data.response) {
                            fullResponse += data.response;
                            postMessage({
                                type: 'GENERATION_TOKEN',
                                payload: {
                                    requestId,
                                    token: data.response,
                                    fullResponse
                                }
                            });
                        }

                        if (data.done) {
                            postMessage({
                                type: 'GENERATION_COMPLETE',
                                payload: {
                                    requestId,
                                    fullResponse,
                                    totalDuration: data.total_duration,
                                    evalCount: data.eval_count
                                }
                            });
                        }
                    } catch (parseError) {
                        console.error('Parse error:', parseError);
                    }
                }
            }
        }

        return { fullResponse, requestId };
    }

    abort(requestId) {
        const controller = this.activeRequests.get(requestId);
        if (controller) {
            controller.abort();
            this.activeRequests.delete(requestId);
            return true;
        }
        return false;
    }

    async chat(params) {
        const {
            model = AI_CONFIG.defaultModel,
            messages,
            temperature = AI_CONFIG.temperature,
            topP = AI_CONFIG.topP,
            maxTokens = AI_CONFIG.maxTokens,
            stream = false,
            requestId
        } = params;

        const controller = new AbortController();
        this.activeRequests.set(requestId, controller);

        const requestBody = {
            model,
            messages,
            options: {
                temperature,
                top_p: topP,
                num_predict: maxTokens
            },
            stream
        };

        try {
            const response = await fetch(`${AI_CONFIG.baseUrl}/api/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody),
                signal: controller.signal
            });

            if (!response.ok) {
                throw new Error(`Chat failed: ${response.status}`);
            }

            if (stream) {
                return await this.handleChatStreamResponse(response, requestId);
            } else {
                const data = await response.json();
                return {
                    message: data.message,
                    model: data.model,
                    totalDuration: data.total_duration,
                    evalCount: data.eval_count
                };
            }
        } catch (error) {
            if (error.name === 'AbortError') {
                return { aborted: true, requestId };
            }
            throw error;
        } finally {
            this.activeRequests.delete(requestId);
        }
    }

    async handleChatStreamResponse(response, requestId) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullContent = '';
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            
            if (done) {
                postMessage({
                    type: 'CHAT_COMPLETE',
                    payload: { requestId, fullContent }
                });
                break;
            }

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                if (line.trim()) {
                    try {
                        const data = JSON.parse(line);
                        
                        if (data.message?.content) {
                            fullContent += data.message.content;
                            postMessage({
                                type: 'CHAT_TOKEN',
                                payload: {
                                    requestId,
                                    token: data.message.content,
                                    fullContent
                                }
                            });
                        }

                        if (data.done) {
                            postMessage({
                                type: 'CHAT_COMPLETE',
                                payload: {
                                    requestId,
                                    fullContent,
                                    totalDuration: data.total_duration,
                                    evalCount: data.eval_count
                                }
                            });
                        }
                    } catch (parseError) {
                        console.error('Parse error:', parseError);
                    }
                }
            }
        }

        return { fullContent, requestId };
    }

    async embeddings(params) {
        const {
            model = AI_CONFIG.defaultModel,
            prompt
        } = params;

        const response = await fetch(`${AI_CONFIG.baseUrl}/api/embeddings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model,
                prompt
            })
        });

        if (!response.ok) {
            throw new Error(`Embedding failed: ${response.status}`);
        }

        const data = await response.json();
        return {
            embedding: data.embedding,
            model: data.model || model
        };
    }
}

// ============================================================================
// CONTEXT MANAGER
// ============================================================================

class ContextManager {
    constructor(maxContextSize = AI_CONFIG.contextWindow) {
        this.maxContextSize = maxContextSize;
        this.contexts = new Map();
    }

    createContext(contextId, systemPrompt = '') {
        const context = {
            id: contextId,
            systemPrompt,
            messages: [],
            tokenCount: 0,
            createdAt: Date.now(),
            lastAccessed: Date.now()
        };
        
        this.contexts.set(contextId, context);
        return context;
    }

    getContext(contextId) {
        const context = this.contexts.get(contextId);
        if (context) {
            context.lastAccessed = Date.now();
        }
        return context;
    }

    addMessage(contextId, role, content) {
        const context = this.contexts.get(contextId);
        if (!context) return null;

        const message = {
            role,
            content,
            timestamp: Date.now()
        };

        context.messages.push(message);
        context.tokenCount += this.estimateTokens(content);
        context.lastAccessed = Date.now();

        // Trim if needed
        if (context.tokenCount > this.maxContextSize) {
            this.trimContext(contextId);
        }

        return message;
    }

    trimContext(contextId) {
        const context = this.contexts.get(contextId);
        if (!context) return;

        // Remove oldest messages until under limit
        while (context.messages.length > 0 && context.tokenCount > this.maxContextSize * 0.8) {
            const removed = context.messages.shift();
            context.tokenCount -= this.estimateTokens(removed.content);
        }
    }

    estimateTokens(text) {
        // Rough estimation: ~4 characters per token
        return Math.ceil(text.length / 4);
    }

    getMessagesForModel(contextId) {
        const context = this.contexts.get(contextId);
        if (!context) return [];

        const messages = [];
        
        if (context.systemPrompt) {
            messages.push({
                role: 'system',
                content: context.systemPrompt
            });
        }

        for (const msg of context.messages) {
            messages.push({
                role: msg.role,
                content: msg.content
            });
        }

        return messages;
    }

    clearContext(contextId) {
        const context = this.contexts.get(contextId);
        if (context) {
            context.messages = [];
            context.tokenCount = 0;
            context.lastAccessed = Date.now();
        }
    }

    deleteContext(contextId) {
        return this.contexts.delete(contextId);
    }

    listContexts() {
        return Array.from(this.contexts.values()).map(c => ({
            id: c.id,
            messageCount: c.messages.length,
            tokenCount: c.tokenCount,
            createdAt: c.createdAt,
            lastAccessed: c.lastAccessed
        }));
    }

    pruneInactive(maxAge = 3600000) {
        const now = Date.now();
        const toDelete = [];

        for (const [id, context] of this.contexts) {
            if (now - context.lastAccessed > maxAge) {
                toDelete.push(id);
            }
        }

        for (const id of toDelete) {
            this.contexts.delete(id);
        }

        return toDelete.length;
    }
}

// ============================================================================
// PROMPT TEMPLATES
// ============================================================================

class PromptTemplates {
    constructor() {
        this.templates = new Map();
        this.registerDefaultTemplates();
    }

    registerDefaultTemplates() {
        this.register('default', {
            system: 'You are a helpful AI assistant.',
            user: '{input}',
            format: (system, user) => `${system}\n\nUser: ${user}\n\nAssistant:`
        });

        this.register('chatml', {
            system: '<|im_start|>system\n{system}<|im_end|>',
            user: '<|im_start|>user\n{input}<|im_end|>',
            assistant: '<|im_start|>assistant\n',
            format: (system, user) => `${system}\n${user}\n<|im_start|>assistant\n`
        });

        this.register('alpaca', {
            system: 'Below is an instruction that describes a task. Write a response that appropriately completes the request.',
            user: '### Instruction:\n{input}\n\n### Response:',
            format: (system, user) => `${system}\n\n${user}`
        });

        this.register('vicuna', {
            system: 'A chat between a curious user and an artificial intelligence assistant. The assistant gives helpful, detailed, and polite answers to the user\'s questions.',
            user: 'USER: {input}',
            assistant: 'ASSISTANT:',
            format: (system, user) => `${system}\n\n${user}\nASSISTANT:`
        });

        this.register('llama3', {
            system: '<|start_header_id|>system<|end_header_id|>\n\n{system}<|eot_id|>',
            user: '<|start_header_id|>user<|end_header_id|>\n\n{input}<|eot_id|>',
            assistant: '<|start_header_id|>assistant<|end_header_id|>\n\n',
            format: (system, user) => `${system}\n${user}\n<|start_header_id|>assistant<|end_header_id|>\n\n`
        });
    }

    register(name, template) {
        this.templates.set(name, template);
    }

    get(name) {
        return this.templates.get(name) || this.templates.get('default');
    }

    format(templateName, params) {
        const template = this.get(templateName);
        let formatted = '';

        if (params.system && template.system) {
            formatted += template.system.replace('{system}', params.system);
        }

        if (params.input) {
            const userPart = template.user.replace('{input}', params.input);
            formatted += template.format 
                ? template.format(formatted, userPart) 
                : `${formatted}\n${userPart}`;
        }

        return formatted;
    }

    listTemplates() {
        return Array.from(this.templates.keys());
    }
}

// ============================================================================
// TOKENIZER (Simple Implementation)
// ============================================================================

class SimpleTokenizer {
    constructor() {
        this.vocabulary = new Map();
        this.reverseVocabulary = new Map();
        this.nextId = 0;
    }

    tokenize(text) {
        // Simple whitespace and punctuation tokenization
        const tokens = text
            .toLowerCase()
            .replace(/([.,!?;:'"(){}\[\]])/g, ' $1 ')
            .split(/\s+/)
            .filter(t => t.length > 0);

        return tokens;
    }

    encode(text) {
        const tokens = this.tokenize(text);
        const ids = [];

        for (const token of tokens) {
            if (!this.vocabulary.has(token)) {
                this.vocabulary.set(token, this.nextId);
                this.reverseVocabulary.set(this.nextId, token);
                this.nextId++;
            }
            ids.push(this.vocabulary.get(token));
        }

        return ids;
    }

    decode(ids) {
        return ids
            .map(id => this.reverseVocabulary.get(id) || '<unk>')
            .join(' ')
            .replace(/ ([.,!?;:'"(){}\[\]]) /g, '$1');
    }

    getVocabularySize() {
        return this.vocabulary.size;
    }
}

// ============================================================================
// AI WORKER MAIN CLASS
// ============================================================================

class AIWorker {
    constructor() {
        this.modelManager = new ModelManager();
        this.inferenceEngine = new InferenceEngine(this.modelManager);
        this.contextManager = new ContextManager();
        this.promptTemplates = new PromptTemplates();
        this.tokenizer = new SimpleTokenizer();
        this.stats = {
            generations: 0,
            chats: 0,
            embeddings: 0,
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
                    // Model Management
                    case 'LIST_MODELS':
                        result = { models: await this.modelManager.listModels() };
                        break;

                    case 'LOAD_MODEL':
                        result = await this.modelManager.loadModel(payload.model);
                        break;

                    case 'UNLOAD_MODEL':
                        result = await this.modelManager.unloadModel(payload.model);
                        break;

                    case 'GET_LOADED_MODELS':
                        result = { models: this.modelManager.getLoadedModels() };
                        break;

                    // Generation
                    case 'GENERATE':
                        result = await this.inferenceEngine.generate({
                            ...payload,
                            requestId
                        });
                        this.stats.generations++;
                        break;

                    case 'CHAT':
                        result = await this.inferenceEngine.chat({
                            ...payload,
                            requestId
                        });
                        this.stats.chats++;
                        break;

                    case 'ABORT_GENERATION':
                        result = { aborted: this.inferenceEngine.abort(payload.requestId) };
                        break;

                    case 'GET_EMBEDDINGS':
                        result = await this.inferenceEngine.embeddings(payload);
                        this.stats.embeddings++;
                        break;

                    // Context Management
                    case 'CREATE_CONTEXT':
                        result = { context: this.contextManager.createContext(
                            payload.contextId,
                            payload.systemPrompt
                        )};
                        break;

                    case 'GET_CONTEXT':
                        result = { context: this.contextManager.getContext(payload.contextId) };
                        break;

                    case 'ADD_MESSAGE':
                        result = { message: this.contextManager.addMessage(
                            payload.contextId,
                            payload.role,
                            payload.content
                        )};
                        break;

                    case 'GET_CONTEXT_MESSAGES':
                        result = { messages: this.contextManager.getMessagesForModel(payload.contextId) };
                        break;

                    case 'CLEAR_CONTEXT':
                        this.contextManager.clearContext(payload.contextId);
                        result = { cleared: true };
                        break;

                    case 'DELETE_CONTEXT':
                        result = { deleted: this.contextManager.deleteContext(payload.contextId) };
                        break;

                    case 'LIST_CONTEXTS':
                        result = { contexts: this.contextManager.listContexts() };
                        break;

                    // Prompt Templates
                    case 'FORMAT_PROMPT':
                        result = { prompt: this.promptTemplates.format(
                            payload.template,
                            payload.params
                        )};
                        break;

                    case 'LIST_TEMPLATES':
                        result = { templates: this.promptTemplates.listTemplates() };
                        break;

                    case 'REGISTER_TEMPLATE':
                        this.promptTemplates.register(payload.name, payload.template);
                        result = { registered: true };
                        break;

                    // Tokenization
                    case 'TOKENIZE':
                        result = { tokens: this.tokenizer.tokenize(payload.text) };
                        break;

                    case 'ENCODE':
                        result = { ids: this.tokenizer.encode(payload.text) };
                        break;

                    case 'DECODE':
                        result = { text: this.tokenizer.decode(payload.ids) };
                        break;

                    // Utility
                    case 'GET_STATS':
                        result = this.getStats();
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
                        name: error.name
                    }
                });
            }
        };
    }

    async healthCheck() {
        try {
            const response = await fetch(`${AI_CONFIG.baseUrl}/api/version`, {
                method: 'GET',
                timeout: 5000
            });
            
            if (response.ok) {
                const data = await response.json();
                return {
                    status: 'healthy',
                    ollama: data,
                    timestamp: Date.now()
                };
            }
            
            return {
                status: 'degraded',
                ollama: null,
                timestamp: Date.now()
            };
        } catch {
            return {
                status: 'unhealthy',
                ollama: null,
                timestamp: Date.now()
            };
        }
    }

    getStats() {
        return {
            ...this.stats,
            loadedModels: this.modelManager.getLoadedModels(),
            activeContexts: this.contextManager.listContexts().length,
            vocabularySize: this.tokenizer.getVocabularySize()
        };
    }
}

// ============================================================================
// INITIALIZE WORKER
// ============================================================================

const aiWorker = new AIWorker();

// Signal ready state
postMessage({
    type: 'WORKER_READY',
    payload: {
        name: 'ai-worker',
        version: '1.0.0',
        timestamp: Date.now()
    }
});