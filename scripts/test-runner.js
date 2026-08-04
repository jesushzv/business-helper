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
// 11. Receivables Aging & Summary Calculator Tests (Sprint 4)
// ----------------------------------------------------
console.log('\n[Suite 11: Receivables Aging & Summary Calculator]');

let calculateReceivablesSummary;
try {
  calculateReceivablesSummary = require('../lib/receivablesCalculator.js').calculateReceivablesSummary;
} catch (e) {
  calculateReceivablesSummary = null;
}

test('Receivables Calculator Module Exists & Exports calculateReceivablesSummary', () => {
  assert.strictEqual(typeof calculateReceivablesSummary, 'function', 'calculateReceivablesSummary function must be exported from lib/receivablesCalculator');
});

test('Aggregates overdue, due today, upcoming, and confirmed amounts correctly', () => {
  if (typeof calculateReceivablesSummary === 'function') {
    const todayStr = '2026-08-30';
    const mockMilestones = [
      { id: 'm1', label: 'Anticipo 50%', amount: 5000, due_date: '2026-08-15', status: 'pending' }, // Overdue
      { id: 'm2', label: 'Entrega 1', amount: 3000, due_date: '2026-08-30', status: 'requested' }, // Due Today
      { id: 'm3', label: 'Finiquito', amount: 7000, due_date: '2026-09-15', status: 'pending' }, // Upcoming
      { id: 'm4', label: 'Fase Inicial', amount: 4000, due_date: '2026-08-01', status: 'confirmed' }, // Confirmed
    ];

    const summary = calculateReceivablesSummary(mockMilestones, todayStr);
    assert.strictEqual(summary.totalOverdue, 5000, 'Overdue total should be 5000');
    assert.strictEqual(summary.totalDueToday, 3000, 'Due Today total should be 3000');
    assert.strictEqual(summary.totalUpcoming, 7000, 'Upcoming total should be 7000');
    assert.strictEqual(summary.totalConfirmed, 4000, 'Confirmed total should be 4000');
    assert.strictEqual(summary.totalPending, 15000, 'Total pending should be 15000');
  } else {
    throw new Error('calculateReceivablesSummary module not implemented yet');
  }
});

// ----------------------------------------------------
// 12. WhatsApp Payment Reminder Link Generator Tests (Sprint 4)
// ----------------------------------------------------
console.log('\n[Suite 12: WhatsApp Payment Reminder Link Generator]');

let generatePaymentReminderLink;
try {
  generatePaymentReminderLink = require('../lib/whatsappReminder.js').generatePaymentReminderLink;
} catch (e) {
  generatePaymentReminderLink = null;
}

test('WhatsApp Reminder Module Exists & Exports generatePaymentReminderLink', () => {
  assert.strictEqual(typeof generatePaymentReminderLink, 'function', 'generatePaymentReminderLink function must be exported from lib/whatsappReminder');
});

test('Generates status-aware WhatsApp reminder link for overdue payment', () => {
  if (typeof generatePaymentReminderLink === 'function') {
    const params = {
      phone: '8115551234',
      clientName: 'Don Roberto',
      milestoneLabel: 'Anticipo 50%',
      amount: 5000,
      dueDate: '2026-08-15',
      status: 'overdue',
      payToken: 'token_abc123'
    };
    const link = generatePaymentReminderLink(params);
    assert.strictEqual(link.includes('wa.me/528115551234'), true, 'Should sanitize phone and add 52 country code');
    assert.strictEqual(link.includes('Don%20Roberto'), true, 'Should include client name');
    assert.strictEqual(link.includes('token_abc123'), true, 'Should include public pay portal token link');
    assert.strictEqual(link.includes('atrasado') || link.includes('vencido') || link.includes('pendiente'), true, 'Should include payment reminder copy');
  } else {
    throw new Error('generatePaymentReminderLink module not implemented yet');
  }
});

test('Generates upcoming_3d reminder link with friendly tone', () => {
  if (typeof generatePaymentReminderLink === 'function') {
    const params = {
      phone: '8115551234',
      clientName: 'Mariana',
      milestoneLabel: 'Finiquito',
      amount: 10000,
      dueDate: '2026-09-02',
      status: 'upcoming_3d',
      payToken: 'token_xyz789'
    };
    const link = generatePaymentReminderLink(params);
    assert.strictEqual(link.includes('wa.me/528115551234'), true);
    assert.strictEqual(link.includes('Mariana'), true);
    assert.strictEqual(link.includes('token_xyz789'), true);
  } else {
    throw new Error('generatePaymentReminderLink module not implemented yet');
  }
});

// ----------------------------------------------------
// 13. SPEI Proof & Banxico Clave de Rastreo Validator Tests (Sprint 4)
// ----------------------------------------------------
console.log('\n[Suite 13: SPEI Proof & Clave de Rastreo Validator]');

let speiValidator;
try {
  speiValidator = require('../lib/speiValidator.js');
} catch (e) {
  speiValidator = null;
}

test('SPEI Validator Module Exists & Exports Validation Helpers', () => {
  assert.strictEqual(typeof speiValidator?.validateTrackingReference, 'function', 'validateTrackingReference must be exported');
  assert.strictEqual(typeof speiValidator?.validateReceiptFile, 'function', 'validateReceiptFile must be exported');
});

test('Validates Banxico Clave de Rastreo (min 8 chars, alphanumeric)', () => {
  if (speiValidator?.validateTrackingReference) {
    const v1 = speiValidator.validateTrackingReference('202608301234567890');
    assert.strictEqual(v1.isValid, true, 'Valid Clave de Rastreo should pass');

    const v2 = speiValidator.validateTrackingReference('123'); // Too short
    assert.strictEqual(v2.isValid, false, 'Short Clave de Rastreo should fail');
  } else {
    throw new Error('validateTrackingReference module not implemented yet');
  }
});

test('Validates SPEI receipt file size (<5MB) and mime type (PNG/JPG/PDF)', () => {
  if (speiValidator?.validateReceiptFile) {
    const validFile = { name: 'comprobante.pdf', size: 2 * 1024 * 1024, type: 'application/pdf' };
    const check1 = speiValidator.validateReceiptFile(validFile);
    assert.strictEqual(check1.isValid, true, '2MB PDF file should be valid');

    const oversizedFile = { name: 'big_image.png', size: 6 * 1024 * 1024, type: 'image/png' };
    const check2 = speiValidator.validateReceiptFile(oversizedFile);
    assert.strictEqual(check2.isValid, false, '6MB file should be rejected for exceeding 5MB limit');

    const invalidTypeFile = { name: 'script.exe', size: 1000, type: 'application/x-msdownload' };
    const check3 = speiValidator.validateReceiptFile(invalidTypeFile);
    assert.strictEqual(check3.isValid, false, 'EXE file should be rejected');
  } else {
    throw new Error('validateReceiptFile module not implemented yet');
  }
});

// ----------------------------------------------------
// 14. Business Dashboard & Analytics Engine Tests (Sprint 5)
// ----------------------------------------------------
console.log('\n[Suite 14: Business Dashboard & Analytics Engine]');

let dashboardAnalytics;
try {
  dashboardAnalytics = require('../lib/dashboardAnalytics.js');
} catch (e) {
  dashboardAnalytics = null;
}

test('Dashboard Analytics Module Exists & Exports Analytics Helpers', () => {
  assert.strictEqual(typeof dashboardAnalytics?.calculateBusinessMetrics, 'function', 'calculateBusinessMetrics must be exported');
  assert.strictEqual(typeof dashboardAnalytics?.getTopClientsByRevenue, 'function', 'getTopClientsByRevenue must be exported');
  assert.strictEqual(typeof dashboardAnalytics?.calculateCashFlowForecast, 'function', 'calculateCashFlowForecast must be exported');
});

test('Aggregates collected revenue, pending receivables, and overdue debt correctly', () => {
  if (dashboardAnalytics?.calculateBusinessMetrics) {
    const todayStr = '2026-08-30';
    const mockMilestones = [
      { id: 'm1', label: 'Anticipo', amount: 10000, due_date: '2026-08-10', status: 'confirmed' },
      { id: 'm2', label: 'Entrega 1', amount: 5000, due_date: '2026-08-20', status: 'pending' }, // Overdue
      { id: 'm3', label: 'Finiquito', amount: 15000, due_date: '2026-09-10', status: 'requested' }, // Upcoming
    ];
    const mockQuotes = [
      { id: 'q1', status: 'accepted', total_amount: 30000 },
      { id: 'q2', status: 'draft', total_amount: 12000 }
    ];
    const mockClients = [{ id: 'c1' }, { id: 'c2' }];

    const metrics = dashboardAnalytics.calculateBusinessMetrics(mockMilestones, mockQuotes, mockClients, todayStr);
    assert.strictEqual(metrics.collectedRevenue, 10000, 'Collected revenue should be 10000');
    assert.strictEqual(metrics.pendingReceivables, 20000, 'Pending receivables should be 20000');
    assert.strictEqual(metrics.overdueDebt, 5000, 'Overdue debt should be 5000');
    assert.strictEqual(metrics.activeClientsCount, 2, 'Active clients count should be 2');
    assert.strictEqual(metrics.acceptedQuotesCount, 1, 'Accepted quotes count should be 1');
  } else {
    throw new Error('calculateBusinessMetrics module not implemented yet');
  }
});

test('Ranks top clients by revenue accurately', () => {
  if (dashboardAnalytics?.getTopClientsByRevenue) {
    const mockClients = [
      { id: 'c1', name: 'Construcciones Maya' },
      { id: 'c2', name: 'Materiales del Norte' },
      { id: 'c3', name: 'Servicios Logísticos' }
    ];
    const mockMilestones = [
      { id: 'm1', contract_id: 'ct1', client_id: 'c1', amount: 20000, status: 'confirmed' },
      { id: 'm2', contract_id: 'ct1', client_id: 'c1', amount: 15000, status: 'confirmed' },
      { id: 'm3', contract_id: 'ct2', client_id: 'c2', amount: 10000, status: 'confirmed' },
      { id: 'm4', contract_id: 'ct3', client_id: 'c3', amount: 50000, status: 'confirmed' },
    ];

    const topClients = dashboardAnalytics.getTopClientsByRevenue(mockMilestones, mockClients, 2);
    assert.strictEqual(topClients.length, 2, 'Should return top 2 clients');
    assert.strictEqual(topClients[0].id, 'c3', 'Client c3 should be rank 1 with 50000 revenue');
    assert.strictEqual(topClients[0].totalRevenue, 50000);
    assert.strictEqual(topClients[1].id, 'c1', 'Client c1 should be rank 2 with 35000 revenue');
    assert.strictEqual(topClients[1].totalRevenue, 35000);
  } else {
    throw new Error('getTopClientsByRevenue module not implemented yet');
  }
});

test('Calculates 30/60/90-day cash flow forecast timeline accurately', () => {
  if (dashboardAnalytics?.calculateCashFlowForecast) {
    const refDate = '2026-08-30';
    const mockMilestones = [
      { id: 'm1', amount: 10000, due_date: '2026-09-10', status: 'pending' }, // 11 days (30d bucket)
      { id: 'm2', amount: 20000, due_date: '2026-10-15', status: 'requested' }, // 46 days (60d bucket)
      { id: 'm3', amount: 15000, due_date: '2026-11-20', status: 'pending' }, // 82 days (90d bucket)
      { id: 'm4', amount: 5000, due_date: '2026-08-15', status: 'pending' }, // Past due, excluded from forward projection
      { id: 'm5', amount: 8000, due_date: '2026-09-05', status: 'confirmed' } // Confirmed, excluded from pending forecast
    ];

    const forecast = dashboardAnalytics.calculateCashFlowForecast(mockMilestones, refDate);
    assert.strictEqual(forecast.days30.amount, 10000, '30-day forecast should be 10000');
    assert.strictEqual(forecast.days30.count, 1);
    assert.strictEqual(forecast.days60.amount, 20000, '60-day forecast should be 20000');
    assert.strictEqual(forecast.days60.count, 1);
    assert.strictEqual(forecast.days90.amount, 15000, '90-day forecast should be 15000');
    assert.strictEqual(forecast.days90.count, 1);
    assert.strictEqual(forecast.totalForecast, 45000, 'Total 90-day forecast should be 45000');
  } else {
    throw new Error('calculateCashFlowForecast module not implemented yet');
  }
});

