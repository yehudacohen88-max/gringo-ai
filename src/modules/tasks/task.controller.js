const { coreAgentService } = require('../core-agent');
const { loadWebProfile, sameOwner, sendNotFound, stripClientIdentity } = require('../../shared/webPersonalData');
const taskService = require('./task.service');

const TASK_ACTIONS = {
  progress: taskService.markTaskInProgress,
  complete: taskService.completeTask,
  dismiss: taskService.dismissTask,
  archive: taskService.archiveTask,
};

function emptySummary() {
  return { tasksToday: '0', overdueTasks: '0', upcomingTasks: '0' };
}

async function ownedTask(userId, taskId) {
  if (!userId) return null;
  const task = await taskService.getTaskById(taskId);
  return sameOwner(task, userId) ? task : null;
}

async function refreshSummary(context, userId) {
  const tasks = (await taskService.getUserTasks(userId)).filter((task) => sameOwner(task, userId));
  const summary = taskService.summarizeTasks(tasks);
  await coreAgentService.updateUserProfile(context, summary);
  return { tasks, summary };
}

async function listTasks(req, res, next) {
  try {
    const { context, profile, userId } = await loadWebProfile(req);
    if (!userId) {
      res.status(200).json({ tasks: [], summary: emptySummary(), alerts: [] });
      return;
    }
    await taskService.processTaskReminders(userId, profile);
    const tasks = (await taskService.getUserTasks(userId, {
      view: req.query.view || '',
      status: req.query.status || '',
      category: req.query.category || '',
    })).filter((task) => sameOwner(task, userId));
    const { tasks: allTasks, summary } = await refreshSummary(context, userId);
    res.status(200).json({
      tasks,
      summary,
      alerts: taskService.createTaskAlerts(allTasks, 3),
    });
  } catch (error) {
    next(error);
  }
}

async function getTask(req, res, next) {
  try {
    const { userId } = await loadWebProfile(req);
    const task = await ownedTask(userId, req.params.taskId);
    if (!task) {
      sendNotFound(res);
      return;
    }
    res.status(200).json({ task });
  } catch (error) {
    next(error);
  }
}

async function getSchedule(req, res, next) {
  try {
    const { context, userId } = await loadWebProfile(req);
    if (!userId) {
      res.status(200).json({ tasks: [], summary: emptySummary(), view: req.query.view || 'Today' });
      return;
    }
    const tasks = (await taskService.getSchedule(userId, req.query.view || 'Today')).filter((task) => sameOwner(task, userId));
    const { summary } = await refreshSummary(context, userId);
    res.status(200).json({ tasks, summary, view: req.query.view || 'Today' });
  } catch (error) {
    next(error);
  }
}

async function createTask(req, res, next) {
  try {
    const { context, profile, userId } = await loadWebProfile(req, { create: true });
    const task = await taskService.createTask({
      ...stripClientIdentity(req.body, ['taskId']),
      userId,
      defaultReminderTime: profile.defaultReminderTime,
    });
    if (!sameOwner(task, userId)) {
      sendNotFound(res);
      return;
    }
    const { summary } = await refreshSummary(context, userId);
    res.status(201).json({ task, summary });
  } catch (error) {
    next(error);
  }
}

async function updateTask(req, res, next) {
  try {
    const { context, userId } = await loadWebProfile(req);
    const existing = await ownedTask(userId, req.params.taskId);
    if (!existing) {
      sendNotFound(res);
      return;
    }
    const task = await taskService.updateTask(req.params.taskId, stripClientIdentity(req.body, ['taskId']), { ownerUserId: userId });
    if (!sameOwner(task, userId)) {
      sendNotFound(res);
      return;
    }
    const { summary } = await refreshSummary(context, userId);
    res.status(200).json({ task, summary });
  } catch (error) {
    next(error);
  }
}

async function action(req, res, next) {
  try {
    const { context, userId } = await loadWebProfile(req);
    const existing = await ownedTask(userId, req.params.taskId);
    if (!existing) {
      sendNotFound(res);
      return;
    }
    const handler = TASK_ACTIONS[req.params.action];
    if (!handler) {
      sendNotFound(res);
      return;
    }
    const task = await handler(req.params.taskId, { ownerUserId: userId });
    if (!sameOwner(task, userId)) {
      sendNotFound(res);
      return;
    }
    const { summary } = await refreshSummary(context, userId);
    res.status(200).json({ task, summary });
  } catch (error) {
    next(error);
  }
}

async function remind(req, res, next) {
  try {
    const { context, userId } = await loadWebProfile(req);
    const existing = await ownedTask(userId, req.params.taskId);
    if (!existing) {
      sendNotFound(res);
      return;
    }
    const body = stripClientIdentity(req.body);
    const task = await taskService.remindTaskLater(req.params.taskId, body.option || 'tomorrow', body.customDate || '', {
      ownerUserId: userId,
    });
    if (!sameOwner(task, userId)) {
      sendNotFound(res);
      return;
    }
    const { summary } = await refreshSummary(context, userId);
    res.status(200).json({ task, summary });
  } catch (error) {
    next(error);
  }
}

async function reschedule(req, res, next) {
  try {
    const { context, userId } = await loadWebProfile(req);
    const existing = await ownedTask(userId, req.params.taskId);
    if (!existing) {
      sendNotFound(res);
      return;
    }
    const task = await taskService.rescheduleTask(req.params.taskId, stripClientIdentity(req.body, ['taskId']), { ownerUserId: userId });
    if (!sameOwner(task, userId)) {
      sendNotFound(res);
      return;
    }
    const { summary } = await refreshSummary(context, userId);
    res.status(200).json({ task, summary });
  } catch (error) {
    next(error);
  }
}

async function history(req, res, next) {
  try {
    const { userId } = await loadWebProfile(req);
    if (req.params.taskId) {
      const existing = await ownedTask(userId, req.params.taskId);
      if (!existing) {
        sendNotFound(res);
        return;
      }
      const events = (await taskService.getTaskHistory(req.params.taskId)).filter((event) => sameOwner(event, userId));
      res.status(200).json({ events });
      return;
    }
    if (!userId) {
      res.status(200).json({ events: [] });
      return;
    }
    const events = (await taskService.getUserTaskHistory(userId)).filter((event) => sameOwner(event, userId));
    res.status(200).json({ events });
  } catch (error) {
    next(error);
  }
}

async function listAlerts(req, res, next) {
  try {
    const { context, userId } = await loadWebProfile(req);
    if (!userId) {
      res.status(200).json({ alerts: [], summary: emptySummary() });
      return;
    }
    const { tasks, summary } = await refreshSummary(context, userId);
    res.status(200).json({ alerts: taskService.createTaskAlerts(tasks, 3), summary });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  action,
  createTask,
  getTask,
  getSchedule,
  history,
  listAlerts,
  listTasks,
  remind,
  reschedule,
  updateTask,
};
