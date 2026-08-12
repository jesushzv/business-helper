'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowRight, Sparkles } from 'lucide-react';

export function StickyMobileCta() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 300) {
        setIsVisible(true);
      } else {
        setIsVisible(false);
      }
    };

    window.addEventListener('scroll', handleScroll);
    // Initial check
    handleScroll();

    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  if (!isVisible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 p-3 bg-slate-950/95 border-t border-slate-800/90 backdrop-blur-xl sm:hidden shadow-2xl transition-all duration-300">
      <div className="flex items-center justify-between gap-3 max-w-md mx-auto">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
            <Sparkles className="w-4 h-4" />
          </div>
          <div className="text-left">
            <div className="text-xs font-black text-white leading-tight">BusinessHelper</div>
            <div className="text-[10px] text-slate-400 font-medium">14 días gratis sin tarjeta</div>
          </div>
        </div>

        <Link
          href="/register"
          className="min-h-[48px] px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs rounded-xl shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-1.5 active:scale-95 transition-transform shrink-0"
        >
          <span>Probar 14 Días Gratis</span>
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  );
}
