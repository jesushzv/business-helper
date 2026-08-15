import { NextResponse } from 'next/server';
import { requireOrgAccess } from '@/lib/apiAuth';
import { dbWriteErrorResponse } from '@/lib/dbWriteError';
import { hasCapability } from '@/lib/teamRBAC';
import { apiError } from '@/lib/apiError';

/**
 * Deletes one catalog product. Added for #98 — the catalog UI offered a
 * delete that only ever touched localStorage, because no route implemented it.
 *
 * Scoped by organization_id explicitly (convention #3): a by-id delete without
 * the filter would let a guessed id remove another tenant's product, and with
 * it the row 404s instead of revealing the id exists.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireOrgAccess();
  if (!auth.ok) return auth.response;
  const { supabase, organizationId, role } = auth.ctx;

  if (!hasCapability(role, 'delete_records')) {
    return apiError(403, 'FORBIDDEN', 'Tu rol no permite eliminar conceptos del catálogo');
  }

  try {
    const { id } = await params;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('products')
      .delete()
      .eq('id', id)
      .eq('organization_id', organizationId)
      .select('id')
      .maybeSingle();

    if (error) {
      return dbWriteErrorResponse(error, 'el producto', 'DELETE /api/products/[id]', {
        verb: 'eliminar',
      });
    }

    if (!data) {
      return apiError(404, 'NOT_FOUND', 'Producto no encontrado');
    }

    return NextResponse.json({ deleted: true });
  } catch {
    return apiError(500, 'SERVER_ERROR', 'Error interno al eliminar producto');
  }
}
