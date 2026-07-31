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
    owner: { label: 'Dueño / Founder', className: 'bg-indigo-100 text-indigo-800 border-indigo-200' },
    manager: { label: 'Gerente Operativo', className: 'bg-purple-100 text-purple-800 border-purple-200' },
    member: { label: 'Miembro', className: 'bg-slate-100 text-slate-800 border-slate-200' },
    accountant: { label: 'Contador Externo', className: 'bg-emerald-100 text-emerald-800 border-emerald-200' }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Users className="w-6 h-6 text-indigo-600" />
            Gestión de Equipo & Roles (RBAC)
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Asigna permisos para Dueño, Gerente, Miembro o Contador Externo.
          </p>
        </div>
        <button
          onClick={() => setShowInviteModal(true)}
          className="min-h-[48px] px-5 bg-indigo-600 text-white font-medium rounded-xl hover:bg-indigo-700 active:scale-95 transition-all flex items-center justify-center gap-2 text-base shadow-sm"
        >
          <UserPlus className="w-5 h-5" />
          Invitar Colaborador
        </button>
      </div>

      {/* Member List */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden divide-y divide-slate-100">
        {members.map((mem) => {
          const badge = roleBadges[mem.role] || roleBadges.member;
          return (
            <div
              key={mem.id}
              className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/80 transition-colors"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold text-lg border border-indigo-100 shrink-0">
                  {mem.name.substring(0, 2).toUpperCase()}
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-base">{mem.name}</h3>
                  <p className="text-sm text-slate-500 flex items-center gap-1.5 mt-0.5">
                    <Mail className="w-3.5 h-3.5 text-slate-400" />
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
                    className="min-h-[40px] px-3 bg-white border border-slate-200 rounded-lg text-sm text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  >
                    <option value="manager">Gerente</option>
                    <option value="member">Miembro</option>
                    <option value="accountant">Contador</option>
                  </select>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Invite Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-100">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-indigo-600" />
                Invitar Colaborador
              </h3>
              <button
                onClick={() => setShowInviteModal(false)}
                className="text-slate-400 hover:text-slate-600 p-2 rounded-lg"
              >
                ✕
              </button>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-sm font-medium">
                {error}
              </div>
            )}

            {successMsg && (
              <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl text-sm font-medium flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5" />
                Invitación enviada exitosamente
              </div>
            )}

            <form onSubmit={handleInvite} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Correo Electrónico *</label>
                <input
                  type="email"
                  required
                  placeholder="colaborador@empresa.com.mx"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full min-h-[48px] px-4 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-base"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Rol de Acceso *</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as UserRole)}
                  className="w-full min-h-[48px] px-4 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-base bg-white"
                >
                  <option value="manager">Gerente (Crear cotizaciones, cobranza, invitar miembros)</option>
                  <option value="member">Miembro (Crear y enviar cotizaciones)</option>
                  <option value="accountant">Contador (Ver finanzas, confirmar pagos, CFDI)</option>
                </select>
              </div>

              <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowInviteModal(false)}
                  className="min-h-[48px] px-5 text-slate-600 font-medium rounded-xl hover:bg-slate-100 transition-colors text-base"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={inviting}
                  className="min-h-[48px] px-6 bg-indigo-600 text-white font-medium rounded-xl hover:bg-indigo-700 active:scale-95 transition-all text-base shadow-sm disabled:opacity-50"
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
