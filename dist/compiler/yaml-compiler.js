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
exports.YamlCompiler = void 0;
// n2-ark — YAML Setup Compiler. Converts ark.setup.yaml to internal ParsedRules.
const fs = __importStar(require("fs"));
const natural_lang_1 = require("./natural-lang");
/**
 * YamlCompiler — Reads ark.setup.yaml and produces ParsedRules.
 */
class YamlCompiler {
    _mapper;
    constructor(language = 'en', customMappings = {}) {
        this._mapper = new natural_lang_1.NaturalLangMapper(language, customMappings);
    }
    /** Compile a setup config object to ParsedRules (constitutional + general). */
    compile(config) {
        return {
            constitutional: this._compileConstitution(config),
            general: this._compileGeneralRules(config),
        };
    }
    /** Compile constitutional rules from natural language statements. */
    _compileConstitution(config) {
        const blacklists = {};
        const contracts = {};
        const gates = {};
        // Extract statements — handle both formats
        const constitution = config.constitution;
        let statements = [];
        if (Array.isArray(constitution)) {
            statements = constitution.filter((s) => typeof s === 'string');
        }
        else if (constitution && typeof constitution === 'object') {
            const obj = constitution;
            if (Array.isArray(obj.statements)) {
                statements = obj.statements.filter((s) => typeof s === 'string');
            }
        }
        if (statements.length > 0) {
            const patterns = this._mapper.compileAll(statements);
            if (patterns.length > 0) {
                blacklists['constitution_auto'] = {
                    scope: 'all',
                    patterns,
                    requires: null,
                    layer: 'constitutional',
                };
            }
        }
        // Compile sequences → contracts
        const seqSource = (constitution && typeof constitution === 'object')
            ? constitution.sequences
            : undefined;
        if (seqSource && typeof seqSource === 'object' && !Array.isArray(seqSource)) {
            for (const [seqName, seqRaw] of Object.entries(seqSource)) {
                const seqConfig = seqRaw;
                if (!seqConfig?.flow)
                    continue;
                const transitions = this._parseFlow(seqConfig.flow);
                if (transitions.length > 0 && transitions[0]) {
                    contracts[seqName] = {
                        name: seqName,
                        transitions,
                        initialState: transitions[0].from,
                        enforce: 'strict',
                        layer: 'constitutional',
                    };
                }
            }
        }
        return { contracts, blacklists, gates };
    }
    /** Compile general rules from the rules section. */
    _compileGeneralRules(config) {
        const blacklists = {};
        const contracts = {};
        const gates = {};
        if (config.rules?.block && Array.isArray(config.rules.block)) {
            for (const blockRule of config.rules.block) {
                if (!blockRule || typeof blockRule !== 'object')
                    continue;
                const br = blockRule;
                const patterns = [];
                const patternList = br.patterns;
                if (Array.isArray(patternList)) {
                    for (const p of patternList) {
                        if (typeof p === 'string' && p) {
                            try {
                                patterns.push(new RegExp(p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
                            }
                            catch { /* skip */ }
                        }
                    }
                }
                if (patterns.length > 0 && typeof br.name === 'string') {
                    blacklists[br.name] = {
                        scope: 'all',
                        patterns,
                        requires: br.action === 'require_approval' ? 'human_approval' : null,
                        layer: 'general',
                    };
                }
            }
        }
        if (config.rules?.gates && Array.isArray(config.rules.gates)) {
            for (const gateRule of config.rules.gates) {
                if (!gateRule || typeof gateRule !== 'object')
                    continue;
                const gr = gateRule;
                if (typeof gr.name === 'string' && Array.isArray(gr.actions)) {
                    gates[gr.name] = {
                        actions: gr.actions.filter((a) => typeof a === 'string'),
                        requires: gr.approval === 'human' ? 'human_approval' : String(gr.approval ?? 'human_approval'),
                        minApproval: typeof gr.level === 'number' ? gr.level : 1,
                        layer: 'general',
                    };
                }
            }
        }
        return { contracts, blacklists, gates };
    }
    /** Parse a flow string → transitions. "빌드 → 테스트 → 스테이징" */
    _parseFlow(flow) {
        const steps = flow.split(/\s*(?:→|->)\s*/).filter(s => s.trim());
        const transitions = [];
        for (let i = 0; i < steps.length - 1; i++) {
            const from = this._slugify(steps[i] ?? '');
            const to = this._slugify(steps[i + 1] ?? '');
            if (from && to)
                transitions.push({ from, to, event: to });
        }
        return transitions;
    }
    /** Convert display name to slug. */
    _slugify(name) {
        return name.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_가-힣]/g, '');
    }
    /** Load and parse a YAML setup file. */
    static loadSetupFile(filePath) {
        if (!fs.existsSync(filePath))
            return null;
        try {
            const raw = fs.readFileSync(filePath, 'utf-8');
            return YamlCompiler.parseSimpleYaml(raw);
        }
        catch (e) {
            console.error(`[n2-ark] Failed to load setup: ${e instanceof Error ? e.message : String(e)}`);
            return null;
        }
    }
    // ══════════════════════════════════════════════════════════
    //  Simple recursive-descent YAML parser
    //  Supports: scalars, nested objects, arrays (- item), comments
    //  Does NOT support: anchors, aliases, multi-line strings
    // ══════════════════════════════════════════════════════════
    static parseSimpleYaml(source) {
        const lines = source.split('\n')
            .map(l => l.replace(/\r$/, ''))
            .filter(l => l.trim() !== '' && !l.trim().startsWith('#'));
        const result = {};
        YamlCompiler._parseYamlBlock(lines, 0, result, 0);
        return result;
    }
    /**
     * Parse YAML lines into target object. Returns next line index.
     * @param lines     - filtered lines (no comments/blanks)
     * @param idx       - current line index
     * @param target    - object to write into
     * @param minIndent - minimum indent for this block
     */
    static _parseYamlBlock(lines, idx, target, minIndent) {
        let i = idx;
        while (i < lines.length) {
            const line = lines[i];
            const indent = line.search(/\S/);
            if (indent < minIndent)
                break; // Back to parent
            const content = line.trim();
            if (content.startsWith('- ')) {
                break;
            } // Array items handled by parent
            // Must be key: value
            const m = content.match(/^([\w][\w_]*)\s*:\s*(.*)/);
            if (!m) {
                i++;
                continue;
            }
            const key = m[1];
            const rawVal = (m[2] ?? '').trim();
            if (rawVal !== '' && rawVal !== '|') {
                // Inline value
                if (rawVal.startsWith('[') && rawVal.endsWith(']')) {
                    target[key] = rawVal.slice(1, -1).split(',')
                        .map(s => s.trim().replace(/^["']|["']$/g, ''));
                }
                else {
                    target[key] = YamlCompiler._parseScalar(rawVal);
                }
                i++;
                continue;
            }
            // Empty value — peek at next line to determine type
            i++;
            if (i >= lines.length) {
                target[key] = {};
                break;
            }
            const nextLine = lines[i];
            const nextIndent = nextLine.search(/\S/);
            if (nextIndent <= indent) {
                // No children
                target[key] = {};
                continue; // Don't advance i — re-process this line
            }
            const nextContent = nextLine.trim();
            if (nextContent.startsWith('- ')) {
                // Array
                const arr = [];
                target[key] = arr;
                i = YamlCompiler._parseYamlArray(lines, i, arr, nextIndent);
            }
            else {
                // Nested object
                const child = {};
                target[key] = child;
                i = YamlCompiler._parseYamlBlock(lines, i, child, nextIndent);
            }
        }
        return i;
    }
    /**
     * Parse array items (lines starting with "- "). Returns next line index.
     */
    static _parseYamlArray(lines, idx, arr, minIndent) {
        let i = idx;
        while (i < lines.length) {
            const line = lines[i];
            const indent = line.search(/\S/);
            if (indent < minIndent)
                break;
            const content = line.trim();
            if (!content.startsWith('- '))
                break;
            const val = content.substring(2).trim().replace(/^["']|["']$/g, '');
            // Check if next lines are indented deeper (object item)
            if (i + 1 < lines.length) {
                const nextLine = lines[i + 1];
                const nextIndent = nextLine.search(/\S/);
                const nextContent = nextLine.trim();
                // Object item: next line is deeper and looks like key: value
                if (nextIndent > indent && /^[\w][\w_]*\s*:/.test(nextContent)) {
                    const obj = {};
                    // Parse the inline part of "- key: value" as first property
                    const inlineMatch = val.match(/^([\w][\w_]*)\s*:\s*(.*)/);
                    if (inlineMatch) {
                        obj[inlineMatch[1]] = YamlCompiler._parseScalar((inlineMatch[2] ?? '').replace(/^["']|["']$/g, ''));
                    }
                    i++;
                    // Parse child properties
                    i = YamlCompiler._parseYamlBlock(lines, i, obj, nextIndent);
                    arr.push(obj);
                    continue;
                }
            }
            // Check if the "- " line itself contains key: value (inline object start)
            const inlineObjMatch = val.match(/^([\w][\w_]*)\s*:\s*(.*)/);
            if (inlineObjMatch && i + 1 < lines.length) {
                const nextLine = lines[i + 1];
                const nextIndent = nextLine.search(/\S/);
                if (nextIndent > indent) {
                    const obj = {};
                    obj[inlineObjMatch[1]] = YamlCompiler._parseScalar((inlineObjMatch[2] ?? '').replace(/^["']|["']$/g, ''));
                    i++;
                    i = YamlCompiler._parseYamlBlock(lines, i, obj, nextIndent);
                    arr.push(obj);
                    continue;
                }
            }
            arr.push(val);
            i++;
        }
        return i;
    }
    /** Parse a scalar YAML value (string, boolean, number). */
    static _parseScalar(raw) {
        const cleaned = raw.replace(/^["']|["']$/g, '');
        if (cleaned === 'true')
            return true;
        if (cleaned === 'false')
            return false;
        if (/^\d+$/.test(cleaned))
            return parseInt(cleaned, 10);
        return cleaned;
    }
}
exports.YamlCompiler = YamlCompiler;