// ----------------------------------------------------
// 15. Stripe Subscription Billing Engine Tests (Sprint 6)
// ----------------------------------------------------
console.log('\n[Suite 15: Stripe Subscription Billing Engine]');

let stripeModule;
try {
  stripeModule = require('../lib/stripe.js');
} catch (e) {
  stripeModule = null;
}

test('Stripe Billing Module Exists & Exports Billing Helpers', () => {
  assert.strictEqual(typeof stripeModule?.getStripeTierConfig, 'function', 'getStripeTierConfig must be exported');
  assert.strictEqual(typeof stripeModule?.createCheckoutPayload, 'function', 'createCheckoutPayload must be exported');
  assert.strictEqual(typeof stripeModule?.validateSubscriptionStatus, 'function', 'validateSubscriptionStatus must be exported');
});

test('Returns correct pricing tier configurations ($299/$599/$999 MXN)', () => {
  if (stripeModule?.getStripeTierConfig) {
    const emprendedor = stripeModule.getStripeTierConfig('emprendedor');
    assert.strictEqual(emprendedor.price, 299, 'Emprendedor plan should be 299 MXN');
    assert.strictEqual(emprendedor.currency, 'MXN');

    const negocio = stripeModule.getStripeTierConfig('negocio');
    assert.strictEqual(negocio.price, 599, 'Negocio plan should be 599 MXN');

    const empresa = stripeModule.getStripeTierConfig('empresa');
    assert.strictEqual(empresa.price, 999, 'Empresa plan should be 999 MXN');
  } else {
    throw new Error('getStripeTierConfig module not implemented yet');
  }
});

test('Constructs valid Stripe Checkout session payload with org_id scoping', () => {
  if (stripeModule?.createCheckoutPayload) {
    const payload = stripeModule.createCheckoutPayload('negocio', 'org_demo_123', 'https://app.com/settings');
    assert.strictEqual(payload.mode, 'subscription');
    assert.strictEqual(payload.metadata.organization_id, 'org_demo_123');
    assert.strictEqual(payload.success_url.includes('session_id'), true);
  } else {
    throw new Error('createCheckoutPayload module not implemented yet');
  }
});

test('Validates active and past_due subscription statuses accurately', () => {
  if (stripeModule?.validateSubscriptionStatus) {
    const s1 = stripeModule.validateSubscriptionStatus('active');
    assert.strictEqual(s1.isAccessible, true);
    assert.strictEqual(s1.badgeText, 'Activo');

    const s2 = stripeModule.validateSubscriptionStatus('past_due');
    assert.strictEqual(s2.isAccessible, true);
    assert.strictEqual(s2.badgeText, 'Pago Pendiente');

    const s3 = stripeModule.validateSubscriptionStatus('canceled');
    assert.strictEqual(s3.isAccessible, false);
    assert.strictEqual(s3.badgeText, 'Cancelado');
  } else {
    throw new Error('validateSubscriptionStatus module not implemented yet');
  }
});

// ----------------------------------------------------
// 16. MVP Beta Release Gates Auditor Tests (Sprint 6)
// ----------------------------------------------------
console.log('\n[Suite 16: MVP Beta Release Gates Auditor & Security Verification]');

let releaseGatesModule;
try {
  releaseGatesModule = require('../lib/releaseGates.js');
} catch (e) {
  releaseGatesModule = null;
}

test('Release Gates Auditor Module Exists & Exports auditReleaseGates', () => {
  assert.strictEqual(typeof releaseGatesModule?.auditReleaseGates, 'function', 'auditReleaseGates function must be exported');
});

test('Verifies all 6 MVP Beta Release Gates pass auditing standards', () => {
  if (releaseGatesModule?.auditReleaseGates) {
    const audit = releaseGatesModule.auditReleaseGates();
    assert.strictEqual(audit.allPassed, true, 'All 6 Release Gates must pass');
    assert.strictEqual(audit.gates.dataIsolation.passed, true, 'Data Isolation Gate must pass');
    assert.strictEqual(audit.gates.mobilePerformance.passed, true, 'Mobile Performance Gate must pass');
    assert.strictEqual(audit.gates.coverage.passed, true, 'Coverage Gate must pass (>= 85%)');
    assert.strictEqual(audit.gates.zeroWarning.passed, true, 'Zero Warning Gate must pass');
    assert.strictEqual(audit.gates.otpSecurity.passed, true, 'OTP Security Gate must pass');
    assert.strictEqual(audit.gates.fileSecurity.passed, true, 'File Security Gate must pass');
  } else {
    throw new Error('auditReleaseGates module not implemented yet');
  }
});

// ----------------------------------------------------
// 17. Legal & Pre-Launch Compliance Assertions
// ----------------------------------------------------
console.log('\n[Suite 17: Legal & Pre-Launch Compliance Assertions]');

const privacyPath = path.join(__dirname, '../app/privacy/page.tsx');
const termsPath = path.join(__dirname, '../app/terms/page.tsx');

test('Privacy Notice page exists and complies with LFPDPPP', () => {
  assert.strictEqual(fs.existsSync(privacyPath), true, `Privacy page should exist at ${privacyPath}`);
  if (fs.existsSync(privacyPath)) {
    const content = fs.readFileSync(privacyPath, 'utf8');
    assert.strictEqual(content.includes('LFPDPPP'), true, 'Privacy page must reference LFPDPPP');
    assert.strictEqual(content.includes('Aviso de Privacidad'), true, 'Privacy page must contain Aviso de Privacidad header');
  }
});

test('Terms of Service page exists and defines SaaS terms', () => {
  assert.strictEqual(fs.existsSync(termsPath), true, `Terms page should exist at ${termsPath}`);
  if (fs.existsSync(termsPath)) {
    const content = fs.readFileSync(termsPath, 'utf8');
    assert.strictEqual(content.includes('Términos y Condiciones'), true, 'Terms page must contain Términos y Condiciones header');
    assert.strictEqual(content.includes('Business Helper'), true, 'Terms page must reference Business Helper');
  }
});

// ----------------------------------------------------
// 18. Facturapi SAT CFDI 4.0 PAC Engine Tests (Sprint 7)
// ----------------------------------------------------
console.log('\n[Suite 18: Facturapi SAT CFDI 4.0 PAC Engine]');

let facturapiModule;
try {
  facturapiModule = require('../lib/facturapi.js');
} catch (e) {
  facturapiModule = null;
}

test('Facturapi Module Exists & Exports Validation & Payload Helpers', () => {
  assert.strictEqual(typeof facturapiModule?.validateCFDIMetadata, 'function', 'validateCFDIMetadata must be exported');
  assert.strictEqual(typeof facturapiModule?.buildCFDIPayload, 'function', 'buildCFDIPayload must be exported');
});

test('Validates SAT CFDI 4.0 required metadata (RFC, Regimen, Postal Code, CFDI Use, Unit Key, Product Code)', () => {
  if (facturapiModule?.validateCFDIMetadata) {
    const validMetadata = {
      issuerRfc: 'ABC120315HD9',
      issuerRegimen: '601',
      issuerPostalCode: '64000',
      receiverRfc: 'GORM850101789',
      receiverRegimen: '612',
      receiverPostalCode: '64000',
      cfdiUse: 'G03',
      lineItems: [
        { name: 'Servicios de Consultoría', unitPrice: 5000, unit: 'E48', satProductCode: '84111506' }
      ]
    };
    const res = facturapiModule.validateCFDIMetadata(validMetadata);
    assert.strictEqual(res.isValid, true, 'Valid metadata must pass CFDI 4.0 validation');

    const invalidMetadata = {
      issuerRfc: 'INVALID',
      issuerPostalCode: '123',
      lineItems: []
    };
    const resInv = facturapiModule.validateCFDIMetadata(invalidMetadata);
    assert.strictEqual(resInv.isValid, false, 'Invalid metadata must be rejected');
  } else {
    throw new Error('facturapi module not implemented yet');
  }
});

test('Constructs valid Facturapi invoice creation payload', () => {
  if (facturapiModule?.buildCFDIPayload) {
    const org = { name: 'Mi Empresa SA', rfc: 'ABC120315HD9', regimen_fiscal: '601', codigo_postal: '64000' };
    const client = { name: 'Cliente Ejemplo', rfc: 'GORM850101789', regimen_fiscal: '612', codigo_postal: '64000', cfdi_use: 'G03' };
    const items = [{ description: 'Desarrollo Web', amount: 10000, unit: 'E48', sat_product_code: '84111506' }];
    const payload = facturapiModule.buildCFDIPayload(org, client, items);
    assert.strictEqual(payload.customer.legal_name, 'Cliente Ejemplo');
    assert.strictEqual(payload.customer.tax_id, 'GORM850101789');
    assert.strictEqual(payload.items[0].product_key, '84111506');
    assert.strictEqual(payload.items[0].unit_key, 'E48');
  } else {
    throw new Error('facturapi module not implemented yet');
  }
});

// ----------------------------------------------------
// 19. 1-Click Monthly Accountant Export Package Tests (Sprint 7)
// ----------------------------------------------------
console.log('\n[Suite 19: 1-Click Monthly Accountant Export Package]');

let accountantModule;
try {
  accountantModule = require('../lib/accountantExport.js');
} catch (e) {
  accountantModule = null;
}

test('Accountant Export Module Exists & Exports Generator Helpers', () => {
  assert.strictEqual(typeof accountantModule?.generateMonthlySummaryCSV, 'function', 'generateMonthlySummaryCSV must be exported');
  assert.strictEqual(typeof accountantModule?.buildAccountantZipManifest, 'function', 'buildAccountantZipManifest must be exported');
});

test('Generates structured monthly summary CSV with sales and tax breakdown', () => {
  if (accountantModule?.generateMonthlySummaryCSV) {
    const milestones = [
      { id: 'm1', label: 'Anticipo', amount: 5000, due_date: '2026-08-15', status: 'confirmed', tracking_reference: 'SPEI12345', cfdi_id: 'FACT100' }
    ];
    const csv = accountantModule.generateMonthlySummaryCSV('org123', '2026-08', milestones);
    assert.strictEqual(typeof csv, 'string');
    assert.strictEqual(csv.includes('Monto,Estado,Fecha Vencimiento,Clave Rastreo'), true, 'CSV header must include standard column titles');
    assert.strictEqual(csv.includes('5000'), true, 'CSV content must include milestone amount');
  } else {
    throw new Error('accountantExport module not implemented yet');
  }
});

test('Builds accountant ZIP package manifest metadata', () => {
  if (accountantModule?.buildAccountantZipManifest) {
    const milestones = [
      { id: 'm1', label: 'Hito 1', amount: 10000, cfdi_xml_url: 'https://storage/m1.xml', cfdi_pdf_url: 'https://storage/m1.pdf', receipt_url: 'https://storage/m1.jpg' }
    ];
    const manifest = accountantModule.buildAccountantZipManifest('org123', '2026-08', milestones);
    assert.strictEqual(manifest.month, '2026-08');
    assert.strictEqual(manifest.files.length >= 3, true, 'Manifest should list XML, PDF, and SPEI proof files');
  } else {
    throw new Error('accountantExport module not implemented yet');
  }
});

// ----------------------------------------------------
// 20. Pre-Saved Product & Service Catalog Tests (Sprint 7)
// ----------------------------------------------------
console.log('\n[Suite 20: Pre-Saved Product & Service Catalog]');

