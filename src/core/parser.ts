// n2-ark — .n2 Rule Parser. Extracts contracts, blacklists, and gates from .n2 rule files.
import * as fs from 'fs';
import * as path from 'path';
import type { Contract, BlacklistRule, GateRule, ParsedRules, Transition, RuleLayer } from '../types';

/**
 * Count net brace depth change in a line, skipping content inside regex literals.
 * Prevents patterns like /\w{3,}/i from affecting block structure parsing.
 */
function countBraces(line: string): number {
  let depth = 0;
  const trimmed = line.trim();
  // Lines that look like regex patterns: skip brace counting entirely
  if (/^\/?.*\/[gimsuy]*,?\s*$/.test(trimmed) && trimmed.startsWith('/')) {
    return 0;
  }
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]!;
    if (ch === '{') depth++;
    if (ch === '}') depth--;
  }
  return depth;
}

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
export function parse(source: string, layer: RuleLayer = 'general'): ParsedRules {
  return {
    contracts: parseContracts(source, layer),
    blacklists: parseBlacklists(source, layer),
    gates: parseGates(source, layer),
  };
}

/**
 * Extracts @contract blocks — state machine definitions.
 * Format: @contract name { from -> to : on event }
 */
export function parseContracts(source: string, layer: RuleLayer = 'general'): Record<string, Contract> {
  const machines: Record<string, Contract> = {};
  const lines = source.split('\n');

  let inContract = false;
  let contractName = '';
  let braceDepth = 0;
  let bodyLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    if (!inContract) {
      const m = trimmed.match(/^@contract\s+(\w+)\s*\{?/);
      if (m) {
        inContract = true;
        contractName = m[1] ?? '';
        braceDepth = trimmed.includes('{') ? 1 : 0;
        bodyLines = [];
        continue;
      }
    }

    if (inContract) {
      bodyLines.push(line);
      braceDepth += countBraces(line);

      if (braceDepth <= 0) {
        const body = bodyLines.join('\n');
        const transitions: Transition[] = [];

        for (const bl of body.split('\n')) {
          const tm = bl.trim().match(/^(\w+)\s*->\s*(\w+)\s*:\s*on\s+(\w+)/);
          if (tm) {
            transitions.push({ from: tm[1] ?? '', to: tm[2] ?? '', event: tm[3] ?? '' });
          }
        }

        if (transitions.length > 0) {
          const enforceMatch = body.match(/enforce\s*:\s*(\w+)/);
          const rawEnforce = enforceMatch?.[1] ?? 'strict';
          const enforce = (rawEnforce === 'warning' || rawEnforce === 'warn') ? rawEnforce : 'strict';
          const firstTransition = transitions[0];

          if (firstTransition) {
            machines[contractName] = {
              name: contractName,
              transitions,
              initialState: firstTransition.from,
              enforce,
              layer,
            };
          }
        }

        inContract = false;
        contractName = '';
        bodyLines = [];
      }
    }
  }

  return machines;
}

/**
 * Extracts @rule blocks — blacklist patterns.
 * Uses brace counting to correctly handle regex patterns containing brackets.
 */
export function parseBlacklists(source: string, layer: RuleLayer = 'general'): Record<string, BlacklistRule> {
  const rules: Record<string, BlacklistRule> = {};
  const lines = source.split('\n');

  let inRule = false;
  let ruleName = '';
  let braceDepth = 0;
  let bodyLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    if (!inRule) {
      const m = trimmed.match(/^@rule\s+(\w+)\s*\{?/);
      if (m) {
        inRule = true;
        ruleName = m[1] ?? '';
        braceDepth = trimmed.includes('{') ? 1 : 0;
        bodyLines = [];
        continue;
      }
    }

    if (inRule) {
      bodyLines.push(line);
      braceDepth += countBraces(line);

      if (braceDepth <= 0) {
        const body = bodyLines.join('\n');

        const scopeMatch = body.match(/scope\s*:\s*(\w+)/);
        const scope = scopeMatch?.[1] ?? 'tool_call';

        const requiresMatch = body.match(/requires\s*:\s*(\w+)/);
        const requires = requiresMatch?.[1] ?? null;

        const patterns = extractPatterns(body);

        if (patterns.length > 0) {
          rules[ruleName] = { scope, patterns, requires, layer };
        }

        inRule = false;
        ruleName = '';
        bodyLines = [];
      }
    }
  }

  return rules;
}

