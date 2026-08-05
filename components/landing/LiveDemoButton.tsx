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
      {children || 'Sandbox Interactivo'}
    </Link>
  ) : (
    <Link
      href={href}
      className={
        className ||
        'w-full sm:w-auto min-h-[54px] px-6 py-4 bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold rounded-2xl transition-all flex items-center justify-center gap-2 text-sm shadow-lg shadow-indigo-600/20 active:scale-95 cursor-pointer'
      }
    >
      <span>{children || 'Explorar Sandbox Interactivo'}</span>
      <ChevronRight className="w-4 h-4 text-indigo-200" />
    </Link>
  );
}

