import { NextResponse } from 'next/server';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server';
import { createServiceClient, isServiceRoleConfigured } from '@/lib/supabase/service';

/**
 * The platform-admin gate — the founder's own access, distinct from every
 * tenant role in `lib/teamRBAC.ts`.
 *
 * `organizations.owner_id` and the `owner` role mean "owner of one tenant";
 * nothing in the schema models "owner of the platform". This module does, as
 * an environment allowlist: `PLATFORM_ADMIN_USER_IDS` holds the Supabase auth
 * user ids (comma-separated) allowed to read across tenants. Unset, the admin
 * surface does not exist — fail closed (hard rule #3).
 *
 * Every refusal is the same 404. An admin surface that answers 401/403 tells
 * whoever probes it that the surface is there and worth attacking; a by-id
 * route 404s rather than reveal a row exists (CLAUDE.md API rule 3), and the
 * whole admin surface follows that posture. The one loud failure is reserved
 * for the admin themselves: a missing service-role key is a configuration
 * error to fix, never an empty platform to render.
 *
 * Routes behind this gate hold a service-role client, which bypasses RLS by
 * design — that is the point (cross-tenant metrics) and the danger. Nothing
 * from these routes may ever reach a non-admin response, and every route
 * returns the gate's refusal verbatim.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ServiceClient = any;

export interface PlatformAdminContext {
  /** Service-role client — cross-tenant by design; admin routes only. */
  service: ServiceClient;
  /** The admin's auth user id, for audit rows. */
  userId: string;
}

export type PlatformAdminResult =
  | { ok: true; ctx: PlatformAdminContext }
  | { ok: false; response: NextResponse };

/**
 * Reads the allowlist at call time — never into a module constant (#68) —
 * so tests can stub it and a missing value is an empty list, not a crash.
 */
export function parsePlatformAdminIds(
  env: Record<string, string | undefined> = process.env
): string[] {
  const raw = env.PLATFORM_ADMIN_USER_IDS;
  if (!raw) return [];
  return raw
    .split(',')
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
}

function notFound(): PlatformAdminResult {
  return {
    ok: false,
    response: NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Recurso no encontrado' } },
      { status: 404 }
    ),
  };
}

export async function requirePlatformAdmin(): Promise<PlatformAdminResult> {
  // A demo deployment has no tenants and therefore no admin surface. Never
  // demo data here — an admin panel of invented tenants is the #93 defect
  // with the blast radius of every tenant at once.
  if (!isSupabaseConfigured()) return notFound();

  const admins = parsePlatformAdminIds();
  if (admins.length === 0) return notFound();

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !admins.includes(user.id)) return notFound();

  // Only a proven admin gets told what is actually wrong.
  if (!isServiceRoleConfigured()) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error: {
            code: 'SERVICE_ROLE_NOT_CONFIGURED',
            message:
              'Falta configurar SUPABASE_SERVICE_ROLE_KEY en el servidor; el panel no puede leer datos sin ella.',
          },
        },
        { status: 503 }
      ),
    };
  }

  return { ok: true, ctx: { service: createServiceClient(), userId: user.id } };
}
