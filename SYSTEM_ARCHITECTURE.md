# System Architecture

## 1. Executive Summary

Gringo is a local Node.js and Express application for assisting foreign workers through a web chat, an admin operations page, and communication-channel connectors. Confirmed user-facing capabilities are represented by modules for chat, onboarding/profile data, jobs, housing, money transfer comparison, community posts and comments, services, documents, notifications, tasks, and worker/contact records.

The frontend is a static browser application served from `src/public`. The main web chat entry point is `src/public/chat.html` with behavior in `src/public/chat.js`. The internal admin entry point is `src/public/admin.html` with behavior in `src/public/admin.js`.

The backend is an Express API. `src/server.js` starts the HTTP server, and `src/app.js` configures JSON parsing, static file serving, health checks, and API routes. Business functionality is organized under `src/modules`, generally using controller, route, service, repository, model, and index files where applicable.

Persistence is configured through Google Sheets using `googleapis` in `src/config/googleSheets.js`. Sheet names and credentials are read from environment variables in `src/config/env.js`. The repository also contains JSON files under `src/modules/knowledge-agent/knowledge-base` for internal knowledge-base content. Some modules contain local in-memory fallback variables, but complete fallback behavior across every module is Not Confirmed.

Confirmed communication channels are Web, Telegram, WhatsApp, and LINE. Telegram uses long polling and delivery processing. WhatsApp and LINE expose webhook handlers. A communication layer exists under `src/modules/communication` with adapters and channel registration for Web, Telegram, WhatsApp, and LINE.

Runtime is Node.js CommonJS. The package entry point is `src/server.js`. Scheduled local work is implemented with `setInterval` in `src/server.js` and `src/app.js` for notification processing and channel delivery queues. Deployment runtime is Not Confirmed.

## 2. Technology Stack

- Languages: JavaScript is used for backend modules, frontend scripts, setup scripts, and tests. HTML and CSS are used in `src/public`.
- Frontend technology: Static HTML, CSS, and browser JavaScript served by Express from `src/public`.
- Backend technology: Node.js with Express. Confirmed dependency versions are listed in `package.json`: `express`, `dotenv`, and `googleapis`.
- Database: Google Sheets is the configured persistence layer. Internal knowledge-base JSON files are also present under `src/modules/knowledge-agent/knowledge-base`.
- Database access method: `src/config/googleSheets.js` creates a Google Sheets client with `googleapis` and exports sheet read, append, and update helpers.
- Authentication tools: Admin API access uses an environment-configured admin API key in `src/config/env.js` and admin frontend requests send an `x-admin-api-key` header. WhatsApp webhook verification token, LINE channel signature validation, Telegram/LINE linking codes, and Google Sheets service-account credentials are configured through environment variables. Full user login is Not Confirmed.
- Testing tools: Node's built-in test runner is configured by the `test` script in `package.json` as `node --test`. Test files exist under `test`.
- Schedulers: Local `setInterval` schedulers process scheduled notifications and pending Telegram, WhatsApp, and LINE deliveries.
- Build tools: Not Confirmed. No build script is defined in `package.json`.
- Package manager: `package.json` defines Node package scripts and dependencies. The exact package manager command in use is Not Confirmed because no lockfile was verified.
- External APIs: Google Sheets API, Telegram Bot API, WhatsApp Business Cloud API, LINE Messaging API, and an AI provider configured through `AI_PROVIDER`, `AI_API_KEY`, and `AI_MODEL`. The `src/modules/ai-provider/openai.provider.js` file confirms an OpenAI provider implementation exists, but live use requires environment configuration.

## 3. Project Structure

Relevant directory tree:

```text
i-want-to-build-the-gringo/
  .env.example
  .gitignore
  CHANGELOG.md
  README.md
  SYSTEM_ARCHITECTURE.md
  TODO.md
  package.json
  docs/
  scripts/
    setupAdminSheets.js
    setupCommunitySheets.js
    setupContentAgentSheets.js
    setupCrmAgentSheets.js
    setupHousingSheet.js
    setupJobsSheet.js
    setupManagerAgentSheets.js
    setupMoneySheets.js
    setupWorkerSheets.js
    testGoogleSheetsConnection.js
  src/
    app.js
    server.js
    config/
      env.js
      googleSheets.js
    shared/
      errorHandler.js
    public/
      index.html
      chat.html
      chat.js
      admin.html
      admin.js
      styles.css
      add-contact.html
      add-worker.html
      contacts.html
      edit-worker.html
      workers.html
      contact-form.js
      contacts-list.js
      worker-form-fields.js
      worker-form.js
      workers-list.js
    modules/
      admin/
      ai-provider/
      chat/
      communication/
      community/
      contacts/
      content-agent/
      core-agent/
      crm-agent/
      documents/
      gringo/
      housing/
      jobs/
      knowledge-agent/
      line/
      manager-agent/
      money/
      notifications/
      services/
      tasks/
      telegram/
      whatsapp/
      workers/
  test/
    contact.validation.test.js
    contacts.api.test.js
    core-agent-ai-provider.test.js
    workers.api.test.js
```

Module file patterns confirmed in `src/modules`:

- Controllers: files ending in `.controller.js`, including admin, chat, community, contacts, documents, housing, jobs, money, notifications, services, tasks, telegram, and workers.
- Routes: files ending in `.routes.js`, including admin, chat, community, contacts, documents, housing, jobs, money, notifications, services, tasks, telegram, and workers.
- Services: files ending in `.service.js`, including AI provider, communication, community, contacts, content-agent, core-agent, CRM agent, documents, Gringo rules/service, housing, jobs, knowledge-agent, LINE, manager-agent, money, notifications, services, tasks, Telegram, WhatsApp, and workers.
- Repositories: files ending in `.repository.js`, including admin, community, contacts, content-agent, CRM agent, documents, housing, jobs, LINE delivery/linking, manager-agent, money, notifications, services, tasks, Telegram delivery/linking, WhatsApp delivery, and workers.
- Models: files ending in `.model.js`, including admin, community comments/posts, contacts/history, content drafts, conversation history, documents, housing, jobs, knowledge-agent, LINE delivery/linking, manager reports, money exchange/provider records, notifications, tasks, Telegram delivery/linking, user profiles, WhatsApp delivery/templates, workers/history.
- Database/configuration files: `src/config/env.js`, `src/config/googleSheets.js`, setup scripts in `scripts`, and knowledge-base JSON files under `src/modules/knowledge-agent/knowledge-base`.
- Admin files: `src/public/admin.html`, `src/public/admin.js`, and `src/modules/admin`.
- Frontend files: `src/public/*.html`, `src/public/*.js`, and `src/public/styles.css`.
- Tests: files under `test`.
- Documentation: `README.md`, `CHANGELOG.md`, `TODO.md`, `docs`, and this file.

## 4. Application Entry Points

- Server startup: `src/server.js` is the package main entry point and is used by the `start` and `dev` scripts in `package.json`.
- Express app setup: `src/app.js` creates the Express app, configures JSON parsing with raw body capture, serves `src/public`, exposes `/health`, mounts API routes, and registers the shared error handler.
- Frontend entry point: `src/public/index.html` exists. The active chat UI entry point is `src/public/chat.html`, with client logic in `src/public/chat.js`.
- Admin entry point: `src/public/admin.html`, with client logic in `src/public/admin.js`.
- API route entry points:
  - `/api/contacts` from `src/modules/contacts/contact.routes.js`
  - `/api/workers` from `src/modules/workers/worker.routes.js`
  - `/api/jobs` from `src/modules/jobs`
  - `/api/housing` from `src/modules/housing`
  - `/api/money` from `src/modules/money`
  - `/api/community` from `src/modules/community`
  - `/api/admin` from `src/modules/admin`
  - `/api/services` from `src/modules/services`
  - `/api/documents` from `src/modules/documents`
  - `/api/notifications` from `src/modules/notifications`
  - `/api/tasks` from `src/modules/tasks`
  - `/api/chat` from `src/modules/chat`
  - `/api/telegram` from `src/modules/telegram`
  - `/api/whatsapp` from `src/modules/whatsapp`
  - `/api/line` from `src/modules/line`
- Workers: `src/modules/workers` provides worker records and routes. Separate background worker processes are Not Confirmed.
- Schedulers:
  - `src/app.js` calls `notificationService.processScheduledNotifications()` at startup and every 5 minutes.
  - `src/server.js` processes pending Telegram, WhatsApp, and LINE deliveries at startup and every 60 seconds.
  - `src/server.js` starts Telegram polling at startup.
  - `src/server.js` expires Telegram and LINE link codes at startup.
- Webhook handlers:
  - WhatsApp webhook handling is implemented in `src/modules/whatsapp/whatsapp-webhook.service.js`.
  - LINE webhook handling is implemented in `src/modules/line/line-webhook.service.js`.
  - Telegram uses long polling through `src/modules/telegram/telegram-update.service.js`; a Telegram webhook handler is Not Confirmed.
- CLI scripts:
  - `npm start`: starts `node src/server.js`.
  - `npm run dev`: starts `node --watch src/server.js`.
  - `npm test`: runs `node --test`.
  - Google Sheets setup/test scripts are listed in `package.json` and located in `scripts`.

Startup flow:

1. `src/server.js` imports `src/app.js` and environment configuration from `src/config/env.js`.
2. `src/app.js` creates the Express app, configures middleware, serves static frontend files, mounts API routes, starts scheduled notification processing, and exports the app.
3. `src/server.js` listens on the configured port.
4. After the server starts listening, `src/server.js` starts Telegram polling, expires Telegram and LINE link codes, and runs pending delivery processing for Telegram, WhatsApp, and LINE.
5. Repeating intervals continue processing scheduled notifications and channel delivery queues during local runtime.

## 5. Active Modules

Confirmed module count under `src/modules`: 23.

### admin

- Purpose: Internal operations center for reports, follow-ups, content drafts, moderation, documents, notifications, tasks, WhatsApp, and LINE dashboard data.
- Main files: `src/modules/admin/admin.controller.js`, `src/modules/admin/admin.routes.js`, `src/modules/admin/admin.service.js`, `src/modules/admin/admin.repository.js`, `src/modules/admin/admin.model.js`, `src/modules/admin/index.js`.
- Main services: `admin.service.js`.
- Models: `admin.model.js`.
- Routes: `admin.routes.js`, mounted at `/api/admin`.
- Dependencies: Manager Agent repository/service, Content Agent repository/model, Community, Documents, Notifications, Tasks, LINE, WhatsApp.
- Business responsibility: Admin dashboard data, reports, human follow-up, missing knowledge, knowledge drafts, content approval, moderation, document administration, notification operations, task administration, channel dashboards.
- Implementation status: Implemented and mounted.

### ai-provider

- Purpose: AI provider abstraction for fallback natural-language responses.
- Main files: `src/modules/ai-provider/ai-provider.service.js`, `src/modules/ai-provider/openai.provider.js`, `src/modules/ai-provider/gringo-prompt.service.js`, `src/modules/ai-provider/ai-provider.errors.js`, `src/modules/ai-provider/index.js`.
- Main services: `ai-provider.service.js`, `gringo-prompt.service.js`, `openai.provider.js`.
- Models: Not Confirmed.
- Routes: Not Confirmed.
- Dependencies: Environment values `AI_PROVIDER`, `AI_API_KEY`, `AI_MODEL`; Core Agent imports `aiProviderService`.
- Business responsibility: Generate AI fallback replies when the Knowledge Agent does not provide a complete answer.
- Implementation status: Implemented as a service module; no direct API route confirmed.

### chat

- Purpose: Web chat API surface and web profile update endpoints.
- Main files: `src/modules/chat/chat.controller.js`, `src/modules/chat/chat.routes.js`, `src/modules/chat/index.js`.
- Main services: Uses Core Agent and CRM Agent services.
- Models: Not Confirmed.
- Routes: `chat.routes.js`, mounted at `/api/chat`.
- Dependencies: Core Agent, CRM Agent.
- Business responsibility: Accept web chat messages, request onboarding/startup/profile data, and pass messages to the Core Agent.
- Implementation status: Implemented and mounted.

### communication

- Purpose: Unified communication layer for channel adapters.
- Main files: `src/modules/communication/channel-adapter.js`, `src/modules/communication/channel-registry.js`, `src/modules/communication/communication.service.js`, `src/modules/communication/communication-errors.js`, `src/modules/communication/index.js`.
- Main services: `communication.service.js`.
- Models: Not Confirmed.
- Routes: Not Confirmed.
- Dependencies: Telegram client, WhatsApp client, LINE client.
- Business responsibility: Register channels, choose channels, send messages, send interactive messages, send notifications, support account-link operations, feature detection, fallback selection, health checks, and safe communication logging.
- Implementation status: Implemented as an internal service module.

### community

- Purpose: Community feed, posts, comments, relevance, moderation-related records.
- Main files: `src/modules/community/community.controller.js`, `src/modules/community/community.routes.js`, `src/modules/community/community.service.js`, `src/modules/community/community.repository.js`, `src/modules/community/community-post.model.js`, `src/modules/community/community-comment.model.js`, `src/modules/community/sample-community-posts.js`, `src/modules/community/index.js`.
- Main services: `community.service.js`.
- Models: `community-post.model.js`, `community-comment.model.js`.
- Routes: `community.routes.js`, mounted at `/api/community`.
- Dependencies: Google Sheets helpers through repository; CRM/Profile data is used by callers for relevance.
- Business responsibility: Published posts, relevant post lookup, post detail, comments, comment status/moderation actions.
- Implementation status: Implemented and mounted.

### contacts

- Purpose: Contact records and contact history.
- Main files: `src/modules/contacts/contact.controller.js`, `src/modules/contacts/contact.routes.js`, `src/modules/contacts/contact.service.js`, `src/modules/contacts/contact.repository.js`, `src/modules/contacts/contact.model.js`, `src/modules/contacts/contactHistory.model.js`, `src/modules/contacts/contact.validation.js`.
- Main services: `contact.service.js`.
- Models: `contact.model.js`, `contactHistory.model.js`.
- Routes: `contact.routes.js`, mounted at `/api/contacts`.
- Dependencies: Google Sheets helpers through repository.
- Business responsibility: Contact CRUD-style API and validation.
- Implementation status: Implemented and mounted.

### content-agent

- Purpose: Content draft storage and draft generation workflow support.
- Main files: `src/modules/content-agent/content-agent.service.js`, `src/modules/content-agent/content-agent.repository.js`, `src/modules/content-agent/content-agent.interface.js`, `src/modules/content-agent/content-draft.model.js`, `src/modules/content-agent/index.js`.
- Main services: `content-agent.service.js`.
- Models: `content-draft.model.js`.
- Routes: Not Confirmed.
- Dependencies: Admin service imports Content Agent repository/model.
- Business responsibility: Store and manage content drafts used by admin/content approval workflows.
- Implementation status: Implemented as an internal module; direct route Not Confirmed.

### core-agent

- Purpose: Central message orchestration for Gringo conversations.
- Main files: `src/modules/core-agent/core-agent.service.js`, `src/modules/core-agent/onboarding.service.js`, `src/modules/core-agent/personalization.service.js`, `src/modules/core-agent/core-agent.interface.js`, `src/modules/core-agent/index.js`.
- Main services: `core-agent.service.js`, `onboarding.service.js`, `personalization.service.js`.
- Models: Not Confirmed.
- Routes: Not Confirmed.
- Dependencies: AI Provider, CRM Agent, Community, Documents, Housing, Jobs, Knowledge Agent, Money, Services, Tasks.
- Business responsibility: Detect onboarding state, update personalization/active goals, route intents to business modules, use Knowledge Agent and AI fallback, persist CRM history and memory.
- Implementation status: Implemented as internal orchestration module.

### crm-agent

- Purpose: User profile, conversation history, and memory storage.
- Main files: `src/modules/crm-agent/crm-agent.service.js`, `src/modules/crm-agent/crm-agent.repository.js`, `src/modules/crm-agent/memory-extraction.service.js`, `src/modules/crm-agent/user-profile.model.js`, `src/modules/crm-agent/conversation-history.model.js`, `src/modules/crm-agent/crm-agent.interface.js`, `src/modules/crm-agent/index.js`.
- Main services: `crm-agent.service.js`, `memory-extraction.service.js`.
- Models: `user-profile.model.js`, `conversation-history.model.js`.
- Routes: Not Confirmed.
- Dependencies: Google Sheets helpers through repository.
- Business responsibility: Find/create channel users, update profiles, save conversations, extract/update memory.
- Implementation status: Implemented as internal storage/orchestration module.

### documents

- Purpose: User documents, required-document checklist, expiry status, renewal/history support.
- Main files: `src/modules/documents/document.controller.js`, `src/modules/documents/document.routes.js`, `src/modules/documents/document.service.js`, `src/modules/documents/document.repository.js`, `src/modules/documents/document.model.js`, `src/modules/documents/sample-documents.js`, `src/modules/documents/index.js`.
- Main services: `document.service.js`.
- Models: `document.model.js`.
- Routes: `document.routes.js`, mounted at `/api/documents`.
- Dependencies: Google Sheets helpers through repository; Core Agent and channel modules call document service.
- Business responsibility: Store, update, archive, summarize, mask, and match document status against user profile requirements.
- Implementation status: Implemented and mounted.

### gringo

- Purpose: Gringo personality, tone, rules, and service definitions.
- Main files: `src/modules/gringo/gringo.service.js`, `src/modules/gringo/gringo.interface.js`, `src/modules/gringo/gringo.personality.js`, `src/modules/gringo/gringo.tone.js`, `src/modules/gringo/gringo.conversation-rules.js`, `src/modules/gringo/gringo.follow-up-rules.js`, `src/modules/gringo/gringo.greeting-rules.js`, `src/modules/gringo/gringo.memory-rules.js`, `src/modules/gringo/gringo.proactive-rules.js`, `src/modules/gringo/index.js`.
- Main services: `gringo.service.js`.
- Models: Not Confirmed.
- Routes: Not Confirmed.
- Dependencies: Not Confirmed.
- Business responsibility: Conversational rules and personality/tone configuration.
- Implementation status: Module exists; direct integration into `src/app.js` or Core Agent was Not Confirmed.

### housing

- Purpose: Housing listings, filters, matching, and chat responses.
- Main files: `src/modules/housing/housing.controller.js`, `src/modules/housing/housing.routes.js`, `src/modules/housing/housing.service.js`, `src/modules/housing/housing.repository.js`, `src/modules/housing/housing.model.js`, `src/modules/housing/sample-housing-listings.js`, `src/modules/housing/index.js`.
- Main services: `housing.service.js`.
- Models: `housing.model.js`.
- Routes: `housing.routes.js`, mounted at `/api/housing`.
- Dependencies: Google Sheets helpers through repository; Core Agent calls housing service.
- Business responsibility: Create/list active housing, match housing to profile and search context, format housing results.
- Implementation status: Implemented and mounted.

### jobs

- Purpose: Job listings, matching, and job-related chat/API responses.
- Main files: `src/modules/jobs/job.controller.js`, `src/modules/jobs/job.routes.js`, `src/modules/jobs/job.service.js`, `src/modules/jobs/job.repository.js`, `src/modules/jobs/job.model.js`, `src/modules/jobs/sample-jobs.js`, `src/modules/jobs/index.js`.
- Main services: `job.service.js`.
- Models: `job.model.js`.
- Routes: `job.routes.js`, mounted at `/api/jobs`.
- Dependencies: Google Sheets helpers through repository; Core Agent and channel modules call job service.
- Business responsibility: Create/list active jobs, match jobs to user profile, format job responses.
- Implementation status: Implemented and mounted.

### knowledge-agent

- Purpose: Internal knowledge lookup, classification, missing knowledge, and handoff.
- Main files: `src/modules/knowledge-agent/knowledge-agent.service.js`, `src/modules/knowledge-agent/knowledge-base.service.js`, `src/modules/knowledge-agent/knowledge-classifier.service.js`, `src/modules/knowledge-agent/missing-knowledge.service.js`, `src/modules/knowledge-agent/handoff.service.js`, `src/modules/knowledge-agent/knowledge-agent.model.js`, `src/modules/knowledge-agent/knowledge-agent.constants.js`, `src/modules/knowledge-agent/knowledge-agent.interface.js`, `src/modules/knowledge-agent/index.js`.
- Main services: `knowledge-agent.service.js`, `knowledge-base.service.js`, `knowledge-classifier.service.js`, `missing-knowledge.service.js`, `handoff.service.js`.
- Models: `knowledge-agent.model.js`.
- Routes: Not Confirmed.
- Dependencies: JSON knowledge-base files in `src/modules/knowledge-agent/knowledge-base`; Core Agent calls Knowledge Agent.
- Business responsibility: Answer questions from internal knowledge, classify questions, return status/category, track missing knowledge or handoff state.
- Implementation status: Implemented as internal module.

### line

- Purpose: LINE Messaging API connector, webhook handling, LINE account linking, LINE delivery, rich menu, and LINE actions.
- Main files: `src/modules/line/line-client.service.js`, `src/modules/line/line-webhook.service.js`, `src/modules/line/line-message.mapper.js`, `src/modules/line/line-message.service.js`, `src/modules/line/line-delivery.service.js`, `src/modules/line/line-delivery.repository.js`, `src/modules/line/line-delivery.model.js`, `src/modules/line/line-link.service.js`, `src/modules/line/line-link.repository.js`, `src/modules/line/line-link.model.js`, `src/modules/line/line-errors.js`, `src/modules/line/index.js`.
- Main services: `line-client.service.js`, `line-webhook.service.js`, `line-message.service.js`, `line-delivery.service.js`, `line-link.service.js`.
- Models: `line-delivery.model.js`, `line-link.model.js`.
- Routes: `lineRoutes` from `line-webhook.service.js`, mounted at `/api/line`.
- Dependencies: CRM Agent, Core Agent, Communication Layer, Documents, Housing, Jobs, Notifications, Tasks, LINE environment variables.
- Business responsibility: Validate LINE webhooks, map LINE messages, route text/actions through existing modules, manage secure linking, process LINE delivery queue/history, manage rich menu.
- Implementation status: Implemented and mounted.

