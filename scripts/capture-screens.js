import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';


const OUT_DIR = '/root/.openclaw/workspace/fridge-ai/marketing/screens';

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } }); // iPhone 14

  const views = [
    { name: '01-home', url: 'https://fridge.goodbotai.tech' },
  ];

  for (const v of views) {
    await page.goto(v.url, { timeout: 20000 });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: `${OUT_DIR}/${v.name}.png`, fullPage: false });
    console.log(`Captured: ${v.name}`);
  }

  // Capture at 2x for retina quality
  await page.setViewportSize({ width: 780, height: 1688 });
  for (const v of views) {
    await page.goto(v.url, { timeout: 20000 });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${OUT_DIR}/${v.name}@2x.png`, fullPage: false, type: 'png' });
    console.log(`Captured @2x: ${v.name}`);
  }

  await browser.close();
  console.log('Done!');
})().catch(e => { console.error('Error:', e.message); process.exit(1); });
