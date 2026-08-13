import React from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import RegisterPage from '@/app/(auth)/register/page';

// Mock next/navigation
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
  useSearchParams: () => new URLSearchParams(),
}));

// Mock Supabase client
const mockSignUp = vi.fn();
const mockSignInWithOAuth = vi.fn();
/**
 * `isSupabaseConfigured` belongs in this mock because `lib/authProviders.ts`
 * imports it; leaving it out makes the provider read throw and every gate case
 * below collapse into "unknown" while still reporting green.
 */
let supabaseConfigured = true;
vi.mock('@/lib/supabase/client', () => ({
  isSupabaseConfigured: () => supabaseConfigured,
  createClient: () => ({
    auth: {
      signUp: mockSignUp,
      signInWithOAuth: mockSignInWithOAuth,
    },
  }),
}));

const mockTrack = vi.fn();
vi.mock('@/lib/analytics', () => ({
  track: (...args: unknown[]) => mockTrack(...args),
}));

vi.mock('@/components/PostHogInit', () => ({
  identifyPostHogUser: vi.fn(),
}));

/** Stands in for GET /auth/v1/settings — see tests/unit/authProviders.test.ts. */
function stubProviderSettings(google: boolean) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ external: { google } }) })
  );
}

describe('RegisterPage Component (Task C1 Progressive Profiling Suite)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    supabaseConfigured = true;
    localStorage.clear();
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://real-project.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'real-anon-key');
    stubProviderSettings(true);
  });

  /**
   * Demo-browsing flags never expire; a new tenant carrying one would land
   * on the fixture dashboard after registering (same defect the login page
   * pins — a real sign-in must clear the demo state).
   */
  it('clears the sandbox flags before leaving for Google', async () => {
    localStorage.setItem('business_helper_sandbox', 'true');
    localStorage.setItem('business_helper_demo', 'true');
    let sandboxAtNavigation: string | null = 'unread';
    mockSignInWithOAuth.mockImplementation(async () => {
      sandboxAtNavigation = localStorage.getItem('business_helper_sandbox');
      return { error: null };
    });
    render(<RegisterPage />);

    fireEvent.click(screen.getByRole('button', { name: /Google/i }));

    await waitFor(() => expect(mockSignInWithOAuth).toHaveBeenCalledTimes(1));
    expect(sandboxAtNavigation).toBeNull();
    expect(localStorage.getItem('business_helper_demo')).toBeNull();
  });

  /**
   * #37 — `signup_started` has to mean "reached the form". Fired from the
   * submit handler instead, it would only ever count people who went on to
   * succeed, and the registration drop-off would be invisible.
   */
  describe('signup_started marks arrival, not submission', () => {
    it('fires on mount, before any field is touched', () => {
      render(<RegisterPage />);
      expect(mockTrack).toHaveBeenCalledWith('signup_started');
    });

    it('does not wait for a valid form', async () => {
      render(<RegisterPage />);
      mockTrack.mockClear();

      // A submit that cannot succeed must not be what triggers the event.
      const submit = screen.getByRole('button', { name: /Crear mi cuenta|Comenzar/i });
      await act(async () => {
        fireEvent.click(submit);
      });

      expect(mockTrack).not.toHaveBeenCalledWith('signup_started');
      expect(mockTrack).not.toHaveBeenCalledWith(
        'signup_started',
        expect.objectContaining({ registration_method: expect.anything() })
      );
    });
  });

  /** #48 — the twin of the login-page gate; same defect, same reasoning. */
  describe('Google button is gated on the provider actually being enabled (#48)', () => {
    it('removes the button once the Auth server says Google is disabled', async () => {
      stubProviderSettings(false);
      render(<RegisterPage />);

      await waitFor(() => {
        expect(screen.queryByRole('button', { name: /Continuar con Google/i })).not.toBeInTheDocument();
      });
      expect(screen.queryByText(/o completa tus datos/i)).not.toBeInTheDocument();
    });

    it('keeps the button when the Auth server says Google is enabled', async () => {
      render(<RegisterPage />);

      await waitFor(() => expect(global.fetch).toHaveBeenCalled());
      expect(screen.getByRole('button', { name: /Continuar con Google/i })).toBeInTheDocument();
    });

    it('never starts the OAuth navigation for a disabled provider, explaining why in Spanish', async () => {
      stubProviderSettings(false);
      render(<RegisterPage />);

      fireEvent.click(screen.getByRole('button', { name: /Continuar con Google/i }));

      await waitFor(() => {
        expect(screen.getByText(/Por ahora no es posible registrarte con Google/i)).toBeInTheDocument();
      });
      expect(mockSignInWithOAuth).not.toHaveBeenCalled();
    });
  });

  it('renders registration form with optional RFC indicator text', () => {
    render(<RegisterPage />);
    expect(screen.getByRole('heading', { level: 1, name: /Registra tu Negocio/i })).toBeInTheDocument();
    expect(screen.getByText(/Opcional al registrarte/i)).toBeInTheDocument();
  });

  it('allows user to sign up cleanly WITHOUT providing an RFC (Task C1 Progressive Profiling)', async () => {
    // Server-shaped success: user AND session (confirmations off). The session
    // is what authorizes the push to /onboarding — see the #246 suite below.
    mockSignUp.mockResolvedValueOnce({
      data: {
        user: { id: 'user_123', identities: [{ id: 'ident_1' }] },
        session: { access_token: 'jwt' },
      },
      error: null,
    });
    render(<RegisterPage />);

    const businessNameInput = screen.getByPlaceholderText(/Materiales MTY SA de CV/i);
    const phoneInput = document.getElementById('register-phone') as HTMLInputElement;
    const emailInput = screen.getByPlaceholderText(/roberto@materialesmty.mx/i);
    const passwordInput = screen.getByPlaceholderText(/Mínimo 6 caracteres/i);
    const termsCheckbox = screen.getByRole('checkbox');
    const submitButton = screen.getByRole('button', { name: /Comenzar Prueba Gratis/i });

    fireEvent.change(businessNameInput, { target: { value: 'Mi Empresa Demo' } });
    fireEvent.change(phoneInput, { target: { value: '8112345678' } });
    fireEvent.change(emailInput, { target: { value: 'demo@empresa.mx' } });
    fireEvent.change(passwordInput, { target: { value: 'Password123!' } });
    fireEvent.click(termsCheckbox);

    await act(async () => {
      fireEvent.click(submitButton);
    });

    expect(mockSignUp).toHaveBeenCalledWith({
      email: 'demo@empresa.mx',
      password: 'Password123!',
      options: {
        data: expect.objectContaining({
          business_name: 'Mi Empresa Demo',
          phone: '+528112345678',
          rfc: null,
        }),
      },
    });

    expect(mockPush).toHaveBeenCalledWith('/onboarding');
  });

  it('validates RFC if user chooses to provide one', async () => {
    render(<RegisterPage />);

    const rfcInput = screen.getByPlaceholderText(/ABC120315HD9/i);
    fireEvent.change(rfcInput, { target: { value: 'INVALID_RFC' } });

    const businessNameInput = screen.getByPlaceholderText(/Materiales MTY SA de CV/i);
    const phoneInput = document.getElementById('register-phone') as HTMLInputElement;
    const emailInput = screen.getByPlaceholderText(/roberto@materialesmty.mx/i);
    const passwordInput = screen.getByPlaceholderText(/Mínimo 6 caracteres/i);
    const termsCheckbox = screen.getByRole('checkbox');
    const submitButton = screen.getByRole('button', { name: /Comenzar Prueba Gratis/i });

    fireEvent.change(businessNameInput, { target: { value: 'Mi Empresa Demo' } });
    fireEvent.change(phoneInput, { target: { value: '8112345678' } });
    fireEvent.change(emailInput, { target: { value: 'demo@empresa.mx' } });
    fireEvent.change(passwordInput, { target: { value: 'Password123!' } });
    fireEvent.click(termsCheckbox);

    await act(async () => {
      fireEvent.click(submitButton);
    });

    expect(screen.getByText(/Por favor ingresa un RFC válido/i)).toBeInTheDocument();
    expect(mockSignUp).not.toHaveBeenCalled();
  });

  /**
   * #246 — GoTrue returns a non-null `data.user` in every non-error outcome,
   * so branching on it read "confirmation email sent" as "signed in" and
   * pushed a sessionless user into an onboarding whose submit answers 401.
   * The #116 lesson applies: the old branch survived because the suite only
   * ever fed one object shape. These feed the other two signUp can return.
   */
  describe('signUp outcomes that are not a signed-in session (#246)', () => {
    async function fillAndSubmit() {
      fireEvent.change(screen.getByPlaceholderText(/Materiales MTY SA de CV/i), {
        target: { value: 'Mi Empresa Demo' },
      });
      fireEvent.change(document.getElementById('register-phone') as HTMLInputElement, {
        target: { value: '8112345678' },
      });
      fireEvent.change(screen.getByPlaceholderText(/roberto@materialesmty.mx/i), {
        target: { value: 'demo@empresa.mx' },
      });
      fireEvent.change(screen.getByPlaceholderText(/Mínimo 6 caracteres/i), {
        target: { value: 'Password123!' },
      });
      fireEvent.click(screen.getByRole('checkbox'));
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /Comenzar Prueba Gratis/i }));
      });
    }

    it('a user without a session means "confirma tu correo" — success-styled, and no push to /onboarding', async () => {
      mockSignUp.mockResolvedValueOnce({
        data: { user: { id: 'user_123', identities: [{ id: 'ident_1' }] }, session: null },
        error: null,
      });
      render(<RegisterPage />);

      await fillAndSubmit();

      expect(mockPush).not.toHaveBeenCalled();
      expect(screen.getByText(/Te enviamos un enlace de confirmación/i)).toBeInTheDocument();
      expect(screen.getByText(/demo@empresa.mx/i)).toBeInTheDocument();
      // A completed step, not a failure — it must not render in the error alert.
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
      expect(mockTrack).toHaveBeenCalledWith(
        'signup_completed',
        expect.objectContaining({ pending_email_confirmation: true })
      );
    });

    it('the anti-enumeration fake user (no identities) is an already-registered email, not a new account', async () => {
      mockSignUp.mockResolvedValueOnce({
        data: { user: { id: 'user_obfuscated', identities: [] }, session: null },
        error: null,
      });
      render(<RegisterPage />);

      await fillAndSubmit();

      expect(mockPush).not.toHaveBeenCalled();
      expect(screen.getByText(/Ese correo ya tiene una cuenta/i)).toBeInTheDocument();
      expect(mockTrack).not.toHaveBeenCalledWith(
        'signup_completed',
        expect.objectContaining({ pending_email_confirmation: true })
      );
    });
  });
});
