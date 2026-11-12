const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const { ENGLISH_HANDBOOK_DISCLAIMER, ENGLISH_NOT_LEGAL_ADVICE, LEGAL_DISCLAIMER, legalDisclaimerText } = require('../src/modules/knowledge-agent/legal-disclaimer');
const { guardLegalReply } = require('../src/modules/knowledge-agent/legal-question-guard');
const { createRightsUnverifiedFallback } = require('../src/modules/knowledge-agent/rights-unverified-fallback');

const OWNER_HEBREW = 'אין לראות באמור ייעוץ משפטי. המידע הוא כללי בלבד ואינו מחליף ייעוץ מקצועי המתייחס לנסיבות המקרה.';

const UNVERIFIED_CONTACTS = [
  '074-7696161',
  '0506-290758',
  '1-700-707-889',
  'foreignr@labor.gov.il',
  'combattrafficking@justice.gov.il',
  '074-7085060',
  'Pikdonot@sa.piba.gov.il',
  '03-6883537',
  '03-5133100',
  '1-700-70-60-44',
];

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else if (/\.(js|json|md)$/.test(entry.name)) files.push(full);
  }
  return files;
}

test('every legal reply in five languages includes the disclaimer, and ordinary replies do not', () => {
  assert.equal(LEGAL_DISCLAIMER.he.text, OWNER_HEBREW);
  assert.equal(LEGAL_DISCLAIMER.he.reviewStatus, 'owner_supplied');
  assert.equal(LEGAL_DISCLAIMER.en.reviewStatus, 'handbook_verbatim_and_owner_english');
  assert.ok(legalDisclaimerText('en').includes(ENGLISH_HANDBOOK_DISCLAIMER));
  assert.ok(legalDisclaimerText('en').includes(ENGLISH_NOT_LEGAL_ADVICE));
  for (const language of ['th', 'si', 'hi']) {
    assert.equal(LEGAL_DISCLAIMER[language].reviewStatus, 'pending_native_review', language);
  }

  for (const language of ['he', 'en', 'th', 'si', 'hi']) {
    const reply = guardLegalReply('Invented statutory answer.', {
      question: 'What are my rights as a worker?',
      language,
      legalSegment: true,
    });
    assert.ok(reply.includes(legalDisclaimerText(language)), language);
    assert.ok(createRightsUnverifiedFallback(language).includes(legalDisclaimerText(language)), language);
    assert.match(reply, /https:\/\/www\.gov\.il\/BlobFolder\/policy\/bileteral-forms-foreign-workers\//, language);
    assert.match(reply, /2026-11-11/, language);
  }

  const ordinary = guardLegalReply('I can help you look for a job.', {
    question: 'find me a construction job in Tel Aviv',
    language: 'en',
  });
  for (const entry of Object.values(LEGAL_DISCLAIMER)) {
    assert.equal(ordinary.includes(entry.text), false, entry.reviewStatus);
  }
});

test('unverified handbook contacts never appear in runtime code or drafts', () => {
  const contacts = fs.readFileSync(path.join(__dirname, '../docs/CONTACTS_PENDING_VERIFICATION.md'), 'utf8');
  for (const value of UNVERIFIED_CONTACTS) assert.ok(contacts.includes(value), value);
  const roots = [
    path.join(__dirname, '../src'),
    path.join(__dirname, '../knowledge/drafts'),
  ];
  for (const root of roots) {
    for (const file of walk(root)) {
      const text = fs.readFileSync(file, 'utf8');
      for (const value of UNVERIFIED_CONTACTS) {
        assert.equal(text.includes(value), false, `${value} in ${path.relative(path.join(__dirname, '..'), file)}`);
      }
    }
  }
});
