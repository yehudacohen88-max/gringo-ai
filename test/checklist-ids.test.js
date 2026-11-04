const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
test('master checklist task ids are unique', () => {
  const md = fs.readFileSync(path.join(__dirname, '..', 'docs', 'GRINGO_MASTER_CHECKLIST.md'), 'utf8');
  const ids = [...md.matchAll(/^\| ([A-Z]+-\d+) \|/gm)].map((m) => m[1]);
  assert.ok(ids.length > 50);
  assert.deepEqual(ids.filter((id, i) => ids.indexOf(id) !== i), []);
});
