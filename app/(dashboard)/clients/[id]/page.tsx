'use client';

import React, { useState, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Header } from '@/components/layout/Header';
import { HealthScoreMeter } from '@/components/clients/HealthScoreMeter';
import { ActivityTimeline } from '@/components/clients/ActivityTimeline';
import { ClientFormModal } from '@/components/clients/ClientFormModal';
import { useClients } from '@/lib/hooks/useClients';
import { useQuotes } from '@/lib/hooks/useQuotes';
import { useReceivables } from '@/lib/hooks/useReceivables';
import { useCurrentOrg } from '@/lib/hooks/useCurrentOrg';
import { generateWhatsAppLink, buildClientGreeting } from '@/lib/whatsappLink';
import { formatClientActivity } from '@/lib/clientActivity';
import { calculateClientCreditSummary } from '@/lib/clientCredit';
import {
  ArrowLeft,
  Building2,
  User,
  Phone,
  Mail,
  FileText,
  MapPin,
  MessageSquare,
  Edit,
  Trash2,
  Clock,
  Archive,
} from 'lucide-react';
import { Client } from '@/types';
import { findRegimen } from '@/lib/satRegimenes';
import { ConfirmDialog, useConfirm } from '@/components/shared/ConfirmDialog';
import { ActionResultDialog, useActionResult } from '@/components/shared/ActionResultDialog';
import { hasCapability } from '@/lib/teamRBAC';

