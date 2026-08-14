import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import {
  deliverOtp,
  describeDeliveryConfig,
  getDeliveryChannel,
  isDeliveryConfigured,
} from '@/lib/otpDelivery';

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

  it('reads email from the environment', () => {
    process.env.OTP_DELIVERY_CHANNEL = 'email';
    expect(getDeliveryChannel()).toBe('email');
    expect(isDeliveryConfigured()).toBe(true);
  });

  it('resolves the removed sms and whatsapp channels to console', () => {
    // The phone channels were deprecated on 2026-08-11 and later removed. A
    // deployment still configured for one must fail closed like an
    // unconfigured one, never fabricate a delivery (hard rule #3).
    process.env.OTP_DELIVERY_CHANNEL = 'sms';
    expect(getDeliveryChannel()).toBe('console');
    expect(isDeliveryConfigured()).toBe(false);

    process.env.OTP_DELIVERY_CHANNEL = 'whatsapp';
    expect(getDeliveryChannel()).toBe('console');
    expect(isDeliveryConfigured()).toBe(false);
  });

  it('falls back to console for an unrecognized value', () => {
    process.env.OTP_DELIVERY_CHANNEL = 'carrier_pigeon';
    expect(getDeliveryChannel()).toBe('console');
  });
});

describe('describeDeliveryConfig', () => {
  it('reports console as never ready, whatever the environment holds', () => {
    const report = describeDeliveryConfig({ RESEND_API_KEY: 're_test_key' });

    expect(report).toEqual({
      channel: 'console',
      provider: 'console',
      ready: false,
      missing: ['OTP_DELIVERY_CHANNEL'],
    });
  });

  it('reports a retired phone channel exactly like an unset one', () => {
    for (const retired of ['sms', 'whatsapp']) {
      const report = describeDeliveryConfig({
        OTP_DELIVERY_CHANNEL: retired,
        TWILIO_ACCOUNT_SID: 'AC_test_sid',
        TWILIO_AUTH_TOKEN: 'test_auth_token',
        TWILIO_WHATSAPP_NUMBER: '+14155238886',
      });

      expect(report.channel).toBe('console');
      expect(report.ready).toBe(false);
      expect(report.missing).toEqual(['OTP_DELIVERY_CHANNEL']);
    }
  });

  it('resolves the email channel to Resend and names what it is missing', () => {
    const notReady = describeDeliveryConfig({ OTP_DELIVERY_CHANNEL: 'email' });
    expect(notReady).toEqual({
      channel: 'email',
      provider: 'resend_email',
      ready: false,
      missing: ['RESEND_API_KEY', 'OTP_EMAIL_FROM'],
    });

    const ready = describeDeliveryConfig({
      OTP_DELIVERY_CHANNEL: 'email',
      RESEND_API_KEY: 're_test_key',
      OTP_EMAIL_FROM: 'Business Helper <firmas@businesshelper.app>',
    });
    expect(ready.ready).toBe(true);
    expect(ready.missing).toEqual([]);
  });

  it('reads process.env when no environment is passed', () => {
    process.env.OTP_DELIVERY_CHANNEL = 'email';
    process.env.RESEND_API_KEY = 're_test_key';
    process.env.OTP_EMAIL_FROM = 'firmas@businesshelper.app';

    expect(describeDeliveryConfig().ready).toBe(true);
  });
});

describe('console channel (no provider configured)', () => {
  it('delivers to the console in development and echoes devCode', async () => {
    delete process.env.OTP_DELIVERY_CHANNEL;
    vi.stubEnv('NODE_ENV', 'development');
    const spy = stubFetch(() => jsonResponse({}));

    const result = await deliverOtp('cliente@empresa.mx', CODE);

    expect(result.delivered).toBe(true);
    expect(result.channel).toBe('console');
    expect(result.devCode).toBe(CODE);
    expect(spy).not.toHaveBeenCalled();
  });

  it('fails closed in production rather than echoing the code', async () => {
    delete process.env.OTP_DELIVERY_CHANNEL;
    vi.stubEnv('NODE_ENV', 'production');

    const result = await deliverOtp('cliente@empresa.mx', CODE);

    expect(result.delivered).toBe(false);
    expect(result.devCode).toBeNull();
  });

  it('fails closed on a retired channel in production, naming the migration in the log', async () => {
    process.env.OTP_DELIVERY_CHANNEL = 'whatsapp';
    process.env.TWILIO_ACCOUNT_SID = 'AC_test_sid';
    process.env.TWILIO_AUTH_TOKEN = 'test_auth_token';
    process.env.TWILIO_WHATSAPP_NUMBER = '+14155238886';
    vi.stubEnv('NODE_ENV', 'production');
    const spy = stubFetch(() => jsonResponse({}));
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await deliverOtp('+528115559988', CODE);

    // No provider call, no fabricated delivery, and the operator's log line
    // names the fix rather than reading like a generic misconfiguration.
    expect(result.delivered).toBe(false);
    expect(result.devCode).toBeNull();
    expect(result.error).toContain('retirado');
    expect(spy).not.toHaveBeenCalled();
    expect(logged.mock.calls[0][0]).toContain('OTP_DELIVERY_CHANNEL=email');
    expect(logged.mock.calls[0][0]).not.toContain(CODE);

    logged.mockRestore();
  });
});

