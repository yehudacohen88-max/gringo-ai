const workerService = require('./worker.service');

async function createWorker(req, res, next) {
  try {
    const worker = await workerService.createWorker(req.body);
    res.status(201).json({ data: worker });
  } catch (error) {
    next(error);
  }
}

async function getWorkers(req, res, next) {
  try {
    const workers = await workerService.getWorkers(req.query);
    res.status(200).json({ data: workers });
  } catch (error) {
    next(error);
  }
}

async function getWorker(req, res, next) {
  try {
    const worker = await workerService.getWorker(req.params.workerId);
    res.status(200).json({ data: worker });
  } catch (error) {
    next(error);
  }
}

async function updateWorker(req, res, next) {
  try {
    const worker = await workerService.updateWorker(req.params.workerId, req.body);
    res.status(200).json({ data: worker });
  } catch (error) {
    next(error);
  }
}

async function archiveWorker(req, res, next) {
  try {
    const worker = await workerService.archiveWorker(req.params.workerId);
    res.status(200).json({ data: worker });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  archiveWorker,
  createWorker,
  getWorker,
  getWorkers,
  updateWorker,
};
