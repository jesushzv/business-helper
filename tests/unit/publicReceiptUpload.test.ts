import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * #85 — the public payment portal's receipt actually reaches storage, and the
 * vendor's Cobranza never holds a link that resolves nothing.
 *
 * The page used to store `URL.createObjectURL(file)` — a blob: URL that
 * dereferences only inside the payer's own tab — in `milestones.receipt_url`.
 * Pinned here: the upload route writes the received bytes to the
 * spei-vouchers bucket keyed by org and milestone; the declaration route
 * accepts only a path the upload route could have issued for that same org
 * and milestone, and never a caller-supplied URL.
 */

interface MockMilestone {
  id: string;
  status?: string;
  due_date?: string;
}

const state: {
  configured: boolean;
  milestones: MockMilestone[];
  uploadResult: { data: { path: string } | null; error: { message: string } | null };
  uploadCalls: Array<{ path: string; options: Record<string, unknown> }>;
  updatedRows: Array<{ id: string }>;
  lastUpdate: { values?: Record<string, unknown> } | null;
  /** Object names present in the bucket under org-1/ — feeds storage.list. */
  storedObjects: string[];
} = {
  configured: true,
  milestones: [],
  uploadResult: { data: { path: 'x' }, error: null },
  uploadCalls: [],
  updatedRows: [{ id: 'm-1' }],
  lastUpdate: null,
  storedObjects: [],
};

vi.mock('@/lib/supabase/service', () => ({
  isServiceRoleConfigured: () => state.configured,
  createServiceClient: () => ({
    from: (table: string) => {
      if (table === 'quotes') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  id: 'quote-1',
                  organization_id: 'org-1',
                  contracts: { id: 'contract-1', milestones: state.milestones },
                },
                error: null,
              }),
            }),
          }),
        };
      }
      return {
        update: (values: Record<string, unknown>) => ({
          eq: () => ({
            in: () => ({
              select: async () => {
                state.lastUpdate = { values };
                return { data: state.updatedRows, error: null };
              },
            }),
          }),
        }),
      };
    },
    storage: {
      from: () => ({
        upload: async (path: string, _body: unknown, options: Record<string, unknown>) => {
          state.uploadCalls.push({ path, options });
          return state.uploadResult;
        },
        getPublicUrl: (path: string) => ({
          data: { publicUrl: `https://project.supabase.co/storage/v1/object/public/spei-vouchers/${path}` },
        }),
        list: async (_folder: string, options?: { search?: string }) => ({
          data: state.storedObjects
            .filter((name) => !options?.search || name.includes(options.search))
            .map((name) => ({ name })),
          error: null,
        }),
      }),
    },
  }),
}));

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

/**
 * Builds the multipart body by hand: under jsdom, `FormData` is jsdom's and
 * undici's `Request` refuses it, while undici parses raw multipart bytes fine.
 */
function uploadRequest(bytes: Uint8Array, name: string, type: string): Request {
  const boundary = '----vitest-boundary-85';
  const encoder = new TextEncoder();
  const head = encoder.encode(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${name}"\r\n` +
      `Content-Type: ${type}\r\n\r\n`
  );
  const tail = encoder.encode(`\r\n--${boundary}--\r\n`);
  const body = new Uint8Array(head.length + bytes.length + tail.length);
  body.set(head, 0);
  body.set(bytes, head.length);
  body.set(tail, head.length + bytes.length);
  return new Request('https://businesshelper.app/api/receivables/public/tok-1/upload', {
    method: 'POST',
    headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
    body,
  });
}

function declarationRequest(body: Record<string, unknown>): Request {
  return new Request('https://businesshelper.app/api/receivables/public/tok-1', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tracking_reference: 'SPEI20260830123456', transferred_amount: 1000, ...body }),
  });
}

const routeParams = { params: Promise.resolve({ token: 'tok-1' }) };

beforeEach(() => {
  state.configured = true;
  state.milestones = [{ id: 'm-1', status: 'pending', due_date: '2026-09-01' }];
  state.uploadResult = { data: { path: 'x' }, error: null };
  state.uploadCalls = [];
  state.updatedRows = [{ id: 'm-1' }];
  state.lastUpdate = null;
  state.storedObjects = [];
});