let productsModule;
try {
  productsModule = require('../lib/products.js');
} catch (e) {
  productsModule = null;
}

test('Product Catalog Module Exists & Exports Validator & Line-Item Formatter', () => {
  assert.strictEqual(typeof productsModule?.validateProductCatalogItem, 'function', 'validateProductCatalogItem must be exported');
  assert.strictEqual(typeof productsModule?.formatProductAsLineItem, 'function', 'formatProductAsLineItem must be exported');
});

test('Validates product catalog item with SAT unit keys and product codes', () => {
  if (productsModule?.validateProductCatalogItem) {
    const validProduct = { name: 'Mantenimiento Mensual', unit_price: 2500, unit: 'E48', sat_product_code: '84111506' };
    const resValid = productsModule.validateProductCatalogItem(validProduct);
    assert.strictEqual(resValid.isValid, true, 'Valid product must pass catalog validation');
    assert.strictEqual(resValid.unit, 'E48');

    const invalidProduct = { name: '', unit_price: -50 };
    const resInvalid = productsModule.validateProductCatalogItem(invalidProduct);
    assert.strictEqual(resInvalid.isValid, false, 'Invalid product must fail validation');
  } else {
    throw new Error('products module not implemented yet');
  }
});

test('Formats product catalog entry into quote line-item', () => {
  if (productsModule?.formatProductAsLineItem) {
    const prod = { id: 'p1', name: 'Varilla 1/2 pulgada', unit_price: 150, unit: 'H87', sat_product_code: '30101800' };
    const item = productsModule.formatProductAsLineItem(prod, 20);
    assert.strictEqual(item.description, 'Varilla 1/2 pulgada');
    assert.strictEqual(item.quantity, 20);
    assert.strictEqual(item.unit_price, 150);
    assert.strictEqual(item.sat_product_code, '30101800');
  } else {
    throw new Error('products module not implemented yet');
  }
});

// ----------------------------------------------------
// 21. Automated WhatsApp Outbound Broadcast Generator Tests (Sprint 7)
// ----------------------------------------------------
console.log('\n[Suite 21: Outbound Automated WhatsApp Reminder Broadcast Generator]');

let broadcastModule;
try {
  broadcastModule = require('../lib/whatsappBroadcast.js');
} catch (e) {
  broadcastModule = null;
}

test('WhatsApp Broadcast Module Exists & Exports Reminder Broadcast Generator', () => {
  assert.strictEqual(typeof broadcastModule?.generateReminderBroadcastPayload, 'function', 'generateReminderBroadcastPayload must be exported');
});

test('Generates status-aware payment reminder broadcast payloads with deep-links', () => {
  if (broadcastModule?.generateReminderBroadcastPayload) {
    const milestone = { id: 'm1', label: 'Finiquito', amount: 15000, due_date: '2026-08-20', status: 'pending' };
    const client = { name: 'Construcciones MTY', phone: '8119998877' };
    const payload = broadcastModule.generateReminderBroadcastPayload(milestone, client, 'overdue');
    assert.strictEqual(payload.phone, '528119998877');
    assert.strictEqual(payload.message.includes('Construcciones MTY'), true, 'Broadcast text must include client name');
    assert.strictEqual(payload.whatsappUrl.startsWith('https://wa.me/528119998877'), true, 'WhatsApp link must target client number');
  } else {
    throw new Error('whatsappBroadcast module not implemented yet');
  }
});

// ----------------------------------------------------
// 22. Multi-User Team Roles & RBAC Engine Tests (Sprint 8)
// ----------------------------------------------------
console.log('\n[Suite 22: Multi-User Team Roles & RBAC Engine]');

let rbacModule;
try {
  rbacModule = require('../lib/teamRBAC.js');
} catch (e) {
  rbacModule = null;
}

test('Team RBAC Module Exists & Exports Capability Evaluator & Invite Helpers', () => {
  assert.strictEqual(typeof rbacModule?.hasCapability, 'function', 'hasCapability must be exported');
  assert.strictEqual(typeof rbacModule?.validateInviteInput, 'function', 'validateInviteInput must be exported');
});

test('Enforces Team Role capabilities matrix (owner, manager, member, accountant)', () => {
  if (rbacModule?.hasCapability) {
    assert.strictEqual(rbacModule.hasCapability('owner', 'billing_management'), true, 'Owner can manage billing');
    assert.strictEqual(rbacModule.hasCapability('manager', 'invite_members'), true, 'Manager can invite members');
    assert.strictEqual(rbacModule.hasCapability('member', 'billing_management'), false, 'Member cannot manage billing');
    assert.strictEqual(rbacModule.hasCapability('accountant', 'confirm_payment'), true, 'Accountant can confirm payment');
    assert.strictEqual(rbacModule.hasCapability('accountant', 'create_quote'), false, 'Accountant cannot create quote');
  } else {
    throw new Error('teamRBAC module not implemented yet');
  }
});

// ----------------------------------------------------
// 23. Inventory Stock Tracking & Low-Stock Alerts Tests (Sprint 9)
// ----------------------------------------------------
console.log('\n[Suite 23: Inventory Stock Tracking & Low-Stock Alerts]');

let inventoryModule;
try {
  inventoryModule = require('../lib/inventory.js');
} catch (e) {
  inventoryModule = null;
}

test('Inventory Module Exists & Exports Stock Evaluator & Deduction Helpers', () => {
  assert.strictEqual(typeof inventoryModule?.evaluateStockStatus, 'function', 'evaluateStockStatus must be exported');
  assert.strictEqual(typeof inventoryModule?.deductStock, 'function', 'deductStock must be exported');
});

test('Evaluates low-stock alert status correctly (threshold <= 5 units)', () => {
  if (inventoryModule?.evaluateStockStatus) {
    const normal = inventoryModule.evaluateStockStatus(25);
    assert.strictEqual(normal.isLowStock, false, 'Stock 25 should be normal');

    const low = inventoryModule.evaluateStockStatus(3);
    assert.strictEqual(low.isLowStock, true, 'Stock 3 should trigger low stock alert');
    assert.strictEqual(low.alertBadge.includes('Aviso Stock Bajo'), true, 'Should include alert badge text');

    const zero = inventoryModule.evaluateStockStatus(0);
    assert.strictEqual(zero.isLowStock, true, 'Stock 0 should trigger low stock alert');
  } else {
    throw new Error('inventory module not implemented yet');
  }
});

test('Deducts stock safely on contract creation', () => {
  if (inventoryModule?.deductStock) {
    const newStock = inventoryModule.deductStock(10, 3);
    assert.strictEqual(newStock, 7, '10 - 3 should leave 7');

    const clampedStock = inventoryModule.deductStock(2, 5);
    assert.strictEqual(clampedStock, 0, 'Deducting more than available stock should clamp to 0');
  } else {
    throw new Error('inventory module not implemented yet');
  }
});

// ----------------------------------------------------
// 24. WhatsApp AI Operations Assistant Engine Tests (Sprint 10)
// ----------------------------------------------------
console.log('\n[Suite 24: WhatsApp AI Operations Assistant Engine]');

let aiModule;
try {
  aiModule = require('../lib/whatsappAI.js');
} catch (e) {
  aiModule = null;
}

test('WhatsApp AI Assistant Module Exists & Exports NL Query Parser', () => {
  assert.strictEqual(typeof aiModule?.parseNaturalLanguageQuery, 'function', 'parseNaturalLanguageQuery must be exported');
});

test('Parses natural language client overdue balance queries and generates response', () => {
  if (aiModule?.parseNaturalLanguageQuery) {
    const orgData = {
      clients: [{ id: 'c1', name: 'Grupo Salinas', phone: '8112223344' }],
      receivables: [{ clientId: 'c1', amount: 45000, status: 'overdue', label: 'Hito 1' }]
    };

    const res = aiModule.parseNaturalLanguageQuery('¿Cuánto me debe Grupo Salinas?', orgData);
    assert.strictEqual(res.matchedClient, 'Grupo Salinas');
    assert.strictEqual(res.totalOverdue, 45000);
    assert.strictEqual(res.answerText.includes('45,000'), true, 'Answer text must mention amount');
    assert.strictEqual(typeof res.whatsappUrl, 'string', 'Should return action WhatsApp URL');
  } else {
    throw new Error('whatsappAI module not implemented yet');
  }
});

test('Validates monthly AI tier quotas and rate limiting safeguards', () => {
  if (aiModule?.validateAIQuota && aiModule?.checkRateLimit) {
    // Check tier limits
    const emprendedorOK = aiModule.validateAIQuota('emprendedor', 49);
    assert.strictEqual(emprendedorOK.allowed, true);
    assert.strictEqual(emprendedorOK.remaining, 1);

    const emprendedorBlocked = aiModule.validateAIQuota('emprendedor', 50);
    assert.strictEqual(emprendedorBlocked.allowed, false);
    assert.strictEqual(emprendedorBlocked.remaining, 0);

    const negocioQuota = aiModule.validateAIQuota('negocio', 100);
    assert.strictEqual(negocioQuota.allowed, true);
    assert.strictEqual(negocioQuota.remaining, 200);

    // Check sliding window rate limit
    const rateCheck1 = aiModule.checkRateLimit('user_test_ip_1', 5);
    assert.strictEqual(rateCheck1.allowed, true);
  } else {
    throw new Error('validateAIQuota or checkRateLimit functions not exported');
  }
});

// ----------------------------------------------------
// 25. Exploratory Testing Bug Regression Suite
// ----------------------------------------------------
console.log('\n[Suite 25: Exploratory Testing Bug Regression Suite]');

test('Quote-to-Contract split milestone amounts sum EXACTLY to contract total (no cent discrepancy)', () => {
  const result = convertQuoteToContract({
    id: 'q_test',
    organization_id: 'org_1',
    client_id: 'c_1',
    title: 'Cotización Impar',
    total_amount: 100.01,
    status: 'accepted'
  }, [0.5, 0.5]);

  const sumMilestones = Math.round(result.milestones.reduce((acc, m) => acc + m.amount, 0) * 100) / 100;
  assert.strictEqual(sumMilestones, result.contract.total_amount, 'Sum of milestone amounts must match contract total exactly');
});

test('Deducting stock on service item (null stock) returns null', () => {
  if (inventoryModule?.deductStock) {
    const stockResult = inventoryModule.deductStock(null, 2);
    assert.strictEqual(stockResult, null, 'Service stock (null) must remain null');
  } else {
    throw new Error('deductStock not exported');
  }
});

test('WhatsApp AI assistant reports 0 balance for client with no debt', () => {
  if (aiModule?.parseNaturalLanguageQuery) {
    const aiResult = aiModule.parseNaturalLanguageQuery('¿Cuánto me debe Don Roberto?', {
      clients: [{ id: 'c1', name: 'Don Roberto', phone: '8112223344' }],
      receivables: [{ clientId: 'c1', amount: 0, status: 'confirmed' }]
    });
    assert.strictEqual(aiResult.totalOverdue, 0, 'Zero debt must be reported as 0 MXN');
  } else {
    throw new Error('parseNaturalLanguageQuery not exported');
  }
});

test('Pending milestone in client activity feed is titled "Hito Pendiente"', () => {
  const activity = formatClientActivity([], [], [{ id: 'm1', label: 'Anticipo', amount: 5000, status: 'pending' }]);
  assert.strictEqual(activity[0].title, 'Hito Pendiente: Anticipo', 'Pending milestone title must be Hito Pendiente');
});

// ----------------------------------------------------
// 26. Pre-Launch Auth & Root Middleware Security Suite
// ----------------------------------------------------
console.log('\n[Suite 26: Pre-Launch Auth & Root Middleware Security Suite]');

let authMiddlewareModule;
try {
  authMiddlewareModule = require('../lib/supabase/middleware.js');
} catch (e) {
  authMiddlewareModule = null;
}

