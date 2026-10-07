// Test-only baseline: override shell flags before application modules load .env.
// Keep explicit values so dotenv cannot refill them from a developer's config.
// Supervisor tests opt in by setting their required flags in their own setup.
Object.assign(process.env, {
  MULTI_AGENT_ENABLED: 'false',
  DEFAULT_AGENT_VERSION: '1',
  SUPERVISOR_ENABLED: 'false',
  AGENT_EXECUTION_ENABLED: 'false',
  ACTIVE_SUPERVISOR_DELIVERY_ENABLED: 'true',
  SUPERVISOR_MULTI_INTENT_LIVE_ENABLED: 'true',
  SUPERVISOR_SHADOW_ENABLED: 'false',
});

// Unit tests use local repositories and explicit provider mocks, never live credentials.
Object.assign(process.env, {
  NODE_ENV: 'test',
  GOOGLE_SHEETS_SPREADSHEET_ID: '',
  GOOGLE_SHEETS_CLIENT_EMAIL: '',
  GOOGLE_SHEETS_PRIVATE_KEY: '',
  AI_API_KEY: '',
  TRANSLATION_API_KEY: '',
  REFERENCE_EXCHANGE_RATE_API_ENDPOINT: '',
});
