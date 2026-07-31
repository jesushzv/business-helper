'use client';

import React, { useState } from 'react';
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
  Menu,
  X,
  ChevronRight,
} from 'lucide-react';

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
  { label: 'Asistente AI', href: '/assistant', icon: Bot },
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

  const isSecondaryActive = NAV_ITEMS.slice(4).some(
    (item) => pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))
  );

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans">
      {/* Desktop Sidebar */}
      <aside className="fixed bottom-0 left-0 top-0 hidden w-64 border-r border-gray-200 bg-white md:flex md:flex-col">
        {/* Sidebar Header */}
        <div className="flex h-16 items-center gap-3 border-b border-gray-100 px-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 font-bold text-white shadow-xs">
            <Building2 className="h-5 w-5" />
          </div>
          <div>
            <span className="text-lg font-bold tracking-tight text-gray-900">
              Business<span className="text-indigo-600">Helper</span>
            </span>
            <p className="text-[11px] font-medium text-gray-400">Operaciones SMB Mexico</p>
          </div>
        </div>

        {/* Sidebar Nav items */}
        <nav className="flex-1 space-y-1 px-3 py-4">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex min-h-[48px] items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold transition-all ${
                  isActive
                    ? 'bg-indigo-50 text-indigo-700 shadow-xs font-bold'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                }`}
              >
                <Icon className={`h-5 w-5 ${isActive ? 'text-indigo-600' : 'text-gray-400'}`} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Footer Org Badge */}
        <div className="border-t border-gray-100 p-4">
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
            <p className="text-xs font-bold text-gray-900">Distribuidora del Norte</p>
            <p className="text-[10px] text-gray-500">RFC: DNO850101HD9</p>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="pb-24 md:pl-64 md:pb-0">
        <main className="mx-auto min-h-screen max-w-7xl">{children}</main>
      </div>

      {/* Mobile Bottom Navigation Bar */}
      <div className="fixed bottom-0 left-0 right-0 z-40 flex h-16 items-center justify-between border-t border-gray-200 bg-white/95 px-3 backdrop-blur-md md:hidden">
        {PRIMARY_MOBILE_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setIsMobileMenuOpen(false)}
              className={`relative flex min-h-[48px] flex-1 flex-col items-center justify-center gap-1 rounded-xl p-1 text-center transition-all active:scale-95 ${
                isActive ? 'text-indigo-600 font-extrabold' : 'text-gray-500 hover:text-gray-900 font-medium'
              }`}
            >
              {isActive && (
                <span className="absolute top-0 h-1 w-8 rounded-full bg-indigo-600" />
              )}
              <Icon className={`h-5 w-5 ${isActive ? 'text-indigo-600' : 'text-gray-500'}`} />
              <span className="text-[10px] leading-none">{item.label}</span>
            </Link>
          );
        })}

        {/* More Menu Trigger */}
        <button
          onClick={() => setIsMobileMenuOpen(true)}
          className={`relative flex min-h-[48px] flex-1 flex-col items-center justify-center gap-1 rounded-xl p-1 text-center transition-all active:scale-95 ${
            isSecondaryActive ? 'text-indigo-600 font-extrabold' : 'text-gray-500 hover:text-gray-900 font-medium'
          }`}
          aria-label="Más opciones"
        >
          {isSecondaryActive && (
            <span className="absolute top-0 h-1 w-8 rounded-full bg-indigo-600" />
          )}
          <Menu className={`h-5 w-5 ${isSecondaryActive ? 'text-indigo-600' : 'text-gray-500'}`} />
          <span className="text-[10px] leading-none">Más</span>
        </button>
      </div>

      {/* Mobile Menu Drawer Overlay */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end bg-slate-900/60 backdrop-blur-xs md:hidden animate-in fade-in duration-200">
          <div
            className="fixed inset-0"
            onClick={() => setIsMobileMenuOpen(false)}
          />
          <div className="relative z-10 max-h-[85vh] w-full rounded-t-3xl border-t border-gray-200 bg-white p-5 shadow-2xl overflow-y-auto">
            <div className="flex items-center justify-between border-b border-gray-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 font-bold text-white shadow-xs">
                  <Building2 className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-extrabold text-gray-900">Menú Principal</h3>
                  <p className="text-xs text-gray-500">Distribuidora del Norte • MX</p>
                </div>
              </div>
              <button
                onClick={() => setIsMobileMenuOpen(false)}
                className="flex h-10 w-10 items-center justify-center rounded-xl text-gray-400 hover:bg-gray-100 hover:text-gray-700"
              >
                <X className="h-5 w-5" />
              </button>
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
                        ? 'bg-indigo-50 text-indigo-700 font-extrabold'
                        : 'text-gray-700 hover:bg-gray-100 font-semibold'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Icon className={`h-5 w-5 ${isActive ? 'text-indigo-600' : 'text-gray-400'}`} />
                      <span>{item.label}</span>
                    </div>
                    <ChevronRight className="h-4 w-4 text-gray-400" />
                  </Link>
                );
              })}
            </div>

            <div className="mt-6 border-t border-gray-100 pt-4 text-center">
              <p className="text-xs font-semibold text-gray-500">Business Helper v0.1.0 • SAT CFDI 4.0</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

