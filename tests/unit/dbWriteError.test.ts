import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { describeDbWriteError } from '@/lib/dbWriteError';

/**
 * A failed write used to produce one 500 and nine words — "No se pudo crear el
 * cliente" — for every possible cause, and logged nothing. The owner who could
 * not register a client learned neither what was wrong nor whether it was their
 * input at all, and no trace of it reached anyone who could look.
 *
 * These pin the two properties that fixes: the cause is named in Spanish the
 * tenant can act on, and the raw error is always logged.
 */

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('describeDbWriteError', () => {
  it('names the missing column when the deploy is ahead of the schema', () => {
    // The exact shape of #96's live defect: code shipped reading columns no
    // migration had created. PostgREST says which one; the old handler threw
    // that away and said "no se pudo crear".
    const failure = describeDbWriteError(
      {
        code: 'PGRST204',
        message: "Could not find the 'credit_limit' column of 'clients' in the schema cache",
      },
      'el cliente',
      'POST /api/clients'
    );

    expect(failure.status).toBe(503);
    expect(failure.code).toBe('SCHEMA_OUT_OF_DATE');
    expect(failure.message).toContain('credit_limit');
    // And it says whose problem it is, so the tenant stops editing their form.
    expect(failure.message).toMatch(/no es un error de tus datos/i);
  });

  it('attributes a CHECK violation to the input that caused it', () => {
    const failure = describeDbWriteError(
      {
        code: '23514',
        // Postgres' real wording, which quotes the *relation* before the
        // constraint. The elided version this fixture used to carry is what
        // hid the attribution reading the first quoted token (#148).
        message:
          'new row for relation "clients" violates check constraint "chk_client_credit_status_valid"',
      },
      'el cliente',
      'POST /api/clients'
    );

    expect(failure.status).toBe(400);
    expect(failure.field).toBe('credit_status');
    expect(failure.message).toMatch(/estatus de crédito/i);
  });

  it('reports a permission denial as one, without the acronym', () => {
    const failure = describeDbWriteError(
      { code: '42501', message: 'new row violates row-level security policy' },
      'el cliente',
      'POST /api/clients'
    );

    expect(failure.status).toBe(403);
    expect(failure.message).toMatch(/permiso/i);
    expect(failure.message).not.toMatch(/RLS|row-level|policy/i);
  });

  it('answers a delete blocked by ON DELETE RESTRICT with 409 and the route\'s wording', () => {
    // Postgres' real phrasing for the RESTRICT direction. The old handler
    // answered it with "el registro relacionado ya no existe, recarga la
    // página" — the message for the *opposite* case — so a tenant deleting a
    // client with history was sent in a circle.
    const failure = describeDbWriteError(
      {
        code: '23503',
        message:
          'update or delete on table "clients" violates foreign key constraint "quotes_client_id_fkey" on table "quotes"',
        details: 'Key (id)=(abc) is still referenced from table "quotes".',
      },
      'el cliente',
      'DELETE /api/clients/[id]',
      {
        verb: 'eliminar',
        restrictMessage: 'Este cliente tiene cotizaciones o contratos registrados.',
      }
    );

    expect(failure.status).toBe(409);
    expect(failure.code).toBe('HAS_REFERENCES');
    expect(failure.message).toContain('cotizaciones o contratos');
    // The wrong-direction advice must be gone.
    expect(failure.message).not.toMatch(/recarga la página|ya no existe/i);
  });

  it('still tells an insert about the vanished parent, and a restrict without wording gets the generic 409', () => {
    const missingParent = describeDbWriteError(
      {
        code: '23503',
        message: 'insert or update on table "quotes" violates foreign key constraint "quotes_client_id_fkey"',
        details: 'Key (client_id)=(abc) is not present in table "clients".',
      },
      'la cotización',
      'POST /api/quotes'
    );
    expect(missingParent.status).toBe(400);
    expect(missingParent.code).toBe('INVALID_INPUT');
    expect(missingParent.message).toMatch(/ya no existe/i);

    const bareRestrict = describeDbWriteError(
      {
        code: '23503',
        message: 'update or delete on table "clients" violates foreign key constraint "quotes_client_id_fkey" on table "quotes"',
        details: 'Key (id)=(abc) is still referenced from table "quotes".',
      },
      'el cliente',
      'DELETE /api/clients/[id]',
      { verb: 'eliminar' }
    );
    expect(bareRestrict.status).toBe(409);
    expect(bareRestrict.message).toContain('registros relacionados');
  });

  it('falls back to a 500 it does not pretend to understand', () => {
    const failure = describeDbWriteError(
      { code: '08006', message: 'connection failure' },
      'el cliente',
      'POST /api/clients'
    );

    expect(failure.status).toBe(500);
    expect(failure.code).toBe('SERVER_ERROR');
  });

  it('logs every failure, including the ones it cannot classify', () => {
    // The half that made the original defect un-diagnosable: nothing was
    // recorded anywhere, so "no puedo crear un cliente" had no trail at all.
    describeDbWriteError({ code: '08006', message: 'connection failure' }, 'el cliente', 'r');
    expect(console.error).toHaveBeenCalled();
  });

  it('never leaks jargon or English into a tenant-facing message (hard rule 8)', () => {
    const raw = 'new row violates check constraint "chk_whatever"';
    const codes = ['PGRST204', '23514', '23505', '23502', '22001', '22003', '42501', '23503', 'x'];

    for (const code of codes) {
      const { message } = describeDbWriteError({ code, message: raw }, 'el cliente', 'r');

      expect(message, code).not.toMatch(/constraint|schema cache|row-level|SQLSTATE|null value/i);
      // Not the provider's own string handed through.
      expect(message, code).not.toContain(raw);
      expect(message, code).not.toMatch(
        // "error" is left out: it is a Spanish word too, and these messages use it.
        /\b(row|column|failed|invalid|violates|policy|denied|table)\b/i
      );
      expect(message.trim(), code).toMatch(/\.$/);
    }
  });
});
