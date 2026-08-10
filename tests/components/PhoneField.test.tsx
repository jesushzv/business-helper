import React, { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PhoneField } from '@/components/shared/PhoneField';

/**
 * #94 — the country a client's number belongs to is asked, not inferred from
 * digit count. The inference misrouted foreign numbers: `2125551234` is ten
 * digits, so it read as Mexican and was dialed as `+522125551234`, reaching a
 * stranger while the client waited for a code that never arrived.
 */

/** Mirrors how the real forms hold the value: parent owns the E.164 string. */
const Harness: React.FC<{ initial?: string; onValue?: (v: string) => void }> = ({
  initial = '',
  onValue,
}) => {
  const [value, setValue] = useState(initial);
  return (
    <>
      <PhoneField
        inputId="t-phone"
        value={value}
        onChange={(v) => {
          setValue(v);
          onValue?.(v);
        }}
      />
      <output data-testid="stored">{value}</output>
    </>
  );
};

const input = () => document.getElementById('t-phone') as HTMLInputElement;
const select = () => screen.getByLabelText('País del teléfono') as HTMLSelectElement;
const stored = () => screen.getByTestId('stored').textContent;

describe('PhoneField emits E.164', () => {
  it('defaults to Mexico so the common case costs no extra tap', () => {
    render(<Harness />);
    expect(select().value).toBe('MX');
  });

  it('stores the Mexican country code for bare national digits', async () => {
    render(<Harness />);
    fireEvent.change(input(), { target: { value: '8112345678' } });
    await waitFor(() => expect(stored()).toBe('+528112345678'));
  });

  it('stores the picked country, not Mexico, for a foreign number', async () => {
    render(<Harness />);
    fireEvent.change(select(), { target: { value: 'US' } });
    fireEvent.change(input(), { target: { value: '2125551234' } });
    // The whole point of #94: this must not become +522125551234.
    await waitFor(() => expect(stored()).toBe('+12125551234'));
  });

  it('re-codes an already-typed number when the country changes', async () => {
    render(<Harness />);
    fireEvent.change(input(), { target: { value: '2125551234' } });
    await waitFor(() => expect(stored()).toBe('+522125551234'));
    fireEvent.change(select(), { target: { value: 'US' } });
    await waitFor(() => expect(stored()).toBe('+12125551234'));
  });

  it('clears to empty rather than to a bare country code', async () => {
    render(<Harness initial="+528112345678" />);
    fireEvent.change(input(), { target: { value: '' } });
    // '+52' would read as a phone number downstream; '' reads as "no phone".
    await waitFor(() => expect(stored()).toBe(''));
  });

  it('normalizes punctuation as typed, so display matches what is stored', async () => {
    render(<Harness />);
    fireEvent.change(input(), { target: { value: '(81) 1234-5678' } });
    await waitFor(() => expect(input().value).toBe('8112345678'));
    expect(stored()).toBe('+528112345678');
  });
});

describe('PhoneField renders an existing value', () => {
  it('splits a stored Mexican E.164 into country and national parts', () => {
    render(<Harness initial="+528112345678" />);
    expect(select().value).toBe('MX');
    expect(input().value).toBe('8112345678');
  });

  it('splits a stored foreign E.164 into its own country', () => {
    render(<Harness initial="+442079460958" />);
    expect(select().value).toBe('GB');
    expect(input().value).toBe('2079460958');
  });

  it('reads a pre-backfill bare national number as Mexican', () => {
    // A row the migration has not reached; the deploy can land first.
    render(<Harness initial="8112345678" />);
    expect(select().value).toBe('MX');
    expect(input().value).toBe('8112345678');
  });

  it('re-syncs when the server row replaces the typed text (#95)', async () => {
    const { rerender } = render(<PhoneField inputId="t-phone" value="" onChange={vi.fn()} />);
    fireEvent.change(input(), { target: { value: '8112345678' } });
    expect(input().value).toBe('8112345678');

    // The hook applies the row the server returned — a different number here,
    // so the field must follow it rather than keep showing the typed one.
    rerender(<PhoneField inputId="t-phone" value="+12125551234" onChange={vi.fn()} />);
    await waitFor(() => expect(input().value).toBe('2125551234'));
    expect(select().value).toBe('US');
  });
});

describe('PhoneField respects the disabled state', () => {
  it('disables both controls, not just the text input', () => {
    // A selector left live beside a disabled input invites a change that
    // cannot be saved — the #64 class of dead-end affordance.
    render(<PhoneField inputId="t-phone" value="+528112345678" onChange={vi.fn()} disabled />);
    expect(input().disabled).toBe(true);
    expect(select().disabled).toBe(true);
  });
});