/**
 * Extract regex patterns from a rule body.
 * Simple line-based approach: each /pattern/flags on its own line.
 */
function extractPatterns(body: string): RegExp[] {
  const patterns: RegExp[] = [];
  const lines = body.split('\n');

  for (const line of lines) {
    const trimmed = line.trim().replace(/,$/, '').trim();
    const regexMatch = trimmed.match(/^(\/.*\/[gimsuy]*)$/);
    if (regexMatch) {
      try {
        const fullMatch = regexMatch[1] ?? '';
        const lastSlash = fullMatch.lastIndexOf('/');
        const pattern = fullMatch.substring(1, lastSlash);
        const flags = fullMatch.substring(lastSlash + 1);
        patterns.push(new RegExp(pattern, flags));
      } catch {
        // skip invalid regex
      }
    } else if (trimmed.startsWith('"') || trimmed.startsWith("'")) {
      const literal = trimmed.replace(/["']/g, '');
      if (literal) {
        patterns.push(new RegExp(literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
      }
    }
  }

  return patterns;
}

/**
 * Extracts @gate blocks — actions requiring explicit approval.
 * Format: @gate name { actions: [action1, action2], requires: approval_type }
 */
export function parseGates(source: string, layer: RuleLayer = 'general'): Record<string, GateRule> {
  const gates: Record<string, GateRule> = {};
  const lines = source.split('\n');

  let inGate = false;
  let gateName = '';
  let braceDepth = 0;
  let bodyLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    if (!inGate) {
      const m = trimmed.match(/^@gate\s+(\w+)\s*\{?/);
      if (m) {
        inGate = true;
        gateName = m[1] ?? '';
        braceDepth = trimmed.includes('{') ? 1 : 0;
        bodyLines = [];
        continue;
      }
    }

    if (inGate) {
      bodyLines.push(line);
      braceDepth += countBraces(line);

      if (braceDepth <= 0) {
        const body = bodyLines.join('\n');

        const actionsMatch = body.match(/actions\s*:\s*\[([^\]]+)\]/);
        const actions = actionsMatch
          ? (actionsMatch[1] ?? '').split(',').map(a => a.trim().replace(/["']/g, ''))
          : [];

        const requiresMatch = body.match(/requires\s*:\s*(\w+)/);
        const requires = requiresMatch?.[1] ?? 'human_approval';

        const minMatch = body.match(/min_approval_level\s*:\s*(\d+)/);
        const minApproval = minMatch ? parseInt(minMatch[1] ?? '1', 10) : 1;

        if (actions.length > 0) {
          gates[gateName] = { actions, requires, minApproval, layer };
        }

        inGate = false;
        gateName = '';
        bodyLines = [];
      }
    }
  }

  return gates;
}

/**
 * Loads and parses all .n2 files from a directory.
 *
 * @param layer — Rule layer to assign to all loaded rules
 */
export function loadRules(rulesDir: string, layer: RuleLayer = 'general'): ParsedRules {
  const merged: ParsedRules = { contracts: {}, blacklists: {}, gates: {} };

  if (!fs.existsSync(rulesDir)) return merged;

  const files = fs.readdirSync(rulesDir).filter(f => f.endsWith('.n2'));
  for (const file of files) {
    try {
      const source = fs.readFileSync(path.join(rulesDir, file), 'utf-8');
      const parsed = parse(source, layer);
      Object.assign(merged.contracts, parsed.contracts);
      Object.assign(merged.blacklists, parsed.blacklists);
      Object.assign(merged.gates, parsed.gates);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[n2-ark] Failed to parse ${file}: ${msg}`);
    }
  }

  return merged;
}
