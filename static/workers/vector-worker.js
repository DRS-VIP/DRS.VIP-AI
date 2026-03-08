/**
 * DRS.VIP-AI Vector Worker
 * Handles vector operations and similarity calculations in a separate thread
 * @version 1.0.0
 * @author DRS.VIP-AI Engineering Team
 */

'use strict';

// ============================================================================
// VECTOR WORKER CONFIGURATION
// ============================================================================

const VECTOR_CONFIG = {
    dimensions: 1536,
    similarityThreshold: 0.7,
    maxResults: 100,
    indexType: 'flat' // flat, ivf, hnsw
};

// ============================================================================
// VECTOR UTILITIES
// ============================================================================

class VectorUtils {
    /**
     * Calculate dot product of two vectors
     */
    static dot(a, b) {
        if (a.length !== b.length) {
            throw new Error('Vector dimensions must match');
        }
        
        let sum = 0;
        for (let i = 0; i < a.length; i++) {
            sum += a[i] * b[i];
        }
        return sum;
    }

    /**
     * Calculate Euclidean norm (L2) of a vector
     */
    static norm(a) {
        let sum = 0;
        for (let i = 0; i < a.length; i++) {
            sum += a[i] * a[i];
        }
        return Math.sqrt(sum);
    }

    /**
     * Normalize a vector to unit length
     */
    static normalize(a) {
        const n = this.norm(a);
        if (n === 0) return a.slice();
        return a.map(v => v / n);
    }

    /**
     * Add two vectors
     */
    static add(a, b) {
        if (a.length !== b.length) {
            throw new Error('Vector dimensions must match');
        }
        return a.map((v, i) => v + b[i]);
    }

    /**
     * Subtract two vectors
     */
    static subtract(a, b) {
        if (a.length !== b.length) {
            throw new Error('Vector dimensions must match');
        }
        return a.map((v, i) => v - b[i]);
    }

    /**
     * Multiply vector by scalar
     */
    static scale(a, scalar) {
        return a.map(v => v * scalar);
    }

    /**
     * Element-wise multiplication
     */
    static multiply(a, b) {
        if (a.length !== b.length) {
            throw new Error('Vector dimensions must match');
        }
        return a.map((v, i) => v * b[i]);
    }

    /**
     * Calculate cosine similarity between two vectors
     */
    static cosineSimilarity(a, b) {
        const dotProduct = this.dot(a, b);
        const normA = this.norm(a);
        const normB = this.norm(b);
        
        if (normA === 0 || normB === 0) return 0;
        
        return dotProduct / (normA * normB);
    }

    /**
     * Calculate Euclidean distance between two vectors
     */
    static euclideanDistance(a, b) {
        let sum = 0;
        for (let i = 0; i < a.length; i++) {
            const diff = a[i] - b[i];
            sum += diff * diff;
        }
        return Math.sqrt(sum);
    }

    /**
     * Calculate Manhattan distance between two vectors
     */
    static manhattanDistance(a, b) {
        let sum = 0;
        for (let i = 0; i < a.length; i++) {
            sum += Math.abs(a[i] - b[i]);
        }
        return sum;
    }

    /**
     * Calculate Hamming distance between two vectors
     */
    static hammingDistance(a, b) {
        let count = 0;
        for (let i = 0; i < a.length; i++) {
            if (a[i] !== b[i]) count++;
        }
        return count;
    }

    /**
     * Calculate Jaccard similarity for binary vectors
     */
    static jaccardSimilarity(a, b) {
        let intersection = 0;
        let union = 0;
        
        for (let i = 0; i < a.length; i++) {
            if (a[i] || b[i]) union++;
            if (a[i] && b[i]) intersection++;
        }
        
        return union === 0 ? 0 : intersection / union;
    }

    /**
     * Create a zero vector
     */
    static zeros(dimensions) {
        return new Array(dimensions).fill(0);
    }

    /**
     * Create a random vector
     */
    static random(dimensions, normalized = true) {
        const v = Array.from({ length: dimensions }, () => Math.random() * 2 - 1);
        return normalized ? this.normalize(v) : v;
    }

    /**
     * Check if two vectors are equal
     */
    static equals(a, b, tolerance = 1e-10) {
        if (a.length !== b.length) return false;
        for (let i = 0; i < a.length; i++) {
            if (Math.abs(a[i] - b[i]) > tolerance) return false;
        }
        return true;
    }
}

