const JOB_FIELDS = [
  'jobId',
  'title',
  'workSector',
  'profession',
  'city',
  'area',
  'employerName',
  'salaryText',
  'description',
  'contactMethod',
  'contactValue',
  'status',
  'createdAt',
  'updatedAt',
];

const JOB_DEFAULTS = {
  title: '',
  workSector: '',
  profession: '',
  city: '',
  area: '',
  employerName: '',
  salaryText: '',
  description: '',
  contactMethod: '',
  contactValue: '',
  status: 'Active',
};

const JOB_STATUSES = ['Active', 'Filled', 'Archived'];
const JOB_WORK_SECTORS = ['Construction', 'Agriculture', 'Caregiving', 'Other'];

module.exports = {
  JOB_DEFAULTS,
  JOB_FIELDS,
  JOB_STATUSES,
  JOB_WORK_SECTORS,
};
