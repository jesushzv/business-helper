'use client';

import { useCallback, useEffect, useState } from 'react';
import { isClientDemoMode } from '@/lib/clientDemoMode';
import { notifySettlementAccountChanged } from '@/lib/hooks/useSettlementAccount';
import type { BankAccount, BankAccountFieldErrors } from '@/lib/bankAccounts';
import type { UserRole } from '@/lib/teamRBAC';

/**
 * The organization's settlement accounts, for the settings card and the quote
 * wizard (#164).
 *
 * Three rules this hook exists to keep, all of them defect classes this repo
 * has shipped before:
 *
 * 1. **A failed read is unknown, not "no accounts."** `accounts` is `null`
 *    until a read succeeds. A card that renders "todavía no tienes cuentas"
 *    from a dropped request tells a tenant with two banks on file that they
 *    have none, and — worse — invites them to add a duplicate (#64/#96).
 * 2. **Every mutation applies the row the server returned**, or throws. No
 *    optimistic insert, no local edit, no `catch` that leaves the UI claiming a
 *    write that did not land (hard rule #1, #33/#50/#59).
 * 3. **Every confirmed write announces itself.** The #64 banner and the
 *    Cobranza/Facturación share buttons read `useSettlementAccount`, which
 *    fetches on mount and never remounts on a client-side navigation. Without
 *    the announcement an owner archives their last account, walks to Cobranza,
 *    and still hands a client a `/pay/` link that answers 409 — the exact bug
 *    #163 found and fixed on the single-account card.
 */

/** Demo fixtures. Behind `isClientDemoMode()` and nowhere else (#93). */
const DEMO_ACCOUNTS: BankAccount[] = [
  {
    id: 'bank-demo-1',
    label: 'BBVA principal',
    bank_name: 'BBVA México',
    clabe: '012180001234567895',
    account_holder: 'Mi Negocio S.A. de C.V.',
    is_default: true,
    archived_at: null,
  },
];

export interface BankAccountInputValues {
  label: string;
  bankName: string;
  clabe: string;
  accountHolder: string;
}

/**
 * A write that the server refused.
 *
 * `fields` is what the form pins under its inputs; `message` is what it shows
 * when the refusal is not about a field (a 403, a 409, an outage). Thrown
 * rather than returned so a caller cannot forget to check it and report a
 * success (#95's 405-swallowed-by-`.catch(() => {})`).
 */
export class BankAccountWriteError extends Error {
  fields: BankAccountFieldErrors;
  code: string | null;

  constructor(message: string, fields: BankAccountFieldErrors = {}, code: string | null = null) {
    super(message);
    this.name = 'BankAccountWriteError';
    this.fields = fields;
    this.code = code;
  }
}

export interface BankAccountsState {
  /** `null` = unknown (still loading, or the read failed). Never "none". */
  accounts: BankAccount[] | null;
  loading: boolean;
  /** Set only when a read actually failed, so the card can say so. */
  error: string | null;
  role: UserRole | null;
  refresh: () => void;
  createAccount: (values: BankAccountInputValues) => Promise<BankAccount>;
  updateAccount: (id: string, values: BankAccountInputValues) => Promise<BankAccount>;
  makeDefault: (id: string) => Promise<BankAccount>;
  archiveAccount: (id: string) => Promise<BankAccount>;
}

/** Reads `{ error: { message, fields, code } }` without trusting its shape. */
async function refuse(res: Response, fallback: string): Promise<never> {
  const data = await res.json().catch(() => null);
  const error = data?.error;
  // `data?.error || fallback` renders [object Object] against this envelope
  // (#65): the message is a property of the error, not the error itself.
  const message = typeof error?.message === 'string' ? error.message : fallback;
  const fields =
    error?.fields && typeof error.fields === 'object' ? (error.fields as BankAccountFieldErrors) : {};
  throw new BankAccountWriteError(message, fields, typeof error?.code === 'string' ? error.code : null);
}

/** The account a write returned, or a refusal. A 200 alone is not a write. */
async function readAccount(res: Response, fallback: string): Promise<BankAccount> {
  if (!res.ok) return refuse(res, fallback);

  const data = await res.json().catch(() => null);
  const account = data?.account;
  // A 200 with an unexpected body — an intermediary's success page, a shape
  // change — must not be applied as a saved account.
  if (!account || typeof account.id !== 'string') {
    throw new BankAccountWriteError(
      'No se pudo confirmar el cambio. Vuelve a cargar la página para ver cómo quedó.'
    );
  }
  return account as BankAccount;
}

