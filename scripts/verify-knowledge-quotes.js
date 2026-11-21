#!/usr/bin/env node
// Checks source-grounded knowledge drafts and records:
// quote text is verbatim in the committed handbook extract (NFC + whitespace),
// the source file hash matches, answer numbers appear in the quotes,
// language scripts match, garbled extracts stay extraction_unreliable,
// and the five language versions of one topic stay consistent.
// Legacy knowledge-base answers are not source-grounded; they stay behind
// the legal gate and are not given invented quotes here.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const { ENGLISH_HANDBOOK_DISCLAIMER } = require('../src/modules/knowledge-agent/legal-disclaimer');

const ROOT = path.join(__dirname, '..');

function normalizeText(value) {
  return String(value || '')
    .normalize('NFC')
    .replace(/\s+/g, ' ')
    .trim();
}

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function numberTokens(value) {
  return normalizeText(value).match(/\d+(?:[.,]\d+)*%?/g) || [];
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function assessExtraction(language, text) {
  const brokenThai = (text.match(/[\u0E00-\u0E7F]\s[\u0E30-\u0E4E]/g) || []).length;
  const missingSaraAm = (text.match(/ทางาน/g) || []).length;
  const brokenHindi = (text.match(/[\u0900-\u097F]\s[\u093E-\u094D]/g) || []).length;
  const badSinhala = (text.match(/ඊශ්‍රොයල/g) || []).length;
  const goodSinhala = (text.match(/ඊශ්‍රායල/g) || []).length;
  if (language === 'en') return text.includes('Withholding of Passports') ? 'ok' : 'unreliable';
  if (language === 'he') return text.includes('עיכוב דרכונים') ? 'ok' : 'unreliable';
  if (language === 'th') return (brokenThai > 30 || missingSaraAm > 20) ? 'unreliable' : 'ok';
  if (language === 'hi') return (text.includes('पासपोटा') || brokenHindi > 20) ? 'unreliable' : 'ok';
  if (language === 'si') return (badSinhala > goodSinhala) ? 'unreliable' : 'ok';
  return 'unreliable';
}

function scriptMismatch(language, text) {
  const value = String(text || '').trim();
  if (!value) return false;
  const letters = {
    he: /[\u0590-\u05FF]/,
    en: /[A-Za-z]/,
    th: /[\u0E00-\u0E7F]/,
    si: /[\u0D80-\u0DFF]/,
    hi: /[\u0900-\u097F]/,
  };
  return letters[language] ? !letters[language].test(value) : false;
}

function listJson(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((file) => file.endsWith('.json')).map((file) => path.join(dir, file));
}

function verifyKnowledgeQuotes(options = {}) {
  const root = options.root || ROOT;
  const errors = [];
  const sourcesDir = path.join(root, 'knowledge/sources/piba_handbook_2026');
  const draftsDir = path.join(root, 'knowledge/drafts');
  const manifestPath = path.join(sourcesDir, 'MANIFEST.json');
  if (!fs.existsSync(manifestPath)) {
    return { ok: false, errors: ['missing MANIFEST.json'] };
  }
  const manifest = readJson(manifestPath);
  const byLanguage = new Map();
  for (const file of manifest.files || []) {
    const pdfPath = path.join(sourcesDir, file.pdf);
    const txtPath = path.join(sourcesDir, file.txt);
    if (!fs.existsSync(pdfPath)) errors.push(`missing pdf ${file.pdf}`);
    if (!fs.existsSync(txtPath)) errors.push(`missing txt ${file.txt}`);
    if (!fs.existsSync(pdfPath) || !fs.existsSync(txtPath)) continue;
    const pdfSha = sha256(pdfPath);
    const txtSha = sha256(txtPath);
    if (pdfSha !== file.pdfSha256) errors.push(`pdf sha mismatch ${file.language}`);
    if (txtSha !== file.txtSha256) errors.push(`txt sha mismatch ${file.language}`);
    const text = fs.readFileSync(txtPath, 'utf8');
    const assessed = assessExtraction(file.language, text);
    if (assessed !== file.extraction) {
      errors.push(`${file.language} extraction assessed ${assessed} but manifest says ${file.extraction}`);
    }
    byLanguage.set(file.language, {
      ...file,
      text,
      normalized: normalizeText(text),
      txtSha,
      assessed,
    });
  }

  const drafts = [];
  for (const filePath of listJson(draftsDir)) {
    const record = readJson(filePath);
    record.__file = path.relative(root, filePath);
    drafts.push(record);
    checkRecord(record, byLanguage, errors, { requireDraft: true });
  }

  for (const filePath of listJson(path.join(root, 'src/modules/knowledge-agent/knowledge-base'))) {
    const parsed = readJson(filePath);
    const records = Array.isArray(parsed) ? parsed : [parsed];
    for (const record of records) {
      if (record && (record.schema === 'source-grounded' || Array.isArray(record.claims))) {
        checkRecord(record, byLanguage, errors, { requireDraft: false });
      }
    }
  }

  const grouped = new Map();
  for (const record of drafts) {
    if (!grouped.has(record.topic)) grouped.set(record.topic, []);
    grouped.get(record.topic).push(record);
  }
  for (const [topic, records] of grouped) {
    const sections = new Set(records.map((record) => String(record.section || '')));
    const authorities = new Set(records.map((record) => String(record.authorityId || '')));
    if (sections.size !== 1) errors.push(`${topic} section mismatch ${[...sections].join(',')}`);
    if (authorities.size !== 1) errors.push(`${topic} authority mismatch ${[...authorities].join(',')}`);
    const reliable = records.filter((record) => record.extraction !== 'unreliable' && record.status !== 'extraction_unreliable');
    const signatures = reliable.map((record) => numberTokens([record.answer, ...(record.claims || []).map((claim) => claim.quote)].join('\n')).sort().join('|'));
    if (new Set(signatures).size > 1) errors.push(`${topic} number mismatch across languages`);
    for (const record of records) {
      const source = byLanguage.get(record.language);
      if (source && record.sourceUrl && record.sourceUrl !== source.url) {
        errors.push(`${record.id} source URL is not the manifest URL`);
      }
    }
  }

  const english = byLanguage.get('en');
  if (english && !english.normalized.includes(normalizeText(ENGLISH_HANDBOOK_DISCLAIMER))) {
    errors.push('English handbook disclaimer is not verbatim in the English source text');
  }

  return { ok: errors.length === 0, errors, draftCount: drafts.length };
}

function checkRecord(record, byLanguage, errors, options) {
  const id = record.id || record.__file || 'record';
  const unreliable = record.extraction === 'unreliable' || record.status === 'extraction_unreliable';
  const source = byLanguage.get(record.language);
  if (source && source.assessed === 'unreliable' && !unreliable) {
    errors.push(`${id} is not extraction_unreliable though ${record.language} text is garbled`);
  }
  if (source && source.assessed === 'ok' && unreliable) {
    errors.push(`${id} is extraction_unreliable though ${record.language} text is readable`);
  }
  const blob = JSON.stringify(record);
  if (/kol zchut|kolzchut|kav la.?oved|kavlaoved|nevo\.co\.il/i.test(blob)) {
    errors.push(`${id} cites a non-government source`);
  }
  if (unreliable) {
    if (String(record.answer || '').trim()) errors.push(`${id} unreliable draft has answer text`);
    if (Array.isArray(record.claims) && record.claims.length) errors.push(`${id} unreliable draft has a quote`);
    if (String(record.informationLabel || '').trim()) errors.push(`${id} unreliable draft has a label`);
    return;
  }
  if (options.requireDraft && record.status !== 'draft') errors.push(`${id} status is ${record.status}, not draft`);
  if (scriptMismatch(record.language, record.answer)) errors.push(`${id} answer is not in the ${record.language} script`);
  if (scriptMismatch(record.language, record.informationLabel)) errors.push(`${id} label is not in the ${record.language} script`);
  if (/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(record.answer || '')) errors.push(`${id} answer contains an email`);
  if (/(?:\+?\d[\d\s().-]{7,}\d)/.test(record.answer || '')) errors.push(`${id} answer contains a phone-like number`);
  if (!source) {
    errors.push(`${id} has no source text for ${record.language}`);
    return;
  }
  const quotes = (record.claims || []).map((claim) => String(claim.quote || ''));
  if (!quotes.length) errors.push(`${id} has no quote`);
  const quoteBlob = quotes.join('\n');
  for (const claim of record.claims || []) {
    const quote = normalizeText(claim.quote);
    if (!quote) errors.push(`${id} empty quote`);
    else if (!source.normalized.includes(quote)) errors.push(`${id} quote not verbatim in ${record.language} source`);
    if (String(claim.sourceFileSha256 || '').toLowerCase() !== source.txtSha) {
      errors.push(`${id} source file hash does not match ${record.language} text`);
    }
    if (claim.section && String(claim.section) !== String(record.section)) {
      errors.push(`${id} claim section ${claim.section} != record section ${record.section}`);
    }
  }
  if (record.informationLabel) {
    const label = normalizeText(record.informationLabel);
    if (label && !source.normalized.includes(label)) errors.push(`${id} information label is not verbatim in the source`);
  }
  const quoteNumbers = new Set(numberTokens(quoteBlob));
  for (const token of numberTokens(record.answer || '')) {
    if (!quoteNumbers.has(token)) errors.push(`${id} answer number ${token} is not in the quoted text`);
  }
}

function main() {
  const result = verifyKnowledgeQuotes();
  if (!result.ok) {
    for (const error of result.errors) console.error(error);
    console.error(`quote verification failed (${result.errors.length})`);
    process.exit(1);
  }
  console.log(`quote verification ok (${result.draftCount} drafts)`);
}

module.exports = {
  assessExtraction,
  normalizeText,
  numberTokens,
  verifyKnowledgeQuotes,
};

if (require.main === module) main();
