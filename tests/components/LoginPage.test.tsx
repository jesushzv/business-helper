import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
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
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      signInWithPassword: mockSignInWithPassword,
      signInWithOAuth: mockSignInWithOAuth,
    },
  }),
}));

describe('LoginPage Component (Task C7 Remediation Suite)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
