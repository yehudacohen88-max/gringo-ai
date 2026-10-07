const { coreAgentService } = require('../core-agent');
const serviceService = require('./service.service');

async function getServices(req, res, next) {
  try {
    const services = await serviceService.getServices(req.query || {});
    res.status(200).json({ services });
  } catch (error) {
    next(error);
  }
}

async function getMatchingServices(req, res, next) {
  try {
    const onboardingStatus = await coreAgentService.getOnboardingStatus({
      channel: req.query.channel || 'web',
      channelUserId: req.query.channelUserId || 'local-web-user',
    });
    const profile = onboardingStatus.profile || {};
    const search = {
      category: req.query.category,
      city: req.query.city || profile.lastServiceCity || profile.city,
      language: req.query.language || profile.preferredLanguage || profile.language,
      country: req.query.country || profile.country,
      priceLevel: req.query.priceLevel,
    };
    const services = await serviceService.findMatchingServices(profile, search);

    if (services.length) {
      await coreAgentService.updateUserProfile(
        {
          channel: req.query.channel || 'web',
          channelUserId: req.query.channelUserId || 'local-web-user',
        },
        {
          lastViewedServices: services
            .slice(0, 5)
            .map((service) => service.id)
            .join(', '),
          lastServiceCategory: search.category || services[0].category,
          lastServiceCity: search.city || services[0].city,
        }
      );
    }

    res.status(200).json({ services, profile, search });
  } catch (error) {
    next(error);
  }
}

async function getService(req, res, next) {
  try {
    const service = await serviceService.getServiceById(req.params.id);
    if (!service) {
      res.status(404).json({ error: { message: 'Service not found.' } });
      return;
    }

    res.status(200).json({ service });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getMatchingServices,
  getService,
  getServices,
};
