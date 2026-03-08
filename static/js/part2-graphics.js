/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║                       DRS.VIP-AI NEURAL GRAPHICS ENGINE                       ║
 * ║                     World's Most Advanced AI Operating System                  ║
 * ║                         Part 2: Neural Graphics Architecture                   ║
 * ╠══════════════════════════════════════════════════════════════════════════════╣
 * ║  Version: 1.0.0                                                               ║
 * ║  Author: DRS Engineering Team                                                 ║
 * ║  License: MIT                                                                 ║
 * ║  Description: Advanced WebGL2-based neural graphics engine featuring          ║
 * ║               GPU-accelerated particle systems, holographic UI effects,       ║
 * ║               neural wave animations, and spatial interaction engine.         ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */

'use strict';

// ============================================================================
// GRAPHICS NAMESPACE INITIALIZATION
// ============================================================================

/**
 * Graphics module namespace
 * @namespace DRS.Graphics
 */
DRS.Graphics = DRS.Graphics || {};

/**
 * Graphics version information
 * @type {Object}
 */
DRS.Graphics.VERSION = Object.freeze({
    major: 1,
    minor: 0,
    patch: 0,
    webglVersion: 2,
    toString: function() {
        return `${this.major}.${this.minor}.${this.patch} (WebGL${this.webglVersion})`;
    }
});

// ============================================================================
// SHADER PROGRAM REPOSITORY
// ============================================================================

/**
 * Shader Repository - Centralized shader storage and management
 * @class ShaderRepository
 * @memberof DRS.Graphics
 */
DRS.Graphics.ShaderRepository = class ShaderRepository {
    /**
     * Create a new Shader Repository
     */
    constructor() {
        this._shaders = new Map();
        this._programs = new Map();
        
        this._initializeDefaultShaders();
    }
    
    /**
     * Initialize default shader programs
     * @private
     */
    _initializeDefaultShaders() {
        // ========================================
        // NEURAL PARTICLE VERTEX SHADER
        // ========================================
        this._shaders.set('particle_vertex', `#version 300 es
            precision highp float;
            
            // Attributes
            in vec3 a_position;
            in vec4 a_color;
            in float a_size;
            in float a_life;
            in vec3 a_velocity;
            
            // Uniforms
            uniform mat4 u_projectionMatrix;
            uniform mat4 u_viewMatrix;
            uniform mat4 u_modelMatrix;
            uniform float u_time;
            uniform float u_deltaTime;
            uniform vec3 u_gravity;
            uniform float u_pointScale;
            
            // Varyings
            out vec4 v_color;
            out float v_life;
            out float v_size;
            out vec3 v_position;
            
            void main() {
                // Calculate particle position with physics
                vec3 pos = a_position + a_velocity * u_deltaTime;
                
                // Apply gravity
                pos += u_gravity * u_time * u_time * 0.5;
                
                // Neural wave effect
                float wave = sin(pos.x * 0.5 + u_time * 2.0) * 0.1;
                wave += cos(pos.y * 0.3 + u_time * 1.5) * 0.1;
                pos.z += wave;
                
                // Transform position
                vec4 worldPos = u_modelMatrix * vec4(pos, 1.0);
                vec4 viewPos = u_viewMatrix * worldPos;
                gl_Position = u_projectionMatrix * viewPos;
                
                // Calculate point size with distance attenuation
                float dist = length(viewPos.xyz);
                gl_PointSize = a_size * u_pointScale * (300.0 / dist);
                gl_PointSize = clamp(gl_PointSize, 1.0, 64.0);
                
                // Pass varyings
                v_color = a_color;
                v_life = a_life;
                v_size = gl_PointSize;
                v_position = worldPos.xyz;
            }
        `);
        
        // ========================================
        // NEURAL PARTICLE FRAGMENT SHADER
        // ========================================
        this._shaders.set('particle_fragment', `#version 300 es
            precision highp float;
            precision highp int;
            
            // Varyings
            in vec4 v_color;
            in float v_life;
            in float v_size;
            in vec3 v_position;
            
            // Uniforms
            uniform float u_time;
            uniform vec3 u_cameraPosition;
            uniform sampler2D u_texture;
            
            // Output
            out vec4 fragColor;
            
            void main() {
                // Calculate point sprite UV
                vec2 uv = gl_PointCoord * 2.0 - 1.0;
                float dist = length(uv);
                
                // Discard pixels outside circle
                if (dist > 1.0) discard;
                
                // Soft edge falloff
                float alpha = 1.0 - smoothstep(0.7, 1.0, dist);
                
                // Neural glow effect
                float glow = exp(-dist * 2.0);
                
                // Pulsing effect based on life
                float pulse = 0.8 + 0.2 * sin(u_time * 3.0 + v_position.x + v_position.y);
                
                // Final color
                vec3 color = v_color.rgb * pulse;
                color += glow * v_color.rgb * 0.5;
                
                // Apply life fade
                alpha *= smoothstep(0.0, 0.1, v_life) * smoothstep(1.0, 0.8, v_life);
                
                fragColor = vec4(color, alpha * v_color.a);
            }
        `);
        
        // ========================================
        // HOLOGRAPHIC GRID VERTEX SHADER
        // ========================================
        this._shaders.set('grid_vertex', `#version 300 es
            precision highp float;
            
            // Attributes
            in vec3 a_position;
            in vec2 a_uv;
            in vec3 a_normal;
            
            // Uniforms
            uniform mat4 u_projectionMatrix;
            uniform mat4 u_viewMatrix;
            uniform mat4 u_modelMatrix;
            uniform float u_time;
            
            // Varyings
            out vec2 v_uv;
            out vec3 v_position;
            out vec3 v_worldPos;
            out float v_depth;
            
            void main() {
                // Apply neural wave distortion to grid
                vec3 pos = a_position;
                float wave = sin(pos.x * 0.5 + u_time) * 0.2;
                wave += cos(pos.z * 0.5 + u_time * 0.7) * 0.2;
                pos.y += wave;
                
                // Transform
                vec4 worldPos = u_modelMatrix * vec4(pos, 1.0);
                vec4 viewPos = u_viewMatrix * worldPos;
                gl_Position = u_projectionMatrix * viewPos;
                
                // Pass varyings
                v_uv = a_uv;
                v_position = pos;
                v_worldPos = worldPos.xyz;
                v_depth = gl_Position.z / gl_Position.w;
            }
        `);
        
        // ========================================
        // HOLOGRAPHIC GRID FRAGMENT SHADER
        // ========================================
        this._shaders.set('grid_fragment', `#version 300 es
            precision highp float;
            
            // Varyings
            in vec2 v_uv;
            in vec3 v_position;
            in vec3 v_worldPos;
            in float v_depth;
            
            // Uniforms
            uniform float u_time;
            uniform vec3 u_color;
            uniform float u_opacity;
            uniform float u_gridSize;
            
            // Output
            out vec4 fragColor;
            
            void main() {
                // Calculate grid lines
                vec2 grid = fract(v_worldPos.xz * u_gridSize);
                float line = min(
                    min(grid.x, 1.0 - grid.x),
                    min(grid.y, 1.0 - grid.y)
                );
                
                // Line thickness
                float lineWidth = 0.02;
                float gridLine = smoothstep(lineWidth, lineWidth + 0.01, line);
                
                // Holographic scanline effect
                float scanline = sin(v_worldPos.y * 50.0 + u_time * 5.0) * 0.1 + 0.9;
                
                // Distance fade
                float dist = length(v_worldPos.xz);
                float fade = 1.0 - smoothstep(5.0, 20.0, dist);
                
                // Color with holographic effect
                vec3 color = u_color;
                color *= scanline;
                color += vec3(0.0, 0.1, 0.1) * (1.0 - gridLine);
                
                // Alpha
                float alpha = (1.0 - gridLine) * u_opacity * fade;
                
                fragColor = vec4(color, alpha);
            }
        `);
        
        // ========================================
        // NEURAL GLOW VERTEX SHADER
        // ========================================
        this._shaders.set('glow_vertex', `#version 300 es
            precision highp float;
            
            // Attributes
            in vec3 a_position;
            in vec2 a_uv;
            
            // Uniforms
            uniform mat4 u_projectionMatrix;
            uniform mat4 u_viewMatrix;
            uniform mat4 u_modelMatrix;
            
            // Varyings
            out vec2 v_uv;
            
            void main() {
                gl_Position = u_projectionMatrix * u_viewMatrix * u_modelMatrix * vec4(a_position, 1.0);
                v_uv = a_uv;
            }
        `);
        
        // ========================================
        // NEURAL GLOW FRAGMENT SHADER
        // ========================================
        this._shaders.set('glow_fragment', `#version 300 es
            precision highp float;
            
            // Varyings
            in vec2 v_uv;
            
            // Uniforms
            uniform sampler2D u_texture;
            uniform vec2 u_resolution;
            uniform float u_intensity;
            uniform vec3 u_glowColor;
            
            // Output
            out vec4 fragColor;
            
            void main() {
                vec4 color = texture(u_texture, v_uv);
                
                // Simple blur for glow
                vec2 texelSize = 1.0 / u_resolution;
                vec4 blur = vec4(0.0);
                
                for (int x = -2; x <= 2; x++) {
                    for (int y = -2; y <= 2; y++) {
                        vec2 offset = vec2(float(x), float(y)) * texelSize;
                        blur += texture(u_texture, v_uv + offset);
                    }
                }
                blur /= 25.0;
                
                // Combine with glow
                vec3 glow = blur.rgb * u_glowColor * u_intensity;
                
                fragColor = vec4(color.rgb + glow, color.a);
            }
        `);
        
        // ========================================
        // NEURAL CONNECTION VERTEX SHADER
        // ========================================
        this._shaders.set('connection_vertex', `#version 300 es
            precision highp float;
            
            // Attributes
            in vec3 a_position;
            in vec4 a_color;
            in float a_alpha;
            
            // Uniforms
            uniform mat4 u_projectionMatrix;
            uniform mat4 u_viewMatrix;
            uniform mat4 u_modelMatrix;
            uniform float u_time;
            
            // Varyings
            out vec4 v_color;
            out float v_alpha;
            
            void main() {
                gl_Position = u_projectionMatrix * u_viewMatrix * u_modelMatrix * vec4(a_position, 1.0);
                v_color = a_color;
                v_alpha = a_alpha;
            }
        `);
        
        // ========================================
        // NEURAL CONNECTION FRAGMENT SHADER
        // ========================================
        this._shaders.set('connection_fragment', `#version 300 es
            precision highp float;
            
            // Varyings
            in vec4 v_color;
            in float v_alpha;
            
            // Uniforms
            uniform float u_time;
            
            // Output
            out vec4 fragColor;
            
            void main() {
                // Pulse effect
                float pulse = 0.7 + 0.3 * sin(u_time * 2.0);
                
                fragColor = vec4(v_color.rgb * pulse, v_color.a * v_alpha);
            }
        `);
        
        // ========================================
        // POST PROCESSING VERTEX SHADER
        // ========================================
        this._shaders.set('post_vertex', `#version 300 es
            precision highp float;
            
            in vec3 a_position;
            in vec2 a_uv;
            
            out vec2 v_uv;
            
            void main() {
                gl_Position = vec4(a_position, 1.0);
                v_uv = a_uv;
            }
        `);
        
        // ========================================
        // POST PROCESSING FRAGMENT SHADER
        // ========================================
        this._shaders.set('post_fragment', `#version 300 es
            precision highp float;
            
            in vec2 v_uv;
            
            uniform sampler2D u_texture;
            uniform float u_time;
            uniform float u_vignette;
            uniform float u_chromaticAberration;
            uniform float u_scanlineIntensity;
            uniform vec2 u_resolution;
            
            out vec4 fragColor;
            
            void main() {
                vec2 uv = v_uv;
                
                // Chromatic aberration
                vec2 dir = uv - 0.5;
                float dist = length(dir);
                vec2 offset = dir * dist * u_chromaticAberration;
                
                float r = texture(u_texture, uv + offset).r;
                float g = texture(u_texture, uv).g;
                float b = texture(u_texture, uv - offset).b;
                float a = texture(u_texture, uv).a;
                
                vec4 color = vec4(r, g, b, a);
                
                // Scanlines
                float scanline = sin(uv.y * u_resolution.y * 0.5) * 0.5 + 0.5;
                scanline = mix(1.0, scanline, u_scanlineIntensity);
                color.rgb *= scanline;
                
                // Vignette
                float vignette = 1.0 - smoothstep(0.5, 1.5, dist * u_vignette);
                color.rgb *= vignette;
                
                // Color grading - slight cyan tint
                color.rgb = mix(color.rgb, color.rgb * vec3(0.9, 1.0, 1.05), 0.3);
                
                fragColor = color;
            }
        `);
    }
    
    /**
     * Get shader source by name
     * @param {string} name
     * @returns {string}
     */
    getShaderSource(name) {
        return this._shaders.get(name);
    }
    
    /**
     * Add custom shader
     * @param {string} name
     * @param {string} source
     */
    addShader(name, source) {
        this._shaders.set(name, source);
    }
    
    /**
     * Get cached program
     * @param {string} name
     * @returns {WebGLProgram}
     */
    getProgram(name) {
        return this._programs.get(name);
    }
    
    /**
     * Cache a compiled program
     * @param {string} name
     * @param {WebGLProgram} program
     */
    cacheProgram(name, program) {
        this._programs.set(name, program);
    }
};

