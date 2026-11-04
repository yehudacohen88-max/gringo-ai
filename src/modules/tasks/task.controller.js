const { coreAgentService } = require('../core-agent');
const { carryCatalog, publicCatalogFields } = require('../../shared/pilotCatalog');
const { loadWebProfile, sameOwner, sendNotFound, stripClientIdentity } = require('../../shared/webPersonalData');
const { responseLanguage } = require('../../shared/userFacingCopy');
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
  const loaded = await taskService.getUserTasks(userId);
  const tasks = carryCatalog(loaded, loaded.filter((task) => sameOwner(task, userId)));
  if (tasks.catalogState === 'unavailable') return { tasks, summary: emptySummary(), unavailable: true };
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
    const loaded = await taskService.getUserTasks(userId, {
      view: req.query.view || '',
      status: req.query.status || '',
      category: req.query.category || '',
    });
    const tasks = carryCatalog(loaded, loaded.filter((task) => sameOwner(task, userId)));
    const fields = publicCatalogFields(tasks, responseLanguage(req, profile));
    if (tasks.catalogState === 'unavailable') {
      res.status(200).json({ tasks: [], summary: emptySummary(), alerts: [], ...fields });
      return;
    }
    const { tasks: allTasks, summary } = await refreshSummary(context, userId);
    res.status(200).json({
      tasks,
      summary,
      alerts: taskService.createTaskAlerts(allTasks, 3),
      ...fields,
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
    const { context, profile, userId } = await loadWebProfile(req);
    if (!userId) {
      res.status(200).json({ tasks: [], summary: emptySummary(), view: req.query.view || 'Today' });
      return;
    }
    const loaded = await taskService.getSchedule(userId, req.query.view || 'Today');
    const tasks = carryCatalog(loaded, loaded.filter((task) => sameOwner(task, userId)));
    const fields = publicCatalogFields(tasks, responseLanguage(req, profile));
    if (tasks.catalogState === 'unavailable') {
      res.status(200).json({ tasks: [], summary: emptySummary(), view: req.query.view || 'Today', ...fields });
      return;
    }
    const { summary } = await refreshSummary(context, userId);
    res.status(200).json({ tasks, summary, view: req.query.view || 'Today', ...fields });
  } catch (error) {
    next(error);
  }
}

async function createTask(req, res, next) {
  try {
    const { context, profile, userId } = await loadWebProfile(req, { create: true });
    const task = await taskService.createTask(
      {
        ...stripClientIdentity(req.body, ['taskId']),
        defaultReminderTime: profile.defaultReminderTime,
      },
      { ownerUserId: userId }
    );
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
    const { context, profile, userId } = await loadWebProfile(req);
    if (!userId) {
      res.status(200).json({ alerts: [], summary: emptySummary() });
      return;
    }
    const { tasks, summary, unavailable } = await refreshSummary(context, userId);
    const fields = publicCatalogFields(tasks, responseLanguage(req, profile));
    res.status(200).json({
      alerts: unavailable ? [] : taskService.createTaskAlerts(tasks, 3),
      summary,
      ...fields,
    });
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
