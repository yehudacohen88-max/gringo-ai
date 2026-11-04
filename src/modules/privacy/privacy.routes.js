const express = require('express');
const controller = require('./privacy.controller');
const { attachWebIdentity } = require('../../shared/webIdentity');
const { requireSameOrigin } = require('../../shared/requireSameOrigin');
const { limitPrivacy, limitPublicRead } = require('../../shared/rateLimit');

const router = express.Router();

router.get('/notice', limitPublicRead, controller.getNotice);
// POST routes need a same-origin JSON request, so another site cannot accept,
// withdraw or delete for a signed-in worker.
router.use(requireSameOrigin);
router.use(attachWebIdentity);
router.get('/status', controller.getStatus);
router.get('/export', limitPrivacy, controller.getExport);
router.post('/consent', limitPrivacy, controller.postConsent);
router.post('/withdraw', limitPrivacy, controller.postWithdraw);
router.post('/delete-request', limitPrivacy, controller.postDeleteRequest);
router.post('/delete', limitPrivacy, controller.postDelete);

module.exports = router;