### manager-agent

- Purpose: Daily/weekly reports and operational recommendations.
- Main files: `src/modules/manager-agent/manager-agent.service.js`, `src/modules/manager-agent/manager-agent.repository.js`, `src/modules/manager-agent/manager-report.model.js`, `src/modules/manager-agent/manager-agent.interface.js`, `src/modules/manager-agent/index.js`.
- Main services: `manager-agent.service.js`.
- Models: `manager-report.model.js`.
- Routes: Not Confirmed.
- Dependencies: Manager repository, Notifications, Tasks, WhatsApp delivery, LINE delivery.
- Business responsibility: Generate reports, aggregate operational stats, generate recommendations.
- Implementation status: Implemented as internal module used by Admin.

### money

- Purpose: Exchange rates and money transfer provider comparison.
- Main files: `src/modules/money/money.controller.js`, `src/modules/money/money.routes.js`, `src/modules/money/money.service.js`, `src/modules/money/money.repository.js`, `src/modules/money/exchange-rate.model.js`, `src/modules/money/money-transfer-provider.model.js`, `src/modules/money/sample-money-data.js`, `src/modules/money/index.js`.
- Main services: `money.service.js`.
- Models: `exchange-rate.model.js`, `money-transfer-provider.model.js`.
- Routes: `money.routes.js`, mounted at `/api/money`.
- Dependencies: Google Sheets helpers through repository; Core Agent calls money service.
- Business responsibility: Store exchange rates and providers, calculate transfer fees/received amounts, rank providers, format demo money responses.
- Implementation status: Implemented and mounted.

### notifications

- Purpose: In-app notification center, scheduled notifications, preference checks, notification summaries.
- Main files: `src/modules/notifications/notification.controller.js`, `src/modules/notifications/notification.routes.js`, `src/modules/notifications/notification.service.js`, `src/modules/notifications/notification.repository.js`, `src/modules/notifications/notification.model.js`, `src/modules/notifications/index.js`.
- Main services: `notification.service.js`.
- Models: `notification.model.js`.
- Routes: `notification.routes.js`, mounted at `/api/notifications`.
- Dependencies: Google Sheets helpers through repository; `src/app.js` scheduler calls notification service.
- Business responsibility: Create/read/update notification records, unread counts, read/dismiss/complete/reschedule/expire behavior, admin summaries.
- Implementation status: Implemented and mounted.

### services

- Purpose: Services marketplace and personalized service results.
- Main files: `src/modules/services/service.controller.js`, `src/modules/services/service.routes.js`, `src/modules/services/service.service.js`, `src/modules/services/service.repository.js`, `src/modules/services/service.model.js`, `src/modules/services/sample-services.js`, `src/modules/services/index.js`.
- Main services: `service.service.js`.
- Models: `service.model.js`.
- Routes: `service.routes.js`, mounted at `/api/services`.
- Dependencies: Google Sheets helpers through repository; Core Agent and channel modules call service service.
- Business responsibility: Store and find trusted services by category, city, language, profile, and tags.
- Implementation status: Implemented and mounted.

### tasks

- Purpose: Tasks, reminders, schedule, recurrence, and task history.
- Main files: `src/modules/tasks/task.controller.js`, `src/modules/tasks/task.routes.js`, `src/modules/tasks/task.service.js`, `src/modules/tasks/task.repository.js`, `src/modules/tasks/task.model.js`, `src/modules/tasks/sample-tasks.js`, `src/modules/tasks/index.js`.
- Main services: `task.service.js`.
- Models: `task.model.js`.
- Routes: `task.routes.js`, mounted at `/api/tasks`.
- Dependencies: Google Sheets helpers through repository; Core Agent and channel modules call task service.
- Business responsibility: Create/update/list tasks, complete/dismiss/archive, calculate task status, recurrence and history, chat task handling, task statistics.
- Implementation status: Implemented and mounted.

### telegram

- Purpose: Telegram connector, long polling, Telegram CRM/Core integration, Telegram account linking, commands, callbacks, and delivery queue.
- Main files: `src/modules/telegram/telegram-client.service.js`, `src/modules/telegram/telegram-update.service.js`, `src/modules/telegram/telegram-message.mapper.js`, `src/modules/telegram/telegram-message.service.js`, `src/modules/telegram/telegram-delivery.service.js`, `src/modules/telegram/telegram-delivery.repository.js`, `src/modules/telegram/telegram-delivery.model.js`, `src/modules/telegram/telegram-link.service.js`, `src/modules/telegram/telegram-link.repository.js`, `src/modules/telegram/telegram-link.model.js`, `src/modules/telegram/telegram.controller.js`, `src/modules/telegram/telegram.routes.js`, `src/modules/telegram/telegram-errors.js`, `src/modules/telegram/index.js`.
- Main services: `telegram-client.service.js`, `telegram-update.service.js`, `telegram-message.service.js`, `telegram-delivery.service.js`, `telegram-link.service.js`.
- Models: `telegram-delivery.model.js`, `telegram-link.model.js`.
- Routes: `telegram.routes.js`, mounted at `/api/telegram`.
- Dependencies: CRM Agent, Core Agent, Communication Layer, business modules, Telegram environment variables.
- Business responsibility: Poll Telegram updates, map Telegram messages, route messages to Core Agent and modules, save CRM history, handle callbacks/linking, process Telegram notification delivery.
- Implementation status: Implemented and mounted.

### whatsapp

- Purpose: WhatsApp Business Cloud API connector, webhook processing, conversation commands/actions, templates, delivery, status history.
- Main files: `src/modules/whatsapp/whatsapp-client.service.js`, `src/modules/whatsapp/whatsapp-webhook.service.js`, `src/modules/whatsapp/whatsapp-message.mapper.js`, `src/modules/whatsapp/whatsapp-message.service.js`, `src/modules/whatsapp/whatsapp-delivery.service.js`, `src/modules/whatsapp/whatsapp-delivery.repository.js`, `src/modules/whatsapp/whatsapp-delivery.model.js`, `src/modules/whatsapp/whatsapp-template.model.js`, `src/modules/whatsapp/whatsapp-errors.js`, `src/modules/whatsapp/index.js`.
- Main services: `whatsapp-client.service.js`, `whatsapp-webhook.service.js`, `whatsapp-message.service.js`, `whatsapp-delivery.service.js`.
- Models: `whatsapp-delivery.model.js`, `whatsapp-template.model.js`.
- Routes: `whatsappRoutes` from `whatsapp-webhook.service.js`, mounted at `/api/whatsapp`.
- Dependencies: CRM Agent, Core Agent, Communication Layer, business modules, WhatsApp environment variables.
- Business responsibility: Verify webhooks, process WhatsApp messages/statuses/actions, enforce conversation-window/template behavior, send notification deliveries, preserve CRM history.
- Implementation status: Implemented and mounted.

### workers

- Purpose: Worker records and worker history.
- Main files: `src/modules/workers/worker.controller.js`, `src/modules/workers/worker.routes.js`, `src/modules/workers/worker.service.js`, `src/modules/workers/worker.repository.js`, `src/modules/workers/worker.model.js`, `src/modules/workers/workerHistory.model.js`, `src/modules/workers/worker.validation.js`.
- Main services: `worker.service.js`.
- Models: `worker.model.js`, `workerHistory.model.js`.
- Routes: `worker.routes.js`, mounted at `/api/workers`.
- Dependencies: Google Sheets helpers through repository.
- Business responsibility: Worker API, validation, and history records.
- Implementation status: Implemented and mounted.

## 6. Core Agent

Confirmed folder and files:

- `src/modules/core-agent/core-agent.service.js`
- `src/modules/core-agent/onboarding.service.js`
- `src/modules/core-agent/personalization.service.js`
- `src/modules/core-agent/core-agent.interface.js`
- `src/modules/core-agent/index.js`

Incoming-message flow:

1. Web chat calls `chat.controller.js`, which calls `coreAgentService.processWebMessage`.
2. Telegram and WhatsApp message services call `coreAgentService.processWebMessage` for normal text after channel mapping/user handling.
3. LINE message service maps supported LINE commands to prompt text or passes text directly, then calls `coreAgentService.processWebMessage`.
4. `processWebMessage` normalizes `message`, `channel`, `channelUserId`, and language.
5. The Core Agent checks onboarding first.
6. The Core Agent applies personalization and goal updates.
7. The Core Agent routes recognized intents to business modules before falling back to Knowledge Agent and AI Provider.
8. The Core Agent saves conversation and memory through CRM Agent where implemented in each branch.

Intent or command handling:

- Core Agent has rule-based detectors for jobs, housing, money, community, documents, services, tasks, and goal-completion messages.
- Onboarding commands include restart/correct flows in `onboarding.service.js`.
- Channel-specific commands exist in Telegram, WhatsApp, and LINE message services. Those commands either call existing business services or call Core Agent with mapped prompt text.

Module routing:

- Jobs route to `jobService.findMatchingJobs` and `jobService.formatJobsForChat`.
- Housing routes to `housingService.findMatchingHousing` and `housingService.formatHousingForChat`.
- Money routes to `moneyService.getExchangeRate`, `moneyService.compareTransfers`, and formatting helpers.
- Community routes to `communityService.getRelevantPosts` and `communityService.formatPostsForChat`.
- Documents route to document lookup, save/update, summary, and formatting helpers.
- Services route to `serviceService.inferServiceSearch`, `serviceService.findMatchingServices`, and `serviceService.formatServicesForChat`.
- Tasks route to `taskService.handleTaskChat`.
- Knowledge fallback routes to `knowledgeAgentService.answerQuestion`.
- AI fallback routes to `aiProviderService.generateReply` when `shouldUseAiProvider` returns true.

Conversation context:

- `core-agent.service.js` stores recent conversation context in an in-memory `Map` named `recentConversationByUser`.
- The conversation key is built from `channel` and `channelUserId`.
- The retained recent context is limited to the last five question/answer pairs.
- Persistence of this recent in-memory context across server restart is Not Confirmed.

Response generation:

- Module-specific branches produce formatted replies through the relevant service.
- Knowledge Agent responses are used when available.
- AI Provider can generate a fallback response when knowledge is not found or the answer needs natural conversation.
- Friendly fallback text exists when AI or knowledge cannot produce a final answer.

CRM history:

- Core Agent uses `crmAgentService.findOrCreateUser`, `crmAgentService.saveConversation`, `crmAgentService.updateUserProfile`, and `crmAgentService.extractAndUpdateMemory`.
- Some branches return `crm.saved: false` even after attempting persistence; exact consistency of these response metadata values is Not Confirmed.
- Channel message services also save channel-specific incoming/outgoing/action history.

Human escalation:

- Knowledge results with `status === 'NEEDS_HUMAN'` are saved with `needsHumanFollowUp`.
- Admin module builds human follow-up queues from `NEEDS_HUMAN`, `NOT_FOUND`, and `needsHumanFollowUp`.

Channel separation:

- Core Agent receives a `channel` value and `channelUserId`.
- The recent context key includes channel and channel user ID.
- Telegram, WhatsApp, and LINE have separate message mappers/services before calling the Core Agent.
- Outgoing channel delivery is handled outside the Core Agent by channel services and the Communication Layer.

Text flow diagram:

```text
Incoming message
  -> Channel surface
     -> Web chat controller OR Telegram service OR WhatsApp service OR LINE service
  -> CRM user lookup / create where applicable
  -> Core Agent processWebMessage
     -> language detection
     -> onboarding check
     -> personalization and active goal updates
     -> intent detection
     -> module route:
        Jobs | Housing | Money | Community | Documents | Services | Tasks
     -> Knowledge Agent fallback
     -> AI Provider fallback when configured/needed
  -> CRM conversation history and memory update
  -> Reply returned to channel surface
  -> Channel-specific outgoing response
```

## 7. Communication Layer

Folder and files:

- `src/modules/communication/channel-adapter.js`
- `src/modules/communication/channel-registry.js`
- `src/modules/communication/communication.service.js`
- `src/modules/communication/communication-errors.js`
- `src/modules/communication/index.js`

Adapter interface:

`channel-adapter.js` requires each adapter to implement:

- `initialize`
- `receiveMessage`
- `sendMessage`
- `sendInteractiveMessage`
- `sendNotification`
- `linkAccount`
- `unlinkAccount`
- `supportsFeature`
- `healthCheck`

Registry:

- `channel-registry.js` defines a `FEATURE_MAP`.
- It creates adapters for Web, Telegram, WhatsApp, and LINE.
- It registers default channels through `registerDefaultChannels`.
- It exposes `getChannel`, `getChannels`, `registerChannel`, and `registerDefaultChannels`.

Registered channels:

- `web`
- `telegram`
- `whatsapp`
- `line`

Communication service:

- `communication.service.js` normalizes channel names.
- It checks whether a channel is connected for a user profile.
- It checks notification preferences.
- It selects a channel using requested channel, preferred channel, profile channel, and fallback channel.
- It exposes `initialize`, `receiveMessage`, `sendMessage`, `sendInteractiveMessage`, `sendNotification`, `linkAccount`, `unlinkAccount`, `supportsFeature`, `healthCheck`, `isConnectedChannel`, and `selectChannel`.

Supported methods:

- Text send: `sendMessage`.
- Interactive send: `sendInteractiveMessage`.
- Notification send: `sendNotification`.
- Incoming normalization entry: `receiveMessage`.
- Account link/unlink methods are present in the interface.
- Health check is available for one channel or all channels.

Feature detection:

- Web: `text`, `buttons`, `lists`, `media`, `documents`, `location`.
- Telegram: `text`, `buttons`, `documents`, `media`.
- WhatsApp: `text`, `buttons`, `lists`, `templates`, `media`, `documents`, `location`, `voice`, `read receipts`.
- LINE: `text`, `buttons`, `media`.

Preferred channel:

- `communication.service.js` can use `profile.preferredChannel` when a requested channel is not supplied.
- It requires the preferred channel to be connected and available before selection.

Fallback channel:

- `communication.service.js` can use `profile.fallbackChannel` when fallback is allowed.
- `fallbackUsed` is reported in safe communication logs.
- Cross-channel notification deduplication behavior in the Communication Layer itself is Not Confirmed.

Duplicate prevention:

- Duplicate prevention is confirmed in channel delivery services and webhook/update services, not as a generic Communication Layer feature.
- Telegram delivery service prevents duplicate deliveries by notification/channel state.
- WhatsApp delivery service prevents duplicate deliveries by notification/channel state.
- LINE delivery service prevents duplicate deliveries by notification/channel state.
- Telegram update service tracks processed updates.
- LINE webhook service tracks processed message IDs and checks persisted message history.
- WhatsApp duplicate webhook behavior exists in WhatsApp services, but the exact storage mechanism is Not Confirmed in this section.

Failure handling:

- Communication Layer throws `CommunicationError` for unregistered channels, missing targets, and unavailable channels.
- `sendMessage`, `sendInteractiveMessage`, and `sendNotification` log safe failure metadata and rethrow errors.
- Channel delivery services catch failures and store safe failure codes.

Health checks:

- Web adapter returns in-app health.
- Telegram adapter uses `telegramClient.getPollingStatus`.
- WhatsApp adapter uses `whatsappClient.getHealth`.
- LINE adapter uses `lineClient.getHealth`.

Logging:

- `communication-errors.js` defines `safeCommunicationLog`.
- Logged fields are limited to type, channel, fallback flag, feature, status, and failure code.
- Secret logging through Communication Layer was Not Confirmed.

Direct Telegram, WhatsApp, or LINE calls that bypass Communication Service:

Confirmed direct channel-client method calls outside `src/modules/communication`:

1. `src/modules/telegram/telegram-message.service.js`: `telegramClient.answerCallbackQuery`.
2. `src/modules/telegram/telegram-message.service.js`: `telegramClient.editMessageText`.
3. `src/modules/telegram/telegram-update.service.js`: `telegramClient.getUpdates`.
4. `src/modules/telegram/telegram-update.service.js`: `telegramClient.startPolling`.
5. `src/modules/telegram/telegram-update.service.js`: `telegramClient.stopPolling`.
6. `src/modules/telegram/telegram-update.service.js`: `telegramClient.getPollingStatus`.
7. `src/modules/line/line-delivery.service.js`: `lineClient.pushTextMessage`.
8. `src/modules/line/line-webhook.service.js`: `lineClient.buildDefaultRichMenu`.
9. `src/modules/line/line-webhook.service.js`: `lineClient.createDefaultRichMenu`.
10. `src/modules/line/line-webhook.service.js`: `lineClient.setDefaultRichMenu`.
11. `src/modules/line/line-webhook.service.js`: `lineClient.buildDefaultRichMenu` for status output.

Additional direct channel module reads:

- `src/modules/admin/admin.service.js` imports WhatsApp and LINE client services for dashboard health data.
- These admin health reads do not appear to send messages.

WhatsApp delivery and WhatsApp conversation replies were found using `communicationService.sendNotification`, `communicationService.sendInteractiveMessage`, or `communicationService.sendMessage`.

Telegram delivery was found using `communicationService.sendNotification`.

## 8. Telegram Integration

Status summary:

- Initialization: Complete. `src/server.js` imports `telegramUpdateService`, `telegramDeliveryService`, and `telegramLinkService`; startup calls Telegram polling, link-code cleanup, and pending delivery processing while preserving web app startup on Telegram failures.
- Polling or webhook: Complete. Telegram uses long polling through `src/modules/telegram/telegram-update.service.js` and `src/modules/telegram/telegram-client.service.js`; no Telegram webhook implementation was found.
- Incoming mapping: Complete. `src/modules/telegram/telegram-message.mapper.js` maps private text updates, callback queries, unsupported private content, and Telegram user/chat metadata into Gringo channel messages.
- Outgoing messages: Complete. `src/modules/telegram/telegram-client.service.js` sends text messages, splits long text, answers callback queries, and edits messages. Telegram delivery uses `communicationService.sendNotification`.
- Commands: Complete. `src/modules/telegram/telegram-message.service.js` handles `/start`, `/help`, `/link`, `/profile`, `/jobs`, `/housing`, `/money`, `/community`, `/services`, `/documents`, `/notifications`, and `/tasks`.
- Buttons and callbacks: Complete. Telegram callback processing validates private chat context, callback format, user resolution, allowed actions, duplicate callback state, and updates Telegram messages where supported.
- Account linking: Complete. `src/modules/telegram/telegram-link.service.js`, `telegram-link.repository.js`, and `telegram-link.model.js` implement one-time link codes, hashed codes, expiry, used/cancelled states, and link history.
- Unlinking: Partial. Web routes expose Telegram disconnect through `src/modules/telegram/telegram.controller.js` and `telegram.routes.js`; a Telegram self-unlink command was Not Confirmed.
- Notifications: Complete. `src/modules/telegram/telegram-delivery.service.js` supports notification delivery for job matches, housing matches, document reminders, missing documents, community updates, human responses, task reminders, and admin messages.
- Quiet hours: Complete. Telegram delivery checks `telegramQuietHoursEnabled`, `telegramQuietHoursStart`, `telegramQuietHoursEnd`, and `telegramTimezone`, queues lower-priority messages during quiet hours, and allows urgent handling when appropriate.
- Delivery history: Partial. `src/modules/telegram/telegram-delivery.model.js` and `telegram-delivery.repository.js` store Telegram delivery records and statuses. A dedicated Telegram delivery-history model comparable to WhatsApp/LINE delivery history was Not Confirmed.
- Admin tools: Partial. Telegram link-code, disconnect, and link-history API routes are confirmed. A dedicated Telegram operations dashboard in `src/public/admin.html` was Not Confirmed.
- Reports: Not Confirmed. `src/modules/manager-agent/manager-agent.service.js` contains WhatsApp and LINE report statistics, but Telegram-specific report fields were not found.
- Environment variable names: Complete. Confirmed names: `TELEGRAM_BOT_ENABLED`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_MODE`, `TELEGRAM_POLLING_TIMEOUT_SECONDS`, `TELEGRAM_LINK_CODE_TTL_MINUTES`, `GOOGLE_SHEETS_TELEGRAM_LINK_CODES_SHEET_NAME`, `GOOGLE_SHEETS_TELEGRAM_LINK_HISTORY_SHEET_NAME`, and `GOOGLE_SHEETS_TELEGRAM_DELIVERIES_SHEET_NAME`.
- Database records: Complete. Confirmed storage records include Telegram link codes, Telegram link history, Telegram deliveries, user profiles with Telegram identity fields, conversation history, and user notifications.
- Duplicate prevention: Complete. `telegram-update.service.js` tracks processed update/callback state; Telegram delivery prevents duplicate notification delivery by notification and channel state.
- Error handling: Complete. Telegram polling, link cleanup, and delivery processing use safe warnings and continue running the web app; delivery failures store safe failure codes without exposing tokens.

Referenced Telegram files:

- `src/modules/telegram/index.js`
- `src/modules/telegram/telegram-client.service.js`
- `src/modules/telegram/telegram-update.service.js`
- `src/modules/telegram/telegram-message.mapper.js`
- `src/modules/telegram/telegram-message.service.js`
- `src/modules/telegram/telegram-link.model.js`
- `src/modules/telegram/telegram-link.repository.js`
- `src/modules/telegram/telegram-link.service.js`
- `src/modules/telegram/telegram-delivery.model.js`
- `src/modules/telegram/telegram-delivery.repository.js`
- `src/modules/telegram/telegram-delivery.service.js`
- `src/modules/telegram/telegram.controller.js`
- `src/modules/telegram/telegram.routes.js`
- `src/modules/telegram/telegram-errors.js`

## 9. WhatsApp Integration

Status summary:

- Cloud API integration: Complete. `src/modules/whatsapp/whatsapp-client.service.js` calls WhatsApp Cloud API endpoints for text, reply buttons, list messages, and templates.
- Webhook verification: Complete. `src/modules/whatsapp/whatsapp-webhook.service.js` implements Meta verification using `hub.verify_token` and `hub.challenge`, and rejects invalid verification requests.
- Incoming messages: Complete. `src/modules/whatsapp/whatsapp-message.mapper.js` extracts incoming WhatsApp messages and status events; `whatsapp-webhook.service.js` routes incoming messages through `communicationService.receiveMessage('whatsapp', message)`.
- Session messages: Complete. `src/modules/whatsapp/whatsapp-message.service.js` uses `communicationService.sendMessage` and `communicationService.sendInteractiveMessage` when the customer-service window is open.
- Template messages: Complete. `src/modules/whatsapp/whatsapp-template.model.js` defines template records; `whatsapp-delivery.service.js` selects approved templates when the conversation window is closed.
- Conversation window: Complete. `whatsapp-message.service.js` and `whatsapp-delivery.service.js` check the conversation window and avoid free-form messages when the window is closed.
- Interactive messages: Complete. WhatsApp reply buttons and list messages are implemented in `whatsapp-client.service.js`, with command/action handling in `whatsapp-message.service.js`.
- Account linking: Not Confirmed. WhatsApp CRM matching by phone and profile fields is confirmed, but a one-time secure WhatsApp account-linking module comparable to Telegram/LINE was not found.
- Notifications: Complete. `whatsapp-delivery.service.js` supports delivery for job matches, housing matches, document reminders, missing documents, community updates, human responses, task reminders, and admin messages.
- Quiet hours: Complete. WhatsApp delivery checks WhatsApp quiet-hour profile fields and queues eligible lower-priority deliveries.
- Delivery status webhooks: Complete. WhatsApp status events are mapped and persisted through `whatsapp-delivery.service.js`, including sent, delivered, read, and failed statuses.
- Retries: Complete. WhatsApp delivery uses capped retry logic, safe retry delay, permanent failure checks, retry API methods, and cancel methods.
- Admin tools: Complete. `src/modules/admin/admin.service.js`, `admin.controller.js`, `admin.routes.js`, `src/public/admin.html`, and `src/public/admin.js` expose WhatsApp dashboard health, dashboard cards, filters, manual notification creation, retry, cancel, and failure-reason views.
- Reports: Complete. `src/modules/manager-agent/manager-agent.service.js` and `manager-report.model.js` include WhatsApp connected users, active users, messages received/sent, session/template counts, success rate, failed deliveries, retry statistics, average response time, commands, and actions.
- Environment variable names: Complete. Confirmed names: `WHATSAPP_ENABLED`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_BUSINESS_ACCOUNT_ID`, `GOOGLE_SHEETS_WHATSAPP_TEMPLATES_SHEET_NAME`, `GOOGLE_SHEETS_WHATSAPP_DELIVERIES_SHEET_NAME`, and `GOOGLE_SHEETS_WHATSAPP_DELIVERY_HISTORY_SHEET_NAME`.
- Database records: Complete. Confirmed storage records include WhatsApp templates, WhatsApp deliveries, WhatsApp delivery history, user profiles with WhatsApp identity fields, conversation history, and user notifications.
- Duplicate prevention: Complete. `whatsapp-webhook.service.js` tracks processed message IDs and checks persisted message history; `whatsapp-delivery.service.js` prevents duplicate delivery records for the same notification/user/channel.
- Error handling: Complete. WhatsApp connector errors classify retryable failures, store safe failure codes, and avoid exposing tokens or full technical error bodies to users.

