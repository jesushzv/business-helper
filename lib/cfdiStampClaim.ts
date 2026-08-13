/**
 * DB-side claim that makes "stamp this milestone" single-flight (#213).
 *
 * Facturapi's `external_id` deduplicates nothing (verified live 2026-08-12,
 * #26), and the issue route's ALREADY_ISSUED pre-check is check-then-act: two
 * concurrent requests both pass the read and both stamp, and after a timeout
 * the first request may die before writing the milestone, so even a serial
 * retry passes it. A CFDI cannot be un-issued — only cancelled, with a motive,
 * on record with the SAT — so the claim must exist *before* the PAC is called.
 *
 * The mechanism is the house pattern from the Stripe webhook: insert a row
 * whose primary key is the milestone id and treat `23505` as "someone already
 * holds this". The caller decides what a held claim means by its age:
 *
 *  - fresh → another request is stamping right now; answer 409 and do nothing.
 *  - stale → a previous attempt died mid-flight. The document may exist at the
 *    SAT, so the claim is released only after the PAC's invoice list confirms
 *    no document carries this milestone's external_id (`takeOverStaleClaim`,
 *    called after that check).
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * A claim older than this is stale: the stamp call itself is capped at 30s
 * (STAMP_TIMEOUT_MS in lib/pacClient.ts), so a claim still present afterwards
 * belongs to a request that died. The margin covers clock skew between the
 * app and the database — `claimed_at` is written by `now()` server-side.
 */
export const STAMP_CLAIM_STALE_MS = 45_000;

export type StampClaimAcquisition =
  | { ok: true }
  /** A fresh claim exists: another request is stamping this milestone right now. */
  | { ok: false; reason: 'in_progress' }
  /** A stale claim exists: a previous attempt died and may or may not have stamped. */
  | { ok: false; reason: 'stale' }
  /** The claim could not be established. The caller must NOT stamp (fail closed). */
  | { ok: false; reason: 'error'; message: string };

export async function acquireStampClaim(
  service: any,
  organizationId: string,
  milestoneId: string,
  userId: string | null,
  now: number = Date.now()
): Promise<StampClaimAcquisition> {
  const { error } = await service.from('cfdi_stamp_claims').insert({
    milestone_id: milestoneId,
    organization_id: organizationId,
    claimed_by: userId,
  });

  if (!error) return { ok: true };

  if (error.code !== '23505') {
    return { ok: false, reason: 'error', message: error.message || 'claim insert failed' };
  }

  const { data: existing, error: readError } = await service
    .from('cfdi_stamp_claims')
    .select('claimed_at')
    .eq('milestone_id', milestoneId)
    .maybeSingle();

  if (readError || !existing?.claimed_at) {
    // The row collided and now cannot be read — an in-between state (perhaps
    // the holder just finished and deleted it). Refusing to stamp is the only
    // safe answer; the user retries in seconds.
    return { ok: false, reason: 'error', message: readError?.message || 'claim unreadable' };
  }

  const age = now - new Date(existing.claimed_at).getTime();
  if (Number.isFinite(age) && age > STAMP_CLAIM_STALE_MS) {
    return { ok: false, reason: 'stale' };
  }

  return { ok: false, reason: 'in_progress' };
}

/**
 * Replaces a stale claim with the caller's own.
 *
 * Only called after the PAC's invoice list confirmed no document carries this
 * milestone's external_id — deleting a stale claim without that check would
 * re-open the exact double-stamp the table exists to prevent. The delete is
 * age-guarded so a claim refreshed between the check and this call survives,
 * and the re-insert can still collide with a concurrent taker; both outcomes
 * answer `in_progress`.
 */
export async function takeOverStaleClaim(
  service: any,
  organizationId: string,
  milestoneId: string,
  userId: string | null,
  now: number = Date.now()
): Promise<StampClaimAcquisition> {
  const staleBefore = new Date(now - STAMP_CLAIM_STALE_MS).toISOString();

  const { error: deleteError } = await service
    .from('cfdi_stamp_claims')
    .delete()
    .eq('milestone_id', milestoneId)
    .lt('claimed_at', staleBefore);

  if (deleteError) {
    return { ok: false, reason: 'error', message: deleteError.message || 'claim delete failed' };
  }

  const acquired = await acquireStampClaim(service, organizationId, milestoneId, userId, now);
  if (!acquired.ok && acquired.reason === 'stale') {
    // Still stale after our delete means someone else is mid-takeover.
    return { ok: false, reason: 'in_progress' };
  }
  return acquired;
}

/**
 * Releases the claim once the attempt's outcome is known and safe:
 * a definitive PAC rejection (no document exists), or a stamp fully recorded
 * on the milestone (the ALREADY_ISSUED read-guard takes over from here).
 * Never called on timeout — the document may exist at the SAT.
 */
export async function releaseStampClaim(service: any, milestoneId: string): Promise<void> {
  await service.from('cfdi_stamp_claims').delete().eq('milestone_id', milestoneId);
}
