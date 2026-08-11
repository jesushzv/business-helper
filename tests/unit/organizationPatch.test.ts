import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET, PATCH } from '@/app/api/organization/route';
import { requireOrgAccess } from '@/lib/apiAuth';

/**
 * #95 — PATCH /api/organization grew a profile payload (name, rfc,
 * regimenFiscal, codigoPostal, phone, logoUrl) next to the pre-existing bank
 * payload. These pin the contract:
 * - a profile save is not rejected for a missing CLABE (the old all-bank
 *   validation would have 400'd every profile save);
 * - fiscal inputs fail loudly, never null out silently — regimen_fiscal feeds
 *   CFDI 4.0 stamping;
 * - the bank payload keeps its exact prior behaviour.
 */

const updateCalls: Array<Record<string, unknown>> = [];
/** Rows the route inserts, by table — `audit_logs` is what the #163 tests read. */
const insertCalls: Array<{ table: string; values: Record<string, unknown> }> = [];
/** Writes the legacy→`bank_accounts` mirror issues, kept apart from the org row. */
const mirrorCalls: Array<{ table: string; values: Record<string, unknown> }> = [];
/** What the mirror finds as the org's current live default; null = none yet. */
let defaultAccountRow: { id: string } | null = { id: 'acct-1' };
/**
 * The org's live accounts, as `countLiveAccounts` reads them (#198).
 * `null` stands for a failed read — an RLS denial arrives exactly that way.
 */
let liveAccountRows: Array<{ id: string }> | null = [{ id: 'acct-1' }];
let updateResult: { data: unknown; error: unknown } = { data: { id: 'org-1' }, error: null };
/** The role requireOrgAccess reports — 'owner' unless a test says otherwise. */
let callerRole = 'owner';

// PATCH resolves through requireOrgAccess rather than requireUser so it can see
// the caller's *role*: a member used to fall through to the owner_id filter
// matching nothing and get a 404 about a business that does not exist.
/**
 * One stub for every table the route touches.
 *
 * It has to answer more than `update`: PATCH also inserts `audit_logs` rows and
 * calls `syncLegacyDefaultAccount`, which reads and writes `bank_accounts`
 * through `.select().eq().is().maybeSingle()` and an awaited `.update()`. A
 * stub missing those makes the mirror throw into its own empty `catch` on every
 * test — green, with the mirror never executing (#198).
 */
const supabaseStub = {
  from: (table: string) => ({
    update: (values: Record<string, unknown>) => {
      if (table === 'organizations') updateCalls.push(values);
      else mirrorCalls.push({ table, values });
      const chain = {
        eq: () => chain,
        is: () => chain,
        select: () => ({ maybeSingle: async () => updateResult }),
        // Awaited with no `.select()` — the mirror's archive-all path.
        then: (resolve: (v: unknown) => void) => Promise.resolve({ data: null, error: null }).then(resolve),
      };
      return chain;
    },
    insert: async (values: Record<string, unknown>) => {
      insertCalls.push({ table, values });
      return { error: null };
    },
    select: () => {
      const chain = {
        eq: () => chain,
        is: () => chain,
        maybeSingle: async () => ({ data: defaultAccountRow, error: null }),
        // Awaited with no `.maybeSingle()` — `countLiveAccounts`' list read.
        // `liveAccountRows: null` is the failed-read case, which must reach the
        // route as "unknown" rather than as zero accounts (#198).
        then: (resolve: (v: unknown) => void) =>
          Promise.resolve(
            liveAccountRows === null
              ? { data: null, error: { message: 'permission denied' } }
              : { data: liveAccountRows, error: null }
          ).then(resolve),
      };
      return chain;
    },
  }),
};

vi.mock('@/lib/apiAuth', () => ({
  requireUser: vi.fn(async () => ({ ok: true, userId: 'user-1', supabase: supabaseStub })),
  requireOrgAccess: vi.fn(),
  isDemoDeployment: () => false,
}));