Referenced WhatsApp files:

- `src/modules/whatsapp/index.js`
- `src/modules/whatsapp/whatsapp-client.service.js`
- `src/modules/whatsapp/whatsapp-webhook.service.js`
- `src/modules/whatsapp/whatsapp-message.mapper.js`
- `src/modules/whatsapp/whatsapp-message.service.js`
- `src/modules/whatsapp/whatsapp-template.model.js`
- `src/modules/whatsapp/whatsapp-delivery.model.js`
- `src/modules/whatsapp/whatsapp-delivery.repository.js`
- `src/modules/whatsapp/whatsapp-delivery.service.js`
- `src/modules/whatsapp/whatsapp-errors.js`

## 10. LINE Integration

Status summary:

- Signature validation: Complete. `src/modules/line/line-webhook.service.js` validates `x-line-signature` with HMAC SHA-256 and `crypto.timingSafeEqual`.
- Incoming messages: Complete. `src/modules/line/line-message.mapper.js` maps private text events, postback events, and unsupported content; `line-webhook.service.js` passes mapped messages through `communicationService.receiveMessage('line', message)`.
- Outgoing messages: Complete. `src/modules/line/line-client.service.js` supports reply and push text messages with message splitting. Conversation replies use `communicationService.sendInteractiveMessage`.
- Commands: Complete. `src/modules/line/line-message.service.js` supports `help`, `home`, `profile`, `jobs`, `housing`, `money`, `community`, `services`, `documents`, `notifications`, `tasks`, `link CODE`, `unlink`, and `confirm unlink`.
- Rich Menu: Complete. `line-client.service.js` builds the default Rich Menu; `line-webhook.service.js` exposes routes to preview, create, and set the default Rich Menu.
- Quick Replies: Complete. `line-message.service.js` adds command quick replies, and `line-delivery.service.js` adds notification-action quick replies.
- Account linking: Complete. `src/modules/line/line-link.service.js`, `line-link.repository.js`, and `line-link.model.js` implement one-time link codes, channel validation, expiry, used/cancelled states, disconnect, self-unlink, and link history.
- Preferred-channel routing: Partial. The Communication Layer supports preferred and fallback channel selection, and LINE is registered as a channel. LINE notification delivery still directly calls `lineClient.pushTextMessage`, as documented in Section 7 direct bypass findings.
- Notifications: Complete. `src/modules/line/line-delivery.service.js` supports LINE notifications for job matches, housing matches, document reminders, missing documents, community updates, human responses, task reminders, and admin messages.
- Quiet hours: Complete. LINE delivery checks LINE quiet-hour profile fields and queues eligible lower-priority deliveries.
- Notification actions: Complete. LINE quick replies support read, dismiss, remind later, complete task, reschedule task, found job, stop job alerts, found housing, stop housing alerts, view document, mark renewed, and remind later actions through existing modules.
- Delivery status: Partial. `line-delivery.model.js`, `line-delivery.repository.js`, and `line-delivery.service.js` define delivery statuses and delivery-history records, including queued, sent, delivered, read, failed, and cancelled. External LINE status webhook support equivalent to WhatsApp status webhooks was Not Confirmed.
- Admin tools: Complete. `src/modules/admin/admin.service.js`, `src/public/admin.html`, and `src/public/admin.js` expose LINE dashboard health, cards, connected users, deliveries, filters, pending queue, and failure data. LINE Rich Menu admin routes are exposed through `line-webhook.service.js`.
- Reports: Complete. `src/modules/manager-agent/manager-agent.service.js` and `manager-report.model.js` include LINE connected users, daily active users, messages received/sent, notification success rate, failed deliveries, average response time, commands, and actions.
- Environment variable names: Complete. Confirmed names: `LINE_ENABLED`, `LINE_CHANNEL_ID`, `LINE_CHANNEL_SECRET`, `LINE_CHANNEL_ACCESS_TOKEN`, `GOOGLE_SHEETS_CHANNEL_LINK_CODES_SHEET_NAME`, `GOOGLE_SHEETS_CHANNEL_LINK_HISTORY_SHEET_NAME`, `GOOGLE_SHEETS_LINE_DELIVERIES_SHEET_NAME`, and `GOOGLE_SHEETS_LINE_DELIVERY_HISTORY_SHEET_NAME`.
- Database records: Complete. Confirmed storage records include shared channel link codes, shared channel link history, LINE deliveries, LINE delivery history, user profiles with LINE identity/status fields, conversation history, and user notifications.
- Duplicate prevention: Complete. `line-webhook.service.js` tracks processed message IDs and checks persisted message history; `line-delivery.service.js` prevents duplicate delivery and duplicate delivery-history events.
- Error handling: Complete. LINE client and delivery services store safe failure codes, classify missing credentials and retryable API failures, and keep the web application running when LINE work fails.

Referenced LINE files:

- `src/modules/line/index.js`
- `src/modules/line/line-client.service.js`
- `src/modules/line/line-webhook.service.js`
- `src/modules/line/line-message.mapper.js`
- `src/modules/line/line-message.service.js`
- `src/modules/line/line-link.model.js`
- `src/modules/line/line-link.repository.js`
- `src/modules/line/line-link.service.js`
- `src/modules/line/line-delivery.model.js`
- `src/modules/line/line-delivery.repository.js`
- `src/modules/line/line-delivery.service.js`
- `src/modules/line/line-errors.js`

## 11. Database Architecture

Database technology:

- Confirmed: Google Sheets is the configured persistence backend.
- Confirmed access file: `src/config/googleSheets.js`.
- Confirmed access method: Google Sheets API through `googleapis`, authenticated with a JWT service account.
- Confirmed environment configuration: `src/config/env.js` defines the spreadsheet ID, service-account email, private key, and sheet names.
- Local database files: Not Confirmed.
- SQL database: Not Confirmed.

Initialization:

- `src/config/googleSheets.js` defines `ensureSheetWithHeader(sheetName, headerRow)`.
- Confirmed repository code mostly uses `readSheetRows`, `appendSheetRow`, and `updateSheetRow`.
- Automatic startup migrations or automatic sheet creation for every entity: Not Confirmed.

Migration approach:

- Formal migration framework: Not Confirmed.
- Schema version table: Not Confirmed.
- Confirmed schema source: model files export ordered field arrays used by repositories.

ORM or query approach:

- ORM: Not Confirmed.
- Query approach: repositories read full sheet rows, map row arrays to objects using model field arrays, find rows in memory, append rows, or update row numbers.
- Indexes: Not Confirmed.
- Unique constraints: Not Confirmed as database-enforced constraints.
- Primary keys: logical ID fields are present in models and used by repositories; Google Sheets does not confirm database-enforced primary keys.
- Foreign keys: logical relationships are represented by ID fields such as `userId`, `postId`, `notificationId`, `documentId`, `taskId`, `deliveryId`, and `reportId`; database-enforced foreign keys are Not Confirmed.

Confirmed entities:

| Entity | Sheet or storage name | Primary key field | Important fields | Status/timestamp fields | Relationships |
| --- | --- | --- | --- | --- | --- |
| Contacts | `Contacts` | `contact_id` | `display_name`, `email`, `phone`, channel IDs, `preferred_channel`, `country`, `city`, `language`, `interest`, `priority` | `status`, `created_at`, `updated_at`, `archived_at` | Contact history uses `contact_id`. |
| ContactHistory | `ContactHistory` | `history_id` | `contact_id`, `event_type`, `channel`, `direction`, `title`, `external_message_id` | `created_at` | Logical child of Contacts. |
| Workers | `Workers` | `worker_id` | name fields, nationality, contact channels, visa fields, profession, skills, employer, city | `status`, `created_at`, `updated_at`, `archived_at` | Worker history uses `worker_id`. |
| WorkerHistory | `WorkerHistory` | `history_id` | `worker_id`, `event_type`, `title`, `old_value`, `new_value`, `actor_type` | `created_at` | Logical child of Workers. |
| UserProfiles | `UserProfiles` | `userId` | `channel`, `channelUserId`, profile fields, active/completed goals, preferences, channel IDs, notification settings | `createdAt`, `updatedAt`, `lastActivityAt`, `lastInteractionAt` | Central user record used by chat, CRM, modules, and channels. |
| ConversationHistory | `ConversationHistory` | `conversationId` | `userId`, `channel`, `question`, `answer`, `category`, `needsHumanFollowUp` | `status`, `createdAt` | Logical child of UserProfiles. |
| Jobs | `Jobs` | `jobId` | `title`, `workSector`, `profession`, `city`, `area`, `employerName`, `salaryText`, contact fields | `status`, `createdAt`, `updatedAt` | Matched against UserProfiles. |
| HousingListings | `HousingListings` | `housingId` | `title`, `housingType`, `city`, `area`, price, availability, contact fields | `status`, `createdAt`, `updatedAt` | Matched against UserProfiles. |
| ExchangeRates | `ExchangeRates` | `rateId` | `sourceCurrency`, `targetCurrency`, `exchangeRate`, `sourceName` | `status`, `updatedAt` | Used by Money comparisons. |
| MoneyTransferProviders | `MoneyTransferProviders` | `providerId` | provider name, currency pair, fee fields, provider rate, limits, delivery, payout, URL | `status`, `updatedAt` | Used by Money comparisons. |
| CommunityPosts | `CommunityPosts` | `postId` | title/body, category, language, target country/sector/city, source | `status`, `publishedAt`, `createdAt`, `updatedAt` | Comments use `postId`; content drafts may publish into posts. |
| CommunityComments | `CommunityComments` | `commentId` | `postId`, `userId`, `userName`, `body`, `language` | `status`, `createdAt` | Logical child of CommunityPosts and UserProfiles. |
| ContentDrafts | `ContentDrafts` | `draftId` | content type, title, category, language, audience, summary, body, source topics | `status`, `createdAt` | Admin can publish approved drafts to CommunityPosts. |
| HumanFollowUps | `HumanFollowUps` | `followUpId` | `conversationId`, `userId`, `userName`, `question`, language/category/context, `humanAnswer` | `status`, `createdAt`, `updatedAt` | Tied to ConversationHistory and UserProfiles. |
| AdminNotes | `AdminNotes` | `noteId` | `reportId`, `body` | `createdAt`, `updatedAt` | Logical child of reports. |
| KnowledgeDrafts | `KnowledgeDrafts` | `knowledgeDraftId` | source type/id, question, answer, category, language | `status`, `createdAt`, `updatedAt` | Can be created from follow-ups or missing knowledge. |
| DailyReports | `DailyReports` | `reportId` | conversation/user metrics, goals, documents, notifications, tasks, WhatsApp and LINE metrics | `reportDate`, `createdAt` | Admin notes can reference `reportId`. |
| WeeklyReports | `WeeklyReports` | `reportId` | `weekStart`, `weekEnd`, growth, trends, problems, opportunities | `createdAt` | Admin reporting. |
| Recommendations | `Recommendations` | `recommendationId` | type, title, reason, priority, source report | `status`, `createdAt` | May reference reports through `sourceReportId`. |
| Services | `Services` | `id` | category, title, description, city, country, languages, contact, rating, tags | No status field confirmed | Matched against UserProfiles and service searches. |
| UserDocuments | `UserDocuments` | `documentId` | `userId`, type, masked/sensitive number field, country, dates, file metadata, reminder days, verified | `status`, `createdAt`, `updatedAt` | Logical child of UserProfiles; history uses `documentId`. |
| UserDocumentHistory | `UserDocumentHistory` | `historyId` | `documentId`, `userId`, previous/new expiry and status, change type | `changedAt` | Logical child of UserDocuments. |
| UserNotifications | `UserNotifications` | `notificationId` | `userId`, type, title, message, source module/record, priority, action fields, schedule/expiry | `status`, `createdAt`, `readAt`, `dismissedAt`, `expiresAt` | Deliveries reference `notificationId`. |
| UserTasks | `UserTasks` | `taskId` | `userId`, title, category, priority, due/reminder dates, related module/record, recurrence, creator | `status`, `createdAt`, `updatedAt`, `completedAt` | History uses `taskId`; notifications may reference tasks. |
| UserTaskHistory | `UserTaskHistory` | Composite logical key Not Confirmed | `taskId`, `userId`, event type, status/due-date transitions | `createdAt` | Logical child of UserTasks. |
| TelegramLinkCodes | `TelegramLinkCodes` | `linkCodeId` | `userId`, `codeHash`, `telegramUserId` | `status`, `expiresAt`, `createdAt`, `usedAt`, `cancelledAt` | Links Telegram identity to UserProfiles. |
| TelegramLinkHistory | `TelegramLinkHistory` | `historyId` | `userId`, `telegramUserId`, event type, safe metadata | `createdAt` | Audit trail for Telegram linking. |
| TelegramDeliveries | `TelegramDeliveries` | `deliveryId` | `notificationId`, `userId`, `telegramChatId`, Telegram message ID, failure code, retry count | `status`, `attemptedAt`, `deliveredAt`, `failedAt`, `createdAt`, `updatedAt` | Logical child of UserNotifications. |
| ChannelLinkCodes | `ChannelLinkCodes` | `linkCodeId` | `userId`, `channel`, `codeHash`, `channelUserId` | `status`, `expiresAt`, `createdAt`, `usedAt`, `cancelledAt` | Shared link-code store used by LINE. |
| ChannelLinkHistory | `ChannelLinkHistory` | `historyId` | `userId`, `channel`, `channelUserId`, event type, safe metadata | `createdAt` | Audit trail for shared channel linking. |
| LineDeliveries | `LineDeliveries` | `deliveryId` | `notificationId`, `userId`, `channel`, `lineUserId`, LINE message ID, failure code, retry count | `status`, `attemptedAt`, `deliveredAt`, `failedAt`, `createdAt`, `updatedAt` | Logical child of UserNotifications. |
| LineDeliveryHistory | `LineDeliveryHistory` | `historyId` | `deliveryId`, `userId`, status, safe failure code | `eventAt`, `createdAt` | Logical child of LineDeliveries. |
| WhatsAppTemplates | `WhatsAppTemplates` | `templateId` | internal name, Meta template name, language, notification type, parameter mapping | `status`, `createdAt`, `updatedAt` | WhatsApp deliveries may reference `templateId`. |
| WhatsAppDeliveries | `WhatsAppDeliveries` | `deliveryId` | `notificationId`, `userId`, phone, template, delivery mode, WhatsApp message ID, failure code, retry count | `status`, `attemptedAt`, `deliveredAt`, `failedAt`, `createdAt`, `updatedAt` | Logical child of UserNotifications. |
| WhatsAppDeliveryHistory | `WhatsAppDeliveryHistory` | `historyId` | `deliveryId`, `userId`, status, safe failure code | `eventAt`, `createdAt` | Logical child of WhatsAppDeliveries. |

Important relationship notes:

- User profile ownership is represented by `userId`.
- Channel identity fields are stored on UserProfiles: Telegram (`telegramUserId`, `telegramChatId`), WhatsApp (`whatsappPhone`), and LINE (`lineUserId`, `lineLinkStatus`).
- Active goals are stored as profile fields: `activeGoals`, `completedGoals`, plus module-specific booleans and preference fields.
- Admin messages are represented through `UserNotifications` with type `Admin Message`.
- Missing knowledge is partially represented through runtime missing-knowledge events and persisted `KnowledgeDrafts`; a dedicated MissingKnowledge table was Not Confirmed.
- ContactNotes is configured in `src/config/env.js`, but a corresponding active model/repository was Not Confirmed.

## 12. API and Routes

Route mounting:

- `src/app.js` mounts static frontend files from `src/public`.
- `src/app.js` mounts API routers under `/api/contacts`, `/api/workers`, `/api/jobs`, `/api/housing`, `/api/money`, `/api/community`, `/api/admin`, `/api/services`, `/api/documents`, `/api/notifications`, `/api/tasks`, `/api/chat`, `/api/telegram`, `/api/whatsapp`, and `/api/line`.

Public:

| Method | Path | Purpose | Authentication | Handler | Main service |
| --- | --- | --- | --- | --- | --- |
| GET | `/health` | Basic service health response | None confirmed | inline handler in `src/app.js` | None |
| GET | `/chat.html` and static assets under `/` | Web chat UI via Express static middleware | None confirmed | Express static middleware | Static files |
| GET | `/admin.html` and static assets under `/` | Admin UI file via Express static middleware | Page file itself has no server-side gate; API calls require admin key | Express static middleware | Static files |

Authentication:

- Full login routes: Not Confirmed.
- Session routes: Not Confirmed.
- User token routes: Not Confirmed.
- Account-linking routes are listed under Telegram and LINE.

User and public module APIs:

