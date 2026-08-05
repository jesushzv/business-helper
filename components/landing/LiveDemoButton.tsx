'use client';

import React from 'react';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';

interface LiveDemoButtonProps {
  className?: string;
  variant?: 'button' | 'link';
  children?: React.ReactNode;
  href?: string;
}

export function LiveDemoButton({
  className = '',
  variant = 'button',
  children,
  href = '/dashboard?demo=true',
}: LiveDemoButtonProps) {
  return variant === 'link' ? (
    <Link
      href={href}
      className={`hover:text-emerald-400 transition-colors py-2 cursor-pointer ${className}`}
    >
      {children || 'Demo Interactiva'}
    </Link>
  ) : (
    <Link
      href={href}
      className={
        className ||
        'w-full sm:w-auto min-h-[54px] px-6 py-4 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-200 font-bold rounded-2xl transition-all flex items-center justify-center gap-2 text-sm cursor-pointer'
      }
    >
      <span>{children || 'Explorar Demo Interactiva'}</span>
      <ChevronRight className="w-4 h-4 text-slate-400" />
    </Link>
  );
}

