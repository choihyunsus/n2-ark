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
exports.parse = exports.loadRules = exports.NaturalLangMapper = exports.YamlCompiler = exports.ImmutableCore = exports.AuditLogger = exports.SafetyGate = void 0;
exports.createArk = createArk;
// n2-ark v3.0 — AI Firewall. Constitutional rules + Immutable Core + YAML setup.
const path = __importStar(require("path"));
const parser_1 = require("./core/parser");
const gate_1 = require("./core/gate");
const audit_1 = require("./core/audit");
const immutable_core_1 = require("./core/immutable-core");
const yaml_compiler_1 = require("./compiler/yaml-compiler");
const approval_server_1 = require("./core/approval-server");
/**
 * Creates an n2-ark v3.0 instance — the AI Firewall.
 *
 * Rule loading order (3-layer system):
 * 1. Constitutional rules from ark.setup.yaml → ImmutableCore (frozen, no approval override)
 * 2. General rules from ark.setup.yaml → SafetyGate (approval possible)
 * 3. Legacy .n2 rules from rulesDir → SafetyGate (approval possible)
 *
 * Integrity check: if integrity.json exists, verifies SHA-256 hashes at boot.
 */
function createArk(options = {}) {
    const rulesDir = options.rulesDir ?? path.join(process.cwd(), 'rules');
    const auditDir = options.auditDir ?? path.join(process.cwd(), 'data', 'audit');
    const setupFile = options.setupFile ?? path.join(process.cwd(), 'ark.setup.yaml');
    const integrityFile = options.integrityFile ?? path.join(process.cwd(), 'integrity.json');
    // ── Step 1: Load and compile YAML setup ──
    let constitutionalRules = { contracts: {}, blacklists: {}, gates: {} };
    let generalYamlRules = { contracts: {}, blacklists: {}, gates: {} };
    let compilerLanguage = 'en';
    const setupConfig = yaml_compiler_1.YamlCompiler.loadSetupFile(setupFile);
    if (setupConfig) {
        compilerLanguage = setupConfig.settings?.compiler?.language ?? 'en';
        const compiler = new yaml_compiler_1.YamlCompiler(compilerLanguage, setupConfig.settings?.compiler?.custom_mappings ?? {});
        const compiled = compiler.compile(setupConfig);
        constitutionalRules = compiled.constitutional;
        generalYamlRules = compiled.general;
        console.error(`[n2-ark] Setup loaded: ${setupFile} (lang: ${compilerLanguage})`);
    }
    // ── Step 2: Create Immutable Core with constitutional rules ──
    const immutableCore = new immutable_core_1.ImmutableCore(constitutionalRules.blacklists, integrityFile, options.requireIntegrity ?? false);
    // ── Step 3: Load legacy .n2 rules as general layer ──
    const legacyRules = (0, parser_1.loadRules)(rulesDir, 'general');
    // ── Step 4: Merge all general rules ──
    const mergedRules = {
        contracts: {
            ...constitutionalRules.contracts,
            ...generalYamlRules.contracts,
            ...legacyRules.contracts,
        },
        blacklists: {
            ...constitutionalRules.blacklists,
            ...generalYamlRules.blacklists,
            ...legacyRules.blacklists,
        },
        gates: {
            ...constitutionalRules.gates,
            ...generalYamlRules.gates,
            ...legacyRules.gates,
        },
    };
    // ── Step 5: Configure safe/exec tools ──
    const safeTools = options.safeTools
        ? new Set(options.safeTools)
        : (setupConfig?.settings?.safe_tools
            ? new Set(setupConfig.settings.safe_tools)
            : undefined);
    const execTools = options.execTools
        ? new Set(options.execTools)
        : (setupConfig?.settings?.exec_tools
            ? new Set(setupConfig.settings.exec_tools)
            : undefined);
    // ── Step 6: Create audit logger ──
    const audit = new audit_1.AuditLogger({
        dir: auditDir,
        enabled: options.auditEnabled !== false,
        logPasses: options.auditPasses ?? false,
        maxAgeDays: options.auditMaxAgeDays ?? (setupConfig?.settings?.audit?.retention_days ?? 7),
    });
    // ── Step 7: Create safety gate ──
    const gate = new gate_1.SafetyGate(mergedRules, {
        strictMode: options.strictMode ?? (setupConfig?.settings?.strict_mode ?? false),
        safeTools,
        execTools,
        onBlock: (result) => audit.log(result, { type: result.rule ?? 'unknown' }),
        onPass: (result) => audit.log(result, { type: result.rule ?? 'unknown' }),
    });
    // ── Step 8: Log summary ──
    const summary = gate.summary();
    console.error(`[n2-ark] v3.0 Loaded: ${summary.contracts} contracts, ` +
        `${summary.blacklists} blacklists (${summary.patterns} patterns), ` +
        `${summary.gates} gates | ` +
        `Layers: ${summary.layers.constitutional} constitutional, ${summary.layers.general} general | ` +
        `Immutable: ${immutableCore.ruleCount} rules`);
    // ── Step 9: Approval Server (optional, direct human channel) ──
    let approvalSrv = null;
    const approvalOpt = options.approvalServer;
    if (approvalOpt) {
        const config = typeof approvalOpt === 'object' ? approvalOpt : {};
        approvalSrv = new approval_server_1.ApprovalServer(config);
        approvalSrv.onApprove = (req) => {
            if (!immutableCore.isConstitutional(req.rule)) {
                gate.approve(req.rule, req.action);
                console.error(`[n2-ark] ✅ Approved via dashboard: ${req.action} (rule: ${req.rule})`);
            }
        };
        approvalSrv.onDeny = (req) => {
            console.error(`[n2-ark] ❌ Denied via dashboard: ${req.action} (rule: ${req.rule})`);
        };
        approvalSrv.start().catch((err) => {
            console.error(`[n2-ark] Approval server failed: ${err.message}`);
        });
    }
    return {
        gate,
        audit,
        /** Check an action against all safety layers. */
        check(name, content = '', type = 'tool_call') {
            // Skip all checks for safe tools (read-only, query, status)
            const effectiveSafeTools = safeTools ?? gate_1.DEFAULT_SAFE_TOOLS;
            if (effectiveSafeTools.has(name)) {
                return { allowed: true, action: name };
            }
            // Only check content for execution-type tools to prevent false positives
            const effectiveExecTools = execTools ?? gate_1.DEFAULT_EXEC_TOOLS;
            const effectiveContent = effectiveExecTools.has(name) ? content : '';
            // Layer 0+1: Immutable Core (constitutional rules, frozen)
            const coreResult = immutableCore.check(name, effectiveContent, type);
            if (!coreResult.allowed)
                return coreResult;
            // Layer 2+3: SafetyGate (constitutional + general rules with state machines)
            const result = gate.check({ name, content: effectiveContent, type });
            // Attach approval server info for general-rule blocks
            if (!result.allowed && approvalSrv?.running) {
                const pending = approvalSrv.createRequest(name, content, result.rule ?? 'unknown', result.reason ?? '');
                result.pendingId = pending.id;
                result.approvalUrl = approvalSrv.url;
            }
            return result;
        },
        /** Grant approval for a blocked action (general rules only). */
        approve(ruleName, actionName) {
            if (immutableCore.isConstitutional(ruleName)) {
                console.error(`[n2-ark] Cannot approve constitutional rule '${ruleName}'`);
                return;
            }
            gate.approve(ruleName, actionName);
        },
        /**
         * Load additional rules from a string (general layer only).
         * Constitutional rules cannot be overwritten via this API.
         */
        loadString(source) {
            const parsed = (0, parser_1.parse)(source, 'general');
            // Protection: reject rules that overwrite constitutional rules
            for (const name of Object.keys(parsed.blacklists)) {
                if (immutableCore.isConstitutional(name)) {
                    console.error(`[n2-ark] BLOCKED: Cannot overwrite constitutional rule '${name}'`);
                    delete parsed.blacklists[name];
                }
            }
            // Protection: reject rules with conflicting patterns
            for (const [name, rule] of Object.entries(parsed.blacklists)) {
                const conflict = immutableCore.hasConflict(rule.patterns);
                if (conflict.conflict) {
                    console.error(`[n2-ark] BLOCKED: Rule '${name}' conflicts with constitutional rule '${conflict.matchedRule}'`);
                    delete parsed.blacklists[name];
                }
            }
            Object.assign(gate.contracts, parsed.contracts);
            Object.assign(gate.blacklists, parsed.blacklists);
            Object.assign(gate.gates, parsed.gates);
            for (const [contractName, contract] of Object.entries(parsed.contracts)) {
                gate.setContractState(contractName, contract.initialState);
            }
        },
        /** Get summary of loaded rules. */
        summary() {
            return gate.summary();
        },
        /** Reset all state machines. */
        reset() {
            gate.reset();
        },
        /** Get audit statistics. */
        stats(days = 7) {
            return audit.stats(days);
        },
        /** Shutdown — flush audit logs, stop approval server. */
        close() {
            audit.close();
            approvalSrv?.stop();
        },
    };
}
var gate_2 = require("./core/gate");
Object.defineProperty(exports, "SafetyGate", { enumerable: true, get: function () { return gate_2.SafetyGate; } });
var audit_2 = require("./core/audit");
Object.defineProperty(exports, "AuditLogger", { enumerable: true, get: function () { return audit_2.AuditLogger; } });
var immutable_core_2 = require("./core/immutable-core");
Object.defineProperty(exports, "ImmutableCore", { enumerable: true, get: function () { return immutable_core_2.ImmutableCore; } });
var yaml_compiler_2 = require("./compiler/yaml-compiler");
Object.defineProperty(exports, "YamlCompiler", { enumerable: true, get: function () { return yaml_compiler_2.YamlCompiler; } });
var natural_lang_1 = require("./compiler/natural-lang");
Object.defineProperty(exports, "NaturalLangMapper", { enumerable: true, get: function () { return natural_lang_1.NaturalLangMapper; } });
var parser_2 = require("./core/parser");
Object.defineProperty(exports, "loadRules", { enumerable: true, get: function () { return parser_2.loadRules; } });
Object.defineProperty(exports, "parse", { enumerable: true, get: function () { return parser_2.parse; } });
