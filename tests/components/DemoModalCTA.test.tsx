import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { LiveDemoButton } from '@/components/landing/LiveDemoButton';
import { DemoSchedulerModal } from '@/components/landing/DemoSchedulerModal';

describe('Task A3: Fix Ver Demostración en Video CTA & Video Modal Player Suite', () => {
  it('renders LiveDemoButton and opens modal when clicked', () => {
    render(<LiveDemoButton />);
    const button = screen.getByRole('button', { name: /Ver Demostración en Video/i });
    expect(button).toBeInTheDocument();

    fireEvent.click(button);
    expect(screen.getByRole('heading', { name: /Ver Video de Caso de Estudio PyME|Demostración en Video/i })).toBeInTheDocument();
  });

  it('allows user to switch directly to instant video viewing mode inside modal', () => {
    render(<DemoSchedulerModal isOpen={true} onClose={() => {}} />);
    const watchDirectlyButton = screen.getByRole('button', { name: /Ver Video de Inmediato|Ver Video Ahora/i });
    expect(watchDirectlyButton).toBeInTheDocument();

    fireEvent.click(watchDirectlyButton);
    expect(screen.getByTestId('instant-video-player')).toBeInTheDocument();
  });
});
