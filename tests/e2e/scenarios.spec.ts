import { test, expect } from '@playwright/test';

/**
 * End-to-End User Scenario Playwright Tests — Business Helper
 *
 * Runs against a production build with NO Supabase configured, i.e. the demo
 * deployment posture: `isClientDemoMode()` is on, dashboard pages serve the
 * sandbox fixtures, public GET routes serve demo objects, and every mutating
 * public route refuses with 503 BACKEND_NOT_CONFIGURED.
 *
 * Two rules this suite must never break (#91):
 *
 * 1. It asserts the CURRENT contract, never a remediated defect. The previous
 *    version required the P0-4 hardcoded CLABE on /pay/ and the pre-#57
 *    client-side OTP flow — assertions in direct contradiction with
 *    tests/unit/securityHardening.test.ts. Scenario 05 now asserts the
 *    opposite (no CLABE is served in demo), and scenario 04 asserts the
 *    server-authoritative flow, whose demo-mode answer is an honest refusal.
 *
 * 2. A success screen may only be asserted where the product legitimately
 *    shows one: real server confirmations, or the demo sandbox short-circuit
 *    behind `isClientDemoMode()` (#58) — never a catch-fallback.
 */

test.describe('Business Helper E2E User Scenarios', () => {

  // A returning visitor who already answered the cookie banner — otherwise
  // its fixed overlay intercepts every click near the bottom of the viewport.
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      try {
        localStorage.setItem('bh_cookie_consent', 'essential');
      } catch {
        // Storage unavailable (private mode) — the banner simply shows.
      }
    });
  });

  test('01 Landing Page & Navigation', async ({ page }) => {
    await page.goto('/');

    // Main branding header
    await expect(page.locator('header')).toContainText('Business');
    await expect(page.locator('header')).toContainText('Helper');

    // Launch announcement banner
    await expect(page.locator('body')).toContainText('PLATAFORMA');

    // Navigate to the demo dashboard. Two "Ver Demo" links exist (nav +
    // hero) and the nav one is hidden below lg — take whichever is visible.
    await page
      .getByRole('link', { name: 'Ver Demo' })
      .filter({ visible: true })
      .first()
      .click();
    await expect(page).toHaveURL(/\/dashboard/);
    // The demo persona, reachable only behind isClientDemoMode() (#93).
    await expect(page.locator('h2').first()).toContainText('¡Hola, Don Roberto!');
  });

  test('02 Don Roberto Scenario: Quote Creation Wizard & WhatsApp 1-Tap Link', async ({ page }) => {
    await page.goto('/quotes');

    await expect(page.locator('main h1, body h1').last()).toContainText('Cotizaciones');

    // Open the wizard (the header repeats the button; click the visible one)
    await page
      .getByRole('button', { name: 'Nueva Cotización' })
      .filter({ visible: true })
      .first()
      .click();

    // Step 1: the demo clients load from the sandbox asynchronously and the
    // wizard auto-selects the first — wait for that before advancing, since
    // "Siguiente" is disabled until a client is selected.
    await expect(page.locator('#quotewizardmodal-seleccionar-cliente')).toHaveValue(/.+/);
    await page.locator('#quotewizardmodal-titulo-de-la-cotizacion').fill('Cotización Bultos de Cemento');
    await page.getByRole('button', { name: 'Siguiente' }).click();

    // Step 2: line items start EMPTY on purpose (#93 removed the prefill), so
    // the wizard cannot advance without a real concepto.
    await expect(page.locator('form')).toContainText('Impuestos y Retenciones SAT');
    await page.getByPlaceholder('Descripción del producto o servicio').fill('Bulto Cemento Gris 50kg');
    await page.locator('#line-item-0-quantity').fill('10');
    await page.locator('#line-item-0-unit-price').fill('250');
    await page.getByRole('button', { name: 'Siguiente' }).click();

    // Step 3: summary & confirm
    await expect(page.locator('form')).toContainText('Total Final');
    await page.getByRole('button', { name: 'Generar y Compartir' }).click();

    // The sandbox mutation resolves and the result dialog announces the saved
    // quote; the new card renders with the client's WhatsApp share link.
    await expect(page.locator('body')).toContainText('Cotización creada', { timeout: 10000 });
    await expect(page.locator('body')).toContainText('Cotización Bultos de Cemento');
    await expect(page.locator('a[href*="wa.me"]').first()).toBeVisible();
  });

  test('03 Lic. Mariana Scenario: Accounts Receivable & Overdue Follow-Up', async ({ page }) => {
    await page.goto('/receivables');

    await expect(page.locator('body')).toContainText('Cuentas por Cobrar');

    // Financial summary cards
    await expect(page.locator('body')).toContainText('Atrasado', { timeout: 10000 });
    await expect(page.locator('body')).toContainText('Vence Hoy');
    await expect(page.locator('body')).toContainText('Por Vencer');

    // Show all milestones including overdue
    await page.getByRole('button', { name: 'Todas' }).click();

    // Post-#78 a reminder renders as a live wa.me link ONLY when the row has
    // a client phone and a quote token, and the org can receive money — all
    // true for the demo fixtures. The link goes to the client's phone with
    // the /pay/ URL inside; the Portal SPEI link resolves the quote token.
    const reminderLink = page.locator('a[href*="wa.me"]').first();
    await expect(reminderLink).toBeVisible({ timeout: 10000 });
    expect(await reminderLink.getAttribute('href')).toContain('wa.me/');
    await expect(page.locator('a[href^="/pay/"]').first()).toBeVisible();
  });

  test('04 Client Public Proposal View & Server-Issued OTP Signing (demo refusal)', async ({ page }) => {
    await page.goto('/q/demo-token');

    // The page renders exactly what GET /api/quotes/public/[token] returns —
    // in demo posture, the demo quote.
    await expect(page.locator('body')).toContainText('Propuesta Comercial', { timeout: 10000 });
    await expect(page.locator('body')).toContainText('Tonelada Cemento CPO 40');
    await expect(page.locator('body')).toContainText('97,440.00');

    await page.getByRole('button', { name: 'Aceptar y Firmar Cotización' }).click();

    // Post-#57 the code is server-issued and server-verified: the modal's
    // first step is requesting a code, not typing one. There is no code input
    // on screen yet — the pre-#57 flow this suite used to pin is gone.
    const sendButton = page.getByRole('button', { name: 'Enviar Código de Verificación' });
    await expect(sendButton).toBeVisible();
    await expect(page.locator('form input[placeholder="123456"]')).toHaveCount(0);
    await sendButton.click();

    // With no backend the OTP route answers 503 BACKEND_NOT_CONFIGURED, and
    // the modal surfaces the refusal instead of fabricating a signature
    // (hard rule #1). No seal, no success screen. Scoped to the dialog:
    // Next.js's route announcer is also role=alert.
    await expect(
      page
        .getByRole('dialog', { name: 'Firma Digital con Código OTP' })
        .getByRole('alert')
    ).toContainText('La firma digital no está disponible en modo demo', { timeout: 10000 });
    await expect(page.locator('body')).not.toContainText('¡Firma Aceptada con Éxito!');
  });

  test('05 Public SPEI Payment Portal serves no invented CLABE (P0-4)', async ({ page }) => {
    await page.goto('/pay/demo-pay-token');

    await expect(page.locator('body')).toContainText('Datos para Transferencia SPEI', { timeout: 10000 });

    // Demo bank details are clearly labeled as such, and the demo milestone's
    // CLABE is deliberately null: no 18-digit account number appears anywhere
    // on the page. The remediated P0-4 defect was one fixed CLABE served to
    // every tenant's payers — tests/unit/securityHardening.test.ts pins the
    // literal out of the live routes; this pins the rendered result.
    await expect(page.locator('body')).toContainText('Banco Demo (datos de ejemplo)');
    const bodyText = (await page.locator('body').innerText()).replace(/[\s,.]/g, '');
    expect(bodyText).not.toMatch(/\d{18}/);

    // The proof-upload flow. In demo posture the submit is the sandbox
    // short-circuit behind isClientDemoMode() — the one place a simulated
    // confirmation is legitimate (#58): the POST route answers 503 by design
    // and the visitor is exploring, not paying.
    await page.locator('#page-clave-de-rastreo-banxico').fill('SPEI20260830123456');
    // The amount is pre-filled from the milestone; attach the receipt.
    await page.locator('#page-comprobante-png-jpg-o').setInputFiles({
      name: 'comprobante_spei.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4 Mock SPEI Receipt Content'),
    });
    await page.getByRole('button', { name: 'Enviar Comprobante SPEI' }).click();

    await expect(page.locator('body')).toContainText('¡Comprobante Enviado Exitosamente!', { timeout: 10000 });
  });

  test('06 WhatsApp AI Assistant & Executive Control Dashboard', async ({ page }) => {
    await page.goto('/assistant');
    await expect(page.locator('h1').first()).toContainText('Asistente');

    // Ask the demo ledger a natural-language question. The answer is computed
    // by the rules engine over the sample book of business and labeled as an
    // example — never presented as real data.
    await page
      .getByLabel('Escribe tu pregunta al asistente')
      .fill('¿Cuánto me debe Grupo Salinas?');
    await page.getByRole('button', { name: 'Enviar pregunta' }).click();
    await expect(page.locator('body')).toContainText('Grupo Salinas tiene un saldo pendiente');
    await expect(page.getByText('Ejemplo', { exact: true }).first()).toBeVisible();

    await page.goto('/dashboard?demo=true');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('h2').first()).toContainText('¡Hola, Don Roberto!', { timeout: 15000 });
    await expect(page.locator('body')).toContainText('Panel de Administración');
  });

  test('07 Interactive Auth Flows Journey (Register, Login, Demo Bypass)', async ({ page }) => {
    // 1. Registration flow
    await page.goto('/register');
    await expect(page.locator('h1')).toContainText('Registra tu Negocio');

    await page.getByPlaceholder('Materiales MTY SA de CV').fill('Constructora San Pedro SA');
    await page.locator('input[type="email"]').fill('admin@sanpedro.mx');
    await page.locator('input[type="password"]').first().fill('Password123!');
    await expect(page.locator('button[type="submit"]')).toBeEnabled();

    // 2. Login flow
    await page.goto('/login');
    await expect(page.locator('h1')).toContainText('Inicia Sesión');
    await page.locator('input[type="email"]').fill('don.roberto@negocio.mx');
    await page.locator('input[type="password"]').fill('demo1234');

    // 3. Demo bypass navigation ("Ver Demo" since #47's copy pass)
    await page.getByRole('link', { name: 'Ver Demo' }).click();
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('08 Stripe Subscription & Tier Management Journey', async ({ page }) => {
    await page.goto('/settings');
    await page.waitForLoadState('networkidle');

    // Current tier names come from STRIPE_PLANS in lib/stripe.ts
    await expect(page.locator('body')).toContainText('Plan de Suscripción y Facturación');
    await expect(page.locator('body')).toContainText('Plan Inicial');
    await expect(page.locator('body')).toContainText('Plan Negocio');
    await expect(page.locator('body')).toContainText('Plan Empresa');

    // Each non-current tier offers a checkout entry point.
    await expect(
      page.getByRole('button', { name: /Seleccionar Plan/ }).first()
    ).toBeVisible();
  });

  test('09 Clients Management & Trade Credit Scoring Journey', async ({ page }) => {
    await page.goto('/clients');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('body')).toContainText('Directorio de Clientes');
    await expect(page.locator('body')).toContainText('Construcciones Maya');

    // Open the New Client modal and confirm the form actually appears
    await page
      .getByRole('button', { name: 'Nuevo Cliente' })
      .filter({ visible: true })
      .first()
      .click();
    await expect(page.locator('body')).toContainText('Registrar Nuevo Cliente');
  });

  /**
   * Only meaningful against a deployed URL with a real backend: in the local
   * demo posture /api/health answers "degraded" BY DESIGN (no Supabase), so
   * running this here can only fail for reasons unrelated to the code. The
   * deployed smoke test is #70's scope; set E2E_HEALTH_URL to run it.
   */
  test('10 Live Production API Health Check Smoke Test', async ({ request }) => {
    const healthUrl = process.env.E2E_HEALTH_URL;
    test.skip(!healthUrl, 'Deployed-only check: set E2E_HEALTH_URL (see #70)');

    const response = await request.get(`${healthUrl!.replace(/\/$/, '')}/api/health`);
    expect(response.status()).toBe(200);

    const body = await response.json();
    expect(body.status).toBe('healthy');
    expect(body.services.database).toBe('connected');
    expect(body.services.auth).toBe('active');
  });

});
