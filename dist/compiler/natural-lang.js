"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.NaturalLangMapper = void 0;
// n2-ark — Natural language to regex pattern mapper. Deterministic, no LLM dependency.
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
/**
 * NaturalLangMapper — Converts human-readable security statements to regex patterns.
 *
 * Strategy: deterministic keyword-based mapping (no LLM dependency).
 * A security tool must NEVER depend on non-deterministic inference.
 *
 * Flow: "파일 시스템 전체 삭제 금지" → keyword extraction → pattern lookup → RegExp[]
 */
class NaturalLangMapper {
    _mappings;
    _customMappings;
    constructor(language = 'en', customMappings = {}) {
        this._mappings = this._loadMappings(language);
        this._customMappings = customMappings;
    }
    /**
     * Convert a natural language statement to regex patterns.
     * Returns empty array if no keywords match — caller should warn the user.
     */
    compile(statement) {
        const patterns = [];
        const normalizedStatement = statement.toLowerCase().trim();
        // 1. Check custom mappings first (user-defined, highest priority)
        //    Custom mappings use the same format as built-in: regex pattern strings.
        for (const [keyword, regexStrings] of Object.entries(this._customMappings)) {
            if (normalizedStatement.includes(keyword.toLowerCase())) {
                for (const rs of regexStrings) {
                    try {
                        patterns.push(new RegExp(rs, 'i'));
                    }
                    catch { /* skip invalid regex */ }
                }
            }
        }
        // 2. Check built-in mappings
        for (const [keyword, regexStrings] of Object.entries(this._mappings)) {
            if (normalizedStatement.includes(keyword.toLowerCase())) {
                for (const rs of regexStrings) {
                    try {
                        patterns.push(new RegExp(rs, 'i'));
                    }
                    catch { /* skip invalid */ }
                }
            }
        }
        return patterns;
    }
    /**
     * Compile multiple statements and return a flat array of unique patterns.
     */
    compileAll(statements) {
        const seen = new Set();
        const result = [];
        for (const stmt of statements) {
            for (const pattern of this.compile(stmt)) {
                const key = pattern.source + pattern.flags;
                if (!seen.has(key)) {
                    seen.add(key);
                    result.push(pattern);
                }
            }
        }
        return result;
    }
    /** Load language-specific mapping table from JSON. */
    _loadMappings(language) {
        const mappingPath = path.join(__dirname, '..', 'compiler', 'mappings', `${language}.json`);
        if (!fs.existsSync(mappingPath)) {
            // Fallback to English
            const fallback = path.join(__dirname, '..', 'compiler', 'mappings', 'en.json');
            if (fs.existsSync(fallback)) {
                return JSON.parse(fs.readFileSync(fallback, 'utf-8'));
            }
            console.error(`[n2-ark] No mapping table found for language '${language}'`);
            return {};
        }
        return JSON.parse(fs.readFileSync(mappingPath, 'utf-8'));
    }
}
exports.NaturalLangMapper = NaturalLangMapper;