// ============================================================================
// GPU SHADER ENGINE
// ============================================================================

/**
 * GPU Shader Engine - WebGL2 shader compilation and management
 * @class GPUShaderEngine
 * @memberof DRS.Graphics
 */
DRS.Graphics.GPUShaderEngine = class GPUShaderEngine {
    /**
     * Create a new GPU Shader Engine
     * @param {WebGL2RenderingContext} gl
     * @param {ShaderRepository} repository
     */
    constructor(gl, repository) {
        this._gl = gl;
        this._repository = repository;
        this._programs = new Map();
        this._uniformLocations = new Map();
        this._attributeLocations = new Map();
    }
    
    /**
     * Compile a shader
     * @param {number} type - gl.VERTEX_SHADER or gl.FRAGMENT_SHADER
     * @param {string} source
     * @returns {WebGLShader}
     */
    compileShader(type, source) {
        const gl = this._gl;
        const shader = gl.createShader(type);
        
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            const info = gl.getShaderInfoLog(shader);
            gl.deleteShader(shader);
            throw new Error(`Shader compilation failed: ${info}`);
        }
        
        return shader;
    }
    
    /**
     * Create a shader program
     * @param {string} vertexShaderName
     * @param {string} fragmentShaderName
     * @param {string} programName
     * @returns {WebGLProgram}
     */
    createProgram(vertexShaderName, fragmentShaderName, programName) {
        const gl = this._gl;
        
        // Check cache
        const cached = this._repository.getProgram(programName);
        if (cached) return cached;
        
        // Get shader sources
        const vertexSource = this._repository.getShaderSource(vertexShaderName);
        const fragmentSource = this._repository.getShaderSource(fragmentShaderName);
        
        if (!vertexSource || !fragmentSource) {
            throw new Error(`Shader not found: ${!vertexSource ? vertexShaderName : fragmentShaderName}`);
        }
        
        // Compile shaders
        const vertexShader = this.compileShader(gl.VERTEX_SHADER, vertexSource);
        const fragmentShader = this.compileShader(gl.FRAGMENT_SHADER, fragmentSource);
        
        // Create program
        const program = gl.createProgram();
        gl.attachShader(program, vertexShader);
        gl.attachShader(program, fragmentShader);
        gl.linkProgram(program);
        
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            const info = gl.getProgramInfoLog(program);
            gl.deleteProgram(program);
            gl.deleteShader(vertexShader);
            gl.deleteShader(fragmentShader);
            throw new Error(`Program linking failed: ${info}`);
        }
        
        // Clean up shaders
        gl.deleteShader(vertexShader);
        gl.deleteShader(fragmentShader);
        
        // Cache program
        this._repository.cacheProgram(programName, program);
        this._programs.set(programName, program);
        
        // Cache uniform and attribute locations
        this._cacheLocations(programName, program);
        
        return program;
    }
    
    /**
     * Cache uniform and attribute locations
     * @param {string} programName
     * @param {WebGLProgram} program
     * @private
     */
    _cacheLocations(programName, program) {
        const gl = this._gl;
        
        // Get active uniforms
        const numUniforms = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
        const uniformMap = {};
        
        for (let i = 0; i < numUniforms; i++) {
            const info = gl.getActiveUniform(program, i);
            const location = gl.getUniformLocation(program, info.name);
            uniformMap[info.name] = location;
        }
        
        this._uniformLocations.set(programName, uniformMap);
        
        // Get active attributes
        const numAttribs = gl.getProgramParameter(program, gl.ACTIVE_ATTRIBUTES);
        const attribMap = {};
        
        for (let i = 0; i < numAttribs; i++) {
            const info = gl.getActiveAttrib(program, i);
            const location = gl.getAttribLocation(program, info.name);
            attribMap[info.name] = location;
        }
        
        this._attributeLocations.set(programName, attribMap);
    }
    
    /**
     * Get uniform location
     * @param {string} programName
     * @param {string} uniformName
     * @returns {WebGLUniformLocation}
     */
    getUniformLocation(programName, uniformName) {
        return this._uniformLocations.get(programName)?.[uniformName];
    }
    
    /**
     * Get attribute location
     * @param {string} programName
     * @param {string} attribName
     * @returns {number}
     */
    getAttributeLocation(programName, attribName) {
        return this._attributeLocations.get(programName)?.[attribName];
    }
    
    /**
     * Set uniform value
     * @param {string} programName
     * @param {string} uniformName
     * @param {*} value
     */
    setUniform(programName, uniformName, value) {
        const gl = this._gl;
        const location = this.getUniformLocation(programName, uniformName);
        
        if (location === null || location === undefined) return;
        
        if (typeof value === 'number') {
            gl.uniform1f(location, value);
        } else if (value instanceof Float32Array || Array.isArray(value)) {
            switch (value.length) {
                case 2:
                    gl.uniform2fv(location, value);
                    break;
                case 3:
                    gl.uniform3fv(location, value);
                    break;
                case 4:
                    gl.uniform4fv(location, value);
                    break;
                case 9:
                    gl.uniformMatrix3fv(location, false, value);
                    break;
                case 16:
                    gl.uniformMatrix4fv(location, false, value);
                    break;
            }
        }
    }
    
    /**
     * Get program
     * @param {string} name
     * @returns {WebGLProgram}
     */
    getProgram(name) {
        return this._programs.get(name);
    }
    
    /**
     * Delete all programs
     */
    dispose() {
        const gl = this._gl;
        this._programs.forEach(program => {
            gl.deleteProgram(program);
        });
        this._programs.clear();
        this._uniformLocations.clear();
        this._attributeLocations.clear();
    }
};

