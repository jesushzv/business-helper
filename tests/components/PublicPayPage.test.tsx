import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import PublicPayPortalPage from '@/app/pay/[token]/page';

/**
 * `/pay/[token]` — the page a paying client sees, and the last entry of #149's
 * signing loop.
 *
 * #146's lesson is that a layer-by-layer suite cannot see a defect between the
 * layers: every function involved in client registration passed its own tests
 * while the form was impossible to finish. Nothing here rendered this page at
 * all, and it is the page where the failure lands on the tenant's *customer*
 * rather than the tenant — mid-payment, with money already transferred.
 *
 * The question each case asks is the payer's: *can I declare my transfer, and
 * am I told the truth about what happened to it?* The second half matters as
 * much as the first — a confirmation for a declaration the API rejected is
 * #58/#86, and this page has shipped it before, from its own catch block.
 *
 * `isClientDemoMode()` defaults to **on** under Vitest, because
 * `NEXT_PUBLIC_SUPABASE_URL` is unset — and the demo branch short-circuits the
 * submit before the fetch. Every real-tenant case therefore stubs the variable,
 * or it would assert nothing at all (LESSONS, client/server state).
 */

vi.mock('next/navigation', () => ({
  useParams: () => ({ token: 'tok-real-1' }),
}));

const MILESTONE = {
  id: 'm-1',
  label: 'Anticipo 50%',
  amount: 24500,
  due_date: '2026-09-15',
  status: 'pending',
  contract_title: 'Impermeabilización Nave Industrial',
  client_name: 'Constructora del Bajío',
  org_name: 'Impermeabilizantes Cavazos',
  bank_name: 'BBVA',
  clabe: '012180001234567897',
  beneficiary: 'Impermeabilizantes Cavazos SA de CV',
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const fetchMock = vi.fn<typeof fetch>();

/** A payer's receipt: the validator accepts PNG/JPG/PDF under 5MB. */
function receiptFile(name = 'comprobante-spei.pdf', type = 'application/pdf', size = 240_000) {
  const file = new File(['x'], name, { type });
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

function fileInput(): HTMLInputElement {
  return document.querySelector('input[type="file"]') as HTMLInputElement;
}

const trackingInput = () =>
  screen.getByPlaceholderText(/SPEI20260830123456/i) as HTMLInputElement;
const submit = () => screen.getByRole('button', { name: /Enviar Comprobante SPEI/i });

/** Renders with the milestone loaded, the state every submit case starts from. */
async function renderLoaded() {
  fetchMock.mockResolvedValueOnce(jsonResponse(200, { milestone: MILESTONE }));
  render(<PublicPayPortalPage />);
  await screen.findByText('Anticipo 50%');
}

/** The minimum a payer must supply: a clave de rastreo and a receipt file. */
function fillMinimum(reference = 'SPEI20260830123456') {
  fireEvent.change(trackingInput(), { target: { value: reference } });
  fireEvent.change(fileInput(), { target: { files: [receiptFile()] } });
}

/** Queues the receipt upload (#85) that now precedes every declaration. */
function mockUploadOk() {
  fetchMock.mockResolvedValueOnce(
    jsonResponse(200, { success: true, receipt_path: 'org-1/spei_m-1_1723500000000.pdf' })
  );
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  // No URL.createObjectURL stub: the page no longer mints blob: URLs at all
  // (#85) — the file goes to the upload endpoint as FormData instead.
  // The real-tenant path. Without this the submit never reaches the API.
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://real-project.supabase.co');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('what the payer is shown before paying', () => {
  it('shows the amount, the CLABE and the beneficiary the API returned', async () => {
    await renderLoaded();

    expect(screen.getByText('012180001234567897')).toBeTruthy();
    expect(screen.getByText('Impermeabilizantes Cavazos SA de CV')).toBeTruthy();
    expect(screen.getByText(/\$24,500\.00/)).toBeTruthy();
    expect(screen.getByText('BBVA')).toBeTruthy();
  });

  it('tells a payer whose vendor has no bank account that the link is fine', async () => {
    // "El enlace no existe" would send them back to the vendor for a link that
    // works — the business simply has no CLABE yet.
    fetchMock.mockResolvedValueOnce(
      jsonResponse(409, { error: { code: 'ORG_BANK_DETAILS_MISSING', message: '...' } })
    );
    render(<PublicPayPortalPage />);

    await screen.findByText(/Pago No Disponible Por El Momento/i);
    expect(screen.queryByText(/no existe o ha expirado/i)).toBeNull();
  });

  it('tells a payer who already declared that it was recorded, not that it vanished', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(409, { error: { code: 'PAYMENT_ALREADY_RECORDED', message: '...' } })
    );
    render(<PublicPayPortalPage />);

    await screen.findByText(/Este Cobro Ya Fue Registrado/i);
  });

  it('shows no CLABE at all when the read fails', async () => {
    // A client-side fallback here would put an account number on screen that no
    // organization owns, in front of someone about to transfer money to it.
    fetchMock.mockRejectedValueOnce(new Error('network down'));
    render(<PublicPayPortalPage />);

    await screen.findByText(/Enlace de Pago No Encontrado/i);
    expect(screen.queryByText(/CLABE/i)).toBeNull();
  });
});

