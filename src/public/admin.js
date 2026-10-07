const adminApiKeyInput = document.querySelector('#adminApiKey');
const adminAlert = document.querySelector('#adminAlert');
const overviewGrid = document.querySelector('#overviewGrid');
const followUpList = document.querySelector('#followUpList');
const missingKnowledgeList = document.querySelector('#missingKnowledgeList');
const contentDraftsList = document.querySelector('#contentDraftsList');
const communityModerationList = document.querySelector('#communityModerationList');
const adminDocumentsList = document.querySelector('#adminDocumentsList');
const adminNotificationsList = document.querySelector('#adminNotificationsList');
const adminNotificationForm = document.querySelector('#adminNotificationForm');
const translationStatusGrid = document.querySelector('#translationStatusGrid');
const translationMetricsGrid = document.querySelector('#translationMetricsGrid');
const translationSettingsForm = document.querySelector('#translationSettingsForm');
const translationLanguageToggles = document.querySelector('#translationLanguageToggles');
const translationSettingsFeedback = document.querySelector('#translationSettingsFeedback');
const whatsappHealthGrid = document.querySelector('#whatsappHealthGrid');
const whatsappCardsGrid = document.querySelector('#whatsappCardsGrid');
const whatsappManualNotificationForm = document.querySelector('#whatsappManualNotificationForm');
const whatsappFilters = document.querySelector('#whatsappFilters');
const whatsappDashboardList = document.querySelector('#whatsappDashboardList');
const lineHealthGrid = document.querySelector('#lineHealthGrid');
const lineCardsGrid = document.querySelector('#lineCardsGrid');
const lineFilters = document.querySelector('#lineFilters');
const lineDashboardList = document.querySelector('#lineDashboardList');
const adminTasksList = document.querySelector('#adminTasksList');
const adminTaskForm = document.querySelector('#adminTaskForm');
const reportDetail = document.querySelector('#reportDetail');
const recommendationsList = document.querySelector('#recommendationsList');

let dashboard = null;

