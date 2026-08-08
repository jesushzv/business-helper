import React from 'react';
import Link from 'next/link';
import { ShieldCheck, Mail, MessageSquare, Building2, ExternalLink } from 'lucide-react';
import { getAssetUrl } from '@/lib/url';
import { CONTACT_INFO } from '@/lib/trustData';

export function Footer() {
  return (
    <footer className="bg-slate-950 border-t border-slate-800 text-slate-400 text-xs py-16 relative overflow-hidden">
      {/* Top Subtle Background Gradient */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-px bg-gradient-to-r from-transparent via-emerald-500/40 to-transparent pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-10 pb-12 border-b border-slate-900">
          {/* Col 1 & 2: Brand & Overview */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element -- inline SVG logo; next/image does not optimize SVGs */}
              <img
                src={getAssetUrl('/logo-icon.svg')}
                alt="Business Helper"
                className="h-8 w-8 object-contain"
              />
              <span className="text-lg font-black text-white tracking-tight">
                Business<span className="text-emerald-400">Helper</span>.app
              </span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                México
              </span>
            </div>

            <p className="text-slate-400 text-xs leading-relaxed max-w-sm">
              La plataforma todo-en-uno para PyMEs en México. Cotizaciones profesionales por WhatsApp, conciliación SPEI y timbrado CFDI 4.0 automatizado.
            </p>

            <div className="pt-2 flex items-center gap-2 text-[11px] text-slate-300 font-medium">
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Garantía CSD SAT: Tus certificados (.cer/.key) jamás tocan nuestros servidores.</span>
            </div>

            <div className="text-[11px] text-slate-300 font-medium pt-1">
              🏢 Business Helper S.A.P.I. de C.V. • Tijuana, B.C., México / San Diego, CA
            </div>
          </div>

          {/* Col 3: Producto */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-white">Producto</h4>
            <ul className="space-y-2 text-slate-400">
              <li>
                <a href="#caracteristicas" className="hover:text-emerald-400 transition-colors">
                  Características
                </a>
              </li>
              <li>
                <a href="#precios" className="hover:text-emerald-400 transition-colors">
                  Precios & Planes
                </a>
              </li>
              <li>
                <Link href="/dashboard?demo=true" className="hover:text-emerald-400 transition-colors flex items-center gap-1">
                  <span>Sandbox Interactivo</span>
                  <ExternalLink className="w-3 h-3 text-indigo-400" />
                </Link>
              </li>
              <li>
                <a href="#testimonios" className="hover:text-emerald-400 transition-colors">
                  Casos por Industria
                </a>
              </li>
              <li>
                <a href="#garantia" className="hover:text-emerald-400 transition-colors">
                  Seguridad & SAT
                </a>
              </li>
            </ul>
          </div>

          {/* Col 4: Legal & Cumplimiento */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-white">Legal & SAT</h4>
            <ul className="space-y-2 text-slate-400">
              <li>
                <Link href="/privacy" className="hover:text-emerald-400 transition-colors">
                  Aviso de Privacidad (LFPDPPP)
                </Link>
              </li>
              <li>
                <Link href="/terms" className="hover:text-emerald-400 transition-colors">
                  Términos y Condiciones
                </Link>
              </li>
              <li>
                <span className="text-slate-300">PAC Certificado SAT (Facturapi)</span>
              </li>
              <li>
                <span className="text-slate-300">Validación Banxico SPEI</span>
              </li>
              <li>
                <span className="text-slate-300">Encriptación TLS 1.3 256-bit</span>
              </li>
            </ul>
          </div>

          {/* Col 5: Contacto & Soporte */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-white">Contacto & Soporte</h4>
            <ul className="space-y-2.5 text-slate-400">
              <li className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-emerald-400 shrink-0" />
                <a href={`mailto:${CONTACT_INFO.email}`} className="hover:text-white transition-colors">
                  {CONTACT_INFO.email}
                </a>
              </li>
              <li className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-emerald-400 shrink-0" />
                <a href={`mailto:${CONTACT_INFO.supportEmail}`} className="hover:text-white transition-colors">
                  {CONTACT_INFO.supportEmail}
                </a>
              </li>
              <li className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Horario: Lun - Vie (8am - 6pm PST)</span>
              </li>
              <li className="pt-1">
                <span className="inline-block px-2.5 py-1 rounded bg-slate-900 border border-slate-800 text-[10px] text-emerald-400 font-mono font-bold">
                  SLA Soporte &lt; 2 Horas
                </span>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Rights Bar */}
        <div className="pt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-[11px] text-slate-300">
          <span>© 2026 Business Helper S.A.P.I. de C.V. Todos los derechos reservados.</span>
          <div className="flex items-center gap-6">
            <Link href="/privacy" className="hover:text-white transition-colors">
              Privacidad
            </Link>
            <Link href="/terms" className="hover:text-white transition-colors">
              Términos
            </Link>
            <Link href="/login" className="hover:text-emerald-400 transition-colors font-semibold">
              Iniciar Sesión →
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
