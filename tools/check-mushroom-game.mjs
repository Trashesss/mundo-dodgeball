import assert from 'node:assert/strict';
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
import { serve } from './serve.mjs';
import { skipConsent } from './skip-consent.mjs';
import { RULES } from '../src/rules.js';
import { cleanLook } from '../src/net-protocol.js';

assert.deepEqual(cleanLook({ skin: 'teemo', weapon: 'mushroom' }), { skin: 'teemo', weapon: 'mushroom' });
for (const weapon of [null, {}, 'missing', '__proto__']) assert.equal(cleanLook({ weapon }).weapon, 'cleaver');

const web = await serve(0);
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const ready = page => page.waitForFunction(() => window.__game?.scene.getScene('game').state === 'menu' && document.querySelector('[data-weapon="mushroom"]') && document.querySelector('#loading').classList.contains('hidden'), { timeout: 60000 });
try {
  fs.mkdirSync('output/mushroom', { recursive: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.status() >= 400 && new URL(response.url()).hostname === 'localhost') errors.push(`${response.status()} ${response.url()}`); });
  await page.setViewport({ width: 1440, height: 1000 });
  await skipConsent(page);
  // Upgrade an old map-only save without changing its maps, balance or rewards.
  await page.evaluateOnNewDocument(() => {
    if (!localStorage.getItem('mundo-shop-v1')) localStorage.setItem('mundo-shop-v1', JSON.stringify({
      coins: 200, owned: ['classic', 'colosseum'], equipped: 'colosseum', rewarded: ['old-match'],
      ownedSkins: ['classic', 'ronaldo', 'teemo'], equippedSkin: 'classic',
    }));
  });
  await page.goto(`http://localhost:${web.address().port}/`); await ready(page);
  const initial = await page.evaluate(async () => {
    const shop = await import('/src/shop-state.js');
    return { state: shop.getShopState(), locked: shop.equipWeapon('mushroom') };
  });
  assert.deepEqual(initial.state.ownedWeapons, ['cleaver']);
  assert.equal(initial.state.equippedWeapon, 'cleaver'); assert.equal(initial.locked, false);
  assert.deepEqual(initial.state.owned, ['classic', 'colosseum']);
  await page.click('#shop-open'); await page.click('[data-shop-category="weapons"]'); await page.click('[data-weapon="mushroom"]');
  assert.equal(await page.$eval('#shop-map-name', el => el.textContent), '티모의 버섯');
  await page.click('#shop-action');
  assert.match(await page.$eval('#shop-status', el => el.textContent), /100 코인이 더 필요/);
  await page.evaluate(async () => (await import('/src/shop-state.js')).awardMatch('mushroom-win', true));
  await page.click('#shop-action');
  assert.equal(await page.$eval('#shop-coins', el => el.textContent), '0');
  const purchase = await page.evaluate(async () => {
    const shop = await import('/src/shop-state.js');
    return { equipped: shop.getShopState().equippedWeapon, duplicate: shop.buyWeapon('mushroom').ok, coins: shop.getShopState().coins };
  });
  assert.deepEqual(purchase, { equipped: 'cleaver', duplicate: false, coins: 0 });
  await page.click('#shop-action');
  assert.equal(await page.evaluate(() => window.__game.scene.getScene('game').menuMundos[0].texture.key), 'mundo-mushroom');
  assert.equal(await page.$eval('#sk-q', el => el.getAttribute('aria-label')), 'Q 버섯 투척');
  assert.ok((await page.$eval('.q-icon', el => getComputedStyle(el).backgroundImage)).includes('teemo-mushroom-throw-icon-v1.png'));
  await page.screenshot({ path: 'output/mushroom/shop-desktop.png' });
  for (const [width, height] of [[390, 844], [320, 568], [844, 390]]) {
    await page.setViewport({ width, height });
    assert.ok(await page.$eval('#shop-dialog', el => el.scrollWidth <= el.clientWidth && el.getBoundingClientRect().right <= innerWidth && el.getBoundingClientRect().bottom <= innerHeight), `shop fits ${width}x${height}`);
    if (width <= 650) assert.ok(await page.evaluate(() => {
      const catalog = document.querySelector('.shop-catalog').getBoundingClientRect();
      const feature = document.querySelector('.shop-feature').getBoundingClientRect();
      return [...document.querySelectorAll('#shop-weapon-list .shop-map-card')].every(card => card.getBoundingClientRect().bottom <= catalog.bottom) && catalog.bottom <= feature.top;
    }), 'all three weapons fit before the detail section');
    if (width === 390) await page.screenshot({ path: 'output/mushroom/shop-mobile.png' });
  }
  await page.setViewport({ width: 1440, height: 1000 });
  await page.click('#shop-close'); await page.reload(); await ready(page);
  const saved = await page.evaluate(async () => (await import('/src/shop-state.js')).getShopState());
  assert.equal(saved.equippedWeapon, 'mushroom'); assert.equal(saved.coins, 0);
  assert.equal(saved.equipped, 'colosseum'); assert.equal(saved.rewarded[0], 'old-match');

  for (const skin of ['classic', 'ronaldo', 'teemo']) {
    const result = await page.evaluate(async skin => {
      (await import('/src/shop-state.js')).equipSkin(skin);
      const s = window.__game.scene.getScene('game'); s.startMatch({ diff: 'easy' }); s.scene.pause();
      const p = s.player, e = s.enemy, textures = [];
      for (const state of ['idle', 'run', 'throw', 'dance', 'death']) for (let d = 0; d < 8; d++) {
        p.facing = d * Math.PI / 4; p.visualDir = null; p.setAnim(state, true); textures.push(p.sprite.texture.key);
      }
      p.qCd = 0; p.actionT = 0; p.facing = 0; p.visualDir = null;
      const cast = s.castQ(p, e.x, e.z); s.updateChamp(p, .15);
      const shot = s.cleavers[0], fromX = shot.x, texture = shot.view.img.texture.key, cooldown = p.qCd;
      s.updateCleaver(shot, .1); const travel = shot.x - fromX;
      for (let i = 0; i < 150 && shot.alive; i++) s.updateCleaver(shot, .01);
      const hit = p.stats.hits, hp = e.hp;
      e.qCd = 0; s.castQ(e, p.x, p.z); s.updateChamp(e, .15);
      const enemyTexture = s.cleavers.find(cl => cl.team === e.team).view.img.texture.key;
      s.clearCleavers(); p.actionT = 0; p.qCd = 99; e.qCd = 99;
      p.setAnim('idle', true); p.sync(); e.sync();
      document.querySelector('#menu').classList.add('hidden');
      return { cast, textures, texture, enemyTexture, cooldown, travel, hit, hp };
    }, skin);
    assert.ok(result.cast); assert.ok(result.textures.every(texture => texture === `mundo-${skin === 'classic' ? '' : `${skin}-`}mushroom`));
    assert.equal(result.texture, 'mushroom'); assert.equal(result.enemyTexture, 'cleaver');
    assert.ok(Math.abs(result.travel - RULES.q.speed * .1) < .001);
    assert.ok(Math.abs(result.cooldown - (RULES.q.cd - .15)) < .001);
    assert.equal(result.hit, 1); assert.equal(result.hp, RULES.maxHp * (1 - RULES.q.dmgPct));
    await page.evaluate(() => window.__game.scene.getScene('game').scene.resume());
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await page.screenshot({ path: `output/mushroom/fight-${skin}.png` });
    await page.evaluate(() => { const s = window.__game.scene.getScene('game'); s.backToMenu(); document.querySelector('#menu').classList.remove('hidden'); });
  }
  // Render the remote mushroom in either slot, independently of our own weapon.
  for (const slot of [0, 1]) {
    const online = await page.evaluate(async slot => {
      const shop = await import('/src/shop-state.js'); shop.equipWeapon('cleaver'); shop.equipSkin('classic');
      const s = window.__game.scene.getScene('game');
      s.setupOnlineMatch(slot, 'online', [{ skin: 'teemo', weapon: 'mushroom' }, { skin: 'teemo', weapon: 'mushroom' }]);
      s.champs.forEach((c, i) => c.reset(i ? 6.5 : -6.5, 0)); s.scene.pause();
      for (let team = 0; team < 2; team++) s.showEvent({ type: 'throw', ci: team, id: 900 + team, x: team ? 5 : -5, z: 0, dx: team ? -1 : 1, dz: 0 }, true);
      return { own: s.cleavers.find(cl => cl.team === slot).view.img.texture.key, other: s.cleavers.find(cl => cl.team !== slot).view.img.texture.key, enemy: s.enemy.sprite.texture.key };
    }, slot);
    assert.deepEqual(online, { own: 'cleaver', other: 'mushroom', enemy: 'mundo-teemo-mushroom' });
  }
  await page.evaluate(() => { const s = window.__game.scene.getScene('game'); s.backToMenu(); s.scene.resume(); });
  for (const weapon of ['mushroom', 'cleaver']) {
    await page.evaluate(async weapon => (await import('/src/shop-state.js')).equipWeapon(weapon), weapon);
    assert.equal(await page.$eval('.q-icon', el => el.classList.contains('mushroom-icon')), weapon === 'mushroom');
  }
  assert.deepEqual(errors, []);
  console.log('Mushroom gameplay: purchase/equip/save migration, mobile shop, three skins × five states × eight directions, projectile speed/damage/cooldown, remote rendering in both slots and cleaver restore passed.');
} finally {
  await browser.close(); web.close();
}
