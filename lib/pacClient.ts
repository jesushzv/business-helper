/**
 * PAC client — the layer that actually issues a CFDI.
 *
 * `simulateInvoiceStamping` used to stand in for this: it invented an id and
 * two storage.businesshelper.mx URLs, and `issueInvoiceClient` fell back to it
 * whenever the live call failed or no key was configured. A user could not tell
 * the two outcomes apart, and neither could the database. This module has no
 * such path — a stamp either comes back from a PAC with a SAT UUID, or it is an
 * error the caller must show.
 *
 * The shape follows the target architecture in
 * docs/02-architecture/cfdi_integration_architecture.md §06: one provider-
 * agnostic interface with an adapter per PAC. Facturapi is the adapter that
 * exists; `PacProvider` is where FiscalAPI and SW Sapien attach without the
 * routes changing.
 */

import type { PacEnvironment } from './pacCredentials';

const FACTURAPI_BASE = 'https://www.facturapi.io/v2';

/** Stamping is a synchronous round trip through the PAC to the SAT; it is not instant. */
const STAMP_TIMEOUT_MS = 30_000;
const DOCUMENT_TIMEOUT_MS = 20_000;

export type PacProvider = 'facturapi';

export interface PacCredentials {
  provider: PacProvider;
  apiKey: string;
  environment: PacEnvironment;
  /** Whether the key belongs to the tenant or to the platform's shared PAC account. */
  source: 'organization' | 'platform';
}

export interface StampedCFDI {
  /** The PAC's own id, needed to cancel or re-download the document. */
  providerInvoiceId: string;
  /** The SAT folio fiscal. This is what the taxpayer and their accountant reference. */
  uuid: string;
  /** The PAC's public verification page for the document, when it returns one. */
  verificationUrl: string | null;
  series: string | null;
  folioNumber: number | null;
  total: number | null;
  stampedAt: string;
}

export type PacErrorCode =
  | 'NOT_CONFIGURED'
  | 'REJECTED'
  | 'UNAUTHORIZED'
  | 'UNAVAILABLE'
  | 'TIMEOUT'
  | 'INVALID_RESPONSE';

export type PacResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: PacErrorCode; message: string };

/**
 * SAT cancellation motives (Anexo 20). A CFDI cannot be withdrawn without one,
 * and '01' additionally requires the UUID of the document that replaces it.
 */
export const CFDI_CANCELLATION_MOTIVES: Record<string, string> = {
  '01': 'Comprobante emitido con errores con relación',
  '02': 'Comprobante emitido con errores sin relación',
  '03': 'No se llevó a cabo la operación',
  '04': 'Operación nominativa relacionada en una factura global',
};

/** True when the platform has a PAC account tenants can stamp against. */
export function isPlatformPacConfigured(): boolean {
  const key = (process.env.FACTURAPI_SECRET_KEY || '').trim();
  return key.startsWith('sk_test_') || key.startsWith('sk_live_');
}

/**
 * The platform's own PAC credentials, for tenants who have not connected one.
 *
 * Per §06 of the integration architecture, FACTURAPI_SECRET_KEY is the default
 * account; folios stamped against it are metered by lib/cfdiFolios.ts, since
 * the platform is paying the PAC for them.
 */
export function getPlatformPacCredentials(): PacCredentials | null {
  const apiKey = (process.env.FACTURAPI_SECRET_KEY || '').trim();
  if (!isPlatformPacConfigured()) return null;

  return {
    provider: 'facturapi',
    apiKey,
    environment: apiKey.startsWith('sk_live_') ? 'live' : 'sandbox',
    source: 'platform',
  };
}

function authHeaders(credentials: PacCredentials): Record<string, string> {
  return {
    Authorization: `Bearer ${credentials.apiKey}`,
    'Content-Type': 'application/json',
  };
}

/**
 * Maps a transport or HTTP failure onto a result.
 *
 * The PAC's own message is passed through for 4xx: it names the field the SAT
 * refused ("el RFC del receptor no se encuentra en la lista de contribuyentes",
 * "código postal no coincide con el régimen"), which is exactly what the user
 * needs to fix the invoice. 401/403 is different — that is our configuration
 * problem, not theirs, and its detail describes the account.
 */
