import { NextResponse } from 'next/server';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server';
import { verifyOTP, generateDigitalSeal } from '@/lib/otpSeal';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  if (!isSupabaseConfigured()) {
    const { token } = await params;
    return NextResponse.json({
      id: 'quote-public-1',
      organization_id: 'org-demo-1',
      client_id: 'client-demo-1',
      created_by: 'user-demo-1',
      title: 'Propuesta Comercial — Suministro de Materiales de Obra',
      line_items: [
        { description: 'Tonelada Cemento CPO 40', quantity: 5, unit_price: 3600, sat_code: '30111500', unit: 'TON' },
        { description: 'Tonelada Varilla 3/8"', quantity: 3, unit_price: 22000, sat_code: '30101800', unit: 'TON' },
      ],
      subtotal_amount: 84000,
      iva_amount: 13440,
      retencion_isr_amount: 0,
      retencion_iva_amount: 0,
      total_amount: 97440,
      currency: 'MXN',
      status: 'sent',
      valid_until: '2026-08-30',
      notes: 'Entrega directa en obra en 48 horas hábiles tras recibir anticipo del 50%.',
      public_token: token || 'demo-token',
      converted_contract_id: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }

  try {
    const { token } = await params;
    const supabase = await createClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: quote, error } = await (supabase as any)
      .from('quotes')
      .select('*, clients(*), organizations(*)')
      .eq('public_token', token)
      .single();

    if (error || !quote) {
      return NextResponse.json({ error: 'Quote not found' }, { status: 404 });
    }

    return NextResponse.json(quote);
  } catch {
    return NextResponse.json({ error: 'Failed to fetch public quote' }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const body = await request.json();
    const { otpCode, serverOtp, attempts } = body;

    const verification = verifyOTP(otpCode, serverOtp, attempts || 0);

    if (!verification.success) {
      return NextResponse.json(verification, { status: 400 });
    }

    const timestamp = new Date().toISOString();
    const seal = generateDigitalSeal({
      contractId: token,
      clientName: body.clientName || 'Cliente',
      totalAmount: body.totalAmount || 0,
      timestamp,
      otpCode,
    });

    const supabase = await createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from('quotes')
      .update({ status: 'accepted', updated_at: timestamp })
      .eq('public_token', token);

    return NextResponse.json({
      success: true,
      status: 'accepted',
      contract_hash: seal,
      accepted_at: timestamp,
    });
  } catch {
    return NextResponse.json({ error: 'Failed to sign public quote' }, { status: 500 });
  }
}
