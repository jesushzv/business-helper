import { captureException } from '@/lib/sentry';

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

function constraintName(error: PostgrestLikeError): string | null {
  const haystack = `${error.message || ''} ${error.details || ''}`;
  const match = /"([a-z0-9_]+)"/i.exec(haystack);
  return match ? match[1] : null;
}

/**
 * @param error   the error object Supabase returned
 * @param entity  the noun for the fallback message, e.g. `'el cliente'`
 * @param route   route name for the log entry
 */
export function describeDbWriteError(
  error: unknown,
  entity: string,
  route: string
): DbWriteFailure {
  const e = (error || {}) as PostgrestLikeError;
  const code = String(e.code || '');

  captureException(error, {
    route,
    level: 'error',
    tags: { db_error_code: code || 'unknown' },
    extra: { message: e.message, details: e.details, hint: e.hint },
  });

  // The deploy is ahead of the schema. Not the tenant's fault and not
  // something they can fix, so it says so instead of blaming their input.
  if (code === 'PGRST204' || code === '42703') {
    const column = missingColumn(e);
    return {
      status: 503,
      code: 'SCHEMA_OUT_OF_DATE',
      message: column
        ? `La base de datos todavía no tiene el campo «${column}». No es un error de tus datos: ` +
          'necesitamos actualizar la base de datos antes de guardar.'
        : 'La base de datos está desactualizada respecto a la aplicación. ' +
          'No es un error de tus datos.',
    };
  }

  if (code === '23514') {
    const known = CONSTRAINT_FIELDS[constraintName(e) || ''];
    if (known) {
      return { status: 400, code: 'INVALID_INPUT', message: known.message, field: known.field };
    }
    return {
      status: 400,
      code: 'INVALID_INPUT',
      message: 'Uno de los valores capturados no es válido. Revisa los montos y las fechas.',
    };
  }

  if (code === '23505') {
    // One organization per owner is a schema invariant as of
    // 20260811150000 (#109/#168), so this collision is reachable by an owner
    // who reopens onboarding or double-submits it. The generic wording below
    // ("…con esos datos en tu organización") is nonsense here, where the
    // duplicate *is* the organization, and it hides the one useful fact: they
    // already have one, and nothing was lost.
    if (constraintName(e) === 'uq_organizations_owner_id') {
      return {
        status: 409,
        code: 'ORGANIZATION_EXISTS',
        message:
          'Tu cuenta ya tiene un negocio registrado. No se creó uno nuevo; ' +
          'puedes editar los datos del que ya tienes en Ajustes.',
      };
    }

    return {
      status: 409,
      code: 'DUPLICATE',
      message: `Ya existe ${entity} con esos datos en tu organización.`,
    };
  }

  // 23502 not-null, 22001 value too long, 22003 numeric out of range: the
  // value reached the column and the column refused it.
  if (code === '23502') {
    const column = missingColumn(e);
    return {
      status: 400,
      code: 'INVALID_INPUT',
      message: column
        ? `Falta un dato obligatorio: «${column}».`
        : 'Falta un dato obligatorio.',
      field: column || undefined,
    };
  }

  if (code === '22001') {
    return {
      status: 400,
      code: 'INVALID_INPUT',
      message: 'Uno de los textos capturados es demasiado largo. Acórtalo e inténtalo de nuevo.',
    };
  }

  if (code === '22003' || code === '22P02') {
    return {
      status: 400,
      code: 'INVALID_INPUT',
      message: 'Uno de los números capturados está fuera del rango permitido.',
    };
  }

  // Row-level security refused the write. Said without the acronym.
  if (code === '42501' || code === 'PGRST301') {
    return {
      status: 403,
      code: 'FORBIDDEN',
      message: `Tu cuenta no tiene permiso para guardar ${entity} en esta organización.`,
    };
  }

  if (code === '23503') {
    return {
      status: 400,
      code: 'INVALID_INPUT',
      message: 'Uno de los registros relacionados ya no existe. Recarga la página e inténtalo de nuevo.',
    };
  }

  return {
    status: 500,
    code: 'SERVER_ERROR',
    message: `No se pudo guardar ${entity}. Vuelve a intentarlo; si sigue fallando, avísanos.`,
  };
}
