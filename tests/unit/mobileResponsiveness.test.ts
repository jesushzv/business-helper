import { describe, it, expect } from 'vitest';
import { viewport, metadata } from '@/app/layout';
import fs from 'fs';
import path from 'path';

describe('Mobile Responsiveness & System Audit Suite', () => {
  it('exports viewport metadata in layout.tsx with device-width and initial-scale 1', () => {
    expect(viewport).toBeDefined();
    expect(viewport.width).toBe('device-width');
    expect(viewport.initialScale).toBe(1);
  });

  it('contains global CSS 16px input font size rule in globals.css to prevent iOS Safari auto-zoom', () => {
    const globalsCssPath = path.join(process.cwd(), 'app', 'globals.css');
    const globalsCss = fs.readFileSync(globalsCssPath, 'utf8');

    expect(globalsCss).toContain('font-size: 16px');
  });

  it('contains prefers-reduced-motion media query block in globals.css', () => {
    const globalsCssPath = path.join(process.cwd(), 'app', 'globals.css');
    const globalsCss = fs.readFileSync(globalsCssPath, 'utf8');

    expect(globalsCss).toContain('prefers-reduced-motion: reduce');
  });

  it('verifies page.tsx contains responsive mobile Hero title element', () => {
    const pagePath = path.join(process.cwd(), 'app', 'page.tsx');
    const pageContent = fs.readFileSync(pagePath, 'utf8');

    expect(pageContent).toContain('Cotiza y cobra');
    expect(pageContent).toContain('desde tu celular');
  });
});
