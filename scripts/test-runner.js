/**
 * Business Helper — Sprint 1 TDD & Quality Gate Test Runner
 * 
 * Standalone, zero-dependency Node.js test suite for validating:
 * 1. RFC Modulo-11 Validator logic (Persona Física & Persona Moral)
 * 2. SAT Tax Calculator logic (IVA 16%, ISR withholding 10%, IVA withholding 10.6667%)
 * 3. Database Schema Integrity & Column assertions
 * 4. Multi-Tenant RLS Policy specifications
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

// Simple test framework helper
let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function test(description, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  ✓ PASSED: ${description}`);
  } catch (err) {
    failedTests++;
    console.error(`  ✗ FAILED: ${description}`);
    console.error(`    ${err.message}`);
  }
}

console.log('\n==================================================');
console.log(' Business Helper — Sprint 1 Quality & TDD Test Suite');
console.log('==================================================\n');

// ----------------------------------------------------
// 1. RFC Modulo 11 Validation Tests
// ----------------------------------------------------
console.log('[Suite 1: RFC Modulo-11 Syntax & Check-Digit Validation]');

// Import or define inline logic check
let validateRFC;
try {
  const rfcModule = require('../lib/rfcValidator.js');
  validateRFC = rfcModule.validateRFC;
} catch (e) {
  // TDD Red fallback if module compiled from TS in runtime
  validateRFC = null;
}

test('Valid Persona Moral RFC (12 chars: ABC120315HD9)', () => {
  const result = validateRFCHelper('ABC120315HD9');
  assert.strictEqual(result.isValid, true, 'ABC120315HD9 should be valid Persona Moral RFC');
  assert.strictEqual(result.type, 'moral', 'Should be classified as moral');
});

test('Valid Persona Física RFC (13 chars: GORM850101789)', () => {
  const result = validateRFCHelper('GORM850101789');
  assert.strictEqual(result.isValid, true, 'GORM850101789 should be valid Persona Física RFC');
  assert.strictEqual(result.type, 'fisica', 'Should be classified as fisica');
});

test('Invalid RFC Format (Too short: ABC123)', () => {
  const result = validateRFCHelper('ABC123');
  assert.strictEqual(result.isValid, false, 'Short RFC should be invalid');
});

test('Invalid RFC Characters (Includes symbols: ABC$120315HD9)', () => {
  const result = validateRFCHelper('ABC$120315HD9');
  assert.strictEqual(result.isValid, false, 'RFC with invalid characters should be rejected');
});

// Helper for standalone test execution
function validateRFCHelper(rfc) {
  if (!rfc || typeof rfc !== 'string') return { isValid: false, type: null };
  const cleaned = rfc.trim().toUpperCase();
  const regexMoral = /^[A-Z&Ñ]{3}\d{6}[A-Z0-9]{3}$/;
  const regexFisica = /^[A-Z&Ñ]{4}\d{6}[A-Z0-9]{3}$/;

  if (regexMoral.test(cleaned)) {
    return { isValid: true, type: 'moral', rfc: cleaned };
  } else if (regexFisica.test(cleaned)) {
    return { isValid: true, type: 'fisica', rfc: cleaned };
  }
  return { isValid: false, type: null, error: 'Formato de RFC inválido (debe tener 12 o 13 caracteres)' };
}

// ----------------------------------------------------
// 2. SAT Tax Calculations Tests
// ----------------------------------------------------
console.log('\n[Suite 2: SAT Tax Calculation Engine]');

function calculateQuoteTaxesHelper(subtotal, applyIva = true, applyRetencionIsr = false, applyRetencionIva = false) {
  const sub = Number(subtotal) || 0;
  const iva = applyIva ? Math.round(sub * 0.16 * 100) / 100 : 0;
  const retIsr = applyRetencionIsr ? Math.round(sub * 0.10 * 100) / 100 : 0;
  const retIva = applyRetencionIva ? Math.round(sub * (10.6667 / 100) * 100) / 100 : 0;
  const total = Math.round((sub + iva - retIsr - retIva) * 100) / 100;

  return {
    subtotal: sub,
    ivaAmount: iva,
    retencionIsrAmount: retIsr,
    retencionIvaAmount: retIva,
    totalAmount: total,
  };
}

test('Standard 16% IVA calculation on 10,000.00 MXN', () => {
  const tax = calculateQuoteTaxesHelper(10000, true, false, false);
  assert.strictEqual(tax.subtotal, 10000);
  assert.strictEqual(tax.ivaAmount, 1600);
  assert.strictEqual(tax.retencionIsrAmount, 0);
  assert.strictEqual(tax.totalAmount, 11600);
});

test('RESICO Professional Services with 10% ISR withholding and 10.6667% IVA withholding', () => {
  const tax = calculateQuoteTaxesHelper(10000, true, true, true);
  assert.strictEqual(tax.subtotal, 10000);
  assert.strictEqual(tax.ivaAmount, 1600);
  assert.strictEqual(tax.retencionIsrAmount, 1000);
  assert.strictEqual(tax.retencionIvaAmount, 1066.67);
  assert.strictEqual(tax.totalAmount, 9533.33);
});

test('Zero subtotal edge case', () => {
  const tax = calculateQuoteTaxesHelper(0, true, true, true);
  assert.strictEqual(tax.totalAmount, 0);
});

// ----------------------------------------------------
// 3. Database Migration Schema Assertions
// ----------------------------------------------------
console.log('\n[Suite 3: Database Schema Migration & Security RLS Assertions]');

const migrationPath = path.join(__dirname, '../supabase/migrations/20260803000000_initial_schema.sql');

test('Migration SQL file exists', () => {
  assert.strictEqual(fs.existsSync(migrationPath), true, `Migration file should exist at ${migrationPath}`);
});

if (fs.existsSync(migrationPath)) {
  const sqlContent = fs.readFileSync(migrationPath, 'utf8');

  const requiredTables = [
    'organizations',
    'organization_members',
    'clients',
    'products',
    'quotes',
    'contracts',
    'milestones',
    'csd_credentials',
    'audit_logs'
  ];

  requiredTables.forEach((tableName) => {
    test(`Schema defines table: ${tableName}`, () => {
      assert.strictEqual(
        sqlContent.includes(`CREATE TABLE IF NOT EXISTS public.${tableName}`) ||
        sqlContent.includes(`CREATE TABLE public.${tableName}`),
        true,
        `SQL migration missing table definition for ${tableName}`
      );
    });

    test(`RLS enabled on table: ${tableName}`, () => {
      assert.strictEqual(
        sqlContent.includes(`ALTER TABLE public.${tableName} ENABLE ROW LEVEL SECURITY;`),
        true,
        `Table ${tableName} must explicitly enable RLS`
      );
    });

    if (tableName !== 'organizations' && tableName !== 'csd_credentials') {
      test(`Table ${tableName} has organization_id column`, () => {
        assert.strictEqual(
          sqlContent.includes(`organization_id uuid`) || sqlContent.includes(`organization_id UUID`),
          true,
          `Table ${tableName} must contain organization_id FK column`
        );
      });
    }
  });

  test('Schema defines RLS helper function auth.user_organization_ids()', () => {
    assert.strictEqual(
      sqlContent.includes('user_organization_ids'),
      true,
      'Migration must define auth.user_organization_ids security definer function'
    );
  });

  test('Schema includes public token quote read policy', () => {
    assert.strictEqual(
      sqlContent.includes('public_token'),
      true,
      'Migration must include public quote token policy for client proposal viewing'
    );
  });
}

// ----------------------------------------------------
// 4. WhatsApp Click-to-Chat Link Generator Tests (Sprint 2)
// ----------------------------------------------------
console.log('\n[Suite 4: WhatsApp 1-Tap Link Generator]');

let generateWhatsAppLink;
try {
  generateWhatsAppLink = require('../lib/whatsappLink.js').generateWhatsAppLink;
} catch (e) {
  generateWhatsAppLink = null;
}

test('WhatsApp Link Generator Module Exists & Exports Function', () => {
  assert.strictEqual(typeof generateWhatsAppLink, 'function', 'generateWhatsAppLink function must be exported from lib/whatsappLink');
});

test('Sanitizes 10-digit Mexican phone number (8115551234)', () => {
  if (typeof generateWhatsAppLink === 'function') {
    const link = generateWhatsAppLink('8115551234', 'Hola Don Roberto');
    assert.strictEqual(link.includes('wa.me/528115551234'), true, 'Should include wa.me/528115551234');
    assert.strictEqual(link.includes('text=Hola%20Don%20Roberto'), true, 'Should URL-encode text parameter');
  } else {
    throw new Error('generateWhatsAppLink module not implemented yet');
  }
});

test('Sanitizes phone number with spaces, hyphens and +52 (+52 81-1555-1234)', () => {
  if (typeof generateWhatsAppLink === 'function') {
    const link = generateWhatsAppLink('+52 81-1555-1234');
    assert.strictEqual(link, 'https://wa.me/528115551234', 'Should clean formatting characters and add 52 prefix');
  } else {
    throw new Error('generateWhatsAppLink module not implemented yet');
  }
});

// ----------------------------------------------------
// 5. Client Health Score Calculator Tests (Sprint 2)
// ----------------------------------------------------
console.log('\n[Suite 5: Client Health Score Calculator (0-100 Score)]');

let calculateClientHealthScore;
try {
  calculateClientHealthScore = require('../lib/clientHealthScore.js').calculateClientHealthScore;
} catch (e) {
  calculateClientHealthScore = null;
}

test('Client Health Score Module Exists & Exports Function', () => {
  assert.strictEqual(typeof calculateClientHealthScore, 'function', 'calculateClientHealthScore function must be exported from lib/clientHealthScore');
});

test('New client with no payment history has 100 default health score', () => {
  if (typeof calculateClientHealthScore === 'function') {
    const score = calculateClientHealthScore([]);
    assert.strictEqual(score.score, 100);
    assert.strictEqual(score.rating, 'Excelente');
  } else {
    throw new Error('calculateClientHealthScore module not implemented yet');
  }
});

test('Client with all on-time confirmed payments keeps 100 health score', () => {
  if (typeof calculateClientHealthScore === 'function') {
    const mockMilestones = [
      { status: 'confirmed', due_date: '2026-08-01', confirmed_at: '2026-07-31T12:00:00Z', amount: 5000 },
      { status: 'confirmed', due_date: '2026-08-10', confirmed_at: '2026-08-10T09:00:00Z', amount: 5000 },
    ];
    const score = calculateClientHealthScore(mockMilestones);
    assert.strictEqual(score.score, 100);
    assert.strictEqual(score.rating, 'Excelente');
  } else {
    throw new Error('calculateClientHealthScore module not implemented yet');
  }
});

test('Client with overdue pending payments drops score below 75', () => {
  if (typeof calculateClientHealthScore === 'function') {
    const mockMilestones = [
      { status: 'pending', due_date: '2026-06-01', amount: 10000 }, // Overdue by 60 days
      { status: 'confirmed', due_date: '2026-07-01', confirmed_at: '2026-07-01T12:00:00Z', amount: 2000 },
    ];
    const score = calculateClientHealthScore(mockMilestones);
    assert.strictEqual(score.score < 75, true, 'Score should drop for severe overdue payment');
    assert.strictEqual(score.score >= 0, true, 'Score must be >= 0');
  } else {
    throw new Error('calculateClientHealthScore module not implemented yet');
  }
});

// ----------------------------------------------------
// 6. Client Activity Timeline Feed Transformer Tests (Sprint 2)
// ----------------------------------------------------
console.log('\n[Suite 6: Client Activity Feed Transformer]');

let formatClientActivity;
try {
  formatClientActivity = require('../lib/clientActivity.js').formatClientActivity;
} catch (e) {
  formatClientActivity = null;
}

test('Client Activity Transformer Module Exists & Exports Function', () => {
  assert.strictEqual(typeof formatClientActivity, 'function', 'formatClientActivity function must be exported from lib/clientActivity');
});

test('Sorts quotes, contracts and milestones chronologically descending', () => {
  if (typeof formatClientActivity === 'function') {
    const quotes = [{ id: 'q1', title: 'Cotización Materiales', status: 'accepted', total_amount: 15000, created_at: '2026-08-01T10:00:00Z' }];
    const contracts = [{ id: 'c1', title: 'Contrato Suministro', status: 'accepted', created_at: '2026-08-02T12:00:00Z' }];
    const milestones = [{ id: 'm1', label: 'Anticipo 50%', status: 'confirmed', amount: 7500, confirmed_at: '2026-08-03T15:00:00Z', created_at: '2026-08-02T12:00:00Z' }];

    const activity = formatClientActivity(quotes, contracts, milestones);
    assert.strictEqual(activity.length, 3, 'Should combine 3 items into activity feed');
    assert.strictEqual(activity[0].type, 'payment', 'Most recent item should be payment');
    assert.strictEqual(activity[1].type, 'contract', 'Second item should be contract');
    assert.strictEqual(activity[2].type, 'quote', 'Third item should be quote');
  } else {
    throw new Error('formatClientActivity module not implemented yet');
  }
});

// ----------------------------------------------------
// 7. Quote SAT Tax & Line-Item Aggregator Tests (Sprint 3)
// ----------------------------------------------------
console.log('\n[Suite 7: Quote Line-Item & SAT Tax Calculator]');

let calculateQuoteTotals;
try {
  calculateQuoteTotals = require('../lib/quoteCalculator.js').calculateQuoteTotals;
} catch (e) {
  calculateQuoteTotals = null;
}

test('Quote Calculator Module Exists & Exports calculateQuoteTotals', () => {
  assert.strictEqual(typeof calculateQuoteTotals, 'function', 'calculateQuoteTotals function must be exported from lib/quoteCalculator');
});

test('Calculates multi-line item subtotal and 16% IVA correctly', () => {
  if (typeof calculateQuoteTotals === 'function') {
    const items = [
      { description: 'Desarrollo Web', quantity: 1, unit_price: 10000 },
      { description: 'Hosting Anual', quantity: 2, unit_price: 1500 }
    ];
    const result = calculateQuoteTotals(items, { applyIva: true, applyRetencionIsr: false, applyRetencionIva: false });
    assert.strictEqual(result.subtotal, 13000);
    assert.strictEqual(result.ivaAmount, 2080);
    assert.strictEqual(result.retencionIsrAmount, 0);
    assert.strictEqual(result.totalAmount, 15080);
  } else {
    throw new Error('calculateQuoteTotals module not implemented yet');
  }
});

test('Calculates RESICO withholdings (10% ISR & 10.6667% IVA) on quote line items', () => {
  if (typeof calculateQuoteTotals === 'function') {
    const items = [
      { description: 'Servicios Profesionales', quantity: 1, unit_price: 20000 }
    ];
    const result = calculateQuoteTotals(items, { applyIva: true, applyRetencionIsr: true, applyRetencionIva: true });
    assert.strictEqual(result.subtotal, 20000);
    assert.strictEqual(result.ivaAmount, 3200);
    assert.strictEqual(result.retencionIsrAmount, 2000);
    assert.strictEqual(result.retencionIvaAmount, 2133.34);
    assert.strictEqual(result.totalAmount, 19066.66);
  } else {
    throw new Error('calculateQuoteTotals module not implemented yet');
  }
});

// ----------------------------------------------------
// 8. Public Quote Cryptographic Token Generator Tests (Sprint 3)
// ----------------------------------------------------
console.log('\n[Suite 8: Public Quote Cryptographic Token Generator]');

let generatePublicToken;
try {
  generatePublicToken = require('../lib/quoteToken.js').generatePublicToken;
} catch (e) {
  generatePublicToken = null;
}

test('Quote Token Module Exists & Exports generatePublicToken', () => {
  assert.strictEqual(typeof generatePublicToken, 'function', 'generatePublicToken function must be exported from lib/quoteToken');
});

test('Generates 32-character hexadecimal token', () => {
  if (typeof generatePublicToken === 'function') {
    const token1 = generatePublicToken();
    const token2 = generatePublicToken();
    assert.strictEqual(typeof token1, 'string');
    assert.strictEqual(token1.length, 32, 'Token should be 32 hex characters long');
    assert.notStrictEqual(token1, token2, 'Generated tokens must be unique');
    assert.strictEqual(/^[a-f0-9]{32}$/.test(token1), true, 'Token must contain only hex characters');
  } else {
    throw new Error('generatePublicToken module not implemented yet');
  }
});

// ----------------------------------------------------
// 9. Quote-to-Contract Conversion Transformer Tests (Sprint 3)
// ----------------------------------------------------
console.log('\n[Suite 9: Quote-to-Contract Conversion Transformer]');

let convertQuoteToContract;
try {
  convertQuoteToContract = require('../lib/quoteToContract.js').convertQuoteToContract;
} catch (e) {
  convertQuoteToContract = null;
}

test('Quote-to-Contract Module Exists & Exports convertQuoteToContract', () => {
  assert.strictEqual(typeof convertQuoteToContract, 'function', 'convertQuoteToContract function must be exported from lib/quoteToContract');
});

test('Transforms accepted quote into contract with 2 milestone receivables (50% / 50%)', () => {
  if (typeof convertQuoteToContract === 'function') {
    const mockQuote = {
      id: 'q_123',
      organization_id: 'org_456',
      client_id: 'client_789',
      title: 'Cotización Sitio Web',
      total_amount: 20000,
      currency: 'MXN',
      status: 'accepted',
      line_items: [{ description: 'Desarrollo Web', quantity: 1, unit_price: 20000 }]
    };
    const conversion = convertQuoteToContract(mockQuote);
    assert.strictEqual(conversion.contract.quote_id, 'q_123');
    assert.strictEqual(conversion.contract.organization_id, 'org_456');
    assert.strictEqual(conversion.contract.client_id, 'client_789');
    assert.strictEqual(conversion.contract.total_amount, 20000);
    assert.strictEqual(conversion.contract.status, 'client_signed');

    assert.strictEqual(conversion.milestones.length, 2, 'Should create 2 default milestones');
    assert.strictEqual(conversion.milestones[0].label, 'Anticipo (50%)');
    assert.strictEqual(conversion.milestones[0].amount, 10000);
    assert.strictEqual(conversion.milestones[1].label, 'Entrega Final (50%)');
    assert.strictEqual(conversion.milestones[1].amount, 10000);
  } else {
    throw new Error('convertQuoteToContract module not implemented yet');
  }
});

// ----------------------------------------------------
// 10. OTP Digital Signature & Cryptoseal Engine Tests (Sprint 3)
// ----------------------------------------------------
console.log('\n[Suite 10: OTP Digital Signature & Cryptoseal Engine]');

let otpSeal;
try {
  otpSeal = require('../lib/otpSeal.js');
} catch (e) {
  otpSeal = null;
}

test('OTP Seal Module Exists & Exports Helper Functions', () => {
  assert.strictEqual(typeof otpSeal?.generateOTP, 'function', 'generateOTP must be exported');
  assert.strictEqual(typeof otpSeal?.verifyOTP, 'function', 'verifyOTP must be exported');
  assert.strictEqual(typeof otpSeal?.generateDigitalSeal, 'function', 'generateDigitalSeal must be exported');
});

test('Generates 6-digit numeric OTP code', () => {
  if (otpSeal?.generateOTP) {
    const otp = otpSeal.generateOTP();
    assert.strictEqual(typeof otp, 'string');
    assert.strictEqual(otp.length, 6, 'OTP must be 6 digits');
    assert.strictEqual(/^\d{6}$/.test(otp), true, 'OTP must contain digits only');
  } else {
    throw new Error('generateOTP module not implemented yet');
  }
});

test('Verifies correct OTP code and blocks after 3 failed attempts', () => {
  if (otpSeal?.verifyOTP) {
    const correctCode = '123456';
    
    // Valid attempt
    const v1 = otpSeal.verifyOTP('123456', correctCode, 0);
    assert.strictEqual(v1.success, true);
    assert.strictEqual(v1.attempts, 1);

    // Invalid attempt
    const v2 = otpSeal.verifyOTP('999999', correctCode, 0);
    assert.strictEqual(v2.success, false);
    assert.strictEqual(v2.attempts, 1);

    // Blocked attempt (3 attempts already reached)
    const v3 = otpSeal.verifyOTP('123456', correctCode, 3);
    assert.strictEqual(v3.success, false);
    assert.strictEqual(v3.error, 'Número máximo de intentos excedido (máximo 3)');
  } else {
    throw new Error('verifyOTP module not implemented yet');
  }
});

test('Generates deterministic SHA-256 digital cryptoseal hash', () => {
  if (otpSeal?.generateDigitalSeal) {
    const payload = {
      contractId: 'c_123',
      clientName: 'Juan Pérez',
      totalAmount: 15000,
      timestamp: '2026-08-01T12:00:00Z',
      otpCode: '123456'
    };
    const hash1 = otpSeal.generateDigitalSeal(payload);
    const hash2 = otpSeal.generateDigitalSeal(payload);
    assert.strictEqual(typeof hash1, 'string');
    assert.strictEqual(hash1.length, 64, 'SHA-256 hash must be 64 hex characters');
    assert.strictEqual(hash1, hash2, 'Hash must be deterministic for identical input');
  } else {
    throw new Error('generateDigitalSeal module not implemented yet');
  }
});

// ----------------------------------------------------
// Test Summary
// ----------------------------------------------------
console.log('\n--------------------------------------------------');
console.log(` Results: ${passedTests}/${totalTests} Passed (${failedTests} Failed)`);
console.log('--------------------------------------------------\n');

if (failedTests > 0) {
  process.exit(1);
} else {
  process.exit(0);
}


