'use client';

import React, { useState } from 'react';
import { CreditCard, Check, Zap, ExternalLink, ShieldCheck } from 'lucide-react';
import { STRIPE_PLANS, StripeTierConfig, SubscriptionStatusResult } from '@/lib/stripe';
import { OrganizationSettings } from '@/lib/hooks/useOrganizationSettings';

interface SubscriptionBillingCardProps {
  settings: OrganizationSettings;
  statusInfo: SubscriptionStatusResult;
  onSelectTier: (tierId: 'emprendedor' | 'negocio' | 'empresa') => Promise<void>;
}

export const SubscriptionBillingCard: React.FC<SubscriptionBillingCardProps> = ({
  settings,
  statusInfo,
  onSelectTier,
}) => {
  const [loadingTier, setLoadingTier] = useState<string | null>(null);

  const handleUpgrade = async (tierId: 'emprendedor' | 'negocio' | 'empresa') => {
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
    <div className="rounded-3xl border border-gray-200 bg-white p-6 shadow-xs sm:p-8">
      <div className="flex flex-col justify-between gap-3 border-b border-gray-100 pb-5 sm:flex-row sm:items-center">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700 shadow-xs">
            <CreditCard className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-xl font-extrabold tracking-tight text-gray-900">
              Plan de Suscripción y Facturación
            </h3>
            <p className="text-xs text-gray-500">
              Administra tu plan mensual de Business Helper procesado de forma segura por Stripe.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-gray-500">Estado:</span>
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
                  ? 'border-indigo-600 bg-linear-to-b from-indigo-50/40 via-white to-white shadow-md ring-2 ring-indigo-600/20'
                  : 'border-gray-200 bg-white hover:border-gray-300 shadow-xs'
              }`}
            >
              {plan.popular && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 rounded-full bg-indigo-600 px-3.5 py-1 text-[11px] font-black tracking-wider uppercase text-white shadow-xs">
                  Más Popular
                </div>
              )}

              <div>
                <div className="flex items-center justify-between">
                  <h4 className="text-lg font-black tracking-tight text-gray-900">{plan.name}</h4>
                  {isCurrentPlan && (
                    <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-extrabold text-emerald-800 border border-emerald-200">
                      Tu Plan Actual
                    </span>
                  )}
                </div>

                <p className="mt-2 text-xs font-medium text-gray-500 min-h-[36px]">{plan.description}</p>

                <div className="mt-4 flex items-baseline gap-1">
                  <span className="text-4xl font-black tracking-tight text-gray-900">
                    {formatCurrency(plan.price)}
                  </span>
                  <span className="text-xs font-bold text-gray-500">/ mes MXN</span>
                </div>

                <div className="mt-6 space-y-2.5 border-t border-gray-100 pt-5">
                  <span className="text-xs font-extrabold tracking-wider uppercase text-gray-400">
                    Incluye:
                  </span>
                  {plan.features.map((feat, idx) => (
                    <div key={idx} className="flex items-start gap-2 text-xs font-medium text-gray-700">
                      <Check className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                      <span>{feat}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-8 pt-4 border-t border-gray-100">
                <button
                  onClick={() => handleUpgrade(plan.id)}
                  disabled={isCurrentPlan || isLoadingThis}
                  className={`flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl px-5 py-3.5 text-xs font-extrabold transition-all shadow-xs active:scale-98 ${
                    isCurrentPlan
                      ? 'bg-gray-100 text-gray-400 cursor-default'
                      : plan.popular
                      ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                      : 'bg-gray-900 text-white hover:bg-gray-800'
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

      <div className="mt-8 flex flex-col items-center justify-between gap-3 rounded-2xl bg-gray-50 p-4 text-xs font-medium text-gray-600 sm:flex-row border border-gray-100">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-indigo-600" />
          <span>Pagos procesados con cifrado bancario de 256 bits mediante Stripe.</span>
        </div>
        <a
          href="https://stripe.com"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 font-bold text-indigo-600 hover:text-indigo-800"
        >
          <span>Más sobre Stripe</span>
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>
    </div>
  );
};
