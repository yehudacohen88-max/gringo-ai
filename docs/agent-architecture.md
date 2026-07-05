# Gringo Community Agent Architecture

The product is Gringo Community. The CRM is now an internal service used by agents.

Users interact only with Gringo. Internal agent and module names must not be exposed in user-facing conversations.

## Message Flow

```text
User sends a message
  -> Core AI Agent receives it
  -> Knowledge Agent searches for an answer
  -> CRM Agent stores the conversation if needed
  -> Manager Agent creates daily summaries
  -> Content Agent creates content from recurring questions
  -> Content is published to community channels
```

## Modules

```text
src/modules/gringo
src/modules/core-agent
src/modules/knowledge-agent
src/modules/crm-agent
src/modules/manager-agent
src/modules/content-agent
```

Each module contains:

```text
*.interface.js
*.service.js
index.js
```

These files are placeholders only. They define module boundaries and expected responsibilities, but they do not contain production business logic yet.

## Responsibilities

### Gringo

Defines the public personality, tone, memory usage, follow-up behavior, and proactive messaging rules for the platform.

### Core Agent

Receives user messages and coordinates agent flow.

### Knowledge Agent

Classifies user questions, searches internal knowledge, returns `FOUND`, `NOT_FOUND`, or `NEEDS_HUMAN`, and records missing knowledge events when needed.

### CRM Agent

Decides whether a conversation should be stored and connects agent activity to the internal CRM service.

### Manager Agent

Prepares daily operational summaries from agent activity.

### Content Agent

Turns recurring questions into community content drafts and publishing plans.

## Current Non-Goals

No WhatsApp integration.
No Telegram integration.
No LINE integration.
No frontend.
No AI provider calls.
No channel publishing logic.
