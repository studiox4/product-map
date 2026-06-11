/* eslint-disable no-console */
// One-off screenshot audit for signature-set Wave 1 verification (not a test).
// Run: pnpm exec tsx e2e/.screenshot-audit.ts
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const OUT = path.resolve(__dirname, '../docs/superpowers/verification/signature-w1-round-1');
const BASE = 'http://localhost:5173';

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();

  const features = await (await fetch('http://localhost:3411/api/features')).json();
  const editorFeature = features.find((f: any) => f.title === 'Rich markdown editor');
  const docId = editorFeature.documents[0].id;

  const targets: [string, string][] = [
    ['landing', '/'],
    ['board', '/board'],
    ['roadmap', '/roadmap'],
    ['docs', '/docs'],
    ['editor', `/docs/${docId}`],
    ['feature', `/features/${editorFeature.id}`],
  ];

  for (const theme of ['light', 'dark'] as const) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
    await context.addInitScript((t) => localStorage.setItem('pmTheme', t), theme);
    // Welcome dialog quiet — use the seeded user's real id
    const users = await (await fetch('http://localhost:3411/api/users')).json();
    await context.addInitScript((id) => localStorage.setItem('pmUserId', id), users[0].id);
    const page = await context.newPage();
    for (const [name, route] of targets) {
      await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(700); // let staggered fade-ups settle
      await page.screenshot({ path: path.join(OUT, `${name}-${theme}.png`), fullPage: true });
      console.log(`captured ${name}-${theme}.png`);
    }
    await context.close();
  }
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
