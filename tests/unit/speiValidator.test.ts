import { describe, it, expect } from 'vitest';
import {
  validateTrackingReference,
  validateReceiptFile,
  sniffReceiptContent,
} from '@/lib/speiValidator';

describe('SPEI Receipt & Banxico Tracking Reference Validator Suite', () => {
  it('should validate valid Banxico SPEI tracking reference (2024080488991234)', () => {
    const res = validateTrackingReference('2024080488991234');
    expect(res.isValid).toBe(true);
  });

  it('should reject empty, short or invalid tracking references', () => {
    const emptyRes = validateTrackingReference('');
    expect(emptyRes.isValid).toBe(false);
    expect(emptyRes.error).toContain('requerida');

    const shortRes = validateTrackingReference('ABC12');
    expect(shortRes.isValid).toBe(false);
    expect(shortRes.error).toContain('al menos 8 caracteres');

    const invalidCharRes = validateTrackingReference('INVALID@REF!');
    expect(invalidCharRes.isValid).toBe(false);
  });

  it('should validate SPEI receipt file size (< 5MB limit) and mime types (PNG, JPG, PDF)', () => {
    const nullFile = validateReceiptFile(null as any);
    expect(nullFile.isValid).toBe(false);
    expect(nullFile.error).toContain('requerido');

    const validFile = validateReceiptFile({ name: 'comprobante.pdf', size: 1024 * 1024, type: 'application/pdf' });
    expect(validFile.isValid).toBe(true);

    const oversizedFile = validateReceiptFile({ name: 'big_receipt.jpg', size: 6 * 1024 * 1024, type: 'image/jpeg' });
    expect(oversizedFile.isValid).toBe(false);
    expect(oversizedFile.error).toContain('5MB');

    const invalidExt = validateReceiptFile({ name: 'receipt.exe', size: 500, type: 'application/octet-stream' });
    expect(invalidExt.isValid).toBe(false);
    expect(invalidExt.error).toContain('Formato de archivo inválido');
  });
});

describe('sniffReceiptContent (#85 — the bytes decide, not the claimed type)', () => {
  it('identifies PNG, JPEG and PDF by their magic bytes', () => {
    expect(
      sniffReceiptContent(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]))
    ).toBe('png');
    expect(sniffReceiptContent(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00]))).toBe('jpg');
    expect(sniffReceiptContent(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]))).toBe('pdf');
  });

  it('answers null for anything else, truncated headers included', () => {
    // An executable renamed .pdf is the case the server-side check exists for.
    expect(sniffReceiptContent(new Uint8Array([0x4d, 0x5a, 0x90, 0x00]))).toBeNull();
    expect(sniffReceiptContent(new Uint8Array([]))).toBeNull();
    expect(sniffReceiptContent(new Uint8Array([0x89, 0x50]))).toBeNull();
    // HTML masquerading as an image.
    expect(sniffReceiptContent(new TextEncoder().encode('<html><script>'))).toBeNull();
  });
});
