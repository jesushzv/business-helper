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
 * Resolves the caller's session and the organization it may act on.
 *
 * Returns the organization the user owns, or failing that the first one they
 * are a member of. Routes must scope their queries with the returned
 * `organizationId` — RLS is a backstop, not the only control, and by-id routes
 * need the filter to return 404 instead of revealing that a row exists.
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

  const { data: owned } = await (supabase as SupabaseServerClient)
    .from('organizations')
    .select('id')
    .eq('owner_id', user.id)
    .limit(1);

  if (owned && owned.length > 0) {
    return {
      ok: true,
      ctx: { supabase, userId: user.id, organizationId: owned[0].id, role: 'owner' },
    };
  }

  const { data: membership } = await (supabase as SupabaseServerClient)
    .from('organization_members')
    .select('organization_id, role')
    .eq('user_id', user.id)
    .limit(1);

  if (membership && membership.length > 0) {
    return {
      ok: true,
      ctx: {
        supabase,
        userId: user.id,
        organizationId: membership[0].organization_id,
        // A membership row without a readable role gets the least privileged one
        // rather than a permissive default.
        role: (membership[0].role as UserRole) || 'member',
      },
    };
  }

  return fail(403, 'NO_ORGANIZATION', 'La cuenta no pertenece a ninguna organización');
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

/** Columns a client may set on a client record. */
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
] as const;
