# Changelog

## Sprint 7 - Knowledge Base V1

- Added JSON knowledge files for Exchange Rates, Money Transfer Companies, Workers Rights, Housing, Jobs FAQ, Healthcare, Documents, and Emergency Numbers.
- Updated Knowledge Agent search to load JSON knowledge files.
- Added simple keyword scoring and best-match selection.
- Added `docs/knowledge-base-v1.md`.
- No AI provider, vector search, WhatsApp, Telegram, or LINE was added.

## Sprint 6 - Web Chat MVP

- Added a simple local web chat page.
- Added `POST /api/chat/message`.
- Connected chat endpoint to Core Agent, Knowledge Agent, and CRM Agent.
- Added simple local Knowledge Agent responses without AI providers.
- Added CRM save and memory update calls from the chat flow.
- No WhatsApp, Telegram, LINE, login, payments, dashboards, or AI provider was added.

## Sprint 5 - Content Agent

- Added Content Agent draft model.
- Added Content Agent repository for reading recommendations and conversation history.
- Added recurring topic detection with simple aggregation rules.
- Added template-based content draft generation.
- Added Google Sheets storage for `ContentDrafts`.
- Added setup command for Content Agent sheets.
- No frontend, channel integration, or AI provider was added.

## Sprint 4 - Manager Agent

- Added Manager Agent report models.
- Added Manager Agent repository for reading CRM Agent history and profiles.
- Added daily summary aggregation.
- Added weekly summary placeholder aggregation.
- Added recommendation generation with simple rules.
- Added Google Sheets storage for `DailyReports`, `WeeklyReports`, and `Recommendations`.
- Added setup command for Manager Agent report sheets.

## Sprint 3 - CRM Agent Logic

- Added CRM Agent user profile model.
- Added CRM Agent conversation history model.
- Added CRM Agent repository using Google Sheets.
- Added CRM Agent memory extraction placeholder rules.
- Added internal CRM Agent service functions.
- Updated Core Agent placeholder flow to call CRM Agent after message processing.
- Added setup command for `UserProfiles` and `ConversationHistory` sheets.

## Sprint 3 - Gringo Personality

- Added the Gringo personality layer as the public face of the platform.
- Added personality, tone, conversation, greeting, memory, follow-up, and proactive messaging rules.
- Added Gringo interface and service placeholders.
- Added `docs/gringo-personality-layer.md`.
- No OpenAI, WhatsApp, frontend, or business logic was added.

## Sprint 2 - Knowledge Agent

- Expanded the Knowledge Agent internal architecture.
- Added category constants for Jobs, Housing, Money Transfer, Exchange Rates, Rights, Documents, Healthcare, Food, Shopping, Transportation, Community, News, and Other.
- Added result statuses: `FOUND`, `NOT_FOUND`, and `NEEDS_HUMAN`.
- Added placeholder services for classification, internal knowledge search, missing knowledge events, and human handoff.
- Added `docs/knowledge-agent-architecture.md`.
- No AI provider, channel integration, frontend, or database migration was added.

## Architecture Refactor

- Repositioned the CRM as an internal service used by agents.
- Added internal placeholder modules for Core Agent, CRM Agent, Knowledge Agent, Manager Agent, and Content Agent.
- Added agent interfaces, services, and module indexes.
- Added `docs/agent-architecture.md`.
- No WhatsApp, Telegram, LINE, frontend, AI provider, or publishing logic was added.

## Milestone 6

- Added the Workers module as a separate business module from Contacts.
- Added Workers and WorkerHistory Google Sheets configuration.
- Added setup command to create/update Workers and WorkerHistory tabs.
- Added Worker API, repository, service, validation, and history support.
- Added Workers list, add worker, edit worker, archive worker, search, and filters.
- Added WorkerHistory rows for create, update, and archive actions.
- Added Workers navigation from the local app home page.

## Milestone 5

- Added contact editing through the API and web interface.
- Added contact archiving as a soft delete.
- Added server-side contact search by name, phone, and email.
- Added server-side filters for status, source, and country.
- Added ContactHistory records for contact creation, updates, and archive actions.
- Added edit and archive controls to the contact list page.
- Updated README testing instructions for Contact Management.

## Milestone 4

- Added a minimal responsive Contacts web interface.
- Added an Add Contact page connected to `POST /api/contacts`.
- Added a Contact List page connected to `GET /api/contacts`.
- Added loading states, success messages, and error messages.
- Added static file serving through Express.
- Updated README instructions for using the UI locally.

## Milestone 3

- Added Contacts API structure.
- Added approved Contact model fields.
- Added create contact endpoint.
- Added get contacts endpoint.
- Added request validation.
- Added Google Sheets repository support for appending and reading contact rows.
- Added API error handling.
- Added validation and API tests.

## Milestone 2

- Added Google Sheets connection helper.
- Added environment variables for Google Sheets credentials and sheet names.
- Added local Google Sheets connection test script.

## Milestone 1

- Added Node.js project foundation.
- Added Express server.
- Added health check endpoint.
- Added basic folder structure.
- Added README, `.env.example`, and `.gitignore`.