| Method | Path | Purpose | Authentication | Handler | Main service |
| --- | --- | --- | --- | --- | --- |
| GET | `/api/chat/onboarding-status` | Get onboarding/profile completion state | `channel` and `channelUserId` query identity; no login confirmed | `chatController.getOnboardingStatus` | `coreAgentService` |
| GET | `/api/chat/profile` | Get current profile | `channel` and `channelUserId`; no login confirmed | `chatController.getProfile` | `coreAgentService`, `crmAgentService` |
| GET | `/api/chat/startup-summary` | Get startup summary | `channel` and `channelUserId`; no login confirmed | `chatController.getStartupSummary` | `coreAgentService` |
| PUT | `/api/chat/profile` | Update profile/preferences | `channel` and `channelUserId`; no login confirmed | `chatController.updateProfile` | `coreAgentService`, `crmAgentService` |
| POST | `/api/chat/message` | Send web-chat message to Core Agent | `channel` and `channelUserId`; no login confirmed | `chatController.sendMessage` | `coreAgentService` |
| GET | `/api/jobs/` | List active jobs | None confirmed | `jobController.getActiveJobs` | `jobService` |
| GET | `/api/jobs/matches` | List matching jobs for current user | `channel` and `channelUserId`; no login confirmed | `jobController.getMatchingJobs` | `coreAgentService`, `jobService` |
| GET | `/api/housing/` | List active housing | None confirmed | `housingController.getActiveHousingListings` | `housingService` |
| GET | `/api/housing/matches` | List matching housing for current user | `channel` and `channelUserId`; no login confirmed | `housingController.getMatchingHousing` | `coreAgentService`, `housingService` |
| GET | `/api/money/defaults` | Get money defaults from profile | `channel` and `channelUserId`; no login confirmed | `moneyController.getProfileMoneyDefaults` | `coreAgentService`, `moneyService` |
| GET | `/api/money/rate` | Get exchange rate | None confirmed | `moneyController.getRate` | `moneyService` |
| GET | `/api/money/compare` | Compare transfer providers | None confirmed | `moneyController.compareTransfers` | `moneyService` |
| GET | `/api/community/` | List published posts | None confirmed | `communityController.getPublishedPosts` | `communityService` |
| GET | `/api/community/relevant` | List relevant posts for current user | `channel` and `channelUserId`; no login confirmed | `communityController.getRelevantPosts` | `coreAgentService`, `communityService` |
| GET | `/api/community/:postId` | Get one community post | None confirmed | `communityController.getPost` | `communityService` |
| POST | `/api/community/:postId/comments` | Add comment to post | `channel` and `channelUserId`; no login confirmed | `communityController.addComment` | `coreAgentService`, `communityService` |
| POST | `/api/community/comments/:commentId/flag` | Flag comment | None confirmed | `communityController.flagComment` | `communityService` |
| GET | `/api/services/` | List services | None confirmed | `serviceController.getServices` | `serviceService` |
| GET | `/api/services/matches` | List matching services for current user | `channel` and `channelUserId`; no login confirmed | `serviceController.getMatchingServices` | `coreAgentService`, `serviceService` |
| GET | `/api/services/:id` | Get one service | None confirmed | `serviceController.getService` | `serviceService` |
| GET | `/api/documents/` | List safe user documents and checklist | `channel` and `channelUserId`; no login confirmed | `documentController.listDocuments` | `coreAgentService`, `documentService` |
| GET | `/api/documents/alerts` | List document alerts | `channel` and `channelUserId`; no login confirmed | `documentController.listAlerts` | `coreAgentService`, `documentService` |
| GET | `/api/documents/history` | List document history for current user | `channel` and `channelUserId`; no login confirmed | `documentController.getHistory` | `coreAgentService`, `documentService` |
| POST | `/api/documents/` | Create document for current user | `channel` and `channelUserId`; no login confirmed | `documentController.createDocument` | `coreAgentService`, `documentService` |
| GET | `/api/documents/:documentId/history` | List one document history | `channel` and `channelUserId`; no login confirmed | `documentController.getHistory` | `coreAgentService`, `documentService` |
| PUT | `/api/documents/:documentId` | Update document | `channel` and `channelUserId`; no login confirmed | `documentController.updateDocument` | `coreAgentService`, `documentService` |
| POST | `/api/documents/:documentId/renew` | Renew document | `channel` and `channelUserId`; no login confirmed | `documentController.renewDocument` | `coreAgentService`, `documentService`, `taskService` |
| POST | `/api/documents/:documentId/archive` | Archive document | `channel` and `channelUserId`; no login confirmed | `documentController.archiveDocument` | `coreAgentService`, `documentService` |
| GET | `/api/notifications/` | List notifications | `channel` and `channelUserId`; no login confirmed | `notificationController.listNotifications` | `crmAgentService`, `notificationService` |
| GET | `/api/notifications/summary` | Get notification summary | `channel` and `channelUserId`; no login confirmed | `notificationController.getSummary` | `crmAgentService`, `notificationService` |
| POST | `/api/notifications/:notificationId/read` | Mark notification read | `channel` and `channelUserId`; no login confirmed | `notificationController.markAsRead` | `crmAgentService`, `notificationService` |
| POST | `/api/notifications/:notificationId/dismiss` | Dismiss notification | `channel` and `channelUserId`; no login confirmed | `notificationController.dismissNotification` | `crmAgentService`, `notificationService` |
| POST | `/api/notifications/:notificationId/complete` | Complete notification | `channel` and `channelUserId`; no login confirmed | `notificationController.completeNotification` | `crmAgentService`, `notificationService` |
| POST | `/api/notifications/:notificationId/remind` | Schedule reminder for notification | `channel` and `channelUserId`; no login confirmed | `notificationController.remindNotification` | `crmAgentService`, `notificationService` |
| GET | `/api/tasks/` | List tasks | `channel` and `channelUserId`; no login confirmed | `taskController.listTasks` | `coreAgentService`, `taskService` |
| GET | `/api/tasks/alerts` | List task reminders/alerts | `channel` and `channelUserId`; no login confirmed | `taskController.listAlerts` | `coreAgentService`, `taskService` |
| GET | `/api/tasks/schedule` | Get task schedule | `channel` and `channelUserId`; no login confirmed | `taskController.getSchedule` | `coreAgentService`, `taskService` |
| GET | `/api/tasks/history` | Get task history | `channel` and `channelUserId`; no login confirmed | `taskController.history` | `coreAgentService`, `taskService` |
| POST | `/api/tasks/` | Create task | `channel` and `channelUserId`; no login confirmed | `taskController.createTask` | `coreAgentService`, `taskService` |
| GET | `/api/tasks/:taskId` | Get task | `channel` and `channelUserId`; no login confirmed | `taskController.getTask` | `coreAgentService`, `taskService` |
| GET | `/api/tasks/:taskId/history` | Get one task history | `channel` and `channelUserId`; no login confirmed | `taskController.history` | `coreAgentService`, `taskService` |
| PUT | `/api/tasks/:taskId` | Update task | `channel` and `channelUserId`; no login confirmed | `taskController.updateTask` | `coreAgentService`, `taskService` |
| POST | `/api/tasks/:taskId/remind` | Update task reminder | `channel` and `channelUserId`; no login confirmed | `taskController.remind` | `coreAgentService`, `taskService` |
| POST | `/api/tasks/:taskId/reschedule` | Reschedule task | `channel` and `channelUserId`; no login confirmed | `taskController.reschedule` | `coreAgentService`, `taskService` |
| POST | `/api/tasks/:taskId/:action` | Run task action | `channel` and `channelUserId`; no login confirmed | `taskController.action` | `coreAgentService`, `taskService` |
| GET | `/api/contacts/` | List contacts | None confirmed | `contactController.getContacts` | `contactService` |
| POST | `/api/contacts/` | Create contact | None confirmed | `contactController.createContact` | `contactService` |
| PUT | `/api/contacts/:contactId` | Update contact | None confirmed | `contactController.updateContact` | `contactService` |
| POST | `/api/contacts/:contactId/archive` | Archive contact | None confirmed | `contactController.archiveContact` | `contactService` |
| GET | `/api/workers/` | List workers | None confirmed | `workerController.getWorkers` | `workerService` |
| POST | `/api/workers/` | Create worker | None confirmed | `workerController.createWorker` | `workerService` |
| GET | `/api/workers/:workerId` | Get worker | None confirmed | `workerController.getWorker` | `workerService` |
| PUT | `/api/workers/:workerId` | Update worker | None confirmed | `workerController.updateWorker` | `workerService` |
| POST | `/api/workers/:workerId/archive` | Archive worker | None confirmed | `workerController.archiveWorker` | `workerService` |

Admin and reports:

All `/api/admin` routes use `requireAdminKey` in `src/modules/admin/admin.routes.js`. The key is read from `x-admin-api-key` or `adminApiKey` query parameter and compared with `env.adminApiKey`.

| Method | Path | Purpose | Authentication | Handler | Main service |
| --- | --- | --- | --- | --- | --- |
| GET | `/api/admin/dashboard` | Admin dashboard summary | Admin API key | `adminController.getDashboard` | `adminService` |
| POST | `/api/admin/reports/daily` | Generate daily report | Admin API key | `adminController.generateDailyReport` | `adminService` |
| POST | `/api/admin/reports/weekly` | Generate weekly report | Admin API key | `adminController.generateWeeklyReport` | `adminService` |
| POST | `/api/admin/reports/:reportId/notes` | Save admin note | Admin API key | `adminController.saveAdminNote` | `adminService` |
| POST | `/api/admin/follow-ups/:followUpId/answer` | Save human answer | Admin API key | `adminController.saveHumanAnswer` | `adminService` |
| POST | `/api/admin/follow-ups/:followUpId/knowledge-draft` | Create knowledge draft from follow-up | Admin API key | `adminController.createKnowledgeDraftFromFollowUp` | `adminService` |
| POST | `/api/admin/follow-ups/:followUpId/content-draft` | Create content draft from follow-up | Admin API key | `adminController.createContentDraftFromQuestion` | `adminService` |
| POST | `/api/admin/missing-knowledge/:eventId` | Update missing knowledge item | Admin API key | `adminController.updateMissingKnowledge` | `adminService` |
| PUT | `/api/admin/content-drafts/:draftId` | Update content draft | Admin API key | `adminController.updateContentDraft` | `adminService` |
| POST | `/api/admin/content-drafts/:draftId/publish` | Publish content draft to community | Admin API key | `adminController.publishContentDraft` | `adminService` |
| POST | `/api/admin/comments/:commentId/moderate` | Moderate community comment | Admin API key | `adminController.moderateComment` | `adminService` |
| PUT | `/api/admin/recommendations/:recommendationId` | Update recommendation status | Admin API key | `adminController.updateRecommendation` | `adminService` |
| PUT | `/api/admin/documents/:documentId` | Admin update document | Admin API key | `adminController.updateDocument` | `adminService` |
| POST | `/api/admin/notifications` | Create manual notification | Admin API key | `adminController.createManualNotification` | `adminService` |
| POST | `/api/admin/notifications/:notificationId/cancel` | Cancel scheduled notification | Admin API key | `adminController.cancelScheduledNotification` | `adminService` |
| POST | `/api/admin/whatsapp/notifications` | Create WhatsApp manual notification | Admin API key | `adminController.createWhatsAppManualNotification` | `adminService` |
| POST | `/api/admin/whatsapp/deliveries/:deliveryId/retry` | Retry WhatsApp delivery | Admin API key | `adminController.retryWhatsAppDelivery` | `adminService`, `whatsappDeliveryService` |
| POST | `/api/admin/whatsapp/deliveries/:deliveryId/cancel` | Cancel WhatsApp delivery | Admin API key | `adminController.cancelWhatsAppDelivery` | `adminService`, `whatsappDeliveryService` |
| GET | `/api/admin/whatsapp/deliveries/:deliveryId/failure` | View safe WhatsApp failure reason | Admin API key | `adminController.getWhatsAppFailureReason` | `adminService`, `whatsappDeliveryService` |
| POST | `/api/admin/tasks` | Assign admin task | Admin API key | `adminController.assignTask` | `adminService` |
| PUT | `/api/admin/tasks/:taskId` | Admin update task | Admin API key | `adminController.updateTask` | `adminService` |

Telegram:

| Method | Path | Purpose | Authentication | Handler | Main service |
| --- | --- | --- | --- | --- | --- |
| POST | `/api/telegram/link-code` | Create Telegram linking code for current web user | `channel` and `channelUserId`; no login confirmed | `telegramController.createLinkCode` | `telegramLinkService`, `coreAgentService` |
| POST | `/api/telegram/disconnect` | Disconnect Telegram from current web user | `channel` and `channelUserId`; no login confirmed | `telegramController.disconnect` | `telegramLinkService`, `coreAgentService` |
| GET | `/api/telegram/link-history` | Get Telegram link history for current web user | `channel` and `channelUserId`; no login confirmed | `telegramController.history` | `telegramLinkService`, `coreAgentService` |

WhatsApp:

| Method | Path | Purpose | Authentication | Handler | Main service |
| --- | --- | --- | --- | --- | --- |
| GET | `/api/whatsapp/webhook` | Meta webhook verification | Verify token | `verifyWebhook` in `whatsappWebhookService` | `whatsappWebhookService` |
| POST | `/api/whatsapp/webhook` | Receive WhatsApp messages and status webhooks | WhatsApp signature validation Not Confirmed; duplicate checks confirmed | `receiveWebhook` in `whatsappWebhookService` | `whatsappMessageService`, `whatsappDeliveryService` |

LINE:

| Method | Path | Purpose | Authentication | Handler | Main service |
| --- | --- | --- | --- | --- | --- |
| POST | `/api/line/webhook` | Receive LINE text/postback/unsupported events | LINE signature validation | `receiveWebhook` in `lineWebhookService` | `lineMessageService`, `communicationService` |
| POST | `/api/line/link-code` | Create LINE linking code for current web user | `channel` and `channelUserId`; no login confirmed | `createLinkCode` in `lineWebhookService` | `lineLinkService`, `coreAgentService` |
| POST | `/api/line/disconnect` | Disconnect LINE from current web user | `channel` and `channelUserId`; no login confirmed | `disconnect` in `lineWebhookService` | `lineLinkService`, `coreAgentService` |
| GET | `/api/line/link-history` | Get LINE link history for current web user | `channel` and `channelUserId`; no login confirmed | `history` in `lineWebhookService` | `lineLinkService`, `coreAgentService` |
| GET | `/api/line/rich-menu/default` | Preview default Rich Menu payload | None confirmed | inline handler in `lineWebhookService` | `lineClient` |
| POST | `/api/line/rich-menu/default` | Create default Rich Menu | Admin API key checked inside handler | `createDefaultRichMenu` | `lineClient` |
| POST | `/api/line/rich-menu/default/set` | Set default Rich Menu | Admin API key checked inside handler | `setDefaultRichMenu` | `lineClient` |

Internal:

- Schedulers are internal timer flows, not HTTP routes: `notificationService.processScheduledNotifications`, `telegramDeliveryService.processPendingTelegramDeliveries`, `whatsappDeliveryService.processPendingWhatsAppDeliveries`, and `lineDeliveryService.processPendingLineDeliveries`.
- Telegram long polling is internal and not exposed as an HTTP route.

## 13. Webhooks

| Provider | Path | Verification | Event types | Duplicate prevention | Mapper | Failure behavior | Response behavior |
| --- | --- | --- | --- | --- | --- | --- | --- |
| WhatsApp | `GET /api/whatsapp/webhook` | `hub.mode=subscribe` and `hub.verify_token` must match `env.whatsapp.verifyToken` | Verification challenge | Not applicable | Not applicable | Invalid verification returns HTTP 403 | Valid verification returns the challenge string |
| WhatsApp | `POST /api/whatsapp/webhook` | Request signature validation was Not Confirmed | Incoming messages and delivery statuses | In-memory `processedMessageIds` plus persisted message-history check | `whatsapp-message.mapper.js` | Safe warning, webhook health marked failed, error handler handles response | On success returns `{ ok: true, results }`; disabled connector returns `{ ok: true, disabled: true }` |
| LINE | `POST /api/line/webhook` | `x-line-signature` validated with HMAC SHA-256 using `LINE_CHANNEL_SECRET` | Text messages, postback actions, unsupported private content | In-memory `processedMessageIds` plus persisted message-history check | `line-message.mapper.js` | Safe warning, webhook health marked failed, error handler handles response | On success returns `{ ok: true, results }`; disabled connector returns `{ ok: true, disabled: true }`; invalid signature returns HTTP 401 |

Webhook notes:

- Telegram has no webhook route; Telegram uses long polling.
- LINE Rich Menu routes are admin/API operations, not provider webhooks.
- WhatsApp status events update WhatsApp delivery records and history through `whatsappDeliveryService`.
- LINE external delivery/read status webhook support equivalent to WhatsApp was Not Confirmed.

## 14. Authentication and Authorization

Login:

- User login system: Not Confirmed.
- Payment/login provider: Not Confirmed.
- Session cookies or JWT user sessions: Not Confirmed.

Sessions or tokens:

- Admin API uses `ADMIN_API_KEY` through the `x-admin-api-key` header or `adminApiKey` query parameter.
- Provider secrets are read from environment variables and are not exposed as route responses in confirmed code.

Roles and permissions:

- Role model: Not Confirmed.
- Fine-grained permission model: Not Confirmed.
- Admin permission is a single API-key gate for `/api/admin` routes.

Confirmed authorization and safety controls:

1. Admin API-key gate on every `/api/admin` route through `router.use(requireAdminKey)`.
2. LINE Rich Menu create/set routes check the admin key inside `lineWebhookService`.
3. WhatsApp webhook verification uses `WHATSAPP_VERIFY_TOKEN` for the verification handshake.
4. LINE webhook validates `x-line-signature` with `LINE_CHANNEL_SECRET`.
5. User-scoped web API operations resolve a current profile from `channel` and `channelUserId`.
6. Document controllers attach created documents to the resolved `userId`.
7. Notification controllers resolve the current user before listing or mutating notifications.
8. Task controllers resolve the current user before listing, creating, and mutating tasks.
9. Telegram link codes store `codeHash`, expire, and have single-use statuses.
10. LINE channel link codes store `codeHash`, expire, and have single-use statuses.
11. Telegram callback handling validates private chat, resolved user, allowed action, record/action state, and duplicate callback processing.
12. WhatsApp action handling validates command/action availability and conversation window state before free-form replies.
13. LINE action handling validates linked/resolved user context, action format, and duplicate action outcomes.
14. Telegram and LINE disconnect flows preserve history and do not delete conversation records.
15. Preferred and fallback channel updates in `chat.controller.js` allow only connected channels and prevent fallback from matching the preferred channel.

Ownership checks:

- Confirmed in user-scoped controllers through current profile resolution.
- Confirmed in channel action handlers at a service level for allowed user/action checks.
- Database-enforced row-level ownership is Not Confirmed.

Linking codes:

- Telegram has `TelegramLinkCodes` and `TelegramLinkHistory`.
- LINE uses shared `ChannelLinkCodes` and `ChannelLinkHistory`.
- Code hashing, expiry, cancellation, and used states are confirmed.
- WhatsApp one-time linking codes were Not Confirmed.

Expiration:

- Telegram and LINE link-code expiration is confirmed.
- Notification expiration is represented by `expiresAt` and scheduled cleanup/service behavior.
- Task reminder rescheduling is represented by task and notification timestamps.

Rate limiting:

- Telegram and LINE link services contain attempt/rate-limit style checks in service logic.
- Express middleware rate limiting: Not Confirmed.

Unlinking:

- Telegram web disconnect route is confirmed.
- LINE web disconnect and LINE self-unlink confirmation are confirmed.
- WhatsApp disconnect route: Not Confirmed.

Account conflicts:

- Telegram and LINE link services reject invalid, expired, used, channel-mismatched, and conflicting link attempts.
- WhatsApp user matching by phone is confirmed; secure merge/link conflict handling with one-time codes is Not Confirmed.

Sensitive data handling:

- Document API responses use safe document conversion in the document controller/service flow.
- Delivery failures store safe failure codes.
- The documentation above does not include real records, real tokens, or secret values.

## 15. Notification Architecture

Core files:

- `src/modules/notifications/notification.model.js`
- `src/modules/notifications/notification.repository.js`
- `src/modules/notifications/notification.service.js`
- `src/modules/notifications/notification.controller.js`
- `src/modules/notifications/notification.routes.js`
- Channel delivery services: `telegram-delivery.service.js`, `whatsapp-delivery.service.js`, and `line-delivery.service.js`

Notification creation:

- `notificationService.createNotification(input)` builds and validates a notification, checks duplicates, persists through `notification.repository.js`, and records a CRM history event.
- `notificationService.createNotificationsFromExistingModules(userId, userProfile)` creates notifications from Jobs, Housing, Documents, Money, Community, and other existing modules.
- Admin-created notifications use `adminService.createManualNotification`, which calls `notificationService.createManualNotifications`.
- Human Response notifications are created by `adminService.saveHumanAnswer` when a follow-up is answered and user preferences allow it.

Types:

- Confirmed types from `notification.model.js`: `Job Match`, `Housing Match`, `Document Expiry`, `Missing Document`, `Exchange Rate`, `Money Transfer`, `Community Update`, `Human Response`, `Task Reminder`, `Admin Message`, `System`, `Reminder`.

Priorities:

- Confirmed priorities: `Low`, `Normal`, `High`, `Urgent`.
- Channel delivery services use priority for quiet-hours behavior and high/urgent display.

Preferences:

- Notification preference fields live on UserProfiles.
- Confirmed preference mapping in `notification.service.js`: job, housing, document, money, community, human response, and task reminders.
- Channel-specific preferences are confirmed for Telegram, WhatsApp, and LINE delivery services.

Preferred channel and fallback channel:

- User profile fields `preferredChannel` and `fallbackChannel` are handled by `chat.controller.js` and the Communication Layer.
- Connected-channel validation is confirmed in `chat.controller.js`.
- Communication Layer fallback selection is confirmed.
- Cross-channel notification deduplication at the Communication Layer level is Not Confirmed; channel delivery services deduplicate per channel.

Quiet hours:

- Telegram, WhatsApp, and LINE delivery services each implement quiet-hours checks using channel-specific profile fields.
- During quiet hours, non-time-sensitive Low/Normal/High deliveries are queued.
- Urgent notifications and time-sensitive Human Response behavior are handled in channel delivery services.

Queueing and scheduling:

- `UserNotifications.scheduledAt` stores scheduled notification time.
- `notificationService.processScheduledNotifications()` promotes due scheduled notifications by clearing `scheduledAt` while keeping status `New`.
- Channel delivery tables use `Pending`, `Queued`, `Failed`, and delivered/sent statuses depending on channel.
- Queued channel deliveries are retried by the channel pending-delivery processors.

Delivery:

- Telegram delivery uses `telegramDeliveryService.createTelegramDelivery`, `sendTelegramNotification`, and `processPendingTelegramDeliveries`.
- WhatsApp delivery uses `whatsappDeliveryService.createWhatsAppDelivery`, session/template send functions, and `processPendingWhatsAppDeliveries`.
- LINE delivery uses `lineDeliveryService.createLineDelivery`, LINE send/queue/retry/cancel functions, and `processPendingLineDeliveries`.
- WhatsApp and Telegram delivery paths use the Communication Service for notification sends; LINE delivery has a documented direct client call in Section 7.

Retries:

- Telegram, WhatsApp, and LINE delivery services define `MAX_RETRY_COUNT = 3` and `RETRY_DELAY_MS = 60 * 1000`.
- Failed deliveries become retry-eligible after the retry delay unless maximum retries or permanent-failure checks stop them.