describe('POST /api/receivables/public/[token]/upload', () => {
  async function post(bytes: Uint8Array, name: string, type: string) {
    const { POST } = await import('@/app/api/receivables/public/[token]/upload/route');
    return POST(uploadRequest(bytes, name, type), routeParams);
  }

  it('stores the bytes under the token’s org and milestone and answers with the path', async () => {
    const res = await post(PNG_BYTES, 'comprobante.png', 'image/png');
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(state.uploadCalls).toHaveLength(1);
    expect(state.uploadCalls[0].path).toMatch(/^org-1\/spei_m-1_\d+\.png$/);
    // The sniffed content decides the stored type, not the caller's claim.
    expect(state.uploadCalls[0].options.contentType).toBe('image/png');
    expect(body.receipt_path).toBe(state.uploadCalls[0].path);
  });

  it('refuses bytes that are not PNG, JPG or PDF regardless of the claimed name and type', async () => {
    // An executable renamed comprobante.pdf: the metadata checks pass, the
    // magic bytes do not. Nothing may reach the bucket.
    const res = await post(
      new Uint8Array([0x4d, 0x5a, 0x90, 0x00, 1, 2, 3, 4]),
      'comprobante.pdf',
      'application/pdf'
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error.code).toBe('INVALID_FILE');
    expect(state.uploadCalls).toHaveLength(0);
  });

  it('answers 409 when nothing on the contract is still payable', async () => {
    state.milestones = [{ id: 'm-1', status: 'confirmed' }];
    const res = await post(PNG_BYTES, 'c.png', 'image/png');
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error.code).toBe('PAYMENT_ALREADY_RECORDED');
    expect(state.uploadCalls).toHaveLength(0);
  });

  it('reports a storage failure as a failure, never a path it did not store', async () => {
    state.uploadResult = { data: null, error: { message: 'bucket down' } };
    const res = await post(PNG_BYTES, 'c.png', 'image/png');
    const body = await res.json();

    expect(res.status).toBe(502);
    expect(body.error.code).toBe('RECEIPT_UPLOAD_FAILED');
    expect(body.receipt_path).toBeUndefined();
  });

  it('refuses uploads past the per-milestone cap — an unauthenticated surface is not free hosting', async () => {
    state.storedObjects = Array.from({ length: 10 }, (_, i) => `spei_m-1_${1723500000000 + i}.png`);
    const res = await post(PNG_BYTES, 'c.png', 'image/png');
    const body = await res.json();

    expect(res.status).toBe(429);
    expect(body.error.code).toBe('RECEIPT_UPLOAD_LIMIT');
    expect(state.uploadCalls).toHaveLength(0);
  });

  it('answers 503 on the demo deployment instead of pretending to store', async () => {
    state.configured = false;
    const res = await post(PNG_BYTES, 'c.png', 'image/png');
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.error.code).toBe('BACKEND_NOT_CONFIGURED');
  });
});

describe('the declaration write never stores a caller-supplied URL (#85)', () => {
  async function post(body: Record<string, unknown>) {
    const { POST } = await import('@/app/api/receivables/public/[token]/route');
    return POST(declarationRequest(body), routeParams);
  }

  it('ignores a legacy receipt_url — blob: or otherwise — and stores null', async () => {
    const res = await post({ receipt_url: 'blob:https://businesshelper.app/dead-beef' });

    expect(res.status).toBe(200);
    expect(state.lastUpdate?.values?.receipt_url).toBeNull();
  });

  it('turns a valid receipt_path into the storage URL server-side', async () => {
    state.storedObjects = ['spei_m-1_1723500000000.png'];
    const res = await post({ receipt_path: 'org-1/spei_m-1_1723500000000.png' });

    expect(res.status).toBe(200);
    expect(state.lastUpdate?.values?.receipt_url).toBe(
      'https://project.supabase.co/storage/v1/object/public/spei-vouchers/org-1/spei_m-1_1723500000000.png'
    );
  });

  it('refuses a path minted for another org or milestone, and writes nothing', async () => {
    const res = await post({ receipt_path: 'org-2/spei_m-9_1723500000000.png' });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error.code).toBe('INVALID_RECEIPT_PATH');
    expect(state.lastUpdate).toBeNull();
  });

  it('refuses a well-formed path whose object was never uploaded — no deliberate dead links', async () => {
    // Shape is not existence: a payer who edits the timestamp would otherwise
    // hand the vendor a receipt link that resolves nothing (#85's defect,
    // minted on purpose).
    state.storedObjects = [];
    const res = await post({ receipt_path: 'org-1/spei_m-1_9999999999999.png' });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error.code).toBe('INVALID_RECEIPT_PATH');
    expect(state.lastUpdate).toBeNull();
  });

  it('refuses a blob: URL smuggled as receipt_path', async () => {
    const res = await post({ receipt_path: 'blob:https://businesshelper.app/dead-beef' });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error.code).toBe('INVALID_RECEIPT_PATH');
    expect(state.lastUpdate).toBeNull();
  });
});
