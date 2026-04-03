import type { Contract, BlacklistRule, GateRule, ParsedRules, GateAction, GateCheckResult, GateOptions, GateSummary } from '../types';
/** Default safe tools — skip ALL Ark checks (read-only, query, status) */
export declare const DEFAULT_SAFE_TOOLS: ReadonlySet<string>;
/** Default execution tools — only these get content checked against blacklists */
export declare const DEFAULT_EXEC_TOOLS: ReadonlySet<string>;
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
export declare class SafetyGate {
    readonly contracts: Record<string, Contract>;
    readonly blacklists: Record<string, BlacklistRule>;
    readonly gates: Record<string, GateRule>;
    private readonly _safeTools;
    private readonly _execTools;
    private readonly _options;
    private _states;
    private readonly _approvals;
    constructor(rules: ParsedRules, options?: GateOptions);
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
    check(action: GateAction): GateCheckResult;
    /** Grant approval for a gated/blacklisted action. */
    approve(ruleName: string, actionName: string): void;
    /** Revoke approval. */
    revoke(ruleName: string, actionName: string): void;
    /** Reset all state machines to initial state. */
    reset(): void;
    /** Set the current state for a contract (used by loadString). */
    setContractState(contractName: string, state: string): void;
    /**
     * Normalize input text to defeat obfuscation attacks.
     * Defense layers:
     *   1. URL decoding (%70 → p)
     *   2. Shell subexpression flattening ($() → inner, ${} → inner)
     *   3. CMD caret stripping (c^u^r^l → curl)
     *   4. Backslash removal (r\m → rm)
     *   5. Quote removal, whitespace collapse
     */
    private _normalize;
    /**
     * Sort rule entries so constitutional/immutable rules are checked first.
     * This ensures higher-priority rules always win.
     */
    private _sortByLayer;
    /** Get current state of all contracts. */
    getStates(): Record<string, string>;
    /** Get summary of loaded rules for diagnostics. */
    summary(): GateSummary;
}