Cancellation:

- User notification cancellation uses dismissal/completion through notification routes.
- Scheduled notification cancellation uses `notificationService.cancelScheduledNotification`.
- Channel delivery cancellation is confirmed for Telegram, WhatsApp, and LINE delivery services.
- Admin exposes WhatsApp delivery retry/cancel controls; equivalent Telegram/LINE admin delivery controls were Not Confirmed.

Statuses:

- User notification statuses: `New`, `Read`, `Dismissed`, `Completed`, `Expired`.
- Telegram delivery statuses: `Pending`, `Delivered`, `Failed`, `Cancelled`, `Queued`.
- WhatsApp and LINE delivery statuses: `Pending`, `Sent`, `Delivered`, `Read`, `Failed`, `Cancelled`, `Queued`.

Read, dismiss, complete, and postponement:

- `markAsRead`, `dismissNotification`, and `completeNotification` update notification status and timestamp fields.
- `rescheduleNotification(notificationId, days)` creates a new reminder notification and completes the current notification.
- Notification routes expose read, dismiss, complete, and remind actions.

Duplicate prevention:

- `notificationService.isDuplicate` prevents duplicate user notifications using notification type, user, source module, and source record.
- Channel delivery services prevent duplicate delivery records per notification/user/channel.
- WhatsApp and LINE delivery history services prevent duplicate status-history events.

Human Response:

- Human follow-up answers are saved through Admin.
- When status is answered and preferences allow it, a `Human Response` notification is created.
- WhatsApp delivery records Human Response CRM history as a Human Response event.
- Telegram and LINE delivery also support Human Response notification types.

CRM history:

- `notificationService.recordNotificationEvent` saves notification lifecycle events in CRM conversation history.
- WhatsApp delivery service records session message, template message, retry, cancel, delivery success, delivery failure, and Human Response events.
- LINE delivery service records notification queued/delivered/read/action/retry/cancel style events.
- Telegram delivery history is persisted as delivery records; a dedicated Telegram delivery-history table is Not Confirmed.

Notification flow diagram:

```text
Existing module or Admin action
  -> notificationService.createNotification()
  -> duplicate and preference checks
  -> UserNotifications row
  -> Notifications Center read/summary APIs
  -> optional channel delivery service
  -> quiet-hours check
  -> Pending or Queued delivery row
  -> channel send attempt
  -> Delivered/Sent/Read or Failed/Cancelled
  -> delivery history where supported
  -> CRM conversation history event
```

## 16. Tasks and Scheduling

Core files:

- `src/modules/tasks/task.model.js`
- `src/modules/tasks/task.repository.js`
- `src/modules/tasks/task.service.js`
- `src/modules/tasks/task.controller.js`
- `src/modules/tasks/task.routes.js`

Task creation:

- `taskService.createTask(input)` validates required fields, calculates task status and reminder time, persists the task, and records a `Created` history event.
- Chat task creation uses `taskService.handleTaskChat`.
- Admin task assignment uses `adminService.assignTask`, which calls `taskService.createTasksForAudience`.

Recurring tasks:

- Confirmed recurrence types: `None`, `Daily`, `Weekly`, `Monthly`.
- `completeTask(taskId)` calls `createNextRecurringTask(completed)` after completion.
- `calculateNextOccurrence(task)` calculates the next due date using recurrence type, interval, and optional end date.

Statuses:

- Confirmed task statuses: `New`, `In Progress`, `Completed`, `Dismissed`, `Overdue`, `Archived`.
- `calculateTaskStatus` marks tasks overdue when due date is before today unless already completed, dismissed, or archived.
- `markOverdueTasks(userId)` updates overdue tasks when user tasks are read.

Reminders:

- `reminderAt` is stored on UserTasks.
- `calculateReminderAt` builds reminder timestamps from due date/time and default reminder time.
- `processTaskReminders(userId, profile)` creates `Task Reminder` notifications for due reminders if `taskRemindersEnabled` is not `No`.
- Task reminder processing is request-triggered by `taskController.listTasks`; a global task-reminder interval was Not Confirmed.

Postponement and rescheduling:

- `remindTaskLater(taskId, option, customDate)` supports reminder postponement options.
- `rescheduleTask(taskId, updates)` updates due and reminder fields and records a `Rescheduled` event.
- Task routes expose `/remind` and `/reschedule`.

Completion:

- `completeTask(taskId)` sets status `Completed`, writes `completedAt`, records history, and creates next recurrence where relevant.
- Task completion can be triggered by web routes, chat/channel actions, and Admin.

History:

- Task history fields are defined in `TASK_HISTORY_FIELDS`.
- Confirmed history event types: `Created`, `Updated`, `Reminder Sent`, `Rescheduled`, `Started`, `Completed`, `Dismissed`, `Archived`.
- Repository-backed history is used with in-memory fallback.

Goal-related tasks:

- `completeTasksForGoal(userId, goal)` completes open Jobs tasks for `Find Job` and Housing tasks for `Find Housing`.
- `completeRelatedTasks(userId, relatedModule, relatedRecordId)` completes tasks related to a module/record.

Admin operations:

- Admin can create tasks for audiences by country, language, sector, city, and active goal.
- Admin can complete, archive, dismiss, reschedule, or update tasks through `adminService.updateTaskFromAdmin`.
- Admin task UI is in `src/public/admin.html` and `src/public/admin.js`.

Reports:

- Task metrics are produced by `taskService.getTaskStatistics`.
- Daily Manager reports include tasks created, completed, overdue, completion rate, common categories, repeated overdue users, document-generated tasks, and admin-generated tasks.

## 17. Background Processes

Confirmed background and operational processes:

| Process | Source file | Trigger | Frequency | Persistence | Restart behavior | Failure behavior |
| --- | --- | --- | --- | --- | --- | --- |
| Express server startup | `src/server.js` | Node process starts | Once per process | N/A | Recreates runtime timers and starts connector processors | Startup callback wraps connector failures so web app continues |
| Telegram long polling | `src/server.js`, `src/modules/telegram/telegram-update.service.js` | Server listen callback calls `startPolling()` | Long-poll loop; timeout uses `TELEGRAM_POLLING_TIMEOUT_SECONDS` | Latest processed update state and conversation/history where processed | Starts again on server restart; old persisted/history checks help avoid duplicates | Safe warning; web app continues |
| Telegram polling shutdown | `src/server.js` | `SIGINT` or `SIGTERM` | On process shutdown | N/A | Stops polling before server close | Not Confirmed beyond direct call |
| Scheduled notification processing | `src/app.js`, `src/modules/notifications/notification.service.js` | App module load, then interval | Every 5 minutes | UserNotifications | Runs again after restart | Errors are caught and ignored in app-level timer |
| Telegram delivery queue processor | `src/server.js`, `telegram-delivery.service.js` | Server listen callback, then interval | Every 60 seconds | TelegramDeliveries and UserNotifications | Pending/queued/failed deliveries are re-read after restart | Safe warning; web app continues |
| WhatsApp delivery queue processor | `src/server.js`, `whatsapp-delivery.service.js` | Server listen callback, then interval | Every 60 seconds | WhatsAppDeliveries, WhatsAppDeliveryHistory, UserNotifications | Pending/queued/failed deliveries are re-read after restart | Safe warning; web app continues |
| LINE delivery queue processor | `src/server.js`, `line-delivery.service.js` | Server listen callback, then interval | Every 60 seconds | LineDeliveries, LineDeliveryHistory, UserNotifications | Pending/queued/failed deliveries are re-read after restart | Safe warning; web app continues |
| Telegram link-code cleanup | `src/server.js`, `telegram-link.service.js` | Server listen callback | Once at startup | TelegramLinkCodes and TelegramLinkHistory | Runs again on next restart | Safe warning; web app continues |
| LINE link-code cleanup | `src/server.js`, `line-link.service.js` | Server listen callback | Once at startup | ChannelLinkCodes and ChannelLinkHistory | Runs again on next restart | Safe warning; web app continues |
| Quiet-hours release | Channel delivery services | Delivery queue processors call pending processors | Same as channel delivery intervals | Channel delivery rows | Queued rows remain persisted and are retried after restart | Delivery failures become Failed or remain Queued/Pending |
| Document checks | `document.controller.js`, `document.service.js`, `core-agent.service.js` | Document API calls and document-related chat messages | Request-triggered | UserDocuments, UserDocumentHistory, UserProfiles | Data persists; checks rerun on request after restart | Controller errors go to error handler |
| Task reminders | `task.controller.js`, `task.service.js` | Task list API calls process reminders | Request-triggered | UserTasks, UserTaskHistory, UserNotifications | Data persists; due reminders are checked again on next request | Controller errors go to error handler |
| Notification generation from existing modules | `notification.controller.js`, `notification.service.js` | Notification list/summary API calls | Request-triggered | UserNotifications | Deduplication prevents repeated rows after restart | Controller errors go to error handler |
| Health check | `src/app.js` | `GET /health` | Request-triggered | N/A | Available when server is running | Returns basic JSON status |

Not confirmed as background processes:

- Scheduled report generation without Admin action.
- Global document-expiry scan independent of user/API access.
- Global task-reminder scan independent of user/API access.
- External queue service.

Confirmed background process count: 14.

## 18. Admin Architecture

Admin pages:

- Admin frontend entry: `src/public/admin.html`.
- Admin frontend logic: `src/public/admin.js`.
- Admin backend routes: `src/modules/admin/admin.routes.js`.
- Admin controller: `src/modules/admin/admin.controller.js`.
- Admin service: `src/modules/admin/admin.service.js`.
- Admin repository/model: `admin.repository.js`, `admin.model.js`.

Confirmed Admin sections:

1. Overview
2. Human Follow-up
3. Missing Knowledge
4. Content Drafts
5. Community Moderation
6. Documents
7. Notifications
8. WhatsApp
9. LINE
10. Tasks
11. Reports
12. Recommendations

Dashboards:

- Overview combines conversations, users, categories, missing knowledge, jobs, housing, services, money, documents, notifications, tasks, and active needs.
- WhatsApp dashboard shows connector health, connected users, open/closed windows, pending/failed deliveries, queue size, success rate, filters, and delivery controls.
- LINE dashboard shows connector health, connected users, active conversations, pending/failed deliveries, queue size, success rate, and filters.

User operations:

- Admin can answer human follow-ups.
- Admin can create knowledge drafts and content drafts from follow-ups.
- Admin can update recommendations.
- Admin can update documents and tasks.
- Admin can create manual notifications.

CRM history:

- Admin Human Response creates notifications and is tied to conversation/follow-up data.
- WhatsApp delivery operations record CRM history for session/template messages, retries, cancels, delivery success/failure, and Human Response.
- Communication preference changes from the profile UI are saved to CRM history by `chat.controller.js`.

Task operations:

- Admin can assign tasks to one or more users by target fields.
- Admin can complete, archive, dismiss, reschedule, or update tasks.

Notification operations:

- Admin can create manual notifications.
- Admin can cancel scheduled notifications.
- WhatsApp manual notification creation also invokes pending WhatsApp delivery processing.

Telegram:

- Telegram has web API operations for link code creation, disconnect, and link history.
- A dedicated Telegram admin dashboard section was Not Confirmed.

WhatsApp:

- WhatsApp Admin section is confirmed in `admin.html` and `admin.js`.
- Admin routes support manual notification creation, retry, cancel, and safe failure reason inspection.
- Connector health reads from WhatsApp client and webhook services.

LINE:

- LINE Admin section is confirmed in `admin.html` and `admin.js`.
- LINE dashboard health reads from LINE client and webhook services.
- LINE Rich Menu admin routes exist under `/api/line`, with admin-key checks for create/set.
- LINE dashboard delivery retry/cancel controls were Not Confirmed in Admin UI.

Connector health:

- WhatsApp health uses `whatsappClientService.getHealth()` and `whatsappWebhookService.getWebhookHealth()`.
- LINE health uses `lineClientService.getHealth()` and `lineWebhookService.getWebhookHealth()`.
- Telegram health is available through the Communication Layer/Telegram polling status, but a dedicated Admin Telegram health section was Not Confirmed.

Delivery tools:

- WhatsApp Admin delivery tools: retry, cancel, view failure reason.
- General notification tool: cancel scheduled notification.
- Telegram and LINE delivery-specific Admin retry/cancel tools: Not Confirmed.

Access control:

- `/api/admin` routes are protected by `ADMIN_API_KEY`.
- Admin UI file is statically served; API requests require the key.
- LINE Rich Menu create/set routes independently check Admin API key.

Confirmed Admin section count: 12.

## 19. Reporting Architecture

Core files:

- `src/modules/manager-agent/manager-report.model.js`
- `src/modules/manager-agent/manager-agent.service.js`
- `src/modules/manager-agent/manager-agent.repository.js`
- Admin report UI in `src/public/admin.html` and `src/public/admin.js`

Manager reports:

- Manager report generation is implemented in `manager-agent.service.js`.
- Admin daily/weekly report buttons call Admin routes, which call Manager Agent services.
- Recommendations can be generated from daily reports.

Daily reports:

- `DAILY_REPORT_FIELDS` define daily report persistence.
- `generateDailySummary(options)` reads conversations, user profiles, notifications, tasks, WhatsApp deliveries, and LINE deliveries.
- Daily metrics include conversations, new users, active users, question/category summaries, unanswered/needs-human questions, missing knowledge, jobs/services/locations, money/exchange-rate requests, active goals, document issues, notification stats, task stats, WhatsApp stats, and LINE stats.

Weekly reports:

- `WEEKLY_REPORT_FIELDS` define weekly report persistence.
- `generateWeeklySummary(options)` builds weekly growth, trends, recurring problems, and community opportunities.

Recommendations:

- `RECOMMENDATION_FIELDS` define recommendation persistence.
- `generateRecommendations(options)` creates recommendations from missing knowledge, money-transfer requests, and requested jobs.

Metrics and data sources:

- Conversation and user metrics come from ConversationHistory and UserProfiles through Manager Agent repository reads.
- Notification metrics come from `notificationService.buildAdminSummary`.
- Task metrics come from `taskService.getTaskStatistics`.
- Document metrics are read from profile document summary fields and Admin document warning services.
- WhatsApp channel metrics come from WhatsApp conversations and WhatsAppDeliveries.
- LINE channel metrics come from LINE conversations and LineDeliveries.

Channel metrics:

- WhatsApp metrics include connected users, active users, messages received/sent, session/template message counts, success rate, failed deliveries, retry statistics, average response time, common commands, and common actions.
- LINE metrics include connected users, daily active users, messages received/sent, notification success rate, failed deliveries, average response time, common commands, and common actions.
- Telegram-specific Manager report fields were Not Confirmed.

Delivery rates:

- Notification open rate is calculated in `notificationService.buildAdminSummary`.
- WhatsApp success rate is calculated from deliveries with `Sent`, `Delivered`, or `Read`.
- LINE notification success rate is calculated from deliveries with `Sent`, `Delivered`, or `Read`.

Response times:

- WhatsApp and LINE response-time helper functions exist in `manager-agent.service.js`.
- Admin fallback report generation may show `Not available` for response time when using local fallback report assembly.

Active users:

- Daily reports count active users from conversation user IDs.
- WhatsApp active users are derived from WhatsApp conversations.
- LINE daily active users are derived from LINE conversations.

Generation method:

- Daily report route: `POST /api/admin/reports/daily`.
- Weekly report route: `POST /api/admin/reports/weekly`.
- Reports are persisted through `manager-agent.repository.js`.
- Scheduled report generation without Admin action was Not Confirmed.

Confirmed report type count: 3 (`DailyReports`, `WeeklyReports`, `Recommendations`).

## 20. Environment Variables

This section lists confirmed environment variable names only. No environment values are documented.

Application:

- `NODE_ENV`: optional; used by `src/config/env.js`.
- `PORT`: optional; used by `src/config/env.js` and `src/server.js`; the server has a local default when unset.

Database and persistence:

- `GOOGLE_SHEETS_SPREADSHEET_ID`: required for Google Sheets persistence.
- `GOOGLE_SHEETS_CLIENT_EMAIL`: required for Google Sheets service-account authentication.
- `GOOGLE_SHEETS_PRIVATE_KEY`: required for Google Sheets service-account authentication.
- `GOOGLE_SHEETS_CONTACTS_SHEET_NAME`
- `GOOGLE_SHEETS_CONTACT_NOTES_SHEET_NAME`
- `GOOGLE_SHEETS_CONTACT_HISTORY_SHEET_NAME`
- `GOOGLE_SHEETS_WORKERS_SHEET_NAME`
- `GOOGLE_SHEETS_WORKER_HISTORY_SHEET_NAME`
- `GOOGLE_SHEETS_JOBS_SHEET_NAME`
- `GOOGLE_SHEETS_EXCHANGE_RATES_SHEET_NAME`
- `GOOGLE_SHEETS_MONEY_TRANSFER_PROVIDERS_SHEET_NAME`
- `GOOGLE_SHEETS_HOUSING_LISTINGS_SHEET_NAME`
- `GOOGLE_SHEETS_COMMUNITY_POSTS_SHEET_NAME`
- `GOOGLE_SHEETS_COMMUNITY_COMMENTS_SHEET_NAME`
- `GOOGLE_SHEETS_HUMAN_FOLLOW_UPS_SHEET_NAME`
- `GOOGLE_SHEETS_ADMIN_NOTES_SHEET_NAME`
- `GOOGLE_SHEETS_KNOWLEDGE_DRAFTS_SHEET_NAME`
- `GOOGLE_SHEETS_USER_PROFILES_SHEET_NAME`
- `GOOGLE_SHEETS_CONVERSATION_HISTORY_SHEET_NAME`
- `GOOGLE_SHEETS_DAILY_REPORTS_SHEET_NAME`
- `GOOGLE_SHEETS_WEEKLY_REPORTS_SHEET_NAME`
- `GOOGLE_SHEETS_RECOMMENDATIONS_SHEET_NAME`
- `GOOGLE_SHEETS_CONTENT_DRAFTS_SHEET_NAME`
- `GOOGLE_SHEETS_SERVICES_SHEET_NAME`
- `GOOGLE_SHEETS_USER_DOCUMENTS_SHEET_NAME`
- `GOOGLE_SHEETS_USER_DOCUMENT_HISTORY_SHEET_NAME`
- `GOOGLE_SHEETS_USER_NOTIFICATIONS_SHEET_NAME`
- `GOOGLE_SHEETS_USER_TASKS_SHEET_NAME`
- `GOOGLE_SHEETS_USER_TASK_HISTORY_SHEET_NAME`
- `GOOGLE_SHEETS_TELEGRAM_LINK_CODES_SHEET_NAME`
- `GOOGLE_SHEETS_TELEGRAM_LINK_HISTORY_SHEET_NAME`
- `GOOGLE_SHEETS_TELEGRAM_DELIVERIES_SHEET_NAME`
- `GOOGLE_SHEETS_CHANNEL_LINK_CODES_SHEET_NAME`
- `GOOGLE_SHEETS_CHANNEL_LINK_HISTORY_SHEET_NAME`
- `GOOGLE_SHEETS_LINE_DELIVERIES_SHEET_NAME`
- `GOOGLE_SHEETS_LINE_DELIVERY_HISTORY_SHEET_NAME`
- `GOOGLE_SHEETS_WHATSAPP_TEMPLATES_SHEET_NAME`
- `GOOGLE_SHEETS_WHATSAPP_DELIVERIES_SHEET_NAME`
- `GOOGLE_SHEETS_WHATSAPP_DELIVERY_HISTORY_SHEET_NAME`

Authentication and security:

- `ADMIN_API_KEY`: used by Admin API middleware and Admin frontend requests.
- `WHATSAPP_VERIFY_TOKEN`: used for WhatsApp webhook verification.
- `LINE_CHANNEL_SECRET`: used for LINE webhook signature validation.

Telegram:

- `TELEGRAM_BOT_ENABLED`: optional feature flag; Telegram polling is skipped when disabled.
- `TELEGRAM_BOT_TOKEN`: required only when Telegram is enabled.
- `TELEGRAM_BOT_MODE`: optional; polling mode is configured in `src/config/env.js`.
- `TELEGRAM_POLLING_TIMEOUT_SECONDS`: optional; polling timeout has a code default.
- `TELEGRAM_LINK_CODE_TTL_MINUTES`: optional; Telegram link-code expiry has a code default.

WhatsApp:

- `WHATSAPP_ENABLED`: optional feature flag; WhatsApp processing is skipped when disabled.
- `WHATSAPP_VERIFY_TOKEN`: required for Meta webhook verification.
- `WHATSAPP_ACCESS_TOKEN`: required for live WhatsApp Cloud API requests.
- `WHATSAPP_PHONE_NUMBER_ID`: required for live WhatsApp Cloud API send operations.
- `WHATSAPP_BUSINESS_ACCOUNT_ID`: configured for WhatsApp Business account context.

LINE:

- `LINE_ENABLED`: optional feature flag; LINE webhook and delivery work safely when disabled.
- `LINE_CHANNEL_ID`: configured for LINE channel context.
- `LINE_CHANNEL_SECRET`: required for LINE webhook signature validation.
- `LINE_CHANNEL_ACCESS_TOKEN`: required for live LINE Messaging API requests.

Notifications:

- Notification storage is configured through `GOOGLE_SHEETS_USER_NOTIFICATIONS_SHEET_NAME`.
- Channel delivery storage is configured through Telegram, WhatsApp, and LINE delivery sheet-name variables.
- User notification preferences are persisted in profile records, not environment variables.

Scheduling:

- `TELEGRAM_POLLING_TIMEOUT_SECONDS`
- `TELEGRAM_LINK_CODE_TTL_MINUTES`
- Other confirmed scheduling intervals are hard-coded in `src/server.js` and `src/app.js`; additional scheduling environment variables were Not Confirmed.

External services:

