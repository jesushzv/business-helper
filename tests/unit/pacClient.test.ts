import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  CFDI_CANCELLATION_MOTIVES,
  cancelInvoice,
  downloadCFDIDocuments,
  stampInvoice,
  type PacCredentials,
} from '@/lib/pacClient';

const credentials: PacCredentials = {
  provider: 'facturapi',
  apiKey: 'sk_test_abcdefghijklmnopqrstuvwxyz01',
  environment: 'sandbox',
  source: 'organization',
};

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

describe('PAC stamping', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the SAT folio fiscal the PAC issued', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        id: 'fac_123',
        uuid: 'A1B2C3D4-0000-1111-2222-333344445555',
        verification_url: 'https://verificacfdi.facturaelectronica.sat.gob.mx/?id=A1B2',
        series: 'A',
        folio_number: 12,
        total: 5800,
        date: '2026-08-07T10:00:00.000Z',
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await stampInvoice(credentials, { currency: 'MXN' }, 'milestone:m-1');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.uuid).toBe('A1B2C3D4-0000-1111-2222-333344445555');
    expect(result.data.providerInvoiceId).toBe('fac_123');

    const [url, init] = fetchMock.mock.calls[0];
    // v1 answers 410 Gone for every call since April 2023 (observed live,
    // 2026-08-12): this assertion pinned the dead base URL while a mocked
    // fetch kept the suite green — the exact test hard rule #7 warns about.
    expect(url).toBe('https://www.facturapi.io/v2/invoices');
    expect(init.headers.Authorization).toBe(`Bearer ${credentials.apiKey}`);
    // A retried click after a timeout must not stamp a second document.
    expect(JSON.parse(init.body).external_id).toBe('milestone:m-1');
  });

  it('treats a 200 without a uuid as a failure, not as a stamped invoice', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ id: 'fac_123' })));

    const result = await stampInvoice(credentials, {});

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('INVALID_RESPONSE');
  });

  it("passes through the PAC's own message when it rejects the invoice data", async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({ message: 'El RFC del receptor no está en la lista del SAT' }, 400)
      )
    );

    const result = await stampInvoice(credentials, {});

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('REJECTED');
    expect(result.message).toContain('RFC del receptor');
  });

  it('does not leak account detail when the credentials are refused', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ message: 'Organization xyz is suspended' }, 401))
    );

    const result = await stampInvoice(credentials, {});

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('UNAUTHORIZED');
    expect(result.message).not.toContain('suspended');
  });

  it('reports a transport failure instead of falling back to a fabricated stamp', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNRESET')));

    const result = await stampInvoice(credentials, {});

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('UNAVAILABLE');
  });

  it('refuses to stamp without a key rather than inventing a document', async () => {
    const result = await stampInvoice({ ...credentials, apiKey: '' }, {});

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('NOT_CONFIGURED');
  });
});

describe('PAC document download', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches the XML and PDF of a stamped document', async () => {
    const bytes = (value: number) =>
      ({
        ok: true,
        status: 200,
        arrayBuffer: async () => new Uint8Array([value]).buffer,
      }) as unknown as Response;

    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) =>
        Promise.resolve(bytes(url.endsWith('/xml') ? 1 : 2))
      )
    );

    const result = await downloadCFDIDocuments(credentials, 'fac_123');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Array.from(result.data.xml)).toEqual([1]);
    expect(Array.from(result.data.pdf)).toEqual([2]);
  });
});

describe('CFDI cancellation', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('exposes the four SAT motives', () => {
    expect(Object.keys(CFDI_CANCELLATION_MOTIVES)).toEqual(['01', '02', '03', '04']);
  });

  it('rejects an unknown motive without contacting the PAC', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await cancelInvoice(credentials, 'fac_123', '09');

    expect(result.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('requires the substitution folio for motive 01', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await cancelInvoice(credentials, 'fac_123', '01');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toContain('sustituye');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports a cancellation the SAT is still holding as pending', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ status: 'valid', cancellation_status: 'pending' }))
    );

    const result = await cancelInvoice(credentials, 'fac_123', '02');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.status).toBe('pending');
  });
});

