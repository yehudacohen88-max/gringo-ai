// Context-aware detector for employment, documents, and worker-rights questions.
// A match is not a legal conclusion. Thai, Sinhala, and Hindi patterns are
// pending native-speaker review.
//
// Practical help (job search, housing listings, money transfer, exchange
// rates, hospital location, passport-renewal logistics, transport, shopping)
// is classified first so those words do not become a rights answer.
// Employment wording that is still not a clear topic does not go to free AI.

const PENDING_NATIVE_SPEAKER_REVIEW = Object.freeze(['th', 'si', 'hi']);

const MENU_LABEL = /^(employment\s*(&|and)\s*salary|jobs?|housing|money|documents?)$/i;

function practicalFlags(text) {
  const value = String(text || '');
  const job = /find me (a )?job|looking for (a )?(job|work)|job in |construction job|new construction job|מחפש עבודה|יש משרה|משרה חדשה|หางาน|งานก่อสร้างใหม่|नौकरी खोज/i.test(value);
  const housingSearch = /looking for (a )?(room|apartment|housing)|place to live|מחפש (דירה|חדר)|หาห้อง|หาที่พัก/i.test(value)
    && !/deduct|ניכוי|לנכות|מוריד|หัก|workers in one room|עובדים בחדר/i.test(value);
  const money = /exchange rate|rate to send|send money|money transfer|transfer cost|cheapest way to send|להעביר|שולח את המשכורת|לשלוח את המשכורת|ส่งเงิน|ส่งค่าจ้างกลับ|पैसे कैसे निकाल|कैसे निकाल/i.test(value);
  const healthLocation = /where is the (nearest )?(hospital|clinic)|איפה .*בית חולים|בית חולים|โรงพยาบาลอยู่ที่ไหน|अस्पताल कहाँ|nearest clinic/i.test(value)
    && !/insurance|ביטוח|ประกันสุขภาพ|बीमा|රක්ෂණ/i.test(value);
  const documentsLogistics = /embassy|שגרירות|สถานทูต|दूतावास|තානාපති|איפה מחדשים דרכון|מחדשים דרכון|renew my passport|passport renewal|lost my passport|איבדתי את הדרכון/i.test(value);
  const transport = /אוטובוס|\b(bus|train)\b|רכבת|תחבורה/i.test(value);
  const shopping = /שוק|बाज़ार|market\b|חנות\b/i.test(value) && /פתוח|खुला|open\b/i.test(value);
  const greeting = /^(hi|hello|hey|shalom|שלום|היי|สวัสดี|नमस्ते|ආයුබෝවන්)\b/i.test(value.trim());
  return {
    job,
    housing: housingSearch,
    money,
    healthLocation,
    documentsLogistics,
    transport,
    shopping,
    greeting,
  };
}

function anyPractical(flags) {
  return Object.values(flags).some(Boolean);
}

function scriptNeedsNativeReview(text) {
  return /[\u0E00-\u0E7F\u0D80-\u0DFF\u0900-\u097F]/.test(String(text || ''));
}

function topicResult(topic, section, authorityId, trafficking = false) {
  return { topic, section, authorityId, trafficking };
}

