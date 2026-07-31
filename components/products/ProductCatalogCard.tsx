'use client';

import React, { useState } from 'react';
import { useProducts } from '@/lib/hooks/useProducts';
import { Package, Search, Plus, Trash2, Tag, DollarSign, CheckCircle2 } from 'lucide-react';

export function ProductCatalogCard() {
  const { products, searchTerm, setSearchTerm, addProduct, deleteProduct, error } = useProducts();
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [formSuccess, setFormSuccess] = useState<boolean>(false);

  // New product form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [unitPrice, setUnitPrice] = useState('');
  const [unit, setUnit] = useState('E48');
  const [satCode, setSatCode] = useState('84111506');
  const [stockQuantity, setStockQuantity] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormSuccess(false);

    const res = addProduct({
      name,
      description,
      unit_price: Number(unitPrice),
      unit,
      sat_product_code: satCode,
      stock_quantity: stockQuantity ? Number(stockQuantity) : null
    });

    if (res.success) {
      setFormSuccess(true);
      setName('');
      setDescription('');
      setUnitPrice('');
      setStockQuantity('');
      setTimeout(() => {
        setShowAddModal(false);
        setFormSuccess(false);
      }, 1000);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Package className="w-6 h-6 text-indigo-600" />
            Catálogo de Productos y Servicios (SAT)
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Pre-guarda conceptos con claves SAT E48 y 84111506 para cotizar en segundos.
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="min-h-[48px] px-5 bg-indigo-600 text-white font-medium rounded-xl hover:bg-indigo-700 active:scale-95 transition-all flex items-center justify-center gap-2 text-base shadow-sm"
        >
          <Plus className="w-5 h-5" />
          Nuevo Concepto
        </button>
      </div>

      {/* Search Input */}
      <div className="relative">
        <Search className="w-5 h-5 absolute left-4 top-3.5 text-slate-400" />
        <input
          type="text"
          placeholder="Buscar por concepto, clave SAT o descripción..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full min-h-[48px] pl-12 pr-4 bg-white border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all text-base"
        />
      </div>

      {/* Products Grid / Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {products.map((product) => (
          <div
            key={product.id}
            className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm hover:border-indigo-200 transition-all flex flex-col justify-between"
          >
            <div>
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-semibold text-slate-900 text-lg leading-snug">{product.name}</h3>
                <span className="shrink-0 font-bold text-slate-900 text-lg bg-emerald-50 text-emerald-700 px-3 py-1 rounded-lg border border-emerald-200">
                  ${Number(product.unit_price).toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN
                </span>
              </div>
              {product.description && (
                <p className="text-sm text-slate-600 mt-2 line-clamp-2">{product.description}</p>
              )}
              <div className="flex items-center gap-2 mt-4 flex-wrap">
                <span className="inline-flex items-center gap-1 text-xs font-semibold bg-indigo-50 text-indigo-700 px-2.5 py-1 rounded-md border border-indigo-100">
                  <Tag className="w-3.5 h-3.5" />
                  SAT Unidad: {product.unit || 'E48'}
                </span>
                <span className="inline-flex items-center gap-1 text-xs font-semibold bg-slate-100 text-slate-700 px-2.5 py-1 rounded-md border border-slate-200">
                  Clave: {product.sat_product_code || '84111506'}
                </span>
                {product.stock_quantity !== null && (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold bg-amber-50 text-amber-800 px-2.5 py-1 rounded-md border border-amber-200">
                    Stock: {product.stock_quantity} unidades
                  </span>
                )}
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => product.id && deleteProduct(product.id)}
                className="min-h-[44px] px-3 text-slate-400 hover:text-rose-600 text-sm font-medium flex items-center gap-1 rounded-lg hover:bg-rose-50 transition-colors"
                title="Eliminar concepto"
              >
                <Trash2 className="w-4 h-4" />
                Eliminar
              </button>
            </div>
          </div>
        ))}
      </div>

      {products.length === 0 && (
        <div className="bg-white p-12 rounded-2xl border border-dashed border-slate-300 text-center">
          <Package className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-slate-800">No hay productos en el catálogo</h3>
          <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">
            Agrega tu primer servicio o producto con clave SAT para agilizar tus cotizaciones.
          </p>
        </div>
      )}

      {/* Add Product Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-100 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Plus className="w-5 h-5 text-indigo-600" />
                Nuevo Concepto / Producto
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-slate-600 p-2 rounded-lg"
              >
                ✕
              </button>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-sm font-medium">
                {error}
              </div>
            )}

            {formSuccess && (
              <div className="mb-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl text-sm font-medium flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5" />
                Concepto guardado con éxito
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Nombre del Producto / Servicio *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej. Servicios de Consultoría"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full min-h-[48px] px-4 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-base"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Descripción</label>
                <textarea
                  rows={2}
                  placeholder="Detalles opcionales..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full p-3 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-base"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Precio Unitario (MXN) *</label>
                  <div className="relative">
                    <DollarSign className="w-5 h-5 absolute left-3 top-3.5 text-slate-400" />
                    <input
                      type="number"
                      step="0.01"
                      required
                      placeholder="0.00"
                      value={unitPrice}
                      onChange={(e) => setUnitPrice(e.target.value)}
                      className="w-full min-h-[48px] pl-10 pr-4 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-base"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Unidad SAT *</label>
                  <select
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                    className="w-full min-h-[48px] px-4 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-base bg-white"
                  >
                    <option value="E48">E48 - Unidad de Servicio</option>
                    <option value="H87">H87 - Pieza</option>
                    <option value="KGM">KGM - Kilogramo</option>
                    <option value="LTR">LTR - Litro</option>
                    <option value="MTR">MTR - Metro</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Clave Producto SAT *</label>
                <input
                  type="text"
                  required
                  placeholder="84111506"
                  value={satCode}
                  onChange={(e) => setSatCode(e.target.value)}
                  className="w-full min-h-[48px] px-4 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-base"
                />
                <p className="text-xs text-slate-400 mt-1">Por defecto: 84111506 (Servicios de facturación)</p>
              </div>

              <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="min-h-[48px] px-5 text-slate-600 font-medium rounded-xl hover:bg-slate-100 transition-colors text-base"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="min-h-[48px] px-6 bg-indigo-600 text-white font-medium rounded-xl hover:bg-indigo-700 active:scale-95 transition-all text-base shadow-sm"
                >
                  Guardar en Catálogo
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
