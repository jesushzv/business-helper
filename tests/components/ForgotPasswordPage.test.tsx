import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ForgotPasswordPage from '@/app/(auth)/forgot-password/page';

// Mock Supabase client
const mockResetPasswordForEmail = vi.fn();
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      resetPasswordForEmail: mockResetPasswordForEmail,
    },
  }),
}));

describe('ForgotPasswordPage Component Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders H1 title and email input field', () => {
    render(<ForgotPasswordPage />);
    expect(screen.getByRole('heading', { level: 1, name: /Recupera tu Contraseña/i })).toBeInTheDocument();
    const emailInput = screen.getByPlaceholderText(/don.roberto@negocio.mx/i);
    expect(emailInput).toBeInTheDocument();
    expect(emailInput.className).toContain('min-h-[48px]');
  });

  it('renders link to return to /login', () => {
    render(<ForgotPasswordPage />);
    const returnLink = screen.getByRole('link', { name: /Regresar al Inicio de Sesión/i });
    expect(returnLink).toBeInTheDocument();
    expect(returnLink).toHaveAttribute('href', '/login');
  });

  it('handles password reset submission successfully', async () => {
    mockResetPasswordForEmail.mockResolvedValueOnce({ error: null });
    render(<ForgotPasswordPage />);

    const emailInput = screen.getByPlaceholderText(/don.roberto@negocio.mx/i);
    const submitButton = screen.getByRole('button', { name: /Enviar Enlace de Recuperación/i });

    fireEvent.change(emailInput, { target: { value: 'usuario@negocio.mx' } });
    await act(async () => {
      fireEvent.click(submitButton);
    });

    expect(mockResetPasswordForEmail).toHaveBeenCalledWith(
      'usuario@negocio.mx',
      expect.objectContaining({ redirectTo: expect.stringContaining('/reset-password') })
    );
  });
});
