'use client';

import React, { useState } from 'react';
import { CreditCard, Check, Zap, ExternalLink, ShieldCheck } from 'lucide-react';
import { STRIPE_PLANS, StripeTierConfig, SubscriptionStatusResult } from '@/lib/stripe';
import { OrganizationSettings } from '@/lib/hooks/useOrganizationSettings';

interface SubscriptionBillingCardProps {
  settings: OrganizationSettings;
  statusInfo: SubscriptionStatusResult;
  onSelectTier: (tierId: 'inicial' | 'negocio' | 'empresa') => Promise<void>;
}

export const SubscriptionBillingCard: React.FC<SubscriptionBillingCardProps> = ({
  settings,
  statusInfo,
  onSelectTier,
}) => {
  const [loadingTier, setLoadingTier] = useState<string | null>(null);

  const handleUpgrade = async (tierId: 'inicial' | 'negocio' | 'empresa') => {
    try {
      setLoadingTier(tierId);
      await onSelectTier(tierId);
    } finally {
      setLoadingTier(null);
    }
  };

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
          <span className={`rounded-full border px-3 py-1 text-xs font-extrabold ${statusInfo.badgeColor}`}>
            {statusInfo.badgeText}
          </span>
        </div>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
        {plansList.map((plan) => {
          const isCurrentPlan = settings.subscription_tier === plan.id;
          const isLoadingThis = loadingTier === plan.id;

          return (
            <div
              key={plan.id}
              className={`relative flex flex-col justify-between rounded-3xl border p-6 transition-all ${
                plan.popular
                  ? 'border-indigo-500/60 bg-slate-950/90 shadow-xl ring-2 ring-indigo-500/30'
                  : 'border-slate-800 bg-slate-950/80 hover:border-slate-700 shadow-md'
              }`}
            >
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
                </div>

                <p className="mt-2 text-xs font-medium text-slate-400 min-h-[36px]">{plan.description}</p>

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
                  disabled={isCurrentPlan || isLoadingThis}
                  className={`flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl px-5 py-3.5 text-xs font-extrabold transition-all shadow-md active:scale-95 ${
                    isCurrentPlan
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