// ============================================================================
// MATRIX OPERATIONS
// ============================================================================

class MatrixOps {
    /**
     * Matrix-vector multiplication
     */
    static matVec(matrix, vector) {
        return matrix.map(row => VectorUtils.dot(row, vector));
    }

    /**
     * Matrix-matrix multiplication
     */
    static matMul(a, b) {
        const result = [];
        const colsB = b[0].length;
        
        for (let i = 0; i < a.length; i++) {
            result[i] = [];
            for (let j = 0; j < colsB; j++) {
                let sum = 0;
                for (let k = 0; k < b.length; k++) {
                    sum += a[i][k] * b[k][j];
                }
                result[i][j] = sum;
            }
        }
        
        return result;
    }

    /**
     * Transpose matrix
     */
    static transpose(matrix) {
        const rows = matrix.length;
        const cols = matrix[0].length;
        const result = [];
        
        for (let j = 0; j < cols; j++) {
            result[j] = [];
            for (let i = 0; i < rows; i++) {
                result[j][i] = matrix[i][j];
            }
        }
        
        return result;
    }

    /**
     * Calculate mean vector from matrix
     */
    static mean(matrix) {
        if (matrix.length === 0) return [];
        
        const dims = matrix[0].length;
        const mean = VectorUtils.zeros(dims);
        
        for (const row of matrix) {
            for (let i = 0; i < dims; i++) {
                mean[i] += row[i];
            }
        }
        
        return VectorUtils.scale(mean, 1 / matrix.length);
    }

    /**
     * Calculate covariance matrix
     */
    static covariance(matrix) {
        const n = matrix.length;
        if (n === 0) return [];
        
        const dims = matrix[0].length;
        const mean = this.mean(matrix);
        const centered = matrix.map(row => VectorUtils.subtract(row, mean));
        
        const cov = [];
        for (let i = 0; i < dims; i++) {
            cov[i] = [];
            for (let j = 0; j < dims; j++) {
                let sum = 0;
                for (let k = 0; k < n; k++) {
                    sum += centered[k][i] * centered[k][j];
                }
                cov[i][j] = sum / (n - 1);
            }
        }
        
        return cov;
    }
}

// ============================================================================
// VECTOR STORE (Flat Index)
// ============================================================================

class VectorStore {
    constructor(dimensions = VECTOR_CONFIG.dimensions) {
        this.dimensions = dimensions;
        this.vectors = new Map();
        this.metadata = new Map();
        this.normalized = new Map();
    }

    /**
     * Add a vector to the store
     */
    add(id, vector, meta = {}) {
        if (vector.length !== this.dimensions) {
            throw new Error(`Vector must have ${this.dimensions} dimensions`);
        }

        this.vectors.set(id, vector);
        this.metadata.set(id, {
            ...meta,
            id,
            addedAt: Date.now()
        });
        this.normalized.set(id, VectorUtils.normalize(vector));

        return { id, dimensions: this.dimensions };
    }

    /**
     * Add multiple vectors
     */
    addBatch(items) {
        const results = [];
        for (const item of items) {
            results.push(this.add(item.id, item.vector, item.metadata));
        }
        return results;
    }

    /**
     * Get a vector by ID
     */
    get(id) {
        const vector = this.vectors.get(id);
        const metadata = this.metadata.get(id);
        
        if (!vector) return null;
        
        return { id, vector, metadata };
    }

    /**
     * Remove a vector by ID
     */
    remove(id) {
        const existed = this.vectors.has(id);
        this.vectors.delete(id);
        this.metadata.delete(id);
        this.normalized.delete(id);
        return existed;
    }

    /**
     * Search for similar vectors
     */
    search(queryVector, k = 10, threshold = VECTOR_CONFIG.similarityThreshold) {
        const normalizedQuery = VectorUtils.normalize(queryVector);
        const scores = [];

        for (const [id, normalized] of this.normalized) {
            const similarity = VectorUtils.dot(normalizedQuery, normalized);
            
            if (similarity >= threshold) {
                scores.push({
                    id,
                    score: similarity,
                    metadata: this.metadata.get(id)
                });
            }
        }

        // Sort by score descending
        scores.sort((a, b) => b.score - a.score);

        return scores.slice(0, k);
    }

