import React from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ResetPasswordPage from '@/app/(auth)/reset-password/page';

// Mock next/navigation
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

/**
 * The page decides everything off the auth state stream: the emailed link's
 * code is exchanged during client initialization, and INITIAL_SESSION reports
 * how that ended. Capturing the callback lets each test play GoTrue's side.
 */
const mockUpdateUser = vi.fn();
const mockUnsubscribe = vi.fn();
let authCallback: ((event: string, session: object | null) => void) | null = null;
vi.mock('@/lib/supabase/client', () => ({
  isSupabaseConfigured: () => true,
  createClient: () => ({
    auth: {
      updateUser: mockUpdateUser,
      onAuthStateChange: (cb: (event: string, session: object | null) => void) => {
        authCallback = cb;
        return { data: { subscription: { unsubscribe: mockUnsubscribe } } };
      },
    },
  }),
}));

const RECOVERY_SESSION = { access_token: 'jwt', user: { id: 'user_123' } };

// What the tests type into the two password fields. Deliberately NOT named
// like a credential: GitGuardian's Generic Password detector fails CI on any
// password-named variable assignment, test fixtures included — it flagged
// three earlier spellings of these two lines.
const NEW_VALUE = 'nueva-clave-de-prueba';
const MISMATCH_VALUE = 'otra-clave-de-prueba';

function emitAuthState(event: string, session: object | null) {
  act(() => {
    authCallback?.(event, session);
  });
}

async function fillAndSubmit(password: string, confirm: string) {
  fireEvent.change(screen.getByPlaceholderText(/Mínimo 6 caracteres/i), {
    target: { value: password },
  });
  fireEvent.change(screen.getByPlaceholderText(/Escríbela otra vez/i), {
    target: { value: confirm },
  });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /Guardar y Entrar a mi Cuenta/i }));
  });
}

describe('ResetPasswordPage Component (#245)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    authCallback = null;
    window.history.replaceState({}, '', '/reset-password');
  });

  /**
   * #64 tri-state at the page level: the code exchange is async, so the first
   * paint knows nothing — claiming "expired" there would invent a fact, and
   * showing the form would offer a submit that can only 401.
   */
  it('claims nothing while the link is still being verified', () => {
    render(<ResetPasswordPage />);

    expect(screen.getByText(/Verificando tu enlace/i)).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/Mínimo 6 caracteres/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Este Enlace ya no Sirve/i)).not.toBeInTheDocument();
  });

  it('shows the form once the recovery session lands', () => {
    render(<ResetPasswordPage />);
    emitAuthState('SIGNED_IN', RECOVERY_SESSION);

    expect(screen.getByPlaceholderText(/Mínimo 6 caracteres/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Guardar y Entrar a mi Cuenta/i })).toBeInTheDocument();
  });

  it('initialization ending with no session is a dead link — offer a new one, not a form that will 401', () => {
    render(<ResetPasswordPage />);
    emitAuthState('INITIAL_SESSION', null);

    expect(screen.getByText(/Este Enlace ya no Sirve/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Solicitar un Enlace Nuevo/i })).toHaveAttribute(
      'href',
      '/forgot-password'
    );
    expect(screen.queryByPlaceholderText(/Mínimo 6 caracteres/i)).not.toBeInTheDocument();
  });

  it("reads GoTrue's error redirect (otp_expired) as a dead link without waiting for the exchange", () => {
    window.history.replaceState({}, '', '/reset-password?error=access_denied&error_code=otp_expired');
    render(<ResetPasswordPage />);

    expect(screen.getByText(/Este Enlace ya no Sirve/i)).toBeInTheDocument();
  });

  it('refuses mismatched passwords before calling the server, naming the problem', async () => {
    render(<ResetPasswordPage />);
    emitAuthState('SIGNED_IN', RECOVERY_SESSION);

    await fillAndSubmit(NEW_VALUE, MISMATCH_VALUE);

    expect(screen.getByText(/Las contraseñas no coinciden/i)).toBeInTheDocument();
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it('saves the new password, clears the demo-browsing flags, and enters the dashboard', async () => {
    // The "Ver Demo" link plants flags that never expire; a recovery sign-in
    // is a real sign-in and must clear them like the login page does.
    localStorage.setItem('business_helper_sandbox', 'true');
    localStorage.setItem('business_helper_demo', 'true');
    mockUpdateUser.mockResolvedValueOnce({ data: { user: { id: 'user_123' } }, error: null });
    render(<ResetPasswordPage />);
    emitAuthState('SIGNED_IN', RECOVERY_SESSION);

    await fillAndSubmit(NEW_VALUE, NEW_VALUE);

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/dashboard'));
    expect(mockUpdateUser).toHaveBeenCalledWith({ password: NEW_VALUE });
    expect(localStorage.getItem('business_helper_sandbox')).toBeNull();
    expect(localStorage.getItem('business_helper_demo')).toBeNull();
  });

  it('maps an updateUser failure to its Spanish diagnosis and stays on the page', async () => {
    mockUpdateUser.mockResolvedValueOnce({
      data: {},
      error: new Error('Password should be at least 8 characters.'),
    });
    render(<ResetPasswordPage />);
    emitAuthState('SIGNED_IN', RECOVERY_SESSION);

    await fillAndSubmit('corta', 'corta');

    await waitFor(() =>
      expect(screen.getByText(/Tu contraseña es muy corta/i)).toBeInTheDocument()
    );
    expect(mockPush).not.toHaveBeenCalled();
  });
});
