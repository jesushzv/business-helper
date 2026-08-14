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

  it('maps both #336 RESTRICTs to a Spanish 409, never a bare 500', () => {
    // The two constraints 20260814210000 creates. Postgres reports a refused
    // DELETE as 23503 in the "still referenced from" direction; the acceptance
    // criterion is that neither reaches the tenant as a 500.
    const quoteRestrict = describeDbWriteError(
      {
        code: '23503',
        message:
          'update or delete on table "quotes" violates foreign key constraint ' +
          '"contracts_quote_id_fkey" on table "contracts"',
        details: 'Key (id)=(q-1) is still referenced from table "contracts".',
      },
      'la cotización',
      'DELETE /api/quotes/[id]',
      {
        verb: 'eliminar',
        restrictMessage:
          'Esta cotización ya generó un contrato con cobros programados, ' +
          'así que forma parte de tu historial y no se puede eliminar.',
      }
    );

    expect(quoteRestrict.status).toBe(409);
    expect(quoteRestrict.code).toBe('HAS_REFERENCES');
    expect(quoteRestrict.message).toContain('contrato');
    // No jargon reaches the tenant (hard rule 8).
    expect(quoteRestrict.message).not.toMatch(/constraint|fkey|23503|RESTRICT/i);

    const claimRestrict = describeDbWriteError(
      {
        code: '23503',
        message:
          'update or delete on table "milestones" violates foreign key constraint ' +
          '"cfdi_stamp_claims_milestone_id_fkey" on table "cfdi_stamp_claims"',
        details: 'Key (id)=(m-1) is still referenced from table "cfdi_stamp_claims".',
      },
      'el cobro',
      'DELETE /api/receivables/[id]',
      { verb: 'eliminar' }
    );

    // The receivables route passes no restrictMessage: it pre-checks the claim
    // and answers MILESTONE_PROTECTED itself, so this arm is the race that
    // slipped past the pre-check. Generic, but still a Spanish 409.
    expect(claimRestrict.status).toBe(409);
    expect(claimRestrict.code).toBe('HAS_REFERENCES');
    expect(claimRestrict.message).toMatch(/no se puede eliminar el cobro/i);
    expect(claimRestrict.message).not.toMatch(/constraint|fkey|cfdi_stamp_claims/i);
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

  it('classifies a delete\'s 23503 by the verb, not by the server\'s English wording', () => {
    // Deleting a row can only violate FKs pointing *at* it, so on `eliminar`
    // a 23503 is always the RESTRICT direction. A server with non-English
    // lc_messages would defeat the wording check and route the refusal into
    // the wrong-direction "recarga la página" message.
    const failure = describeDbWriteError(
      {
        code: '23503',
        message:
          'update o delete en «clients» viola la llave foránea «quotes_client_id_fkey» en la tabla «quotes»',
        details: 'La llave (id)=(abc) todavía es referenciada desde la tabla «quotes».',
      },
      'el cliente',
      'DELETE /api/clients/[id]',
      { verb: 'eliminar' }
    );

    expect(failure.status).toBe(409);
    expect(failure.code).toBe('HAS_REFERENCES');
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