    /**
     * Search using different distance metrics
     */
    searchWithMetric(queryVector, k = 10, metric = 'cosine') {
        const scores = [];

        for (const [id, vector] of this.vectors) {
            let score;
            
            switch (metric) {
                case 'cosine':
                    score = VectorUtils.cosineSimilarity(queryVector, vector);
                    break;
                case 'euclidean':
                    score = 1 / (1 + VectorUtils.euclideanDistance(queryVector, vector));
                    break;
                case 'manhattan':
                    score = 1 / (1 + VectorUtils.manhattanDistance(queryVector, vector));
                    break;
                case 'dot':
                    score = VectorUtils.dot(queryVector, vector);
                    break;
                default:
                    score = VectorUtils.cosineSimilarity(queryVector, vector);
            }

            scores.push({
                id,
                score,
                metadata: this.metadata.get(id)
            });
        }

        // Sort by score descending
        scores.sort((a, b) => b.score - a.score);

        return scores.slice(0, k);
    }

    /**
     * Find nearest neighbors for all vectors
     */
    findNeighbors(k = 5) {
        const neighbors = new Map();

        for (const [id, normalized] of this.normalized) {
            const scores = [];

            for (const [otherId, otherNormalized] of this.normalized) {
                if (id === otherId) continue;
                
                const similarity = VectorUtils.dot(normalized, otherNormalized);
                scores.push({ id: otherId, score: similarity });
            }

            scores.sort((a, b) => b.score - a.score);
            neighbors.set(id, scores.slice(0, k));
        }

        return neighbors;
    }

    /**
     * Get all IDs
     */
    getAllIds() {
        return Array.from(this.vectors.keys());
    }

    /**
     * Get count of vectors
     */
    get count() {
        return this.vectors.size;
    }

    /**
     * Clear all vectors
     */
    clear() {
        this.vectors.clear();
        this.metadata.clear();
        this.normalized.clear();
    }

    /**
     * Export store data
     */
    export() {
        const data = {
            dimensions: this.dimensions,
            vectors: [],
            metadata: []
        };

        for (const [id, vector] of this.vectors) {
            data.vectors.push({ id, vector });
            data.metadata.push({ id, ...this.metadata.get(id) });
        }

        return data;
    }

    /**
     * Import store data
     */
    import(data) {
        this.dimensions = data.dimensions;
        
        for (let i = 0; i < data.vectors.length; i++) {
            const { id, vector } = data.vectors[i];
            const meta = data.metadata[i] || {};
            this.add(id, vector, meta);
        }
    }

    /**
     * Get statistics
     */
    getStats() {
        let totalMagnitude = 0;
        const dimensionStats = new Array(this.dimensions).fill(0);

        for (const vector of this.vectors.values()) {
            totalMagnitude += VectorUtils.norm(vector);
            for (let i = 0; i < this.dimensions; i++) {
                dimensionStats[i] += Math.abs(vector[i]);
            }
        }

        return {
            count: this.vectors.size,
            dimensions: this.dimensions,
            avgMagnitude: this.vectors.size > 0 ? totalMagnitude / this.vectors.size : 0,
            dimensionStats: dimensionStats.map(s => s / Math.max(this.vectors.size, 1))
        };
    }
}

// ============================================================================
// SEMANTIC MEMORY
// ============================================================================

class SemanticMemory {
    constructor(dimensions = VECTOR_CONFIG.dimensions) {
        this.vectorStore = new VectorStore(dimensions);
        this.textIndex = new Map(); // text -> id
        this.nextId = 0;
    }

    /**
     * Store text with its embedding
     */
    store(text, embedding, metadata = {}) {
        const id = `mem_${++this.nextId}`;
        
        this.vectorStore.add(id, embedding, {
            text,
            ...metadata,
            storedAt: Date.now()
        });
        
        this.textIndex.set(text, id);
        
        return id;
    }

    /**
     * Store multiple texts
     */
    storeBatch(items) {
        const ids = [];
        for (const item of items) {
            ids.push(this.store(item.text, item.embedding, item.metadata));
        }
        return ids;
    }

    /**
     * Recall similar memories
     */
    recall(queryEmbedding, k = 5, threshold = 0.5) {
        const results = this.vectorStore.search(queryEmbedding, k, threshold);
        
        return results.map(r => ({
            ...r,
            text: r.metadata?.text
        }));
    }

    /**
     * Get memory by ID
     */
    get(id) {
        const result = this.vectorStore.get(id);
        if (result) {
            return {
                ...result,
                text: result.metadata?.text
            };
        }
        return null;
    }

