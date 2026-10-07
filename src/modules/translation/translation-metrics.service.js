const counters = {
  translationRequests: 0,
  successfulTranslations: 0,
  failedTranslations: 0,
  cacheHits: 0,
  cacheMisses: 0,
  totalLatencyMs: 0,
  latencySamples: 0,
  totalProviderLatencyMs: 0,
  providerLatencySamples: 0,
  lastFailureAt: '',
};

function round(value) {
  return Math.round(value);
}

function increment(name) {
  counters[name] = (counters[name] || 0) + 1;
}

function recordTranslationRequest() {
  increment('translationRequests');
}

function recordTranslationSuccess() {
  increment('successfulTranslations');
}

function recordTranslationFailure() {
  increment('failedTranslations');
  counters.lastFailureAt = new Date().toISOString();
}

function recordCacheHit() {
  increment('cacheHits');
}

function recordCacheMiss() {
  increment('cacheMisses');
}

function recordLatency(durationMs) {
  counters.totalLatencyMs += Math.max(0, Number(durationMs) || 0);
  counters.latencySamples += 1;
}

function recordProviderLatency(durationMs) {
  counters.totalProviderLatencyMs += Math.max(0, Number(durationMs) || 0);
  counters.providerLatencySamples += 1;
}

function getMetrics() {
  return {
    translationRequests: counters.translationRequests,
    successfulTranslations: counters.successfulTranslations,
    failedTranslations: counters.failedTranslations,
    cacheHits: counters.cacheHits,
    cacheMisses: counters.cacheMisses,
    averageLatencyMs: counters.latencySamples ? round(counters.totalLatencyMs / counters.latencySamples) : 0,
    providerLatencyMs: counters.providerLatencySamples
      ? round(counters.totalProviderLatencyMs / counters.providerLatencySamples)
      : 0,
    lastFailureAt: counters.lastFailureAt,
  };
}

function resetMetrics() {
  for (const key of Object.keys(counters)) counters[key] = key === 'lastFailureAt' ? '' : 0;
}

module.exports = {
  getMetrics,
  recordCacheHit,
  recordCacheMiss,
  recordLatency,
  recordProviderLatency,
  recordTranslationFailure,
  recordTranslationRequest,
  recordTranslationSuccess,
  resetMetrics,
};
