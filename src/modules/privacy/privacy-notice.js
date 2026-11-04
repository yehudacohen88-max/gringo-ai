// DRAFT privacy notice. The wording, retention periods, and legal basis need
// review by an Israeli privacy lawyer before real workers see it. Change
// PRIVACY_NOTICE_VERSION whenever the text changes, so users accept again.
const PRIVACY_NOTICE_VERSION = '2026-11-draft-1';
const PRIVACY_NOTICE_STATUS = 'DRAFT_PENDING_LEGAL_REVIEW';
const NOTICE_LANGUAGES = ['he', 'en', 'th'];

const NOTICES = {
  en: {
    title: 'Gringo privacy notice (draft)',
    summary: [
      'Gringo saves what you tell it so it can help you: your name, city, work, goals, language, the chat messages you send, and your tasks, documents, reminders and money quotes.',
      'We use this only to answer you and send the reminders you ask for. We do not sell it.',
      'Your messages are processed by OpenAI to write answers, and stored in Google Sheets. Both are outside Israel.',
      'You can say no. Without consent Gringo shows only public lists (jobs, housing, services) and saves nothing about you.',
    ],
    rights: [
      'Send "privacy" to read this again.',
      'Send "my data" to see what Gringo saved about you.',
      'Send "withdraw consent" to stop. Gringo will stop using your data.',
      'Send "delete my data" to delete it. You will be asked to confirm.',
    ],
    limits: 'Deletion removes your data from Gringo. It cannot remove: copies kept by Telegram, LINE or WhatsApp in your chat app; Google Sheets version history and Google backups; data OpenAI keeps for a limited time; and server logs until they expire.',
    acceptPrompt: 'Reply "accept" to agree, or "decline" to say no.',
    accept: 'accept',
    decline: 'decline',
  },
  he: {
    title: 'הודעת פרטיות של גרינגו (טיוטה)',
    summary: [
      'גרינגו שומר את מה שאתה מספר לו כדי לעזור לך: שם, עיר, עבודה, מטרות, שפה, ההודעות שאתה שולח, המשימות, המסמכים, התזכורות והצעות העברת כסף.',
      'אנחנו משתמשים במידע רק כדי לענות לך ולשלוח תזכורות שביקשת. אנחנו לא מוכרים אותו.',
      'ההודעות שלך מעובדות ב-OpenAI כדי לכתוב תשובות, ונשמרות ב-Google Sheets. שניהם מחוץ לישראל.',
      'מותר לך לסרב. בלי הסכמה גרינגו מציג רק רשימות ציבוריות (עבודות, דיור, שירותים) ולא שומר עליך כלום.',
    ],
    rights: [
      'שלח "פרטיות" כדי לקרוא שוב.',
      'שלח "המידע שלי" כדי לראות מה נשמר עליך.',
      'שלח "ביטול הסכמה" כדי להפסיק. גרינגו יפסיק להשתמש במידע שלך.',
      'שלח "מחק את המידע שלי" כדי למחוק אותו. תתבקש לאשר.',
    ],
    limits: 'המחיקה מסירה את המידע שלך מגרינגו. היא לא יכולה להסיר: עותקים ש-Telegram, LINE או WhatsApp שומרים באפליקציה שלך; היסטוריית גרסאות וגיבויים של Google Sheets; מידע ש-OpenAI שומרת לזמן מוגבל; ולוגים של השרת עד שתוקפם יפוג.',
    acceptPrompt: 'השב "מסכים" כדי לאשר, או "לא מסכים" כדי לסרב.',
    accept: 'מסכים',
    decline: 'לא מסכים',
  },
  th: {
    title: 'ประกาศความเป็นส่วนตัวของ Gringo (ฉบับร่าง)',
    summary: [
      'Gringo จะบันทึกสิ่งที่คุณบอกเพื่อช่วยเหลือคุณ: ชื่อ เมือง งาน เป้าหมาย ภาษา ข้อความที่คุณส่ง งานที่ต้องทำ เอกสาร การแจ้งเตือน และใบเสนอราคาโอนเงิน',
      'เราใช้ข้อมูลนี้เพื่อตอบคุณและส่งการแจ้งเตือนที่คุณขอเท่านั้น เราไม่ขายข้อมูลของคุณ',
      'ข้อความของคุณจะถูกประมวลผลโดย OpenAI เพื่อเขียนคำตอบ และเก็บไว้ใน Google Sheets ทั้งสองอยู่นอกประเทศอิสราเอล',
      'คุณปฏิเสธได้ ถ้าไม่ยินยอม Gringo จะแสดงเฉพาะรายการสาธารณะ (งาน ที่พัก บริการ) และไม่บันทึกข้อมูลของคุณ',
    ],
    rights: [
      'ส่ง "ความเป็นส่วนตัว" เพื่ออ่านอีกครั้ง',
      'ส่ง "ข้อมูลของฉัน" เพื่อดูว่า Gringo บันทึกอะไรไว้',
      'ส่ง "ถอนความยินยอม" เพื่อหยุด Gringo จะหยุดใช้ข้อมูลของคุณ',
      'ส่ง "ลบข้อมูล" เพื่อลบข้อมูล ระบบจะขอให้คุณยืนยัน',
    ],
    limits: 'การลบจะลบข้อมูลของคุณออกจาก Gringo แต่ไม่สามารถลบ: สำเนาที่ Telegram, LINE หรือ WhatsApp เก็บไว้ในแอปของคุณ; ประวัติเวอร์ชันและข้อมูลสำรองของ Google Sheets; ข้อมูลที่ OpenAI เก็บไว้ในระยะเวลาจำกัด; และบันทึกของเซิร์ฟเวอร์จนกว่าจะหมดอายุ',
    acceptPrompt: 'ตอบ "ยอมรับ" เพื่อยินยอม หรือ "ไม่ยอมรับ" เพื่อปฏิเสธ',
    accept: 'ยอมรับ',
    decline: 'ไม่ยอมรับ',
  },
};

