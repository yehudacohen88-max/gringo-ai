const test = require('node:test');
const assert = require('node:assert/strict');

const contactRepository = require('../src/modules/contacts/contact.repository');

let app;

function mockRepository(overrides = {}) {
  contactRepository.findAllContacts = async () => [];
  contactRepository.findContactRecordById = async () => null;
  contactRepository.createContact = async (contact) => contact;
  contactRepository.updateContact = async (rowNumber, contact) => contact;
  contactRepository.createContactHistory = async (history) => history;

  Object.assign(contactRepository, overrides);
}

function createUrl(server, path) {
  const address = server.address();

  return `http://127.0.0.1:${address.port}${path}`;
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

test('GET /api/contacts returns contacts from the repository', async () => {
  mockRepository({
    findAllContacts: async () => [
      {
        contact_id: 'con_test_001',
        first_name: 'Daniel',
        email: 'daniel@example.com',
      },
    ],
  });

  await withServer(async (server) => {
    const response = await fetch(createUrl(server, '/api/contacts'));
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.data.length, 1);
    assert.equal(body.data[0].contact_id, 'con_test_001');
  });
});

test('GET /api/contacts filters by search, status, source, and country', async () => {
  mockRepository({
    findAllContacts: async () => [
      {
        contact_id: 'con_test_001',
        first_name: 'Daniel',
        email: 'daniel@example.com',
        phone: '+972501234567',
        status: 'new',
        source: 'manual',
        country: 'Israel',
      },
      {
        contact_id: 'con_test_002',
        first_name: 'Maria',
        email: 'maria@example.com',
        phone: '+12025550111',
        status: 'engaged',
        source: 'event',
        country: 'Spain',
      },
    ],
  });

  await withServer(async (server) => {
    const response = await fetch(createUrl(server, '/api/contacts?search=daniel&status=new&source=manual&country=israel'));
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.data.length, 1);
    assert.equal(body.data[0].contact_id, 'con_test_001');
  });
});

test('POST /api/contacts creates a valid contact', async () => {
  let savedContact;
  let savedHistory;

  mockRepository({
    createContact: async (contact) => {
      savedContact = contact;
      return contact;
    },
    createContactHistory: async (history) => {
      savedHistory = history;
      return history;
    },
  });

  await withServer(async (server) => {
    const response = await fetch(createUrl(server, '/api/contacts'), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        first_name: ' Daniel ',
        last_name: ' Cohen ',
        email: 'DANIEL@EXAMPLE.COM',
      }),
    });
    const body = await response.json();

    assert.equal(response.status, 201);
    assert.equal(body.data.first_name, 'Daniel');
    assert.equal(body.data.last_name, 'Cohen');
    assert.equal(body.data.email, 'daniel@example.com');
    assert.equal(body.data.status, 'new');
    assert.equal(savedContact.contact_id.startsWith('con_'), true);
    assert.equal(savedHistory.event_type, 'contact_created');
  });
});

test('POST /api/contacts returns validation errors', async () => {
  mockRepository();

  await withServer(async (server) => {
    const response = await fetch(createUrl(server, '/api/contacts'), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        first_name: '',
      }),
    });
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.equal(body.error.message, 'Contact validation failed.');
    assert.ok(body.error.details.includes('first_name is required.'));
  });
});

test('POST /api/contacts returns a clear error for invalid JSON', async () => {
  mockRepository();

  await withServer(async (server) => {
    const response = await fetch(createUrl(server, '/api/contacts'), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: '{"first_name":',
    });
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.equal(body.error.message, 'Invalid JSON request body.');
  });
});

test('PUT /api/contacts/:contactId updates an existing contact and creates history', async () => {
  let updatedContact;
  let savedHistory;

  mockRepository({
    findContactRecordById: async () => ({
      rowNumber: 2,
      contact: {
        contact_id: 'con_test_001',
        first_name: 'Daniel',
        last_name: '',
        display_name: 'Daniel',
        email: 'daniel@example.com',
        phone: '+972501234567',
        status: 'new',
        source: 'manual',
        country: 'Israel',
        history_count: '1',
        notes_count: '0',
        created_at: '2026-06-25T10:00:00Z',
        updated_at: '2026-06-25T10:00:00Z',
        archived_at: '',
      },
    }),
    updateContact: async (rowNumber, contact) => {
      updatedContact = contact;
      return contact;
    },
    createContactHistory: async (history) => {
      savedHistory = history;
      return history;
    },
  });

  await withServer(async (server) => {
    const response = await fetch(createUrl(server, '/api/contacts/con_test_001'), {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        first_name: 'Daniel',
        email: 'daniel.new@example.com',
        phone: '+972501234567',
      }),
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.data.email, 'daniel.new@example.com');
    assert.equal(updatedContact.history_count, 2);
    assert.equal(savedHistory.event_type, 'contact_updated');
  });
});

test('POST /api/contacts/:contactId/archive archives an existing contact and creates history', async () => {
  let archivedContact;
  let savedHistory;

  mockRepository({
    findContactRecordById: async () => ({
      rowNumber: 2,
      contact: {
        contact_id: 'con_test_001',
        first_name: 'Daniel',
        email: 'daniel@example.com',
        phone: '+972501234567',
        status: 'new',
        source: 'manual',
        history_count: '1',
        created_at: '2026-06-25T10:00:00Z',
        updated_at: '2026-06-25T10:00:00Z',
        archived_at: '',
      },
    }),
    updateContact: async (rowNumber, contact) => {
      archivedContact = contact;
      return contact;
    },
    createContactHistory: async (history) => {
      savedHistory = history;
      return history;
    },
  });

  await withServer(async (server) => {
    const response = await fetch(createUrl(server, '/api/contacts/con_test_001/archive'), {
      method: 'POST',
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.data.status, 'archived');
    assert.ok(archivedContact.archived_at);
    assert.equal(savedHistory.event_type, 'contact_archived');
  });
});
