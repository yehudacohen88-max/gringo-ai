const express = require('express');
const workerController = require('./worker.controller');

const router = express.Router();

router.get('/', workerController.getWorkers);
router.post('/', workerController.createWorker);
router.get('/:workerId', workerController.getWorker);
router.put('/:workerId', workerController.updateWorker);
router.post('/:workerId/archive', workerController.archiveWorker);

module.exports = router;
