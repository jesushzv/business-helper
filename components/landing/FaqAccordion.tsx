'use client';

import React, { useState } from 'react';
import { ChevronDown, FileCheck, MessageSquare, CreditCard, ShieldCheck, Download, FileText, Database, FileSpreadsheet, RefreshCcw, HelpCircle } from 'lucide-react';
import { LANDING_FAQS } from '@/lib/landingFaq';

// Copy lives in lib/landingFaq.ts so the JSON-LD FAQPage schema renders the
// same questions and answers a visitor reads here. Icons are presentation.
const ICONS: Record<string, React.ElementType> = {
  'invoicing-sat': FileCheck,
  'otp-legal-validity': FileText,
  'whatsapp-integration': MessageSquare,
  'spei-verification': ShieldCheck,
  'excel-migration': FileSpreadsheet,
  'accountant-export': Download,
  'data-ownership-cancellation': Database,
  'trial-end-behavior': RefreshCcw,
  'no-credit-card': CreditCard,
};

const FAQS = LANDING_FAQS.map((faq) => ({ ...faq, icon: ICONS[faq.id] || HelpCircle }));

export function FaqAccordion() {
  const [openId, setOpenId] = useState<string | null>('invoicing-sat');

  const toggle = (id: string) => {
    setOpenId(openId === id ? null : id);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      {FAQS.map((faq) => {
        const isOpen = openId === faq.id;
        const Icon = faq.icon;

        return (
          <div
            key={faq.id}
            className={`rounded-2xl border transition-all ${
              isOpen
                ? 'border-emerald-500/40 bg-slate-900/90 shadow-lg shadow-emerald-950/20'
                : 'border-slate-800 bg-slate-900/50 hover:border-slate-700'
            }`}
          >
            <button
              type="button"
              onClick={() => toggle(faq.id)}
              className="w-full min-h-[48px] p-5 sm:p-6 text-left flex items-center justify-between gap-4 cursor-pointer focus:outline-none"
            >
              <div className="flex items-center gap-3.5">
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
                    isOpen
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                      : 'bg-slate-800/80 text-slate-400 border-slate-700'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                </div>
                <span className="text-base sm:text-lg font-bold text-white tracking-tight">
                  {faq.question}
                </span>
              </div>
              <ChevronDown
                className={`w-5 h-5 shrink-0 text-slate-400 transition-transform duration-200 ${
                  isOpen ? 'rotate-180 text-emerald-400' : ''
                }`}
              />
            </button>

            {isOpen && (
              <div className="px-5 pb-6 sm:px-6 text-slate-300 text-xs sm:text-sm leading-relaxed border-t border-slate-800/60 mt-1 pt-4 pl-16">
                {faq.answer}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
