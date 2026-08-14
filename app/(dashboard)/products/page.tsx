import { DashboardPageShell } from '@/components/layout/DashboardPageShell';
import { ProductCatalogCard } from '@/components/products/ProductCatalogCard';

export const metadata = {
  title: 'Catálogo de Productos | Business Helper',
  description: 'Catálogo de productos y servicios con claves SAT para cotizaciones rápidas.'
};

export default function ProductsPage() {
  return (
    // The Header bar deliberately carries no title here — it would repeat the
    // h1 right below it (flowPolish.test.ts, "printing its own title twice").
    <DashboardPageShell
      title="Catálogo de Productos y Servicios"
      subtitle="Gestiona tus servicios pre-guardados con claves SAT de unidad (E48) y producto (84111506)."
    >
      <ProductCatalogCard />
    </DashboardPageShell>
  );
}
