import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';

/**
 * #99 — three irreversible actions ran on a single unconfirmed tap, and the
 * one confirmation that existed was a native `confirm()`.
 *
 * Stamping a CFDI spends a folio and creates a SAT obligation with no in-app
 * cancel; disconnecting the PAC means re-finding a write-only API key at
 * Facturapi. Neither asked. Client delete did ask — through an OS dialog whose
 * OK/Cancel render in the device language, outside the app's copy rules.
 */

const REQUEST = {
  title: 'Timbrar factura ante el SAT',
  consequence: 'Se usará 1 folio y la factura quedará registrada ante el SAT.',
  confirmLabel: 'Timbrar factura',
  onConfirm: vi.fn(),
};

describe('ConfirmDialog (#99)', () => {
  it('renders nothing without a request', () => {
    render(<ConfirmDialog request={null} onClose={() => {}} />);
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('states the consequence, not just "¿estás seguro?"', () => {
    render(<ConfirmDialog request={{ ...REQUEST }} onClose={() => {}} />);
    // The whole point: the cost is named before the tap.
    expect(screen.getByText(/Se usará 1 folio/)).toBeTruthy();
    expect(screen.getByRole('alertdialog')).toBeTruthy();
  });

  it('names the action on its button instead of "OK"', () => {
    render(<ConfirmDialog request={{ ...REQUEST }} onClose={() => {}} />);
    expect(screen.getByRole('button', { name: 'Timbrar factura' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeTruthy();
  });

  it('runs the action once and closes', async () => {
    const onConfirm = vi.fn(async () => {});
    const onClose = vi.fn();
    render(<ConfirmDialog request={{ ...REQUEST, onConfirm }} onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: 'Timbrar factura' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('cannot be double-fired while the action is in flight', async () => {
    let release: () => void = () => {};
    const onConfirm = vi.fn(() => new Promise<void>((r) => (release = r)));
    render(<ConfirmDialog request={{ ...REQUEST, onConfirm }} onClose={() => {}} />);

    const button = screen.getByRole('button', { name: 'Timbrar factura' });
    fireEvent.click(button);
    await waitFor(() => expect(screen.getByRole('button', { name: /Procesando/ })).toBeTruthy());

    // A second tap on a slow connection must not spend a second folio.
    fireEvent.click(screen.getByRole('button', { name: /Procesando/ }));
    release();
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
  });

  it('does not run the action when dismissed', () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    render(<ConfirmDialog request={{ ...REQUEST, onConfirm }} onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onClose).toHaveBeenCalled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('cannot be answered by a stray tap on the backdrop', () => {
    const onClose = vi.fn();
    render(<ConfirmDialog request={{ ...REQUEST }} onClose={onClose} />);
    fireEvent.click(screen.getByTestId('confirm-dialog'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('offers no close X, so the only answers are yes and no', () => {
    render(<ConfirmDialog request={{ ...REQUEST }} onClose={() => {}} />);
    expect(screen.queryByRole('button', { name: /^Cerrar/ })).toBeNull();
  });
});

/**
 * The scanning half: a native `alert()`/`confirm()` is an OS dialog rendered in
 * the device language, so it can never satisfy hard rule #8. Keeping it out is
 * a property of the tree, not of any one component.
 */
describe('no native dialogs in the UI (#99, #103)', () => {
  const roots = ['app', 'components'];

  function tsxFiles(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) out.push(...tsxFiles(path));
      else if (entry.name.endsWith('.tsx')) out.push(path);
    }
    return out;
  }

  const files = roots.flatMap((root) => tsxFiles(root));

  it('scanned a plausible number of files', () => {
    expect(files.length).toBeGreaterThan(50);
  });

  it('calls no window.alert / confirm / prompt', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const src = readFileSync(file, 'utf8');
      // Strip comments so prose about the defect does not trip the scan.
      const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      if (/(?:^|[^.\w])(?:window\.)?(?:alert|confirm|prompt)\s*\(/m.test(code)) {
        // `handleConfirm(`, `confirmAction.ask(` and friends are dotted or
        // longer identifiers and do not match the boundary above.
        offenders.push(file);
      }
    }
    expect(
      offenders,
      'Use ConfirmDialog/ActionResultDialog — a native dialog renders its buttons in the device language (#99)'
    ).toEqual([]);
  });
});
