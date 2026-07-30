'use client';

import React from 'react';
import { ShieldCheck, ShieldAlert, ShieldX } from 'lucide-react';
import { calculateClientHealthScore, MilestonePaymentRecord } from '@/lib/clientHealthScore';

interface HealthScoreMeterProps {
  score?: number;
  milestones?: MilestonePaymentRecord[];
  compact?: boolean;
}

export const HealthScoreMeter: React.FC<HealthScoreMeterProps> = ({ score: propScore, milestones, compact = false }) => {
  const result = milestones ? calculateClientHealthScore(milestones) : null;
  const score = propScore ?? result?.score ?? 100;

  let rating = 'Excelente';
  let badgeColor = 'bg-emerald-50 text-emerald-700 border-emerald-200';
  let barColor = 'bg-emerald-500';
  let Icon = ShieldCheck;

  if (score >= 90) {
    rating = 'Excelente';
    badgeColor = 'bg-emerald-50 text-emerald-700 border-emerald-200';
    barColor = 'bg-emerald-500';
    Icon = ShieldCheck;
  } else if (score >= 75) {
    rating = 'Bueno';
    badgeColor = 'bg-blue-50 text-blue-700 border-blue-200';
    barColor = 'bg-blue-500';
    Icon = ShieldCheck;
  } else if (score >= 50) {
    rating = 'En Riesgo';
    badgeColor = 'bg-amber-50 text-amber-700 border-amber-200';
    barColor = 'bg-amber-500';
    Icon = ShieldAlert;
  } else {
    rating = 'Moroso';
    badgeColor = 'bg-red-50 text-red-700 border-red-200';
    barColor = 'bg-red-500';
    Icon = ShieldX;
  }

  if (compact) {
    return (
      <div className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold ${badgeColor}`}>
        <Icon className="h-3.5 w-3.5" />
        <span>{score}/100</span>
        <span className="opacity-75">• {rating}</span>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-xs">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`flex h-9 w-9 items-center justify-center rounded-xl border ${badgeColor}`}>
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <h4 className="text-xs font-bold tracking-wider text-gray-500 uppercase">Health Score Financiero</h4>
            <p className="text-sm font-extrabold text-gray-900">{rating}</p>
          </div>
        </div>
        <div className="text-right">
          <span className="text-2xl font-black text-gray-900">{score}</span>
          <span className="text-xs font-bold text-gray-400">/100</span>
        </div>
      </div>

      {/* Progress Gauge Bar */}
      <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-gray-100">
        <div
          className={`h-full transition-all duration-500 ${barColor}`}
          style={{ width: `${Math.max(5, score)}%` }}
        />
      </div>
    </div>
  );
};
