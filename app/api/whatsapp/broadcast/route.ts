import { NextRequest, NextResponse } from 'next/server';
import { requireOrgAccess, isDemoDeployment } from '@/lib/apiAuth';
import { requireSettlementAccount } from '@/lib/settlementAccount';
import { dispatchWhatsAppReminder, WhatsAppReminderOptions } from '@/lib/whatsappOutbound';

export async function POST(req: NextRequest) {
  // The previous guard could be switched off entirely by
  // NEXT_PUBLIC_DEMO_MODE=true. That is a client-visible build-time variable,
  // so shipping it set — in a preview deploy, say — silently made this endpoint
  // anonymous. Whether a backend is configured is the only thing that may
  // relax the check now, and it is read from server state.
  //
  // requireOrgAccess rather than requireUser: this message carries a /pay/ link,
  // and the settlement-account gate below needs to know which tenant is about
  // to hand one to a client.
  const auth = await requireOrgAccess();
  if (!auth.ok) return auth.response;
  const { supabase, organizationId } = auth.ctx;

  // #64 — refuse before the link leaves rather than after the client opens it.
  // Without a CLABE the /pay/ page this message points at answers 409, so
  // sending it spends the tenant's credibility on a dead end.
  const settlement = await requireSettlementAccount(supabase, organizationId);
  if (!settlement.ok) return settlement.response;

  const isSandbox = isDemoDeployment();

  try {
    const body = await req.json();
    const { clientName, phone, amountDue, dueDate, token } = body as WhatsAppReminderOptions;

    if (!clientName || !phone || !amountDue || !token) {
      return NextResponse.json({ error: 'Faltan parámetros obligatorios (clientName, phone, amountDue, token)' }, { status: 400 });
    }

    const result = await dispatchWhatsAppReminder({
      clientName,
      phone,
      amountDue: Number(amountDue),
      dueDate: dueDate || new Date().toISOString().split('T')[0],
      token,
      isSandbox,
    });

    // dispatchWhatsAppReminder can now genuinely fail, so stop announcing a
    // send that did not happen. 502: the provider, not this request, is at fault.
    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'No se pudo enviar el recordatorio por WhatsApp', ...result },
        { status: 502 }
      );
    }

    return NextResponse.json({
      message: result.mode === 'wa_me_link' ? 'Enlace WhatsApp generado exitosamente' : 'Recordatorio WhatsApp enviado vía API',
      ...result,
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Error interno del servidor';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
