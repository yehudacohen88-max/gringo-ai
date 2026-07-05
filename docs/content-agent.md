# Content Agent

The Content Agent turns recurring Gringo community questions into template-based content drafts.

## Internal Functions

```text
readManagerRecommendations()
readConversationHistory()
detectRecurringTopics(options)
generateDraftFromTemplate(topic, contentType)
generateContentDrafts(options)
```

## Reads From

```text
Recommendations
ConversationHistory
```

## Stores To

```text
ContentDrafts
```

Setup command:

```bash
npm run setup:content-agent
```

Supported content types:

```text
FAQ
Community Post
News Summary
Tips
Daily Advice
```

No AI provider is used. Drafts are generated from simple templates only.
