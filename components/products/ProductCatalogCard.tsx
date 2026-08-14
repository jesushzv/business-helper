'use client';

import React, { useState } from 'react';
import { useProducts } from '@/lib/hooks/useProducts';
import { useCurrentOrg } from '@/lib/hooks/useCurrentOrg';
import { hasCapability } from '@/lib/teamRBAC';
import { Package, Search, Plus, Trash2, Tag, DollarSign, CheckCircle2 } from 'lucide-react';
import { Modal } from '@/components/shared/Modal';

export function ProductCatalogCard() {
  const {
    products,
    allProducts,
    searchTerm,
    setSearchTerm,
    addProduct,
    deleteProduct,
    error,
    legacyLocalProducts,
    importLegacyProducts,
  } = useProducts();
  const { role } = useCurrentOrg();
  // Same tri-state as the clients and quotes pages (#64): a known role
  // without delete_records gets no delete control — the route now refuses it
  // with 403, and offering the two-tap confirm anyway sends the user into a
  // write they lack. Unknown (loading/failed read) keeps it; the server
  // enforces regardless.
  const canDelete = role === null || hasCapability(role, 'delete_records');
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [formSuccess, setFormSuccess] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  // Two-step delete: first tap arms the confirmation, second tap deletes.
  // The old one-tap delete removed a catalog row irreversibly (#98).
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [importing, setImporting] = useState<boolean>(false);

  // New product form state. The unit/clave defaults are the deliberately
  // permitted convenience pair (pinned in placeholderIdentifiers.test.ts).
  const DEFAULT_UNIT = 'E48';
  const DEFAULT_SAT_CODE = '84111506';
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [unitPrice, setUnitPrice] = useState('');
  const [unit, setUnit] = useState(DEFAULT_UNIT);
  const [satCode, setSatCode] = useState(DEFAULT_SAT_CODE);
  const [stockQuantity, setStockQuantity] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setFormSuccess(false);
    setSaving(true);

    try {
      const res = await addProduct({
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
        // The clave and unidad reset with the rest: left standing, the cement
        // clave pre-filled the next concept — already "filled", so nothing
        // prompted a change — and rode into that CFDI at stamping (#294).
        setUnit(DEFAULT_UNIT);
        setSatCode(DEFAULT_SAT_CODE);
        setTimeout(() => {
          setShowAddModal(false);
          setFormSuccess(false);
        }, 1000);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirmingDeleteId !== id) {
      setConfirmingDeleteId(id);
      return;
    }
    setConfirmingDeleteId(null);
    await deleteProduct(id);
  };

  const handleImportLegacy = async () => {
    setImporting(true);
    try {
      await importLegacyProducts();
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-6 text-white">
      {/* Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/90 p-6 rounded-2xl border border-slate-800 shadow-xl">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Package className="w-6 h-6 text-indigo-400" />
            Catálogo de Productos y Servicios (SAT)
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            Pre-guarda conceptos con claves SAT E48 y 84111506 para cotizar en segundos.
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="min-h-[48px] px-5 bg-emerald-500 hover:bg-emerald-400 active:scale-95 text-slate-950 font-bold rounded-xl transition-all flex items-center justify-center gap-2 text-base shadow-md shadow-emerald-950/50"
        >
          <Plus className="w-5 h-5" />
          Nuevo Concepto
        </button>
      </div>

      {/* Errors surface here, at card level — the modal-only display meant a
          failed delete had no surface to appear on (#98). */}
      {error && !showAddModal && (
        <div role="alert" className="p-4 bg-rose-950/80 border border-rose-500/30 text-rose-300 rounded-2xl text-sm font-medium">
          {error}
        </div>
      )}

      {/* Catalog rows saved when this UI was localStorage-only exist on this
          device alone; offer to upload them rather than silently discard. */}
      {legacyLocalProducts.length > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-amber-950/60 border border-amber-500/30 rounded-2xl">
          <p className="text-sm font-medium text-amber-200">
            Tienes {legacyLocalProducts.length}{' '}
            {legacyLocalProducts.length === 1 ? 'producto guardado' : 'productos guardados'} solo en
            este dispositivo. Súbelos a tu cuenta para usarlos desde cualquier equipo.
          </p>
          <button
            onClick={handleImportLegacy}
            disabled={importing}
            className="min-h-[48px] px-5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl transition-all active:scale-95 disabled:opacity-50 text-sm shrink-0"
          >
            {importing ? 'Subiendo...' : 'Subir a mi cuenta'}
          </button>
        </div>
      )}

      {/* Search Input */}
      <div className="relative">
        <Search className="w-5 h-5 absolute left-4 top-3.5 text-slate-500" />
        <input
          type="text"
          placeholder="Buscar por concepto, clave SAT o descripción..."
            aria-label="Buscar en el catálogo"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full min-h-[48px] pl-12 pr-4 bg-slate-900/90 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-all text-base"
        />
      </div>

      {/* Products Grid / Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {products.map((product) => (
          <div
            key={product.id}
            className="bg-slate-900/90 p-5 rounded-2xl border border-slate-800 shadow-xl hover:border-slate-700 transition-all flex flex-col justify-between"
          >
            <div>
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-semibold text-white text-lg leading-snug">{product.name}</h3>
                <span className="shrink-0 font-mono font-bold text-emerald-400 text-lg bg-emerald-950/80 px-3 py-1 rounded-lg border border-emerald-500/30">
                  ${Number(product.unit_price).toLocaleString('es-MX', { minimumFractionDigits: 2 })} MXN
                </span>
              </div>
              {product.description && (
                <p className="text-sm text-slate-300 mt-2 line-clamp-2">{product.description}</p>
              )}
              <div className="flex items-center gap-2 mt-4 flex-wrap">
                <span className="inline-flex items-center gap-1 text-xs font-semibold bg-indigo-950/80 text-indigo-300 px-2.5 py-1 rounded-md border border-indigo-500/30">
                  <Tag className="w-3.5 h-3.5" />
                  SAT Unidad: {product.unit || 'E48'}
                </span>
                <span className="inline-flex items-center gap-1 text-xs font-semibold bg-slate-800 text-slate-300 px-2.5 py-1 rounded-md border border-slate-700">
                  Clave: {product.sat_product_code || '84111506'}
                </span>
                {product.stock_quantity !== null && (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold bg-amber-950/80 text-amber-300 px-2.5 py-1 rounded-md border border-amber-500/30">
                    Stock: {product.stock_quantity} unidades
                  </span>
                )}
              </div>
            </div>
            {canDelete && (
            <div className="mt-4 pt-3 border-t border-slate-800 flex justify-end gap-2">
              {confirmingDeleteId === product.id && (
                <button
                  onClick={() => setConfirmingDeleteId(null)}
                  className="min-h-[48px] px-3 text-slate-300 text-sm font-medium rounded-lg border border-slate-700 hover:bg-slate-800 transition-colors"
                >
                  Cancelar
                </button>
              )}
              <button
                onClick={() => product.id && handleDelete(product.id)}
                className={`min-h-[48px] px-3 text-sm font-medium flex items-center gap-1 rounded-lg transition-colors ${
                  confirmingDeleteId === product.id
                    ? 'bg-rose-600 hover:bg-rose-500 text-white font-bold'
                    : 'text-slate-400 hover:text-rose-400 hover:bg-rose-950/30'
                }`}
                title="Eliminar concepto"
              >
                <Trash2 className="w-4 h-4" />
                {confirmingDeleteId === product.id ? '¿Eliminar definitivamente?' : 'Eliminar'}
              </button>
            </div>
            )}
          </div>
        ))}
      </div>

      {/* Two different facts (#98): an empty catalog invites a first product;
          a search with no matches must say that, not claim the catalog is empty. */}
      {products.length === 0 && allProducts.length > 0 && (
        <div className="bg-slate-900/90 p-12 rounded-2xl border border-dashed border-slate-800 text-center">
          <Search className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-white">Sin resultados para “{searchTerm}”</h3>
          <p className="text-sm text-slate-400 mt-1 max-w-md mx-auto">
            Revisa la búsqueda o límpiala para ver tu catálogo completo.
          </p>
        </div>
      )}

      {allProducts.length === 0 && !error && (
        <div className="bg-slate-900/90 p-12 rounded-2xl border border-dashed border-slate-800 text-center">
          <Package className="w-12 h-12 text-slate-600 mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-white">No hay productos en el catálogo</h3>
          <p className="text-sm text-slate-400 mt-1 max-w-md mx-auto">
            Agrega tu primer servicio o producto con clave SAT para agilizar tus cotizaciones.
          </p>
        </div>
      )}

      {/* Add Product Modal */}
      {showAddModal && (
        <Modal
          open
          onClose={() => setShowAddModal(false)}
          title="Nuevo Concepto / Producto"
          dismissOnBackdrop={false}
          panelClassName="p-6"
        >
          <div>
            <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-4 pr-12">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Plus className="w-5 h-5 text-indigo-400" />
                Nuevo Concepto / Producto
              </h3>
            </div>

            {error && (
              <div role="alert" className="mb-4 p-3 bg-rose-950/80 border border-rose-500/30 text-rose-400 rounded-xl text-sm font-medium">
                {error}
              </div>
            )}

            {formSuccess && (
              <div className="mb-4 p-3 bg-emerald-950/80 border border-emerald-500/30 text-emerald-300 rounded-xl text-sm font-medium flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                Concepto guardado con éxito
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="productcatalogcard-nombre-del-producto-servicio" className="block text-sm font-medium text-slate-300 mb-1">
                  Nombre del Producto / Servicio *
                </label>
                <input
                  id="productcatalogcard-nombre-del-producto-servicio"
                  type="text"
                  required
                  placeholder="Ej. Servicios de Consultoría"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full min-h-[48px] px-4 bg-slate-950/80 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 text-base"
                />
              </div>

              <div>
                <label htmlFor="productcatalogcard-descripcion" className="block text-sm font-medium text-slate-300 mb-1">Descripción</label>
                <textarea
                  id="productcatalogcard-descripcion"
                  rows={2}
                  placeholder="Detalles opcionales..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full p-3 bg-slate-950/80 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 text-base"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="productcatalogcard-precio-unitario-mxn" className="block text-sm font-medium text-slate-300 mb-1">Precio Unitario (MXN) *</label>
                  <div className="relative">
                    <DollarSign className="w-5 h-5 absolute left-3 top-3.5 text-slate-500" />
                    <input
                      id="productcatalogcard-precio-unitario-mxn"
                      type="number"
                      step="0.01"
                      required
                      placeholder="0.00"
                      value={unitPrice}
                      onChange={(e) => setUnitPrice(e.target.value)}
                      className="w-full min-h-[48px] pl-10 pr-4 bg-slate-950/80 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 text-base"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="productcatalogcard-unidad-sat" className="block text-sm font-medium text-slate-300 mb-1">Unidad SAT *</label>
                  <select
                    id="productcatalogcard-unidad-sat"
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                    className="w-full min-h-[48px] px-4 bg-slate-950/80 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-emerald-500 text-base"
                  >
                    <option value="E48" className="bg-slate-900 text-white">E48 - Unidad de Servicio</option>
                    <option value="H87" className="bg-slate-900 text-white">H87 - Pieza</option>
                    <option value="KGM" className="bg-slate-900 text-white">KGM - Kilogramo</option>
                    <option value="LTR" className="bg-slate-900 text-white">LTR - Litro</option>
                    <option value="MTR" className="bg-slate-900 text-white">MTR - Metro</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="productcatalogcard-clave-producto-sat" className="block text-sm font-medium text-slate-300 mb-1">Clave Producto SAT *</label>
                  <input
                    id="productcatalogcard-clave-producto-sat"
                    type="text"
                    required
                    placeholder="84111506"
                    value={satCode}
                    onChange={(e) => setSatCode(e.target.value)}
                    className="w-full min-h-[48px] px-4 bg-slate-950/80 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 text-base"
                  />
                  <p className="text-xs text-slate-400 mt-1">Por defecto: 84111506 (Servicios de facturación)</p>
                </div>

                <div>
                  <label htmlFor="productcatalogcard-existencias-opcional" className="block text-sm font-medium text-slate-300 mb-1">Existencias (opcional)</label>
                  <input
                    id="productcatalogcard-existencias-opcional"
                    type="number"
                    min={0}
                    placeholder="Vacío para servicios"
                    value={stockQuantity}
                    onChange={(e) => setStockQuantity(e.target.value)}
                    className="w-full min-h-[48px] px-4 bg-slate-950/80 border border-slate-800 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 text-base"
                  />
                  <p className="text-xs text-slate-400 mt-1">Solo para productos físicos con inventario</p>
                </div>
              </div>

              <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="min-h-[48px] px-5 text-slate-300 border border-slate-700 bg-slate-800 hover:bg-slate-700 font-medium rounded-xl transition-colors text-base"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="min-h-[48px] px-6 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl active:scale-95 transition-all text-base shadow-md disabled:opacity-50"
                >
                  {saving ? 'Guardando...' : 'Guardar en Catálogo'}
                </button>
              </div>
            </form>
          </div>
        </Modal>
      )}
    </div>
  );
}
