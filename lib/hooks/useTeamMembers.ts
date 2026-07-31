'use client';

import { useState, useCallback } from 'react';
import { validateInviteInput, UserRole } from '@/lib/teamRBAC';

export interface TeamMemberItem {
  id: string;
  user_id: string;
  name: string;
  email: string;
  role: UserRole;
  invitedAt: string;
}

const INITIAL_TEAM: TeamMemberItem[] = [
  {
    id: 'mem-1',
    user_id: 'user-owner',
    name: 'Don Roberto',
    email: 'roberto@distribuidoradelnorte.com.mx',
    role: 'owner',
    invitedAt: '2026-08-03T10:00:00Z'
  },
  {
    id: 'mem-2',
    user_id: 'user-manager',
    name: 'Lic. Mariana',
    email: 'mariana@distribuidoradelnorte.com.mx',
    role: 'manager',
    invitedAt: '2026-08-10T14:30:00Z'
  },
  {
    id: 'mem-3',
    user_id: 'user-accountant',
    name: 'Contador Carlos Ruiz',
    email: 'cruiz@despachoruiz.com.mx',
    role: 'accountant',
    invitedAt: '2026-08-15T09:15:00Z'
  }
];

export function useTeamMembers() {
  const [members, setMembers] = useState<TeamMemberItem[]>(INITIAL_TEAM);
  const [inviting, setInviting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const inviteMember = useCallback((email: string, role: string) => {
    setError(null);
    const validation = validateInviteInput(email, role);
    if (!validation.isValid) {
      setError(validation.error || 'Entrada inválida');
      return { success: false, error: validation.error };
    }

    setInviting(true);
    const newMember: TeamMemberItem = {
      id: `mem-${Date.now()}`,
      user_id: `user-${Date.now()}`,
      name: email.split('@')[0],
      email: email.trim(),
      role: role.toLowerCase() as UserRole,
      invitedAt: new Date().toISOString()
    };

    setMembers((prev) => [newMember, ...prev]);
    setInviting(false);
    return { success: true, member: newMember };
  }, []);

  const updateRole = useCallback((memberId: string, newRole: UserRole) => {
    setMembers((prev) =>
      prev.map((m) => (m.id === memberId ? { ...m, role: newRole } : m))
    );
  }, []);

  return {
    members,
    inviting,
    error,
    inviteMember,
    updateRole
  };
}
