const { env } = require('../src/config/env');
const { ensureSheetWithHeader } = require('../src/config/googleSheets');
const { EXCHANGE_RATE_FIELDS } = require('../src/modules/money/exchange-rate.model');
const { MONEY_TRANSFER_PROVIDER_FIELDS } = require('../src/modules/money/money-transfer-provider.model');

async function main() {
  await ensureSheetWithHeader(env.googleSheets.sheets.exchangeRates, EXCHANGE_RATE_FIELDS);
  await ensureSheetWithHeader(env.googleSheets.sheets.moneyTransferProviders, MONEY_TRANSFER_PROVIDER_FIELDS);
  console.log(`Money sheets are ready: ${env.googleSheets.sheets.exchangeRates}, ${env.googleSheets.sheets.moneyTransferProviders}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
