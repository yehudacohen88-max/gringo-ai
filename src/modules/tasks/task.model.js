const TASK_FIELDS = [
  'taskId',
  'userId',
  'title',
  'description',
  'category',
  'priority',
  'status',
  'dueDate',
  'dueTime',
  'reminderAt',
  'relatedModule',
  'relatedRecordId',
  'recurrenceType',
  'recurrenceInterval',
  'recurrenceEndDate',
  'parentTaskId',
  'createdBy',
  'createdAt',
  'updatedAt',
  'completedAt',
];

const TASK_HISTORY_FIELDS = [
  'taskId',
  'userId',
  'eventType',
  'previousStatus',
  'newStatus',
  'previousDueDate',
  'newDueDate',
  'createdAt',
];

const TASK_CATEGORIES = ['Work', 'Housing', 'Documents', 'Money', 'Healthcare', 'Community', 'Personal', 'Other'];
const TASK_PRIORITIES = ['Low', 'Normal', 'High', 'Urgent'];
const TASK_STATUSES = ['New', 'In Progress', 'Completed', 'Dismissed', 'Overdue', 'Archived'];
const TASK_CREATED_BY = ['User', 'Gringo', 'Admin', 'System'];
const TASK_RECURRENCE_TYPES = ['None', 'Daily', 'Weekly', 'Monthly'];
const TASK_HISTORY_EVENT_TYPES = [
  'Created',
  'Updated',
  'Reminder Sent',
  'Rescheduled',
  'Started',
  'Completed',
  'Dismissed',
  'Archived',
];

module.exports = {
  TASK_CATEGORIES,
  TASK_CREATED_BY,
  TASK_FIELDS,
  TASK_HISTORY_EVENT_TYPES,
  TASK_HISTORY_FIELDS,
  TASK_PRIORITIES,
  TASK_RECURRENCE_TYPES,
  TASK_STATUSES,
};