// ============================================================================
// NEURAL PARTICLE SYSTEM
// ============================================================================

/**
 * Neural Particle System - GPU-accelerated particle simulation
 * @class NeuralParticleSystem
 * @memberof DRS.Graphics
 */
DRS.Graphics.NeuralParticleSystem = class NeuralParticleSystem {
    /**
     * Create a new Neural Particle System
     * @param {WebGL2RenderingContext} gl
     * @param {Object} config
     */
    constructor(gl, config = {}) {
        this._gl = gl;
        this._config = {
            maxParticles: config.maxParticles || 30000,
            emitRate: config.emitRate || 100,
            lifetime: config.lifetime || 5.0,
            size: config.size || [2.0, 8.0],
            speed: config.speed || [0.5, 2.0],
            colors: config.colors || [
                [0.0, 1.0, 0.95, 1.0],   // Quantum cyan
                [0.6, 0.2, 1.0, 1.0],    // Quantum purple
                [0.2, 1.0, 0.5, 1.0],    // Signal green
                [1.0, 0.2, 0.3, 1.0]     // Danger red
            ],
            gravity: config.gravity || [0.0, -0.1, 0.0],
            blending: config.blending || 'additive',
            ...config
        };
        
        // Particle data
        this._particles = [];
        this._particleCount = 0;
        
        // GPU buffers
        this._positionBuffer = null;
        this._colorBuffer = null;
        this._sizeBuffer = null;
        this._lifeBuffer = null;
        this._velocityBuffer = null;
        
        // Emitter
        this._emitter = {
            position: [0, 0, 0],
            spread: 10,
            active: true
        };
        
        // Physics
        this._physics = {
            gravity: this._config.gravity,
            turbulence: 0.1,
            attractors: []
        };
        
        // Initialize
        this._initialize();
    }
    
    /**
     * Initialize the particle system
     * @private
     */
    _initialize() {
        const gl = this._gl;
        
        // Create buffers
        const maxParticles = this._config.maxParticles;
        
        this._positionBuffer = gl.createBuffer();
        this._colorBuffer = gl.createBuffer();
        this._sizeBuffer = gl.createBuffer();
        this._lifeBuffer = gl.createBuffer();
        this._velocityBuffer = gl.createBuffer();
        
        // Initialize particle arrays
        this._positions = new Float32Array(maxParticles * 3);
        this._colors = new Float32Array(maxParticles * 4);
        this._sizes = new Float32Array(maxParticles);
        this._lives = new Float32Array(maxParticles);
        this._velocities = new Float32Array(maxParticles * 3);
        
        // Initialize particles
        for (let i = 0; i < maxParticles; i++) {
            this._resetParticle(i);
        }
        
        this._particleCount = maxParticles;
    }
    
    /**
     * Reset a single particle
     * @param {number} index
     * @private
     */
    _resetParticle(index) {
        const emitter = this._emitter;
        const config = this._config;
        
        // Random position within emitter spread
        const spread = emitter.spread;
        const i3 = index * 3;
        const i4 = index * 4;
        
        // Spherical distribution
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        const r = Math.pow(Math.random(), 0.5) * spread;
        
        this._positions[i3] = emitter.position[0] + r * Math.sin(phi) * Math.cos(theta);
        this._positions[i3 + 1] = emitter.position[1] + r * Math.sin(phi) * Math.sin(theta);
        this._positions[i3 + 2] = emitter.position[2] + r * Math.cos(phi);
        
        // Random velocity
        const speed = this._randomRange(config.speed[0], config.speed[1]);
        this._velocities[i3] = (Math.random() - 0.5) * speed;
        this._velocities[i3 + 1] = (Math.random() - 0.5) * speed;
        this._velocities[i3 + 2] = (Math.random() - 0.5) * speed;
        
        // Random color from palette
        const color = config.colors[Math.floor(Math.random() * config.colors.length)];
        this._colors[i4] = color[0];
        this._colors[i4 + 1] = color[1];
        this._colors[i4 + 2] = color[2];
        this._colors[i4 + 3] = color[3] * (0.5 + Math.random() * 0.5);
        
        // Random size
        this._sizes[index] = this._randomRange(config.size[0], config.size[1]);
        
        // Random life
        this._lives[index] = Math.random();
    }
    
    /**
     * Generate random number in range
     * @param {number} min
     * @param {number} max
     * @returns {number}
     * @private
     */
    _randomRange(min, max) {
        return min + Math.random() * (max - min);
    }
    
    /**
     * Update particle system
     * @param {number} deltaTime
     * @param {number} time
     */
    update(deltaTime, time) {
        const positions = this._positions;
        const velocities = this._velocities;
        const lives = this._lives;
        const colors = this._colors;
        const physics = this._physics;
        
        for (let i = 0; i < this._particleCount; i++) {
            const i3 = i * 3;
            const i4 = i * 4;
            
            // Update life
            lives[i] -= deltaTime / this._config.lifetime;
            
            // Reset dead particles
            if (lives[i] <= 0) {
                this._resetParticle(i);
                continue;
            }
            
            // Apply velocity
            positions[i3] += velocities[i3] * deltaTime;
            positions[i3 + 1] += velocities[i3 + 1] * deltaTime;
            positions[i3 + 2] += velocities[i3 + 2] * deltaTime;
            
            // Apply gravity
            velocities[i3] += physics.gravity[0] * deltaTime;
            velocities[i3 + 1] += physics.gravity[1] * deltaTime;
            velocities[i3 + 2] += physics.gravity[2] * deltaTime;
            
            // Apply turbulence
            velocities[i3] += (Math.random() - 0.5) * physics.turbulence * deltaTime;
            velocities[i3 + 1] += (Math.random() - 0.5) * physics.turbulence * deltaTime;
            velocities[i3 + 2] += (Math.random() - 0.5) * physics.turbulence * deltaTime;
            
            // Apply attractors
            physics.attractors.forEach(attractor => {
                const dx = attractor.position[0] - positions[i3];
                const dy = attractor.position[1] - positions[i3 + 1];
                const dz = attractor.position[2] - positions[i3 + 2];
                const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) + 0.1;
                const force = attractor.strength / (dist * dist);
                
                velocities[i3] += dx / dist * force * deltaTime;
                velocities[i3 + 1] += dy / dist * force * deltaTime;
                velocities[i3 + 2] += dz / dist * force * deltaTime;
            });
            
            // Fade based on life
            const lifeFade = Math.min(lives[i] * 2, 1.0);
            colors[i4 + 3] = lifeFade * 0.8;
        }
        
        this._updateBuffers();
    }
    
    /**
     * Update GPU buffers
     * @private
     */
    _updateBuffers() {
        const gl = this._gl;
        
        gl.bindBuffer(gl.ARRAY_BUFFER, this._positionBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, this._positions, gl.DYNAMIC_DRAW);
        
        gl.bindBuffer(gl.ARRAY_BUFFER, this._colorBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, this._colors, gl.DYNAMIC_DRAW);
        
        gl.bindBuffer(gl.ARRAY_BUFFER, this._sizeBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, this._sizes, gl.DYNAMIC_DRAW);
        
        gl.bindBuffer(gl.ARRAY_BUFFER, this._lifeBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, this._lives, gl.DYNAMIC_DRAW);
        
        gl.bindBuffer(gl.ARRAY_BUFFER, this._velocityBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, this._velocities, gl.DYNAMIC_DRAW);
    }
    
    /**
     * Render particles
     * @param {WebGLProgram} program
     * @param {Object} uniforms
     */
    render(program, uniforms) {
        const gl = this._gl;
        
        // Set blending mode
        gl.enable(gl.BLEND);
        if (this._config.blending === 'additive') {
            gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
        } else {
            gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        }
        
        gl.depthMask(false);
        
        // Bind program
        gl.useProgram(program);
        
        // Set uniforms
        Object.entries(uniforms).forEach(([name, value]) => {
            this._setUniform(program, name, value);
        });
        
        // Bind position attribute
        const posLoc = gl.getAttribLocation(program, 'a_position');
        gl.bindBuffer(gl.ARRAY_BUFFER, this._positionBuffer);
        gl.enableVertexAttribArray(posLoc);
        gl.vertexAttribPointer(posLoc, 3, gl.FLOAT, false, 0, 0);
        
        // Bind color attribute
        const colorLoc = gl.getAttribLocation(program, 'a_color');
        gl.bindBuffer(gl.ARRAY_BUFFER, this._colorBuffer);
        gl.enableVertexAttribArray(colorLoc);
        gl.vertexAttribPointer(colorLoc, 4, gl.FLOAT, false, 0, 0);
        
        // Bind size attribute
        const sizeLoc = gl.getAttribLocation(program, 'a_size');
        gl.bindBuffer(gl.ARRAY_BUFFER, this._sizeBuffer);
        gl.enableVertexAttribArray(sizeLoc);
        gl.vertexAttribPointer(sizeLoc, 1, gl.FLOAT, false, 0, 0);
        
        // Bind life attribute
        const lifeLoc = gl.getAttribLocation(program, 'a_life');
        gl.bindBuffer(gl.ARRAY_BUFFER, this._lifeBuffer);
        gl.enableVertexAttribArray(lifeLoc);
        gl.vertexAttribPointer(lifeLoc, 1, gl.FLOAT, false, 0, 0);
        
        // Bind velocity attribute
        const velLoc = gl.getAttribLocation(program, 'a_velocity');
        gl.bindBuffer(gl.ARRAY_BUFFER, this._velocityBuffer);
        gl.enableVertexAttribArray(velLoc);
        gl.vertexAttribPointer(velLoc, 3, gl.FLOAT, false, 0, 0);
        
        // Draw particles
        gl.drawArrays(gl.POINTS, 0, this._particleCount);
        
        // Cleanup
        gl.disableVertexAttribArray(posLoc);
        gl.disableVertexAttribArray(colorLoc);
        gl.disableVertexAttribArray(sizeLoc);
        gl.disableVertexAttribArray(lifeLoc);
        gl.disableVertexAttribArray(velLoc);
        
        gl.depthMask(true);
    }
    
    /**
     * Set uniform value
     * @param {WebGLProgram} program
     * @param {string} name
     * @param {*} value
     * @private
     */
    _setUniform(program, name, value) {
        const gl = this._gl;
        const location = gl.getUniformLocation(program, name);
        if (location === null) return;
        
        if (typeof value === 'number') {
            gl.uniform1f(location, value);
        } else if (value instanceof Float32Array || Array.isArray(value)) {
            switch (value.length) {
                case 2:
                    gl.uniform2fv(location, value);
                    break;
                case 3:
                    gl.uniform3fv(location, value);
                    break;
                case 4:
                    gl.uniform4fv(location, value);
                    break;
                case 9:
                    gl.uniformMatrix3fv(location, false, value);
                    break;
                case 16:
                    gl.uniformMatrix4fv(location, false, value);
                    break;
            }
        }
    }
    
    /**
     * Set emitter position
     * @param {number} x
     * @param {number} y
     * @param {number} z
     */
    setEmitterPosition(x, y, z) {
        this._emitter.position = [x, y, z];
    }
    
    /**
     * Set emitter spread
     * @param {number} spread
     */
    setEmitterSpread(spread) {
        this._emitter.spread = spread;
    }
    
    /**
     * Add attractor
     * @param {number} x
     * @param {number} y
     * @param {number} z
     * @param {number} strength
     */
    addAttractor(x, y, z, strength) {
        this._physics.attractors.push({
            position: [x, y, z],
            strength
        });
    }
    
    /**
     * Clear attractors
     */
    clearAttractors() {
        this._physics.attractors = [];
    }
    
    /**
     * Get particle count
     * @returns {number}
     */
    getParticleCount() {
        return this._particleCount;
    }
    
    /**
     * Dispose resources
     */
    dispose() {
        const gl = this._gl;
        gl.deleteBuffer(this._positionBuffer);
        gl.deleteBuffer(this._colorBuffer);
        gl.deleteBuffer(this._sizeBuffer);
        gl.deleteBuffer(this._lifeBuffer);
        gl.deleteBuffer(this._velocityBuffer);
    }
};

