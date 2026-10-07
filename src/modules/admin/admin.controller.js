const adminService = require('./admin.service');

async function getDashboard(req, res, next) {
  try {
    res.status(200).json(await adminService.getDashboard());
  } catch (error) {
    next(error);
  }
}

async function getTranslationOverview(req, res, next) {
  try {
    res.status(200).json(await adminService.getTranslationOverview());
  } catch (error) {
    next(error);
  }
}

async function updateTranslationSettings(req, res, next) {
  try {
    res.status(200).json({ settings: await adminService.updateTranslationSettings(req.body) });
  } catch (error) {
    next(error);
  }
}

async function generateDailyReport(req, res, next) {
  try {
    res.status(201).json({ report: await adminService.generateDailyReport() });
  } catch (error) {
    next(error);
  }
}

async function generateWeeklyReport(req, res, next) {
  try {
    res.status(201).json({ report: await adminService.generateWeeklyReport() });
  } catch (error) {
    next(error);
  }
}

async function saveAdminNote(req, res, next) {
  try {
    res.status(201).json({ note: await adminService.saveAdminNote(req.params.reportId, req.body.body) });
  } catch (error) {
    next(error);
  }
}

async function saveHumanAnswer(req, res, next) {
  try {
    res.status(200).json({
      followUp: await adminService.saveHumanAnswer(req.params.followUpId, req.body.answer, req.body.status),
    });
  } catch (error) {
    next(error);
  }
}

async function createKnowledgeDraftFromFollowUp(req, res, next) {
  try {
    res.status(201).json({
      knowledgeDraft: await adminService.createKnowledgeDraftFromFollowUp(req.params.followUpId),
    });
  } catch (error) {
    next(error);
  }
}

async function createContentDraftFromQuestion(req, res, next) {
  try {
    res.status(201).json({
      contentDraft: await adminService.createContentDraftFromQuestion(req.params.followUpId),
    });
  } catch (error) {
    next(error);
  }
}

async function updateMissingKnowledge(req, res, next) {
  try {
    res.status(200).json({
      knowledgeDraft: await adminService.updateMissingKnowledge(req.params.eventId, req.body.action, req.body.answer),
    });
  } catch (error) {
    next(error);
  }
}

async function updateContentDraft(req, res, next) {
  try {
    res.status(200).json({
      contentDraft: await adminService.updateContentDraft(req.params.draftId, req.body),
    });
  } catch (error) {
    next(error);
  }
}

async function publishContentDraft(req, res, next) {
  try {
    res.status(201).json({ post: await adminService.publishContentDraft(req.params.draftId) });
  } catch (error) {
    next(error);
  }
}

async function moderateComment(req, res, next) {
  try {
    res.status(200).json({ comment: await adminService.moderateComment(req.params.commentId, req.body.action) });
  } catch (error) {
    next(error);
  }
}

async function updateRecommendation(req, res, next) {
  try {
    res.status(200).json({
      recommendation: await adminService.updateRecommendation(req.params.recommendationId, req.body.status),
    });
  } catch (error) {
    next(error);
  }
}

async function updateDocument(req, res, next) {
  try {
    res.status(200).json({
      document: await adminService.updateDocumentFromAdmin(req.params.documentId, req.body),
    });
  } catch (error) {
    next(error);
  }
}

async function createManualNotification(req, res, next) {
  try {
    res.status(201).json({ notifications: await adminService.createManualNotification(req.body) });
  } catch (error) {
    next(error);
  }
}

async function cancelScheduledNotification(req, res, next) {
  try {
    res.status(200).json({ notification: await adminService.cancelScheduledNotification(req.params.notificationId) });
  } catch (error) {
    next(error);
  }
}

async function assignTask(req, res, next) {
  try {
    res.status(201).json({ tasks: await adminService.assignTask(req.body) });
  } catch (error) {
    next(error);
  }
}

async function updateTask(req, res, next) {
  try {
    res.status(200).json({ task: await adminService.updateTaskFromAdmin(req.params.taskId, req.body) });
  } catch (error) {
    next(error);
  }
}

async function createWhatsAppManualNotification(req, res, next) {
  try {
    res.status(201).json({ notifications: await adminService.createWhatsAppManualNotification(req.body) });
  } catch (error) {
    next(error);
  }
}

async function retryWhatsAppDelivery(req, res, next) {
  try {
    res.status(200).json({ delivery: await adminService.retryWhatsAppDelivery(req.params.deliveryId) });
  } catch (error) {
    next(error);
  }
}

async function cancelWhatsAppDelivery(req, res, next) {
  try {
    res.status(200).json({ delivery: await adminService.cancelWhatsAppDelivery(req.params.deliveryId) });
  } catch (error) {
    next(error);
  }
}

async function getWhatsAppFailureReason(req, res, next) {
  try {
    res.status(200).json({ failure: await adminService.getWhatsAppFailureReason(req.params.deliveryId) });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  assignTask,
  cancelScheduledNotification,
  cancelWhatsAppDelivery,
  createContentDraftFromQuestion,
  createKnowledgeDraftFromFollowUp,
  createManualNotification,
  createWhatsAppManualNotification,
  generateDailyReport,
  generateWeeklyReport,
  getWhatsAppFailureReason,
  getDashboard,
  getTranslationOverview,
  moderateComment,
  publishContentDraft,
  saveAdminNote,
  saveHumanAnswer,
  updateContentDraft,
  updateDocument,
  updateMissingKnowledge,
  updateRecommendation,
  updateTranslationSettings,
  updateTask,
  retryWhatsAppDelivery,
};
