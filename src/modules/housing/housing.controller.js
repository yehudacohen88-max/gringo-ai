const { coreAgentService } = require('../core-agent');
const housingService = require('./housing.service');

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

async function getActiveHousingListings(req, res, next) {
  try {
    const listings = await housingService.getActiveHousingListings();
    res.status(200).json({
      listings,
      safetyNotice: housingService.HOUSING_SAFETY_NOTICE,
    });
  } catch (error) {
    next(error);
  }
}

async function getMatchingHousing(req, res, next) {
  try {
    const onboardingStatus = await coreAgentService.getOnboardingStatus({
      channel: req.query.channel || 'web',
      channelUserId: req.query.channelUserId || 'local-web-user',
    });
    const profile = onboardingStatus.profile || {};
    const hasActiveHousingGoal = splitList(profile.activeGoals).includes('Find Housing');
    const matchingListings =
      profile.lookingForHousing === 'Yes' && hasActiveHousingGoal
        ? await housingService.findMatchingHousing(profile)
        : [];
    const listings = preferUnseen(matchingListings, 'housingId', profile.lastRecommendedHousingIds);
    if (listings.length) {
      await coreAgentService.updateUserProfile(
        {
          channel: req.query.channel || 'web',
          channelUserId: req.query.channelUserId || 'local-web-user',
        },
        {
          lastRecommendedHousingIds: listings
            .slice(0, 5)
            .map((listing) => listing.housingId)
            .join(', '),
        }
      );
    }

    res.status(200).json({
      listings,
      profile,
      lookingForHousing: profile?.lookingForHousing === 'Yes',
      safetyNotice: housingService.HOUSING_SAFETY_NOTICE,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getActiveHousingListings,
  getMatchingHousing,
};
