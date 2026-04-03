// n2-ark v3.0 — AI Firewall. Constitutional rules + Immutable Core + YAML setup.
import * as path from 'path';
import { loadRules, parse } from './core/parser';
import { SafetyGate, DEFAULT_SAFE_TOOLS, DEFAULT_EXEC_TOOLS } from './core/gate';
import { AuditLogger } from './core/audit';
import { ImmutableCore } from './core/immutable-core';
import { YamlCompiler } from './compiler/yaml-compiler';
import { ApprovalServer } from './core/approval-server';
import type { ApprovalServerConfig } from './core/approval-server';
import type {
  ArkOptions, ArkInstance, GateCheckResult, GateSummary,
  AuditStats, ParsedRules,
} from './types';

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
export function createArk(options: ArkOptions = {}): ArkInstance {
  const rulesDir = options.rulesDir ?? path.join(process.cwd(), 'rules');
  const auditDir = options.auditDir ?? path.join(process.cwd(), 'data', 'audit');
  const setupFile = options.setupFile ?? path.join(process.cwd(), 'ark.setup.yaml');
  const integrityFile = options.integrityFile ?? path.join(process.cwd(), 'integrity.json');

  // ── Step 1: Load and compile YAML setup ──
  let constitutionalRules: ParsedRules = { contracts: {}, blacklists: {}, gates: {} };
  let generalYamlRules: ParsedRules = { contracts: {}, blacklists: {}, gates: {} };
  let compilerLanguage = 'en';

  const setupConfig = YamlCompiler.loadSetupFile(setupFile);
  if (setupConfig) {
    compilerLanguage = setupConfig.settings?.compiler?.language ?? 'en';
    const compiler = new YamlCompiler(
      compilerLanguage,
      setupConfig.settings?.compiler?.custom_mappings ?? {},
    );
    const compiled = compiler.compile(setupConfig);
    constitutionalRules = compiled.constitutional;
    generalYamlRules = compiled.general;

    console.error(`[n2-ark] Setup loaded: ${setupFile} (lang: ${compilerLanguage})`);
  }

  // ── Step 2: Create Immutable Core with constitutional rules ──
  const immutableCore = new ImmutableCore(
    constitutionalRules.blacklists,
    integrityFile,
    options.requireIntegrity ?? false,
  );

  // ── Step 3: Load legacy .n2 rules as general layer ──
  const legacyRules = loadRules(rulesDir, 'general');

  // ── Step 4: Merge all general rules ──
  const mergedRules: ParsedRules = {
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
  const audit = new AuditLogger({
    dir: auditDir,
    enabled: options.auditEnabled !== false,
    logPasses: options.auditPasses ?? false,
    maxAgeDays: options.auditMaxAgeDays ?? (setupConfig?.settings?.audit?.retention_days ?? 7),
  });

  // ── Step 7: Create safety gate ──
  const gate = new SafetyGate(mergedRules, {
    strictMode: options.strictMode ?? (setupConfig?.settings?.strict_mode ?? false),
    safeTools,
    execTools,
    onBlock: (result: GateCheckResult) => audit.log(result, { type: result.rule ?? 'unknown' }),
    onPass: (result: GateCheckResult) => audit.log(result, { type: result.rule ?? 'unknown' }),
  });

  // ── Step 8: Log summary ──
  const summary = gate.summary();
  console.error(
    `[n2-ark] v3.0 Loaded: ${summary.contracts} contracts, ` +
    `${summary.blacklists} blacklists (${summary.patterns} patterns), ` +
    `${summary.gates} gates | ` +
    `Layers: ${summary.layers.constitutional} constitutional, ${summary.layers.general} general | ` +
    `Immutable: ${immutableCore.ruleCount} rules`
  );

  // ── Step 9: Approval Server (optional, direct human channel) ──
  let approvalSrv: ApprovalServer | null = null;
  const approvalOpt = options.approvalServer;
  if (approvalOpt) {
    const config: ApprovalServerConfig = typeof approvalOpt === 'object' ? approvalOpt : {};
    approvalSrv = new ApprovalServer(config);
    approvalSrv.onApprove = (req) => {
      if (!immutableCore.isConstitutional(req.rule)) {
        gate.approve(req.rule, req.action);
        console.error(`[n2-ark] ✅ Approved via dashboard: ${req.action} (rule: ${req.rule})`);
      }
    };
    approvalSrv.onDeny = (req) => {
      console.error(`[n2-ark] ❌ Denied via dashboard: ${req.action} (rule: ${req.rule})`);
    };
    approvalSrv.start().catch((err: Error) => {
      console.error(`[n2-ark] Approval server failed: ${err.message}`);
    });
  }

  return {
    gate,
    audit,

    /** Check an action against all safety layers. */
    check(name: string, content: string = '', type: string = 'tool_call'): GateCheckResult {
      // Skip all checks for safe tools (read-only, query, status)
      const effectiveSafeTools = safeTools ?? DEFAULT_SAFE_TOOLS;
      if (effectiveSafeTools.has(name)) {
        return { allowed: true, action: name };
      }

      // Only check content for execution-type tools to prevent false positives
      const effectiveExecTools = execTools ?? DEFAULT_EXEC_TOOLS;
      const effectiveContent = effectiveExecTools.has(name) ? content : '';

      // Layer 0+1: Immutable Core (constitutional rules, frozen)
      const coreResult = immutableCore.check(name, effectiveContent, type);
      if (!coreResult.allowed) return coreResult;

      // Layer 2+3: SafetyGate (constitutional + general rules with state machines)
      const result = gate.check({ name, content: effectiveContent, type });

      // Attach approval server info for general-rule blocks
      if (!result.allowed && approvalSrv?.running) {
        const pending = approvalSrv.createRequest(
          name, content, result.rule ?? 'unknown', result.reason ?? '',
        );
        result.pendingId = pending.id;
        result.approvalUrl = approvalSrv.url;
      }

      return result;
    },

    /** Grant approval for a blocked action (general rules only). */
    approve(ruleName: string, actionName: string): void {
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
    loadString(source: string): void {
      const parsed = parse(source, 'general');

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
    summary(): GateSummary {
      return gate.summary();
    },

    /** Reset all state machines. */
    reset(): void {
      gate.reset();
    },

    /** Get audit statistics. */
    stats(days: number = 7): AuditStats {
      return audit.stats(days);
    },

    /** Shutdown — flush audit logs, stop approval server. */
    close(): void {
      audit.close();
      approvalSrv?.stop();
    },
  };
}

export { SafetyGate } from './core/gate';
export { AuditLogger } from './core/audit';
export { ImmutableCore } from './core/immutable-core';
export { YamlCompiler } from './compiler/yaml-compiler';
export { NaturalLangMapper } from './compiler/natural-lang';
export { loadRules, parse } from './core/parser';
export type { ArkInstance, ArkOptions, GateCheckResult, GateSummary } from './types';
