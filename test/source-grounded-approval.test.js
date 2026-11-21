const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
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

test('drafts are never loaded by the runtime knowledge base', () => {
  const loaded = new Set(kb.loadKnowledgeItems().map((item) => item.id));
  const draftFiles = fs.readdirSync(DRAFTS).filter((file) => file.endsWith('.json'));
  assert.ok(draftFiles.length >= 50);
  for (const file of draftFiles) {
    const record = JSON.parse(fs.readFileSync(path.join(DRAFTS, file), 'utf8'));
    assert.equal(loaded.has(record.id), false, record.id);
    assert.notEqual(record.status, 'approved', record.id);
  }
  const serviceSource = fs.readFileSync(path.join(__dirname, '../src/modules/knowledge-agent/knowledge-base.service.js'), 'utf8');
  assert.equal(serviceSource.includes('knowledge/drafts'), false);
  assert.match(serviceSource, /knowledge-base/);
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
