import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  dispatchWhatsAppReminder,
  getWhatsAppDispatchMode,
  formatE164MexicanPhone,
} from '@/lib/whatsappOutbound';

/**
 * Outbound WhatsApp dispatch.
 *
 * The provider branch used to contact nothing: it fabricated a
 * `wsp_out_<timestamp>_<random>` id and returned success. These tests assert
 * that a real request goes out and that a failed one is reported as failed.
 */

const BASE = {
  clientName: 'Construcciones Maya',
  phone: '8115559988',
  amountDue: 15000,
  dueDate: '2026-07-28',
  token: 'pay_token_123',
};

const TWILIO_ENV = {
  TWILIO_ACCOUNT_SID: 'AC_test_sid',
  TWILIO_AUTH_TOKEN: 'test_auth_token',
  TWILIO_WHATSAPP_NUMBER: '+14155238886',
};

const META_ENV = {
  META_WHATSAPP_TOKEN: 'meta_test_token',
  META_PHONE_NUMBER_ID: '1234567890',
};

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(impl: (url: string, init: RequestInit) => unknown) {
  const spy = vi.fn(async (url: string, init: RequestInit) => impl(url, init));
  vi.stubGlobal('fetch', spy);
  return spy;
}

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body };
}

describe('wa.me fallback (no provider configured)', () => {
  it('returns a click-to-chat link and makes no network call', async () => {
    const spy = stubFetch(() => jsonResponse({}));

    const result = await dispatchWhatsAppReminder(BASE, {});

    expect(result.success).toBe(true);
    expect(result.mode).toBe('wa_me_link');
    expect(result.waMeUrl).toContain('https://wa.me/528115559988');
    expect(spy).not.toHaveBeenCalled();
  });

  // Sandbox comes from server env, not from a caller-supplied flag. The flag
  // this used to pass existed only on `POST /api/whatsapp/broadcast`, sourced
  // from `isDemoDeployment()`, which that route's auth guard has already
  // answered 503 for — so it could never be true there, and this test reported
  // a route protection that did not exist (#74).
  it('is forced by IS_SANDBOX in the environment even when live credentials are present', async () => {
    const spy = stubFetch(() => jsonResponse({}));

    const result = await dispatchWhatsAppReminder(BASE, {
      ...TWILIO_ENV,
      IS_SANDBOX: 'true',
    });

    expect(result.mode).toBe('wa_me_link');
    // The whole point of sandbox mode: no message reaches a real number.
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('Twilio dispatch', () => {
  it('POSTs to the Twilio Messages API with the expected shape', async () => {
    const spy = stubFetch(() => jsonResponse({ sid: 'SM_real_id' }));

    const result = await dispatchWhatsAppReminder(BASE, { ...TWILIO_ENV });

    expect(spy).toHaveBeenCalledTimes(1);
    const [url, init] = spy.mock.calls[0];

    expect(url).toBe(
      'https://api.twilio.com/2010-04-01/Accounts/AC_test_sid/Messages.json'
    );
    expect(init.method).toBe('POST');

    const headers = init.headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/x-www-form-urlencoded');
    // Basic auth of accountSid:authToken
    const decoded = Buffer.from(headers.Authorization.replace('Basic ', ''), 'base64').toString();
    expect(decoded).toBe('AC_test_sid:test_auth_token');

    const body = new URLSearchParams(init.body as string);
    expect(body.get('From')).toBe('whatsapp:+14155238886');
    expect(body.get('To')).toBe('whatsapp:+528115559988');
    expect(body.get('Body')).toContain('Construcciones Maya');

    expect(result.success).toBe(true);
    // The id comes from Twilio, not from a local timestamp.
    expect(result.dispatchId).toBe('SM_real_id');
    expect(result.dispatchId).not.toMatch(/^wsp_out_/);
  });

  it('accepts TWILIO_PHONE_NUMBER as the sender, as the deploy guide names it', async () => {
    const spy = stubFetch(() => jsonResponse({ sid: 'SM_x' }));

    await dispatchWhatsAppReminder(BASE, {
      TWILIO_ACCOUNT_SID: 'AC_test_sid',
      TWILIO_AUTH_TOKEN: 'test_auth_token',
      TWILIO_WHATSAPP_NUMBER: '+14155238886',
      TWILIO_PHONE_NUMBER: '+14155238886',
    });

    const body = new URLSearchParams(spy.mock.calls[0][1].body as string);
    expect(body.get('From')).toBe('whatsapp:+14155238886');
  });

  it('reports a rejected send as a failure', async () => {
    stubFetch(() => jsonResponse({ code: 21211, message: 'Invalid To number' }, false, 400));

    const result = await dispatchWhatsAppReminder(BASE, { ...TWILIO_ENV });

    expect(result.success).toBe(false);
    expect(result.error).toContain('400');
    expect(result.dispatchId).toBeUndefined();
  });

  it('reports a network failure as a failure', async () => {
    stubFetch(() => {
      throw new Error('socket hang up');
    });

    const result = await dispatchWhatsAppReminder(BASE, { ...TWILIO_ENV });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Twilio');
  });

  it('does not leak the auth token into the error message', async () => {
    stubFetch(() => jsonResponse({ code: 20003 }, false, 401));

    const result = await dispatchWhatsAppReminder(BASE, { ...TWILIO_ENV });

    expect(result.error).not.toContain('test_auth_token');
    expect(JSON.stringify(result)).not.toContain('test_auth_token');
  });
});

describe('Meta Cloud API dispatch', () => {
  it('POSTs to the Graph API with the expected shape', async () => {
    const spy = stubFetch(() => jsonResponse({ messages: [{ id: 'wamid.REAL' }] }));

    const result = await dispatchWhatsAppReminder(BASE, { ...META_ENV });

    const [url, init] = spy.mock.calls[0];
    expect(url).toBe('https://graph.facebook.com/v21.0/1234567890/messages');

    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer meta_test_token');

    const body = JSON.parse(init.body as string);
    expect(body.messaging_product).toBe('whatsapp');
    expect(body.to).toBe('+528115559988');
    expect(body.text.body).toContain('Construcciones Maya');

    expect(result.success).toBe(true);
    expect(result.dispatchId).toBe('wamid.REAL');
  });

  it('reports a rejected send as a failure', async () => {
    stubFetch(() => jsonResponse({ error: { code: 131030 } }, false, 400));

    const result = await dispatchWhatsAppReminder(BASE, { ...META_ENV });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Meta');
  });

  it('does not leak the bearer token into the error message', async () => {
    stubFetch(() => jsonResponse({ error: { code: 190 } }, false, 401));

    const result = await dispatchWhatsAppReminder(BASE, { ...META_ENV });

    expect(JSON.stringify(result)).not.toContain('meta_test_token');
  });
});

describe('supporting behavior preserved', () => {
  it('still resolves dispatch mode from credentials', () => {
    expect(getWhatsAppDispatchMode({}).type).toBe('wa_me_link');
    expect(getWhatsAppDispatchMode({ ...TWILIO_ENV }).type).toBe('twilio_api');
    expect(getWhatsAppDispatchMode({ ...META_ENV }).type).toBe('meta_cloud_api');
  });

  it('rejects an unusable phone number instead of calling the provider', async () => {
    const spy = stubFetch(() => jsonResponse({}));

    const result = await dispatchWhatsAppReminder({ ...BASE, phone: '' }, { ...TWILIO_ENV });

    expect(result.success).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });

  /**
   * The guard above used to sit *below* the wa_me_link branch, so it only ever
   * ran in the two API modes. In link mode — the default, with no credentials
   * configured — an unusable number produced `https://wa.me/?text=…`, a link
   * with no recipient at all, returned with `success: true` (#40).
   */
  it('rejects an unusable phone number in wa_me_link mode too, rather than building a recipient-less link', async () => {
    const result = await dispatchWhatsAppReminder({ ...BASE, phone: '' }, {});

    expect(result.success).toBe(false);
    expect(result.waMeUrl).toBeUndefined();
  });

  it('does not build a wa.me link for a number that is not reachable', async () => {
    const result = await dispatchWhatsAppReminder({ ...BASE, phone: '1234567' }, {});

    expect(result.success).toBe(false);
    // The shape that used to ship: a link whose recipient segment is empty.
    expect(result.waMeUrl ?? '').not.toContain('wa.me/?');
  });

  it('formats Mexican numbers to E.164', () => {
    expect(formatE164MexicanPhone('8115559988')).toBe('+528115559988');
    expect(formatE164MexicanPhone('528115559988')).toBe('+528115559988');
  });
});
