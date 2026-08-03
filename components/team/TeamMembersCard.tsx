'use client';

import React, { useState } from 'react';
import { useTeamMembers } from '@/lib/hooks/useTeamMembers';
import { UserRole } from '@/lib/teamRBAC';
import { Users, UserPlus, Shield, CheckCircle2, Mail } from 'lucide-react';

export function TeamMembersCard() {
  const { members, inviting, error, inviteMember, updateRole } = useTeamMembers();
  const [showInviteModal, setShowInviteModal] = useState<boolean>(false);
  const [email, setEmail] = useState<string>('');
  const [role, setRole] = useState<UserRole>('member');
  const [successMsg, setSuccessMsg] = useState<boolean>(false);

  const handleInvite = (e: React.FormEvent) => {
    e.preventDefault();
    setSuccessMsg(false);

    const res = inviteMember(email, role);
    if (res.success) {
      setSuccessMsg(true);
      setEmail('');
      setTimeout(() => {
        setShowInviteModal(false);
        setSuccessMsg(false);
      }, 1000);
    }
  };

  const roleBadges: Record<UserRole, { label: string; className: string }> = {
    owner: { label: 'Dueño / Founder', className: 'bg-indigo-950/80 text-indigo-300 border-indigo-500/30' },
    manager: { label: 'Gerente Operativo', className: 'bg-purple-950/80 text-purple-300 border-purple-500/30' },
    member: { label: 'Miembro', className: 'bg-slate-800 text-slate-300 border-slate-700' },
    accountant: { label: 'Contador Externo', className: 'bg-emerald-950/80 text-emerald-400 border-emerald-500/30' }
  };

  return (
    <div className="space-y-6 text-white">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-xl">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Users className="w-6 h-6 text-indigo-400" />
            Gestión de Equipo & Roles (RBAC)
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Asigna permisos para Dueño, Gerente, Miembro o Contador Externo.
          </p>
        </div>
        <button
          onClick={() => setShowInviteModal(true)}
          className="min-h-[48px] px-5 bg-emerald-500 hover:bg-emerald-400 active:scale-95 text-slate-950 font-bold rounded-xl transition-all flex items-center justify-center gap-2 text-base shadow-md shadow-emerald-950/50"
        >
          <UserPlus className="w-5 h-5" />
          Invitar Colaborador
        </button>
      </div>

      {/* Member List */}
      <div className="bg-slate-900/90 rounded-2xl border border-slate-800 shadow-xl overflow-hidden divide-y divide-slate-800/80">
        {members.map((mem) => {
          const badge = roleBadges[mem.role] || roleBadges.member;
          return (
            <div
              key={mem.id}
              className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-800/50 transition-colors"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-indigo-950/80 text-indigo-400 flex items-center justify-center font-bold text-lg border border-indigo-500/30 shrink-0 font-mono">
                  {mem.name.substring(0, 2).toUpperCase()}
                </div>
                <div>
                  <h3 className="font-bold text-white text-base">{mem.name}</h3>
                  <p className="text-sm text-slate-400 flex items-center gap-1.5 mt-0.5">
                    <Mail className="w-3.5 h-3.5 text-slate-500" />
                    {mem.email}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 justify-between sm:justify-end">
                <span className={`inline-flex items-center gap-1 text-xs font-bold px-3 py-1 rounded-full border ${badge.className}`}>
                  <Shield className="w-3.5 h-3.5" />
                  {badge.label}
                </span>

                {mem.role !== 'owner' && (
                  <select
                    value={mem.role}
                    onChange={(e) => updateRole(mem.id, e.target.value as UserRole)}
                    className="min-h-[40px] px-3 bg-slate-950/80 border border-slate-800 rounded-lg text-sm text-white font-medium focus:outline-none focus:border-emerald-500"
                  >
                    <option value="manager" className="bg-slate-900 text-white">Gerente</option>
                    <option value="member" className="bg-slate-900 text-white">Miembro</option>
                    <option value="accountant" className="bg-slate-900 text-white">Contador</option>
                  </select>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Invite Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-800 text-white">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-4">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-indigo-400" />
                Invitar Colaborador
              </h3>
              <button
                onClick={() => setShowInviteModal(false)}
                className="text-slate-400 hover:text-white p-2 rounded-lg"
              >
                ✕
              </button>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-rose-950/80 border border-rose-500/30 text-rose-400 rounded-xl text-sm font-medium">
                {error}
              </div>
            )}

            {successMsg && (
              <div className="mb-4 p-3 bg-emerald-950/80 border border-emerald-500/30 text-emerald-300 rounded-xl text-sm font-medium flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                Invitación enviada exitosamente
              </div>
            )}

            <form onSubmit={handleInvite} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Correo Electrónico *</label>
                <input
                  type="email"
                  required
                  placeholder="colaborador@empresa.com.mx"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full min-h-[48px] px-4 bg-slate-950/80 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 text-base"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Rol de Acceso *</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as UserRole)}
                  className="w-full min-h-[48px] px-4 bg-slate-950/80 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-emerald-500 text-base"
                >
                  <option value="manager" className="bg-slate-900 text-white">Gerente (Crear cotizaciones, cobranza, invitar miembros)</option>
                  <option value="member" className="bg-slate-900 text-white">Miembro (Crear y enviar cotizaciones)</option>
                  <option value="accountant" className="bg-slate-900 text-white">Contador (Ver finanzas, confirmar pagos, CFDI)</option>
                </select>
              </div>

              <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowInviteModal(false)}
                  className="min-h-[48px] px-5 text-slate-300 bg-slate-800 border border-slate-700 hover:bg-slate-700 font-medium rounded-xl transition-colors text-base"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={inviting}
                  className="min-h-[48px] px-6 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl active:scale-95 transition-all text-base shadow-md disabled:opacity-50"
                >
                  {inviting ? 'Enviando...' : 'Enviar Invitación'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
