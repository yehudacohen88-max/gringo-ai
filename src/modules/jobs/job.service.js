const { JOB_DEFAULTS, JOB_STATUSES, JOB_WORK_SECTORS } = require('./job.model');
const jobRepository = require('./job.repository');
const { SAMPLE_JOBS } = require('./sample-jobs');

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

function normalizeJobInput(input = {}) {
  return {
    title: cleanText(input.title),
    workSector: cleanText(input.workSector),
    profession: cleanText(input.profession),
    city: cleanText(input.city),
    area: cleanText(input.area),
    employerName: cleanText(input.employerName),
    salaryText: cleanText(input.salaryText),
    description: cleanText(input.description),
    contactMethod: cleanText(input.contactMethod),
    contactValue: cleanText(input.contactValue),
    status: cleanText(input.status) || JOB_DEFAULTS.status,
  };
}

function validateJob(job) {
  const errors = [];

  if (!job.title) errors.push('title is required.');
  if (!JOB_WORK_SECTORS.includes(job.workSector)) errors.push('workSector is invalid.');
  if (!job.profession) errors.push('profession is required.');
  if (!job.city) errors.push('city is required.');
  if (!JOB_STATUSES.includes(job.status)) errors.push('status is invalid.');

  return errors;
}

function buildJob(input = {}) {
  const now = new Date().toISOString();

  return {
    ...JOB_DEFAULTS,
    ...normalizeJobInput(input),
    jobId: cleanText(input.jobId) || generateId('job'),
    createdAt: cleanText(input.createdAt) || now,
    updatedAt: cleanText(input.updatedAt) || now,
  };
}

function validationError(errors) {
  const error = new Error('Job validation failed.');
  error.statusCode = 400;
  error.details = errors;
  return error;
}

function isActive(job) {
  return job.status === 'Active';
}

async function readJobsWithSampleFallback() {
  try {
    const jobs = await jobRepository.findAllJobs();
    return jobs.length > 0 ? jobs : SAMPLE_JOBS;
  } catch (error) {
    return SAMPLE_JOBS;
  }
}

async function createJob(input = {}) {
  const job = buildJob(input);
  const errors = validateJob(job);

  if (errors.length > 0) throw validationError(errors);

  return jobRepository.createJob(job);
}

async function getActiveJobs() {
  const jobs = await readJobsWithSampleFallback();
  return jobs.filter(isActive);
}

async function getJobById(jobId) {
  const jobs = await readJobsWithSampleFallback();
  return jobs.find((job) => job.jobId === jobId) || null;
}

function scoreJob(job, userProfile = {}, searchContext = {}) {
  const profileProfession = normalize(searchContext.profession || userProfile.preferredJobProfession || userProfile.profession);
  const profileSector = normalize(searchContext.workSector || userProfile.workSector);
  const profileCity = normalize(searchContext.city || userProfile.preferredJobCity || userProfile.city);
  const profileArea = normalize(searchContext.area || userProfile.area);
  const jobProfession = normalize(job.profession);
  const jobSector = normalize(job.workSector);
  const jobCity = normalize(job.city);
  const jobArea = normalize(job.area);
  const professionMatch = profileProfession && jobProfession.includes(profileProfession);
  const sectorMatch = profileSector && jobSector === profileSector;
  const cityMatch = profileCity && jobCity === profileCity;
  const areaMatch = profileArea && jobArea === profileArea;

  if (professionMatch && cityMatch) {
    return { score: 100, reason: 'Same profession and same city' };
  }

  if (sectorMatch && cityMatch) {
    return { score: 80, reason: 'Same work sector and same city' };
  }

  if (professionMatch && areaMatch) {
    return { score: 60, reason: 'Same profession in nearby area' };
  }

  if (sectorMatch) {
    return { score: 40, reason: 'Same work sector in another area' };
  }

  return { score: 0, reason: 'No strong match' };
}

async function findMatchingJobs(userProfile = {}, searchContext = {}) {
  const jobs = await getActiveJobs();
  return jobs
    .map((job) => ({
      ...job,
      match: scoreJob(job, userProfile, searchContext),
    }))
    .filter((job) => job.match.score > 0)
    .sort((a, b) => b.match.score - a.match.score);
}

function formatJobsForChat(jobs = []) {
  if (!jobs.length) {
    return 'I did not find a matching active job yet. What city, work sector, or profession should I search for?';
  }

  const lines = jobs.slice(0, 5).map((job, index) => {
    return `${index + 1}. ${job.title} - ${job.city}. Employer: ${job.employerName}. Salary: ${job.salaryText}. Match: ${job.match.reason}.`;
  });

  return `I found jobs that may fit you:\n${lines.join('\n')}\nWhich one would you like to know more about?`;
}

module.exports = {
  createJob,
  findMatchingJobs,
  formatJobsForChat,
  getActiveJobs,
  getJobById,
  scoreJob,
};
