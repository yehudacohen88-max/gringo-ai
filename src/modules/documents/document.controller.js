const { coreAgentService } = require('../core-agent');
const documentService = require('./document.service');
const taskService = require('../tasks/task.service');

async function getUserContext(req) {
  const onboardingStatus = await coreAgentService.getOnboardingStatus({
    channel: req.query.channel || req.body.channel || 'web',
    channelUserId: req.query.channelUserId || req.body.channelUserId || 'local-web-user',
  });
  return {
    user: onboardingStatus.user,
    profile: onboardingStatus.profile || {},
  };
}

async function updateProfileSummary(req, userContext, documents) {
  const summary = documentService.summarizeDocuments(userContext.profile, documents);
  await coreAgentService.updateUserProfile(
    {
      channel: req.query.channel || req.body.channel || 'web',
      channelUserId: req.query.channelUserId || req.body.channelUserId || 'local-web-user',
    },
    {
      documentsComplete: summary.documentsComplete,
      missingDocumentTypes: summary.missingDocumentTypes,
      expiringDocumentCount: summary.expiringDocumentCount,
      expiredDocumentCount: summary.expiredDocumentCount,
      nextDocumentExpiryDate: summary.nextDocumentExpiryDate,
    }
  );
  return summary;
}

async function listDocuments(req, res, next) {
  try {
    const userContext = await getUserContext(req);
    const documents = await documentService.getUserDocuments(userContext.profile.userId);
    const summary = await updateProfileSummary(req, userContext, documents);

    res.status(200).json({
      documents: documents.map(documentService.toSafeDocument),
      checklist: summary.checklist,
      summary,
      safetyNotice: 'Gringo helps you organize information but does not replace official legal or immigration advice.',
    });
  } catch (error) {
    next(error);
  }
}

async function listAlerts(req, res, next) {
  try {
    const userContext = await getUserContext(req);
    const documents = await documentService.getUserDocuments(userContext.profile.userId);
    const summary = await updateProfileSummary(req, userContext, documents);
    const alerts = documentService.createDocumentAlerts(userContext.profile, documents, 3);

    res.status(200).json({
      alerts,
      summary,
      safetyNotice: 'Gringo helps you organize information but does not replace official legal or immigration advice.',
    });
  } catch (error) {
    next(error);
  }
}

async function createDocument(req, res, next) {
  try {
    const userContext = await getUserContext(req);
    const document = await documentService.createDocument({
      ...req.body,
      userId: userContext.profile.userId,
    });
    const documents = await documentService.getUserDocuments(userContext.profile.userId);
    const summary = await updateProfileSummary(req, userContext, documents);

    res.status(201).json({ document: documentService.toSafeDocument(document), summary });
  } catch (error) {
    next(error);
  }
}

async function updateDocument(req, res, next) {
  try {
    const userContext = await getUserContext(req);
    const document = await documentService.updateDocument(req.params.documentId, req.body);
    const documents = await documentService.getUserDocuments(userContext.profile.userId);
    const summary = await updateProfileSummary(req, userContext, documents);

    res.status(200).json({ document: documentService.toSafeDocument(document), summary });
  } catch (error) {
    next(error);
  }
}

async function renewDocument(req, res, next) {
  try {
    const userContext = await getUserContext(req);
    const document = await documentService.renewDocument(req.params.documentId, req.body.newExpiryDate);
    await taskService.completeRelatedTasks(userContext.profile.userId, 'Documents', req.params.documentId);
    const documents = await documentService.getUserDocuments(userContext.profile.userId);
    const summary = await updateProfileSummary(req, userContext, documents);
    const history = await documentService.getDocumentHistory(req.params.documentId);

    res.status(200).json({
      document: documentService.toSafeDocument(document),
      summary,
      history,
      alerts: documentService.createDocumentAlerts(userContext.profile, documents, 3),
    });
  } catch (error) {
    next(error);
  }
}

async function archiveDocument(req, res, next) {
  try {
    const userContext = await getUserContext(req);
    const document = await documentService.archiveDocument(req.params.documentId);
    const documents = await documentService.getUserDocuments(userContext.profile.userId);
    const summary = await updateProfileSummary(req, userContext, documents);

    res.status(200).json({ document: documentService.toSafeDocument(document), summary });
  } catch (error) {
    next(error);
  }
}

async function getHistory(req, res, next) {
  try {
    const userContext = await getUserContext(req);
    const history = req.params.documentId
      ? await documentService.getDocumentHistory(req.params.documentId)
      : await documentService.getUserDocumentHistory(userContext.profile.userId);

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