async function toPacError(response: Response, context: string): Promise<{
  ok: false;
  code: PacErrorCode;
  message: string;
}> {
  const body = await response.json().catch(() => null);
  const detail =
    (typeof body?.message === 'string' && body.message) ||
    (typeof body?.error === 'string' && body.error) ||
    `HTTP ${response.status}`;

  console.error(`[pac] ${context} failed:`, response.status, detail);

  if (response.status === 401 || response.status === 403) {
    return {
      ok: false,
      code: 'UNAUTHORIZED',
      message: 'Tu PAC rechazó las credenciales de facturación. Revisa la llave conectada.',
    };
  }

  if (response.status >= 400 && response.status < 500) {
    return { ok: false, code: 'REJECTED', message: detail };
  }

  return {
    ok: false,
    code: 'UNAVAILABLE',
    message: 'El PAC no está disponible en este momento. Intenta de nuevo en unos minutos.',
  };
}

function toTransportError(error: unknown, context: string): {
  ok: false;
  code: PacErrorCode;
  message: string;
} {
  const aborted = error instanceof Error && error.name === 'AbortError';
  console.error(`[pac] ${context} failed:`, aborted ? 'timeout' : error);

  return {
    ok: false,
    code: aborted ? 'TIMEOUT' : 'UNAVAILABLE',
    message: aborted
      ? 'El PAC tardó demasiado en responder. Verifica el estado de la factura antes de reintentar.'
      : 'No se pudo contactar al PAC. Intenta de nuevo en unos minutos.',
  };
}