// ============================================================================
// HOLOGRAPHIC UI RENDERER
// ============================================================================

/**
 * Holographic UI Renderer - Advanced UI effects
 * @class HolographicUIRenderer
 * @memberof DRS.Graphics
 */
DRS.Graphics.HolographicUIRenderer = class HolographicUIRenderer {
    /**
     * Create a new Holographic UI Renderer
     * @param {WebGL2RenderingContext} gl
     */
    constructor(gl) {
        this._gl = gl;
        this._elements = new Map();
        this._grids = [];
        this._lines = [];
        
        this._initialize();
    }
    
    /**
     * Initialize the renderer
     * @private
     */
    _initialize() {
        const gl = this._gl;
        
        // Create grid geometry
        this._gridGeometry = this._createGridGeometry(100, 100, 1.0);
        
        // Create line buffers
        this._linePositionBuffer = gl.createBuffer();
        this._lineColorBuffer = gl.createBuffer();
    }
    
    /**
     * Create grid geometry
     * @param {number} width
     * @param {number} height
     * @param {number} cellSize
     * @returns {Object}
     * @private
     */
    _createGridGeometry(width, height, cellSize) {
        const gl = this._gl;
        
        const positions = [];
        const uvs = [];
        const normals = [];
        const indices = [];
        
        const halfWidth = width / 2;
        const halfHeight = height / 2;
        
        for (let z = 0; z <= height; z++) {
            for (let x = 0; x <= width; x++) {
                const px = (x - halfWidth) * cellSize;
                const pz = (z - halfHeight) * cellSize;
                
                positions.push(px, 0, pz);
                uvs.push(x / width, z / height);
                normals.push(0, 1, 0);
            }
        }
        
        for (let z = 0; z < height; z++) {
            for (let x = 0; x < width; x++) {
                const topLeft = z * (width + 1) + x;
                const topRight = topLeft + 1;
                const bottomLeft = (z + 1) * (width + 1) + x;
                const bottomRight = bottomLeft + 1;
                
                indices.push(topLeft, bottomLeft, topRight);
                indices.push(topRight, bottomLeft, bottomRight);
            }
        }
        
        const positionBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);
        
        const uvBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, uvBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(uvs), gl.STATIC_DRAW);
        
        const normalBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, normalBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(normals), gl.STATIC_DRAW);
        
        const indexBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(indices), gl.STATIC_DRAW);
        
        return {
            positionBuffer,
            uvBuffer,
            normalBuffer,
            indexBuffer,
            indexCount: indices.length
        };
    }
    
    /**
     * Render holographic grid
     * @param {WebGLProgram} program
     * @param {Object} uniforms
     */
    renderGrid(program, uniforms) {
        const gl = this._gl;
        const geo = this._gridGeometry;
        
        gl.useProgram(program);
        
        // Set uniforms
        Object.entries(uniforms).forEach(([name, value]) => {
            this._setUniform(program, name, value);
        });
        
        // Bind position
        const posLoc = gl.getAttribLocation(program, 'a_position');
        gl.bindBuffer(gl.ARRAY_BUFFER, geo.positionBuffer);
        gl.enableVertexAttribArray(posLoc);
        gl.vertexAttribPointer(posLoc, 3, gl.FLOAT, false, 0, 0);
        
        // Bind UV
        const uvLoc = gl.getAttribLocation(program, 'a_uv');
        gl.bindBuffer(gl.ARRAY_BUFFER, geo.uvBuffer);
        gl.enableVertexAttribArray(uvLoc);
        gl.vertexAttribPointer(uvLoc, 2, gl.FLOAT, false, 0, 0);
        
        // Bind normal
        const normLoc = gl.getAttribLocation(program, 'a_normal');
        gl.bindBuffer(gl.ARRAY_BUFFER, geo.normalBuffer);
        gl.enableVertexAttribArray(normLoc);
        gl.vertexAttribPointer(normLoc, 3, gl.FLOAT, false, 0, 0);
        
        // Bind index
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, geo.indexBuffer);
        
        // Enable blending
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.depthMask(false);
        
        // Draw
        gl.drawElements(gl.TRIANGLES, geo.indexCount, gl.UNSIGNED_INT, 0);
        
        // Cleanup
        gl.disableVertexAttribArray(posLoc);
        gl.disableVertexAttribArray(uvLoc);
        gl.disableVertexAttribArray(normLoc);
        gl.depthMask(true);
    }
    
    /**
     * Add a line to render
     * @param {Array} start
     * @param {Array} end
     * @param {Array} color
     * @param {number} alpha
     */
    addLine(start, end, color, alpha = 1.0) {
        this._lines.push({ start, end, color, alpha });
    }
    
    /**
     * Render lines
     * @param {WebGLProgram} program
     * @param {Object} uniforms
     */
    renderLines(program, uniforms) {
        if (this._lines.length === 0) return;
        
        const gl = this._gl;
        
        // Build line data
        const positions = [];
        const colors = [];
        const alphas = [];
        
        this._lines.forEach(line => {
            positions.push(...line.start, ...line.end);
            colors.push(...line.color, ...line.color);
            alphas.push(line.alpha, line.alpha);
        });
        
        // Update buffers
        gl.bindBuffer(gl.ARRAY_BUFFER, this._linePositionBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.DYNAMIC_DRAW);
        
        gl.bindBuffer(gl.ARRAY_BUFFER, this._lineColorBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(colors), gl.DYNAMIC_DRAW);
        
        // Use program
        gl.useProgram(program);
        
        // Set uniforms
        Object.entries(uniforms).forEach(([name, value]) => {
            this._setUniform(program, name, value);
        });
        
        // Bind attributes
        const posLoc = gl.getAttribLocation(program, 'a_position');
        gl.bindBuffer(gl.ARRAY_BUFFER, this._linePositionBuffer);
        gl.enableVertexAttribArray(posLoc);
        gl.vertexAttribPointer(posLoc, 3, gl.FLOAT, false, 0, 0);
        
        const colorLoc = gl.getAttribLocation(program, 'a_color');
        gl.bindBuffer(gl.ARRAY_BUFFER, this._lineColorBuffer);
        gl.enableVertexAttribArray(colorLoc);
        gl.vertexAttribPointer(colorLoc, 4, gl.FLOAT, false, 0, 0);
        
        // Draw
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.drawArrays(gl.LINES, 0, this._lines.length * 2);
        
        // Cleanup
        gl.disableVertexAttribArray(posLoc);
        gl.disableVertexAttribArray(colorLoc);
        
        // Clear lines
        this._lines = [];
    }
    
    /**
     * Set uniform value
     * @param {WebGLProgram} program
     * @param {string} name
     * @param {*} value
     * @private
     */
    _setUniform(program, name, value) {
        const gl = this._gl;
        const location = gl.getUniformLocation(program, name);
        if (location === null) return;
        
        if (typeof value === 'number') {
            gl.uniform1f(location, value);
        } else if (value instanceof Float32Array || Array.isArray(value)) {
            switch (value.length) {
                case 2:
                    gl.uniform2fv(location, value);
                    break;
                case 3:
                    gl.uniform3fv(location, value);
                    break;
                case 4:
                    gl.uniform4fv(location, value);
                    break;
                case 9:
                    gl.uniformMatrix3fv(location, false, value);
                    break;
                case 16:
                    gl.uniformMatrix4fv(location, false, value);
                    break;
            }
        }
    }
    
    /**
     * Clear all elements
     */
    clear() {
        this._lines = [];
        this._grids = [];
    }
    
    /**
     * Dispose resources
     */
    dispose() {
        const gl = this._gl;
        gl.deleteBuffer(this._linePositionBuffer);
        gl.deleteBuffer(this._lineColorBuffer);
        gl.deleteBuffer(this._gridGeometry.positionBuffer);
        gl.deleteBuffer(this._gridGeometry.uvBuffer);
        gl.deleteBuffer(this._gridGeometry.normalBuffer);
        gl.deleteBuffer(this._gridGeometry.indexBuffer);
    }
};

