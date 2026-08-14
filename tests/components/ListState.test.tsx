import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { Users } from 'lucide-react';
import { ListState } from '@/components/shared/ListState';

/**
 * The shared read-path scaffold (#97/#260): loading → error → empty → rows,
 * in that order. The per-page behavior stays pinned by
 * readPathErrorStates.test.tsx; these tests pin the ordering itself, so a
 * regression fails here with the component named rather than three pages
 * deep.
 */

function subject(overrides: Partial<React.ComponentProps<typeof ListState>> = {}) {
  return (
    <ListState
      loading={false}
      error={null}
      isEmpty={false}
      icon={Users}
      errorTitle="No pudimos cargar tu directorio"
      empty={<div>estado vacío</div>}
      {...overrides}
    >
      <div>las filas</div>
    </ListState>
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ListState', () => {
  it('renders the skeleton while loading, before anything else', () => {
    const { container } = render(subject({ loading: true, error: 'boom', isEmpty: true }));

    expect(container.querySelectorAll('.animate-pulse').length).toBe(3);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.queryByText('estado vacío')).toBeNull();
  });

  it('renders the error card — never the empty state — while holding an error (#97)', () => {
    render(subject({ error: 'Error interno', isEmpty: true }));

    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByText('No pudimos cargar tu directorio')).toBeTruthy();
    expect(screen.getByText('Error interno')).toBeTruthy();
    // The claim a failed read must not make.
    expect(screen.queryByText('estado vacío')).toBeNull();
    expect(screen.queryByText('las filas')).toBeNull();
  });

  it('offers a retry that reloads the page', () => {
    const reload = vi.fn();
    vi.stubGlobal('location', { ...window.location, reload });
    render(subject({ error: 'Error interno' }));

    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('renders the page-supplied empty state for a genuinely empty list', () => {
    render(subject({ isEmpty: true }));

    expect(screen.getByText('estado vacío')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('renders the rows when there is data', () => {
    render(subject());

    expect(screen.getByText('las filas')).toBeTruthy();
  });
});
