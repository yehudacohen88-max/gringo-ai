// Disclaimer appended to every rights, obligation, or legal reply.
// Hebrew is the sentence supplied by the owner. English is the handbook's
// own introduction sentence, copied verbatim from the 2026 English PDF.
// Thai, Sinhala, and Hindi are faithful translations of the Hebrew sentence.
// There is no translator budget: those three are NOT reviewed.

const { HANDBOOK_PDF_URLS, HANDBOOK_RETRIEVED_AT } = require('./handbook-links');

const ENGLISH_HANDBOOK_DISCLAIMER = 'This summary is provided for general informational purposes only, and is not a substitute for the wording of the relevant laws, regulations, procedures and extension orders, which are binding.';

const LEGAL_DISCLAIMER = Object.freeze({
  he: Object.freeze({
    text: 'אין לראות באמור ייעוץ משפטי. המידע הוא כללי בלבד ואינו מחליף ייעוץ מקצועי המתייחס לנסיבות המקרה.',
    reviewStatus: 'owner_supplied',
    source: null,
  }),
  en: Object.freeze({
    text: ENGLISH_HANDBOOK_DISCLAIMER,
    reviewStatus: 'handbook_verbatim',
    source: Object.freeze({
      url: HANDBOOK_PDF_URLS.en,
      section: 'Introduction',
      quote: ENGLISH_HANDBOOK_DISCLAIMER,
      language: 'en',
      sourceRetrievedAt: HANDBOOK_RETRIEVED_AT,
    }),
  }),
  th: Object.freeze({
    text: 'อย่าถือว่าข้อความนี้เป็นคำแนะนำทางกฎหมาย ข้อมูลนี้เป็นข้อมูลทั่วไปเท่านั้น และไม่ได้แทนที่คำแนะนำจากผู้เชี่ยวชาญที่พิจารณาข้อเท็จจริงของกรณีของคุณ',
    reviewStatus: 'pending_native_review',
    source: null,
  }),
  si: Object.freeze({
    text: 'මෙහි සඳහන් දේ නීති උපදෙස් ලෙස නොසලකන්න. මෙම තොරතුරු පොදු තොරතුරු පමණි. ඒවා ඔබේ තත්ත්වය සලකා බලන වෘත්තීය උපදෙස් වෙනුවට නොගනී.',
    reviewStatus: 'pending_native_review',
    source: null,
  }),
  hi: Object.freeze({
    text: 'इसे कानूनी सलाह न समझें। यह जानकारी केवल सामान्य है और आपके मामले की परिस्थितियों पर पेशेवर सलाह की जगह नहीं लेती।',
    reviewStatus: 'pending_native_review',
    source: null,
  }),
});

function disclaimerLanguage(language) {
  const code = String(language || '').toLowerCase();
  if (code.startsWith('he') || code.startsWith('iw')) return 'he';
  if (code.startsWith('th')) return 'th';
  if (code.startsWith('si')) return 'si';
  if (code.startsWith('hi')) return 'hi';
  return 'en';
}

function legalDisclaimerText(language) {
  return LEGAL_DISCLAIMER[disclaimerLanguage(language)].text;
}

function withLegalDisclaimer(text, language) {
  const disclaimer = legalDisclaimerText(language);
  const body = String(text || '').trim();
  if (!body) return disclaimer;
  if (body.includes(disclaimer)) return body;
  return `${body}\n\n${disclaimer}`;
}

module.exports = {
  ENGLISH_HANDBOOK_DISCLAIMER,
  LEGAL_DISCLAIMER,
  disclaimerLanguage,
  legalDisclaimerText,
  withLegalDisclaimer,
};
