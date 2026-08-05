import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
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
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      signUp: mockSignUp,
    },
  }),
}));

describe('RegisterPage Component (Task C1 Progressive Profiling Suite)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders registration form with optional RFC indicator text', () => {
    render(<RegisterPage />);
    expect(screen.getByRole('heading', { level: 1, name: /Registra tu Negocio/i })).toBeInTheDocument();
    expect(screen.getByText(/Opcional al registrarte/i)).toBeInTheDocument();
  });

  it('allows user to sign up cleanly WITHOUT providing an RFC (Task C1 Progressive Profiling)', async () => {
    mockSignUp.mockResolvedValueOnce({ data: { user: { id: 'user_123' } }, error: null });
    render(<RegisterPage />);

    const businessNameInput = screen.getByPlaceholderText(/Materiales MTY SA de CV/i);
    const phoneInput = screen.getByPlaceholderText(/8112345678/i);
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
          phone: '8112345678',
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
    const phoneInput = screen.getByPlaceholderText(/8112345678/i);
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
});
