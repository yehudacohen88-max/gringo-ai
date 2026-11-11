// Query-side labels only. These words point a question at an English topic
// key that already exists on a knowledge record. They are not legal facts
// and they do not add answers.
//
// Terms in Thai, Sinhala and Hindi are pending native-speaker review.
// Hebrew and English terms are the ones used for the pilot questions.

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
      'วันหยุดประจำสัปดาห์',
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
