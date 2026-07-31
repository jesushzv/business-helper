import { ProductCatalogCard } from '@/components/products/ProductCatalogCard';

export const metadata = {
  title: 'Catálogo de Productos | Business Helper',
  description: 'Catálogo de productos y servicios con claves SAT para cotizaciones rápidas.'
};

export default function ProductsPage() {
  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
          Catálogo de Productos y Servicios
        </h1>
        <p className="text-sm sm:text-base text-slate-500 mt-1">
          Gestiona tus servicios pre-guardados con claves SAT de unidad (E48) y producto (84111506).
        </p>
      </div>

      <ProductCatalogCard />
    </div>
  );
}
