const { coreAgentService } = require('../core-agent');
const taskService = require('./task.service');

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

async function updateProfileSummary(req, userContext, tasks) {
  const summary = taskService.summarizeTasks(tasks);
  await coreAgentService.updateUserProfile(
    {
      channel: req.query.channel || req.body.channel || 'web',
      channelUserId: req.query.channelUserId || req.body.channelUserId || 'local-web-user',
    },
    summary
  );
  return summary;
}

async function listTasks(req, res, next) {
  try {
    const userContext = await getUserContext(req);
    await taskService.processTaskReminders(userContext.profile.userId, userContext.profile);
    const tasks = await taskService.getUserTasks(userContext.profile.userId, {
      view: req.query.view || '',
      status: req.query.status || '',
      category: req.query.category || '',
    });
    const allTasks = await taskService.getUserTasks(userContext.profile.userId);
    const summary = await updateProfileSummary(req, userContext, allTasks);
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
    res.status(200).json({ task: await taskService.getTaskById(req.params.taskId) });
  } catch (error) {
    next(error);
  }
}

async function getSchedule(req, res, next) {
  try {
    const userContext = await getUserContext(req);
    const tasks = await taskService.getSchedule(userContext.profile.userId, req.query.view || 'Today');
    const allTasks = await taskService.getUserTasks(userContext.profile.userId);
    const summary = await updateProfileSummary(req, userContext, allTasks);
    res.status(200).json({ tasks, summary, view: req.query.view || 'Today' });
  } catch (error) {
    next(error);
  }
}

async function createTask(req, res, next) {
  try {
    const userContext = await getUserContext(req);
    const task = await taskService.createTask({
      ...req.body,
      userId: userContext.profile.userId,
      defaultReminderTime: userContext.profile.defaultReminderTime,
    });
    const tasks = await taskService.getUserTasks(userContext.profile.userId);
    const summary = await updateProfileSummary(req, userContext, tasks);
    res.status(201).json({ task, summary });
  } catch (error) {
    next(error);
  }
}

async function updateTask(req, res, next) {
  try {
    const userContext = await getUserContext(req);
    const task = await taskService.updateTask(req.params.taskId, req.body);
    const tasks = await taskService.getUserTasks(userContext.profile.userId);
    const summary = await updateProfileSummary(req, userContext, tasks);
    res.status(200).json({ task, summary });
  } catch (error) {
    next(error);
  }
}

async function action(req, res, next) {
  try {
    const userContext = await getUserContext(req);
    const byAction = {
      progress: taskService.markTaskInProgress,
      complete: taskService.completeTask,
      dismiss: taskService.dismissTask,
      archive: taskService.archiveTask,
    };
    const handler = byAction[req.params.action];
    const task = handler ? await handler(req.params.taskId) : null;
    const tasks = await taskService.getUserTasks(userContext.profile.userId);
    const summary = await updateProfileSummary(req, userContext, tasks);
    res.status(200).json({ task, summary });
  } catch (error) {
    next(error);
  }
}

async function remind(req, res, next) {
  try {
    const userContext = await getUserContext(req);
    const task = await taskService.remindTaskLater(req.params.taskId, req.body.option || 'tomorrow', req.body.customDate || '');
    const tasks = await taskService.getUserTasks(userContext.profile.userId);
    const summary = await updateProfileSummary(req, userContext, tasks);
    res.status(200).json({ task, summary });
  } catch (error) {
    next(error);
  }
}

async function reschedule(req, res, next) {
  try {
    const userContext = await getUserContext(req);
    const task = await taskService.rescheduleTask(req.params.taskId, req.body);
    const tasks = await taskService.getUserTasks(userContext.profile.userId);
    const summary = await updateProfileSummary(req, userContext, tasks);
    res.status(200).json({ task, summary });
  } catch (error) {
    next(error);
  }
}

async function history(req, res, next) {
  try {
    const userContext = await getUserContext(req);
    const events = req.params.taskId
      ? await taskService.getTaskHistory(req.params.taskId)
      : await taskService.getUserTaskHistory(userContext.profile.userId);
    res.status(200).json({ events });
  } catch (error) {
    next(error);
  }
}

async function listAlerts(req, res, next) {
  try {
    const userContext = await getUserContext(req);
    const tasks = await taskService.getUserTasks(userContext.profile.userId);
    const summary = await updateProfileSummary(req, userContext, tasks);
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