describe('declaring the transfer', () => {
  it('goes through with the clave de rastreo and a receipt, amount pre-filled', async () => {
    await renderLoaded();
    mockUploadOk();
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { success: true }));

    fillMinimum();
    fireEvent.click(submit());

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    const [url, init] = fetchMock.mock.calls[2] as [string, RequestInit];
    expect(url).toBe('/api/receivables/public/tok-real-1');
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toMatchObject({
      tracking_reference: 'SPEI20260830123456',
      transferred_amount: 24500,
    });

    await screen.findByText(/¡Comprobante Enviado Exitosamente!/i);
  });

  it('names the missing piece rather than failing silently', async () => {
    await renderLoaded();

    // A clave de rastreo too short to be one: the payer is told what is wrong
    // with the value they typed, and nothing is sent. (The assertion is on the
    // message, not on "Clave de Rastreo" — that string is also the field's
    // label, and matching it would pass with no error rendered at all.)
    fireEvent.change(trackingInput(), { target: { value: 'SPEI12' } });
    fireEvent.change(fileInput(), { target: { files: [receiptFile()] } });
    fireEvent.click(submit());
    await screen.findByText(/al menos 8 caracteres/i);
    expect(fetchMock).toHaveBeenCalledTimes(1);

  });

  it('asks for the receipt when only the clave was entered', async () => {
    await renderLoaded();

    fireEvent.change(trackingInput(), { target: { value: 'SPEI20260830123456' } });
    fireEvent.click(submit());

    await screen.findByText(/Por favor selecciona o adjunta tu comprobante/i);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('refuses a receipt the validator rejects, and does not keep it', async () => {
    await renderLoaded();

    fireEvent.change(fileInput(), {
      target: { files: [receiptFile('video.mov', 'video/quicktime', 900_000)] },
    });

    expect(screen.getByText(/Haz clic para seleccionar comprobante/i)).toBeTruthy();
    expect(screen.queryByText('video.mov')).toBeNull();
  });
});

describe('a declaration the API did not record is never shown as one (#58/#86)', () => {
  it('renders the API’s message and keeps the form open on a rejected write', async () => {
    await renderLoaded();
    mockUploadOk();
    fetchMock.mockResolvedValueOnce(
      jsonResponse(503, {
        error: {
          code: 'RECEIPT_WRITE_FAILED',
          message: 'No pudimos completar la operación por un problema del sistema.',
        },
      })
    );

    fillMinimum();
    fireEvent.click(submit());

    await screen.findByText(/No pudimos completar la operación/i);
    expect(screen.queryByText(/¡Comprobante Enviado Exitosamente!/i)).toBeNull();
    // Still submittable: the payer can retry without re-entering everything.
    expect(trackingInput().value).toBe('SPEI20260830123456');
  });

  it('reports a network failure as a failure, not from the catch as a success', async () => {
    await renderLoaded();
    mockUploadOk();
    fetchMock.mockRejectedValueOnce(new Error('offline'));

    fillMinimum();
    fireEvent.click(submit());

    await screen.findByText(/No se pudo contactar al servidor/i);
    expect(screen.queryByText(/¡Comprobante Enviado Exitosamente!/i)).toBeNull();
  });

  it('re-enables the submit after a failure so the payer is not stranded', async () => {
    await renderLoaded();
    mockUploadOk();
    fetchMock.mockResolvedValueOnce(jsonResponse(500, { error: { code: 'X', message: 'falló' } }));

    fillMinimum();
    fireEvent.click(submit());

    await screen.findByText('falló');
    await waitFor(() => expect((submit() as HTMLButtonElement).disabled).toBe(false));
  });
});

