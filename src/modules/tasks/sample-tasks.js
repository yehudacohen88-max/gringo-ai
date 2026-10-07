function isoDatePlus(days) {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function nextFriday() {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  const day = date.getUTCDay();
  const daysUntilFriday = (5 - day + 7) % 7 || 7;
  date.setUTCDate(date.getUTCDate() + daysUntilFriday);
  return date.toISOString().slice(0, 10);
}

const SAMPLE_TASKS = [
  {
    taskId: 'task_somchai_call_employer',
    userId: 'usr_somchai',
    title: 'Call employer',
    description: 'Call the employer about work details.',
    category: 'Work',
    priority: 'High',
    status: 'New',
    dueDate: isoDatePlus(0),
    dueTime: '10:00',
    reminderAt: `${isoDatePlus(0)}T07:00:00.000Z`,
    relatedModule: 'Jobs',
    relatedRecordId: '',
    recurrenceType: 'None',
    recurrenceInterval: '1',
    recurrenceEndDate: '',
    parentTaskId: '',
    createdBy: 'Gringo',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    completedAt: '',
  },
  {
    taskId: 'task_somchai_renew_visa',
    userId: 'usr_somchai',
    title: 'Renew visa',
    description: 'Prepare renewal before the visa expires.',
    category: 'Documents',
    priority: 'Urgent',
    status: 'New',
    dueDate: isoDatePlus(7),
    dueTime: '',
    reminderAt: `${isoDatePlus(6)}T07:00:00.000Z`,
    relatedModule: 'Documents',
    relatedRecordId: 'doc_somchai_visa',
    recurrenceType: 'None',
    recurrenceInterval: '1',
    recurrenceEndDate: '',
    parentTaskId: '',
    createdBy: 'System',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    completedAt: '',
  },
  {
    taskId: 'task_somchai_send_money',
    userId: 'usr_somchai',
    title: 'Send 2,000 ILS to Thailand',
    description: 'Compare rates before sending money.',
    category: 'Money',
    priority: 'Normal',
    status: 'New',
    dueDate: nextFriday(),
    dueTime: '',
    reminderAt: `${nextFriday()}T07:00:00.000Z`,
    relatedModule: 'Money',
    relatedRecordId: 'ILS_THB',
    recurrenceType: 'None',
    recurrenceInterval: '1',
    recurrenceEndDate: '',
    parentTaskId: '',
    createdBy: 'Gringo',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    completedAt: '',
  },
];

module.exports = { SAMPLE_TASKS };
