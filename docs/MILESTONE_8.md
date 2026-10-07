# Milestone 8 - Active Supervisor

Sprint 25.0 initializes Milestone 8 as documentation and project organization only. It does not change runtime behavior, business logic, APIs, chat behavior, runtime configuration, or tests.

## Current Architecture

Gringo Community is a Node.js and Express application with a local web UI, API routes, Google Sheets repositories, and internal agent-oriented modules.

Current source structure includes:

- `src/server.js` and `src/app.js` for server startup and Express app wiring.
- `src/public` for the local Web Chat and Admin browser interfaces.
- `src/config` for environment, Google Sheets, and agent feature configuration.
- `src/modules/chat` for Web Chat API routes and profile/chat endpoints.
- `src/modules/core-agent` for message processing, onboarding, personalization, intent handling, translation integration, memory integration, and Supervisor attachment.
- `src/modules/crm-agent` for user profiles, profile language fields, conversation history, and CRM memory extraction.
- `src/modules/knowledge-agent`, `src/modules/content-agent`, and `src/modules/manager-agent` for knowledge lookup, content drafts, reports, and recommendations.
- Business modules for jobs, housing, money, community, services, documents, tasks, and notifications.
- Communication modules for Telegram, WhatsApp, LINE, and shared channel coordination.
- Admin modules for dashboard, human support, translation controls, reports, content/knowledge operations, notifications, tasks, documents, and WhatsApp delivery operations.
- Memory modules for short-term conversation memory, context management, summaries, snapshots, working memory, and lifecycle management.
- Agent modules for registry, contracts, domain agent metadata, and Supervisor planning infrastructure.

Persistence is primarily through Google Sheets repositories where configured. Several newer internal systems, including memory and Supervisor plan storage, are in-memory only.

## Completed Milestones

The repository history and current source show these completed foundations:

- Milestone 1: Node.js project foundation, Express server, health check, basic folder structure, README, environment example, and gitignore.
- Milestone 2: Google Sheets connection helper, environment variables, and connection test script.
- Milestone 3: Contacts API, Contact model fields, create/list endpoints, validation, Google Sheets persistence, API error handling, and tests.
- Milestone 4: Minimal responsive Contacts web interface, Add Contact page, Contact List page, and static file serving.
- Milestone 5: Contact editing, soft archive, server-side search and filters, and ContactHistory records.
- Milestone 6: Workers module, Worker and WorkerHistory Sheets setup, API/repository/service/validation/history support, and worker UI flows.
- Sprint 2 through Sprint 7: agent architecture placeholders, Knowledge Agent V1, Gringo personality layer, CRM Agent logic, Manager Agent, Content Agent, Web Chat MVP, and JSON knowledge base V1.

The current source is beyond the older README milestone wording. This document is the Milestone 8 planning reference.

## Completed Sprint 23

Sprint 23 added the language and translation layer:

- Central language detection and normalization.
- Supported language handling for English, Hebrew, Arabic, Thai, Sinhala, Hindi, Russian, and Tagalog/Filipino.
- Persistent profile language fields.
- CRM methods to save, clear, and update language preferences and detected language.
- Core Agent language resolution from saved preference, channel hint, detected text, and fallback.
- Web Chat profile language selector with Auto mode.
- Profile API support for language fields.
- Incoming translation to English before Core Agent intent routing.
- Outgoing translation from English to the resolved user language before delivery.
- Provider-agnostic translation service.
- OpenAI translation provider adapter.
- In-memory translation cache.
- Translation metrics without storing message content.
- Translation recovery and fallback behavior.
- Admin translation overview and settings.
- Sprint 23 readiness documentation and focused tests.

`SPRINT_23_READINESS.md` classifies the sprint as ready with known limitations.

## Completed Sprint 24.1

Sprint 24.1 added internal memory and context foundations:

- Short-term conversation memory.
- Context manager for recent conversation context.
- Conversation summarization.
- Structured memory snapshots.
- Working memory.
- Memory lifecycle management.
- Core Agent internal access to context, snapshots, lifecycle, and working memory.

The memory system is internal and in-memory only. It does not add persistent memory, does not replace Google Sheets CRM/history records, and does not change user-facing chat behavior by itself.

## Completed Supervisor Infrastructure

The current Supervisor infrastructure includes:

- Agent registry and agent contracts.
- Task and result contract definitions.
- Metadata-only default domain agents.
- Supervisor request context normalization.
- Draft plan creation.
- Basic plan validation.
- In-memory plan storage.
- Primary domain detection.
- Secondary domain detection.
- Routing decision creation.
- Unknown-domain fallback plan state.
- Internal clarification question creation.
- Request type detection.
- Core Agent integration that creates, validates, stores, and attaches internal draft Supervisor plans when `MULTI_AGENT_ENABLED` and `SUPERVISOR_ENABLED` are enabled.

