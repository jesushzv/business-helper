import { describe, it, expect } from 'vitest';
import type { Event } from '@sentry/nextjs';
import { scrubText, scrubExtra, scrubTags, scrubEvent, scrubLog } from '@/lib/sentryScrub';

/**
 * #52's exit criterion, re-pinned at the boundary the SDK actually uses.
 *
 * The criterion is "no RFC, CLABE, phone number or email appears in the
 * payload", with `organization_id` surviving. Before `@sentry/nextjs` it was
 * enforced inside `captureException`, which was sound only because that function
 * was the sole path to Sentry. It no longer is — `onRequestError`, React render
 * errors, breadcrumbs and console capture all produce events nobody wrote a call
 * for. `scrubEvent` is `beforeSend`, the one hook all of them pass through, so
 * these tests live at *that* boundary rather than at the adapter's.
 */

const ORG = 'ecae39e6-bae7-4d3e-b960-27e7cb348cc5';
const CLABE = '012180001234567899';
const RFC = 'DNO850101HD9';
const EMAIL = 'ana@ferreteria.mx';

describe('scrubText — personal data inside free text (#52)', () => {
  it('redacts an email, RFC, CLABE and phone', () => {
    expect(scrubText('contacto ana@ferreteria.mx pidió')).toBe('contacto [email] pidió');
    expect(scrubText('RFC DNO850101HD9 inválido')).toBe('RFC [rfc] inválido');
    expect(scrubText('(clabe)=(012180001234567899)')).toBe('(clabe)=([clabe])');
    expect(scrubText('whatsapp 8112345678 falló')).toBe('whatsapp [phone] falló');
  });

  it('redacts the value Postgres quotes back in a constraint violation', () => {
    // The reason key-based filtering is not enough: no key is involved, the
    // account number is in the prose of the error message itself.
    const message =
      'duplicate key value violates unique constraint "uq_bank_clabe" DETAIL: Key (clabe)=(012180001234567899) already exists.';
    const scrubbed = scrubText(message);
    expect(scrubbed).not.toMatch(/012180001234567899/);
    expect(scrubbed).toMatch(/\[clabe\]/);
  });

  it('leaves a uuid alone — its digit runs must not read as a phone number', () => {
    const uuid = '11111111-2222-3333-4444-555555555555';
    expect(scrubText(uuid)).toBe(uuid);
  });
});

describe('scrubExtra / scrubTags (#52)', () => {
  it('drops PII-keyed extras and refuses nested objects', () => {
    const clean = scrubExtra({
      clabe: CLABE,
      email: EMAIL,
      quote_id: 'q-1',
      client: { rfc: RFC },
      attempts: 3,
    });

    expect(clean).not.toHaveProperty('clabe');
    expect(clean).not.toHaveProperty('email');
    expect(clean.quote_id).toBe('q-1');
    expect(clean.attempts).toBe(3);
    // A whole row passed "for context" is where PII hides.
    expect(clean.client).toBe('[object omitted]');
  });

  it('keeps organization_id, user_id and route intact — they are the point of the report', () => {
    const tags = scrubTags({
      organization_id: ORG,
      user_id: 'f116bb9c-70ed-49c9-b954-d97f1e4ba1c3',
      route: '/api/invoices/issue',
      severity: 'error',
    });

    expect(tags.organization_id).toBe(ORG);
    expect(tags.user_id).toBe('f116bb9c-70ed-49c9-b954-d97f1e4ba1c3');
    expect(tags.route).toBe('/api/invoices/issue');
  });
});

describe('scrubEvent — every field the SDK fills on its own (#52)', () => {
  /**
   * A server event shaped the way `onRequestError` and `includeLocalVariables`
   * actually produce one: nobody chose these fields, so nobody scrubbed them at
   * the call site. Each branch below is a place a CLABE has somewhere to hide.
   */
  function serverEvent(): Event {
    return {
      message: `stamp failed for RFC ${RFC}`,
      exception: {
        values: [
          {
            type: 'PostgrestError',
            value: `Key (clabe)=(${CLABE}) already exists.`,
            stacktrace: {
              frames: [
                {
                  filename: '/app/lib/pacClient.ts',
                  // `includeLocalVariables: true` attaches the locals in scope.
                  vars: { clabe: CLABE, client: { email: EMAIL }, folio: 12 },
                },
              ],
            },
          },
        ],
      },
      breadcrumbs: [
        { message: `POST /api/clients ${EMAIL}`, data: { rfc: RFC, status: 500 } },
      ],
      extra: { clabe: CLABE, client_email: EMAIL, folio: 12 },
      tags: { organization_id: ORG, route: '/api/invoices/issue', note: `tel 8112345678` },
      request: {
        url: `https://businesshelper.app/api/clients?tel=8112345678`,
        query_string: 'tel=8112345678',
        cookies: { 'sb-access-token': 'secret' },
        headers: { Authorization: 'Bearer sk_live_x', 'user-agent': 'Safari' },
        data: { rfc: RFC, amount: 1500 },
      },
      user: { id: 'u-1', email: EMAIL, ip_address: '187.190.1.1' },
    };
  }

  it('carries no personal data anywhere in the serialized event', () => {
    const serialized = JSON.stringify(scrubEvent(serverEvent()));

    expect(serialized).not.toMatch(/DNO850101HD9/);
    expect(serialized).not.toMatch(/012180001234567899/);
    expect(serialized).not.toMatch(/ana@ferreteria\.mx/);
    expect(serialized).not.toMatch(/8112345678/);
  });

  it('keeps the diagnostic content that makes the report worth reading', () => {
    const serialized = JSON.stringify(scrubEvent(serverEvent()));

    expect(serialized).toMatch(new RegExp(ORG));
    expect(serialized).toMatch(/\/api\/invoices\/issue/);
    expect(serialized).toMatch(/"folio":12/);
    expect(serialized).toMatch(/PostgrestError/);
    expect(serialized).toMatch(/pacClient\.ts/);
  });

  it('scrubs local variables attached to stack frames', () => {
    const frame = scrubEvent(serverEvent()).exception!.values![0].stacktrace!.frames![0];

    expect(frame.vars).not.toHaveProperty('clabe');
    // A whole client row in scope at the throw site is the worst case.
    expect(frame.vars!.client).toBe('[object omitted]');
    expect(frame.vars!.folio).toBe(12);
  });

  it('drops cookies and credential headers wholesale', () => {
    const request = scrubEvent(serverEvent()).request!;

    expect(request.cookies).toBeUndefined();
    expect(request.headers).not.toHaveProperty('Authorization');
    // A non-credential header is diagnostic and survives.
    expect(request.headers!['user-agent']).toBe('Safari');
  });

  it('reduces user to an id — the tenant is carried by tags, not by identity', () => {
    expect(scrubEvent(serverEvent()).user).toEqual({ id: 'u-1' });
  });

  it('never drops an event — a lost report is worse than a scrubbed one', () => {
    expect(scrubEvent(serverEvent())).not.toBeNull();
    expect(scrubEvent({} as Event)).toEqual({});
  });
});

describe('scrubLog — console capture reaches the Logs product (#52)', () => {
  it('scrubs the message and the attributes', () => {
    const log = scrubLog({
      level: 'error',
      message: `insert failed for ${EMAIL}`,
      attributes: { clabe: CLABE, route: '/api/clients' },
    });

    expect(log.message).toBe('insert failed for [email]');
    expect(log.attributes).not.toHaveProperty('clabe');
    expect(log.attributes!.route).toBe('/api/clients');
  });
});
