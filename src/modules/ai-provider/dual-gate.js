// Dual gate for free model text. The model is never the sole authority.
// GENERAL_DOMAIN_ENABLED is a code constant. It is not an environment variable.
// 'general' stays closed in every language until this constant is changed in code.

const GENERAL_DOMAIN_ENABLED = false;

const PRACTICAL_DOMAINS = Object.freeze([
  'job_search',
  'housing_search',
  'money_transfer',
  'public_transport',
  'practical_banking',
  'telecom',
  'shopping_local_services',
  'health_place',
  'embassy_admin',
  'general',
]);

const CLOSED_DOMAINS = Object.freeze([
  'rights',
  'medical',
  'finance_advice',
  'unclear',
]);

const DOMAIN_ENUM = Object.freeze([...PRACTICAL_DOMAINS, ...CLOSED_DOMAINS]);

const ALLOWED_FREE_TEXT_DOMAINS = Object.freeze(
  PRACTICAL_DOMAINS.filter((domain) => domain !== 'general' || GENERAL_DOMAIN_ENABLED),
);

// practicalFlags from legal-topic-detector, mapped once. greeting is not a domain.
// documentsLogistics is one existing flag for both an embassy errand and a bank
// errand. It does not say which, so either model domain agrees with that one flag.
const PRACTICAL_FLAG_DOMAINS = Object.freeze({
  job: Object.freeze(['job_search']),
  housing: Object.freeze(['housing_search']),
  money: Object.freeze(['money_transfer']),
  transport: Object.freeze(['public_transport']),
  phone: Object.freeze(['telecom']),
  shopping: Object.freeze(['shopping_local_services']),
  healthLocation: Object.freeze(['health_place']),
  documentsLogistics: Object.freeze(['embassy_admin', 'practical_banking']),
});

const NATIVE_REVIEW_LANGUAGES = Object.freeze(['th', 'hi', 'si']);

function languageKey(language) {
  const code = String(language || '').toLowerCase();
  if (code.startsWith('he') || code.startsWith('iw')) return 'he';
  if (code.startsWith('th')) return 'th';
  if (code.startsWith('si')) return 'si';
  if (code.startsWith('hi')) return 'hi';
  return 'en';
}

function responseTextFormat() {
  return {
    type: 'json_schema',
    name: 'gringo_domain_reply',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        domain: { type: 'string', enum: [...DOMAIN_ENUM] },
        rights: { type: 'boolean' },
        sure: { type: 'boolean' },
        medical_advice: { type: 'boolean' },
        reply: { type: 'string' },
      },
      required: ['domain', 'rights', 'sure', 'medical_advice', 'reply'],
    },
  };
}

function parseModelReply(text, meta = {}) {
  if (meta.status === 'incomplete' || meta.incomplete) {
    return { ok: false, reason: 'truncated' };
  }
  const raw = String(text || '').trim();
  if (!raw) return { ok: false, reason: 'invalid_json' };
  let value;
  try {
    value = JSON.parse(raw);
  } catch (error) {
    const cutObject = raw.startsWith('{') && !raw.endsWith('}');
    const cutArray = raw.startsWith('[') && !raw.endsWith(']');
    return { ok: false, reason: cutObject || cutArray ? 'truncated' : 'invalid_json' };
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, reason: 'schema' };
  }
  const keys = Object.keys(value);
  const fields = ['domain', 'rights', 'sure', 'medical_advice', 'reply'];
  if (keys.length !== fields.length || fields.some((key) => !Object.prototype.hasOwnProperty.call(value, key))) {
    return { ok: false, reason: 'schema' };
  }
  if (typeof value.domain !== 'string') return { ok: false, reason: 'schema' };
  if (!DOMAIN_ENUM.includes(value.domain)) return { ok: false, reason: 'unknown_enum' };
  if (typeof value.rights !== 'boolean' || typeof value.sure !== 'boolean' || typeof value.medical_advice !== 'boolean' || typeof value.reply !== 'string') {
    return { ok: false, reason: 'schema' };
  }
  return {
    ok: true,
    value: {
      domain: value.domain,
      rights: value.rights,
      sure: value.sure,
      medical_advice: value.medical_advice,
      reply: value.reply,
    },
  };
}

