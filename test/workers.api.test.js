const test = require('node:test');
const assert = require('node:assert/strict');

const workerRepository = require('../src/modules/workers/worker.repository');

let app;

function createUrl(server, path) {
  const address = server.address();
  return `http://127.0.0.1:${address.port}${path}`;
}

function mockWorkerRepository(overrides = {}) {
  workerRepository.findAllWorkers = async () => [];
  workerRepository.findWorkerRecordById = async () => null;
  workerRepository.createWorker = async (worker) => worker;
  workerRepository.updateWorker = async (rowNumber, worker) => worker;
  workerRepository.createWorkerHistory = async (history) => history;
  Object.assign(workerRepository, overrides);
}

async function withServer(callback) {
  app = app || require('../src/app');
  const server = app.listen(0);

  try {
    await callback(server);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error);
        else resolve();
      });
    });
  }
}

test('POST /api/workers creates a worker and history record', async () => {
  let savedWorker;
  let savedHistory;

  mockWorkerRepository({
    createWorker: async (worker) => {
      savedWorker = worker;
      return worker;
    },
    createWorkerHistory: async (history) => {
      savedHistory = history;
      return history;
    },
  });

  await withServer(async (server) => {
    const response = await fetch(createUrl(server, '/api/workers'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        first_name: 'Juan',
        nationality: 'Mexico',
        phone: '+525512345678',
        profession: 'Cook',
      }),
    });
    const body = await response.json();

    assert.equal(response.status, 201);
    assert.equal(body.data.first_name, 'Juan');
    assert.equal(savedWorker.worker_id.startsWith('wrk_'), true);
    assert.equal(savedHistory.event_type, 'worker_created');
  });
});

test('POST /api/workers returns validation errors', async () => {
  mockWorkerRepository();

  await withServer(async (server) => {
    const response = await fetch(createUrl(server, '/api/workers'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ first_name: 'Juan' }),
    });
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.equal(body.error.message, 'Worker validation failed.');
    assert.ok(body.error.details.includes('nationality is required.'));
  });
});

test('GET /api/workers filters workers', async () => {
  mockWorkerRepository({
    findAllWorkers: async () => [
      {
        worker_id: 'wrk_1',
        first_name: 'Juan',
        nationality: 'Mexico',
        phone: '+525512345678',
        profession: 'Cook',
        current_city: 'Tel Aviv',
        availability: 'immediate',
        status: 'ready',
      },
      {
        worker_id: 'wrk_2',
        first_name: 'Ana',
        nationality: 'Colombia',
        phone: '+5712345678',
        profession: 'Cleaner',
        current_city: 'Haifa',
        availability: 'this_month',
        status: 'screening',
      },
    ],
  });

  await withServer(async (server) => {
    const response = await fetch(
      createUrl(server, '/api/workers?search=cook&status=ready&nationality=mexico&current_city=tel%20aviv')
    );
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.data.length, 1);
    assert.equal(body.data[0].worker_id, 'wrk_1');
  });
});

test('PUT /api/workers/:workerId updates a worker and history record', async () => {
  let savedHistory;

  mockWorkerRepository({
    findWorkerRecordById: async () => ({
      rowNumber: 2,
      worker: {
        worker_id: 'wrk_1',
        first_name: 'Juan',
        nationality: 'Mexico',
        phone: '+525512345678',
        status: 'new',
        availability: 'unknown',
        created_at: '2026-06-28T10:00:00Z',
        updated_at: '2026-06-28T10:00:00Z',
        archived_at: '',
      },
    }),
    createWorkerHistory: async (history) => {
      savedHistory = history;
      return history;
    },
  });

  await withServer(async (server) => {
    const response = await fetch(createUrl(server, '/api/workers/wrk_1'), {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        first_name: 'Juan',
        nationality: 'Mexico',
        phone: '+525512345678',
        status: 'ready',
      }),
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.data.status, 'ready');
    assert.equal(savedHistory.event_type, 'worker_updated');
  });
});

test('POST /api/workers/:workerId/archive archives a worker and history record', async () => {
  let savedHistory;

  mockWorkerRepository({
    findWorkerRecordById: async () => ({
      rowNumber: 2,
      worker: {
        worker_id: 'wrk_1',
        first_name: 'Juan',
        nationality: 'Mexico',
        phone: '+525512345678',
        status: 'ready',
        availability: 'immediate',
        created_at: '2026-06-28T10:00:00Z',
        updated_at: '2026-06-28T10:00:00Z',
        archived_at: '',
      },
    }),
    createWorkerHistory: async (history) => {
      savedHistory = history;
      return history;
    },
  });

  await withServer(async (server) => {
    const response = await fetch(createUrl(server, '/api/workers/wrk_1/archive'), {
      method: 'POST',
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.data.status, 'archived');
    assert.ok(body.data.archived_at);
    assert.equal(savedHistory.event_type, 'worker_archived');
  });
});