// ============================================================================
// NEURAL WAVE ANIMATION SYSTEM
// ============================================================================

/**
 * Neural Wave Animation System - Animated wave effects
 * @class NeuralWaveAnimationSystem
 * @memberof DRS.Graphics
 */
DRS.Graphics.NeuralWaveAnimationSystem = class NeuralWaveAnimationSystem {
    /**
     * Create a new Neural Wave Animation System
     * @param {Object} config
     */
    constructor(config = {}) {
        this._waves = [];
        this._config = {
            maxWaves: config.maxWaves || 10,
            defaultSpeed: config.defaultSpeed || 1.0,
            defaultAmplitude: config.defaultAmplitude || 0.5,
            defaultWavelength: config.defaultWavelength || 2.0,
            decayRate: config.decayRate || 0.95,
            ...config
        };
    }
    
    /**
     * Create a new wave
     * @param {Object} options
     * @returns {Object}
     */
    createWave(options = {}) {
        const wave = {
            id: 'wave-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
            position: options.position || [0, 0, 0],
            speed: options.speed || this._config.defaultSpeed,
            amplitude: options.amplitude || this._config.defaultAmplitude,
            wavelength: options.wavelength || this._config.defaultWavelength,
            phase: options.phase || 0,
            decay: options.decay !== false,
            life: 1.0,
            direction: options.direction || [1, 0, 0],
            color: options.color || [0.0, 1.0, 0.95, 0.5]
        };
        
        this._waves.push(wave);
        
        // Limit waves
        while (this._waves.length > this._config.maxWaves) {
            this._waves.shift();
        }
        
        return wave;
    }
    
    /**
     * Update waves
     * @param {number} deltaTime
     * @param {number} time
     */
    update(deltaTime, time) {
        this._waves = this._waves.filter(wave => {
            // Update phase
            wave.phase += wave.speed * deltaTime;
            
            // Apply decay
            if (wave.decay) {
                wave.life *= this._config.decayRate;
            }
            
            // Remove dead waves
            return wave.life > 0.01;
        });
    }
    
    /**
     * Calculate wave displacement at a point
     * @param {number} x
     * @param {number} y
     * @param {number} z
     * @param {number} time
     * @returns {number}
     */
    calculateDisplacement(x, y, z, time) {
        let totalDisplacement = 0;
        
        this._waves.forEach(wave => {
            const dx = x - wave.position[0];
            const dz = z - wave.position[2];
            const distance = Math.sqrt(dx * dx + dz * dz);
            
            const waveValue = Math.sin(distance / wave.wavelength * Math.PI * 2 - wave.phase);
            const amplitude = wave.amplitude * wave.life;
            
            // Distance falloff
            const falloff = 1.0 / (1.0 + distance * 0.1);
            
            totalDisplacement += waveValue * amplitude * falloff;
        });
        
        return totalDisplacement;
    }
    
    /**
     * Get all waves
     * @returns {Array}
     */
    getWaves() {
        return [...this._waves];
    }
    
    /**
     * Clear all waves
     */
    clear() {
        this._waves = [];
    }
};

