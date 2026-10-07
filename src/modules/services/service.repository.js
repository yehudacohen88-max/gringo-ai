const { env } = require('../../config/env');
const { appendSheetRow, readSheetRows } = require('../../config/googleSheets');
const { SERVICE_FIELDS } = require('./service.model');

function rowToService(row) {
  return SERVICE_FIELDS.reduce((service, field, index) => {
    service[field] = row[index] ?? '';
    return service;
  }, {});
}

function serviceToRow(service) {
  return SERVICE_FIELDS.map((field) => service[field] ?? '');
}

function hasValues(service) {
  return Object.values(service).some((value) => String(value).trim() !== '');
}

async function findAllServices() {
  const rows = await readSheetRows(env.googleSheets.sheets.services);
  return rows.slice(1).map(rowToService).filter(hasValues);
}

async function createService(service) {
  await appendSheetRow(env.googleSheets.sheets.services, serviceToRow(service));
  return service;
}

module.exports = {
  createService,
  findAllServices,
};