function escapeHtml(value) {
  return String(value === undefined || value === null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function showError(message) {
  adminAlert.textContent = message;
  adminAlert.hidden = false;
}

function hideError() {
  adminAlert.hidden = true;
  adminAlert.textContent = '';
}

async function readJson(response) {
  const body = await response.json();
  if (!response.ok) throw new Error(body.error?.message || 'Admin request failed.');
  return body;
}

async function adminFetch(path, options = {}) {
  const response = await fetch(`/api/admin${path}`, {
    ...options,
    headers: {
      'content-type': 'application/json',
      'x-admin-api-key': adminApiKeyInput.value || 'dev-admin-key',
      ...(options.headers || {}),
    },
  });
  return readJson(response);
}

function showSection(sectionId) {
  document.querySelectorAll('.admin-section').forEach((section) => {
    section.hidden = section.id !== sectionId;
  });
}

function renderCountList(items = []) {
  if (!items.length) return '<span class="muted">None yet</span>';
  return items.map((item) => `${escapeHtml(item.label)} (${escapeHtml(item.count)})`).join(', ');
}

function renderCountObject(counts = {}) {
  const entries = Object.entries(counts);
  if (!entries.length) return '<span class="muted">None yet</span>';
  return entries.map(([label, count]) => `${escapeHtml(label)} (${escapeHtml(count)})`).join(', ');
}

function statusTone(value = '') {
  const text = String(value).toLowerCase();
  if (['enabled', 'reachable', 'received', 'open', 'sent', 'delivered', 'read'].some((status) => text.includes(status))) return 'success';
  if (['failed', 'disabled', 'closed', 'not configured'].some((status) => text.includes(status))) return 'danger';
  return 'warning';
}

function renderStatusPill(value = '') {
  const tone = statusTone(value);
  return `<span class="status-pill status-${tone}">${escapeHtml(value || 'Unknown')}</span>`;
}

function renderActiveNeedsList(items = []) {
  if (!items.length) return '<span class="muted">No active needs.</span>';
  return items
    .map(
      (item) => `
        <div>
          <strong>${escapeHtml(item.userName)}</strong><br>
          Active goals: ${escapeHtml(item.activeGoals)}<br>
          Current job need: ${escapeHtml(item.currentJobNeed)}<br>
          Current housing need: ${escapeHtml(item.currentHousingNeed)}<br>
          Money transfer interest: ${escapeHtml(item.moneyTransferInterest)}<br>
          Last activity: ${escapeHtml(item.lastActivityAt)}
        </div>
      `
    )
    .join('');
}

function renderOverview(overview = {}) {
  const cards = [
    ['Conversations today', overview.conversationsToday],
    ['New users today', overview.newUsersToday],
    ['Active users today', overview.activeUsersToday],
    ['Top categories', renderCountList(overview.topQuestionCategories)],
    ['Unanswered questions', overview.unansweredQuestions],
    ['NEEDS_HUMAN questions', overview.needsHumanQuestions],
    ['Missing knowledge topics', renderCountList(overview.missingKnowledgeTopics)],
    ['Popular job searches', renderCountList(overview.popularJobSearches)],
    ['Popular housing searches', renderCountList(overview.popularHousingSearches)],
    ['Money transfer requests', overview.moneyTransferRequests],
    ['New community comments', overview.newCommunityComments],
    ['Flagged comments', overview.flaggedComments],
    ['Users looking for work', overview.usersLookingForWork],
    ['Users looking for housing', overview.usersLookingForHousing],
    ['Completed goals', renderCountList(overview.completedGoals)],
    ['Repeated ignored recommendations', overview.repeatedIgnoredRecommendations],
    ['Most common active goals', renderCountList(overview.mostCommonActiveGoals)],
    ['Most searched services', renderCountList(overview.mostSearchedServices)],
    ['Most viewed services', renderCountList(overview.mostViewedServices)],
    ['Top service categories', renderCountList(overview.topServiceCategories)],
    ['Most active service cities', renderCountList(overview.mostActiveServiceCities)],
    ['Expiring documents', overview.expiringDocuments],
    ['Expired documents', overview.expiredDocuments],
    ['Users missing documents', overview.usersMissingDocuments],
    ['Missing required documents', renderCountList(overview.missingRequiredDocuments)],
    ['Notifications created', overview.notificationsCreated],
    ['Unread notifications', overview.unreadNotifications],
    ['Notification open rate', overview.notificationOpenRate],
    ['Dismissed notifications', overview.dismissedNotifications],
    ['Urgent notifications', overview.urgentNotifications],
    ['Top notification categories', renderCountList(overview.topNotificationCategories)],
    ['Users with no notification engagement', overview.usersWithNoNotificationEngagement],
    ['Scheduled notifications due today', overview.scheduledNotificationsDueToday],
    ['Tasks today', overview.tasksToday],
    ['Overdue tasks', overview.overdueTasks],
    ['Upcoming tasks', overview.upcomingTasks],
    ['Tasks created', overview.tasksCreated],
    ['Tasks completed', overview.tasksCompleted],
    ['Task completion rate', overview.taskCompletionRate],
    ['Common task categories', overview.mostCommonTaskCategories],
    ['Document tasks', overview.tasksGeneratedFromDocuments],
    ['Admin tasks', overview.tasksGeneratedFromAdmin],
    [
      'Translation metrics',
      `Requests: ${overview.translationRequests || 0}; Success: ${overview.translationSuccesses || 0}; Failed: ${
        overview.translationFailures || 0
      }; Cache hits: ${overview.translationCacheHits || 0}; Cache misses: ${overview.translationCacheMisses || 0}; Avg: ${
        overview.translationAverageLatencyMs || 0
      }ms; Provider: ${overview.translationProviderLatencyMs || 0}ms`,
    ],
    ['Current active needs', renderActiveNeedsList(dashboard?.activeNeeds || [])],
  ];

  overviewGrid.innerHTML = cards
    .map(([label, value]) => `
      <article class="admin-card">
        <h3>${escapeHtml(label)}</h3>
        <p>${value}</p>
      </article>
    `)
    .join('');
}

function renderAdminTasks(tasks = [], summary = {}) {
  if (!tasks.length) {
    adminTasksList.innerHTML = '<p class="empty-state">No user tasks yet.</p>';
    return;
  }
  adminTasksList.innerHTML = `
    <article class="admin-item">
      <h3>Task operations</h3>
      <p>Due today: ${escapeHtml((summary.dueToday || []).length)} | Overdue: ${escapeHtml((summary.overdue || []).length)} | Urgent: ${escapeHtml((summary.urgent || []).length)}</p>
      <p>Admin tasks: ${escapeHtml((summary.assignedAdminTasks || []).length)} | Completed: ${escapeHtml((summary.completedTasks || []).length)}</p>
      <p>Users with many open tasks: ${escapeHtml((summary.usersWithManyOpenTasks || []).map((item) => `${item.fullName} (${item.count})`).join(', ') || 'None')}</p>
    </article>
    ${tasks
    .map(
      (task) => `
        <article class="admin-item" data-task="${escapeHtml(task.taskId)}">
          <h3>${escapeHtml(task.title)} - ${escapeHtml(task.userId)}</h3>
          <p>${escapeHtml(task.category)} | ${escapeHtml(task.priority)} | ${escapeHtml(task.status)}</p>
          <p>Due: ${escapeHtml(task.dueDate || '-')} ${escapeHtml(task.dueTime || '')}</p>
          <label><span>Reschedule date</span><input data-task-due-date type="date" value="${escapeHtml(task.dueDate || '')}"></label>
          <label><span>Time</span><input data-task-due-time type="time" value="${escapeHtml(task.dueTime || '')}"></label>
          <p>${escapeHtml(task.description || '')}</p>
          <div class="row-actions">
            <button class="button button-small" data-action="complete" type="button">Mark completed</button>
            <button class="button button-secondary button-small" data-action="reschedule" type="button">Reschedule</button>
            <button class="button button-danger button-small" data-action="archive" type="button">Archive</button>
          </div>
        </article>
      `
    )
    .join('')}`;
}

function renderAdminNotifications(data = {}) {
  const recent = data.recentNotifications || [];
  adminNotificationsList.innerHTML = `
    <article class="admin-item">
      <h3>Notification summary</h3>
      <p>Unread by type: ${renderCountObject(data.unreadByType)}</p>
      <p>Urgent notifications: ${escapeHtml((data.urgentNotifications || []).length)}</p>
      <p>Expired scheduled notifications: ${escapeHtml((data.expiredScheduledNotifications || []).length)}</p>
      <p>Users with many unread: ${escapeHtml((data.usersWithManyUnread || []).map((item) => `${item.userName} (${item.count})`).join(', ') || 'None')}</p>
      <p>Most ignored types: ${renderCountObject(data.mostIgnoredNotificationTypes)}</p>
      <p>Most opened types: ${renderCountObject(data.mostOpenedNotificationTypes)}</p>
      <p>Due today: ${escapeHtml((data.scheduledNotificationsDueToday || []).length)}</p>
    </article>
    ${
      recent.length
        ? recent
            .map(
              (notification) => `
                <article class="admin-item" data-notification="${escapeHtml(notification.notificationId)}">
                  <h3>${escapeHtml(notification.title)} - ${escapeHtml(notification.userName)}</h3>
                  <p>${escapeHtml(notification.message)}</p>
                  <p>${escapeHtml(notification.type)} | ${escapeHtml(notification.priority)} | ${escapeHtml(notification.status)}</p>
                  <p>Scheduled: ${escapeHtml(notification.scheduledAt || 'Now')} | Created: ${escapeHtml(notification.createdAt)}</p>
                  <div class="row-actions">
                    <button class="button button-danger button-small" data-action="cancel-scheduled" type="button">Cancel Scheduled</button>
                  </div>
                </article>
              `
            )
            .join('')
        : '<p class="empty-state">No notifications yet.</p>'
    }
  `;
}

function renderSupportedLanguages(languages = {}) {
  const entries = Array.isArray(languages) ? languages.map((language) => [language, language]) : Object.entries(languages);
  if (!entries.length) return '<span class="muted">None configured</span>';
  return entries.map(([code, name]) => `${escapeHtml(code)} - ${escapeHtml(name)}`).join('<br>');
}

function renderTranslationOverview(data = {}) {
  const status = data.status || {};
  const metrics = data.metrics || {};
  const settings = data.settings || {};
  const statusCards = [
    ['Translation provider', escapeHtml(status.providerName || 'disabled')],
    ['Provider availability', renderStatusPill(status.providerAvailability || 'Unavailable')],
    ['Translation', renderStatusPill(status.translationEnabled || 'Disabled')],
    ['Cache', renderStatusPill(status.cacheEnabled || 'Disabled')],
    ['Cache TTL', `${escapeHtml(status.cacheTtlMinutes || 0)} minutes`],
    ['Supported languages', renderSupportedLanguages(status.supportedLanguages)],
    ['Core Agent working language', escapeHtml(status.coreAgentWorkingLanguage || 'en')],
  ];
  const metricCards = [
    ['Total translation requests', escapeHtml(metrics.totalTranslationRequests || 0)],
    ['Successful translations', escapeHtml(metrics.successfulTranslations || 0)],
    ['Failed translations', escapeHtml(metrics.failedTranslations || 0)],
    ['Cache hits', escapeHtml(metrics.cacheHits || 0)],
    ['Cache misses', escapeHtml(metrics.cacheMisses || 0)],
    ['Cache hit rate', escapeHtml(metrics.cacheHitRate || '0%')],
    ['Average translation latency', `${escapeHtml(metrics.averageTranslationLatencyMs || 0)} ms`],
    ['Last recorded failure time', escapeHtml(metrics.lastRecordedFailureTime || 'None')],
  ];

  translationStatusGrid.innerHTML = statusCards
    .map(
      ([label, value]) => `
        <article class="admin-card">
          <h3>${escapeHtml(label)}</h3>
          <p>${value}</p>
        </article>
      `
    )
    .join('');

  translationMetricsGrid.innerHTML = metricCards
    .map(
      ([label, value]) => `
        <article class="admin-card">
          <h3>${escapeHtml(label)}</h3>
          <p>${value}</p>
        </article>
      `
    )
    .join('');

  if (translationSettingsForm) {
    translationSettingsForm.elements.translationEnabled.checked = Boolean(settings.translationEnabled);
    translationSettingsForm.elements.cacheEnabled.checked = Boolean(settings.cacheEnabled);
    translationSettingsForm.elements.cacheTtlMinutes.value = settings.cacheTtlMinutes || 60;
    const providers = settings.allowedProviders || ['disabled', 'openai'];
    translationSettingsForm.elements.provider.innerHTML = providers
      .map(
        (provider) =>
          `<option value="${escapeHtml(provider)}" ${provider === settings.provider ? 'selected' : ''}>${escapeHtml(provider)}</option>`
      )
      .join('');
    const enabledLanguages = settings.enabledLanguages || [];
    translationLanguageToggles.innerHTML = Object.entries(settings.supportedLanguages || {})
      .map(
        ([code, name]) => `
          <label>
            <span>${escapeHtml(code)} - ${escapeHtml(name)}</span>
            <input name="enabledLanguages" type="checkbox" value="${escapeHtml(code)}" ${
              enabledLanguages.includes(code) ? 'checked' : ''
            } ${code === 'en' ? 'disabled' : ''}>
          </label>
        `
      )
      .join('');
  }
}

function readWhatsAppFilters() {
  if (!whatsappFilters) return {};
  const formData = new FormData(whatsappFilters);
  return {
    country: String(formData.get('country') || '').trim().toLowerCase(),
    date: String(formData.get('date') || '').trim(),
    notificationType: String(formData.get('notificationType') || '').trim().toLowerCase(),
    language: String(formData.get('language') || '').trim().toLowerCase(),
    sector: String(formData.get('sector') || '').trim().toLowerCase(),
    status: String(formData.get('status') || '').trim().toLowerCase(),
  };
}

function matchesWhatsAppFilters(item = {}, filters = {}) {
  const country = String(item.country || '').toLowerCase();
  const language = String(item.language || '').toLowerCase();
  const sector = String(item.sector || '').toLowerCase();
  const status = String(item.status || '').toLowerCase();
  const notificationType = String(item.notificationType || '').toLowerCase();
  const createdDate = String(item.createdAt || item.attemptedAt || item.failedAt || '').slice(0, 10);
  return (
    (!filters.country || country.includes(filters.country)) &&
    (!filters.date || createdDate === filters.date) &&
    (!filters.notificationType || notificationType.includes(filters.notificationType)) &&
    (!filters.language || language.includes(filters.language)) &&
    (!filters.sector || sector.includes(filters.sector)) &&
    (!filters.status || status === filters.status)
  );
}

function readLineFilters() {
  if (!lineFilters) return {};
  const formData = new FormData(lineFilters);
  return {
    country: String(formData.get('country') || '').trim().toLowerCase(),
    language: String(formData.get('language') || '').trim().toLowerCase(),
    sector: String(formData.get('sector') || '').trim().toLowerCase(),
  };
}

function matchesLineFilters(item = {}, filters = {}) {
  const country = String(item.country || '').toLowerCase();
  const language = String(item.language || '').toLowerCase();
  const sector = String(item.sector || '').toLowerCase();
  return (
    (!filters.country || country.includes(filters.country)) &&
    (!filters.language || language.includes(filters.language)) &&
    (!filters.sector || sector.includes(filters.sector))
  );
}

function renderLineDashboard(data = {}) {
  const health = data.health || {};
  const cards = data.cards || {};
  const healthCards = [
    ['Enabled', health.enabled],
    ['API reachable', health.apiReachable],
    ['Webhook status', health.webhookStatus],
    ['Last incoming event', health.lastIncomingEvent || 'Never'],
    ['Last successful request', health.lastSuccessfulRequestAt || 'Never'],
    ['Last failed request', health.lastFailedRequestAt || 'Never'],
  ];
  const dashboardCards = [
    ['Connected Users', cards.connectedUsers || 0],
    ['Messages Today', cards.messagesToday || 0],
    ['Pending Queue', cards.pendingQueue || 0],
    ['Failed Deliveries', cards.failedDeliveries || 0],
    ['Success Rate', cards.successRate || '0%'],
  ];

  lineHealthGrid.innerHTML = healthCards
    .map(
      ([label, value]) => `
        <article class="admin-card">
          <h3>${escapeHtml(label)}</h3>
          <p>${renderStatusPill(value)}</p>
        </article>
      `
    )
    .join('');

  lineCardsGrid.innerHTML = dashboardCards
    .map(
      ([label, value]) => `
        <article class="admin-card">
          <h3>${escapeHtml(label)}</h3>
          <p>${escapeHtml(value)}</p>
        </article>
      `
    )
    .join('');

  const filters = readLineFilters();
  const users = (data.connectedUsers || []).filter((user) => matchesLineFilters(user, filters));
  const deliveries = (data.deliveries || []).filter((delivery) => matchesLineFilters(delivery, filters));

  lineDashboardList.innerHTML = `
    <article class="admin-item">
      <h3>Connector status</h3>
      <p>Status: ${renderStatusPill(data.connectorStatus || 'Disabled')}</p>
      <p>Active conversations: ${escapeHtml(data.activeConversations || 0)}</p>
      <p>Pending deliveries: ${escapeHtml(data.pendingDeliveries || 0)} | Failed deliveries: ${escapeHtml(data.failedDeliveries || 0)} | Queue size: ${escapeHtml(data.queueSize || 0)}</p>
      <p>Last failure: ${escapeHtml(health.lastFailureCode || 'None')}</p>
    </article>
    <article class="admin-item">
      <h3>Connected users</h3>
      ${
        users.length
          ? users
              .map(
                (user) => `
                  <p>
                    <strong>${escapeHtml(user.userName)}</strong>
                    ${renderStatusPill(user.status)}
                    ${escapeHtml(user.country || '-')} | ${escapeHtml(user.language || '-')} | ${escapeHtml(user.sector || '-')} | ${escapeHtml(user.city || '-')}<br>
                    Connected: ${escapeHtml(user.lineConnectedAt || '-')} | Last active: ${escapeHtml(user.lineLastActiveAt || '-')} | Notifications: ${escapeHtml(user.lineNotificationsEnabled || '-')}
                  </p>
                `
              )
              .join('')
          : '<p class="empty-state">No connected LINE users match these filters.</p>'
      }
    </article>
    <article class="admin-item">
      <h3>Recent deliveries</h3>
      ${
        deliveries.length
          ? deliveries
              .map(
                (delivery) => `
                  <p>
                    <strong>${escapeHtml(delivery.userName)}</strong>
                    ${renderStatusPill(delivery.status)}
                    ${escapeHtml(delivery.notificationType || 'Unknown type')} | Attempts: ${escapeHtml(delivery.retryCount || 0)}<br>
                    Attempted: ${escapeHtml(delivery.attemptedAt || '-')} | Delivered: ${escapeHtml(delivery.deliveredAt || '-')} | Failed: ${escapeHtml(delivery.failedAt || '-')} | Safe failure: ${escapeHtml(delivery.failureReason || delivery.failureCode || 'None')}
                  </p>
                `
              )
              .join('')
          : '<p class="empty-state">No LINE deliveries match these filters.</p>'
      }
    </article>
  `;
}

function renderWhatsAppDashboard(data = {}) {
  const health = data.health || {};
  const cards = data.cards || {};
  const healthCards = [
    ['Enabled / Disabled', health.enabled],
    ['API reachable', health.apiReachable],
    ['Webhook status', health.webhookStatus],
    ['Last webhook received', health.lastWebhookReceivedAt || 'Never'],
    ['Last successful request', health.lastSuccessfulRequestAt || 'Never'],
    ['Last failed request', health.lastFailedRequestAt || 'Never'],
  ];
  const dashboardCards = [
    ['Connected Users', cards.connectedUsers || 0],
    ["Today's Messages", cards.todaysMessages || 0],
    ['Pending Queue', cards.pendingQueue || 0],
    ['Failed Deliveries', cards.failedDeliveries || 0],
    ['Success Rate', cards.successRate || '0%'],
    ['Open Conversations', cards.openConversations || 0],
  ];

  whatsappHealthGrid.innerHTML = healthCards
    .map(
      ([label, value]) => `
        <article class="admin-card">
          <h3>${escapeHtml(label)}</h3>
          <p>${renderStatusPill(value)}</p>
        </article>
      `
    )
    .join('');

  whatsappCardsGrid.innerHTML = dashboardCards
    .map(
      ([label, value]) => `
        <article class="admin-card">
          <h3>${escapeHtml(label)}</h3>
          <p>${escapeHtml(value)}</p>
        </article>
      `
    )
    .join('');

  const filters = readWhatsAppFilters();
  const users = (data.connectedUsers || []).filter((user) => matchesWhatsAppFilters(user, filters));
  const deliveries = (data.deliveries || []).filter((delivery) => matchesWhatsAppFilters(delivery, filters));

  whatsappDashboardList.innerHTML = `
    <article class="admin-item">
      <h3>Connector status</h3>
      <p>Status: ${renderStatusPill(data.connectorStatus || 'Disabled')}</p>
      <p>Active conversations: ${escapeHtml(data.activeConversations || 0)}</p>
      <p>Open windows: ${escapeHtml(data.openConversationWindows || 0)} | Closed windows: ${escapeHtml(data.closedConversationWindows || 0)}</p>
      <p>Pending deliveries: ${escapeHtml(data.pendingDeliveries || 0)} | Failed deliveries: ${escapeHtml(data.failedDeliveries || 0)} | Queue size: ${escapeHtml(data.queueSize || 0)}</p>
      <p>Last failure: ${escapeHtml(health.lastFailureCode || 'None')}</p>
    </article>
    <article class="admin-item">
      <h3>Connected users</h3>
      ${
        users.length
          ? users
              .map(
                (user) => `
                  <p>
                    <strong>${escapeHtml(user.userName)}</strong>
                    ${renderStatusPill(user.status)}
                    ${escapeHtml(user.country || '-')} | ${escapeHtml(user.language || '-')} | ${escapeHtml(user.sector || '-')} | ${escapeHtml(user.city || '-')}<br>
                    Connected: ${escapeHtml(user.whatsappConnectedAt || '-')} | Last inbound: ${escapeHtml(user.whatsappLastInboundAt || '-')} | Notifications: ${escapeHtml(user.whatsappNotificationsEnabled || '-')}
                  </p>
                `
              )
              .join('')
          : '<p class="empty-state">No connected users match these filters.</p>'
      }
    </article>
    <article class="admin-item">
      <h3>Recent deliveries</h3>
      ${
        deliveries.length
          ? deliveries
              .map(
                (delivery) => `
                  <p>
                    <strong>${escapeHtml(delivery.userName)}</strong>
                    ${renderStatusPill(delivery.status)}
                    ${escapeHtml(delivery.notificationType || 'Unknown type')} | ${escapeHtml(delivery.deliveryMode || 'No mode yet')} | Attempts: ${escapeHtml(delivery.retryCount || 0)}<br>
                    Attempted: ${escapeHtml(delivery.attemptedAt || '-')} | Failed: ${escapeHtml(delivery.failedAt || '-')} | Safe failure: ${escapeHtml(delivery.failureReason || delivery.failureCode || 'None')}
                    <span class="row-actions">
                      ${
                        delivery.status === 'Failed'
                          ? `<button class="button button-small" data-whatsapp-action="retry" data-delivery-id="${escapeHtml(delivery.deliveryId)}" type="button">Retry</button>`
                          : ''
                      }
                      ${
                        ['Pending', 'Queued', 'Failed'].includes(delivery.status)
                          ? `<button class="button button-danger button-small" data-whatsapp-action="cancel" data-delivery-id="${escapeHtml(delivery.deliveryId)}" type="button">Cancel</button>`
                          : ''
                      }
                      ${
                        delivery.status === 'Failed'
                          ? `<button class="button button-secondary button-small" data-whatsapp-action="failure" data-delivery-id="${escapeHtml(delivery.deliveryId)}" type="button">View failure reason</button>`
                          : ''
                      }
                    </span>
                  </p>
                `
              )
              .join('')
          : '<p class="empty-state">No deliveries match these filters.</p>'
      }
    </article>
  `;
}

function renderFollowUps(items = []) {
  if (!items.length) {
    followUpList.innerHTML = '<p class="empty-state">No human follow-up items.</p>';
    return;
  }

  followUpList.innerHTML = items
    .map((item) => `
      <article class="admin-item" data-follow-up="${escapeHtml(item.followUpId)}">
        <h3>${escapeHtml(item.userName)} - ${escapeHtml(item.category)}</h3>
        <p>${escapeHtml(item.question)}</p>
        <p>Language: ${escapeHtml(item.language || '-')} | Date: ${escapeHtml(item.createdAt)} | Status: ${escapeHtml(item.status)}</p>
        <p>Context: ${escapeHtml(item.context)}</p>
        <textarea data-answer rows="3" placeholder="Write human answer...">${escapeHtml(item.humanAnswer)}</textarea>
        <div class="row-actions">
          <button class="button button-small" data-action="save-answer" type="button">Save answer</button>
          <button class="button button-secondary button-small" data-action="knowledge-draft" type="button">Add to Knowledge Drafts</button>
          <button class="button button-secondary button-small" data-action="content-draft" type="button">Create Content Draft</button>
        </div>
      </article>
    `)
    .join('');
}

function renderMissingKnowledge(items = []) {
  if (!items.length) {
    missingKnowledgeList.innerHTML = '<p class="empty-state">No missing knowledge events.</p>';
    return;
  }

  missingKnowledgeList.innerHTML = items
    .map((item) => `
      <article class="admin-item" data-missing="${escapeHtml(item.eventId)}">
        <h3>${escapeHtml(item.category)}</h3>
        <p>${escapeHtml(item.question)}</p>
        <p>Status: ${escapeHtml(item.status)} | Date: ${escapeHtml(item.createdAt)}</p>
        <textarea data-missing-answer rows="3" placeholder="Add answer...">${escapeHtml(item.answer)}</textarea>
        <div class="row-actions">
          <button class="button button-small" data-action="add-answer" type="button">Add Answer</button>
          <button class="button button-secondary button-small" data-action="resolve" type="button">Mark as Resolved</button>
          <button class="button button-secondary button-small" data-action="knowledge-item" type="button">Convert to Knowledge Base item</button>
          <button class="button button-secondary button-small" data-action="content-item" type="button">Convert to Content Draft</button>
          <button class="button button-danger button-small" data-action="ignore" type="button">Ignore</button>
        </div>
      </article>
    `)
    .join('');
}

function renderContentDrafts(items = []) {
  if (!items.length) {
    contentDraftsList.innerHTML = '<p class="empty-state">No content drafts.</p>';
    return;
  }

  contentDraftsList.innerHTML = items
    .map((draft) => `
      <article class="admin-item" data-draft="${escapeHtml(draft.draftId)}">
        <input data-title value="${escapeHtml(draft.title)}">
        <p>${escapeHtml(draft.category)} | ${escapeHtml(draft.language)} | ${escapeHtml(draft.audience)} | ${escapeHtml(draft.createdAt)} | Status: ${escapeHtml(draft.status)}</p>
        <p>Summary: ${escapeHtml(draft.summary)}</p>
        <textarea data-body rows="4">${escapeHtml(draft.body)}</textarea>
        <p>Source topics: ${escapeHtml(draft.sourceTopics)}</p>
        <div class="row-actions">
          <button class="button button-secondary button-small" data-action="review" type="button">In Review</button>
          <button class="button button-small" data-action="approve" type="button">Approve</button>
          <button class="button button-danger button-small" data-action="reject" type="button">Reject</button>
          <button class="button button-small" data-action="publish" type="button">Publish to Community</button>
        </div>
      </article>
    `)
    .join('');
}

function renderCommunityModeration(data = {}) {
  const comments = [...(data.flaggedComments || []), ...(data.recentComments || [])].filter(
    (comment, index, all) => all.findIndex((item) => item.commentId === comment.commentId) === index
  );

  if (!comments.length) {
    communityModerationList.innerHTML = '<p class="empty-state">No community comments yet.</p>';
    return;
  }

  communityModerationList.innerHTML = comments
    .map((comment) => `
      <article class="admin-item" data-comment="${escapeHtml(comment.commentId)}">
        <h3>${escapeHtml(comment.userName)} - ${escapeHtml(comment.status)}</h3>
        <p>${escapeHtml(comment.body)}</p>
        <p>Post: ${escapeHtml(comment.postId)} | Language: ${escapeHtml(comment.language)} | Date: ${escapeHtml(comment.createdAt)}</p>
        <div class="row-actions">
          <button class="button button-small" data-action="Publish" type="button">Publish</button>
          <button class="button button-secondary button-small" data-action="Keep Flagged" type="button">Keep Flagged</button>
          <button class="button button-danger button-small" data-action="Hide" type="button">Hide</button>
          <button class="button button-danger button-small" data-action="Delete from visible feed" type="button">Delete from visible feed</button>
        </div>
      </article>
    `)
    .join('');
}

function renderAdminDocuments(data = {}) {
  const documents = data.documents || [];
  const missing = data.missingRequiredDocuments || [];

  adminDocumentsList.innerHTML = `
    <article class="admin-item">
      <h3>Document warnings</h3>
      <p>Expired documents: ${escapeHtml((data.expiredDocuments || []).length)}</p>
      <p>Expiring within 30 days: ${escapeHtml((data.expiringDocuments || []).length)}</p>
      <p>Missing required documents: ${escapeHtml(missing.length)}</p>
      <p>Under review: ${escapeHtml((data.underReviewDocuments || []).length)}</p>
      <p>Users with no passport: ${escapeHtml((data.usersWithNoPassport || []).join(', ') || 'None')}</p>
      <p>Users with no visa: ${escapeHtml((data.usersWithNoVisa || []).join(', ') || 'None')}</p>
    </article>
    ${
      missing.length
        ? `<article class="admin-item"><h3>Missing Required Documents</h3>${missing
            .map((item) => `<p>${escapeHtml(item.userName)} needs ${escapeHtml(item.documentType)}</p>`)
            .join('')}</article>`
        : ''
    }
    ${
      documents.length
        ? documents
            .map(
              (document) => `
                <article class="admin-item" data-document="${escapeHtml(document.documentId)}">
                  <h3>${escapeHtml(document.userName)} - ${escapeHtml(document.documentType)}</h3>
                  <p>Status: ${escapeHtml(document.status)} | Verified: ${escapeHtml(document.verified || 'No')}</p>
                  <p>Number: ${escapeHtml(document.documentNumber || 'Not saved')} | Expiry: ${escapeHtml(document.expiryDate || '-')}</p>
                  <label><span>Update expiry date</span><input data-expiry value="${escapeHtml(document.expiryDate || '')}" placeholder="YYYY-MM-DD"></label>
                  <label><span>Admin note</span><input data-note value="${escapeHtml(document.notes || '')}" placeholder="Internal note"></label>
                  <div class="row-actions">
                    <button class="button button-small" data-action="verify" type="button">Mark verified</button>
                    <button class="button button-secondary button-small" data-action="under-review" type="button">Under review</button>
                    <button class="button button-secondary button-small" data-action="update-expiry" type="button">Update expiry</button>
                    <button class="button button-danger button-small" data-action="archive" type="button">Archive</button>
                  </div>
                </article>
              `
            )
            .join('')
        : '<p class="empty-state">No document records yet.</p>'
    }
  `;
}

function renderReport(reportData = {}) {
  const report = reportData.report || {};
  const sections = reportData.sections || {};
  reportDetail.innerHTML = `
    <article class="admin-item">
      <h3>Latest daily report: ${escapeHtml(report.reportDate || 'Not generated yet')}</h3>
      <p><strong>What happened yesterday:</strong> ${escapeHtml(sections.whatHappenedYesterday)}</p>
      <p><strong>Important problems:</strong> ${escapeHtml(sections.importantProblems)}</p>
      <p><strong>Questions requiring human attention:</strong> ${escapeHtml((sections.questionsRequiringHumanAttention || []).join('; ') || 'None')}</p>
      <p><strong>Popular topics:</strong> ${escapeHtml(sections.popularTopics)}</p>
      <p><strong>Document issues:</strong> Expiring soon: ${escapeHtml(report.expiringDocuments || 0)}; Expired: ${escapeHtml(report.expiredDocuments || 0)}; Missing: ${escapeHtml(report.missingRequiredDocuments || 'None')}; Renewals: ${escapeHtml(report.completedRenewals || 0)}</p>
      <p><strong>Notification stats:</strong> Created: ${escapeHtml(report.notificationsCreated || 0)}; Unread: ${escapeHtml(report.unreadNotifications || 0)}; Open rate: ${escapeHtml(report.notificationOpenRate || '0%')}; Dismissed: ${escapeHtml(report.dismissedNotifications || 0)}; Urgent: ${escapeHtml(report.urgentNotifications || 0)}; Due today: ${escapeHtml(report.scheduledNotificationsDueToday || 0)}</p>
      <p><strong>Top notification categories:</strong> ${escapeHtml(report.topNotificationCategories || 'None')}</p>
      <p><strong>WhatsApp:</strong> Connected users: ${escapeHtml(report.whatsappConnectedUsers || 0)}; Active users: ${escapeHtml(report.whatsappActiveUsers || 0)}; Received: ${escapeHtml(report.whatsappMessagesReceived || 0)}; Sent: ${escapeHtml(report.whatsappMessagesSent || 0)}; Session: ${escapeHtml(report.whatsappSessionMessages || 0)}; Template: ${escapeHtml(report.whatsappTemplateMessages || 0)}; Success: ${escapeHtml(report.whatsappSuccessRate || '0%')}; Failed: ${escapeHtml(report.whatsappFailedDeliveries || 0)}</p>
      <p><strong>WhatsApp operations:</strong> Retries: ${escapeHtml(report.whatsappRetryStatistics || '0 retries')} | Avg response: ${escapeHtml(report.whatsappAverageResponseTime || 'Not available')} | Commands: ${escapeHtml(report.whatsappMostCommonCommands || 'None')} | Actions: ${escapeHtml(report.whatsappMostCommonActions || 'None')}</p>
      <p><strong>LINE:</strong> Connected users: ${escapeHtml(report.lineConnectedUsers || 0)}; Daily active users: ${escapeHtml(report.lineDailyActiveUsers || 0)}; Received: ${escapeHtml(report.lineMessagesReceived || 0)}; Sent: ${escapeHtml(report.lineMessagesSent || 0)}; Notification success: ${escapeHtml(report.lineNotificationSuccessRate || '0%')}; Failed: ${escapeHtml(report.lineFailedDeliveries || 0)}</p>
      <p><strong>LINE operations:</strong> Avg response: ${escapeHtml(report.lineAverageResponseTime || 'Not available')} | Commands: ${escapeHtml(report.lineMostUsedCommands || 'None')} | Actions: ${escapeHtml(report.lineMostUsedActions || 'None')}</p>
      <p><strong>Translation:</strong> Requests: ${escapeHtml(report.translationRequests || 0)}; Success: ${escapeHtml(report.translationSuccesses || 0)}; Failed: ${escapeHtml(report.translationFailures || 0)}; Cache hits: ${escapeHtml(report.translationCacheHits || 0)}; Cache misses: ${escapeHtml(report.translationCacheMisses || 0)}; Avg: ${escapeHtml(report.translationAverageLatencyMs || 0)}ms; Provider: ${escapeHtml(report.translationProviderLatencyMs || 0)}ms</p>
      <p><strong>Recommended actions:</strong> ${escapeHtml((sections.recommendedActions || []).join('; ') || 'None')}</p>
      <p><strong>Content opportunities:</strong> ${escapeHtml((sections.contentOpportunities || []).join('; ') || 'None')}</p>
      <textarea id="ownerNotes" rows="3" placeholder="Owner notes..."></textarea>
      <div class="row-actions">
        <button id="markReportReviewedButton" class="button button-small" type="button">Mark report as reviewed</button>
        <button id="saveOwnerNotesButton" class="button button-secondary button-small" type="button">Add owner notes</button>
      </div>
    </article>
  `;
}

function renderRecommendations(items = []) {
  if (!items.length) {
    recommendationsList.innerHTML = '<p class="empty-state">No recommendations yet.</p>';
    return;
  }

  recommendationsList.innerHTML = items
    .map((item) => `
      <article class="admin-item" data-recommendation="${escapeHtml(item.recommendationId)}">
        <h3>${escapeHtml(item.title)}</h3>
        <p>${escapeHtml(item.type)} | ${escapeHtml(item.priority)} | Status: ${escapeHtml(item.status || 'New')}</p>
        <p>${escapeHtml(item.reason)}</p>
        <div class="row-actions">
          <button class="button button-secondary button-small" data-status="Accepted" type="button">Accepted</button>
          <button class="button button-secondary button-small" data-status="Planned" type="button">Planned</button>
          <button class="button button-small" data-status="Completed" type="button">Completed</button>
          <button class="button button-danger button-small" data-status="Rejected" type="button">Rejected</button>
        </div>
      </article>
    `)
    .join('');
}

function renderDashboard() {
  renderOverview(dashboard.overview);
  renderFollowUps(dashboard.humanFollowUps);
  renderMissingKnowledge(dashboard.missingKnowledge);
  renderContentDrafts(dashboard.contentDrafts);
  renderCommunityModeration(dashboard.communityModeration);
  renderAdminDocuments(dashboard.documents);
  renderAdminNotifications(dashboard.notifications);
  renderTranslationOverview(dashboard.translation);
  renderWhatsAppDashboard(dashboard.whatsapp);
  renderLineDashboard(dashboard.line);
  renderAdminTasks(dashboard.tasks, dashboard.taskAdminSummary || {});
  renderReport(dashboard.latestDailyReport);
  renderRecommendations(dashboard.recommendations);
}

async function loadDashboard() {
  hideError();
  dashboard = await adminFetch('/dashboard');
  renderDashboard();
}

document.querySelectorAll('[data-admin-section]').forEach((button) => {
  button.addEventListener('click', () => showSection(button.dataset.adminSection));
});

document.querySelector('#refreshAdminButton').addEventListener('click', () => loadDashboard().catch((error) => showError(error.message)));

document.querySelector('#generateDailyReportButton').addEventListener('click', async () => {
  try {
    await adminFetch('/reports/daily', { method: 'POST', body: '{}' });
    await loadDashboard();
    showSection('reportsSection');
  } catch (error) {
    showError(error.message);
  }
});

document.querySelector('#generateWeeklyReportButton').addEventListener('click', async () => {
  try {
    await adminFetch('/reports/weekly', { method: 'POST', body: '{}' });
    await loadDashboard();
    showSection('reportsSection');
  } catch (error) {
    showError(error.message);
  }
});

followUpList.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-action]');
  const item = event.target.closest('[data-follow-up]');
  if (!button || !item) return;
  const answer = item.querySelector('[data-answer]').value;

  try {
    if (button.dataset.action === 'save-answer') {
      await adminFetch(`/follow-ups/${encodeURIComponent(item.dataset.followUp)}/answer`, {
        method: 'POST',
        body: JSON.stringify({ answer, status: 'Answered' }),
      });
    } else if (button.dataset.action === 'knowledge-draft') {
      await adminFetch(`/follow-ups/${encodeURIComponent(item.dataset.followUp)}/knowledge-draft`, { method: 'POST', body: '{}' });
    } else if (button.dataset.action === 'content-draft') {
      await adminFetch(`/follow-ups/${encodeURIComponent(item.dataset.followUp)}/content-draft`, { method: 'POST', body: '{}' });
    }
    await loadDashboard();
  } catch (error) {
    showError(error.message);
  }
});

