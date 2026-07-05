# Manager Agent

The Manager Agent observes Gringo activity and creates operational reports.

## Internal Functions

```text
generateDailySummary(options)
generateWeeklySummary(options)
generateRecommendations(options)
```

## Reads From

```text
ConversationHistory
UserProfiles
```

## Stores To

```text
DailyReports
WeeklyReports
Recommendations
```

Setup command:

```bash
npm run setup:manager-agent
```

No AI provider is used. Reports use simple aggregation rules only.
