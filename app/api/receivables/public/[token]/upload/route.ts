import { NextResponse } from 'next/server';
import { createServiceClient, isServiceRoleConfigured } from '@/lib/supabase/service';
import { publicApiError } from '@/lib/publicApiError';
import { validateReceiptFile, sniffReceiptContent, RECEIPT_CONTENT_TYPES } from '@/lib/speiValidator';
import {
  pickPayableMilestone,
  buildReceiptPath,
  SPEI_VOUCHERS_BUCKET,
} from '@/lib/publicReceivable';

/**
 * Public SPEI receipt upload, reached from /pay/[token] with no session.
 *
 * Before this route existed the payment page collected the payer's receipt,
 * validated it client-side — and then stored `URL.createObjectURL(file)`, a
 * blob: URL that dereferences only inside the payer's own browser tab. The
 * vendor's Cobranza held a "receipt" link that resolved nothing, for every
 * payment ever declared through the public portal (#85 — hard rule 1 at one
 * remove: the UI implied a file was submitted and no file left the machine).
 *
 * The file now lands in the same `spei-vouchers` bucket the authenticated
 * upload route uses. Public-surface posture applies: the token scopes
 * everything, the upload is refused unless the token resolves to a milestone
 * still awaiting payment, size is capped, and the *bytes* are checked — the
 * client-side name/type validation is UX, not enforcement. The route answers
 * with the storage path; the declaration POST turns it back into a URL after
 * validating it against the same org and milestone.
 */
/** Per-milestone ceiling on stored receipts — one real receipt plus retries. */
const RECEIPT_UPLOADS_PER_MILESTONE = 10;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  if (!isServiceRoleConfigured()) {
    return publicApiError(
      503,
      'BACKEND_NOT_CONFIGURED',
      // Covers the sandbox and a broken deployment alike (#259).
      'La subida de comprobantes no está disponible en este momento. Intente de nuevo más tarde.'
    );
  }

  try {
    const supabase = createServiceClient();

    // Same lookup and predicate as the declaration POST: the upload belongs
    // to the milestone the payer is actually paying, and a link whose
    // milestones are all declared or confirmed accepts no more files.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: quote, error: fetchError } = await (supabase as any)
      .from('quotes')
      .select('id, organization_id, contracts!quote_id(id, milestones(id, status, due_date))')
      .eq('public_token', token)
      .maybeSingle();

    if (fetchError || !quote?.contracts?.milestones?.length) {
      return publicApiError(404, 'PAYMENT_NOT_FOUND', 'Cobro no encontrado');
    }

    const target = pickPayableMilestone(quote.contracts.milestones);
    if (!target) {
      return publicApiError(
        409,
        'PAYMENT_ALREADY_RECORDED',
        'Este cobro ya fue registrado. Si tienes dudas, contacta directamente al negocio.'
      );
    }

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return publicApiError(400, 'INVALID_FILE', 'El archivo de comprobante es requerido');
    }

    const file = formData.get('file') as File | null;
    if (!file || typeof file.arrayBuffer !== 'function') {
      return publicApiError(400, 'INVALID_FILE', 'El archivo de comprobante es requerido');
    }

    const metadata = validateReceiptFile({ name: file.name, size: file.size, type: file.type });
    if (!metadata.isValid) {
      return publicApiError(
        400,
        'INVALID_FILE',
        metadata.error || 'Formato de archivo inválido. Solo se admiten imágenes PNG, JPG o documentos PDF.'
      );
    }

    const bytes = new Uint8Array(await file.arrayBuffer());

    // 5MB cap enforced on the bytes actually received, not the size the
    // browser claimed — this is an unauthenticated surface.
    if (bytes.byteLength > 5 * 1024 * 1024) {
      return publicApiError(400, 'INVALID_FILE', 'El archivo excede el tamaño máximo permitido de 5MB.');
    }

    // The magic bytes decide the content type and the stored extension; the
    // caller's filename and MIME type decide nothing.
    const content = sniffReceiptContent(bytes);
    if (!content) {
      return publicApiError(
        400,
        'INVALID_FILE',
        'El archivo no es una imagen PNG, JPG ni un documento PDF válido.'
      );
    }

    // Anti-abuse cap: this is an unauthenticated surface writing to a
    // public-read bucket, and every upload lands at a fresh timestamped path.
    // A vendor needs one receipt and maybe a few retries per milestone — not
    // unbounded free hosting under the tenant's storage. A failed count reads
    // as unknown and does not block: the upload itself still fails loudly if
    // storage is down.
    const { data: existing } = await supabase.storage
      .from(SPEI_VOUCHERS_BUCKET)
      .list(quote.organization_id, {
        search: `spei_${target.id}_`,
        limit: RECEIPT_UPLOADS_PER_MILESTONE + 1,
      });

    if ((existing?.length ?? 0) >= RECEIPT_UPLOADS_PER_MILESTONE) {
      return publicApiError(
        429,
        'RECEIPT_UPLOAD_LIMIT',
        'Se alcanzó el límite de comprobantes para este cobro. Contacta directamente al negocio.'
      );
    }

    const receiptPath = buildReceiptPath(quote.organization_id, target.id, content, Date.now());

    const { data: uploaded, error: uploadError } = await supabase.storage
      .from(SPEI_VOUCHERS_BUCKET)
      .upload(receiptPath, Buffer.from(bytes), {
        contentType: RECEIPT_CONTENT_TYPES[content],
        upsert: false,
      });

    if (uploadError || !uploaded) {
      return publicApiError(
        502,
        'RECEIPT_UPLOAD_FAILED',
        'No se pudo guardar el comprobante. Intenta de nuevo.'
      );
    }

    return NextResponse.json({ success: true, receipt_path: receiptPath });
  } catch {
    return publicApiError(
      500,
      'RECEIPT_UPLOAD_FAILED',
      'No se pudo guardar el comprobante. Intenta de nuevo.'
    );
  }
}
