const serviceRepository = require('./service.repository');
const { SERVICE_CATEGORIES } = require('./service.model');
const { SAMPLE_SERVICES } = require('./sample-services');

const STATIC_SERVICE_NOTICE = 'Service directory details may have changed. This is not confirmation that the service is currently available; check the provider or relevant official source before you go, pay, or rely on opening hours.';
const GOVERNMENT_SERVICE_NOTICE = 'Government and public-service requirements may have changed. Check the relevant official source before acting.';

function cleanText(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function normalize(value) {
  return cleanText(value).toLowerCase();
}

function splitList(value) {
  return cleanText(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeWords(value) {
  return normalize(value)
    .replace(/[^a-z0-9\u0590-\u05ff\s-]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const WEAK_SERVICE_TERMS = new Set([
  'best',
  'better',
  'buy',
  'cheap',
  'help',
  'pay',
  'problem',
  'service',
  'use',
]);

function termMatches(text, term) {
  const normalizedText = normalizeWords(text);
  const normalizedTerm = normalizeWords(term);
  if (!normalizedText || !normalizedTerm) return false;
  const escapedTerm = normalizedTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  return new RegExp(`(^|\\b)${escapedTerm}(\\b|$)`, 'i').test(normalizedText);
}

function serviceRelevanceText(service = {}) {
  return `${service.title || ''} ${service.description || ''} ${service.category || ''} ${service.tags || ''}`;
}

function hasCurrentVerificationMetadata(service = {}) {
  const freshness = normalize(service.freshnessStatus || service.currentStatus || service.availabilityStatus);
  return ['current', 'verified_current', 'live', 'currently_verified'].includes(freshness);
}

function formatVerificationLabel(service = {}) {
  return hasCurrentVerificationMetadata(service)
    ? 'Current verification metadata: Yes'
    : `Directory trust flag: ${service.verified || 'No current verification metadata'}`;
}

function formatFreshnessNotice(services = []) {
  const visibleServices = services.slice(0, 5);
  if (visibleServices.length && visibleServices.every(hasCurrentVerificationMetadata)) {
    return 'These entries include current verification metadata from the source record. Confirm final details with the provider before you go or pay.';
  }

  const hasGovernmentService = visibleServices.some((service) => normalize(service.category) === 'government');
  return hasGovernmentService
    ? `${GOVERNMENT_SERVICE_NOTICE} ${STATIC_SERVICE_NOTICE}`
    : STATIC_SERVICE_NOTICE;
}

function hasPositiveServiceRelevance(service = {}, search = {}) {
  const query = cleanText(search.query);
  const category = cleanText(search.category);
  const normalizedCategory = normalize(category);

  if (!category) return false;

  if (normalize(service.category) !== normalizedCategory) return false;

  const serviceText = serviceRelevanceText(service);
  const categoryTerms = splitList(category).flatMap((term) => term.split(/\s+/)).filter(Boolean);
  const strongCategoryTerm = categoryTerms.some((term) => !WEAK_SERVICE_TERMS.has(normalize(term)) && termMatches(query, term));

  return termMatches(query, category) || strongCategoryTerm || termMatches(serviceText, category);
}

function generateId(prefix) {
  const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, '');
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${timestamp}_${random}`;
}

async function readServicesWithFallback() {
  try {
    const services = await serviceRepository.findAllServices();
    return services.length ? services : SAMPLE_SERVICES;
  } catch (error) {
    return SAMPLE_SERVICES;
  }
}

function buildService(input = {}) {
  return {
    id: cleanText(input.id) || generateId('svc'),
    category: cleanText(input.category),
    title: cleanText(input.title),
    description: cleanText(input.description),
    city: cleanText(input.city),
    country: cleanText(input.country),
    languages: cleanText(input.languages),
    phone: cleanText(input.phone),
    website: cleanText(input.website),
    address: cleanText(input.address),
    openingHours: cleanText(input.openingHours),
    priceLevel: cleanText(input.priceLevel),
    verified: cleanText(input.verified) || 'No',
    rating: cleanText(input.rating),
    tags: cleanText(input.tags),
  };
}

function validationError(message, details = []) {
  const error = new Error(message);
  error.statusCode = 400;
  error.details = details;
  return error;
}

function validateService(service) {
  const errors = [];
  if (!service.title) errors.push('title is required.');
  if (!SERVICE_CATEGORIES.includes(service.category)) errors.push('category is invalid.');
  if (!service.city) errors.push('city is required.');
  return errors;
}

async function createService(input = {}) {
  const service = buildService(input);
  const errors = validateService(service);
  if (errors.length) throw validationError('Service validation failed.', errors);
  try {
    return serviceRepository.createService(service);
  } catch (error) {
    return service;
  }
}

async function getServices(filters = {}) {
  const services = await readServicesWithFallback();
  const category = normalize(filters.category);
  const city = normalize(filters.city);
  const language = normalize(filters.language);

  return services.filter((service) => {
    if (category && normalize(service.category) !== category) return false;
    if (city && normalize(service.city) !== city) return false;
    if (language && !normalize(service.languages).includes(language)) return false;
    return true;
  });
}

function scoreService(service, userProfile = {}, search = {}) {
  let score = 0;
  const reasons = [];
  const serviceText = normalize(`${service.title} ${service.description} ${service.tags} ${service.category}`);
  const language = normalize(search.language || userProfile.preferredLanguage || userProfile.language);
  const country = normalize(search.country || userProfile.country);
  const city = normalize(search.city || userProfile.city);
  const profession = normalize(userProfile.preferredJobProfession || userProfile.profession);
  const sector = normalize(userProfile.workSector);
  const activeGoals = splitList(userProfile.activeGoals);
  const previousCategory = normalize(userProfile.lastServiceCategory);
  const previousCity = normalize(userProfile.lastServiceCity);

  if (search.category && normalize(service.category) === normalize(search.category)) {
    score += 80;
    reasons.push(`${service.category} match`);
  }

  if (language && normalize(service.languages).includes(language)) {
    score += 45;
    reasons.push(`Speaks ${search.language || userProfile.preferredLanguage || userProfile.language}`);
  }

  if (city && normalize(service.city) === city) {
    score += 40;
    reasons.push(`Near ${service.city}`);
  }

  if (country && (normalize(service.country) === country || serviceText.includes(country))) {
    score += 20;
    reasons.push(`Relevant to ${search.country || userProfile.country}`);
  }

  if (profession && serviceText.includes(profession)) score += 15;
  if (sector && serviceText.includes(sector)) score += 15;
  if (previousCategory && normalize(service.category) === previousCategory) score += 10;
  if (previousCity && normalize(service.city) === previousCity) score += 10;

  if (activeGoals.includes('Find Housing') && ['Housing Services', 'SIM Card', 'Transportation'].includes(service.category)) {
    score += 35;
    reasons.push('Useful after a housing search');
  }

  if (activeGoals.includes('Find Job') && ['Construction Equipment', 'Lawyer', 'Medical'].includes(service.category)) {
    score += 35;
    reasons.push('Useful for your work goal');
  }

  if (search.priceLevel && normalize(service.priceLevel) === normalize(search.priceLevel)) {
    score += 20;
    reasons.push(`${service.priceLevel} price`);
  }

  if (service.verified === 'Yes') score += 10;
  score += Number(service.rating || 0);

  return {
    score,
    reason: reasons[0] || 'Relevant service',
  };
}

async function findMatchingServices(userProfile = {}, search = {}) {
  const services = await readServicesWithFallback();
  return services
    .filter((service) => hasPositiveServiceRelevance(service, search))
    .map((service) => ({
      ...service,
      match: scoreService(service, userProfile, search),
    }))
    .filter((service) => service.match.score > 0)
    .sort((a, b) => b.match.score - a.match.score);
}

async function getServiceById(id) {
  const services = await readServicesWithFallback();
  return services.find((service) => service.id === id) || null;
}

function formatServicesForChat(services = []) {
  if (!services.length) {
    return 'I did not find a matching trusted service yet. Which city or language should I search for?';
  }

  const lines = services.slice(0, 5).map((service, index) => {
    return [
      `${index + 1}. ${service.title}`,
      `${service.category} | Rating: ${service.rating || '-'} | ${formatVerificationLabel(service)}`,
      `Phone: ${service.phone || '-'}`,
      `Address: ${service.address || service.city || '-'}`,
      `Languages: ${service.languages || '-'}`,
      `Opening hours: ${service.openingHours || '-'}`,
      `Match: ${service.match?.reason || 'Relevant service'}`,
    ].join('\n');
  });

  return `I found services that may help you:\n${lines.join('\n\n')}\n${formatFreshnessNotice(services)}`;
}

function inferServiceSearch(message = '', userProfile = {}) {
  const normalized = normalize(message);
  const search = {
    query: cleanText(message),
    city: '',
    language: '',
    country: '',
    category: '',
    priceLevel: '',
  };

  if (/\bthai\b|[\u0e00-\u0e7f]/.test(normalized)) search.language = 'Thai';
  if (/\btel aviv\b|\u05ea\u05dc \u05d0\u05d1\u05d9\u05d1/.test(normalized)) search.city = 'Tel Aviv';
  if (/\bcheap|low cost|low-cost\b/.test(normalized)) search.priceLevel = 'Low';
  if (/\bdoctor|clinic|medical|health\b/.test(normalized)) search.category = 'Medical';
  else if (/\blawyer|legal|rights attorney\b/.test(normalized)) search.category = 'Lawyer';
  else if (/\bsim|sim card|mobile|phone card\b/.test(normalized)) search.category = 'SIM Card';
  else if (/\btransport|transportation|bus|ride|taxi\b/.test(normalized)) search.category = 'Transportation';
  else if (/\binsurance\b/.test(normalized)) search.category = 'Insurance';
  else if (/\bfood|restaurant|thai food\b/.test(normalized)) search.category = 'Food';
  else if (/\bembassy\b/.test(normalized)) search.category = 'Embassy';
  else if (/\bgovernment|office|ministry|translation|tax service|tax services\b/.test(normalized)) search.category = 'Government';
  else if (/\brecruitment|agency\b/.test(normalized)) search.category = 'Recruitment';
  else if (/\bmoving|furniture|housing service\b/.test(normalized)) search.category = 'Housing Services';
  else if (/\bconstruction equipment|work clothing|tools|safety shoes\b/.test(normalized)) search.category = 'Construction Equipment';

  if (!search.city) search.city = userProfile.lastServiceCity || userProfile.city || '';
  if (!search.language) search.language = userProfile.preferredLanguage || userProfile.language || '';
  if (!search.country) search.country = userProfile.country || '';

  return search;
}

function isServiceMessage(message = '') {
  return /\b(doctor|clinic|medical|lawyer|legal|insurance|sim card|sim|transportation|transport|taxi|bus|food|bank|banking|government office|embassy|translation|tax service|recruitment|service|where can i buy)\b/.test(
    normalize(message)
  );
}

module.exports = {
  SERVICE_CATEGORIES,
  GOVERNMENT_SERVICE_NOTICE,
  STATIC_SERVICE_NOTICE,
  createService,
  findMatchingServices,
  formatServicesForChat,
  getServiceById,
  getServices,
  hasPositiveServiceRelevance,
  inferServiceSearch,
  isServiceMessage,
};