describe('email channel (Resend) — the launch channel', () => {
  const EMAIL = 'cliente@empresa.mx';

  beforeEach(() => {
    process.env.OTP_DELIVERY_CHANNEL = 'email';
    process.env.RESEND_API_KEY = 're_test_key';
    process.env.OTP_EMAIL_FROM = 'Business Helper <firmas@businesshelper.app>';
  });

  it('POSTs to the Resend API with the code in the body, never the subject', async () => {
    const spy = stubFetch(() => jsonResponse({ id: 'email_real_id' }));

    const result = await deliverOtp(EMAIL, CODE);

    expect(spy).toHaveBeenCalledTimes(1);
    const [url, init] = spy.mock.calls[0];
    expect(url).toBe('https://api.resend.com/emails');
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer re_test_key');

    const body = JSON.parse(init.body as string);
    expect(body.from).toBe('Business Helper <firmas@businesshelper.app>');
    expect(body.to).toEqual([EMAIL]);
    expect(body.text).toContain(CODE);
    // A subject surfaces in lock-screen previews; the code stays in the body.
    expect(body.subject).not.toContain(CODE);

    expect(result.delivered).toBe(true);
    expect(result.channel).toBe('email');
    expect(result.devCode).toBeNull();
  });

  it('normalizes the recipient before sending, one inbox one form', async () => {
    const spy = stubFetch(() => jsonResponse({ id: 'email_x' }));

    await deliverOtp('  Cliente@Empresa.MX ', CODE);

    const body = JSON.parse(spy.mock.calls[0][1].body as string);
    expect(body.to).toEqual(['cliente@empresa.mx']);
  });

  it('reports a rejected send as a failure without leaking the api key', async () => {
    stubFetch(() => jsonResponse({ name: 'validation_error' }, false, 403));

    const result = await deliverOtp(EMAIL, CODE);

    expect(result.delivered).toBe(false);
    expect(result.error).toContain('403');
    expect(JSON.stringify(result)).not.toContain('re_test_key');
  });

  it('reports missing configuration as a failure without calling the network', async () => {
    delete process.env.RESEND_API_KEY;
    const spy = stubFetch(() => jsonResponse({}));

    const result = await deliverOtp(EMAIL, CODE);

    expect(result.delivered).toBe(false);
    expect(result.error).toContain('RESEND_API_KEY');
    expect(spy).not.toHaveBeenCalled();
  });

  it('rejects an unusable email before calling any provider', async () => {
    const spy = stubFetch(() => jsonResponse({}));

    const result = await deliverOtp('no-es-un-correo', CODE);

    expect(result.delivered).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });

  it('never echoes the code back when a provider is configured', async () => {
    stubFetch(() => jsonResponse({ id: 'email_x' }));
    const result = await deliverOtp(EMAIL, CODE);
    expect(result.devCode).toBeNull();
  });

  it('reports a network failure as a failure', async () => {
    stubFetch(() => {
      throw new Error('socket hang up');
    });

    const result = await deliverOtp(EMAIL, CODE);

    expect(result.delivered).toBe(false);
    expect(result.error).toContain('Resend');
  });
});

describe('operator visibility', () => {
  beforeEach(() => {
    process.env.OTP_DELIVERY_CHANNEL = 'email';
    process.env.RESEND_API_KEY = 're_test_key';
    process.env.OTP_EMAIL_FROM = 'Business Helper <firmas@businesshelper.app>';
  });

  it('names resend_email in the operator failure line, without the code', async () => {
    stubFetch(() => jsonResponse({ name: 'application_error' }, false, 500));
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});

    await deliverOtp('cliente@empresa.mx', CODE);

    // A signer only ever sees a 502; this line is the operator's only signal.
    expect(logged).toHaveBeenCalledTimes(1);
    const line = logged.mock.calls[0][0] as string;
    expect(line).toContain('resend_email');
    expect(line).not.toContain(CODE);

    logged.mockRestore();
  });

  it('stays quiet on a successful send', async () => {
    stubFetch(() => jsonResponse({ id: 'email_ok' }));
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});

    await deliverOtp('cliente@empresa.mx', CODE);

    expect(logged).not.toHaveBeenCalled();
    logged.mockRestore();
  });
});