function patchRequest(body: unknown): Request {
  return new Request('http://localhost/api/organization', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  updateCalls.length = 0;
  insertCalls.length = 0;
  mirrorCalls.length = 0;
  defaultAccountRow = { id: 'acct-1' };
  liveAccountRows = [{ id: 'acct-1' }];
  callerRole = 'owner';

  // Re-installed each test: the GET block below sets its own mockResolvedValue
  // with a read-only supabase stub, and that override outlives its describe.
  // Harmless while PATCH went through requireUser; now that it shares this mock
  // it would hand the bank tests a client with no update(). mockImplementation
  // so `callerRole` is read when the route calls, not when this hook runs.
  vi.mocked(requireOrgAccess).mockImplementation(
    async () =>
      ({
        ok: true,
        ctx: { supabase: supabaseStub, userId: 'user-1', organizationId: 'org-1', role: callerRole },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      }) as any
  );
  updateResult = { data: { id: 'org-1' }, error: null };
});

describe('PATCH /api/organization — profile payload (#95)', () => {
  it('saves a profile without any bank fields (no CLABE required)', async () => {
    const res = await PATCH(patchRequest({ name: 'Ferretería La Central', codigoPostal: '44100' }));
    expect(res.status).toBe(200);
    expect(updateCalls[0]).toMatchObject({ name: 'Ferretería La Central', codigo_postal: '44100' });
    expect(updateCalls[0]).not.toHaveProperty('bank_clabe');
  });

  it('reduces a régimen display label to its SAT code', async () => {
    const res = await PATCH(patchRequest({ regimenFiscal: '601 — General de Ley Personas Morales' }));
    expect(res.status).toBe(200);
    expect(updateCalls[0]).toMatchObject({ regimen_fiscal: '601' });
  });

  it('rejects a non-empty régimen that has no code — never a silent NULL on a CFDI field', async () => {
    const res = await PATCH(patchRequest({ regimenFiscal: 'General de Ley Personas Morales' }));
    expect(res.status).toBe(400);
    expect(updateCalls).toHaveLength(0);
  });

  it('rejects a four-digit régimen instead of truncating it to a different code', async () => {
    const res = await PATCH(patchRequest({ regimenFiscal: '6012' }));
    expect(res.status).toBe(400);
    expect(updateCalls).toHaveLength(0);
  });

  it('rejects an invalid RFC with the Spanish envelope', async () => {
    const res = await PATCH(patchRequest({ rfc: 'NOPE' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('INVALID_RFC');
  });

  it('rejects a phone that cannot receive WhatsApp', async () => {
    const res = await PATCH(patchRequest({ phone: 'llamar a la oficina' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('INVALID_PHONE');
  });

  it('rejects a non-https logo URL — it renders on client-facing pages', async () => {
    // eslint-disable-next-line no-script-url
    const res = await PATCH(patchRequest({ logoUrl: 'javascript:alert(1)' }));
    expect(res.status).toBe(400);
    expect(updateCalls).toHaveLength(0);
  });

  it('rejects an empty payload instead of issuing a no-op update', async () => {
    const res = await PATCH(patchRequest({}));
    expect(res.status).toBe(400);
    expect(updateCalls).toHaveLength(0);
  });
});

describe('GET /api/organization — the browser gets the columns it needs and no others', () => {
  const ROW = { id: 'org-1', name: 'Ferretería La Central' };
  let selectedColumns = '';

  beforeEach(() => {
    selectedColumns = '';
    vi.mocked(requireOrgAccess).mockResolvedValue({
      ok: true,
      ctx: {
        userId: 'user-1',
        organizationId: 'org-1',
        role: 'owner',
        supabase: {
          from: () => ({
            select: (columns: string) => {
              selectedColumns = columns;
              return { eq: () => ({ maybeSingle: async () => ({ data: ROW, error: null }) }) };
            },
          }),
        },
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);
  });

  it('names its columns instead of selecting *', async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(selectedColumns).not.toBe('*');
    // Every field a client of this route reads today.
    for (const column of [
      'id',
      'name',
      'rfc',
      'regimen_fiscal',
      'codigo_postal',
      'phone',
      'logo_url',
      'industry',
      'subscription_tier',
      'subscription_status',
      'bank_name',
      'bank_clabe',
      'bank_account_holder',
    ]) {
      expect(selectedColumns.split(/\s*,\s*/)).toContain(column);
    }
  });

  it('does not ship billing- or PAC-linkage columns no client reads', async () => {
    await GET();
    for (const column of [
      'owner_id',
      'stripe_customer_id',
      'stripe_subscription_id',
      'facturapi_organization_id',
    ]) {
      expect(selectedColumns).not.toContain(column);
    }
  });
});

describe('PATCH /api/organization — bank payload keeps its contract', () => {
  it('still validates the CLABE when any bank field is present', async () => {
    const res = await PATCH(patchRequest({ bankName: 'BBVA', bankClabe: '123' }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('INVALID_CLABE');
  });

  it('rejects an 18-digit CLABE whose check digit fails (#66)', async () => {
    // Same digits as the valid fixture below with the checksum broken: a
    // single-digit typo in the account a tenant's clients wire money to.
    const res = await PATCH(
      patchRequest({ bankName: 'BBVA', bankClabe: '012180001234567897', bankAccountHolder: 'X' })
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('INVALID_CLABE');
    expect(updateCalls).toHaveLength(0);
  });

  it('still saves a valid bank payload', async () => {
    const res = await PATCH(
      patchRequest({ bankName: 'BBVA', bankClabe: '012180001234567899', bankAccountHolder: 'X' })
    );
    expect(res.status).toBe(200);
    expect(updateCalls[0]).toMatchObject({ bank_name: 'BBVA', bank_clabe: '012180001234567899' });
  });
});


describe('PATCH /api/organization — a member is told why, not that they have no business', () => {
  it('answers 403 naming who may change these data', async () => {
    callerRole = 'manager';
    const res = await PATCH(patchRequest({ name: 'Ferretería La Central' }));
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error.code).toBe('FORBIDDEN');
    // Not 404 "No se encontró una organización propia", which reads as *your
    // business does not exist* to someone whose only problem is not owning it.
    expect(body.error.message).toMatch(/dueño/i);
    expect(updateCalls).toHaveLength(0);
  });

  it('still lets the owner through', async () => {
    const res = await PATCH(patchRequest({ name: 'Ferretería La Central' }));
    expect(res.status).toBe(200);
    expect(updateCalls[0]).toMatchObject({ name: 'Ferretería La Central' });
  });
});

describe('PATCH /api/organization — removing the account (#163)', () => {
  it('clears all three bank columns when the CLABE is explicitly emptied', async () => {
    const res = await PATCH(patchRequest({ bankName: '', bankClabe: '', bankAccountHolder: '' }));

    expect(res.status).toBe(200);
    expect(updateCalls[0]).toMatchObject({
      bank_clabe: null,
      bank_name: null,
      bank_account_holder: null,
    });
  });

  it('clears on an empty CLABE even when a bank name is still filled in', async () => {
    // The card sends whatever is in the inputs. An emptied CLABE is the signal;
    // leaving "BBVA" in the name field must not resurrect a half-account, which
    // hasSettlementAccount would read as not-ready anyway.
    const res = await PATCH(patchRequest({ bankName: 'BBVA', bankClabe: '' }));

    expect(res.status).toBe(200);
    expect(updateCalls[0]).toMatchObject({ bank_clabe: null, bank_name: null });
  });

  it('treats a whitespace-only CLABE as a clear, not as an invalid account', async () => {
    const res = await PATCH(patchRequest({ bankClabe: '   ' }));

    expect(res.status).toBe(200);
    expect(updateCalls[0]).toMatchObject({ bank_clabe: null });
  });

  it('does not touch the account when no bank key is present at all', async () => {
    // The regression this guards: a profile save silently wiping the CLABE.
    const res = await PATCH(patchRequest({ name: 'Ferretería La Central' }));

    expect(res.status).toBe(200);
    expect(updateCalls[0]).not.toHaveProperty('bank_clabe');
    expect(updateCalls[0]).not.toHaveProperty('bank_name');
  });

  it('rejects a digit-free value instead of reading it as a removal', async () => {
    // `normalizeClabe` strips non-digits, so a clear keyed on the *normalized*
    // length would delete the account for 'pendiente', 'N/A' or 'CLABE' and
    // answer 200. The raw string is what distinguishes an empty field from a
    // typed mistake.
    for (const typo of ['pendiente', 'N/A', 'CLABE', '---- ---- ----']) {
      updateCalls.length = 0;
      const res = await PATCH(patchRequest({ bankName: 'BBVA', bankClabe: typo }));
      expect(res.status, `expected 400 for ${typo}`).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe('INVALID_CLABE');
      expect(updateCalls).toHaveLength(0);
    }
  });

  it('still rejects a partial CLABE — a typo is not a removal', async () => {
    const res = await PATCH(patchRequest({ bankName: 'BBVA', bankClabe: '01218000123' }));

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe('INVALID_CLABE');
    expect(updateCalls).toHaveLength(0);
  });
});

describe('PATCH /api/organization — the removal is recorded (#163)', () => {
  it('writes an audit row naming the removal', async () => {
    updateResult = { data: { id: 'org-1' }, error: null };

    const res = await PATCH(patchRequest({ bankClabe: '' }));

    expect(res.status).toBe(200);
    const audit = insertCalls.find((c) => c.table === 'audit_logs');
    expect(audit?.values).toMatchObject({
      organization_id: 'org-1',
      action: 'settlement_account.removed',
      actor: 'user-1',
    });
  });


  it('does not record a removal the UPDATE never made', async () => {
    // A member's PATCH matches no row under the owner_id filter.
    updateResult = { data: null, error: null };

    const res = await PATCH(patchRequest({ bankClabe: '' }));

    expect(res.status).toBe(404);
    expect(insertCalls.find((c) => c.table === 'audit_logs')).toBeUndefined();
  });
});

describe('PATCH /api/organization — changing the account is recorded too (#163)', () => {
  it('audits a replacement, not only a removal', async () => {
    // Redirecting settlements to a different account is the move an attacker
    // with a session — or a departing employee — would actually make, and the
    // tenant's own screens look entirely normal afterwards. Auditing only the
    // removal would have made that the untraced path.
    const res = await PATCH(
      patchRequest({ bankName: 'BBVA', bankClabe: '012180001234567899', bankAccountHolder: 'X' })
    );

    expect(res.status).toBe(200);
    const audit = insertCalls.find((c) => c.table === 'audit_logs');
    expect(audit?.values).toMatchObject({
      organization_id: 'org-1',
      action: 'settlement_account.updated',
      actor: 'user-1',
    });
  });

  it('records nothing for a profile-only save', async () => {
    await PATCH(patchRequest({ name: 'Ferretería La Central' }));
    expect(insertCalls.find((c) => c.table === 'audit_logs')).toBeUndefined();
  });
});

/**
 * #198 — the mirror's writes, asserted at the DB layer.
 *
 * `syncLegacyDefaultAccount` is the one function keeping `organizations.bank_*`
 * and `bank_accounts` in agreement. When they diverge the tenant gets #64's
 * failure back: told they can be paid while their client's `/pay/` page
 * refuses, or the reverse.
 *
 * It is also the worst possible place for a false green. The function never
 * throws by design — a mirror failure must not turn a completed organization
 * write into an error the tenant retries — so its only other failure signal is
 * `captureException`, and `lib/sentry.ts` transmitted nothing until #52. A stub
 * that made it throw into that empty `catch` therefore looked exactly like a
 * stub that made it work.
 *
 * The stub was widened for this (`select`/`is`/`maybeSingle`, an awaited
 * `update`) but nothing read `mirrorCalls` back, so the mirror could still
 * no-op unnoticed. These assert what reaches the DB layer on all three paths,
 * per the repo's rule about asserting the write rather than the fetch.
 */
describe('PATCH /api/organization — the legacy mirror actually writes (#198)', () => {
  const mirrorWrites = () => mirrorCalls.filter((c) => c.table === 'bank_accounts');
  const mirrorInserts = () => insertCalls.filter((c) => c.table === 'bank_accounts');

  it('archives the live accounts when the account is cleared', async () => {
    const res = await PATCH(patchRequest({ bankClabe: '' }));

    expect(res.status).toBe(200);
    const [write] = mirrorWrites();
    expect(write, 'the mirror issued no write on a clear').toBeDefined();
    expect(write.values).toMatchObject({ is_default: false });
    expect(write.values.archived_at).toEqual(expect.any(String));
  });

  it('updates the live default in place rather than accumulating a second account', async () => {
    // A tenant fixing a typo must not end up with two accounts, one of which
    // their client's payment page might resolve to.
    defaultAccountRow = { id: 'acct-1' };

    const res = await PATCH(
      patchRequest({ bankName: 'BBVA', bankClabe: '012180001234567899', bankAccountHolder: 'Ana' })
    );

    expect(res.status).toBe(200);
    const [write] = mirrorWrites();
    expect(write, 'the mirror issued no write on a save').toBeDefined();
    expect(write.values).toMatchObject({
      bank_name: 'BBVA',
      clabe: '012180001234567899',
      account_holder: 'Ana',
    });
    expect(mirrorInserts(), 'a second account was created instead of an update').toHaveLength(0);
  });

  it('creates the default when the organization has no account yet', async () => {
    defaultAccountRow = null;

    const res = await PATCH(
      patchRequest({ bankName: 'BBVA', bankClabe: '012180001234567899', bankAccountHolder: 'Ana' })
    );

    expect(res.status).toBe(200);
    const [created] = mirrorInserts();
    expect(created, 'the mirror created no account').toBeDefined();
    expect(created.values).toMatchObject({
      organization_id: 'org-1',
      bank_name: 'BBVA',
      clabe: '012180001234567899',
      is_default: true,
    });
  });

  it('leaves the accounts alone on a profile-only save', async () => {
    const res = await PATCH(patchRequest({ name: 'Ferretería La Central' }));

    expect(res.status).toBe(200);
    expect(mirrorWrites()).toHaveLength(0);
    expect(mirrorInserts()).toHaveLength(0);
  });
});

/**
 * #198 — the legacy clear refuses when it cannot have meant what it says.
 *
 * `PATCH { bankClabe: '' }` is the pre-#164 settings card's "Quitar cuenta",
 * written when an organization settled at exactly one account. An organization
 * now holds a list and the mirror archives every live row, so this payload
 * arriving from a stale browser tab would take all of a tenant's accounts and
 * start refusing every `/pay/` link that names one — in front of their clients.
 *
 * The refusal is in the route rather than the mirror because the mirror runs
 * after the organization row is written and never throws by design.
 */
describe('PATCH /api/organization — a legacy clear cannot speak for several accounts (#198)', () => {
  it('refuses with 409 when the organization holds more than one live account', async () => {
    liveAccountRows = [{ id: 'acct-1' }, { id: 'acct-2' }, { id: 'acct-3' }];

    const res = await PATCH(patchRequest({ bankClabe: '' }));

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe('SETTLEMENT_ACCOUNT_CLEAR_AMBIGUOUS');
    expect(body.error.message).toMatch(/Ajustes/);
    // Nothing may be written: not the organization row, not the accounts.
    expect(updateCalls).toHaveLength(0);
    expect(mirrorCalls).toHaveLength(0);
    expect(insertCalls).toHaveLength(0);
  });

  it('still lets a single-account tenant remove their account', async () => {
    // The whole point of scoping the refusal to >1: today's tenants are
    // single-account, and #163's removal must keep working for them.
    liveAccountRows = [{ id: 'acct-1' }];

    const res = await PATCH(patchRequest({ bankClabe: '' }));

    expect(res.status).toBe(200);
    expect(updateCalls[0]).toMatchObject({ bank_clabe: null });
  });

  it('lets the clear through when the organization has no accounts at all', async () => {
    liveAccountRows = [];

    const res = await PATCH(patchRequest({ bankClabe: '' }));

    expect(res.status).toBe(200);
    expect(updateCalls[0]).toMatchObject({ bank_clabe: null });
  });

  it('refuses with 503 when the account list cannot be read, and claims no count', async () => {
    // An RLS denial resolves as `{ data: null, error }`, not a throw. Reading
    // that as "no accounts" would let the clear through and archive the list.
    // Refusing is recoverable by retrying; the archive is not.
    liveAccountRows = null;

    const res = await PATCH(patchRequest({ bankClabe: '' }));

    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error.code).toBe('SETTLEMENT_ACCOUNT_CLEAR_UNVERIFIED');
    // Hard rule #1: the message must not assert a number we never read.
    expect(body.error.message).not.toMatch(/varias/);
    expect(updateCalls).toHaveLength(0);
    expect(mirrorCalls).toHaveLength(0);
  });

  it('leaves a real account save untouched by the guard', async () => {
    // The guard is keyed on the clear, not on the bank payload. A tenant with
    // three accounts saving through the legacy card still updates the default.
    liveAccountRows = [{ id: 'acct-1' }, { id: 'acct-2' }, { id: 'acct-3' }];

    const res = await PATCH(
      patchRequest({ bankName: 'BBVA', bankClabe: '012180001234567899', bankAccountHolder: 'Ana' })
    );

    expect(res.status).toBe(200);
    expect(updateCalls[0]).toMatchObject({ bank_clabe: '012180001234567899' });
  });
});
