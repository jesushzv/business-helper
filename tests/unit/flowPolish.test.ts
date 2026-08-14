import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { generateWhatsAppShareLink, generateWhatsAppLink } from '@/lib/whatsappLink';

/**
 * #104 — the flow-polish roll-up.
 *
 * The issue says plainly: *re-derive before fixing any subset, this list will
 * go stale.* It had. Two items were already closed by #146 (step-2 validation
 * reports which concepto is wrong; `ClientFormModal` scrolls to and highlights
 * the offending field), so this covers what was actually left.
 *
 * Several of these are wiring rather than logic, so the assertions are on the
 * wiring. What none of them prove is the thing that matters most — that the
 * core loop *feels* like three taps on a phone. That needs a device.
 */

const read = (f: string) => readFileSync(f, 'utf8');

describe('tap budget (#104)', () => {
  it('lets the dashboard CTA open the wizard instead of the list', () => {
    // The CTA was a plain <Link href="/quotes">, so creating a quote spent a
    // tap on pure navigation against a ≤3 budget.
    expect(read('app/(dashboard)/dashboard/page.tsx')).toContain('/quotes?nueva=1');

    const quotes = read('app/(dashboard)/quotes/page.tsx');
    expect(quotes).toContain("get('nueva') === '1'");
    expect(quotes).toContain('setIsWizardOpen(true)');
    // `useSearchParams()` would opt the whole route out of static prerender
    // unless wrapped in Suspense; this is a one-shot entry instruction. The
    // check is on the import, not the word — the comment explaining the
    // choice names the hook.
    expect(quotes).not.toMatch(/import\s*\{[^}]*useSearchParams/);
  });

  it('makes "Generar y Compartir" actually share', () => {
    const quotes = read('app/(dashboard)/quotes/page.tsx');
    // Built from the saved row's token, through the only sanctioned builder.
    expect(quotes).toContain('getQuotePublicUrl(saved.public_token)');
    expect(quotes).toContain('generateWhatsAppLink');
    expect(quotes).toContain('Enviar por WhatsApp');
    // The share is offered as the user's own tap: browsers block window.open
    // outside a gesture, and a silent share is not a share.
    expect(quotes).toContain("window.open(waUrl, '_blank', 'noopener')");
  });

  it('says so when the client has no phone rather than offering a dead share', () => {
    expect(read('app/(dashboard)/quotes/page.tsx')).toContain('no tiene teléfono registrado');
  });
});

describe('WhatsApp share without a recipient (#104)', () => {
  it('opens the contact picker with the message ready', () => {
    const url = generateWhatsAppShareLink('Te invito a colaborar');
    expect(url.startsWith('https://wa.me/?text=')).toBe(true);
    expect(decodeURIComponent(url)).toContain('Te invito a colaborar');
  });

  it('never produces a half-formed link for empty text', () => {
    expect(generateWhatsAppShareLink('')).toBe('https://wa.me/');
    expect(generateWhatsAppShareLink('   ')).toBe('https://wa.me/');
  });

  it('is distinct from the addressed builder, which still needs a number', () => {
    // The addressed one returns '' with no phone — that is what left the
    // invite flow with only a copy button.
    expect(generateWhatsAppLink(null, 'hola')).toBe('');
    expect(generateWhatsAppShareLink('hola')).not.toBe('');
  });

  it('wires the invite flow, whose own copy promised WhatsApp', () => {
    const team = read('components/team/TeamMembersCard.tsx');
    expect(team).toContain('generateWhatsAppShareLink');
    expect(team).toContain('comparte este enlace por WhatsApp');
  });
});

describe('destructive-by-mistake and dead ends (#104)', () => {
  it('guards the wizard against discarding typed work on a mis-tap', () => {
    const wizard = read('components/quotes/QuoteWizardModal.tsx');
    expect(wizard).toContain('isDirty');
    expect(wizard).toContain('Descartar esta cotización');
    expect(wizard).toContain('Seguir editando');
    // An untouched wizard still closes in one tap.
    expect(wizard).toContain('if (!isDirty)');
    // And the guard is actually wired: defining `handleClose` while the Modal
    // still calls `onClose` directly would pass every assertion above and
    // discard the work anyway.
    expect(wizard).toMatch(/<Modal[\s\S]{0,200}onClose=\{handleClose\}/);
  });

  it('tells an empty list apart from a filtered one', () => {
    for (const file of ['app/(dashboard)/quotes/page.tsx', 'app/(dashboard)/receivables/page.tsx']) {
      const src = read(file);
      expect(src, `${file} needs the distinction`).toContain('const isFiltering =');
      expect(src).toContain('Todavía no tienes');
    }
  });

  it('gives the receivables empty state a route onward', () => {
    // It had none at all: a dead end for a tenant who does not yet know that
    // cobros come from an accepted quote.
    expect(read('app/(dashboard)/receivables/page.tsx')).toContain('Ir a Cotizaciones');
  });

  it('loads the same way everywhere', () => {
    // Skeletons on clients and the dashboard, bare centred text on these two.
    for (const file of ['app/(dashboard)/quotes/page.tsx', 'app/(dashboard)/receivables/page.tsx']) {
      expect(read(file), `${file} should use the skeleton`).toContain('animate-pulse rounded-2xl');
      expect(read(file)).not.toContain('text-center text-slate-400 font-medium">Cargando');
    }
  });

  it('cools down the OTP resend instead of letting a double tap spend a send', () => {
    const otp = read('components/quotes/OtpSignatureModal.tsx');
    expect(otp).toContain('RESEND_COOLDOWN_SECONDS');
    // Since #160 the countdown is formatted (m:ss above a minute) and driven
    // by the server's retry_after_seconds when a 429 carries one.
    expect(otp).toContain('Reenviar en ${formatWait(cooldown)}');
    expect(otp).toContain('disabled={sending || cooldown > 0}');
  });

  it('stops the catálogo page printing its own title twice', () => {
    const products = read('app/(dashboard)/products/page.tsx');
    expect(products).toContain('<Header />');
    // The <h1> stays — it is the page's heading for assistive tech.
    expect(products).toContain('Catálogo de Productos y Servicios');
  });
});
