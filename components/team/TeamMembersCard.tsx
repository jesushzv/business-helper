'use client';

import React, { useState } from 'react';
import { useTeamMembers } from '@/lib/hooks/useTeamMembers';
import { UserRole } from '@/lib/teamRBAC';
import { Users, UserPlus, Shield, Mail, Link2, Clock, Copy, Check } from 'lucide-react';
import { Modal } from '@/components/shared/Modal';

/**
 * The invite modal used to close on a green "Invitación enviada exitosamente"
 * banner. Nothing had been sent: no mail provider is configured, and the
 * endpoint wrote nothing. It now shows the invitation link the server created
 * and says plainly that the inviter has to deliver it.
 */
export function TeamMembersCard() {
  const { members, invitations, loading, inviting, error, inviteMember, updateRole } = useTeamMembers();
  const [showInviteModal, setShowInviteModal] = useState<boolean>(false);
  const [email, setEmail] = useState<string>('');
  const [role, setRole] = useState<UserRole>('member');
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviteUrl(null);
    setCopied(false);

    const res = await inviteMember(email, role);
    if (res.success && res.inviteUrl) {
      setInviteUrl(res.inviteUrl);
      setEmail('');
    }
  };

  const closeModal = () => {
    setShowInviteModal(false);
    setInviteUrl(null);
    setCopied(false);
  };

  const copyInviteUrl = async () => {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
    } catch {
      setCopied(false);
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

      {error && (
        <div className="p-4 bg-rose-950/80 border border-rose-500/30 text-rose-300 rounded-2xl text-sm font-medium">
          {error}
        </div>
      )}

      {/* Member List */}
      <div className="bg-slate-900/90 rounded-2xl border border-slate-800 shadow-xl overflow-hidden divide-y divide-slate-800/80">
        {loading && (
          <div className="p-6 text-sm text-slate-400">Cargando equipo…</div>
        )}

        {!loading && members.length === 0 && !error && (
          <div className="p-6 text-sm text-slate-400">
            Todavía no hay colaboradores en esta organización.
          </div>
        )}

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
                  <h3 className="font-bold text-white text-base">
                    {mem.name}
                    {mem.isCurrentUser && (
                      <span className="ml-2 text-xs font-semibold text-slate-400">(tú)</span>
                    )}
                  </h3>
                  <p className="text-sm text-slate-400 flex items-center gap-1.5 mt-0.5">
                    <Mail className="w-3.5 h-3.5 text-slate-500" />
                    {mem.email || 'Correo no disponible'}
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

      {/* Pending invitations — real rows, not local state */}
      {invitations.length > 0 && (
        <div className="bg-slate-900/90 rounded-2xl border border-slate-800 shadow-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-800 flex items-center gap-2">
            <Clock className="w-4 h-4 text-amber-400" />
            <h3 className="font-bold text-white text-sm">
              Invitaciones pendientes ({invitations.length})
            </h3>
          </div>
          <div className="divide-y divide-slate-800/80">
            {invitations.map((invite) => (
              <div key={invite.id} className="px-5 py-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-white">{invite.email}</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {roleBadges[invite.role]?.label || invite.role} · vence el{' '}
                    {new Date(invite.expiresAt).toLocaleDateString('es-MX')}
                  </p>
                </div>
                <span className="text-xs font-bold px-3 py-1 rounded-full border bg-amber-950/60 text-amber-300 border-amber-500/30">
                  Sin aceptar
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Invite Modal */}
      {showInviteModal && (
        <Modal
          open
          onClose={closeModal}
          title="Invitar Colaborador"
          maxWidth="max-w-md"
          dismissOnBackdrop={false}
          panelClassName="p-6"
        >
          <div>
            <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-4 pr-12">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-indigo-400" />
                Invitar Colaborador
              </h3>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-rose-950/80 border border-rose-500/30 text-rose-400 rounded-xl text-sm font-medium">
                {error}
              </div>
            )}

            {inviteUrl ? (
              <div className="space-y-4">
                <div className="p-3 bg-emerald-950/80 border border-emerald-500/30 text-emerald-300 rounded-xl text-sm font-medium flex items-start gap-2">
                  <Link2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                  <span>
                    Invitación creada. Todavía no se envía ningún correo automáticamente:
                    comparte este enlace por WhatsApp o correo para que tu colaborador
                    entre al equipo.
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    readOnly
                    value={inviteUrl}
                    className="w-full min-h-[48px] px-4 bg-slate-950/80 border border-slate-800 rounded-xl text-white text-sm font-mono"
                  />
                  <button
                    type="button"
                    onClick={copyInviteUrl}
                    className="min-h-[48px] px-4 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl flex items-center gap-2 shrink-0"
                  >
                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    {copied ? 'Copiado' : 'Copiar'}
                  </button>
                </div>

                <p className="text-xs text-slate-400">
                  El enlace vence en 7 días y solo funciona para {' '}
                  la dirección de correo invitada.
                </p>

                <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={closeModal}
                    className="min-h-[48px] px-5 text-slate-300 bg-slate-800 border border-slate-700 hover:bg-slate-700 font-medium rounded-xl transition-colors text-base"
                  >
                    Listo
                  </button>
                </div>
              </div>
            ) : (
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
                    onClick={closeModal}
                    className="min-h-[48px] px-5 text-slate-300 bg-slate-800 border border-slate-700 hover:bg-slate-700 font-medium rounded-xl transition-colors text-base"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={inviting}
                    className="min-h-[48px] px-6 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl active:scale-95 transition-all text-base shadow-md disabled:opacity-50"
                  >
                    {inviting ? 'Creando…' : 'Crear Invitación'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
