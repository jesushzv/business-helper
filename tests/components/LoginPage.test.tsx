import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import LoginPage from '@/app/(auth)/login/page';

// Mock next/navigation
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

// Mock Supabase client
const mockSignInWithPassword = vi.fn();
const mockSignInWithOAuth = vi.fn();
/**
 * `isSupabaseConfigured` has to be part of this mock: `lib/authProviders.ts`
 * imports it, and a partial mock would leave it `undefined`, making the
 * provider read throw and resolve to "unknown" for every case below. The
 * suite would still pass — and would be asserting nothing about the gate.
 */
let supabaseConfigured = true;
vi.mock('@/lib/supabase/client', () => ({
  isSupabaseConfigured: () => supabaseConfigured,
  createClient: () => ({
    auth: {
      signInWithPassword: mockSignInWithPassword,
      signInWithOAuth: mockSignInWithOAuth,
    },
  }),
}));

/** Stands in for GET /auth/v1/settings — see tests/unit/authProviders.test.ts. */
function stubProviderSettings(google: boolean | 'unreachable') {
  vi.stubGlobal(
    'fetch',
    google === 'unreachable'
      ? vi.fn().mockRejectedValue(new Error('network down'))
      : vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ external: { google } }) })
  );
}

describe('LoginPage Component (Task C7 Remediation Suite)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    supabaseConfigured = true;
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://real-project.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'real-anon-key');
    stubProviderSettings(true);
  });

  it('renders H1 headline and subtitle cleanly', () => {
    render(<LoginPage />);
    expect(screen.getByRole('heading', { level: 1, name: /Inicia Sesión/i })).toBeInTheDocument();
    expect(screen.getByText(/Controla tus cotizaciones, cobranza y facturación/i)).toBeInTheDocument();
  });

  it('renders input fields for email/phone and password with >= 48px touch targets', () => {
    render(<LoginPage />);
    const emailInput = screen.getByPlaceholderText(/don.roberto@negocio.mx/i);
    const passwordInput = screen.getByPlaceholderText(/••••••••/i);

    expect(emailInput).toBeInTheDocument();
    expect(passwordInput).toBeInTheDocument();

    expect(emailInput.className).toContain('min-h-[48px]');
    expect(passwordInput.className).toContain('min-h-[48px]');
  });

  it('renders password visibility toggle button and toggles input type', () => {
    render(<LoginPage />);
    const passwordInput = screen.getByPlaceholderText(/••••••••/i) as HTMLInputElement;
    expect(passwordInput.type).toBe('password');

    const toggleButton = screen.getByRole('button', { name: /mostrar contraseña|ocultar contraseña/i });
    expect(toggleButton).toBeInTheDocument();

    fireEvent.click(toggleButton);
    expect(passwordInput.type).toBe('text');

    fireEvent.click(toggleButton);
    expect(passwordInput.type).toBe('password');
  });

  it('renders password recovery link pointing to /forgot-password', () => {
    render(<LoginPage />);
    const forgotLink = screen.getByRole('link', { name: /¿Olvidaste tu contraseña\?/i });
    expect(forgotLink).toBeInTheDocument();
    expect(forgotLink).toHaveAttribute('href', '/forgot-password');
  });

  it('renders Google OAuth social login button', () => {
    render(<LoginPage />);
    const googleButton = screen.getByRole('button', { name: /Continuar con Google/i });
    expect(googleButton).toBeInTheDocument();
    expect(googleButton.className).toContain('min-h-[48px]');
  });

  /**
   * #48 — the production Auth server answers `external.google: false`, and
   * `signInWithOAuth` cannot report that back: it assigns `window.location`
   * and returns `error: null`, so the user leaves for GoTrue's raw English
   * JSON on a supabase.co origin. The button must not be live in that state.
   */
  describe('Google button is gated on the provider actually being enabled (#48)', () => {
    it('removes the button once the Auth server says Google is disabled', async () => {
      stubProviderSettings(false);
      render(<LoginPage />);

      // Present on first paint — the answer is not known yet, and claiming
      // "disabled" before asking would be inventing a fact.
      expect(screen.getByRole('button', { name: /Continuar con Google/i })).toBeInTheDocument();

      await waitFor(() => {
        expect(screen.queryByRole('button', { name: /Continuar con Google/i })).not.toBeInTheDocument();
      });
      // The "or" divider goes with it — there is nothing left to be an alternative to.
      expect(screen.queryByText(/o accede con tu cuenta/i)).not.toBeInTheDocument();
    });

    it('keeps the button when the Auth server says Google is enabled', async () => {
      stubProviderSettings(true);
      render(<LoginPage />);

      await waitFor(() => expect(global.fetch).toHaveBeenCalled());
      expect(screen.getByRole('button', { name: /Continuar con Google/i })).toBeInTheDocument();
    });

    it('keeps the button when the provider read fails — unknown is not "disabled"', async () => {
      stubProviderSettings('unreachable');
      render(<LoginPage />);

      await waitFor(() => expect(global.fetch).toHaveBeenCalled());
      // Hiding on a network blip would lock out anyone whose only account is a
      // Google one, so unknown stays permissive.
      expect(screen.getByRole('button', { name: /Continuar con Google/i })).toBeInTheDocument();
    });

    it('never starts the OAuth navigation for a disabled provider, explaining why in Spanish', async () => {
      // The click races the settings read: the button is still on screen while
      // the answer is in flight, which is the window this guard closes.
      stubProviderSettings(false);
      render(<LoginPage />);

      fireEvent.click(screen.getByRole('button', { name: /Continuar con Google/i }));

      await waitFor(() => {
        expect(screen.getByText(/Por ahora no es posible entrar con Google/i)).toBeInTheDocument();
      });
      expect(mockSignInWithOAuth).not.toHaveBeenCalled();
    });

    it('starts the OAuth navigation when the provider is enabled', async () => {
      mockSignInWithOAuth.mockResolvedValue({ error: null });
      stubProviderSettings(true);
      render(<LoginPage />);

      fireEvent.click(screen.getByRole('button', { name: /Continuar con Google/i }));

      await waitFor(() => expect(mockSignInWithOAuth).toHaveBeenCalledTimes(1));
      expect(mockSignInWithOAuth.mock.calls[0][0]).toMatchObject({ provider: 'google' });
    });

    it('offers no Google button on the unconfigured demo deployment', async () => {
      supabaseConfigured = false;
      render(<LoginPage />);

      await waitFor(() => {
        expect(screen.queryByRole('button', { name: /Continuar con Google/i })).not.toBeInTheDocument();
      });
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });

  it('renders registration link pointing to /register', () => {
    render(<LoginPage />);
    const registerLink = screen.getByRole('link', { name: /Registra tu Negocio Gratis/i });
    expect(registerLink).toBeInTheDocument();
    expect(registerLink).toHaveAttribute('href', '/register');
  });

  it('renders demo panel button pointing to /dashboard?demo=true', () => {
    render(<LoginPage />);
    // Relabelled "Ver Panel de Demostración" -> "Ver Demo" in 0bc5f8c. The link
    // and its destination are unchanged, which is what this test is really for.
    const demoLink = screen.getByRole('link', { name: /Ver Demo/i });
    expect(demoLink).toBeInTheDocument();
    expect(demoLink).toHaveAttribute('href', '/dashboard?demo=true');
  });

  it('submits form successfully and redirects to /dashboard', async () => {
    mockSignInWithPassword.mockResolvedValueOnce({ error: null });
    render(<LoginPage />);

    const emailInput = screen.getByPlaceholderText(/don.roberto@negocio.mx/i);
    const passwordInput = screen.getByPlaceholderText(/••••••••/i);
    const submitButton = screen.getByRole('button', { name: /Entrar a mi Cuenta/i });

    fireEvent.change(emailInput, { target: { value: 'test@negocio.mx' } });
    fireEvent.change(passwordInput, { target: { value: 'securepassword123' } });
    fireEvent.click(submitButton);

    expect(mockSignInWithPassword).toHaveBeenCalledWith({
      email: 'test@negocio.mx',
      password: 'securepassword123',
    });
  });
});
