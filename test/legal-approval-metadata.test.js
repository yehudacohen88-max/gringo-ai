const test = require('node:test');
const assert = require('node:assert/strict');

const { passesLegalVerification, knowledgeSafeForAi } = require('../src/modules/knowledge-agent/legal-verification');
const { contentHash } = require('../src/modules/knowledge-agent/source-grounded-record');
const { guardLegalReply } = require('../src/modules/knowledge-agent/legal-question-guard');

function record(overrides = {}) {
  return {
    id: 'legacy-rights-1',
    category: 'Workers Rights',
    domain: 'employment',
    topic: 'wages',
    title: 'Payday',
    answer: 'Reviewed legacy answer that must stay hidden without an approval file.',
    legalClaimsVerified: true,
    source: {
      verified: true,
      url: 'https://example.test/legacy',
      title: 'Example',
      verifiedAt: '2026-11-01',
      contentStatus: 'approved',
      reviewedBy: 'legal-review',
    },
    ...overrides,
  };
}

function approvalFor(item, overrides = {}) {
  return {
    recordId: item.id,
    contentHash: contentHash(item),
    reviewer: 'Yehuda Cohen',
    date: '2026-11-11',
    ...overrides,
  };
}

test('flipping legal metadata never displays a record without a matching approval', () => {
  const base = record();
  const fields = [
    base,
    record({ legalClaimsVerified: false }),
    record({ legalClaimsVerified: 'true' }),
    record({ contentStatus: 'approved', source: { ...base.source, contentStatus: 'draft' } }),
    record({ source: { ...base.source, verified: false } }),
    record({ source: { ...base.source, verified: 'true' } }),
    record({ source: { ...base.source, verifiedAt: 'yesterday' } }),
    record({ source: { ...base.source, reviewedBy: '' } }),
    record({ source: { ...base.source, reviewedBy: 'pending' } }),
    record({ source: { ...base.source, url: 'http://example.test/legacy' } }),
    record({ source: { ...base.source, contentStatus: 'approved', verified: true } }),
  ];
  for (const item of fields) {
    assert.equal(passesLegalVerification(item, { approvals: [] }), false, JSON.stringify(item.source));
    assert.equal(knowledgeSafeForAi([item], { approvals: [] }).length, 0);
    const reply = guardLegalReply('Invented legal answer.', {
      question: 'By what date must my employer pay my salary?',
      language: 'en',
      legalSegment: true,
      legalClaimsVerified: true,
      verifiedRecords: [item],
      approvals: [],
    });
    assert.equal(reply.includes(item.answer), false);
  }
});

test('a matching approval entry is what allows the legacy answer to be shown', () => {
  const item = record();
  assert.equal(passesLegalVerification(item, { approvals: [approvalFor(item, { contentHash: 'ab'.repeat(32) })] }), false);
  assert.equal(passesLegalVerification(item, { approvals: [approvalFor(item)] }), true);
  const shown = guardLegalReply('Invented legal answer.', {
    question: 'By what date must my employer pay my salary?',
    language: 'en',
    legalSegment: true,
    verifiedRecords: [item],
    approvals: [approvalFor(item)],
  });
  assert.match(shown, /Reviewed legacy answer/);
  assert.match(shown, /https:\/\/example\.test\/legacy/);
  const flipped = record({ source: { ...item.source, contentStatus: 'draft' } });
  assert.equal(passesLegalVerification(flipped, { approvals: [approvalFor(item)] }), false);
});