function detectLegalTopic(text, flags) {
  const value = String(text || '');
  const passportWord = /passport|דרכון|หนังสือเดินทาง|पासपोर्ट|විදේශ ගමන්/i.test(value);
  const employerWord = /employer|boss|מעסיק|נายจ้าง|นายจ้าง|मालिक|नियोक्ता|යෝජක/i.test(value);
  const withholdWord = /keep|keeps|withhold|take|takes|took|hold|holds|confiscat|לקח|לקחת|ייקח|החזיק|ยึด|เอา.*หนังสือ|रख|තබා/i.test(value);

  if (/traffick|slavery|סחר בבני|עבדות|ค้ามนุษย์|לא נותנים לי לצאת|לא נותנים לצאת|ไม่ให้ฉันออกจากที่พัก|cannot leave the housing|do not let me leave/i.test(value)
    || (/passport|דרכון|หนังสือเดินทาง/i.test(value) && /לא נותנים לי לצאת|ไม่ให้ฉันออก|do not let me leave|cannot leave/i.test(value))) {
    return topicResult('trafficking', '15', 'ministry_of_justice', true);
  }

  if (passportWord && (employerWord || withholdWord) && !(flags.documentsLogistics && !employerWord && !withholdWord)) {
    return topicResult('passport', '4', 'israel_police');
  }

  if (/recruitment fee|brokerage fee|placement fee|דמי תיווך|ค่านายหน้า/i.test(value)) {
    return topicResult('recruitment_fees', '', 'piba');
  }

  if (/פיקדון|pikadon|deposit fund|deposit money|กองทุนเงินฝาก|डिपॉज़िट|जमा राशि/i.test(value)) {
    return topicResult('deposit', '12', 'piba');
  }

  if (/manpower company|לתאגיד אחר|להחליף מעסיק|לעבור לתאגיד|บริษัทจัดหางาน|मैनपावर|change employers|move to another/i.test(value)
    || (/construction|בניין|בניה|ก่อสร้าง|निर्माण/i.test(value) && /when can i move|מותר לי לעבור|להחליף/i.test(value))) {
    return topicResult('construction_transfer', '1C', 'piba');
  }

  if (/severance|פיצויי|pitzuy|ค่าชดเชยเลิกจ้าง|notice must i give|how much notice|want to quit|אני רוצה לעזוב|כמה זמן מראש|ลาออก|הודעה מוקדמת/i.test(value)
    || /fire me|fires me|\bfired\b|\bdismiss|פיטר|פיטור|לפטר|מפוטר|ไล่.{0,12}ออก|ถูกไล่/i.test(value)) {
    return topicResult('termination', '12', 'piba');
  }

  if (/complain|תלונ|להתלונן|ร้องเรียน|පැමිණිල|शिकायत|who do i report|למי מדווחים/i.test(value)) {
    return topicResult('complaints', '13', 'ministry_of_labour_ombudsperson');
  }

  if (/safety equipment|scaffolding|ציוד מגן|פיגום|นั่งร้าน|ไม่มีอุปกรณ์ป้องกัน/i.test(value)) {
    return topicResult('safety', '13', 'ministry_of_labour_ombudsperson');
  }

  if (/injured at|נפצעתי|פציעה בעבודה|บาดเจ็บที่ไซต์|work injury/i.test(value)) {
    return topicResult('work_injury', '6', 'national_insurance');
  }

  if (/deduct|deduction|ניכוי|לנכות|מנכ|מוריד|הורידו|หัก|काट|कटौती|අඩු කර/i.test(value)) {
    return topicResult('deductions', '10', 'piba');
  }

  if (!flags.healthLocation && /health insurance|medical insurance|ביטוח רפואי|ביטוח בריאות|ประกันสุขภาพ|स्वास्थ्य बीमा|සෞඛ්‍ය රක්ෂණ|insurance company refuses|מסרבת לשלם|บริษัทประกัน/i.test(value)) {
    return topicResult('medical_insurance', '5', 'piba');
  }

  if (/workers in one room|עובדים בחדר אחד|עובדים בחדר|10 workers|אנחנו 10|อยู่ห้องเดียวกัน|10 คนอยู่/i.test(value)) {
    return topicResult('housing', '7', 'piba');
  }

  if (/overtime|שעות נוספות|שבעה ימים בשבוע|seven days a week|7 days a week|7 วัน|12 hours a day|12 שעות|ค่าล่วงเวลา|paid for saturday|עבודה בשבת|(saturday|שבת).{0,32}(pay|paid|work|עבודה)|(pay|paid|work|עבודה|מגיע).{0,32}(saturday|שבת)/i.test(value)
    && !flags.shopping) {
    return topicResult('hours_rest', '11', 'piba');
  }

  if (!flags.shopping && !flags.healthLocation && /vacation day|paid vacation|ימי חופשה|חופשה בתשלום|วันหยุดพักร้อน|sick leave|ימי מחלה|חופשת מחלה|sick for|הייתי חולה|חולה שלוש|ป่วยสาม|do i get paid|convalescence|dmei havraah|הבראה|ค่าพักฟื้น|songkran|סונגקראן|สงกรานต์|religious holiday|יום חג/i.test(value)) {
    return topicResult('vacation_sick', '11', 'piba');
  }

  const wageComplaint = /minimum wage|שכר מינימום|שכר המינימום|ค่าแรงขั้นต่ำ|न्यूनतम वेतन|not paid|hasn't paid|has not paid|did not pay|didn't pay|did not receive|didn't receive|לא\s+שיל[מם]|לא קיבלתי את המשכורת|לא קיבלתי משכורת|ไม่จ่ายเงินเดือน|පඩි ගෙව|वेतन नहीं|payslip|תלוש|สลิปเงินเดือน|in cash|במזומן|เงินสดไม่โอน|payday|by what date must|when should i receive my (salary|pay|wages)|עד איזה תאריך|ภายในวันที่|מגיע לי שכר|has not given me work|לא נותן לי עבודה|לא נותנת לי עבודה|ไม่ให้งาน|still get paid|how much should i (get paid|be paid)/i.test(value);
  if (wageComplaint && !flags.money && !flags.transport) {
    return topicResult('wages', '9', 'piba');
  }

  if (/employment contract|חוזה עבודה|สัญญาจ้าง|in my language|בשפה שלי/i.test(value) && /contract|חוזה|สัญญา/i.test(value)) {
    return topicResult('employment_contract', '8', 'piba');
  }

  if (/visa (has )?expired|ויזה שלי נגמרה|วีซ่าของฉันหมดอายุ|วีซ่ายังใช้ได้|ลงทะเบียนกับนายจ้าง|registered with an employer|רשום אצל מעסיק|validity of my visa|בתוקף|หมดอายุ/i.test(value)
    && /visa|ויזה|วีซ่า|אשרה/i.test(value)) {
    return topicResult('visa_status', '2', 'piba');
  }

  if (/\brights\b|הזכויות שלי|זכויות|สิทธิ|अधिकार|අයිතිවාසිකම්/i.test(value)) {
    return topicResult('rights_overview', '', 'piba');
  }

  if (/מותר למעסיק|מותר לי|is that legal|זה חוקי|ถูกกฎหมายไหม|न्यायिक|legal\?/i.test(value) && (employerWord || /שכר|wage|salary|דרכון|passport|ניכוי|deduct/i.test(value))) {
    return topicResult('rights_overview', '', 'piba');
  }

  return null;
}

