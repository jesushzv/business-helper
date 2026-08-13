import { NextResponse } from 'next/server';
import { requireOrgAccess } from '@/lib/apiAuth';
import { validateReceiptFile, sniffReceiptContent, RECEIPT_CONTENT_TYPES } from '@/lib/speiValidator';

/**
 * Uploads a SPEI receipt against a milestone.
 *
 * Ran unauthenticated with no check that the milestone belonged to the caller,
 * and — worse — when the storage upload failed it returned
 * `{success: true, url: 'https://storage.businesshelper.mx/...'}`. That host
 * serves nothing, so the payment evidence a user believed they had filed did
 * not exist. Upload failures are now reported as failures.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireOrgAccess();
  if (!auth.ok) return auth.response;
  const { supabase, organizationId } = auth.ctx;

  try {
    const { id } = await params;

    // Confirm the milestone is the caller's before writing anything under its id.
    const { data: milestone } = await supabase
      .from('milestones')
      .select('id')
      .eq('id', id)
      .eq('organization_id', organizationId)
      .maybeSingle();

    if (!milestone) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Cobro no encontrado' } },
        { status: 404 }
      );
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json(
        { error: { code: 'MISSING_FILE', message: 'El archivo de comprobante es requerido' } },
        { status: 400 }
      );
    }

    const fileValidation = validateReceiptFile({
      name: file.name,
      size: file.size,
      type: file.type,
    });

    if (!fileValidation.isValid) {
      return NextResponse.json(
        { error: { code: 'INVALID_FILE', message: fileValidation.error } },
        { status: 400 }
      );
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // The magic bytes decide the content and the stored extension — the
    // name/size/type check above reads caller-supplied claims, which is UX,
    // not enforcement (#85 gave the public upload route the same posture).
    const content = sniffReceiptContent(new Uint8Array(bytes));
    if (!content) {
      return NextResponse.json(
        {
          error: {
            code: 'INVALID_FILE',
            message: 'El archivo no es una imagen PNG, JPG ni un documento PDF válido.',
          },
        },
        { status: 400 }
      );
    }

    const filePath = `${organizationId}/spei_${id}_${Date.now()}.${content}`;

    const { data, error } = await supabase.storage
      .from('spei-vouchers')
      .upload(filePath, buffer, {
        contentType: RECEIPT_CONTENT_TYPES[content],
        upsert: false,
      });

    if (error || !data) {
      return NextResponse.json(
        { error: { code: 'UPLOAD_FAILED', message: 'Error al subir el comprobante SPEI' } },
        { status: 502 }
      );
    }

    const { data: publicUrlData } = supabase.storage
      .from('spei-vouchers')
      .getPublicUrl(filePath);

    return NextResponse.json({
      success: true,
      url: publicUrlData.publicUrl,
      filePath,
    });
  } catch {
    return NextResponse.json(
      { error: { code: 'UPLOAD_FAILED', message: 'Error al subir el comprobante SPEI' } },
      { status: 500 }
    );
  }
}
