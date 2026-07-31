import { NextResponse } from 'next/server';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'Milestone not found' }, { status: 404 });
  }

  try {
    const { id } = await params;
    const supabase = await createClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: milestone, error } = await (supabase as any)
      .from('milestones')
      .select('*, contracts(*, clients(*))')
      .eq('id', id)
      .single();

    if (!error && milestone) {
      return NextResponse.json(milestone);
    }
  } catch {
    // Fallback
  }

  return NextResponse.json({ error: 'Milestone not found' }, { status: 404 });
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const supabase = await createClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: updated, error } = await (supabase as any)
      .from('milestones')
      .update(body)
      .eq('id', id)
      .select()
      .single();

    if (!error && updated) {
      return NextResponse.json(updated);
    }
  } catch {
    // Fallback
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('milestones').delete().eq('id', id);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: true });
  }
}
