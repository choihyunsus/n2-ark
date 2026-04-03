import type { Contract, BlacklistRule, GateRule, ParsedRules, RuleLayer } from '../types';
/**
 * Parses a .n2 rule file source and extracts all rule blocks.
 *
 * Supported blocks:
 *   @contract — State machine definitions (from -> to : on event)
 *   @rule     — Blacklist patterns with scope
 *   @gate     — Actions requiring human approval
 *
 * @param layer — Rule layer to assign (default: 'general')
 */
export declare function parse(source: string, layer?: RuleLayer): ParsedRules;
/**
 * Extracts @contract blocks — state machine definitions.
 * Format: @contract name { from -> to : on event }
 */
export declare function parseContracts(source: string, layer?: RuleLayer): Record<string, Contract>;
/**
 * Extracts @rule blocks — blacklist patterns.
 * Uses brace counting to correctly handle regex patterns containing brackets.
 */
export declare function parseBlacklists(source: string, layer?: RuleLayer): Record<string, BlacklistRule>;
/**
 * Extracts @gate blocks — actions requiring explicit approval.
 * Format: @gate name { actions: [action1, action2], requires: approval_type }
 */
export declare function parseGates(source: string, layer?: RuleLayer): Record<string, GateRule>;
/**
 * Loads and parses all .n2 files from a directory.
 *
 * @param layer — Rule layer to assign to all loaded rules
 */
export declare function loadRules(rulesDir: string, layer?: RuleLayer): ParsedRules;