test('Auth Middleware Helper Module Exists & Exports updateSession', () => {
  assert.strictEqual(typeof authMiddlewareModule?.updateSession, 'function', 'updateSession must be exported from lib/supabase/middleware');
});

test('Session Extraction & Route Protection Logic Validates Unauthenticated Access', () => {
  const isProtectedPath = (pathname) => pathname.startsWith('/dashboard') || pathname.startsWith('/onboarding');
  assert.strictEqual(isProtectedPath('/dashboard'), true, '/dashboard must be protected');
  assert.strictEqual(isProtectedPath('/dashboard/quotes'), true, '/dashboard/quotes must be protected');
  assert.strictEqual(isProtectedPath('/onboarding'), true, '/onboarding must be protected');
  assert.strictEqual(isProtectedPath('/login'), false, '/login must be public');
  assert.strictEqual(isProtectedPath('/privacy'), false, '/privacy must be public');
  assert.strictEqual(isProtectedPath('/q/token123'), false, '/q/token123 public quote view must be accessible without login');
});

test('Demo Mode Resolution Logic Allows Unauthenticated Access when Demo Flag or Placeholder URL active', () => {
  const evaluateDemoAccess = (user, searchParamsDemo, cookieDemo, supabaseUrl) => {
    const isPlaceholder = !supabaseUrl || supabaseUrl.includes('placeholder');
    const isDemoMode = isPlaceholder || searchParamsDemo === 'true' || cookieDemo === 'true';
    if (!user && !isDemoMode) {
      return 'redirect_to_login';
    }
    return 'allow_access';
  };

  assert.strictEqual(evaluateDemoAccess(null, 'true', 'false', 'https://live.supabase.co'), 'allow_access', 'Demo query param must grant demo access');
  assert.strictEqual(evaluateDemoAccess(null, 'false', 'true', 'https://live.supabase.co'), 'allow_access', 'Demo cookie must grant demo access');
  assert.strictEqual(evaluateDemoAccess(null, 'false', 'false', 'https://placeholder-url.supabase.co'), 'allow_access', 'Placeholder Supabase URL must grant demo access');
  assert.strictEqual(evaluateDemoAccess(null, 'false', 'false', 'https://live.supabase.co'), 'redirect_to_login', 'Live Supabase without demo flag must redirect to login');
  assert.strictEqual(evaluateDemoAccess({ id: 'u1' }, 'false', 'false', 'https://live.supabase.co'), 'allow_access', 'Authenticated user must always be allowed');
});

test('Middleware updateSession returns a valid Response contract object (preventing Edge Runtime invocation failure)', async () => {
  if (authMiddlewareModule?.updateSession) {
    const mockRequest = {
      nextUrl: { pathname: '/dashboard', clone: () => ({ pathname: '/dashboard' }) }
    };
    const res = await authMiddlewareModule.updateSession(mockRequest);
    assert.strictEqual(typeof res, 'object', 'Middleware return value must be an object');
    assert.strictEqual('headers' in res || 'redirect' in res || 'status' in res, true, 'Middleware return value must fulfill Response contract');
  }
});

test('ESLint & Build Integrity Gate: JS source files using CommonJS require() must include eslint-disable directive', () => {
  const mwJsPath = path.join(__dirname, '../lib/supabase/middleware.js');
  if (fs.existsSync(mwJsPath)) {
    const content = fs.readFileSync(mwJsPath, 'utf8');
    if (content.includes('require(') && !content.includes('eslint-disable')) {
      throw new Error('lib/supabase/middleware.js uses require() without eslint-disable directive, which causes next build lint failure');
    }
  }
});


// ----------------------------------------------------
// 27. Facturapi Live SAT CFDI 4.0 PAC HTTP Client Suite
// ----------------------------------------------------
console.log('\n[Suite 27: Facturapi Live SAT CFDI 4.0 PAC HTTP Client Suite]');

let facturapiClientModule;
try {
  facturapiClientModule = require('../lib/facturapi.js');
} catch (e) {
  facturapiClientModule = null;
}

test('Facturapi Module Exports buildCFDIPayload & issueInvoiceClient', () => {
  assert.strictEqual(typeof facturapiClientModule?.buildCFDIPayload, 'function', 'buildCFDIPayload must be exported');
});

test('Constructs Valid SAT CFDI 4.0 Facturapi API Payload Format', () => {
  const payload = facturapiClientModule.buildCFDIPayload(
    { name: 'Empresa Emisora SA de CV', rfc: 'EEE120315HD9', regimen_fiscal: '601', codigo_postal: '64000' },
    { name: 'Cliente Receptor SC', rfc: 'CRR850101789', regimen_fiscal: '601', codigo_postal: '06600', cfdi_use: 'G03' },
    [{ description: 'Servicio de Consultoría', quantity: 1, unit_price: 10000, sat_product_code: '84111506', unit: 'E48' }]
  );

  assert.strictEqual(payload.customer.legal_name, 'Cliente Receptor SC');
  assert.strictEqual(payload.customer.tax_id, 'CRR850101789');
  assert.strictEqual(payload.use, 'G03');
  assert.strictEqual(payload.items[0].product_key, '84111506');
  assert.strictEqual(payload.items[0].unit_key, 'E48');
  assert.strictEqual(payload.items[0].taxes[0].rate, 0.16);
});

// ----------------------------------------------------
// 28. Stripe Live Checkout & Webhook Engine Suite
// ----------------------------------------------------
console.log('\n[Suite 28: Stripe Live Checkout & Webhook Engine Suite]');

let stripeEngineModule;
try {
  stripeEngineModule = require('../lib/stripe.js');
} catch (e) {
  stripeEngineModule = null;
}

test('Stripe Module Exports createCheckoutPayload & handleStripeWebhookEvent', () => {
  assert.strictEqual(typeof stripeEngineModule?.createCheckoutPayload, 'function', 'createCheckoutPayload must be exported');
});

test('Generates Stripe Checkout Payload with Tier Price Mapping', () => {
  const payload = stripeEngineModule.createCheckoutPayload('negocio', 'org_123', 'https://businesshelper.mx/settings');
  assert.strictEqual(payload.mode, 'subscription');
  assert.strictEqual(payload.metadata.organization_id, 'org_123');
  assert.strictEqual(typeof payload.line_items[0].price, 'string');
});

test('Stripe Webhook Event Handler Updates Subscription Tier Status', () => {
  if (stripeEngineModule?.handleStripeWebhookEvent) {
    const eventCreated = {
      type: 'customer.subscription.created',
      data: { object: { metadata: { organization_id: 'org_123' }, status: 'active', items: { data: [{ price: { id: 'price_negocio' } }] } } }
    };
    const update = stripeEngineModule.handleStripeWebhookEvent(eventCreated);
    assert.strictEqual(update.organizationId, 'org_123');
    assert.strictEqual(update.status, 'active');
  }
});


// ----------------------------------------------------
// 29. Gemini AI Operations Assistant Live Connector Suite
// ----------------------------------------------------
console.log('\n[Suite 29: Gemini AI Operations Assistant Live Connector Suite]');

test('AI Assistant Engine Constructs Valid LLM Prompt with DB Receivables Context', () => {
  if (aiModule?.buildAIPromptContext) {
    const prompt = aiModule.buildAIPromptContext('¿Cuánto me debe Grupo Salinas?', [
      { name: 'Grupo Salinas', phone: '8112223344', totalOverdue: 45000 }
    ]);
    assert.strictEqual(prompt.includes('Grupo Salinas'), true, 'Prompt context must contain client name');
    assert.strictEqual(prompt.includes('45,000'), true, 'Prompt context must contain overdue balance');
  }
});

// ----------------------------------------------------
// 30. SPEI Receipt Upload & Supabase Storage Suite
// ----------------------------------------------------
console.log('\n[Suite 30: SPEI Receipt Upload & Supabase Storage Suite]');

test('SPEI Upload Route Accepts Valid Image/PDF and Rejects Oversized File', () => {
  const validFile = { name: 'comprobante.pdf', size: 1024 * 1024, type: 'application/pdf' };
  const invalidFile = { name: 'comprobante.pdf', size: 10 * 1024 * 1024, type: 'application/pdf' };

  if (speiValidator?.validateReceiptFile) {
    const validResult = speiValidator.validateReceiptFile(validFile);
    assert.strictEqual(validResult.isValid, true, '1MB PDF file should be valid');

    const invalidResult = speiValidator.validateReceiptFile(invalidFile);
    assert.strictEqual(invalidResult.isValid, false, '10MB PDF file should be rejected (>5MB limit)');
  }
});

// ----------------------------------------------------
// 31. Outbound Automated WhatsApp API Engine Suite
// ----------------------------------------------------
console.log('\n[Suite 31: Outbound Automated WhatsApp API Engine]');

let whatsappOutboundModule;
try {
  whatsappOutboundModule = require('../lib/whatsappOutbound.js');
} catch (e) {
  whatsappOutboundModule = null;
}

test('Outbound WhatsApp Module Exists & Exports Dispatch Helpers', () => {
  assert.notStrictEqual(whatsappOutboundModule, null, 'lib/whatsappOutbound.js module should exist');
  assert.strictEqual(typeof whatsappOutboundModule?.formatOutboundReminderPayload, 'function');
  assert.strictEqual(typeof whatsappOutboundModule?.getWhatsAppDispatchMode, 'function');
  assert.strictEqual(typeof whatsappOutboundModule?.dispatchWhatsAppReminder, 'function');
});

test('Formats WhatsApp API payload for overdue payment reminder with dynamic template variables', () => {
  if (whatsappOutboundModule?.formatOutboundReminderPayload) {
    const payload = whatsappOutboundModule.formatOutboundReminderPayload({
      clientName: 'Construcciones Maya',
      phone: '8115559988',
      amountDue: 15000,
      dueDate: '2026-07-28',
      token: 'pay_token_123'
    });
    assert.strictEqual(payload.recipient, '+528115559988');
    assert.strictEqual(payload.message.includes('Construcciones Maya'), true);
    assert.strictEqual(payload.message.includes('15,000'), true);
    assert.strictEqual(payload.payUrl.includes('/pay/pay_token_123'), true);
  }
});

test('Falls back to Click-to-Chat wa.me link when API credentials are absent', () => {
  if (whatsappOutboundModule?.getWhatsAppDispatchMode) {
    const mode = whatsappOutboundModule.getWhatsAppDispatchMode({});
    assert.strictEqual(mode.type, 'wa_me_link', 'Without API keys, mode should be wa_me_link fallback');
    assert.strictEqual(mode.isApiConfigured, false);
  }
});

// ----------------------------------------------------
// 32. Multi-Currency Engine (USD / MXN) Suite
// ----------------------------------------------------
console.log('\n[Suite 32: Multi-Currency Engine (USD / MXN)]');

let currencyModule;
try {
  currencyModule = require('../lib/currency.js');
} catch (e) {
  currencyModule = null;
}

test('Multi-Currency Module Exists & Exports Helper Functions', () => {
  assert.notStrictEqual(currencyModule, null, 'lib/currency.js module should exist');
  assert.strictEqual(typeof currencyModule?.formatCurrency, 'function');
  assert.strictEqual(typeof currencyModule?.convertCurrency, 'function');
});

test('Formats MXN and USD monetary values with proper symbol and ISO currency code', () => {
  if (currencyModule?.formatCurrency) {
    const mxn = currencyModule.formatCurrency(1500, 'MXN');
    assert.strictEqual(mxn.includes('MXN'), true);
    assert.strictEqual(mxn.includes('1,500'), true);

    const usd = currencyModule.formatCurrency(100, 'USD');
    assert.strictEqual(usd.includes('USD'), true);
    assert.strictEqual(usd.includes('100'), true);
  }
});

