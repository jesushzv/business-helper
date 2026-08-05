'use client';

import React from 'react';
import { Wifi, Battery, Signal } from 'lucide-react';

interface PhoneFrameMockupProps {
  children: React.ReactNode;
  title?: string;
  className?: string;
}

export function PhoneFrameMockup({ children, className = '' }: PhoneFrameMockupProps) {
  return (
    <div className={`relative mx-auto max-w-[340px] sm:max-w-[380px] ${className}`}>
      {/* Outer Device Chassis with Titanium Dark Border */}
      <div className="relative rounded-[48px] border-[10px] border-slate-900 bg-slate-950 p-3.5 shadow-2xl shadow-emerald-950/40 ring-1 ring-slate-800/80 backdrop-blur-2xl">
        {/* Dynamic Island Notch */}
        <div className="absolute top-4 left-1/2 -translate-x-1/2 w-28 h-6 bg-slate-950 rounded-full z-30 flex items-center justify-between px-2.5 border border-slate-900 shadow-inner">
          <div className="w-2.5 h-2.5 rounded-full bg-slate-900 border border-slate-800" />
          <div className="w-3 h-3 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center">
            <div className="w-1.5 h-1.5 rounded-full bg-indigo-950/80" />
          </div>
        </div>

        {/* Status Bar */}
        <div className="flex items-center justify-between px-4 pt-1.5 pb-2 text-[10px] font-semibold text-slate-400 z-20 relative select-none">
          <span>9:41</span>
          <div className="flex items-center gap-1.5 text-slate-400">
            <Signal className="w-3 h-3" />
            <Wifi className="w-3 h-3" />
            <Battery className="w-3.5 h-3.5 fill-slate-400" />
          </div>
        </div>

        {/* Screen Viewport Wrapper (iPhone 9:19.5 Aspect Ratio) */}
        <div className="relative rounded-[36px] overflow-hidden bg-slate-950 border border-slate-800/60 aspect-[9/19.5] w-full">
          {/* Subtle Ambient Screen Reflection */}
          <div className="absolute top-0 right-0 w-full h-full bg-linear-to-bl from-white/5 via-transparent to-transparent pointer-events-none z-10" />

          {/* Screen Content Container */}
          <div className="relative z-0 w-full h-full text-left">
            {children}
          </div>
        </div>

        {/* Home Bar Indicator */}
        <div className="mt-2 flex justify-center">
          <div className="w-32 h-1 bg-slate-700/80 rounded-full" />
        </div>
      </div>
    </div>
  );
}
