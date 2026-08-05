import React from 'react';
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Task A2 / A10 / A12: Crypto Jargon & Raw Hash Remediation Suite', () => {
  it('verifies app/page.tsx does NOT render raw empty-string SHA-256 hash (sha256:e3b0c442...)', () => {
    const pagePath = path.join(process.cwd(), 'app', 'page.tsx');
    const pageContent = fs.readFileSync(pagePath, 'utf8');

    expect(pageContent).not.toContain('sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  it('verifies app/page.tsx uses human-readable business benefit copy instead of raw Cryptoseal jargon', () => {
    const pagePath = path.join(process.cwd(), 'app', 'page.tsx');
    const pageContent = fs.readFileSync(pagePath, 'utf8');

    expect(pageContent).toContain('Aprobación Digital con WhatsApp');
    expect(pageContent).toContain('Evidencia Legal Certificada');
  });
});
