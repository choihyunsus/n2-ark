#!/usr/bin/env node
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
// n2-ark MCP Server v3.0 — AI Firewall as an MCP service. Zero runtime dependencies.
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const index_1 = require("./index");
// ── MCP Protocol Constants ──
const JSONRPC_VERSION = '2.0';
const SERVER_NAME = 'n2-ark';
const SERVER_VERSION = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf-8')).version;
// ── Initialize Ark ──
const rulesDir = process.env.N2_ARK_RULES ?? path.join(process.cwd(), 'rules');
const setupFile = process.env.N2_ARK_SETUP ?? path.join(process.cwd(), 'ark.setup.yaml');
const approvalPort = parseInt(process.env.N2_ARK_APPROVAL_PORT ?? '9720', 10);
const approvalEnabled = process.env.N2_ARK_APPROVAL !== 'false';
const ark = (0, index_1.createArk)({
    rulesDir,
    setupFile,
    strictMode: process.env.N2_ARK_STRICT === 'true',
    auditEnabled: true,
    approvalServer: approvalEnabled ? { port: approvalPort } : false,
});
// ── Tool Definitions ──
const TOOLS = [
    {
        name: 'ark_check',
        description: 'Check if an AI action is allowed by the safety rules. Call this BEFORE executing any action. Returns { allowed: boolean, reason?: string, layer?: string }.',
        inputSchema: {
            type: 'object',
            properties: {
                name: { type: 'string', description: 'Action name (e.g., tool name)' },
                content: { type: 'string', description: 'Action content/arguments (stringified)' },
                type: { type: 'string', description: 'Action type: tool_call, api_call, command', default: 'tool_call' },
            },
            required: ['name'],
        },
    },
    // ark_approve REMOVED — AI self-approval vector eliminated.
    // Human approval channels: HTTP dashboard (localhost:9720) and CLI only.
    {
        name: 'ark_status',
        description: 'Get current n2-ark status: loaded rules summary, state machine states, and layer breakdown.',
        inputSchema: { type: 'object', properties: {} },
    },
    {
        name: 'ark_load_rules',
        description: 'Load additional safety rules from a string (general layer only). Constitutional rules cannot be modified.',
        inputSchema: {
            type: 'object',
            properties: {
                rules: { type: 'string', description: 'Rules in .n2 format' },
            },
            required: ['rules'],
        },
    },
    {
        name: 'ark_stats',
        description: 'Get audit statistics: blocked vs passed actions over N days.',
        inputSchema: {
            type: 'object',
            properties: {
                days: { type: 'number', description: 'Days to look back (default: 7)', default: 7 },
            },
        },
    },
    {
        name: 'ark_reset',
        description: 'Reset all state machines to initial state.',
        inputSchema: { type: 'object', properties: {} },
    },
];
function handleTool(name, args = {}) {
    switch (name) {
        case 'ark_check': {
            const actionName = String(args.name ?? '');
            const content = String(args.content ?? '');
            const type = String(args.type ?? 'tool_call');
            const result = ark.check(actionName, content, type);
            const layerInfo = result.layer ? ` [${result.layer}]` : '';
            const text = result.allowed
                ? `✅ ALLOWED: '${actionName}' passed all safety checks.`
                : `❌ BLOCKED${layerInfo}: '${actionName}' — ${result.reason ?? 'unknown'}${result.requires ? ` (requires: ${result.requires})` : ''}${result.approvalUrl ? `\n\n🌐 Approve directly: ${result.approvalUrl}` : ''}`;
            return { content: [{ type: 'text', text }], isError: !result.allowed };
        }
        // ark_approve handler REMOVED — no MCP approval path exists.
        case 'ark_status': {
            const summary = ark.summary();
            const states = ark.gate.getStates();
            const text = [
                '🛡️ n2-ark v3.0 Status',
                `Contracts: ${summary.contracts}`,
                `Blacklists: ${summary.blacklists}`,
                `Gates: ${summary.gates}`,
                `Total Patterns: ${summary.patterns}`,
                `Layers: constitutional=${summary.layers.constitutional}, general=${summary.layers.general}`,
                `States: ${JSON.stringify(states, null, 2)}`,
            ].join('\n');
            return { content: [{ type: 'text', text }] };
        }
        case 'ark_load_rules': {
            const rules = String(args.rules ?? '');
            ark.loadString(rules);
            const summary = ark.summary();
            return {
                content: [{
                        type: 'text',
                        text: `✅ Rules loaded (general layer). Total: ${summary.contracts} contracts, ${summary.blacklists} blacklists, ${summary.patterns} patterns.`,
                    }],
            };
        }
        case 'ark_stats': {
            const days = Number(args.days ?? 7);
            const stats = ark.stats(days);
            const text = [
                `📊 Audit Stats (${days} days)`,
                `Total Checks: ${stats.totalChecks}`,
                `Blocked: ${stats.blocked}`,
                `Passed: ${stats.passed}`,
                stats.topBlocked.length > 0
                    ? `Top Blocked: ${stats.topBlocked.map(b => `${b.rule}(${b.count})`).join(', ')}`
                    : '',
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
function handleMessage(msg) {
    const { id, method, params } = msg;
    switch (method) {
        case 'initialize':
            return {
                jsonrpc: JSONRPC_VERSION, id,
                result: {
                    protocolVersion: '2024-11-05',
                    serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
                    capabilities: { tools: {} },
                },
            };
        case 'notifications/initialized':
            return null;
        case 'tools/list':
            return { jsonrpc: JSONRPC_VERSION, id, result: { tools: TOOLS } };
        case 'tools/call': {
            const toolName = String(params?.name ?? '');
            const toolArgs = (params?.arguments ?? {});
            try {
                const result = handleTool(toolName, toolArgs);
                return { jsonrpc: JSONRPC_VERSION, id, result };
            }
            catch (e) {
                const msg = e instanceof Error ? e.message : String(e);
                return {
                    jsonrpc: JSONRPC_VERSION, id,
                    result: { content: [{ type: 'text', text: `Error: ${msg}` }], isError: true },
                };
            }
        }
        case 'ping':
            return { jsonrpc: JSONRPC_VERSION, id, result: {} };
        default:
            return {
                jsonrpc: JSONRPC_VERSION, id,
                error: { code: -32601, message: `Method not found: ${method}` },
            };
    }
}
// ── Stdio Transport ──
let buffer = '';
process.stdin.setEncoding('utf-8');
process.stdin.on('data', (chunk) => {
    buffer += chunk;
    let newlineIndex;
    while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);
        if (!line)
            continue;
        try {
            const msg = JSON.parse(line);
            const response = handleMessage(msg);
            if (response) {
                process.stdout.write(JSON.stringify(response) + '\n');
            }
        }
        catch {
            // Skip malformed messages
        }
    }
});
process.stdin.on('end', () => {
    ark.close();
    process.exit(0);
});
process.stderr.write(`[n2-ark] MCP Server v${SERVER_VERSION} started. Rules: ${rulesDir}\n`);