missingKnowledgeList.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-action]');
  const item = event.target.closest('[data-missing]');
  if (!button || !item) return;
  const answer = item.querySelector('[data-missing-answer]').value;
  const actionByButton = {
    'add-answer': 'Add Answer',
    resolve: 'Mark as Resolved',
    'knowledge-item': 'Convert to Knowledge Base item',
    'content-item': 'Convert to Content Draft',
    ignore: 'Ignore',
  };

  try {
    await adminFetch(`/missing-knowledge/${encodeURIComponent(item.dataset.missing)}`, {
      method: 'POST',
      body: JSON.stringify({ action: actionByButton[button.dataset.action], answer }),
    });
    await loadDashboard();
  } catch (error) {
    showError(error.message);
  }
});

contentDraftsList.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-action]');
  const item = event.target.closest('[data-draft]');
  if (!button || !item) return;
  const title = item.querySelector('[data-title]').value;
  const body = item.querySelector('[data-body]').value;
  const statusByAction = { review: 'In Review', approve: 'Approved', reject: 'Rejected' };

  try {
    if (button.dataset.action === 'publish') {
      await adminFetch(`/content-drafts/${encodeURIComponent(item.dataset.draft)}/publish`, { method: 'POST', body: '{}' });
    } else {
      await adminFetch(`/content-drafts/${encodeURIComponent(item.dataset.draft)}`, {
        method: 'PUT',
        body: JSON.stringify({ title, body, status: statusByAction[button.dataset.action] }),
      });
    }
    await loadDashboard();
  } catch (error) {
    showError(error.message);
  }
});

