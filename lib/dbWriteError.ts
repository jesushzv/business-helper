import { NextResponse } from 'next/server';
import { captureException } from '@/lib/sentry';
import { publicApiError } from '@/lib/publicApiError';

/**
 * Turns a failed Supabase write into something the person who triggered it can act on.
 *
 * Every write in the clients routes collapsed any database failure into one
 * 500 and nine words — "No se pudo crear el cliente" — with nothing logged.
 * A column missing from the schema cache, a CHECK the value tripped, a
 * permission denial and a genuine outage were indistinguishable on screen *and*
 * in the logs, so an owner who could not register a client had no way to learn
 * why and no way to tell anyone. That opacity is the defect; the varying
 * causes were secondary.
 *
 * What comes back is a Spanish message naming the cause in plain language, the
 * column to blame where one is identifiable, and a status that says whether the
 * caller can fix it. The raw error goes to `captureException` either way, so
 * the detail exists somewhere even when the message stays general.
 *
 * No jargon reaches the tenant (hard rule 8): no constraint names, no SQLSTATE,
 * no "RLS". Those go to the log.
 */

export interface DbWriteFailure {
  status: number;
  code: string;
  message: string;
  /** Column the failure belongs to, when it can be attributed. */
  field?: string;
}

export interface DescribeOptions {
  /**
   * Who is going to read the message.
   *
   * `'tenant'` (default) is the person who signed up: they own the data, so
   * naming a column or their organization helps them act. `'client'` is the
   * tenant's *customer* on `/q/[token]` or `/pay/[token]` — they did not sign
   * up, they cannot fix a schema or a permission, and a column name means
   * nothing to them (#65). Client prose therefore never names a column, never
   * says "tu organización", and never blames the reader for a system fault.
   */
  audience?: 'tenant' | 'client';
  /** Verb for the prose that names the operation: `guardar` (default), `eliminar`, `actualizar`. */
  verb?: string;
}

interface PostgrestLikeError {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
}

/** CHECK constraints on `clients`, mapped to the input that produced them. */
const CONSTRAINT_FIELDS: Record<string, { field: string; message: string }> = {
  chk_client_credit_limit_non_negative: {
    field: 'credit_limit',
    message: 'El límite de crédito no puede ser negativo.',
  },
  chk_client_credit_days_non_negative: {
    field: 'credit_days',
    message: 'El plazo de crédito no puede ser negativo.',
  },
  chk_client_credit_status_valid: {
    field: 'credit_status',
    message: 'El estatus de crédito debe ser Activo, Suspendido o Bloqueado.',
  },
  chk_client_health_score_range: {
    field: 'health_score',
    message: 'El score de salud del cliente quedó fuera de rango.',
  },
};

/**
 * The column PostgREST could not find, lifted out of its message.
 *
 * PGRST204 reads: `Could not find the 'credit_limit' column of 'clients' in the
 * schema cache`. It means the deploy is ahead of the database — a migration in
 * the repo that nobody applied (hard rule 6). Naming the column turns a
 * mystifying failure into a one-line answer for whoever runs the migration.
 */
function missingColumn(error: PostgrestLikeError): string | null {
  const match = /'([a-z0-9_]+)' column/i.exec(String(error.message || ''));
  return match ? match[1] : null;
}

/**
 * The constraint Postgres names, out of a message that quotes more than one.
 *
 * The real wording is `new row for relation "clients" violates check
 * constraint "chk_client_credit_limit_non_negative"` — two quoted tokens, and
 * taking the first takes the *table*. This read the first for as long as it
 * existed, so no CHECK was ever attributed to its input in production; the
 * only test covering it used a shortened message with the table elided, which
 * is what kept it green (CLAUDE.md rule 7 — the test was pinning the defect).
 */
function constraintName(error: PostgrestLikeError): string | null {
  const haystack = `${error.message || ''} ${error.details || ''}`;
  const quoted = [...haystack.matchAll(/"([a-z0-9_]+)"/gi)].map((m) => m[1]);
  if (quoted.length === 0) return null;

  const known = quoted.find((name) => name in CONSTRAINT_FIELDS);
  if (known) return known;

  // Not one we map: the token right after the word "constraint" is still the
  // constraint, and the last quoted token is the constraint in every Postgres
  // constraint-violation message.
  const explicit = /constraint\s+"([a-z0-9_]+)"/i.exec(haystack);
  return explicit ? explicit[1] : quoted[quoted.length - 1];
}