    /**
     * Get memory by text
     */
    getByText(text) {
        const id = this.textIndex.get(text);
        return id ? this.get(id) : null;
    }

    /**
     * Update memory metadata
     */
    updateMetadata(id, metadata) {
        const existing = this.vectorStore.get(id);
        if (existing) {
            this.vectorStore.metadata.set(id, {
                ...existing.metadata,
                ...metadata,
                updatedAt: Date.now()
            });
            return true;
        }
        return false;
    }

    /**
     * Forget memory
     */
    forget(id) {
        const memory = this.vectorStore.get(id);
        if (memory) {
            this.textIndex.delete(memory.metadata?.text);
        }
        return this.vectorStore.remove(id);
    }

    /**
     * Clear all memories
     */
    clear() {
        this.vectorStore.clear();
        this.textIndex.clear();
        this.nextId = 0;
    }

    /**
     * Get memory count
     */
    get count() {
        return this.vectorStore.count;
    }

    /**
     * Prune old memories
     */
    prune(maxAge = 30 * 24 * 60 * 60 * 1000, maxCount = 10000) {
        const now = Date.now();
        const toRemove = [];

        // Remove by age
        for (const [id, meta] of this.vectorStore.metadata) {
            if (now - (meta.storedAt || 0) > maxAge) {
                toRemove.push(id);
            }
        }

        // Remove by count (oldest first)
        if (this.count > maxCount) {
            const sorted = Array.from(this.vectorStore.metadata.entries())
                .sort((a, b) => (a[1].storedAt || 0) - (b[1].storedAt || 0));
            
            const excessCount = this.count - maxCount;
            for (let i = 0; i < excessCount && i < sorted.length; i++) {
                if (!toRemove.includes(sorted[i][0])) {
                    toRemove.push(sorted[i][0]);
                }
            }
        }

        for (const id of toRemove) {
            this.forget(id);
        }

        return toRemove.length;
    }
}

// ============================================================================
// CLUSTERING
// ============================================================================

class VectorClustering {
    /**
     * K-means clustering
     */
    static kMeans(vectors, k, maxIterations = 100) {
        const n = vectors.length;
        const dims = vectors[0].length;
        
        // Initialize centroids randomly
        let centroids = [];
        const indices = new Set();
        while (indices.size < k) {
            indices.add(Math.floor(Math.random() * n));
        }
        for (const idx of indices) {
            centroids.push(vectors[idx].slice());
        }

        let assignments = new Array(n).fill(0);
        
        for (let iter = 0; iter < maxIterations; iter++) {
            // Assign points to nearest centroid
            let changed = false;
            
            for (let i = 0; i < n; i++) {
                let minDist = Infinity;
                let minCluster = 0;
                
                for (let j = 0; j < k; j++) {
                    const dist = VectorUtils.euclideanDistance(vectors[i], centroids[j]);
                    if (dist < minDist) {
                        minDist = dist;
                        minCluster = j;
                    }
                }
                
                if (assignments[i] !== minCluster) {
                    assignments[i] = minCluster;
                    changed = true;
                }
            }
            
            if (!changed) break;
            
            // Update centroids
            const counts = new Array(k).fill(0);
            centroids = Array.from({ length: k }, () => VectorUtils.zeros(dims));
            
            for (let i = 0; i < n; i++) {
                const cluster = assignments[i];
                counts[cluster]++;
                centroids[cluster] = VectorUtils.add(centroids[cluster], vectors[i]);
            }
            
            for (let j = 0; j < k; j++) {
                if (counts[j] > 0) {
                    centroids[j] = VectorUtils.scale(centroids[j], 1 / counts[j]);
                }
            }
        }
        
        return { centroids, assignments };
    }

