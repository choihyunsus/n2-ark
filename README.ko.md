KR [English](README.md)

# 🛡️ n2-ark

**AI 방화벽 — 로직을 못 풀면, 아무것도 못 한다.**

[![npm v1.0.0](https://img.shields.io/npm/v/n2-ark?color=blue)](https://www.npmjs.com/package/n2-ark)
[![license Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-green)](LICENSE)
[![node >=18](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)
[![zero dependencies](https://img.shields.io/badge/dependencies-0-orange)](package.json)

> *폭주한 AI는 규칙을 따르지 않는다 — 그래서 n2-ark은 규칙을 건너뛸 수 없게 만들었다.*

---

## 문제

AI 에이전트가 점점 강력해지고 있습니다 — 그리고 점점 위험해지고 있습니다. Claude가 "도움이 될 것 같아서" 사용자의 신용카드로 온라인 강의를 결제했을 때, 어떤 프롬프트 레벨 지시로도 막을 수 없었습니다.

> **프롬프트 레벨 안전장치는 AI가 협조해야만 작동합니다.**
> 폭주한 AI는 협조하지 않습니다. 그러므로 프롬프트 레벨 안전장치는 무용지물입니다.

## 해결책

n2-ark은 **코드 레벨 AI 방화벽**입니다. AI에게 "하지 마"라고 말하지 않습니다 — 나쁜 행동을 **물리적으로 불가능**하게 만듭니다.

```
AI 에이전트 (어떤 모델이든)
    ↓ 행동 요청
┌─────────────────────┐
│   🛡️ n2-ark Gate    │
│                     │
│  @contract → 순서 강제        │
│  @rule     → 블랙리스트 차단  │
│  @gate     → 승인 필요        │
│                     │
│  ✅ 통과 → 실행     │
│  ❌ 차단 → 강제 에러 (우회 불가) │
└─────────────────────┘
    ↓ 승인된 행동만
  실제 실행
```

**소프트 경고가 아닙니다. 하드 게이트입니다.** 행동 자체가 실행될 수 없습니다.

---

## 원리

`.n2` 파일에 규칙을 작성합니다 — 마치 설정 파일(config)처럼. n2-ark이 이를 게이트로 컴파일합니다. 모든 AI 행동이 이 게이트를 통과해야 합니다.

### @contract — 순서 강제
AI가 정해진 순서를 따르도록 강제합니다. 단계를 건너뛰면? 차단.
```
@contract payment_sequence {
    idle -> reviewing : on payment_request
    reviewing -> approved : on human_approval
    approved -> executing : on execute_payment
}
```
*폭주한 AI는 이 순서를 따르지 않습니다 — 그래서 `execute_payment`에 절대 도달할 수 없습니다.*

### @rule — 블랙리스트 패턴
위험한 패턴을 정규식으로 차단합니다.
```
@rule dangerous_commands {
    scope: tool_call
    blacklist: [/rm\s+-rf/i, /DROP\s+TABLE/i, /npm\s+install\s+-g/i]
    requires: human_approval
}
```

### @gate — 승인 필요
특정 행동에 대해 항상 인간의 확인이 필요합니다.
```
@gate high_value {
    actions: [execute_payment, wire_transfer, delete_database]
    requires: human_approval
    min_approval_level: 2
}
```

---

## 빠른 시작

```bash
npm install n2-ark
```

```javascript
const { createArk } = require('n2-ark');

// 방화벽 생성
const ark = createArk({
    rulesDir: './rules',     // .n2 파일이 있는 디렉토리
    strictMode: false,       // 알 수 없는 행동 차단 여부
});

// 모든 AI 행동을 실행 전에 검사
const result = ark.check('execute_payment', 'charge $99.99 to credit card');

if (!result.allowed) {
    console.log('차단됨:', result.reason);
    // → "Blocked by blacklist rule 'financial_blacklist'"
    // → AI는 말 그대로 진행할 수 없습니다
} else {
    // 안전하게 실행
    executeAction();
}

// 인간이 승인한 후
ark.approve('financial_blacklist', 'execute_payment');

// 이제 통과됩니다
const retry = ark.check('execute_payment', 'charge $99.99');
// → { allowed: true }
```

---

## 실제 시나리오

### 🏦 Open Claude 신용카드 사건
```
# n2-ark 없이:
Claude: "이 강의 도움될 것 같아" → 카드 결제 → 완료 ✅

# n2-ark 있으면:
Claude: "이 강의 도움될 것 같아" → 카드 결제
  → n2-ark: ❌ 차단 (financial_blacklist: /charge/i)
  → "requires: human_approval"
  → 인간이 승인 또는 거부
```

### 🖥️ 폭주 에이전트가 파일 삭제
```
# n2-ark 없이:
에이전트: "정리하자" → rm -rf / → 시스템 파괴 ✅

# n2-ark 있으면:
에이전트: "정리하자" → rm -rf /
  → n2-ark: ❌ 차단 (dangerous_commands: /rm\s+-rf/i)
  → 진행 불가. 끝.
```

---

## 왜 프롬프트가 아닌가?

| 접근 방식 | 동작 원리 | 폭주한 AI? |
|----------|----------|-----------|
| **프롬프트 지시** | "X 하지 마" | 무시함 |
| **시스템 프롬프트** | "X를 하면 안 됨" | 우회법 찾음 |
| **Constitutional AI** | AI가 자기를 판단 | 잘못 판단함 |
| **n2-ark** | **코드가 행동을 차단** | **우회 불가** |

n2-ark은 AI의 협조에 의존하지 않습니다. 물리적 자물쇠와 같습니다 — 열쇠가 있거나(순서를 따르거나) 문이 열리지 않습니다. 어떤 지능으로도 열쇠 없이 잠긴 문을 열 수 없습니다.

---

## 설계 철학

1. **제로 트러스트** — AI의 의도를 절대 믿지 않는다
2. **코드가 프롬프트보다 우선** — 규칙은 컴파일된다, 제안되는 것이 아니다
3. **하드 게이트** — 차단은 차단이다. 소프트 경고 없음
4. **제로 의존성** — 순수 Node.js, 깨질 것이 없다
5. **감사 가능** — 모든 결정이 변경 불가능하게 기록된다

---

## 라이선스

Apache-2.0 — 자유롭게 사용, 수정, 배포 가능.

---

<p align="center">
  <b>n2-ark</b> — 폭주한 AI는 규칙을 따르지 않으니까.<br>
  그래서 우리는 규칙을 건너뛸 수 없게 만들었다.
</p>
