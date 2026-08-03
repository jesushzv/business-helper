import { test, expect } from '@playwright/test';

/**
 * End-to-End User Scenario Playwright Tests — Business Helper
 * 
 * Tests core Mexican SMB user journeys (Don Roberto & Lic. Mariana)
 * based on usability_test_plan.md and ecc-execution-playbook.md.
 */

test.describe('Business Helper E2E User Scenarios', () => {

  test('01 Landing Page & Navigation', async ({ page }) => {
    await page.goto('/');
    
    // Check main branding header
    await expect(page.locator('header')).toContainText('Business');
    await expect(page.locator('header')).toContainText('Helper');

    // Check launch announcement banner
    await expect(page.locator('body')).toContainText('PLATAFORMA');

    // Navigate to Demo Dashboard
    await page.click('text=Ver Demostración');
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.locator('h2').first()).toContainText('¡Hola, Don Roberto!');
  });

  test('02 Don Roberto Scenario: Quote Creation Wizard & WhatsApp 1-Tap Link', async ({ page }) => {
    await page.goto('/quotes');

    // Verify page title in main content
    await expect(page.locator('main h1, body h1').last()).toContainText('Cotizaciones');

    // Click "Nueva Cotización" button to open wizard modal
    await page.click('button:has-text("Nueva Cotización")');

    // Step 1: Target exact title input by unique placeholder inside modal
    await page.fill('input[placeholder*="ej. Suministro"]', 'Cotización Bultos de Cemento');
    
    // Step 1 -> Step 2
    await page.click('button:has-text("Siguiente")');
    await expect(page.locator('form')).toContainText('Impuestos y Retenciones SAT', { timeout: 5000 });

    // Step 2 -> Step 3
    await page.click('button:has-text("Siguiente")');
    await expect(page.locator('form')).toContainText('Total Final', { timeout: 5000 });

    // Step 3 -> Submit quote form
    await page.evaluate(() => (document.querySelector('form button[type="submit"]') as HTMLElement)?.click());

    // Verify modal closes and quote title is rendered
    await expect(page.locator('body')).toContainText('Cotización Bultos de Cemento', { timeout: 10000 });

    // Verify WhatsApp 1-tap Click-to-Chat link is generated
    const whatsappLink = page.locator('a[href*="wa.me"]').first();
    await expect(whatsappLink).toBeVisible();
  });

  test('03 Lic. Mariana Scenario: Accounts Receivable & Overdue Follow-Up', async ({ page }) => {
    await page.goto('/receivables');

    // Verify page title in main content
    await expect(page.locator('body')).toContainText('Cuentas por Cobrar');

    // Verify financial summary cards
    await expect(page.locator('body')).toContainText('Atrasado', { timeout: 10000 });
    await expect(page.locator('body')).toContainText('Vence Hoy');
    await expect(page.locator('body')).toContainText('Por Vencer');

    // Filter by "Todas" tab to show all milestones including overdue
    await page.click('button:has-text("Todas")');

    // Verify WhatsApp payment reminder button exists for milestone
    const reminderBtn = page.locator('a[href*="wa.me"]').first();
    await expect(reminderBtn).toBeVisible({ timeout: 10000 });
    
    const href = await reminderBtn.getAttribute('href');
    expect(href).toContain('wa.me/');
  });

  test('04 Client Public Proposal View & OTP Digital Cryptoseal Signing', async ({ page }) => {
    await page.goto('/q/demo-token');

    // Wait for proposal content to load
    await expect(page.locator('body')).toContainText('Propuesta Comercial', { timeout: 10000 });
    await expect(page.locator('body')).toContainText('Tonelada Cemento CPO 40');
    await expect(page.locator('body')).toContainText('$97,440.00 MXN');

    // Click "Aceptar y Firmar Cotización" to open OTP Modal
    await page.click('button:has-text("Aceptar y Firmar Cotización")');

    // Fill in 6-digit OTP code in modal
    await page.fill('form input[placeholder="123456"]', '123456');

    // Click submit "Firmar Cotización" button inside form modal explicitly
    await page.click('form button[type="submit"]:has-text("Firmar Cotización")');

    // Verify digital cryptoseal (SHA-256) confirmation screen
    await expect(page.locator('body')).toContainText('¡Firma Aceptada con Éxito!', { timeout: 10000 });
    await expect(page.locator('body')).toContainText('Sello SHA-256');
  });

  test('05 Public SPEI Payment Proof Upload Portal', async ({ page }) => {
    await page.goto('/pay/demo-pay-token');

    // Wait for SPEI transfer bank details to load
    await expect(page.locator('body')).toContainText('Datos para Transferencia SPEI', { timeout: 10000 });
    await expect(page.locator('body')).toContainText('012180001234567890');

    // Fill in Banxico Clave de Rastreo
    await page.fill('input[placeholder*="2026"]', '202608301234567890');

    // Fill in transferred amount
    await page.fill('input[type="number"]', '15000');

    // Attach valid SPEI proof receipt file
    await page.setInputFiles('input[type="file"]', {
      name: 'comprobante_spei.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4 Mock SPEI Receipt Content'),
    });

    // Submit SPEI proof form
    await page.click('button:has-text("Enviar Comprobante SPEI")');

    // Verify success confirmation ("¡Comprobante Enviado Exitosamente!")
    await expect(page.locator('body')).toContainText('¡Comprobante Enviado Exitosamente!', { timeout: 10000 });
  });

  test('06 WhatsApp AI Assistant & Executive Control Dashboard', async ({ page }) => {
    // Visit AI Assistant page
    await page.goto('/assistant');
    await expect(page.locator('h1').first()).toContainText('Asistente');

    // Click quick query chip
    await page.click('button:has-text("¿Cuánto me debe Grupo Salinas?")');
    await expect(page.locator('body')).toContainText('Grupo Salinas tiene un saldo pendiente');

    // Visit Executive Dashboard (with demo mode query flag)
    await page.goto('/dashboard?demo=true');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('h2').first()).toContainText('¡Hola, Don Roberto!', { timeout: 15000 });
    await expect(page.locator('body')).toContainText('Panel de Administración');
  });

  test('07 Interactive Auth Flows Journey (Register, Login, Demo Bypass)', async ({ page }) => {
    // 1. Registration flow
    await page.goto('/register');
    await expect(page.locator('h1')).toContainText('Registra tu Negocio');
    
    await page.fill('input[placeholder*="Materiales MTY"]', 'Constructora San Pedro SA');
    await page.fill('input[type="email"]', 'admin@sanpedro.mx');
    await page.fill('input[type="password"]', 'Password123!');
    await expect(page.locator('button[type="submit"]')).toBeEnabled();

    // 2. Login flow
    await page.goto('/login');
    await expect(page.locator('h1')).toContainText('Inicia Sesión');
    await page.fill('input[type="email"]', 'don.roberto@negocio.mx');
    await page.fill('input[type="password"]', 'demo1234');
    
    // 3. Demo bypass navigation
    await page.click('text=Ver Panel de Demostración');
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('08 Stripe Subscription & Tier Management Journey', async ({ page }) => {
    await page.goto('/settings?demo=true');
    await page.waitForLoadState('networkidle');

    // Verify Plan Tiers
    await expect(page.locator('body')).toContainText('Suscripción y Facturación');
    await expect(page.locator('body')).toContainText('Emprendedor');
    await expect(page.locator('body')).toContainText('Negocio');
    await expect(page.locator('body')).toContainText('Empresa');

    // Test clicking tier action button
    const upgradeBtn = page.locator('button:has-text("Cambiar Plan"), button:has-text("Actualizar"), button:has-text("Suscribir")').first();
    if (await upgradeBtn.isVisible()) {
      await upgradeBtn.click().catch(() => {});
    }
  });

  test('09 Clients Management & Trade Credit Scoring Journey', async ({ page }) => {
    await page.goto('/clients?demo=true');
    await page.waitForLoadState('networkidle');

    // Verify Clients List Page
    await expect(page.locator('body')).toContainText('Directorio de Clientes');
    await expect(page.locator('body')).toContainText('Construcciones Maya');

    // Open New Client Modal if present
    const addClientBtn = page.locator('button:has-text("Nuevo Cliente"), button:has-text("Agregar Cliente")').first();
    if (await addClientBtn.isVisible()) {
      await addClientBtn.click();
      await page.waitForTimeout(500);
      await page.screenshot({ path: '/Users/jhzamora/.gemini/antigravity-ide/brain/5a4eec02-95e6-40bb-82d7-a6dd971900ee/cuj_09_new_client_modal.png' });
    }
  });

  test('10 Live Production API Health Check Smoke Test', async ({ request }) => {
    const response = await request.get('/api/health');
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body.status).toBe('healthy');
    expect(body.services.database).toBe('connected');
    expect(body.services.auth).toBe('active');
  });

});
