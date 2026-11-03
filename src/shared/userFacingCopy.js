const { languageDetectionService } = require('../modules/language');

// Same language codes as the web client's copy maps (en, he, ar, th, si, hi, ru, tl).
const COPY = Object.freeze({
  rateLimited: Object.freeze({
    en: 'Too many requests. Please wait a moment and try again.',
    he: 'יש יותר מדי בקשות. נא להמתין רגע ולנסות שוב.',
    ar: 'هناك طلبات كثيرة جدًا. يُرجى الانتظار لحظة ثم المحاولة مرة أخرى.',
    th: 'มีคำขอมากเกินไป โปรดรอสักครู่แล้วลองอีกครั้ง',
    si: 'ඉල්ලීම් වැඩියි. කරුණාකර මොහොතක් රැඳී නැවත උත්සාහ කරන්න.',
    hi: 'अनुरोध बहुत अधिक हैं। कृपया थोड़ी देर रुककर फिर से कोशिश करें।',
    ru: 'Слишком много запросов. Подождите немного и попробуйте снова.',
    tl: 'Masyadong maraming kahilingan. Maghintay sandali at subukan ulit.',
  }),
  internal: Object.freeze({
    en: 'Something went wrong. Please try again.',
    he: 'משהו השתבש. נא לנסות שוב.',
    ar: 'حدث خطأ ما. يُرجى المحاولة مرة أخرى.',
    th: 'มีบางอย่างผิดพลาด โปรดลองอีกครั้ง',
    si: 'යමක් වැරදී ඇත. කරුණාකර නැවත උත්සාහ කරන්න.',
    hi: 'कुछ गलत हो गया। कृपया फिर से कोशिश करें।',
    ru: 'Что-то пошло не так. Попробуйте ещё раз.',
    tl: 'May nangyaring mali. Subukan ulit.',
  }),
});

function languageFromRequest(req) {
  const header = req && req.headers ? req.headers['accept-language'] : '';
  const parts = String(header || '').split(',');
  for (const part of parts) {
    const tag = part.split(';')[0].trim();
    if (!tag || tag === '*') continue;
    const code = languageDetectionService.normalizeLanguageCode(tag);
    if (code) return code;
  }
  return 'en';
}

function messageFor(language, key) {
  const table = COPY[key] || COPY.internal;
  return table[language] || table.en;
}

module.exports = {
  COPY,
  languageFromRequest,
  messageFor,
};
