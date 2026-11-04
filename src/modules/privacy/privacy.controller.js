const privacyService = require('./privacy.service');
const notice = require('./privacy-notice');
const { resolveWebUserContext } = require('../../shared/requireWebIdentity');

function consentRequiredError() {
  const error = new Error('Privacy consent is required before Gringo can save personal data.');
  error.statusCode = 403;
  error.code = 'CONSENT_REQUIRED';
  return error;
}

// Used by web routes that store personal data. Throws 403 CONSENT_REQUIRED.
async function assertWebConsent(userContext) {
  if (!(await privacyService.allowsPersonalProcessing(userContext))) throw consentRequiredError();
}

function getNotice(req, res) {
  const language = notice.noticeLanguage(req.query.lang) || 'en';
  res.status(200).json({ notice: notice.getNotice(language), languages: notice.NOTICE_LANGUAGES });
}

async function getStatus(req, res, next) {
  try {
    res.status(200).json(await privacyService.getStatus(resolveWebUserContext(req)));
  } catch (error) {
    next(error);
  }
}

async function postConsent(req, res, next) {
  try {
    const context = resolveWebUserContext(req);
    const body = req.body || {};
    if (body.accept !== true && body.accept !== false) {
      res.status(400).json({ error: { code: 'ACCEPT_REQUIRED', message: 'accept must be true or false.', details: [] } });
      return;
    }
    if (body.accept === true && body.consentVersion !== notice.PRIVACY_NOTICE_VERSION) {
      res.status(409).json({ error: { code: 'NOTICE_VERSION_MISMATCH', message: 'Please read the current privacy notice.', details: [] } });
      return;
    }
    const status = body.accept
      ? await privacyService.acceptConsent(context, body.language)
      : await privacyService.declineConsent(context, body.language);
    res.status(200).json(status);
  } catch (error) {
    next(error);
  }
}

async function postWithdraw(req, res, next) {
  try {
    const context = resolveWebUserContext(req);
    res.status(200).json(await privacyService.withdrawConsent(context, (req.body || {}).language));
  } catch (error) {
    next(error);
  }
}

async function getExport(req, res, next) {
  try {
    const context = resolveWebUserContext(req);
    res.set('Cache-Control', 'no-store');
    res.status(200).json(await privacyService.exportData(context));
  } catch (error) {
    next(error);
  }
}

async function postDeleteRequest(req, res, next) {
  try {
    const context = resolveWebUserContext(req);
    const language = notice.noticeLanguage((req.body || {}).language) || 'en';
    const pending = privacyService.requestDeletion(context);
    res.set('Cache-Control', 'no-store');
    res.status(200).json({ ...pending, notDeleted: notice.getNotice(language).limits });
  } catch (error) {
    next(error);
  }
}

async function postDelete(req, res, next) {
  try {
    const context = resolveWebUserContext(req);
    const body = req.body || {};
    if (body.confirm !== true) {
      res.status(409).json({ error: { code: 'CONFIRMATION_REQUIRED', message: 'Deletion requires confirm: true.', details: [] } });
      return;
    }
    const outcome = await privacyService.confirmDeletion(context, body.confirmationCode);
    if (!outcome.ok) {
      res.status(400).json({ error: { code: outcome.code, message: 'The confirmation code is wrong or expired.', details: [] } });
      return;
    }
    sendDeletionOutcome(res, outcome, notice.noticeLanguage(body.language) || 'en');
  } catch (error) {
    next(error);
  }
}

// 200 only when every store was erased. A partial deletion answers 202 with
// status "partial": processing is blocked and POST /delete-retry continues it.
function sendDeletionOutcome(res, outcome, language) {
  const partial = outcome.status === 'partial';
  const messageKey = partial ? 'deletePartial' : outcome.status === 'complete' ? 'deleteDone' : 'deleteNothing';
  res.set('Cache-Control', 'no-store');
  res.status(partial ? 202 : 200).json({
    status: outcome.status,
    deleted: outcome.deleted,
    complete: outcome.complete,
    retryAvailable: partial,
    pendingStores: partial ? outcome.failedSheets.length : 0,
    message: notice.reply(language, messageKey),
    notDeleted: notice.getNotice(language).limits,
  });
}

async function postDeleteRetry(req, res, next) {
  try {
    const context = resolveWebUserContext(req);
    const outcome = await privacyService.retryDeletion(context);
    if (!outcome.ok) {
      res.status(409).json({ error: { code: outcome.code, message: 'There is no unfinished deletion.', details: [] } });
      return;
    }
    sendDeletionOutcome(res, outcome, notice.noticeLanguage((req.body || {}).language) || 'en');
  } catch (error) {
    next(error);
  }
}

// Admin: retries every pending deletion. Returns counts only.
async function postAdminRetryDeletions(req, res, next) {
  try {
    res.status(200).json(await privacyService.retryPendingDeletions());
  } catch (error) {
    next(error);
  }
}

module.exports = {
  assertWebConsent,
  getExport,
  getNotice,
  getStatus,
  postConsent,
  postDelete,
  postAdminRetryDeletions,
  postDeleteRequest,
  postDeleteRetry,
  postWithdraw,
};
