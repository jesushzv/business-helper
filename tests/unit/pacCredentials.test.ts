import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import crypto from 'crypto';
import {
  detectPacEnvironment,
  isPacEncryptionConfigured,
  openPacApiKey,
  pacApiKeyHint,
  sealPacApiKey,
  validatePacApiKey,
} from '@/lib/pacCredentials';

const KEY = crypto.randomBytes(32).toString('base64');
const OTHER_KEY = crypto.randomBytes(32).toString('base64');
// Assembled rather than written out: a literal `sk_live_...` in the tree trips
// GitHub's secret scanner, which cannot tell a fixture from a real Stripe key.
const API_KEY = ['sk', 'live', 'fixturekeyabcdefghij2345'].join('_');

describe('PAC API key sealing', () => {
  const original = process.env.PAC_ENCRYPTION_KEY;

  beforeEach(() => {
    process.env.PAC_ENCRYPTION_KEY = KEY;
  });

  afterEach(() => {
    process.env.PAC_ENCRYPTION_KEY = original;
  });

  it('round-trips a key through the seal', () => {
    const sealed = sealPacApiKey(API_KEY);

    expect(sealed.startsWith('v1.')).toBe(true);
    // The credential itself must not be recoverable by reading the row.
    expect(sealed).not.toContain(API_KEY);
    expect(openPacApiKey(sealed)).toBe(API_KEY);
  });

  it('produces a different envelope each time, so identical keys do not match', () => {
    expect(sealPacApiKey(API_KEY)).not.toBe(sealPacApiKey(API_KEY));
  });

  it('refuses to open a seal made with another key', () => {
    const sealed = sealPacApiKey(API_KEY);
    process.env.PAC_ENCRYPTION_KEY = OTHER_KEY;

    expect(openPacApiKey(sealed)).toBeNull();
  });

  it('refuses a tampered ciphertext rather than returning altered bytes', () => {
    const parts = sealPacApiKey(API_KEY).split('.');
    const tampered = Buffer.from(parts[3], 'base64');
    tampered[0] = tampered[0] ^ 0xff;

    expect(openPacApiKey([parts[0], parts[1], parts[2], tampered.toString('base64')].join('.'))).toBeNull();
  });

  it('returns null for a malformed envelope instead of throwing', () => {
    expect(openPacApiKey('')).toBeNull();
    expect(openPacApiKey('not-a-seal')).toBeNull();
    expect(openPacApiKey('v2.a.b.c')).toBeNull();
  });

  it('accepts a hex key as well as base64', () => {
    process.env.PAC_ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');
    expect(isPacEncryptionConfigured()).toBe(true);
    expect(openPacApiKey(sealPacApiKey(API_KEY))).toBe(API_KEY);
  });

  it('reports an absent or short key as not configured rather than falling back to a default', () => {
    delete process.env.PAC_ENCRYPTION_KEY;
    expect(isPacEncryptionConfigured()).toBe(false);
    expect(() => sealPacApiKey(API_KEY)).toThrow();

    process.env.PAC_ENCRYPTION_KEY = Buffer.from('too-short').toString('base64');
    expect(isPacEncryptionConfigured()).toBe(false);
  });
});

describe('PAC API key inspection', () => {
  it('shows only the last four characters', () => {
    expect(pacApiKeyHint(API_KEY)).toBe('2345');
    expect(pacApiKeyHint('')).toBe('????');
  });

  it('classifies the environment a key reaches', () => {
    expect(detectPacEnvironment(`${['sk', 'live'].join('_')}_x`)).toBe('live');
    expect(detectPacEnvironment('sk_test_x')).toBe('sandbox');
    expect(detectPacEnvironment('pk_live_x')).toBeNull();
  });

  it('rejects a key that is not a Facturapi secret before it is stored', () => {
    expect(validatePacApiKey('').isValid).toBe(false);
    expect(validatePacApiKey('hello').isValid).toBe(false);
    expect(validatePacApiKey(['sk', 'live', 'short'].join('_')).isValid).toBe(false);

    const valid = validatePacApiKey(API_KEY);
    expect(valid.isValid).toBe(true);
    expect(valid.environment).toBe('live');
  });
});
