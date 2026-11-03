const { coreAgentService } = require('../core-agent');
const { carryCatalog, publicCatalogFields } = require('../../shared/pilotCatalog');
const { loadWebProfile, sameOwner, sendNotFound, stripClientIdentity } = require('../../shared/webPersonalData');
const { responseLanguage } = require('../../shared/userFacingCopy');
const documentService = require('./document.service');
const taskService = require('../tasks/task.service');

const SAFETY_NOTICE = 'Gringo helps you organize information but does not replace official legal or immigration advice.';

async function ownedDocument(userId, documentId) {
  if (!userId) return null;
  const document = await documentService.getDocumentById(documentId);
  return sameOwner(document, userId) ? document : null;
}

async function refreshSummary(context, profile, userId) {
  const loaded = await documentService.getUserDocuments(userId);
  const documents = carryCatalog(loaded, loaded.filter((document) => sameOwner(document, userId)));
  if (documents.catalogState === 'unavailable') {
    return { documents, summary: { checklist: [] }, unavailable: true };
  }
  const summary = documentService.summarizeDocuments(profile, documents);
  await coreAgentService.updateUserProfile(context, {
    documentsComplete: summary.documentsComplete,
    missingDocumentTypes: summary.missingDocumentTypes,
    expiringDocumentCount: summary.expiringDocumentCount,
    expiredDocumentCount: summary.expiredDocumentCount,
    nextDocumentExpiryDate: summary.nextDocumentExpiryDate,
  });
  return { documents, summary };
}

async function listDocuments(req, res, next) {
  try {
    const { context, profile, userId } = await loadWebProfile(req);
    if (!userId) {
      res.status(200).json({
        documents: [],
        checklist: [],
        summary: { checklist: [] },
        safetyNotice: SAFETY_NOTICE,
      });
      return;
    }
    const { documents, summary, unavailable } = await refreshSummary(context, profile, userId);
    const fields = publicCatalogFields(documents, responseLanguage(req, profile));
    res.status(200).json({
      documents: unavailable ? [] : documents.map(documentService.toSafeDocument),
      checklist: unavailable ? [] : summary.checklist,
      summary,
      safetyNotice: SAFETY_NOTICE,
      ...fields,
    });
  } catch (error) {
    next(error);
  }
}

async function listAlerts(req, res, next) {
  try {
    const { context, profile, userId } = await loadWebProfile(req);
    if (!userId) {
      res.status(200).json({ alerts: [], summary: { checklist: [] }, safetyNotice: SAFETY_NOTICE });
      return;
    }
    const { documents, summary, unavailable } = await refreshSummary(context, profile, userId);
    const fields = publicCatalogFields(documents, responseLanguage(req, profile));
    res.status(200).json({
      alerts: unavailable ? [] : documentService.createDocumentAlerts(profile, documents, 3),
      summary,
      safetyNotice: SAFETY_NOTICE,
      ...fields,
    });
  } catch (error) {
    next(error);
  }
}

async function createDocument(req, res, next) {
  try {
    const { context, profile, userId } = await loadWebProfile(req, { create: true });
    const document = await documentService.createDocument(
      {
        ...stripClientIdentity(req.body, ['documentId']),
      },
      { ownerUserId: userId }
    );
    if (!sameOwner(document, userId)) {
      sendNotFound(res);
      return;
    }
    const { summary } = await refreshSummary(context, profile, userId);
    res.status(201).json({ document: documentService.toSafeDocument(document), summary });
  } catch (error) {
    next(error);
  }
}

async function updateDocument(req, res, next) {
  try {
    const { context, profile, userId } = await loadWebProfile(req);
    const existing = await ownedDocument(userId, req.params.documentId);
    if (!existing) {
      sendNotFound(res);
      return;
    }
    const document = await documentService.updateDocument(req.params.documentId, stripClientIdentity(req.body, ['documentId']), {
      ownerUserId: userId,
    });
    if (!sameOwner(document, userId)) {
      sendNotFound(res);
      return;
    }
    const { summary } = await refreshSummary(context, profile, userId);
    res.status(200).json({ document: documentService.toSafeDocument(document), summary });
  } catch (error) {
    next(error);
  }
}

async function renewDocument(req, res, next) {
  try {
    const { context, profile, userId } = await loadWebProfile(req);
    const existing = await ownedDocument(userId, req.params.documentId);
    if (!existing) {
      sendNotFound(res);
      return;
    }
    const body = stripClientIdentity(req.body);
    const document = await documentService.renewDocument(req.params.documentId, body.newExpiryDate, { ownerUserId: userId });
    if (!sameOwner(document, userId)) {
      sendNotFound(res);
      return;
    }
    await taskService.completeRelatedTasks(userId, 'Documents', req.params.documentId);
    const { documents, summary } = await refreshSummary(context, profile, userId);
    const history = (await documentService.getDocumentHistory(req.params.documentId)).filter((event) => sameOwner(event, userId));
    res.status(200).json({
      document: documentService.toSafeDocument(document),
      summary,
      history,
      alerts: documentService.createDocumentAlerts(profile, documents, 3),
    });
  } catch (error) {
    next(error);
  }
}

async function archiveDocument(req, res, next) {
  try {
    const { context, profile, userId } = await loadWebProfile(req);
    const existing = await ownedDocument(userId, req.params.documentId);
    if (!existing) {
      sendNotFound(res);
      return;
    }
    const document = await documentService.archiveDocument(req.params.documentId, { ownerUserId: userId });
    if (!sameOwner(document, userId)) {
      sendNotFound(res);
      return;
    }
    const { summary } = await refreshSummary(context, profile, userId);
    res.status(200).json({ document: documentService.toSafeDocument(document), summary });
  } catch (error) {
    next(error);
  }
}

async function getHistory(req, res, next) {
  try {
    const { userId } = await loadWebProfile(req);
    if (req.params.documentId) {
      const existing = await ownedDocument(userId, req.params.documentId);
      if (!existing) {
        sendNotFound(res);
        return;
      }
      const history = (await documentService.getDocumentHistory(req.params.documentId)).filter((event) => sameOwner(event, userId));
      res.status(200).json({ history });
      return;
    }
    if (!userId) {
      res.status(200).json({ history: [] });
      return;
    }
    const history = (await documentService.getUserDocumentHistory(userId)).filter((event) => sameOwner(event, userId));
    res.status(200).json({ history });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  archiveDocument,
  createDocument,
  getHistory,
  listAlerts,
  listDocuments,
  renewDocument,
  updateDocument,
};
