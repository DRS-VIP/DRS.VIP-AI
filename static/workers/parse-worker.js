/**
 * DRS.VIP-AI Parse Worker
 * Handles data parsing and transformation in a separate thread
 * @version 1.0.0
 * @author DRS.VIP-AI Engineering Team
 */

'use strict';

// ============================================================================
// PARSE WORKER CONFIGURATION
// ============================================================================

const PARSE_CONFIG = {
    maxFileSize: 50 * 1024 * 1024, // 50MB
    chunkSize: 1024 * 1024, // 1MB
    timeout: 30000
};

// ============================================================================
// MARKDOWN PARSER
// ============================================================================

class MarkdownParser {
    constructor() {
        this.rules = [
            // Headers
            { pattern: /^### (.*$)/gm, replace: '<h3>$1</h3>' },
            { pattern: /^## (.*$)/gm, replace: '<h2>$1</h2>' },
            { pattern: /^# (.*$)/gm, replace: '<h1>$1</h1>' },
            
            // Bold and italic
            { pattern: /\*\*\*(.*?)\*\*\*/g, replace: '<strong><em>$1</em></strong>' },
            { pattern: /\*\*(.*?)\*\*/g, replace: '<strong>$1</strong>' },
            { pattern: /\*(.*?)\*/g, replace: '<em>$1</em>' },
            { pattern: /___(.*?)___/g, replace: '<strong><em>$1</em></strong>' },
            { pattern: /__(.*?)__/g, replace: '<strong>$1</strong>' },
            { pattern: /_(.*?)_/g, replace: '<em>$1</em>' },
            
            // Strikethrough
            { pattern: /~~(.*?)~~/g, replace: '<del>$1</del>' },
            
            // Inline code
            { pattern: /`([^`]+)`/g, replace: '<code>$1</code>' },
            
            // Links
            { pattern: /\[([^\]]+)\]\(([^)]+)\)/g, replace: '<a href="$2" target="_blank">$1</a>' },
            
            // Images
            { pattern: /!\[([^\]]*)\]\(([^)]+)\)/g, replace: '<img src="$2" alt="$1" loading="lazy">' }
        ];
    }

    parse(text) {
        let html = text;

        // Escape HTML
        html = this.escapeHtml(html);

        // Apply basic rules
        for (const rule of this.rules) {
            html = html.replace(rule.pattern, rule.replace);
        }

        // Code blocks
        html = this.parseCodeBlocks(html);

        // Blockquotes
        html = this.parseBlockquotes(html);

        // Lists
        html = this.parseLists(html);

        // Tables
        html = this.parseTables(html);

        // Horizontal rules
        html = html.replace(/^---$/gm, '<hr>');

        // Paragraphs
        html = this.parseParagraphs(html);

        return html;
    }

    escapeHtml(text) {
        const escapeMap = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;'
        };
        return text.replace(/[&<>]/g, char => escapeMap[char]);
    }

    parseCodeBlocks(html) {
        // Fenced code blocks with language
        html = html.replace(/```(\w+)?\n([\s\S]*?)```/g, (match, lang, code) => {
            const language = lang || 'plaintext';
            const highlighted = this.highlightCode(code.trim(), language);
            return `<pre><code class="language-${language}">${highlighted}</code></pre>`;
        });

        // Indented code blocks
        html = html.replace(/^(    .+\n)+/gm, (match) => {
            const code = match.replace(/^    /gm, '');
            return `<pre><code>${this.escapeHtml(code)}</code></pre>`;
        });

        return html;
    }

    highlightCode(code, language) {
        // Simple syntax highlighting
        const keywords = {
            javascript: ['const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while', 'class', 'import', 'export', 'async', 'await', 'try', 'catch', 'throw', 'new', 'this', 'true', 'false', 'null', 'undefined'],
            python: ['def', 'class', 'return', 'if', 'else', 'elif', 'for', 'while', 'import', 'from', 'as', 'try', 'except', 'raise', 'with', 'True', 'False', 'None', 'and', 'or', 'not', 'in', 'is'],
            html: ['html', 'head', 'body', 'div', 'span', 'p', 'a', 'img', 'script', 'style', 'link', 'meta', 'title', 'header', 'footer', 'nav', 'main', 'section', 'article'],
            css: ['color', 'background', 'margin', 'padding', 'border', 'display', 'flex', 'grid', 'width', 'height', 'position', 'top', 'left', 'right', 'bottom', 'font', 'text'],
            sql: ['SELECT', 'FROM', 'WHERE', 'INSERT', 'UPDATE', 'DELETE', 'CREATE', 'DROP', 'ALTER', 'JOIN', 'ON', 'AND', 'OR', 'ORDER', 'BY', 'GROUP', 'HAVING', 'LIMIT']
        };

        let highlighted = this.escapeHtml(code);
        const langKeywords = keywords[language.toLowerCase()] || [];

        for (const keyword of langKeywords) {
            const regex = new RegExp(`\\b(${keyword})\\b`, 'gi');
            highlighted = highlighted.replace(regex, '<span class="token keyword">$1</span>');
        }

        // Strings
        highlighted = highlighted.replace(/(["'`])(?:(?!\1)[^\\]|\\.)*\1/g, '<span class="token string">$&</span>');

        // Numbers
        highlighted = highlighted.replace(/\b(\d+\.?\d*)\b/g, '<span class="token number">$1</span>');

        // Comments
        highlighted = highlighted.replace(/(\/\/.*$|#.*$|\/\*[\s\S]*?\*\/)/gm, '<span class="token comment">$1</span>');

        return highlighted;
    }

    parseBlockquotes(html) {
        return html.replace(/^(> .+\n?)+/gm, (match) => {
            const content = match.replace(/^> /gm, '');
            return `<blockquote>${content.trim()}</blockquote>`;
        });
    }

    parseLists(html) {
        // Unordered lists
        html = html.replace(/^([-*+] .+\n?)+/gm, (match) => {
            const items = match.trim().split('\n').map(item => {
                return `<li>${item.replace(/^[-*+] /, '')}</li>`;
            }).join('');
            return `<ul>${items}</ul>`;
        });

        // Ordered lists
        html = html.replace(/^(\d+\. .+\n?)+/gm, (match) => {
            const items = match.trim().split('\n').map(item => {
                return `<li>${item.replace(/^\d+\. /, '')}</li>`;
            }).join('');
            return `<ol>${items}</ol>`;
        });

        return html;
    }

    parseTables(html) {
        const tableRegex = /^\|(.+)\|\n\|[-:| ]+\|\n((?:\|.+\|\n?)+)/gm;
        
        return html.replace(tableRegex, (match, headerRow, bodyRows) => {
            const headers = headerRow.split('|').filter(h => h.trim()).map(h => 
                `<th>${h.trim()}</th>`
            ).join('');

            const rows = bodyRows.trim().split('\n').map(row => {
                const cells = row.split('|').filter(c => c.trim()).map(c => 
                    `<td>${c.trim()}</td>`
                ).join('');
                return `<tr>${cells}</tr>`;
            }).join('');

            return `<table><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table>`;
        });
    }

    parseParagraphs(html) {
        // Split by block elements
        const blocks = html.split(/(<(?:pre|blockquote|ul|ol|table|h[1-6]|hr)[^>]*>[\s\S]*?<\/\1>|<hr>)/gi);
        
        return blocks.map(block => {
            // Skip if already a block element
            if (block.match(/^<(?:pre|blockquote|ul|ol|table|h[1-6]|hr)/i)) {
                return block;
            }
            
            // Wrap in paragraph if it contains text
            const trimmed = block.trim();
            if (trimmed && !trimmed.startsWith('<')) {
                return `<p>${trimmed}</p>`;
            }
            
            return block;
        }).join('');
    }

    parseFrontMatter(text) {
        const frontMatterRegex = /^---\n([\s\S]*?)\n---\n/;
        const match = text.match(frontMatterRegex);
        
        if (match) {
            const frontMatter = {};
            const lines = match[1].split('\n');
            
            for (const line of lines) {
                const [key, ...valueParts] = line.split(':');
                if (key && valueParts.length) {
                    let value = valueParts.join(':').trim();
                    // Remove quotes if present
                    if ((value.startsWith('"') && value.endsWith('"')) ||
                        (value.startsWith("'") && value.endsWith("'"))) {
                        value = value.slice(1, -1);
                    }
                    frontMatter[key.trim()] = value;
                }
            }
            
            return {
                frontMatter,
                content: text.replace(frontMatterRegex, '')
            };
        }
        
        return { frontMatter: {}, content: text };
    }
}

// ============================================================================
// JSON PARSER
// ============================================================================

class JSONParser {
    constructor() {
        this.maxDepth = 100;
    }

    parse(text, reviver = null) {
        try {
            const result = JSON.parse(text, reviver);
            return { success: true, data: result };
        } catch (error) {
            return { 
                success: false, 
                error: error.message,
                position: this.getErrorPosition(text, error)
            };
        }
    }

    getErrorPosition(text, error) {
        const match = error.message.match(/position (\d+)/);
        if (match) {
            const pos = parseInt(match[1]);
            const line = text.substring(0, pos).split('\n').length;
            const col = pos - text.lastIndexOf('\n', pos);
            return { line, column: col, index: pos };
        }
        return null;
    }

    stringify(data, replacer = null, space = 2) {
        try {
            const result = JSON.stringify(data, replacer, space);
            return { success: true, data: result };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    validate(text) {
        const result = this.parse(text);
        if (result.success) {
            return {
                valid: true,
                type: this.getType(result.data),
                size: new Blob([text]).size,
                structure: this.analyzeStructure(result.data)
            };
        }
        return { valid: false, error: result.error };
    }

    getType(value) {
        if (value === null) return 'null';
        if (Array.isArray(value)) return 'array';
        return typeof value;
    }

    analyzeStructure(data, depth = 0) {
        if (depth > this.maxDepth) return { error: 'Max depth exceeded' };
        
        if (Array.isArray(data)) {
            return {
                type: 'array',
                length: data.length,
                itemTypes: [...new Set(data.map(item => this.getType(item)))],
                sample: data.slice(0, 3)
            };
        }
        
        if (typeof data === 'object' && data !== null) {
            const keys = Object.keys(data);
            return {
                type: 'object',
                keyCount: keys.length,
                keys: keys.slice(0, 10),
                structure: keys.slice(0, 5).reduce((acc, key) => {
                    acc[key] = this.analyzeStructure(data[key], depth + 1);
                    return acc;
                }, {})
            };
        }
        
        return { type: typeof data, value: data };
    }

    flatten(data, prefix = '', result = {}) {
        if (typeof data === 'object' && data !== null) {
            for (const key in data) {
                const newKey = prefix ? `${prefix}.${key}` : key;
                if (typeof data[key] === 'object' && data[key] !== null && !Array.isArray(data[key])) {
                    this.flatten(data[key], newKey, result);
                } else {
                    result[newKey] = data[key];
                }
            }
        }
        return result;
    }

    unflatten(data) {
        const result = {};
        
        for (const key in data) {
            const parts = key.split('.');
            let current = result;
            
            for (let i = 0; i < parts.length - 1; i++) {
                if (!(parts[i] in current)) {
                    current[parts[i]] = {};
                }
                current = current[parts[i]];
            }
            
            current[parts[parts.length - 1]] = data[key];
        }
        
        return result;
    }

    diff(obj1, obj2) {
        const changes = [];
        const visited = new Set();

        const compare = (a, b, path = '') => {
            const typeA = this.getType(a);
            const typeB = this.getType(b);

            if (typeA !== typeB) {
                changes.push({ path, type: 'type_change', from: typeA, to: typeB });
                return;
            }

            if (typeA === 'object') {
                const allKeys = new Set([...Object.keys(a || {}), ...Object.keys(b || {})]);
                for (const key of allKeys) {
                    const newPath = path ? `${path}.${key}` : key;
                    if (!(key in (a || {}))) {
                        changes.push({ path: newPath, type: 'added', value: b[key] });
                    } else if (!(key in (b || {}))) {
                        changes.push({ path: newPath, type: 'removed', value: a[key] });
                    } else {
                        compare(a[key], b[key], newPath);
                    }
                }
            } else if (typeA === 'array') {
                const maxLen = Math.max(a.length, b.length);
                for (let i = 0; i < maxLen; i++) {
                    const newPath = `${path}[${i}]`;
                    if (i >= a.length) {
                        changes.push({ path: newPath, type: 'added', value: b[i] });
                    } else if (i >= b.length) {
                        changes.push({ path: newPath, type: 'removed', value: a[i] });
                    } else {
                        compare(a[i], b[i], newPath);
                    }
                }
            } else if (a !== b) {
                changes.push({ path, type: 'modified', from: a, to: b });
            }
        };

        compare(obj1, obj2);
        return changes;
    }

    merge(...objects) {
        return objects.reduce((acc, obj) => {
            for (const key in obj) {
                if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
                    acc[key] = this.merge(acc[key] || {}, obj[key]);
                } else {
                    acc[key] = obj[key];
                }
            }
            return acc;
        }, {});
    }
}

// ============================================================================
// CSV PARSER
// ============================================================================

class CSVParser {
    constructor(options = {}) {
        this.delimiter = options.delimiter || ',';
        this.quote = options.quote || '"';
        this.escape = options.escape || '"';
        this.hasHeader = options.hasHeader !== false;
    }

    parse(text) {
        const lines = this.splitLines(text);
        const result = [];
        let headers = [];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            const row = this.parseLine(line);

            if (i === 0 && this.hasHeader) {
                headers = row;
                continue;
            }

            if (this.hasHeader) {
                const obj = {};
                headers.forEach((header, index) => {
                    obj[header || `column_${index}`] = row[index] || '';
                });
                result.push(obj);
            } else {
                result.push(row);
            }
        }

        return {
            data: result,
            headers,
            rowCount: result.length,
            columnCount: headers.length || (result[0]?.length || 0)
        };
    }

    splitLines(text) {
        const lines = [];
        let current = '';
        let inQuotes = false;

        for (let i = 0; i < text.length; i++) {
            const char = text[i];
            const nextChar = text[i + 1];

            if (inQuotes) {
                if (char === this.quote && nextChar === this.escape) {
                    current += this.quote;
                    i++;
                } else if (char === this.quote) {
                    inQuotes = false;
                } else {
                    current += char;
                }
            } else {
                if (char === this.quote) {
                    inQuotes = true;
                } else if (char === '\n' || (char === '\r' && nextChar === '\n')) {
                    lines.push(current);
                    current = '';
                    if (char === '\r') i++;
                } else {
                    current += char;
                }
            }
        }

        if (current) {
            lines.push(current);
        }

        return lines;
    }

    parseLine(line) {
        const values = [];
        let current = '';
        let inQuotes = false;

        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            const nextChar = line[i + 1];

            if (inQuotes) {
                if (char === this.quote && nextChar === this.escape) {
                    current += this.quote;
                    i++;
                } else if (char === this.quote) {
                    inQuotes = false;
                } else {
                    current += char;
                }
            } else {
                if (char === this.quote) {
                    inQuotes = true;
                } else if (char === this.delimiter) {
                    values.push(this.parseValue(current));
                    current = '';
                } else {
                    current += char;
                }
            }
        }

        values.push(this.parseValue(current));
        return values;
    }

    parseValue(value) {
        const trimmed = value.trim();
        
        // Try to parse as number
        if (!isNaN(trimmed) && trimmed !== '') {
            return parseFloat(trimmed);
        }
        
        // Boolean
        if (trimmed.toLowerCase() === 'true') return true;
        if (trimmed.toLowerCase() === 'false') return false;
        
        // Null
        if (trimmed === '' || trimmed.toLowerCase() === 'null') return null;
        
        return trimmed;
    }

    stringify(data, headers = null) {
        if (!Array.isArray(data) || data.length === 0) {
            return '';
        }

        const rows = [];
        const keys = headers || Object.keys(data[0]);

        // Header row
        if (this.hasHeader) {
            rows.push(keys.map(k => this.formatValue(k)).join(this.delimiter));
        }

        // Data rows
        for (const item of data) {
            const row = keys.map(k => this.formatValue(item[k]));
            rows.push(row.join(this.delimiter));
        }

        return rows.join('\n');
    }

    formatValue(value) {
        if (value === null || value === undefined) {
            return '';
        }
        
        const str = String(value);
        
        if (str.includes(this.delimiter) || str.includes(this.quote) || str.includes('\n')) {
            return this.quote + str.replace(new RegExp(this.quote, 'g'), this.quote + this.quote) + this.quote;
        }
        
        return str;
    }

    detectDelimiter(text) {
        const delimiters = [',', ';', '\t', '|'];
        const firstLine = text.split('\n')[0];
        
        const counts = delimiters.map(d => ({
            delimiter: d,
            count: (firstLine.match(new RegExp(d === '\t' ? '\t' : d, 'g')) || []).length
        }));
        
        const sorted = counts.sort((a, b) => b.count - a.count);
        return sorted[0].count > 0 ? sorted[0].delimiter : ',';
    }
}

// ============================================================================
// XML PARSER
// ============================================================================

class XMLParser {
    constructor(options = {}) {
        this.ignoreAttributes = options.ignoreAttributes !== false;
        this.attributePrefix = options.attributePrefix || '@';
        this.textNodeName = options.textNodeName || '#text';
    }