export function useBankAccounts(): BankAccountsState {
  const [accounts, setAccounts] = useState<BankAccount[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const refresh = useCallback(() => setReloadToken((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;

    // The demo deployment has no tenant. Gated on the build-time signal, never
    // on a 503: collection GETs answer the demo deployment with 200 and an
    // empty list, so a status code cannot tell the two apart (#93).
    if (isClientDemoMode()) {
      setAccounts(DEMO_ACCOUNTS);
      setRole('owner');
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);

    fetch('/api/organization/bank-accounts')
      .then(async (res) => {
        const data = await res.json().catch(() => null);
        if (cancelled) return;

        if (!res.ok || !Array.isArray(data?.accounts)) {
          // Unknown. Leaving `accounts` null is the whole point: an empty array
          // here would render as "you have no accounts" at a tenant who has two.
          setAccounts(null);
          setRole(null);
          setError(
            typeof data?.error?.message === 'string'
              ? data.error.message
              : 'No se pudieron cargar tus cuentas de cobro'
          );
          return;
        }

        setAccounts(data.accounts as BankAccount[]);
        setRole((data.role as UserRole) || null);
        setError(null);
      })
      .catch(() => {
        if (cancelled) return;
        setAccounts(null);
        setRole(null);
        setError('No se pudieron cargar tus cuentas de cobro');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [reloadToken]);

  /**
   * Applies a confirmed write.
   *
   * Refetches rather than patching the list in place: `makeDefault` clears the
   * previous default in the same statement, and archiving can change which
   * account other rows resolve to, so the server's list is the only thing that
   * knows the whole shape afterwards. Announcing before the refetch is fine —
   * the row is already written; the listeners refetch on their own.
   */
  const applyWrite = useCallback(
    (account: BankAccount): BankAccount => {
      notifySettlementAccountChanged();
      refresh();
      return account;
    },
    [refresh]
  );

  /**
   * Demo-mode writes, simulated in local state.
   *
   * Short-circuited **before** the fetch, never as a `catch` fallback: a
   * fallback turns a real tenant's network failure into a fabricated
   * confirmation, which is how `/pay/[token]` once told a payer their receipt
   * was sent for a declaration the API had rejected (#58/#86). Reached only
   * when `isClientDemoMode()` is true, where there is no tenant and no row to
   * misreport.
   *
   * Does not call `refresh()`: the read effect re-seeds `DEMO_ACCOUNTS`, which
   * would silently undo the change the visitor just made.
   */
  const simulate = useCallback(
    (mutate: (current: BankAccount[]) => BankAccount[], resultId: string): BankAccount => {
      const next = mutate(accounts ?? DEMO_ACCOUNTS);
      const saved = next.find((a) => a.id === resultId);
      if (!saved) {
        // Cannot happen with the mutators below, and is a programmer error
        // rather than a tenant-facing state — but returning a fabricated
        // account would be the very thing this hook exists to prevent.
        throw new BankAccountWriteError('No se pudo aplicar el cambio en la demostración');
      }
      setAccounts(next);
      // Resolved from the simulated list for the same reason a real write is
      // resolved from the server's row: report what exists, not what was asked.
      return saved;
    },
    [accounts]
  );

  const createAccount = useCallback(
    async (values: BankAccountInputValues): Promise<BankAccount> => {
      if (isClientDemoMode()) {
        const id = `bank-demo-${Date.now()}`;
        return simulate(
          (current) => [
            ...current,
            {
              id,
              label: values.label,
              bank_name: values.bankName,
              clabe: values.clabe.replace(/\D/g, ''),
              account_holder: values.accountHolder || null,
              // First account is the default, matching the route's rule.
              is_default: current.filter((a) => !a.archived_at).length === 0,
              archived_at: null,
            },
          ],
          id
        );
      }

      const res = await fetch('/api/organization/bank-accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      return applyWrite(await readAccount(res, 'No se pudo agregar la cuenta de cobro'));
    },
    [applyWrite, simulate]
  );

  const updateAccount = useCallback(
    async (id: string, values: BankAccountInputValues): Promise<BankAccount> => {
      if (isClientDemoMode()) {
        return simulate(
          (current) =>
            current.map((a) =>
              a.id === id
                ? {
                    ...a,
                    label: values.label,
                    bank_name: values.bankName,
                    clabe: values.clabe.replace(/\D/g, ''),
                    account_holder: values.accountHolder || null,
                  }
                : a
            ),
          id
        );
      }

      const res = await fetch(`/api/organization/bank-accounts/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      return applyWrite(await readAccount(res, 'No se pudo guardar la cuenta de cobro'));
    },
    [applyWrite, simulate]
  );

  const makeDefault = useCallback(
    async (id: string): Promise<BankAccount> => {
      if (isClientDemoMode()) {
        return simulate(
          (current) => current.map((a) => ({ ...a, is_default: a.id === id })),
          id
        );
      }

      const res = await fetch(`/api/organization/bank-accounts/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ makeDefault: true }),
      });
      const account = await readAccount(res, 'No se pudo cambiar tu cuenta principal');
      // The server is the authority on which row holds the flag. If it came
      // back without it, something else won the race and saying "listo" would
      // report a change that did not happen.
      if (!account.is_default) {
        throw new BankAccountWriteError(
          'No se pudo confirmar tu cuenta principal. Vuelve a cargar la página.'
        );
      }
      return applyWrite(account);
    },
    [applyWrite, simulate]
  );

  const archiveAccount = useCallback(
    async (id: string): Promise<BankAccount> => {
      if (isClientDemoMode()) {
        return simulate(
          (current) =>
            current.map((a) =>
              a.id === id ? { ...a, archived_at: new Date().toISOString(), is_default: false } : a
            ),
          id
        );
      }

      const res = await fetch(`/api/organization/bank-accounts/${id}`, { method: 'DELETE' });
      const account = await readAccount(res, 'No se pudo archivar la cuenta de cobro');
      if (!account.archived_at) {
        throw new BankAccountWriteError(
          'No se pudo confirmar que la cuenta quedara archivada. Vuelve a cargar la página.'
        );
      }
      return applyWrite(account);
    },
    [applyWrite, simulate]
  );

  return {
    accounts,
    loading,
    error,
    role,
    refresh,
    createAccount,
    updateAccount,
    makeDefault,
    archiveAccount,
  };
}