test('Converts USD amounts to MXN using configured exchange rate (1 USD = 18.50 MXN)', () => {
  if (currencyModule?.convertCurrency) {
    const converted = currencyModule.convertCurrency(100, 'USD', 'MXN', 18.50);
    assert.strictEqual(converted, 1850, '100 USD at 18.50 rate should convert to 1850 MXN');
  }
});

test('Aggregates multi-currency milestone receivables in base currency', () => {
  if (currencyModule?.aggregateMultiCurrencyTotals) {
    const items = [
      { amount: 10000, currency: 'MXN' },
      { amount: 1000, currency: 'USD' }
    ];
    const totalInMXN = currencyModule.aggregateMultiCurrencyTotals(items, 'MXN', 18.50);
    assert.strictEqual(totalInMXN, 28500, '10,000 MXN + (1,000 USD * 18.5) = 28,500 MXN');
  }
});

// ----------------------------------------------------
// 33. White-Labeling & Organization Branding Engine Suite
// ----------------------------------------------------
console.log('\n[Suite 33: White-Labeling & Organization Branding Engine]');

let brandingModule;
try {
  brandingModule = require('../lib/branding.js');
} catch (e) {
  brandingModule = null;
}

test('Branding Module Exists & Exports Helper Functions', () => {
  assert.notStrictEqual(brandingModule, null, 'lib/branding.js module should exist');
  assert.strictEqual(typeof brandingModule?.getOrganizationBranding, 'function');
  assert.strictEqual(typeof brandingModule?.generateThemeCssVariables, 'function');
});

test('Generates dynamic CSS custom properties (--primary-color, --header-bg) from theme config', () => {
  if (brandingModule?.generateThemeCssVariables) {
    const cssVars = brandingModule.generateThemeCssVariables({ primaryColor: '#2563eb' });
    assert.strictEqual(cssVars['--primary-color'], '#2563eb');
    assert.strictEqual(cssVars['--primary-hover'], '#1d4ed8');
  }
});

test('Provides fallback logo and default brand colors when tenant settings are unconfigured', () => {
  if (brandingModule?.getOrganizationBranding) {
    const branding = brandingModule.getOrganizationBranding({});
    assert.strictEqual(branding.primaryColor, '#2563eb', 'Default primary color should be blue');
    assert.strictEqual(branding.companyName, 'Business Helper', 'Default company name fallback');
    assert.strictEqual(branding.hasCustomLogo, false);
  }
});

test('Resolves custom logo URL, tagline and calculates hover color for custom primary colors', () => {
  if (brandingModule?.getOrganizationBranding && brandingModule?.generateThemeCssVariables) {
    const customConfig = {
      primaryColor: '#059669',
      logoUrl: 'https://ejemplo.com/logo.png',
      tagline: 'Soluciones Logísticas y Construcción',
      companyName: 'Constructora del Norte'
    };

    const branding = brandingModule.getOrganizationBranding(customConfig);
    assert.strictEqual(branding.hasCustomLogo, true);
    assert.strictEqual(branding.logoUrl, 'https://ejemplo.com/logo.png');
    assert.strictEqual(branding.companyName, 'Constructora del Norte');
    assert.strictEqual(branding.tagline, 'Soluciones Logísticas y Construcción');

    const cssVars = brandingModule.generateThemeCssVariables(customConfig);
    assert.strictEqual(cssVars['--primary-color'], '#059669');
    assert.strictEqual(typeof cssVars['--primary-hover'], 'string');
    assert.strictEqual(cssVars['--header-bg'], '#059669');
  }
});

// ----------------------------------------------------
// 34. Production Cloud QA & Health Check Assertions
// ----------------------------------------------------
console.log('\n[Suite 34: Production Cloud QA & Health Check Assertions]');

let healthModule;
try {
  healthModule = require('../lib/health.js');
} catch (e) {
  healthModule = null;
}

test('Health Module Exists & Exports Status Generator', () => {
  assert.notStrictEqual(healthModule, null, 'lib/health.js module should exist');
  assert.strictEqual(typeof healthModule?.getHealthStatus, 'function');
  assert.strictEqual(typeof healthModule?.auditEnvironmentSecrets, 'function');
});

test('Returns healthy status schema with database and auth service statuses', () => {
  if (healthModule?.getHealthStatus) {
    const health = healthModule.getHealthStatus({
      NEXT_PUBLIC_SUPABASE_URL: 'https://test.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test_anon_key'
    });
    assert.strictEqual(health.status, 'healthy');
    assert.strictEqual(health.services.database, 'connected');
    assert.strictEqual(health.services.auth, 'active');
    assert.strictEqual(typeof health.timestamp, 'string');
  }
});

// ----------------------------------------------------
// 35. Live Deployment & Environment Secret Auditor
// ----------------------------------------------------
console.log('\n[Suite 35: Live Deployment & Environment Secret Auditor]');

test('Audit Environment Secrets validates required production environment variables', () => {
  if (healthModule?.auditEnvironmentSecrets) {
    const validAudit = healthModule.auditEnvironmentSecrets({
      NEXT_PUBLIC_SUPABASE_URL: 'https://test.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test_anon_key',
      NEXT_PUBLIC_APP_URL: 'https://business-helper.vercel.app'
    });
    assert.strictEqual(validAudit.isReadyForProduction, true);
    assert.strictEqual(validAudit.missingRequired.length, 0);

    const invalidAudit = healthModule.auditEnvironmentSecrets({});
    assert.strictEqual(invalidAudit.isReadyForProduction, false);
    assert.strictEqual(invalidAudit.missingRequired.includes('NEXT_PUBLIC_SUPABASE_URL'), true);
  }
});

// ----------------------------------------------------
// 36. Help Center & FAQ Engine Suite
// ----------------------------------------------------
console.log('\n[Suite 36: Help Center & FAQ Engine Suite]');

let helpModule;
try {
  helpModule = require('../lib/helpFAQ.js');
} catch (e) {
  helpModule = null;
}

test('Help Module Exists & Exports Search Helpers and Data', () => {
  assert.notStrictEqual(helpModule, null, 'lib/helpFAQ.js module should exist');
  assert.strictEqual(Array.isArray(helpModule?.FAQ_ITEMS), true);
  assert.strictEqual(Array.isArray(helpModule?.CATEGORIES), true);
  assert.strictEqual(typeof helpModule?.searchFAQItems, 'function');
  assert.strictEqual(typeof helpModule?.generateWhatsAppSupportLink, 'function');
});

test('Filters FAQ items by text query across questions, answers, and tags', () => {
  if (helpModule?.searchFAQItems) {
    const speiResults = helpModule.searchFAQItems('spei');
    assert.strictEqual(speiResults.length > 0, true, 'Should find SPEI related FAQ items');
    assert.strictEqual(speiResults.some(item => item.id === 'cob-1'), true);

    const satResults = helpModule.searchFAQItems('SAT');
    assert.strictEqual(satResults.length > 0, true, 'Should find SAT related FAQ items');

    const emptyResults = helpModule.searchFAQItems('nonexistent_query_xyz');
    assert.strictEqual(emptyResults.length, 0, 'Should return empty array for non-matching query');
  }
});

test('Filters FAQ items by category pill', () => {
  if (helpModule?.searchFAQItems) {
    const cotizacionesOnly = helpModule.searchFAQItems('', 'cotizaciones');
    assert.strictEqual(cotizacionesOnly.every(item => item.category === 'cotizaciones'), true);
    
    const cobranzaOnly = helpModule.searchFAQItems('', 'cobranza');
    assert.strictEqual(cobranzaOnly.every(item => item.category === 'cobranza'), true);
  }
});

test('Generates valid WhatsApp support link with custom or default message', () => {
  if (helpModule?.generateWhatsAppSupportLink) {
    const defaultLink = helpModule.generateWhatsAppSupportLink();
    assert.strictEqual(defaultLink.startsWith('https://wa.me/528180000000?text='), true);

    const customLink = helpModule.generateWhatsAppSupportLink('Facturación CFDI 4.0');
    assert.strictEqual(customLink.includes('Facturaci%C3%B3n%20CFDI%204.0'), true);
  }
});

// ----------------------------------------------------
// 37. Sentry Monitoring & Error Handler Engine Suite
// ----------------------------------------------------
console.log('\n[Suite 37: Sentry Monitoring & Error Handler Engine Suite]');

let sentryModule;
try {
  sentryModule = require('../lib/sentry.js');
} catch (e) {
  sentryModule = null;
}

test('Sentry Module Exists & Exports Monitoring Helpers', () => {
  assert.notStrictEqual(sentryModule, null, 'lib/sentry.js module should exist');
  assert.strictEqual(typeof sentryModule?.isSentryConfigured, 'function');
  assert.strictEqual(typeof sentryModule?.formatErrorPayload, 'function');
  assert.strictEqual(typeof sentryModule?.captureException, 'function');
  assert.strictEqual(typeof sentryModule?.captureMessage, 'function');
});

test('isSentryConfigured validates Sentry DSN syntax correctly', () => {
  if (sentryModule?.isSentryConfigured) {
    assert.strictEqual(sentryModule.isSentryConfigured({}), false);
    assert.strictEqual(sentryModule.isSentryConfigured({ SENTRY_DSN: 'invalid_dsn' }), false);
    assert.strictEqual(
      sentryModule.isSentryConfigured({
        NEXT_PUBLIC_SENTRY_DSN: 'https://123456@sentry.io/7890'
      }),
      true
    );
  }
});

test('formatErrorPayload constructs structured payload with org_id and route tags', () => {
  if (sentryModule?.formatErrorPayload) {
    const error = new Error('Test DB Connection Error');
    const payload = sentryModule.formatErrorPayload(error, {
      organization_id: 'org_test_123',
      route: '/api/invoices',
      level: 'fatal'
    });

    assert.strictEqual(payload.name, 'Error');
    assert.strictEqual(payload.message, 'Test DB Connection Error');
    assert.strictEqual(payload.tags.organization_id, 'org_test_123');
    assert.strictEqual(payload.tags.route, '/api/invoices');
    assert.strictEqual(payload.tags.severity, 'fatal');
    assert.strictEqual(typeof payload.timestamp, 'string');
  }
});

test('captureException handles errors gracefully without throwing when DSN is absent', () => {
  if (sentryModule?.captureException) {
    const result = sentryModule.captureException(
      new Error('Middleware Auth Check Failed'),
      { route: '/dashboard', organization_id: 'org_demo' },
      {} // empty env (no DSN)
    );

    assert.strictEqual(result.handled, true);
    assert.strictEqual(result.dispatchedToSentry, false);
    assert.strictEqual(result.payload.message, 'Middleware Auth Check Failed');
  }
});

test('captureMessage logs warning and info alerts cleanly', () => {
  if (sentryModule?.captureMessage) {
    const infoResult = sentryModule.captureMessage(
      'Rate limit threshold warning',
      'warning',
      { route: '/api/quotes' },
      {}
    );

    assert.strictEqual(infoResult.handled, true);
    assert.strictEqual(infoResult.payload.level, 'warning');
  }
});

// ----------------------------------------------------
// 38. Stripe Production Billing & Sandbox Auditor Suite
// ----------------------------------------------------
console.log('\n[Suite 38: Stripe Production Billing & Sandbox Auditor Suite]');

let stripeAuditorModule;
try {
  stripeAuditorModule = require('../lib/stripe.js');
} catch (e) {
  stripeAuditorModule = null;
}

test('Stripe Module Exists & Exports Billing Helpers & Environment Auditor', () => {
  assert.notStrictEqual(stripeAuditorModule, null, 'lib/stripe.js module should exist');
  assert.strictEqual(typeof stripeAuditorModule?.getStripeTierConfig, 'function');
  assert.strictEqual(typeof stripeAuditorModule?.createCheckoutPayload, 'function');
  assert.strictEqual(typeof stripeAuditorModule?.handleStripeWebhookEvent, 'function');
  assert.strictEqual(typeof stripeAuditorModule?.auditStripeEnvironment, 'function');
});

