-- ============================================================================
-- Business Helper — Development Seed Data
-- File: supabase/seed.sql
-- ============================================================================

-- Seed Mock User (Owner: Don Roberto)
INSERT INTO auth.users (id, email, raw_user_meta_data, created_at)
VALUES (
  'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  'don.roberto@constructoramaya.mx',
  '{"full_name": "Roberto Maya", "phone": "8112345678"}'::jsonb,
  now()
) ON CONFLICT (id) DO NOTHING;

-- Seed Organization
INSERT INTO public.organizations (id, name, rfc, regimen_fiscal, codigo_postal, owner_id, subscription_tier)
VALUES (
  '11111111-1111-1111-1111-111111111111',
  'Constructora Maya S.A. de C.V.',
  'CMA180512AB3',
  '601',
  '64000',
  'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  'emprendedor'
) ON CONFLICT (id) DO NOTHING;

-- Seed Organization Membership
INSERT INTO public.organization_members (organization_id, user_id, role)
VALUES (
  '11111111-1111-1111-1111-111111111111',
  'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  'owner'
) ON CONFLICT (organization_id, user_id) DO NOTHING;

-- Seed Client (Lic. Mariana)
INSERT INTO public.clients (id, organization_id, name, contact_name, email, phone, rfc, regimen_fiscal, health_score)
VALUES (
  '22222222-2222-2222-2222-222222222222',
  '11111111-1111-1111-1111-111111111111',
  'Grupo Desarrollador Regio S.A.P.I.',
  'Lic. Mariana Garza',
  'mariana@desarrolladorregio.mx',
  '8189876543',
  'GDR1204058X1',
  '601',
  95
) ON CONFLICT (id) DO NOTHING;

-- Seed Product
INSERT INTO public.products (id, organization_id, name, description, unit_price, unit, sat_product_code)
VALUES (
  '33333333-3333-3333-3333-333333333333',
  '11111111-1111-1111-1111-111111111111',
  'Servicio de Remodelación Comercial',
  'Remodelación de oficinas y acabados tablaroca por m2',
  4500.00,
  'E48',
  '84111506'
) ON CONFLICT (id) DO NOTHING;

-- Seed Quote
INSERT INTO public.quotes (id, organization_id, client_id, created_by, title, line_items, subtotal_amount, iva_amount, total_amount, status, public_token)
VALUES (
  '44444444-4444-4444-4444-444444444444',
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222',
  'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  'Cotización Remodelación Oficinas Valle',
  '[{"description": "Remodelación piso 3", "quantity": 10, "unit_price": 4500.00, "sat_code": "84111506"}]'::jsonb,
  45000.00,
  7200.00,
  52200.00,
  'sent',
  'demoquote1234567890abcdef'
) ON CONFLICT (id) DO NOTHING;
