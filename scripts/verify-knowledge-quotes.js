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

const { ENGLISH_HANDBOOK_DISCLAIMER, legalDisclaimerText } = require('../src/modules/knowledge-agent/legal-disclaimer');

const MAX_CHECKED_AGE_DAYS = 120;
const PHASE2_TOPICS = [
  'passport', 'construction_transfer', 'minimum_wage', 'deductions', 'housing',
  'medical_insurance', 'weekly_rest', 'annual_leave', 'sick_leave', 'severance',
  'deposit', 'complaints',
];
const REQUIRED_ANSWER_TEXT = {
  passport: { he: ['עבירה פלילית', 'משטרת ישראל'], en: ['criminal offence', 'Israel Police'] },
  construction_transfer: { he: ['הודעה מוקדמת בכתב', 'אחת לרבעון'], en: ['advance notice', 'quarter'] },
  minimum_wage: { he: ['6,443.85', '35.4', '34.64', '01.04.2026'], en: ['6,443.85', '35.4', '34.64', '01.04.2026'] },
  deductions: { he: ['אינה הרשאה גורפת', 'אינו אוטומטי'], en: ['not a blanket permission', 'not an automatic deduction'] },
  housing: { he: ['שבעה ימים', 'שישה', '4'], en: ['seven days', 'six workers', '4'] },
  medical_insurance: { he: ['כל תקופת', '90', '21'], en: ['throughout the employment', '90', '21'] },
  weekly_rest: { he: ['36', '25', 'סיעוד'], en: ['36', '25', 'caregiver'] },
  annual_leave: { he: ['מטופל', 'אינה מכריעה'], en: ['patient', 'does not decide'] },
  sick_leave: { he: ['יום וחצי', '50%', 'אישור רפואי'], en: ['a day and a half', '50%', 'doctor'] },
  severance: { he: ['שנה אחת', 'חודש אחד'], en: ['one year', 'one month'] },
  deposit: { he: ['אינה מכריעה', '12.5%', '10', '30'], en: ['does not decide', '12.5%', '10 working', '30 working'] },
  complaints: { he: ['אינה מכריעה', 'ממונה על זכויות'], en: ['does not decide', 'Ombudsperson'] },
};

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
  const withoutUrls = String(value || '')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/\bwww\.\S+/g, ' ');
  return normalizeText(withoutUrls).match(/\d+(?:[.,]\d+)*%?/g) || [];
}

function uniqueNumbers(value) {
  return [...new Set(numberTokens(value))].sort();
}

function phoneLike(value) {
  let text = String(value || '');
  text = text.replace(/https?:\/\/\S+/g, ' ');
  text = text.replace(/\bwww\.\S+/g, ' ');
  text = text.replace(/\b\d{4}-\d{2}-\d{2}\b/g, ' ');
  text = text.replace(/\b\d{2}\.\d{2}\.\d{4}\b/g, ' ');
  text = text.replace(/\d{1,3}(?:,\d{3})+(?:\.\d+)?/g, ' ');
  text = text.replace(/\d+\.\d+%?/g, ' ');
  text = text.replace(/\d+%/g, ' ');
  return /(?:\+?\d[\d\s().-]{7,}\d)/.test(text);
}

