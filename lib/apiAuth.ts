import { NextResponse } from 'next/server';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server';
import type { UserRole } from '@/lib/teamRBAC';

/**
 * Shared authentication and tenant-scoping for API routes.
 *
 * Two patterns left most routes open. Some performed no auth check at all and
 * relied on RLS — but `/api/*` is excluded from the middleware matcher, and a
 * route that ignores the result of its own query happily reports success on
 * zero affected rows. Others called `getUser()` and then fell back to demo data
 * when it returned nothing, so an unauthenticated caller got a 200 and a
 * payload instead of a rejection.
 *
 * The distinction this module draws is between *no backend configured* and *no
 * valid session*:
 *
 *   - Supabase not configured  -> demo data is legitimate; this is the static
 *                                 marketing demo with no tenant data to leak.
 *   - Supabase configured, no session -> 401. Never demo data. An unauthenticated
 *                                 caller must not receive a success response.
 *
 * Routes should call {@link requireOrgAccess} and return its response verbatim
 * when it fails.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseServerClient = any;

export interface AuthContext {
  supabase: SupabaseServerClient;
  userId: string;
  organizationId: string;
  /** The caller's role in that organization, for capability checks. */
  role: UserRole;
}

export type AuthResult =
  | { ok: true; ctx: AuthContext }
  | { ok: false; response: NextResponse };

/** True when the deployment has no backend at all and demo data is appropriate. */
export function isDemoDeployment(): boolean {
  return !isSupabaseConfigured();
}

function fail(status: number, code: string, message: string): AuthResult {
  return {
    ok: false,
    response: NextResponse.json({ error: { code, message } }, { status }),
  };
}

/**
 * Says out loud that the caller could have acted as more than one tenant.
 *
 * The request still proceeds — refusing every call from a two-organization
 * user would lock them out of an app that has no "act as" switch yet — but the
 * oldest row is a convention, not an answer, and the log is what turns "the
 * dashboard showed the wrong company" into something diagnosable.
 */
function warnOnAmbiguousTenant(source: string, userId: string, rowsSeen: number): void {
  if (rowsSeen < 2) return;
  console.error(
    `[apiAuth] user ${userId} resolves to more than one organization via ${source}; ` +
      'acting as the oldest. The request scope is a convention, not the user\'s choice — ' +
      'an organization switcher is needed before this is a supported state (#133).'
  );
}

/**
 * Resolves the caller's session and the organization it may act on.
 *
 * Returns the organization the user owns, or failing that the first one they
 * are a member of. Routes must scope their queries with the returned
 * `organizationId` — RLS is a backstop, not the only control, and by-id routes
 * need the filter to return 404 instead of revealing that a row exists.
 *
 * Both lookups take the **oldest** row explicitly. `LIMIT 1` with no `ORDER BY`
 * returns an arbitrary row — Postgres guarantees nothing, and the choice can
 * change between two calls in the same session as the physical layout shifts
 * (an UPDATE moves a row, autovacuum runs, the planner switches scan type). A
 * user with two organizations would get a non-deterministic tenant for the
 * whole request, and every route downstream scopes its queries by it: the
 * dashboard shows another organization's data, with no error anywhere (#133).
 * The extra row fetched (`limit(2)`) is what makes the ambiguity *visible* —
 * silently resolving it is a guess, and a guess about tenancy is the one this
 * repo cannot afford.
 *
 * As of `20260811150000`, `uq_organizations_owner_id` makes the owned-side
 * ambiguity unreachable (#109/#168). The ordering and the second row stay:
 * the membership lookup below has no such constraint, and a guard that only
 * holds while an index exists should not disappear the moment it does — this
 * is what would report the invariant having been dropped.
 */
export async function requireOrgAccess(): Promise<AuthResult> {
  if (isDemoDeployment()) {
    return fail(
      503,
      'BACKEND_NOT_CONFIGURED',
      'Esta operación requiere una base de datos configurada'
    );
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return fail(401, 'UNAUTHENTICATED', 'Sesión requerida');
  }

  const resolved = await resolveActiveOrganization(supabase, user.id);

  if (!resolved) {
    return fail(403, 'NO_ORGANIZATION', 'La cuenta no pertenece a ninguna organización');
  }

  return {
    ok: true,
    ctx: {
      supabase,
      userId: user.id,
      organizationId: resolved.organizationId,
      role: resolved.role,
    },
  };
}

