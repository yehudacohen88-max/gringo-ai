const { test } = require('node:test');
const assert = require('node:assert/strict');

const managerRepository = require('../src/modules/manager-agent/manager-agent.repository');
const managerService = require('../src/modules/manager-agent/manager-agent.service');
const taskService = require('../src/modules/tasks/task.service');
const { tagCatalog } = require('../src/shared/pilotCatalog');

async function withStubs({ tasks, history }, fn) {
  const saved = [];
  const previousRepo = {
    readUserProfiles: managerRepository.readUserProfiles,
    readConversationHistory: managerRepository.readConversationHistory,
    saveDailyReport: managerRepository.saveDailyReport,
  };
  const previousTasks = taskService.getReportTasks;
  const previousHistory = taskService.getReportTaskHistory;
  managerRepository.readUserProfiles = async () => [];
  managerRepository.readConversationHistory = async () => [];
  managerRepository.saveDailyReport = async (report) => {
    saved.push(report);
    return report;
  };
  taskService.getReportTasks = tasks;
  taskService.getReportTaskHistory = history;
  try {
    return await fn(saved);
  } finally {
    Object.assign(managerRepository, previousRepo);
    taskService.getReportTasks = previousTasks;
    taskService.getReportTaskHistory = previousHistory;
  }
}

const empty = async () => tagCatalog([], 'empty', false);
const unavailable = async () => tagCatalog([], 'unavailable', false);
const throws = async () => {
  throw new Error('Tasks!A1 GOOGLE_SHEETS read failed');
};

function assertUnavailable(error) {
  assert.equal(error.code, 'UNAVAILABLE');
  assert.equal(error.statusCode, 503);
  assert.match(error.message, /unavailable right now/);
  assert.doesNotMatch(error.message, /GOOGLE_SHEETS|Tasks!A1|read failed/);
  return true;
}

for (const [label, failing] of [['unavailable state', unavailable], ['thrown error', throws]]) {
  test(`task read failure (${label}) saves no daily report and reports unavailable`, async () => {
    await withStubs({ tasks: failing, history: empty }, async (saved) => {
      await assert.rejects(() => managerService.generateDailySummary(), assertUnavailable);
      assert.equal(saved.length, 0);
    });
  });

  test(`task history read failure (${label}) saves no daily report and reports unavailable`, async () => {
    await withStubs({ tasks: empty, history: failing }, async (saved) => {
      await assert.rejects(() => managerService.generateDailySummary(), assertUnavailable);
      assert.equal(saved.length, 0);
    });
  });
}

test('empty but valid task sheets still produce and save a zero report', async () => {
  await withStubs({ tasks: empty, history: empty }, async (saved) => {
    const report = await managerService.generateDailySummary();
    assert.equal(saved.length, 1);
    assert.equal(Number(report.tasksCreated), 0);
    assert.equal(Number(report.tasksCompleted), 0);
    assert.equal(Number(report.overdueTasks), 0);
  });
});
