import { Header } from '@/components/layout/Header';
import { InvoiceManagerCard } from '@/components/invoices/InvoiceManagerCard';

export const metadata = {
  title: 'Facturación & Contador | Business Helper',
  description: 'Timbrado SAT CFDI 4.0 y Paquete de Exportación para Contador (ZIP/CSV).'
};

export default function InvoicesPage() {
  return (
    <>
      <Header title="Facturación SAT CFDI 4.0" />
      <div className="p-4 sm:p-6 md:p-8 max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Facturación SAT & Exportación Contador
          </h1>
          <p className="text-sm sm:text-base text-slate-400 mt-1">
            Emite facturas CFDI 4.0 en 1 clic y descarga el paquete mensual completo para tu contador.
          </p>
        </div>

        <InvoiceManagerCard />
      </div>
    </>
  );
}
