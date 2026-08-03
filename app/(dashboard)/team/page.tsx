import { TeamMembersCard } from '@/components/team/TeamMembersCard';

export const metadata = {
  title: 'Equipo & Permisos | Business Helper',
  description: 'Gestión de colaboradores y permisos basados en roles (RBAC).'
};

export default function TeamPage() {
  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
          Equipo de Trabajo & Permisos (RBAC)
        </h1>
        <p className="text-sm sm:text-base text-slate-400 mt-1">
          Invita a tus colaboradores y asigna roles estructurados para Dueño, Gerente, Miembro o Contador.
        </p>
      </div>

      <TeamMembersCard />
    </div>
  );
}
