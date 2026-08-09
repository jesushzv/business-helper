'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { validateProductCatalogItem, ProductCatalogItem } from '@/lib/products';
import { isClientDemoMode } from '@/lib/clientDemoMode';

// Demo-mode fixtures. Reachable ONLY behind isClientDemoMode(): before #98
// they seeded every visitor's localStorage — including real tenants', whose
// catalog then lived on one phone's browser profile and never reached the
// server, while /api/products sat with zero callers.
const INITIAL_DEMO_PRODUCTS: ProductCatalogItem[] = [
  {
    id: 'prod-1',
    name: 'Servicios de Consultoría Operativa',
    description: 'Asesoría y optimización de procesos de negocio para Pymes',
    unit_price: 3500,
    unit: 'E48',
    sat_product_code: '84111506',
    stock_quantity: null
  },
  {
    id: 'prod-2',
    name: 'Mantenimiento Preventivo de Equipo',
    description: 'Revisión técnica y servicio periódico industrial',
    unit_price: 1800,
    unit: 'E48',
    sat_product_code: '73152100',
    stock_quantity: null
  },
  {
    id: 'prod-3',
    name: 'Suministro de Cemento Tolteca 50kg',
    description: 'Saco de cemento gris de alta resistencia',
    unit_price: 240,
    unit: 'H87',
    sat_product_code: '30111601',
    stock_quantity: 150
  },
  {
    id: 'prod-4',
    name: 'Desarrollo de Sitio Web Empresarial',
    description: 'Página web autoadministrable con integración WhatsApp',
    unit_price: 12500,
    unit: 'E48',
    sat_product_code: '83111800',
    stock_quantity: null
  }
];

const LOCAL_STORAGE_KEY = 'business_helper_products_v1';

type MutationResult =
  | { success: true; product?: ProductCatalogItem }
  | { success: false; error: string };

/** Legacy catalog rows a real tenant saved when the hook was localStorage-only. */
function readLegacyLocalProducts(): ProductCatalogItem[] {
  try {
    const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
    const parsed = stored ? JSON.parse(stored) : null;
    if (!Array.isArray(parsed)) return [];
    // The demo seed also lived under this key; importing it would hand a real
    // tenant four invented products, so the fixtures are filtered out by id.
    const demoIds = new Set(INITIAL_DEMO_PRODUCTS.map((p) => p.id));
    return parsed.filter(
      (p): p is ProductCatalogItem =>
        Boolean(p && typeof p === 'object' && typeof p.name === 'string' && !demoIds.has(p.id))
    );
  } catch {
    return [];
  }
}

