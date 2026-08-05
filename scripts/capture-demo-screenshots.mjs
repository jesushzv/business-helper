import { chromium } from '@playwright/test';
import next from 'next';
import { createServer } from 'http';
import path from 'path';
import fs from 'fs';

async function run() {
  console.log('Preparing Next.js app...');
  const app = next({ dev: false, dir: process.cwd() });
  const handle = app.getRequestHandler();
  await app.prepare();

  const server = createServer((req, res) => handle(req, res));
  await new Promise((resolve) => server.listen(3009, resolve));
  console.log('✓ Server running on http://localhost:3009');

  const browser = await chromium.launch();
  const publicDemoDir = path.resolve(process.cwd(), 'public/assets/demo');

  const tasks = [
    {
      name: 'cuj_02_dashboard_kpis.png',
      url: 'http://localhost:3009/dashboard?demo=true',
      viewport: { width: 390, height: 844 },
    },
    {
      name: 'cuj_02_dashboard_activity.png',
      url: 'http://localhost:3009/dashboard?demo=true',
      viewport: { width: 1280, height: 800 },
    },
    {
      name: 'cuj_04_quote_wizard_modal.png',
      url: 'http://localhost:3009/quotes?demo=true',
      viewport: { width: 390, height: 844 },
    },
    {
      name: 'cuj_05_public_proposal.png',
      url: 'http://localhost:3009/q/demo?demo=true',
      viewport: { width: 390, height: 844 },
    },
    {
      name: 'cuj_05_signing_otp_modal.png',
      url: 'http://localhost:3009/q/demo?demo=true',
      viewport: { width: 390, height: 844 },
    },
    {
      name: 'cuj_07_spei_portal.png',
      url: 'http://localhost:3009/pay/demo?demo=true',
      viewport: { width: 390, height: 844 },
    },
  ];

  for (const t of tasks) {
    const page = await browser.newPage({ viewport: t.viewport, deviceScaleFactor: 2 });
    const targetPath = path.join(publicDemoDir, t.name);
    console.log(`Capturing ${t.name} (${t.viewport.width}x${t.viewport.height}) -> ${targetPath}...`);
    try {
      if (fs.existsSync(targetPath)) {
        fs.unlinkSync(targetPath);
      }
      await page.goto(t.url, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(1500);
      await page.screenshot({ path: targetPath, fullPage: false });
      console.log(`✓ Saved ${t.name} (${fs.statSync(targetPath).size} bytes)`);
    } catch (err) {
      console.error(`X Error capturing ${t.name}:`, err.message);
    }
    await page.close();
  }

  await browser.close();
  server.close();
  console.log('✅ Successfully generated all fresh demo screenshots!');
  process.exit(0);
}

run().catch((err) => {
  console.error('Fatal error capturing screenshots:', err);
  process.exit(1);
});
