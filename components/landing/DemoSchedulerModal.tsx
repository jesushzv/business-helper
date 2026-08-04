'use client';

import React, { useState } from 'react';
import { X, Calendar, CheckCircle2, Phone, Building2, Sparkles, ArrowRight } from 'lucide-react';

interface DemoSchedulerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function DemoSchedulerModal({ isOpen, onClose }: DemoSchedulerModalProps) {
  const [selectedSlot, setSelectedSlot] = useState<string>('Hoy 4:00 PM');
  const [businessName, setBusinessName] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const [isBooked, setIsBooked] = useState<boolean>(false);

  if (!isOpen) return null;

  const timeSlots = ['Hoy 4:00 PM', 'Mañana 11:00 AM', 'Mañana 3:00 PM', 'Jueves 10:00 AM'];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsBooked(true);
  };

  const handleReset = () => {
    setIsBooked(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
      <div className="relative w-full max-w-lg rounded-3xl bg-slate-900 border border-slate-800 p-6 sm:p-8 shadow-2xl space-y-6 text-left">
        {/* Close Button */}
        <button
          type="button"
          onClick={handleReset}
          className="absolute top-4 right-4 w-10 h-10 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center min-h-[48px] min-w-[48px]"
          aria-label="Cerrar modal"
        >
          <X className="w-5 h-5" />
        </button>

        {!isBooked ? (
          <>
            {/* Header */}
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold uppercase tracking-wider">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Demostración Personalizada</span>
              </div>
              <h3 className="text-2xl font-black text-white tracking-tight">
                Agendar Demostración en Vivo
              </h3>
              <p className="text-xs text-slate-400">
                Reserva 15 minutos con un especialista en Monterrey / Tijuana para ver cómo automatizar cotizaciones y cobranza en tu negocio.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Slot Selector */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-emerald-400" />
                  <span>Selecciona un Horario Disponible</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {timeSlots.map((slot) => (
                    <button
                      key={slot}
                      type="button"
                      onClick={() => setSelectedSlot(slot)}
                      className={`min-h-[48px] px-3 py-2.5 rounded-xl border text-xs font-bold text-center transition-all cursor-pointer ${
                        selectedSlot === slot
                          ? 'bg-emerald-500 text-slate-950 border-emerald-400 shadow-md shadow-emerald-500/20'
                          : 'bg-slate-950 text-slate-300 border-slate-800 hover:bg-slate-800'
                      }`}
                    >
                      {slot}
                    </button>
                  ))}
                </div>
              </div>

              {/* Business Name */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                  <Building2 className="w-4 h-4 text-indigo-400" />
                  <span>Nombre de tu Negocio</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Nombre de tu Negocio (ej. Distribuidora del Norte)"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  className="w-full min-h-[48px] px-4 py-3 rounded-xl bg-slate-950 border border-slate-800 text-white text-base focus:outline-none focus:border-emerald-500"
                />
              </div>

              {/* Phone / WhatsApp */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                  <Phone className="w-4 h-4 text-emerald-400" />
                  <span>Teléfono / WhatsApp</span>
                </label>
                <input
                  type="tel"
                  required
                  placeholder="Teléfono / WhatsApp (10 dígitos)"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full min-h-[48px] px-4 py-3 rounded-xl bg-slate-950 border border-slate-800 text-white text-base focus:outline-none focus:border-emerald-500"
                />
              </div>

              <button
                type="submit"
                className="w-full min-h-[48px] py-3.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs rounded-xl shadow-lg shadow-emerald-500/20 transition-all flex items-center justify-center gap-2 active:scale-95 cursor-pointer"
              >
                <span>Confirmar Cita</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          </>
        ) : (
          <div className="text-center py-6 space-y-4">
            <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <div className="space-y-1">
              <h4 className="text-2xl font-black text-white">¡Demostración Agendada!</h4>
              <p className="text-xs text-slate-300">
                Confirmación enviada para <span className="font-bold text-emerald-400">{selectedSlot}</span>. Nos pondremos en contacto contigo por WhatsApp en el número provisto.
              </p>
            </div>
            <button
              type="button"
              onClick={handleReset}
              className="min-h-[48px] px-6 py-3 bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs rounded-xl border border-slate-700 cursor-pointer"
            >
              Cerrar Ventana
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
