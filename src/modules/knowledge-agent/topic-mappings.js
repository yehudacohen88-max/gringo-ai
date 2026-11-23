// Query-side labels only. These words point a question at an English topic
// key that already exists on a knowledge record. They are not legal facts
// and they do not add answers.
//
// Terms in Thai, Sinhala and Hindi are pending native-speaker review.
// Hebrew and English terms are the ones used for the pilot questions.
// Sinhala block hints are not listed here. A term in this file can point a
// question at a topic for retrieval. Unverified Sinhala detection hints live
// in legal-topic-detector.js and are used only to block a free model answer.

const PENDING_NATIVE_SPEAKER_REVIEW = Object.freeze(['th', 'si', 'hi']);

const TOPIC_MAPPINGS = Object.freeze([
  Object.freeze({
    topic: 'overtime',
    terms: Object.freeze([
      'overtime',
      'שעות נוספות',
      'ค่าล่วงเวลา',
      'අතිකාල',
      'ओवरटाइम',
    ]),
  }),
  Object.freeze({
    topic: 'missing_salary',
    terms: Object.freeze([
      'missing salary',
      'unpaid salary',
      'not paid',
      'did not pay',
      'לא שילמו',
      'משכורת',
      'ค่าจ้าง',
      'ไม่ได้รับเงินเดือน',
      'वेतन नहीं',
    ]),
  }),
  Object.freeze({
    topic: 'salary_payment_timing',
    terms: Object.freeze([
      'salary payment',
      'payment date',
      'מועד תשלום',
      'วันจ่ายเงินเดือน',
    ]),
  }),
  Object.freeze({
    topic: 'weekly_rest',
    terms: Object.freeze([
      'weekly rest',
      'מנוחה שבועית',
      'מנוחה שבועי',
      'יום מנוחה',
      'seven days a week',
      'שבעה ימים בשבוע',
      'วันหยุดประจำสัปดาห์',
    ]),
  }),
  Object.freeze({
    topic: 'passport',
    terms: Object.freeze([
      'passport',
      'דרכון',
    ]),
  }),
  Object.freeze({
    topic: 'construction_transfer',
    terms: Object.freeze([
      'manpower company',
      'change employers',
      'move to another',
      'לתאגיד אחר',
      'להחליף מעסיק',
      'לעבור לתאגיד',
      'לעבור לקבלן',
    ]),
  }),
  Object.freeze({
    topic: 'minimum_wage',
    terms: Object.freeze([
      'minimum wage',
      'שכר מינימום',
      'שכר המינימום',
      'שכר מינימלי',
      'השכר המינימלי',
    ]),
  }),
  Object.freeze({
    topic: 'housing',
    terms: Object.freeze([
      'workers in one room',
      'suitable housing',
      'share one room',
      'עובדים בחדר',
      'מגורים הולמים',
    ]),
  }),
  Object.freeze({
    topic: 'medical_insurance',
    terms: Object.freeze([
      'health insurance',
      'medical insurance',
      'ביטוח רפואי',
      'ביטוח הרפואי',
      'הביטוח הרפואי',
      'ביטוח בריאות',
    ]),
  }),
  Object.freeze({
    topic: 'sick_leave',
    terms: Object.freeze([
      'sick leave',
      'sick for',
      'ימי מחלה',
      'חופשת מחלה',
      'הייתי חולה',
    ]),
  }),
  Object.freeze({
    topic: 'severance',
    terms: Object.freeze([
      'severance',
      'פיצויי',
    ]),
  }),
]);

function topicKeysForQuestion(question, termMatches) {
  if (typeof termMatches !== 'function') return [];
  const keys = [];
  for (const entry of TOPIC_MAPPINGS) {
    if (entry.terms.some((term) => termMatches(question, term))) keys.push(entry.topic);
  }
  return keys;
}

module.exports = {
  PENDING_NATIVE_SPEAKER_REVIEW,
  TOPIC_MAPPINGS,
  topicKeysForQuestion,
};
