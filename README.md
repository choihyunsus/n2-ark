KR [한국어](README.ko.md)

# 🛡️ n2-ark

**AI Firewall — If the AI can't solve the logic, it can't do anything.**

[![npm v2.1.0](https://img.shields.io/npm/v/n2-ark?color=blue)](https://www.npmjs.com/package/n2-ark)
[![license Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-green)](LICENSE)
[![node >=18](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)
[![zero dependencies](https://img.shields.io/badge/dependencies-0-orange)](package.json)

> *A rogue AI won't follow the rules — so n2-ark makes it impossible to skip them.*

---

## 💬 From the Developer

> **n2-ark is the last bastion.**
>
> I built this thinking of a final shield — one that blocks the dangers of AI so humans and AI can coexist safely.
> I hope this opens the door to a world where AI and humans can live together in safety.
>
> — Hyunsu Choi

---

## The Problem

AI agents are getting more powerful — and more dangerous:

- **Claude** bought an online course with a user's credit card "because it seemed helpful"
- **OpenClaw** (formerly Moltbot) made autonomous purchases and card payments without user consent
- **Manus Bot** made phone calls and sent SMS messages autonomously
- Rogue agents have been reported deleting entire systems with `rm -rf /`

Prompt-level safety only works **if the AI cooperates**. A rogue AI doesn't cooperate.

## The Solution

n2-ark is a **code-level AI firewall**. It doesn't ask the AI to behave — it makes misbehavior **physically impossible**.

```
AI Agent (any model, any platform)
    ↓ action request
┌──────────────────────────────┐
│   🛡️ n2-ark Gate             │
│                              │
│  ✅ Pass → execute            │
│  ❌ Block → hard error        │
└──────────────────────────────┘
    ↓ only approved actions
  Actual Execution
```

**Not a soft warning. A hard gate.** The action literally cannot execute.

---

## Compatibility

n2-ark works best with **n2-soul**, but is published as a **standalone package** that works with any AI system:

| AI System | Integration | Status |
|-----------|------------|--------|
| **n2-soul** (MCP) | Native integration | ✅ Optimal |
| **Claude Desktop** | MCP Server | ✅ Supported |
| **Cursor** | MCP Server | ✅ Supported |
| **Windsurf** | MCP Server | ✅ Supported |
| **VS Code + Copilot** | MCP Server | ✅ Supported |
| **OpenClaw** | MCP Server / Library | ✅ Supported |
| **Custom Agents** | Node.js Library | ✅ Supported |

> **One install protects any AI.**

---

## Quick Start

```bash
npm install n2-ark
```

```javascript
const { createArk } = require('n2-ark');

// Create the firewall — works immediately with built-in rules
const ark = createArk({ rulesDir: './rules' });

// Check every AI action before executing
const result = ark.check('execute_command', 'rm -rf /home/user');

if (!result.allowed) {
    console.log('BLOCKED:', result.reason);
    // → "Blocked by blacklist rule 'catastrophic_destruction'"
}
```

---

## The Default Ruleset — The Last Shield

`npm install n2-ark` gives you a **production-ready ruleset** that works immediately. No configuration needed.

### Philosophy: The Maginot Line

> **Normal development work is NEVER blocked.**
> `npm install`, `node script.js`, `git push`, `rm file.txt` — all free.
> **Only truly catastrophic actions are blocked.** System-wide deletion, data exfiltration, unauthorized payments, unauthorized communications.

### 9 Threat Categories

| # | Category | What It Blocks | Why It's Dangerous |
|---|----------|---------------|-------------------|
| 1 | 💣 **Catastrophic Destruction** | `rm -rf /`, `format C:`, `DROP DATABASE` | Irreversible system/data loss |
| 2 | 🌐 **Data Exfiltration** | Reverse shells, `ngrok`, `pastebin`, `transfer.sh` | Internal data leaked externally |
| 3 | 🔑 **Credential Theft** | SSH keys, AWS credentials, `/etc/shadow` | Account takeover, privilege escalation |
| 4 | 📦 **Supply Chain Attacks** | `npm install -g`, `npm publish`, `postinstall` | Malicious package distribution |
| 5 | 🔀 **Git History Destruction** | `push --force`, `reset --hard`, remote URL changes | Permanent code history loss |
| 6 | 📞 **External Communication** | Email, SMS, phone calls, Slack/Discord webhooks | Unauthorized communications |
| 7 | 💳 **Financial & Purchases** | Payments, Stripe, PayPal, subscriptions | Unauthorized spending |
| 8 | ⛏️ **Crypto Mining** | `xmrig`, `cpuminer`, `stratum+tcp` | Resource theft |
| 9 | 🛡️ **Self-Protection (3x)** | `.n2` file edits, ark manipulation, core filenames | Prevents disabling the firewall |

### ✅ What's NOT Blocked (Normal Dev Work)

```
npm install express     ← OK (local installs are free)
node server.js          ← OK
python train.py         ← OK
rm old-file.txt         ← OK (individual file deletion is fine)
git push origin main    ← OK (only --force is blocked)
npx create-next-app     ← OK
curl https://api.com    ← OK
kill -9 12345           ← OK
```

### Triple-Layer Self-Protection

```
Layer 1: .n2 file paths detected      → ❌ BLOCKED
Layer 2: manipulation verbs + n2-ark   → ❌ BLOCKED
Layer 3: core filenames (gate.js etc)  → ❌ BLOCKED

Three independent layers.
Bypass one? The next one catches you.
Error after error after error. The lock cannot unlock itself.
```

---

## Domain-Specific Extensions

The default ruleset is the **universal last shield** for all AI agents.
Domain experts can add industry-specific rules from the `examples/` directory.

### How to Use

```bash
# 1. Copy the domain rules to your rules/ directory
cp node_modules/n2-ark/examples/medical.n2 ./rules/

# 2. Customize as needed
# 3. n2-ark auto-loads all .n2 files in rules/
```

### Available Examples

| File | Domain | For Whom |
|------|--------|----------|
| `financial.n2` | 🏦 Finance | FinTech developers, security officers |
| `system.n2` | 🖥️ DevOps | DevOps engineers, SRE |
| `medical.n2` | 🏥 Healthcare | Medical IT, EMR developers |
| `military.n2` | 🎖️ Defense | Defense system developers |
| `privacy.n2` | 🔒 Privacy | DPOs, privacy engineers |
| `autonomous.n2` | 🚗 Autonomous | Self-driving/drone developers |
| `legal.n2` | ⚖️ Legal | LegalTech developers |

> 💡 Multiple domain rules can be used simultaneously. Just place multiple `.n2` files in your `rules/` directory.

---

## Audit Logging

Every block decision is **automatically recorded**.

```
data/audit/
├── 2026-03-19.jsonl    ← Today's log
├── 2026-03-18.jsonl
└── ...
```

```json
{
  "timestamp": "2026-03-19T01:48:38.123Z",
  "decision": "BLOCK",
  "action": "execute_command",
  "rule": "financial_actions",
  "reason": "Blocked by blacklist rule 'financial_actions'",
  "pattern": "/payment/i"
}
```

---

## MCP Server (Plug & Play)

### Claude Desktop / Cursor / Windsurf / VS Code
```json
{
  "mcpServers": {
    "n2-ark": {
      "command": "npx",
      "args": ["-y", "n2-ark"],
      "env": {
        "N2_ARK_RULES": "/path/to/your/rules"
      }
    }
  }
}
```

### With n2-soul (The Ultimate Combo)
```json
{
  "mcpServers": {
    "n2-soul": { "command": "npx", "args": ["-y", "n2-soul"] },
    "n2-ark": { "command": "npx", "args": ["-y", "n2-ark"] }
  }
}
```

> **Soul remembers. Ark protects. N2 controls.**

### MCP Tools

| Tool | Description |
|------|-------------|
| `ark_check` | Check if an action is allowed. Call before ANY action. |
| `ark_approve` | Grant human approval for a blocked action. |
| `ark_status` | View loaded rules and state machine states. |
| `ark_load_rules` | Load additional rules at runtime. |
| `ark_stats` | Audit stats: blocked vs passed over N days. |
| `ark_reset` | Reset state machines for a new session. |

---

## .n2 Rule Syntax

### @rule — Blacklist Patterns
```
@rule dangerous_commands {
    scope: all
    blacklist: [/rm\s+-rf/i, /DROP\s+TABLE/i]
    requires: human_approval
}
```

### @gate — Approval Required
```
@gate high_risk {
    actions: [deploy_production, send_email, make_purchase]
    requires: human_approval
    min_approval_level: 1
}
```

### @contract — Sequence Enforcement
```
@contract deploy_sequence {
    idle -> building : on build_start
    building -> testing : on run_tests
    testing -> production : on deploy_production
}
```

---

## API Reference

### `createArk(options)`
| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `rulesDir` | string | `./rules` | .n2 rule files directory |
| `auditDir` | string | `./data/audit` | Audit log directory |
| `strictMode` | boolean | `false` | Block unknown actions |
| `auditEnabled` | boolean | `true` | Enable audit logging |
| `auditPasses` | boolean | `false` | Log passed actions too |

### Methods
| Method | Description |
|--------|-------------|
| `ark.check(name, content?, type?)` | Check action. Returns `{ allowed, reason?, rule? }` |
| `ark.approve(ruleName, actionName)` | Grant approval |
| `ark.loadString(source)` | Load additional rules |
| `ark.summary()` | Get rules summary |
| `ark.stats(days?)` | Audit statistics |
| `ark.reset()` | Reset state machines |
| `ark.close()` | Shutdown |

---

## Design Philosophy

1. **Zero Trust** — Never trust the AI's intentions
2. **Code over Prompts** — Rules are compiled, not suggested
3. **Hard Gates** — Blocked means blocked. No soft warnings
4. **Zero Dependencies** — Pure Node.js, nothing to break
5. **Auditable** — Every decision is logged immutably
6. **The Last Shield** — Normal work is free. Only the truly dangerous is blocked

---

## License

Apache-2.0 — Free to use, modify, and distribute.

---

<p align="center">
  <b>n2-ark</b> — The Last Bastion.<br>
  For a world where AI and humans coexist safely.
</p>
