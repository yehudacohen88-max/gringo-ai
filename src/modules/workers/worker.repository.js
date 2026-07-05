const { env } = require('../../config/env');
const { appendSheetRow, readSheetRows, updateSheetRow } = require('../../config/googleSheets');
const { WORKER_FIELDS } = require('./worker.model');
const { WORKER_HISTORY_FIELDS } = require('./workerHistory.model');

function rowToWorker(row) {
  return WORKER_FIELDS.reduce((worker, field, index) => {
    worker[field] = row[index] ?? '';
    return worker;
  }, {});
}

function workerToRow(worker) {
  return WORKER_FIELDS.map((field) => worker[field] ?? '');
}

function historyToRow(history) {
  return WORKER_HISTORY_FIELDS.map((field) => history[field] ?? '');
}

function rowToWorkerRecord(row, index) {
  return {
    worker: rowToWorker(row),
    rowNumber: index + 2,
  };
}

async function findAllWorkerRecords() {
  const rows = await readSheetRows(env.googleSheets.sheets.workers);
  const dataRows = rows.slice(1);

  return dataRows
    .map(rowToWorkerRecord)
    .filter((record) => Object.values(record.worker).some((cell) => String(cell).trim() !== ''));
}

async function findAllWorkers() {
  const records = await findAllWorkerRecords();
  return records.map((record) => record.worker);
}

async function findWorkerRecordById(workerId) {
  const records = await findAllWorkerRecords();
  return records.find((record) => record.worker.worker_id === workerId) || null;
}

async function createWorker(worker) {
  await appendSheetRow(env.googleSheets.sheets.workers, workerToRow(worker));
  return worker;
}

async function updateWorker(rowNumber, worker) {
  await updateSheetRow(env.googleSheets.sheets.workers, rowNumber, workerToRow(worker));
  return worker;
}

async function createWorkerHistory(history) {
  await appendSheetRow(env.googleSheets.sheets.workerHistory, historyToRow(history));
  return history;
}

module.exports = {
  createWorker,
  createWorkerHistory,
  findAllWorkers,
  findWorkerRecordById,
  updateWorker,
};
