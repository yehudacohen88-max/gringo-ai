# CRM Agent Logic

The CRM Agent manages internal user memory for Gringo.

## Internal Functions

```text
findOrCreateUser(context)
updateUserProfile(userId, updates)
saveConversation(event)
extractAndUpdateMemory(userId, message)
getUserMemory(userId)
```

## Storage

Google Sheets tabs:

```text
UserProfiles
ConversationHistory
```

Setup command:

```bash
npm run setup:crm-agent
```

## Core Flow

```text
Core Agent receives processed message
  -> CRM Agent finds or creates user profile
  -> CRM Agent saves conversation event
  -> CRM Agent extracts memory signals
  -> CRM Agent updates Gringo memory
```
