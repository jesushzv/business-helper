'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { hasCapability, validateInviteInput, UserRole } from '@/lib/teamRBAC';

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
      setError(null);

      // No optimistic write. The row used to change in the list before the
      // request went out and snapped back on the refusal, so an accountant saw
      // a permission they do not have appear and then vanish — and on success
      // the *server's* role was never applied, so a value the route normalized
      // would not have been reflected (the LESSONS optimistic-mutation shape).
      try {
        const res = await fetch('/api/organization/members', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ memberId, role: newRole }),
        });

        const data = await res.json().catch(() => null);

        if (!res.ok) {
          const message = data?.error?.message || 'No se pudo actualizar el rol';
          setError(message);
          return { success: false, error: message };
        }

        // What the server recorded, which is what it echoes back.
        const appliedRole = (data?.role as UserRole) || newRole;
        setMembers((prev) =>
          prev.map((m) => (m.id === memberId ? { ...m, role: appliedRole } : m))
        );

        return { success: true };
      } catch {
        setError('No se pudo actualizar el rol');
        return { success: false, error: 'No se pudo actualizar el rol' };
      }
    },
    []
  );

  /**
   * The caller's own role, read off the members payload — which already carries
   * `isCurrentUser` and `role` for exactly this.
   *
   * `null` means **unknown**: the list has not loaded, the read failed, or the
   * caller is not among the rows. Unknown is not "no" (#64) — it leaves the
   * controls alone and lets the server refuse, which it does either way. Only a
   * role the payload actually stated withholds them.
   */
  const currentUserRole = useMemo<UserRole | null>(() => {
    const me = members.find((m) => m.isCurrentUser);
    return me?.role ?? null;
  }, [members]);

  const canManageTeam = useMemo<boolean | null>(() => {
    if (!currentUserRole) return null;
    return hasCapability(currentUserRole, 'invite_members');
  }, [currentUserRole]);

  return {
    members,
    invitations,
    loading,
    inviting,
    error,
    currentUserRole,
    canManageTeam,
    inviteMember,
    updateRole,
    refresh,
  };
}
