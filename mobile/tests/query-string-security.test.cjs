const test = require('node:test');
const assert = require('node:assert/strict');
const queryString = require('../vendor/query-string');

test('query strings preserve valid UTF-8 and serialization', () => {
  const result = queryString.parse('name=Logic%20Lurker&symbol=%E2%98%85');
  assert.equal(result.name, 'Logic Lurker');
  assert.equal(result.symbol, '★');
  assert.equal(queryString.stringify({ name: 'Logic Lurker' }), 'name=Logic%20Lurker');
});

test('malformed percent-encoded runs are retained without recursive retries', () => {
  const malformed = '%FE%FF'.repeat(10000);
  const start = performance.now();
  assert.equal(queryString.parse('value=' + malformed).value, malformed);
  assert.ok(performance.now() - start < 1000);
});
