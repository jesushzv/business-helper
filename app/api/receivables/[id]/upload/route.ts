import { NextResponse } from 'next/server';
import { requireOrgAccess } from '@/lib/apiAuth';
import { validateReceiptFile } from '@/lib/speiValidator';

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

    // Derive the extension from the validated file rather than trusting the
    // caller's filename, and namespace the object by organization.
    const fileExt = (file.name.split('.').pop() || 'pdf').toLowerCase().replace(/[^a-z0-9]/g, '');
    const filePath = `${organizationId}/spei_${id}_${Date.now()}.${fileExt || 'pdf'}`;

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const { data, error } = await supabase.storage
      .from('spei-vouchers')
      .upload(filePath, buffer, {
        contentType: file.type,
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
