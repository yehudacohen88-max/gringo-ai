const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { verifyKnowledgeQuotes } = require('../scripts/verify-knowledge-quotes');
const { classifyUserQuestion } = require('../src/modules/knowledge-agent/legal-topic-detector');
const { guardLegalReply } = require('../src/modules/knowledge-agent/legal-question-guard');
const { passesLegalVerification } = require('../src/modules/knowledge-agent/legal-verification');
const { RIGHTS_UNVERIFIED_FALLBACK } = require('../src/modules/knowledge-agent/rights-unverified-fallback');

const ROOT = path.join(__dirname, '..');
const DRAFTS = path.join(ROOT, 'knowledge/drafts');
const APPROVALS = path.join(ROOT, 'knowledge/approvals');

function readDrafts() {
  return fs.readdirSync(DRAFTS).filter((file) => file.endsWith('.json')).map((file) => (
    JSON.parse(fs.readFileSync(path.join(DRAFTS, file), 'utf8'))
  ));
}

test('phase 2 keeps twelve Hebrew and English drafts behind an empty approvals directory', () => {
  const names = fs.readdirSync(APPROVALS).filter((name) => name !== '.' && name !== '..');
  assert.deepEqual(names, ['README.md']);
  const drafts = readDrafts();
  assert.equal(drafts.length, 60);
  const topics = [...new Set(drafts.map((record) => record.topic))].sort();
  assert.deepEqual(topics, [
    'annual_leave', 'complaints', 'construction_transfer', 'deductions', 'deposit',
    'housing', 'medical_insurance', 'minimum_wage', 'passport', 'severance',
    'sick_leave', 'weekly_rest',
  ]);
  for (const retired of ['vacation_sick', 'termination_deposit', 'hours_rest', 'wages']) {
    assert.equal(fs.existsSync(path.join(DRAFTS, `${retired}.he.json`)), false, retired);
  }
  for (const record of drafts) {
    assert.notEqual(record.status, 'approved', record.id);
    if (['hi', 'si', 'th'].includes(record.language)) {
      assert.equal(record.status, 'extraction_unreliable', record.id);
      assert.equal(record.answer, '', record.id);
      assert.deepEqual(record.claims, [], record.id);
    }
    assert.equal(passesLegalVerification(record, { approvals: [] }), false, record.id);
  }
});

test('draft answers are not shown while approvals are empty', () => {
  const drafts = readDrafts().filter((record) => record.language === 'he' && record.answer);
  const reply = guardLegalReply('השכר הוא 6,443.85 והניכוי הוא הרשאה גורפת.', {
    question: 'מה שכר המינימום ומה מותר לנכות?',
    language: 'he',
    legalSegment: true,
    verifiedRecords: drafts,
    approvals: [],
  });
  assert.ok(reply.includes(RIGHTS_UNVERIFIED_FALLBACK.he));
  assert.equal(reply.includes('6,443.85'), false);
  assert.equal(reply.includes('אינה הרשאה גורפת'), false);
  assert.equal(reply.includes('עבירה פלילית'), false);
});

test('split topics stay legal and ordinary questions do not', () => {
  assert.equal(classifyUserQuestion('what is the minimum wage').topic, 'minimum_wage');
  assert.equal(classifyUserQuestion('how many sick leave days').topic, 'sick_leave');
  assert.equal(classifyUserQuestion('how many vacation days').topic, 'annual_leave');
  assert.equal(classifyUserQuestion('am I entitled to severance').topic, 'severance');
  assert.equal(classifyUserQuestion('how do I get my deposit money').topic, 'deposit');
  assert.equal(classifyUserQuestion('weekly rest of 36 hours').topic, 'weekly_rest');
  assert.equal(classifyUserQuestion('my employer has not paid my salary').disposition, 'legal');
  assert.equal(classifyUserQuestion('find me a construction job in Tel Aviv').disposition, 'practical');
});

test('a stale checkedAt fails verification', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gringo-phase2-'));
  const sources = path.join(root, 'knowledge/sources/piba_handbook_2026');
  const drafts = path.join(root, 'knowledge/drafts');
  fs.mkdirSync(sources, { recursive: true });
  fs.mkdirSync(drafts, { recursive: true });
  const text = 'Withholding of Passports\nThe sample wage is 10 NIS.\n';
  const pdf = Buffer.from('%PDF-1.4 sample');
  fs.writeFileSync(path.join(sources, 'en.txt'), text);
  fs.writeFileSync(path.join(sources, 'en.pdf'), pdf);
  const txtSha = crypto.createHash('sha256').update(text).digest('hex');
  const pdfSha = crypto.createHash('sha256').update(pdf).digest('hex');
  fs.writeFileSync(path.join(sources, 'MANIFEST.json'), JSON.stringify({
    files: [{
      language: 'en',
      url: 'https://www.gov.il/BlobFolder/policy/bileteral-forms-foreign-workers/he/foreign_workers_rights_booklets_en2026.pdf',
      pdf: 'en.pdf',
      txt: 'en.txt',
      pdfSha256: pdfSha,
      txtSha256: txtSha,
      extraction: 'ok',
    }],
  }));
  fs.writeFileSync(path.join(drafts, 'wages.en.json'), JSON.stringify({
    schema: 'source-grounded',
    id: 'sample-en',
    language: 'en',
    topic: 'wages',
    section: '9',
    authorityId: 'piba',
    status: 'draft',
    extraction: 'ok',
    checkedAt: '2020-01-01',
    reviewGroup: 'ready',
    sourceUrl: 'https://www.gov.il/BlobFolder/policy/bileteral-forms-foreign-workers/he/foreign_workers_rights_booklets_en2026.pdf',
    answer: 'The sample wage is 10 NIS.',
    informationLabel: '',
    claims: [{
      sourceUrl: 'https://www.gov.il/BlobFolder/policy/bileteral-forms-foreign-workers/he/foreign_workers_rights_booklets_en2026.pdf',
      section: '9',
      quote: 'The sample wage is 10 NIS.',
      pdfPage: 1,
      language: 'en',
      sourceRetrievedAt: '2026-11-11',
      sourceFileSha256: txtSha,
    }],
  }));
  const result = verifyKnowledgeQuotes({ root });
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /checkedAt is older/);
});
