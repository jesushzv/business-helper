'use client';

import React, { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { DemoSchedulerModal } from '@/components/landing/DemoSchedulerModal';

interface LiveDemoButtonProps {
  className?: string;
  variant?: 'button' | 'link';
  children?: React.ReactNode;
}

export function LiveDemoButton({
  className = '',
  variant = 'button',
  children,
}: LiveDemoButtonProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      {variant === 'link' ? (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className={`hover:text-emerald-400 transition-colors py-2 cursor-pointer ${className}`}
        >
          {children || 'Demo Interactiva'}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className={
            className ||
            'w-full sm:w-auto min-h-[54px] px-6 py-4 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-200 font-bold rounded-2xl transition-all flex items-center justify-center gap-2 text-sm cursor-pointer'
          }
        >
          <span>{children || 'Ver Demostración en Vivo'}</span>
          <ChevronRight className="w-4 h-4 text-slate-400" />
        </button>
      )}

      <DemoSchedulerModal isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </>
  );
}