/** The organization a caller acts on, and how the answer was reached. */
export interface ActiveOrganization {
  organizationId: string;
  role: UserRole;
  source: 'owner' | 'membership';
  /** True when the caller could have acted as more than one tenant. */
  ambiguous: boolean;
}

/**
 * Which organization is this user's, as far as the app is concerned?
 *
 * Exported because a second caller needs the *same* answer, not its own version
 * of it: the invitation-accept route has to tell a user whether accepting will
 * change what they see, and it can only do that by asking the question exactly
 * the way every authenticated route asks it (#269). Two places deciding "which
 * tenant may this user act on" is the shape of #146, where `requireOrgAccess`
 * and nine RLS policies disagreed and every INSERT came back 42501.
 *
 * Takes the client rather than creating one, so the accept route can ask with
 * its service-role client — that route redeems an invitation for a user who is
 * not yet a member, and no RLS policy can match them.
 */
export async function resolveActiveOrganization(
  supabase: SupabaseServerClient,
  userId: string
): Promise<ActiveOrganization | null> {
  const { data: owned } = await (supabase as SupabaseServerClient)
    .from('organizations')
    .select('id')
    .eq('owner_id', userId)
    .order('created_at', { ascending: true })
    .limit(2);

  if (owned && owned.length > 0) {
    warnOnAmbiguousTenant('organizations.owner_id', userId, owned.length);
    return {
      organizationId: owned[0].id,
      role: 'owner',
      source: 'owner',
      ambiguous: owned.length > 1,
    };
  }

  const { data: membership } = await (supabase as SupabaseServerClient)
    .from('organization_members')
    .select('organization_id, role')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(2);

  if (membership && membership.length > 0) {
    warnOnAmbiguousTenant('organization_members.user_id', userId, membership.length);
    return {
      organizationId: membership[0].organization_id,
      // A membership row without a readable role gets the least privileged one
      // rather than a permissive default.
      role: (membership[0].role as UserRole) || 'member',
      source: 'membership',
      ambiguous: membership.length > 1,
    };
  }

  return null;
}

/**
 * Authentication without requiring an organization, for routes that only need
 * to know who is calling.
 */
export type UserResult =
  | { ok: true; supabase: SupabaseServerClient; userId: string }
  | { ok: false; response: NextResponse };

export async function requireUser(): Promise<UserResult> {
  if (isDemoDeployment()) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: {
            code: 'BACKEND_NOT_CONFIGURED',
            message: 'Esta operación requiere una base de datos configurada',
          },
        },
        { status: 503 }
      ),
    };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: { code: 'UNAUTHENTICATED', message: 'Sesión requerida' } },
        { status: 401 }
      ),
    };
  }

  return { ok: true, supabase, userId: user.id };
}

/**
 * Copies only the named fields off a request body.
 *
 * Update handlers spread the raw body (`.update({ ...body })`), so a caller
 * could set any column — `organization_id` to move a record into another
 * tenant, `total_amount` to alter what a client owes, `status` to mark a quote
 * accepted, or `public_token` to hijack a share link. Passing a body through
 * this function makes the writable surface explicit.
 */
export function pickFields<T extends Record<string, unknown>>(
  body: unknown,
  allowed: readonly string[]
): Partial<T> {
  if (!body || typeof body !== 'object') return {};
  const source = body as Record<string, unknown>;
  const result: Record<string, unknown> = {};

  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(source, key) && source[key] !== undefined) {
      result[key] = source[key];
    }
  }

  return result as Partial<T>;
}

/** Columns a client may set on a quote. Excludes tenant, identity and token fields. */
export const QUOTE_WRITABLE_FIELDS = [
  'title',
  'client_id',
  'line_items',
  'subtotal_amount',
  'iva_amount',
  'retencion_isr_amount',
  'retencion_iva_amount',
  'total_amount',
  'currency',
  'status',
  'valid_until',
  'notes',
  // Which of the organization's settlement accounts this quote's client pays
  // into (#164). Absent from this list, `pickFields` drops it silently and the
  // quote is stored with a NULL account while the wizard reports the choice as
  // saved — the #96 shape, on the column that decides where money lands.
  'bank_account_id',
] as const;

