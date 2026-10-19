import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import { serve } from './serve.mjs';
import { skipConsent } from './skip-consent.mjs';

const server = await serve(0);
let browser;
try {
  browser = await puppeteer.launch({
    executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
  });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await skipConsent(page);
  await page.goto(`http://localhost:${server.address().port}/`);
  await page.waitForFunction(() => window.__game?.scene.getScene('game').state === 'menu');
  await page.click('#practice-btn');
  await page.click('[data-v="faker"]');
  await page.click('#start-btn');
  await page.waitForFunction(() => window.__game.scene.getScene('game').state === 'play');
  const result = await page.evaluate(async () => {
    const scene = window.__game.scene.getScene('game');
    const { RULES } = await import('/src/rules.js');
    const { updateBot } = await import('/src/bot.js');
    scene.scene.pause();
    const radius = RULES.arenaR * RULES.shrink.minScale;
    const fixed = [0, 30, 70].every(time => {
      scene.roundTime = time;
      scene.updateArena();
      return scene.arenaR === radius
        && Math.abs(scene.constrain({ x: -40, z: 0 }, scene.player).x) === radius - RULES.champR * 0.5
        && scene.constrain({ x: 40, z: 0 }, scene.enemy).x === radius - RULES.champR * 0.5;
    });
    const bothSidesVisible = scene.water.uniforms.uLeftOnly.value === 0;
    scene.startRound();
    const replayFixed = scene.arenaR === radius;

    // 벽을 향해 이동 중인 상대를 조준할 때 경기장 밖으로 예측하지 않는다.
    const bot = scene.enemy;
    Object.assign(scene.player, { x: -8, z: 4, vx: 0, vz: 4.4, moveTarget: { x: -8, z: 4.1 } });
    Object.assign(bot, { qCd: 0, castT: 0 });
    bot.ai.aimT = 0;
    let aim;
    const mock = {
      player: scene.player, cleavers: [], roundTime: 0,
      constrain: (point, champ) => scene.constrain(point, champ),
      castQ: (_, x, z) => { aim = { x, z }; },
    };
    updateBot(bot, mock, 1 / 60);
    const boundedAim = aim && Math.abs(aim.z - 4.1) < 0.3;

    // 첫 유체화 사용 이후에도 위험한 식칼에는 다시 유체화·점멸을 사용한다.
    Object.assign(bot, { x: 4, z: 0, castT: 0, flashCd: 0, ghostCd: 0, ghostT: 0 });
    Object.assign(bot.ai, { dodgeT: 0, ghostUsed: true });
    mock.cleavers = [{ alive: true, team: 0, age: 1, x: 3, z: 0, dx: 1, dz: 0, dist: 1 }];
    let ghost = false, flash = false;
    mock.castGhost = () => { ghost = true; bot.ghostT = RULES.ghost.dur; };
    mock.castFlash = () => { flash = true; };
    const random = Math.random;
    Math.random = () => 0.5;
    try { updateBot(bot, mock, 1 / 60); } finally { Math.random = random; }

    scene.startMatch({ diff: 'normal' });
    scene.roundTime = 70;
    scene.updateArena();
    const normalUnchanged = scene.fixedArenaR === null && scene.water.uniforms.uLeftOnly.value === 1
      && scene.constrain({ x: 40, z: 0 }, scene.enemy).x === RULES.arenaR - RULES.champR * 0.5;
    scene.startMatch({ diff: 'faker' });
    scene.backToMenu();
    const menuReset = scene.fixedArenaR === null && scene.arenaR === RULES.arenaR;
    scene.setupOnlineMatch(0);
    scene.updateArena();
    const onlineReset = scene.fixedArenaR === null && scene.arenaR === RULES.arenaR;
    return { fixed, bothSidesVisible, replayFixed, boundedAim, ghost, flash, normalUnchanged, menuReset, onlineReset };
  });
  for (const [check, passed] of Object.entries(result)) assert.ok(passed, check);
  assert.deepEqual(errors, []);
  console.log('Faker: fixed arena on both sides, replay, bounded prediction, defensive skill reuse and mode resets passed.');
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
