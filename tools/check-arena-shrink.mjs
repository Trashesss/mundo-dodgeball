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
  await page.setViewport({ width: 1440, height: 1000 });
  await page.goto(`http://localhost:${server.address().port}/`);
  await page.waitForFunction(() => window.__game?.scene.getScene('game').state === 'menu');
  await page.click('#practice-btn');
  await page.click('#start-btn');
  const checks = await page.evaluate(async () => {
    const scene = window.__game.scene.getScene('game');
    const { RULES } = await import('/src/rules.js');
    scene.startMatch({ diff: 'twins' });
    scene.scene.pause();
    const samples = [0, 1, 30, 60, 3600].map(time => {
      scene.roundTime = time;
      scene.updateArena();
      return scene.arenaR;
    });
    for (const champ of scene.champs) {
      champ.x = champ.side * 10;
      champ.z = 8;
      champ.moveTarget = { x: champ.side * 12, z: 10 };
      champ.qCd = 999;
      if (!champ.isPlayer) champ.ai.wanderT = 999;
    }
    scene.update(0, 16);
    const maxR = RULES.arenaR * RULES.shrink.minScale - RULES.champR * 0.5;
    const botMaxR = RULES.arenaR - RULES.champR * 0.5;
    const contained = scene.champs.every(champ => {
      const limit = champ.isPlayer ? maxR : botMaxR;
      return Math.hypot(champ.x, champ.z) <= limit + 1e-9 &&
        champ.x * champ.side >= RULES.midGap + RULES.champR &&
        Math.hypot(champ.moveTarget.x, champ.moveTarget.z) <= limit + 1e-9;
    });
    const botsOutsideShrinkingRing = scene.enemies.every(champ =>
      Math.hypot(champ.x, champ.z) > maxR &&
      Math.hypot(champ.moveTarget.x, champ.moveTarget.z) > maxR);
    scene.player.flashCd = 0;
    scene.castFlash(scene.player, -100, 100);
    const flashContained = Math.hypot(scene.player.x, scene.player.z) <= maxR + 1e-9;
    const botFlashContained = scene.enemies.every(champ => {
      champ.flashCd = 0;
      scene.castFlash(champ, 100, 100);
      const radius = Math.hypot(champ.x, champ.z);
      return radius > maxR && radius <= botMaxR + 1e-9;
    });
    const shaderMatches = scene.water.uniforms.uR.value === scene.arenaR;
    scene.endRound(0);
    const frozen = scene.arenaR;
    scene.update(0, 16);
    const resultFrozen = scene.arenaR === frozen;
    scene.startRound();
    const roundReset = scene.arenaR === RULES.arenaR;
    scene.roundTime = 90;
    scene.updateArena();
    scene.backToMenu();
    const menuReset = scene.arenaR === RULES.arenaR;
    scene.startMatch({ diff: 'normal' });
    scene.roundTime = 90;
    scene.updateArena();
    scene.update(0, 16);
    return { samples, contained, botsOutsideShrinkingRing, flashContained, botFlashContained, shaderMatches, resultFrozen, roundReset, menuReset };
  });
  const expected = [14, 14 - 4.2 / 60, 11.9, 9.8, 9.8];
  checks.samples.forEach((radius, i) => assert.ok(Math.abs(radius - expected[i]) < 1e-9));
  for (const [key, value] of Object.entries(checks)) {
    if (key !== 'samples') assert.equal(value, true, key);
  }
  fs.mkdirSync('output', { recursive: true });
  await page.screenshot({ path: 'output/arena-shrink.png' });
  assert.deepEqual(errors, []);
  console.log('Arena shrink: timing, 70% radius, player-only constraints, unrestricted bots, flash, shader, result freeze and resets passed.');
} finally {
  await browser.close();
  server.close();
}
