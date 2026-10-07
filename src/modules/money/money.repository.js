const { env } = require('../../config/env');
const { readSheetRows } = require('../../config/googleSheets');
const { EXCHANGE_RATE_FIELDS } = require('./exchange-rate.model');
const { MONEY_TRANSFER_PROVIDER_FIELDS } = require('./money-transfer-provider.model');

function rowToObject(fields, row) {
  return fields.reduce((record, field, index) => {
    record[field] = row[index] ?? '';
    return record;
  }, {});
}

function hasValues(record) {
  return Object.values(record).some((value) => String(value).trim() !== '');
}

async function findAllExchangeRates() {
  const rows = await readSheetRows(env.googleSheets.sheets.exchangeRates);
  return rows.slice(1).map((row) => rowToObject(EXCHANGE_RATE_FIELDS, row)).filter(hasValues);
}

async function findAllProviders() {
  const rows = await readSheetRows(env.googleSheets.sheets.moneyTransferProviders);
  return rows.slice(1).map((row) => rowToObject(MONEY_TRANSFER_PROVIDER_FIELDS, row)).filter(hasValues);
}

module.exports = {
  findAllExchangeRates,
  findAllProviders,
};
