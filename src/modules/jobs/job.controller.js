const { coreAgentService } = require('../core-agent');
const jobService = require('./job.service');

function splitList(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function preferUnseen(items = [], idKey, seenValue = '') {
  const seenIds = new Set(splitList(seenValue));
  const unseen = items.filter((item) => !seenIds.has(item[idKey]));
  return unseen.length ? unseen : items;
}

async function getActiveJobs(req, res, next) {
  try {
    const jobs = await jobService.getActiveJobs();
    res.status(200).json({ jobs });
  } catch (error) {
    next(error);
  }
}

async function getMatchingJobs(req, res, next) {
  try {
    const onboardingStatus = await coreAgentService.getOnboardingStatus({
      channel: req.query.channel || 'web',
      channelUserId: req.query.channelUserId || 'local-web-user',
    });
    const profile = onboardingStatus.profile || {};
    const hasActiveJobGoal = splitList(profile.activeGoals).includes('Find Job');
    const matchingJobs =
      profile.lookingForJob === 'Yes' && hasActiveJobGoal ? await jobService.findMatchingJobs(profile) : [];
    const jobs = preferUnseen(matchingJobs, 'jobId', profile.lastRecommendedJobIds);
    if (jobs.length) {
      await coreAgentService.updateUserProfile(
        {
          channel: req.query.channel || 'web',
          channelUserId: req.query.channelUserId || 'local-web-user',
        },
        {
          lastRecommendedJobIds: jobs
            .slice(0, 5)
            .map((job) => job.jobId)
            .join(', '),
        }
      );
    }

    res.status(200).json({
      jobs,
      profile,
      wantsJobAlerts: profile?.wantsJobAlerts === 'Yes',
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getActiveJobs,
  getMatchingJobs,
};
