"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SafetyGate = exports.DEFAULT_EXEC_TOOLS = exports.DEFAULT_SAFE_TOOLS = void 0;
/** Default safe tools — skip ALL Ark checks (read-only, query, status) */
exports.DEFAULT_SAFE_TOOLS = new Set([
    'n2_brain_read', 'n2_core_read', 'n2_core_write',
    'n2_kv_load', 'n2_kv_search', 'n2_kv_backup_list',
    'n2_context_search', 'n2_entity_search', 'n2_call_history',
    'n2_heartbeat', 'n2_cdp_discover', 'n2_tool_route',
    'n2_mimir_status', 'n2_mimir_overlay', 'n2_mimir_insights',
    'n2_mimir_backup',
]);
/** Default execution tools — only these get content checked against blacklists */
exports.DEFAULT_EXEC_TOOLS = new Set([
    'run_command', 'execute_command', 'send_command_input',
    'write_to_file', 'replace_file_content', 'multi_replace_file_content',
    'n2_qln_call',
]);
/**
 * N2 Ark Safety Gate v3.0.
 * Every AI action must pass through the gate.
 * The lock cannot unlock itself — if the AI can't solve the logic, it can't do anything.
 *
 * v3.0 changes from browser v7.0:
 * - SAFE_TOOLS / EXEC_TOOLS are configurable (not hardcoded)
 * - Rules carry layer annotation (immutable / constitutional / general)
 * - Boot enforcement generalized (not hardcoded to 'BootSequence')
 * - Error messages internationalized (English)
 */
