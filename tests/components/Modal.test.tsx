import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { Modal } from '@/components/shared/Modal';

/**
 * #100 / #87 — the behaviour every modal in the app now inherits.
 *
 * Each assertion here is a defect that shipped: Escape closed nothing anywhere;
 * focus stayed on the trigger so a keyboard user tabbed the whole obscured page
 * before reaching the form; the close control was an unlabeled icon (or a `✕`
 * glyph) below the 48px touch floor; and the panel could grow past the viewport
 * with its submit button unreachable at any scroll position.
 */

const Body = () => (
  <div>
    <input aria-label="Primer campo" />
    <button type="button">Guardar</button>
  </div>
);

describe('Modal (#100, #87)', () => {
  it('renders nothing when closed', () => {
    render(
      <Modal open={false} onClose={() => {}} title="Cotización">
        <Body />
      </Modal>
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('is a dialog with an accessible name', () => {
    render(
      <Modal open onClose={() => {}} title="Firma Digital con Código OTP">
        <Body />
      </Modal>
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-label')).toBe('Firma Digital con Código OTP');
  });

  it('closes on Escape', () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} title="Cotización">
        <Body />
      </Modal>
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('moves focus into the panel on open', () => {
    render(
      <Modal open onClose={() => {}} title="Cotización">
        <Body />
      </Modal>
    );
    // The panel itself: announced by name, and the next Tab lands inside it
    // rather than walking the obscured page behind.
    expect(document.activeElement).toBe(screen.getByRole('dialog'));
  });

  it('traps Tab inside the panel', () => {
    render(
      <Modal open onClose={() => {}} title="Cotización">
        <Body />
      </Modal>
    );
    // The close button renders before the children, so it is first in tab
    // order and "Guardar" is last.
    const close = screen.getByRole('button', { name: /Cerrar/i });
    const last = screen.getByRole('button', { name: 'Guardar' });

    // Tab off the last control wraps to the first, instead of walking out into
    // the obscured page behind the dialog.
    last.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(close);

    // Shift+Tab off the first wraps back to the last.
    close.focus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  it('offers one close control, named and at the 48px touch floor', () => {
    render(
      <Modal open onClose={() => {}} title="Nuevo Concepto">
        <Body />
      </Modal>
    );
    const close = screen.getByRole('button', { name: 'Cerrar Nuevo Concepto' });
    expect(close.className).toContain('h-12');
    expect(close.className).toContain('w-12');
    expect(screen.queryByText('✕')).toBeNull();
  });

  it('contains the panel height so nothing is unreachable (#87)', () => {
    render(
      <Modal open onClose={() => {}} title="Cotización">
        <Body />
      </Modal>
    );
    const panel = screen.getByRole('dialog');
    expect(panel.className).toContain('max-h-[90vh]');
    expect(panel.className).toContain('overflow-y-auto');
  });

  it('contains the sheet variant too', () => {
    render(
      <Modal open onClose={() => {}} title="Menú Principal" variant="sheet">
        <Body />
      </Modal>
    );
    const panel = screen.getByRole('dialog');
    expect(panel.className).toContain('max-h-[85vh]');
    expect(panel.className).toContain('overflow-y-auto');
  });

  it('dismisses on the backdrop by default and not when the caller opts out', () => {
    const dismissable = vi.fn();
    const { unmount } = render(
      <Modal open onClose={dismissable} title="Explicación" data-testid="a">
        <Body />
      </Modal>
    );
    fireEvent.click(screen.getByTestId('a'));
    expect(dismissable).toHaveBeenCalledTimes(1);
    unmount();

    // A form with typed work in it must not be discarded by a stray tap.
    const guarded = vi.fn();
    render(
      <Modal open onClose={guarded} title="Registrar Cliente" dismissOnBackdrop={false} data-testid="b">
        <Body />
      </Modal>
    );
    fireEvent.click(screen.getByTestId('b'));
    expect(guarded).not.toHaveBeenCalled();
  });

  it('does not close when a click inside the panel bubbles to the backdrop', () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} title="Explicación">
        <Body />
      </Modal>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('hides the close button where the caller has its own exits', () => {
    render(
      <Modal open onClose={() => {}} title="Cotización" hideCloseButton>
        <Body />
      </Modal>
    );
    expect(screen.queryByRole('button', { name: /Cerrar/i })).toBeNull();
  });

  it('locks the page behind it from scrolling, and restores it on close', () => {
    const { unmount } = render(
      <Modal open onClose={() => {}} title="Cotización">
        <Body />
      </Modal>
    );
    expect(document.body.style.overflow).toBe('hidden');
    unmount();
    expect(document.body.style.overflow).toBe('');
  });

  it('returns focus to whatever opened it', () => {
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    trigger.focus();

    const { unmount } = render(
      <Modal open onClose={() => {}} title="Cotización">
        <Body />
      </Modal>
    );
    expect(document.activeElement).not.toBe(trigger);
    unmount();
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });
});
