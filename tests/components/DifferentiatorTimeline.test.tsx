import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { DifferentiatorTimeline } from '@/components/landing/DifferentiatorTimeline';

describe('DifferentiatorTimeline Component', () => {
  it('renders all 5 steps of the WhatsApp -> OTP -> SPEI -> CFDI 4.0 workflow', () => {
    render(<DifferentiatorTimeline />);
    
    expect(screen.getByText(/Crear Cotización/i)).toBeInTheDocument();
    expect(screen.getByText(/Enviar por WhatsApp/i)).toBeInTheDocument();
    expect(screen.getByText(/Cliente Aprueba con OTP/i)).toBeInTheDocument();
    expect(screen.getByText(/Confirmación SPEI/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Timbrado CFDI 4.0/i).length).toBeGreaterThan(0);
  });

  it('contains clear business benefits copy without technical jargon', () => {
    render(<DifferentiatorTimeline />);

    expect(screen.getByText(/Cotizaciones profesionales en 2 minutos/i)).toBeInTheDocument();
    expect(screen.getByText(/Sin contraseñas complicadas ni papeles/i)).toBeInTheDocument();
    expect(screen.getByText(/Evidencia legal certificada/i)).toBeInTheDocument();
  });
});
