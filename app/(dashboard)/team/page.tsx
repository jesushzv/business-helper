import { Header } from '@/components/layout/Header';
import { TeamMembersCard } from '@/components/team/TeamMembersCard';

export const metadata = {
  title: 'Equipo & Permisos | Business Helper',
  description: 'Decide quién puede cotizar, cobrar y facturar en tu negocio.'
};

export default function TeamPage() {
  return (
    <>
      <Header title="Equipo y Permisos" />
      <div className="p-4 sm:p-6 md:p-8 max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Tu Equipo y sus Permisos
          </h1>
          <p className="text-sm sm:text-base text-slate-400 mt-1">
            Invita a tus colaboradores y asigna roles estructurados para Dueño, Gerente, Miembro o Contador.
          </p>
        </div>

        <TeamMembersCard />
      </div>
    </>
  );
}
