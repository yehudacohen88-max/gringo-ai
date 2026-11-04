const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');

const app = require('../src/app');
const { buildDeveloperInstructions } = require('../src/modules/ai-provider/gringo-prompt.service');
const { crmAgentService } = require('../src/modules/crm-agent');
const { employmentSalaryAgent, financeConsumerAgent, healthLifeCommunityAgent } = require('../src/modules/agents');
const { coreAgentService } = require('../src/modules/core-agent');
const communityRepository = require('../src/modules/community/community.repository');
const { SAMPLE_COMMUNITY_POSTS } = require('../src/modules/community/sample-community-posts');
const documentService = require('../src/modules/documents/document.service');
const housingRepository = require('../src/modules/housing/housing.repository');
const { SAMPLE_HOUSING_LISTINGS } = require('../src/modules/housing/sample-housing-listings');
const housingService = require('../src/modules/housing/housing.service');
const jobRepository = require('../src/modules/jobs/job.repository');
const { SAMPLE_JOBS } = require('../src/modules/jobs/sample-jobs');
const jobService = require('../src/modules/jobs/job.service');
const lineMessageService = require('../src/modules/line/line-message.service');
const moneyRepository = require('../src/modules/money/money.repository');
const { SAMPLE_EXCHANGE_RATES, SAMPLE_MONEY_TRANSFER_PROVIDERS } = require('../src/modules/money/sample-money-data');
const moneyService = require('../src/modules/money/money.service');
const serviceRepository = require('../src/modules/services/service.repository');
const { SAMPLE_SERVICES } = require('../src/modules/services/sample-services');
const serviceService = require('../src/modules/services/service.service');
const taskService = require('../src/modules/tasks/task.service');
const telegramMessageService = require('../src/modules/telegram/telegram-message.service');
const whatsappMessageService = require('../src/modules/whatsapp/whatsapp-message.service');
const { COPY } = require('../src/shared/userFacingCopy');

const FAKE_TEXT = /Aviv Construction|Green Fields|Golden Care|Thai Friendly Clinic|Provider A|rate_ils_thb_demo|9\.20/;
const TECHNICAL_TEXT = /Jobs!A1|GOOGLE_SHEETS|spreadsheet|stack|ECONNREFUSED/i;

