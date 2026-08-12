'use client';

import React, { useState } from 'react';
import { Landmark, Plus, Star, Pencil, Archive, AlertCircle, CheckCircle2 } from 'lucide-react';
import { formatClabe } from '@/lib/clabe';
import { selectableAccounts, type BankAccount } from '@/lib/bankAccounts';
import { useBankAccounts } from '@/lib/hooks/useBankAccounts';
import { BankAccountForm } from '@/components/settings/BankAccountForm';
import { ActionResultDialog, useActionResult } from '@/components/shared/ActionResultDialog';

/**
 * The organization's settlement accounts (#164).
 *
 * Replaces the single-account form: a business can keep several CLABEs — a
 * second bank for when one delays transfers, a separate account for a branch —
 * and name the one a given quote's client pays into.
 *
 * Reads and writes go straight to `/api/organization/bank-accounts` through
 * `useBankAccounts`, never through `useOrganizationSettings`: that hook mirrors
 * into localStorage, and where a tenant's customers send money is not something
 * a browser store may be authoritative for.
 */

interface BankAccountsCardProps {
  /**
   * Writes are owner-only — every route here gates on `billing_management`, so
   * a manager's save returns 403 "Solo el dueño de la cuenta puede…". Members
   * see the accounts; they are not offered actions they cannot complete (the
   * CLAUDE.md corollary that decided #64's design). Required rather than
   * defaulted, so a future render site cannot acquire the destructive actions
   * by omission.
   */
  canEdit: boolean;
}

type Editing = { mode: 'none' } | { mode: 'add' } | { mode: 'edit'; account: BankAccount };

/**
 * Names the archive's blast radius (#196): how many live quotes settle at this
 * account and whose they are. Unknown (the exposure read failed, or a response
 * that does not carry it) falls back to the generic wording — never to an
 * invented "ninguna" (#96).
 */
function archiveExposureCopy(account: BankAccount): string {
  const exposure = account.live_quotes;
  if (exposure === undefined || exposure === null) {
    return 'Las cotizaciones que ya enviaste con esta cuenta dejarán de aceptar pagos y tus clientes verán un aviso para contactarte.';
  }
  if (exposure.count === 0) {
    return 'Ninguna cotización activa cobra en esta cuenta.';
  }
  const shown = exposure.client_names.slice(0, 3);
  const extra = exposure.client_names.length - shown.length;
  const names =
    shown.length === 0
      ? ''
      : ` — clientes: ${shown.join(', ')}${extra > 0 ? ` y ${extra} más` : ''}`;
  const lead =
    exposure.count === 1
      ? '1 cotización activa cobra en esta cuenta'
      : `${exposure.count} cotizaciones activas cobran en esta cuenta`;
  return `${lead}${names}. Dejarán de aceptar pagos y tus clientes verán un aviso para contactarte.`;
}