export default function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { getClientById, updateClient, deleteClient, archiveClient, loading, error } = useClients();
  // The activity timeline is only as trustworthy as this read too (#260): a
  // failed quotes fetch yields `[]`, which rendered "Sin historial de
  // actividad / 0 Eventos" as fact — on the same screen whose credit figures
  // are carefully gated on `balanceKnown` below.
  const { quotes, loading: quotesLoading, error: quotesError } = useQuotes();
  // The financial modules below are only as trustworthy as this read. A failed
  // or in-flight receivables fetch yields `[]`, which would render as
  // "Crédito Utilizado $0 / Disponible $50,000" — a confident zero on the
  // screen where the owner decides whether to extend more credit (#96).
  const {
    receivables,
    loading: receivablesLoading,
    error: receivablesError,
  } = useReceivables();
  const { org, role } = useCurrentOrg();
  const [isEditOpen, setIsEditOpen] = useState(false);
  const confirmAction = useConfirm();
  const result = useActionResult();

  // Three states (#64): a known role without delete_records hides the button —
  // never send someone into a write they lack (#64 corollary) — while an
  // unknown role (still loading, or the read failed) keeps it visible, because
  // the route enforces the capability either way and hiding on a network blip
  // would tell an owner they cannot delete.
  const canDelete = role === null || hasCapability(role, 'delete_records');

  const client = getClientById(id);

  // Three states, not two: until the directory has loaded, an unmatched id
  // means "still loading", not "deleted". The old page rendered "Cliente no
  // encontrado — fue eliminado" on every cold load while the fetch was in
  // flight (#96).
  if (!client && loading) {
    return (
      <div className="min-h-screen">
        <Header title="Detalle de Cliente" />
        <div className="space-y-6 px-4 py-6 md:px-8">
          <div className="h-40 w-full animate-pulse rounded-3xl border border-slate-800 bg-slate-900/60" />
          <div className="h-64 w-full animate-pulse rounded-3xl border border-slate-800 bg-slate-900/60" />
        </div>
      </div>
    );
  }

  if (!client && error) {
    return (
      <div className="min-h-screen">
        <Header title="Detalle de Cliente" />
        <div className="px-4 py-12 text-center md:px-8">
          <h3 className="text-xl font-bold text-white">No se pudo cargar el cliente</h3>
          <p className="mt-2 text-xs text-slate-400">{error}</p>
          <Link
            href="/clients"
            className="mt-6 inline-flex min-h-[48px] items-center gap-2 rounded-xl bg-indigo-600 px-6 py-2.5 text-sm font-bold text-white shadow-xs"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Volver al Directorio</span>
          </Link>
        </div>
      </div>
    );
  }

  if (!client) {
    return (
      <div className="min-h-screen">
        <Header title="Detalle de Cliente" />
        <div className="px-4 py-12 text-center md:px-8">
          <h3 className="text-xl font-bold text-white">Cliente no encontrado</h3>
          <p className="mt-2 text-xs text-slate-400">No encontramos este cliente en tu directorio.</p>
          <Link
            href="/clients"
            className="mt-6 inline-flex min-h-[48px] items-center gap-2 rounded-xl bg-indigo-600 px-6 py-2.5 text-sm font-bold text-white shadow-xs"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Volver al Directorio</span>
          </Link>
        </div>
      </div>
    );
  }

  // The modal closing was the only success signal, which on a phone is
  // indistinguishable from the tap not registering — the #146 gap the create
  // path already closed (#298). Same shape as clients/page.tsx: the success
  // text is built from the row the server returned, and the throw is re-raised
  // so ClientFormModal keeps pinning per-field messages under their inputs.
  const handleUpdate = async (data: Partial<Client>) => {
    try {
      const saved = await updateClient(id, data);
      result.succeed({
        title: 'Cambios guardados',
        message: `Los datos de ${saved.name} se actualizaron en tu directorio.`,
      });
    } catch (error) {
      result.fail(error, { title: 'No se guardaron los cambios' });
      throw error;
    }
  };

  /**
   * Archiving — where the delete refusal used to be a dead end (#337).
   *
   * #262 made "no se puede eliminar" honest; this gives the tenant somewhere
   * to go after reading it. Offered alongside deletion and, crucially, offered
   * *again* from inside the failed-deletion dialog, since that is the moment
   * the owner learns their real options.
   */
  const handleArchive = () => {
    confirmAction.ask({
      title: `Archivar a ${client.name}`,
      consequence:
        'Saldrá de tu directorio y del selector de clientes al cotizar. Sus cotizaciones, ' +
        'contratos y cobros no se tocan: sus enlaces siguen funcionando y su historial se ' +
        'conserva. Puedes restaurarlo cuando quieras desde "Ver archivados".',
      confirmLabel: 'Sí, archivar cliente',
      onConfirm: async () => {
        try {
          await archiveClient(id, true);
          router.push('/clients');
        } catch (err) {
          result.fail(err, { title: 'No se pudo archivar' });
        }
      },
    });
  };

  const handleDelete = () => {
    confirmAction.ask({
      title: `Eliminar a ${client.name}`,
      // The old wording promised the deletion would succeed and leave the
      // documents behind. The database enforces the opposite: quotes and
      // contracts reference the client with ON DELETE RESTRICT, so a client
      // with history cannot be deleted at all. Say what will actually happen.
      consequence:
        'Se eliminará de tu directorio de forma permanente. Si este cliente ya tiene ' +
        'cotizaciones o contratos registrados, no se podrá eliminar, para conservar tu historial.',
      confirmLabel: 'Sí, eliminar cliente',
      onConfirm: async () => {
        // Caught here rather than left to throw: ConfirmDialog would keep the
        // dialog open with no message anywhere, so a refused deletion (the
        // 409 for a client with history, or a 403) looked like the tap not
        // registering.
        try {
          await deleteClient(id);
          router.push('/clients');
        } catch (err) {
          // The refusal ends in an action rather than a dead end (#337). A
          // client with quotes or contracts can never be deleted — ON DELETE
          // RESTRICT — so "no se pudo" on its own leaves the owner with a
          // directory entry they cannot do anything about.
          result.fail(err, {
            title: 'No se pudo eliminar',
            action: { label: 'Archivar en su lugar', onClick: handleArchive },
          });
        }
      },
    });
  };

  const waMessage = buildClientGreeting(client.contact_name || client.name, org?.name);
  const whatsappUrl = generateWhatsAppLink(client.phone, waMessage);

  // The tenant's real rows, scoped to this client. An empty timeline and a
  // zero-utilization credit meter are honest; the fixtures that used to fill
  // them fed "Crédito Utilizado" with a $45,000 fiction on the page where the
  // owner decides whether to extend more credit (#96).
  const clientQuotes = quotes.filter((q) => q.client_id === client.id);
  const clientMilestones = receivables.filter((m) => m.client_id === client.id);

  // Three states, not two: an empty list means "this client owes nothing" only
  // once the read actually succeeded. Until then it means "we do not know yet".
  const balanceKnown = !receivablesLoading && !receivablesError;

  const activityFeed = formatClientActivity(
    clientQuotes,
    [],
    clientMilestones as unknown as Array<Record<string, unknown>>
  );

  // Same tri-state as the credit meter: an empty timeline is a fact only once
  // both of its sources answered (#260).
  const activityKnown =
    !quotesLoading && !quotesError && !receivablesLoading && !receivablesError;

  return (
    <div className="min-h-screen pb-16">
      <Header title={client.name} />

      <div className="px-4 py-6 md:px-8">
        {/* Navigation Breadcrumb */}
        <div className="mb-6 flex items-center justify-between">
          <Link
            href="/clients"
            className="flex min-h-[48px] items-center gap-2 text-xs font-bold text-indigo-600 transition-colors hover:text-indigo-800"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Volver al Directorio</span>
          </Link>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsEditOpen(true)}
              className="flex min-h-[48px] items-center gap-2 rounded-xl border border-slate-800 bg-slate-900 px-4 py-2 text-xs font-bold text-slate-300 shadow-xs hover:bg-slate-800 hover:text-white active:scale-95 cursor-pointer"
            >
              <Edit className="h-4 w-4" />
              <span>Editar</span>
            </button>
            {canDelete && (
              <>
                {/* Offered before Eliminar, because for any client with a
                    quote or a contract it is the only one of the two that can
                    actually work — ON DELETE RESTRICT refuses the other
                    (#262/#337). */}
                <button
                  onClick={handleArchive}
                  className="flex min-h-[48px] items-center gap-2 rounded-xl border border-slate-700 bg-slate-800/60 px-4 py-2 text-xs font-bold text-slate-200 hover:bg-slate-700 active:scale-95 cursor-pointer"
                >
                  <Archive className="h-4 w-4" />
                  <span className="hidden sm:inline">Archivar</span>
                </button>
                <button
                  onClick={handleDelete}
                  className="flex min-h-[48px] items-center gap-2 rounded-xl border border-rose-900/50 bg-rose-950/40 px-4 py-2 text-xs font-bold text-rose-400 hover:bg-rose-900/60 active:scale-95 cursor-pointer"
                >
                  <Trash2 className="h-4 w-4" />
                  <span className="hidden sm:inline">Eliminar</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Profile Card Header */}
        <div className="rounded-3xl border border-slate-800 bg-slate-900/90 p-6 shadow-xl sm:p-8 backdrop-blur-xl text-white">
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-4">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-indigo-600 font-black text-white shadow-md text-xl">
                <Building2 className="h-8 w-8" />
              </div>
              <div>
                <h1 className="text-2xl font-black text-white">{client.name}</h1>
                {client.contact_name && (
                  <p className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-slate-300">
                    <User className="h-4 w-4 text-indigo-400" />
                    <span>Contacto: {client.contact_name}</span>
                  </p>
                )}
                {client.notes && (
                  <p className="mt-2 text-xs font-medium text-slate-400">{client.notes}</p>
                )}
              </div>
            </div>

            {/* Direct WhatsApp Action Button */}
            {client.phone && (
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex min-h-[48px] items-center justify-center gap-2 rounded-2xl bg-emerald-500 hover:bg-emerald-400 px-6 py-3 text-sm font-black text-slate-950 shadow-lg shadow-emerald-500/20 transition-all active:scale-95"
              >
                <MessageSquare className="h-5 w-5" />
                <span>Contactar por WhatsApp</span>
              </a>
            )}
          </div>

          {/* Quick Contact & Tax Pills */}
          <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-slate-800/80 pt-6">
            {client.phone && (
              <div className="flex items-center gap-2 rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-xs font-semibold text-slate-300">
                <Phone className="h-4 w-4 text-emerald-400" />
                <span>{client.phone}</span>
              </div>
            )}
            {client.email && (
              <div className="flex items-center gap-2 rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-xs font-semibold text-slate-300">
                <Mail className="h-4 w-4 text-indigo-400" />
                <span>{client.email}</span>
              </div>
            )}
            <div className="flex items-center gap-2 rounded-xl bg-indigo-500/10 border border-indigo-500/20 px-3 py-2 text-xs font-bold text-indigo-300">
              <FileText className="h-4 w-4 text-indigo-400" />
              <span>RFC: {client.rfc || 'Sin RFC registrado'}</span>
            </div>
            {client.codigo_postal && (
              <div className="flex items-center gap-2 rounded-xl bg-slate-950 border border-slate-800 px-3 py-2 text-xs font-semibold text-slate-300">
                <MapPin className="h-4 w-4 text-slate-400" />
                <span>CP: {client.codigo_postal}</span>
              </div>
            )}
          </div>
        </div>

        {/* Content Layout Grid */}
        <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-3">
          {/* Left Column: SAT Tax Profile & Confianza de Pago */}
          <div className="space-y-6">
            {/* Real payment history drives the meter; the stored column is the
                fallback, and unknown renders as unknown (#108). */}
            <HealthScoreMeter score={client.health_score ?? undefined} milestones={clientMilestones} />

            {/* B2B Credit Utilization Card */}
            {(() => {
              const creditSummary = calculateClientCreditSummary(client, clientMilestones);
              return (
                <div className="rounded-3xl border border-slate-800 bg-slate-900/90 p-6 shadow-xl text-white">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-base font-extrabold text-white">Línea de Crédito B2B</h3>
                      <p className="mt-0.5 text-xs text-slate-400">Condiciones de pago y saldo utilizado</p>
                    </div>
                    {/* Gated on the status itself, not on whether a limit
                        exists: those are independent columns, so gating on the
                        limit would render a green "Activo" for a stored NULL
                        status — the same fabrication one field over (#96). */}
                    {creditSummary.status !== null && (
                      <span className={`rounded-xl px-3 py-1 text-xs font-bold border ${
                        creditSummary.status === 'blocked'
                          ? 'bg-rose-950/80 text-rose-400 border-rose-500/30'
                          : creditSummary.status === 'suspended'
                          ? 'bg-amber-950/80 text-amber-400 border-amber-500/30'
                          : 'bg-emerald-950/80 text-emerald-400 border-emerald-500/30'
                      }`}>
                        {creditSummary.status === 'blocked' ? 'Bloqueado' : creditSummary.status === 'suspended' ? 'Suspendido' : 'Activo'}
                      </span>
                    )}
                  </div>

                  {!creditSummary.isConfigured ? (
                    <div className="mt-4 space-y-3">
                      <div className="rounded-xl border border-slate-800 bg-slate-950 p-4 text-xs">
                        <p className="font-bold text-slate-200">Sin línea de crédito asignada</p>
                        <p className="mt-1 font-medium text-slate-400">
                          Aún no defines cuánto crédito le das a este cliente. Puedes asignarlo
                          en <span className="font-bold text-slate-300">Editar</span>.
                        </p>
                      </div>
                      {balanceKnown && creditSummary.usedCredit > 0 && (
                        <div className="flex items-center justify-between rounded-xl bg-slate-950 p-3 text-xs">
                          <span className="font-semibold text-slate-400">Saldo Pendiente de Cobro</span>
                          <span className="font-bold text-amber-400 font-mono">
                            ${creditSummary.usedCredit.toLocaleString('es-MX')} MXN
                          </span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <>
                      <div className="mt-4 space-y-3">
                        <div className="flex items-center justify-between rounded-xl bg-slate-950 p-3 text-xs">
                          <span className="font-semibold text-slate-400">Límite de Crédito Autorizado</span>
                          <span className="font-bold text-white font-mono">
                            {creditSummary.hasLimit
                              ? `$${creditSummary.totalLimit.toLocaleString('es-MX')} MXN`
                              : 'Sin definir'}
                          </span>
                        </div>
                        {/* Every figure below is derived from the receivables
                            read. While it is in flight or failed, the honest
                            answer is "no lo sabemos" — a $0 utilizado against a
                            full available line is the fabrication this page
                            exists to remove (#96). */}
                        <div className="flex items-center justify-between rounded-xl bg-slate-950 p-3 text-xs">
                          <span className="font-semibold text-slate-400">Crédito Utilizado (Cuentas Activas)</span>
                          <span className="font-bold text-amber-400 font-mono">
                            {balanceKnown
                              ? `$${creditSummary.usedCredit.toLocaleString('es-MX')} MXN`
                              : '—'}
                          </span>
                        </div>
                        {creditSummary.hasLimit && (
                          <div className="flex items-center justify-between rounded-xl bg-slate-950 p-3 text-xs">
                            <span className="font-semibold text-slate-400">Crédito Disponible</span>
                            <span className="font-bold text-emerald-400 font-mono">
                              {balanceKnown
                                ? `$${creditSummary.availableCredit.toLocaleString('es-MX')} MXN`
                                : '—'}
                            </span>
                          </div>
                        )}
                        <div className="flex items-center justify-between rounded-xl bg-slate-950 p-3 text-xs">
                          <span className="font-semibold text-slate-400">Plazo de Pago (Días)</span>
                          <span className="font-bold text-indigo-400">
                            {creditSummary.creditDays === null
                              ? 'Sin definir'
                              : creditSummary.creditDays > 0
                              ? `${creditSummary.creditDays} Días de Crédito`
                              : 'Contado (0 días)'}
                          </span>
                        </div>
                      </div>

                      {!balanceKnown && (
                        <p className="mt-3 text-xs font-medium text-slate-400">
                          {receivablesLoading
                            ? 'Calculando el saldo del cliente…'
                            : 'No pudimos calcular el saldo de este cliente. Revisa tu conexión y vuelve a intentar.'}
                        </p>
                      )}

                      {/* Credit Utilization Bar */}
                      {balanceKnown && creditSummary.hasLimit && creditSummary.totalLimit > 0 && (
                        <div className="mt-4">
                          <div className="flex items-center justify-between text-[11px] font-bold text-slate-400 mb-1.5">
                            <span>Uso de Línea</span>
                            <span>{creditSummary.utilizationPercentage}%</span>
                          </div>
                          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-950 border border-slate-800">
                            <div
                              className={`h-full transition-all ${
                                creditSummary.utilizationPercentage > 85 ? 'bg-rose-500' : creditSummary.utilizationPercentage > 60 ? 'bg-amber-500' : 'bg-emerald-500'
                              }`}
                              style={{ width: `${Math.max(5, creditSummary.utilizationPercentage)}%` }}
                            />
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })()}

            <div className="rounded-3xl border border-slate-800 bg-slate-900/90 p-6 shadow-xl text-white">
              <h3 className="text-base font-extrabold text-white">Perfil Fiscal SAT (CFDI 4.0)</h3>
              <p className="mt-0.5 text-xs text-slate-400">Datos requeridos para facturación electrónica</p>

              {/* These three were rendered as `|| '601'`, `|| 'G03'`, `|| 'N/A'`,
                  so a client with no fiscal data on file looked fully set up for
                  invoicing with someone else's régimen. Régimen fiscal and
                  código postal are required to stamp a CFDI 4.0 — showing a
                  default here is the placeholder-identifier rule on the field
                  that decides whether an invoice can be issued at all (#96). */}
              <div className="mt-4 space-y-3">
                {([
                  // The stored value is a bare SAT code; "606" is not an
                  // answer to "what régimen is this client on". The shared
                  // catalogue names it, and a code it does not carry falls
                  // back to the code itself rather than to nothing (#127).
                  [
                    'Régimen Fiscal',
                    client.regimen_fiscal
                      ? (findRegimen(client.regimen_fiscal)?.label ?? client.regimen_fiscal)
                      : client.regimen_fiscal,
                  ],
                  ['Uso de CFDI', client.cfdi_use],
                  ['Código Postal', client.codigo_postal],
                ] as const).map(([label, value]) => (
                  <div
                    key={label}
                    className="flex items-center justify-between rounded-xl bg-slate-950 p-3 text-xs"
                  >
                    <span className="font-semibold text-slate-400">{label}</span>
                    {value ? (
                      <span className="font-bold text-white">{value}</span>
                    ) : (
                      <span className="font-bold text-amber-400">Falta capturar</span>
                    )}
                  </div>
                ))}
              </div>

              {(!client.regimen_fiscal || !client.codigo_postal) && (
                <p className="mt-3 rounded-xl border border-amber-500/20 bg-amber-950/40 p-3 text-xs font-medium text-amber-300">
                  Sin estos datos no podrás facturarle a este cliente. Complétalos en Editar.
                </p>
              )}
            </div>
          </div>

          {/* Right Column: Chronological Activity Timeline */}
          <div className="lg:col-span-2">
            <div className="rounded-3xl border border-slate-800 bg-slate-900/90 p-6 shadow-xl sm:p-8 backdrop-blur-xl text-white">
              <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                <div>
                  <h3 className="text-lg font-extrabold text-white">Historial de Actividad</h3>
                  <p className="text-xs text-slate-400">Cotizaciones, contratos y cobranza del cliente</p>
                </div>
                <span className="flex items-center gap-1 rounded-xl bg-indigo-500/10 border border-indigo-500/20 px-3 py-1.5 text-xs font-bold text-indigo-400">
                  <Clock className="h-3.5 w-3.5" />
                  <span>{activityKnown ? `${activityFeed.length} Eventos` : '— Eventos'}</span>
                </span>
              </div>

              <div className="mt-6">
                {activityKnown ? (
                  <ActivityTimeline items={activityFeed} />
                ) : quotesLoading || receivablesLoading ? (
                  <div className="space-y-3">
                    <div className="h-16 w-full animate-pulse rounded-xl bg-slate-800/70" />
                    <div className="h-16 w-full animate-pulse rounded-xl bg-slate-800/70" />
                  </div>
                ) : (
                  <p role="alert" className="rounded-2xl border border-rose-500/30 bg-rose-950/60 p-4 text-xs font-semibold text-rose-200">
                    No pudimos cargar el historial de este cliente. Su actividad no se ha perdido;
                    recarga la página para intentar de nuevo.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <ClientFormModal
        isOpen={isEditOpen}
        onClose={() => setIsEditOpen(false)}
        onSave={handleUpdate}
        initialClient={client}
      />

      <ConfirmDialog request={confirmAction.request} onClose={confirmAction.dismiss} />
      <ActionResultDialog result={result.value} onClose={result.dismiss} />
    </div>
  );
}
