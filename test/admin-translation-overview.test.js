const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');

const originalLoad = Module._load;
const registeredRoutes = {
  gets: [],
  middlewares: [],
  posts: [],
  puts: [],
};

function emptyNotificationSummary() {
  return {
    notificationsCreated: 0,
    unreadNotifications: 0,
    notificationOpenRate: '0%',
    dismissedNotifications: 0,
    urgentNotifications: [],
    topNotificationCategories: {},
    usersWithNoEngagement: [],
    scheduledNotificationsDueToday: [],
  };
}

Module._load = function loadStub(request, parent, isMain) {
  if (request === 'express') {
    return {
      Router: () => ({
        use: (handler) => registeredRoutes.middlewares.push(handler),
        get: (path, handler) => registeredRoutes.gets.push({ path, handler }),
        post: (path, handler) => registeredRoutes.posts.push({ path, handler }),
        put: (path, handler) => registeredRoutes.puts.push({ path, handler }),
      }),
    };
  }
  if (request === '../../config/env') return { env: { adminApiKey: 'test-admin-key' } };
  if (request === './admin.repository') return {};
  if (request === '../content-agent/content-agent.repository') return {};
  if (request === '../community/community.service') {
    return {
      getAllComments: async () => [],
      publishApprovedDraft: async () => ({}),
      updateCommentStatus: async () => ({}),
    };
  }
  if (request === '../documents/document.service') {
    return {
      archiveDocument: async () => ({}),
      buildAdminDocumentWarnings: () => [],
      getAllDocuments: async () => [],
      updateDocument: async () => ({}),
    };
  }
  if (request === '../manager-agent/manager-agent.repository') {
    return {
      readAdminNotes: async () => [],
      readConversationHistory: async () => [],
      readDailyReports: async () => [],
      readHumanFollowUps: async () => [],
      readKnowledgeDrafts: async () => [],
      readRecommendations: async () => [],
      readUserProfiles: async () => [],
    };
  }
  if (request === '../manager-agent/manager-agent.service') return {};
  if (request === '../notifications/notification.service') {
    return {
      buildAdminSummary: emptyNotificationSummary,
      cancelScheduledNotification: async () => ({}),
      createManualNotifications: async () => [],
      createNotification: async () => ({}),
      getAllNotifications: async () => [],
      respectsPreference: () => true,
    };
  }
  if (request === '../tasks/task.service') {
    return {
      archiveTask: async () => ({}),
      buildAdminTaskSummary: () => ({}),
      completeTask: async () => ({}),
      createTasksForAudience: async () => [],
      dismissTask: async () => ({}),
      getTaskStatistics: () => ({
        tasksCreated: 0,
        tasksCompleted: 0,
        taskCompletionRate: '0%',
        mostCommonTaskCategories: '',
        tasksGeneratedFromDocuments: 0,
        tasksGeneratedFromAdmin: 0,
      }),
      getUserTasks: async () => [],
      rescheduleTask: async () => ({}),
      summarizeTasks: () => ({ tasksToday: 0, overdueTasks: 0, upcomingTasks: 0 }),
      updateTask: async () => ({}),
    };
  }
  if (request === '../line') {
    return {
      lineClientService: { healthCheck: () => ({}) },
      lineDeliveryService: {
        getAllLineDeliveries: async () => [],
        getAllLineDeliveryHistory: async () => [],
      },
      lineWebhookService: { getHealthStatus: () => ({}) },
    };
  }
  if (request === '../whatsapp') {
    return {
      whatsappClientService: { healthCheck: () => ({}) },
      whatsappDeliveryService: {
        cancelWhatsAppDelivery: async () => ({}),
        getAllWhatsAppDeliveries: async () => [],
        getAllWhatsAppDeliveryHistory: async () => [],
        getDeliveryHistory: async () => [],
        processPendingWhatsAppDeliveries: async () => [],
        retryFailedWhatsAppDelivery: async () => ({}),
      },
      whatsappWebhookService: { getHealthStatus: () => ({}) },
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

const adminRoutes = require('../src/modules/admin/admin.routes');
const adminController = require('../src/modules/admin/admin.controller');
const adminService = require('../src/modules/admin/admin.service');
const {
  translationMetricsService,
  translationSettingsService,
  translationService,
} = require('../src/modules/translation');

Module._load = originalLoad;

function reset() {
  translationMetricsService.resetMetrics();
  translationSettingsService.setRepository({
    readSettings: () => ({
      translationEnabled: true,
      provider: 'openai',
      cacheEnabled: true,
      cacheTtlMinutes: 45,
      enabledLanguages: ['en', 'he', 'th'],
      updatedAt: '',
    }),
    saveSettings: (settings) => settings,
  });
  translationService.setProvider({
    translateText: async (text) => ({ translatedText: `translated:${text}` }),
    isAvailable: () => true,
    getProviderName: () => 'overview-provider',
  });
  process.env.TRANSLATION_PROVIDER = 'openai';
  process.env.TRANSLATION_API_KEY = 'secret-api-key';
  process.env.TRANSLATION_CACHE_ENABLED = 'true';
  process.env.TRANSLATION_CACHE_TTL_MINUTES = '45';
}

async function invoke(handler, req = {}) {
  const result = {
    statusCode: undefined,
    body: undefined,
    error: undefined,
    nextCalled: false,
  };
  const res = {
    status(code) {
      result.statusCode = code;
      return this;
    },
    json(body) {
      result.body = body;
      return this;
    },
  };
  await handler(
    {
      get: () => '',
      query: {},
      body: {},
      ...req,
    },
    res,
    (error) => {
      result.error = error;
      result.nextCalled = !error;
    }
  );
  return result;
}

test('authorized Admin can read translation overview', async () => {
  reset();
  const middleware = adminRoutes.requireAdminKey;
  const route = registeredRoutes.gets.find((item) => item.path === '/translation');
  assert.equal(Boolean(route), true);

  const authResult = await invoke(middleware, {
    get: (header) => (header === 'x-admin-api-key' ? 'test-admin-key' : ''),
  });
  const result = await invoke(route.handler);

  assert.equal(authResult.nextCalled, true);
  assert.equal(result.statusCode, 200);
  assert.equal(result.body.status.providerName, 'overview-provider');
  assert.equal(result.body.status.providerAvailability, 'Available');
});

test('authorized Admin can update translation settings', async () => {
  reset();
  let savedSettings = null;
  translationSettingsService.setRepository({
    readSettings: () =>
      savedSettings || {
        translationEnabled: true,
        provider: 'openai',
        cacheEnabled: true,
        cacheTtlMinutes: 45,
        enabledLanguages: ['en', 'he'],
        updatedAt: '',
      },
    saveSettings: (settings) => {
      savedSettings = settings;
      return settings;
    },
  });
  const route = registeredRoutes.puts.find((item) => item.path === '/translation/settings');
  assert.equal(Boolean(route), true);

  const result = await invoke(route.handler, {
    body: {
      translationEnabled: false,
      provider: 'disabled',
      cacheEnabled: false,
      cacheTtlMinutes: 30,
      enabledLanguages: ['en', 'th'],
    },
  });

  assert.equal(result.statusCode, 200);
  assert.equal(result.body.settings.translationEnabled, false);
  assert.equal(result.body.settings.provider, 'disabled');
  assert.equal(result.body.settings.cacheEnabled, false);
  assert.equal(result.body.settings.cacheTtlMinutes, 30);
  assert.deepEqual(result.body.settings.enabledLanguages, ['en', 'th']);
});

test('updated translation settings response does not return secrets', async () => {
  reset();
  const route = registeredRoutes.puts.find((item) => item.path === '/translation/settings');

  const result = await invoke(route.handler, {
    body: {
      translationEnabled: true,
      provider: 'openai',
      cacheEnabled: true,
      cacheTtlMinutes: 60,
      enabledLanguages: ['en', 'he'],
    },
  });

  const bodyJson = JSON.stringify(result.body);
  assert.equal(result.statusCode, 200);
  assert.equal(bodyJson.includes('secret-api-key'), false);
  assert.equal(bodyJson.includes('TRANSLATION_API_KEY'), false);
});

test('unauthorized Admin translation overview request is rejected', async () => {
  reset();

  const result = await invoke(adminRoutes.requireAdminKey, {
    get: () => '',
  });

  assert.equal(result.statusCode, 401);
  assert.equal(result.body.error.message, 'Admin API key is required.');
});

test('translation overview returns metrics correctly', async () => {
  reset();
  translationMetricsService.recordTranslationRequest();
  translationMetricsService.recordTranslationSuccess();
  translationMetricsService.recordCacheHit();
  translationMetricsService.recordCacheMiss();
  translationMetricsService.recordLatency(25);
  translationMetricsService.recordTranslationFailure();

  const result = await invoke(adminController.getTranslationOverview);

  assert.equal(result.statusCode, 200);
  assert.equal(result.body.metrics.totalTranslationRequests, 1);
  assert.equal(result.body.metrics.successfulTranslations, 1);
  assert.equal(result.body.metrics.failedTranslations, 1);
  assert.equal(result.body.metrics.cacheHits, 1);
  assert.equal(result.body.metrics.cacheMisses, 1);
  assert.equal(result.body.metrics.cacheHitRate, '50%');
  assert.equal(result.body.metrics.averageTranslationLatencyMs, 25);
  assert.equal(Boolean(result.body.metrics.lastRecordedFailureTime), true);
});

test('empty translation metrics return safe zero values', async () => {
  reset();

  const overview = await adminService.getTranslationOverview();

  assert.equal(overview.metrics.totalTranslationRequests, 0);
  assert.equal(overview.metrics.successfulTranslations, 0);
  assert.equal(overview.metrics.failedTranslations, 0);
  assert.equal(overview.metrics.cacheHitRate, '0%');
  assert.equal(overview.metrics.lastRecordedFailureTime, '');
});

test('translation overview does not return provider secrets', async () => {
  reset();

  const overviewJson = JSON.stringify(await adminService.getTranslationOverview());

  assert.equal(overviewJson.includes('secret-api-key'), false);
  assert.equal(overviewJson.includes('TRANSLATION_API_KEY'), false);
});

test('translation overview does not return message content', async () => {
  reset();
  const privateText = 'Private message that must not appear in Admin';

  await translationService.translateText(privateText, 'en', 'he');
  const overviewJson = JSON.stringify(await adminService.getTranslationOverview());

  assert.equal(overviewJson.includes(privateText), false);
  assert.equal(overviewJson.includes('translated:Private'), false);
});

test('disabled provider status is handled safely', async () => {
  reset();
  process.env.TRANSLATION_PROVIDER = '';
  translationSettingsService.setRepository({
    readSettings: () => ({
      translationEnabled: false,
      provider: 'disabled',
      cacheEnabled: true,
      cacheTtlMinutes: 45,
      enabledLanguages: ['en', 'he'],
      updatedAt: '',
    }),
    saveSettings: (settings) => settings,
  });
  translationService.setProvider({
    translateText: async () => ({ translatedText: 'unused' }),
    isAvailable: () => false,
    getProviderName: () => 'disabled',
  });

  const overview = await adminService.getTranslationOverview();

  assert.equal(overview.status.providerName, 'disabled');
  assert.equal(overview.status.providerAvailability, 'Unavailable');
  assert.equal(overview.status.translationEnabled, 'Disabled');
});
