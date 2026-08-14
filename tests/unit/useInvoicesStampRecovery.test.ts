import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useInvoices } from '@/lib/hooks/useInvoices';

/**
 * #264 — a refusal that names an existing CFDI is not a stamp failure.
 *
 * stampCFDI mapped EVERY non-OK response to a local `cfdiStatus: 'failed'`,
 * including the three recovery outcomes that mean a real document exists at
 * the SAT (stale-claim adoption 409, post-claim recheck 409, and
 * STAMP_NOT_RECORDED). The screen showed a red "Timbrado fallido" with a
 * "Reintentar timbrado" button over an invoice already filed — the exact
 * affordance the #213 race guard exists to remove. For these codes the hook
 * now reloads the server rows instead of asserting a failure it invented.
 */

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const fetchMock = vi.fn<typeof fetch>();

const receivableRow = (cfdi: Record<string, unknown> = {}) => ({
  id: 'm-1',
  label: 'Anticipo',
  amount: 24500,
  status: 'pending',
  due_date: '2026-09-01',
  cfdi_status: 'none',
  contracts: {
    title: 'Obra civil',
    clients: { name: 'Constructora del Norte', rfc: null, phone: '+528181234567' },
    quotes: { public_token: 'tok-1' },
  },
  ...cfdi,
});

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function mountHook(initialRow = receivableRow()) {
  fetchMock.mockResolvedValueOnce(jsonResponse(200, { receivables: [initialRow] }));
  const rendered = renderHook(() => useInvoices());
  await waitFor(() => expect(rendered.result.current.loading).toBe(false));
  return rendered;
}

describe('stampCFDI recovery outcomes (#264)', () => {
  it('ALREADY_ISSUED: reloads the server row and reports the existing document, never "failed"', async () => {
    const { result } = await mountHook();

    // Adoption 409: the route recorded the orphaned stamp on the milestone
    // before answering, so the reloaded row reads issued.
    fetchMock.mockResolvedValueOnce(
      jsonResponse(409, {
        error: {
          code: 'ALREADY_ISSUED',
          message:
            'Un intento anterior sí timbró la factura (folio fiscal SAT-UUID-1). Ya quedó registrada en este cobro; no se emitió una nueva.',
        },
        uuid: 'SAT-UUID-1',
      })
    );
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        receivables: [
          receivableRow({ cfdi_status: 'issued', cfdi_uuid: 'SAT-UUID-1', cfdi_environment: 'live' }),
        ],
      })
    );

    let outcome;
    await act(async () => {
      outcome = await result.current.stampCFDI('m-1');
    });

    expect(outcome).toMatchObject({ success: true, alreadyIssued: true, uuid: 'SAT-UUID-1' });
    expect(outcome!.message).toMatch(/Un intento anterior sí timbró/);
    // The row shows what the server holds — issued — not an invented failure
    // with a retry button.
    expect(result.current.invoices[0].cfdiStatus).toBe('issued');
    expect(result.current.invoices[0].cfdiUuid).toBe('SAT-UUID-1');
  });

  it('STAMP_NOT_RECORDED: surfaces the instruction without painting the row failed', async () => {
    const { result } = await mountHook();

    // The CFDI exists at the SAT but the milestone could not record it; the
    // row's own status is whatever the server holds, and the retry the route
    // asks for re-adopts rather than re-stamps.
    fetchMock.mockResolvedValueOnce(
      jsonResponse(500, {
        error: {
          code: 'STAMP_NOT_RECORDED',
          message:
            'Un intento anterior timbró la factura con folio fiscal SAT-UUID-1, pero no se pudo guardar en el cobro. Anota el folio y vuelve a intentarlo.',
        },
        uuid: 'SAT-UUID-1',
      })
    );
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { receivables: [receivableRow()] }));

    let outcome;
    await act(async () => {
      outcome = await result.current.stampCFDI('m-1');
    });

    expect(outcome).toMatchObject({ success: false });
    expect(outcome!.error).toMatch(/Anota el folio/);
    // Server said 'none'; the hook must not overwrite that with 'failed'.
    expect(result.current.invoices[0].cfdiStatus).toBe('none');
  });

  it('STAMP_IN_PROGRESS: shows the server state (pending), not a fabricated failure', async () => {
    const { result } = await mountHook();

    fetchMock.mockResolvedValueOnce(
      jsonResponse(409, {
        error: {
          code: 'STAMP_IN_PROGRESS',
          message:
            'Ya hay un timbrado en curso para este cobro. Espera unos segundos y actualiza para ver el resultado, o vuelve a intentarlo en unos minutos.',
        },
      })
    );
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { receivables: [receivableRow({ cfdi_status: 'pending' })] })
    );

    let outcome;
    await act(async () => {
      outcome = await result.current.stampCFDI('m-1');
    });

    expect(outcome).toMatchObject({ success: false });
    expect(result.current.invoices[0].cfdiStatus).toBe('pending');
  });

  it('a genuine PAC failure still marks the row failed with the PAC message', async () => {
    const { result } = await mountHook();

    fetchMock.mockResolvedValueOnce(
      jsonResponse(502, {
        error: { code: 'PAC_ERROR', message: 'El RFC del receptor no es válido.' },
      })
    );

    let outcome;
    await act(async () => {
      outcome = await result.current.stampCFDI('m-1');
    });

    expect(outcome).toMatchObject({ success: false, error: 'El RFC del receptor no es válido.' });
    expect(result.current.invoices[0].cfdiStatus).toBe('failed');
    // No reload for an ordinary failure: mount + stamp only.
    expect(fetchMock.mock.calls).toHaveLength(2);
  });
});
