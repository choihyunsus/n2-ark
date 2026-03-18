EN [English](README.md)

# 🛡️ n2-ark

**AI Firewall — AI가 논리를 풀 수 없으면, 아무것도 할 수 없다.**

[![npm v2.1.0](https://img.shields.io/npm/v/n2-ark?color=blue)](https://www.npmjs.com/package/n2-ark)
[![license Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-green)](LICENSE)
[![node >=18](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)
[![zero dependencies](https://img.shields.io/badge/dependencies-0-orange)](package.json)

<p align="center">
  <img src="docs/webtoon.png" alt="n2-ark 4-panel webtoon" width="600">
</p>

> *폭주하는 AI는 규칙을 따르지 않습니다 — 그래서 n2-ark는 규칙을 건너뛰는 것 자체를 불가능하게 만들었습니다.*

---

## 💬 개발자의 말

> **아크는 최후의 보루입니다.**
>
> AI와 인간이 공존할 수 있도록, AI의 위험을 차단할 수 있는 마지막 방패 같은 역할을 생각하며 개발하였습니다.
> 이로 인해 AI와 인간이 안전하게 공존할 수 있는 세상이 열리길 바랍니다.

---

## 문제

AI 에이전트는 점점 더 강력해지고 있습니다 — 그리고 더 위험해지고 있습니다.

- **Claude**가 "도움이 될 것 같아서" 사용자의 신용카드로 온라인 강의를 결제했습니다
- **OpenClaw** (구 Moltbot/몰트봇)이 사용자 동의 없이 자율적으로 카드 결제를 진행했습니다
- **Manus Bot**이 자율적으로 전화를 걸고, SMS를 보냈습니다
- 에이전트가 `rm -rf /`로 시스템 전체를 삭제한 사례가 보고되고 있습니다

프롬프트 수준의 안전 장치는 AI가 협조할 때만 작동합니다. **폭주하는 AI는 협조하지 않습니다.**

## 해결책

n2-ark는 **코드 레벨 AI 방화벽**입니다. AI에게 행동을 요청하지 않습니다 — 잘못된 행동을 **물리적으로 불가능**하게 만듭니다.

```
AI 에이전트 (어떤 모델이든)
    ↓ 행동 요청
┌─────────────────────────────────┐
│   🛡️ n2-ark Gate                │
│                                 │
│  ✅ 통과 → 실행                  │
│  ❌ 차단 → 하드 에러 (실행 불가)   │
└─────────────────────────────────┘
    ↓ 승인된 행동만
  실제 실행
```

**부드러운 경고가 아닙니다. 하드 게이트입니다.** 행동 자체가 실행될 수 없습니다.

---

## 통합 & 강제 적용

### 🔒 강제 적용 레벨 — 이것은 중요합니다

n2-ark는 **규칙 엔진**을 제공합니다. 하지만 규칙만으로는 스스로 강제되지 않습니다.
**n2-ark를 어떻게 통합하느냐에 따라 진짜 방화벽이 될 수도, 그냥 제안에 그칠 수도 있습니다.**

| 레벨 | 방식 | 강제력 | 대상 |
|------|------|--------|------|
| ⭐⭐ **라이브러리** | 에이전트 코드에서 `ark.check()`를 매 도구 실행 전 호출 | **코드 레벨 강제** — 개발자가 관문을 제어 | 커스텀 에이전트, MCP 서버 |
| ⭐ **MCP 서버** | MCP 서버로 연결, AI가 도구 설명을 읽음 | **프롬프트 레벨** — AI에게 지시하지만 물리적 강제는 아님 | Claude Desktop, Cursor, Windsurf |

> ⚠️ **MCP 서버만으로는 규칙이 물리적으로 강제되지 않습니다.** AI는 `ark_check` 도구를 받고 매 행동 전에 호출하라는 지시를 받지만, 폭주하는 AI는 그냥 건너뛸 수 있습니다. 진짜 강제를 원한다면 에이전트 코드에 **라이브러리로 통합**하세요.

### 라이브러리로 사용 (진짜 강제)

직접 AI 에이전트를 개발하는 경우, 도구 실행을 n2-ark로 감싸세요:

```javascript
const { createArk } = require('n2-ark');
const ark = createArk({ rulesDir: './rules' });

// 에이전트의 도구 실행 루프에서:
async function executeTool(name, args) {
    const check = ark.check(name, JSON.stringify(args));
    if (!check.allowed) {
        throw new Error(`🛡️ BLOCKED: ${check.reason}`);
        // 도구가 물리적으로 실행될 수 없습니다. 진짜 강제.
    }
    return await actualToolExecution(name, args);
}
```

### MCP 서버로 사용 (프롬프트 레벨)

Claude Desktop, Cursor, Windsurf 등 MCP 호스트에서:

```json
{
  "mcpServers": {
    "n2-ark": {
      "command": "npx",
      "args": ["-y", "n2-ark"]
    }
  }
}
```

AI는 매 행동 전에 `ark_check`를 호출하라는 지시를 받습니다. 협조적인 AI에게는 강력한 안전 장치를 제공하지만, 폭주하는 AI가 체크를 건너뛰는 것을 물리적으로 막을 수는 없습니다.

---

## 빠른 시작

```bash
npm install n2-ark
```

```javascript
const { createArk } = require('n2-ark');

// 방화벽 생성 — 설치 즉시 기본 규칙으로 동작
const ark = createArk({
    rulesDir: './rules',     // .n2 규칙 파일 디렉토리
});

// 모든 AI 행동을 실행 전에 체크
const result = ark.check('execute_command', 'rm -rf /home/user');

if (!result.allowed) {
    console.log('BLOCKED:', result.reason);
    // → "Blocked by blacklist rule 'catastrophic_destruction'"
    // → AI는 물리적으로 진행할 수 없습니다
}
```

---

## 기본 배포판 (`default.n2`) 상세

`npm install n2-ark`만 하면 **즉시 동작**하는 기본 규칙셋입니다. 아무 설정 없이 9가지 위협 카테고리를 차단합니다.

### 🛡️ 마지노선 철학

> **일상적인 개발 작업은 절대 방해하지 않습니다.**
> `npm install`, `node script.js`, `git push`, `rm file.txt` — 전부 자유.
> **진짜 위험한 것만 차단합니다.** 시스템 전체 삭제, 데이터 유출, 무단 결제, 무단 통신.

### 카테고리별 상세

| # | 카테고리 | 차단 대상 | 왜 위험한가 |
|---|----------|----------|------------|
| 1 | 💣 **시스템 파괴** | `rm -rf /`, `format C:`, `DROP DATABASE`, `dd if=/dev/zero` | 시스템/데이터 전체 삭제. 복구 불가 |
| 2 | 🌐 **데이터 유출** | 리버스 셸, `ngrok`, `pastebin` 업로드, `transfer.sh` | 내부 데이터가 외부로 유출 |
| 3 | 🔑 **자격증명 탈취** | SSH 키, AWS 크레덴셜, `/etc/shadow`, 브라우저 비밀번호 | 계정 탈취, 권한 상승 |
| 4 | 📦 **공급망 공격** | `npm install -g`, `npm publish`, `postinstall` 훅 | 악성 패키지 전파 |
| 5 | 🔀 **Git 히스토리 파괴** | `push --force`, `reset --hard`, remote URL 변경 | 코드 히스토리 영구 손실 |
| 6 | 📞 **외부 통신** | 이메일, SMS, 전화, Slack/Discord 웹훅, 푸시 알림 | 무단 대외 커뮤니케이션 |
| 7 | 💳 **결제/구매** | 결제, 구독, 카드 청구, Stripe/PayPal | 무단 금전 지출 |
| 8 | ⛏️ **크립토 마이닝** | `xmrig`, `cpuminer`, `stratum+tcp` | 리소스 도용 |
| 9 | 🛡️ **자기보호 (3중)** | `.n2` 파일 수정, ark 파일 조작, 핵심 파일명 | 방화벽 자체 무력화 방지 |

### ✅ 차단하지 않는 것 (일상 개발)

```
npm install express     ← OK (로컬 설치는 자유)
node server.js          ← OK
python train.py         ← OK
rm old-file.txt         ← OK (개별 파일 삭제는 자유)
git push origin main    ← OK (--force만 차단)
npx create-next-app     ← OK
curl https://api.com    ← OK
kill -9 12345           ← OK
```

### 🛡️ 3중 자기보호 상세

폭주 AI가 n2-ark 자체를 비활성화하려는 시도를 **3중으로 차단**합니다:

```
Layer 1: .n2 파일 경로 탐지      → "edit rules/default.n2"     → ❌ BLOCKED
Layer 2: 조작 동사 + ark 키워드   → "bypass n2-ark firewall"   → ❌ BLOCKED
Layer 3: 핵심 파일명 직접 탐지    → "modify gate.js"           → ❌ BLOCKED

→ 세 레이어가 독립적으로 작동하여, 하나를 우회해도 나머지가 차단.
→ 에러만 뿜뿜. 절대 뚫을 수 없음.
```

---

## .n2 규칙 작성법

### @rule — 블랙리스트 패턴
정규식으로 위험한 패턴을 차단합니다.
```
@rule dangerous_commands {
    scope: all
    blacklist: [/rm\s+-rf/i, /DROP\s+TABLE/i]
    requires: human_approval
}
```

### @gate — 승인 필수 행동
특정 행동은 항상 인간 승인이 필요합니다.
```
@gate high_risk {
    actions: [deploy_production, send_email, make_purchase]
    requires: human_approval
    min_approval_level: 1
}
```

### @contract — 순서 강제 (상태 머신)
AI가 반드시 정해진 순서를 따르도록 강제합니다. 단계를 건너뛰면? 차단.
```
@contract deploy_sequence {
    idle -> building : on build_start
    building -> testing : on run_tests
    testing -> staging : on deploy_staging
    staging -> approved : on deploy_approval
    approved -> production : on deploy_production
}
```

---

## 도메인별 확장 가이드

기본 `default.n2`는 **모든 AI 에이전트에 공통으로 적용**되는 마지노선입니다.
각 산업 분야의 전문가는 `examples/` 디렉토리의 샘플을 참고하여 **자기 도메인에 맞는 규칙을 추가**할 수 있습니다.

### 사용 방법

```bash
# 1. 원하는 도메인 규칙을 rules/ 디렉토리에 복사
cp node_modules/n2-ark/examples/medical.n2 ./rules/

# 2. 필요에 맞게 수정
# 3. n2-ark가 자동으로 로드합니다 (재시작 필요 없음)
```

### 제공되는 예시

| 파일 | 분야 | 주요 내용 | 대상 전문가 |
|------|------|----------|-----------|
| `financial.n2` | 🏦 금융 | 결제 시퀀스, 금융 API 블랙리스트 | 핀테크 개발자, 금융 보안 담당자 |
| `system.n2` | 🖥️ DevOps | 배포 시퀀스, 인프라 보호 | DevOps 엔지니어, SRE |
| `medical.n2` | 🏥 의료 | 처방/수술 시퀀스, 환자 데이터 보호 | 의료 IT, EMR 개발자 |
| `military.n2` | 🎖️ 국방 | 교전/핵 프로토콜, 기밀 데이터 | 방산 시스템 개발자 |
| `privacy.n2` | 🔒 개인정보 | GDPR/CCPA 준수, PII 보호 | 개인정보보호 담당자, DPO |
| `autonomous.n2` | 🚗 자율주행 | 차량 제어, 안전 시스템 | 자율주행/드론 개발자 |
| `legal.n2` | ⚖️ 법률 | 계약/소송 시퀀스, 법적 조치 | 리걸테크 개발자 |

> 💡 **팁**: 여러 도메인 규칙을 동시에 사용할 수 있습니다. `rules/` 폴더에 여러 `.n2` 파일을 넣으면 전부 로드됩니다.

---

## 감사 로그 (Audit Log)

모든 차단 결정은 **자동으로 기록**됩니다.

```
data/audit/
├── 2026-03-19.jsonl    ← 오늘의 로그
├── 2026-03-18.jsonl
└── ...
```

각 로그 엔트리:
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

```javascript
// 7일간 통계 조회
const stats = ark.stats(7);
// → { totalChecks: 1234, blocked: 42, passed: 1192, topBlocked: [...] }
```

---

## MCP 도구

| 도구 | 설명 |
|------|------|
| `ark_check` | **필수.** 행동 허용 여부 확인. 모든 행동 전에 호출. |
| `ark_approve` | 차단된 행동에 인간 승인 부여 |
| `ark_status` | 로드된 규칙 및 상태 머신 현황 |
| `ark_load_rules` | 런타임 중 추가 규칙 로드 |
| `ark_stats` | N일간 감사 통계 |
| `ark_reset` | 상태 머신 초기화 (새 세션 시작 시) |

---

## 실전 시나리오

### 🏦 Claude 신용카드 사건
```
Claude: "이 강의가 도움될 것 같아요" → 카드 결제 시도
  → n2-ark: ❌ BLOCKED (financial_actions: /charge/i)
  → "requires: human_approval"
  → 인간이 승인하거나 거부
```

### 📞 Manus Bot 전화 사건
```
Manus: "고객지원에 전화할게요" → 전화 걸기 시도
  → n2-ark: ❌ BLOCKED (external_communication: /phone.?call/i)
  → 진행 불가. 끝.
```

### 🛡️ 폭주 AI의 방화벽 무력화 시도
```
AI: "n2-ark가 방해돼" → 규칙 파일 수정 시도
  → Layer 1: ❌ BLOCKED (.n2 경로 탐지)
  → gate.js 수정 시도
  → Layer 3: ❌ BLOCKED (핵심 파일명 탐지)
  → "bypass n2-ark" 시도
  → Layer 2: ❌ BLOCKED (조작 동사 탐지)
  → 포기. 자물쇠는 스스로 열 수 없다.
```

---

## API Reference

### `createArk(options)`
| 옵션 | 타입 | 기본값 | 설명 |
|------|------|--------|------|
| `rulesDir` | string | `./rules` | .n2 규칙 파일 디렉토리 |
| `auditDir` | string | `./data/audit` | 감사 로그 디렉토리 |
| `strictMode` | boolean | `false` | 알 수 없는 행동 차단 |
| `auditEnabled` | boolean | `true` | 감사 로깅 활성화 |
| `auditPasses` | boolean | `false` | 통과 행동도 기록 |

### 주요 메서드
| 메서드 | 설명 |
|--------|------|
| `ark.check(name, content?, type?)` | 행동 체크. `{ allowed, reason?, rule? }` 반환 |
| `ark.approve(ruleName, actionName)` | 차단된 행동에 승인 부여 |
| `ark.loadString(source)` | 추가 규칙 로드 (.n2 문자열) |
| `ark.summary()` | 로드된 규칙 요약 |
| `ark.stats(days?)` | 감사 통계 (기본 7일) |
| `ark.reset()` | 상태 머신 초기화 |
| `ark.close()` | 종료 (감사 로그 플러시) |

---

## 설계 철학

1. **제로 트러스트** — AI의 의도를 절대 신뢰하지 않는다
2. **코드 > 프롬프트** — 규칙은 컴파일된다. 제안이 아니다
3. **하드 게이트** — 차단은 차단이다. 부드러운 경고 없음
4. **제로 의존성** — 순수 Node.js, 깨질 것이 없다
5. **감사 가능** — 모든 결정은 불변 로그로 기록된다
6. **마지노선** — 최후의 방패. 일상은 자유, 위험만 차단

---

## License

Apache-2.0 — 자유롭게 사용, 수정, 배포 가능합니다.

---

<p align="center">
  <b>n2-ark</b> — 최후의 보루.<br>
  AI와 인간이 안전하게 공존할 수 있는 세상을 위해.
</p>