communityModerationList.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-action]');
  const item = event.target.closest('[data-comment]');
  if (!button || !item) return;

  try {
    await adminFetch(`/comments/${encodeURIComponent(item.dataset.comment)}/moderate`, {
      method: 'POST',
      body: JSON.stringify({ action: button.dataset.action }),
    });
    await loadDashboard();
  } catch (error) {
    showError(error.message);
  }
});

adminDocumentsList.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-action]');
  const item = event.target.closest('[data-document]');
  if (!button || !item) return;

  try {
    const payload = {
      action: button.dataset.action,
      expiryDate: item.querySelector('[data-expiry]')?.value || '',
      adminNote: item.querySelector('[data-note]')?.value || '',
      changeType: button.dataset.action === 'update-expiry' ? 'Updated' : '',
    };
    await adminFetch(`/documents/${encodeURIComponent(item.dataset.document)}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    await loadDashboard();
  } catch (error) {
    showError(error.message);
  }
});

adminNotificationForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  hideError();
  const formData = new FormData(adminNotificationForm);
  const scheduledAt = formData.get('scheduledAt') ? new Date(formData.get('scheduledAt')).toISOString() : '';

  try {
    await adminFetch('/notifications', {
      method: 'POST',
      body: JSON.stringify({
        title: formData.get('title'),
        message: formData.get('message'),
        type: formData.get('type'),
        priority: formData.get('priority'),
        actionLabel: formData.get('actionLabel'),
        actionUrl: formData.get('actionUrl'),
        scheduledAt,
        targetUserId: formData.get('targetUserId'),
        country: formData.get('country'),
        language: formData.get('language'),
        sector: formData.get('sector'),
        city: formData.get('city'),
        activeGoal: formData.get('activeGoal'),
      }),
    });
    await loadDashboard();
    showSection('notificationsSection');
  } catch (error) {
    showError(error.message);
  }
});

adminNotificationsList.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-action]');
  const item = event.target.closest('[data-notification]');
  if (!button || !item) return;

  try {
    if (button.dataset.action === 'cancel-scheduled') {
      await adminFetch(`/notifications/${encodeURIComponent(item.dataset.notification)}/cancel`, { method: 'POST', body: '{}' });
    }
    await loadDashboard();
    showSection('notificationsSection');
  } catch (error) {
    showError(error.message);
  }
});

translationSettingsForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  hideError();
  translationSettingsFeedback.hidden = true;
  translationSettingsFeedback.textContent = '';
  const formData = new FormData(translationSettingsForm);
  const enabledLanguages = ['en', ...formData.getAll('enabledLanguages').filter((language) => language !== 'en')];

  try {
    await adminFetch('/translation/settings', {
      method: 'PUT',
      body: JSON.stringify({
        translationEnabled: translationSettingsForm.elements.translationEnabled.checked,
        provider: formData.get('provider'),
        cacheEnabled: translationSettingsForm.elements.cacheEnabled.checked,
        cacheTtlMinutes: formData.get('cacheTtlMinutes'),
        enabledLanguages,
      }),
    });
    await loadDashboard();
    translationSettingsFeedback.textContent = 'Translation settings saved.';
    translationSettingsFeedback.hidden = false;
    showSection('translationSection');
  } catch (error) {
    showError(error.message);
  }
});

whatsappFilters.addEventListener('submit', (event) => {
  event.preventDefault();
  renderWhatsAppDashboard(dashboard.whatsapp);
  showSection('whatsappSection');
});

lineFilters.addEventListener('submit', (event) => {
  event.preventDefault();
  renderLineDashboard(dashboard.line);
  showSection('lineSection');
});

whatsappManualNotificationForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  hideError();
  const formData = new FormData(whatsappManualNotificationForm);
  try {
    await adminFetch('/whatsapp/notifications', {
      method: 'POST',
      body: JSON.stringify({
        title: formData.get('title'),
        message: formData.get('message'),
        type: formData.get('type'),
        priority: formData.get('priority'),
        actionLabel: formData.get('actionLabel'),
        actionUrl: formData.get('actionUrl'),
        targetUserId: formData.get('targetUserId'),
        country: formData.get('country'),
        language: formData.get('language'),
        sector: formData.get('sector'),
        city: formData.get('city'),
        activeGoal: formData.get('activeGoal'),
      }),
    });
    await loadDashboard();
    showSection('whatsappSection');
  } catch (error) {
    showError(error.message);
  }
});

whatsappDashboardList.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-whatsapp-action]');
  if (!button) return;
  const deliveryId = button.dataset.deliveryId;
  try {
    if (button.dataset.whatsappAction === 'retry') {
      await adminFetch(`/whatsapp/deliveries/${encodeURIComponent(deliveryId)}/retry`, { method: 'POST', body: '{}' });
    } else if (button.dataset.whatsappAction === 'cancel') {
      await adminFetch(`/whatsapp/deliveries/${encodeURIComponent(deliveryId)}/cancel`, { method: 'POST', body: '{}' });
    } else if (button.dataset.whatsappAction === 'failure') {
      const result = await adminFetch(`/whatsapp/deliveries/${encodeURIComponent(deliveryId)}/failure`);
      showError(
        result.failure
          ? `Failure reason: ${result.failure.failureCode || 'None'} | Attempts: ${result.failure.retryCount || '0'}`
          : 'Failure reason was not found.'
      );
      return;
    }
    await loadDashboard();
    showSection('whatsappSection');
  } catch (error) {
    showError(error.message);
  }
});

adminTaskForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  hideError();
  const formData = new FormData(adminTaskForm);
  try {
    await adminFetch('/tasks', {
      method: 'POST',
      body: JSON.stringify({
        userId: formData.get('userId'),
        country: formData.get('country'),
        language: formData.get('language'),
        sector: formData.get('sector'),
        city: formData.get('city'),
        activeGoal: formData.get('activeGoal'),
        title: formData.get('title'),
        description: formData.get('description'),
        internalNote: formData.get('internalNote'),
        category: formData.get('category'),
        priority: formData.get('priority'),
        dueDate: formData.get('dueDate'),
        dueTime: formData.get('dueTime'),
        relatedModule: formData.get('relatedModule'),
        recurrenceType: formData.get('recurrenceType'),
        recurrenceInterval: formData.get('recurrenceInterval'),
      }),
    });
    await loadDashboard();
    showSection('tasksSection');
  } catch (error) {
    showError(error.message);
  }
});

adminTasksList.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-action]');
  const item = event.target.closest('[data-task]');
  if (!button || !item) return;

  try {
    const payload = { action: button.dataset.action };
    if (button.dataset.action === 'reschedule') {
      payload.dueDate = item.querySelector('[data-task-due-date]')?.value || '';
      payload.dueTime = item.querySelector('[data-task-due-time]')?.value || '';
    }
    await adminFetch(`/tasks/${encodeURIComponent(item.dataset.task)}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    await loadDashboard();
    showSection('tasksSection');
  } catch (error) {
    showError(error.message);
  }
});

