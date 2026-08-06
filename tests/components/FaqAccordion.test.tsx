import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { FaqAccordion } from '@/components/landing/FaqAccordion';

describe('FaqAccordion Component Suite', () => {
  it('renders accordion questions and defaults first item open', () => {
    render(<FaqAccordion />);
    expect(screen.getByText('¿Genera Notas de Venta y Facturas SAT CFDI 4.0?')).toBeInTheDocument();
    // Wording was softened from "incluyen" to "tienen acceso al" in 1a9b532.
    // Keep the weaker claim: CFDI stamping is not actually implemented yet, so
    // asserting plans "include" it would restore a false statement.
    expect(
      screen.getByText(/Todos nuestros planes tienen acceso al timbrado fiscal CFDI 4\.0/i)
    ).toBeInTheDocument();
  });

  it('toggles accordion answer visibility on button click', () => {
    render(<FaqAccordion />);
    const whatsappQuestion = screen.getByText('¿Cómo funciona la integración con WhatsApp?');
    expect(screen.queryByText(/Al generar una cotización o recordatorio/i)).not.toBeInTheDocument();

    const button = whatsappQuestion.closest('button');
    expect(button).not.toBeNull();
    fireEvent.click(button!);

    expect(screen.getByText(/Al generar una cotización o recordatorio/i)).toBeInTheDocument();
  });

  it('enforces Don Roberto persona constraint: touch target height min-h-[48px]', () => {
    render(<FaqAccordion />);
    const buttons = screen.getAllByRole('button');
    buttons.forEach((btn) => {
      expect(btn.className).toContain('min-h-[48px]');
    });
  });
});
