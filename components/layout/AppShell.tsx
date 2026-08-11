'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  FileText,
  Users,
  DollarSign,
  Settings,
  Building2,
  Package,
  FileCode,
  Shield,
  Bot,
  HelpCircle,
  Menu,
  ChevronRight,
  Sparkles,
} from 'lucide-react';
import { Modal } from '@/components/shared/Modal';
import { DemoBanner } from '@/components/demo/DemoBanner';
import { DemoSessionExit } from '@/components/demo/DemoSessionExit';
import { SettlementAccountBanner } from '@/components/settlement/SettlementAccountBanner';
import { FeatureTierComparisonModal } from '@/components/features/FeatureTierComparisonModal';
import { useCurrentOrg } from '@/lib/hooks/useCurrentOrg';

const TIER_BADGES: Record<string, string> = {
  inicial: 'INICIAL',
  negocio: 'NEGOCIO',
  empresa: 'EMPRESA',
};
import { isDemoModeActive } from '@/lib/demoUtils';
import { getAssetUrl } from '@/lib/url';

interface AppShellProps {
  children: React.ReactNode;
}

const NAV_ITEMS = [
  { label: 'Control', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Cotizaciones', href: '/quotes', icon: FileText },
  { label: 'Clientes', href: '/clients', icon: Users },
  { label: 'Cobranza', href: '/receivables', icon: DollarSign },
  { label: 'Catálogo', href: '/products', icon: Package },
  { label: 'Facturación', href: '/invoices', icon: FileCode },
  { label: 'Equipo', href: '/team', icon: Shield },
  { label: 'Asistente IA', href: '/assistant', icon: Bot },
  { label: 'Ayuda', href: '/help', icon: HelpCircle },
  { label: 'Ajustes', href: '/settings', icon: Settings },
];

const PRIMARY_MOBILE_ITEMS = [
  { label: 'Control', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Cotizar', href: '/quotes', icon: FileText },
  { label: 'Cobranza', href: '/receivables', icon: DollarSign },
  { label: 'Clientes', href: '/clients', icon: Users },
];

export const AppShell: React.FC<AppShellProps> = ({ children }) => {
  const pathname = usePathname();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isTierModalOpen, setIsTierModalOpen] = useState(false);
  const [isDemo, setIsDemo] = useState(false);
  const { org, loading: orgLoading } = useCurrentOrg();

  useEffect(() => {
    setIsDemo(isDemoModeActive());
  }, []);

  const isSecondaryActive = NAV_ITEMS.slice(4).some(
    (item) => pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans selection:bg-emerald-500 selection:text-slate-950">
      {/* Stale demo flags + a live session = a real tenant seeing fixtures;
          this clears the flags and reloads once. */}
      <DemoSessionExit />

      {/* Sticky Demo Banner in Demo Mode */}
      {isDemo && <DemoBanner onOpenTierModal={() => setIsTierModalOpen(true)} />}

      {/* Desktop Sidebar */}
      <aside className="fixed bottom-0 left-0 top-0 hidden w-64 border-r border-slate-800/80 bg-slate-900/90 backdrop-blur-xl md:flex md:flex-col z-30">
        {/* Sidebar Header */}
        <div className="flex h-16 items-center justify-between border-b border-slate-800/80 px-6">
          <Link href="/dashboard" className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element -- inline SVG logo; next/image does not optimize SVGs */}
            <img src={getAssetUrl('/logo-icon.svg')} alt="Business Helper" className="h-9 w-9 object-contain" />
            <div>
              <span className="text-lg font-black tracking-tight text-white">
                Business<span className="text-emerald-400">Helper</span>
              </span>
              <p className="text-[10px] font-semibold text-slate-400 tracking-wider">PyME MEXICO • SAT CFDI 4.0</p>
            </div>
          </Link>
        </div>

        {/* Sidebar Nav items */}
        <nav className="flex-1 space-y-1.5 px-3 py-4 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex min-h-[44px] items-center gap-3 rounded-2xl px-4 py-2.5 text-sm transition-all ${
                  isActive
                    ? 'bg-emerald-500/15 text-emerald-400 font-extrabold border border-emerald-500/30 shadow-xs'
                    : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200 font-medium'
                }`}
              >
                <Icon className={`h-4 w-4 ${isActive ? 'text-emerald-400' : 'text-slate-400'}`} />
                <span>{item.label}</span>
              </Link>
            );
          })}

          {/* Tier Features Trigger in Sidebar */}
          <button
            onClick={() => setIsTierModalOpen(true)}
            className="flex min-h-[44px] w-full items-center gap-3 rounded-2xl border border-indigo-500/30 bg-indigo-950/40 px-4 py-2.5 text-sm font-bold text-indigo-300 transition-all hover:bg-indigo-900/60 hover:text-white"
          >
            <Sparkles className="h-4 w-4 text-indigo-400" />
            <span>Ver Planes y Beneficios</span>
          </button>
        </nav>

        {/* Footer Org Badge — the tenant's real organization, or nothing.
            This card hardcoded the demo tenant (and an invented "PRO" tier)
            for every real business (#93). */}
        {(orgLoading || org) && (
          <div className="border-t border-slate-800/80 p-4">
            <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-3">
              {orgLoading ? (
                <div className="h-8 w-full animate-pulse rounded-lg bg-slate-800/70" />
              ) : (
                <>
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-xs font-bold text-white">{org?.name}</p>
                    {org?.subscription_tier && (
                      <span className="rounded-md bg-emerald-950 px-1.5 py-0.5 text-[9px] font-black text-emerald-400 border border-emerald-500/30">
                        {TIER_BADGES[org.subscription_tier]}
                      </span>
                    )}
                  </div>
                  {org?.rfc && (
                    <p className="mt-0.5 text-[10px] text-slate-400">RFC: {org.rfc}</p>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </aside>

      {/* Main Content Area */}
      <div className="pb-24 md:pl-64 md:pb-0">
        {/* Sits above every dashboard page: an organization with no CLABE cannot
            be paid, and nothing else in the app says so until a client hits the
            409 on the payment page (#64). */}
        <SettlementAccountBanner />
        <main className="mx-auto min-h-screen max-w-7xl">{children}</main>
      </div>

      {/* Feature & Tier Comparison Modal */}
      <FeatureTierComparisonModal
        isOpen={isTierModalOpen}
        onClose={() => setIsTierModalOpen(false)}
      />

      {/* Mobile Bottom Navigation Bar */}
      <div className="fixed bottom-0 left-0 right-0 z-40 flex h-16 items-center justify-between border-t border-slate-800 bg-slate-900/95 px-3 backdrop-blur-lg md:hidden">
        {PRIMARY_MOBILE_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setIsMobileMenuOpen(false)}
              className={`relative flex min-h-[48px] flex-1 flex-col items-center justify-center gap-1 rounded-xl p-1 text-center transition-all active:scale-95 ${
                isActive ? 'text-emerald-400 font-extrabold' : 'text-slate-400 hover:text-slate-200 font-medium'
              }`}
            >
              {isActive && (
                <span className="absolute top-0 h-1 w-8 rounded-full bg-emerald-400" />
              )}
              <Icon className={`h-5 w-5 ${isActive ? 'text-emerald-400' : 'text-slate-400'}`} />
              <span className="text-[10px] leading-none">{item.label}</span>
            </Link>
          );
        })}

        {/* More Menu Trigger */}
        <button
          onClick={() => setIsMobileMenuOpen(true)}
          className={`relative flex min-h-[48px] flex-1 flex-col items-center justify-center gap-1 rounded-xl p-1 text-center transition-all active:scale-95 ${
            isSecondaryActive ? 'text-emerald-400 font-extrabold' : 'text-slate-400 hover:text-slate-200 font-medium'
          }`}
          aria-label="Más opciones"
        >
          {isSecondaryActive && (
            <span className="absolute top-0 h-1 w-8 rounded-full bg-emerald-400" />
          )}
          <Menu className={`h-5 w-5 ${isSecondaryActive ? 'text-emerald-400' : 'text-slate-400'}`} />
          <span className="text-[10px] leading-none">Más</span>
        </button>
      </div>

      {/* Mobile Menu Drawer Overlay */}
      {isMobileMenuOpen && (
        <Modal
          open
          onClose={() => setIsMobileMenuOpen(false)}
          title="Menú Principal"
          variant="sheet"
          panelClassName="md:hidden"
        >
          <div>
            <div className="flex items-center justify-between border-b border-slate-800 pb-4 pr-12">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-bold">
                  <Building2 className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-white">Menú Principal</h3>
                  {org?.name && <p className="truncate text-xs text-slate-400">{org.name}</p>}
                </div>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-2">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className={`flex min-h-[48px] items-center justify-between rounded-2xl px-4 py-3 text-sm transition-all ${
                      isActive
                        ? 'bg-emerald-500/15 text-emerald-400 font-extrabold border border-emerald-500/30'
                        : 'text-slate-300 hover:bg-slate-800 font-semibold'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Icon className={`h-5 w-5 ${isActive ? 'text-emerald-400' : 'text-slate-400'}`} />
                      <span>{item.label}</span>
                    </div>
                    <ChevronRight className="h-4 w-4 text-slate-500" />
                  </Link>
                );
              })}

              <button
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  setIsTierModalOpen(true);
                }}
                className="flex min-h-[48px] items-center justify-between rounded-2xl border border-indigo-500/30 bg-indigo-950/40 px-4 py-3 text-sm font-bold text-indigo-300"
              >
                <div className="flex items-center gap-3">
                  <Sparkles className="h-5 w-5 text-indigo-400" />
                  <span>Planes y Funcionalidades</span>
                </div>
                <ChevronRight className="h-4 w-4 text-indigo-400" />
              </button>
            </div>

            <div className="mt-6 border-t border-slate-800 pt-4 text-center">
              <p className="text-xs font-semibold text-slate-500">Business Helper v0.1.0 • SAT CFDI 4.0</p>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};


