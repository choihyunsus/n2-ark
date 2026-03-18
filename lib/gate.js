// n2-ark — Safety Gate. The core engine that checks all AI actions against compiled rules.
const fs = require('fs');
const path = require('path');

/**
 * N2 Ark Safety Gate.
 * Every AI action must pass through the gate.
 * If the AI can't solve the logic, it can't do anything.
 */
class SafetyGate {
    /**
     * @param {object} rules — Parsed rules from parser.loadRules()
     * @param {object} options
     * @param {function} options.onBlock — Callback when action is blocked
     * @param {function} options.onPass — Callback when action passes
     * @param {boolean} options.strictMode — If true, blocks unknown actions (default: false)
     */
    constructor(rules, options = {}) {
        this.contracts = rules.contracts || {};
        this.blacklists = rules.blacklists || {};
        this.gates = rules.gates || {};
        this.options = {
            strictMode: options.strictMode || false,
            onBlock: options.onBlock || null,
            onPass: options.onPass || null,
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
     * @param {object} action
     * @param {string} action.type — Action type: 'tool_call', 'api_call', 'command', etc.
     * @param {string} action.name — Action name (e.g., tool name, API endpoint)
     * @param {string} action.content — Full action content/arguments (stringified)
     * @param {object} action.meta — Additional metadata
     * @returns {{ allowed: boolean, reason?: string, rule?: string, action?: string }}
     */
    check(action) {
        const { type = 'tool_call', name = '', content = '', meta = {} } = action;
        const fullText = `${name} ${content}`.toLowerCase();

        // 1) Blacklist check — pattern matching against all rules
        for (const [ruleName, rule] of Object.entries(this.blacklists)) {
            if (rule.scope !== 'all' && rule.scope !== type) continue;

            for (const pattern of rule.patterns) {
                if (pattern.test(fullText)) {
                    // Check if approval was granted
                    if (rule.requires && this._approvals.has(`${ruleName}:${name}`)) {
                        continue; // Approved, skip
                    }

                    const result = {
                        allowed: false,
                        reason: `Blocked by blacklist rule '${ruleName}'`,
                        rule: ruleName,
                        pattern: pattern.toString(),
                        requires: rule.requires || null,
                        action: name,
                    };

                    if (this.options.onBlock) this.options.onBlock(result);
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
                };

                if (this.options.onBlock) this.options.onBlock(result);
                return result;
            }
        }

        // 3) Contract (state machine) check — sequence enforcement
        for (const [contractName, contract] of Object.entries(this.contracts)) {
            const currentState = this._states[contractName];
            const validTransition = contract.transitions.find(
                t => t.from === currentState && t.event === name
            );

            if (validTransition) {
                // Valid event for current state — transition
                this._states[contractName] = validTransition.to;
            } else {
                // Check if this event exists in the contract at all
                const eventExists = contract.transitions.some(t => t.event === name);
                if (eventExists) {
                    // Event exists but wrong state — BLOCK
                    const expectedStates = contract.transitions
                        .filter(t => t.event === name)
                        .map(t => t.from);

                    const result = {
                        allowed: false,
                        reason: `Sequence violation in '${contractName}': '${name}' requires state [${expectedStates.join('|')}] but current state is '${currentState}'`,
                        rule: contractName,
                        currentState,
                        expectedStates,
                        action: name,
                    };

                    if (this.options.onBlock) this.options.onBlock(result);
                    return result;
                }
            }
        }

        // 4) Strict mode — block unknown actions
        if (this.options.strictMode) {
            const isKnown = Object.values(this.contracts).some(c =>
                c.transitions.some(t => t.event === name)
            );
            if (!isKnown && name) {
                const result = {
                    allowed: false,
                    reason: `Unknown action '${name}' blocked by strict mode`,
                    rule: 'strict_mode',
                    action: name,
                };

                if (this.options.onBlock) this.options.onBlock(result);
                return result;
            }
        }

        // All checks passed
        const result = { allowed: true, action: name };
        if (this.options.onPass) this.options.onPass(result);
        return result;
    }

    /**
     * Grant approval for a gated/blacklisted action.
     * Call this after human confirms the action is safe.
     *
     * @param {string} ruleName — The rule/gate name
     * @param {string} actionName — The action being approved
     */
    approve(ruleName, actionName) {
        this._approvals.add(`${ruleName}:${actionName}`);
    }

    /**
     * Revoke approval.
     *
     * @param {string} ruleName
     * @param {string} actionName
     */
    revoke(ruleName, actionName) {
        this._approvals.delete(`${ruleName}:${actionName}`);
    }

    /**
     * Reset all state machines to initial state.
     */
    reset() {
        for (const [name, contract] of Object.entries(this.contracts)) {
            this._states[name] = contract.initialState;
        }
        this._approvals.clear();
    }

    /**
     * Get current state of all contracts.
     * @returns {Object<string, string>}
     */
    getStates() {
        return { ...this._states };
    }

    /**
     * Get summary of loaded rules for diagnostics.
     * @returns {{ contracts: number, blacklists: number, gates: number, patterns: number }}
     */
    summary() {
        const totalPatterns = Object.values(this.blacklists)
            .reduce((sum, r) => sum + r.patterns.length, 0);
        return {
            contracts: Object.keys(this.contracts).length,
            blacklists: Object.keys(this.blacklists).length,
            gates: Object.keys(this.gates).length,
            patterns: totalPatterns,
        };
    }
}

module.exports = { SafetyGate };
