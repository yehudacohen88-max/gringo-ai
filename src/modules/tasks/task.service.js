const { crmAgentService } = require('../crm-agent');
const notificationService = require('../notifications/notification.service');
const taskRepository = require('./task.repository');
const {
  TASK_CATEGORIES,
  TASK_CREATED_BY,
  TASK_HISTORY_EVENT_TYPES,
  TASK_PRIORITIES,
  TASK_RECURRENCE_TYPES,
  TASK_STATUSES,
} = require('./task.model');
const { SAMPLE_TASKS } = require('./sample-tasks');

const memoryTasks = [];
const memoryTaskHistory = [];

function cleanText(value) {
  return value === undefined || value === null ? '' : String(value).trim();
}

function normalize(value) {
  return cleanText(value).toLowerCase();
}

function generateId(prefix) {
  const timestamp = new Date().toISOString().replace(/[-:.TZ]/g, '');
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${timestamp}_${random}`;
}

function toDateKey(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toISOString().slice(0, 10) : '';
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(days) {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function addDaysFromDate(dateKey, days) {
  const date = dateKey ? new Date(`${dateKey}T00:00:00.000Z`) : new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function addMonthsFromDate(dateKey, months) {
  const date = dateKey ? new Date(`${dateKey}T00:00:00.000Z`) : new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.toISOString().slice(0, 10);
}

function nextWeekDate() {
  return addDays(7);
}

function nextFridayDate() {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  const day = date.getUTCDay();
  const daysUntilFriday = (5 - day + 7) % 7 || 7;
  date.setUTCDate(date.getUTCDate() + daysUntilFriday);
  return date.toISOString().slice(0, 10);
}

function inferDate(message = '') {
  const normalized = normalize(message);
  const explicit = String(message || '').match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (explicit) return explicit[1];
  if (/\btomorrow\b|\u05de\u05d7\u05e8/.test(normalized)) return addDays(1);
  if (/\bnext week\b|\u05e9\u05d1\u05d5\u05e2 \u05d4\u05d1\u05d0/.test(normalized)) return nextWeekDate();
  if (/\bfriday\b|\u05d9\u05d5\u05dd \u05e9\u05d9\u05e9\u05d9/.test(normalized)) return nextFridayDate();
  if (/\btoday\b|\u05d4\u05d9\u05d5\u05dd/.test(normalized)) return todayKey();
  return '';
}

function inferTime(message = '') {
  const match = String(message || '').match(/\b([01]?\d|2[0-3])(?::([0-5]\d))?\b/);
  if (!match) return '';
  const hour = String(match[1]).padStart(2, '0');
  const minute = match[2] || '00';
  return `${hour}:${minute}`;
}

function inferCategory(message = '') {
  const normalized = normalize(message);
  if (/visa|passport|document|permit|contract|insurance|\u05d5\u05d9\u05d6\u05d4|\u05d3\u05e8\u05db\u05d5\u05df/.test(normalized)) return 'Documents';
  if (/employer|work|job|apply|\u05de\u05e2\u05e1\u05d9\u05e7|\u05e2\u05d1\u05d5\u05d3\u05d4/.test(normalized)) return 'Work';
  if (/housing|room|landlord|apartment|deposit|\u05d3\u05d9\u05e8\u05d4|\u05d7\u05d3\u05e8/.test(normalized)) return 'Housing';
  if (/money|send|rate|transfer|ils|thailand|\u05db\u05e1\u05e3/.test(normalized)) return 'Money';
  if (/doctor|clinic|health/.test(normalized)) return 'Healthcare';
  if (/community|event/.test(normalized)) return 'Community';
  return 'Personal';
}

function inferRelatedModule(category) {
  const byCategory = {
    Work: 'Jobs',
    Housing: 'Housing',
    Documents: 'Documents',
    Money: 'Money',
    Healthcare: 'Services',
    Community: 'Community',
  };
  return byCategory[category] || '';
}

function isTaskMessage(message = '') {
  return /\b(remind me|create a task|task|tasks|to do|what do i need to do|call my employer|send money on|look for housing|apply for job|follow up)\b|\u05ea\u05d6\u05db\u05d9\u05e8|\u05de\u05e9\u05d9\u05de\u05d4|\u05de\u05d4 \u05d9\u05e9 \u05dc\u05d9 \u05dc\u05e2\u05e9\u05d5\u05ea|\u05dc\u05d4\u05ea\u05e7\u05e9\u05e8 \u05dc\u05de\u05e2\u05e1\u05d9\u05e7/.test(
    normalize(message)
  );
}

function isShowTasksMessage(message = '') {
  return /\b(show my tasks|my tasks|what do i need to do today|tasks today|to do today)\b|\u05de\u05d4 \u05d9\u05e9 \u05dc\u05d9 \u05dc\u05e2\u05e9\u05d5\u05ea/.test(
    normalize(message)
  );
}

function titleFromMessage(message = '') {
  let text = cleanText(message)
    .replace(/^remind me to\s+/i, '')
    .replace(/^create a task to\s+/i, '')
    .replace(/^i need to\s+/i, '')
    .replace(/^תזכיר לי\s*/i, '')
    .replace(/^אני צריך\s*/i, '');
  text = text.replace(/\b(tomorrow|today|next week|on friday|friday|at\s+[0-9:]+)\b/gi, '').trim();
  text = text.replace(/\b(every day|daily|every week|weekly|every month|monthly|every friday)\b/gi, '').trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : '';
}

function inferRecurrence(message = '') {
  const normalized = normalize(message);
  if (/\b(every day|daily)\b/.test(normalized)) return 'Daily';
  if (/\b(every week|weekly|every friday)\b/.test(normalized)) return 'Weekly';
  if (/\b(every month|monthly)\b/.test(normalized)) return 'Monthly';
  return 'None';
}

function calculateNextOccurrence(task = {}) {
  const type = cleanText(task.recurrenceType) || 'None';
  if (type === 'None') return '';
  const interval = Math.max(Number(task.recurrenceInterval || 1), 1);
  let nextDate = '';
  if (type === 'Daily') nextDate = addDaysFromDate(task.dueDate, interval);
  if (type === 'Weekly') nextDate = addDaysFromDate(task.dueDate, interval * 7);
  if (type === 'Monthly') nextDate = addMonthsFromDate(task.dueDate, interval);
  const endDate = toDateKey(task.recurrenceEndDate);
  if (endDate && nextDate && nextDate > endDate) return '';
  return nextDate;
}

function calculateReminderAt(dueDate, dueTime, defaultReminderTime = '09:00') {
  if (!dueDate) return '';
  const time = dueTime || defaultReminderTime || '09:00';
  return `${dueDate}T${time}:00.000Z`;
}

function calculateTaskStatus(task = {}) {
  if (['Completed', 'Dismissed', 'Archived'].includes(task.status)) return task.status;
  const dueDate = toDateKey(task.dueDate);
  if (dueDate && dueDate < todayKey()) return 'Overdue';
  return cleanText(task.status) || 'New';
}

function buildTask(input = {}) {
  const now = new Date().toISOString();
  const dueDate = cleanText(input.dueDate);
  const dueTime = cleanText(input.dueTime);
  const category = TASK_CATEGORIES.includes(cleanText(input.category)) ? cleanText(input.category) : 'Other';
  const task = {
    taskId: cleanText(input.taskId) || generateId('task'),
    userId: cleanText(input.userId),
    title: cleanText(input.title),
    description: cleanText(input.description),
    category,
    priority: TASK_PRIORITIES.includes(cleanText(input.priority)) ? cleanText(input.priority) : 'Normal',
    status: TASK_STATUSES.includes(cleanText(input.status)) ? cleanText(input.status) : 'New',
    dueDate,
    dueTime,
    reminderAt: cleanText(input.reminderAt) || calculateReminderAt(dueDate, dueTime, input.defaultReminderTime),
    relatedModule: cleanText(input.relatedModule) || inferRelatedModule(category),
    relatedRecordId: cleanText(input.relatedRecordId),
    recurrenceType: TASK_RECURRENCE_TYPES.includes(cleanText(input.recurrenceType)) ? cleanText(input.recurrenceType) : 'None',
    recurrenceInterval: cleanText(input.recurrenceInterval) || '1',
    recurrenceEndDate: cleanText(input.recurrenceEndDate),
    parentTaskId: cleanText(input.parentTaskId),
    createdBy: TASK_CREATED_BY.includes(cleanText(input.createdBy)) ? cleanText(input.createdBy) : 'User',
    createdAt: cleanText(input.createdAt) || now,
    updatedAt: cleanText(input.updatedAt) || now,
    completedAt: cleanText(input.completedAt),
  };
  task.status = calculateTaskStatus(task);
  return task;
}

function validateTask(task) {
  const errors = [];
  if (!task.userId) errors.push('userId is required.');
  if (!task.title) errors.push('title is required.');
  if (!TASK_CATEGORIES.includes(task.category)) errors.push('category is invalid.');
  if (!TASK_PRIORITIES.includes(task.priority)) errors.push('priority is invalid.');
  if (!TASK_STATUSES.includes(task.status)) errors.push('status is invalid.');
  if (!TASK_CREATED_BY.includes(task.createdBy)) errors.push('createdBy is invalid.');
  if (!TASK_RECURRENCE_TYPES.includes(task.recurrenceType)) errors.push('recurrenceType is invalid.');
  return errors;
}

function validationError(details) {
  const error = new Error('Task validation failed.');
  error.statusCode = 400;
  error.details = details;
  return error;
}

async function readTasksWithFallback() {
  try {
    const tasks = await taskRepository.findAllTasks();
    const source = tasks.length ? tasks : SAMPLE_TASKS;
    const byId = new Map(source.map((task) => [task.taskId, task]));
    memoryTasks.forEach((task) => byId.set(task.taskId, task));
    return Array.from(byId.values());
  } catch (error) {
    const byId = new Map(SAMPLE_TASKS.map((task) => [task.taskId, task]));
    memoryTasks.forEach((task) => byId.set(task.taskId, task));
    return Array.from(byId.values());
  }
}

async function createTask(input = {}) {
  const task = buildTask(input);
  const errors = validateTask(task);
  if (errors.length) throw validationError(errors);
  try {
    const created = await taskRepository.createTask(task);
    await recordTaskEvent(null, created, 'Created');
    return created;
  } catch (error) {
    memoryTasks.push(task);
    await recordTaskEvent(null, task, 'Created');
    return task;
  }
}

async function updateTask(taskId, updates = {}) {
  const existing = await getTaskById(taskId);
  if (!existing) return null;
  const eventType = TASK_HISTORY_EVENT_TYPES.includes(cleanText(updates.eventType)) ? cleanText(updates.eventType) : 'Updated';
  const cleanUpdates = { ...updates };
  delete cleanUpdates.eventType;
  const updated = buildTask({
    ...existing,
    ...cleanUpdates,
    taskId: existing.taskId,
    userId: existing.userId,
    createdAt: existing.createdAt,
    updatedAt: new Date().toISOString(),
  });
  try {
    const saved = (await taskRepository.updateTask(taskId, updated)) || updated;
    await recordTaskEvent(existing, saved, eventType);
    return saved;
  } catch (error) {
    const index = memoryTasks.findIndex((task) => task.taskId === taskId);
    if (index >= 0) memoryTasks[index] = updated;
    else memoryTasks.push(updated);
    await recordTaskEvent(existing, updated, eventType);
    return updated;
  }
}

async function getTaskById(taskId) {
  const tasks = await readTasksWithFallback();
  const task = tasks.find((item) => item.taskId === taskId);
  return task ? { ...task, status: calculateTaskStatus(task) } : null;
}

function taskPassesFilters(task, filters = {}) {
  if (filters.status && task.status !== filters.status) return false;
  if (filters.category && task.category !== filters.category) return false;
  if (filters.view === 'Today' && task.dueDate !== todayKey()) return false;
  if (filters.view === 'Upcoming' && (!task.dueDate || task.dueDate <= todayKey() || ['Completed', 'Dismissed', 'Archived'].includes(task.status))) return false;
  if (filters.view === 'Overdue' && task.status !== 'Overdue') return false;
  if (filters.view === 'Completed' && task.status !== 'Completed') return false;
  return true;
}

async function getUserTasks(userId, filters = {}) {
  await markOverdueTasks(userId);
  const tasks = await readTasksWithFallback();
  return tasks
    .filter((task) => task.userId === userId && task.status !== 'Archived')
    .map((task) => ({ ...task, status: calculateTaskStatus(task) }))
    .filter((task) => taskPassesFilters(task, filters))
    .sort((a, b) => {
      if (a.status === 'Overdue' && b.status !== 'Overdue') return -1;
      if (a.dueDate !== b.dueDate) return String(a.dueDate || '9999').localeCompare(String(b.dueDate || '9999'));
      return String(a.dueTime || '').localeCompare(String(b.dueTime || ''));
    });
}

function endOfWeekKey() {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  const day = date.getUTCDay();
  const daysUntilSunday = (7 - day) % 7;
  date.setUTCDate(date.getUTCDate() + daysUntilSunday);
  return date.toISOString().slice(0, 10);
}

function endOfMonthKey() {
  const date = new Date();
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
}

async function getSchedule(userId, view = 'Today') {
  const tasks = await getUserTasks(userId);
  const today = todayKey();
  const endDate = view === 'This Month' ? endOfMonthKey() : view === 'This Week' ? endOfWeekKey() : today;
  return tasks
    .filter((task) => {
      if (['Completed', 'Dismissed', 'Archived'].includes(task.status)) return false;
      if (!task.dueDate) return false;
      return task.dueDate >= today && task.dueDate <= endDate;
    })
    .sort((a, b) => {
      if (a.dueDate !== b.dueDate) return String(a.dueDate).localeCompare(String(b.dueDate));
      return String(a.dueTime || '').localeCompare(String(b.dueTime || ''));
    });
}

async function markTaskInProgress(taskId) {
  return updateTask(taskId, { status: 'In Progress', eventType: 'Started' });
}

async function completeTask(taskId) {
  const completed = await updateTask(taskId, { status: 'Completed', completedAt: new Date().toISOString(), eventType: 'Completed' });
  if (completed) await createNextRecurringTask(completed);
  return completed;
}

async function dismissTask(taskId) {
  return updateTask(taskId, { status: 'Dismissed', eventType: 'Dismissed' });
}

async function archiveTask(taskId) {
  return updateTask(taskId, { status: 'Archived', eventType: 'Archived' });
}

async function getDueTasks(userId, date = todayKey()) {
  const tasks = await getUserTasks(userId);
  return tasks.filter((task) => task.dueDate === date && !['Completed', 'Dismissed', 'Archived'].includes(task.status));
}

async function getOverdueTasks(userId) {
  const tasks = await getUserTasks(userId);
  return tasks.filter((task) => task.status === 'Overdue');
}

async function markOverdueTasks(userId) {
  const tasks = await readTasksWithFallback();
  const overdue = tasks.filter((task) => task.userId === userId && calculateTaskStatus(task) === 'Overdue' && task.status !== 'Overdue');
  for (const task of overdue) {
    await updateTask(task.taskId, { status: 'Overdue', eventType: 'Updated' });
  }
  return overdue;
}

async function recordTaskEvent(previousTask, newTask, eventType) {
  if (!newTask || !TASK_HISTORY_EVENT_TYPES.includes(eventType)) return null;
  const event = {
    taskId: newTask.taskId,
    userId: newTask.userId,
    eventType,
    previousStatus: previousTask ? previousTask.status : '',
    newStatus: newTask.status,
    previousDueDate: previousTask ? previousTask.dueDate : '',
    newDueDate: newTask.dueDate,
    createdAt: new Date().toISOString(),
  };
  try {
    await taskRepository.createTaskHistory(event);
  } catch (error) {
    memoryTaskHistory.push(event);
  }
  try {
    await crmAgentService.saveConversation({
      userId: newTask.userId,
      channel: 'internal',
      question: `Task ${eventType}: ${newTask.title}`,
      answer: `${newTask.status} ${newTask.dueDate || ''} ${newTask.dueTime || ''}`.trim(),
      category: 'Tasks',
      status: `TASK_${eventType.toUpperCase().replace(/\s+/g, '_')}`,
      needsHumanFollowUp: false,
    });
  } catch (error) {
    // Keep tasks usable if CRM is unavailable.
  }
  return event;
}

async function createNextRecurringTask(task) {
  const nextDate = calculateNextOccurrence(task);
  if (!nextDate) return null;
  const nextTask = await createTask({
    ...task,
    taskId: '',
    status: 'New',
    dueDate: nextDate,
    reminderAt: calculateReminderAt(nextDate, task.dueTime, '09:00'),
    parentTaskId: task.parentTaskId || task.taskId,
    completedAt: '',
    createdAt: '',
    updatedAt: '',
    createdBy: 'System',
  });
  return nextTask;
}

async function getTaskHistory(taskId) {
  try {
    const history = await taskRepository.findAllTaskHistory();
    const byTask = history.filter((event) => event.taskId === taskId);
    const memory = memoryTaskHistory.filter((event) => event.taskId === taskId);
    return [...byTask, ...memory].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  } catch (error) {
    return memoryTaskHistory
      .filter((event) => event.taskId === taskId)
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  }
}

async function getUserTaskHistory(userId) {
  try {
    const history = await taskRepository.findAllTaskHistory();
    const byUser = history.filter((event) => event.userId === userId);
    const memory = memoryTaskHistory.filter((event) => event.userId === userId);
    return [...byUser, ...memory].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  } catch (error) {
    return memoryTaskHistory
      .filter((event) => event.userId === userId)
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  }
}

async function rescheduleTask(taskId, updates = {}) {
  return updateTask(taskId, {
    dueDate: cleanText(updates.dueDate),
    dueTime: cleanText(updates.dueTime),
    reminderAt: cleanText(updates.reminderAt),
    eventType: 'Rescheduled',
  });
}

function reminderAtForOption(option, customDate) {
  const date = new Date();
  if (option === '1h') date.setHours(date.getHours() + 1);
  else if (option === 'tomorrow') date.setDate(date.getDate() + 1);
  else if (option === '3d') date.setDate(date.getDate() + 3);
  else if (option === 'date' && customDate) return new Date(customDate).toISOString();
  else return '';
  return date.toISOString();
}

async function remindTaskLater(taskId, option = 'tomorrow', customDate = '') {
  const reminderAt = reminderAtForOption(option, customDate);
  if (!reminderAt) return null;
  return updateTask(taskId, { reminderAt, eventType: 'Rescheduled' });
}

async function processTaskReminders(userId, profile = {}) {
  const tasks = await getUserTasks(userId);
  const now = new Date();
  const dueReminders = tasks.filter((task) => {
    const reminderAt = task.reminderAt ? new Date(task.reminderAt) : null;
    return reminderAt && !Number.isNaN(reminderAt.getTime()) && reminderAt <= now && !['Completed', 'Dismissed', 'Archived'].includes(task.status);
  });
  const created = [];
  if (profile.taskRemindersEnabled === 'No') return created;
  for (const task of dueReminders) {
    created.push(
      await notificationService.createNotification({
        userId,
        type: 'Task Reminder',
        title: task.title,
        message: `${task.title}${task.dueTime ? ` at ${task.dueTime}` : ''}.`,
        sourceModule: 'Tasks',
        sourceRecordId: task.taskId,
        priority: task.priority,
        actionLabel: 'Open Task',
        actionUrl: '#tasks',
      })
    );
    await recordTaskEvent(task, task, 'Reminder Sent');
  }
  return created.filter(Boolean);
}

function summarizeTasks(tasks = []) {
  const today = todayKey();
  return {
    tasksToday: String(tasks.filter((task) => task.dueDate === today && !['Completed', 'Dismissed', 'Archived'].includes(task.status)).length),
    overdueTasks: String(tasks.filter((task) => task.status === 'Overdue').length),
    upcomingTasks: String(tasks.filter((task) => task.dueDate > today && !['Completed', 'Dismissed', 'Archived'].includes(task.status)).length),
  };
}

function createTaskAlerts(tasks = [], limit = 3) {
  const today = todayKey();
  return tasks
    .filter((task) => (task.dueDate === today || task.status === 'Overdue') && !['Completed', 'Dismissed', 'Archived'].includes(task.status))
    .slice(0, limit)
    .map((task) => ({
      taskId: task.taskId,
      title: task.title,
      message: task.status === 'Overdue' ? `${task.title} is overdue.` : `${task.title}${task.dueTime ? ` at ${task.dueTime}` : ''}`,
      status: task.status,
    }));
}

function formatTasksForChat(tasks = []) {
  if (!tasks.length) return 'You do not have any open tasks for today.';
  const lines = tasks.slice(0, 5).map((task, index) => `${index + 1}. ${task.title}${task.dueDate ? ` - ${task.dueDate}` : ''}${task.dueTime ? ` at ${task.dueTime}` : ''} (${task.status})`);
  return `Here are your tasks:\n${lines.join('\n')}`;
}

function parseTaskFromMessage(message = '', profile = {}) {
  const dueDate = inferDate(message);
  const dueTime = inferTime(message);
  const category = inferCategory(message);
  const title = titleFromMessage(message);
  const recurrenceType = inferRecurrence(message);
  return {
    title,
    description: cleanText(message),
    category,
    priority: category === 'Documents' ? 'High' : 'Normal',
    dueDate,
    dueTime,
    reminderAt: calculateReminderAt(dueDate, dueTime, profile.defaultReminderTime || '09:00'),
    relatedModule: inferRelatedModule(category),
    recurrenceType,
    recurrenceInterval: '1',
    createdBy: 'User',
  };
}

async function handleTaskChat(message, user, profile = {}, channel = 'web') {
  if (isShowTasksMessage(message)) {
    const tasks = await getUserTasks(user.userId);
    const todayTasks = await getDueTasks(user.userId, todayKey());
    const reply = formatTasksForChat(todayTasks.length ? todayTasks : tasks);
    await saveChatConversation(user.userId, channel, message, reply, 'TASKS_SHOWN');
    return { reply, category: 'Tasks', status: 'TASKS_SHOWN', tasks };
  }

  const parsed = parseTaskFromMessage(message, profile);
  if (!parsed.title) {
    return {
      reply: 'What should I remind you to do?',
      category: 'Tasks',
      status: 'TASK_NEEDS_TITLE',
    };
  }
  if (!parsed.dueDate) {
    return {
      reply: 'When should I remind you?',
      category: 'Tasks',
      status: 'TASK_NEEDS_DATE',
    };
  }

  const task = await createTask({
    ...parsed,
    userId: user.userId,
    defaultReminderTime: profile.defaultReminderTime,
  });
  const reply = `Done. I created this task: ${task.title}, due ${task.dueDate}${task.dueTime ? ` at ${task.dueTime}` : ''}.`;
  await saveChatConversation(user.userId, channel, message, reply, 'TASK_CREATED');
  return { reply, category: 'Tasks', status: 'TASK_CREATED', task };
}

async function saveChatConversation(userId, channel, question, answer, status) {
  try {
    await crmAgentService.saveConversation({
      userId,
      channel,
      question,
      answer,
      category: 'Tasks',
      status,
      needsHumanFollowUp: false,
    });
  } catch (error) {
    // Keep chat usable if CRM is unavailable.
  }
}

function isOpenTask(task) {
  return !['Completed', 'Dismissed', 'Archived'].includes(task.status);
}

async function completeTasksForGoal(userId, goal) {
  const tasks = await getUserTasks(userId);
  const targetModule = goal === 'Find Job' ? 'Jobs' : goal === 'Find Housing' ? 'Housing' : '';
  if (!targetModule) return [];
  const completed = [];
  for (const task of tasks.filter((item) => item.relatedModule === targetModule && isOpenTask(item))) {
    completed.push(await completeTask(task.taskId));
  }
  return completed.filter(Boolean);
}

async function completeRelatedTasks(userId, relatedModule, relatedRecordId = '') {
  const tasks = await getUserTasks(userId);
  const completed = [];
  for (const task of tasks) {
    if (!isOpenTask(task)) continue;
    if (task.relatedModule !== relatedModule) continue;
    if (relatedRecordId && task.relatedRecordId && task.relatedRecordId !== relatedRecordId) continue;
    completed.push(await completeTask(task.taskId));
  }
  return completed.filter(Boolean);
}

function buildAdminTaskSummary(tasks = [], profiles = []) {
  const open = tasks.filter(isOpenTask);
  const byUser = open.reduce((counts, task) => {
    counts[task.userId] = (counts[task.userId] || 0) + 1;
    return counts;
  }, {});
  return {
    dueToday: tasks.filter((task) => task.dueDate === todayKey() && isOpenTask(task)),
    overdue: tasks.filter((task) => task.status === 'Overdue'),
    urgent: open.filter((task) => task.priority === 'Urgent'),
    usersWithManyOpenTasks: Object.entries(byUser)
      .filter(([, count]) => count >= 3)
      .map(([userId, count]) => {
        const profile = profiles.find((item) => item.userId === userId) || {};
        return { userId, fullName: profile.fullName || userId, count };
      }),
    assignedAdminTasks: tasks.filter((task) => task.createdBy === 'Admin'),
    completedTasks: tasks.filter((task) => task.status === 'Completed'),
  };
}

function profileMatchesAudience(profile = {}, audience = {}) {
  if (audience.userId && profile.userId !== audience.userId) return false;
  if (audience.country && normalize(profile.country) !== normalize(audience.country)) return false;
  if (audience.language && normalize(profile.preferredLanguage) !== normalize(audience.language)) return false;
  if (audience.sector && normalize(profile.workSector) !== normalize(audience.sector)) return false;
  if (audience.city && normalize(profile.city) !== normalize(audience.city)) return false;
  if (audience.activeGoal && !normalize(profile.activeGoals).includes(normalize(audience.activeGoal))) return false;
  return true;
}

async function createTasksForAudience(profiles = [], input = {}) {
  const audience = {
    userId: cleanText(input.userId),
    country: cleanText(input.country),
    language: cleanText(input.language),
    sector: cleanText(input.sector),
    city: cleanText(input.city),
    activeGoal: cleanText(input.activeGoal),
  };
  const targets = profiles.filter((profile) => profileMatchesAudience(profile, audience));
  const created = [];
  for (const profile of targets) {
    created.push(
      await createTask({
        ...input,
        userId: profile.userId,
        createdBy: 'Admin',
        description: [cleanText(input.description), cleanText(input.internalNote) ? `Admin note: ${cleanText(input.internalNote)}` : '']
          .filter(Boolean)
          .join('\n'),
      })
    );
  }
  return created.filter(Boolean);
}

function getTaskStatistics(tasks = [], history = []) {
  const total = tasks.length;
  const completed = tasks.filter((task) => task.status === 'Completed').length;
  const categories = tasks.reduce((counts, task) => {
    counts[task.category] = (counts[task.category] || 0) + 1;
    return counts;
  }, {});
  return {
    tasksCreated: String(history.filter((event) => event.eventType === 'Created').length || total),
    tasksCompleted: String(completed),
    overdueTasks: String(tasks.filter((task) => task.status === 'Overdue').length),
    taskCompletionRate: total ? `${Math.round((completed / total) * 100)}%` : '0%',
    mostCommonTaskCategories: Object.entries(categories)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([category, count]) => `${category} (${count})`)
      .join(', '),
    usersWithRepeatedOverdueTasks: '',
    tasksGeneratedFromDocuments: String(tasks.filter((task) => task.relatedModule === 'Documents').length),
    tasksGeneratedFromAdmin: String(tasks.filter((task) => task.createdBy === 'Admin').length),
  };
}

module.exports = {
  archiveTask,
  calculateTaskStatus,
  completeTask,
  completeRelatedTasks,
  completeTasksForGoal,
  createTasksForAudience,
  createTask,
  createTaskAlerts,
  dismissTask,
  formatTasksForChat,
  getSchedule,
  getDueTasks,
  getOverdueTasks,
  getTaskHistory,
  getTaskStatistics,
  getTaskById,
  getUserTaskHistory,
  getUserTasks,
  handleTaskChat,
  isTaskMessage,
  markTaskInProgress,
  parseTaskFromMessage,
  processTaskReminders,
  remindTaskLater,
  rescheduleTask,
  buildAdminTaskSummary,
  summarizeTasks,
  updateTask,
};
