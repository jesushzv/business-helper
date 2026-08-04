import { describe, it, expect } from 'vitest';
import { getAppBaseUrl, getAuthCallbackUrl, getStripeWebhookUrl } from '@/lib/url';

describe('Dynamic URL & Domain Resolution Engine', () => {
  it('should return valid base URL without trailing slash', () => {
    const baseUrl = getAppBaseUrl();
    expect(baseUrl).toBeDefined();
    expect(baseUrl.endsWith('/')).toBe(false);
    expect(baseUrl.startsWith('http')).toBe(true);
  });

  it('should append protocols to domain strings without http/https', () => {
    const origEnv = process.env.NEXT_PUBLIC_APP_URL;
    process.env.NEXT_PUBLIC_APP_URL = 'businesshelper.mx/';
    expect(getAppBaseUrl()).toBe('https://businesshelper.mx');
    process.env.NEXT_PUBLIC_APP_URL = origEnv;
  });

  it('should construct valid auth callback and Stripe webhook endpoints', () => {
    expect(getAuthCallbackUrl()).toContain('/auth/callback');
    expect(getStripeWebhookUrl()).toContain('/api/stripe/webhook');
  });
});
