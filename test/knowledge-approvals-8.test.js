const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { passesLegalVerification } = require('../src/modules/knowledge-agent/legal-verification');
const { contentHash, loadApprovalEntries } = require('../src/modules/knowledge-agent/source-grounded-record');
const { guardLegalReply } = require('../src/modules/knowledge-agent/legal-question-guard');
const { RIGHTS_UNVERIFIED_FALLBACK } = require('../src/modules/knowledge-agent/rights-unverified-fallback');

const ROOT = path.join(__dirname, '..');
const DRAFTS = path.join(ROOT, 'knowledge/drafts');
const APPROVALS = path.join(ROOT, 'knowledge/approvals');

const APPROVED_TOPICS = [
  'passport',
  'construction_transfer',
  'minimum_wage',
  'housing',
  'medical_insurance',
  'weekly_rest',
  'sick_leave',
  'severance',
];
const BLOCKED_TOPICS = ['deductions', 'annual_leave', 'deposit', 'complaints'];
const APPROVED_LANGUAGES = ['he', 'en'];
const ALL_LANGUAGES = ['he', 'en', 'th', 'hi', 'si'];

// The presentation guard only copies a record when its topic, id, title, or
// keywords match an existing pattern. These three topic ids already do.
const SHOWN_BY_CURRENT_GUARD = {
  passport: {
    en: 'Is my employer allowed to take my passport?',
    he: 'האם המעסיק יכול לקחת את הדרכון?',
  },
  minimum_wage: {
    en: 'what is the minimum wage',
    he: 'מה שכר המינימום',
  },
  sick_leave: {
    en: 'how many sick leave days',
    he: 'כמה ימי מחלה',
  },
};

function readDraft(topic, language) {
  return JSON.parse(fs.readFileSync(path.join(DRAFTS, `${topic}.${language}.json`), 'utf8'));
}

function readApproval(recordId) {
  return JSON.parse(fs.readFileSync(path.join(APPROVALS, `${recordId}.json`), 'utf8'));
}

function answerMarker(record) {
  return String(record.answer || '').slice(0, 80);
}

function guardedReply(record, question) {
  return guardLegalReply(`MODEL ${answerMarker(record)}`, {
    question,
    language: record.language,
    legalSegment: true,
    verifiedRecords: [record],
  });
}

test('eight Hebrew and English approvals match the drafts and pass the legal gate', () => {
  const loaded = loadApprovalEntries();
  assert.equal(loaded.length, APPROVED_TOPICS.length * APPROVED_LANGUAGES.length);
  const loadedIds = loaded.map((entry) => entry.recordId).sort();
  const expectedIds = [];

  for (const topic of APPROVED_TOPICS) {
    for (const language of APPROVED_LANGUAGES) {
      const record = readDraft(topic, language);
      expectedIds.push(record.id);
      const approval = readApproval(record.id);
      assert.equal(approval.recordId, record.id);
      assert.equal(approval.contentHash, contentHash(record));
      assert.equal(approval.reviewer, 'Yehuda Cohen');
      assert.equal(approval.date, '2026-11-22');
      assert.equal(approval.note, 'owner decision t103u');
      assert.equal(record.status, 'draft', record.id);
      assert.equal(passesLegalVerification(record), true, record.id);

      const reply = guardedReply(record, (SHOWN_BY_CURRENT_GUARD[topic] || {})[language] || 'rights');
      const marker = answerMarker(record);
      if (SHOWN_BY_CURRENT_GUARD[topic]) {
        assert.equal(reply.includes(marker), true, record.id);
        assert.equal(reply.includes('MODEL '), false, record.id);
      } else {
        assert.equal(reply.includes(marker), false, record.id);
        assert.equal(reply.includes(RIGHTS_UNVERIFIED_FALLBACK[language]), true, record.id);
      }
    }
  }

  assert.deepEqual(loadedIds, expectedIds.sort());
});

test('blocked topics and Thai, Hindi, and Sinhala drafts are not approved or displayed', () => {
  const files = fs.readdirSync(APPROVALS);
  const loadedIds = new Set(loadApprovalEntries().map((entry) => entry.recordId));

  for (const topic of BLOCKED_TOPICS) {
    for (const language of ALL_LANGUAGES) {
      const record = readDraft(topic, language);
      assert.equal(files.includes(`${record.id}.json`), false, record.id);
      assert.equal(loadedIds.has(record.id), false, record.id);
      assert.equal(passesLegalVerification(record), false, record.id);
      const reply = guardedReply(record, 'what is the minimum wage and what can be deducted');
      if (record.answer) {
        assert.equal(reply.includes(answerMarker(record)), false, record.id);
      }
      assert.equal(reply.includes('MODEL '), false, record.id);
      assert.equal(reply.includes(RIGHTS_UNVERIFIED_FALLBACK[language]), true, record.id);
    }
  }

  for (const topic of APPROVED_TOPICS) {
    for (const language of ['th', 'hi', 'si']) {
      const record = readDraft(topic, language);
      assert.equal(record.status, 'extraction_unreliable', record.id);
      assert.equal(record.answer, '', record.id);
      assert.equal(files.includes(`${record.id}.json`), false, record.id);
      assert.equal(loadedIds.has(record.id), false, record.id);
      assert.equal(passesLegalVerification(record), false, record.id);
      assert.equal(passesLegalVerification(record, {
        approvals: [{
          recordId: record.id,
          contentHash: contentHash(record),
          reviewer: 'Yehuda Cohen',
          date: '2026-11-22',
          note: 'owner decision t103u',
        }],
      }), false, record.id);
      const reply = guardedReply(record, 'rights');
      assert.equal(reply.includes('MODEL '), false, record.id);
      assert.equal(reply.includes(RIGHTS_UNVERIFIED_FALLBACK[language]), true, record.id);
    }
  }
});

test('changing one character in an approved answer breaks that approval', () => {
  for (const topic of APPROVED_TOPICS) {
    for (const language of APPROVED_LANGUAGES) {
      const record = readDraft(topic, language);
      const last = record.answer.slice(-1);
      const tampered = {
        ...record,
        answer: `${record.answer.slice(0, -1)}${last === 'X' ? 'Y' : 'X'}`,
      };
      assert.equal(tampered.answer.length, record.answer.length);
      assert.notEqual(contentHash(tampered), contentHash(record));
      assert.equal(passesLegalVerification(record), true, record.id);
      assert.equal(passesLegalVerification(tampered), false, record.id);
      const reply = guardedReply(tampered, (SHOWN_BY_CURRENT_GUARD[topic] || {})[language] || 'rights');
      assert.equal(reply.includes(answerMarker(record)), false, record.id);
      assert.equal(reply.includes(RIGHTS_UNVERIFIED_FALLBACK[language]), true, record.id);
    }
  }
});
