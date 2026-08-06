import { NextResponse } from 'next/server';
import { requireOrgAccess } from '@/lib/apiAuth';

/**
 * Confirms that a milestone's payment was received.
 *
 * This marks money as collected, and it ran with no authentication, no tenant
 * scoping, and a `{success: true, status: 'confirmed'}` fallback on every
 * failure path — so an unauthenticated caller could confirm any tenant's
 * milestone by id, and a caller whose write failed was told it had worked.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireOrgAccess();
  if (!auth.ok) return auth.response;
  const { supabase, organizationId, userId } = auth.ctx;

  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));

    const confirmedAt = new Date().toISOString();

    const updates: Record<string, unknown> = {
      status: 'confirmed',
      confirmed_at: confirmedAt,
    };

    // Only set the amount when one was actually supplied and is sane.
    if (body?.transferredAmount !== undefined) {
      const amount = Number(body.transferredAmount);
      if (!Number.isFinite(amount) || amount <= 0) {
        return NextResponse.json(
          { error: { code: 'INVALID_INPUT', message: 'El monto transferido no es válido' } },
          { status: 400 }
        );
      }
      updates.transferred_amount = amount;
    }

    const { data: updated, error } = await supabase
      .from('milestones')
      .update(updates)
      .eq('id', id)
      .eq('organization_id', organizationId)
      .select()
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: 'No se pudo confirmar el pago' }, { status: 500 });
    }

    if (!updated) {
      return NextResponse.json({ error: 'Cobro no encontrado' }, { status: 404 });
    }

    // Audit against the session's organization, not a value read back off the
    // updated row with an 'org-demo-1' fallback.
    const { error: auditError } = await supabase.from('audit_logs').insert({
      organization_id: organizationId,
      contract_id: updated.contract_id,
      action: 'payment_confirmed',
      actor: userId,
      details: `Milestone ${updated.label || id} payment confirmed.`,
      created_at: confirmedAt,
    });

    // The confirmation itself succeeded; log the audit gap rather than
    // pretending the whole operation failed.
    if (auditError) {
      console.error('Failed to write payment confirmation audit log', auditError);
    }

    return NextResponse.json(updated);
  } catch {
    return NextResponse.json({ error: 'No se pudo confirmar el pago' }, { status: 500 });
  }
}