export const BankAccountsCard: React.FC<BankAccountsCardProps> = ({ canEdit }) => {
  const { accounts, loading, error, role, createAccount, updateAccount, makeDefault, archiveAccount } =
    useBankAccounts();

  /**
   * Whether to offer the actions — a tri-state, not the `canEdit` boolean.
   *
   * `canEdit` is the page's answer, derived from `role === 'owner'` on a
   * *separate* read of `/api/organization`. That read failing produces `false`,
   * which is indistinguishable from "you are a member" — so an owner whose
   * request dropped was told *"Solo el dueño de la cuenta puede…"* about their
   * own business, on the card that decides where their money lands. The #64
   * tri-state rule, inverted.
   *
   * This card fetched a `role` of its own alongside the accounts, so it can
   * tell the two apart: either source saying "owner" is enough, and when
   * neither knows, the actions stay hidden but the card says so honestly
   * instead of asserting a role. The routes gate on `billing_management`
   * regardless, so being permissive here could not let a member write.
   */
  const mayEdit = canEdit || role === 'owner';
  const roleUnknown = !mayEdit && role === null;

  const [editing, setEditing] = useState<Editing>({ mode: 'none' });
  const [confirmingArchive, setConfirmingArchive] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const result = useActionResult();

  /** Live accounts, default first — archived rows stay out of the list. */
  const live = accounts ? selectableAccounts(accounts) : null;

  const runRowAction = async (id: string, action: () => Promise<unknown>, success: { title: string; message: string }) => {
    if (!mayEdit) return;
    setBusyId(id);
    setRowError(null);
    try {
      await action();
      setConfirmingArchive(null);
      result.succeed(success);
    } catch (err) {
      // Beside the row it belongs to, not in a banner at the top of a list the
      // tenant has scrolled past (#146).
      setRowError({ id, message: (err as Error)?.message || 'No se pudo completar la acción' });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="rounded-3xl border border-slate-800 bg-slate-900/90 p-6 text-white shadow-xl sm:p-8">
      <div className="flex items-center gap-3 border-b border-slate-800 pb-5">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-emerald-500/30 bg-emerald-950/80 text-emerald-400 shadow-md">
          <Landmark className="h-5 w-5" />
        </div>
        <div>
          <h3 className="text-xl font-extrabold tracking-tight text-white">
            Cuentas para Cobros SPEI
          </h3>
          <p className="text-xs text-slate-400">
            Puedes tener varias. Cada cotización cobra en la que elijas.
          </p>
        </div>
      </div>

      {loading && <p className="mt-5 text-sm font-medium text-slate-400">Cargando tus cuentas...</p>}

      {/*
        A failed read is unknown, not "no accounts". Saying "todavía no tienes
        cuentas" here would tell a tenant with two banks on file that they have
        none, and invite them to add a duplicate (#64/#96).
      */}
      {!loading && accounts === null && (
        <div className="mt-5 flex items-start gap-2 rounded-2xl border border-amber-500/30 bg-amber-950/70 p-4 text-xs font-bold text-amber-300">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
          <span>
            {error || 'No se pudieron cargar tus cuentas de cobro'}. Vuelve a cargar la página para
            verlas.
          </span>
        </div>
      )}

      {!loading && live !== null && live.length === 0 && (
        <div className="mt-5 flex items-start gap-2 rounded-2xl border border-amber-500/30 bg-amber-950/70 p-4 text-xs font-bold text-amber-300">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
          <span>
            Sin una cuenta registrada, tus enlaces de pago no muestran instrucciones y tus clientes
            no pueden pagarte por transferencia.
          </span>
        </div>
      )}

      {live !== null && live.length > 0 && (
        <ul className="mt-5 space-y-3">
          {live.map((account) => (
            <li
              key={account.id}
              className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-extrabold text-white">{account.label}</span>
                    {account.is_default && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-950/80 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-emerald-300">
                        <Star className="h-3 w-3 fill-emerald-400 text-emerald-400" />
                        Principal
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs font-bold text-slate-400">{account.bank_name}</p>
                  <p className="mt-0.5 font-mono text-xs text-slate-300">
                    {formatClabe(account.clabe)}
                  </p>
                  {account.account_holder && (
                    <p className="mt-0.5 truncate text-xs text-slate-400">{account.account_holder}</p>
                  )}
                </div>
              </div>

              {account.is_default && (
                <p className="mt-2 text-xs text-slate-400">
                  Las cotizaciones nuevas cobran aquí, salvo que elijas otra al crearlas.
                </p>
              )}

              {rowError?.id === account.id && (
                <div
                  role="alert"
                  className="mt-3 flex items-start gap-2 rounded-2xl border border-rose-500/40 bg-rose-950/80 p-3 text-xs font-bold text-rose-200"
                >
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
                  <span>{rowError.message}</span>
                </div>
              )}

              {mayEdit && confirmingArchive === account.id && (
                <div className="mt-3 rounded-2xl border border-rose-500/30 bg-rose-950/40 p-4">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
                    <p className="text-xs font-bold text-rose-200">
                      {archiveExposureCopy(account)} Las cuentas no se borran: queda guardada como
                      archivada.
                    </p>
                  </div>
                  <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                    <button
                      type="button"
                      onClick={() =>
                        runRowAction(account.id, () => archiveAccount(account.id), {
                          title: 'Cuenta archivada',
                          message: `«${account.label}» ya no recibe cobros nuevos.`,
                        })
                      }
                      disabled={busyId === account.id}
                      className="flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-2xl bg-rose-500 px-6 py-3.5 text-sm font-bold text-slate-950 shadow-md transition-all hover:bg-rose-400 active:scale-95 disabled:opacity-50"
                    >
                      <Archive className="h-4 w-4" />
                      <span>{busyId === account.id ? 'Archivando...' : 'Sí, archivar'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmingArchive(null)}
                      disabled={busyId === account.id}
                      className="flex min-h-[48px] flex-1 items-center justify-center rounded-2xl border border-slate-700 bg-slate-950/60 px-6 py-3.5 text-sm font-bold text-slate-300 transition-all hover:text-white active:scale-95 disabled:opacity-50"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}

              {mayEdit && confirmingArchive !== account.id && editing.mode === 'none' && (
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  {!account.is_default && (
                    <button
                      type="button"
                      onClick={() =>
                        runRowAction(account.id, () => makeDefault(account.id), {
                          title: 'Cuenta principal actualizada',
                          message: `Las cotizaciones nuevas cobrarán en «${account.label}».`,
                        })
                      }
                      disabled={busyId === account.id}
                      className="flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-2xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-xs font-bold text-slate-300 transition-all hover:border-emerald-500/40 hover:text-emerald-300 active:scale-95 disabled:opacity-50"
                    >
                      <Star className="h-4 w-4" />
                      <span>Hacer principal</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setEditing({ mode: 'edit', account })}
                    disabled={busyId === account.id}
                    className="flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-2xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-xs font-bold text-slate-300 transition-all hover:text-white active:scale-95 disabled:opacity-50"
                  >
                    <Pencil className="h-4 w-4" />
                    <span>Editar</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setRowError(null);
                      setConfirmingArchive(account.id);
                    }}
                    disabled={busyId === account.id}
                    className="flex min-h-[48px] flex-1 items-center justify-center gap-2 rounded-2xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-xs font-bold text-slate-300 transition-all hover:border-rose-500/40 hover:text-rose-300 active:scale-95 disabled:opacity-50"
                  >
                    <Archive className="h-4 w-4" />
                    <span>Archivar</span>
                  </button>
                </div>
              )}

              {mayEdit && editing.mode === 'edit' && editing.account.id === account.id && (
                <div className="mt-4 border-t border-slate-800 pt-4">
                  {/* Editing the CLABE rewrites the payment instructions of
                      quotes already in clients' hands (#197): the edit is
                      allowed — the realistic case is a typo fix — but never
                      silent. Only renders when live quotes are known to
                      exist. */}
                  {(account.live_quotes?.count ?? 0) > 0 && (
                    <div className="mb-4 flex items-start gap-2 rounded-2xl border border-amber-500/30 bg-amber-950/40 p-3 text-xs font-bold text-amber-200">
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                      <span>
                        {account.live_quotes!.count === 1
                          ? '1 cotización ya enviada cobra en esta cuenta y mostrará la CLABE nueva si la cambias.'
                          : `${account.live_quotes!.count} cotizaciones ya enviadas cobran en esta cuenta y mostrarán la CLABE nueva si la cambias.`}
                      </span>
                    </div>
                  )}
                  <BankAccountForm
                    account={editing.account}
                    submitLabel="Guardar cambios"
                    onCancel={() => setEditing({ mode: 'none' })}
                    onSubmit={async (values) => {
                      const saved = await updateAccount(account.id, values);
                      setEditing({ mode: 'none' });
                      result.succeed({
                        title: 'Cuenta actualizada',
                        message: `«${saved.label}» quedó guardada.`,
                      });
                    }}
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {mayEdit && editing.mode === 'add' && (
        <div className="mt-5 rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
          <h4 className="mb-4 text-sm font-extrabold text-white">Agregar una cuenta</h4>
          <BankAccountForm
            account={null}
            submitLabel="Agregar cuenta"
            onCancel={() => setEditing({ mode: 'none' })}
            onSubmit={async (values) => {
              const saved = await createAccount(values);
              setEditing({ mode: 'none' });
              result.succeed({
                title: 'Cuenta agregada',
                message: saved.is_default
                  ? `«${saved.label}» es tu cuenta principal. Tus cobros SPEI se depositarán ahí.`
                  : `«${saved.label}» quedó guardada. Puedes elegirla al crear una cotización.`,
              });
            }}
          />
        </div>
      )}

      {/*
        Adding stays offered when the read failed, because the tenant may
        genuinely have no account and this is the only way to fix that. It is
        not free of risk: there is no unique index on (organization_id, clabe),
        so a tenant who cannot see their list could add a duplicate. That is
        recoverable — archive it — whereas being unable to register an account
        at all is not, so the trade goes this way deliberately. What is never
        offered is a per-row action against a list we could not read.
      */}
      {mayEdit && editing.mode === 'none' && !confirmingArchive && (
        <button
          type="button"
          onClick={() => {
            setRowError(null);
            setEditing({ mode: 'add' });
          }}
          className="mt-5 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-6 py-3.5 text-sm font-bold text-slate-950 shadow-md transition-all hover:bg-emerald-400 active:scale-95"
        >
          <Plus className="h-4 w-4" />
          <span>Agregar cuenta</span>
        </button>
      )}

      {!mayEdit && !roleUnknown && (
        <p className="mt-5 rounded-2xl border border-slate-800 bg-slate-950/60 p-4 text-xs font-bold text-slate-400">
          Solo el dueño de la cuenta puede agregar o cambiar estas cuentas. Pídele que lo haga.
        </p>
      )}

      {/* Neither read knew the role. Say that, rather than telling an owner
          they are not the owner. */}
      {roleUnknown && (
        <p className="mt-5 rounded-2xl border border-slate-800 bg-slate-950/60 p-4 text-xs font-bold text-slate-400">
          No pudimos confirmar tu rol en el negocio. Vuelve a cargar la página para administrar tus
          cuentas de cobro.
        </p>
      )}

      {live !== null && live.length > 1 && (
        <p className="mt-4 flex items-start gap-2 text-xs text-slate-400">
          <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
          <span>
            Al crear una cotización puedes elegir en cuál de tus cuentas quieres que te paguen.
          </span>
        </p>
      )}

      <ActionResultDialog result={result.value} onClose={result.dismiss} />
    </div>
  );
};
