const { env } = require('../src/config/env');
const { ensureSheetWithHeader } = require('../src/config/googleSheets');
const { HOUSING_FIELDS } = require('../src/modules/housing/housing.model');

async function main() {
  await ensureSheetWithHeader(env.googleSheets.sheets.housingListings, HOUSING_FIELDS);
  console.log(`Housing listings sheet is ready: ${env.googleSheets.sheets.housingListings}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
