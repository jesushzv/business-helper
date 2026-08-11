import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ActionResultDialog, useActionResult } from '@/components/shared/ActionResultDialog';
import { ClientWriteError } from '@/lib/clientWriteError';

/**
 * #146 — an action that says nothing is indistinguishable from one that did not
 * happen. Registering a client closed the modal on success and put failures in
 * a banner the phone had already scrolled past, so "did that work?" had no
 * answer either way.
 *
 * The dialog is one component for both outcomes on purpose: the tenant's need
 * after tapping *Guardar* is identical whichever way it went.
 */

const Harness: React.FC<{
  run: (r: ReturnType<typeof useActionResult>) => void;
}> = ({ run }) => {
  const result = useActionResult();
  return (
    <>
      <button onClick={() => run(result)}>go</button>
      <ActionResultDialog result={result.value} onClose={result.dismiss} />
    </>
  );
};

const go = () => fireEvent.click(screen.getByRole('button', { name: 'go' }));

describe('ActionResultDialog', () => {
  it('renders nothing until there is a result', () => {
    render(<Harness run={() => {}} />);
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('states a success in plain Spanish', () => {
    render(
      <Harness
        run={(r) =>
          r.succeed({
            title: 'Cliente registrado',
            message: 'Ferretería Don Roberto ya está en tu directorio.',
          })
        }
      />
    );
    go();
    const dialog = screen.getByRole('alertdialog');
    expect(dialog.textContent).toContain('Cliente registrado');
    expect(dialog.textContent).toContain('ya está en tu directorio');
  });

  it('states a failure and does not dress it as anything else', () => {
    render(
      <Harness
        run={(r) => r.fail(new Error('No se pudo guardar el cliente.'), { title: 'No se guardó' })}
      />
    );
    go();
    expect(screen.getByRole('alertdialog').textContent).toContain('No se pudo guardar el cliente.');
  });

  it('lists several field messages, but not a single one twice', () => {
    // With one bad field its message is already the dialog's message; repeating
    // it in a list underneath is noise on a 375px screen.
    const { unmount } = render(
      <Harness
        run={(r) =>
          r.fail(new ClientWriteError('Teléfono inválido.', { phone: 'Teléfono inválido.' }), {
            title: 'No se guardó',
          })
        }
      />
    );
    go();
    expect(screen.getByRole('alertdialog').textContent?.match(/Teléfono inválido/g)).toHaveLength(1);
    unmount();

    render(
      <Harness
        run={(r) =>
          r.fail(
            new ClientWriteError('Revisa 2 campos.', {
              phone: 'Teléfono inválido.',
              credit_limit: 'Límite inválido.',
            }),
            { title: 'No se guardó' }
          )
        }
      />
    );
    go();
    const text = screen.getByRole('alertdialog').textContent;
    expect(text).toContain('Teléfono inválido.');
    expect(text).toContain('Límite inválido.');
  });

  it('falls back to a message rather than showing an empty dialog', () => {
    render(<Harness run={(r) => r.fail(null, { title: 'No se guardó' })} />);
    go();
    expect(screen.getByRole('alertdialog').textContent).toMatch(/No se pudo completar la acción/);
  });

  it('offers an optional next step and dismisses after it runs', () => {
    const onClick = vi.fn();
    render(
      <Harness
        run={(r) =>
          r.succeed({ title: 'Listo', message: 'Guardado.', action: { label: 'Ver cliente', onClick } })
        }
      />
    );
    go();
    fireEvent.click(screen.getByRole('button', { name: 'Ver cliente' }));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it.each([
    ['the dismiss button', () => fireEvent.click(screen.getByRole('button', { name: 'Entendido' }))],
    ['Escape', () => fireEvent.keyDown(document, { key: 'Escape' })],
    ['the backdrop', () => fireEvent.click(screen.getByTestId('result-backdrop'))],
  ])('is dismissable by %s', async (_label, dismiss) => {
    const view = render(<Harness run={(r) => r.succeed({ title: 'Listo', message: 'Guardado.' })} />);
    go();
    expect(screen.getByRole('alertdialog')).toBeTruthy();

    dismiss();
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    view.unmount();
  });

  it('does not dismiss when the dialog body itself is clicked', () => {
    // The backdrop handler is on an ancestor; without stopPropagation, reading
    // the message would close the thing you are reading.
    render(<Harness run={(r) => r.succeed({ title: 'Listo', message: 'Guardado.' })} />);
    go();
    fireEvent.click(screen.getByText('Listo'));
    expect(screen.queryByRole('alertdialog')).toBeTruthy();
  });

  it('focuses the dismiss button so it is reachable without a mouse', async () => {
    render(<Harness run={(r) => r.succeed({ title: 'Listo', message: 'Guardado.' })} />);
    go();
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Entendido' }))
    );
  });

  it('keeps every touch target at 48px for Don Roberto', () => {
    render(<Harness run={(r) => r.succeed({ title: 'Listo', message: 'Guardado.' })} />);
    go();
    expect(screen.getByRole('button', { name: 'Entendido' }).className).toContain('min-h-[48px]');
  });
});

describe('a success dialog cannot be shown for a write the server did not confirm', () => {
  /**
   * Hard rule #1, enforced at the API's shape rather than by convention: there
   * is no way to reach `succeed` from a caught error, and `fail` is the only
   * entry point that accepts one. This reads the call sites, so a page that
   * announces a save inside a `catch` fails the build.
   */
  it('no caller calls succeed() inside a catch block', async () => {
    const { readFileSync, readdirSync } = await import('node:fs');
    const { join } = await import('node:path');

    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts')) files.push(full);
      }
    };
    walk(join(process.cwd(), 'app'));
    walk(join(process.cwd(), 'components'));

    // Adopters only — matched on the *import*, not on the identifier. Matching
    // the identifier counted this component's own definition file, so the
    // "at least one caller" check passed with zero adopters: verified by
    // renaming the hook at its only call site and watching this stay green.
    const callers = files
      .map((f) => ({ f, src: readFileSync(f, 'utf8') }))
      .filter(({ src }) => /from '@\/components\/shared\/ActionResultDialog'/.test(src))
      .filter(({ src }) => src.includes('useActionResult('));

    // Guards the guard: if nothing adopts the hook, the scan proves nothing.
    expect(callers.length, 'no page adopts useActionResult — this scan checks nothing')
      .toBeGreaterThanOrEqual(1);

    for (const { f, src } of callers) {
      // Everything from each `catch (` to the end of its block, roughly — enough
      // to catch an announcement of success on the failure path.
      for (const match of src.matchAll(/catch\s*\([^)]*\)\s*\{([\s\S]*?)\n {4}\}/g)) {
        expect(
          match[1],
          `${f} calls succeed() on a failure path — that is a fabricated success (hard rule #1)`
        ).not.toMatch(/\.succeed\(/);
      }
    }
  });
});
