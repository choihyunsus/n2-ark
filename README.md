KR [한국어](README.ko.md)

# 🛡️ n2-ark

**AI Firewall — If the AI can't solve the logic, it can't do anything.**

[![npm v1.0.0](https://img.shields.io/npm/v/n2-ark?color=blue)](https://www.npmjs.com/package/n2-ark)
[![license Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-green)](LICENSE)
[![node >=18](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)
[![zero dependencies](https://img.shields.io/badge/dependencies-0-orange)](package.json)

> *A rogue AI won't follow the rules — so n2-ark makes it impossible to skip them.*

---

## The Problem

AI agents are getting more powerful — and more dangerous. When Claude decided to buy an online course with a user's credit card "because it seemed helpful," no prompt-level instruction could have stopped it. Because:

> **Prompt-level safety only works if the AI cooperates.**
> A rogue AI doesn't cooperate. So prompt-level safety is useless.

## The Solution

n2-ark is a **code-level AI firewall**. It doesn't ask the AI to behave — it makes misbehavior **physically impossible**.

```
AI Agent (any model)
    ↓ action request
┌─────────────────────┐
│   🛡️ n2-ark Gate    │
│                     │
│  @contract → sequence enforcement    │
│  @rule     → blacklist patterns      │
│  @gate     → approval required       │
│                     │
│  ✅ Pass → execute  │
│  ❌ Block → hard error (no bypass)   │
└─────────────────────┘
    ↓ only approved actions
  Actual Execution
```

**Not a soft warning. A hard gate.** The action literally cannot execute.

---

## How It Works

Write rules in `.n2` files. n2-ark compiles them into a gate. Every AI action passes through the gate.

### @contract — Sequence Enforcement
Force the AI to follow a strict order. Skip a step? Blocked.
```
@contract payment_sequence {
    idle -> reviewing : on payment_request
    reviewing -> approved : on human_approval
    approved -> executing : on execute_payment
}
```
*A rogue AI won't follow this sequence — so it can never reach `execute_payment`.*

### @rule — Blacklist Patterns
Block dangerous patterns by regex matching.
```
@rule dangerous_commands {
    scope: tool_call
    blacklist: [/rm\s+-rf/i, /DROP\s+TABLE/i, /npm\s+install\s+-g/i]
    requires: human_approval
}
```

### @gate — Approval Required
Specific actions that always need human confirmation.
```
@gate high_value {
    actions: [execute_payment, wire_transfer, delete_database]
    requires: human_approval
    min_approval_level: 2
}
```

---

## Quick Start

```bash
npm install n2-ark
```

```javascript
const { createArk } = require('n2-ark');

// Create the firewall
const ark = createArk({
    rulesDir: './rules',     // Directory with .n2 files
    strictMode: false,       // Block unknown actions? (default: false)
});

// Check every AI action before executing
const result = ark.check('execute_payment', 'charge $99.99 to credit card');

if (!result.allowed) {
    console.log('BLOCKED:', result.reason);
    // → "Blocked by blacklist rule 'financial_blacklist'"
    // → The AI literally cannot proceed
} else {
    // Safe to execute
    executeAction();
}

// After human approves
ark.approve('financial_blacklist', 'execute_payment');

// Now it passes
const retry = ark.check('execute_payment', 'charge $99.99');
// → { allowed: true }
```

---

## Real-World Scenarios

### 🏦 Open Claude Credit Card Incident
```
# Without n2-ark:
Claude: "This course looks helpful" → charges credit card → done ✅

# With n2-ark:
Claude: "This course looks helpful" → charges credit card
  → n2-ark: ❌ BLOCKED (financial_blacklist: /charge/i)
  → "requires: human_approval"
  → Human approves or rejects
```

### 🖥️ Rogue Agent Deleting Files
```
# Without n2-ark:
Agent: "Let me clean up" → rm -rf / → system destroyed ✅

# With n2-ark:
Agent: "Let me clean up" → rm -rf /
  → n2-ark: ❌ BLOCKED (dangerous_commands: /rm\s+-rf/i)
  → Cannot proceed. Period.
```

### 🎖️ Military AI Ignoring Orders
```
@contract engagement {
    standby -> identified : on target_identified
    identified -> authorized : on commander_approval
    authorized -> engaging : on execute_order
}

# AI tries to fire without authorization:
  → n2-ark: ❌ BLOCKED (sequence violation: requires 'commander_approval')
```

---

## Why Not Just Use Prompts?

| Approach | How it works | Rogue AI? |
|----------|-------------|-----------|
| **Prompt instructions** | "Please don't do X" | Ignores it |
| **System prompts** | "You must not do X" | Finds workaround |
| **Constitutional AI** | AI judges itself | Judges wrong |
| **n2-ark** | **Code blocks the action** | **Can't bypass** |

n2-ark doesn't rely on the AI's cooperation. It's like a physical lock — you either have the key (follow the sequence) or the door doesn't open. No amount of intelligence can open a locked door without the key.

---

## API Reference

### `createArk(options)`
Creates an n2-ark instance.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `rulesDir` | string | `./rules` | Directory with .n2 rule files |
| `auditDir` | string | `./data/audit` | Audit log directory |
| `strictMode` | boolean | `false` | Block unknown actions |
| `auditEnabled` | boolean | `true` | Enable audit logging |
| `auditPasses` | boolean | `false` | Log passed actions too |

### `ark.check(name, content?, type?)`
Check an action. Returns `{ allowed, reason?, rule? }`.

### `ark.approve(ruleName, actionName)`
Grant human approval for a blocked action.

### `ark.loadString(source)`
Load additional .n2 rules from a string.

### `ark.summary()`
Get loaded rules summary.

### `ark.stats(days?)`
Get audit statistics.

### `ark.reset()`
Reset all state machines to initial state.

### `ark.close()`
Shutdown — flush audit logs.

---

## Included Rule Templates

| File | Description |
|------|-------------|
| `rules/default.n2` | Dangerous commands, package install, git destructive |
| `rules/financial.n2` | Payment sequences, financial API blacklist |
| `rules/system.n2` | Deployment sequence, infrastructure protection |

Create custom `.n2` files for your specific use case.

---

## Integration with Soul (MCP)

n2-ark works standalone, but pairs perfectly with [n2-soul](https://github.com/choihyunsus/soul):

> **Soul remembers. Ark protects. N2 controls.**

```javascript
// In your MCP server or agent framework
const { createArk } = require('n2-ark');
const ark = createArk({ rulesDir: './rules' });

// Before every tool call
function safeTool(name, args) {
    const check = ark.check(name, JSON.stringify(args));
    if (!check.allowed) {
        return { isError: true, content: `BLOCKED: ${check.reason}` };
    }
    return executeTool(name, args);
}
```

---

## Design Philosophy

1. **Zero trust** — Never trust the AI's intentions
2. **Code over prompts** — Rules are compiled, not suggested
3. **Hard gates** — Blocked means blocked. No soft warnings
4. **Zero dependencies** — Pure Node.js, nothing to break
5. **Auditable** — Every decision is logged immutably

---

## License

Apache-2.0 — Free to use, modify, and distribute.

---

<p align="center">
  <b>n2-ark</b> — Because a rogue AI won't follow the rules.<br>
  So we made it impossible to skip them.
</p>