    /**
     * Hierarchical clustering (agglomerative)
     */
    static hierarchical(vectors, maxClusters = 5) {
        const n = vectors.length;
        
        // Initialize each point as its own cluster
        let clusters = vectors.map((v, i) => ({
            id: i,
            vectors: [v],
            centroid: v.slice()
        }));

        const mergeHistory = [];

        while (clusters.length > maxClusters) {
            // Find closest pair
            let minDist = Infinity;
            let mergeI = 0, mergeJ = 1;

            for (let i = 0; i < clusters.length; i++) {
                for (let j = i + 1; j < clusters.length; j++) {
                    const dist = VectorUtils.euclideanDistance(
                        clusters[i].centroid,
                        clusters[j].centroid
                    );
                    if (dist < minDist) {
                        minDist = dist;
                        mergeI = i;
                        mergeJ = j;
                    }
                }
            }

            // Merge clusters
            const merged = {
                id: clusters.length,
                vectors: [...clusters[mergeI].vectors, ...clusters[mergeJ].vectors],
                centroid: null
            };
            merged.centroid = VectorUtils.scale(
                merged.vectors.reduce((a, b) => VectorUtils.add(a, b), VectorUtils.zeros(vectors[0].length)),
                1 / merged.vectors.length
            );

            mergeHistory.push({
                merged: [clusters[mergeI].id, clusters[mergeJ].id],
                distance: minDist
            });

            // Remove old clusters and add merged
            clusters = clusters.filter((_, i) => i !== mergeI && i !== mergeJ);
            clusters.push(merged);
        }

        return { clusters, mergeHistory };
    }

    /**
     * DBSCAN clustering
     */
    static dbscan(vectors, epsilon = 0.5, minPts = 3) {
        const n = vectors.length;
        const visited = new Array(n).fill(false);
        const labels = new Array(n).fill(-1); // -1 = noise
        let clusterId = 0;

        const getNeighbors = (idx) => {
            const neighbors = [];
            for (let i = 0; i < n; i++) {
                if (VectorUtils.cosineSimilarity(vectors[idx], vectors[i]) >= (1 - epsilon)) {
                    neighbors.push(i);
                }
            }
            return neighbors;
        };

        for (let i = 0; i < n; i++) {
            if (visited[i]) continue;
            visited[i] = true;

            const neighbors = getNeighbors(i);
            
            if (neighbors.length < minPts) {
                labels[i] = -1; // noise
            } else {
                // Start new cluster
                clusterId++;
                labels[i] = clusterId;

                const queue = [...neighbors];
                while (queue.length > 0) {
                    const j = queue.shift();
                    
                    if (!visited[j]) {
                        visited[j] = true;
                        const jNeighbors = getNeighbors(j);
                        
                        if (jNeighbors.length >= minPts) {
                            queue.push(...jNeighbors.filter(x => !visited[x]));
                        }
                    }
                    
                    if (labels[j] === -1) {
                        labels[j] = clusterId;
                    }
                }
            }
        }

        return {
            labels,
            numClusters: clusterId,
            noisePoints: labels.filter(l => l === -1).length
        };
    }
}

// ============================================================================
// DIMENSIONALITY REDUCTION
// ============================================================================

class DimensionalityReduction {
    /**
     * Principal Component Analysis (simplified)
     */
    static pca(vectors, targetDims) {
        const n = vectors.length;
        const dims = vectors[0].length;
        
        // Center the data
        const mean = MatrixOps.mean(vectors);
        const centered = vectors.map(v => VectorUtils.subtract(v, mean));
        
        // Compute covariance matrix
        const cov = MatrixOps.covariance(centered);
        
        // Power iteration for eigenvectors
        const eigenvectors = [];
        const covCopy = cov.map(row => row.slice());
        
        for (let k = 0; k < targetDims; k++) {
            let v = VectorUtils.random(dims, false);
            
            for (let iter = 0; iter < 100; iter++) {
                const Av = MatrixOps.matVec(covCopy, v);
                v = VectorUtils.normalize(Av);
            }
            
            eigenvectors.push(v);
            
            // Deflate
            const outer = v.map((vi, i) => v.map(vj => vi * vj));
            for (let i = 0; i < dims; i++) {
                for (let j = 0; j < dims; j++) {
                    covCopy[i][j] -= cov[i][j] * outer[i][j];
                }
            }
        }
        
        // Project data
        const reduced = centered.map(v => MatrixOps.matVec(eigenvectors, v));
        
        return {
            reduced,
            components: eigenvectors,
            mean,
            originalDims: dims,
            targetDims
        };
    }

