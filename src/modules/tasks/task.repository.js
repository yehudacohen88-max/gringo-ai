const { env } = require('../../config/env');
const { appendSheetRow, readSheetRows, updateSheetRow } = require('../../config/googleSheets');
const { TASK_FIELDS, TASK_HISTORY_FIELDS } = require('./task.model');

function rowToTask(row) {
  return TASK_FIELDS.reduce((task, field, index) => {
    task[field] = row[index] ?? '';
    return task;
  }, {});
}

function taskToRow(task) {
  return TASK_FIELDS.map((field) => task[field] ?? '');
}

function rowToTaskHistory(row) {
  return TASK_HISTORY_FIELDS.reduce((event, field, index) => {
    event[field] = row[index] ?? '';
    return event;
  }, {});
}

function taskHistoryToRow(event) {
  return TASK_HISTORY_FIELDS.map((field) => event[field] ?? '');
}

function hasValues(task) {
  return Object.values(task).some((value) => String(value).trim() !== '');
}

async function findAllTasks() {
  const rows = await readSheetRows(env.googleSheets.sheets.userTasks);
  return rows.slice(1).map(rowToTask).filter(hasValues);
}

async function createTask(task) {
  await appendSheetRow(env.googleSheets.sheets.userTasks, taskToRow(task));
  return task;
}

async function updateTask(taskId, task) {
  const rows = await readSheetRows(env.googleSheets.sheets.userTasks);
  const rowIndex = rows.findIndex((row, index) => index > 0 && row[0] === taskId);
  if (rowIndex < 1) return null;
  await updateSheetRow(env.googleSheets.sheets.userTasks, rowIndex + 1, taskToRow(task));
  return task;
}

async function createTaskHistory(event) {
  await appendSheetRow(env.googleSheets.sheets.userTaskHistory, taskHistoryToRow(event));
  return event;
}

async function findAllTaskHistory() {
  const rows = await readSheetRows(env.googleSheets.sheets.userTaskHistory);
  return rows.slice(1).map(rowToTaskHistory).filter(hasValues);
}

module.exports = {
  createTask,
  createTaskHistory,
  findAllTaskHistory,
  findAllTasks,
  updateTask,
};