async function withTimeout<T>(
  timeoutMs: number,
  run: (signal: AbortSignal) => Promise<T>
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await run(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Stamps an invoice and returns the SAT UUID.
 *
 * `idempotencyKey` is sent as Facturapi's `external_id` — **which deduplicates
 * nothing**: two POSTs with an identical external_id stamped two CFDIs in the
 * live sandbox (2026-08-12, #26). It is kept as a correlation id for
 * reconciliation, not as a guard. Until a DB-side claim exists (filed
 * separately), the only protections against a double stamp are the caller's
 * ALREADY_ISSUED pre-check — which is check-then-act and races — and the
 * cancellation path. A response without a `uuid` is treated as a failure even
 * on HTTP 200, since a document with no folio fiscal is not a stamped invoice.
 */
export async function stampInvoice(
  credentials: PacCredentials,
  payload: Record<string, unknown>,
  idempotencyKey?: string
): Promise<PacResult<StampedCFDI>> {
  if (!credentials?.apiKey) {
    return {
      ok: false,
      code: 'NOT_CONFIGURED',
      message: 'No hay un PAC conectado para timbrar.',
    };
  }

  const body = idempotencyKey ? { ...payload, external_id: idempotencyKey } : payload;

  try {
    return await withTimeout(STAMP_TIMEOUT_MS, async (signal) => {
      const response = await fetch(`${FACTURAPI_BASE}/invoices`, {
        method: 'POST',
        headers: authHeaders(credentials),
        body: JSON.stringify(body),
        signal,
      });

      if (!response.ok) {
        return toPacError(response, 'stamp');
      }

      const data = await response.json().catch(() => null);

      if (!data?.id || !data?.uuid) {
        console.error('[pac] stamp response missing id/uuid');
        return {
          ok: false as const,
          code: 'INVALID_RESPONSE' as const,
          message: 'El PAC respondió sin folio fiscal. La factura no se registró como timbrada.',
        };
      }

      return {
        ok: true as const,
        data: {
          providerInvoiceId: String(data.id),
          uuid: String(data.uuid),
          verificationUrl:
            typeof data.verification_url === 'string' ? data.verification_url : null,
          series: typeof data.series === 'string' ? data.series : null,
          folioNumber: typeof data.folio_number === 'number' ? data.folio_number : null,
          total: typeof data.total === 'number' ? data.total : null,
          stampedAt:
            typeof data.date === 'string' ? data.date : new Date().toISOString(),
        },
      };
    });
  } catch (error) {
    return toTransportError(error, 'stamp');
  }
}

/**
 * Confirms a key can talk to the PAC before it is stored.
 *
 * Without this, a mistyped key is accepted by the settings form and only
 * surfaces later, as a failed stamp on an invoice someone needed to send. The
 * lightest authenticated call Facturapi offers is a one-item invoice listing.
 */
export async function verifyPacCredentials(
  credentials: PacCredentials
): Promise<PacResult<{ environment: PacEnvironment }>> {
  try {
    return await withTimeout(DOCUMENT_TIMEOUT_MS, async (signal) => {
      const response = await fetch(`${FACTURAPI_BASE}/invoices?limit=1`, {
        headers: authHeaders(credentials),
        signal,
      });

      if (!response.ok) return toPacError(response, 'verify credentials');

      return { ok: true as const, data: { environment: credentials.environment } };
    });
  } catch (error) {
    return toTransportError(error, 'verify credentials');
  }
}

export interface CFDIDocuments {
  xml: Uint8Array;
  pdf: Uint8Array;
}

/**
 * Downloads the XML and PDF of a stamped document.
 *
 * The XML is the fiscal document — the PDF is a rendering of it — so both are
 * fetched and stored. Losing them to a lapsed PAC account would leave the
 * taxpayer holding a UUID and nothing to hand their accountant.
 */
export async function downloadCFDIDocuments(
  credentials: PacCredentials,
  providerInvoiceId: string
): Promise<PacResult<CFDIDocuments>> {
  try {
    return await withTimeout(DOCUMENT_TIMEOUT_MS, async (signal) => {
      const [xmlResponse, pdfResponse] = await Promise.all([
        fetch(`${FACTURAPI_BASE}/invoices/${encodeURIComponent(providerInvoiceId)}/xml`, {
          headers: { Authorization: `Bearer ${credentials.apiKey}` },
          signal,
        }),
        fetch(`${FACTURAPI_BASE}/invoices/${encodeURIComponent(providerInvoiceId)}/pdf`, {
          headers: { Authorization: `Bearer ${credentials.apiKey}` },
          signal,
        }),
      ]);

      if (!xmlResponse.ok) return toPacError(xmlResponse, 'download xml');
      if (!pdfResponse.ok) return toPacError(pdfResponse, 'download pdf');

      const [xml, pdf] = await Promise.all([
        xmlResponse.arrayBuffer(),
        pdfResponse.arrayBuffer(),
      ]);

      return {
        ok: true as const,
        data: { xml: new Uint8Array(xml), pdf: new Uint8Array(pdf) },
      };
    });
  } catch (error) {
    return toTransportError(error, 'download documents');
  }
}

export interface CancelledCFDI {
  providerInvoiceId: string;
  status: string;
  cancelledAt: string;
}

/**
 * Requests cancellation of a stamped document.
 *
 * The SAT may leave the request pending its recipient's approval — motive '02'
 * on a document over $1,000 MXN needs the receiver to accept — so the returned
 * status is reported rather than assumed to be final.
 */
export async function cancelInvoice(
  credentials: PacCredentials,
  providerInvoiceId: string,
  motive: string,
  substitutionUuid?: string
): Promise<PacResult<CancelledCFDI>> {
  if (!CFDI_CANCELLATION_MOTIVES[motive]) {
    return {
      ok: false,
      code: 'REJECTED',
      message: 'El motivo de cancelación no es válido para el SAT (01, 02, 03 o 04).',
    };
  }

  if (motive === '01' && !substitutionUuid) {
    return {
      ok: false,
      code: 'REJECTED',
      message: 'El motivo 01 requiere el folio fiscal de la factura que la sustituye.',
    };
  }

  const params = new URLSearchParams({ motive });
  if (substitutionUuid) params.set('substitution', substitutionUuid);

  try {
    return await withTimeout(STAMP_TIMEOUT_MS, async (signal) => {
      const response = await fetch(
        `${FACTURAPI_BASE}/invoices/${encodeURIComponent(providerInvoiceId)}?${params.toString()}`,
        {
          method: 'DELETE',
          headers: authHeaders(credentials),
          signal,
        }
      );

      if (!response.ok) return toPacError(response, 'cancel');

      const data = await response.json().catch(() => null);

      return {
        ok: true as const,
        data: {
          providerInvoiceId,
          // Facturapi reports 'canceled' once the SAT accepts, and leaves
          // cancellation_status 'pending' while a recipient's approval is
          // outstanding. Either way the request was filed.
          status:
            typeof data?.cancellation_status === 'string' && data.cancellation_status
              ? data.cancellation_status
              : typeof data?.status === 'string'
                ? data.status
                : 'canceled',
          cancelledAt: new Date().toISOString(),
        },
      };
    });
  } catch (error) {
    return toTransportError(error, 'cancel');
  }
}
