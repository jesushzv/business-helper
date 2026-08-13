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
let originalCreateObjectURL: typeof URL.createObjectURL;

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

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  // Only the static method — replacing the whole `URL` global takes the
  // *constructor* with it, and jsdom's own fetch plumbing calls `new URL`.
  // In isolation that never surfaces; in a full run it fails four cases here
  // with an unhandled "URL is not a constructor" from tough-cookie.
  originalCreateObjectURL = URL.createObjectURL;
  URL.createObjectURL = (() => 'blob:receipt') as typeof URL.createObjectURL;
  // The real-tenant path. Without this the submit never reaches the API.
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://real-project.supabase.co');
});

afterEach(() => {
  URL.createObjectURL = originalCreateObjectURL;
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

  it('names the missing CLABE instead of an empty box with a dead copy button', async () => {
    // clabe: null is a real state (the demo fixture ships it, and a tenant can
    // exist before registering a bank). The page used to render the empty
    // value inside the copy row, with a copy button whose handler silently
    // did nothing — a control pretending the value exists (#44).
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { milestone: { ...MILESTONE, clabe: null } }));
    render(<PublicPayPortalPage />);

    await screen.findByText(/El proveedor aún no registra su CLABE/i);
    expect(screen.queryByRole('button', { name: /Copiar CLABE/i })).toBeNull();
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
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { success: true }));

    fillMinimum();
    fireEvent.click(submit());

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit];
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
    fetchMock.mockRejectedValueOnce(new Error('offline'));

    fillMinimum();
    fireEvent.click(submit());

    await screen.findByText(/No se pudo contactar al servidor/i);
    expect(screen.queryByText(/¡Comprobante Enviado Exitosamente!/i)).toBeNull();
  });

  it('re-enables the submit after a failure so the payer is not stranded', async () => {
    await renderLoaded();
    fetchMock.mockResolvedValueOnce(jsonResponse(500, { error: { code: 'X', message: 'falló' } }));

    fillMinimum();
    fireEvent.click(submit());

    await screen.findByText('falló');
    await waitFor(() => expect((submit() as HTMLButtonElement).disabled).toBe(false));
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