const REPLIES = {
  en: {
    accepted: 'Thank you. Your consent was saved. How can I help?',
    declined: 'OK. Gringo will not save anything about you. You can still ask for public jobs, housing and services. Send "accept" any time to agree.',
    withdrawn: 'Your consent was withdrawn. Gringo stopped using your data. It is still stored until you send "delete my data".',
    consentRequired: 'Before we continue, please read this:',
    deleteConfirm: (code) => `To delete your data, send: delete my data ${code}\nThe code works for 10 minutes.`,
    deleteDone: 'Your data was deleted from Gringo.',
    deleteNothing: 'Gringo has no stored data for you.',
    deleteBadCode: 'That code is wrong or expired. Send "delete my data" to get a new one.',
    exportTitle: 'Summary of your data (selected fields and record counts only). This is not a full export:',
    exportFullHint: 'For a full copy of every stored record, open Gringo on the web (link this chat to your web account) and use Privacy → Export, or ask the Gringo team for a full copy.',
    exportEmpty: 'Gringo has no stored data for you.',
    deletePartial: 'Part of your data was deleted, but some records could not be deleted yet. Gringo has stopped using your data and will not save anything new. Send "delete my data" to try again. The Gringo team can also finish it for you.',
    deletePending: 'Your deletion request is not finished yet. Gringo is not using your data. Trying again now…',
    noPendingDeletion: 'There is no unfinished deletion for you.',
  },
  he: {
    accepted: 'תודה. ההסכמה שלך נשמרה. איך אפשר לעזור?',
    declined: 'בסדר. גרינגו לא ישמור עליך מידע. אפשר עדיין לשאול על עבודות, דיור ושירותים ציבוריים. שלח "מסכים" בכל זמן כדי לאשר.',
    withdrawn: 'ההסכמה שלך בוטלה. גרינגו הפסיק להשתמש במידע שלך. המידע עדיין שמור עד שתשלח "מחק את המידע שלי".',
    consentRequired: 'לפני שממשיכים, קרא בבקשה:',
    deleteConfirm: (code) => `כדי למחוק את המידע שלך, שלח: מחק את המידע שלי ${code}\nהקוד תקף ל-10 דקות.`,
    deleteDone: 'המידע שלך נמחק מגרינגו.',
    deleteNothing: 'אין בגרינגו מידע שמור עליך.',
    deleteBadCode: 'הקוד שגוי או שפג תוקפו. שלח "מחק את המידע שלי" כדי לקבל קוד חדש.',
    exportTitle: 'סיכום המידע שלך (שדות נבחרים וספירת רשומות בלבד). זה לא ייצוא מלא:',
    exportFullHint: 'לעותק מלא של כל הרשומות השמורות, פתח את גרינגו באתר (קשר את הצ\'אט הזה לחשבון באתר) ובחר פרטיות ← ייצוא, או בקש עותק מלא מצוות גרינגו.',
    exportEmpty: 'אין בגרינגו מידע שמור עליך.',
    deletePartial: 'חלק מהמידע שלך נמחק, אבל חלק מהרשומות עדיין לא נמחקו. גרינגו הפסיק להשתמש במידע שלך ולא ישמור שום דבר חדש. שלח "מחק את המידע שלי" כדי לנסות שוב. גם צוות גרינגו יכול להשלים את המחיקה עבורך.',
    deletePending: 'בקשת המחיקה שלך עדיין לא הושלמה. גרינגו לא משתמש במידע שלך. מנסים שוב עכשיו…',
    noPendingDeletion: 'אין בקשת מחיקה פתוחה עבורך.',
  },
  th: {
    accepted: 'ขอบคุณ บันทึกความยินยอมของคุณแล้ว ให้ช่วยอะไรดี?',
    declined: 'ได้เลย Gringo จะไม่บันทึกข้อมูลของคุณ คุณยังถามเรื่องงาน ที่พัก และบริการสาธารณะได้ ส่ง "ยอมรับ" เมื่อใดก็ได้เพื่อยินยอม',
    withdrawn: 'ถอนความยินยอมแล้ว Gringo หยุดใช้ข้อมูลของคุณแล้ว ข้อมูลยังถูกเก็บไว้จนกว่าคุณจะส่ง "ลบข้อมูล"',
    consentRequired: 'ก่อนเริ่ม โปรดอ่านข้อความนี้:',
    deleteConfirm: (code) => `หากต้องการลบข้อมูล ให้ส่ง: ลบข้อมูล ${code}\nรหัสนี้ใช้ได้ 10 นาที`,
    deleteDone: 'ลบข้อมูลของคุณออกจาก Gringo แล้ว',
    deleteNothing: 'Gringo ไม่มีข้อมูลของคุณที่บันทึกไว้',
    deleteBadCode: 'รหัสไม่ถูกต้องหรือหมดอายุ ส่ง "ลบข้อมูล" เพื่อรับรหัสใหม่',
    exportTitle: 'สรุปข้อมูลของคุณ (เฉพาะบางช่องและจำนวนรายการ) นี่ไม่ใช่การส่งออกข้อมูลทั้งหมด:',
    exportFullHint: 'หากต้องการสำเนาข้อมูลที่บันทึกไว้ทั้งหมด เปิด Gringo บนเว็บ (เชื่อมแชทนี้กับบัญชีเว็บ) แล้วเลือก ความเป็นส่วนตัว → ส่งออก หรือขอสำเนาทั้งหมดจากทีม Gringo',
    exportEmpty: 'Gringo ไม่มีข้อมูลของคุณที่บันทึกไว้',
    deletePartial: 'ลบข้อมูลของคุณไปแล้วบางส่วน แต่ยังมีบางรายการที่ลบไม่ได้ในตอนนี้ Gringo หยุดใช้ข้อมูลของคุณและจะไม่บันทึกอะไรใหม่ ส่ง "ลบข้อมูล" เพื่อลองอีกครั้ง ทีม Gringo ก็ช่วยลบให้เสร็จได้',
    deletePending: 'คำขอลบข้อมูลของคุณยังไม่เสร็จ Gringo ไม่ได้ใช้ข้อมูลของคุณ กำลังลองอีกครั้ง…',
    noPendingDeletion: 'ไม่มีคำขอลบข้อมูลที่ค้างอยู่',
  },
};

