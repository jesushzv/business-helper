import { Metadata } from 'next';
import { HelpCenterView } from '@/components/help/HelpCenterView';

export const metadata: Metadata = {
  title: 'Centro de Ayuda & FAQ | Business Helper',
  description: 'Preguntas frecuentes y soporte técnico sobre cotizaciones, cobranza SPEI y facturación SAT CFDI 4.0',
};

export default function HelpPage() {
  return <HelpCenterView />;
}