This infrastructure is planning-oriented. It does not yet execute domain agents or orchestrate workflows.

## Existing Communication Channels

Current channel-related source includes:

- Web Chat through `src/public/chat.html`, `src/public/chat.js`, and `src/modules/chat`.
- Shared communication services and channel registry in `src/modules/communication`.
- Telegram polling, message handling, callback handling, delivery, and account linking modules.
- WhatsApp webhook, message handling, delivery, template, status, and Admin delivery operations.
- LINE webhook, message handling, Rich Menu support, quick replies, delivery, and account linking modules.
- Preferred channel and fallback channel support in profile and communication code.
- Quiet-hours queueing in channel delivery services.
- Notification and task actions in channel message services.

Telegram, WhatsApp, and LINE are feature-flagged or configuration-dependent. Some channel modules still use direct client calls rather than a completely unified communication layer.

## Existing Admin Features

Current Admin source includes:

- Admin dashboard.
- Admin API key protection.
- Translation overview and translation settings.
- Daily and weekly report generation.
- Admin notes.
- Human answers for follow-ups.
- Missing knowledge updates.
- Knowledge draft and content draft creation from follow-ups/questions.
- Content draft update and publish operations.
- Community comment moderation.
- Recommendation updates.
- Document updates.
- Manual notification creation.
- Scheduled notification cancellation.
- Task assignment and update.
- WhatsApp manual notification, retry, cancel, and failure reason operations.

Dedicated dashboards or complete control surfaces for every channel are not confirmed in the current repository.

## Existing Memory System

The memory system currently includes:

- `conversation-memory.service.js` for short-term in-memory message storage.
- `context-manager.service.js` for selecting safe recent context.
- `conversation-summary.service.js` for internal structured summaries.
- `memory-snapshot.service.js` for structured per-conversation snapshots.
- `working-memory.service.js` for active tasks, intermediate state, dependencies, blockers, and pending actions.
- `memory-lifecycle.service.js` for initializing, touching, refreshing, cleaning, archiving, and closing internal memory state.

Memory storage is in-memory only. Persistent memory is not implemented.

## Current Supervisor Status

The Supervisor currently exists as an internal planning component.

It can:

- Normalize request context.
- Create a draft plan.
- Validate the basic plan shape.
- Store and retrieve plans in memory.
- Detect a primary domain from keyword dictionaries.
- Detect secondary domains.
- Create a routing decision object.
- Mark unknown-domain plans as waiting for missing business-domain information.
- Build an internal fixed-option clarification question.
- Classify request type as unknown, simple, multi-domain, workflow, or urgent.
- Attach internal Supervisor plan data inside the Core Agent path when enabled by configuration.

It does not yet:

- Send clarification questions to users.
- Process clarification answers.
- Route to and execute domain agents.
- Coordinate multiple agents.
- Aggregate results.
- Plan or execute workflows.
- Request or manage approvals.
- Persist Supervisor plans outside memory.

## Not Yet Implemented

The following items are missing according to the current repository state:

- User-facing clarification question delivery.
- Clarification answer handling.
- Supervisor task contract validation inside plan validation.
- Active domain routing from Supervisor decisions to agent execution.
- Domain agent execution.
- Multi-agent coordination.
- Result aggregation and result merging.
- Workflow planning.
- Workflow execution engine.
- Approval engine or approval workflow.
- Persistent memory storage.
- Persistent Supervisor plan storage.
- Complete cross-channel communication unification.
- Complete cross-channel deduplication.
- Confirmed WhatsApp one-time secure account linking.
- Confirmed LINE delivery-status equivalent and full retry/cancel controls.
- Dedicated Telegram Admin dashboard and Telegram-specific Manager metrics.
- Full login/session authentication.
- Confirmed global rate limiting.
- Confirmed global secret masking.
- Full dependency-installed regression test run in this workspace.
- Confirmed fresh server restart from source with installed dependencies.
- Real external provider validation with safe non-production credentials.

## Milestone 8 Goal

Milestone 8 transforms the Supervisor from a planning component into the active orchestration engine.

The Supervisor should move from internal plan creation and classification toward controlled execution: deciding what needs to happen, choosing the right domain agents, coordinating multi-domain work, aggregating results, managing workflows, and requiring approvals for sensitive actions.

## Milestone 8 Roadmap

### Epic 8.1 - Active Supervisor

Goal:
Make the Supervisor the active orchestration entry point for eligible requests instead of only attaching internal plan data.

Current status:
The Supervisor can normalize context, classify domains/request types, create routing decisions, create draft plans, validate basic plan shape, store plans in memory, and attach internal plan data through Core Agent integration when feature flags are enabled.

Definition of Done:

