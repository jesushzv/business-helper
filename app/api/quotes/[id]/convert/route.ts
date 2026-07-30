import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { convertQuoteToContract } from '@/lib/quoteToContract';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: quote } = await (supabase as any)
      .from('quotes')
      .select('*')
      .eq('id', id)
      .single();

    if (!quote) {
      const mockQuote = {
        id,
        organization_id: 'org-demo-1',
        client_id: 'client-demo-1',
        title: 'Cotización Demo',
        total_amount: 50000,
        currency: 'MXN',
        status: 'accepted',
      };
      const result = convertQuoteToContract(mockQuote);
      return NextResponse.json(result, { status: 201 });
    }

    const conversion = convertQuoteToContract(quote);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: newContract, error: contractErr } = await (supabase as any)
      .from('contracts')
      .insert(conversion.contract)
      .select()
      .single();

    if (contractErr) throw contractErr;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: newMilestones, error: milestoneErr } = await (supabase as any)
      .from('milestones')
      .insert(conversion.milestones)
      .select();

    if (milestoneErr) throw milestoneErr;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .from('quotes')
      .update({ status: 'converted', converted_contract_id: newContract.id })
      .eq('id', id);

    return NextResponse.json({ contract: newContract, milestones: newMilestones }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Failed to convert quote' }, { status: 500 });
  }
}