describe('#85 — the receipt leaves the machine, and no blob: URL ever does', () => {
  const uploadOk = () =>
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { success: true, receipt_path: 'org-1/spei_m-1_1723500000000.pdf' })
    );

  it('uploads the attached file to the public upload endpoint before declaring', async () => {
    await renderLoaded();
    uploadOk();
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { success: true }));

    fillMinimum();
    fireEvent.click(submit());

    await screen.findByText(/¡Comprobante Enviado Exitosamente!/i);

    const uploadCall = fetchMock.mock.calls.find(([url]) => String(url).includes('/upload'));
    expect(uploadCall).toBeTruthy();
    const [uploadUrl, uploadInit] = uploadCall as [string, RequestInit];
    expect(uploadUrl).toBe('/api/receivables/public/tok-real-1/upload');
    expect(uploadInit.method).toBe('POST');
    // The file itself, as multipart form data — not a JSON body about a file.
    expect(uploadInit.body).toBeInstanceOf(FormData);
    expect((uploadInit.body as FormData).get('file')).toBeInstanceOf(File);
  });

  it('sends the server-issued receipt_path in the declaration, never a receipt_url', async () => {
    await renderLoaded();
    uploadOk();
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { success: true }));

    fillMinimum();
    fireEvent.click(submit());

    await screen.findByText(/¡Comprobante Enviado Exitosamente!/i);

    const declaration = fetchMock.mock.calls.find(
      ([url, init]) =>
        String(url) === '/api/receivables/public/tok-real-1' && init?.method === 'POST'
    );
    expect(declaration).toBeTruthy();
    const sent = JSON.parse(String((declaration as [string, RequestInit])[1].body));
    expect(sent.receipt_path).toBe('org-1/spei_m-1_1723500000000.pdf');
    expect(sent.receipt_url).toBeUndefined();

    // A blob: URL dereferences only inside this browser tab; storing one gives
    // the vendor a dead "receipt" link for a real payment (#85). Nothing the
    // page sends may carry one.
    for (const [, init] of fetchMock.mock.calls) {
      if (typeof init?.body === 'string') {
        expect(init.body).not.toContain('blob:');
      }
    }
  });

  it('declares without a receipt — and says so — when the upload fails', async () => {
    // Decided on #85: the clave de rastreo is the load-bearing evidence
    // (Banxico resolves it); a storage outage must not block the payer from
    // registering a transfer already made. The declaration proceeds
    // receipt-less and the payer is told the file did not attach.
    await renderLoaded();
    fetchMock.mockResolvedValueOnce(
      jsonResponse(502, {
        error: { code: 'RECEIPT_UPLOAD_FAILED', message: 'No se pudo guardar el comprobante.' },
      })
    );
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { success: true }));

    fillMinimum();
    fireEvent.click(submit());

    await screen.findByText(/¡Comprobante Enviado Exitosamente!/i);
    // The truth about the file, on the confirmation the payer reads.
    await screen.findByText(/no se pudo adjuntar/i);

    const declaration = fetchMock.mock.calls.find(
      ([url, init]) =>
        String(url) === '/api/receivables/public/tok-real-1' && init?.method === 'POST'
    );
    const sent = JSON.parse(String((declaration as [string, RequestInit])[1].body));
    expect(sent.receipt_path).toBeUndefined();
    expect(sent.receipt_url).toBeUndefined();
  });

  it('declares without a receipt when the upload network-fails', async () => {
    await renderLoaded();
    fetchMock.mockRejectedValueOnce(new Error('offline durante la subida'));
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { success: true }));

    fillMinimum();
    fireEvent.click(submit());

    await screen.findByText(/¡Comprobante Enviado Exitosamente!/i);
    await screen.findByText(/no se pudo adjuntar/i);
  });
});

describe('the marketing demo, and only it, may simulate the write', () => {
  it('confirms without calling the API when the deployment has no backend', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    await renderLoaded();

    fillMinimum();
    fireEvent.click(submit());

    await screen.findByText(/¡Comprobante Enviado Exitosamente!/i);
    // The read happened; the write never did — and that is the *only* branch
    // allowed to short-circuit it, before the fetch rather than in a catch.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