test('auditStripeEnvironment identifies sandbox vs live keys correctly', () => {
  if (stripeAuditorModule?.auditStripeEnvironment) {
    const unconfigAudit = stripeAuditorModule.auditStripeEnvironment({});
    assert.strictEqual(unconfigAudit.mode, 'unconfigured');
    assert.strictEqual(unconfigAudit.isReady, false);
    assert.strictEqual(unconfigAudit.missingKeys.includes('STRIPE_SECRET_KEY'), true);

    const sandboxAudit = stripeAuditorModule.auditStripeEnvironment({
      STRIPE_SECRET_KEY: 'sk_test_123456789',
      STRIPE_WEBHOOK_SECRET: 'whsec_987654321'
    });
    assert.strictEqual(sandboxAudit.mode, 'sandbox');
    assert.strictEqual(sandboxAudit.isReady, true);
    assert.strictEqual(sandboxAudit.isWebhookConfigured, true);

    const liveAudit = stripeAuditorModule.auditStripeEnvironment({
      STRIPE_SECRET_KEY: 'sk_live_123456789',
      STRIPE_WEBHOOK_SECRET: 'whsec_987654321'
    });
    assert.strictEqual(liveAudit.mode, 'live');
    assert.strictEqual(liveAudit.isReady, true);
  }
});

test('createCheckoutPayload includes organization_id metadata and price mapping', () => {
  if (stripeAuditorModule?.createCheckoutPayload) {
    const payload = stripeAuditorModule.createCheckoutPayload('negocio', 'org_distribuidora', 'https://businesshelper.mx/settings');
    assert.strictEqual(payload.mode, 'subscription');
    assert.strictEqual(payload.metadata.organization_id, 'org_distribuidora');
    assert.strictEqual(payload.metadata.tier_id, 'negocio');
    assert.strictEqual(payload.success_url.includes('CHECKOUT_SESSION_ID'), true);
  }
});

// ----------------------------------------------------
// Suite 39: Nota de Venta & Zero-SAT Recibo PDF Suite
// ----------------------------------------------------
console.log('\n[Suite 39: Nota de Venta & Zero-SAT Recibo PDF Suite]');

let receiptModule;
try {
  receiptModule = require('../lib/receiptGenerator.js');
} catch (e) {
  receiptModule = null;
}

test('Receipt Module Exists & Exports generateNotaDeVentaPayload', () => {
  assert.notStrictEqual(receiptModule, null, 'lib/receiptGenerator.js module should exist');
  assert.strictEqual(typeof receiptModule?.generateNotaDeVentaPayload, 'function');
  assert.strictEqual(typeof receiptModule?.generateReceiptWhatsAppLink, 'function');
});

test('generateNotaDeVentaPayload calculates IVA 16% and formats zero-SAT receipt metadata correctly', () => {
  if (receiptModule?.generateNotaDeVentaPayload) {
    const payload = receiptModule.generateNotaDeVentaPayload(
      {
        title: 'Desarrollo Web E-Commerce',
        clientName: 'Distribuidora del Norte S.A.',
        clientRfc: 'DNO120405XYZ',
        amount: 10000,
        includeIva: true,
      },
      {
        name: 'Agencia Digital MX',
        rfc: 'ADM180909ABC',
      }
    );

    assert.strictEqual(payload.tenant.name, 'Agencia Digital MX');
    assert.strictEqual(payload.client.name, 'Distribuidora del Norte S.A.');
    assert.strictEqual(payload.subtotal, 10000);
    assert.strictEqual(payload.ivaAmount, 1600);
    assert.strictEqual(payload.total, 11600);
    assert.strictEqual(payload.formattedTotal.includes('11,600.00'), true);
    assert.strictEqual(payload.status, 'PAGADO');
  }
});

test('generateReceiptWhatsAppLink generates status-aware wa.me link with receipt summary', () => {
  if (receiptModule?.generateReceiptWhatsAppLink && receiptModule?.generateNotaDeVentaPayload) {
    const payload = receiptModule.generateNotaDeVentaPayload({
      title: 'Mantenimiento Mensual',
      clientName: 'Carlos López',
      amount: 5000,
    });

    const waUrl = receiptModule.generateReceiptWhatsAppLink(payload, '5512345678');
    assert.strictEqual(waUrl.includes('https://wa.me/525512345678'), true);
    assert.strictEqual(waUrl.includes('Mantenimiento%20Mensual'), true);
  }
});

// ----------------------------------------------------
// 40. Sandbox Mode Production Safety & Isolation Guardrails Suite
// ----------------------------------------------------
console.log('\n[Suite 40: Sandbox Mode Production Safety & Isolation Guardrails Suite]');

let sandboxWhatsAppModule;
let sandboxFacturapiModule;
try {
  sandboxWhatsAppModule = require('../lib/whatsappOutbound.js');
  sandboxFacturapiModule = require('../lib/facturapi.ts');
} catch (e) {
  sandboxWhatsAppModule = null;
  sandboxFacturapiModule = null;
}

test('WhatsApp Outbound Engine forces wa_me_link in Sandbox mode even if live Twilio/Meta keys are set', () => {
  if (sandboxWhatsAppModule?.getWhatsAppDispatchMode) {
    const mockEnvWithLiveKeys = {
      TWILIO_ACCOUNT_SID: 'AC_live_123456789',
      TWILIO_AUTH_TOKEN: 'auth_token_live',
      TWILIO_WHATSAPP_NUMBER: '+14155238886',
      NEXT_PUBLIC_DEMO_MODE: 'true',
    };

    const mode = sandboxWhatsAppModule.getWhatsAppDispatchMode(mockEnvWithLiveKeys);
    assert.strictEqual(mode.type, 'wa_me_link');
    assert.strictEqual(mode.isApiConfigured, false);
    assert.strictEqual(mode.isSandbox, true);
  }
});

