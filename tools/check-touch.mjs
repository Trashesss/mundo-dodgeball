import assert from 'node:assert/strict';
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
  await page.emulate({
    viewport: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148',
  });
  await page.goto(`http://localhost:${server.address().port}/`);
  await page.waitForFunction(() => window.__game?.scene.getScene('game').state === 'menu');
  await page.tap('#practice-btn');
  await page.tap('#start-btn');
  await page.waitForFunction(() => window.__game.scene.getScene('game').state === 'play');
  await page.waitForSelector('#menu.hidden'); // 메뉴가 사라질 때까지 터치를 가로챈다
  await page.evaluate(() => {
    const scene = window.__game.scene.getScene('game');
    for (const e of scene.enemies) e.update = () => {};
    scene.enemies.forEach(e => { e.qCd = 999; e.flashCd = 999; e.ghostCd = 999; });
  });
  const state = () => page.evaluate(() => {
    const s = window.__game.scene.getScene('game'), p = s.player;
    return { x: p.x, z: p.z, target: p.moveTarget, qCd: p.qCd, flashCd: p.flashCd, ghostCd: p.ghostCd, facing: p.facing };
  });
  const center = (sel) => page.$eval(sel, el => { const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  const wait = (ms) => new Promise(r => setTimeout(r, ms));

  assert.ok(await page.evaluate(() => document.body.classList.contains('touch')), 'touch mode on');

  // 화면 가운데 탭으로는 움직이지 않는다
  const s0 = await state();
  await page.touchscreen.tap(195, 300);
  await wait(150);
  assert.equal((await state()).target, null, 'tap does not move');

  // 조이스틱 오른쪽으로 밀면 오른쪽(x+)으로 이동, 떼면 멈춘다
  await page.touchscreen.touchStart(80, 760);
  await page.touchscreen.touchMove(140, 760);
  await wait(500);
  const s1 = await state();
  assert.ok(s1.x > s0.x + 1, `joystick moves right (${s0.x} → ${s1.x})`);
  await page.touchscreen.touchEnd();
  await wait(50);
  assert.equal((await state()).target, null, 'release stops');

  // Q 버튼을 누르기만 하면 적 방향으로 조준되고, 떼면 적에게 던진다
  const q = await center('#sk-q');
  const enemyDir = () => page.evaluate(() => {
    const s = window.__game.scene.getScene('game'), p = s.player, e = s.enemy;
    return Math.atan2(e.z - p.z, e.x - p.x);
  });
  const toEnemy = await enemyDir();
  await page.touchscreen.touchStart(q.x, q.y);
  await page.touchscreen.touchEnd();
  await wait(50);
  const sTap = await state();
  assert.ok(sTap.qCd > 0, 'q cast on tap');
  assert.ok(Math.abs(sTap.facing - toEnemy) < 0.05, `q tap aims at enemy (${sTap.facing} vs ${toEnemy})`);
  await page.evaluate(() => { const p = window.__game.scene.getScene('game').player; p.qCd = 0; p.castT = 0; });

  // 누른 순간의 적 방향으로 고정된다: 누른 채 적이 움직여도 조준이 따라가지 않는다
  const toEnemyHeld = await enemyDir();
  await page.touchscreen.touchStart(q.x, q.y);
  await wait(50);
  await page.evaluate(() => { const s = window.__game.scene.getScene('game'); s.enemy.z += 4; });
  await wait(50);
  await page.touchscreen.touchEnd();
  await wait(50);
  const sHeld = await state();
  assert.ok(sHeld.qCd > 0, 'q cast after hold');
  assert.ok(Math.abs(sHeld.facing - toEnemyHeld) < 0.05, `q aim stays where enemy was on press (${sHeld.facing} vs ${toEnemyHeld})`);
  await page.evaluate(() => { const s = window.__game.scene.getScene('game'), p = s.player; s.enemy.z -= 4; p.qCd = 0; p.castT = 0; });

  // 위로 조금 끌면 적 방향에서 위쪽으로 일부만 돈다 (감도 완화)
  const toEnemy2 = await enemyDir();
  await page.touchscreen.touchStart(q.x, q.y);
  await page.touchscreen.touchMove(q.x, q.y - 60);
  await wait(50);
  await page.screenshot({ path: 'output/touch-aim.png' }).catch(() => {});
  const row = await page.evaluate(() => [document.getElementById('joy-base'), document.getElementById('sk-q'), document.querySelector('#hud .skills')].map(el => { const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right }; }));
  assert.ok(Math.abs((row[0].top + row[0].bottom) / 2 - (row[1].top + row[1].bottom) / 2) < 3, 'joystick and skills share one row');
  assert.ok(row[0].right < row[2].left, 'joystick and skills do not overlap');
  await page.touchscreen.touchEnd();
  await wait(50);
  const s2 = await state();
  assert.ok(s2.qCd > 0, 'q cast on release');
  const turned = toEnemy2 - s2.facing; // 위쪽(z-)으로 돌수록 각도가 줄어든다
  assert.ok(turned > 0.2 && turned < 1.2, `q drag turns partway (enemy ${toEnemy2}, thrown ${s2.facing})`);

  // 점멸: 왼쪽으로 반만 끌면 최대 거리의 절반쯤 이동
  const d = await center('#sk-d');
  const before = await state();
  await page.touchscreen.touchStart(d.x, d.y);
  await page.touchscreen.touchMove(d.x - 45, d.y);
  await page.touchscreen.touchEnd();
  await wait(50);
  const s3 = await state();
  assert.ok(s3.flashCd > 0, 'flash cast');
  assert.ok(Math.abs((before.x - s3.x) - 2) < 0.3, `flash half distance (${before.x - s3.x})`);

  // 유체화: 탭
  await page.tap('#sk-f');
  await wait(50);
  assert.ok((await state()).ghostCd > 0, 'ghost cast on tap');

  assert.deepEqual(errors, []);
  console.log('touch controls ok');
} finally {
  await browser.close();
  server.close();
}
