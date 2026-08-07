import { NextResponse } from 'next/server';
import { requireOrgAccess } from '@/lib/apiAuth';
import { hasCapability } from '@/lib/teamRBAC';
import { createServiceClient, isServiceRoleConfigured } from '@/lib/supabase/service';
import {
  isPacEncryptionConfigured,
  pacApiKeyHint,
  sealPacApiKey,
  validatePacApiKey,
} from '@/lib/pacCredentials';
import { isPlatformPacConfigured, verifyPacCredentials } from '@/lib/pacClient';
import { currentFolioPeriod, resolveFolioAllowance } from '@/lib/cfdiFolios';

/**
 * The organization's PAC connection.
 *
 * docs/02-architecture/cfdi_integration_architecture.md §03 Option A: the user
 * opens an account with a PAC, uploads their CSD *there*, and gives us an API
 * key. We never see a certificate, and the key we do hold is revocable from
 * their PAC dashboard at any time.
 *
 * The key is sealed before it is stored (lib/pacCredentials.ts) and is never
 * returned — GET reports the last four characters, which identifies the
 * credential to the person who owns it and to nobody else.
 */

/** Only the account owner manages billing credentials. */
const REQUIRED_CAPABILITY = 'billing_management' as const;

export async function GET() {
  const auth = await requireOrgAccess();
  if (!auth.ok) return auth.response;
  const { supabase, organizationId, role } = auth.ctx;

  if (!hasCapability(role, REQUIRED_CAPABILITY)) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'Solo el dueño de la cuenta puede gestionar el PAC' } },
      { status: 403 }
    );
  }

  const { data: organization } = await supabase
    .from('organizations')
    .select('subscription_tier, cfdi_folios_used, cfdi_folios_period, cfdi_folios_purchased')
    .eq('id', organizationId)
    .maybeSingle();

  let connection: { provider: string; api_key_hint: string; environment: string; updated_at: string } | null =
    null;

  if (isServiceRoleConfigured()) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (createServiceClient() as any)
      .from('pac_connections')
      .select('provider, api_key_hint, environment, updated_at')
      .eq('organization_id', organizationId)
      .maybeSingle();
    connection = data ?? null;
  }

  const allowance = resolveFolioAllowance(organization, currentFolioPeriod());

  return NextResponse.json({
    connection: connection
      ? {
          provider: connection.provider,
          apiKeyHint: connection.api_key_hint,
          environment: connection.environment,
          connectedAt: connection.updated_at,
        }
      : null,
    // What happens if they stamp without connecting anything of their own.
    platformFallbackAvailable: isPlatformPacConfigured(),
    folios: {
      included: allowance.included,
      used: allowance.used,
      purchased: allowance.purchased,
      remaining: allowance.remaining,
      period: allowance.period,
      addOnPricePerFolio: allowance.addOnPricePerFolio,
    },
  });
}

export async function PUT(request: Request) {
  const auth = await requireOrgAccess();
  if (!auth.ok) return auth.response;
  const { organizationId, userId, role } = auth.ctx;

  if (!hasCapability(role, REQUIRED_CAPABILITY)) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'Solo el dueño de la cuenta puede conectar un PAC' } },
      { status: 403 }
    );
  }

  if (!isServiceRoleConfigured()) {
    return NextResponse.json(
      { error: { code: 'BACKEND_NOT_CONFIGURED', message: 'Almacenamiento no configurado' } },
      { status: 503 }
    );
  }

  // Storing a credential this deployment cannot seal would mean writing it in
  // plaintext. Refuse instead.
  if (!isPacEncryptionConfigured()) {
    return NextResponse.json(
      {
        error: {
          code: 'ENCRYPTION_NOT_CONFIGURED',
          message: 'Este entorno no puede resguardar llaves de PAC. Contacta a soporte.',
        },
      },
      { status: 503 }
    );
  }

  let body: { apiKey?: string; provider?: string };
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const apiKey = typeof body?.apiKey === 'string' ? body.apiKey.trim() : '';
  const validation = validatePacApiKey(apiKey);

  if (!validation.isValid || !validation.environment) {
    return NextResponse.json(
      { error: { code: 'INVALID_API_KEY', message: validation.error } },
      { status: 400 }
    );
  }

  // A key that does not authenticate is rejected at the form rather than at the
  // first invoice someone needed to send.
  const verification = await verifyPacCredentials({
    provider: 'facturapi',
    apiKey,
    environment: validation.environment,
    source: 'organization',
  });

  if (!verification.ok) {
    return NextResponse.json(
      { error: { code: `PAC_${verification.code}`, message: verification.message } },
      { status: verification.code === 'UNAUTHORIZED' ? 400 : 502 }
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const service = createServiceClient() as any;

  const { error } = await service.from('pac_connections').upsert(
    {
      organization_id: organizationId,
      provider: 'facturapi',
      api_key_sealed: sealPacApiKey(apiKey),
      api_key_hint: pacApiKeyHint(apiKey),
      environment: validation.environment,
      connected_by: userId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'organization_id' }
  );

  if (error) {
    console.error('[pac] failed to store connection:', error.message);
    return NextResponse.json(
      { error: { code: 'SERVER_ERROR', message: 'No se pudo guardar la conexión con tu PAC' } },
      { status: 500 }
    );
  }

  await service.from('audit_logs').insert({
    organization_id: organizationId,
    action: 'pac.connected',
    actor: userId,
    details: `PAC facturapi conectado (${validation.environment}, ****${pacApiKeyHint(apiKey)})`,
  });

  return NextResponse.json({
    connection: {
      provider: 'facturapi',
      apiKeyHint: pacApiKeyHint(apiKey),
      environment: validation.environment,
    },
  });
}

export async function DELETE() {
  const auth = await requireOrgAccess();
  if (!auth.ok) return auth.response;
  const { organizationId, userId, role } = auth.ctx;

  if (!hasCapability(role, REQUIRED_CAPABILITY)) {
    return NextResponse.json(
      { error: { code: 'FORBIDDEN', message: 'Solo el dueño de la cuenta puede desconectar el PAC' } },
      { status: 403 }
    );
  }

  if (!isServiceRoleConfigured()) {
    return NextResponse.json(
      { error: { code: 'BACKEND_NOT_CONFIGURED', message: 'Almacenamiento no configurado' } },
      { status: 503 }
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const service = createServiceClient() as any;

  const { error } = await service
    .from('pac_connections')
    .delete()
    .eq('organization_id', organizationId);

  if (error) {
    return NextResponse.json(
      { error: { code: 'SERVER_ERROR', message: 'No se pudo desconectar tu PAC' } },
      { status: 500 }
    );
  }

  await service.from('audit_logs').insert({
    organization_id: organizationId,
    action: 'pac.disconnected',
    actor: userId,
    details: 'Conexión con el PAC eliminada',
  });

  // Already-stamped documents keep their UUIDs; only future stamping changes.
  return NextResponse.json({ connection: null });
}