/**
 * Client-facing prose for each classification, by code.
 *
 * The classification is the same work either way — only the reader changes.
 * Nothing here names a column, an organization or a constraint: the payer on
 * `/pay/[token]` can act on none of them, and the detail is already in the log.
 */
function forClient(failure: DbWriteFailure): DbWriteFailure {
  const messages: Record<string, string> = {
    // Usted, like the rest of the copy on /q/ and /pay/: the reader is the
    // tenant's customer, not the tenant.
    SCHEMA_OUT_OF_DATE:
      'No pudimos completar la operación por un problema del sistema. ' +
      'No es un error de sus datos: intente de nuevo en unos minutos o avise al negocio.',
    INVALID_INPUT: 'Alguno de los datos capturados no es válido. Revíselos e inténtelo de nuevo.',
    DUPLICATE: 'Estos datos ya fueron registrados.',
    FORBIDDEN:
      'No pudimos completar la operación por un problema del sistema. ' +
      'Intente de nuevo o avise al negocio.',
    SERVER_ERROR:
      'No pudimos completar la operación. Intente de nuevo; si sigue fallando, avise al negocio.',
  };

  return {
    // A permission denial is the *system's* problem seen from this side, not
    // the reader's — answering 403 would invite a page to tell a paying client
    // they are not allowed to pay.
    status: failure.status === 403 ? 500 : failure.status,
    code: failure.code,
    message: messages[failure.code] || messages.SERVER_ERROR,
  };
}

/**
 * @param error    the error object Supabase returned
 * @param entity   the noun for the fallback message, e.g. `'el cliente'`
 * @param route    route name for the log entry
 * @param options  audience and verb for the prose (see `DescribeOptions`)
 */
export function describeDbWriteError(
  error: unknown,
  entity: string,
  route: string,
  options: DescribeOptions = {}
): DbWriteFailure {
  const verb = options.verb || 'guardar';
  const e = (error || {}) as PostgrestLikeError;
  const code = String(e.code || '');

  captureException(error, {
    route,
    level: 'error',
    tags: { db_error_code: code || 'unknown' },
    extra: { message: e.message, details: e.details, hint: e.hint },
  });

  const describe = (failure: DbWriteFailure): DbWriteFailure =>
    options.audience === 'client' ? forClient(failure) : failure;

  // The deploy is ahead of the schema. Not the tenant's fault and not
  // something they can fix, so it says so instead of blaming their input.
  if (code === 'PGRST204' || code === '42703') {
    const column = missingColumn(e);
    return describe({
      status: 503,
      code: 'SCHEMA_OUT_OF_DATE',
      message: column
        ? `La base de datos todavía no tiene el campo «${column}». No es un error de tus datos: ` +
          `necesitamos actualizar la base de datos antes de ${verb}.`
        : 'La base de datos está desactualizada respecto a la aplicación. ' +
          'No es un error de tus datos.',
    });
  }

  if (code === '23514') {
    const known = CONSTRAINT_FIELDS[constraintName(e) || ''];
    if (known) {
      return describe({
        status: 400,
        code: 'INVALID_INPUT',
        message: known.message,
        field: known.field,
      });
    }
    return describe({
      status: 400,
      code: 'INVALID_INPUT',
      message: 'Uno de los valores capturados no es válido. Revisa los montos y las fechas.',
    });
  }

  if (code === '23505') {
    // One organization per owner is a schema invariant as of
    // 20260811150000 (#109/#168), so this collision is reachable by an owner
    // who reopens onboarding or double-submits it. The generic wording below
    // ("…con esos datos en tu organización") is nonsense here, where the
    // duplicate *is* the organization, and it hides the one useful fact: they
    // already have one, and nothing was lost.
    //
    // Routed through `describe` like every other arm since #177, so the
    // client-audience redaction applies to this message too rather than this
    // one case bypassing it.
    if (constraintName(e) === 'uq_organizations_owner_id') {
      return describe({
        status: 409,
        code: 'ORGANIZATION_EXISTS',
        message:
          'Tu cuenta ya tiene un negocio registrado. No se creó uno nuevo; ' +
          'puedes editar los datos del que ya tienes en Ajustes.',
      });
    }

    return describe({
      status: 409,
      code: 'DUPLICATE',
      message: `Ya existe ${entity} con esos datos en tu organización.`,
    });
  }

  // 23502 not-null, 22001 value too long, 22003 numeric out of range: the
  // value reached the column and the column refused it.
  if (code === '23502') {
    const column = missingColumn(e);
    return describe({
      status: 400,
      code: 'INVALID_INPUT',
      message: column
        ? `Falta un dato obligatorio: «${column}».`
        : 'Falta un dato obligatorio.',
      field: column || undefined,
    });
  }

  if (code === '22001') {
    return describe({
      status: 400,
      code: 'INVALID_INPUT',
      message: 'Uno de los textos capturados es demasiado largo. Acórtalo e inténtalo de nuevo.',
    });
  }

  if (code === '22003' || code === '22P02') {
    return describe({
      status: 400,
      code: 'INVALID_INPUT',
      message: 'Uno de los números capturados está fuera del rango permitido.',
    });
  }

  // Row-level security refused the write. Said without the acronym.
  if (code === '42501' || code === 'PGRST301') {
    return describe({
      status: 403,
      code: 'FORBIDDEN',
      message: `Tu cuenta no tiene permiso para ${verb} ${entity} en esta organización.`,
    });
  }

  if (code === '23503') {
    return describe({
      status: 400,
      code: 'INVALID_INPUT',
      message: 'Uno de los registros relacionados ya no existe. Recarga la página e inténtalo de nuevo.',
    });
  }

  return describe({
    status: 500,
    code: 'SERVER_ERROR',
    message: `No se pudo ${verb} ${entity}. Vuelve a intentarlo; si sigue fallando, avísanos.`,
  });
}

