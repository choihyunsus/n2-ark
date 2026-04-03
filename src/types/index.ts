// n2-ark v3.0 — Complete type system for the AI Safety Gate.

// ── Rule Layers ──

/** Rule priority layers: immutable > constitutional > general */
export type RuleLayer = 'immutable' | 'constitutional' | 'general';

// ── Parser types ──

export interface Transition {
  from: string;
  to: string;
  event: string;
}

export interface Contract {
  name: string;
  transitions: Transition[];
  initialState: string;
  enforce: 'strict' | 'warning' | 'warn';
  layer: RuleLayer;
}

export interface BlacklistRule {
  scope: string;
  patterns: RegExp[];
  requires: string | null;
  layer: RuleLayer;
}

export interface GateRule {
  actions: string[];
  requires: string;
  minApproval: number;
  layer: RuleLayer;
}

export interface ParsedRules {
  contracts: Record<string, Contract>;
  blacklists: Record<string, BlacklistRule>;
  gates: Record<string, GateRule>;
}

// ── Gate types ──

export interface GateAction {
  type: string;
  name: string;
  content: string;
  meta?: Record<string, unknown>;
}

export interface GateCheckResult {
  allowed: boolean;
  reason?: string;
  rule?: string;
  pattern?: string;
  requires?: string | null;
  minApproval?: number;
  currentState?: string;
  expectedStates?: string[];
  requiredAction?: string;
  action: string;
  layer?: RuleLayer;
  /** Pending approval ID (when approval server is enabled) */
  pendingId?: string;
  /** URL to approve/deny directly via browser (bypasses AI) */
  approvalUrl?: string;
}

export interface GateOptions {
  strictMode?: boolean;
  safeTools?: ReadonlySet<string>;
  execTools?: ReadonlySet<string>;
  onBlock?: ((result: GateCheckResult) => void) | null;
  onPass?: ((result: GateCheckResult) => void) | null;
}

export interface GateSummary {
  contracts: number;
  blacklists: number;
  gates: number;
  patterns: number;
  layers: {
    immutable: number;
    constitutional: number;
    general: number;
  };
}

// ── Audit types ──

export interface AuditOptions {
  dir?: string;
  enabled?: boolean;
  maxAgeDays?: number;
  logPasses?: boolean;
}

export interface AuditEntry {
  timestamp: string;
  decision: 'PASS' | 'BLOCK';
  action: string;
  type: string;
  rule: string | null;
  reason: string | null;
  pattern: string | null;
  requires: string | null;
  currentState: string | null;
  layer: RuleLayer | null;
}

export interface AuditStats {
  totalChecks: number;
  blocked: number;
  passed: number;
  topBlocked: Array<{ rule: string; count: number }>;
}

// ── Setup YAML types ──

export interface ArkSetupConfig {
  version: number;
  constitution: ConstitutionConfig;
  rules: GeneralRulesConfig;
  settings: ArkSettingsConfig;
}

export interface ConstitutionConfig {
  statements: string[];
  sequences: Record<string, SequenceConfig>;
}

export interface SequenceConfig {
  flow: string;
  description: string;
}

export interface GeneralRulesConfig {
  block: BlockRuleConfig[];
  gates: GateRuleConfig[];
}

export interface BlockRuleConfig {
  name: string;
  description: string;
  patterns: string[];
  action: 'require_approval' | 'block';
}

export interface GateRuleConfig {
  name: string;
  actions: string[];
  approval: string;
  level: number;
}

export interface ArkSettingsConfig {
  strict_mode: boolean;
  safe_tools?: string[];
  exec_tools?: string[];
  audit: AuditSettingsConfig;
  compiler: CompilerConfig;
}

export interface AuditSettingsConfig {
  enabled: boolean;
  retention_days: number;
  log_passes: boolean;
}

export interface CompilerConfig {
  language: string;
  custom_mappings?: Record<string, string[]>;
}

// ── Integrity types ──

export interface IntegrityData {
  version: number;
  created: string;
  algorithm: 'sha256';
  hashes: Record<string, string>;
}

// ── Ark factory types ──

export interface ArkOptions {
  rulesDir?: string;
  setupFile?: string;
  integrityFile?: string;
  requireIntegrity?: boolean;
  auditDir?: string;
  strictMode?: boolean;
  auditEnabled?: boolean;
  auditPasses?: boolean;
  auditMaxAgeDays?: number;
  safeTools?: string[];
  execTools?: string[];
  /** Enable direct human approval server. `true` for defaults, or config object. */
  approvalServer?: boolean | { port?: number; host?: string; expirationMs?: number };
}

export interface ArkInstance {
  gate: import('../core/gate').SafetyGate;
  audit: import('../core/audit').AuditLogger;
  check: (name: string, content?: string, type?: string) => GateCheckResult;
  approve: (ruleName: string, actionName: string) => void;
  loadString: (source: string) => void;
  summary: () => GateSummary;
  reset: () => void;
  stats: (days?: number) => AuditStats;
  close: () => void;
}
