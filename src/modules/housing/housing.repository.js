const { env } = require('../../config/env');
const { appendSheetRow, readSheetRows } = require('../../config/googleSheets');
const { HOUSING_FIELDS } = require('./housing.model');

function rowToListing(row) {
  return HOUSING_FIELDS.reduce((listing, field, index) => {
    listing[field] = row[index] ?? '';
    return listing;
  }, {});
}

function listingToRow(listing) {
  return HOUSING_FIELDS.map((field) => listing[field] ?? '');
}

function hasValues(listing) {
  return Object.values(listing).some((value) => String(value).trim() !== '');
}

async function findAllHousingListings() {
  const rows = await readSheetRows(env.googleSheets.sheets.housingListings);
  return rows.slice(1).map(rowToListing).filter(hasValues);
}

async function createHousingListing(listing) {
  await appendSheetRow(env.googleSheets.sheets.housingListings, listingToRow(listing));
  return listing;
}

module.exports = {
  createHousingListing,
  findAllHousingListings,
};
