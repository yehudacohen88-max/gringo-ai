// Fixed reply when a rights question has no record that passes the legal
// verification gate. No statutory amounts, deadlines, phone numbers, or
// email addresses. No page URL is included: the candidate government and
// organization pages could not be fetched past bot walls on 2026-11-10,
// so they are not described as verified. See docs/ops/RELEASE_BLOCKERS.md.
//
// Thai, Sinhala and Hindi strings are pending native-speaker review.

const PENDING_NATIVE_SPEAKER_REVIEW = Object.freeze(['th', 'si', 'hi']);

const RIGHTS_UNVERIFIED_FALLBACK = Object.freeze({
  en: 'I do not have verified information on this yet, and I will not guess. For official information, use the official websites of the government bodies responsible for labor and for population and immigration. Keep your contract, payslips, and a record of your hours. This is not legal advice.',
  he: 'אין לי מידע מאומת על השאלה הזו, ואני לא רוצה לנחש. למידע רשמי יש לפנות לאתרים הרשמיים של הגופים הממשלתיים שאחראים על עבודה ועל אוכלוסין והגירה. כדאי לשמור את החוזה, את תלושי השכר ורישום של שעות העבודה. זה לא ייעוץ משפטי.',
  th: 'ตอนนี้ฉันยังไม่มีข้อมูลที่ยืนยันแล้วสำหรับเรื่องนี้ และฉันจะไม่เดา สำหรับข้อมูลทางการ ให้ดูเว็บไซต์ทางการของหน่วยงานรัฐที่ดูแลเรื่องแรงงาน และเรื่องประชากรและการเข้าเมือง ควรเก็บสัญญา สลิปเงินเดือน และบันทึกชั่วโมงทำงานไว้ ข้อความนี้ไม่ใช่คำแนะนำทางกฎหมาย',
  si: 'මේ ප්‍රශ්නය ගැන තහවුරු කළ තොරතුරු මට තවම නැත. මම අනුමාන නොකරමි. නිල තොරතුරු සඳහා කම්කරු සහ ජනගහන හා ආගමන කටයුතු භාර රජයේ ආයතනවල නිල වෙබ් අඩවි බලන්න. ඔබේ ගිවිසුම, වැටුප් පත් සහ වැඩ කළ පැයවල වාර්තාව තබා ගන්න. මෙය නීති උපදෙස් නොවේ.',
  hi: 'इस प्रश्न पर मेरे पास अभी कोई सत्यापित जानकारी नहीं है, और मैं अनुमान नहीं लगाऊँगा। आधिकारिक जानकारी के लिए श्रम तथा जनसंख्या और आप्रवासन के सरकारी निकायों की आधिकारिक वेबसाइट देखें। अपना अनुबंध, पेस्लिप और काम के घंटों का रिकॉर्ड रखें। यह कानूनी सलाह नहीं है।',
});

function rightsFallbackLanguage(language) {
  const code = String(language || '').toLowerCase();
  if (code.startsWith('he') || code.startsWith('iw')) return 'he';
  if (code.startsWith('th')) return 'th';
  if (code.startsWith('si')) return 'si';
  if (code.startsWith('hi')) return 'hi';
  return 'en';
}

function createRightsUnverifiedFallback(language) {
  return RIGHTS_UNVERIFIED_FALLBACK[rightsFallbackLanguage(language)];
}

module.exports = {
  PENDING_NATIVE_SPEAKER_REVIEW,
  RIGHTS_UNVERIFIED_FALLBACK,
  createRightsUnverifiedFallback,
  rightsFallbackLanguage,
};
