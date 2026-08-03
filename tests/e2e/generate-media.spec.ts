import { test, expect } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

const ARTIFACT_DIR = '/Users/jhzamora/.gemini/antigravity-ide/brain/5a4eec02-95e6-40bb-82d7-a6dd971900ee';

// Configure video recording directory
test.use({
  video: {
    mode: 'on',
    size: { width: 1280, height: 720 },
  },
  viewport: { width: 1280, height: 800 },
});

test.describe('Generate App CUJ Live Demo Videos & Screenshots', () => {

  test('CUJ 01: Landing Page & Product Presentation', async ({ page }) => {
    await page.goto('/?demo=true');
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'cuj_01_landing_hero.png'), fullPage: false });

    // Smooth scroll down
    await page.evaluate(() => window.scrollBy({ top: 600, behavior: 'smooth' }));
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'cuj_01_features.png'), fullPage: false });

    await page.evaluate(() => window.scrollBy({ top: 800, behavior: 'smooth' }));
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'cuj_01_pricing.png'), fullPage: false });

    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
    await page.waitForTimeout(1000);
  });

  test('CUJ 02: Executive Dashboard & Financial Metrics', async ({ page }) => {
    await page.goto('/dashboard?demo=true');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);

    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'cuj_02_dashboard_kpis.png'), fullPage: true });

    // Scroll to charts & recent transactions
    await page.evaluate(() => window.scrollBy({ top: 400, behavior: 'smooth' }));
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'cuj_02_dashboard_activity.png'), fullPage: false });
  });

  test('CUJ 03: Client Portfolio & Credit Scoring', async ({ page }) => {
    await page.goto('/clients?demo=true');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);

    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'cuj_03_clients_portfolio.png'), fullPage: true });

    // Click on first client to view details or score breakdown
    const scoreBadge = page.locator('button:has-text("Score"), span:has-text("Score"), tr button').first();
    if (await scoreBadge.isVisible()) {
      await scoreBadge.click().catch(() => {});
      await page.waitForTimeout(1000);
      await page.screenshot({ path: path.join(ARTIFACT_DIR, 'cuj_03_client_details.png'), fullPage: false });
    }
  });

  test('CUJ 04: Quote Creation Wizard & WhatsApp Link', async ({ page }) => {
    await page.goto('/quotes?demo=true');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'cuj_04_quotes_list.png'), fullPage: true });

    // Open Quote creation modal
    const newQuoteBtn = page.locator('button:has-text("Nueva Cotización"), button:has-text("Nueva")').first();
    if (await newQuoteBtn.isVisible()) {
      await newQuoteBtn.click();
      await page.waitForTimeout(1000);
      await page.screenshot({ path: path.join(ARTIFACT_DIR, 'cuj_04_quote_wizard_modal.png'), fullPage: false });

      // Step 1 input
      const titleInput = page.locator('input[placeholder*="ej. Suministro"]');
      if (await titleInput.isVisible()) {
        await titleInput.fill('Cotización Materiales y Acabados Pro');
        await page.waitForTimeout(800);
        await page.click('button:has-text("Siguiente")');
        await page.waitForTimeout(800);
        await page.screenshot({ path: path.join(ARTIFACT_DIR, 'cuj_04_quote_wizard_step2.png'), fullPage: false });
      }
    }
  });

  test('CUJ 05: Proposal View & Digital Cryptoseal OTP Signing', async ({ page }) => {
    await page.goto('/q/demo-token');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);

    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'cuj_05_public_proposal.png'), fullPage: true });

    const signBtn = page.locator('button:has-text("Aceptar y Firmar Cotización")');
    if (await signBtn.isVisible()) {
      await signBtn.click();
      await page.waitForTimeout(1000);
      await page.screenshot({ path: path.join(ARTIFACT_DIR, 'cuj_05_signing_otp_modal.png'), fullPage: false });

      await page.fill('form input[placeholder="123456"]', '123456');
      await page.click('form button[type="submit"]:has-text("Firmar Cotización")');
      await page.waitForTimeout(1500);

      await page.screenshot({ path: path.join(ARTIFACT_DIR, 'cuj_05_cryptoseal_signed.png'), fullPage: true });
    }
  });

  test('CUJ 06: Accounts Receivable & Collection Follow-Up', async ({ page }) => {
    await page.goto('/receivables?demo=true');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);

    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'cuj_06_accounts_receivable.png'), fullPage: true });

    const filterAllBtn = page.locator('button:has-text("Todas")');
    if (await filterAllBtn.isVisible()) {
      await filterAllBtn.click();
      await page.waitForTimeout(1000);
      await page.screenshot({ path: path.join(ARTIFACT_DIR, 'cuj_06_receivables_filtered.png'), fullPage: false });
    }
  });

  test('CUJ 07: SPEI Payment Proof Upload Portal', async ({ page }) => {
    await page.goto('/pay/demo-pay-token');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);

    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'cuj_07_spei_portal.png'), fullPage: true });

    await page.fill('input[placeholder*="2026"]', '202608039988776655');
    await page.fill('input[type="number"]', '15000');
    await page.setInputFiles('input[type="file"]', {
      name: 'comprobante_spei_demo.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4 Mock SPEI Payment Receipt Content'),
    });
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'cuj_07_spei_filled_form.png'), fullPage: false });

    await page.click('button:has-text("Enviar Comprobante SPEI")');
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'cuj_07_spei_success_confirmation.png'), fullPage: true });
  });

  test('CUJ 08: WhatsApp AI Operations Assistant', async ({ page }) => {
    await page.goto('/assistant?demo=true');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);

    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'cuj_08_ai_assistant.png'), fullPage: true });

    const sampleChip = page.locator('button:has-text("¿Cuánto me debe Grupo Salinas?")');
    if (await sampleChip.isVisible()) {
      await sampleChip.click();
      await page.waitForTimeout(1500);
      await page.screenshot({ path: path.join(ARTIFACT_DIR, 'cuj_08_ai_assistant_response.png'), fullPage: false });
    }
  });

  test('CUJ 09: Products & Services Catalog', async ({ page }) => {
    await page.goto('/products?demo=true');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);

    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'cuj_09_products_catalog.png'), fullPage: true });
  });

  test('CUJ 10: Invoices & SAT CFDI 4.0 Management', async ({ page }) => {
    await page.goto('/invoices?demo=true');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);

    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'cuj_10_invoices_sat.png'), fullPage: true });
  });

});
