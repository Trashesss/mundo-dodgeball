import assert from 'node:assert/strict';
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
import { serve } from './serve.mjs';

const server = await serve(0);
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://localhost:${server.address().port}/?test=1#result`);
  await page.waitForFunction(() => window.__game?.scene.getScene('game').state === 'menu');
  await page.evaluate(async () => {
    const { HUD } = await import('/src/hud.js');
    document.getElementById('menu').classList.add('hidden');
    window.showResult = (win = true, difficulty = 'hard') => HUD.result(win, difficulty);
    window.showResult();
    Object.defineProperty(navigator, 'share', { configurable: true, value: async data => { window.shared = data; } });
  });
  await page.click('#share-btn');
  await page.waitForFunction(() => !document.getElementById('share-btn').disabled);
  const shared = await page.evaluate(() => window.shared);
  assert.match(shared.text, /어려움 난이도 클리어/);
  assert.equal(shared.url, `http://localhost:${server.address().port}/`);
  await page.evaluate(() => {
    window.showResult(false, 'twins');
    Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => { window.copied = text; } } });
  });
  await page.click('#share-btn');
  await page.waitForFunction(() => document.getElementById('share-status').textContent.includes('복사 완료'));
  assert.match(await page.evaluate(() => window.copied), /쌍둥이.*복수/);
  await page.evaluate(() => {
    window.showResult();
    navigator.clipboard.writeText = async () => { throw new Error('Permission denied'); };
  });
  await page.click('#share-btn');
  await page.waitForSelector('#share-copy:not(.hidden)');
  assert.match(await page.$eval('#share-copy', el => el.value), /문도에게 와/);
  await page.evaluate(() => {
    window.showResult();
    Object.defineProperty(navigator, 'share', { configurable: true, value: async () => { throw new DOMException('Canceled', 'AbortError'); } });
  });
  await page.click('#share-btn');
  await page.waitForFunction(() => !document.getElementById('share-btn').disabled);
  assert.equal(await page.$eval('#share-status', el => el.textContent), '');
  assert.ok(await page.$eval('#share-copy', el => el.classList.contains('hidden')));
  fs.mkdirSync('output', { recursive: true });
  for (const [width, height] of [[1440, 1000], [390, 844], [667, 375]]) {
    await page.setViewport({ width, height });
    const fits = await page.$eval('#share-btn', el => {
      const rect = el.getBoundingClientRect();
      return rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight;
    });
    assert.ok(fits, `Share button fits ${width}x${height}`);
    await page.screenshot({ path: `output/share-${width}.png` });
  }
  assert.deepEqual(errors, []);
  console.log('Result sharing: native share, outcome text, clean URL, clipboard, manual fallback, cancellation and responsive layout passed.');
} finally {
  await browser.close();
  server.close();
}
