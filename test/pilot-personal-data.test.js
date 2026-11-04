const test = require('node:test');
const assert = require('node:assert/strict');

const { employmentSalaryAgent, healthLifeCommunityAgent } = require('../src/modules/agents');
const { coreAgentService } = require('../src/modules/core-agent');
const { crmAgentService } = require('../src/modules/crm-agent');
const documentRepository = require('../src/modules/documents/document.repository');
const documentService = require('../src/modules/documents/document.service');
const { SAMPLE_DOCUMENTS } = require('../src/modules/documents/sample-documents');
const lineMessageService = require('../src/modules/line/line-message.service');
const taskRepository = require('../src/modules/tasks/task.repository');
const taskService = require('../src/modules/tasks/task.service');
const { SAMPLE_TASKS } = require('../src/modules/tasks/sample-tasks');
const telegramMessageService = require('../src/modules/telegram/telegram-message.service');
const whatsappMessageService = require('../src/modules/whatsapp/whatsapp-message.service');
const { COPY } = require('../src/shared/userFacingCopy');

const SAMPLE_TASK_TEXT = /Call employer|Renew visa|Send 2,000 ILS|task_somchai/;
const SAMPLE_DOCUMENT_TEXT = /doc_somchai|4821|1198/;

function sheetError() {
  const error = new Error('GOOGLE_SHEETS spreadsheet Tasks!A1 failed');
  return error;
}

