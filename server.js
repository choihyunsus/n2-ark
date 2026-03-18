#!/usr/bin/env node
// n2-ark MCP Server — AI Firewall as an MCP service. Zero dependencies.
// Usage: npx n2-ark (or node server.js)
const path = require('path');
const { createArk } = require('./index');

// ── MCP Protocol Constants ──
const JSONRPC_VERSION = '2.0';
const SERVER_NAME = 'n2-ark';
const SERVER_VERSION = '2.1.0';

// ── Initialize Ark ──
const rulesDir = process.env.N2_ARK_RULES || path.join(process.cwd(), 'rules');
const ark = createArk({
    rulesDir,
    strictMode: process.env.N2_ARK_STRICT === 'true',
    auditEnabled: true,
});

// ── Tool Definitions ──
const TOOLS = [
    {
        name: 'ark_check',
        description: 'Check if an AI action is allowed by the safety rules. Call this BEFORE executing any action. Returns { allowed: boolean, reason?: string }.',
        inputSchema: {
            type: 'object',
            properties: {
                name: { type: 'string', description: 'Action name (e.g., tool name, API endpoint)' },
                content: { type: 'string', description: 'Action content/arguments (stringified)' },
                type: { type: 'string', description: 'Action type: tool_call, api_call, command', default: 'tool_call' }
            },
            required: ['name']
        }
    },
    {
        name: 'ark_approve',
        description: 'Grant human approval for a blocked action. Only call this after a human has explicitly confirmed the action is safe.',
        inputSchema: {
            type: 'object',
            properties: {
                rule: { type: 'string', description: 'Rule name that blocked the action' },
                action: { type: 'string', description: 'Action name to approve' }
            },
            required: ['rule', 'action']
        }
    },
    {
        name: 'ark_status',
        description: 'Get the current status of n2-ark: loaded rules summary and state machine states.',
        inputSchema: {
            type: 'object',
            properties: {}
        }
    },
    {
        name: 'ark_load_rules',
        description: 'Load additional safety rules from a string. Use .n2 format with @contract, @rule, and @gate blocks.',
        inputSchema: {
            type: 'object',
            properties: {
                rules: { type: 'string', description: 'Rules in .n2 format' }
            },
            required: ['rules']
        }
    },
    {
        name: 'ark_stats',
        description: 'Get audit statistics: how many actions were blocked vs passed over the last N days.',
        inputSchema: {
            type: 'object',
            properties: {
                days: { type: 'number', description: 'Number of days to look back (default: 7)', default: 7 }
            }
        }
    },
    {
        name: 'ark_reset',
        description: 'Reset all state machines to initial state. Use when starting a new work session.',
        inputSchema: {
            type: 'object',
            properties: {}
        }
    }
];

// ── Tool Handlers ──
function handleTool(name, args = {}) {
    switch (name) {
        case 'ark_check': {
            const result = ark.check(args.name || '', args.content || '', args.type || 'tool_call');
            const text = result.allowed
                ? `✅ ALLOWED: '${args.name}' passed all safety checks.`
                : `❌ BLOCKED: '${args.name}' — ${result.reason}${result.requires ? ` (requires: ${result.requires})` : ''}`;
            return { content: [{ type: 'text', text }], isError: !result.allowed };
        }

        case 'ark_approve': {
            ark.approve(args.rule, args.action);
            return { content: [{ type: 'text', text: `✅ Approved: '${args.action}' for rule '${args.rule}'.` }] };
        }

        case 'ark_status': {
            const summary = ark.summary();
            const states = ark.gate.getStates();
            const text = [
                '🛡️ n2-ark Status',
                `Contracts: ${summary.contracts}`,
                `Blacklists: ${summary.blacklists}`,
                `Gates: ${summary.gates}`,
                `Total Patterns: ${summary.patterns}`,
                `States: ${JSON.stringify(states, null, 2)}`,
            ].join('\n');
            return { content: [{ type: 'text', text }] };
        }

        case 'ark_load_rules': {
            ark.loadString(args.rules || '');
            const summary = ark.summary();
            return { content: [{ type: 'text', text: `✅ Rules loaded. Total: ${summary.contracts} contracts, ${summary.blacklists} blacklists, ${summary.patterns} patterns.` }] };
        }

        case 'ark_stats': {
            const stats = ark.stats(args.days || 7);
            const text = [
                `📊 Audit Stats (${args.days || 7} days)`,
                `Total Checks: ${stats.totalChecks}`,
                `Blocked: ${stats.blocked}`,
                `Passed: ${stats.passed}`,
                stats.topBlocked.length > 0 ? `Top Blocked: ${stats.topBlocked.map(b => `${b.rule}(${b.count})`).join(', ')}` : ''
            ].filter(Boolean).join('\n');
            return { content: [{ type: 'text', text }] };
        }

        case 'ark_reset': {
            ark.reset();
            return { content: [{ type: 'text', text: '🔄 All state machines reset to initial state.' }] };
        }

        default:
            return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
    }
}

// ── JSON-RPC Message Handler ──
function handleMessage(msg) {
    const { id, method, params } = msg;

    switch (method) {
        case 'initialize':
            return {
                jsonrpc: JSONRPC_VERSION, id,
                result: {
                    protocolVersion: '2024-11-05',
                    serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
                    capabilities: { tools: {} }
                }
            };

        case 'notifications/initialized':
            return null; // No response needed

        case 'tools/list':
            return {
                jsonrpc: JSONRPC_VERSION, id,
                result: { tools: TOOLS }
            };

        case 'tools/call': {
            const toolName = params?.name;
            const toolArgs = params?.arguments || {};
            try {
                const result = handleTool(toolName, toolArgs);
                return { jsonrpc: JSONRPC_VERSION, id, result };
            } catch (e) {
                return {
                    jsonrpc: JSONRPC_VERSION, id,
                    result: { content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true }
                };
            }
        }

        case 'ping':
            return { jsonrpc: JSONRPC_VERSION, id, result: {} };

        default:
            return {
                jsonrpc: JSONRPC_VERSION, id,
                error: { code: -32601, message: `Method not found: ${method}` }
            };
    }
}

// ── Stdio Transport ──
let buffer = '';

process.stdin.setEncoding('utf-8');
process.stdin.on('data', (chunk) => {
    buffer += chunk;

    // Parse newline-delimited JSON-RPC messages
    let newlineIndex;
    while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);

        if (!line) continue;

        try {
            const msg = JSON.parse(line);
            const response = handleMessage(msg);
            if (response) {
                process.stdout.write(JSON.stringify(response) + '\n');
            }
        } catch (e) {
            // Skip malformed messages
        }
    }
});

process.stdin.on('end', () => {
    ark.close();
    process.exit(0);
});

// Log to stderr (not stdout, which is for JSON-RPC)
process.stderr.write(`[n2-ark] MCP Server started. Rules: ${rulesDir}\n`);
