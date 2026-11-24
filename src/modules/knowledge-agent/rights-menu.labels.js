// PENDING_FOUNDER_APPROVAL
//
// Short Hebrew and English labels for the rights topic menu. These are new
// UI strings, not legal answers. They are not approved for publishing until
// the founder reviews this file in one batch. Thai, Hindi, and Sinhala must
// not be added here. Those languages reuse existing strings only.

const PENDING_FOUNDER_APPROVAL = 'PENDING_FOUNDER_APPROVAL';

const RIGHTS_MENU_TOPIC_ORDER = Object.freeze([
  'passport',
  'construction_transfer',
  'minimum_wage',
  'housing',
  'medical_insurance',
  'weekly_rest',
  'sick_leave',
  'severance',
]);

const RIGHTS_TOPIC_LABELS = Object.freeze({
  en: Object.freeze({
    passport: 'Passport',
    construction_transfer: 'Change employer',
    minimum_wage: 'Minimum wage',
    housing: 'Housing',
    medical_insurance: 'Health insurance',
    weekly_rest: 'Weekly rest',
    sick_leave: 'Sick leave',
    severance: 'Severance',
    other: 'Other topic',
  }),
  he: Object.freeze({
    passport: 'דרכון',
    construction_transfer: 'החלפת מעסיק',
    minimum_wage: 'שכר מינימום',
    housing: 'מגורים',
    medical_insurance: 'ביטוח רפואי',
    weekly_rest: 'מנוחה שבועית',
    sick_leave: 'ימי מחלה',
    severance: 'פיצויי פיטורים',
    other: 'נושא אחר',
  }),
});

// Short he/en labels for a mixed practical+legal message that did not split
// cleanly. Not legal answers. Not approved for publishing until the founder
// reviews them. Thai, Hindi, and Sinhala are not added here.
const MIXED_SPLIT_LABELS = Object.freeze({
  en: Object.freeze({
    practical: 'Practical question',
    rights: 'Worker rights',
    resend: 'Send only the practical question.',
  }),
  he: Object.freeze({
    practical: 'שאלה מעשית',
    rights: 'זכויות עובדים',
    resend: 'שלחו רק את השאלה המעשית.',
  }),
});

module.exports = {
  MIXED_SPLIT_LABELS,
  PENDING_FOUNDER_APPROVAL,
  RIGHTS_MENU_TOPIC_ORDER,
  RIGHTS_TOPIC_LABELS,
};