async function withEnv(updates, fn) {
  const previous = {};
  for (const [key, value] of Object.entries(updates)) {
    previous[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return await fn();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

async function withRepo(repo, methods, fn) {
  const previous = {};
  for (const [name, impl] of Object.entries(methods)) {
    previous[name] = repo[name];
    repo[name] = impl;
  }
  try {
    return await fn();
  } finally {
    Object.assign(repo, previous);
  }
}

function agentTask(capability, domain, input) {
  return {
    taskId: `task_${capability}`,
    requestId: `req_${capability}`,
    conversationId: 'web:personal',
    domain,
    capability,
    priority: 'normal',
    input,
    metadata: {},
    createdAt: '2026-08-01T00:00:00.000Z',
  };
}

async function readyUser(channel, channelUserId) {
  return crmAgentService.findOrCreateUser({
    channel,
    channelUserId,
    fullName: 'Personal Worker',
    country: 'Thailand',
    preferredLanguage: 'en',
    language: 'English',
    workSector: 'Construction',
    profession: 'Guard',
    city: 'Haifa',
    wantsJobAlerts: 'No',
    preferredCurrency: 'THB',
    wantsExchangeRateAlerts: 'No',
    lookingForJob: 'No',
    activeGoals: '',
  });
}

test.describe('personal task and document data stays real', { concurrency: 1 }, () => {
  test('an empty task sheet means this worker has no tasks', async () => {
    await withRepo(taskRepository, { findAllTasks: async () => [] }, async () => {
      const tasks = await taskService.getUserTasks('worker_empty_tasks');
      assert.equal(tasks.catalogState, 'empty');
      assert.deepEqual(tasks, []);
      assert.doesNotMatch(JSON.stringify(tasks), SAMPLE_TASK_TEXT);
      assert.equal(taskService.formatTasksForChat(tasks), `${COPY.catalogEmpty.en} ${COPY.catalogNoInformation.en}`);
    });
  });

  test('a task sheet read error is unavailable and hides sample tasks', async () => {
    await withRepo(taskRepository, { findAllTasks: async () => { throw sheetError(); } }, async () => {
      const tasks = await taskService.getUserTasks('worker_task_down');
      assert.equal(tasks.catalogState, 'unavailable');
      assert.deepEqual(tasks, []);
      assert.match(taskService.formatTasksForChat(tasks), /This service is unavailable right now/);
      assert.doesNotMatch(taskService.formatTasksForChat(tasks), /You do not have any open tasks/);
      assert.doesNotMatch(JSON.stringify(tasks), SAMPLE_TASK_TEXT);
      assert.doesNotMatch(taskService.formatTasksForChat(tasks), /Tasks!A1|GOOGLE_SHEETS/);
    });
  });

  test('an empty document sheet means this worker has no documents', async () => {
    await withRepo(documentRepository, { findAllDocuments: async () => [] }, async () => {
      const documents = await documentService.getUserDocuments('worker_empty_docs');
      assert.equal(documents.catalogState, 'empty');
      assert.deepEqual(documents, []);
      assert.doesNotMatch(JSON.stringify(documents), SAMPLE_DOCUMENT_TEXT);
      assert.match(documentService.formatDocumentsForChat(documents), /No results right now/);
    });
  });

  test('a document sheet read error is unavailable and hides sample documents', async () => {
    await withRepo(documentRepository, { findAllDocuments: async () => { throw sheetError(); } }, async () => {
      const documents = await documentService.getUserDocuments('worker_doc_down');
      assert.equal(documents.catalogState, 'unavailable');
      assert.deepEqual(documents, []);
      assert.match(documentService.formatDocumentsForChat(documents), /This service is unavailable right now/);
      assert.doesNotMatch(documentService.formatDocumentsForChat(documents), /I do not have your document details yet|Missing required/);
      assert.doesNotMatch(JSON.stringify(documents), SAMPLE_DOCUMENT_TEXT);
    });
  });

  test('development demo tasks are labelled and are not written', async () => {
    let writes = 0;
    await withEnv({ NODE_ENV: 'test', GRINGO_DEMO_DATA: 'true' }, () => withRepo(taskRepository, {
      findAllTasks: async () => [],
      createTask: async () => {
        writes += 1;
        return {};
      },
    }, async () => {
      const tasks = await taskService.getUserTasks('usr_somchai');
      assert.equal(tasks.catalogState, 'demo');
      assert.equal(tasks.every((task) => task.demo === true), true);
      assert.match(taskService.formatTasksForChat(tasks), /Demo data only/);
      const other = await taskService.getUserTasks('worker_not_somchai');
      assert.equal(other.length, 0);
      assert.equal(other.some((task) => task.demo), false);
      await assert.rejects(
        () => taskService.createTask(SAMPLE_TASKS[0], { ownerUserId: 'worker_not_somchai' }),
        (error) => error.code === 'DEMO_NOT_STORED'
      );
      assert.equal(writes, 0);
    }));
  });

  test('development demo documents are labelled and are not written', async () => {
    let writes = 0;
    await withEnv({ NODE_ENV: 'test', GRINGO_DEMO_DATA: 'true' }, () => withRepo(documentRepository, {
      findAllDocuments: async () => [],
      createDocument: async () => {
        writes += 1;
        return {};
      },
    }, async () => {
      const documents = await documentService.getUserDocuments('usr_somchai');
      assert.equal(documents.catalogDemo, true);
      assert.equal(documents.every((document) => document.demo === true), true);
      await assert.rejects(
        () => documentService.createDocument(SAMPLE_DOCUMENTS[0], { ownerUserId: 'usr_somchai' }),
        (error) => error.code === 'DEMO_NOT_STORED'
      );
      assert.equal(writes, 0);
    }));
  });

  test('worker A does not see sample tasks or worker B tasks when the sheet fails', async () => {
    await withRepo(taskRepository, {
      findAllTasks: async () => { throw sheetError(); },
      createTask: async () => { throw sheetError(); },
      createTaskHistory: async () => { throw sheetError(); },
    }, async () => {
      const bTask = await taskService.createTask(
        { title: 'B private reminder', dueDate: '2026-12-01', category: 'Personal' },
        { ownerUserId: 'worker_b_tasks' }
      );
      const aTasks = await taskService.getUserTasks('worker_a_tasks');
      const bTasks = await taskService.getUserTasks('worker_b_tasks');
      assert.equal(aTasks.catalogState, 'unavailable');
      assert.equal(aTasks.some((task) => task.title === 'Call employer' || task.taskId === bTask.taskId), false);
      assert.equal(bTasks.some((task) => task.taskId === bTask.taskId), true);
      assert.equal(bTasks.some((task) => task.title === 'Call employer'), false);
    });
  });

  test('worker A does not see sample documents or worker B documents when the sheet fails', async () => {
    await withRepo(documentRepository, {
      findAllDocuments: async () => { throw sheetError(); },
      createDocument: async () => { throw sheetError(); },
      appendHistory: async () => { throw sheetError(); },
    }, async () => {
      const bDocument = await documentService.createDocument(
        { documentType: 'Passport', documentNumber: '7777', expiryDate: '2028-01-01' },
        { ownerUserId: 'worker_b_docs' }
      );
      const aDocuments = await documentService.getUserDocuments('worker_a_docs');
      const bDocuments = await documentService.getUserDocuments('worker_b_docs');
      assert.equal(aDocuments.catalogState, 'unavailable');
      assert.equal(aDocuments.some((document) => document.documentId === 'doc_somchai_passport' || document.documentId === bDocument.documentId), false);
      assert.equal(bDocuments.some((document) => document.documentId === bDocument.documentId), true);
      assert.equal(bDocuments.some((document) => document.documentId === 'doc_somchai_visa'), false);
    });
  });

  test('a demo flag in production does not return sample tasks or documents', async () => {
    await withEnv({ NODE_ENV: 'production', GRINGO_DEMO_DATA: 'true' }, async () => {
      const tasks = await taskService.getUserTasks('usr_somchai');
      const documents = await documentService.getAllDocuments();
      assert.equal(tasks.some((task) => task.taskId === 'task_somchai_call_employer'), false);
      assert.equal(documents.some((document) => document.documentId === 'doc_somchai_passport'), false);
      assert.equal(tasks.catalogDemo, false);
      assert.equal(documents.catalogDemo, false);
    });
  });

  test('a demo flag on a hosted runtime does not return sample tasks', async () => {
    await withEnv({ NODE_ENV: 'test', VERCEL: '1', GRINGO_DEMO_DATA: 'true' }, async () => {
      const tasks = await taskService.getUserTasks('usr_somchai');
      assert.equal(tasks.some((task) => task.title === 'Call employer'), false);
    });
  });

  test('a real task is returned without a demo label', async () => {
    await withRepo(taskRepository, {
      findAllTasks: async () => [{
        ...SAMPLE_TASKS[0],
        taskId: 'task_real_worker',
        userId: 'worker_real',
        title: 'Renew my own visa',
        dueDate: '2026-12-20',
      }],
    }, async () => {
      const tasks = await taskService.getUserTasks('worker_real');
      assert.equal(tasks.catalogState, 'ok');
      assert.equal(tasks[0].title, 'Renew my own visa');
      assert.equal(tasks[0].demo, undefined);
      assert.equal((await taskService.getUserTasks('someone_else')).some((task) => task.taskId === 'task_real_worker'), false);
    });
  });

  test('web chat does not invent tasks when the sheet fails', async () => {
    await readyUser('web', 'personal-web-tasks');
    const response = await coreAgentService.processWebMessage({
      message: 'Show my tasks',
      channel: 'web',
      channelUserId: 'personal-web-tasks',
    });
    assert.equal(response.category, 'Tasks');
    assert.match(response.reply, /This service is unavailable right now/);
    assert.doesNotMatch(response.reply, SAMPLE_TASK_TEXT);
  });

  test('web chat does not invent documents when the sheet fails', async () => {
    await readyUser('web', 'personal-web-docs');
    const response = await coreAgentService.processWebMessage({
      message: 'Show my documents',
      channel: 'web',
      channelUserId: 'personal-web-docs',
    });
    assert.equal(response.category, 'Documents');
    assert.match(response.reply, /This service is unavailable right now/);
    assert.doesNotMatch(response.reply, SAMPLE_DOCUMENT_TEXT);
    assert.doesNotMatch(response.reply, /Missing required documents/);
  });

  test('the employment agent does not invent documents', async () => {
    const result = await employmentSalaryAgent.execute(agentTask('employment.documents', 'employment_salary', {
      userId: 'worker_agent_docs',
    }));
    assert.equal(result.status, 'partial');
    assert.deepEqual(result.output.documents, []);
    assert.match(result.output.message, /This service is unavailable right now/);
    assert.doesNotMatch(JSON.stringify(result), SAMPLE_DOCUMENT_TEXT);
  });

  test('the life agent does not invent documents', async () => {
    const result = await healthLifeCommunityAgent.execute(agentTask('life.general', 'health_life_community', {
      userId: 'worker_life_docs',
      query: 'check my documents',
    }));
    assert.equal(result.output.routedTo, 'documents');
    assert.deepEqual(result.output.documents, []);
    assert.match(result.output.message, /This service is unavailable right now/);
    assert.doesNotMatch(JSON.stringify(result), SAMPLE_DOCUMENT_TEXT);
  });

  test('Telegram tasks and documents do not invent personal records', async () => {
    await readyUser('telegram', 'personal-tg', { telegramUserId: 'personal-tg' });
    const tasks = await telegramMessageService.processTelegramMessage({
      messageText: '/tasks',
      channelUserId: 'personal-tg',
      channelChatId: 'personal-tg-chat',
    });
    const documents = await telegramMessageService.processTelegramMessage({
      messageText: '/documents',
      channelUserId: 'personal-tg',
      channelChatId: 'personal-tg-chat',
    });
    assert.match(tasks.reply, /This service is unavailable right now/);
    assert.match(documents.reply, /This service is unavailable right now/);
    assert.doesNotMatch(`${tasks.reply}\n${documents.reply}`, SAMPLE_TASK_TEXT);
    assert.doesNotMatch(documents.reply, SAMPLE_DOCUMENT_TEXT);
  });

  test('LINE task text does not invent a task', async () => {
    await readyUser('line', 'personal-line', { lineUserId: 'personal-line' });
    const result = await lineMessageService.processTextMessage({
      messageText: 'tasks',
      channelUserId: 'personal-line',
    });
    assert.match(result.reply, /This service is unavailable right now/);
    assert.doesNotMatch(result.reply, SAMPLE_TASK_TEXT);
  });

  test('WhatsApp tasks and documents do not invent personal records', async () => {
    await readyUser('whatsapp', 'personal-wa', { whatsappPhone: 'personal-wa' });
    const tasks = await whatsappMessageService.processTextMessage({
      messageText: 'tasks',
      channelUserId: 'personal-wa',
      phoneNumber: 'personal-wa',
    });
    const documents = await whatsappMessageService.processTextMessage({
      messageText: 'documents',
      channelUserId: 'personal-wa',
      phoneNumber: 'personal-wa',
    });
    assert.match(tasks.reply, /This service is unavailable right now/);
    assert.match(documents.reply, /This service is unavailable right now/);
    assert.doesNotMatch(`${tasks.reply}\n${documents.reply}`, SAMPLE_TASK_TEXT);
    assert.doesNotMatch(documents.reply, SAMPLE_DOCUMENT_TEXT);
  });
});
