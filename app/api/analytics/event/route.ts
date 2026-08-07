import { NextResponse } from 'next/server';
import { requireOrgAccess, requireUser } from '@/lib/apiAuth';
import {
  aliasAnonymousId,
  captureEvent,
  isClientReportableEvent,
  requiresSession,
  sanitizeAnonymousId,
} from '@/lib/analytics';

/**
 * Ingestion point for the product events that happen in the browser.
 *
 * Three events reach the product only here: `signup_started` and
 * `signup_completed`, which happen before and around account creation, and
 * `quote_sent`, which is a click on a `wa.me` link and never touches the API.
 * Everything else in the funnel is recorded at the server boundary where its
 * write lands (see lib/analyticsServer.ts) and is refused here — a browser must
 * not be able to assert that a quote was signed or a payment confirmed.
 *
 * Identity is resolved from the session cookie, never from the body: the caller
 * supplies only an anonymous id, and only for the pre-account events. When a
 * session exists the anonymous id is aliased onto the user id so the funnel is
 * one person from landing page to payment.
 *
 * The response is always 202 with no detail on success, because the caller has
 * nothing to do with the outcome and a failed capture must not surface as an
 * error in the UI.
 */

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const event = (body as { event?: unknown } | null)?.event;

  if (!isClientReportableEvent(event)) {
    return NextResponse.json(
      { error: { code: 'UNKNOWN_EVENT', message: 'Evento no reconocido' } },
      { status: 400 }
    );
  }

  // Whatever survives here still goes through sanitizeEventProperties, which is
  // where personal data and unsupported types are dropped.
  const rawProperties = (body as { properties?: unknown } | null)?.properties;
  const properties =
    rawProperties && typeof rawProperties === 'object' && !Array.isArray(rawProperties)
      ? (rawProperties as Record<string, unknown>)
      : undefined;
  const anonymousId = sanitizeAnonymousId((body as { anonymousId?: unknown } | null)?.anonymousId);

  let distinctId: string | null = null;
  let organizationId: string | null = null;

  // An organization is the common case; a user who has just registered has one
  // only after onboarding, and is still a legitimate subject for
  // `signup_completed`.
  const org = await requireOrgAccess();
  if (org.ok) {
    distinctId = org.ctx.userId;
    organizationId = org.ctx.organizationId;
  } else {
    const user = await requireUser();
    if (user.ok) distinctId = user.userId;
  }

  if (!distinctId) {
    // No session. Only the events that precede the account may be attributed to
    // an anonymous id; the rest would let anyone write into the funnel.
    if (requiresSession(event)) {
      return NextResponse.json(
        { error: { code: 'UNAUTHENTICATED', message: 'Sesión requerida' } },
        { status: 401 }
      );
    }
    distinctId = anonymousId;
  } else if (anonymousId) {
    await aliasAnonymousId(distinctId, anonymousId);
  }

  if (!distinctId) {
    return NextResponse.json({ captured: false }, { status: 202 });
  }

  const result = await captureEvent(event, { distinctId, organizationId, properties });

  return NextResponse.json({ captured: result.captured }, { status: 202 });
}
