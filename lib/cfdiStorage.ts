/**
 * Persistence of the documents a PAC returns.
 *
 * The simulation wrote `https://storage.businesshelper.mx/cfdi/<id>.xml` onto
 * the milestone. That host serves nothing: the row described a document that
 * had no bytes anywhere. A real stamp produces two files, and this module is
 * where they land — a private Supabase bucket, one folder per organization.
 *
 * Paths are stored on the milestone, never URLs. A public URL for a private
 * object does not fetch, and a signed one expires within the hour; either would
 * reproduce the original failure in a subtler form — a column that looks like
 * evidence and resolves to nothing. `/api/invoices/[id]/document` signs a fresh
 * URL per request, after checking the session.
 */

export const CFDI_BUCKET = 'cfdi-documents';

/** How long a download link stays valid. Long enough to click, short enough not to circulate. */
export const CFDI_SIGNED_URL_TTL_SECONDS = 300;

export interface CFDIStoragePaths {
  xmlPath: string;
  pdfPath: string;
}

/**
 * Where a stamped document is filed.
 *
 * Keyed by the SAT UUID rather than a timestamp, so re-storing the same
 * document is idempotent and the object name matches what the accountant sees
 * in the XML.
 */
export function cfdiStoragePaths(
  organizationId: string,
  milestoneId: string,
  uuid: string
): CFDIStoragePaths {
  const safeUuid = uuid.replace(/[^a-zA-Z0-9-]/g, '');
  const base = `${organizationId}/${milestoneId}/${safeUuid}`;
  return { xmlPath: `${base}.xml`, pdfPath: `${base}.pdf` };
}

/** The storage client surface used here — the service-role client satisfies it. */
interface StorageCapableClient {
  storage: {
    from(bucket: string): {
      upload(
        path: string,
        body: Uint8Array | Buffer,
        options?: { contentType?: string; upsert?: boolean }
      ): Promise<{ error: { message: string } | null }>;
      createSignedUrl(
        path: string,
        expiresIn: number
      ): Promise<{ data: { signedUrl: string } | null; error: { message: string } | null }>;
    };
  };
}

export type StoreResult =
  | { ok: true; paths: CFDIStoragePaths }
  | { ok: false; message: string };

/**
 * Stores the XML and PDF of a stamped document.
 *
 * A failure here is reported, not swallowed: the CFDI exists at the SAT either
 * way, so the caller records the stamp and tells the user the copies could not
 * be filed — the opposite of the old behaviour, which reported success and
 * stored a link to nothing.
 */
export async function storeCFDIDocuments(
  client: StorageCapableClient,
  organizationId: string,
  milestoneId: string,
  uuid: string,
  documents: { xml: Uint8Array; pdf: Uint8Array }
): Promise<StoreResult> {
  const paths = cfdiStoragePaths(organizationId, milestoneId, uuid);
  const bucket = client.storage.from(CFDI_BUCKET);

  const [xmlUpload, pdfUpload] = await Promise.all([
    bucket.upload(paths.xmlPath, documents.xml, {
      contentType: 'application/xml',
      // The same UUID always names the same bytes, so a retry overwrites
      // rather than colliding.
      upsert: true,
    }),
    bucket.upload(paths.pdfPath, documents.pdf, {
      contentType: 'application/pdf',
      upsert: true,
    }),
  ]);

  const failure = xmlUpload.error || pdfUpload.error;
  if (failure) {
    console.error('[cfdi] document upload failed:', failure.message);
    return { ok: false, message: failure.message };
  }

  return { ok: true, paths };
}

export type SignedUrlResult =
  | { ok: true; url: string }
  | { ok: false; message: string };

/** Signs a short-lived download URL for one stored document. */
export async function signCFDIDocumentUrl(
  client: StorageCapableClient,
  path: string
): Promise<SignedUrlResult> {
  const { data, error } = await client.storage
    .from(CFDI_BUCKET)
    .createSignedUrl(path, CFDI_SIGNED_URL_TTL_SECONDS);

  if (error || !data?.signedUrl) {
    console.error('[cfdi] signing document url failed:', error?.message);
    return { ok: false, message: error?.message || 'No se pudo firmar el enlace' };
  }

  return { ok: true, url: data.signedUrl };
}
