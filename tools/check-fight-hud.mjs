import assert from 'node:assert/strict';
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
import { serve } from './serve.mjs';
import { skipConsent } from './skip-consent.mjs';

const server = await serve(0);
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewport({ width: 1440, height: 1000 });
  await skipConsent(page);
  await page.goto(`http://localhost:${server.address().port}/`);
  await page.waitForFunction(() => window.__game?.scene.getScene('game').state === 'menu');
  await page.click('#practice-btn');
  await page.click('#start-btn');
  await page.waitForFunction(() => window.__game.scene.getScene('game').state === 'play');
  const checks = await page.evaluate(async () => {
    const scene = window.__game.scene.getScene('game');
    const { RULES } = await import('/src/rules.js');
    scene.scene.pause();
    const startsImmediately = scene.state === 'play' && scene.roundTime < 1;
    const overlaysRemoved = !document.querySelector('#announce, #countdown');
    scene.state = 'play';
    scene.player.qCd = scene.enemy.qCd = 999;
    scene.player.hp = 400;
    scene.enemy.hp = 200;
    scene.roundTime = 3600;
    scene.update(0, 16);
    const unlimited = scene.state === 'play' && scene.score.every(score => score === 0);
    const timerRemoved = !document.querySelector('[role="timer"], #fight-clock');
    scene.enemy.hp = 0;
    scene.enemy.alive = false;
    scene.update(0, 16);
    const win = scene.state === 'roundEnd' && scene.score[0] === 1;
    const frozenHp = scene.player.hp;
    scene.update(0, 16);
    const resultFrozen = scene.player.hp === frozenHp;
    scene.score = [0, 0];
    scene.startRound();
    scene.state = 'play';
    scene.player.hp = 0;
    scene.player.alive = false;
    scene.update(0, 16);
    const loss = scene.state === 'roundEnd' && scene.score[1] === 1;
    scene.score = [0, 0];
    scene.startRound();
    scene.state = 'play';
    for (const champ of scene.champs) { champ.hp = 0; champ.alive = false; }
    scene.update(0, 16);
    const draw = scene.state === 'roundEnd' && scene.score.every(score => score === 0);
    scene.endT = 0;
    scene.update(0, 16);
    const rematch = scene.state === 'play' && scene.player.hp === RULES.maxHp;
    scene.state = 'play';
    scene.player.hp = 120;
    scene.update(0, 16);
    const lowHealth = document.getElementById('fighter-0').classList.contains('low-health');
    const hp = Number(document.getElementById('health-0').getAttribute('aria-valuenow'));
    scene.startRound();
    return { startsImmediately, overlaysRemoved, unlimited, timerRemoved, win, loss, draw, rematch, resultFrozen, lowHealth, hp };
  });
  assert.ok(checks.startsImmediately && checks.overlaysRemoved && checks.unlimited && checks.timerRemoved);
  assert.ok(checks.win && checks.loss && checks.draw);
  assert.ok(checks.rematch && checks.resultFrozen && checks.lowHealth);
  assert.equal(checks.hp, 121);
  fs.mkdirSync('output', { recursive: true });
  await page.screenshot({ path: 'output/fight-hud-desktop.png' });
  for (const width of [700, 390, 320]) {
    await page.setViewport({ width, height: 844 });
    await page.evaluate(() => {
      window.__game.scale.refresh();
      window.__game.scene.getScene('game').updateCamera();
    });
    const fits = await page.evaluate(() => {
      const elements = [...document.querySelectorAll('#topbar .fighter, .fight-portrait, .health-track')]
        .filter(el => el.getClientRects().length); // 쌍둥이 모드 전용 체력바처럼 숨겨진 요소 제외
      return elements.every(el => {
        const box = el.getBoundingClientRect();
        return box.left >= 0 && box.right <= innerWidth && box.width > 0;
      });
    });
    assert.ok(fits, `HUD should fit at ${width}px`);
    if (width === 390) await page.screenshot({ path: 'output/fight-hud-mobile.png' });
  }
  assert.deepEqual(errors, []);
  console.log('Fight HUD: immediate start without announcement overlays, no time limit, knockout win/loss/draw, rematch, frozen result, low HP and responsive layout passed.');
} finally {
  await browser.close();
  server.close();
}
