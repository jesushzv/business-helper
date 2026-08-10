'use client';

import React, { useEffect, useState } from 'react';
import { Phone } from 'lucide-react';
import {
  PHONE_COUNTRIES,
  DEFAULT_PHONE_COUNTRY,
  splitPhone,
  joinPhone,
} from '@/lib/phoneCountries';

interface PhoneFieldProps {
  /** Stored value, E.164 since #94; a bare national number pre-backfill. */
  value: string | null | undefined;
  /** Receives the E.164 value to store, or '' when the field is cleared. */
  onChange: (e164: string) => void;
  label?: string;
  /** Rendered under the field. Keep it about *this* number's purpose. */
  hint?: string;
  disabled?: boolean;
  inputId?: string;
}

/**
 * Country selector + national number, emitting E.164.
 *
 * This is what closes #94's decision at the UI: the country a client's number
 * belongs to is now *asked*, not inferred from digit count. The inference is
 * what misrouted foreign numbers — `2125551234` is ten digits, so it read as
 * Mexican and was dialed as `+522125551234`, reaching a stranger while the
 * client waited for a signature code that never came.
 *
 * The field does **not** validate. Validation lives on the server, in
 * `normalizeClientPhone`, against the full numbering-plan metadata; duplicating
 * a weaker copy here is how a client and a server come to disagree about the
 * same client (#95's class). What the field guarantees is only that whatever
 * the tenant types is submitted with an explicit country code attached.
 */
export const PhoneField: React.FC<PhoneFieldProps> = ({
  value,
  onChange,
  label = 'Teléfono WhatsApp',
  hint,
  disabled = false,
  inputId = 'phone',
}) => {
  const initial = splitPhone(value);
  const [country, setCountry] = useState(initial.country);
  const [national, setNational] = useState(initial.national);

  // Re-sync when the prop changes — the server normalizes what it stores
  // ('81 1234 5678' comes back as '+528112345678'), and a field that keeps its
  // typed text after the server row lands is showing a value the database does
  // not hold (#95).
  useEffect(() => {
    const next = splitPhone(value);
    setCountry(next.country);
    setNational(next.national);
  }, [value]);

  // Digits only, applied as the tenant types. This is not cosmetic: the parent
  // holds the E.164 value, so every keystroke round-trips through `value` and
  // back into the effect above. Keeping the raw text here would mean the
  // re-sync overwrote it mid-word; keeping it *and* suppressing the re-sync
  // would put punctuation on screen next to a differently-shaped stored value,
  // which is the #95 defect in miniature. Normalizing on input makes what is
  // displayed and what is stored the same number, always.
  const emit = (nextCountry: string, nextNational: string) => {
    const digits = nextNational.replace(/\D/g, '');
    setCountry(nextCountry);
    setNational(digits);
    onChange(joinPhone(nextCountry, digits));
  };

  const selected = PHONE_COUNTRIES.find((c) => c.code === country);

  return (
    <div>
      <label htmlFor={inputId} className="block text-xs font-bold text-slate-300">
        {label}
      </label>
      <div className="mt-1.5 flex gap-2">
        <select
          aria-label="País del teléfono"
          value={country}
          disabled={disabled}
          onChange={(e) => emit(e.target.value, national)}
          className="min-h-[48px] w-[7.5rem] shrink-0 rounded-xl border border-slate-800 bg-slate-950/80 px-2 text-xs font-medium text-white focus:border-emerald-500 focus:outline-none disabled:opacity-50"
        >
          {PHONE_COUNTRIES.map((c) => (
            <option key={c.code} value={c.code} className="bg-slate-900 text-white">
              {c.flag} +{c.callingCode}
            </option>
          ))}
        </select>
        <div className="relative flex-1">
          <Phone className="absolute left-3.5 top-3.5 h-5 w-5 text-slate-500" />
          <input
            id={inputId}
            type="tel"
            inputMode="tel"
            autoComplete="tel-national"
            value={national}
            disabled={disabled}
            onChange={(e) => emit(country, e.target.value)}
            placeholder={country === 'MX' ? 'Ej. 8115551234' : 'Número sin clave de país'}
            className="w-full min-h-[48px] rounded-xl border border-slate-800 bg-slate-950/80 pl-11 pr-4 text-sm font-medium text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-none disabled:opacity-50"
          />
        </div>
      </div>
      <p className="mt-1.5 text-[11px] text-slate-500">
        {hint ||
          (selected && selected.code !== DEFAULT_PHONE_COUNTRY
            ? `Se guardará como +${selected.callingCode}… Escribe el número sin la clave del país.`
            : 'Escribe los 10 dígitos. Si tu cliente está en otro país, elige su bandera.')}
      </p>
    </div>
  );
};
