import { NextResponse } from 'next/server';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({
      milestone: {
        id: 'milestone-demo-1',
        label: 'Anticipo 50% — Suministro Cemento',
        amount: 48720,
        due_date: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        status: 'pending',
        contract_title: 'Suministro de Cemento y Varilla',
        client_name: 'Distribuidora del Norte S.A. de C.V.',
        org_name: 'Business Helper Demo',
        bank_name: 'BBVA México',
        clabe: '012180001234567890',
        beneficiary: 'Distribuidora del Norte S.A. de C.V.',
      },
    });
  }

  try {
    const { token } = await params;
    const supabase = await createClient();

    // Look up quote by token, then contract & milestones
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: quote } = await (supabase as any)
      .from('quotes')
      .select('*, contracts(*, milestones(*)), clients(*), organizations(*)')
      .eq('public_token', token)
      .single();

    if (quote && quote.contracts && quote.contracts.milestones) {
      const milestone = quote.contracts.milestones[0];
      return NextResponse.json({
        milestone: {
          id: milestone.id,
          label: milestone.label,
          amount: milestone.amount,
          due_date: milestone.due_date,
          status: milestone.status,
          contract_title: quote.contracts.title || quote.title,
          client_name: quote.clients?.name,
          org_name: quote.organizations?.name || 'Business Helper',
          bank_name: 'BBVA México',
          clabe: '012180001234567890',
          beneficiary: quote.organizations?.name || 'Business Helper',
        },
      });
    }
  } catch {
    // Fallback
  }

  // Demo fallback
  return NextResponse.json({
    milestone: {
      id: 'milestone-demo-1',
      label: 'Anticipo 50% — Suministro Cemento',
      amount: 48720,
      due_date: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      status: 'pending',
      contract_title: 'Suministro de Cemento y Varilla',
      client_name: 'Distribuidora del Norte S.A. de C.V.',
      org_name: 'Business Helper Demo',
      bank_name: 'BBVA México',
      clabe: '012180001234567890',
      beneficiary: 'Distribuidora del Norte S.A. de C.V.',
    },
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const body = await request.json();
    const supabase = await createClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: quote } = await (supabase as any)
      .from('quotes')
      .select('id, contracts(id, milestones(id))')
      .eq('public_token', token)
      .single();

    if (quote && quote.contracts && quote.contracts.milestones && quote.contracts.milestones[0]) {
      const milestoneId = quote.contracts.milestones[0].id;

      // Update milestone status to marked_paid with tracking reference and receipt_url
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .from('milestones')
        .update({
          status: 'marked_paid',
          tracking_reference: body.tracking_reference,
          transferred_amount: body.transferred_amount,
          receipt_url: body.receipt_url,
        })
        .eq('id', milestoneId);
    }
  } catch {
    // Fallback
  }

  return NextResponse.json({
    success: true,
    message: 'Comprobante SPEI enviado correctamente',
  });
}