    parse(text) {
        try {
            const result = this.parseXML(text);
            return { success: true, data: result };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    parseXML(text) {
        // Remove XML declaration and comments
        text = text.replace(/<\?xml[^>]*\?>/gi, '');
        text = text.replace(/<!--[\s\S]*?-->/g, '');
        text = text.trim();

        return this.parseNode(text);
    }

    parseNode(text) {
        const result = {};
        
        // Match opening tag
        const tagMatch = text.match(/^<(\w+)([^>]*)>/);
        if (!tagMatch) {
            return this.parseValue(text);
        }

        const [, tagName, attributes] = tagMatch;
        
        // Find closing tag
        const closeTag = `</${tagName}>`;
        const closeIndex = this.findClosingTag(text, tagName);
        
        if (closeIndex === -1) {
            // Self-closing tag
            if (text.endsWith('/>')) {
                return { [tagName]: this.parseAttributes(attributes) };
            }
            throw new Error(`Missing closing tag for ${tagName}`);
        }

        const innerContent = text.slice(tagMatch[0].length, closeIndex);
        
        // Parse attributes
        const attrObj = this.parseAttributes(attributes);
        
        // Parse children
        const children = this.parseChildren(innerContent);
        
        // Combine
        let nodeValue = { ...attrObj, ...children };
        
        // If only text content
        if (Object.keys(nodeValue).length === 0 && innerContent.trim()) {
            nodeValue = this.parseValue(innerContent.trim());
        } else if (Object.keys(nodeValue).length === 1 && this.textNodeName in nodeValue) {
            nodeValue = nodeValue[this.textNodeName];
        }

        return { [tagName]: nodeValue };
    }

    findClosingTag(text, tagName) {
        const closeTag = `</${tagName}>`;
        let depth = 1;
        let pos = text.indexOf('>') + 1;

        while (pos < text.length && depth > 0) {
            const openMatch = text.slice(pos).match(new RegExp(`<${tagName}[^>]*>`));
            const closeMatch = text.slice(pos).match(new RegExp(`</${tagName}>`));
            
            const openPos = openMatch ? pos + openMatch.index : -1;
            const closePos = closeMatch ? pos + closeMatch.index : -1;

            if (closePos === -1) return -1;
            if (openPos === -1 || closePos < openPos) {
                depth--;
                pos = closePos + closeTag.length;
            } else {
                depth++;
                pos = openPos + openMatch[0].length;
            }
        }

        return depth === 0 ? text.indexOf(closeTag, text.indexOf('>') + 1) : -1;
    }

    parseAttributes(attrString) {
        const result = {};
        const regex = /(\w+)=["']([^"']*)["']/g;
        let match;

        while ((match = regex.exec(attrString)) !== null) {
            result[this.attributePrefix + match[1]] = match[2];
        }

        return result;
    }

    parseChildren(text) {
        const result = {};
        let remaining = text.trim();

        while (remaining) {
            // Text before first tag
            const textMatch = remaining.match(/^([^<]+)/);
            if (textMatch) {
                const textContent = textMatch[1].trim();
                if (textContent) {
                    result[this.textNodeName] = textContent;
                }
                remaining = remaining.slice(textMatch[0].length);
                continue;
            }

            // Child tag
            const tagMatch = remaining.match(/^<(\w+)/);
            if (tagMatch) {
                const childName = tagMatch[1];
                const closeIndex = this.findClosingTag(remaining, childName);
                
                if (closeIndex === -1) {
                    // Self-closing
                    const selfCloseMatch = remaining.match(/^<(\w+)([^>]*)\/>/);
                    if (selfCloseMatch) {
                        const attrs = this.parseAttributes(selfCloseMatch[2]);
                        this.addChild(result, childName, Object.keys(attrs).length ? attrs : null);
                        remaining = remaining.slice(selfCloseMatch[0].length);
                        continue;
                    }
                    break;
                }

                const childEnd = closeIndex + `</${childName}>`.length;
                const childNode = this.parseNode(remaining.slice(0, childEnd));
                const childValue = childNode[childName];
                
                this.addChild(result, childName, childValue);
                remaining = remaining.slice(childEnd);
                continue;
            }

            break;
        }

        return result;
    }

    addChild(result, name, value) {
        if (name in result) {
            if (!Array.isArray(result[name])) {
                result[name] = [result[name]];
            }
            result[name].push(value);
        } else {
            result[name] = value;
        }
    }

    parseValue(value) {
        const trimmed = value.trim();
        
        if (!isNaN(trimmed) && trimmed !== '') {
            return parseFloat(trimmed);
        }
        
        if (trimmed.toLowerCase() === 'true') return true;
        if (trimmed.toLowerCase() === 'false') return false;
        
        return trimmed;
    }

    stringify(obj, indent = 2) {
        return this.toXML(obj, indent);
    }

    toXML(obj, indent = 0, tagName = null) {
        const spaces = ' '.repeat(indent);
        let xml = '';

        for (const key in obj) {
            const value = obj[key];
            
            if (key.startsWith(this.attributePrefix)) {
                continue; // Handle attributes separately
            }

            if (value === null) {
                xml += `${spaces}<${key}/>\n`;
            } else if (Array.isArray(value)) {
                for (const item of value) {
                    xml += this.toXML({ [key]: item }, indent);
                }
            } else if (typeof value === 'object') {
                const attrs = Object.keys(value)
                    .filter(k => k.startsWith(this.attributePrefix))
                    .map(k => ` ${k.slice(1)}="${value[k]}"`)
                    .join('');
                
                const childXML = this.toXML(value, indent + 2);
                
                if (childXML.trim()) {
                    xml += `${spaces}<${key}${attrs}>\n${childXML}${spaces}</${key}>\n`;
                } else if (this.textNodeName in value) {
                    xml += `${spaces}<${key}${attrs}>${value[this.textNodeName]}</${key}>\n`;
                } else {
                    xml += `${spaces}<${key}${attrs}/>\n`;
                }
            } else {
                xml += `${spaces}<${key}>${value}</${key}>\n`;
            }
        }

        return xml;
    }
}

// ============================================================================
// YAML PARSER (Basic Implementation)
// ============================================================================

class YAMLParser {
    constructor() {
        this.indentPattern = /^(\s*)/;
    }

    parse(text) {
        try {
            const lines = text.split('\n');
            const result = this.parseLines(lines, 0, 0);
            return { success: true, data: result };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }

    parseLines(lines, index, indent) {
        const result = {};
        let currentIndex = index;

        while (currentIndex < lines.length) {
            const line = lines[currentIndex];
            
            // Skip empty lines and comments
            if (!line.trim() || line.trim().startsWith('#')) {
                currentIndex++;
                continue;
            }

            const currentIndent = this.getIndent(line);
            
            // Check if we've dedented
            if (currentIndent < indent) {
                break;
            }

            // Skip if not at current indent level
            if (currentIndent > indent) {
                currentIndex++;
                continue;
            }

            // Parse key-value pair
            const parsed = this.parseLine(line);
            
            if (parsed.isArray) {
                if (!Array.isArray(result)) {
                    result = [];
                }
                result.push(parsed.value);
            } else if (parsed.key) {
                if (parsed.isMultiline) {
                    const [value, newIndex] = this.parseMultiline(lines, currentIndex, currentIndent);
                    result[parsed.key] = value;
                    currentIndex = newIndex;
                } else if (parsed.isNested) {
                    const [nestedValue, newIndex] = this.parseNested(lines, currentIndex + 1, currentIndent + 2);
                    result[parsed.key] = nestedValue;
                    currentIndex = newIndex;
                } else {
                    result[parsed.key] = parsed.value;
                }
            }

            currentIndex++;
        }

        return result;
    }

    getIndent(line) {
        const match = line.match(this.indentPattern);
        return match ? match[1].length : 0;
    }

    parseLine(line) {
        const trimmed = line.trim();
        
        // Array item
        if (trimmed.startsWith('- ')) {
            return {
                isArray: true,
                value: this.parseValue(trimmed.slice(2))
            };
        }

        // Key-value pair
        const colonIndex = trimmed.indexOf(':');
        if (colonIndex > 0) {
            const key = trimmed.slice(0, colonIndex).trim();
            let value = trimmed.slice(colonIndex + 1).trim();
            
            // Check for nested object or array
            if (value === '' || value === '|') {
                return {
                    key,
                    value: value === '|' ? '' : null,
                    isNested: value === '',
                    isMultiline: value === '|'
                };
            }
            
            return {
                key,
                value: this.parseValue(value),
                isArray: false
            };
        }

        return { value: this.parseValue(trimmed), isArray: false };
    }

    parseValue(value) {
        if (typeof value !== 'string') return value;
        
        // Remove quotes
        if ((value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))) {
            return value.slice(1, -1);
        }
        
        // Boolean
        if (value.toLowerCase() === 'true') return true;
        if (value.toLowerCase() === 'false') return false;
        
        // Null
        if (value === '~' || value.toLowerCase() === 'null') return null;
        
        // Number
        if (!isNaN(value) && value !== '') {
            return parseFloat(value);
        }
        
        return value;
    }

    parseMultiline(lines, index, baseIndent) {
        const result = [];
        let currentIndex = index + 1;

        while (currentIndex < lines.length) {
            const line = lines[currentIndex];
            const currentIndent = this.getIndent(line);
            
            if (currentIndent <= baseIndent) break;
            
            result.push(line.slice(baseIndent + 2));
            currentIndex++;
        }

        return [result.join('\n'), currentIndex - 1];
    }

    parseNested(lines, index, indent) {
        const result = this.parseLines(lines, index, indent);
        return [result, this.findLastIndex(lines, index, indent)];
    }

    findLastIndex(lines, index, indent) {
        let last = index;
        
        for (let i = index; i < lines.length; i++) {
            const line = lines[i];
            if (!line.trim() || line.trim().startsWith('#')) continue;
            
            const currentIndent = this.getIndent(line);
            if (currentIndent < indent) break;
            
            last = i;
        }
        
        return last;
    }

    stringify(obj, indent = 2) {
        return this.toYAML(obj, 0, indent);
    }

    toYAML(obj, level, indentSize) {
        const spaces = ' '.repeat(level * indentSize);
        let yaml = '';

        if (Array.isArray(obj)) {
            for (const item of obj) {
                if (typeof item === 'object' && item !== null) {
                    yaml += `${spaces}-\n${this.toYAML(item, level + 1, indentSize)}`;
                } else {
                    yaml += `${spaces}- ${this.formatValue(item)}\n`;
                }
            }
        } else if (typeof obj === 'object' && obj !== null) {
            for (const key in obj) {
                const value = obj[key];
                
                if (typeof value === 'object' && value !== null) {
                    if (Array.isArray(value) && value.length === 0) {
                        yaml += `${spaces}${key}: []\n`;
                    } else {
                        yaml += `${spaces}${key}:\n${this.toYAML(value, level + 1, indentSize)}`;
                    }
                } else {
                    yaml += `${spaces}${key}: ${this.formatValue(value)}\n`;
                }
            }
        } else {
            yaml += `${spaces}${this.formatValue(obj)}\n`;
        }

        return yaml;
    }

    formatValue(value) {
        if (value === null) return 'null';
        if (typeof value === 'string') {
            if (value.includes('\n')) {
                return `|\n${value.split('\n').map(l => '  ' + l).join('\n')}`;
            }
            if (value.includes(':') || value.includes('#') || value.includes('"')) {
                return `"${value.replace(/"/g, '\&quot;')}"`;
            }
            return value;
        }
        return String(value);
    }
}

// ============================================================================
// PARSE WORKER MAIN CLASS
// ============================================================================

class ParseWorker {
    constructor() {
        this.markdownParser = new MarkdownParser();
        this.jsonParser = new JSONParser();
        this.csvParser = new CSVParser();
        this.xmlParser = new XMLParser();
        this.yamlParser = new YAMLParser();
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
                    // Markdown
                    case 'PARSE_MARKDOWN':
                        result = { html: this.markdownParser.parse(payload.text) };
                        break;

                    case 'PARSE_MARKDOWN_FRONTMATTER':
                        result = this.markdownParser.parseFrontMatter(payload.text);
                        break;

                    // JSON
                    case 'PARSE_JSON':
                        result = this.jsonParser.parse(payload.text);
                        break;

                    case 'STRINGIFY_JSON':
                        result = this.jsonParser.stringify(payload.data, null, payload.space);
                        break;

                    case 'VALIDATE_JSON':
                        result = this.jsonParser.validate(payload.text);
                        break;

                    case 'FLATTEN_JSON':
                        result = { flattened: this.jsonParser.flatten(payload.data) };
                        break;

                    case 'UNFLATTEN_JSON':
                        result = { unflattened: this.jsonParser.unflatten(payload.data) };
                        break;

                    case 'DIFF_JSON':
                        result = { diff: this.jsonParser.diff(payload.obj1, payload.obj2) };
                        break;

                    case 'MERGE_JSON':
                        result = { merged: this.jsonParser.merge(...payload.objects) };
                        break;

                    // CSV
                    case 'PARSE_CSV':
                        if (payload.delimiter) {
                            this.csvParser.delimiter = payload.delimiter;
                        }
                        result = this.csvParser.parse(payload.text);
                        break;

                    case 'STRINGIFY_CSV':
                        result = { csv: this.csvParser.stringify(payload.data, payload.headers) };
                        break;

                    case 'DETECT_CSV_DELIMITER':
                        result = { delimiter: this.csvParser.detectDelimiter(payload.text) };
                        break;

                    // XML
                    case 'PARSE_XML':
                        result = this.xmlParser.parse(payload.text);
                        break;

                    case 'STRINGIFY_XML':
                        result = { xml: this.xmlParser.stringify(payload.data) };
                        break;

                    // YAML
                    case 'PARSE_YAML':
                        result = this.yamlParser.parse(payload.text);
                        break;

                    case 'STRINGIFY_YAML':
                        result = { yaml: this.yamlParser.stringify(payload.data) };
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
        return this.stats;
    }
}

// ============================================================================
// INITIALIZE WORKER
// ============================================================================

const parseWorker = new ParseWorker();

// Signal ready state
postMessage({
    type: 'WORKER_READY',
    payload: {
        name: 'parse-worker',
        version: '1.0.0',
        timestamp: Date.now()
    }
});