// Official PIBA Foreign Workers' Rights Handbook 2026 PDFs.
// These are the only handbook URLs a rights reply may link to.

const HANDBOOK_RETRIEVED_AT = '2026-11-11';
const HANDBOOK_EDITION = '2026';

const HANDBOOK_PDF_URLS = Object.freeze({
  he: 'https://www.gov.il/BlobFolder/policy/bileteral-forms-foreign-workers/he/foreign_workers_rights_booklets_he2026.pdf',
  en: 'https://www.gov.il/BlobFolder/policy/bileteral-forms-foreign-workers/he/foreign_workers_rights_booklets_en2026.pdf',
  th: 'https://www.gov.il/BlobFolder/policy/bileteral-forms-foreign-workers/he/oreign_workers_handbook_thai2026.pdf',
  hi: 'https://www.gov.il/BlobFolder/policy/bileteral-forms-foreign-workers/he/foreign_workers_handbook_hindi.pdf',
  si: 'https://www.gov.il/BlobFolder/policy/bileteral-forms-foreign-workers/he/foreign_workers_handbook_sin2026.pdf',
});

function handbookLanguage(language) {
  const code = String(language || '').toLowerCase();
  if (code.startsWith('he') || code.startsWith('iw')) return 'he';
  if (code.startsWith('th')) return 'th';
  if (code.startsWith('si')) return 'si';
  if (code.startsWith('hi')) return 'hi';
  return 'en';
}

function handbookPdfUrl(language) {
  return HANDBOOK_PDF_URLS[handbookLanguage(language)];
}

module.exports = {
  HANDBOOK_EDITION,
  HANDBOOK_PDF_URLS,
  HANDBOOK_RETRIEVED_AT,
  handbookLanguage,
  handbookPdfUrl,
};
