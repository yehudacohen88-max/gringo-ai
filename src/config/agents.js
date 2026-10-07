const multiAgentConfig = {
  enabled: String(process.env.MULTI_AGENT_ENABLED || 'false').toLowerCase() === 'true',
  defaultAgentVersion: String(process.env.DEFAULT_AGENT_VERSION || '1'),
  supervisorEnabled: String(process.env.SUPERVISOR_ENABLED || 'false').toLowerCase() === 'true',
  agentExecutionEnabled: String(process.env.AGENT_EXECUTION_ENABLED || 'false').toLowerCase() === 'true',
  activeSupervisorDeliveryEnabled: String(process.env.ACTIVE_SUPERVISOR_DELIVERY_ENABLED || 'true').toLowerCase() !== 'false',
};

function isSupervisorIntegrationEnabled() {
  return (
    String(process.env.MULTI_AGENT_ENABLED || 'false').toLowerCase() === 'true'
    && String(process.env.SUPERVISOR_ENABLED || 'false').toLowerCase() === 'true'
  );
}

function isAgentExecutionEnabled() {
  return (
    isSupervisorIntegrationEnabled()
    && String(process.env.AGENT_EXECUTION_ENABLED || 'false').toLowerCase() === 'true'
  );
}

function isActiveSupervisorDeliveryEnabled() {
  return (
    isAgentExecutionEnabled()
    && String(process.env.ACTIVE_SUPERVISOR_DELIVERY_ENABLED || 'true').toLowerCase() !== 'false'
  );
}

function isSupervisorShadowModeEnabled() {
  return (
    isAgentExecutionEnabled()
    && String(process.env.ACTIVE_SUPERVISOR_DELIVERY_ENABLED || 'true').toLowerCase() === 'false'
    && String(process.env.SUPERVISOR_SHADOW_ENABLED || 'false').toLowerCase() === 'true'
  );
}

function isSupervisorMultiIntentLiveEnabled() {
  return (
    isActiveSupervisorDeliveryEnabled()
    && String(process.env.SUPERVISOR_MULTI_INTENT_LIVE_ENABLED || 'true').toLowerCase() !== 'false'
  );
}

module.exports = {
  isActiveSupervisorDeliveryEnabled,
  isAgentExecutionEnabled,
  isSupervisorMultiIntentLiveEnabled,
  isSupervisorShadowModeEnabled,
  isSupervisorIntegrationEnabled,
  multiAgentConfig,
};
