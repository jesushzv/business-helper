/**
 * A failed client write, carrying the per-field messages the API returned.
 *
 * The hooks threw a bare `Error` holding only prose, so `ClientFormModal` could
 * do nothing but print it in a banner — the tenant was told *that* something
 * was wrong and left to work out *where*. This keeps the `error.fields` map
 * from the envelope attached to the throw so the form can pin each message
 * under the input that caused it.
 *
 * Deliberately in its own module rather than in `lib/clientValidation.ts`:
 * that one imports `libphonenumber-js` through `normalizeClientPhone`, and the
 * modal must not drag ~190 KB of numbering-plan metadata into a mobile bundle
 * just to name a type.
 */
export class ClientWriteError extends Error {
  /** Column name → Spanish message. Empty when the failure was not field-specific. */
  readonly fields: Record<string, string>;
  /** Machine code from the envelope, e.g. `INVALID_PHONE`, `SCHEMA_OUT_OF_DATE`. */
  readonly code: string;

  constructor(message: string, fields: Record<string, string> = {}, code = 'SERVER_ERROR') {
    super(message);
    this.name = 'ClientWriteError';
    this.fields = fields;
    this.code = code;
  }
}

/** Reads the `{ error: { code, message, fields } }` envelope off a failed response. */
export async function readClientWriteError(
  res: Response,
  fallback: string
): Promise<ClientWriteError> {
  const data = await res.json().catch(() => null);
  const error = data?.error;
  const fields =
    error?.fields && typeof error.fields === 'object'
      ? (error.fields as Record<string, string>)
      : {};
  return new ClientWriteError(error?.message || fallback, fields, error?.code || 'SERVER_ERROR');
}
