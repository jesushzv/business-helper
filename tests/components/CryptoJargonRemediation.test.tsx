import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * Guards the crypto-jargon remediation: the landing page must not surface raw
 * hashes or cryptographic terminology to a non-technical audience.
 *
 * The second test used to assert two specific replacement headings by exact
 * string ("Aprobación Digital con WhatsApp", "Evidencia Legal Certificada").
 * Both were later re-worded, so the test failed without anything regressing —
 * it was pinning marketing copy rather than the property being protected.
 * It now asserts the absence of jargon, which is what the remediation actually
 * means and what a regression would reintroduce.
 */
describe('Task A2 / A10 / A12: Crypto Jargon & Raw Hash Remediation Suite', () => {
  const pageContent = fs.readFileSync(
    path.join(process.cwd(), 'app', 'page.tsx'),
    'utf8'
  );

  it('verifies app/page.tsx does NOT render raw empty-string SHA-256 hash (sha256:e3b0c442...)', () => {
    expect(pageContent).not.toContain(
      'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
    );
  });

  it('verifies app/page.tsx uses human-readable business benefit copy instead of raw Cryptoseal jargon', () => {
    // No cryptographic jargon in user-facing landing copy.
    expect(pageContent).not.toMatch(/Cryptoseal/i);
    expect(pageContent).not.toMatch(/SHA-?256/i);
    expect(pageContent).not.toMatch(/\bhash\b/i);

    // Any long hex run would be a raw digest leaking into the page.
    expect(pageContent).not.toMatch(/\b[0-9a-f]{32,}\b/i);
  });
});