function ageInDays(isoDate) {
  const then = Date.parse(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(then)) return null;
  return (Date.now() - then) / 86400000;
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
    checkRecord(record, byLanguage, errors, { requireDraft: true, root });
  }

  for (const filePath of listJson(path.join(root, 'src/modules/knowledge-agent/knowledge-base'))) {
    const parsed = readJson(filePath);
    const records = Array.isArray(parsed) ? parsed : [parsed];
    for (const record of records) {
      if (record && (record.schema === 'source-grounded' || Array.isArray(record.claims))) {
        checkRecord(record, byLanguage, errors, { requireDraft: false, root });
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
    const answerSignatures = reliable.map((record) => uniqueNumbers(record.answer).join('|'));
    if (new Set(answerSignatures).size > 1) errors.push(`${topic} number mismatch across languages`);
    checkPhase2(topic, records, errors);
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

  const phase2Drafts = drafts.filter((record) => record.checkedAt);
  if (phase2Drafts.length) {
    const topics = [...new Set(drafts.map((record) => record.topic))].sort();
    const expected = [...PHASE2_TOPICS].sort();
    if (topics.join('|') !== expected.join('|')) {
      errors.push(`phase2 topics are ${topics.join(',')} not ${expected.join(',')}`);
    }
    for (const retired of ['vacation_sick', 'termination_deposit', 'hours_rest', 'wages']) {
      if (topics.includes(retired)) errors.push(`retired topic still present: ${retired}`);
    }
  }

  return { ok: errors.length === 0, errors, draftCount: drafts.length };
}

function checkPhase2(topic, records, errors) {
  const reviewed = records.filter((record) => record.checkedAt);
  if (!reviewed.length) return;
  const groups = new Set(reviewed.map((record) => record.reviewGroup));
  if (groups.size !== 1 || !['ready', 'needs_info', 'blocked'].includes([...groups][0])) {
    errors.push(`${topic} reviewGroup mismatch ${[...groups].join(',')}`);
  }
  const required = REQUIRED_ANSWER_TEXT[topic];
  for (const record of reviewed) {
    const id = record.id || topic;
    const age = ageInDays(record.checkedAt);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(record.checkedAt || '')) || age === null) {
      errors.push(`${id} checkedAt is missing or not a date`);
    } else if (age > MAX_CHECKED_AGE_DAYS) {
      errors.push(`${id} checkedAt is older than ${MAX_CHECKED_AGE_DAYS} days`);
    } else if (age < -1) {
      errors.push(`${id} checkedAt is in the future`);
    }
    const disclaimer = legalDisclaimerText(record.language);
    if (!String(record.answer || '').endsWith(disclaimer)) {
      errors.push(`${id} answer does not end with the disclaimer`);
    }
    if (required && required[record.language]) {
      for (const phrase of required[record.language]) {
        if (!String(record.answer || '').includes(phrase)) {
          errors.push(`${id} answer is missing required text ${phrase}`);
        }
      }
    }
    if (topic === 'minimum_wage') {
      if (record.effectiveFrom !== '2026-04-01') errors.push(`${id} minimum wage effectiveFrom is not 2026-04-01`);
      if (/6,?247\.67/.test(String(record.answer || ''))) errors.push(`${id} presents the outdated 6,247.67 wage`);
    }
  }
}

function readSourceText(root, relativePath, errors, id) {
  const base = path.resolve(root || ROOT);
  const filePath = path.resolve(base, relativePath);
  if (!filePath.startsWith(base + path.sep) && filePath !== base) {
    errors.push(`${id} source text path escapes the repo`);
    return null;
  }
  if (!fs.existsSync(filePath)) {
    errors.push(`${id} missing source text ${relativePath}`);
    return null;
  }
  return {
    normalized: normalizeText(fs.readFileSync(filePath, 'utf8')),
    txtSha: sha256(filePath),
  };
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
  if (phoneLike(record.answer || '')) errors.push(`${id} answer contains a phone-like number`);
  if (!source && !(record.claims || []).every((claim) => claim && claim.sourceText)) {
    errors.push(`${id} has no source text for ${record.language}`);
    return;
  }
  const quotes = (record.claims || []).map((claim) => String(claim.quote || ''));
  if (!quotes.length) errors.push(`${id} has no quote`);
  const quoteBlob = quotes.join('\n');
  for (const claim of record.claims || []) {
    const corpus = claim.sourceText ? readSourceText(options.root, claim.sourceText, errors, id) : source;
    const quote = normalizeText(claim.quote);
    if (!quote) errors.push(`${id} empty quote`);
    else if (!corpus || !corpus.normalized.includes(quote)) errors.push(`${id} quote not verbatim in ${claim.sourceText || record.language} source`);
    if (!corpus || String(claim.sourceFileSha256 || '').toLowerCase() !== corpus.txtSha) {
      errors.push(`${id} source file hash does not match ${claim.sourceText || record.language} text`);
    }
    if (!claim.sourceText && claim.section && String(claim.section) !== String(record.section)) {
      errors.push(`${id} claim section ${claim.section} != record section ${record.section}`);
    }
    if (!claim.sourceText && !(Number.isInteger(claim.pdfPage) && claim.pdfPage > 0)) {
      errors.push(`${id} handbook claim has no PDF page`);
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
