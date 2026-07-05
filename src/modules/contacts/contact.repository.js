const { env } = require('../../config/env');
const { appendSheetRow, readContactRows, updateSheetRow } = require('../../config/googleSheets');
const { CONTACT_FIELDS } = require('./contact.model');
const { CONTACT_HISTORY_FIELDS } = require('./contactHistory.model');

function rowToContact(row) {
  return CONTACT_FIELDS.reduce((contact, field, index) => {
    contact[field] = row[index] ?? '';
    return contact;
  }, {});
}

function contactToRow(contact) {
  return CONTACT_FIELDS.map((field) => contact[field] ?? '');
}

function historyToRow(history) {
  return CONTACT_HISTORY_FIELDS.map((field) => history[field] ?? '');
}

function rowToContactRecord(row, index) {
  return {
    contact: rowToContact(row),
    rowNumber: index + 2,
  };
}

async function findAllContacts() {
  const records = await findAllContactRecords();

  return records.map((record) => record.contact);
}

async function findAllContactRecords() {
  const rows = await readContactRows();
  const dataRows = rows.slice(1);

  return dataRows
    .map(rowToContactRecord)
    .filter((record) => Object.values(record.contact).some((cell) => String(cell).trim() !== ''));
}

async function findContactRecordById(contactId) {
  const records = await findAllContactRecords();

  return records.find((record) => record.contact.contact_id === contactId) || null;
}

async function createContact(contact) {
  await appendSheetRow(env.googleSheets.sheets.contacts, contactToRow(contact));
  return contact;
}

async function updateContact(rowNumber, contact) {
  await updateSheetRow(env.googleSheets.sheets.contacts, rowNumber, contactToRow(contact));
  return contact;
}

async function createContactHistory(history) {
  await appendSheetRow(env.googleSheets.sheets.contactHistory, historyToRow(history));
  return history;
}

module.exports = {
  createContact,
  createContactHistory,
  findAllContacts,
  findContactRecordById,
  updateContact,
};
