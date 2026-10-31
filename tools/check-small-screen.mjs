// 창이 작으면 메뉴·경기 대신 창을 키우라는 안내로 덮고, 키우면 원래 화면으로 돌아온다
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
const errors = [];
const SMALL = { width: 770, height: 800 }, SHORT = { width: 1280, height: 500 }, BIG = { width: 1280, height: 720 };
const gateOpen = page => page.$eval('#small-screen-gate', el => el.open);
const covers = page => page.$eval('#small-screen-gate', el => { const r = el.getBoundingClientRect(); return el.open && r.left <= 0 && r.top <= 0 && r.right >= innerWidth && r.bottom >= innerHeight; });
async function open(viewport, query = '') {
  const page = await browser.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewport(viewport);
  await skipConsent(page);
  await page.goto(url + query);
  await page.waitForFunction(() => window.__game?.scene.getScene('game').state === 'menu');
  await page.waitForSelector('#loading.hidden');
  return page;
}
try {
  fs.mkdirSync('output/small-screen', { recursive: true });
  // 좁은 창·낮은 창 모두 화면 전체를 덮고, Escape 로도 닫히지 않는다
  for (const [viewport, name] of [[SMALL, 'narrow'], [SHORT, 'short']]) {
    const page = await open(viewport);
    assert.ok(await covers(page), `${name}: gate covers the screen`);
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await new Promise(r => setTimeout(r, 100));
    assert.ok(await gateOpen(page), `${name}: escape keeps gate`);
    await page.screenshot({ path: `output/small-screen/${name}.png` });
    // 창을 키우면 안내가 사라지고 메뉴를 쓸 수 있다
    await page.setViewport(BIG);
    await page.waitForFunction(() => !document.getElementById('small-screen-gate').open);
    await page.click('#practice-btn');
    await page.click('#start-btn');
    await page.waitForFunction(() => window.__game.scene.getScene('game').state !== 'menu');
    // 경기 중 창을 줄이면 다시 덮는다
    await page.setViewport(viewport);
    await page.waitForFunction(() => document.getElementById('small-screen-gate').open);
    await page.setViewport(BIG);
    await page.waitForFunction(() => !document.getElementById('small-screen-gate').open);
    await page.close();
  }

  // 상점이 열린 채 창을 줄여도 안내가 맨 위에 온다
  const shop = await open(BIG);
  await shop.click('#shop-open');
  await shop.waitForSelector('#shop-dialog[open]');
  await shop.setViewport(SMALL);
  await shop.waitForFunction(() => document.getElementById('small-screen-gate').open);
  assert.equal(await shop.evaluate(() => document.elementFromPoint(innerWidth / 2, innerHeight / 2).closest('dialog')?.id), 'small-screen-gate');

  // 큰 창은 안내 없이 메뉴
  const big = await open(BIG);
  assert.equal(await gateOpen(big), false);

  // 초대 링크: 작은 창이면 안내 뒤에서 기다렸다가, 키우면 대기실로 들어간다
  const invite = await open(SMALL, '?room=ABCDEF');
  assert.ok(await gateOpen(invite));
  assert.equal(await invite.$eval('#lobby', el => el.classList.contains('hidden')), true);
  await invite.setViewport(BIG);
  await invite.waitForSelector('#lobby:not(.hidden)');

  assert.deepEqual(errors, []);
  console.log('small screen gate ok');
} finally {
  await browser.close();
  server.close();
}