function listen() {
  const server = app.listen(0);
  const { port } = server.address();
  return {
    port,
    close() {
      return new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
}

function request(port, path, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path, method: 'GET', headers }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let body = null;
        try {
          body = text ? JSON.parse(text) : null;
        } catch (error) {
          body = text;
        }
        resolve({ status: res.statusCode, text, body });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

async function withServer(fn) {
  const server = listen();
  try {
    return await fn(server);
  } finally {
    await server.close();
  }
}

async function withEnv(updates, fn) {
  const previous = {};
  for (const [key, value] of Object.entries(updates)) {
    previous[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return await fn();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

async function withRepo(repo, methods, fn) {
  const previous = {};
  for (const [name, impl] of Object.entries(methods)) {
    previous[name] = repo[name];
    repo[name] = impl;
  }
  try {
    return await fn();
  } finally {
    Object.assign(repo, previous);
  }
}

function realJob() {
  return {
    jobId: 'job_real_pilot_haifa',
    title: 'Night guard',
    workSector: 'Other',
    profession: 'Guard',
    city: 'Haifa',
    area: 'North',
    employerName: 'Real Employer Co',
    salaryText: '40 NIS per hour',
    description: 'A real sheet row.',
    contactMethod: 'Phone',
    contactValue: '',
    status: 'Active',
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
  };
}

function realListing() {
  return {
    ...SAMPLE_HOUSING_LISTINGS[0],
    housingId: 'housing_real_pilot_haifa',
    title: 'Room from a real landlord',
    city: 'Haifa',
    contactName: 'Real Landlord',
    demo: false,
    dataSource: '',
  };
}

function realService() {
  return {
    ...SAMPLE_SERVICES[0],
    id: 'svc_real_pilot_clinic',
    title: 'Real Worker Clinic',
    category: 'Medical',
    city: 'Haifa',
  };
}

function realRate() {
  return {
    rateId: 'rate_real_ils_thb',
    sourceCurrency: 'ILS',
    targetCurrency: 'THB',
    exchangeRate: '11.11',
    sourceName: 'Sheet reference desk',
    updatedAt: '2026-08-01T00:00:00.000Z',
    status: 'Active',
  };
}

function realProvider() {
  return {
    ...SAMPLE_MONEY_TRANSFER_PROVIDERS[0],
    providerId: 'provider_real_pilot',
    providerName: 'Real Transfer Desk',
    providerExchangeRate: '11.00',
  };
}

function realPost() {
  return {
    ...SAMPLE_COMMUNITY_POSTS[0],
    postId: 'post_real_pilot',
    title: 'Real community notice',
    status: 'Published',
    publishedAt: '2026-08-01T00:00:00.000Z',
  };
}

function sheetError() {
  const error = new Error('GOOGLE_SHEETS spreadsheet Jobs!A1 failed');
  error.code = 'ECONNREFUSED';
  return error;
}

function task(capability, domain, input = {}) {
  return {
    taskId: `task_${capability}`,
    requestId: `req_${capability}`,
    conversationId: 'web:pilot',
    domain,
    capability,
    priority: 'normal',
    input,
    metadata: {},
    createdAt: '2026-08-01T00:00:00.000Z',
  };
}

async function readyUser(channel, channelUserId, extra = {}) {
  return crmAgentService.findOrCreateUser({
    channel,
    channelUserId,
    fullName: 'Pilot Worker',
    country: 'Thailand',
    preferredLanguage: 'en',
    language: 'English',
    workSector: 'Construction',
    profession: 'Construction worker',
    city: 'Tel Aviv',
    wantsJobAlerts: 'Yes',
    preferredCurrency: 'THB',
    wantsExchangeRateAlerts: 'No',
    lookingForJob: 'Yes',
    preferredHousingCity: 'Tel Aviv',
    preferredHousingType: 'Shared Room',
    maximumMonthlyBudget: '2000',
    maximumHousingBudget: '2000',
    activeGoals: 'Find Job',
    ...extra,
  });
}

test.describe('pilot catalog does not serve fake data', { concurrency: 1 }, () => {
  test('jobs route treats an empty sheet as no results', async () => {
    await withRepo(jobRepository, { findAllJobs: async () => [] }, () => withServer(async (server) => {
      const response = await request(server.port, '/api/jobs');
      assert.equal(response.status, 200);
      assert.equal(response.body.availability, 'empty');
      assert.deepEqual(response.body.jobs, []);
      assert.equal(response.body.message, COPY.catalogEmpty.en);
      assert.equal(response.body.demo, false);
      assert.doesNotMatch(response.text, FAKE_TEXT);
    }));
  });

  test('jobs route treats a sheet failure as unavailable without technical details', async () => {
    await withRepo(jobRepository, { findAllJobs: async () => { throw sheetError(); } }, () => withServer(async (server) => {
      const response = await request(server.port, '/api/jobs');
      assert.equal(response.status, 200);
      assert.equal(response.body.availability, 'unavailable');
      assert.equal(response.body.message, COPY.catalogUnavailable.en);
      assert.deepEqual(response.body.jobs, []);
      assert.doesNotMatch(response.text, FAKE_TEXT);
      assert.doesNotMatch(response.text, TECHNICAL_TEXT);
    }));
  });

  test('jobs route ignores a demo flag in production', async () => {
    await withEnv({ NODE_ENV: 'production', GRINGO_DEMO_DATA: 'true' }, () => withServer(async (server) => {
      const response = await request(server.port, '/api/jobs');
      assert.equal(response.body.availability, 'unavailable');
      assert.equal(response.body.demo, false);
      assert.doesNotMatch(response.text, FAKE_TEXT);
    }));
  });

  test('jobs route ignores a demo flag on a hosted runtime', async () => {
    await withEnv({ NODE_ENV: 'test', VERCEL: '1', GRINGO_DEMO_DATA: 'true' }, () => withServer(async (server) => {
      const response = await request(server.port, '/api/jobs');
      assert.equal(response.body.demo, false);
      assert.doesNotMatch(response.text, /Aviv Construction/);
    }));
  });

  test('jobs route returns real rows and drops sample rows', async () => {
    await withEnv({ GRINGO_DEMO_DATA: 'true' }, () => withRepo(jobRepository, {
      findAllJobs: async () => [realJob(), SAMPLE_JOBS[0]],
    }, () => withServer(async (server) => {
      const response = await request(server.port, '/api/jobs');
      assert.equal(response.body.availability, 'ok');
      assert.equal(response.body.demo, false);
      assert.equal(response.body.jobs.length, 1);
      assert.equal(response.body.jobs[0].employerName, 'Real Employer Co');
      assert.doesNotMatch(response.text, /Aviv Construction/);
    })));
  });

  test('jobs route says the module is not available yet when disabled', async () => {
    await withEnv({ GRINGO_MODULE_JOBS_ENABLED: 'false' }, () => withServer(async (server) => {
      const response = await request(server.port, '/api/jobs', { 'accept-language': 'en' });
      assert.equal(response.body.availability, 'disabled');
      assert.equal(response.body.message, COPY.catalogDisabled.en);
      assert.deepEqual(response.body.jobs, []);
    }));
  });

  test('jobs empty message follows the request language', async () => {
    await withRepo(jobRepository, { findAllJobs: async () => [] }, () => withServer(async (server) => {
      const response = await request(server.port, '/api/jobs', { 'accept-language': 'he' });
      assert.equal(response.body.message, COPY.catalogEmpty.he);
    }));
  });

  test('housing route treats an empty sheet as no results', async () => {
    await withRepo(housingRepository, { findAllHousingListings: async () => [] }, () => withServer(async (server) => {
      const response = await request(server.port, '/api/housing');
      assert.equal(response.body.availability, 'empty');
      assert.deepEqual(response.body.listings, []);
      assert.equal(response.body.message, COPY.catalogEmpty.en);
      assert.doesNotMatch(response.text, /Golden Care|Shared room in Tel Aviv/);
    }));
  });

  test('housing route treats a sheet failure as unavailable', async () => {
    await withRepo(housingRepository, { findAllHousingListings: async () => { throw sheetError(); } }, () => withServer(async (server) => {
      const response = await request(server.port, '/api/housing');
      assert.equal(response.body.availability, 'unavailable');
      assert.equal(response.body.message, COPY.catalogUnavailable.en);
      assert.doesNotMatch(response.text, TECHNICAL_TEXT);
      assert.doesNotMatch(response.text, /Golden Care/);
    }));
  });

  test('housing route ignores a demo flag in production', async () => {
    await withEnv({ NODE_ENV: 'production', GRINGO_DEMO_DATA: 'true' }, () => withServer(async (server) => {
      const response = await request(server.port, '/api/housing');
      assert.equal(response.body.demo, false);
      assert.doesNotMatch(response.text, /Golden Care/);
    }));
  });

  test('housing route returns a real listing', async () => {
    await withRepo(housingRepository, { findAllHousingListings: async () => [realListing()] }, () => withServer(async (server) => {
      const response = await request(server.port, '/api/housing');
      assert.equal(response.body.availability, 'ok');
      assert.equal(response.body.listings[0].contactName, 'Real Landlord');
      assert.equal(response.body.demo, false);
    }));
  });

  test('housing route says the module is not available yet when disabled', async () => {
    await withEnv({ GRINGO_MODULE_HOUSING_ENABLED: 'false' }, () => withServer(async (server) => {
      const response = await request(server.port, '/api/housing');
      assert.equal(response.body.availability, 'disabled');
      assert.equal(response.body.message, COPY.catalogDisabled.en);
    }));
  });

  test('services route treats an empty sheet as no results', async () => {
    await withRepo(serviceRepository, { findAllServices: async () => [] }, () => withServer(async (server) => {
      const response = await request(server.port, '/api/services');
      assert.equal(response.body.availability, 'empty');
      assert.deepEqual(response.body.services, []);
      assert.doesNotMatch(response.text, /Thai Friendly Clinic/);
    }));
  });

  test('services route treats a sheet failure as unavailable', async () => {
    await withRepo(serviceRepository, { findAllServices: async () => { throw sheetError(); } }, () => withServer(async (server) => {
      const response = await request(server.port, '/api/services');
      assert.equal(response.body.availability, 'unavailable');
      assert.doesNotMatch(response.text, TECHNICAL_TEXT);
      assert.doesNotMatch(response.text, /Thai Friendly Clinic/);
    }));
  });

  test('services route ignores a demo flag in production', async () => {
    await withEnv({ NODE_ENV: 'production', GRINGO_DEMO_DATA: 'true' }, () => withServer(async (server) => {
      const response = await request(server.port, '/api/services');
      assert.equal(response.body.demo, false);
      assert.doesNotMatch(response.text, /Thai Friendly Clinic/);
    }));
  });

  test('services route returns a real service', async () => {
    await withRepo(serviceRepository, { findAllServices: async () => [realService()] }, () => withServer(async (server) => {
      const response = await request(server.port, '/api/services');
      assert.equal(response.body.availability, 'ok');
      assert.equal(response.body.services[0].title, 'Real Worker Clinic');
    }));
  });

  test('services route says the module is not available yet when disabled', async () => {
    await withEnv({ GRINGO_MODULE_SERVICES_ENABLED: 'false' }, () => withServer(async (server) => {
      const response = await request(server.port, '/api/services');
      assert.equal(response.body.availability, 'disabled');
      assert.equal(response.body.message, COPY.catalogDisabled.en);
    }));
  });

  test('exchange-rate route treats an empty sheet as no results', async () => {
    await withRepo(moneyRepository, { findAllExchangeRates: async () => [] }, () => withServer(async (server) => {
      const response = await request(server.port, '/api/money/rate?sourceCurrency=ILS&targetCurrency=THB');
      assert.equal(response.body.availability, 'empty');
      assert.equal(response.body.rate, null);
      assert.equal(response.body.demo, false);
      assert.doesNotMatch(response.text, /9\.20|Provider A/);
    }));
  });

  test('exchange-rate route treats a sheet failure as unavailable', async () => {
    await withRepo(moneyRepository, { findAllExchangeRates: async () => { throw sheetError(); } }, () => withServer(async (server) => {
      const response = await request(server.port, '/api/money/rate?sourceCurrency=ILS&targetCurrency=THB');
      assert.equal(response.body.availability, 'unavailable');
      assert.equal(response.body.message, COPY.catalogUnavailable.en);
      assert.doesNotMatch(response.text, TECHNICAL_TEXT);
    }));
  });

  test('exchange-rate route ignores a demo flag in production', async () => {
    await withEnv({ NODE_ENV: 'production', GRINGO_DEMO_DATA: 'true' }, () => withServer(async (server) => {
      const response = await request(server.port, '/api/money/rate?sourceCurrency=ILS&targetCurrency=THB');
      assert.equal(response.body.demo, false);
      assert.equal(response.body.rate, null);
      assert.doesNotMatch(response.text, /9\.20/);
    }));
  });

  test('exchange-rate route returns a real sheet rate', async () => {
    await withRepo(moneyRepository, { findAllExchangeRates: async () => [realRate()] }, () => withServer(async (server) => {
      const response = await request(server.port, '/api/money/rate?sourceCurrency=ILS&targetCurrency=THB');
      assert.equal(response.body.availability, 'ok');
      assert.equal(response.body.rate.exchangeRate, '11.11');
      assert.equal(response.body.demo, false);
      assert.equal(response.body.demoNotice, undefined);
    }));
  });

  test('transfer comparison treats an empty provider sheet as no results', async () => {
    await withRepo(moneyRepository, {
      findAllProviders: async () => [],
      findAllExchangeRates: async () => [],
    }, () => withServer(async (server) => {
      const response = await request(server.port, '/api/money/compare?amount=2000&sourceCurrency=ILS&targetCurrency=THB');
      assert.equal(response.body.availability, 'empty');
      assert.deepEqual(response.body.results, []);
      assert.doesNotMatch(response.text, /Provider A|9\.20/);
    }));
  });

  test('transfer comparison treats a provider sheet failure as unavailable', async () => {
    await withRepo(moneyRepository, {
      findAllProviders: async () => { throw sheetError(); },
      findAllExchangeRates: async () => { throw sheetError(); },
    }, () => withServer(async (server) => {
      const response = await request(server.port, '/api/money/compare?amount=2000&sourceCurrency=ILS&targetCurrency=THB');
      assert.equal(response.body.availability, 'unavailable');
      assert.doesNotMatch(response.text, TECHNICAL_TEXT);
      assert.doesNotMatch(response.text, /Provider A/);
    }));
  });

  test('money route says the module is not available yet when disabled', async () => {
    await withEnv({ GRINGO_MODULE_MONEY_ENABLED: 'false' }, () => withServer(async (server) => {
      const response = await request(server.port, '/api/money/compare?amount=100&sourceCurrency=ILS&targetCurrency=THB');
      assert.equal(response.body.availability, 'disabled');
      assert.equal(response.body.message, COPY.catalogDisabled.en);
      assert.deepEqual(response.body.results, []);
    }));
  });

  test('transfer comparison returns a real provider', async () => {
    await withRepo(moneyRepository, {
      findAllProviders: async () => [realProvider()],
      findAllExchangeRates: async () => [realRate()],
    }, () => withServer(async (server) => {
      const response = await request(server.port, '/api/money/compare?amount=2000&sourceCurrency=ILS&targetCurrency=THB');
      assert.equal(response.body.availability, 'ok');
      assert.equal(response.body.results[0].providerName, 'Real Transfer Desk');
      assert.equal(response.body.demo, false);
      assert.doesNotMatch(response.text, /Demo data - not a live rate/);
    }));
  });

  test('community route treats an empty sheet as no results', async () => {
    await withRepo(communityRepository, { findAllPosts: async () => [] }, () => withServer(async (server) => {
      const response = await request(server.port, '/api/community');
      assert.equal(response.body.availability, 'empty');
      assert.deepEqual(response.body.posts, []);
      assert.doesNotMatch(response.text, /Construction jobs update in Tel Aviv/);
    }));
  });

  test('community route treats a sheet failure as unavailable', async () => {
    await withRepo(communityRepository, { findAllPosts: async () => { throw sheetError(); } }, () => withServer(async (server) => {
      const response = await request(server.port, '/api/community');
      assert.equal(response.body.availability, 'unavailable');
      assert.doesNotMatch(response.text, TECHNICAL_TEXT);
      assert.doesNotMatch(response.text, /Construction jobs update/);
    }));
  });

  test('community route ignores a demo flag in production', async () => {
    await withEnv({ NODE_ENV: 'production', GRINGO_DEMO_DATA: 'true' }, () => withServer(async (server) => {
      const response = await request(server.port, '/api/community');
      assert.equal(response.body.demo, false);
      assert.doesNotMatch(response.text, /Construction jobs update/);
    }));
  });

  test('community route returns a real post', async () => {
    await withRepo(communityRepository, { findAllPosts: async () => [realPost()] }, () => withServer(async (server) => {
      const response = await request(server.port, '/api/community');
      assert.equal(response.body.availability, 'ok');
      assert.equal(response.body.posts[0].title, 'Real community notice');
    }));
  });

  test('community route says the module is not available yet when disabled', async () => {
    await withEnv({ GRINGO_MODULE_COMMUNITY_ENABLED: 'false' }, () => withServer(async (server) => {
      const response = await request(server.port, '/api/community');
      assert.equal(response.body.availability, 'disabled');
      assert.equal(response.body.message, COPY.catalogDisabled.en);
    }));
  });

  test('jobs search agent does not invent an employer when the sheet is empty', async () => {
    await withRepo(jobRepository, { findAllJobs: async () => [] }, async () => {
      const result = await employmentSalaryAgent.execute(task('jobs.search', 'employment_salary'));
      assert.equal(result.status, 'partial');
      assert.deepEqual(result.output.jobs, []);
      assert.match(result.output.message, /No results right now/);
      assert.match(result.output.message, /I do not have information available right now/);
      assert.doesNotMatch(JSON.stringify(result), FAKE_TEXT);
    });
  });

  test('jobs search agent reports unavailable instead of a raw sheet error', async () => {
    await withRepo(jobRepository, { findAllJobs: async () => { throw sheetError(); } }, async () => {
      const result = await employmentSalaryAgent.execute(task('jobs.search', 'employment_salary'));
      assert.equal(result.output.availability, 'unavailable');
      assert.match(result.output.message, /This service is unavailable right now/);
      assert.doesNotMatch(JSON.stringify(result), TECHNICAL_TEXT);
    });
  });

  test('jobs search agent returns a real job', async () => {
    await withRepo(jobRepository, { findAllJobs: async () => [realJob()] }, async () => {
      const result = await employmentSalaryAgent.execute(task('jobs.search', 'employment_salary'));
      assert.equal(result.status, 'success');
      assert.equal(result.output.jobs[0].employerName, 'Real Employer Co');
      assert.equal(result.output.demo, false);
    });
  });

  test('jobs search agent does not use demo data when production sets the demo flag', async () => {
    await withEnv({ NODE_ENV: 'production', GRINGO_DEMO_DATA: 'true' }, async () => {
      const result = await employmentSalaryAgent.execute(task('jobs.search', 'employment_salary'));
      assert.deepEqual(result.output.jobs, []);
      assert.doesNotMatch(result.output.message, /Aviv Construction|Demo data only/);
    });
  });

  test('housing agent does not invent an apartment when the sheet fails', async () => {
    await withRepo(housingRepository, { findAllHousingListings: async () => { throw sheetError(); } }, async () => {
      const result = await healthLifeCommunityAgent.execute(task('housing.support', 'health_life_community', {
        question: 'I need a shared room in Tel Aviv for 2000',
        profile: { city: 'Tel Aviv', preferredHousingCity: 'Tel Aviv', preferredHousingType: 'Shared Room', maximumMonthlyBudget: '2000' },
      }));
      assert.equal(result.output.listings.length, 0);
      assert.match(result.output.message, /This service is unavailable right now/);
      assert.doesNotMatch(JSON.stringify(result), /Golden Care/);
      assert.doesNotMatch(JSON.stringify(result), TECHNICAL_TEXT);
    });
  });

  test('service agent does not invent a clinic when the sheet is empty', async () => {
    await withRepo(serviceRepository, { findAllServices: async () => [] }, async () => {
      const result = await healthLifeCommunityAgent.execute(task('health.support', 'health_life_community', {
        question: 'I need a doctor in Tel Aviv.',
        profile: { city: 'Tel Aviv' },
      }));
      assert.deepEqual(result.output.services, []);
      assert.match(result.output.serviceMessage, /No results right now/);
      assert.doesNotMatch(JSON.stringify(result), /Thai Friendly Clinic/);
    });
  });

  test('exchange-rate agent does not invent a rate when the sheet fails', async () => {
    await withRepo(moneyRepository, { findAllExchangeRates: async () => { throw sheetError(); } }, async () => {
      const result = await financeConsumerAgent.execute(task('finance.exchange_rate', 'finance_consumer', {
        question: 'What is the ILS to THB exchange rate?',
        sourceCurrency: 'ILS',
        targetCurrency: 'THB',
      }));
      assert.equal(result.output.rate, null);
      assert.match(result.output.message, /This service is unavailable right now/);
      assert.doesNotMatch(result.output.message, /9\.20|Demo data/);
      assert.doesNotMatch(result.output.message, TECHNICAL_TEXT);
    });
  });

  test('community agent does not invent a post when the sheet is empty', async () => {
    await withRepo(communityRepository, { findAllPosts: async () => [] }, async () => {
      const result = await healthLifeCommunityAgent.execute(task('community.support', 'health_life_community', {
        profile: { preferredLanguage: 'en', city: 'Tel Aviv' },
      }));
      assert.equal(result.output.posts.length, 0);
      assert.match(result.output.message, /No results right now/);
      assert.doesNotMatch(JSON.stringify(result), /Construction jobs update/);
    });
  });

  test('web chat does not invent a job', async () => {
    await readyUser('web', 'pilot-web-jobs');
    const response = await coreAgentService.processWebMessage({
      message: 'I am looking for construction work in Tel Aviv',
      channel: 'web',
      channelUserId: 'pilot-web-jobs',
    });
    assert.equal(response.category, 'Jobs');
    assert.match(response.reply, /This service is unavailable right now|No results right now/);
    assert.doesNotMatch(response.reply, /Aviv Construction/);
  });

  test('web chat does not invent an apartment', async () => {
    await readyUser('web', 'pilot-web-housing', { lookingForJob: 'No', wantsJobAlerts: 'No', activeGoals: 'Find Housing', lookingForHousing: 'Yes' });
    const response = await coreAgentService.processWebMessage({
      message: 'I need a shared room in Tel Aviv for 2000',
      channel: 'web',
      channelUserId: 'pilot-web-housing',
    });
    assert.equal(response.category, 'Housing');
    assert.doesNotMatch(response.reply, /Golden Care|Shared room in Tel Aviv/);
    assert.match(response.reply, /unavailable right now|No results right now/);
  });

  test('web chat does not invent a service', async () => {
    await readyUser('web', 'pilot-web-services', { lookingForJob: 'No', wantsJobAlerts: 'No', activeGoals: '' });
    const response = await coreAgentService.processWebMessage({
      message: 'I need a doctor in Tel Aviv',
      channel: 'web',
      channelUserId: 'pilot-web-services',
    });
    assert.equal(response.category, 'Services');
    assert.doesNotMatch(response.reply, /Thai Friendly Clinic/);
    assert.match(response.reply, /unavailable right now|No results right now/);
  });

  test('web chat does not invent an exchange rate', async () => {
    await readyUser('web', 'pilot-web-money', { lookingForJob: 'No', wantsJobAlerts: 'No', activeGoals: 'Send Money' });
    const response = await coreAgentService.processWebMessage({
      message: 'What is the baht exchange rate?',
      channel: 'web',
      channelUserId: 'pilot-web-money',
    });
    assert.equal(response.category, 'Money');
    assert.doesNotMatch(response.reply, /9\.20|Demo data - not a live rate/);
    assert.match(response.reply, /unavailable right now|No results right now/);
  });

  test('web chat does not invent a community post', async () => {
    await readyUser('web', 'pilot-web-community', { lookingForJob: 'No', wantsJobAlerts: 'No', activeGoals: '' });
    const response = await coreAgentService.processWebMessage({
      message: 'What is new in the community today?',
      channel: 'web',
      channelUserId: 'pilot-web-community',
    });
    assert.equal(response.category, 'Community');
    assert.doesNotMatch(response.reply, /Construction jobs update/);
    assert.match(response.reply, /unavailable right now|No results right now/);
  });

  test('web chat with a real job does not label it as demo', async () => {
    await readyUser('web', 'pilot-web-real-job', {
      city: 'Haifa',
      profession: 'Guard',
      workSector: 'Other',
      preferredJobCity: 'Haifa',
      preferredJobProfession: 'Guard',
    });
    await withRepo(jobRepository, { findAllJobs: async () => [realJob()] }, async () => {
      const response = await coreAgentService.processWebMessage({
        message: 'Find guard jobs in Haifa',
        channel: 'web',
        channelUserId: 'pilot-web-real-job',
      });
      assert.match(response.reply, /Real Employer Co/);
      assert.doesNotMatch(response.reply, /Demo data only/);
    });
  });

  test('disabling jobs does not block profile chat, tasks, or documents', async () => {
    await readyUser('web', 'pilot-web-general');
    await withEnv({ GRINGO_MODULE_JOBS_ENABLED: 'false' }, async () => {
      const remembered = await coreAgentService.processWebMessage({
        message: 'Hi Gringo, what do you remember about me?',
        channel: 'web',
        channelUserId: 'pilot-web-general',
      });
      assert.equal(remembered.category, 'Profile');
      assert.doesNotMatch(remembered.reply, /not available yet/i);
      const tasks = await taskService.getUserTasks('pilot-task-user');
      assert.equal(Array.isArray(tasks), true);
      const documents = await documentService.getAllDocuments();
      assert.equal(Array.isArray(documents), true);
      assert.equal(documents.some((document) => document.documentId === 'doc_somchai_passport'), false);
      const jobs = await jobService.getActiveJobs();
      assert.equal(jobs.catalogState, 'disabled');
      assert.equal(jobs.length, 0);
    });
  });

  test('Telegram jobs command does not invent an employer', async () => {
    await readyUser('telegram', 'pilot-tg-jobs', { telegramUserId: 'pilot-tg-jobs' });
    const result = await telegramMessageService.processTelegramMessage({
      messageText: '/jobs',
      channelUserId: 'pilot-tg-jobs',
      channelChatId: 'pilot-tg-chat',
    });
    assert.match(result.reply, /unavailable right now|No results right now/);
    assert.doesNotMatch(result.reply, /Aviv Construction/);
  });

  test('Telegram money command does not invent a rate', async () => {
    await readyUser('telegram', 'pilot-tg-money', { telegramUserId: 'pilot-tg-money', preferredCurrency: 'THB' });
    const result = await telegramMessageService.processTelegramMessage({
      messageText: '/money',
      channelUserId: 'pilot-tg-money',
      channelChatId: 'pilot-tg-money-chat',
    });
    assert.doesNotMatch(result.reply, /Provider A|9\.20|Demo data - not a live rate/);
    assert.match(result.reply, /unavailable right now|No results right now/);
  });

  test('Telegram says jobs are not available yet when the module is disabled', async () => {
    await readyUser('telegram', 'pilot-tg-disabled', { telegramUserId: 'pilot-tg-disabled' });
    await withEnv({ GRINGO_MODULE_JOBS_ENABLED: 'false' }, async () => {
      const result = await telegramMessageService.processTelegramMessage({
        messageText: '/jobs',
        channelUserId: 'pilot-tg-disabled',
        channelChatId: 'pilot-tg-disabled-chat',
      });
      assert.match(result.reply, /not available yet/i);
      assert.doesNotMatch(result.reply, /Aviv Construction/);
    });
  });

  test('LINE jobs text does not invent an employer', async () => {
    await readyUser('line', 'pilot-line-jobs', { lineUserId: 'pilot-line-jobs' });
    const opened = await lineMessageService.processTextMessage({
      messageText: 'jobs',
      channelUserId: 'pilot-line-jobs',
    });
    assert.doesNotMatch(opened.reply, /Aviv Construction/);
    const result = await lineMessageService.processTextMessage({
      messageText: 'Find construction jobs in Tel Aviv',
      channelUserId: 'pilot-line-jobs',
    });
    assert.doesNotMatch(result.reply, /Aviv Construction/);
    assert.match(result.reply, /unavailable right now|No results right now/);
  });

  test('WhatsApp jobs command does not invent an employer', async () => {
    await readyUser('whatsapp', 'pilot-wa-jobs', { whatsappPhone: 'pilot-wa-jobs' });
    const result = await whatsappMessageService.processTextMessage({
      messageText: 'jobs',
      channelUserId: 'pilot-wa-jobs',
      phoneNumber: 'pilot-wa-jobs',
    });
    assert.doesNotMatch(result.reply, /Aviv Construction/);
    assert.match(result.reply, /unavailable right now|No results right now/);
  });

  test('WhatsApp says housing is not available yet when the module is disabled', async () => {
    await readyUser('whatsapp', 'pilot-wa-housing', { whatsappPhone: 'pilot-wa-housing' });
    await withEnv({ GRINGO_MODULE_HOUSING_ENABLED: 'false' }, async () => {
      const result = await whatsappMessageService.processTextMessage({
        messageText: 'housing',
        channelUserId: 'pilot-wa-housing',
        phoneNumber: 'pilot-wa-housing',
      });
      assert.match(result.reply, /not available yet|unavailable right now|No results right now/);
      assert.doesNotMatch(result.reply, /Golden Care/);
    });
  });

  test('development demo data is labelled and is not written to Sheets', async () => {
    let writes = 0;
    await withEnv({ GRINGO_DEMO_DATA: 'true', NODE_ENV: 'test' }, () => withRepo(jobRepository, {
      createJob: async () => {
        writes += 1;
        return {};
      },
    }, async () => {
      const jobs = await jobService.getActiveJobs();
      assert.equal(jobs.catalogDemo, true);
      assert.equal(jobs.some((job) => job.employerName === 'Aviv Construction' && job.demo === true), true);
      await assert.rejects(() => jobService.createJob(SAMPLE_JOBS[0]), (error) => error.code === 'DEMO_NOT_STORED');
      assert.equal(writes, 0);
      const message = jobService.formatJobsForChat(jobs);
      assert.match(message, /Demo data only/);
    }));
  });

  test('development demo housing is not mixed into a real sheet row', async () => {
    await withEnv({ GRINGO_DEMO_DATA: 'true' }, () => withRepo(housingRepository, {
      findAllHousingListings: async () => [realListing(), SAMPLE_HOUSING_LISTINGS[0]],
    }, async () => {
      const listings = await housingService.getActiveHousingListings();
      assert.equal(listings.length, 1);
      assert.equal(listings[0].contactName, 'Real Landlord');
      assert.equal(listings.catalogDemo, false);
    }));
  });

  test('the assistant prompt forbids invented listings and raw errors', () => {
    const prompt = buildDeveloperInstructions();
    assert.match(prompt, /Do not invent employers, apartments, services, community posts, or currency rates/);
    assert.match(prompt, /no information is available/);
    assert.match(prompt, /Do not repeat internal errors/);
  });
});