- Eligible Core Agent requests enter an active Supervisor orchestration path.
- Unknown-domain requests can produce a user-facing clarification response.
- Clarification state is tracked so the next user answer can continue the same request.
- Existing non-Supervisor chat behavior remains unchanged when Supervisor flags are disabled.
- Tests cover enabled and disabled paths.

Dependencies:

- Existing Core Agent integration.
- Existing Supervisor service.
- Existing memory snapshot and working memory services.
- Existing chat response assembly path.

### Epic 8.2 - Domain Agent Execution

Goal:
Allow the Supervisor to invoke the correct domain agent for a classified request.

Current status:
Domain agent files exist as metadata-oriented defaults, and registry/contracts exist. The Supervisor does not execute domain agents.

Definition of Done:

- Domain agents expose executable handlers through the established agent contract.
- The Supervisor can select one target domain and execute the matching agent.
- Agent execution returns a validated result contract.
- Execution errors fall back safely without breaking chat responses.
- Tests cover successful execution, missing agent, invalid result, and execution failure.

Dependencies:

- Agent registry.
- Agent contract.
- Result contract.
- Supervisor routing decision.
- Core Agent response assembly.

### Epic 8.3 - Multi-Agent Coordination

Goal:
Coordinate requests that require more than one domain without losing context or duplicating work.

Current status:
The Supervisor can detect secondary domains and create `multi_domain` routing decisions, but it does not coordinate or execute multiple agents.

Definition of Done:

- The Supervisor can create an ordered multi-agent execution plan.
- Shared request context is passed consistently to each selected agent.
- Working memory tracks active agent tasks, dependencies, blockers, and pending actions.
- Partial failure behavior is defined and tested.
- Tests cover multi-domain routing, ordered execution, and partial results.

Dependencies:

- Epic 8.2 domain agent execution.
- Working memory.
- Memory snapshot.
- Task/result contracts.
- Supervisor routing decision.

### Epic 8.4 - Result Aggregation

Goal:
Merge one or more agent results into a single coherent Core Agent response.

Current status:
Result contracts exist, but there is no aggregation or merging layer.

Definition of Done:

- A result aggregation module validates and combines agent results.
- The aggregator preserves important next steps, blockers, warnings, and user-facing answer content.
- Multi-agent responses are ordered and deduplicated.
- Failed or partial results are represented safely.
- Tests cover single-agent, multi-agent, partial failure, and invalid-result cases.

Dependencies:

- Result contract.
- Epic 8.2 domain agent execution.
- Epic 8.3 multi-agent coordination.
- Core Agent response assembly.

### Epic 8.5 - Workflow Engine

Goal:
Support multi-step requests that need planning, state, execution, and progress tracking.

Current status:
The Supervisor can classify a request as `workflow`, and task/result contracts exist. Workflow planning and execution are not implemented.

Definition of Done:

- Workflow plans can be created from supported workflow requests.
- Workflow steps use task contracts and explicit status transitions.
- Working memory stores active workflow state.
- Workflow progress can continue across conversation turns while memory is available.
- Tests cover workflow creation, step execution, blockers, completion, and recovery.

Dependencies:

- Task contract.
- Result contract.
- Working memory.
- Memory lifecycle.
- Epic 8.2 domain agent execution.
- Epic 8.3 multi-agent coordination.

### Epic 8.6 - Approval Engine

Goal:
Require approval before sensitive or high-impact actions are executed.

Current status:
No approval engine or approval workflow is implemented.

Definition of Done:

- Sensitive action categories are defined.
- The Supervisor can pause execution for required approval.
- Approval requests include clear action details and risk context.
- Approved actions resume safely.
- Rejected or expired approvals stop safely and preserve user-facing clarity.
- Tests cover approval required, approval accepted, approval rejected, and approval timeout/expiry behavior.

Dependencies:

- Active Supervisor orchestration.
- Workflow state management.
- Working memory.
- Admin or user-facing approval surface decisions.
- Security model decisions.

### Epic 8.7 - Production Readiness

Goal:
Validate Milestone 8 behavior without regressing existing chat, translation, memory, channel, or Admin behavior.

Current status:
Sprint 23 has focused readiness documentation. Full dependency-installed regression and fresh restart were previously limited by the local environment.

Definition of Done:

- Full automated test suite runs in an environment with dependencies installed.
- Milestone 8 tests pass for Supervisor, domain execution, coordination, aggregation, workflows, and approvals.
- Existing Sprint 23 translation tests still pass.
- Existing memory tests still pass.
- Existing chat behavior is verified with Supervisor disabled and enabled.
- Fresh server restart from source is confirmed.
- Runtime configuration and secrets are reviewed for safe defaults.

Dependencies:

- Epics 8.1 through 8.6.
- Installed project dependencies.
- Safe test credentials or mocks for external providers and channels.
- Updated readiness documentation after implementation.
