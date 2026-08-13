/**
 * Regenerates the landing-page demo screenshots in public/assets/demo/.
 *
 * Usage:
 *   1. Start the app with Supabase UNSET so every page serves demo fixtures:
 *      `npm run dev`
 *   2. `node scripts/generate-landing-media.mjs`
 *
 * Environment overrides:
 *   BASE_URL         app origin (default http://localhost:3000)
 *   CHROMIUM_PATH    Chromium executable, for containers whose bundled
 *                    browser does not match @playwright/test's pinned build
 *                    (e.g. /opt/pw-browsers/chromium on Claude Code remote)
 *
 * This replaces tests/e2e/generate-media.spec.ts, which wrote to a
 * hard-coded path on a machine that no longer exists and re-ran on every
 * `npm run test:e2e` (#244). Generation is a deliberate act, not a test.
 *
 * The OTP send call is fulfilled with the real route's email-channel success
 * shape because the demo deployment intentionally refuses to send codes; the
 * modal then renders its genuine email-sent state. Every other frame is the
 * app exactly as the demo deployment serves it.
 */
import { chromium } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public/assets/demo');

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
});
const context = await browser.newContext({
  viewport: { width: 1680, height: 1050 },
  deviceScaleFactor: 2,
});
const page = await context.newPage();

async function dismissCookieBanner() {
  const btn = page.locator('button:has-text("Solo Esenciales")');
  if (await btn.isVisible().catch(() => false)) {
    await btn.click();
    await page.waitForTimeout(400);
  }
}

async function shoot(name, opts = {}) {
  await page.screenshot({ path: path.join(OUT, name), fullPage: false, ...opts });
  console.log(`✓ ${name}`);
}

// ---- cuj_02: dashboard KPIs -------------------------------------------------
await page.goto(`${BASE}/dashboard?demo=true`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await dismissCookieBanner();
await shoot('cuj_02_dashboard_kpis.png', { fullPage: true });

// ---- cuj_04: quote wizard step 2 -------------------------------------------
await page.goto(`${BASE}/quotes?demo=true`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await dismissCookieBanner();
await page.locator('button:has-text("Nueva Cotización"), button:has-text("Nueva")').first().click();
await page.waitForTimeout(800);
await page.locator('input[placeholder*="ej. Suministro"]').fill('Cotización Materiales y Acabados Pro');
await page.waitForTimeout(400);
await page.click('button:has-text("Siguiente")');
await page.waitForTimeout(800);
await page.locator('input[placeholder*="Descripción"]').first().fill('Tonelada Cemento CPO 40');
await page.waitForTimeout(500);
await shoot('cuj_04_quote_wizard_step2.png');

// ---- cuj_05: OTP signing modal, email-sent state ----------------------------
await page.route('**/api/quotes/public/*/otp', (route) =>
  route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ success: true, channel: 'email' }),
  })
);
await page.goto(`${BASE}/q/demo-token`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await dismissCookieBanner();
await page.click('button:has-text("Aceptar y Firmar Cotización")');
await page.waitForTimeout(600);
await page.click('button:has-text("Enviar Código de Verificación")');
await page.waitForTimeout(800);
await shoot('cuj_05_signing_otp_modal.png');
await page.unroute('**/api/quotes/public/*/otp');

// ---- cuj_06: accounts receivable -------------------------------------------
await page.goto(`${BASE}/receivables?demo=true`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await dismissCookieBanner();
await shoot('cuj_06_accounts_receivable.png', { fullPage: true });

// ---- cuj_07: SPEI payment portal, framed on the comprobante form ------------
await page.goto(`${BASE}/pay/demo-pay-token`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await dismissCookieBanner();
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await page.waitForTimeout(600);
await shoot('cuj_07_spei_portal.png');

// ---- cuj_10: invoices / CFDI -----------------------------------------------
await page.goto(`${BASE}/invoices?demo=true`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
await dismissCookieBanner();
await shoot('cuj_10_invoices_sat.png', { fullPage: true });

// ---- og-image: 1200×630 social-share card off the landing hero --------------
// app/layout.tsx declares /og-image.png for OpenGraph/Twitter; without this
// file every share of the site renders a broken preview.
const ogPage = await browser.newPage({
  viewport: { width: 1200, height: 630 },
  deviceScaleFactor: 1,
});
await ogPage.goto(`${BASE}/`, { waitUntil: 'networkidle' });
await ogPage.waitForTimeout(1500);
const ogCookies = ogPage.locator('button:has-text("Solo Esenciales")');
if (await ogCookies.isVisible().catch(() => false)) {
  await ogCookies.click();
  await ogPage.waitForTimeout(400);
}
await ogPage.screenshot({
  path: path.resolve(OUT, '../../og-image.png'),
  fullPage: false,
});
console.log('✓ og-image.png');
await ogPage.close();

await browser.close();
console.log('All landing media regenerated into public/assets/demo/');
