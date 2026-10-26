// 프로필 창: 레벨·경험치, 룬 선택·저장·복구, 봇전 반영, 결과 화면 경험치, PC·모바일 배치
import assert from 'node:assert/strict';
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
import { serve } from './serve.mjs';
import { skipConsent } from './skip-consent.mjs';
import { RULES } from '../src/rules.js';

const server = await serve(0);
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const url = `http://localhost:${server.address().port}/`;
const errors = [];
const ready = page => page.waitForFunction(() => window.__game?.scene.getScene('game').state === 'menu' && document.querySelectorAll('.profile-rune').length === 12);
const pressed = page => page.$$eval('.profile-rune[aria-pressed="true"]', els => els.map(el => `${el.dataset.slot}:${el.dataset.rune}`));
// 메뉴 위쪽 버튼(프로필·상점·설정)이 겹치지 않고 화면 안에 있으며, 프로필이 상점 왼쪽에 있는지
const menuButtonsClear = page => page.evaluate(() => {
  const boxes = ['profile-open', 'shop-open', 'analytics-settings'].map(id => document.getElementById(id).getBoundingClientRect());
  const inside = boxes.every(b => b.left >= 0 && b.right <= innerWidth && b.top >= 0);
  const overlap = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
  return inside && boxes[0].right <= boxes[1].left && !overlap(boxes[1], boxes[2]) && !overlap(boxes[0], boxes[2]);
});
const dialogFits = page => page.$eval('#profile-dialog', el => {
  const b = el.getBoundingClientRect();
  return b.left >= 0 && b.right <= innerWidth && b.top >= 0 && b.bottom <= innerHeight;
});
try {
  fs.mkdirSync('output/profile', { recursive: true });
  const page = await browser.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewport({ width: 1440, height: 1000 });
  await skipConsent(page);
  await page.goto(url);
  await ready(page);
  await page.evaluate(() => document.fonts.ready);
  assert.equal(await page.$eval('#menu-level', el => el.textContent), '1');
  assert.ok(await menuButtonsClear(page), 'menu buttons must not overlap');

  await page.click('#profile-open');
  assert.ok(await page.$eval('#profile-dialog', el => el.open));
  assert.deepEqual(await pressed(page), ['throw:base', 'move:base', 'util:base'], 'default runes are all base');
  assert.equal(await page.$eval('#profile-xp-text', el => el.textContent), '0 / 100 XP');
  await page.click('[data-slot="throw"][data-rune="fastball"]');
  await page.click('[data-slot="move"][data-rune="iron"]');
  await page.click('[data-slot="util"][data-rune="rapid"]');
  assert.deepEqual(await pressed(page), ['throw:fastball', 'move:iron', 'util:rapid']);
  assert.ok(await dialogFits(page));
  await page.screenshot({ path: 'output/profile/profile-desktop.png' });
  await page.click('#profile-close');

  // 새로고침 후에도 유지되고, 봇전의 내 캐릭터에 반영된다 (봇은 기본 룬)
  await page.reload(); await ready(page);
  await page.click('#profile-open');
  assert.deepEqual(await pressed(page), ['throw:fastball', 'move:iron', 'util:rapid']);
  await page.click('#profile-close');
  await page.click('#practice-btn'); await page.click('#start-btn');
  await page.waitForFunction(() => document.querySelector('#menu').classList.contains('hidden'));
  const mods = await page.evaluate(() => {
    const s = window.__game.scene.getScene('game');
    return { player: s.player.mods, enemy: s.enemy.mods };
  });
  assert.equal(mods.player.qSpeed, 1.25);
  assert.equal(mods.player.taken, 0.85);
  assert.equal(mods.player.qCd, 3);
  assert.equal(mods.enemy.qSpeed, 1);
  assert.equal(mods.enemy.qCd, RULES.q.cd);

  // 승리 경험치 +100 → Lv.2, 같은 판은 다시 받지 않는다
  const xp = await page.evaluate(async () => {
    const s = window.__game.scene.getScene('game');
    s.score = [1, 0]; s.endMatch();
    const profile = await import('/src/profile-state.js');
    const first = profile.getProfile().xp;
    s.endMatch();
    return { first, after: profile.getProfile().xp, duplicate: profile.awardXp(s.analyticsMatch.match_id, true) };
  });
  assert.deepEqual(xp, { first: 100, after: 100, duplicate: 0 });
  assert.equal(await page.$eval('#result-xp', el => el.classList.contains('hidden') ? '' : el.textContent), '+100 XP · Lv.2');
  await page.screenshot({ path: 'output/profile/result-xp.png' });
  assert.equal(await page.evaluate(async () => (await import('/src/profile-state.js')).awardXp('test-loss', false)), 40);
  await page.click('#menu-btn');
  assert.equal(await page.$eval('#menu-level', el => el.textContent), '2');
  await page.click('#profile-open');
  assert.equal(await page.$eval('#profile-xp-text', el => el.textContent), '40 / 150 XP');
  await page.click('#profile-close');

  // 잘못된 저장값은 기본 룬·0 경험치로 되돌린다
  await page.evaluate(() => localStorage.setItem('mundo-profile-v1', JSON.stringify({ xp: -5, runes: { throw: 'hack', move: 'swift' }, rewarded: 'x' })));
  await page.reload(); await ready(page);
  await page.click('#profile-open');
  assert.deepEqual(await pressed(page), ['throw:base', 'move:swift', 'util:base']);
  assert.equal(await page.$eval('#profile-level', el => el.textContent), '1');
  await page.click('#profile-close');

  // 모바일 세로·가로
  for (const [width, height, name] of [[390, 844, 'portrait'], [844, 390, 'landscape'], [320, 568, 'small']]) {
    await page.setViewport({ width, height, hasTouch: true, isMobile: true });
    await page.reload(); await ready(page);
    await page.evaluate(() => document.fonts.ready);
    assert.ok(await menuButtonsClear(page), `menu buttons clear on ${name}`);
    await page.screenshot({ path: `output/profile/menu-${name}.png` });
    await page.click('#profile-open');
    assert.ok(await dialogFits(page), `profile fits on ${name}`);
    const scrollable = await page.$eval('.profile-body', el => el.scrollHeight <= el.clientHeight || getComputedStyle(el).overflowY === 'auto');
    assert.ok(scrollable);
    await page.screenshot({ path: `output/profile/profile-${name}.png` });
    await page.click('#profile-close');
  }
  assert.deepEqual(errors, []);
  console.log('Profile: level/XP, rune select/persist/repair, bot match mods, result XP, duplicate prevention and responsive layouts passed.');
} finally { await browser.close(); server.close(); }