- Google Sheets environment variables listed under Database and persistence.
- Telegram Bot API environment variables listed under Telegram.
- WhatsApp Cloud API environment variables listed under WhatsApp.
- LINE Messaging API environment variables listed under LINE.
- `AI_PROVIDER`: optional; configured in `src/config/env.js`.
- `AI_MODEL`: optional; configured in `src/config/env.js`.
- `AI_API_KEY`: required only when the configured AI provider is called.
- `TRANSLATION_PROVIDER`: optional; configured in `src/config/env.js`.
- `TRANSLATION_API_KEY`: required only when the configured translation provider is called.
- `TRANSLATION_MODEL`: optional; configured in `src/config/env.js`.
- `TRANSLATION_TIMEOUT_MS`: optional; configured in `src/config/env.js`.

## 21. External Integrations

Google Sheets:

- Provider: Google.
- Purpose: spreadsheet-backed persistence for repository records.
- Files: `src/config/env.js`, `src/config/googleSheets.js`, module repositories, and setup scripts under `scripts`.
- Authentication method: service-account credentials from environment variables.
- Inbound flow: none confirmed.
- Outbound flow: repositories call `readSheetRows`, `appendSheetRow`, `updateSheetRow`, and `ensureSheetWithHeader`.
- Failure behavior: repository/service layers catch or propagate failures depending on module; several modules contain local fallback behavior.
- Enabled or disabled configuration: Google Sheets requires spreadsheet ID, client email, and private key.

Telegram Bot API:

- Provider: Telegram.
- Purpose: external Telegram connector for incoming text, commands, callbacks, and notification delivery.
- Files: `src/modules/telegram/telegram-client.service.js`, `telegram-update.service.js`, `telegram-message.service.js`, `telegram-delivery.service.js`, `telegram-link.service.js`, and `src/modules/communication/channel-registry.js`.
- Authentication method: bot token from environment variable.
- Inbound flow: long polling through `getUpdates`.
- Outbound flow: text messages, callback answers, message edits, and notifications.
- Failure behavior: safe warnings, retryable connector errors, persisted delivery failure codes, and continued web server operation.
- Enabled or disabled configuration: Telegram polling and delivery depend on `TELEGRAM_BOT_ENABLED` and token configuration.

WhatsApp Business Cloud API:

- Provider: Meta.
- Purpose: WhatsApp connector for incoming messages, outgoing replies, interactive messages, templates, notifications, and delivery status webhooks.
- Files: `src/modules/whatsapp/whatsapp-client.service.js`, `whatsapp-webhook.service.js`, `whatsapp-message.mapper.js`, `whatsapp-message.service.js`, `whatsapp-delivery.service.js`, `whatsapp-template.model.js`, and `src/modules/communication/channel-registry.js`.
- Authentication method: access token and phone number ID from environment variables; webhook verification token for verification.
- Inbound flow: GET webhook verification and POST webhook events.
- Outbound flow: session messages through the Communication Layer when the conversation window is open; template messages when closed and an approved local template mapping exists.
- Failure behavior: disabled connector response, safe warnings, failure codes, retry limits, cancellation, and webhook health state.
- Enabled or disabled configuration: WhatsApp processing depends on `WHATSAPP_ENABLED` and required WhatsApp credentials.

LINE Messaging API:

- Provider: LINE.
- Purpose: LINE connector for incoming messages, commands, Rich Menu, Quick Replies, account linking, and notifications.
- Files: `src/modules/line/line-client.service.js`, `line-webhook.service.js`, `line-message.mapper.js`, `line-message.service.js`, `line-delivery.service.js`, `line-link.service.js`, and `src/modules/communication/channel-registry.js`.
- Authentication method: channel secret for signature validation and channel access token for API requests.
- Inbound flow: POST webhook events validated with `x-line-signature`.
- Outbound flow: reply/push text messages, Rich Menu operations, and notification delivery.
- Failure behavior: safe warnings, delivery failure codes, capped retries, and continued web application operation.
- Enabled or disabled configuration: LINE work depends on `LINE_ENABLED`, channel secret, and channel access token.

AI provider:

- Provider: configured by `AI_PROVIDER`; only OpenAI provider code was confirmed.
- Purpose: fallback natural-language response generation when Knowledge Base does not fully answer.
- Files: `src/modules/ai-provider/ai-provider.service.js`, `src/modules/ai-provider/openai.provider.js`, `src/modules/ai-provider/gringo-prompt.service.js`, and `src/modules/core-agent/core-agent.service.js`.
- Authentication method: `AI_API_KEY`.
- Inbound flow: none confirmed.
- Outbound flow: Core Agent calls `aiProviderService.generateReply(context)`.
- Failure behavior: provider errors are caught by Core Agent and converted into friendly fallback behavior.
- Enabled or disabled configuration: provider is configured by environment variables; missing API key prevents live provider calls.

OpenAI translation provider:

- Provider: OpenAI.
- Purpose: provider adapter for future translation requests through the central Translation module.
- Files: `src/modules/translation/providers/openai-translation.provider.js`, `src/modules/translation/translation.service.js`, and `src/config/env.js`.
- Authentication method: `TRANSLATION_API_KEY`, with `AI_API_KEY` as fallback configuration when translation-specific credentials are absent.
- Inbound flow: none confirmed.
- Outbound flow: not connected to live message flows; direct calls to `translationService.translateText(...)` can use the provider when configured.
- Failure behavior: missing credentials, provider failures, empty responses, and timeouts preserve original text through controlled fallback results.
- Enabled or disabled configuration: selected by `TRANSLATION_PROVIDER=openai`; unavailable or unsupported configuration falls back safely.

## 22. Logging and Security Controls

Logging:

- Connector modules use safe warning helpers such as `safeTelegramWarning`, `safeWhatsAppWarning`, `safeLineWarning`, and `safeCommunicationLog`.
- Startup connector failures are logged as safe warnings in `src/server.js`.
- Error middleware is centralized in `src/shared/errorHandler.js`.

Error logging:

- Telegram, WhatsApp, LINE, and AI provider errors classify safe failure codes or user-safe messages.
- Full token values are not required in any documented error output.

Audit history:

- CRM conversation history is stored through `src/modules/crm-agent`.
- Telegram link history, shared channel link history, WhatsApp delivery history, LINE delivery history, document history, task history, Admin notes, and recommendations are confirmed record types.

Secret masking:

- Environment variable names are documented; values are not.
- Channel client services read tokens from configuration but do not expose them to browser routes.
- A global secret-masking middleware was Not Confirmed.

Sensitive-data masking:

- `src/modules/documents/document.service.js` masks document numbers with `maskDocumentNumber`.
- Telegram and WhatsApp document command responses include masked-document wording.
- Notification delivery services include masking helpers and avoid full document numbers in notification text.

Webhook verification:

- WhatsApp GET webhook verification uses `WHATSAPP_VERIFY_TOKEN`.
- LINE POST webhook verification uses `LINE_CHANNEL_SECRET` and HMAC SHA-256.
- Telegram uses polling; Telegram webhook verification was Not Confirmed.

Authentication:

- Admin API routes use an API key middleware from `src/modules/admin/admin.routes.js`.
- Full user login, sessions, OAuth, and JWT authentication were Not Confirmed.

Authorization and ownership validation:

- User-facing APIs identify records by `channel` and `channelUserId`.
- Notification, task, document, and profile operations are scoped by user/channel fields.
- Telegram and LINE callback/linking flows resolve the channel identity before acting.
- Database-enforced row-level access was Not Confirmed.

Rate limiting:

- Telegram linking attempts are rate-limited in `telegram-link.service.js`.
- LINE linking attempts are rate-limited in `line-link.service.js`.
- Express-wide rate limiting was Not Confirmed.

Duplicate prevention:

- Notification creation prevents repeated notifications for the same user/type/source record.
- Telegram update and callback processing tracks processed update/callback keys.
- WhatsApp webhook processing tracks processed message IDs and persisted history.
- LINE webhook processing tracks processed message IDs and persisted history.
- Channel delivery services deduplicate by notification/user/channel state.

Input validation:

- Models define allowed statuses and fields for jobs, housing, money providers, community posts/comments, documents, notifications, tasks, deliveries, and link codes.
- Unsupported media handling is implemented in channel mappers/services.
- Empty or invalid comment handling exists in Community service; exact validation breadth is module-specific.

Safe errors:

- Unsupported Telegram, WhatsApp, and LINE media returns user-safe text.
- Connector failures are caught so the web app continues running.
- Admin and public APIs pass exceptions through `errorHandler`.

Private-chat validation and group-chat rejection:

- Telegram mapper accepts only private chat text messages.
- Telegram callbacks reject non-private chats.
- WhatsApp mapper rejects group and broadcast identifiers.
- LINE mapper accepts user-source events; group/room behavior beyond that was Not Confirmed.

Linking-code protection:

- Telegram and LINE linking codes are random, hashed, expiring, single-use, cancellable, and recorded in link history.
- WhatsApp one-time linking codes were Not Confirmed.

## 23. Recovery and Testing

Error handling:

- `src/shared/errorHandler.js` centralizes API error responses.
- Connector clients convert external API failures into connector-specific error classes.
- Core Agent catches CRM and AI-provider errors and continues with safe replies where implemented.

Retries:

- Telegram, WhatsApp, and LINE delivery services implement capped retry logic.
- WhatsApp and LINE persist delivery history events for status changes.
- Telegram persists retry counts in delivery records; a dedicated Telegram delivery-history table was Not Confirmed.

Restart recovery:

- `src/server.js` processes pending Telegram, WhatsApp, and LINE deliveries on startup.
- `src/server.js` starts Telegram polling on startup when enabled.
- Link-code cleanup is triggered at startup for Telegram and LINE.
- Notification scheduling is processed during app startup and at interval through `src/app.js`.

Queue recovery:

- Pending and queued delivery records are read from persistent repositories by channel processors.
- Queue recovery for external queue services is Not Confirmed because no external queue is implemented.

Graceful degradation:

- Disabled or misconfigured Telegram, WhatsApp, and LINE connectors do not prevent the web server from starting.
- AI provider failure falls back to safe Core Agent behavior.
- Some Admin and module services include local fallback values when repositories are unavailable.

Test framework:

- `package.json` defines `test` as `node --test`.
- Confirmed test files are `test/contact.validation.test.js`, `test/contacts.api.test.js`, `test/core-agent-ai-provider.test.js`, and `test/workers.api.test.js`.

Unit tests:

- Contact validation tests are confirmed.
- Core Agent AI provider tests are confirmed.

Integration tests:

- Contact API and worker API tests are confirmed.
- Full channel integration tests with live Telegram, WhatsApp, or LINE providers were Not Confirmed.

Regression scripts:

- No broad automated regression script was confirmed.

Webhook tests:

- Automated webhook tests were Not Confirmed.

Database tests:

- `scripts/testGoogleSheetsConnection.js` tests Google Sheets connectivity.
- Setup scripts under `scripts` create or prepare Google Sheets tabs for several modules.

Admin tests:

- Automated Admin UI/API tests were Not Confirmed.

Manual tests:

- Manual test instructions exist in sprint requests and some documentation, but a repository-backed manual-test checklist file for all current features was Not Confirmed.

## 24. Data Flow Diagrams

Web Chat:

```text
Browser chat.html
-> src/public/chat.js
-> POST /api/chat/message
-> chatController.sendMessage
-> coreAgentService.processWebMessage
-> CRM, Knowledge, Jobs, Housing, Money, Community, Services, Documents, Notifications, Tasks as needed
-> ConversationHistory and profile updates
-> JSON response
-> chat.html renders Gringo response
```

Telegram:

```text
Telegram Bot API getUpdates
-> telegramUpdateService.pollOnce
-> telegram-message.mapper.js
-> communicationService.receiveMessage('telegram', message)
-> telegram-message.service.js
-> CRM user lookup or creation
-> Core Agent and existing modules
-> CRM history
-> communicationService.sendMessage/sendInteractiveMessage or Telegram client callback helpers
-> Telegram Bot API
```

WhatsApp:

```text
Meta webhook
-> GET verification or POST /api/whatsapp/webhook
-> whatsapp-webhook.service.js
-> whatsapp-message.mapper.js
-> communicationService.receiveMessage('whatsapp', message)
-> whatsapp-message.service.js
-> CRM user lookup or creation
-> Core Agent and existing modules
-> CRM history
-> communicationService.sendMessage/sendInteractiveMessage
-> WhatsApp Cloud API session message or template flow
```

LINE:

```text
LINE webhook
-> POST /api/line/webhook
-> line-webhook.service.js signature validation
-> line-message.mapper.js
-> communicationService.receiveMessage('line', message)
-> line-message.service.js
-> CRM user lookup or creation
-> Core Agent and existing modules
-> CRM history
-> communicationService.sendInteractiveMessage for replies
-> LINE Messaging API
```

Notification delivery:

```text
Existing module or Admin
-> notificationService.createNotification
-> UserNotifications repository
-> channel delivery processor or direct delivery creation
-> preference and quiet-hours checks
-> Telegram/WhatsApp/LINE delivery record
-> communicationService or channel delivery sender
-> external provider confirms or fails
-> delivery status, retry count, and CRM history update
```

Human Response:

```text
Admin writes answer
-> adminController.saveHumanAnswer
-> adminService.saveHumanAnswer
-> HumanFollowUps update
-> optional KnowledgeDraft and ContentDraft actions
-> Human Response notification
-> Notifications Center and eligible channel delivery processors
-> user sees response in app or connected channel
```

Account linking:

```text
Web My Profile
-> create channel link code route
-> link service stores hashed expiring code
-> user sends link command in Telegram or LINE
-> channel service validates code and channel identity
-> user confirms link
-> profile channel fields updated
-> link code marked Used
-> link history and CRM history preserved
```

Task completion:

```text
User action from Web, Telegram, WhatsApp, or LINE
-> channel/API controller validates user and action
-> taskService.completeTask
-> task status and completedAt update
-> task history event
-> recurring next occurrence created when configured
-> related notification or goal coordination where implemented
```

Preferred-channel fallback:

```text
Existing module requests outbound communication
-> communicationService.sendMessage/sendInteractiveMessage/sendNotification
-> select preferred channel from profile or requested channel
-> check registered adapter and requested feature
-> if allowed and unsupported/unavailable, try fallback channel
-> send through selected channel adapter
-> log selected channel, fallback use, success, or failure
```

## 25. Confirmed Limitations

- Full user login, sessions, OAuth, JWT, and role-based user authentication were Not Confirmed.
- Admin access uses a simple API key for API routes.
- Google Sheets persistence has logical IDs and relationships, but database-enforced foreign keys, indexes, and unique constraints were Not Confirmed.
- A formal migration framework was Not Confirmed.
- Missing Knowledge and handoff services contain placeholder status responses.
- Repository search confirmed `TODO.md`, placeholder references in `README.md`, `CHANGELOG.md`, and `docs`, and active placeholder statuses in `src/modules/core-agent/core-agent.service.js`, `src/modules/knowledge-agent/missing-knowledge.service.js`, and `src/modules/knowledge-agent/handoff.service.js`.
- Test files use mock repositories/services in `test/contacts.api.test.js`, `test/workers.api.test.js`, and `test/core-agent-ai-provider.test.js`.
- Temporary failure codes are used by Telegram, WhatsApp, and LINE delivery services for retryable channel failures.
- Telegram uses long polling; a Telegram webhook was Not Confirmed.
- A dedicated Telegram Admin dashboard section and Telegram-specific Manager report metrics were Not Confirmed.
- WhatsApp secure one-time account linking comparable to Telegram/LINE was Not Confirmed.
- LINE notification delivery directly calls the LINE client in `line-delivery.service.js`; this is a confirmed bypass of the Communication Service.
- Telegram callback answer/edit helpers directly call Telegram client methods.
- WhatsApp and LINE have dedicated delivery-history models; a comparable Telegram delivery-history model was Not Confirmed.
- Telegram, WhatsApp, and LINE each have channel-specific delivery models and retry processors.
- Telegram uses Telegram-specific link-code models; LINE uses shared channel link-code models; a WhatsApp link-code model was Not Confirmed.
- External queue infrastructure was Not Confirmed.
- Scheduled report generation without Admin action was Not Confirmed.
- Automated webhook, Admin, and full cross-module regression tests were Not Confirmed.
- `ContactNotes` sheet configuration exists, but an active ContactNotes model/repository was Not Confirmed.
- LINE external delivery/read status webhook support equivalent to WhatsApp was Not Confirmed.

## 26. Unconfirmed Areas

- Production deployment configuration.
- Full browser or end-to-end test automation.
- Live verification of Telegram, WhatsApp, and LINE credentials or provider-side template approval.
- Payment integrations.
- WhatsApp one-time secure linking and disconnect routes.
- Telegram self-unlink command.
- Database-enforced relationships, indexes, and uniqueness.
- Global secret-masking middleware.
- Express-wide rate limiting.
- Scheduled daily/weekly reports without Admin action.
- Complete cross-channel duplicate prevention beyond per-channel delivery services.
- Admin UI controls for Telegram and LINE delivery retry/cancel.
- A complete external-provider test suite for channel webhooks and callbacks.

## 27. Language Detection Foundation

Core files:

- `src/modules/language/language.constants.js`
- `src/modules/language/language-detection.service.js`
- `src/modules/language/language.interface.js`
- `src/modules/language/index.js`

Purpose:

- The Language module provides central, reusable language normalization and detection for Core Agent language resolution.
- Core Agent imports `languageDetectionService` and uses it at the language-resolution point in `processWebMessage`.
- Existing Web, Telegram, WhatsApp, and LINE business routing remains handled by the existing Core Agent and module services.

Supported languages:

- English: `en`
- Hebrew: `he`
- Arabic: `ar`
- Thai: `th`
- Sinhala: `si`
- Hindi: `hi`
- Russian: `ru`
- Filipino/Tagalog: `tl`

Detection priority:

```text
Explicit requested language
-> Saved profile language
-> Channel/platform language
-> Text-script detection
-> Default language
```

Confirmed text-script detection:

- Hebrew characters resolve to `he`.
- Arabic characters resolve to `ar`.
- Thai characters resolve to `th`.
- Sinhala characters resolve to `si`.
- Devanagari characters resolve to `hi`.
- Cyrillic characters resolve to `ru`.
- Latin characters resolve to `en` unless a stronger explicit, profile, or channel signal exists.

Normalization:

- Confirmed aliases include `iw` to `he`, `tagalog` to `tl`, `filipino` to `tl`, and `sinhala` to `si`.
- Unsupported language values are ignored by `resolveLanguage` and fall through to the next available signal.

Translation:

- Translation is not implemented in this sprint.
- No external translation API or dependency was added.

## 28. Translation Service Foundation

Core files:

- `src/modules/translation/translation.constants.js`
- `src/modules/translation/translation.provider.js`
- `src/modules/translation/translation.service.js`
- `src/modules/translation/index.js`

Purpose:

- The Translation module defines a central provider-agnostic interface for future translation support.
- The module is not connected to Core Agent, Web Chat, Telegram, WhatsApp, or LINE message flows.
- Current message behavior remains unchanged.

Provider abstraction:

- `translation.provider.js` defines a disabled fallback provider with:
  - `translateText(text, sourceLanguage, targetLanguage)`
  - `detectAndTranslate(text, targetLanguage)`
  - `isAvailable()`
  - `getProviderName()`
- `translation.service.js` wraps providers and returns structured translation results.
- Provider errors are converted into controlled fallback results instead of raw errors.

Language validation:

- Source and target languages are normalized through the existing Language module.
- Supported translation language codes currently match `SUPPORTED_LANGUAGES` from `src/modules/language/language.constants.js`.
- When source and target languages are identical, the original text is returned and no provider call is needed.

Disabled fallback behavior:

- The default provider is `disabled`.
- `isAvailable()` returns `false`.
- Translation requests keep the original text available and return `fallbackUsed: true` when a provider would be required.
- Empty text is handled safely.

Configuration names:

- `TRANSLATION_PROVIDER`
- `TRANSLATION_API_KEY`
- `.env.example` lists the names with empty values.
- `src/config/env.js` exposes them under `env.translation`.

Live translation:

- Incoming message translation is not implemented.
- Outgoing message translation is not implemented.
- This foundation section originally used only the disabled provider; the OpenAI provider adapter is documented in the next section.

## 29. Real Translation Provider Integration

Selected provider:

- OpenAI is the only confirmed translation provider adapter.
- Provider-specific code is isolated in `src/modules/translation/providers/openai-translation.provider.js`.
- The adapter uses the OpenAI Responses API shape already used elsewhere in the project, but it remains separate from business message flows.

Environment configuration:

- `TRANSLATION_PROVIDER` selects the provider. Confirmed value: `openai`.
- `TRANSLATION_API_KEY` provides translation credentials.
- `TRANSLATION_MODEL` optionally selects a model.
- `TRANSLATION_TIMEOUT_MS` optionally controls provider request timeout.
- `AI_API_KEY` and `AI_MODEL` are used as fallback configuration by the OpenAI translation adapter when translation-specific values are absent.
- No real credential values are documented.

Fallback behavior:

- If `TRANSLATION_PROVIDER` is empty or unsupported, the disabled fallback provider is used.
- If `TRANSLATION_PROVIDER=openai` but no API key is available, the OpenAI provider reports unavailable and the central service preserves the original text.
- Provider errors, empty responses, failed responses, and timeouts are converted into controlled fallback results by `translation.service.js`.

Live translation:

- Incoming message translation is documented in the next section.
- Web Chat, Telegram, WhatsApp, and LINE connectors do not call the Translation module directly.
- Outgoing response translation is documented in section 31.

## 30. Incoming Message Translation

Shared integration point:

- Incoming translation is integrated once in `src/modules/core-agent/core-agent.service.js`.
- Web Chat, Telegram, WhatsApp, and LINE continue to call the existing `coreAgentService.processWebMessage(...)` flow.
- Channel-specific translation logic was not added.

Core Agent working language:

