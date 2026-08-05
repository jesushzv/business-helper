import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Media Assets Integrity Suite', () => {
  const publicDir = path.resolve(__dirname, '../../public');

  const requiredAssets = [
    '/assets/demo/cuj_02_dashboard_kpis.png',
    '/assets/demo/cuj_02_dashboard_activity.png',
    '/assets/demo/cuj_02_dashboard_desktop.webm',
    '/assets/demo/cuj_02_dashboard_mobile.webm',
    '/assets/demo/cuj_04_quote_wizard_modal.png',
    '/assets/demo/cuj_04_quotes_wizard_mobile.webm',
    '/assets/demo/cuj_05_public_proposal.png',
    '/assets/demo/cuj_08_whatsapp_ai_assistant_mobile.webm',
    '/assets/demo/cuj_05_signing_otp_modal.png',
    '/assets/demo/cuj_05_proposal_signing_mobile.webm',
    '/assets/demo/cuj_07_spei_portal.png',
    '/assets/demo/cuj_07_spei_portal_mobile.webm',
    '/avatars/mariana_fuentes.png',
    '/avatars/carlos_trevino.png',
    '/logo-icon.svg',
    '/favicon.svg',
  ];

  it('should verify that all landing page media assets exist in the public directory', () => {
    requiredAssets.forEach((assetPath) => {
      const fullPath = path.join(publicDir, assetPath);
      const exists = fs.existsSync(fullPath);
      expect(exists, `Missing public asset: ${assetPath}`).toBe(true);
    });
  });

  it('should verify demo videos have non-zero file size', () => {
    const videoAssets = requiredAssets.filter((a) => a.endsWith('.webm'));
    videoAssets.forEach((videoPath) => {
      const fullPath = path.join(publicDir, videoPath);
      const stats = fs.statSync(fullPath);
      expect(stats.size, `Video asset is empty: ${videoPath}`).toBeGreaterThan(1000);
    });
  });
});
