import { describe, it, expect } from 'vitest';
import { validateTrackingReference, validateReceiptFile } from '@/lib/speiValidator';

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
