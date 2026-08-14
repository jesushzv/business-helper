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

  it('names the real cause when a delete is refused by rows that still reference it (#262)', () => {
    // ON DELETE RESTRICT on quotes/contracts → 23503 from the *referencing*
    // side. The old single arm answered "Recarga la página e inténtalo de
    // nuevo" — advice that can never resolve it.
    const failure = describeDbWriteError(
      {
        code: '23503',
        message:
          'update or delete on table "clients" violates foreign key constraint "quotes_client_id_fkey" on table "quotes"',
        details: 'Key (id)=(c1) is still referenced from table "quotes".',
      },
      'el cliente',
      'DELETE /api/clients/[id]',
      { verb: 'eliminar' }
    );

    expect(failure.status).toBe(409);
    expect(failure.code).toBe('HAS_LINKED_RECORDS');
    expect(failure.message).toMatch(/se conservan como tu evidencia/);
    expect(failure.message).not.toMatch(/Recarga la página/);
  });

  it('keeps the reload advice for the insert side of 23503 — the referenced row is missing', () => {
    const failure = describeDbWriteError(
      {
        code: '23503',
        message: 'insert or update on table "quotes" violates foreign key constraint',
        details: 'Key (client_id)=(x) is not present in table "clients".',
      },
      'la cotización',
      'POST /api/quotes'
    );

    expect(failure.code).toBe('INVALID_INPUT');
    expect(failure.message).toMatch(/Recarga la página/);
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
