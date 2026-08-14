'use client';

import React, { useState } from 'react';
import { CreditCard, Check, Zap, ExternalLink, ShieldCheck } from 'lucide-react';
import { STRIPE_PLANS, statusHoldsPlan, StripeTierConfig, SubscriptionStatusResult } from '@/lib/stripe';
import { OrganizationSettings } from '@/lib/hooks/useOrganizationSettings';
import { useTrialState } from '@/lib/hooks/useTrialState';

interface SubscriptionBillingCardProps {
  settings: OrganizationSettings;
  statusInfo: SubscriptionStatusResult;
  onSelectTier: (tierId: 'inicial' | 'negocio' | 'empresa') => Promise<void>;
  /**
   * The plan the owner chose on the pricing page before landing here, carried
   * by `/upgrade?plan=…`. Marked, not bought: the tap that starts a payment is
   * theirs to make, and auto-opening Checkout on load would trap anyone who
   * pressed Back on Stripe in a redirect loop.
   */
  highlightTier?: 'inicial' | 'negocio' | 'empresa' | null;
  /**
   * Whether this viewer may actually buy a plan.
   *
   * `POST /api/stripe/checkout` requires `billing_management`, which only the
   * owner holds — and this card took no role at all, so a member sent here by
   * `/upgrade?plan=…` (which routes members to this page deliberately) read
   * "Continúa para pagarlo", tapped through "Procesando…" and was refused
   * (#266). The page already knows the answer: `/api/organization` returns
   * `role`. Its siblings — org profile, bank accounts, branding — all take
   * `canEdit` for exactly this reason.
   *
   * Defaults to `true` so an unknown role never *hides* billing from the owner;
   * the server is the enforcement either way.
   */
  canManageBilling?: boolean;
  /**
   * Whether Stripe knows this organization as a customer (#346).
   *
   * Three states, and the middle one is the point: `true` renders the portal
   * button, `false` renders nothing because `POST /api/stripe/portal` would
   * answer 409 — a control that is guaranteed to refuse is not a control —
   * and `null` (unknown: still loading, or the read failed) also renders
   * nothing, since inventing either answer is worse than waiting. The #64
   * tri-state rule; the route enforces it regardless of what this says.
   */
  hasBillingAccount?: boolean | null;
  /** Opens the Stripe Billing Portal. Required for the button to appear. */
  onManageBilling?: () => Promise<void>;
}

