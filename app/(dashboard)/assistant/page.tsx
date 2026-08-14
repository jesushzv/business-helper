import { DashboardPageShell } from '@/components/layout/DashboardPageShell';
import { AIAssistantCard } from '@/components/assistant/AIAssistantCard';

export const metadata = {
  title: 'Asistente de IA por WhatsApp | Business Helper',
  description: 'Asistente de Inteligencia Artificial para consultas de cobranza y finanzas en WhatsApp.'
};

export default function AssistantPage() {
  return (
    <DashboardPageShell
      headerTitle="Asistente de IA"
      title="Asistente de IA para tus Operaciones"
      subtitle="Consulta en lenguaje natural el estado de tus cobros y genera mensajes de WhatsApp en 1 clic."
    >
      <AIAssistantCard />
    </DashboardPageShell>
  );
}
