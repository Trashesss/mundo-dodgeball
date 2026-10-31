// 터치 전용 기기는 메뉴·대기실 대신 PC 안내 화면만 보여 준다
import assert from 'node:assert/strict';
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
import { serve } from './serve.mjs';
import { skipConsent } from './skip-consent.mjs';

const server = await serve(0);
const url = `http://localhost:${server.address().port}/`;
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});
const visible = (page, sel) => page.$eval(sel, el => !el.classList.contains('hidden') && getComputedStyle(el).display !== 'none');
try {
  fs.mkdirSync('output/mobile-gate', { recursive: true });
  for (const [width, height, name] of [[390, 844, 'portrait'], [844, 390, 'landscape'], [320, 568, 'small'], [1024, 1366, 'tablet']]) {
    for (const query of ['', '?room=ABCDEF']) {
      const page = await browser.newPage();
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.setViewport({ width, height, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
      await skipConsent(page);
      await page.goto(url + query);
      await page.waitForFunction(() => window.__game?.scene.getScene('game').state === 'menu');
      await new Promise(r => setTimeout(r, 300));
      assert.ok(await visible(page, '#mobile-gate'), `${name}${query}: gate shown`);
      assert.equal(await visible(page, '#menu'), false, `${name}${query}: menu hidden`);
      assert.equal(await visible(page, '#lobby'), false, `${name}${query}: lobby hidden`);
      assert.equal(await page.evaluate(() => !!document.querySelector('dialog[open]')), false, `${name}${query}: no dialog over gate`);
      const fits = await page.$eval('#mobile-gate-copy', el => { const r = el.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth; });
      if (height >= 568) assert.ok(fits, `${name}: copy button on screen`);
      if (!query) await page.screenshot({ path: `output/mobile-gate/${name}.png` });
      assert.deepEqual(errors, []);
      await page.close();
    }
  }

  // 링크 복사: 공유 시트가 없으면 클립보드에 현재 주소(초대 코드 포함)를 넣는다
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await skipConsent(page);
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => { window.copied = text; } } });
  });
  await page.goto(`${url}?room=ABCDEF`);
  await page.waitForSelector('#mobile-gate:not(.hidden)');
  await page.tap('#mobile-gate-copy');
  await page.waitForFunction(() => document.getElementById('mobile-gate-status').textContent);
  assert.equal(await page.evaluate(() => window.copied), `${url}?room=ABCDEF`);

  // 마우스가 있는 PC 는 안내 없이 메뉴로 들어간다
  const pc = await browser.newPage();
  await pc.setViewport({ width: 1280, height: 720 });
  await skipConsent(pc);
  await pc.goto(url);
  await pc.waitForSelector('#menu:not(.hidden)');
  assert.equal(await visible(pc, '#mobile-gate'), false, 'pc: no gate');
  console.log('mobile gate ok');
} finally {
  await browser.close();
  server.close();
}