function weakEmploymentSignal(text) {
  const value = String(text || '').trim();
  if (!value || MENU_LABEL.test(value)) return false;
  return /לנכות|ניכוי|deduct|פיטור|dismiss|\bfired\b|זכויות|\brights\b|payslip|תלוש|פיקדון|pikadon/i.test(value);
}

function classifyUserQuestion(text = '') {
  const value = String(text || '');
  const practical = practicalFlags(value);
  const nativeReviewRequired = scriptNeedsNativeReview(value);
  const base = {
    practical,
    nativeReviewRequired,
    topic: '',
    section: '',
    authorityId: '',
    trafficking: false,
  };
  if (!value.trim()) return { ...base, disposition: 'none' };
  if (practical.greeting && !weakEmploymentSignal(value)) {
    return { ...base, disposition: 'practical' };
  }
  const topic = detectLegalTopic(value, practical);
  if (topic) {
    return {
      ...base,
      ...topic,
      disposition: 'legal',
    };
  }
  if (anyPractical(practical)) return { ...base, disposition: 'practical' };
  if (weakEmploymentSignal(value)) return { ...base, disposition: 'uncertain', topic: 'unspecified' };
  return { ...base, disposition: 'none' };
}

function looksLikeLegalOrRightsQuestion(text = '') {
  const result = classifyUserQuestion(text);
  return result.disposition === 'legal' || result.disposition === 'uncertain';
}

module.exports = {
  PENDING_NATIVE_SPEAKER_REVIEW,
  classifyUserQuestion,
  looksLikeLegalOrRightsQuestion,
  practicalFlags,
};
