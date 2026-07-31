import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { simulateInvoiceStamping, validateCFDIMetadata } from '@/lib/facturapi';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { milestoneId, receiverRfc, lineItems } = body;

    if (!milestoneId) {
      return NextResponse.json(
        { error: { code: 'MISSING_MILESTONE', message: 'ID de hito/receivable es requerido' } },
        { status: 400 }
      );
    }

    if (receiverRfc && Array.isArray(lineItems)) {
      const validation = validateCFDIMetadata({
        issuerRfc: 'ABC120315HD9',
        receiverRfc,
        lineItems
      });

      if (!validation.isValid) {
        return NextResponse.json(
          { error: { code: 'INVALID_SAT_METADATA', message: validation.errors.join(', ') } },
          { status: 400 }
        );
      }
    }

    const stamp = simulateInvoiceStamping(milestoneId);

    try {
      const supabase = await createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .from('milestones')
        .update({
          cfdi_id: stamp.cfdiId,
          cfdi_status: 'issued',
          cfdi_xml_url: stamp.xmlUrl,
          cfdi_pdf_url: stamp.pdfUrl
        })
        .eq('id', milestoneId);
    } catch {
      // Ignore DB errors in demo mode
    }

    return NextResponse.json({
      cfdiId: stamp.cfdiId,
      xmlUrl: stamp.xmlUrl,
      pdfUrl: stamp.pdfUrl,
      status: 'issued',
      issuedAt: stamp.issuedAt
    });
  } catch {
    return NextResponse.json(
      { error: { code: 'STAMPING_FAILED', message: 'Fallo el timbrado con PAC Facturapi' } },
      { status: 500 }
    );
  }
}
