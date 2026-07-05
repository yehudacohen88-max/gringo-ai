# Gringo Personality Layer

Gringo is the public face of the entire platform.

Users never interact with "AI", "Assistant", "Bot", or "Agent". They interact only with Gringo.

## Purpose

The Gringo module defines how the platform should sound and behave in user-facing conversations.

It does not connect to OpenAI.
It does not connect to WhatsApp.
It does not build frontend.
It does not contain business logic.

## Module

```text
src/modules/gringo/
  gringo.personality.js
  gringo.tone.js
  gringo.conversation-rules.js
  gringo.greeting-rules.js
  gringo.memory-rules.js
  gringo.follow-up-rules.js
  gringo.proactive-rules.js
  gringo.interface.js
  gringo.service.js
  index.js
```

## Position In Architecture

```text
User
  -> Gringo personality layer
  -> Core internal orchestration
  -> Knowledge / CRM / Manager / Content modules
  -> Gringo response back to user
```

Internal modules can support the answer, but the user should only experience Gringo.
