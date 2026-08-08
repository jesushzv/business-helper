import { NextResponse } from 'next/server';

/**
 * Error envelope for the public routes — the surfaces a *client* (not the
 * tenant) reaches over a shared link: /q/[token] signing and /pay/[token]
 * payment, plus the OTP issuer behind them.
 *
 * CLAUDE.md API convention 2 applies here more than anywhere: the body is
 * always `{ error: { code, message } }` with a Spanish, plain-language
 * message, because the reader is the tenant's customer mid-signature or
 * mid-payment — they did not sign up, and "Failed to issue verification
 * code" mid-firma is developer jargon aimed at the wrong person (#65).
 * Before this helper the three public routes used four different shapes,
 * which forced the consuming pages to guess between `error`,
 * `error.message` and a sibling `code` — and that guessing is how the
 * untranslated strings reached the screen.
 *
 * `code` is machine-readable state for the page to branch on;
 * `message` is what it may show verbatim. `extra` carries body siblings
 * the consumers already rely on (`retry_after_seconds`, `attempts`,
 * `remaining`, `expired`, `success`) — data, not error prose.
 */
export function publicApiError(
  status: number,
  code: string,
  message: string,
  extra?: Record<string, unknown>
): NextResponse {
  return NextResponse.json({ ...(extra ?? {}), error: { code, message } }, { status });
}
