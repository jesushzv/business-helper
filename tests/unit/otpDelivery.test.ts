import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import {
  deliverOtp,
  describeDeliveryConfig,
  getDeliveryChannel,
  isDeliveryConfigured,
} from '@/lib/otpDelivery';

const PHONE = '8115559988';
const CODE = '123456';

function stubFetch(impl: (url: string, init: RequestInit) => unknown) {
  const spy = vi.fn(async (url: string, init: RequestInit) => impl(url, init));
  vi.stubGlobal('fetch', spy);
  return spy;
}

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body };
}

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  process.env = { ...ORIGINAL_ENV };
});

describe('getDeliveryChannel / isDeliveryConfigured', () => {
  it('defaults to console when OTP_DELIVERY_CHANNEL is unset', () => {
    delete process.env.OTP_DELIVERY_CHANNEL;
    expect(getDeliveryChannel()).toBe('console');
    expect(isDeliveryConfigured()).toBe(false);
  });

  it('reads whatsapp from the environment', () => {
    process.env.OTP_DELIVERY_CHANNEL = 'whatsapp';
    expect(getDeliveryChannel()).toBe('whatsapp');
    expect(isDeliveryConfigured()).toBe(true);
  });

  it('falls back to console for an unrecognized value', () => {
    process.env.OTP_DELIVERY_CHANNEL = 'carrier_pigeon';
    expect(getDeliveryChannel()).toBe('console');
  });

  // The sms channel was retired with phone-number login. A deployment still
  // holding the value must fail closed, not silently pick another provider.
  it('treats the retired sms value as unconfigured', () => {
    process.env.OTP_DELIVERY_CHANNEL = 'sms';
    expect(getDeliveryChannel()).toBe('console');
    expect(isDeliveryConfigured()).toBe(false);
  });

  it('fails closed in production for a deployment still holding sms', async () => {
    process.env.OTP_DELIVERY_CHANNEL = 'sms';
    process.env.TWILIO_ACCOUNT_SID = 'AC_test_sid';
    process.env.TWILIO_AUTH_TOKEN = 'test_auth_token';
    vi.stubEnv('NODE_ENV', 'production');
    const spy = stubFetch(() => jsonResponse({}));

    const result = await deliverOtp(PHONE, CODE);

    expect(result.delivered).toBe(false);
    expect(result.devCode).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('describeDeliveryConfig', () => {
  const TWILIO = { TWILIO_ACCOUNT_SID: 'AC_test_sid', TWILIO_AUTH_TOKEN: 'test_auth_token' };

  it('reports console as never ready, whatever the environment holds', () => {
    const report = describeDeliveryConfig({ ...TWILIO, TWILIO_WHATSAPP_NUMBER: '+14155238886' });

    expect(report).toEqual({
      channel: 'console',
      provider: 'console',
      ready: false,
      missing: ['OTP_DELIVERY_CHANNEL'],
    });
  });

  it('reports the retired sms channel as unconfigured, fully-credentialed or not', () => {
    const report = describeDeliveryConfig({
      OTP_DELIVERY_CHANNEL: 'sms',
      ...TWILIO,
      TWILIO_WHATSAPP_NUMBER: '+14155238886',
    });

    expect(report.channel).toBe('console');
    expect(report.ready).toBe(false);
  });

  it('selects the provider the send would actually use on whatsapp', () => {
    const viaTwilio = describeDeliveryConfig({
      OTP_DELIVERY_CHANNEL: 'whatsapp',
      ...TWILIO,
      TWILIO_WHATSAPP_NUMBER: '+14155238886',
      META_WHATSAPP_TOKEN: 'meta_token',
      META_PHONE_NUMBER_ID: '123',
    });
    expect(viaTwilio.provider).toBe('twilio_whatsapp');
    expect(viaTwilio.ready).toBe(true);

    const viaMeta = describeDeliveryConfig({
      OTP_DELIVERY_CHANNEL: 'whatsapp',
      META_WHATSAPP_TOKEN: 'meta_token',
      META_PHONE_NUMBER_ID: '123',
    });
    expect(viaMeta.provider).toBe('meta_whatsapp');
    expect(viaMeta.ready).toBe(true);
  });

  it('falls to Meta and names both its variables when nothing is configured', () => {
    const report = describeDeliveryConfig({ OTP_DELIVERY_CHANNEL: 'whatsapp' });

    expect(report.provider).toBe('meta_whatsapp');
    expect(report.ready).toBe(false);
    expect(report.missing).toEqual(['META_WHATSAPP_TOKEN', 'META_PHONE_NUMBER_ID']);
  });

  it('treats a whatsapp sender without Twilio credentials as not ready', () => {
    const report = describeDeliveryConfig({
      OTP_DELIVERY_CHANNEL: 'whatsapp',
      TWILIO_WHATSAPP_NUMBER: '+14155238886',
    });

    expect(report.provider).toBe('twilio_whatsapp');
    expect(report.ready).toBe(false);
    expect(report.missing).toEqual(['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN']);
  });

  it('reads process.env when no environment is passed', () => {
    process.env.OTP_DELIVERY_CHANNEL = 'whatsapp';
    process.env.TWILIO_ACCOUNT_SID = 'AC_test_sid';
    process.env.TWILIO_AUTH_TOKEN = 'test_auth_token';
    process.env.TWILIO_WHATSAPP_NUMBER = '+14155238886';

    expect(describeDeliveryConfig().ready).toBe(true);
  });
});

describe('console channel (no provider configured)', () => {
  it('delivers to the console in development and echoes devCode', async () => {
    delete process.env.OTP_DELIVERY_CHANNEL;
    vi.stubEnv('NODE_ENV', 'development');
    const spy = stubFetch(() => jsonResponse({}));

    const result = await deliverOtp(PHONE, CODE);

    expect(result.delivered).toBe(true);
    expect(result.channel).toBe('console');
    expect(result.devCode).toBe(CODE);
    expect(spy).not.toHaveBeenCalled();
  });

  it('fails closed in production rather than echoing the code', async () => {
    delete process.env.OTP_DELIVERY_CHANNEL;
    vi.stubEnv('NODE_ENV', 'production');

    const result = await deliverOtp(PHONE, CODE);

    expect(result.delivered).toBe(false);
    expect(result.devCode).toBeNull();
  });
});

describe('WhatsApp channel — Twilio preferred over Meta', () => {
  beforeEach(() => {
    process.env.OTP_DELIVERY_CHANNEL = 'whatsapp';
  });

  it('uses Twilio when TWILIO_WHATSAPP_NUMBER is configured', async () => {
    process.env.TWILIO_ACCOUNT_SID = 'AC_test_sid';
    process.env.TWILIO_AUTH_TOKEN = 'test_auth_token';
    process.env.TWILIO_WHATSAPP_NUMBER = '+14155238886';
    process.env.META_WHATSAPP_TOKEN = 'meta_token';
    process.env.META_PHONE_NUMBER_ID = '123';

    const spy = stubFetch(() => jsonResponse({ sid: 'SM_wa' }));

    const result = await deliverOtp(PHONE, CODE);

    const [url, init] = spy.mock.calls[0];
    expect(url).toContain('api.twilio.com');
    const body = new URLSearchParams(init.body as string);
    expect(body.get('From')).toBe('whatsapp:+14155238886');
    expect(body.get('To')).toBe('whatsapp:+528115559988');
    expect(result.delivered).toBe(true);
    expect(result.channel).toBe('whatsapp');
  });

  it('reports a rejected Twilio send as a failure without leaking the auth token', async () => {
    process.env.TWILIO_ACCOUNT_SID = 'AC_test_sid';
    process.env.TWILIO_AUTH_TOKEN = 'test_auth_token';
    process.env.TWILIO_WHATSAPP_NUMBER = '+14155238886';
    stubFetch(() => jsonResponse({ code: 20003 }, false, 401));

    const result = await deliverOtp(PHONE, CODE);

    expect(result.delivered).toBe(false);
    expect(result.error).toContain('401');
    expect(JSON.stringify(result)).not.toContain('test_auth_token');
  });

  it('never echoes the code back when a provider is configured', async () => {
    process.env.TWILIO_ACCOUNT_SID = 'AC_test_sid';
    process.env.TWILIO_AUTH_TOKEN = 'test_auth_token';
    process.env.TWILIO_WHATSAPP_NUMBER = '+14155238886';
    stubFetch(() => jsonResponse({ sid: 'SM_x' }));

    const result = await deliverOtp(PHONE, CODE);

    expect(result.devCode).toBeNull();
  });

  it('falls back to Meta when Twilio WhatsApp is not configured', async () => {
    process.env.META_WHATSAPP_TOKEN = 'meta_token';
    process.env.META_PHONE_NUMBER_ID = '1234567890';

    const spy = stubFetch(() => jsonResponse({ messages: [{ id: 'wamid.REAL' }] }));

    const result = await deliverOtp(PHONE, CODE);

    const [url, init] = spy.mock.calls[0];
    expect(url).toBe('https://graph.facebook.com/v21.0/1234567890/messages');
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer meta_token');
    const parsedBody = JSON.parse(init.body as string);
    expect(parsedBody.text.body).toContain(CODE);
    expect(result.delivered).toBe(true);
  });

  it('reports failure when neither provider is configured', async () => {
    const spy = stubFetch(() => jsonResponse({}));

    const result = await deliverOtp(PHONE, CODE);

    expect(result.delivered).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });

  it('names the missing variable instead of returning an internal token', async () => {
    // The route hands this string straight to the caller, so "not_configured"
    // reached the signer as their error message.
    process.env.TWILIO_WHATSAPP_NUMBER = '+14155238886';
    const spy = stubFetch(() => jsonResponse({}));

    const result = await deliverOtp(PHONE, CODE);

    expect(spy).not.toHaveBeenCalled();
    expect(result.error).not.toBe('not_configured');
    expect(result.error).toContain('TWILIO_ACCOUNT_SID');
  });
});

describe('operator visibility', () => {
  it('logs a delivery failure server-side, without the code', async () => {
    process.env.OTP_DELIVERY_CHANNEL = 'whatsapp';
    process.env.TWILIO_ACCOUNT_SID = 'AC_test_sid';
    process.env.TWILIO_AUTH_TOKEN = 'test_auth_token';
    process.env.TWILIO_WHATSAPP_NUMBER = '+14155238886';
    stubFetch(() => jsonResponse({ code: 63016 }, false, 400));
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});

    await deliverOtp(PHONE, CODE);

    // A signer only ever sees a 502; this line is the operator's only signal.
    expect(logged).toHaveBeenCalledTimes(1);
    const line = logged.mock.calls[0][0] as string;
    expect(line).toContain('twilio_whatsapp');
    expect(line).not.toContain(CODE);

    logged.mockRestore();
  });

  it('stays quiet on a successful send', async () => {
    process.env.OTP_DELIVERY_CHANNEL = 'whatsapp';
    process.env.TWILIO_ACCOUNT_SID = 'AC_test_sid';
    process.env.TWILIO_AUTH_TOKEN = 'test_auth_token';
    process.env.TWILIO_WHATSAPP_NUMBER = '+14155238886';
    stubFetch(() => jsonResponse({ sid: 'SM_ok' }));
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});

    await deliverOtp(PHONE, CODE);

    expect(logged).not.toHaveBeenCalled();
    logged.mockRestore();
  });
});

describe('phone validation', () => {
  it('rejects an unusable phone number before calling any provider', async () => {
    process.env.OTP_DELIVERY_CHANNEL = 'whatsapp';
    process.env.TWILIO_ACCOUNT_SID = 'AC_test_sid';
    process.env.TWILIO_AUTH_TOKEN = 'test_auth_token';
    process.env.TWILIO_WHATSAPP_NUMBER = '+14155238886';
    const spy = stubFetch(() => jsonResponse({}));

    const result = await deliverOtp('', CODE);

    expect(result.delivered).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });
});
