import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { DemoSchedulerModal } from '@/components/landing/DemoSchedulerModal';

describe('DemoSchedulerModal Component Suite', () => {
  it('does not render when isOpen is false', () => {
    render(<DemoSchedulerModal isOpen={false} onClose={vi.fn()} />);
    expect(screen.queryByText(/Agendar Demostración en Vivo/i)).not.toBeInTheDocument();
  });

  it('renders modal content, time slot choices, and form fields when isOpen is true', () => {
    render(<DemoSchedulerModal isOpen={true} onClose={vi.fn()} />);
    expect(screen.getByText(/Agendar Demostración en Vivo/i)).toBeInTheDocument();
    expect(screen.getByText(/15 minutos con un especialista/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Nombre de tu Negocio/i)).toBeInTheDocument();
  });

  it('allows selecting a time slot and submitting the booking form', () => {
    const handleClose = vi.fn();
    render(<DemoSchedulerModal isOpen={true} onClose={handleClose} />);

    const slotBtn = screen.getByRole('button', { name: /Hoy 4:00 PM/i });
    fireEvent.click(slotBtn);

    const businessInput = screen.getByPlaceholderText(/Nombre de tu Negocio/i);
    const phoneInput = screen.getByPlaceholderText(/Teléfono /i);

    fireEvent.change(businessInput, { target: { value: 'Comercializadora Regia S.A.' } });
    fireEvent.change(phoneInput, { target: { value: '8119876543' } });

    const submitBtn = screen.getByRole('button', { name: /Confirmar Cita/i });
    expect(submitBtn.className).toContain('min-h-[48px]');

    fireEvent.click(submitBtn);

    expect(screen.getByText(/¡Demostración Agendada!/i)).toBeInTheDocument();
  });
});
