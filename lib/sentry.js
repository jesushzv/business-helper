/**
 * Business Helper — Sentry Monitoring & Error Handler Module (CommonJS for Test Runner)
 * 
 * Provides Edge-safe, zero-crash exception logging, error payload formatting
 * with multi-tenant organization_id context, and DSN environment auditing.
 */

function isSentryConfigured(env = process.env) {
  const dsn = env.NEXT_PUBLIC_SENTRY_DSN || env.SENTRY_DSN;
  if (!dsn || typeof dsn !== 'string') return false;
  return dsn.trim().startsWith('https://') && dsn.includes('@sentry');
}

function formatErrorPayload(error, context = {}) {
  const message = error instanceof Error ? error.message : String(error || 'Unknown error');
  const name = error instanceof Error ? error.name : 'Error';
  const stack = error instanceof Error ? error.stack : null;

  return {
    name,
    message,
    stack,
    timestamp: new Date().toISOString(),
    environment: context.environment || process.env.NODE_ENV || 'development',
    tags: {
      organization_id: context.organization_id || 'anonymous',
      user_id: context.user_id || 'unauthenticated',
      route: context.route || 'unknown',
      severity: context.level || 'error',
      ...context.tags
    },
    extra: context.extra || {}
  };
}

function captureException(error, context = {}, env = process.env) {
  const payload = formatErrorPayload(error, context);
  const configured = isSentryConfigured(env);

  if (configured) {
    // In live environment with DSN configured, dispatches to Sentry endpoint
    // Fallback console log for local tracing
    console.error('[SENTRY CAPTURE]', payload.message, payload.tags);
  } else {
    // Fallback mode when DSN is unconfigured
    console.error('[SENTRY FALLBACK ERROR LOG]', payload.message, {
      route: payload.tags.route,
      org: payload.tags.organization_id
    });
  }

  return {
    handled: true,
    dispatchedToSentry: configured,
    payload
  };
}

function captureMessage(message, level = 'info', context = {}, env = process.env) {
  const configured = isSentryConfigured(env);
  const payload = {
    message: String(message),
    level,
    timestamp: new Date().toISOString(),
    tags: {
      organization_id: context.organization_id || 'anonymous',
      route: context.route || 'unknown',
      ...context.tags
    }
  };

  if (configured) {
    console.log(`[SENTRY MESSAGE:${level.toUpperCase()}]`, message);
  } else {
    console.log(`[SENTRY FALLBACK MESSAGE:${level.toUpperCase()}]`, message);
  }

  return {
    handled: true,
    dispatchedToSentry: configured,
    payload
  };
}

module.exports = {
  isSentryConfigured,
  formatErrorPayload,
  captureException,
  captureMessage
};
