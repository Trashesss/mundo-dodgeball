import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
import { serve } from './serve.mjs';

const server = await serve(0);
let browser;
try {
  browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
  const page = await browser.newPage();
  await page.goto(`http://localhost:${server.address().port}/tools/animation-preview.html`);
  const arena = await page.evaluate(async () => {
    await document.fonts.load('38px Jua');
    return (await import('/tools/colosseum-arena.js')).bakeColosseumArena();
  });
  fs.writeFileSync(new URL('../assets/cartoon/colosseum.png', import.meta.url), Buffer.from(arena.data.split(',')[1], 'base64'));
  console.log('Colosseum arena baked with the original ground projection.');
} finally {
  await browser?.close(); server.close();
}