// ============================================================================
// SPATIAL INTERACTION ENGINE
// ============================================================================

/**
 * Spatial Interaction Engine - 3D interaction handling
 * @class SpatialInteractionEngine
 * @memberof DRS.Graphics
 */
DRS.Graphics.SpatialInteractionEngine = class SpatialInteractionEngine {
    /**
     * Create a new Spatial Interaction Engine
     * @param {HTMLCanvasElement} canvas
     * @param {Object} camera
     */
    constructor(canvas, camera) {
        this._canvas = canvas;
        this._camera = camera;
        
        this._ray = {
            origin: [0, 0, 0],
            direction: [0, 0, -1]
        };
        
        this._interactables = new Map();
        this._hoveredObject = null;
        this._selectedObject = null;
        
        this._mouse = { x: 0, y: 0 };
        this._isMouseDown = false;
        
        this._callbacks = {
            onHover: [],
            onSelect: [],
            onDeselect: [],
            onDrag: []
        };
        
        this._initializeEvents();
    }
    
    /**
     * Initialize event listeners
     * @private
     */
    _initializeEvents() {
        this._canvas.addEventListener('mousemove', this._onMouseMove.bind(this));
        this._canvas.addEventListener('mousedown', this._onMouseDown.bind(this));
        this._canvas.addEventListener('mouseup', this._onMouseUp.bind(this));
        this._canvas.addEventListener('touchstart', this._onTouchStart.bind(this));
        this._canvas.addEventListener('touchmove', this._onTouchMove.bind(this));
        this._canvas.addEventListener('touchend', this._onTouchEnd.bind(this));
    }
    
    /**
     * Handle mouse move
     * @param {MouseEvent} event
     * @private
     */
    _onMouseMove(event) {
        const rect = this._canvas.getBoundingClientRect();
        this._mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this._mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
        
        this._updateRay();
        this._checkIntersections();
        
        if (this._isMouseDown && this._selectedObject) {
            this._callbacks.onDrag.forEach(cb => cb(this._selectedObject, this._mouse));
        }
    }
    
    /**
     * Handle mouse down
     * @param {MouseEvent} event
     * @private
     */
    _onMouseDown(event) {
        this._isMouseDown = true;
        
        if (this._hoveredObject) {
            this._selectedObject = this._hoveredObject;
            this._callbacks.onSelect.forEach(cb => cb(this._selectedObject));
        }
    }
    
    /**
     * Handle mouse up
     * @param {MouseEvent} event
     * @private
     */
    _onMouseUp(event) {
        this._isMouseDown = false;
        
        if (this._selectedObject) {
            this._callbacks.onDeselect.forEach(cb => cb(this._selectedObject));
            this._selectedObject = null;
        }
    }
    
    /**
     * Handle touch start
     * @param {TouchEvent} event
     * @private
     */
    _onTouchStart(event) {
        if (event.touches.length === 1) {
            const touch = event.touches[0];
            const rect = this._canvas.getBoundingClientRect();
            this._mouse.x = ((touch.clientX - rect.left) / rect.width) * 2 - 1;
            this._mouse.y = -((touch.clientY - rect.top) / rect.height) * 2 + 1;
            
            this._updateRay();
            this._checkIntersections();
            
            if (this._hoveredObject) {
                this._selectedObject = this._hoveredObject;
                this._callbacks.onSelect.forEach(cb => cb(this._selectedObject));
            }
        }
    }
    
    /**
     * Handle touch move
     * @param {TouchEvent} event
     * @private
     */
    _onTouchMove(event) {
        if (event.touches.length === 1) {
            const touch = event.touches[0];
            const rect = this._canvas.getBoundingClientRect();
            this._mouse.x = ((touch.clientX - rect.left) / rect.width) * 2 - 1;
            this._mouse.y = -((touch.clientY - rect.top) / rect.height) * 2 + 1;
            
            this._updateRay();
            
            if (this._selectedObject) {
                this._callbacks.onDrag.forEach(cb => cb(this._selectedObject, this._mouse));
            }
        }
    }
    
    /**
     * Handle touch end
     * @param {TouchEvent} event
     * @private
     */
    _onTouchEnd(event) {
        if (this._selectedObject) {
            this._callbacks.onDeselect.forEach(cb => cb(this._selectedObject));
            this._selectedObject = null;
        }
    }
    
    /**
     * Update ray from mouse position
     * @private
     */
    _updateRay() {
        // Simplified ray calculation
        // In a full implementation, this would use camera matrices
        const fov = this._camera.fov || Math.PI / 4;
        const aspect = this._canvas.width / this._canvas.height;
        
        const x = this._mouse.x * Math.tan(fov / 2) * aspect;
        const y = this._mouse.y * Math.tan(fov / 2);
        
        this._ray.direction = this._normalize([x, y, -1]);
        this._ray.origin = [this._camera.position?.[0] || 0, this._camera.position?.[1] || 0, this._camera.position?.[2] || 5];
    }
    
    /**
     * Normalize a vector
     * @param {Array} v
     * @returns {Array}
     * @private
     */
    _normalize(v) {
        const len = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
        return [v[0] / len, v[1] / len, v[2] / len];
    }
    
    /**
     * Check for intersections with interactables
     * @private
     */
    _checkIntersections() {
        let closestHit = null;
        let closestDist = Infinity;
        
        this._interactables.forEach((obj, id) => {
            const hit = this._raySphereIntersect(
                this._ray.origin,
                this._ray.direction,
                obj.position,
                obj.radius || 1.0
            );
            
            if (hit && hit.distance < closestDist) {
                closestDist = hit.distance;
                closestHit = obj;
            }
        });
        
        if (closestHit !== this._hoveredObject) {
            this._hoveredObject = closestHit;
            this._callbacks.onHover.forEach(cb => cb(closestHit));
        }
    }
    
    /**
     * Ray-sphere intersection test
     * @param {Array} origin
     * @param {Array} direction
     * @param {Array} center
     * @param {number} radius
     * @returns {Object|null}
     * @private
     */
    _raySphereIntersect(origin, direction, center, radius) {
        const oc = [
            origin[0] - center[0],
            origin[1] - center[1],
            origin[2] - center[2]
        ];
        
        const a = this._dot(direction, direction);
        const b = 2.0 * this._dot(oc, direction);
        const c = this._dot(oc, oc) - radius * radius;
        const discriminant = b * b - 4 * a * c;
        
        if (discriminant < 0) return null;
        
        const t = (-b - Math.sqrt(discriminant)) / (2.0 * a);
        
        return {
            distance: t,
            point: [
                origin[0] + direction[0] * t,
                origin[1] + direction[1] * t,
                origin[2] + direction[2] * t
            ]
        };
    }
    
    /**
     * Dot product
     * @param {Array} a
     * @param {Array} b
     * @returns {number}
     * @private
     */
    _dot(a, b) {
        return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    }
    
    /**
     * Register an interactable object
     * @param {string} id
     * @param {Object} object
     */
    register(id, object) {
        this._interactables.set(id, object);
    }
    
    /**
     * Unregister an interactable object
     * @param {string} id
     */
    unregister(id) {
        this._interactables.delete(id);
    }
    
    /**
     * Add event callback
     * @param {string} event
     * @param {Function} callback
     */
    on(event, callback) {
        if (this._callbacks[event]) {
            this._callbacks[event].push(callback);
        }
    }
    
    /**
     * Remove event callback
     * @param {string} event
     * @param {Function} callback
     */
    off(event, callback) {
        if (this._callbacks[event]) {
            const index = this._callbacks[event].indexOf(callback);
            if (index !== -1) {
                this._callbacks[event].splice(index, 1);
            }
        }
    }
    
    /**
     * Get current ray
     * @returns {Object}
     */
    getRay() {
        return { ...this._ray };
    }
    
    /**
     * Get hovered object
     * @returns {Object|null}
     */
    getHovered() {
        return this._hoveredObject;
    }
    
    /**
     * Dispose
     */
    dispose() {
        this._canvas.removeEventListener('mousemove', this._onMouseMove);
        this._canvas.removeEventListener('mousedown', this._onMouseDown);
        this._canvas.removeEventListener('mouseup', this._onMouseUp);
        this._canvas.removeEventListener('touchstart', this._onTouchStart);
        this._canvas.removeEventListener('touchmove', this._onTouchMove);
        this._canvas.removeEventListener('touchend', this._onTouchEnd);
    }
};