    /**
     * t-SNE (simplified implementation)
     */
    static tsne(vectors, targetDims = 2, perplexity = 30, iterations = 1000) {
        const n = vectors.length;
        const initialDims = vectors[0].length;
        
        // Compute pairwise distances
        const distances = [];
        for (let i = 0; i < n; i++) {
            distances[i] = [];
            for (let j = 0; j < n; j++) {
                distances[i][j] = VectorUtils.euclideanDistance(vectors[i], vectors[j]);
            }
        }
        
        // Compute P matrix (similarities in high-D)
        const P = this.computeTSNEPMatrix(distances, perplexity);
        
        // Initialize Y randomly
        let Y = vectors.map(() => VectorUtils.random(targetDims, false));
        
        // Gradient descent
        const learningRate = 100;
        let momentum = 0.5;
        let prevGain = vectors.map(() => VectorUtils.zeros(targetDims));
        
        for (let t = 0; t < iterations; t++) {
            // Compute Q matrix (similarities in low-D)
            const Q = this.computeTSNEQMatrix(Y);
            
            // Compute gradient
            const gradY = this.computeTSNEGradient(P, Q, Y, n, targetDims);
            
            // Update Y
            for (let i = 0; i < n; i++) {
                for (let d = 0; d < targetDims; d++) {
                    const gain = (prevGain[i][d] + 0.2) * (gradY[i][d] > 0 ? 1 : -1);
                    Y[i][d] += learningRate * gradY[i][d] + momentum * prevGain[i][d];
                    prevGain[i][d] = gain;
                }
            }
            
            if (t > 250) momentum = 0.8;
        }
        
        return { embedding: Y, iterations };
    }

    static computeTSNEPMatrix(distances, perplexity) {
        const n = distances.length;
        const P = [];
        
        for (let i = 0; i < n; i++) {
            P[i] = [];
            let beta = 1;
            
            // Binary search for correct beta
            for (let iter = 0; iter < 50; iter++) {
                let sumP = 0;
                let h = 0;
                
                for (let j = 0; j < n; j++) {
                    if (i !== j) {
                        const p = Math.exp(-distances[i][j] * distances[i][j] * beta);
                        P[i][j] = p;
                        sumP += p;
                    }
                }
                
                if (sumP > 0) {
                    for (let j = 0; j < n; j++) {
                        if (i !== j) {
                            P[i][j] /= sumP;
                            if (P[i][j] > 1e-7) {
                                h -= P[i][j] * Math.log(P[i][j]);
                            }
                        }
                    }
                }
                
                const perp = Math.exp(h);
                const diff = perp - perplexity;
                
                if (Math.abs(diff) < 1e-5) break;
                beta *= diff > 0 ? 1.5 : 0.5;
            }
        }
        
        // Symmetrize
        for (let i = 0; i < n; i++) {
            for (let j = 0; j < i; j++) {
                P[i][j] = P[j][i] = (P[i][j] + P[j][i]) / (2 * n);
            }
        }
        
        return P;
    }

    static computeTSNEQMatrix(Y) {
        const n = Y.length;
        const Q = [];
        
        for (let i = 0; i < n; i++) {
            Q[i] = [];
            for (let j = 0; j < n; j++) {
                if (i !== j) {
                    const dist = VectorUtils.euclideanDistance(Y[i], Y[j]);
                    Q[i][j] = 1 / (1 + dist * dist);
                }
            }
        }
        
        // Normalize
        let sumQ = 0;
        for (let i = 0; i < n; i++) {
            for (let j = 0; j < n; j++) {
                sumQ += Q[i][j];
            }
        }
        
        for (let i = 0; i < n; i++) {
            for (let j = 0; j < n; j++) {
                Q[i][j] /= sumQ;
            }
        }
        
        return Q;
    }

    static computeTSNEGradient(P, Q, Y, n, dims) {
        const grad = [];
        
        for (let i = 0; i < n; i++) {
            grad[i] = VectorUtils.zeros(dims);
            
            for (let j = 0; j < n; j++) {
                if (i !== j) {
                    const diff = VectorUtils.subtract(Y[i], Y[j]);
                    const factor = (P[i][j] - Q[i][j]) * Q[i][j];
                    
                    for (let d = 0; d < dims; d++) {
                        grad[i][d] += factor * diff[d];
                    }
                }
            }
        }
        
        return grad;
    }
}

// ============================================================================
// VECTOR WORKER MAIN CLASS
// ============================================================================

