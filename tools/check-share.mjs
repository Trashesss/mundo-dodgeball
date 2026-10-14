import assert from 'node:assert/strict';
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
import { serve } from './serve.mjs';
import { DIFFICULTY_NAMES, shareContent } from '../src/share.js';

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
  assert.equal(shared.title, '[문도 피구] 어려움 난이도 클리어!');
  assert.equal(await page.$eval('#share-btn', el => el.textContent), '자랑하기');
  const sharedUrl = new URL(shared.url);
  assert.equal(sharedUrl.origin + sharedUrl.pathname, `http://localhost:${server.address().port}/share/hard-win.html`);
  assert.match(sharedUrl.searchParams.get('share_id'), /^[0-9a-f-]{36}$/);
  assert.equal(sharedUrl.searchParams.get('utm_source'), 'friend');
  assert.equal(sharedUrl.searchParams.get('utm_medium'), 'share');
  assert.equal(sharedUrl.searchParams.has('test'), false);
  assert.equal(sharedUrl.hash, '');
  await page.evaluate(() => {
    window.showResult(false, 'twins');
    Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => { window.copied = text; } } });
  });
  await page.click('#share-btn');
  await page.waitForFunction(() => window.copied);
  assert.match(await page.evaluate(() => window.copied), /쌍둥이 난이도 실패/);
  assert.equal(await page.$eval('#share-btn', el => el.textContent), '공유하기');
  await page.evaluate(() => {
    window.showResult();
    navigator.clipboard.writeText = async () => { throw new Error('Permission denied'); };
  });
  await page.click('#share-btn');
  await page.waitForFunction(() => !document.getElementById('share-btn').disabled);
  assert.equal(await page.$eval('#share-status', el => el.textContent), '');
  await page.evaluate(() => {
    window.showResult();
    Object.defineProperty(navigator, 'share', { configurable: true, value: async () => { throw new DOMException('Canceled', 'AbortError'); } });
  });
  await page.click('#share-btn');
  await page.waitForFunction(() => !document.getElementById('share-btn').disabled);
  assert.equal(await page.$eval('#share-status', el => el.textContent), '');
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
  const crawler = await browser.newPage();
  await crawler.setJavaScriptEnabled(false);
  for (const difficulty of Object.keys(DIFFICULTY_NAMES)) {
    for (const result of ['win', 'loss']) {
      const { title, description } = shareContent(difficulty, result === 'win');
      await crawler.goto(`http://localhost:${server.address().port}/share/${difficulty}-${result}.html`);
      assert.equal(await crawler.$eval('meta[property="og:title"]', el => el.content), title);
      assert.equal(await crawler.$eval('meta[name="twitter:title"]', el => el.content), title);
      assert.equal(await crawler.$eval('meta[property="og:description"]', el => el.content), description);
      const imageUrl = await crawler.$eval('meta[property="og:image"]', el => el.content);
      assert.ok(imageUrl.endsWith(`/share-preview-${difficulty}-${result}.png`));
      assert.ok(fs.existsSync(`assets/cartoon/share-preview-${difficulty}-${result}.png`));
    }
  }
  await crawler.close();
  await page.bringToFront();
  await page.goto(shared.url);
  await page.waitForFunction(() => window.__game?.scene.getScene('game').state === 'menu');
  assert.equal(new URL(page.url()).pathname, '/');
  assert.equal(new URL(page.url()).search, sharedUrl.search);
  console.log('Result sharing: native share, outcome text, clean URL, clipboard, manual fallback, cancellation and responsive layout passed.');
} finally {
  await browser.close();
  server.close();
}
