const { env } = require('../../config/env');
const { appendSheetRow, readSheetRows } = require('../../config/googleSheets');
const { JOB_FIELDS } = require('./job.model');

function rowToJob(row) {
  return JOB_FIELDS.reduce((job, field, index) => {
    job[field] = row[index] ?? '';
    return job;
  }, {});
}

function jobToRow(job) {
  return JOB_FIELDS.map((field) => job[field] ?? '');
}

function hasValues(job) {
  return Object.values(job).some((value) => String(value).trim() !== '');
}

async function findAllJobs() {
  const rows = await readSheetRows(env.googleSheets.sheets.jobs);
  return rows.slice(1).map(rowToJob).filter(hasValues);
}

async function createJob(job) {
  await appendSheetRow(env.googleSheets.sheets.jobs, jobToRow(job));
  return job;
}

module.exports = {
  createJob,
  findAllJobs,
};
