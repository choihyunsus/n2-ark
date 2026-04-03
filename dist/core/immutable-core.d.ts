import type { BlacklistRule, GateCheckResult, IntegrityData } from '../types';
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
export declare class ImmutableCore {
    private readonly _constitutionalRules;
    private readonly _integrityPath;
    constructor(constitutionalRules: Record<string, BlacklistRule>, integrityPath?: string, requireIntegrity?: boolean);
    /**
     * Check an action against constitutional rules.
     * This runs BEFORE SafetyGate.check() — if blocked here, nothing can override it.
     * No approval mechanism exists for constitutional blocks.
     */
    check(name: string, content?: string, type?: string): GateCheckResult;
    /**
     * Check if a rule name belongs to the constitutional layer.
     * Used by loadString() to prevent overwriting constitutional rules.
     */
    isConstitutional(ruleName: string): boolean;
    /**
     * Check if patterns from a new rule conflict with constitutional rules.
     * Prevents AI from creating "allow" rules that effectively bypass constitution.
     */
    hasConflict(patterns: RegExp[]): {
        conflict: boolean;
        matchedRule?: string;
    };
    /** Get the number of constitutional rules. */
    get ruleCount(): number;
    /** Get all constitutional rule names. */
    get ruleNames(): readonly string[];
    /**
     * Verify file integrity using SHA-256 hashes from integrity.json.
     * Called at boot — if any file has been tampered with, throws immediately.
     */
    verifyIntegrity(): boolean;
    /**
     * Generate integrity.json for the current state.
     * Called by CLI `npx n2-ark seal` — requires human action.
     */
    static seal(filePaths: string[], outputPath: string): IntegrityData;
}
