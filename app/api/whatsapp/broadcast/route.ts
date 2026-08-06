import { NextRequest, NextResponse } from 'next/server';
import { requireUser, isDemoDeployment } from '@/lib/apiAuth';
import { dispatchWhatsAppReminder, WhatsAppReminderOptions } from '@/lib/whatsappOutbound';

export async function POST(req: NextRequest) {
  // The previous guard could be switched off entirely by
  // NEXT_PUBLIC_DEMO_MODE=true. That is a client-visible build-time variable,
  // so shipping it set — in a preview deploy, say — silently made this endpoint
  // anonymous. Whether a backend is configured is the only thing that may
  // relax the check now, and it is read from server state.
  const auth = await requireUser();
  if (!auth.ok) return auth.response;

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

    return NextResponse.json({
      message: result.mode === 'wa_me_link' ? 'Enlace WhatsApp generado exitosamente' : 'Recordatorio WhatsApp enviado vía API',
      ...result,
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Error interno del servidor';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
