const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { verifyKnowledgeQuotes } = require('../scripts/verify-knowledge-quotes');

function writeCorpus(mutate) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gringo-quotes-'));
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
    retrievedAt: '2026-11-11',
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
  const record = {
    schema: 'source-grounded',
    id: 'sample-en',
    language: 'en',
    topic: 'wages',
    section: '9',
    authorityId: 'piba',
    status: 'draft',
    extraction: 'ok',
    sourceUrl: 'https://www.gov.il/BlobFolder/policy/bileteral-forms-foreign-workers/he/foreign_workers_rights_booklets_en2026.pdf',
    answer: 'The sample wage is 10 NIS.',
    informationLabel: '',
    claims: [{
      sourceUrl: 'https://www.gov.il/BlobFolder/policy/bileteral-forms-foreign-workers/he/foreign_workers_rights_booklets_en2026.pdf',
      section: '9',
      quote: 'The sample wage is 10 NIS.',
      language: 'en',
      sourceRetrievedAt: '2026-11-11',
      sourceFileSha256: txtSha,
    }],
  };
  mutate(record, path.join(sources, 'en.txt'));
  fs.writeFileSync(path.join(drafts, 'wages.en.json'), JSON.stringify(record));
  return root;
}

test('the committed handbook quotes pass verification', () => {
  const result = verifyKnowledgeQuotes();
  assert.equal(result.ok, true, result.errors.join('\n'));
  assert.equal(result.draftCount, 50);
});

test('a tampered quote fails the quote check', () => {
  const root = writeCorpus((record) => {
    record.claims[0].quote = 'The sample wage is 11 NIS.';
  });
  const result = verifyKnowledgeQuotes({ root });
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /not verbatim/);
});

test('a number added to an answer fails the quote check', () => {
  const root = writeCorpus((record) => {
    record.answer = 'The sample wage is 10 NIS and also 99 NIS.';
  });
  const result = verifyKnowledgeQuotes({ root });
  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /answer number 99/);
});
