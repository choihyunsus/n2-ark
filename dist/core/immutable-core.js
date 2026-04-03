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
exports.ImmutableCore = void 0;
// n2-ark — Immutable Core. Constitutional rules that AI cannot modify, override, or bypass.
const crypto_1 = require("crypto");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
/**
 * Immutable Core — The innermost shield of n2-ark.
 *
 * Design principles:
 * 1. Object.freeze → runtime modification impossible
 * 2. Proxy trap → property change attempts throw immediately
 * 3. SHA-256 integrity → file tampering detected at boot
 *
 * Even if an AI understands this code, it cannot bypass it —
 * the checks are deterministic and the frozen objects are enforced by V8.
 */
class ImmutableCore {
    _constitutionalRules;
    _integrityPath;
    constructor(constitutionalRules, integrityPath, requireIntegrity = false) {
        // Deep freeze all constitutional rules — no runtime modification possible
        for (const rule of Object.values(constitutionalRules)) {
            Object.freeze(rule);
            Object.freeze(rule.patterns);
        }
        this._constitutionalRules = Object.freeze({ ...constitutionalRules });
        this._integrityPath = integrityPath ?? null;
        // Verify integrity on construction
        if (this._integrityPath) {
            if (fs.existsSync(this._integrityPath)) {
                this.verifyIntegrity();
            }
            else if (requireIntegrity) {
                throw new Error('[n2-ark] INTEGRITY: integrity.json missing but requireIntegrity=true. ' +
                    'Run "npx n2-ark seal" first, or set requireIntegrity=false.');
            }
        }
        return new Proxy(this, {
            set: (_target, prop) => {
                throw new Error(`[n2-ark] Immutable Core: cannot set property '${String(prop)}'`);
            },
            deleteProperty: (_target, prop) => {
                throw new Error(`[n2-ark] Immutable Core: cannot delete property '${String(prop)}'`);
            },
            defineProperty: (_target, prop) => {
                throw new Error(`[n2-ark] Immutable Core: cannot define property '${String(prop)}'`);
            },
            setPrototypeOf: () => {
                throw new Error('[n2-ark] Immutable Core: cannot change prototype');
            },
        });
    }
    /**
     * Check an action against constitutional rules.
     * This runs BEFORE SafetyGate.check() — if blocked here, nothing can override it.
     * No approval mechanism exists for constitutional blocks.
     */
    check(name, content = '', type = 'tool_call') {
        const fullText = `${name} ${content}`.toLowerCase()
            .replace(/[^\x00-\x7F]/g, '') // Strip non-ASCII (homoglyph defense)
            .replace(/\\/g, '')
            .replace(/\s+/g, ' ')
            .replace(/['"`]/g, '')
            .trim();
        for (const [ruleName, rule] of Object.entries(this._constitutionalRules)) {
            if (rule.scope !== 'all' && rule.scope !== type)
                continue;
            for (const pattern of rule.patterns) {
                pattern.lastIndex = 0;
                if (pattern.test(fullText)) {
                    return {
                        allowed: false,
                        reason: `[CONSTITUTIONAL] Blocked by '${ruleName}' — this rule cannot be overridden or approved`,
                        rule: ruleName,
                        pattern: pattern.toString(),
                        requires: null,
                        action: name,
                        layer: 'constitutional',
                    };
                }
            }
        }
        return { allowed: true, action: name, layer: 'constitutional' };
    }
    /**
     * Check if a rule name belongs to the constitutional layer.
     * Used by loadString() to prevent overwriting constitutional rules.
     */
    isConstitutional(ruleName) {
        return ruleName in this._constitutionalRules;
    }
    /**
     * Check if patterns from a new rule conflict with constitutional rules.
     * Prevents AI from creating "allow" rules that effectively bypass constitution.
     */
    hasConflict(patterns) {
        for (const [ruleName, rule] of Object.entries(this._constitutionalRules)) {
            for (const existingPattern of rule.patterns) {
                for (const newPattern of patterns) {
                    // Check if patterns target the same content
                    if (existingPattern.source === newPattern.source) {
                        return { conflict: true, matchedRule: ruleName };
                    }
                }
            }
        }
        return { conflict: false };
    }
    /** Get the number of constitutional rules. */
    get ruleCount() {
        return Object.keys(this._constitutionalRules).length;
    }
    /** Get all constitutional rule names. */
    get ruleNames() {
        return Object.freeze(Object.keys(this._constitutionalRules));
    }
    // ── Integrity System ──
    /**
     * Verify file integrity using SHA-256 hashes from integrity.json.
     * Called at boot — if any file has been tampered with, throws immediately.
     */
    verifyIntegrity() {
        if (!this._integrityPath || !fs.existsSync(this._integrityPath)) {
            return true; // No integrity file = skip verification (first run)
        }
        try {
            const raw = fs.readFileSync(this._integrityPath, 'utf-8');
            const data = JSON.parse(raw);
            const baseDir = path.dirname(this._integrityPath);
            for (const [storedPath, expectedHash] of Object.entries(data.hashes)) {
                // Resolve relative paths against integrity.json's directory
                const filePath = path.isAbsolute(storedPath)
                    ? storedPath
                    : path.resolve(baseDir, storedPath);
                if (!fs.existsSync(filePath)) {
                    throw new Error(`[n2-ark] INTEGRITY: Missing file '${storedPath}'`);
                }
                const currentHash = (0, crypto_1.createHash)('sha256')
                    .update(fs.readFileSync(filePath, 'utf-8'))
                    .digest('hex');
                if (currentHash !== expectedHash) {
                    throw new Error(`[n2-ark] INTEGRITY VIOLATION: '${filePath}' has been tampered with! ` +
                        `Expected: ${expectedHash.slice(0, 12)}... Got: ${currentHash.slice(0, 12)}...`);
                }
            }
            return true;
        }
        catch (e) {
            if (e instanceof Error && e.message.includes('INTEGRITY')) {
                throw e; // Re-throw integrity violations
            }
            console.error(`[n2-ark] Integrity check failed: ${e instanceof Error ? e.message : String(e)}`);
            return false;
        }
    }
    /**
     * Generate integrity.json for the current state.
     * Called by CLI `npx n2-ark seal` — requires human action.
     */
    static seal(filePaths, outputPath) {
        const hashes = {};
        const baseDir = path.dirname(outputPath);
        for (const filePath of filePaths) {
            if (!fs.existsSync(filePath)) {
                throw new Error(`[n2-ark] Seal failed: file not found '${filePath}'`);
            }
            const content = fs.readFileSync(filePath, 'utf-8');
            // Store relative path for portability across environments
            const relativePath = path.relative(baseDir, filePath).replace(/\\/g, '/');
            hashes[relativePath] = (0, crypto_1.createHash)('sha256').update(content).digest('hex');
        }
        const data = {
            version: 3,
            created: new Date().toISOString(),
            algorithm: 'sha256',
            hashes,
        };
        const dir = path.dirname(outputPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));
        return data;
    }
}
exports.ImmutableCore = ImmutableCore;