export const SubscriptionBillingCard: React.FC<SubscriptionBillingCardProps> = ({
  settings,
  statusInfo,
  onSelectTier,
  highlightTier = null,
  canManageBilling = true,
  hasBillingAccount = null,
  onManageBilling,
}) => {
  const [loadingTier, setLoadingTier] = useState<string | null>(null);
  const [openingPortal, setOpeningPortal] = useState(false);
  const { trial } = useTrialState();
  const highlightRef = React.useRef<HTMLDivElement | null>(null);

  // The billing card sits below four others, so on a 375px screen the plan they
  // asked for is several screens down — an invisible highlight is no highlight.
  React.useEffect(() => {
    if (highlightTier && highlightRef.current) {
      highlightRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [highlightTier]);

  const handleUpgrade = async (tierId: 'inicial' | 'negocio' | 'empresa') => {
    try {
      setLoadingTier(tierId);
      await onSelectTier(tierId);
    } finally {
      setLoadingTier(null);
    }
  };

  const handleManageBilling = async () => {
    if (!onManageBilling) return;
    try {
      setOpeningPortal(true);
      await onManageBilling();
    } catch {
      // Deliberately silent *here* and nowhere else: the caller owns the
      // message — the settings page catches its own fetch failures and renders
      // them in the checkout error banner — and this handler's only job is to
      // stop the click from becoming an unhandled rejection. It reports no
      // success either; the only success is the redirect that never returns.
    } finally {
      // Reached only if the portal did not take over the tab: a successful
      // open is a full-page redirect, so leaving the button spinning forever
      // on failure would be the only visible outcome of an error.
      setOpeningPortal(false);
    }
  };

  // Both halves are required. `canManageBilling` is the role gate the checkout
  // buttons already use — the route refuses a member with the same capability
  // — and `hasBillingAccount === true` is the "there is something to
  // administer" gate, strict so that `null` (unknown) shows nothing.
  const showPortalButton = canManageBilling && hasBillingAccount === true && !!onManageBilling;

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN',
      maximumFractionDigits: 0,
    }).format(val);
  };

  const plansList: StripeTierConfig[] = Object.values(STRIPE_PLANS);

  return (
    <div className="rounded-3xl border border-slate-800 bg-slate-900/90 p-6 shadow-xl sm:p-8 text-white">
      <div className="flex flex-col justify-between gap-3 border-b border-slate-800 pb-5 sm:flex-row sm:items-center">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-950/80 text-emerald-400 border border-emerald-500/30 shadow-md">
            <CreditCard className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-xl font-extrabold tracking-tight text-white">
              Plan de Suscripción y Facturación
            </h3>
            <p className="text-xs text-slate-400">
              Administra tu plan mensual de Business Helper procesado de forma segura por Stripe.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-slate-400">Estado:</span>
          {settings.subscription_tier ? (
            <span className={`rounded-full border px-3 py-1 text-xs font-extrabold ${statusInfo.badgeColor}`}>
              {statusInfo.badgeText}
            </span>
          ) : trial?.kind === 'trialing' ? (
            // What a tenant who has never checked out is actually on (#128).
            // Only ever rendered from a trial the server confirmed — the hook
            // holds `null` for anything it could not read.
            <span className="rounded-full border border-emerald-500/30 bg-emerald-950/80 px-3 py-1 text-xs font-extrabold text-emerald-400">
              Prueba gratis: {trial.daysLeft} {trial.daysLeft === 1 ? 'día' : 'días'}
            </span>
          ) : trial?.kind === 'expired' ? (
            <span className="rounded-full border border-amber-500/30 bg-amber-950/80 px-3 py-1 text-xs font-extrabold text-amber-400">
              Prueba terminada
            </span>
          ) : (
            // No tier column means nothing was ever bought, whatever the status
            // column happens to say — and it has said different things over
            // time: `subscription_status` defaulted to 'active' until
            // 20260811150000 moved it to 'trialing'. Keying the badge on the
            // tier is what keeps this arm right across both.
            <span className="rounded-full border border-slate-700 bg-slate-800 px-3 py-1 text-xs font-extrabold text-slate-300">
              Sin plan contratado
            </span>
          )}
        </div>
      </div>

      {/* Says exactly what stopped and what did not. A tenant whose trial ended
          keeps everything already in motion — the gate only stops *new* work —
          and being told that is the difference between choosing a plan and
          assuming the product took their business hostage. */}
      {trial?.kind === 'expired' && (
        <p className="mt-5 rounded-2xl border border-amber-500/30 bg-amber-950/40 p-4 text-xs font-semibold text-amber-300">
          Tu prueba gratis terminó. Lo que ya enviaste sigue funcionando: tus clientes pueden firmar
          y pagar, y puedes facturar lo que ya cerraste. Elige un plan para volver a crear
          cotizaciones nuevas.
        </p>
      )}

      {!canManageBilling && (
        <p className="mt-5 rounded-2xl border border-slate-700 bg-slate-950/80 p-4 text-xs font-semibold text-slate-300">
          Solo el dueño de la cuenta puede contratar o cambiar el plan. Aquí puedes ver lo que
          incluye cada uno; pídele al dueño que haga el cambio.
        </p>
      )}

      {/* Above the plan grid on purpose. Someone looking for this came to
          cancel or to fix a card, and on a 375px screen three plan cards sit
          between the header and anything below them — a cancel path the owner
          has to scroll past the upsell to reach is a dark pattern. */}
      {showPortalButton && (
        <div className="mt-5 flex flex-col gap-3 rounded-2xl border border-slate-800 bg-slate-950/80 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-bold text-white">Administrar mi suscripción</p>
            <p className="mt-0.5 text-xs font-medium text-slate-400">
              Cambia tu tarjeta, descarga tus facturas o cancela tu plan cuando quieras.
            </p>
          </div>
          <button
            type="button"
            onClick={handleManageBilling}
            disabled={openingPortal}
            className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl border border-slate-700 bg-slate-800 px-5 py-3 text-xs font-extrabold text-white shadow-md transition-all hover:bg-slate-700 active:scale-95 disabled:cursor-default disabled:text-slate-500 sm:w-auto"
          >
            {openingPortal ? (
              <span>Abriendo...</span>
            ) : (
              <>
                <CreditCard className="h-4 w-4 text-indigo-400" />
                <span>Administrar mi suscripción</span>
                <ExternalLink className="h-3.5 w-3.5 text-slate-400" />
              </>
            )}
          </button>
        </div>
      )}

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
        {plansList.map((plan) => {
          // Two facts, not one: the tier column says which plan was bought, and
          // the status says whether it is still held. The webhook keeps writing
          // the tier even on `customer.subscription.deleted`, so reading the
          // tier alone showed a cancelled customer a disabled "Plan Activo" and
          // left them able to buy only some *other* tier (#267).
          const isNamedPlan = settings.subscription_tier === plan.id;
          const isCurrentPlan = isNamedPlan && statusHoldsPlan(statusInfo.status);
          // The plan they had and lost: purchasable again, and named as such.
          const isReactivatable = isNamedPlan && !isCurrentPlan;
          const isLoadingThis = loadingTier === plan.id;
          const isRequested = highlightTier === plan.id && !isCurrentPlan;

          return (
            <div
              key={plan.id}
              ref={isRequested ? highlightRef : undefined}
              className={`relative flex flex-col justify-between rounded-3xl border p-6 transition-all ${
                isRequested
                  ? 'border-emerald-500/70 bg-slate-950/90 shadow-xl ring-2 ring-emerald-400/50'
                  : plan.popular
                  ? 'border-indigo-500/60 bg-slate-950/90 shadow-xl ring-2 ring-indigo-500/30'
                  : 'border-slate-800 bg-slate-950/80 hover:border-slate-700 shadow-md'
              }`}
            >
              {isRequested && (
                <p className="mb-3 rounded-xl border border-emerald-500/30 bg-emerald-950/60 px-3 py-2 text-[11px] font-bold text-emerald-300">
                  {canManageBilling
                    ? 'Este es el plan que elegiste. Continúa para pagarlo.'
                    : 'Este es el plan que elegiste. Pídele al dueño de la cuenta que lo contrate.'}
                </p>
              )}
              {plan.popular && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 rounded-full bg-indigo-600 px-3.5 py-1 text-[11px] font-black tracking-wider uppercase text-white shadow-md">
                  Más Popular
                </div>
              )}

              <div>
                <div className="flex items-center justify-between">
                  <h4 className="text-lg font-black tracking-tight text-white">{plan.name}</h4>
                  {isCurrentPlan && (
                    <span className="rounded-full bg-emerald-950/80 px-2.5 py-0.5 text-[11px] font-extrabold text-emerald-400 border border-emerald-500/30">
                      Tu Plan Actual
                    </span>
                  )}
                  {isReactivatable && (
                    <span className="rounded-full bg-amber-950/80 px-2.5 py-0.5 text-[11px] font-extrabold text-amber-400 border border-amber-500/30">
                      Tu plan anterior
                    </span>
                  )}
                </div>

                <p className="mt-2 text-xs font-medium text-slate-400 min-h-[48px]">{plan.description}</p>

                <div className="mt-4 flex items-baseline gap-1">
                  <span className="text-4xl font-black font-mono tracking-tight text-white">
                    {formatCurrency(plan.price)}
                  </span>
                  <span className="text-xs font-bold text-slate-400">/ mes MXN</span>
                </div>

                <div className="mt-6 space-y-2.5 border-t border-slate-800 pt-5">
                  <span className="text-xs font-extrabold tracking-wider uppercase text-slate-500">
                    Incluye:
                  </span>
                  {plan.features.map((feat, idx) => (
                    <div key={idx} className="flex items-start gap-2 text-xs font-medium text-slate-300">
                      <Check className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                      <span>{feat}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-8 pt-4 border-t border-slate-800">
                <button
                  onClick={() => handleUpgrade(plan.id)}
                  // A member's tap reaches a route that always refuses (#266),
                  // so the refusal is stated up front instead of after
                  // "Procesando…".
                  disabled={isCurrentPlan || isLoadingThis || !canManageBilling}
                  title={
                    canManageBilling ? undefined : 'Solo el dueño de la cuenta puede cambiar el plan'
                  }
                  className={`flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl px-5 py-3.5 text-xs font-extrabold transition-all shadow-md active:scale-95 ${
                    isCurrentPlan || !canManageBilling
                      ? 'bg-slate-800 text-slate-500 border border-slate-700 cursor-default'
                      : plan.popular
                      ? 'bg-emerald-500 text-slate-950 hover:bg-emerald-400'
                      : 'bg-indigo-600 text-white hover:bg-indigo-500'
                  }`}
                >
                  {isLoadingThis ? (
                    <span>Procesando...</span>
                  ) : isCurrentPlan ? (
                    <>
                      <ShieldCheck className="h-4 w-4" />
                      <span>Plan Activo</span>
                    </>
                  ) : !canManageBilling ? (
                    <>
                      <ShieldCheck className="h-4 w-4" />
                      <span>Solo el dueño puede contratar</span>
                    </>
                  ) : isReactivatable ? (
                    <>
                      <Zap className="h-4 w-4" />
                      <span>Reactivar {plan.name}</span>
                    </>
                  ) : (
                    <>
                      <Zap className="h-4 w-4" />
                      <span>Seleccionar {plan.name}</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-8 flex flex-col items-center justify-between gap-3 rounded-2xl bg-slate-950/80 p-4 text-xs font-medium text-slate-400 sm:flex-row border border-slate-800">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-indigo-400" />
          <span>Pagos procesados con cifrado bancario de 256 bits mediante Stripe.</span>
        </div>
        <a
          href="https://stripe.com"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 font-bold text-indigo-400 hover:text-indigo-300"
        >
          <span>Más sobre Stripe</span>
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>
    </div>
  );
};
