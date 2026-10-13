import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
import { serve } from './serve.mjs';

const server = await serve(0);
let browser;
try {
  browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  const page = await browser.newPage();
  await page.goto(`http://localhost:${server.address().port}/tools/animation-preview.html`);
  const arena = await page.evaluate(async () => (await import('/tools/cartoon-arena.js')).bakeCartoonArena());
  fs.writeFileSync(new URL('../assets/cartoon/arena.png', import.meta.url), Buffer.from(arena.data.split(',')[1], 'base64'));
  fs.writeFileSync(new URL('../assets/cartoon/arena.json', import.meta.url), JSON.stringify(arena.meta, null, 2) + '\n');
  console.log('Cartoon arena baked.');
} finally {
  await browser?.close(); server.close();
}
