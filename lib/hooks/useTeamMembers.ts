'use client';

import { useState, useCallback, useEffect } from 'react';
import { validateInviteInput, UserRole } from '@/lib/teamRBAC';

/**
 * Team state.
 *
 * This hook used to hold three invented colleagues in `useState` and "invite"
 * by pushing a row into that array — the API was never called, so nothing was
 * stored and nobody was ever contacted. It now reads
 * `/api/organization/members` and returns what the server actually recorded,
 * including the invitation link the inviter has to deliver.
 */

export interface TeamMemberItem {
  id: string;
  user_id: string;
  name: string;
  email: string | null;
  role: UserRole;
  invitedAt: string;
  isCurrentUser?: boolean;
}

export interface PendingInvitation {
  id: string;
  email: string;
  role: UserRole;
  status: string;
  expiresAt: string;
  createdAt: string;
}

export interface InviteResult {
  success: boolean;
  error?: string;
  inviteUrl?: string;
  emailSent?: boolean;
}

export function useTeamMembers() {
  const [members, setMembers] = useState<TeamMemberItem[]>([]);
  const [invitations, setInvitations] = useState<PendingInvitation[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [inviting, setInviting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/organization/members');
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setMembers([]);
        setInvitations([]);
        setError(data?.error?.message || 'No se pudo cargar el equipo');
        return;
      }

      setMembers(data?.members || []);
      setInvitations(data?.invitations || []);
      setError(null);
    } catch {
      setMembers([]);
      setInvitations([]);
      setError('No se pudo cargar el equipo');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const inviteMember = useCallback(
    async (email: string, role: string): Promise<InviteResult> => {
      setError(null);

      const validation = validateInviteInput(email, role);
      if (!validation.isValid) {
        setError(validation.error || 'Entrada inválida');
        return { success: false, error: validation.error };
      }

      setInviting(true);
      try {
        const res = await fetch('/api/organization/members', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, role }),
        });
        const data = await res.json().catch(() => null);

        if (!res.ok) {
          const message = data?.error?.message || 'No se pudo crear la invitación';
          setError(message);
          return { success: false, error: message };
        }

        if (data?.invitation) {
          setInvitations((prev) => [
            {
              id: data.invitation.id,
              email: data.invitation.email,
              role: data.invitation.role,
              status: data.invitation.status,
              expiresAt: data.invitation.expiresAt,
              createdAt: data.invitation.createdAt,
            },
            ...prev.filter((i) => i.email !== data.invitation.email),
          ]);
        }

        return {
          success: true,
          inviteUrl: data?.inviteUrl,
          emailSent: Boolean(data?.emailSent),
        };
      } catch {
        const message = 'No se pudo crear la invitación';
        setError(message);
        return { success: false, error: message };
      } finally {
        setInviting(false);
      }
    },
    []
  );

  const updateRole = useCallback(
    async (memberId: string, newRole: UserRole): Promise<{ success: boolean; error?: string }> => {
      // Optimistic, then reconciled against the server response.
      const previous = members;
      setMembers((prev) => prev.map((m) => (m.id === memberId ? { ...m, role: newRole } : m)));

      try {
        const res = await fetch('/api/organization/members', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ memberId, role: newRole }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => null);
          setMembers(previous);
          const message = data?.error?.message || 'No se pudo actualizar el rol';
          setError(message);
          return { success: false, error: message };
        }

        return { success: true };
      } catch {
        setMembers(previous);
        setError('No se pudo actualizar el rol');
        return { success: false, error: 'No se pudo actualizar el rol' };
      }
    },
    [members]
  );

  return {
    members,
    invitations,
    loading,
    inviting,
    error,
    inviteMember,
    updateRole,
    refresh,
  };
}
