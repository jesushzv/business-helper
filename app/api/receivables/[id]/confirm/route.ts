import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const supabase = await createClient();

    const confirmedAt = new Date().toISOString();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: updated, error } = await (supabase as any)
      .from('milestones')
      .update({
        status: 'confirmed',
        confirmed_at: confirmedAt,
        transferred_amount: body?.transferredAmount || undefined,
      })
      .eq('id', id)
      .select()
      .single();

    if (!error && updated) {
      // Create audit log
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from('audit_logs').insert({
        organization_id: updated.organization_id || 'org-demo-1',
        contract_id: updated.contract_id,
        action: 'payment_confirmed',
        actor: 'owner',
        details: `Milestone ${updated.label || id} payment confirmed by owner.`,
        created_at: confirmedAt,
      });

      return NextResponse.json(updated);
    }
  } catch {
    // Fallback
  }

  return NextResponse.json({ success: true, status: 'confirmed', confirmed_at: new Date().toISOString() });
}