export function useProducts() {
  const demo = isClientDemoMode();
  const [products, setProducts] = useState<ProductCatalogItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  // Rows that exist only in this browser from the localStorage-only era —
  // surfaced so the tenant can import them instead of losing them silently.
  const [legacyLocalProducts, setLegacyLocalProducts] = useState<ProductCatalogItem[]>([]);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    setError(null);

    if (!demo) {
      try {
        const res = await fetch('/api/products');
        const data = await res.json().catch(() => null);
        if (res.ok && Array.isArray(data?.products)) {
          setProducts(data.products);
          setLegacyLocalProducts(data.products.length === 0 ? readLegacyLocalProducts() : []);
        } else {
          setError(data?.error?.message || 'No se pudieron cargar los productos.');
        }
      } catch {
        setError('No se pudieron cargar los productos. Revisa tu conexión.');
      } finally {
        setLoading(false);
      }
      return;
    }

    // Demo deployment: localStorage keeps the sandbox interactive.
    try {
      const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
      const parsed = stored ? JSON.parse(stored) : null;
      if (Array.isArray(parsed) && parsed.length > 0) {
        setProducts(parsed);
      } else {
        setProducts(INITIAL_DEMO_PRODUCTS);
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(INITIAL_DEMO_PRODUCTS));
      }
    } catch {
      setProducts(INITIAL_DEMO_PRODUCTS);
    } finally {
      setLoading(false);
    }
  }, [demo]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  // Persists the demo sandbox only; a real tenant's catalog lives on the server.
  const saveToStorage = (updated: ProductCatalogItem[]) => {
    setProducts(updated);
    if (!isClientDemoMode()) return;
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
    } catch (e) {
      console.error('Failed to persist products to localStorage', e);
    }
  };

  const addProduct = useCallback(
    async (productInput: Partial<ProductCatalogItem>): Promise<MutationResult> => {
      setError(null);
      const item: ProductCatalogItem = {
        id: `prod-${Date.now()}`,
        name: productInput.name || '',
        description: productInput.description || '',
        unit_price: Number(productInput.unit_price) || 0,
        unit: productInput.unit || 'E48',
        sat_product_code: productInput.sat_product_code || '84111506',
        stock_quantity: productInput.stock_quantity ?? null
      };

      const validation = validateProductCatalogItem(item);
      if (!validation.isValid) {
        const msg = validation.errors.join(', ');
        setError(msg);
        return { success: false, error: msg };
      }

      if (!isClientDemoMode()) {
        try {
          const res = await fetch('/api/products', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: item.name,
              description: item.description,
              unit_price: item.unit_price,
              unit: item.unit,
              sat_product_code: item.sat_product_code,
              stock_quantity: item.stock_quantity
            })
          });
          const data = await res.json().catch(() => null);
          if (!res.ok || !data?.product?.id) {
            const msg = data?.error?.message || 'No se pudo guardar el producto.';
            setError(msg);
            return { success: false, error: msg };
          }
          // The server row is the truth — never the locally minted one.
          setProducts((prev) => [data.product, ...prev]);
          setLegacyLocalProducts([]);
          return { success: true, product: data.product };
        } catch {
          const msg = 'No se pudo guardar el producto. Revisa tu conexión.';
          setError(msg);
          return { success: false, error: msg };
        }
      }

      setProducts((prev) => {
        const updated = [item, ...prev];
        saveToStorage(updated);
        return updated;
      });
      return { success: true, product: item };
    },
    []
  );

  const deleteProduct = useCallback(async (id: string): Promise<MutationResult> => {
    setError(null);

    if (!isClientDemoMode()) {
      try {
        const res = await fetch(`/api/products/${id}`, { method: 'DELETE' });
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          const msg = data?.error?.message || 'No se pudo eliminar el producto.';
          setError(msg);
          return { success: false, error: msg };
        }
      } catch {
        const msg = 'No se pudo eliminar el producto. Revisa tu conexión.';
        setError(msg);
        return { success: false, error: msg };
      }
    }

    setProducts((prev) => {
      const updated = prev.filter((p) => p.id !== id);
      saveToStorage(updated);
      return updated;
    });
    return { success: true };
  }, []);

  /**
   * Uploads the rows this browser saved during the localStorage-only era.
   * Each row goes through the same POST as a fresh add; the local copy is
   * cleared only after every upload landed, so a partial failure loses nothing.
   */
  const importLegacyProducts = useCallback(async (): Promise<MutationResult> => {
    const pending = readLegacyLocalProducts();
    if (pending.length === 0) {
      setLegacyLocalProducts([]);
      return { success: true };
    }

    for (const item of pending) {
      const result = await addProduct(item);
      if (!result.success) return result;
    }

    try {
      localStorage.removeItem(LOCAL_STORAGE_KEY);
    } catch {
      // The server has the rows; a stale local copy is cosmetic now.
    }
    setLegacyLocalProducts([]);
    return { success: true };
  }, [addProduct]);

  const filteredProducts = useMemo(() => {
    if (!searchTerm.trim()) return products;
    const term = searchTerm.toLowerCase();
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(term) ||
        (p.description && p.description.toLowerCase().includes(term)) ||
        (p.sat_product_code && p.sat_product_code.includes(term))
    );
  }, [products, searchTerm]);

  return {
    products: filteredProducts,
    allProducts: products,
    loading,
    error,
    searchTerm,
    setSearchTerm,
    addProduct,
    deleteProduct,
    legacyLocalProducts,
    importLegacyProducts,
    refresh: fetchProducts
  };
}
