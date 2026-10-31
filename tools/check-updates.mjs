import assert from 'node:assert/strict';
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
import { serve } from './serve.mjs';
import { UPDATE_NOTICE, UPDATE_NOTICE_STORAGE_KEY } from '../src/updates-data.js';

const server = await serve(0);
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});
const url = `http://localhost:${server.address().port}/`;
const errors = [];
const ready = page => page.waitForFunction(() => document.querySelector('#loading').classList.contains('hidden'));
const isOpen = page => page.$eval('#updates-dialog', el => el.open);
const closed = page => page.waitForFunction(() => !document.querySelector('#updates-dialog').open
  && document.querySelector('#updates-open').getAttribute('aria-expanded') === 'false');
const seenId = page => page.evaluate(key => localStorage.getItem(key), UPDATE_NOTICE_STORAGE_KEY);
const setSeen = (page, value) => page.evaluate((key, id) => localStorage.setItem(key, id), UPDATE_NOTICE_STORAGE_KEY, value);

try {
  fs.mkdirSync('output/updates', { recursive: true });
  const page = await browser.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewport({ width: 1440, height: 1000 });
  await page.goto(url);
  await page.waitForSelector('#updates-dialog[open]');
  await page.evaluate(() => document.fonts.ready);
  assert.equal(await page.$$eval('#updates-highlights li', els => els.length), UPDATE_NOTICE.highlights.length);
  assert.equal(await page.$eval('#updates-open', el => el.getAttribute('aria-expanded')), 'true');
  await page.screenshot({ path: 'output/updates/desktop.png' });

  // 모달 밖으로 키보드 포커스가 빠져나가지 않는다.
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('Tab');
    assert.ok(await page.evaluate(() => document.activeElement === document.body || !!document.activeElement.closest('#updates-dialog')));
  }
  await page.click('#updates-close');
  await closed(page);
  assert.equal(await seenId(page), UPDATE_NOTICE.id);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'updates-open');
  assert.ok(await page.$eval('#updates-new', el => el.hidden));
  await page.reload(); await ready(page);
  assert.equal(await isOpen(page), false, 'confirmed notice stays dismissed after reload');

  await page.click('#updates-open');
  assert.equal(await isOpen(page), true);
  await page.keyboard.press('Escape'); await closed(page);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'updates-open');
  assert.equal(await page.$eval('#updates-open', el => el.getAttribute('aria-expanded')), 'false');

  await setSeen(page, 'older-update');
  await page.reload();
  await page.waitForSelector('#updates-dialog[open]');
  assert.ok(await page.$eval('#updates-new', el => !el.hidden));
  await page.click('#updates-close'); await closed(page);
  assert.equal(await seenId(page), UPDATE_NOTICE.id);

  // 다른 다이얼로그가 먼저 열린 경우 닫힐 때까지 자동 공지를 보류한다.
  await setSeen(page, 'older-update');
  const initialModal = await page.evaluateOnNewDocument(() => {
    window.addEventListener('DOMContentLoaded', () => document.querySelector('#settings-dialog').showModal(), { once: true });
  });
  await page.reload(); await ready(page);
  assert.equal(await isOpen(page), false);
  await page.click('#settings-close');
  await page.waitForSelector('#updates-dialog[open]');
  await page.click('#updates-close'); await closed(page);
  await page.removeScriptToEvaluateOnNewDocument(initialModal.identifier);

  // 확인 후 메뉴와 경기 사이를 오가도 자동으로 다시 뜨지 않는다.
  await page.click('#practice-btn');
  await page.click('#start-btn');
  await page.waitForFunction(() => document.querySelector('#menu').classList.contains('hidden'));
  assert.equal(await isOpen(page), false);
  await page.evaluate(() => {
    const scene = window.__game.scene.getScene('game');
    scene.score = [1, 0]; scene.endMatch();
  });
  await page.click('#menu-btn');
  assert.equal(await isOpen(page), false);

  for (const [width, height, name] of [[1280, 720, 'laptop'], [800, 560, 'small']]) {
    await page.setViewport({ width, height });
    await page.reload(); await ready(page);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: `output/updates/menu-${name}.png` });
    await page.click('#updates-open');
    const layout = await page.evaluate(() => {
      const dialog = document.querySelector('#updates-dialog');
      const box = dialog.getBoundingClientRect();
      const body = dialog.querySelector('.updates-body');
      const close = document.querySelector('#updates-close').getBoundingClientRect();
      return {
        fits: box.left >= 0 && box.right <= innerWidth && box.top >= 0 && box.bottom <= innerHeight,
        noHorizontalOverflow: body.scrollWidth <= body.clientWidth,
        scrollable: body.scrollHeight <= body.clientHeight || getComputedStyle(body).overflowY === 'auto',
        closeVisible: close.top >= box.top && close.bottom <= box.bottom,
      };
    });
    assert.deepEqual(layout, { fits: true, noHorizontalOverflow: true, scrollable: true, closeVisible: true }, name);
    await page.screenshot({ path: `output/updates/${name}.png` });
    await page.click('#updates-close'); await closed(page);
  }

  // 초대 링크에서는 대기실을 가리지 않고 메뉴로 돌아온 후 안내한다.
  await setSeen(page, 'older-update');
  await page.goto(`${url}?room=ABCDEF`); await ready(page);
  await page.waitForSelector('#lobby:not(.hidden)[data-state="error"]');
  assert.equal(await isOpen(page), false, 'invitation lobby is not interrupted');
  // 존재하지 않는 방의 오류 화면 → 방 입장 화면 → 메인 메뉴.
  await page.click('#lobby-leave');
  assert.equal(await isOpen(page), false);
  await page.click('#lobby-leave');
  await page.waitForSelector('#updates-dialog[open]');
  await page.click('#updates-close'); await closed(page);

  // 저장 접근이 거부된 환경에서도 공지를 닫거나 다시 열 수 있다.
  const blocked = await browser.newPage();
  blocked.on('pageerror', error => errors.push(error.message));
  await blocked.evaluateOnNewDocument(() => {
    Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('Blocked', 'SecurityError'); } });
  });
  await blocked.goto(url);
  await blocked.waitForSelector('#updates-dialog[open]');
  await blocked.click('#updates-close'); await closed(blocked);
  await blocked.click('#practice-btn'); await blocked.click('#mode-back-btn');
  assert.equal(await isOpen(blocked), false, 'storage denial does not cause repeated automatic prompts');
  await blocked.click('#updates-open');
  assert.equal(await isOpen(blocked), true);
  await blocked.keyboard.press('Escape'); await closed(blocked);

  // 읽기는 가능하지만 저장 공간이 부족해 쓰기가 실패하는 경우도 확인한다.
  await setSeen(page, 'older-update');
  const full = await browser.newPage();
  full.on('pageerror', error => errors.push(error.message));
  await full.evaluateOnNewDocument(() => {
    Storage.prototype.setItem = () => { throw new DOMException('Full', 'QuotaExceededError'); };
  });
  await full.goto(url);
  await full.waitForSelector('#updates-dialog[open]');
  await full.click('#updates-close'); await closed(full);
  await full.click('#updates-open');
  assert.equal(await isOpen(full), true);
  await full.keyboard.press('Escape'); await closed(full);
  assert.deepEqual(errors, []);
  console.log('Updates: first visit, persistence, new notice, manual reopen, keyboard, gameplay, invitation, responsive layouts and storage denial passed.');
} finally {
  await browser.close();
  server.close();
}
