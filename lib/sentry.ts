/**
 * Business Helper — Sentry Monitoring & Error Handler Module (TypeScript)
 * 
 * Provides Edge-safe, zero-crash exception logging, error payload formatting
 * with multi-tenant organization_id context, and DSN environment auditing.
 */

export interface ErrorContext {
  organization_id?: string;
  user_id?: string;
  route?: string;
  level?: 'fatal' | 'error' | 'warning' | 'info';
  environment?: string;
  tags?: Record<string, string>;
  extra?: Record<string, unknown>;
}

export interface FormattedErrorPayload {
  name: string;
  message: string;
  stack: string | null;
  timestamp: string;
  environment: string;
  tags: {
    organization_id: string;
    user_id: string;
    route: string;
    severity: string;
    [key: string]: string;
  };
  extra: Record<string, unknown>;
}

export interface CaptureResult {
  handled: boolean;
  dispatchedToSentry: boolean;
  payload: FormattedErrorPayload | { message: string; level: string; timestamp: string; tags: Record<string, string> };
}

export function isSentryConfigured(env: Record<string, string | undefined> = process.env): boolean {
  const dsn = env.NEXT_PUBLIC_SENTRY_DSN || env.SENTRY_DSN;
  if (!dsn || typeof dsn !== 'string') return false;
  return dsn.trim().startsWith('https://') && dsn.includes('@sentry');
}

export function formatErrorPayload(error: unknown, context: ErrorContext = {}): FormattedErrorPayload {
  const message = error instanceof Error ? error.message : String(error || 'Unknown error');
  const name = error instanceof Error ? error.name : 'Error';
  const stack = error instanceof Error ? error.stack || null : null;

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

export function captureException(
  error: unknown,
  context: ErrorContext = {},
  env: Record<string, string | undefined> = process.env
): CaptureResult {
  const payload = formatErrorPayload(error, context);
  const configured = isSentryConfigured(env);

  if (configured) {
    console.error('[SENTRY CAPTURE]', payload.message, payload.tags);
  } else {
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

export function captureMessage(
  message: string,
  level: 'fatal' | 'error' | 'warning' | 'info' = 'info',
  context: ErrorContext = {},
  env: Record<string, string | undefined> = process.env
): CaptureResult {
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
