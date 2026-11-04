const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const adminService = require('../src/modules/admin/admin.service');
const managerRepository = require('../src/modules/manager-agent/manager-agent.repository');
const managerService = require('../src/modules/manager-agent/manager-agent.service');

const DEMO_MARKERS = /Somchai|usr_somchai|972500000000|UlineSomchai|conv_admin_sample|draft_admin_sample|rec_admin_sample|Hello Somchai/;

function withEnv(updates, fn) {
  const previous = {};
  for (const [key, value] of Object.entries(updates)) {
    previous[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    });
}

async function withRepo(methods, fn) {
  const previous = {};
  for (const [name, impl] of Object.entries(methods)) {
    previous[name] = managerRepository[name];
    managerRepository[name] = impl;
  }
  try {
    return await fn();
  } finally {
    Object.assign(managerRepository, previous);
  }
}

describe('pilot demo cleanup', { concurrency: 1 }, () => {

test('worker chat source does not greet a sample user', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/public/chat.js'), 'utf8');
  assert.doesNotMatch(source, /Hello Somchai/);
  assert.match(source, /function profileGreetingName/);
  assert.match(source, /usr_somchai/);
  assert.match(source, /Hello \{name\}/);
  assert.match(source, /שלום \{name\}/);
});

test('admin form does not prefill the sample user id', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/public/admin.html'), 'utf8');
  assert.doesNotMatch(source, /value="usr_somchai"/);
});

test('production admin dashboard stays empty of demo people when the demo flag is set', async () => {
  await withEnv({ NODE_ENV: 'production', GRINGO_DEMO_DATA: 'true' }, async () => {
    const dashboard = await adminService.getDashboard();
    const text = JSON.stringify(dashboard);
    assert.equal(dashboard.availability.profiles, 'unavailable');
    assert.equal(dashboard.demo, false);
    assert.doesNotMatch(text, DEMO_MARKERS);
  });
});

test('a hosted runtime ignores the admin demo flag', async () => {
  await withEnv({ NODE_ENV: 'test', VERCEL: '1', GRINGO_DEMO_DATA: 'true' }, async () => {
    const dashboard = await adminService.getDashboard();
    assert.equal(dashboard.demo, false);
    assert.doesNotMatch(JSON.stringify(dashboard), DEMO_MARKERS);
  });
});

test('an empty admin profile sheet returns no fictitious workers', async () => {
  await withRepo({
    readUserProfiles: async () => [],
    readConversationHistory: async () => [],
  }, async () => {
    const dashboard = await adminService.getDashboard();
    assert.equal(dashboard.availability.profiles, 'empty');
    assert.equal(dashboard.availability.conversations, 'empty');
    assert.deepEqual(dashboard.activeNeeds, []);
    assert.doesNotMatch(JSON.stringify(dashboard), DEMO_MARKERS);
  });
});

test('an admin profile read failure is unavailable and not a demo report', async () => {
  await withRepo({
    readUserProfiles: async () => {
      throw new Error('GOOGLE_SHEETS Users!A1 missing');
    },
    readConversationHistory: async () => {
      throw new Error('spreadsheet Conversations!A1 denied');
    },
  }, async () => {
    const dashboard = await adminService.getDashboard();
    const text = JSON.stringify(dashboard);
    assert.equal(dashboard.availability.profiles, 'unavailable');
    assert.equal(dashboard.availability.conversations, 'unavailable');
    assert.equal(dashboard.demo, false);
    assert.doesNotMatch(text, DEMO_MARKERS);
    assert.doesNotMatch(text, /GOOGLE_SHEETS|Users!A1|Conversations!A1/);
  });
});

test('development admin demo data is labelled', async () => {
  await withEnv({ NODE_ENV: 'test', GRINGO_DEMO_DATA: 'true' }, () => withRepo({
    readUserProfiles: async () => [],
    readConversationHistory: async () => [],
    readRecommendations: async () => [],
    readDailyReports: async () => [],
  }, async () => {
    const dashboard = await adminService.getDashboard();
    assert.equal(dashboard.demo, true);
    assert.equal(dashboard.availability.profiles, 'demo');
    assert.equal(dashboard.activeNeeds[0].demo, true);
    assert.match(dashboard.activeNeeds[0].demoLabel, /Demo data only/);
    assert.equal(dashboard.activeNeeds[0].userId, 'usr_somchai');
  }));
});

test('a manager daily report does not use the sample user when sheets fail', async () => {
  await withEnv({ NODE_ENV: 'production', GRINGO_DEMO_DATA: 'true' }, async () => {
    await assert.rejects(
      () => managerService.generateDailySummary(),
      (error) => {
        assert.equal(error.code, 'UNAVAILABLE');
        assert.match(error.message, /unavailable right now/);
        assert.doesNotMatch(error.message, DEMO_MARKERS);
        assert.doesNotMatch(error.message, /GOOGLE_SHEETS/);
        return true;
      }
    );
  });
});

test('a manager weekly report is not replaced with a fictitious local report', async () => {
  await assert.rejects(
    () => managerService.generateWeeklySummary(),
    (error) => {
      assert.equal(error.code, 'UNAVAILABLE');
      assert.doesNotMatch(error.message, /Local fallback weekly report|Rights, Housing, Money|usr_somchai/);
      return true;
    }
  );
});

test('an empty manager profile sheet produces an empty report without the sample user', async () => {
  const taskService = require('../src/modules/tasks/task.service');
  const { tagCatalog } = require('../src/shared/pilotCatalog');
  const previousTasks = taskService.getReportTasks;
  const previousHistory = taskService.getReportTaskHistory;
  taskService.getReportTasks = async () => tagCatalog([], 'empty', false);
  taskService.getReportTaskHistory = async () => tagCatalog([], 'empty', false);
  try {
  await withRepo({
    readUserProfiles: async () => [],
    readConversationHistory: async () => [],
    saveDailyReport: async (report) => report,
  }, async () => {
    const report = await managerService.generateDailySummary();
    const text = JSON.stringify(report);
    assert.equal(report.newUsers, 0);
    assert.doesNotMatch(text, DEMO_MARKERS);
  });
  } finally {
    taskService.getReportTasks = previousTasks;
    taskService.getReportTaskHistory = previousHistory;
  }
});

});