// ============================================================================
// PARTICLE FIELD SIMULATION
// ============================================================================

/**
 * Particle Field Simulation - Large-scale particle field
 * @class ParticleFieldSimulation
 * @memberof DRS.Graphics
 */
DRS.Graphics.ParticleFieldSimulation = class ParticleFieldSimulation {
    /**
     * Create a new Particle Field Simulation
     * @param {WebGL2RenderingContext} gl
     * @param {Object} config
     */
    constructor(gl, config = {}) {
        this._gl = gl;
        this._config = {
            dimensions: config.dimensions || [50, 50, 50],
            density: config.density || 0.5,
            speed: config.speed || 0.1,
            coherence: config.coherence || 0.8,
            ...config
        };
        
        this._field = null;
        this._particles = [];
        this._time = 0;
        
        this._initialize();
    }
    
    /**
     * Initialize the field
     * @private
     */
    _initialize() {
        const { dimensions, density } = this._config;
        const [dx, dy, dz] = dimensions;
        
        // Create 3D vector field using Perlin-like noise
        this._field = new Float32Array(dx * dy * dz * 3);
        
        for (let z = 0; z < dz; z++) {
            for (let y = 0; y < dy; y++) {
                for (let x = 0; x < dx; x++) {
                    const i = (z * dy * dx + y * dx + x) * 3;
                    
                    // Simple noise-based vector field
                    const nx = x / dx;
                    const ny = y / dy;
                    const nz = z / dz;
                    
                    this._field[i] = Math.sin(nx * 10) * Math.cos(nz * 10);
                    this._field[i + 1] = Math.cos(ny * 10) * Math.sin(nx * 10);
                    this._field[i + 2] = Math.sin(nz * 10) * Math.cos(ny * 10);
                }
            }
        }
        
        // Create particles
        const particleCount = Math.floor(dx * dy * dz * density);
        this._particles = [];
        
        for (let i = 0; i < particleCount; i++) {
            this._particles.push({
                position: [
                    Math.random() * dx - dx / 2,
                    Math.random() * dy - dy / 2,
                    Math.random() * dz - dz / 2
                ],
                velocity: [0, 0, 0],
                life: Math.random()
            });
        }
    }
    
    /**
     * Update simulation
     * @param {number} deltaTime
     */
    update(deltaTime) {
        this._time += deltaTime;
        
        const { dimensions, speed, coherence } = this._config;
        const [dx, dy, dz] = dimensions;
        
        this._particles.forEach(particle => {
            // Get field vector at particle position
            const px = Math.floor((particle.position[0] + dx / 2));
            const py = Math.floor((particle.position[1] + dy / 2));
            const pz = Math.floor((particle.position[2] + dz / 2));
            
            // Clamp to field bounds
            if (px >= 0 && px < dx && py >= 0 && py < dy && pz >= 0 && pz < dz) {
                const i = (pz * dy * dx + py * dx + px) * 3;
                
                // Apply field force
                particle.velocity[0] += this._field[i] * speed * deltaTime;
                particle.velocity[1] += this._field[i + 1] * speed * deltaTime;
                particle.velocity[2] += this._field[i + 2] * speed * deltaTime;
            }
            
            // Apply coherence (tendency to move together)
            particle.velocity[0] *= coherence;
            particle.velocity[1] *= coherence;
            particle.velocity[2] *= coherence;
            
            // Update position
            particle.position[0] += particle.velocity[0];
            particle.position[1] += particle.velocity[1];
            particle.position[2] += particle.velocity[2];
            
            // Wrap around bounds
            if (particle.position[0] < -dx / 2) particle.position[0] = dx / 2;
            if (particle.position[0] > dx / 2) particle.position[0] = -dx / 2;
            if (particle.position[1] < -dy / 2) particle.position[1] = dy / 2;
            if (particle.position[1] > dy / 2) particle.position[1] = -dy / 2;
            if (particle.position[2] < -dz / 2) particle.position[2] = dz / 2;
            if (particle.position[2] > dz / 2) particle.position[2] = -dz / 2;
            
            // Update life
            particle.life += deltaTime * 0.1;
            if (particle.life > 1) particle.life = 0;
        });
    }
    
    /**
     * Get particles for rendering
     * @returns {Array}
     */
    getParticles() {
        return this._particles;
    }
    
    /**
     * Get particle count
     * @returns {number}
     */
    getParticleCount() {
        return this._particles.length;
    }
    
    /**
     * Set field parameters
     * @param {Object} params
     */
    setParams(params) {
        Object.assign(this._config, params);
    }
    
    /**
     * Dispose
     */
    dispose() {
        this._field = null;
        this._particles = [];
    }
};

// ============================================================================
// NEURAL GRAPHICS MANAGER
// ============================================================================

/**
 * Neural Graphics Manager - Main graphics orchestrator
 * @class NeuralGraphicsManager
 * @memberof DRS.Graphics
 */