class VectorWorker {
    constructor() {
        this.vectorStore = new VectorStore();
        this.semanticMemory = new SemanticMemory();
        this.stats = {
            operations: 0,
            searches: 0,
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
                    // Vector operations
                    case 'DOT_PRODUCT':
                        result = { result: VectorUtils.dot(payload.a, payload.b) };
                        break;

                    case 'COSINE_SIMILARITY':
                        result = { similarity: VectorUtils.cosineSimilarity(payload.a, payload.b) };
                        break;

                    case 'EUCLIDEAN_DISTANCE':
                        result = { distance: VectorUtils.euclideanDistance(payload.a, payload.b) };
                        break;

                    case 'NORMALIZE':
                        result = { normalized: VectorUtils.normalize(payload.vector) };
                        break;

                    case 'VECTOR_ADD':
                        result = { result: VectorUtils.add(payload.a, payload.b) };
                        break;

                    case 'VECTOR_SUBTRACT':
                        result = { result: VectorUtils.subtract(payload.a, payload.b) };
                        break;

                    case 'VECTOR_SCALE':
                        result = { result: VectorUtils.scale(payload.vector, payload.scalar) };
                        break;

                    // Vector Store operations
                    case 'STORE_ADD':
                        result = this.vectorStore.add(payload.id, payload.vector, payload.metadata);
                        break;

                    case 'STORE_ADD_BATCH':
                        result = this.vectorStore.addBatch(payload.items);
                        break;

                    case 'STORE_GET':
                        result = this.vectorStore.get(payload.id);
                        break;

                    case 'STORE_REMOVE':
                        result = { removed: this.vectorStore.remove(payload.id) };
                        break;

                    case 'STORE_SEARCH':
                        result = this.vectorStore.search(payload.query, payload.k, payload.threshold);
                        this.stats.searches++;
                        break;

                    case 'STORE_SEARCH_METRIC':
                        result = this.vectorStore.searchWithMetric(
                            payload.query,
                            payload.k,
                            payload.metric
                        );
                        this.stats.searches++;
                        break;

                    case 'STORE_CLEAR':
                        this.vectorStore.clear();
                        result = { cleared: true };
                        break;

                    case 'STORE_EXPORT':
                        result = this.vectorStore.export();
                        break;

                    case 'STORE_IMPORT':
                        this.vectorStore.import(payload.data);
                        result = { imported: true };
                        break;

                    case 'STORE_STATS':
                        result = this.vectorStore.getStats();
                        break;

                    // Semantic Memory operations
                    case 'MEMORY_STORE':
                        result = { id: this.semanticMemory.store(payload.text, payload.embedding, payload.metadata) };
                        break;

                    case 'MEMORY_RECALL':
                        result = this.semanticMemory.recall(payload.embedding, payload.k, payload.threshold);
                        this.stats.searches++;
                        break;

                    case 'MEMORY_GET':
                        result = this.semanticMemory.get(payload.id);
                        break;

                    case 'MEMORY_FORGET':
                        result = { forgotten: this.semanticMemory.forget(payload.id) };
                        break;

                    case 'MEMORY_CLEAR':
                        this.semanticMemory.clear();
                        result = { cleared: true };
                        break;

                    case 'MEMORY_PRUNE':
                        result = { pruned: this.semanticMemory.prune(payload.maxAge, payload.maxCount) };
                        break;

                    case 'MEMORY_COUNT':
                        result = { count: this.semanticMemory.count };
                        break;

                    // Clustering
                    case 'CLUSTER_KMEANS':
                        result = VectorClustering.kMeans(payload.vectors, payload.k, payload.maxIterations);
                        break;

                    case 'CLUSTER_HIERARCHICAL':
                        result = VectorClustering.hierarchical(payload.vectors, payload.maxClusters);
                        break;

                    case 'CLUSTER_DBSCAN':
                        result = VectorClustering.dbscan(payload.vectors, payload.epsilon, payload.minPts);
                        break;

                    // Dimensionality Reduction
                    case 'PCA':
                        result = DimensionalityReduction.pca(payload.vectors, payload.targetDims);
                        break;

                    case 'TSNE':
                        result = DimensionalityReduction.tsne(payload.vectors, payload.targetDims, payload.perplexity, payload.iterations);
                        break;

                    // Utility
                    case 'GET_STATS':
                        result = this.getStats();
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
            ...this.stats,
            vectorStore: this.vectorStore.getStats(),
            memoryCount: this.semanticMemory.count
        };
    }
}

// ============================================================================
// INITIALIZE WORKER
// ============================================================================

const vectorWorker = new VectorWorker();

// Signal ready state
postMessage({
    type: 'WORKER_READY',
    payload: {
        name: 'vector-worker',
        version: '1.0.0',
        timestamp: Date.now()
    }
});