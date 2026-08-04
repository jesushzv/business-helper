import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { DemoSchedulerModal } from '@/components/landing/DemoSchedulerModal';

describe('DemoSchedulerModal Component Suite', () => {
  it('does not render when isOpen is false', () => {
    render(<DemoSchedulerModal isOpen={false} onClose={vi.fn()} />);
    expect(screen.queryByText(/Ver Video de Caso de Estudio/i)).not.toBeInTheDocument();
  });

  it('renders modal content, email field, and business field when isOpen is true', () => {
    render(<DemoSchedulerModal isOpen={true} onClose={vi.fn()} />);
    expect(screen.getByText(/Ver Video de Caso de Estudio PyME/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/contacto@tunegocio.com/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Ej. Distribuidora del Norte/i)).toBeInTheDocument();
  });

  it('allows submitting email and business name to request video case study link', () => {
    const handleClose = vi.fn();
    render(<DemoSchedulerModal isOpen={true} onClose={handleClose} />);

    const businessInput = screen.getByPlaceholderText(/Ej. Distribuidora del Norte/i);
    const emailInput = screen.getByPlaceholderText(/contacto@tunegocio.com/i);

    fireEvent.change(businessInput, { target: { value: 'Comercializadora Regia S.A.' } });
    fireEvent.change(emailInput, { target: { value: 'gerencia@regia.com' } });

    const submitBtn = screen.getByRole('button', { name: /Recibir Video de Caso de Estudio/i });
    expect(submitBtn.className).toContain('min-h-[48px]');

    fireEvent.click(submitBtn);

    expect(screen.getByText(/¡Acceso al Video Enviado!/i)).toBeInTheDocument();
    expect(screen.getByText(/gerencia@regia.com/i)).toBeInTheDocument();
  });
});
