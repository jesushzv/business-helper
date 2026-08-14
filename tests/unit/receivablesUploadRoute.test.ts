import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * `POST /api/receivables/[id]/upload` — the only tenant-side writer of
 * `receipt_url` (#355).
 *
 * The column left `MILESTONE_WRITABLE_FIELDS` in the same change, so
 * everything the old `PUT` path lacked has to hold here instead: a capability
 * gate, a refusal to swap the evidence under a filed fiscal document, and a
 * row that ends up holding the URL *storage* issued rather than one a caller
 * supplied.
 */

const authState = { role: 'owner' as string };

const dbState = {
  milestone: null as Record<string, unknown> | null,
  updateResult: { data: { id: 'm-1', receipt_url: '' } as Record<string, unknown> | null, error: null as unknown },
  updates: [] as Record<string, unknown>[],
};

const storageState = {
  uploadError: null as unknown,
  publicUrl: 'https://project.supabase.co/storage/v1/object/public/spei-vouchers/org-1/owner_m-1_1.pdf',
  configured: true,
  uploadedPaths: [] as string[],
};

vi.mock('@/lib/apiAuth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/apiAuth')>();
  return {
    ...actual,
    requireOrgAccess: vi.fn(async () => ({
      ok: true,
      ctx: {
        organizationId: 'org-1',
        userId: 'user-1',
        role: authState.role,
        supabase: {
          from: () => {
            const chain: Record<string, unknown> = {};
            const self = () => chain;
            chain.select = self;
            chain.eq = self;
            chain.update = (values: Record<string, unknown>) => {
              dbState.updates.push(values);
              return chain;
            };
            chain.maybeSingle = async () =>
              dbState.updates.length > 0
                ? dbState.updateResult
                : { data: dbState.milestone, error: null };
            return chain;
          },
        },
      },
    })),
  };
});

vi.mock('@/lib/supabase/service', () => ({
  isServiceRoleConfigured: () => storageState.configured,
  createServiceClient: () => ({
    storage: {
      from: () => ({
        upload: async (path: string) => {
          storageState.uploadedPaths.push(path);
          return storageState.uploadError
            ? { data: null, error: storageState.uploadError }
            : { data: { path }, error: null };
        },
        getPublicUrl: () => ({ data: { publicUrl: storageState.publicUrl } }),
      }),
    },
  }),
}));

vi.mock('@/lib/sentry', () => ({ captureException: vi.fn() }));

const params = Promise.resolve({ id: 'm-1' });

/** A real PDF by magic bytes — the route sniffs content, not the claimed type. */
function pdf() {
  return new File(['%PDF-1.4'], 'comprobante.pdf', { type: 'application/pdf' });
}

/**
 * A request whose `formData()` hands back the real FormData.
 *
 * Not `new Request(url, { body: formData })`: under this suite's jsdom
 * environment that round-trip mangles the multipart body — the file's bytes
 * come back as the literal string `undefined`, which
 * `sniffReceiptContent` then rejects on the magic-byte check, so every case
 * here would 400 on a fixture problem and prove nothing about the route.
 * `request.formData()` is the only thing the handler touches on the request,
 * so this is the whole surface.
 */
function upload(file: File = pdf()) {
  const body = new FormData();
  body.append('file', file);
  return { formData: async () => body } as unknown as Request;
}

beforeEach(() => {
  authState.role = 'owner';
  dbState.milestone = { id: 'm-1', status: 'pending', receipt_url: null, cfdi_status: 'none' };
  dbState.updateResult = {
    data: { id: 'm-1', receipt_url: storageState.publicUrl },
    error: null,
  };
  dbState.updates = [];
  storageState.uploadError = null;
  storageState.configured = true;
  storageState.uploadedPaths = [];
});

