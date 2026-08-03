import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { dispatchWhatsAppReminder, WhatsAppReminderOptions } from '@/lib/whatsappOutbound';

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    // In demo mode or mock fallback, allow authenticated / demo session
    const isDemoMode = process.env.NEXT_PUBLIC_DEMO_MODE === 'true' || !process.env.NEXT_PUBLIC_SUPABASE_URL;
    
    if (authError || (!user && !isDemoMode)) {
      return NextResponse.json({ error: 'No autorizado. Inicie sesión para enviar notificaciones.' }, { status: 401 });
    }

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
      isSandbox: isDemoMode,
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