function agreedPracticalDomain(flags, domain) {
  const groups = [];
  for (const [flag, domains] of Object.entries(PRACTICAL_FLAG_DOMAINS)) {
    if (flags && flags[flag] === true) groups.push(domains);
  }
  if (groups.length !== 1) return false;
  return groups[0].includes(domain);
}

function domainAllowed(domain, language, flags) {
  if (domain === 'general') {
    if (NATIVE_REVIEW_LANGUAGES.includes(language)) return false;
    return GENERAL_DOMAIN_ENABLED === true;
  }
  if (domain === 'health_place') {
    return Boolean(flags && flags.healthLocation === true);
  }
  return ALLOWED_FREE_TEXT_DOMAINS.includes(domain);
}

// Returns an action. reply is set only for action 'allow'.
// menu: rights menu. clarification: existing CLARIFICATION. fallback: friendly fallback.
function decideDualGate({ classification, language, disposition, practical } = {}) {
  const lang = languageKey(language);
  if (!classification || typeof classification !== 'object' || Array.isArray(classification)) {
    return { action: 'fallback', reason: 'schema' };
  }
  if (typeof classification.domain !== 'string') return { action: 'fallback', reason: 'schema' };
  if (!DOMAIN_ENUM.includes(classification.domain)) return { action: 'fallback', reason: 'unknown_enum' };
  if (typeof classification.rights !== 'boolean' || typeof classification.sure !== 'boolean' || typeof classification.medical_advice !== 'boolean' || typeof classification.reply !== 'string') {
    return { action: 'fallback', reason: 'schema' };
  }

  const domain = classification.domain;
  const codeClosed = disposition === 'legal' || disposition === 'uncertain';
  if (classification.rights === true || domain === 'rights' || codeClosed) {
    let reason = 'code_legal';
    if (classification.rights === true) reason = 'rights';
    else if (domain === 'rights') reason = 'domain_rights';
    return { action: 'menu', reason };
  }
  if (classification.medical_advice === true) return { action: 'clarification', reason: 'medical_advice' };
  if (domain === 'health_place' && classification.sure !== true) {
    return { action: 'clarification', reason: 'health_place_unsure' };
  }
  if (classification.sure !== true) return { action: 'clarification', reason: 'unsure' };
  if (domain === 'general') return { action: 'clarification', reason: 'general_closed' };
  if (domain === 'health_place' && !(practical && practical.healthLocation === true)) {
    return { action: 'clarification', reason: 'health_place_not_location' };
  }
  if (!domainAllowed(domain, lang, practical)) return { action: 'clarification', reason: 'domain_not_allowed' };
  // Every language, including Hebrew and English: exactly one practical flag
  // must name the same domain. A greeting has no such flag.
  if (!agreedPracticalDomain(practical, domain)) {
    return { action: 'clarification', reason: 'domain_disagreement' };
  }
  if (!classification.reply.trim()) return { action: 'clarification', reason: 'empty_reply' };
  return { action: 'allow', reason: 'agreed', reply: classification.reply };
}

module.exports = {
  ALLOWED_FREE_TEXT_DOMAINS,
  CLOSED_DOMAINS,
  DOMAIN_ENUM,
  GENERAL_DOMAIN_ENABLED,
  NATIVE_REVIEW_LANGUAGES,
  PRACTICAL_DOMAINS,
  PRACTICAL_FLAG_DOMAINS,
  agreedPracticalDomain,
  decideDualGate,
  domainAllowed,
  languageKey,
  parseModelReply,
  responseTextFormat,
};
