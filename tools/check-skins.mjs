import assert from 'node:assert/strict';
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
import { serve } from './serve.mjs';
import { skipConsent } from './skip-consent.mjs';
import { RULES } from '../src/rules.js';
import { checkLayerAtlas, waitMenuLook } from './layer-atlas.mjs';

const skinId = process.argv.includes('--corporate') ? 'corporate' : process.argv.includes('--teemo') ? 'teemo' : 'ronaldo';
const skinPrice = { corporate: 1000, teemo: 600, ronaldo: 777 }[skinId];
const winCount = Math.max(7, Math.ceil((skinPrice - 100) / 100));
const earnedCoins = 100 + winCount * 100;
const output = `output/skins/${skinId}`;
checkLayerAtlas('body', skinId);

const server = await serve(0);
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const url = `http://localhost:${server.address().port}/`;
const errors = [];
const ready = page => page.waitForFunction(() => window.__game?.scene.getScene('game').state === 'menu' && document.querySelector('[data-skin="corporate"]') && document.querySelector('#loading').classList.contains('hidden'));
try {
  fs.mkdirSync(output, { recursive: true });
  const page = await browser.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.status() >= 400 && response.url().startsWith(url)) errors.push(`${response.status()} ${response.url()}`); });
  await page.setViewport({ width: 1440, height: 1000 });
  await skipConsent(page);
  await page.evaluateOnNewDocument(() => {
    if (localStorage.getItem('mundo-shop-v1') === null) localStorage.setItem('mundo-shop-v1', JSON.stringify({ coins: 100, owned: ['classic', 'colosseum'], equipped: 'colosseum', ownedWeapons: ['cleaver', 'soccer'], equippedWeapon: 'soccer', rewarded: ['old-match'] }));
  });
  await page.goto(url); await ready(page);
  const preserved = await page.evaluate(async skinId => {
    const { loadCartoonMotion } = await import('/tools/cartoon-motion.js');
    const sources = { corporate: '/assets/cartoon/corporate/parts-source-ivory-v3.png', teemo: '/assets/cartoon/teemo/parts-source-straps-v2.png', ronaldo: '/assets/cartoon/ronaldo/parts-source-mask-v2.png' };
    const bodyImage = new Image(); bodyImage.src = sources[skinId]; await bodyImage.decode();
    const rig = skinId !== 'ronaldo' ? await (await fetch(`/assets/cartoon/${skinId}/rig.json`)).json() : {};
    const base = await loadCartoonMotion(), skin = await loadCartoonMotion({ bodyImage, ...rig });
    if (skinId === 'corporate') {
      const uncorrected = await loadCartoonMotion({ bodyImage, ...rig, bodySkinColorOffset: null });
      let correctedPixels = 0;
      for (let row = 0; row < 4; row++) {
        const before = uncorrected.views[row].core, after = skin.views[row].core;
        const a = before.getContext('2d').getImageData(0, 0, before.width, before.height).data;
        const b = after.getContext('2d').getImageData(0, 0, after.width, after.height).data;
        for (let i = 0; i < a.length; i += 4) {
          if (a[i + 3] !== b[i + 3]) return false;
          // Compare opaque interiors; premultiplication rounds translucent edges.
          if (a[i + 3] < 250) continue;
          const purple = a[i] >= 80 && a[i] > a[i + 1] + 20 && a[i + 2] > a[i] + 12;
          if (purple) correctedPixels++;
          for (let c = 0; c < 3; c++) {
            const expected = a[i + c] + (purple ? rig.bodySkinColorOffset[c] : 0);
            if (Math.abs(b[i + c] - expected) > 1) return false;
          }
        }
      }
      if (correctedPixels < 1000) return false;
    }
    const equal = (a, b) => {
      if (a.width !== b.width || a.height !== b.height) return false;
      const aa = a.getContext('2d').getImageData(0, 0, a.width, a.height).data;
      const bb = b.getContext('2d').getImageData(0, 0, b.width, b.height).data;
      return aa.every((value, i) => value === bb[i]);
    };
    if (skinId === 'corporate' && !equal(skin.views[0].core, skin.views[1].core)) return false;
    if (skinId === 'corporate') {
      const meta = await (await fetch('/assets/cartoon/meta.json')).json();
      const drawArm = (view, key, frame, frames) => {
        const c = Object.assign(document.createElement('canvas'), { width: 320, height: 320 });
        const g = c.getContext('2d'); g.translate(160, 243.2); g.scale(1.25, 1.25);
        skin.draw(g, key, view, frame, frames, 'arm');
        return c;
      };
      for (const [key, anim] of Object.entries(meta.anims)) for (const frame of [0, Math.floor(anim.frames / 2), anim.frames - 1]) {
        if (!equal(drawArm(0, key, frame, anim.frames), drawArm(1, key, frame, anim.frames))) return false;
      }
    }
    return base.views.every((v, i) => {
      const other = skin.views[i];
      const coreBase = base.views[rig.bodyCoreViews?.[i] ?? i];
      const scale = (other.coreHeight ?? 104) / other.core.height;
      const padding = rig.bodyPadding ?? { left: 0, top: 0 };
      return Math.abs((other.core.width * other.corePivotX - padding.left) * scale - coreBase.core.width / 2 * 104 / coreBase.core.height) < 1e-9
        && Math.abs((other.core.height * other.corePivotY - padding.top) * scale - 104) < 1e-9
        && ['weapon', 'empty', 'unarmed'].every(key => equal(v[key], other[key]))
        && v.legs.every((leg, j) => equal(leg, other.legs[j]));
    });
  }, skinId);
  assert.ok(preserved, 'skin must preserve original torso scale, registration and pixel-identical arms, legs and bare feet');
  const migrated = await page.evaluate(async skinId => {
    const shop = await import('/src/shop-state.js');
    const state = shop.getShopState();
    state.ownedSkins.push(skinId);
    return { state: shop.getShopState(), locked: shop.equipSkin(skinId), invalid: shop.buySkin('missing').ok };
  }, skinId);
  assert.equal(migrated.locked, false); assert.equal(migrated.invalid, false);
  assert.deepEqual(migrated.state.ownedSkins, ['classic']);
  assert.deepEqual(migrated.state.ownedWeapons, ['cleaver', 'soccer']);
  assert.deepEqual(migrated.state.owned, ['classic', 'colosseum']);
  await page.click('#shop-open'); await page.click('[data-shop-category="skins"]');
  await page.click(`[data-skin="${skinId}"]`);
  assert.equal(await page.$eval('#shop-map-name', el => el.textContent), { corporate: 'CEO 문도', teemo: '티모 문도', ronaldo: '호날두 문도' }[skinId]);
  await page.click('#shop-action');
  assert.ok((await page.$eval('#shop-status', el => el.textContent)).includes(`${skinPrice - 100} 코인이 더 필요`));
  assert.equal(await page.$eval('#shop-coins', el => el.textContent), '100');
  await page.evaluate(async winCount => {
    const shop = await import('/src/shop-state.js');
    for (let i = 0; i < winCount; i++) shop.awardMatch(`skin-win-${i}`, true);
  }, winCount);
  await page.click('#shop-action');
  assert.equal(await page.$eval('#shop-coins', el => el.textContent), String(earnedCoins - skinPrice));
  assert.equal(await page.evaluate(async () => (await import('/src/shop-state.js')).getShopState().equippedSkin), 'classic');
  assert.equal(await page.evaluate(async skinId => (await import('/src/shop-state.js')).buySkin(skinId).ok, skinId), false);
  await page.click('#shop-action');
  assert.ok(await page.$eval('#shop-action', el => el.disabled));
  await waitMenuLook(page, skinId, 'soccer');
  await page.screenshot({ path: `${output}/shop-desktop.png` });
  for (const [width, height] of [[390, 844], [320, 568], [844, 390]]) {
    await page.setViewport({ width, height });
    for (const category of ['maps', 'weapons', 'skins']) {
      await page.$eval(`[data-shop-category="${category}"]`, el => el.click());
      if (category === 'skins') await page.$eval(`[data-skin="${skinId}"]`, el => el.click());
      assert.ok(await page.$eval('#shop-dialog', el => el.scrollWidth <= el.clientWidth && el.getBoundingClientRect().right <= innerWidth && el.getBoundingClientRect().bottom <= innerHeight), `shop fits ${width}x${height}`);
      if (width <= 650) assert.ok(await page.evaluate(() => {
        const catalog = document.querySelector('.shop-catalog').getBoundingClientRect();
        const feature = document.querySelector('.shop-feature').getBoundingClientRect();
        const cards = [...document.querySelectorAll('.shop-map-list:not([hidden]) .shop-map-card')];
        return cards.every(card => card.getBoundingClientRect().bottom <= catalog.bottom) && catalog.bottom <= feature.top;
      }), `all cards fit above the detail section at ${width}x${height}`);
    }
    if (width === 390) await page.screenshot({ path: `${output}/shop-mobile.png` });
  }
  await page.setViewport({ width: 1440, height: 1000 });
  await page.click('#shop-close'); await page.reload(); await ready(page);
  const saved = await page.evaluate(async () => (await import('/src/shop-state.js')).getShopState());
  assert.equal(saved.equippedSkin, skinId); assert.equal(saved.equippedWeapon, 'soccer');
  assert.equal(saved.equipped, 'colosseum'); assert.equal(saved.coins, earnedCoins - skinPrice); assert.equal(saved.rewarded[0], 'old-match');

  if (skinId === 'corporate') await page.evaluate(async () => {
    const shop = await import('/src/shop-state.js');
    for (let i = 0; i < 3; i++) shop.awardMatch(`arm-check-${i}`, true);
    if (!shop.buyWeapon('mushroom').ok) throw new Error('Could not buy mushroom for arm checks');
  });
  for (const weapon of ['cleaver', 'soccer', ...(skinId === 'corporate' ? ['mushroom'] : [])]) {
    const result = await page.evaluate(async weapon => {
      const { armFrameName } = await import('/src/character-frames.js');
      (await import('/src/shop-state.js')).equipWeapon(weapon);
      const s = window.__game.scene.getScene('game');
      s.startMatch({ diff: 'easy' }); s.scene.pause();
      const p = s.player, e = s.enemy;
      const textures = [], armFrames = [];
      for (const key of ['idle', 'run', 'throw', 'dance', 'death']) for (let d = 0; d < 8; d++) {
        p.facing = d * Math.PI / 4; p.visualDir = null; p.setAnim(key, true);
        textures.push(`${p.sprite.texture.key}+${p.mundo.arm.texture.key}`);
        for (const frame of [0, Math.floor(s.meta.anims[key].frames / 2), s.meta.anims[key].frames - 1]) {
          p.sprite.setFrame(`${key}_${s.meta.aliases?.[d] ?? d}_${frame}`);
          p.mundo.follow();
          armFrames.push(p.mundo.arm.frame.name === armFrameName(p.sprite.frame.name, p.mundo.offsets.frameAliases));
        }
      }
      p.facing = 0; p.visualDir = null; p.qCd = 0;
      s.castQ(p, e.x, e.z); s.updateChamp(p, .15);
      const projectile = s.cleavers[0];
      const projectileTexture = projectile.view.img.texture.key;
      for (let i = 0; i < 150 && projectile.alive; i++) s.updateCleaver(projectile, .01);
      p.actionT = 0; p.setAnim('idle', true); p.sync(); e.sync();
      document.querySelector('#menu').classList.add('hidden');
      return { textures, armFrames, enemy: `${e.sprite.texture.key}+${e.mundo.arm.texture.key}`, projectileTexture, hits: p.stats.hits, enemyHp: e.hp };
    }, weapon);
    assert.ok(result.textures.every(texture => texture === `mundo-body-${skinId}+mundo-arm-${weapon}`));
    assert.ok(result.armFrames.every(Boolean), 'arm aliases must preserve direction and animation phase');
    assert.equal(result.enemy, 'mundo-body-classic+mundo-arm-cleaver');
    assert.equal(result.projectileTexture, { soccer: 'soccer-ball', mushroom: 'mushroom', cleaver: 'cleaver' }[weapon]);
    assert.equal(result.hits, 1); assert.equal(result.enemyHp, RULES.maxHp * (1 - RULES.q.dmgPct));
    await page.evaluate(() => { const s = window.__game.scene.getScene('game'); s.scene.resume(); });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await page.screenshot({ path: `${output}/fight-${weapon}.png` });
    const closeup = await page.evaluate(() => {
      const game = window.__game, s = game.scene.getScene('game'), camera = s.cameras.main;
      const point = camera.matrix.transformPoint(s.player.sprite.x - camera.scrollX, s.player.sprite.y - camera.scrollY);
      const rect = game.canvas.getBoundingClientRect();
      const x = rect.left + point.x * rect.width / game.scale.width;
      const y = rect.top + point.y * rect.height / game.scale.height;
      return { x: Math.round(x - 90), y: Math.round(y - 140), width: 180, height: 180 };
    });
    await page.screenshot({ path: `${output}/closeup-${weapon}.png`, clip: closeup });
  }
  if (skinId === 'corporate') await page.evaluate(async () => (await import('/src/shop-state.js')).equipWeapon('soccer'));
  for (const slot of [0, 1]) {
    const online = await page.evaluate(slot => {
      const s = window.__game.scene.getScene('game');
      s.setupOnlineMatch(slot); s.champs.forEach((c, i) => c.reset(i ? 6.5 : -6.5, 0)); s.scene.pause();
      const look = c => `${c.sprite.texture.key}+${c.mundo.arm.texture.key}`;
      return { player: s.player.skinId, texture: look(s.player), enemy: s.enemy.skinId, enemyTexture: look(s.enemy) };
    }, slot);
    assert.deepEqual(online, { player: skinId, texture: `mundo-body-${skinId}+mundo-arm-soccer`, enemy: 'classic', enemyTexture: 'mundo-body-classic+mundo-arm-cleaver' });
  }
  await page.evaluate(() => { const s = window.__game.scene.getScene('game'); s.backToMenu(); s.scene.resume(); document.querySelector('#menu').classList.remove('hidden'); });
  await page.click('#shop-open'); await page.click('[data-shop-category="skins"]');
  await page.click('[data-skin="classic"]'); await page.click('#shop-action');
  await waitMenuLook(page, 'classic', 'soccer');
  await page.click('[data-shop-category="weapons"]'); await page.click('[data-weapon="cleaver"]'); await page.click('#shop-action');
  await waitMenuLook(page, 'classic', 'cleaver');

  // A contact sheet uses the actual baked frames, including mirrored numerals.
  const sheets = await page.evaluate(async skinId => {
    const sheets = [];
    const { loadLayer, drawPose } = await import('/tools/character-layers.js');
    const meta = await (await fetch('/assets/cartoon/meta.json')).json(), body = await loadLayer('body', skinId);
    for (const weapon of ['cleaver', 'soccer', ...(skinId === 'corporate' ? ['mushroom'] : [])]) {
      const arm = await loadLayer('arm', weapon);
      const c = Object.assign(document.createElement('canvas'), { width: 1600, height: 1100 });
      const g = c.getContext('2d'); g.fillStyle = '#304e5c'; g.fillRect(0, 0, c.width, c.height);
      const poses = [['idle', 0], ['run', 7], ['throw', 14], ['dance', 30], ['death', 45]];
      for (const [row, [key, index]] of poses.entries()) for (let d = 0; d < 8; d++) {
        g.fillStyle = '#e1dfc7'; g.font = '14px sans-serif'; g.fillText(`${key} / ${d}`, d * 200 + 14, row * 220 + 22);
        drawPose(g, meta, body, arm, key, d, index, d * 200 + 100, row * 220 + 192);
      }
      sheets.push({ name: weapon === 'cleaver' ? skinId : `${skinId}-${weapon}`, data: c.toDataURL() });
    }
    return sheets;
  }, skinId);
  for (const sheet of sheets) fs.writeFileSync(`${output}/${sheet.name}-poses.png`, Buffer.from(sheet.data.split(',')[1], 'base64'));
  for (const blocked of [false, true]) {
    const context = await browser.createBrowserContext();
    try {
      const isolated = await context.newPage(); await skipConsent(isolated);
      await isolated.evaluateOnNewDocument((blocked, skinId, skinPrice) => {
        localStorage.setItem('mundo-shop-v1', JSON.stringify({ coins: skinPrice, owned: ['classic'], equipped: 'classic', ownedSkins: ['missing'], equippedSkin: skinId }));
        if (blocked) {
          const original = Storage.prototype.setItem;
          Storage.prototype.setItem = function(key, value) {
            if (key === 'mundo-shop-v1') throw new DOMException('Storage blocked', 'QuotaExceededError');
            return original.call(this, key, value);
          };
        }
      }, blocked, skinId, skinPrice);
      await isolated.goto(url); await ready(isolated);
      const result = await isolated.evaluate(async skinId => {
        const shop = await import('/src/shop-state.js');
        const before = shop.getShopState();
        const bought = shop.buySkin(skinId).ok, equipped = shop.equipSkin(skinId);
        return { before, bought, equipped, after: shop.getShopState() };
      }, skinId);
      assert.deepEqual(result.before.ownedSkins, ['classic']); assert.equal(result.before.equippedSkin, 'classic');
      assert.ok(result.bought && result.equipped); assert.equal(result.after.coins, 0);
      assert.equal(result.after.equippedSkin, skinId); assert.equal(result.after.persistent, !blocked);
    } finally { await context.close(); }
  }
  assert.deepEqual(errors, []);
  console.log('Skins: complete unclipped atlases, save migration, locked/invalid/duplicate purchase, purchase/equip/reload, mobile categories, both weapon combinations, all eight directions/states, real hits, both online slots and default restore passed.');
} finally { await browser.close(); server.close(); }