/**
 * The tenant-facing envelope for a failed write, ready to return from a route.
 *
 * Eleven routes carried the same eight lines — branch on `error`, hardcode a
 * Spanish sentence, discard the error (#148). One call keeps the envelope
 * identical everywhere (CLAUDE.md API convention 2), keeps the column on
 * `error.fields` where the failure has one so the form can pin the message to
 * its input (#146), and logs the original either way.
 */
export function dbWriteErrorResponse(
  error: unknown,
  entity: string,
  route: string,
  options: DescribeOptions = {}
): NextResponse {
  const failure = describeDbWriteError(error, entity, route, options);
  return NextResponse.json(
    {
      error: {
        code: failure.code,
        message: failure.message,
        ...(failure.field ? { fields: { [failure.field]: failure.message } } : {}),
      },
    },
    { status: failure.status }
  );
}

/**
 * The same, for the public routes a tenant's *client* reaches by shared link.
 *
 * The envelope stays `publicApiError`'s and the `code` stays the operation's —
 * `SIGNATURE_WRITE_FAILED`, `RECEIPT_WRITE_FAILED` — because that is what the
 * page branches on and what tells the reader which step failed. What changes is
 * that the error is now classified rather than discarded: the status separates
 * "our schema is behind" (503) from "your value was refused" (400) from a
 * genuine outage (500), the prose is written for someone who did not sign up,
 * and the raw error reaches the log instead of nowhere.
 */
export function publicDbWriteErrorResponse(
  error: unknown,
  params: {
    /**
     * Operation code the page branches on, e.g. `'RECEIPT_WRITE_FAILED'`.
     *
     * Named `operation` rather than `code` on purpose: `publicErrorEnvelope`'s
     * gate reads these routes as source and fails on a `code:` key, because a
     * sibling `code` beside the envelope is what #65 was.
     */
    operation: string;
    entity: string;
    route: string;
    verb?: string;
    /**
     * What the reader should do next, when the operation has a specific answer
     * — "Solicite uno nuevo." for an OTP that was delivered but not stored.
     * Appended to the classified message; the classification never knows this.
     */
    instruction?: string;
    extra?: Record<string, unknown>;
  }
): NextResponse {
  const failure = describeDbWriteError(error, params.entity, params.route, {
    audience: 'client',
    verb: params.verb,
  });
  const message = params.instruction
    ? `${failure.message} ${params.instruction}`
    : failure.message;
  return publicApiError(failure.status, params.operation, message, params.extra);
}