- The Core Agent working language for intent routing is fixed to English: `en`.
- This is not configurable in this sprint.

Flow:

```text
Incoming channel message
-> Core Agent receives original message
-> Language module resolves original user language
-> Onboarding remains handled with the original message
-> If complete and source language is not en, Translation service attempts translation to en
-> Core intent/module routing uses processingText
-> CRM conversation history preserves originalText
-> Outgoing response is returned unchanged
```

Internal text values:

- `originalText`: the exact incoming user message after existing request trimming.
- `processingText`: the English translation when translation succeeds, otherwise the original text.
- Internal translation metadata includes `originalLanguage`, `processingLanguage`, `translated`, `provider`, and `fallbackUsed`.
- Translation metadata is attached to the request context only and is not persisted permanently.

Safe fallback behavior:

- Empty messages skip translation.
- Same-language English messages skip translation.
- Channel control messages such as slash commands, callbacks, `link`, and `unlink` skip translation.
- Provider failures, unavailable providers, and fallback results do not block message processing.
- Attachments and unsupported media are not translated because channel mappers/services handle those outside the Core Agent text path.

Outgoing translation:

- Outgoing response translation is documented in section 31.

## 31. Outgoing Response Translation

Shared integration point:

- Outgoing response translation is integrated once in `src/modules/core-agent/core-agent.service.js`.
- Web Chat, Telegram, WhatsApp, and LINE continue to receive replies from the shared `coreAgentService.processWebMessage(...)` result.
- Channel-specific outgoing translation logic was not added.

Core Agent response language:

- Core Agent business logic and response generation continue to use English as the internal response language.
- The Core Agent working language remains `en`.

Flow:

```text
Core Agent builds original English reply
-> Existing CRM/history writes keep the English answer where that path already persists answers
-> Shared outgoing translation checks resolved user language
-> If target language is en, delivery skips provider call
-> If target language is not en, Translation service attempts en -> target language
-> On success, reply becomes deliveryResponse
-> On failure, reply falls back to original English response
-> Channel delivers the shared Core Agent reply
```

Internal response values:

- `originalResponse`: the unchanged English Core Agent response.
- `deliveryResponse`: the translated response when translation succeeds, otherwise the English response.
- Internal outgoing metadata includes `sourceLanguage`, `targetLanguage`, `translated`, `provider`, and `fallbackUsed`.
- Metadata is stored as a non-enumerable internal property on the response object and is not included in normal JSON responses.

Structured-content protection:

- The outgoing translation flow protects common URLs, codes, technical identifiers, dates, phone-like numbers, and money amounts with temporary placeholders before translation, then restores the original values.
- Only the user-visible `reply` text is translated; module payload fields such as jobs, housing, money results, documents, services, and CRM objects are left unchanged.
- Empty responses skip translation.
- Same-language English responses skip translation.

Safe fallback behavior:

- Translation provider failures do not block delivery.
- When translation is unavailable or fails, Gringo sends the original English response.
- Full response content and secrets are not logged by this flow.

## 32. Translation Cache

Core files:

- `src/modules/translation/translation-cache.service.js`
- `src/modules/translation/translation.service.js`

Purpose:

- The Translation cache reduces repeated provider requests for identical translations.
- The cache is centralized inside the Translation module and is transparent to Core Agent and channel modules.
- Core Agent logic, channel behavior, and provider adapters are not changed by callers.

Cache key:

```text
original text + source language + target language
```

Behavior:

- Successful provider translations are cached in memory.
- A second identical request returns the cached structured translation result and does not call the provider again.
- Different source or target languages miss the cache.
- Empty text, provider errors, failed translations, fallback results, and unavailable-provider results are not cached.
- Expired entries are removed on read and refreshed by the next provider call.

Configuration names:

- `TRANSLATION_CACHE_ENABLED`: optional; default behavior is enabled.
- `TRANSLATION_CACHE_TTL_MINUTES`: optional; default behavior is 60 minutes.

Persistence:

- The cache is in-memory only.
- Cache contents do not survive process restart.

## 33. Translation Metrics

Core files:

- `src/modules/translation/translation-metrics.service.js`
- `src/modules/translation/translation.service.js`
- `src/modules/admin/admin.service.js`
- `src/modules/manager-agent/manager-agent.service.js`

Collected metrics:

- Translation requests.
- Successful translations.
- Failed translations.
- Cache hits.
- Cache misses.
- Average translation latency.
- Average provider latency.

Behavior:

- Metrics are collected inside the central Translation service.
- Metrics are exposed to existing Admin overview and Manager daily report data.
- Metrics are not exposed in user-facing Web Chat responses or channel replies.
- Metrics snapshots contain counters and timing only.

Privacy:

- Original text is not stored in metrics.
- Translated text is not stored in metrics.
- Credentials and provider error bodies are not stored in metrics.

## 34. Sprint 23 Completion Note

Sprint 23 added a central language and translation layer without changing channel-specific business logic.

Confirmed scope:

- Supported language detection and normalization for `en`, `he`, `ar`, `th`, `si`, `hi`, `ru`, and `tl`.
- Persistent profile language fields and CRM language preference methods.
- Existing profile API support for reading and updating `preferredLanguage`.
- Web Chat language selector with Auto mode.
- Central incoming translation before Core Agent intent routing, with English as the Core Agent working language.
- Central outgoing translation after Core Agent response generation and before delivery.
- Provider-agnostic translation service with OpenAI provider adapter and disabled fallback provider.
- In-memory translation cache, translation metrics, recovery behavior, and Admin translation overview/settings controls.

Production-readiness validation is documented in `SPRINT_23_READINESS.md`.

Known validation limits:

- Local `npm test` was not available because `npm` was not present in the current PATH.
- The local Node test runner could not run as a suite in this environment because subprocess spawning returned `EPERM`; individual test files were run directly with the bundled Node runtime.
- API tests that require `express` could not complete because `node_modules` was not installed in the current workspace snapshot.

## 35. Short-Term Conversation Memory

Core files:

- `src/modules/memory/conversation-memory.service.js`
- `src/modules/memory/memory.constants.js`
- `src/modules/memory/memory.interface.js`
- `src/modules/memory/index.js`

Purpose:

- The Memory module provides a central short-term conversation-memory service.
- It stores recent chat messages by `conversationId`.
- It is in-memory only for Sprint 24.1-1.
- It is not integrated with Core Agent, Web Chat, Telegram, WhatsApp, or LINE yet.

Message shape:

```text
{
  role: "user | assistant | system",
  content: "...",
  timestamp: "ISO date",
  metadata: {}
}
```

Storage behavior:

- Empty message content is ignored.
- Message order is preserved.
- The maximum stored message count is configurable with `CONVERSATION_MEMORY_MAX_MESSAGES`.
- The default maximum is 20 messages.
- When the limit is exceeded, the oldest messages are removed first.
- `CONVERSATION_MEMORY_ENABLED` controls whether the service stores messages; the default is enabled.

Safety:

- The service does not write to Google Sheets, local files, or external storage.
- Sensitive metadata keys such as tokens, API keys, credentials, passwords, private keys, and provider errors are filtered before storage.
- Common secret-like text patterns are redacted from message content.
- The summary method returns counts and timestamps, not a generated natural-language summary.

## 36. Memory Context Manager

Core files:

- `src/modules/memory/context-manager.service.js`
- `src/modules/memory/conversation-memory.service.js`
- `src/modules/core-agent/core-agent.service.js`

Purpose:

- The Context Manager prepares recent short-term conversation context for internal Core Agent processing.
- It uses the in-memory Conversation Memory service from Sprint 24.1-1.
- It does not add persistent memory.
- It does not add conversation summarization.
- It does not change business intent routing or user-facing response behavior.

Context output:

```text
{
  conversationId,
  messages: [],
  messageCount: 0,
  truncated: false,
  estimatedSize: 0
}
```

Selection behavior:

- Preserves chronological order.
- Prefers recent messages when limits are exceeded.
- Includes user and assistant messages.
- Ignores empty messages.
- Excludes system messages marked with `metadata.internalOnly === true`.
- Removes sensitive metadata and channel-specific metadata from returned context messages.
- Does not mutate stored memory objects.

Limits:

- `CONTEXT_MANAGER_ENABLED`: optional; default behavior is enabled.
- `CONTEXT_MAX_MESSAGES`: optional; default behavior is 12 messages.
- `CONTEXT_MAX_CHARACTERS`: optional; default behavior is 12000 characters.
- When limits are exceeded, the oldest messages are removed first.
- The current user message is preserved when supplied.
- Truncated contexts set `truncated` to true.

Core Agent integration:

- The existing Core Agent conversation identifier remains `channel:channelUserId`.
- `processWebMessage` builds `conversationContext` with the Context Manager and attaches it to `userContext` and the internal message context.
- AI-provider calls receive the new `conversationContext` while the existing `recentConversation` field remains unchanged.
- If the Context Manager or Memory service fails, Core Agent receives a safe empty context.

## 37. Conversation Summarization

Core files:

- `src/modules/memory/conversation-summary.service.js`
- `src/modules/memory/conversation-memory.service.js`
- `src/modules/memory/context-manager.service.js`

Purpose:

- The Conversation Summary service creates and stores internal structured summaries for long short-term conversations.
- Summaries are stored separately from original conversation messages.
- Original messages are not overwritten or deleted by summary creation or refresh.
- The service is exposed through the Memory module for future use.
- Core Agent reasoning and user-facing responses are not changed in Sprint 24.1-3.

Summary structure:

```text
{
  summary: "...",
  createdAt: "...",
  updatedAt: "...",
  messageCount: 0,
  version: 1
}
```

Summary strategy:

- Uses deterministic rule-based extraction.
- Keeps important user goals, open tasks, completed tasks, decisions, important facts, and preferences discovered in the conversation.
- Ignores greetings, small talk, duplicate messages, retry/error messages, and internal system messages.
- Enforces a maximum summary size with `SUMMARY_MAX_CHARACTERS`.

Trigger rules:

- `createSummary(conversationId)` explicitly creates a summary from available memory.
- `updateSummary(conversationId)` refreshes when the summary is missing, when stored messages exceed `SUMMARY_TRIGGER_MESSAGES`, or when the Context Manager reports truncation.
- `updateSummary(conversationId, { force: true })` supports explicit internal refresh.
- The service does not summarize after every message.

Configuration:

- `CONVERSATION_SUMMARY_ENABLED`: optional; default behavior is enabled.
- `SUMMARY_TRIGGER_MESSAGES`: optional; default behavior is 20 messages.
- `SUMMARY_MAX_CHARACTERS`: optional; default behavior is 2500 characters.

Storage:

- Summary storage is in-memory only.
- Summary storage is separate from conversation history and short-term message storage.
- No Google Sheets, file, or external persistence is added for summaries in Sprint 24.1-3.

## 38. Structured Memory Snapshot

Core files:

- `src/modules/memory/memory-snapshot.service.js`
- `src/modules/memory/conversation-memory.service.js`
- `src/modules/memory/context-manager.service.js`
- `src/modules/memory/conversation-summary.service.js`
- `src/modules/core-agent/core-agent.service.js`

Purpose:

- The Memory Snapshot service creates an internal structured snapshot for each conversation.
- It builds from the current Conversation Summary and recent Context Manager messages.
- Snapshots are internal only and are not shown to users.
- Snapshots do not replace original messages or summaries.
- Snapshots are in-memory only in Sprint 24.1-4.
- No multi-agent orchestration is added.

Snapshot structure:

```text
{
  version: 1,
  conversationId,
  conversationState,
  lastIntent,
  userGoals: [],
  openTasks: [],
  completedTasks: [],
  importantFacts: [],
  preferences: {},
  importantEntities: [],
  pendingQuestions: [],
  freeTextSummary: "",
  updatedAt: ""
}
```

Conversation state:

- Supported states are `idle`, `active`, `waiting_for_user`, `finding_job`, `housing_search`, `collecting_documents`, `money_support`, `service_support`, and `completed`.
- Missing conversation data defaults to `idle`.
- Unknown states fall back safely to `active`.
- Basic state inference is intentionally shallow: empty conversations are idle, assistant questions may indicate `waiting_for_user`, completed/found wording may indicate `completed`, and otherwise active conversations are `active`.
- Complex workflow-state inference is not implemented yet.

Structured fields:

- Snapshot arrays remove duplicate values and ignore empty values.
- Partial updates preserve existing fields.
- Preferences are merged during partial updates.
- Sensitive keys, credentials, raw errors, and channel metadata are filtered out.
- Input objects, original memory messages, and summaries are not mutated.

Core Agent internal access:

- `processWebMessage` builds a snapshot using the existing conversation identifier `channel:channelUserId`.
- The snapshot is attached to `userContext.memorySnapshot` and the internal message context.
- AI-provider calls receive `memorySnapshot` alongside `conversationContext` and existing `recentConversation`.
- Core Agent business routing and user-facing responses are unchanged in Sprint 24.1-4.

## 39. Working Memory

Core files:

- `src/modules/memory/working-memory.service.js`
- `src/modules/memory/memory-snapshot.service.js`
- `src/modules/core-agent/core-agent.service.js`

Purpose:

- Working Memory stores active conversation-scoped work that may support future task coordination.
- It is internal only and is not shown to users.
- It does not add persistent storage.
- It does not add multi-agent orchestration or task execution.
- It does not change Core Agent business routing or user-facing responses.

Working-memory structure:

```text
{
  conversationId,
  activeTasks: [],
  intermediateResults: [],
  dependencies: [],
  pendingActions: [],
  blockers: [],
  updatedAt: ""
}
```

Task structure:

```text
{
  taskId,
  type,
  status,
  input,
  assignedTo,
  createdAt,
  updatedAt
}
```

Task statuses:

- `pending`
- `in_progress`
- `waiting`
- `completed`
- `failed`
- `cancelled`

Task lifecycle behavior:

- `createTask` generates a `taskId` when one is not supplied.
- `updateTask` preserves unrelated task fields during partial updates.
- Unknown statuses are rejected.
- Completed and cancelled tasks are retained internally for lookup/history but are removed from `activeTasks`.
- Conversations remain isolated by `conversationId`.

Intermediate results, dependencies, and blockers:

- Intermediate results are appended after sanitization.
- Dependencies and blockers are deduplicated where possible.
- Pending actions are deduplicated where possible.
- Secrets, credentials, raw provider errors, and channel metadata are filtered before storage.
- Input objects are not mutated.

Snapshot integration:

- Structured Memory Snapshot uses Working Memory as the source for `openTasks`, `completedTasks`, `pendingActions`, and `blockers`.
- Existing snapshot fields remain present.

Core Agent internal access:

- `processWebMessage` reads Working Memory using the existing conversation identifier `channel:channelUserId`.
- Working Memory is attached to `userContext.workingMemory` and the internal message context.
- AI-provider calls receive `workingMemory` alongside `conversationContext`, `memorySnapshot`, and existing `recentConversation`.

## 40. Memory Lifecycle Manager

Core files:

- `src/modules/memory/memory-lifecycle.service.js`
- `src/modules/memory/working-memory.service.js`
- `src/modules/memory/conversation-summary.service.js`
- `src/modules/memory/memory-snapshot.service.js`
- `src/modules/core-agent/core-agent.service.js`

Purpose:

- The Memory Lifecycle Manager coordinates the lifecycle of in-memory conversation state.
- It is internal only.
- It does not add persistent storage.
- It does not add multi-agent orchestration.
- It does not change user-facing responses or business intent behavior.

Lifecycle states:

- `new`
- `active`
- `waiting`
- `idle`
- `archived`
- `closed`

Responsibilities:

- Initialize new conversation lifecycle records.
- Touch active conversations after requests.
- Refresh summaries through the Conversation Summary service when needed.
- Refresh snapshots through the Structured Memory Snapshot service when needed.
- Run safe cleanup through Working Memory.
- Move inactive conversations to `idle`.
- Archive inactive conversations.
- Close conversations explicitly.

Configuration:

- `MEMORY_IDLE_MINUTES`: optional; default behavior is 30 minutes.
- `MEMORY_ARCHIVE_HOURS`: optional; default behavior is 24 hours.
- `MEMORY_CLEANUP_ENABLED`: optional; default behavior is enabled.

Cleanup strategy:

- Cleanup is scoped to one conversation.
- Expired or obsolete intermediate results can be removed.
- Completed or cancelled temporary working-memory tasks can be removed.
- Active tasks are preserved.
- Current snapshots are preserved.
- Latest summaries are preserved.
- Original conversation messages are preserved.

Archive strategy:

- `archiveConversation` can archive when forced or when `lastActivityAt` is older than the configured archive window.
- Archived conversations are not revived by normal `touchConversation` calls.
- `closeConversation` marks the lifecycle record as `closed`.

Core Agent notification model:

- Core Agent does not contain lifecycle decision logic.
- `processWebMessage` calls `memoryLifecycleService.notifyRequestCompleted` after a response is assembled.
- The lifecycle manager decides whether to touch, refresh summary, refresh snapshot, and cleanup.
- Lifecycle failures are caught and never interrupt user requests.

## 41. Multi-Agent Foundation

Core files:

- `src/config/agents.js`
- `src/modules/agents/index.js`
- `src/modules/agents/registry/agent-registry.service.js`
- `src/modules/agents/contracts/agent.interface.js`
- `src/modules/agents/contracts/task.contract.js`
- `src/modules/agents/contracts/result.contract.js`
- `src/modules/agents/domains/employment-salary.agent.js`
- `src/modules/agents/domains/finance-consumer.agent.js`
- `src/modules/agents/domains/health-life-community.agent.js`

Purpose:

- The agents module provides internal contracts and a registry for future domain agents.
- It does not change current chat behavior.
- It does not add routing, orchestration, approvals, workflows, or additional LLM calls.
- Registered domain agents expose metadata only.

Configuration:

- `MULTI_AGENT_ENABLED`: optional; default behavior is disabled.
- `DEFAULT_AGENT_VERSION`: optional; default behavior is version `1`.

Agent Registry:

- `AgentRegistryService.registerAgent(agent)` validates and registers an agent.
- `getAgent(agentId)` retrieves one registered agent.
- `listAgents()` returns all registered agents.
- `hasAgent(agentId)` checks whether an agent is registered.
- Duplicate agent ids are rejected.
- Duplicate domains are rejected.
- Registered values are copied so callers cannot mutate registry state directly.

Agent Interface:

Every future domain agent must expose:

- `id`
- `name`
- `version`
- `domain`
- `capabilities`
- `initialize()`
- `health()`
- `execute(task)`
- `validate(task)`

Task Contract:

Task objects use:

```text
{
  taskId,
  conversationId,
  requestId,
  domain,
  capability,
  priority,
  input,
  metadata,
  createdAt
}
```

Allowed task priorities:

- `low`
- `normal`
- `high`
- `urgent`

Result Contract:

Result objects use:

```text
{
  taskId,
  status,
  output,
  factsLearned,
  suggestedProfileUpdates,
  followUpQuestions,
  warnings,
  completedAt
}
```

Allowed result statuses:

- `success`
- `partial`
- `failed`
- `blocked`

Registered domain-agent metadata:

- Employment & Salary: domain `employment_salary`; capabilities `jobs.search`, `jobs.match`, `jobs.salary`, `employment.documents`, `employment.support`.
- Finance & Consumer: domain `finance_consumer`; capabilities `finance.budget`, `finance.transfer`, `finance.bank`, `consumer.compare`, `consumer.services`.
- Health, Life & Community: domain `health_life_community`; capabilities `health.support`, `housing.support`, `community.support`, `government.services`, `life.general`.

Registration flow:

- `src/modules/agents/index.js` creates a default registry.
- The default registry registers the three metadata-only domain agents automatically.
- No existing business module calls these agents.
- No Core Agent routing to this registry is implemented in this sprint.

## 42. Supervisor Request Context

Core files:

- `src/modules/agents/supervisor/supervisor.service.js`
- `src/modules/agents/index.js`

Purpose:

- The Supervisor service currently creates a normalized internal request context for future Supervisor work.
- It does not create plans.
- It does not route requests.
- It does not execute domain agents.
- It does not call an LLM.
- It is exported from the agents module but is not integrated into Core Agent processing.

Request-context schema:

```text
{
  requestId,
  conversationId,
  userId,
  message,
  detectedLanguage,
  preferredLanguage,
  memorySnapshot,
  workingMemory,
  recentContext,
  metadata,
  createdAt
}
```

Required fields:

- `requestId`
- `conversationId`

Safe defaults:

- `userId`: `null`
- `message`: empty string
- `detectedLanguage`: `null`
- `preferredLanguage`: `null`
- `memorySnapshot`: `null`
- `workingMemory`: `null`
- `recentContext`: empty array
- `metadata`: empty object
- `createdAt`: current ISO timestamp

Normalization:

- `requestId` and `conversationId` are converted to trimmed strings and rejected when empty.
- `message` is converted to a string and trimmed.
- Invalid `recentContext` values are replaced with an empty array.
- Invalid `metadata` values are replaced with an empty object.
- Plain-object `memorySnapshot` and `workingMemory` values are preserved as copied objects.
- The original input object is not mutated.

Sensitive metadata filtering:

- The Supervisor request context removes metadata keys matching `accessToken`, `refreshToken`, `password`, `authorization`, `apiKey`, `credentials`, and `rawProviderError`.
- Filtering is case-insensitive.
- The service does not log the full user message.

Current limitation:

- Supervisor planning, domain routing, agent execution, workflow orchestration, approval handling, and persistent Supervisor storage are not implemented.

## 43. Supervisor Draft Plan

Core file:

- `src/modules/agents/supervisor/supervisor.service.js`

Purpose:

- `SupervisorService.createPlan(requestContext)` creates a draft plan object for future Supervisor workflows.
- The method is internal and is not called by Core Agent.
- It does not perform routing.
- It does not create agent tasks.
- It does not execute domain agents.
- It does not call an LLM.
- It does not persist plans.