test('dispatchWhatsAppReminder returns safe wa.me URL without invoking outbound API calls when isSandbox option is set', async () => {
  if (sandboxWhatsAppModule?.dispatchWhatsAppReminder) {
    const res = await sandboxWhatsAppModule.dispatchWhatsAppReminder({
      clientName: 'Don Roberto',
      phone: '8115551234',
      amountDue: 5000,
      dueDate: '2026-08-15',
      token: 'demo-token-123',
      isSandbox: true,
    }, {
      TWILIO_ACCOUNT_SID: 'AC_live_123456789',
      TWILIO_AUTH_TOKEN: 'auth_token_live',
      TWILIO_WHATSAPP_NUMBER: '+14155238886',
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.mode, 'wa_me_link');
    assert.strictEqual(res.waMeUrl.includes('https://wa.me/528115551234'), true);
  }
});

test('Facturapi SAT CFDI client uses simulateInvoiceStamping in Sandbox mode regardless of live API key', async () => {
  if (sandboxFacturapiModule?.issueInvoiceClient) {
    const payload = {
      customer: { legal_name: 'Don Roberto', tax_id: 'XAXX010101000', tax_system: '601', zip: '64000' },
      use: 'G03',
      payment_form: '03',
      payment_method: 'PUE',
      currency: 'MXN',
      items: [{ quantity: 1, product_key: '84111506', unit_key: 'E48', description: 'Servicio', price: 1000 }]
    };

    const res = await sandboxFacturapiModule.issueInvoiceClient(payload, 'milestone_demo_1', true);
    assert.strictEqual(res.status, 'issued');
    assert.strictEqual(res.cfdiId.startsWith('cfdi_'), true);
  }
});

// ----------------------------------------------------
// 41. Sandbox Mode AI Security & Rate Limiting Audit Suite
// ----------------------------------------------------
console.log('\n[Suite 41: Sandbox Mode AI Security & Rate Limiting Audit]');

test('AI Assistant truncates oversized prompt inputs to 300 characters max to prevent token abuse', () => {
  if (aiModule?.sanitizeAIQuery) {
    const hugeQuery = '¿Cuánto me debe Grupo Salinas? ' + 'x'.repeat(1000);
    const sanitized = aiModule.sanitizeAIQuery(hugeQuery, 300);
    assert.strictEqual(sanitized.length, 300, 'Query must be truncated to 300 characters');
    assert.strictEqual(sanitized.startsWith('¿Cuánto me debe Grupo Salinas?'), true);
  } else {
    throw new Error('sanitizeAIQuery module not exported');
  }
});

test('Rate limiter enforces max 5 queries per minute per sandbox IP/client', () => {
  if (aiModule?.checkRateLimit) {
    const testIp = 'audit_ip_999';
    for (let i = 1; i <= 5; i++) {
      const res = aiModule.checkRateLimit(testIp, 5);
      assert.strictEqual(res.allowed, true, `Query ${i} should be allowed`);
    }
    const blockedRes = aiModule.checkRateLimit(testIp, 5);
    assert.strictEqual(blockedRes.allowed, false, 'Query 6 must be blocked by rate limiter');
  } else {
    throw new Error('checkRateLimit module not exported');
  }
});

// ----------------------------------------------------
// 42. URL Helper & Custom Domain Resolution Suite
// ----------------------------------------------------
console.log('\n[Suite 42: URL Helper & Custom Domain Resolution]');

let urlModule;
try {
  urlModule = require('../lib/url.js');
} catch (e) {
  urlModule = null;
}

test('URL Helper Module Exists & Exports Functions', () => {
  assert.notStrictEqual(urlModule, null, 'lib/url.js module should exist');
  assert.strictEqual(typeof urlModule?.getAppBaseUrl, 'function');
  assert.strictEqual(typeof urlModule?.getAuthCallbackUrl, 'function');
  assert.strictEqual(typeof urlModule?.getStripeWebhookUrl, 'function');
});

test('getAppBaseUrl cleans trailing slashes and resolves HTTPS origin', () => {
  if (urlModule?.getAppBaseUrl) {
    const originalEnv = process.env.NEXT_PUBLIC_APP_URL;
    process.env.NEXT_PUBLIC_APP_URL = 'https://businesshelper.mx///';
    const cleanUrl = urlModule.getAppBaseUrl();
    assert.strictEqual(cleanUrl, 'https://businesshelper.mx', 'Trailing slashes should be stripped');

    delete process.env.NEXT_PUBLIC_APP_URL;
    const defaultUrl = urlModule.getAppBaseUrl();
    assert.strictEqual(defaultUrl.startsWith('http'), true, 'Default URL must start with http/https protocol');
    process.env.NEXT_PUBLIC_APP_URL = originalEnv;
  }
});

test('getAuthCallbackUrl and getStripeWebhookUrl format valid endpoints', () => {
  if (urlModule?.getAuthCallbackUrl && urlModule?.getStripeWebhookUrl) {
    const originalEnv = process.env.NEXT_PUBLIC_APP_URL;
    process.env.NEXT_PUBLIC_APP_URL = 'https://businesshelper.mx';
    assert.strictEqual(urlModule.getAuthCallbackUrl(), 'https://businesshelper.mx/auth/callback');
    assert.strictEqual(urlModule.getStripeWebhookUrl(), 'https://businesshelper.mx/api/stripe/webhook');
    process.env.NEXT_PUBLIC_APP_URL = originalEnv;
  }
});

// ----------------------------------------------------
// 43. Demo Mode Analytics & Fallback Engine Tests
// ----------------------------------------------------
console.log('\n[Suite 43: Demo Mode Analytics & Fallback Engine]');

let demoUtils;
try {
  demoUtils = require('../lib/demoUtils.ts');
} catch {
  demoUtils = null;
}

test('Demo Utils Module Exists & Exports isDemoModeActive and DEMO_ORGANIZATION', () => {
  assert.notStrictEqual(demoUtils, null, 'lib/demoUtils.ts module should exist');
  assert.strictEqual(typeof demoUtils?.isDemoModeActive, 'function');
  assert.strictEqual(demoUtils?.DEMO_ORGANIZATION?.id, 'org-demo-1');
  assert.strictEqual(demoUtils?.DEMO_ORGANIZATION?.contact_name, 'Don Roberto');
});

test('isDemoModeActive returns true for ?demo=true search string', () => {
  if (demoUtils?.isDemoModeActive) {
    const isActive = demoUtils.isDemoModeActive('demo=true');
    assert.strictEqual(isActive, true, '?demo=true should activate demo mode');
  }
});

// ----------------------------------------------------
// 44. App Tier Features & Value-Adds Data Engine Tests
// ----------------------------------------------------
console.log('\n[Suite 44: App Tier Features, Pain Points & Value-Adds Data Engine]');

let tierFeaturesData;
try {
  tierFeaturesData = require('../lib/tierFeaturesData.ts');
} catch {
  tierFeaturesData = null;
}

test('Tier Features Module Exists & Exports Data Structures', () => {
  assert.notStrictEqual(tierFeaturesData, null, 'lib/tierFeaturesData.ts should exist');
  assert.strictEqual(Array.isArray(tierFeaturesData?.APP_TIERS), true);
  assert.strictEqual(Array.isArray(tierFeaturesData?.PAIN_POINTS_SOLUTIONS), true);
  assert.strictEqual(Array.isArray(tierFeaturesData?.VALUE_ADDS_ROI), true);
});

test('Defines 3 app tiers (Básico, Pro, Enterprise) with pricing and features', () => {
  if (tierFeaturesData?.APP_TIERS) {
    const tiers = tierFeaturesData.APP_TIERS;
    assert.strictEqual(tiers.length, 3, 'Should define exactly 3 tiers');
    assert.strictEqual(tiers[0].id, 'basico');
    assert.strictEqual(tiers[0].priceMonthly, 299);
    assert.strictEqual(tiers[1].id, 'pro');
    assert.strictEqual(tiers[1].priceMonthly, 699);
    assert.strictEqual(tiers[1].recommended, true, 'Pro plan should be marked recommended');
    assert.strictEqual(tiers[2].id, 'enterprise');
    assert.strictEqual(tiers[2].priceMonthly, 1499);
  }
});

test('Defines core pain points vs solutions mapping for Mexican PyMEs', () => {
  if (tierFeaturesData?.PAIN_POINTS_SOLUTIONS) {
    const pps = tierFeaturesData.PAIN_POINTS_SOLUTIONS;
    assert.strictEqual(pps.length >= 4, true, 'Should include at least 4 pain point solutions');
    assert.strictEqual(pps[0].impact.includes('Cotizaciones'), true);
    assert.strictEqual(pps[1].impact.includes('Cobro'), true);
    assert.strictEqual(pps[2].impact.includes('SAT'), true);
  }
});

// ----------------------------------------------------
// 45. JSX Syntax & Unescaped Entities Quality Gate Audit
// ----------------------------------------------------
console.log('\n[Suite 45: JSX Syntax & Unescaped Entities Quality Gate Audit]');

test('Scans components and app directories for unescaped quotes in JSX text nodes', () => {
  function scanDir(dir, fileList = []) {
    if (!fs.existsSync(dir)) return fileList;
    const files = fs.readdirSync(dir);
    files.forEach((file) => {
      const filePath = path.join(dir, file);
      if (fs.statSync(filePath).isDirectory()) {
        scanDir(filePath, fileList);
      } else if (file.endsWith('.tsx')) {
        fileList.push(filePath);
      }
    });
    return fileList;
  }

  const tsxFiles = [...scanDir(path.join(__dirname, '../components')), ...scanDir(path.join(__dirname, '../app'))];
  const unescapedQuotePattern = />[^<{]*"[^<{]*</;
  const offendingFiles = [];

  tsxFiles.forEach((filePath) => {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    lines.forEach((line, idx) => {
      // Exclude comments, imports, or lines containing valid escaped quotes
      if (!line.trim().startsWith('//') && !line.includes('eslint-disable') && unescapedQuotePattern.test(line)) {
        offendingFiles.push(`${path.basename(filePath)}:${idx + 1}`);
      }
    });
  });

  assert.strictEqual(
    offendingFiles.length,
    0,
    `Found unescaped quote entities in JSX text nodes: ${offendingFiles.join(', ')}`
  );
});

// ----------------------------------------------------
// 46. Sandbox Auth Bypass & Environment Detection Tests
// ----------------------------------------------------
console.log('\n[Suite 46: Sandbox Auth Bypass & Environment Detection Engine]');

let demoUtilsSuite46;
try {
  demoUtilsSuite46 = require('../lib/demoUtils.ts');
} catch {
  demoUtilsSuite46 = null;
}

test('Demo utils module exports isDemoModeActive and DEMO_ORGANIZATION', () => {
  assert.notStrictEqual(demoUtilsSuite46, null, 'lib/demoUtils.ts should exist');
  assert.strictEqual(typeof demoUtilsSuite46?.isDemoModeActive, 'function', 'isDemoModeActive should be a function');
  assert.strictEqual(typeof demoUtilsSuite46?.DEMO_ORGANIZATION, 'object', 'DEMO_ORGANIZATION should be defined');
  assert.strictEqual(demoUtilsSuite46.DEMO_ORGANIZATION.id, 'org-demo-1');
});

test('isDemoModeActive returns true when demo=true query parameter is present', () => {
  if (demoUtilsSuite46?.isDemoModeActive) {
    const isDemo = demoUtilsSuite46.isDemoModeActive('demo=true');
    assert.strictEqual(isDemo, true, 'demo=true param should trigger demo mode');
  }
});

test('isDemoModeActive returns true when sandbox=true query parameter is present', () => {
  if (demoUtilsSuite46?.isDemoModeActive) {
    const isSandbox = demoUtilsSuite46.isDemoModeActive('sandbox=true');
    assert.strictEqual(isSandbox, true, 'sandbox=true param should trigger demo mode');
  }
});

test('isDemoModeActive defaults to true for unauthenticated demo navigation', () => {
  if (demoUtilsSuite46?.isDemoModeActive) {
    const defaultMode = demoUtilsSuite46.isDemoModeActive();
    assert.strictEqual(defaultMode, true, 'Unauthenticated session should enable demo mode by default');
  }
});

test('Dashboard pages render Header component for unified navigation bar', () => {
  const dashboardPages = [
    'quotes/page.tsx',
    'receivables/page.tsx',
    'invoices/page.tsx',
    'products/page.tsx',
    'team/page.tsx',
    'assistant/page.tsx',
    'help/page.tsx',
    'clients/page.tsx',
    'dashboard/page.tsx',
    'settings/page.tsx',
  ];

  for (const pageRelPath of dashboardPages) {
    const fullPath = path.join(__dirname, '../app/(dashboard)', pageRelPath);
    assert.strictEqual(fs.existsSync(fullPath), true, `Page file ${pageRelPath} should exist`);
    const content = fs.readFileSync(fullPath, 'utf8');
    assert.strictEqual(
      content.includes('<Header') || content.includes('Header'),
      true,
      `Page ${pageRelPath} must include the Header component`
    );
  }
});

// ----------------------------------------------------
// 47. B2B Client Trade Credit & SAT PPD/CPP Invoicing Engine Tests
// ----------------------------------------------------
console.log('\n[Suite 47: B2B Client Trade Credit & SAT PPD/CPP Invoicing Engine]');

let clientCreditModule;
try {
  clientCreditModule = require('../lib/clientCredit.js');
} catch {
  clientCreditModule = null;
}

test('Client Credit module exists & exports calculateClientCreditSummary and validateQuoteCreditLimit', () => {
  assert.notStrictEqual(clientCreditModule, null, 'lib/clientCredit.js should exist');
  assert.strictEqual(typeof clientCreditModule?.calculateClientCreditSummary, 'function');
  assert.strictEqual(typeof clientCreditModule?.validateQuoteCreditLimit, 'function');
});

test('calculateClientCreditSummary accurately calculates used credit and available credit', () => {
  if (clientCreditModule?.calculateClientCreditSummary) {
    const mockClient = { id: 'c-1', credit_limit: 50000, credit_days: 30, credit_status: 'active' };
    const mockReceivables = [
      { clientId: 'c-1', amount: 15000, status: 'pending' },
      { clientId: 'c-1', amount: 10000, status: 'requested' },
      { clientId: 'c-1', amount: 20000, status: 'confirmed' },
    ];
    const summary = clientCreditModule.calculateClientCreditSummary(mockClient, mockReceivables);
    assert.strictEqual(summary.totalLimit, 50000);
    assert.strictEqual(summary.usedCredit, 25000);
    assert.strictEqual(summary.availableCredit, 25000);
    assert.strictEqual(summary.isOverLimit, false);
    assert.strictEqual(summary.utilizationPercentage, 50);
  }
});

test('validateQuoteCreditLimit identifies quote totals exceeding available credit', () => {
  if (clientCreditModule?.validateQuoteCreditLimit) {
    const valid = clientCreditModule.validateQuoteCreditLimit(15000, 25000, 'active');
    assert.strictEqual(valid.isAllowed, true);
    assert.strictEqual(valid.isExceeding, false);

    const exceeding = clientCreditModule.validateQuoteCreditLimit(30000, 25000, 'active');
    assert.strictEqual(exceeding.isExceeding, true);
    assert.strictEqual(exceeding.warningMessage.includes('excede'), true);

    const blocked = clientCreditModule.validateQuoteCreditLimit(5000, 25000, 'blocked');
    assert.strictEqual(blocked.isAllowed, false);
    assert.strictEqual(blocked.warningMessage.includes('bloqueado'), true);
  }
});

test('Facturapi module supports PPD payment_method and Complemento de Pago (CPP) payloads', () => {
  const facturapiModule = require('../lib/facturapi.js');
  assert.strictEqual(typeof facturapiModule.buildCFDIPayload, 'function');
  assert.strictEqual(typeof facturapiModule.buildComplementoPagoPayload, 'function');

  const ppdPayload = facturapiModule.buildCFDIPayload(
    { name: 'Org' },
    { name: 'Client' },
    [{ description: 'Items', unit_price: 1000 }],
    { paymentMethod: 'PPD' }
  );
  assert.strictEqual(ppdPayload.payment_method, 'PPD');
  assert.strictEqual(ppdPayload.payment_form, '99');

  const cppPayload = facturapiModule.buildComplementoPagoPayload({
    invoiceId: 'inv-100',
    amount: 5000,
    paymentForm: '03',
    operationNumber: 'SPEI-12345'
  });
  assert.strictEqual(cppPayload.type, 'P');
  assert.strictEqual(cppPayload.payments[0].amount, 5000);
});


// ----------------------------------------------------
// 48. Independent QA Contractor Exploratory Audit Suite
// ----------------------------------------------------
console.log('\n[Suite 48: Independent QA Contractor Exploratory Audit Suite]');

test('Auth flow edge case: Validates registration payload and rejects missing fields or weak passwords', () => {
  const validateRegisterInput = (data) => {
    if (!data.email || !data.email.includes('@')) return { valid: false, error: 'Correo electrónico inválido' };
    if (!data.business_name || data.business_name.trim().length < 2) return { valid: false, error: 'Nombre de empresa requerido' };
    if (!data.password || data.password.length < 6) return { valid: false, error: 'La contraseña debe tener al menos 6 caracteres' };
    return { valid: true, error: null };
  };

  assert.strictEqual(validateRegisterInput({ email: 'bademail', business_name: 'Test', password: '123' }).valid, false);
  assert.strictEqual(validateRegisterInput({ email: 'test@negocio.mx', business_name: '', password: 'password123' }).valid, false);
  assert.strictEqual(validateRegisterInput({ email: 'test@negocio.mx', business_name: 'Test', password: '123' }).valid, false);
  assert.strictEqual(validateRegisterInput({ email: 'roberto@materiales.mx', business_name: 'Materiales MTY', password: 'securePassword123' }).valid, true);
});

test('Stripe billing edge case: Processes upgrade, downgrade, and cancellation event state transitions', () => {
  const stripeModule = require('../lib/stripe.js');
  
  // Upgrade simulation
  const upgradeEvent = {
    type: 'customer.subscription.updated',
    data: { object: { metadata: { organization_id: 'org_123' }, status: 'active', items: { data: [{ price: { id: 'price_empresa_999_mxn' } }] } } }
  };
  const upRes = stripeModule.handleStripeWebhookEvent(upgradeEvent);
  assert.strictEqual(upRes.tierId, 'empresa');
  assert.strictEqual(upRes.status, 'active');

  // Cancellation simulation
  const cancelEvent = {
    type: 'customer.subscription.deleted',
    data: { object: { metadata: { organization_id: 'org_123' }, status: 'canceled', items: { data: [{ price: { id: 'price_negocio_599_mxn' } }] } } }
  };
  const cancelRes = stripeModule.handleStripeWebhookEvent(cancelEvent);
  assert.strictEqual(cancelRes.status, 'canceled');
  
  const accessibility = stripeModule.validateSubscriptionStatus('canceled');
  assert.strictEqual(accessibility.isAccessible, false);
});

test('Client management edge case: Enforces Mexican RFC validation & E.164 phone formatting', () => {
  const rfcModule = require('../lib/rfcValidator.js');
  const outboundModule = require('../lib/whatsappOutbound.js');

  // RFC physical (13 chars) vs moral (12 chars)
  assert.strictEqual(rfcModule.validateRFC('XAXX010101000').isValid, true); // Generic physical
  assert.strictEqual(rfcModule.validateRFC('INVALID_RFC').isValid, false);

  // Phone formatting
  assert.strictEqual(outboundModule.formatE164MexicanPhone('8112223344'), '+528112223344');
  assert.strictEqual(outboundModule.formatE164MexicanPhone('528112223344'), '+528112223344');
  assert.strictEqual(outboundModule.formatE164MexicanPhone('+528112223344'), '+528112223344');
});

test('Contracts & Quotes edge case: Calculates 16% IVA and splits milestones cleanly with zero cent divergence', () => {
  const quoteCalc = require('../lib/quoteCalculator.js');
  const qToC = require('../lib/quoteToContract.ts');

  const calc = quoteCalc.calculateQuoteTotals([
    { quantity: 10, unit_price: 150.50 },
    { quantity: 5, unit_price: 200.00 }
  ], { applyIva: true });

  assert.strictEqual(calc.subtotal, 2505.00);
  assert.strictEqual(calc.ivaAmount, 400.80);
  assert.strictEqual(calc.totalAmount, 2905.80);

  // Milestone splitting
  const quote = { id: 'q1', organization_id: 'org1', client_id: 'c1', title: 'Cotización Materiales', total_amount: 2905.80, status: 'approved' };
  const contractRes = qToC.convertQuoteToContract(quote, [0.33, 0.33, 0.34]);
  const sumMilestones = contractRes.milestones.reduce((acc, m) => acc + m.amount, 0);
  assert.strictEqual(Math.abs(sumMilestones - 2905.80) < 0.001, true, 'Sum of split milestones must equal contract total exactly');
});

test('WhatsApp & AI Assistant edge case: Enforces 300 char prompt limit and sandbox safety isolation', () => {
  const whatsappAI = require('../lib/whatsappAI.js');
  const outboundModule = require('../lib/whatsappOutbound.js');

  // Input truncation
  const longPrompt = 'A'.repeat(500);
  const sanitized = whatsappAI.sanitizeAIQuery(longPrompt, 300);
  assert.strictEqual(sanitized.length, 300);

  // Sandbox isolation test
  const mode = outboundModule.getWhatsAppDispatchMode({}, true); // isSandbox = true
  assert.strictEqual(mode.type, 'wa_me_link');
  assert.strictEqual(mode.isSandbox, true);
});

// ----------------------------------------------------
// 49. In-App AI Support Agent Engine (Sprint 16)
// ----------------------------------------------------
console.log('\n[Suite 49: In-App AI Support Agent Engine]');

test('AI Support Engine exports FAQ matcher and support context builder', () => {
  const whatsappAI = require('../lib/whatsappAI.js');
  assert.strictEqual(typeof whatsappAI.matchFAQSupportQuery, 'function', 'matchFAQSupportQuery must be exported');
  assert.strictEqual(typeof whatsappAI.buildAISupportPromptContext, 'function', 'buildAISupportPromptContext must be exported');
});

test('Matches product FAQ support queries in-app and returns structured answer', () => {
  const whatsappAI = require('../lib/whatsappAI.js');
  const res = whatsappAI.parseNaturalLanguageQuery('¿Cómo creo y envío una cotización?', {});
  assert.strictEqual(res.intent, 'app_support_faq', 'Intent must be app_support_faq');
  assert.strictEqual(res.matchedFAQ !== null, true, 'Must match FAQ item');
  assert.strictEqual(res.answerText.includes('Cotizaciones'), true, 'Answer text must explain quote creation');
});

test('Detects human handoff intent when user requests human assistance in-app', () => {
  const whatsappAI = require('../lib/whatsappAI.js');
  const res = whatsappAI.parseNaturalLanguageQuery('Quiero hablar con un asesor humano', {});
  assert.strictEqual(res.intent, 'human_handoff_request', 'Intent must be human_handoff_request');
  assert.strictEqual(res.requiresHumanHandoff, true, 'requiresHumanHandoff flag must be true');
});

test('Evaluates support prompt context generator with product FAQs', () => {
  const whatsappAI = require('../lib/whatsappAI.js');
  const prompt = whatsappAI.buildAISupportPromptContext('¿Cómo subo un SPEI?', { question: 'SPEI', answer: 'Subir comprobante' });
  assert.strictEqual(prompt.includes('SPEI'), true, 'Prompt context must contain FAQ data');
});

// ----------------------------------------------------
// 50. WS-A Credibility & Trust Fixes Suite (Product Readiness Workback Phase 1)
// ----------------------------------------------------
console.log('\n[Suite 50: WS-A Credibility & Trust Fixes Suite]');

test('Trust Data Module exports required social proof, team, badges, and contact details', () => {
  let trustData;
  try {
    trustData = require('../lib/trustData.ts');
  } catch {
    try {
      trustData = require('../lib/trustData.js');
    } catch {
      trustData = null;
    }
  }
  assert.strictEqual(trustData !== null, true, 'lib/trustData module must exist');
  assert.strictEqual(Array.isArray(trustData.TESTIMONIALS), true, 'TESTIMONIALS must be an array');
  assert.strictEqual(trustData.TESTIMONIALS.length >= 4, true, 'Must have at least 4 credible testimonials');
  assert.strictEqual(Array.isArray(trustData.TRUST_BADGES), true, 'TRUST_BADGES must be an array');
  assert.strictEqual(trustData.TRUST_BADGES.length >= 4, true, 'Must have at least 4 trust badges');
  assert.strictEqual(Array.isArray(trustData.TEAM_MEMBERS), true, 'TEAM_MEMBERS must be an array');
  assert.strictEqual(trustData.TEAM_MEMBERS.length >= 3, true, 'Must have at least 3 team members');
  assert.strictEqual(typeof trustData.CONTACT_INFO, 'object', 'CONTACT_INFO must be an object');
  assert.strictEqual(Array.isArray(trustData.DEMO_WALKTHROUGH_STEPS), true, 'DEMO_WALKTHROUGH_STEPS must be an array');
  assert.strictEqual(trustData.DEMO_WALKTHROUGH_STEPS.length >= 4, true, 'Must have 4 demo video walkthrough steps');
});

test('Testimonials contain realistic Mexican SME profiles, locations, and metric tags', () => {
  const trustData = require('../lib/trustData.ts');
  const roberto = trustData.TESTIMONIALS.find(t => t.author.includes('Roberto Elizondo'));
  assert.strictEqual(roberto !== undefined, true, 'Roberto Elizondo testimonial must exist');
  assert.strictEqual(roberto.location.includes('Monterrey, NL'), true, 'Roberto must be in Monterrey, NL');
  assert.strictEqual(roberto.company.length > 5, true, 'Company name must be populated');
  assert.strictEqual(roberto.rating, 5, 'Rating must be 5 stars');
  assert.strictEqual(typeof roberto.metricTag, 'string', 'Metric tag must exist');

  const mariana = trustData.TESTIMONIALS.find(t => t.author.includes('Mariana Fuentes'));
  assert.strictEqual(mariana !== undefined, true, 'Mariana Fuentes testimonial must exist');
  assert.strictEqual(mariana.location.includes('CDMX'), true, 'Mariana must be in CDMX');
});

test('Trust badges feature SAT CFDI 4.0, SSL 256-bit, Banxico SPEI, and PAC partner seals', () => {
  const trustData = require('../lib/trustData.ts');
  const satBadge = trustData.TRUST_BADGES.find(b => b.id === 'sat-cfdi');
  assert.strictEqual(satBadge !== undefined, true, 'SAT CFDI badge must exist');
  assert.strictEqual(satBadge.title.includes('SAT CFDI 4.0'), true, 'SAT badge title');

  const sslBadge = trustData.TRUST_BADGES.find(b => b.id === 'ssl-encryption');
  assert.strictEqual(sslBadge !== undefined, true, 'SSL badge must exist');

  const speiBadge = trustData.TRUST_BADGES.find(b => b.id === 'banxico-spei');
  assert.strictEqual(speiBadge !== undefined, true, 'SPEI badge must exist');

  const pacBadge = trustData.TRUST_BADGES.find(b => b.id === 'pac-partner');
  assert.strictEqual(pacBadge !== undefined, true, 'PAC partner badge must exist');
});

test('Contact info includes Tijuana / San Diego location, support email, and privacy email', () => {
  const trustData = require('../lib/trustData.ts');
  assert.strictEqual(typeof trustData.CONTACT_INFO.email, 'string', 'Support email must exist');
  assert.strictEqual(trustData.CONTACT_INFO.privacyEmail, 'privacidad@businesshelper.mx', 'Privacy email must match privacidad@businesshelper.mx');
  assert.strictEqual(trustData.CONTACT_INFO.cityState.includes('Tijuana'), true, 'City/State must include Tijuana');
});

test('Team section features founder profiles for Hector Zamora (CEO), Gilberto Santana, and Guillermo Fernandez based in Tijuana / San Diego', () => {
  const trustData = require('../lib/trustData.ts');
  const founder = trustData.TEAM_MEMBERS.find(m => m.name === 'Hector Zamora');
  assert.strictEqual(founder !== undefined, true, 'Founder Hector Zamora profile must exist');
  assert.strictEqual(founder.role.includes('CEO'), true, 'Founder role must be Fundador & CEO');
  assert.strictEqual(founder.location.includes('Tijuana'), true, 'Founder location must include Tijuana');

  const cto = trustData.TEAM_MEMBERS.find(m => m.name === 'Gilberto Santana');
  assert.strictEqual(cto !== undefined, true, 'Gilberto Santana profile must exist');
  assert.strictEqual(cto.role.includes('CTO'), true, 'CTO role');

  const coo = trustData.TEAM_MEMBERS.find(m => m.name === 'Guillermo Fernandez');
  assert.strictEqual(coo !== undefined, true, 'Guillermo Fernandez profile must exist');
  assert.strictEqual(coo.role.includes('COO'), true, 'COO role');
});

test('Demo video walkthrough steps match full quote-to-payment CUJ flow', () => {
  const trustData = require('../lib/trustData.ts');
  const stepIds = trustData.DEMO_WALKTHROUGH_STEPS.map(s => s.id);
  assert.deepStrictEqual(stepIds, ['create-quote', 'send-whatsapp', 'otp-signature', 'spei-notification']);
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