DRS.Graphics.NeuralGraphicsManager = class NeuralGraphicsManager {
    /**
     * Create a new Neural Graphics Manager
     * @param {HTMLCanvasElement} canvas
     * @param {Object} config
     */
    constructor(canvas, config = {}) {
        this._canvas = canvas;
        this._config = {
            antialias: config.antialias !== false,
            alpha: config.alpha !== false,
            premultipliedAlpha: false,
            preserveDrawingBuffer: true,
            ...config
        };
        
        this._gl = null;
        this._isRunning = false;
        this._lastTime = 0;
        this._frameCount = 0;
        this._fps = 0;
        this._fpsUpdateInterval = 500;
        this._lastFpsUpdate = 0;
        
        // Components
        this._shaderRepository = null;
        this._shaderEngine = null;
        this._particleSystem = null;
        this._holographicRenderer = null;
        this._waveSystem = null;
        this._interactionEngine = null;
        this._fieldSimulation = null;
        
        // Camera
        this._camera = {
            position: [0, 5, 15],
            target: [0, 0, 0],
            up: [0, 1, 0],
            fov: Math.PI / 4,
            near: 0.1,
            far: 1000
        };
        
        // Matrices
        this._projectionMatrix = new Float32Array(16);
        this._viewMatrix = new Float32Array(16);
        this._modelMatrix = new Float32Array(16);
        
        // Callbacks
        this._onRender = [];
        this._onUpdate = [];
        
        this._initialize();
    }
    
    /**
     * Initialize the graphics manager
     * @private
     */
    _initialize() {
        // Get WebGL2 context
        this._gl = this._canvas.getContext('webgl2', this._config);
        
        if (!this._gl) {
            throw new Error('WebGL2 not supported');
        }
        
        const gl = this._gl;
        
        // Enable extensions
        gl.getExtension('EXT_color_buffer_float');
        gl.getExtension('OES_texture_float_linear');
        
        // Initialize components
        this._shaderRepository = new DRS.Graphics.ShaderRepository();
        this._shaderEngine = new DRS.Graphics.GPUShaderEngine(gl, this._shaderRepository);
        this._particleSystem = new DRS.Graphics.NeuralParticleSystem(gl, {
            maxParticles: this._config.maxParticles || 30000
        });
        this._holographicRenderer = new DRS.Graphics.HolographicUIRenderer(gl);
        this._waveSystem = new DRS.Graphics.NeuralWaveAnimationSystem();
        this._interactionEngine = new DRS.Graphics.SpatialInteractionEngine(this._canvas, this._camera);
        this._fieldSimulation = new DRS.Graphics.ParticleFieldSimulation(gl);
        
        // Initialize matrices
        this._initMatrices();
        
        // Create shader programs
        this._createPrograms();
        
        // Setup WebGL state
        this._setupWebGL();
        
        console.log('%c[DRS.VIP-AI] Graphics Engine Initialized', 'color: #00fff2; font-weight: bold');
    }
    
    /**
     * Initialize transformation matrices
     * @private
     */
    _initMatrices() {
        // Identity matrix
        this._modelMatrix = new Float32Array([
            1, 0, 0, 0,
            0, 1, 0, 0,
            0, 0, 1, 0,
            0, 0, 0, 1
        ]);
        
        this._updateProjectionMatrix();
        this._updateViewMatrix();
    }
    
    /**
     * Update projection matrix
     * @private
     */
    _updateProjectionMatrix() {
        const aspect = this._canvas.width / this._canvas.height;
        const { fov, near, far } = this._camera;
        
        const f = 1.0 / Math.tan(fov / 2);
        const nf = 1 / (near - far);
        
        this._projectionMatrix = new Float32Array([
            f / aspect, 0, 0, 0,
            0, f, 0, 0,
            0, 0, (far + near) * nf, -1,
            0, 0, 2 * far * near * nf, 0
        ]);
    }
    
    /**
     * Update view matrix
     * @private
     */
    _updateViewMatrix() {
        const { position, target, up } = this._camera;
        
        // Calculate camera basis vectors
        let zx = position[0] - target[0];
        let zy = position[1] - target[1];
        let zz = position[2] - target[2];
        let len = Math.sqrt(zx * zx + zy * zy + zz * zz);
        zx /= len; zy /= len; zz /= len;
        
        let xx = up[1] * zz - up[2] * zy;
        let xy = up[2] * zx - up[0] * zz;
        let xz = up[0] * zy - up[1] * zx;
        len = Math.sqrt(xx * xx + xy * xy + xz * xz);
        xx /= len; xy /= len; xz /= len;
        
        let yx = zy * xz - zz * xy;
        let yy = zz * xx - zx * xz;
        let yz = zx * xy - zy * xx;
        
        this._viewMatrix = new Float32Array([
            xx, yx, zx, 0,
            xy, yy, zy, 0,
            xz, yz, zz, 0,
            -(xx * position[0] + xy * position[1] + xz * position[2]),
            -(yx * position[0] + yy * position[1] + yz * position[2]),
            -(zx * position[0] + zy * position[1] + zz * position[2]),
            1
        ]);
    }
    
    /**
     * Create shader programs
     * @private
     */
    _createPrograms() {
        // Particle program
        this._particleProgram = this._shaderEngine.createProgram(
            'particle_vertex',
            'particle_fragment',
            'particle'
        );
        
        // Grid program
        this._gridProgram = this._shaderEngine.createProgram(
            'grid_vertex',
            'grid_fragment',
            'grid'
        );
        
        // Connection program
        this._connectionProgram = this._shaderEngine.createProgram(
            'connection_vertex',
            'connection_fragment',
            'connection'
        );
    }
    
    /**
     * Setup WebGL state
     * @private
     */
    _setupWebGL() {
        const gl = this._gl;
        
        gl.enable(gl.DEPTH_TEST);
        gl.depthFunc(gl.LEQUAL);
        gl.enable(gl.CULL_FACE);
        gl.cullFace(gl.BACK);
        
        // Clear color - dark background
        gl.clearColor(0.0, 0.0, 0.02, 1.0);
    }
    
    /**
     * Start the render loop
     */
    start() {
        if (this._isRunning) return;
        
        this._isRunning = true;
        this._lastTime = performance.now();
        this._render();
    }
    
    /**
     * Stop the render loop
     */
    stop() {
        this._isRunning = false;
    }
    
    /**
     * Main render loop
     * @private
     */
    _render() {
        if (!this._isRunning) return;
        
        const currentTime = performance.now();
        const deltaTime = (currentTime - this._lastTime) / 1000;
        this._lastTime = currentTime;
        
        // Update FPS
        this._frameCount++;
        if (currentTime - this._lastFpsUpdate > this._fpsUpdateInterval) {
            this._fps = Math.round(this._frameCount / ((currentTime - this._lastFpsUpdate) / 1000));
            this._frameCount = 0;
            this._lastFpsUpdate = currentTime;
        }
        
        // Update systems
        this._update(deltaTime, currentTime / 1000);
        
        // Render
        this._renderFrame(currentTime / 1000);
        
        // Schedule next frame
        requestAnimationFrame(() => this._render());
    }
    
    /**
     * Update all systems
     * @param {number} deltaTime
     * @param {number} time
     * @private
     */
    _update(deltaTime, time) {
        // Update particle system
        this._particleSystem.update(deltaTime, time);
        
        // Update wave system
        this._waveSystem.update(deltaTime, time);
        
        // Update field simulation
        this._fieldSimulation.update(deltaTime);
        
        // Call update callbacks
        this._onUpdate.forEach(cb => cb(deltaTime, time));
    }
    
    /**
     * Render a frame
     * @param {number} time
     * @private
     */
    _renderFrame(time) {
        const gl = this._gl;
        
        // Clear
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        
        // Prepare uniforms
        const uniforms = {
            u_projectionMatrix: this._projectionMatrix,
            u_viewMatrix: this._viewMatrix,
            u_modelMatrix: this._modelMatrix,
            u_time: time,
            u_deltaTime: 0.016,
            u_gravity: [0, -0.1, 0],
            u_pointScale: 1.0,
            u_cameraPosition: this._camera.position
        };
        
        // Render grid
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        this._holographicRenderer.renderGrid(this._gridProgram, {
            ...uniforms,
            u_color: [0.0, 0.8, 0.8],
            u_opacity: 0.3,
            u_gridSize: 0.5
        });
        
        // Render particles
        this._particleSystem.render(this._particleProgram, uniforms);
        
        // Call render callbacks
        this._onRender.forEach(cb => cb(time));
    }
    
    /**
     * Resize the canvas
     * @param {number} width
     * @param {number} height
     */
    resize(width, height) {
        this._canvas.width = width;
        this._canvas.height = height;
        this._gl.viewport(0, 0, width, height);
        this._updateProjectionMatrix();
    }
    
    /**
     * Get WebGL context
     * @returns {WebGL2RenderingContext}
     */
    getGL() {
        return this._gl;
    }
    
    /**
     * Get particle system
     * @returns {NeuralParticleSystem}
     */
    getParticleSystem() {
        return this._particleSystem;
    }
    
    /**
     * Get wave system
     * @returns {NeuralWaveAnimationSystem}
     */
    getWaveSystem() {
        return this._waveSystem;
    }
    
    /**
     * Get interaction engine
     * @returns {SpatialInteractionEngine}
     */
    getInteractionEngine() {
        return this._interactionEngine;
    }
    
    /**
     * Get camera
     * @returns {Object}
     */
    getCamera() {
        return { ...this._camera };
    }
    
    /**
     * Set camera position
     * @param {number} x
     * @param {number} y
     * @param {number} z
     */
    setCameraPosition(x, y, z) {
        this._camera.position = [x, y, z];
        this._updateViewMatrix();
    }
    
    /**
     * Set camera target
     * @param {number} x
     * @param {number} y
     * @param {number} z
     */
    setCameraTarget(x, y, z) {
        this._camera.target = [x, y, z];
        this._updateViewMatrix();
    }
    
    /**
     * Get current FPS
     * @returns {number}
     */
    getFPS() {
        return this._fps;
    }
    
    /**
     * Add render callback
     * @param {Function} callback
     */
    onRender(callback) {
        this._onRender.push(callback);
    }
    
    /**
     * Add update callback
     * @param {Function} callback
     */
    onUpdate(callback) {
        this._onUpdate.push(callback);
    }
    
    /**
     * Dispose all resources
     */
    dispose() {
        this.stop();
        
        this._particleSystem.dispose();
        this._holographicRenderer.dispose();
        this._interactionEngine.dispose();
        this._fieldSimulation.dispose();
        this._shaderEngine.dispose();
    }
};

// Export to global scope
globalThis.DRS = DRS;

console.log('%c[DRS.VIP-AI] Graphics Engine Loaded', 'color: #00fff2; font-weight: bold');