/** Columns a client may set on a milestone. */
export const MILESTONE_WRITABLE_FIELDS = [
  'label',
  'amount',
  'due_date',
  'status',
  'tracking_reference',
  'transferred_amount',
  'receipt_url',
] as const;

/**
 * Columns a client may set on a client record.
 *
 * These are the DB column names, which is also the shape ClientFormModal sends.
 * The two clients routes used to hand-destructure camelCase (`contactName`,
 * `regimenFiscal`, `codigoPostal`, `cfdiUse`) off a snake_case body, so every
 * one of those four resolved to `undefined` and was silently dropped on create
 * and silently skipped on edit — while the save reported success. This list
 * existed and was unit-tested the whole time; the routes just never used it
 * (#96 verification).
 */
export const CLIENT_WRITABLE_FIELDS = [
  'name',
  'contact_name',
  'email',
  'phone',
  'rfc',
  'regimen_fiscal',
  'codigo_postal',
  'cfdi_use',
  'notes',
  'credit_limit',
  'credit_days',
  'credit_status',
] as const;

export const CREDIT_STATUS_VALUES = ['active', 'suspended', 'blocked'] as const;

/** `numeric(12,2)` — anything larger is a numeric field overflow at the column. */
const CREDIT_LIMIT_MAX = 9_999_999_999.99;
/** int4 — anything larger is "integer out of range" at the column. */
const CREDIT_DAYS_MAX = 2_147_483_647;

/**
 * Validates the trade-credit terms on a client write, returning the values to
 * store.
 *
 * It returns the coerced numbers rather than a bare ok/not-ok, because
 * validating a coercion and then persisting the *original* is its own defect:
 * `""`, `true` and `[]` all satisfy `Number(x) >= 0` and then fail at the
 * column as an opaque 500, and a limit above the numeric(12,2) ceiling did the
 * same. That is the #40 shape — a correctable typo surfacing as a server
 * error — so the bounds are checked here, against the real column limits, and
 * the caller writes what this returns.
 *
 * The columns are deliberately nullable: NULL means "no credit line has ever
 * been configured", which the UI renders as unknown rather than as an
 * authorized zero. `null` is therefore a valid value, not a missing one.
 */
export function validateCreditTerms(
  fields: Record<string, unknown>
): { ok: true; values: Record<string, unknown> } | { ok: false; message: string } {
  const values: Record<string, unknown> = {};

  if ('credit_limit' in fields) {
    const raw = fields.credit_limit;
    if (raw === null) {
      values.credit_limit = null;
    } else {
      if (typeof raw !== 'number' && typeof raw !== 'string') {
        return { ok: false, message: 'El límite de crédito debe ser un monto en pesos.' };
      }
      const limit = Number(raw);
      if (String(raw).trim() === '' || !Number.isFinite(limit) || limit < 0) {
        return { ok: false, message: 'El límite de crédito debe ser un monto mayor o igual a cero.' };
      }
      if (limit > CREDIT_LIMIT_MAX) {
        return {
          ok: false,
          message: 'El límite de crédito excede el máximo permitido de $9,999,999,999.99 MXN.',
        };
      }
      values.credit_limit = limit;
    }
  }

  if ('credit_days' in fields) {
    const raw = fields.credit_days;
    if (raw === null) {
      values.credit_days = null;
    } else {
      if (typeof raw !== 'number' && typeof raw !== 'string') {
        return { ok: false, message: 'El plazo de pago debe ser un número de días.' };
      }
      const days = Number(raw);
      if (String(raw).trim() === '' || !Number.isInteger(days) || days < 0) {
        return {
          ok: false,
          message: 'El plazo de pago debe ser un número de días mayor o igual a cero.',
        };
      }
      if (days > CREDIT_DAYS_MAX) {
        return { ok: false, message: 'El plazo de pago excede el máximo permitido.' };
      }
      values.credit_days = days;
    }
  }

  if ('credit_status' in fields) {
    const raw = fields.credit_status;
    if (raw === null) {
      values.credit_status = null;
    } else if (
      !CREDIT_STATUS_VALUES.includes(raw as (typeof CREDIT_STATUS_VALUES)[number])
    ) {
      return { ok: false, message: 'El estado de crédito no es válido.' };
    } else {
      values.credit_status = raw;
    }
  }

  return { ok: true, values };
}
