import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { verifyOTP, generateDigitalSeal } from '@/lib/otpSeal';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
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
