import { describe, it, expect } from 'vitest';
import {
  currentFolioPeriod,
  describeFolioExhaustion,
  resolveFolioAllowance,
} from '@/lib/cfdiFolios';
import { cfdiStoragePaths, storeCFDIDocuments, CFDI_BUCKET } from '@/lib/cfdiStorage';

describe('CFDI folio allowance', () => {
  it('reads the tier allowance priced in lib/stripe.ts', () => {
    expect(resolveFolioAllowance({ subscription_tier: 'inicial' }, '2026-08').included).toBe(0);
    expect(resolveFolioAllowance({ subscription_tier: 'negocio' }, '2026-08').included).toBe(10);
    expect(resolveFolioAllowance({ subscription_tier: 'empresa' }, '2026-08').included).toBe(50);
  });

  it('counts folios already used inside the period', () => {
    const allowance = resolveFolioAllowance(
      {
        subscription_tier: 'negocio',
        cfdi_folios_used: 4,
        cfdi_folios_period: '2026-08',
        cfdi_folios_purchased: 3,
      },
      '2026-08'
    );

    expect(allowance.used).toBe(4);
    expect(allowance.remaining).toBe(6 + 3);
  });

  it('rolls the included allowance over on a new month but keeps purchased folios', () => {
    const allowance = resolveFolioAllowance(
      {
        subscription_tier: 'negocio',
        cfdi_folios_used: 10,
        cfdi_folios_period: '2026-07',
        cfdi_folios_purchased: 2,
      },
      '2026-08'
    );

    expect(allowance.used).toBe(0);
    expect(allowance.remaining).toBe(12);
  });

  it('never reports a negative remaining count', () => {
    const allowance = resolveFolioAllowance(
      { subscription_tier: 'negocio', cfdi_folios_used: 40, cfdi_folios_period: '2026-08' },
      '2026-08'
    );
    expect(allowance.remaining).toBe(0);
  });

  it('uses the calendar month the tiers are quoted in', () => {
    expect(currentFolioPeriod(new Date('2026-08-07T23:59:00.000Z'))).toBe('2026-08');
  });

  it('tells a user without folios what they can actually do next', () => {
    const inicial = describeFolioExhaustion(resolveFolioAllowance({ subscription_tier: 'inicial' }));
    expect(inicial).toContain('Conecta tu propio PAC');

    const negocio = describeFolioExhaustion(
      resolveFolioAllowance({ subscription_tier: 'negocio', cfdi_folios_used: 10 })
    );
    expect(negocio).toContain('10 folios');
  });
});

describe('CFDI document storage', () => {
  it('files a document under its organization, milestone and folio fiscal', () => {
    const paths = cfdiStoragePaths('org-1', 'ms-2', 'A1B2C3D4-0000-1111-2222-333344445555');

    expect(paths.xmlPath).toBe('org-1/ms-2/A1B2C3D4-0000-1111-2222-333344445555.xml');
    expect(paths.pdfPath).toBe('org-1/ms-2/A1B2C3D4-0000-1111-2222-333344445555.pdf');
  });

  it('strips anything that is not part of a UUID from the object name', () => {
    const paths = cfdiStoragePaths('org-1', 'ms-2', '../../etc/passwd');
    expect(paths.xmlPath).toBe('org-1/ms-2/etcpasswd.xml');
  });

  it('reports an upload failure instead of returning paths to nothing', async () => {
    const uploads: string[] = [];
    const client = {
      storage: {
        from: (bucket: string) => {
          expect(bucket).toBe(CFDI_BUCKET);
          return {
            upload: async (path: string) => {
              uploads.push(path);
              return { error: path.endsWith('.pdf') ? { message: 'quota exceeded' } : null };
            },
            createSignedUrl: async () => ({ data: null, error: null }),
          };
        },
      },
    };

    const result = await storeCFDIDocuments(client, 'org-1', 'ms-2', 'UUID-1', {
      xml: new Uint8Array([1]),
      pdf: new Uint8Array([2]),
    });

    expect(result.ok).toBe(false);
    expect(uploads).toHaveLength(2);
  });
});
