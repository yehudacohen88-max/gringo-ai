# Knowledge Base V1

The Knowledge Base is stored as JSON files.

Location:

```text
src/modules/knowledge-agent/knowledge-base/
```

Each file contains an array of knowledge items.

## Item Structure

```text
id
title
category
language
keywords
question
answer
relatedTopics
lastUpdated
```

## Categories

```text
Exchange Rates
Money Transfer Companies
Workers Rights
Housing
Jobs FAQ
Healthcare
Documents
Emergency Numbers
```

The Knowledge Agent uses simple keyword matching only.

No AI provider.
No vector search.
No channel integration.
