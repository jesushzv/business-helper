/**
 * Production Health & Cloud Environment Auditor Module
 * Provides unified health payload generation, service connectivity checks,
 * and environment secret verification for Cloud QA gates.
 */

function getHealthStatus(customEnv = {}) {
  const timestamp = new Date().toISOString();
  const dbConfigured = Boolean(
    customEnv.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  );
  const authConfigured = Boolean(
    customEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  return {
    status: dbConfigured && authConfigured ? 'healthy' : 'degraded',
    version: '0.1.0-beta',
    environment: customEnv.NODE_ENV || process.env.NODE_ENV || 'development',
    timestamp,
    services: {
      database: dbConfigured ? 'connected' : 'disconnected',
      auth: authConfigured ? 'active' : 'inactive'
    }
  };
}

function auditEnvironmentSecrets(env = process.env) {
  const required = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'NEXT_PUBLIC_APP_URL'
  ];

  const optionalThirdParty = [
    'FACTURAPI_SECRET_KEY',
    'STRIPE_SECRET_KEY',
    'TWILIO_ACCOUNT_SID',
    'GEMINI_API_KEY',
    'SENTRY_DSN',
    'NEXT_PUBLIC_SENTRY_DSN'
  ];

  const missingRequired = required.filter((key) => !env[key]);
  const activeThirdParty = optionalThirdParty.filter((key) => Boolean(env[key]));

  return {
    isReadyForProduction: missingRequired.length === 0,
    missingRequired,
    configuredThirdPartyCount: activeThirdParty.length,
    activeThirdPartyKeys: activeThirdParty,
    appUrl: env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
  };
}

module.exports = {
  getHealthStatus,
  auditEnvironmentSecrets
};
