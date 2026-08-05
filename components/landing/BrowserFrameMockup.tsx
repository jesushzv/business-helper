'use client';

import React from 'react';
import { Lock, ShieldCheck, RefreshCw } from 'lucide-react';

interface BrowserFrameMockupProps {
  children: React.ReactNode;
  url?: string;
  className?: string;
}

export function BrowserFrameMockup({
  children,
  url = 'app.businesshelper.mx/dashboard',
  className = '',
}: BrowserFrameMockupProps) {
  return (
    <div className={`relative w-full max-w-4xl mx-auto ${className}`}>
      {/* Outer Window Chassis with Titanium Glow & Shadow */}
      <div className="relative rounded-2xl border border-slate-800 bg-slate-950 shadow-2xl shadow-emerald-950/30 overflow-hidden ring-1 ring-slate-800/80 backdrop-blur-2xl">
        {/* Browser Top Navigation Header Bar */}
        <div className="flex items-center justify-between px-4 py-3 bg-slate-900/90 border-b border-slate-800/80 select-none">
          {/* macOS Window Control Dots */}
          <div className="flex items-center gap-2 w-20">
            <div className="w-3 h-3 rounded-full bg-rose-500/80 border border-rose-600/40" />
            <div className="w-3 h-3 rounded-full bg-amber-500/80 border border-amber-600/40" />
            <div className="w-3 h-3 rounded-full bg-emerald-500/80 border border-emerald-600/40" />
          </div>

          {/* Center SSL Address Bar */}
          <div className="flex-1 max-w-md mx-auto flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg bg-slate-950/80 border border-slate-800 text-[11px] font-mono text-slate-300 shadow-inner">
            <Lock className="w-3 h-3 text-emerald-400 shrink-0" />
            <span className="truncate tracking-tight">{url}</span>
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0 ml-auto" />
          </div>

          {/* Right Action Icons */}
          <div className="flex items-center justify-end gap-2 w-20 text-slate-500">
            <RefreshCw className="w-3.5 h-3.5 hover:text-slate-300 transition-colors cursor-pointer" />
          </div>
        </div>

        {/* Browser Screen Content Viewport (Widescreen 16:10 aspect ratio) */}
        <div className="relative aspect-[16/10] sm:aspect-video w-full bg-slate-950 overflow-hidden">
          {children}
        </div>
      </div>
    </div>
  );
}
