'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { validateProductCatalogItem, ProductCatalogItem } from '@/lib/products';

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

export function useProducts() {
  const [products, setProducts] = useState<ProductCatalogItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (stored) {
        setProducts(JSON.parse(stored));
      } else {
        setProducts(INITIAL_DEMO_PRODUCTS);
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(INITIAL_DEMO_PRODUCTS));
      }
    } catch {
      setProducts(INITIAL_DEMO_PRODUCTS);
    } finally {
      setLoading(false);
    }
  }, []);

  const saveToStorage = (updated: ProductCatalogItem[]) => {
    setProducts(updated);
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(updated));
    } catch (e) {
      console.error('Failed to persist products to localStorage', e);
    }
  };

  const addProduct = useCallback((productInput: Partial<ProductCatalogItem>) => {
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

    setProducts((prev) => {
      const updated = [item, ...prev];
      saveToStorage(updated);
      return updated;
    });

    return { success: true, product: item };
  }, []);

  const deleteProduct = useCallback((id: string) => {
    setProducts((prev) => {
      const updated = prev.filter((p) => p.id !== id);
      saveToStorage(updated);
      return updated;
    });
  }, []);

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
    deleteProduct
  };
}