class SafetyGate {
    contracts;
    blacklists;
    gates;
    _safeTools;
    _execTools;
    _options;
    _states;
    _approvals;
    constructor(rules, options = {}) {
        this.contracts = rules.contracts;
        this.blacklists = rules.blacklists;
        this.gates = rules.gates;
        this._safeTools = options.safeTools ?? exports.DEFAULT_SAFE_TOOLS;
        this._execTools = options.execTools ?? exports.DEFAULT_EXEC_TOOLS;
        this._options = {
            strictMode: options.strictMode ?? false,
            safeTools: this._safeTools,
            execTools: this._execTools,
            onBlock: options.onBlock ?? null,
            onPass: options.onPass ?? null,
        };
        // State machine current states (per contract)
        this._states = {};
        for (const [name, contract] of Object.entries(this.contracts)) {
            this._states[name] = contract.initialState;
        }
        // Approval cache (temporary, per session)
        this._approvals = new Set();
    }
    /**
     * Check an action against all rules.
     * This is THE core function — the single chokepoint for all AI behavior.
     *
     * Check order:
     * 0) Safe tools whitelist (skip all checks)
     * 1) Blacklist check (constitutional rules first, then general)
     * 2) Gate check (approval requirements)
     * 3) Boot enforcement (if boot contract exists)
     * 4) Contract state machine check
     * 5) Strict mode (block unknown actions)
     */
    check(action) {
        const { name = '', content = '' } = action;
        const type = action.type || 'tool_call';
        // 0) Safe tools whitelist — skip ALL checks for read-only/query tools
        if (this._safeTools.has(name)) {
            const result = { allowed: true, action: name };
            this._options.onPass?.(result);
            return result;
        }
        // Build check text: gate trusts the content passed by the caller.
        //   - Content filtering (execTools) is handled upstream in index.ts
        //   - Safe tools: already skipped above (step 0)
        const nameText = this._normalize(name);
        const contentText = content ? this._normalize(content) : '';
        const fullText = contentText ? `${nameText} ${contentText}` : nameText;
        // 1) Blacklist check — constitutional rules first, then general
        //    Constitutional blocks CANNOT be overridden by approval
        const sortedBlacklists = this._sortByLayer(Object.entries(this.blacklists));
        for (const [ruleName, rule] of sortedBlacklists) {
            if (rule.scope !== 'all' && rule.scope !== type)
                continue;
            for (const pattern of rule.patterns) {
                pattern.lastIndex = 0;
                if (pattern.test(fullText)) {
                    // Constitutional rules: no approval override possible
                    if (rule.layer === 'constitutional' || rule.layer === 'immutable') {
                        const result = {
                            allowed: false,
                            reason: `[CONSTITUTIONAL] Blocked by '${ruleName}' — this rule cannot be overridden`,
                            rule: ruleName,
                            pattern: pattern.toString(),
                            requires: null,
                            action: name,
                            layer: rule.layer,
                        };
                        this._options.onBlock?.(result);
                        return result;
                    }
                    // General rules: check if approval was granted
                    if (rule.requires && this._approvals.has(`${ruleName}:${name}`)) {
                        continue;
                    }
                    const result = {
                        allowed: false,
                        reason: `Blocked by rule '${ruleName}'`,
                        rule: ruleName,
                        pattern: pattern.toString(),
                        requires: rule.requires,
                        action: name,
                        layer: rule.layer,
                    };
                    this._options.onBlock?.(result);
                    return result;
                }
            }
        }
        // 2) Gate check — actions requiring explicit approval
        for (const [gateName, gate] of Object.entries(this.gates)) {
            const isGated = gate.actions.some(a => {
                if (a.includes('*')) {
                    const regex = new RegExp('^' + a.replace(/\*/g, '.*') + '$', 'i');
                    return regex.test(name);
                }
                return a.toLowerCase() === name.toLowerCase();
            });
            if (isGated && !this._approvals.has(`${gateName}:${name}`)) {
                const result = {
                    allowed: false,
                    reason: `Action '${name}' requires approval (gate: '${gateName}')`,
                    rule: gateName,
                    requires: gate.requires,
                    minApproval: gate.minApproval,
                    action: name,
                    layer: gate.layer,
                };
                this._options.onBlock?.(result);
                return result;
            }
        }
        // 3) Boot enforcement — find any contract with boot-like initial state
        //    If such contract exists and is in initial state, only its first event is allowed
        for (const [contractName, contract] of Object.entries(this.contracts)) {
            const currentState = this._states[contractName] ?? contract.initialState;
            // n2_boot-like event: resets ALL contracts
            const firstTransition = contract.transitions[0];
            if (firstTransition && name === firstTransition.event && currentState === contract.initialState) {
                // This is the boot event — reset all contracts to initial state
                for (const [cName, c] of Object.entries(this.contracts)) {
                    this._states[cName] = c.initialState;
                }
            }
            // Enforce: if in initial (cold) state and the contract has enforce: strict,
            // only the first event (boot) is allowed
            if (contract.enforce === 'strict' &&
                currentState === contract.initialState &&
                firstTransition &&
                name !== firstTransition.event) {
                // Check if this event belongs to this contract at all
                const eventBelongsHere = contract.transitions.some(t => t.event === name);
                if (eventBelongsHere) {
                    const result = {
                        allowed: false,
                        reason: `Boot required: '${firstTransition.event}' must be called first. Current state: '${currentState}'`,
                        rule: contractName,
                        currentState,
                        requiredAction: firstTransition.event,
                        action: name,
                        layer: contract.layer,
                    };
                    this._options.onBlock?.(result);
                    return result;
                }
            }
        }
        // 4) Contract (state machine) check — sequence enforcement
        for (const [contractName, contract] of Object.entries(this.contracts)) {
            const currentState = this._states[contractName] ?? contract.initialState;
            const validTransition = contract.transitions.find(t => t.from === currentState && t.event === name);
            if (validTransition) {
                this._states[contractName] = validTransition.to;
            }
            else {
                const eventExists = contract.transitions.some(t => t.event === name);
                if (eventExists) {
                    const expectedStates = contract.transitions
                        .filter(t => t.event === name)
                        .map(t => t.from);
                    const neededStep = contract.transitions.find(t => t.from === currentState);
                    const neededAction = neededStep ? neededStep.event : 'unknown';
                    const result = {
                        allowed: false,
                        reason: `Sequence violation in '${contractName}': '${name}' requires state [${expectedStates.join('|')}] but current is '${currentState}'. Run '${neededAction}' first.`,
                        rule: contractName,
                        currentState,
                        expectedStates,
                        requiredAction: neededAction,
                        action: name,
                        layer: contract.layer,
                    };
                    this._options.onBlock?.(result);
                    return result;
                }
            }
        }
        // 5) Strict mode — block unknown actions
        if (this._options.strictMode) {
            const isKnown = Object.values(this.contracts).some(c => c.transitions.some(t => t.event === name));
            if (!isKnown && name) {
                const result = {
                    allowed: false,
                    reason: `Unknown action '${name}' blocked by strict mode`,
                    rule: 'strict_mode',
                    action: name,
                };
                this._options.onBlock?.(result);
                return result;
            }
        }
        // All checks passed
        const result = { allowed: true, action: name };
        this._options.onPass?.(result);
        return result;
    }
    /** Grant approval for a gated/blacklisted action. */
    approve(ruleName, actionName) {
        // Prevent approving constitutional rules
        const rule = this.blacklists[ruleName];
        if (rule && (rule.layer === 'constitutional' || rule.layer === 'immutable')) {
            console.error(`[n2-ark] Cannot approve constitutional rule '${ruleName}'`);
            return;
        }
        this._approvals.add(`${ruleName}:${actionName}`);
    }
    /** Revoke approval. */
    revoke(ruleName, actionName) {
        this._approvals.delete(`${ruleName}:${actionName}`);
    }
    /** Reset all state machines to initial state. */
    reset() {
        for (const [name, contract] of Object.entries(this.contracts)) {
            this._states[name] = contract.initialState;
        }
        this._approvals.clear();
    }
    /** Set the current state for a contract (used by loadString). */
    setContractState(contractName, state) {
        this._states[contractName] = state;
    }
    /**
     * Normalize input text to defeat obfuscation attacks.
     * Defense layers:
     *   1. URL decoding (%70 → p)
     *   2. Shell subexpression flattening ($() → inner, ${} → inner)
     *   3. CMD caret stripping (c^u^r^l → curl)
     *   4. Backslash removal (r\m → rm)
     *   5. Quote removal, whitespace collapse
     */
    _normalize(text) {
        return text
            .toLowerCase()
            .replace(/[^\x00-\x7F]/g, '') // Strip non-ASCII (homoglyph defense)
            .replace(/%([0-9a-f]{2})/gi, (_, hex) => // URL decode (%70 → p)
         String.fromCharCode(parseInt(hex, 16)))
            .replace(/\$\(([^)]*)\)/g, '$1') // Flatten $() subshells → inner content
            .replace(/\$\{([^}]*)\}/g, '$1') // Flatten ${} expansions → inner content
            .replace(/\^/g, '') // Strip CMD caret escapes (c^u^r^l → curl)
            .replace(/\\/g, '') // Remove backslash escapes (r\m → rm)
            .replace(/['"`]/g, '') // Remove quotes
            .replace(/\s+/g, ' ') // Collapse consecutive whitespace
            .trim();
    }
    /**
     * Sort rule entries so constitutional/immutable rules are checked first.
     * This ensures higher-priority rules always win.
     */
    _sortByLayer(entries) {
        const order = {
            immutable: 0,
            constitutional: 1,
            general: 2,
        };
        return entries.sort((a, b) => {
            const la = order[a[1].layer] ?? 2;
            const lb = order[b[1].layer] ?? 2;
            return la - lb;
        });
    }
    /** Get current state of all contracts. */
    getStates() {
        return { ...this._states };
    }
    /** Get summary of loaded rules for diagnostics. */
    summary() {
        const totalPatterns = Object.values(this.blacklists)
            .reduce((sum, r) => sum + r.patterns.length, 0);
        const countLayer = (layer) => {
            return Object.values(this.blacklists).filter(r => r.layer === layer).length
                + Object.values(this.contracts).filter(c => c.layer === layer).length
                + Object.values(this.gates).filter(g => g.layer === layer).length;
        };
        return {
            contracts: Object.keys(this.contracts).length,
            blacklists: Object.keys(this.blacklists).length,
            gates: Object.keys(this.gates).length,
            patterns: totalPatterns,
            layers: {
                immutable: countLayer('immutable'),
                constitutional: countLayer('constitutional'),
                general: countLayer('general'),
            },
        };
    }
}
exports.SafetyGate = SafetyGate;