Required input:

- `requestId`
- `conversationId`

Draft-plan structure:

```text
{
  planId,
  requestId,
  conversationId,
  requestType: "unknown",
  primaryDomain: null,
  secondaryDomains: [],
  tasks: [],
  requiresUserInput: false,
  missingInformation: [],
  requiresApproval: false,
  urgency: "normal",
  status: "draft",
  createdAt,
  updatedAt
}
```

Default behavior:

- `planId` is generated with Node's built-in random UUID support.
- `requestId` and `conversationId` are preserved after trimming.
- `createdAt` is a new ISO timestamp.
- `updatedAt` initially equals `createdAt`.
- `tasks` is always empty in this sprint.
- `primaryDomain` is `null`.
- `secondaryDomains` is empty.
- `status` is `draft`.

Current limitations:

- Persistent plan storage is not implemented.
- Plan lookup, replacement, and clearing are available only in memory.
- Domain detection and keyword routing are not implemented.
- Agent execution and approval workflows are not implemented.

## 44. Supervisor Plan Validation

Core file:

- `src/modules/agents/supervisor/supervisor.service.js`

Purpose:

- `SupervisorService.validatePlan(plan)` validates the basic shape and allowed values of a Supervisor draft plan.
- It returns a safe validation result instead of throwing for normal validation failures.
- It does not validate task contracts.
- It does not perform domain detection.
- It does not route requests.
- It does not execute agents.
- It does not persist plans.

Validation result:

```text
{
  valid: true | false,
  errors: []
}
```

Required plan fields:

- `planId`
- `requestId`
- `conversationId`
- `requestType`
- `secondaryDomains`
- `tasks`
- `requiresUserInput`
- `missingInformation`
- `requiresApproval`
- `urgency`
- `status`

Allowed request types:

- `unknown`
- `simple`
- `multi_domain`
- `workflow`
- `urgent`

Allowed domains:

- `employment_salary`
- `finance_consumer`
- `health_life_community`
- `null` for `primaryDomain`

Allowed urgency values:

- `low`
- `normal`
- `high`
- `urgent`

Allowed plan statuses:

- `draft`
- `ready`
- `waiting_for_user`
- `waiting_for_approval`
- `completed`
- `failed`

Validation rules:

- Required identifiers must not be empty.
- `primaryDomain` must be valid or `null`.
- `secondaryDomains` must be an array of valid domains.
- `secondaryDomains` must not contain duplicates.
- `primaryDomain` must not also appear in `secondaryDomains`.
- `tasks` must be an array.
- `missingInformation` must be an array.
- `requiresUserInput` must be boolean.
- `requiresApproval` must be boolean.

Current limitations:

- Task contract validation is not performed by `validatePlan`.
- Persistent plan storage, routing, task creation, agent execution, and LLM-based planning are not implemented.

## 45. Supervisor Plan Storage

Core file:

- `src/modules/agents/supervisor/supervisor.service.js`

Purpose:

- `SupervisorService.storePlan(plan)` stores a validated Supervisor plan in memory.
- `getPlan(requestId)` retrieves one stored plan by `requestId`.
- `clearPlan(requestId)` removes one stored plan by `requestId`.
- Storage is internal and is not integrated with Core Agent.

Storage behavior:

- Plans are stored in memory by `requestId`.
- Only one plan is stored per `requestId`.
- Storing a new valid plan with the same `requestId` replaces the previous one.
- Plans with different `requestId` values remain isolated.
- `getPlan()` returns `null` when a plan does not exist.
- `clearPlan()` succeeds even when a plan does not exist.

Validation before storage:

- `storePlan(plan)` calls `validatePlan(plan)` before storing.
- Invalid plans are not stored.
- Invalid plans return:

```text
{
  stored: false,
  errors: [...]
}
```

- Valid plans return:

```text
{
  stored: true,
  errors: []
}
```

Defensive copies:

- `storePlan()` stores a copy of the provided plan.
- `getPlan()` returns a copy of the stored plan.
- Mutating the original plan after storage does not change the stored plan.
- Mutating a retrieved plan does not change the stored plan.

Current limitations:

- Plan storage is in-memory only.
- Plans are lost on process restart.
- Persistent database storage, domain detection, routing, task execution, workflow logic, approval logic, agent execution, and LLM calls are not implemented.

## 46. Core Agent Supervisor Integration

Core files:

- `src/modules/core-agent/core-agent.service.js`
- `src/modules/agents/supervisor/supervisor.service.js`
- `src/config/agents.js`

Purpose:

- Core Agent can create and store a draft Supervisor plan for each request when Supervisor integration is explicitly enabled.
- The integration is internal only.
- It does not change user-facing responses.
- It does not affect routing or intent handling.
- It does not execute domain agents.
- It does not add LLM calls.

Feature flags:

- `MULTI_AGENT_ENABLED`: default `false`.
- `SUPERVISOR_ENABLED`: default `false`.
- Supervisor integration runs only when both flags are `true`.
- When either flag is `false`, the existing Core Agent behavior remains unchanged.

Integration point:

- `processWebMessage` builds the existing conversation context, memory snapshot, and working memory.
- The Core Agent then calls the Supervisor service only when both feature flags are enabled.
- The Supervisor creates a request context, creates a draft plan, validates it, stores it in memory, and returns the stored plan.

Internal attachment:

- The stored plan is attached to internal context as `messageContext.supervisorPlan` and `userContext.supervisorPlan`.
- The plan is not included in the user-facing response object.

Failure isolation:

- Supervisor failures are caught inside Core Agent processing.
- Failures log a short safe warning.
- User responses continue normally.
- Supervisor failures are not exposed to users.

Current limitations:

- Domain routing is not implemented.
- Domain selection is not implemented.
- Task creation is not implemented.
- Domain Agent execution is not implemented.
- Multi-domain workflows and approval logic are not implemented.
- Plan storage remains in-memory only.

## 47. Supervisor Rule-Based Primary Domain Detection

Core file:

- `src/modules/agents/supervisor/supervisor.service.js`

Purpose:

- `SupervisorService.detectPrimaryDomain(requestContext)` classifies a request into one primary business domain using simple keyword rules.
- The classifier reads `requestContext.message`.
- The classifier is deterministic and does not use an LLM, embeddings, vector search, routing, or agent execution.

Supported domains:

- `employment_salary`
- `finance_consumer`
- `health_life_community`

Keyword dictionaries:

- Employment & Salary: `salary`, `job`, `employer`, `worker`, `contract`, `payroll`, `construction`, `work permit`, `vacation`, `dismissal`.
- Finance & Consumer: `bank`, `payment`, `credit card`, `loan`, `budget`, `shopping`, `invoice`, `transfer`, `insurance`.
- Health, Life & Community: `doctor`, `hospital`, `clinic`, `medicine`, `health`, `apartment`, `housing`, `municipality`, `government`, `community`.

Matching behavior:

- Matching ignores case.
- Duplicate keyword matches within the same domain count once.
- Each domain receives a keyword-hit score.
- The domain with the highest score is returned.
- If every score is zero, the result is `null`.
- If more than one domain has the highest score, the result is `null`.

Plan update behavior:

- `createPlan(requestContext)` calls `detectPrimaryDomain(requestContext)`.
- When a primary domain is detected, `plan.primaryDomain` is set to that domain.
- When no domain is detected or a tie occurs, `plan.primaryDomain` remains `null`.
- `tasks` remains empty.

Current limitations:

- Domain routing is not implemented.
- Task creation is not implemented.
- Domain Agent execution is not implemented.
- Persistent storage, LLM classification, embeddings, and vector search are not implemented.

## 48. Supervisor Secondary Domain Detection

Core file:

- `src/modules/agents/supervisor/supervisor.service.js`

Purpose:

- `SupervisorService.detectSecondaryDomains(requestContext)` identifies additional business domains that also match the request.
- The method reuses the same keyword dictionaries as primary-domain detection.
- It reads `requestContext.message` and the detected or supplied `primaryDomain`.
- It performs classification only.

Detection behavior:

- A domain can become secondary only when it has at least one keyword match.
- The primary domain is never included in `secondaryDomains`.
- Duplicate keyword hits do not create duplicate domains.
- Ordering is deterministic and follows the configured domain order.
- At most two secondary domains are returned.
- If no other domain matches, the result is an empty array.

Plan update behavior:

- `createPlan(requestContext)` sets `plan.secondaryDomains` from `detectSecondaryDomains(requestContext)`.
- No other plan fields are changed by secondary-domain detection.
- `tasks` remains empty.

Current limitations:

- Secondary-domain detection does not perform routing.
- It does not calculate priority.
- It does not create tasks.
- It does not execute domain agents.
- It does not use LLM classification, embeddings, vector search, or persistent storage.

## 49. Supervisor Routing Decision

Core file:

- `src/modules/agents/supervisor/supervisor.service.js`

Purpose:

- `SupervisorService.createRoutingDecision(plan)` decides which domains are target domains for future handling.
- It uses only `plan.primaryDomain` and `plan.secondaryDomains`.
- It returns a routing decision object.
- It does not execute domain agents.
- It does not create tasks.
- It does not orchestrate workflows.
- It does not change user-facing responses.

Routing-decision structure:

```text
{
  routeType,
  targetDomains
}
```

Route types:

- `none`: no primary domain exists.
- `single_domain`: only the primary domain is targeted.
- `multi_domain`: the primary domain plus at least one secondary domain are targeted.

Target-domain ordering:

- `primaryDomain` appears first.
- Secondary domains follow in deterministic order.
- Duplicate domains are removed.
- The result is capped at three target domains.

Plan update behavior:

- `createPlan(requestContext)` attaches the returned decision as `plan.routingDecision`.
- No agent is invoked when this field is created.
- `tasks` remains empty.

Current limitations:

- Routing decisions are descriptive only.
- Domain Agent execution is not implemented.
- Task creation is not implemented.
- Workflow orchestration, result merging, approvals, fallback questions, LLM routing, and persistent routing storage are not implemented.

## 50. Unknown Domain Fallback

Core file:

- `src/modules/agents/supervisor/supervisor.service.js`

Purpose:

- `SupervisorService.applyUnknownDomainFallback(plan)` marks plans that have no detected business domain as needing clarification.
- The method operates only on Supervisor plan state.
- It does not generate or send a user-facing question.
- It does not select a default domain.
- It does not create tasks.
- It does not execute domain agents.

Fallback condition:

- The fallback applies when `plan.routingDecision.routeType` is `none`.

Plan fields updated:

- `requiresUserInput`: `true`
- `status`: `waiting_for_user`
- `missingInformation`: `["business_domain"]`

Routed-plan behavior:

- If a routing decision exists, the method returns the plan content unchanged.
- Unrelated fields such as identifiers, timestamps, urgency, approvals, tasks, and routing details are preserved.

Create-plan behavior:

- `createPlan(requestContext)` applies the unknown-domain fallback after primary-domain detection, secondary-domain detection, and routing-decision creation.

Current limitations:

- Clarification-question delivery is not implemented.
- Chat response changes are not implemented.
- Task creation, agent execution, LLM fallback, default-domain selection, and persistent storage changes are not implemented.

## 51. Clarification Question Builder

Core file:

- `src/modules/agents/supervisor/supervisor.service.js`

Purpose:

- `SupervisorService.buildClarificationQuestion(plan)` builds an internal clarification question when the Supervisor cannot detect a business domain.
- It does not send the question to the user.
- It does not change chat responses.
- It does not handle user answers.
- It does not call an LLM.
- It does not execute domain agents.

Creation rule:

- A question is created only when `plan.requiresUserInput` is `true` and `plan.missingInformation` includes `business_domain`.
- Otherwise the method returns `null`.

Question structure:

```text
{
  type: "business_domain",
  question: "Which area do you need help with?",
  options: [
    {
      value: "employment_salary",
      label: "Employment & Salary"
    },
    {
      value: "finance_consumer",
      label: "Finance & Consumer"
    },
    {
      value: "health_life_community",
      label: "Health, Life & Community"
    }
  ]
}
```

Plan attachment:

- When a question is created, it is attached to `plan.clarificationQuestion`.
- No unrelated plan fields are changed.
- The options are copied so callers cannot mutate the fixed option definitions.

Create-plan behavior:

- `createPlan(requestContext)` applies unknown-domain fallback and then builds the clarification question when needed.

Current limitations:

- Clarification response delivery is not implemented.
- Clarification answer handling is not implemented.
- Translated question text is not implemented.
- Domain selection from user answers is not implemented.
- Task creation, routing changes, agent execution, and persistent storage changes are not implemented.

## 52. Supervisor Request Type Detection

Core file:

- `src/modules/agents/supervisor/supervisor.service.js`

Purpose:

- `SupervisorService.detectRequestType(plan)` classifies a Supervisor plan's request type.
- The method uses current plan fields and optional message text.
- It updates only `plan.requestType`.
- It does not create tasks.
- It does not change routing decisions.
- It does not execute domain agents.
- It does not call an LLM.

Supported request types:

- `unknown`
- `simple`
- `multi_domain`
- `workflow`
- `urgent`

Classification rules:

- If urgent keywords are present, the result is `urgent`.
- If workflow keywords are present, the result is `workflow`.
- If no primary domain exists, the result is `unknown`.
- If a primary domain exists and secondary domains are present, the result is `multi_domain`.
- If a primary domain exists and there are no secondary domains, the result is `simple`.

Priority order:

1. `urgent`
2. `workflow`
3. `multi_domain`
4. `simple`
5. `unknown`

Keyword dictionaries:

- Workflow keywords: `create`, `build`, `setup`, `process`, `automate`, `configure`, `migration`, `project`, `implement`.
- Urgent keywords: `urgent`, `immediately`, `asap`, `emergency`, `critical`.

Create-plan behavior:

- `createPlan(requestContext)` detects primary domain, secondary domains, routing decision, and then request type.
- Unknown-domain fallback and clarification-question building still run after request-type detection.

Current limitations:

- Workflow planning is not implemented.
- Priority engine behavior beyond request-type classification is not implemented.
- Task planning, routing changes, Domain Agent execution, persistent storage changes, and Core Agent behavior changes are not implemented.

## 53. Finance & Consumer Agent Live Execution

Core file:

- `src/modules/agents/domains/finance-consumer.agent.js`

Purpose:

- The Finance & Consumer Agent supports the first read-only finance and consumer domain execution path.
- It executes only the domain capabilities listed on the agent.
- It reuses existing Gringo modules rather than duplicating money, services, knowledge, or profile logic.
- It does not add multi-agent orchestration or change Health, Life & Community behavior.

Supported capabilities:

- `finance.budget`
- `finance.transfer`
- `finance.bank`
- `consumer.compare`
- `consumer.services`

Existing modules reused:

- Money service for transfer comparison, best-option data, demo notices, and safety notices.
- Services service for consumer service search, matching, and formatting.
- Knowledge Agent for banking and consumer comparison knowledge.
- CRM/Profile read service for optional profile context.

Read-only behavior:

- The agent reads available profile context when a `userId` is supplied.
- The agent can compare transfer providers using existing demo/fallback Money module data.
- The agent can search matching services using the existing Services module.
- The agent can answer banking or comparison questions only through the existing Knowledge Agent.

Blocked behavior:

- Unsupported capabilities return a blocked result with `unsupported_capability`.
- Missing required input returns a blocked result with `missing_required_input` and one focused follow-up question.
- Banking or comparison requests without a reliable Knowledge Agent answer return a blocked result with `no_reliable_implementation`.

Safety:

- The agent does not move money.
- The agent does not initiate transfers.
- The agent does not open bank accounts.
- The agent does not take loans.
- The agent does not purchase products or services.
- The agent does not contact providers.
- The agent does not update the user profile automatically.
- The agent does not use live prices unless already provided by existing verified modules.
- The agent does not add new LLM calls.

## 54. Health, Life & Community Agent Live Execution

Core file:

- `src/modules/agents/domains/health-life-community.agent.js`

Purpose:

- The Health, Life & Community Agent supports read-only execution for health, housing, community, government-service, and general life-support requests.
- It reuses existing Gringo modules and does not duplicate housing, community, services, documents, knowledge, or profile logic.
- It does not add multi-agent orchestration or change Employment or Finance agent behavior.

Supported capabilities:

- `health.support`
- `housing.support`
- `community.support`
- `government.services`
- `life.general`

Existing modules reused:

- Housing service for active listings, matching, chat formatting, and housing safety notices.
- Community service for published and relevant posts.
- Services service for medical, government, and general service lookup.
- Documents service for read-only document summaries in general life-support flows.
- Knowledge Agent for health, government, and general guidance when existing knowledge is available.
- CRM/Profile read service for optional user context.

Read-only behavior:

- The agent reads profile context only when a `userId` is supplied or profile data is passed in task input.
- Housing results are limited to a maximum of five listings.
- Community results are limited to a maximum of five posts.
- Government-service answers use existing Services data first, then existing Knowledge Agent data.
- Document-related general-life requests read and summarize documents without changing them.

Blocked behavior:

- Unsupported capabilities return a blocked result with `unsupported_capability`.
- Missing required input returns a blocked result with `missing_required_input` and one focused follow-up question.
- Government-service or broad life requests without reliable existing data return a blocked result with `no_reliable_implementation`.

Medical and legal safety boundaries:

- The agent does not diagnose medical conditions.
- The agent does not prescribe medication or treatment.
- Urgent medical wording returns a warning and a focused emergency next step.
- The agent does not invent legal or government procedures.
- The agent does not contact clinics, landlords, government offices, or community members.
- The agent does not submit forms.
- The agent does not change documents.
- The agent does not update the user profile automatically.
- The agent does not send notifications.
- The agent does not add new LLM calls.

## 55. Multi-Agent Sequential Execution

Core file:

- `src/modules/agents/supervisor/supervisor.service.js`

Purpose:

- `SupervisorService.executePlanTasks(plan)` executes assigned plan tasks in sequence.
- It is an internal execution primitive only.
- It does not change chat behavior and does not aggregate a final user response.

Execution behavior:

- Reads `plan.tasks` in stored order.
- Executes only tasks with `status: "pending"`.
- Skips tasks that are already `completed`, `blocked`, `failed`, or `cancelled`.
- Executes each pending task through the existing single-task execution method, `executeAgent(task)`.
- Waits for one task to finish before starting the next.
- Returns a new plan object and does not mutate the original plan.

Failure isolation:

- A failed task is preserved with its failed result and error message.
- Later independent pending tasks still execute.
- No retry behavior is implemented in this sprint.
- A failed task is not executed again on the same call.

Final plan-status rules:

- `completed` when all non-cancelled tasks are completed.
- `partial` when at least one task completed and another task failed or blocked.
- `failed` when all executable pending tasks failed.
- `waiting_for_user` when all remaining tasks are blocked.
- `ready` is preserved as the fallback when no terminal rule applies.

Current limitations:

- No parallel execution.
- No result aggregation.
- No final user-facing response assembly.
- No new LLM calls.
- No profile changes, messages, notifications, or external actions are triggered by `executePlanTasks` itself.

## 56. Result Aggregation

Core file:

- `src/modules/agents/supervisor/supervisor.service.js`

Purpose:

- `SupervisorService.aggregatePlanResults(plan)` combines existing Domain Agent task results into one structured internal aggregate.
- It reads `plan.tasks` and includes only tasks that already have a `result`.
- It does not execute tasks, retry tasks, generate a final user-facing response, or change channel behavior.

Aggregated result shape:

```text
{
  planId,
  status,
  domainResults,
  combinedFacts,
  suggestedProfileUpdates,
  followUpQuestions,
  warnings,
  blockedDomains,
  failedDomains,
  createdAt
}
```

Ordering and duplicate handling:

- `domainResults` preserves the original task order.
- Each domain result contains `taskId`, `domain`, `status`, and `output`.
- `factsLearned`, `suggestedProfileUpdates`, `followUpQuestions`, and `warnings` are combined from task results.
- Empty values are ignored.
- Exact duplicates are removed while preserving deterministic first-seen order.
- Suggested profile updates are reported only; they are not applied.

Aggregated status rules:

- `completed` when all included tasks completed successfully.
- `partial` when at least one task completed and another failed or blocked.
- `failed` when all included tasks failed.
- `blocked` when all included tasks are blocked.
- `empty` when no task result exists.

Current limitations:

- No user-facing response builder.
- No final prose generation.
- No LLM calls.
- No profile writes.
- No notifications or messages are sent.

## 57. User-Facing Response Builder

Core file:

- `src/modules/agents/supervisor/supervisor.service.js`

Purpose:

- `SupervisorService.buildUserResponse(aggregatedResult, context)` converts a structured Supervisor aggregate into one concise Gringo response.
- It does not execute Domain Agents again.
- It does not send a message or change channel behavior.
- It does not connect the response to the Core Agent active chat path yet.

Response priority order:

1. Main useful result.
2. Important user-safe warning.
3. Missing information.
4. Focused next step.

Status behavior:

- `completed`: presents the useful result clearly and offers a focused next step.
- `partial`: presents completed useful output and briefly says some parts could not be completed.
- `failed`: returns a safe apology and one practical next step.
- `blocked`: asks one focused clarification question.
- `empty`: returns a safe fallback response.

Clarification behavior:

- At most one blocking question is shown.
- Duplicate questions are ignored.
- The first relevant question is preferred.

Safety filtering:

- Agent names, task IDs, plan IDs, internal domains, stack traces, raw errors, suggested profile updates, and internal warning codes are not included in the user response.
- Suggested profile updates are not applied.
- Internal warnings such as unsupported capability, missing required input, unreliable implementation, and execution failure are not shown as raw codes.

Translation:

- The response is composed internally in English.
- Non-English delivery uses the shared `translationService.translateText` outgoing path once.
- Translation source language is English.
- If translation fails or falls back, the English response is returned.

Current limitations:

- Core Agent active Supervisor delivery is not implemented.
- No final chat routing changes are made.
- No LLM calls are added.
