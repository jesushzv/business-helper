import { NextResponse } from 'next/server';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/server';

export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ receivables: [] });
  }

  try {
    const supabase = await createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: receivables, error } = await (supabase as any)
      .from('milestones')
      .select('*, contracts(*, clients(*))')
      .order('due_date', { ascending: true });

    if (!error && receivables) {
      return NextResponse.json({ receivables });
    }
  } catch {
    // Fallback
  }

  return NextResponse.json({ receivables: [] });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (user) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: orgs } = await (supabase as any)
        .from('organizations')
        .select('id')
        .eq('owner_id', user.id)
        .limit(1);

      const orgId = orgs && orgs.length > 0 ? orgs[0].id : 'org-demo-1';

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: newMilestone, error } = await (supabase as any)
        .from('milestones')
        .insert({
          ...body,
          organization_id: orgId,
          created_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (!error && newMilestone) {
        return NextResponse.json(newMilestone, { status: 201 });
      }
    }

    return NextResponse.json(body, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Failed to create milestone' }, { status: 500 });
  }
}
