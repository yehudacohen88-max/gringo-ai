const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { passesLegalVerification } = require('../src/modules/knowledge-agent/legal-verification');
const { contentHash } = require('../src/modules/knowledge-agent/source-grounded-record');
const { guardLegalReply } = require('../src/modules/knowledge-agent/legal-question-guard');
const { RIGHTS_UNVERIFIED_FALLBACK } = require('../src/modules/knowledge-agent/rights-unverified-fallback');
const kb = require('../src/modules/knowledge-agent/knowledge-base.service');

const DRAFTS = path.join(__dirname, '../knowledge/drafts');

function draftRecord() {
  const record = JSON.parse(fs.readFileSync(path.join(DRAFTS, 'passport.en.json'), 'utf8'));
  return {
    ...record,
    id: 'test-source-grounded-passport',
    status: 'approved',
    legalClaimsVerified: true,
  };
}

test('drafts load only when an exact-hash approval already exists', () => {
  const loaded = kb.loadKnowledgeItems();
  const loadedIds = new Set(loaded.map((item) => item.id));
  const draftFiles = fs.readdirSync(DRAFTS).filter((file) => file.endsWith('.json'));
  const approvedTopics = new Set([
    'passport', 'construction_transfer', 'minimum_wage', 'housing',
    'medical_insurance', 'weekly_rest', 'sick_leave', 'severance',
  ]);
  assert.ok(draftFiles.length >= 50);
  for (const file of draftFiles) {
    const record = JSON.parse(fs.readFileSync(path.join(DRAFTS, file), 'utf8'));
    assert.notEqual(record.status, 'approved', record.id);
    const shouldLoad = approvedTopics.has(record.topic) && (record.language === 'he' || record.language === 'en');
    assert.equal(loadedIds.has(record.id), shouldLoad, record.id);
    if (shouldLoad) {
      const found = loaded.find((item) => item.id === record.id);
      assert.equal(passesLegalVerification(found), true, record.id);
    }
  }
  const serviceSource = fs.readFileSync(path.join(__dirname, '../src/modules/knowledge-agent/knowledge-base.service.js'), 'utf8');
  assert.match(serviceSource, /knowledge\/drafts/);
  assert.match(serviceSource, /knowledge-base/);
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'gringo-source-grounded-empty-'));
  assert.deepEqual(kb.loadApprovedDraftRecords({ approvalsDir: empty }), []);
});

test('status approved without a matching approvals entry is rejected', () => {
  const record = draftRecord();
  assert.equal(record.status, 'approved');
  assert.equal(record.legalClaimsVerified, true);
  assert.equal(passesLegalVerification(record, { approvals: [] }), false);
});

test('an approval with the wrong content hash is rejected', () => {
  const record = draftRecord();
  assert.equal(passesLegalVerification(record, {
    approvals: [{
      recordId: record.id,
      contentHash: 'a'.repeat(64),
      reviewer: 'Yehuda Cohen',
      date: '2026-11-11',
    }],
  }), false);
});

test('a matching approval allows only the record answer, and legalClaimsVerified is not enough', () => {
  const record = draftRecord();
  const hash = contentHash(record);
  assert.equal(passesLegalVerification({ ...record, legalClaimsVerified: true }, { approvals: [] }), false);
  assert.equal(passesLegalVerification(record, {
    approvals: [{
      recordId: record.id,
      contentHash: hash,
      reviewer: 'Yehuda Cohen',
      date: '2026-11-11',
    }],
  }), true);

  const blocked = guardLegalReply('Your employer can keep your passport if you agree.', {
    question: 'Is my employer allowed to take my passport?',
    language: 'en',
    legalSegment: true,
    legalClaimsVerified: true,
    verifiedRecords: [{ ...record, legalClaimsVerified: true }],
  });
  assert.ok(blocked.includes(RIGHTS_UNVERIFIED_FALLBACK.en));
  assert.equal(blocked.includes('if you agree'), false);

  const shown = guardLegalReply('Your employer can keep your passport if you agree.', {
    question: 'Is my employer allowed to take my passport?',
    language: 'en',
    legalSegment: true,
    verifiedRecords: [record],
    approvals: [{
      recordId: record.id,
      contentHash: hash,
      reviewer: 'Yehuda Cohen',
      date: '2026-11-11',
    }],
  });
  assert.match(shown, /criminal offence/);
  assert.equal(shown.includes('if you agree'), false);
  assert.match(shown, /foreign_workers_rights_booklets_en2026\.pdf/);
});
