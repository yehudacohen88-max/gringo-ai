const express = require('express');
const taskController = require('./task.controller');

const router = express.Router();

router.get('/', taskController.listTasks);
router.get('/alerts', taskController.listAlerts);
router.get('/schedule', taskController.getSchedule);
router.get('/history', taskController.history);
router.post('/', taskController.createTask);
router.get('/:taskId', taskController.getTask);
router.get('/:taskId/history', taskController.history);
router.put('/:taskId', taskController.updateTask);
router.post('/:taskId/remind', taskController.remind);
router.post('/:taskId/reschedule', taskController.reschedule);
router.post('/:taskId/:action', taskController.action);

module.exports = router;
