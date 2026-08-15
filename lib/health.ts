/**
 * Production Health & Cloud Environment Auditor Module
 * Provides unified health payload generation, service connectivity checks,
 * and environment secret verification for Cloud QA gates.
 */

type EnvRecord = Record<string, string | undefined>;

export interface HealthStatus {
  status: 'healthy' | 'degraded';
  version: string;
  environment: string;
  timestamp: string;
  services: {
    database: 'connected' | 'disconnected';
    auth: 'active' | 'inactive';
  };
  /**
   * Which Supabase project this deployment is configured against (#121).
   *
   * `verify:webhook`'s target allowlist accepts `*.vercel.app`, on the premise
   * that a preview host is a safe *deployment*. What it actually checks is the
   * hostname. A Vercel preview is a preview of the **code**: its environment
   * variables come from the same project, and Vercel applies a variable to
   * Preview as well as Production unless it was explicitly scoped otherwise —
   * so a preview can hold the production `SUPABASE_SERVICE_ROLE_KEY`, and the
   * script's two `ORG_ID` checks would write `subscription_tier` and
   * `subscription_status` to a real tenant's row. Silently: the row is
   * overwritten, not appended to.
   *
   * This makes the database the target writes to a **checked fact** rather than
   * an inference from its hostname. It is the project *ref* only — the
   * subdomain of `NEXT_PUBLIC_SUPABASE_URL`, which already ships in the client
   * bundle and is not a credential. **Never a key.** `null` when no URL is
   * configured, which is a real answer: a deployment with no database.
   */
  supabase_ref: string | null;
}

/**
 * The project ref from a Supabase URL — `https://<ref>.supabase.co` → `<ref>`.
 *
 * Returns `null` rather than guessing for anything that is not a parseable URL
 * with a hostname, so a malformed value cannot be reported as an identity that
 * happens to match nothing (or, worse, something).
 */
export function supabaseProjectRef(url: string | undefined | null): string | null {
  if (!url) return null;
  try {
    const { hostname } = new URL(url);
    const [ref] = hostname.split('.');
    return ref || null;
  } catch {
    return null;
  }
}

export interface EnvironmentAudit {
  isReadyForProduction: boolean;
  missingRequired: string[];
  configuredThirdPartyCount: number;
  activeThirdPartyKeys: string[];
  appUrl: string;
}

export function getHealthStatus(customEnv: EnvRecord = {}): HealthStatus {
  const timestamp = new Date().toISOString();
  const supabaseUrl = customEnv.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const dbConfigured = Boolean(supabaseUrl);
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
      auth: authConfigured ? 'active' : 'inactive',
    },
    supabase_ref: supabaseProjectRef(supabaseUrl),
  };
}

export function auditEnvironmentSecrets(env: EnvRecord = process.env): EnvironmentAudit {
  const required = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'NEXT_PUBLIC_APP_URL',
  ];

  const optionalThirdParty = [
    'STRIPE_SECRET_KEY',
    'TWILIO_ACCOUNT_SID',
    'GEMINI_API_KEY',
    'SENTRY_DSN',
    'NEXT_PUBLIC_SENTRY_DSN',
  ];

  const missingRequired = required.filter((key) => !env[key]);
  const activeThirdParty = optionalThirdParty.filter((key) => Boolean(env[key]));

  return {
    isReadyForProduction: missingRequired.length === 0,
    missingRequired,
    configuredThirdPartyCount: activeThirdParty.length,
    activeThirdPartyKeys: activeThirdParty,
    appUrl: env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
  };
}
