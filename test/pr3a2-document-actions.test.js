const test = require('node:test');
const assert = require('node:assert/strict');

const documentService = require('../src/modules/documents/document.service');
const { assertHidden, withUsers } = require('./pr3a2-helpers');

const forged = { 'x-user-id': 'usr_forged', 'x-channel-user-id': 'web_forged' };

async function seed(ada, bo) {
  const own = await documentService.createDocument(
    { documentType: 'Passport', documentNumber: 'ADA999888', expiryDate: '2099-05-01', notes: `${ada.fullName} document` },
    { ownerUserId: ada.userId }
  );
  const other = await documentService.createDocument(
    { documentType: 'Visa', documentNumber: 'BO111222', expiryDate: '2099-06-01', notes: `${bo.fullName} document` },
    { ownerUserId: bo.userId }
  );
  return { own, other };
}

test('document create ignores client owner fields and masks the number', async () => {
  await withUsers(async ({ ada, bo, api }) => {
    const created = await api(ada, 'POST', '/api/documents', {
      documentType: 'Passport',
      documentNumber: 'ADA999888',
      expiryDate: '2099-05-01',
      notes: `${ada.fullName} document`,
      userId: bo.userId,
      ownerUserId: bo.userId,
      documentId: 'doc_client_chosen',
      channel: 'web',
    });
    assert.equal(created.response.status, 201, JSON.stringify(created.body));
    assert.equal(created.body.document.userId, ada.userId);
    assert.notEqual(created.body.document.documentId, 'doc_client_chosen');
    assert.equal(JSON.stringify(created.body).includes('ADA999888'), false);
  });
});

test('document list, alerts, and history stay on the signed profile', async () => {
  await withUsers(async ({ ada, bo, api }) => {
    await seed(ada, bo);
    for (const path of [`/api/documents?userId=${encodeURIComponent(bo.userId)}`, '/api/documents/alerts', '/api/documents/history']) {
      const response = await api(ada, 'GET', path, undefined, forged);
      assert.equal(response.response.status, 200, path);
      assert.equal(JSON.stringify(response.body).includes(bo.fullName), false, path);
      assert.equal(JSON.stringify(response.body).includes('BO111222'), false, path);
    }
  });
});

test('document update ignores forged owner fields', async () => {
  await withUsers(async ({ ada, bo, api }) => {
    const { own, other } = await seed(ada, bo);
    const denied = await api(ada, 'PUT', `/api/documents/${encodeURIComponent(other.documentId)}`, {
      notes: 'stolen',
      userId: ada.userId,
      ownerUserId: ada.userId,
    }, forged);
    assertHidden(assert, denied.response, denied.body, bo.fullName);
    assert.equal((await documentService.getDocumentById(other.documentId)).notes, `${bo.fullName} document`);
    const allowed = await api(ada, 'PUT', `/api/documents/${encodeURIComponent(own.documentId)}`, {
      notes: `${ada.fullName} edited`,
      userId: bo.userId,
      ownerUserId: bo.userId,
    });
    assert.equal(allowed.response.status, 200, JSON.stringify(allowed.body));
    assert.equal(allowed.body.document.userId, ada.userId);
    assert.equal(allowed.body.document.notes, `${ada.fullName} edited`);
  });
});

test('document renew does not change another user', async () => {
  await withUsers(async ({ ada, bo, api }) => {
    const { own, other } = await seed(ada, bo);
    const denied = await api(bo, 'POST', `/api/documents/${encodeURIComponent(own.documentId)}/renew`, {
      newExpiryDate: '2099-12-01',
      userId: bo.userId,
      ownerUserId: bo.userId,
    }, forged);
    assertHidden(assert, denied.response, denied.body, ada.fullName);
    assert.equal((await documentService.getDocumentById(own.documentId)).expiryDate, '2099-05-01');
    const allowed = await api(ada, 'POST', `/api/documents/${encodeURIComponent(own.documentId)}/renew`, {
      newExpiryDate: '2099-08-01',
      userId: bo.userId,
    });
    assert.equal(allowed.response.status, 200, JSON.stringify(allowed.body));
    assert.equal(allowed.body.document.expiryDate, '2099-08-01');
    assert.equal(allowed.body.document.userId, ada.userId);
    assert.equal(allowed.body.history.every((event) => event.userId === ada.userId), true);
  });
});

test('document archive does not change another user', async () => {
  await withUsers(async ({ ada, bo, api }) => {
    const { own, other } = await seed(ada, bo);
    const denied = await api(ada, 'POST', `/api/documents/${encodeURIComponent(other.documentId)}/archive`, { userId: ada.userId, ownerUserId: ada.userId }, forged);
    assertHidden(assert, denied.response, denied.body, bo.fullName);
    assert.notEqual((await documentService.getDocumentById(other.documentId)).status, 'Archived');
    const allowed = await api(ada, 'POST', `/api/documents/${encodeURIComponent(own.documentId)}/archive`, { userId: bo.userId });
    assert.equal(allowed.response.status, 200, JSON.stringify(allowed.body));
    assert.equal(allowed.body.document.status, 'Archived');
    assert.equal(allowed.body.document.userId, ada.userId);
  });
});

test('one document history is withheld until the document is owned', async () => {
  await withUsers(async ({ ada, bo, api }) => {
    const { own } = await seed(ada, bo);
    const denied = await api(bo, 'GET', `/api/documents/${encodeURIComponent(own.documentId)}/history`, undefined, forged);
    assertHidden(assert, denied.response, denied.body, ada.fullName);
    const allowed = await api(ada, 'GET', `/api/documents/${encodeURIComponent(own.documentId)}/history`);
    assert.equal(allowed.response.status, 200);
    assert.equal(allowed.body.history.every((event) => event.userId === ada.userId), true);
  });
});
