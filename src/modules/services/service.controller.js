const { coreAgentService } = require('../core-agent');
const { loadWebProfile } = require('../../shared/webPersonalData');
const { publicCatalogFields } = require('../../shared/pilotCatalog');
const { languageFromRequest, responseLanguage } = require('../../shared/userFacingCopy');
const serviceService = require('./service.service');

async function getServices(req, res, next) {
  try {
    const services = await serviceService.getServices(req.query || {});
    res.status(200).json({
      services,
      ...publicCatalogFields(services, languageFromRequest(req)),
    });
  } catch (error) {
    next(error);
  }
}

async function getMatchingServices(req, res, next) {
  try {
    const { context, profile, userId } = await loadWebProfile(req);
    if (!userId) {
      res.status(200).json({ services: [], search: {} });
      return;
    }
    const search = {
      category: req.query.category,
      city: req.query.city || profile.lastServiceCity || profile.city,
      language: req.query.language || profile.preferredLanguage || profile.language,
      country: req.query.country || profile.country,
      priceLevel: req.query.priceLevel,
    };
    const services = await serviceService.findMatchingServices(profile, search);

    if (services.length) {
      await coreAgentService.updateUserProfile(context, {
        lastViewedServices: services
          .slice(0, 5)
          .map((service) => service.id)
          .join(', '),
        lastServiceCategory: search.category || services[0].category,
        lastServiceCity: search.city || services[0].city,
      });
    }

    res.status(200).json({
      services,
      search,
      ...publicCatalogFields(services, responseLanguage(req, profile)),
    });
  } catch (error) {
    next(error);
  }
}

async function getService(req, res, next) {
  try {
    const services = await serviceService.getServices({});
    const fields = publicCatalogFields(services, languageFromRequest(req));
    if (fields.availability === 'unavailable' || fields.availability === 'disabled') {
      res.status(200).json({ service: null, ...fields });
      return;
    }
    const service = services.find((item) => item.id === req.params.id) || null;
    if (!service) {
      res.status(404).json({ error: { message: 'Service not found.' } });
      return;
    }

    res.status(200).json({ service, ...fields });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getMatchingServices,
  getService,
  getServices,
};