function noticeLanguage(language) {
  const primary = String(language || '').trim().toLowerCase().split(/[-_]/)[0];
  if (primary === 'iw') return 'he';
  return NOTICE_LANGUAGES.includes(primary) ? primary : '';
}

function guessLanguageFromText(text = '') {
  const value = String(text || '');
  if (/[\u0e00-\u0e7f]/.test(value)) return 'th';
  if (/[\u0590-\u05ff]/.test(value)) return 'he';
  return '';
}

function getNotice(language) {
  const lang = noticeLanguage(language) || 'en';
  return {
    version: PRIVACY_NOTICE_VERSION,
    status: PRIVACY_NOTICE_STATUS,
    language: lang,
    ...NOTICES[lang],
  };
}

function noticeText(language) {
  const notice = getNotice(language);
  return [notice.title, '', ...notice.summary, '', ...notice.rights, '', notice.limits, '', notice.acceptPrompt].join('\n');
}

// With no known language, show Thai, English and Hebrew so the first pilot
// users can read it.
function channelNoticeText(language) {
  const lang = noticeLanguage(language);
  if (lang) return noticeText(lang);
  return ['th', 'en', 'he'].map((item) => noticeText(item)).join('\n\n———\n\n');
}

function reply(language, key, ...args) {
  const lang = noticeLanguage(language) || 'en';
  const value = REPLIES[lang][key];
  return typeof value === 'function' ? value(...args) : value;
}

module.exports = {
  NOTICE_LANGUAGES,
  NOTICES,
  PRIVACY_NOTICE_STATUS,
  PRIVACY_NOTICE_VERSION,
  REPLIES,
  channelNoticeText,
  getNotice,
  guessLanguageFromText,
  noticeLanguage,
  noticeText,
  reply,
};
