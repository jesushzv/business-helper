import { Header } from '@/components/layout/Header';
import { AIAssistantCard } from '@/components/assistant/AIAssistantCard';

export const metadata = {
  title: 'Asistente de IA por WhatsApp | Business Helper',
  description: 'Asistente de Inteligencia Artificial para consultas de cobranza y finanzas en WhatsApp.'
};

export default function AssistantPage() {
  return (
    <>
      <Header title="Asistente de IA" />
      <div className="p-4 sm:p-6 md:p-8 max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Asistente de IA para tus Operaciones
          </h1>
          <p className="text-sm sm:text-base text-slate-400 mt-1">
            Consulta en lenguaje natural el estado de tus cobros y genera mensajes de WhatsApp en 1 clic.
          </p>
        </div>

        <AIAssistantCard />
      </div>
    </>
  );
}