reportDetail.addEventListener('click', async (event) => {
  try {
    if (event.target.id === 'saveOwnerNotesButton') {
      const reportId = dashboard.latestDailyReport.report?.reportId || 'local-report';
      const body = document.querySelector('#ownerNotes').value || 'Reviewed.';
      await adminFetch(`/reports/${encodeURIComponent(reportId)}/notes`, { method: 'POST', body: JSON.stringify({ body }) });
      await loadDashboard();
    }
    if (event.target.id === 'markReportReviewedButton') {
      const reportId = dashboard.latestDailyReport.report?.reportId || 'local-report';
      await adminFetch(`/reports/${encodeURIComponent(reportId)}/notes`, {
        method: 'POST',
        body: JSON.stringify({ body: 'Report reviewed.' }),
      });
      await loadDashboard();
    }
  } catch (error) {
    showError(error.message);
  }
});

recommendationsList.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-status]');
  const item = event.target.closest('[data-recommendation]');
  if (!button || !item) return;

  try {
    await adminFetch(`/recommendations/${encodeURIComponent(item.dataset.recommendation)}`, {
      method: 'PUT',
      body: JSON.stringify({ status: button.dataset.status }),
    });
    await loadDashboard();
  } catch (error) {
    showError(error.message);
  }
});

loadDashboard().catch((error) => showError(error.message));
