import { DashboardPageShell } from '@/components/layout/DashboardPageShell';
import { InvoiceManagerCard } from '@/components/invoices/InvoiceManagerCard';

export const metadata = {
  title: 'Facturación & Contador | Business Helper',
  description: 'Timbrado SAT CFDI 4.0 con tu PAC y Paquete de Exportación para Contador (ZIP/CSV).'
};

export default function InvoicesPage() {
  return (
    <DashboardPageShell
      headerTitle="Facturación SAT CFDI 4.0"
      title="Facturación SAT & Exportación Contador"
      subtitle="Timbra facturas CFDI 4.0 con el PAC que conectes y descarga el paquete mensual completo para tu contador."
    >
      <InvoiceManagerCard />
    </DashboardPageShell>
  );
}
