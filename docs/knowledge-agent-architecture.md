# Knowledge Agent Architecture

The Knowledge Agent is the central brain of Gringo Community.

## Scope

This sprint creates internal architecture only.

No AI provider integration.
No WhatsApp.
No Telegram.
No LINE.
No frontend.
No database migration.

## Categories

```text
Jobs
Housing
Money Transfer
Exchange Rates
Rights
Documents
Healthcare
Food
Shopping
Transportation
Community
News
Other
```

## Result Statuses

```text
FOUND
NOT_FOUND
NEEDS_HUMAN
```

## Flow

```text
User question
  -> Knowledge Agent receives question
  -> Classifier assigns category
  -> Knowledge Base service searches internal knowledge
  -> Result decision
       -> FOUND: return answer
       -> NOT_FOUND: create missing knowledge event
       -> NEEDS_HUMAN: return handoff response
```

## Module Files

```text
src/modules/knowledge-agent/
  knowledge-agent.interface.js
  knowledge-agent.constants.js
  knowledge-agent.model.js
  knowledge-agent.service.js
  knowledge-classifier.service.js
  knowledge-base.service.js
  missing-knowledge.service.js
  handoff.service.js
  index.js
```

All services are placeholders. They define the internal contracts and module boundaries for future implementation.
