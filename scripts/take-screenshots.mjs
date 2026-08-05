import { chromium } from '@playwright/test';
import path from 'path';
import fs from 'fs';

async function run() {
  const targetPort = process.env.PORT || 3000;
  const baseUrl = `http://localhost:${targetPort}`;
  console.log(`Connecting to server at ${baseUrl}...`);

  const browser = await chromium.launch({ headless: true });
  const demoDir = path.resolve(process.cwd(), 'public/assets/demo');

  if (!fs.existsSync(demoDir)) {
    fs.mkdirSync(demoDir, { recursive: true });
  }

  const targets = [
    { name: 'cuj_02_dashboard_kpis.png', url: `${baseUrl}/dashboard?demo=true`, width: 390, height: 844 },
    { name: 'cuj_02_dashboard_activity.png', url: `${baseUrl}/dashboard?demo=true`, width: 1280, height: 800 },
    { name: 'cuj_04_quote_wizard_modal.png', url: `${baseUrl}/quotes?demo=true`, width: 390, height: 844 },
    { name: 'cuj_05_public_proposal.png', url: `${baseUrl}/q/demo?demo=true`, width: 390, height: 844 },
    { name: 'cuj_07_spei_portal.png', url: `${baseUrl}/pay/demo?demo=true`, width: 390, height: 844 },
  ];

  for (const t of targets) {
    const context = await browser.newContext({
      viewport: { width: t.width, height: t.height },
      deviceScaleFactor: 2,
    });
    const page = await context.newPage();
    const filePath = path.join(demoDir, t.name);
    console.log(`Capturing ${t.name} from ${t.url}...`);
    try {
      await page.goto(t.url, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.waitForTimeout(1500);
      await page.screenshot({ path: filePath, fullPage: false });
      console.log(`✓ SUCCESS: Captured ${t.name} (${fs.statSync(filePath).size} bytes)`);
    } catch (e) {
      console.error(`❌ FAILED ${t.name}:`, e.message);
    }
    await context.close();
  }

  await browser.close();
  console.log('✅ Screenshot generation complete!');
}

run().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
