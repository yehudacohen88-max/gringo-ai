const housingRepository = require('./housing.repository');
const { HOUSING_STATUSES, HOUSING_TYPES } = require('./housing.model');
const { SAMPLE_HOUSING_LISTINGS } = require('./sample-housing-listings');

const HOUSING_SAFETY_NOTICE = [
  'Verify the landlord or provider before paying.',
  'Do not transfer a large deposit before seeing the property.',
  'Ask for a written agreement.',
  'Gringo does not guarantee the listing.',
].join(' ');

function cleanText(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function normalize(value) {
  return cleanText(value).toLowerCase();
}

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function generateId(prefix) {
  const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, '');
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${timestamp}_${random}`;
}

function buildHousingListing(input = {}) {
  const now = new Date().toISOString();

  return {
    housingId: cleanText(input.housingId) || generateId('house'),
    title: cleanText(input.title),
    housingType: cleanText(input.housingType),
    city: cleanText(input.city),
    area: cleanText(input.area),
    addressText: cleanText(input.addressText),
    monthlyPrice: cleanText(input.monthlyPrice),
    billsIncluded: cleanText(input.billsIncluded),
    depositAmount: cleanText(input.depositAmount),
    availableFrom: cleanText(input.availableFrom),
    numberOfBeds: cleanText(input.numberOfBeds),
    numberOfRooms: cleanText(input.numberOfRooms),
    sharedWithOthers: cleanText(input.sharedWithOthers),
    preferredAudience: cleanText(input.preferredAudience),
    description: cleanText(input.description),
    contactName: cleanText(input.contactName),
    contactMethod: cleanText(input.contactMethod),
    contactValue: cleanText(input.contactValue),
    status: cleanText(input.status) || 'Active',
    createdAt: cleanText(input.createdAt) || now,
    updatedAt: cleanText(input.updatedAt) || now,
  };
}

function validateHousingListing(listing) {
  const errors = [];
  if (!listing.title) errors.push('title is required.');
  if (!HOUSING_TYPES.includes(listing.housingType)) errors.push('housingType is invalid.');
  if (!listing.city) errors.push('city is required.');
  if (!HOUSING_STATUSES.includes(listing.status)) errors.push('status is invalid.');
  return errors;
}

function validationError(errors) {
  const error = new Error('Housing listing validation failed.');
  error.statusCode = 400;
  error.details = errors;
  return error;
}

async function readListingsWithSampleFallback() {
  try {
    const listings = await housingRepository.findAllHousingListings();
    return listings.length > 0 ? listings : SAMPLE_HOUSING_LISTINGS;
  } catch (error) {
    return SAMPLE_HOUSING_LISTINGS;
  }
}

async function createHousingListing(input = {}) {
  const listing = buildHousingListing(input);
  const errors = validateHousingListing(listing);
  if (errors.length > 0) throw validationError(errors);
  return housingRepository.createHousingListing(listing);
}

async function getActiveHousingListings() {
  const listings = await readListingsWithSampleFallback();
  return listings.filter((listing) => listing.status === 'Active');
}

async function getHousingById(housingId) {
  const listings = await readListingsWithSampleFallback();
  return listings.find((listing) => listing.housingId === housingId) || null;
}

function scoreListing(listing, userProfile = {}, searchContext = {}) {
  const preferredCity = normalize(searchContext.city || userProfile.preferredHousingCity || userProfile.city);
  const preferredArea = normalize(searchContext.area || userProfile.preferredHousingArea);
  const preferredType = normalize(searchContext.housingType || userProfile.preferredHousingType);
  const maximumBudget = toNumber(searchContext.maximumMonthlyBudget || userProfile.maximumHousingBudget || userProfile.maximumMonthlyBudget);
  const price = toNumber(listing.monthlyPrice);
  const sameCity = preferredCity && normalize(listing.city) === preferredCity;
  const sameArea = preferredArea && normalize(listing.area) === preferredArea;
  const withinBudget = maximumBudget > 0 && price <= maximumBudget;
  const slightlyAboveBudget = maximumBudget > 0 && price > maximumBudget && price <= maximumBudget * 1.15;
  const matchingType = preferredType && normalize(listing.housingType) === preferredType;

  if (sameCity && withinBudget) return { score: 100, reason: 'Same city and within budget' };
  if (sameArea && withinBudget) return { score: 90, reason: 'Same area and within budget' };
  if (sameCity && slightlyAboveBudget) return { score: 70, reason: 'Same city but slightly above budget' };
  if (preferredArea && normalize(listing.area) !== preferredArea && withinBudget) return { score: 55, reason: 'Nearby area within budget' };
  if (matchingType) return { score: 40, reason: 'Matching housing type' };

  return { score: 0, reason: 'No strong match' };
}

async function findMatchingHousing(userProfile = {}, searchContext = {}) {
  const listings = await getActiveHousingListings();
  return listings
    .map((listing) => ({
      ...listing,
      match: scoreListing(listing, userProfile, searchContext),
    }))
    .filter((listing) => listing.match.score > 0)
    .sort((a, b) => b.match.score - a.match.score);
}

function formatHousingForChat(listings = []) {
  if (!listings.length) {
    return `I did not find matching housing yet. What city, housing type, or budget should I search for? ${HOUSING_SAFETY_NOTICE}`;
  }

  const lines = listings.slice(0, 5).map((listing, index) => {
    return `${index + 1}. ${listing.title} - ${listing.city}. Price: ${listing.monthlyPrice} NIS monthly. Available: ${
      listing.availableFrom
    }. Match: ${listing.match.reason}. Contact: ${listing.contactName || listing.contactMethod || 'Ask Gringo for details'}.`;
  });

  return `I found housing options that may fit you:\n${lines.join('\n')}\nWhich listing would you like to know more about?\n${HOUSING_SAFETY_NOTICE}`;
}

module.exports = {
  HOUSING_SAFETY_NOTICE,
  createHousingListing,
  findMatchingHousing,
  formatHousingForChat,
  getActiveHousingListings,
  getHousingById,
  scoreListing,
};
