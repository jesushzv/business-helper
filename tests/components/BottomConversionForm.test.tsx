import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BottomConversionForm } from '@/components/landing/BottomConversionForm';

/**
 * The landing page's last form before signup (#149).
 *
 * It collects nothing itself — it forwards what the visitor typed to
 * `/register` as query params, so the register form opens pre-filled. That
 * hand-off is the whole behaviour and the whole risk: a param that is dropped,
 * misnamed or double-encoded silently costs the visitor their typing at the one
 * moment they had decided to sign up, and nothing on screen would say so.
 */

const push = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

const businessInput = () => screen.getByPlaceholderText(/Materiales Elizondo/i) as HTMLInputElement;
const phoneInput = () => screen.getByPlaceholderText('8112345678') as HTMLInputElement;
const emailInput = () => screen.getByPlaceholderText(/contacto@tunegocio/i) as HTMLInputElement;
const submit = () => screen.getByRole('button', { name: /Crear Mi Cuenta Gratis/i });

beforeEach(() => {
  push.mockReset();
});

describe('BottomConversionForm hands the visitor’s answers to /register', () => {
  it('carries all three fields through, so nothing has to be typed twice', async () => {
    render(<BottomConversionForm />);

    fireEvent.change(businessInput(), { target: { value: 'Materiales Elizondo S.A. de C.V.' } });
    fireEvent.change(phoneInput(), { target: { value: '8112345678' } });
    fireEvent.change(emailInput(), { target: { value: 'contacto@elizondo.mx' } });
    // Consent starts unchecked (#232); the visitor performs the affirmative
    // act, and jsdom enforces `required` on a click-submit just like a browser.
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(submit());

    await waitFor(() => expect(push).toHaveBeenCalledTimes(1));
    const target = new URL(push.mock.calls[0][0], 'https://businesshelper.app');
    expect(target.pathname).toBe('/register');
    expect(target.searchParams.get('businessName')).toBe('Materiales Elizondo S.A. de C.V.');
    expect(target.searchParams.get('phone')).toBe('8112345678');
    expect(target.searchParams.get('email')).toBe('contacto@elizondo.mx');
  });

  it('omits a blank field rather than sending `undefined` to /register', async () => {
    // The inputs carry `required`, so the browser itself blocks an incomplete
    // click — jsdom enforces that too, which is why this submits the form
    // directly. What is being checked is the params the handler builds: a
    // missing value must be absent, never the string "undefined" pre-filled
    // into the register form as if the visitor had typed it.
    render(<BottomConversionForm />);

    fireEvent.change(businessInput(), { target: { value: 'Ferretería Don Roberto' } });
    fireEvent.submit(document.querySelector('form') as HTMLFormElement);

    await waitFor(() => expect(push).toHaveBeenCalledTimes(1));
    const target = new URL(push.mock.calls[0][0], 'https://businesshelper.app');
    expect(target.searchParams.get('businessName')).toBe('Ferretería Don Roberto');
    expect(target.searchParams.has('email')).toBe(false);
    expect(String(push.mock.calls[0][0])).not.toContain('undefined');
  });

  it('states the consent it is taking, and links both documents', () => {
    // LFPDPPP: the checkbox starts ticked, so the notice has to be legible and
    // both documents reachable from here.
    render(<BottomConversionForm />);

    const consent = document.querySelector('input[type="checkbox"]') as HTMLInputElement;
    // Unchecked by default: LFPDPPP consent is an affirmative act the visitor
    // performs, not a default they'd have to notice and undo (#232). This
    // assertion previously pinned the pre-checked box.
    expect(consent.checked).toBe(false);
    expect(consent.required).toBe(true);
    expect(screen.getByText(/Aviso de Privacidad/i).getAttribute('href')).toBe('/privacy');
    expect(screen.getByText(/Términos y Condiciones/i).getAttribute('href')).toBe('/terms');
  });

  it('keeps the submit within reach of a thumb (Don Roberto, 375px)', () => {
    render(<BottomConversionForm />);
    expect(submit().className).toMatch(/min-h-\[5[46]px\]/);
  });
});
