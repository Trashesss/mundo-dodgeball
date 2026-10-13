import puppeteer from 'puppeteer-core';
import { serve } from './serve.mjs';

const server = await serve(0);
let browser;
try {
  browser = await puppeteer.launch({
    executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 630, deviceScaleFactor: 1 });
  await page.goto(`http://localhost:${server.address().port}/tools/share-preview.html`, { waitUntil: 'networkidle0' });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: 'assets/cartoon/share-preview.png' });
  console.log('Saved assets/cartoon/share-preview.png (1200 × 630).');
} finally {
  await browser?.close();
  server.close();
}
