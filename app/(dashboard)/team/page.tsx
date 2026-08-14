import { DashboardPageShell } from '@/components/layout/DashboardPageShell';
import { TeamMembersCard } from '@/components/team/TeamMembersCard';

export const metadata = {
  title: 'Equipo & Permisos | Business Helper',
  description: 'Decide quién puede cotizar, cobrar y facturar en tu negocio.'
};

export default function TeamPage() {
  return (
    <DashboardPageShell
      headerTitle="Equipo y Permisos"
      title="Tu Equipo y sus Permisos"
      subtitle="Invita a tus colaboradores y asigna roles estructurados para Dueño, Gerente, Miembro o Contador."
    >
      <TeamMembersCard />
    </DashboardPageShell>
  );
}
