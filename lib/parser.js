// n2-ark — .n2 Rule Parser. Extracts contracts, blacklists, and gates from .n2 rule files.
const fs = require('fs');
const path = require('path');

/**
 * Parses a .n2 rule file source and extracts all rule blocks.
 *
 * Supported blocks:
 *   @contract — State machine definitions (from -> to : on event)
 *   @rule     — Blacklist patterns with scope
 *   @gate     — Actions requiring human approval
 *
 * @param {string} source — Raw .n2 file content
 * @returns {{ contracts: object, blacklists: object, gates: object }}
 */
function parse(source) {
    return {
        contracts: parseContracts(source),
        blacklists: parseBlacklists(source),
        gates: parseGates(source),
        workflows: parseWorkflows(source),
    };
}

/**
 * Extracts @contract blocks — state machine definitions.
 * Format: @contract name { from -> to : on event }
 *
 * @param {string} source
 * @returns {Object<string, { name: string, transitions: Array, initialState: string }>}
 */
function parseContracts(source) {
    const machines = {};
    const lines = source.split('\n');

    let inContract = false;
    let contractName = '';
    let braceDepth = 0;
    let bodyLines = [];

    for (const line of lines) {
        const trimmed = line.trim();

        if (!inContract) {
            const m = trimmed.match(/^@contract\s+(\w+)\s*\{?/);
            if (m) {
                inContract = true;
                contractName = m[1];
                braceDepth = (trimmed.includes('{')) ? 1 : 0;
                bodyLines = [];
                continue;
            }
        }

        if (inContract) {
            bodyLines.push(line);
            for (const ch of line) {
                if (ch === '{') braceDepth++;
                if (ch === '}') braceDepth--;
            }

            if (braceDepth <= 0) {
                const body = bodyLines.join('\n');
                const transitions = [];
                for (const bl of body.split('\n')) {
                    const tm = bl.trim().match(/^(\w+)\s*->\s*(\w+)\s*:\s*on\s+(\w+)/);
                    if (tm) {
                        transitions.push({ from: tm[1], to: tm[2], event: tm[3] });
                    }
                }

                if (transitions.length > 0) {
                    machines[contractName] = {
                        name: contractName,
                        transitions,
                        initialState: transitions[0].from,
                    };
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
 *
 * @param {string} source
 * @returns {Object<string, { scope: string, patterns: RegExp[], requires: string|null }>}
 */
function parseBlacklists(source) {
    const rules = {};
    const lines = source.split('\n');

    let inRule = false;
    let ruleName = '';
    let braceDepth = 0;
    let bodyLines = [];

    for (const line of lines) {
        const trimmed = line.trim();

        if (!inRule) {
            const m = trimmed.match(/^@rule\s+(\w+)\s*\{?/);
            if (m) {
                inRule = true;
                ruleName = m[1];
                braceDepth = (trimmed.includes('{')) ? 1 : 0;
                bodyLines = [];
                continue;
            }
        }

        if (inRule) {
            bodyLines.push(line);
            for (const ch of line) {
                if (ch === '{') braceDepth++;
                if (ch === '}') braceDepth--;
            }

            if (braceDepth <= 0) {
                const body = bodyLines.join('\n');

                const scopeMatch = body.match(/scope\s*:\s*(\w+)/);
                const scope = scopeMatch ? scopeMatch[1] : 'tool_call';

                const requiresMatch = body.match(/requires\s*:\s*(\w+)/);
                const requires = requiresMatch ? requiresMatch[1] : null;

                // Extract blacklist array with balanced bracket parsing
                const patterns = extractPatterns(body);

                if (patterns.length > 0) {
                    rules[ruleName] = { scope, patterns, requires };
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
 *
 * @param {string} body — Rule body text
 * @returns {RegExp[]}
 */
function extractPatterns(body) {
    const patterns = [];
    const lines = body.split('\n');

    for (const line of lines) {
        const trimmed = line.trim().replace(/,$/, '').trim();
        // Match /pattern/flags format
        const regexMatch = trimmed.match(/^(\/.*\/[gimsuy]*)$/);
        if (regexMatch) {
            try {
                // Extract pattern and flags from the full regex string
                const lastSlash = regexMatch[1].lastIndexOf('/');
                const pattern = regexMatch[1].substring(1, lastSlash);
                const flags = regexMatch[1].substring(lastSlash + 1);
                patterns.push(new RegExp(pattern, flags));
            } catch (e) { /* skip invalid regex */ }
        } else if (trimmed.startsWith('"') || trimmed.startsWith("'")) {
            // Literal string pattern
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
 *
 * @param {string} source
 * @returns {Object<string, { actions: string[], requires: string, minApproval: number }>}
 */
function parseGates(source) {
    const gates = {};
    const lines = source.split('\n');

    let inGate = false;
    let gateName = '';
    let braceDepth = 0;
    let bodyLines = [];

    for (const line of lines) {
        const trimmed = line.trim();

        if (!inGate) {
            const m = trimmed.match(/^@gate\s+(\w+)\s*\{?/);
            if (m) {
                inGate = true;
                gateName = m[1];
                braceDepth = (trimmed.includes('{')) ? 1 : 0;
                bodyLines = [];
                continue;
            }
        }

        if (inGate) {
            bodyLines.push(line);
            for (const ch of line) {
                if (ch === '{') braceDepth++;
                if (ch === '}') braceDepth--;
            }

            if (braceDepth <= 0) {
                const body = bodyLines.join('\n');

                const actionsMatch = body.match(/actions\s*:\s*\[([^\]]+)\]/);
                const actions = actionsMatch
                    ? actionsMatch[1].split(',').map(a => a.trim().replace(/["']/g, ''))
                    : [];

                const requiresMatch = body.match(/requires\s*:\s*(\w+)/);
                const requires = requiresMatch ? requiresMatch[1] : 'human_approval';

                const minMatch = body.match(/min_approval_level\s*:\s*(\d+)/);
                const minApproval = minMatch ? parseInt(minMatch[1], 10) : 1;

                if (actions.length > 0) {
                    gates[gateName] = { actions, requires, minApproval };
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
 * Extracts @workflow blocks — step sequences with triggers.
 * Format: @workflow name { trigger: event, step name { action: ..., required: bool } }
 *
 * @param {string} source
 * @returns {Object<string, { name: string, trigger: string|null, steps: Array }>}
 */
function parseWorkflows(source) {
    const workflows = {};
    const lines = source.split('\n');

    let inWorkflow = false;
    let workflowName = '';
    let braceDepth = 0;
    let bodyLines = [];

    for (const line of lines) {
        const trimmed = line.trim();

        if (!inWorkflow) {
            const m = trimmed.match(/^@workflow\s+(\w+)\s*\{?/);
            if (m) {
                inWorkflow = true;
                workflowName = m[1];
                braceDepth = (trimmed.includes('{')) ? 1 : 0;
                bodyLines = [];
                continue;
            }
        }

        if (inWorkflow) {
            bodyLines.push(line);
            for (const ch of line) {
                if (ch === '{') braceDepth++;
                if (ch === '}') braceDepth--;
            }

            if (braceDepth <= 0) {
                const body = bodyLines.join('\n');

                // Extract trigger
                const triggerMatch = body.match(/trigger\s*:\s*(\w+)/);
                const trigger = triggerMatch ? triggerMatch[1] : null;

                // Extract enforce
                const enforceMatch = body.match(/enforce\s*:\s*(\w+)/);
                const enforce = enforceMatch ? enforceMatch[1] : 'normal';

                // Extract steps
                const steps = [];
                const stepRegex = /step\s+(\w+)\s*\{([^}]+)\}/g;
                let stepMatch;
                while ((stepMatch = stepRegex.exec(body)) !== null) {
                    const stepName = stepMatch[1];
                    const stepBody = stepMatch[2];

                    const actionMatch = stepBody.match(/action\s*:\s*(.+?)(?:\n|$)/);
                    const requiredMatch = stepBody.match(/required\s*:\s*(true|false)/);
                    const dependsMatch = stepBody.match(/depends_on\s*:\s*(\w+)/);
                    const outputMatch = stepBody.match(/output\s*->\s*\$(\w+)/);

                    steps.push({
                        name: stepName,
                        action: actionMatch ? actionMatch[1].trim() : null,
                        required: requiredMatch ? requiredMatch[1] === 'true' : false,
                        dependsOn: dependsMatch ? dependsMatch[1] : null,
                        output: outputMatch ? outputMatch[1] : null,
                    });
                }

                if (steps.length > 0 || trigger) {
                    workflows[workflowName] = {
                        name: workflowName,
                        trigger,
                        enforce,
                        steps,
                    };
                }

                inWorkflow = false;
                workflowName = '';
                bodyLines = [];
            }
        }
    }

    return workflows;
}

/**
 * Loads and parses all .n2 files from a directory.
 *
 * @param {string} rulesDir — Path to rules directory
 * @returns {{ contracts: object, blacklists: object, gates: object }}
 */
function loadRules(rulesDir) {
    const merged = { contracts: {}, blacklists: {}, gates: {}, workflows: {} };

    if (!fs.existsSync(rulesDir)) return merged;

    const files = fs.readdirSync(rulesDir).filter(f => f.endsWith('.n2'));
    for (const file of files) {
        try {
            const source = fs.readFileSync(path.join(rulesDir, file), 'utf-8');
            const parsed = parse(source);
            Object.assign(merged.contracts, parsed.contracts);
            Object.assign(merged.blacklists, parsed.blacklists);
            Object.assign(merged.gates, parsed.gates);
            Object.assign(merged.workflows, parsed.workflows);
        } catch (e) {
            console.error(`[n2-ark] Failed to parse ${file}: ${e.message}`);
        }
    }

    return merged;
}

module.exports = { parse, parseContracts, parseBlacklists, parseGates, parseWorkflows, loadRules };
