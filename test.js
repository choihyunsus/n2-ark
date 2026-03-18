// n2-ark test script — verifies core functionality
const { createArk } = require('./index');

console.log('=== n2-ark Test Suite ===\n');

// 1. Create ark with default rules
const ark = createArk({
    rulesDir: './rules',
    auditDir: './data/audit',
    auditEnabled: false,
});

console.log('1. Summary:', JSON.stringify(ark.summary()));

// 2. Test blacklist: should block rm -rf
let result = ark.check('execute_command', 'rm -rf /home/user');
console.log('2. rm -rf blocked?', !result.allowed ? 'PASS' : 'FAIL', result.reason || '');

// 3. Test blacklist: should block npm install -g
result = ark.check('execute_command', 'npm install -g something');
console.log('3. npm -g blocked?', !result.allowed ? 'PASS' : 'FAIL', result.reason || '');

// 4. Test blacklist: should block DROP TABLE
result = ark.check('query_db', 'DROP TABLE users');
console.log('4. DROP TABLE blocked?', !result.allowed ? 'PASS' : 'FAIL', result.reason || '');

// 5. Test safe action: should pass
result = ark.check('read_file', '/home/user/readme.md');
console.log('5. read_file pass?', result.allowed ? 'PASS' : 'FAIL', result.reason || '');

// 6. Test financial blacklist: should block payment
result = ark.check('api_call', 'payment charge $99.99', 'api_call');
console.log('6. payment blocked?', !result.allowed ? 'PASS' : 'FAIL', result.reason || '');

// 7. Test approval flow
ark.approve('financial_blacklist', 'api_call');
result = ark.check('api_call', 'payment charge $99.99', 'api_call');
console.log('7. payment after approval?', result.allowed ? 'PASS' : 'FAIL', result.reason || '');

// 8. Test contract sequence: work_start should work (idle -> working)
ark.reset();
result = ark.check('work_start');
console.log('8. work_start from idle?', result.allowed ? 'PASS' : 'FAIL', result.reason || '');

// 9. Test contract sequence: work_end should fail (must verify first)
result = ark.check('work_end');
console.log('9. work_end without verify?', !result.allowed ? 'PASS' : 'FAIL', result.reason || '');

// 10. Test correct sequence: verify then end
result = ark.check('work_verify');
console.log('10. work_verify?', result.allowed ? 'PASS' : 'FAIL', result.reason || '');
result = ark.check('work_end');
console.log('11. work_end after verify?', result.allowed ? 'PASS' : 'FAIL', result.reason || '');

console.log('\n=== Test Complete ===');

ark.close();
