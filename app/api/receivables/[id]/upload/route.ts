import { NextResponse } from 'next/server';
import { requireOrgAccess } from '@/lib/apiAuth';
import { hasCapability } from '@/lib/teamRBAC';
import { describeDbWriteError } from '@/lib/dbWriteError';
import { createServiceClient, isServiceRoleConfigured } from '@/lib/supabase/service';
import { validateReceiptFile, sniffReceiptContent, RECEIPT_CONTENT_TYPES } from '@/lib/speiValidator';
import { SPEI_VOUCHERS_BUCKET } from '@/lib/publicReceivable';

/**
 * Uploads a SPEI receipt against a milestone.
 *
 * Ran unauthenticated with no check that the milestone belonged to the caller,
 * and — worse — when the storage upload failed it returned
 * `{success: true, url: 'https://storage.businesshelper.mx/...'}`. That host
 * serves nothing, so the payment evidence a user believed they had filed did
 * not exist. Upload failures are now reported as failures.
 *
 * **The storage write goes through the service-role client, like the public
 * twin does** (#339). It used to use the request-scoped `authenticated`
 * client, which cannot write here at all: RLS is enabled on `storage.objects`
 * and the project has **zero** policies on it — checked live on 2026-08-14 —
 * so every upload would have come back 502 UPLOAD_FAILED. That failed closed
 * and honestly, but the feature would never once have worked, which is why
 * this was found by running the check rather than by reading the code.
 *
 * The tenant scoping does not weaken by moving off RLS: `requireOrgAccess`
 * authenticates, the milestone is confirmed to belong to the caller's
 * organization below through the *request-scoped* client, and the storage path
 * is built from the server-derived `organizationId` — never from anything the
 * caller sent.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireOrgAccess();
  if (!auth.ok) return auth.response;
  const { supabase, organizationId, role } = auth.ctx;

  // Filing payment evidence is part of settling a cobro, so it takes the same
  // capability settling one does (#355). Before this route wrote the row, the
  // evidence went in through PUT /api/receivables/[id], which gates only
  // `status === 'confirmed'` — so a `member`, who holds no `confirm_payment`,
  // could still attach the comprobante the confirmation rests on.
  if (!hasCapability(role, 'confirm_payment')) {
    return NextResponse.json(
      {
        error: {
          code: 'FORBIDDEN',
          message: 'Tu rol no permite registrar comprobantes de pago',
        },
      },
      { status: 403 }
    );
  }

  // Fails closed rather than reporting a storage failure the tenant cannot
  // act on: with no service role there is nowhere to put the file (rule #3).
  if (!isServiceRoleConfigured()) {
    return NextResponse.json(
      {
        error: {
          code: 'BACKEND_NOT_CONFIGURED',
          message: 'La subida de comprobantes no está disponible en este momento.',
        },
      },
      { status: 503 }
    );
  }

  try {
    const { id } = await params;

    // Confirm the milestone is the caller's before writing anything under its
    // id, and read the state that decides whether the evidence may be replaced.
    const { data: milestone } = await supabase
      .from('milestones')
      .select('id, status, receipt_url, cfdi_status')
      .eq('id', id)
      .eq('organization_id', organizationId)
      .maybeSingle();

    if (!milestone) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Cobro no encontrado' } },
        { status: 404 }
      );
    }

    // Swapping the evidence under a filed fiscal document is a decision, not a
    // gap to patch quietly (#355). Once the payment is confirmed *and* a live
    // CFDI stands on it, the comprobante is what the invoice and its
    // complemento de pago were issued against — there is no audit row here to
    // record the substitution, so the answer is no. A cancelled document is
    // void and settles nothing, so it does not lock anything.
    const documentIsLive = milestone.cfdi_status === 'issued';
    if (milestone.status === 'confirmed' && documentIsLive && milestone.receipt_url) {
      return NextResponse.json(
        {
          error: {
            code: 'RECEIPT_LOCKED',
            message:
              'Este cobro ya está confirmado y su factura está timbrada, así que el ' +
              'comprobante que la respalda no se puede reemplazar. Si el comprobante ' +
              'es incorrecto, cancela la factura primero.',
          },
        },
        { status: 409 }
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

    // `owner_` rather than the payer path's `spei_` prefix. The public upload
    // counts objects matching `spei_${milestoneId}_` against its 10-per-cobro
    // cap, so sharing the prefix would let the owner's own filings exhaust the
    // payer's quota and answer a real client with "contacta directamente al
    // negocio" for a limit they never consumed (#339 review).
    const filePath = `${organizationId}/owner_${id}_${Date.now()}.${content}`;

    const storage = createServiceClient();

    const { data, error } = await storage.storage
      .from(SPEI_VOUCHERS_BUCKET)
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

    const { data: publicUrlData } = storage.storage
      .from(SPEI_VOUCHERS_BUCKET)
      .getPublicUrl(filePath);

    // **This route files the evidence; the client never does** (#355).
    //
    // `receipt_url` used to be in MILESTONE_WRITABLE_FIELDS, so PUT
    // /api/receivables/[id] applied whatever string it was sent — no format
    // check, no existence check, no capability gate. Any member could point a
    // cobro's payment evidence at `blob:http://x/y` (the dead link #85 still
    // guards against) or at an arbitrary external URL, which then rode into
    // the accountant's export as `Comprobante_SPEI_.jpg`.
    //
    // Writing the row here instead of validating a client-supplied string
    // makes "only a server-issued URL can land" structural rather than a
    // convention. It also closes the orphaned-object window the old two-step
    // left between the storage write and the row pointing at it.
    const { data: updated, error: saveError } = await supabase
      .from('milestones')
      .update({ receipt_url: publicUrlData.publicUrl })
      .eq('id', id)
      .eq('organization_id', organizationId)
      .select('id, receipt_url')
      .maybeSingle();

    // The object is stored but the row does not point at it: evidence that
    // exists nowhere the tenant can see. Reported as the failure it is (hard
    // rule 1), classified and logged rather than collapsed into one 500
    // (#148), and led with the fact that decides what the owner does next —
    // the file *is* up, so this is a retry, not "your file is no good". That
    // lead used to be written in the hook, which is where it stopped being
    // possible once this route became the only writer.
    if (saveError || !updated) {
      const failure = describeDbWriteError(
        saveError ?? { message: 'update matched no row' },
        'el comprobante',
        'POST /api/receivables/[id]/upload',
        { verb: 'guardar' }
      );
      return NextResponse.json(
        {
          error: {
            code: 'RECEIPT_SAVE_FAILED',
            message:
              'El comprobante se subió pero no se pudo guardar en el cobro. ' +
              `${failure.message} Intenta de nuevo.`,
          },
        },
        { status: failure.status === 500 ? 500 : failure.status }
      );
    }

    return NextResponse.json({
      success: true,
      url: updated.receipt_url,
      filePath,
    });
  } catch {
    return NextResponse.json(
      { error: { code: 'UPLOAD_FAILED', message: 'Error al subir el comprobante SPEI' } },
      { status: 500 }
    );
  }
}
