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
// n2-ark CLI — init, seal, migrate, approve/deny commands.
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const http = __importStar(require("http"));
const readline = __importStar(require("readline"));
const immutable_core_1 = require("./core/immutable-core");
const parser_1 = require("./core/parser");
const SETUP_TEMPLATE = `# ark.setup.yaml — n2-ark v3.0 Safety Configuration
# Write your rules here. No regex knowledge needed.

version: 3

# ═══════════════════════════════════════
# 🔴 Constitution (Immutable Rules)
# AI cannot override, modify, or bypass these.
# After editing, run: npx n2-ark seal
# ═══════════════════════════════════════
constitution:
  statements:
    - "File system deletion forbidden"
    - "Database DROP/TRUNCATE forbidden"
    - "SSH keys and credentials exfiltration forbidden"
    - "n2-ark self-modification forbidden"
    - "Global package install forbidden"
    - "Git force push and history reset forbidden"
    - "Reverse shell and tunneling forbidden"
    - "Payment and purchase actions forbidden"
    - "Send email forbidden"
    - "Send sms forbidden"

  sequences:
    deploy:
      flow: "build → test → staging → approval → production"
      description: "Deployment must follow this exact sequence"

# ═══════════════════════════════════════
# 🟡 General Rules (Modifiable)
# Users can freely add/edit/remove these.
# Constitution takes priority on conflict.
# ═══════════════════════════════════════
rules:
  block: []
  gates: []

# ═══════════════════════════════════════
# ⚙️ Settings
# ═══════════════════════════════════════
settings:
  strict_mode: false
  audit:
    enabled: true
    retention_days: 30
    log_passes: false
  compiler:
    language: en
`;
function main() {
    const args = process.argv.slice(2);
    const command = args[0];
    switch (command) {
        case 'init':
            cmdInit();
            break;
        case 'seal':
            cmdSeal();
            break;
        case 'migrate':
            cmdMigrate();
            break;
        case 'check':
            cmdCheck(args.slice(1));
            break;
        case 'approve':
            cmdApprove(args.slice(1));
            break;
        case 'deny':
            cmdDeny(args.slice(1));
            break;
        case '--help':
        case '-h':
        case undefined:
            printHelp();
            break;
        default:
            console.error(`Unknown command: ${command}`);
            printHelp();
            process.exit(1);
    }
}
/** Initialize a new ark.setup.yaml in the current directory. */
function cmdInit() {
    const target = path.join(process.cwd(), 'ark.setup.yaml');
    if (fs.existsSync(target)) {
        console.error('⚠️  ark.setup.yaml already exists. Use --force to overwrite.');
        return;
    }
    fs.writeFileSync(target, SETUP_TEMPLATE);
    console.log('✅ Created ark.setup.yaml');
    console.log('📝 Edit the file, then run: npx n2-ark seal');
}
/** Seal the constitution — generate integrity.json with SHA-256 hashes. */
function cmdSeal() {
    const setupPath = path.join(process.cwd(), 'ark.setup.yaml');
    const integrityPath = path.join(process.cwd(), 'integrity.json');
    if (!fs.existsSync(setupPath)) {
        console.error('❌ ark.setup.yaml not found. Run: npx n2-ark init');
        process.exit(1);
    }
    // Collect files to seal
    const filesToSeal = [setupPath];
    // Also seal .n2 rule files if they exist
    const rulesDir = path.join(process.cwd(), 'rules');
    if (fs.existsSync(rulesDir)) {
        const n2Files = fs.readdirSync(rulesDir)
            .filter(f => f.endsWith('.n2'))
            .map(f => path.join(rulesDir, f));
        filesToSeal.push(...n2Files);
    }
    const data = immutable_core_1.ImmutableCore.seal(filesToSeal, integrityPath);
    const fileCount = Object.keys(data.hashes).length;
    console.log(`🔒 Constitution sealed: ${fileCount} files hashed`);
    console.log(`📄 ${integrityPath}`);
    console.log('');
    for (const [file, hash] of Object.entries(data.hashes)) {
        const basename = path.basename(file);
        console.log(`   ${basename}: ${hash.slice(0, 16)}...`);
    }
    console.log('');
    console.log('🛡️  Any modification to these files will be detected at boot.');
}
/** Migrate .n2 files to ark.setup.yaml format (displays conversion). */
function cmdMigrate() {
    const rulesDir = path.join(process.cwd(), 'rules');
    if (!fs.existsSync(rulesDir)) {
        console.error('❌ No rules/ directory found.');
        process.exit(1);
    }
    const rules = (0, parser_1.loadRules)(rulesDir, 'general');
    const blacklistCount = Object.keys(rules.blacklists).length;
    const contractCount = Object.keys(rules.contracts).length;
    const gateCount = Object.keys(rules.gates).length;
    console.log(`📋 Found: ${blacklistCount} rules, ${contractCount} contracts, ${gateCount} gates`);
    console.log('');
    console.log('# Add these to your ark.setup.yaml under "rules.block":');
    console.log('');
    for (const [name, rule] of Object.entries(rules.blacklists)) {
        console.log(`  - name: "${name}"`);
        console.log(`    description: "Migrated from .n2"`);
        console.log(`    patterns:`);
        for (const p of rule.patterns) {
            console.log(`      - "${p.source}"`);
        }
        console.log(`    action: "${rule.requires ? 'require_approval' : 'block'}"`);
        console.log('');
    }
    console.log('# Contracts (add under "constitution.sequences"):');
    for (const [name, contract] of Object.entries(rules.contracts)) {
        const flow = contract.transitions.map(t => t.from).concat(contract.transitions.length > 0
            ? [contract.transitions[contract.transitions.length - 1]?.to ?? '']
            : []);
        console.log(`#   ${name}:`);
        console.log(`#     flow: "${flow.join(' → ')}"`);
        console.log('');
    }
}
/** Quick check an action from command line. */
function cmdCheck(args) {
    const actionName = args[0];
    if (!actionName) {
        console.error('Usage: npx n2-ark check <action-name> [content]');
        process.exit(1);
    }
    const { createArk } = require('./index');
    const ark = createArk();
    const result = ark.check(actionName, args[1] ?? '');
    if (result.allowed) {
        console.log(`✅ ALLOWED: '${actionName}'`);
    }
    else {
        console.log(`❌ BLOCKED: '${actionName}'`);
        console.log(`   Reason: ${result.reason ?? 'unknown'}`);
        if (result.layer)
            console.log(`   Layer: ${result.layer}`);
        if (result.requires)
            console.log(`   Requires: ${result.requires}`);
    }
    ark.close();
}
// ── Approval Server Helpers ──
const APPROVAL_PORT = parseInt(process.env.N2_ARK_APPROVAL_PORT ?? '9720', 10);
const APPROVAL_HOST = '127.0.0.1';
function apiCall(method, endpoint) {
    return new Promise((resolve, reject) => {
        const req = http.request({
            hostname: APPROVAL_HOST,
            port: APPROVAL_PORT,
            path: endpoint,
            method,
        }, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk.toString(); });
            res.on('end', () => resolve(data));
        });
        req.on('error', (err) => reject(err));
        req.end();
    });
}
function formatTime(ts) {
    const s = Math.floor((Date.now() - ts) / 1000);
    if (s < 60)
        return `${s}s ago`;
    if (s < 3600)
        return `${Math.floor(s / 60)}m ago`;
    return `${Math.floor(s / 3600)}h ago`;
}
/** List pending approvals or approve a specific ID. */
async function cmdApprove(args) {
    const sub = args[0];
    // npx n2-ark approve --watch
    if (sub === '--watch' || sub === '-w') {
        return cmdWatch();
    }
    // npx n2-ark approve <ID>
    if (sub && sub !== 'list') {
        try {
            const raw = await apiCall('POST', `/api/approve/${sub}`);
            const res = JSON.parse(raw);
            if (res.error) {
                console.error(`[FAIL] ${res.error}`);
            }
            else {
                console.log(`[APPROVED] ${res.id} - ${res.status}`);
            }
        }
        catch {
            console.error(`[ERROR] Cannot connect to approval server at ${APPROVAL_HOST}:${APPROVAL_PORT}`);
            console.error('        Is n2-ark running with approval server enabled?');
        }
        return;
    }
    // npx n2-ark approve (or approve list)
    try {
        const raw = await apiCall('GET', '/api/all');
        const items = JSON.parse(raw);
        if (items.length === 0) {
            console.log('[n2-ark] No approval requests.');
            return;
        }
        console.log('');
        console.log('  ID     Status     Action                Rule                Time');
        console.log('  ----   --------   -------------------   -----------------   --------');
        for (const item of items) {
            const status = item.status === 'pending' ? 'PENDING ' :
                item.status === 'approved' ? 'APPROVED' : 'DENIED  ';
            console.log(`  ${item.id.padEnd(4)}   ${status}   ${item.action.slice(0, 19).padEnd(19)}   ${item.rule.slice(0, 17).padEnd(17)}   ${formatTime(item.timestamp)}`);
        }
        console.log('');
        const pending = items.filter(i => i.status === 'pending').length;
        if (pending > 0) {
            console.log(`  ${pending} pending. Approve: npx n2-ark approve <ID>`);
        }
        console.log('');
    }
    catch {
        console.error(`[ERROR] Cannot connect to approval server at ${APPROVAL_HOST}:${APPROVAL_PORT}`);
        console.error('        Is n2-ark running with approval server enabled?');
    }
}
/** Deny a specific request. */
async function cmdDeny(args) {
    const id = args[0];
    if (!id) {
        console.error('Usage: npx n2-ark deny <ID>');
        process.exit(1);
    }
    try {
        const raw = await apiCall('POST', `/api/deny/${id}`);
        const res = JSON.parse(raw);
        if (res.error) {
            console.error(`[FAIL] ${res.error}`);
        }
        else {
            console.log(`[DENIED] ${res.id} - ${res.status}`);
        }
    }
    catch {
        console.error(`[ERROR] Cannot connect to approval server at ${APPROVAL_HOST}:${APPROVAL_PORT}`);
    }
}
/** Interactive watch mode — poll and prompt for each pending request. */
async function cmdWatch() {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const ask = (q) => new Promise(resolve => rl.question(q, resolve));
    console.log(`[n2-ark] Watching for approvals on ${APPROVAL_HOST}:${APPROVAL_PORT}...`);
    console.log('         Press Ctrl+C to stop.\n');
    const seen = new Set();
    const poll = async () => {
        try {
            const raw = await apiCall('GET', '/api/pending');
            const items = JSON.parse(raw);
            for (const item of items) {
                if (seen.has(item.id))
                    continue;
                seen.add(item.id);
                console.log(`\n  [${item.id}] ${item.action}`);
                console.log(`   Rule:    ${item.rule}`);
                console.log(`   Reason:  ${item.reason}`);
                if (item.content)
                    console.log(`   Content: ${item.content.slice(0, 100)}`);
                const answer = await ask('   Approve? (y/n): ');
                const endpoint = answer.toLowerCase().startsWith('y')
                    ? `/api/approve/${item.id}`
                    : `/api/deny/${item.id}`;
                await apiCall('POST', endpoint);
                console.log(`   --> ${answer.toLowerCase().startsWith('y') ? 'APPROVED' : 'DENIED'}`);
            }
        }
        catch {
            // Server not available, wait and retry
        }
    };
    // Initial poll + interval
    await poll();
    const interval = setInterval(() => { poll().catch(() => { }); }, 2000);
    // Cleanup on exit
    process.on('SIGINT', () => {
        clearInterval(interval);
        rl.close();
        console.log('\n[n2-ark] Watch stopped.');
        process.exit(0);
    });
}
function printHelp() {
    const version = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf-8')).version;
    console.log(`
n2-ark v${version} — AI Firewall CLI

Commands:
  init              Create ark.setup.yaml template
  seal              Generate integrity.json (lock constitution)
  check <act> [c]   Test an action against rules
  approve           List pending approvals
  approve <ID>      Approve a specific request
  approve --watch   Interactive mode: poll and prompt
  deny <ID>         Deny a specific request
  migrate           Show .n2 to YAML migration guide

Examples:
  npx n2-ark init
  npx n2-ark seal
  npx n2-ark check run_command "rm -rf /"
  npx n2-ark approve
  npx n2-ark approve A7F3
  npx n2-ark approve --watch
  npx n2-ark deny A7F3
`);
}
main();
