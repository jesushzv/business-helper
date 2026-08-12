/**
 * Resolves which PAC account an organization stamps through.
 *
 * One source (BYOK decision, docs/STATUS.md §05): the organization's own PAC
 * key, connected in Ajustes. Its CSD lives with its PAC; we hold a revocable
 * API key and nothing else. The platform never stamps on a tenant's behalf —
 * the FACTURAPI_SECRET_KEY fallback that used to sit behind this was removed
 * with #221.
 *
 * There is no second source. When no key is connected the caller gets an
 * error — the previous behaviour, falling through to a fabricated stamp, is
 * what made the product record invoices the SAT had never seen.
 */

import { openPacApiKey, detectPacEnvironment } from './pacCredentials';
import { type PacCredentials, type PacProvider } from './pacClient';

/** The query surface used here; the service-role client satisfies it. */
interface QueryableClient {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from(table: string): any;
}

export interface PacConnectionRow {
  provider: PacProvider;
  api_key_sealed: string;
  api_key_hint: string;
  environment: 'sandbox' | 'live';
  updated_at?: string;
}

export type PacResolution =
  | { ok: true; credentials: PacCredentials }
  | { ok: false; code: 'PAC_NOT_CONNECTED' | 'PAC_KEY_UNREADABLE'; message: string };

/**
 * Reads the organization's connection.
 *
 * A stored key that will not open — PAC_ENCRYPTION_KEY rotated, row tampered
 * with — is reported as its own case: reconnecting the key in Ajustes is the
 * fix, and nothing else may stamp in its place.
 */
export async function resolvePacCredentials(
  client: QueryableClient,
  organizationId: string
): Promise<PacResolution> {
  const { data: connection } = await client
    .from('pac_connections')
    .select('provider, api_key_sealed, environment')
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (connection?.api_key_sealed) {
    const apiKey = openPacApiKey(connection.api_key_sealed);

    if (!apiKey) {
      return {
        ok: false,
        code: 'PAC_KEY_UNREADABLE',
        message:
          'No se pudo leer la llave de tu PAC. Vuelve a conectarla en Ajustes para timbrar.',
      };
    }

    return {
      ok: true,
      credentials: {
        provider: (connection.provider as PacProvider) || 'facturapi',
        apiKey,
        // The key itself is authoritative about which environment it reaches;
        // the stored column is a cache of the same fact.
        environment:
          detectPacEnvironment(apiKey) ||
          (connection.environment === 'live' ? 'live' : 'sandbox'),
        source: 'organization',
      },
    };
  }

  return {
    ok: false,
    code: 'PAC_NOT_CONNECTED',
    message:
      'La facturación CFDI requiere conectar tu PAC. Agrega tu llave de Facturapi en Ajustes para emitir facturas.',
  };
}
