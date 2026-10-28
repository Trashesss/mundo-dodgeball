import assert from 'node:assert/strict';
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
import { serve } from './serve.mjs';
import { skipConsent } from './skip-consent.mjs';
import { RULES } from '../src/rules.js';
import { checkLayerAtlas, waitMenuLook } from './layer-atlas.mjs';

checkLayerAtlas('arm', 'soccer');

const server = await serve(0);
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const errors = [];
const ready = page => page.waitForFunction(() => window.__game?.scene.getScene('game').state === 'menu' && document.querySelector('[data-weapon="soccer"]') && document.querySelector('#loading').classList.contains('hidden'));
try {
  fs.mkdirSync('output/soccer', { recursive: true });
  const page = await browser.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewport({ width: 1440, height: 1000 });
  await skipConsent(page);
  // A pre-existing map-only save must keep its balance and map inventory.
  await page.evaluateOnNewDocument(() => {
    if (localStorage.getItem('mundo-shop-v1') === null) localStorage.setItem('mundo-shop-v1', JSON.stringify({ coins: 300, owned: ['classic', 'colosseum'], equipped: 'colosseum', rewarded: ['old-match'] }));
  });
  await page.goto(`http://localhost:${server.address().port}/`); await ready(page);
  const initial = await page.evaluate(async () => {
    const shop = await import('/src/shop-state.js');
    return { state: shop.getShopState(), locked: shop.equipWeapon('soccer'), invalid: shop.buyWeapon('missing').ok };
  });
  assert.equal(initial.locked, false); assert.equal(initial.invalid, false);
  assert.deepEqual(initial.state.owned, ['classic', 'colosseum']);
  assert.deepEqual(initial.state.ownedWeapons, ['cleaver']);
  await page.click('#shop-open'); await page.click('[data-shop-category="weapons"]');
  assert.equal(await page.$eval('#shop-map-name', el => el.textContent), '클래식 축구공');
  await page.screenshot({ path: 'output/soccer/shop-desktop.png' });
  await page.click('#shop-action');
  assert.equal(await page.$eval('#shop-coins', el => el.textContent), '0');
  assert.equal(await page.evaluate(async () => (await import('/src/shop-state.js')).getShopState().equippedWeapon), 'cleaver', 'buying and equipping are separate steps');
  assert.equal(await page.evaluate(async () => (await import('/src/shop-state.js')).buyWeapon('soccer').ok), false, 'duplicate purchase must not charge');
  await page.click('#shop-action');
  assert.ok(await page.$eval('#shop-action', el => el.disabled));
  await waitMenuLook(page, 'classic', 'soccer');
  for (const [width, height] of [[390, 844], [320, 568], [844, 390]]) {
    await page.setViewport({ width, height });
    for (const category of ['maps', 'weapons']) {
      await page.$eval(`[data-shop-category="${category}"]`, el => el.click());
      assert.ok(await page.$eval('#shop-dialog', el => el.scrollWidth <= el.clientWidth && el.getBoundingClientRect().right <= innerWidth && el.getBoundingClientRect().bottom <= innerHeight), `shop must fit ${width}x${height}`);
    }
    if (width === 390) await page.screenshot({ path: 'output/soccer/shop-mobile.png' });
  }
  await page.setViewport({ width: 1440, height: 1000 });
  await page.click('#shop-close'); await page.reload(); await ready(page);
  const saved = await page.evaluate(async () => (await import('/src/shop-state.js')).getShopState());
  assert.equal(saved.equipped, 'colosseum'); assert.equal(saved.equippedWeapon, 'soccer');
  assert.equal(saved.coins, 0); assert.deepEqual(saved.rewarded, ['old-match']);
  const result = await page.evaluate(async () => {
    const s = window.__game.scene.getScene('game');
    s.startMatch({ diff: 'easy' }); s.scene.pause();
    const p = s.player, e = s.enemy;
    p.qCd = 0; e.qCd = 0;
    const playerTexture = p.mundo.arm.texture.key, enemyTexture = e.mundo.arm.texture.key;
    const cast = s.castQ(p, e.x, e.z);
    s.updateChamp(p, .15);
    const ball = s.cleavers[0], texture = ball.view.img.texture.key;
    const fromX = ball.x;
    s.updateCleaver(ball, .1);
    const travel = ball.x - fromX;
    for (let i = 0; i < 100 && ball.alive; i++) s.updateCleaver(ball, .01);
    const hit = p.stats.hits, hp = e.hp;
    s.castQ(e, p.x, p.z); s.updateChamp(e, .15);
    const enemyProjectile = s.cleavers.find(cl => cl.team === 1).view.img.texture.key;
    s.clearCleavers(); p.actionT = 0; p.qCd = 99; e.actionT = 0; e.qCd = 99;
    p.setAnim('idle', true); p.sync(); e.sync();
    document.querySelector('#menu').classList.add('hidden');
    return { cast, playerTexture, enemyTexture, texture, travel, hit, hp, enemyProjectile };
  });
  assert.ok(result.cast);
  assert.equal(result.playerTexture, 'mundo-arm-soccer'); assert.equal(result.enemyTexture, 'mundo-arm-cleaver');
  assert.equal(result.texture, 'soccer-ball'); assert.equal(result.enemyProjectile, 'cleaver');
  assert.ok(Math.abs(result.travel - RULES.q.speed * .1) < .001);
  assert.equal(result.hit, 1); assert.equal(result.hp, RULES.maxHp * (1 - RULES.q.dmgPct));
  await page.evaluate(() => window.__game.scene.getScene('game').scene.resume());
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.screenshot({ path: 'output/soccer/fight.png' });
  // Both online slots must render their own ball and keep enemy projectiles distinct.
  for (const slot of [0, 1]) {
    const online = await page.evaluate(slot => {
      const s = window.__game.scene.getScene('game');
      s.setupOnlineMatch(slot); s.champs.forEach((c, i) => c.reset(i ? 6.5 : -6.5, 0));
      s.state = 'play'; s.scene.pause();
      for (let team = 0; team < 2; team++) s.showEvent({ type: 'throw', ci: team, id: 900 + team, x: team ? 5 : -5, z: 0, dx: team ? -1 : 1, dz: 0 }, true);
      return { own: s.cleavers.find(cl => cl.team === slot).view.img.texture.key, other: s.cleavers.find(cl => cl.team !== slot).view.img.texture.key, player: s.player.weaponId, enemy: s.enemy.weaponId };
    }, slot);
    assert.deepEqual(online, { own: 'soccer-ball', other: 'cleaver', player: 'soccer', enemy: 'cleaver' });
  }
  await page.evaluate(() => { const s = window.__game.scene.getScene('game'); s.backToMenu(); s.scene.resume(); document.querySelector('#menu').classList.remove('hidden'); });
  await page.click('#shop-open'); await page.click('[data-shop-category="weapons"]');
  await page.click('[data-weapon="cleaver"]'); await page.click('#shop-action');
  await waitMenuLook(page, 'classic', 'cleaver');
  assert.equal(await page.$eval('#sk-q', el => el.getAttribute('aria-label')), 'Q 식칼 투척');
  assert.deepEqual(errors, []);
  console.log('Soccer: atlas completeness, save migration, purchase/equip/reload, duplicate prevention, mobile layouts, held ball, actual throw/movement/hit, both online slots and cleaver restore passed.');
} finally { await browser.close(); server.close(); }