describe('the upload route files the evidence itself (#355)', () => {
  it('writes the row with the URL storage issued', async () => {
    const { POST } = await import('@/app/api/receivables/[id]/upload/route');
    const res = await POST(upload(), { params });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(dbState.updates).toEqual([{ receipt_url: storageState.publicUrl }]);
    // What comes back is read from the write, not the value sent to it.
    expect(body.url).toBe(storageState.publicUrl);
    // Nothing derived from the caller's file name reaches the path or the row.
    expect(storageState.uploadedPaths[0]).toMatch(/^org-1\/owner_m-1_\d+\.pdf$/);
    // The stored name is derived from org + milestone + timestamp; nothing the
    // caller sent contributes to it.
    expect(storageState.uploadedPaths[0]).not.toContain('comprobante');
  });

  it('does not write the row when storage refused the object', async () => {
    storageState.uploadError = { message: 'bucket unavailable' };
    const { POST } = await import('@/app/api/receivables/[id]/upload/route');
    const res = await POST(upload(), { params });

    expect(res.status).toBe(502);
    // The whole point of #85: no URL is filed for a file that is not stored.
    expect(dbState.updates).toEqual([]);
  });

  it('reports a stored-but-unfiled object as a retry, not a bad file', async () => {
    // The object landed and the row did not point at it. Both facts matter,
    // and the one that decides what the owner does next is that the file is up.
    dbState.updateResult = { data: null, error: { code: '08006', message: 'connection lost' } };
    const { POST } = await import('@/app/api/receivables/[id]/upload/route');
    const res = await POST(upload(), { params });
    const body = await res.json();

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(body.error.code).toBe('RECEIPT_SAVE_FAILED');
    expect(body.error.message).toMatch(/se subió/i);
    expect(body.success).toBeUndefined();
  });

  it('treats an update that matched no row as a failure, not a success', async () => {
    // 0 rows changed looks exactly like success (#128).
    dbState.updateResult = { data: null, error: null };
    const { POST } = await import('@/app/api/receivables/[id]/upload/route');
    const res = await POST(upload(), { params });
    const body = await res.json();

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(body.error.code).toBe('RECEIPT_SAVE_FAILED');
  });
});

/**
 * #355 asks outright: may a `member`/`accountant` file payment evidence?
 *
 * The answer taken here is that filing the comprobante takes the same
 * capability as confirming the payment it evidences — `confirm_payment`. That
 * admits the **accountant**, deliberately: reconciling a wire against its
 * receipt is the accountant's job, and they already hold `confirm_payment` and
 * `issue_cfdi`. It refuses the **member**, who could previously attach the
 * comprobante a confirmation rests on through the ungated PUT.
 */
describe('who may file a comprobante (#355)', () => {
  it('refuses a member, before touching storage', async () => {
    authState.role = 'member';
    const { POST } = await import('@/app/api/receivables/[id]/upload/route');
    const res = await POST(upload(), { params });
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error.code).toBe('FORBIDDEN');
    expect(storageState.uploadedPaths).toEqual([]);
    expect(dbState.updates).toEqual([]);
  });

  it.each(['owner', 'manager', 'accountant'])(
    'lets a %s file one — everyone who may confirm a payment',
    async (role) => {
      authState.role = role;
      const { POST } = await import('@/app/api/receivables/[id]/upload/route');
      const res = await POST(upload(), { params });
      expect(res.status).toBe(200);
    }
  );
});

describe('replacing the comprobante under a filed fiscal document (#355)', () => {
  it('refuses when the cobro is confirmed and its CFDI is stamped', async () => {
    dbState.milestone = {
      id: 'm-1',
      status: 'confirmed',
      receipt_url: 'https://project.supabase.co/storage/v1/object/public/spei-vouchers/org-1/old.pdf',
      cfdi_status: 'issued',
    };
    const { POST } = await import('@/app/api/receivables/[id]/upload/route');
    const res = await POST(upload(), { params });
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error.code).toBe('RECEIPT_LOCKED');
    // Says why and what to do, in plain Spanish (hard rule 8).
    expect(body.error.message).toMatch(/timbrada/i);
    expect(body.error.message).toMatch(/cancela la factura/i);
    // Refused before anything was stored — no orphaned object either.
    expect(storageState.uploadedPaths).toEqual([]);
    expect(dbState.updates).toEqual([]);
  });

  it('allows it once the document has been cancelled', async () => {
    // A cancelled CFDI is void and settles nothing, so it locks nothing —
    // which is also the route out of the refusal above.
    dbState.milestone = {
      id: 'm-1',
      status: 'confirmed',
      receipt_url: 'https://cdn/old.pdf',
      cfdi_status: 'cancelled',
    };
    const { POST } = await import('@/app/api/receivables/[id]/upload/route');
    const res = await POST(upload(), { params });

    expect(res.status).toBe(200);
    expect(dbState.updates).toEqual([{ receipt_url: storageState.publicUrl }]);
  });

  it('allows a first filing on a confirmed cobro that has no evidence yet', async () => {
    // The lock is about *replacing* evidence a document was issued against.
    // A confirmed cobro with nothing on file has none to replace.
    dbState.milestone = { id: 'm-1', status: 'confirmed', receipt_url: null, cfdi_status: 'issued' };
    const { POST } = await import('@/app/api/receivables/[id]/upload/route');
    const res = await POST(upload(), { params });

    expect(res.status).toBe(200);
  });

  it('allows replacing evidence while the cobro is still unconfirmed', async () => {
    dbState.milestone = {
      id: 'm-1',
      status: 'marked_paid',
      receipt_url: 'https://cdn/old.pdf',
      cfdi_status: 'none',
    };
    const { POST } = await import('@/app/api/receivables/[id]/upload/route');
    const res = await POST(upload(), { params });

    expect(res.status).toBe(200);
  });
});
