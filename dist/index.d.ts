import type { ArkOptions, ArkInstance } from './types';
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
export declare function createArk(options?: ArkOptions): ArkInstance;
export { SafetyGate } from './core/gate';
export { AuditLogger } from './core/audit';
export { ImmutableCore } from './core/immutable-core';
export { YamlCompiler } from './compiler/yaml-compiler';
export { NaturalLangMapper } from './compiler/natural-lang';
export { loadRules, parse } from './core/parser';
export type { ArkInstance, ArkOptions, GateCheckResult, GateSummary } from './types';
