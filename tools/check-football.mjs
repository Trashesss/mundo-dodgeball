import assert from 'node:assert/strict';
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
import { serve } from './serve.mjs';
import { skipConsent } from './skip-consent.mjs';

const server = await serve(0);
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const ready = page => page.waitForFunction(() => window.__game?.scene.getScene('game').state === 'menu' && document.querySelector('[data-map="football"]') && document.querySelector('#loading').classList.contains('hidden'));
try {
  fs.mkdirSync('output/football', { recursive: true });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewport({ width: 1440, height: 1000 });
  await skipConsent(page);
  await page.evaluateOnNewDocument(() => {
    if (localStorage.getItem('mundo-shop-v1') === null) localStorage.setItem('mundo-shop-v1', JSON.stringify({
      coins: 400, owned: ['classic', 'colosseum'], equipped: 'colosseum',
      ownedWeapons: ['cleaver', 'soccer'], equippedWeapon: 'soccer', rewarded: ['old-match'],
    }));
  });
  await page.goto(`http://localhost:${server.address().port}/`);
  await ready(page);
  assert.equal(await page.evaluate(async () => (await import('/src/shop-state.js')).equipMap('football')), false);
  await page.click('#shop-open');
  await page.click('[data-map="football"]');
  assert.equal(await page.$eval('#shop-action', el => el.textContent), '500 코인으로 구매');
  await page.click('#shop-action');
  assert.match(await page.$eval('#shop-status', el => el.textContent), /100 코인이 더 필요/);
  assert.equal(await page.$eval('#shop-coins', el => el.textContent), '400');
  await page.evaluate(async () => (await import('/src/shop-state.js')).awardMatch('football-funds', true));
  await page.click('#shop-action');
  assert.equal(await page.$eval('#shop-coins', el => el.textContent), '0');
  assert.equal(await page.evaluate(() => window.__game.scene.getScene('game').arenaId), 'colosseum', 'purchase and equip remain separate');
  assert.equal(await page.evaluate(async () => (await import('/src/shop-state.js')).buyMap('football').ok), false);
  await page.click('#shop-action');
  assert.ok(await page.$eval('#shop-action', el => el.disabled));
  await page.screenshot({ path: 'output/football/shop-desktop.png' });

  for (const [width, height] of [[390, 844], [320, 568], [844, 390]]) {
    await page.setViewport({ width, height });
    assert.ok(await page.$eval('#shop-dialog', el => el.scrollWidth <= el.clientWidth && el.getBoundingClientRect().bottom <= innerHeight));
    await page.$eval('[data-map="football"]', el => el.click());
    assert.equal(await page.$eval('#shop-map-name', el => el.textContent), '문도 축구장');
    if (width === 390) await page.screenshot({ path: 'output/football/shop-mobile.png' });
  }
  await page.setViewport({ width: 1440, height: 1000 });
  await page.click('#shop-close');
  await page.reload(); await ready(page);
  const saved = await page.evaluate(async () => (await import('/src/shop-state.js')).getShopState());
  assert.equal(saved.equipped, 'football');
  assert.equal(saved.coins, 0);
  assert.deepEqual(saved.owned, ['classic', 'colosseum', 'football']);
  assert.equal(saved.equippedWeapon, 'soccer');
  assert.ok(saved.rewarded.includes('old-match'));
  await page.click('#practice-btn'); await page.click('#start-btn');
  await page.waitForFunction(() => document.querySelector('#menu').classList.contains('hidden'));
  const registration = await page.evaluate(() => {
    const s = window.__game.scene.getScene('game');
    s.scene.pause(); s.startRound(); s.updateCamera();
    const meta = s.cache.json.get('footballMeta'), image = s.arenaImage;
    const canvas = document.createElement('canvas'); canvas.width = meta.width; canvas.height = meta.height;
    const g = canvas.getContext('2d'); g.drawImage(image.texture.getSourceImage(), 0, 0);
    const alpha = (x, y) => g.getImageData(Math.round(x), Math.round(y), 1, 1).data[3];
    const floor = Array.from({ length: 64 }, (_, i) => {
      const a = i * Math.PI * 2 / 64;
      return alpha(meta.originX + Math.cos(a) * 560 / image.scaleX, meta.originY + Math.sin(a) * 560 * Math.sin(52 * Math.PI / 180) / image.scaleY);
    });
    return {
      id: s.arenaId, texture: image.texture.key, bank: s.bank.displayTexture.key,
      water: s.water.visible, baron: s.baron.root.visible, boundary: s.sandBoundary.visible,
      corner: alpha(0, 0), center: alpha(meta.originX, meta.originY), floor,
      scaleX: image.scaleX, scaleY: image.scaleY,
      centerX: (meta.originX - image.displayOriginX) * image.scaleX,
      centerY: (meta.originY - image.displayOriginY) * image.scaleY,
    };
  });
  assert.equal(registration.id, 'football'); assert.equal(registration.texture, 'football');
  assert.equal(registration.bank, 'grass-bank');
  assert.ok(!registration.water && !registration.baron && registration.boundary);
  assert.equal(registration.corner, 0); assert.ok(registration.center >= 250);
  // Generated turf can retain slight alpha variation; reject holes or visibly translucent edges.
  assert.ok(registration.floor.every(alpha => alpha >= 245), 'the full movement boundary must stay on solid turf');
  assert.equal(registration.scaleX, registration.scaleY);
  assert.ok(Math.abs(registration.centerX) < .01 && Math.abs(registration.centerY) < .01);
  await page.screenshot({ path: 'output/football/fight-desktop.png' });
  const shrink = await page.evaluate(() => {
    const s = window.__game.scene.getScene('game');
    s.roundTime = 60; s.updateArena();
    const point = s.constrain({ x: -50, z: 0 }, s.player);
    return { radius: s.arenaR, x: point.x, visible: s.sandBoundary.visible, commands: s.sandBoundary.commandBuffer.length };
  });
  assert.ok(shrink.radius < 14 && shrink.x > -14 && shrink.visible && shrink.commands > 0);
  await page.screenshot({ path: 'output/football/fight-shrink.png' });
  await page.evaluate(() => {
    const s = window.__game.scene.getScene('game'); s.score = [1, 0]; s.endMatch(); s.scene.resume();
  });
  await page.click('#menu-btn');
  await page.click('#shop-open'); await page.click('[data-map="classic"]'); await page.click('#shop-action');
  assert.ok(await page.evaluate(() => {
    const s = window.__game.scene.getScene('game');
    return s.arenaImage.texture.key === 'arena' && s.water.visible && s.baron.root.visible && !s.sandBoundary.visible && s.bank.displayTexture.key === 'bank';
  }));
  assert.deepEqual(errors, []);
  console.log('Football: 500-coin purchase, insufficient funds, duplicate prevention, old-save compatibility, equip/reload, transparent artwork, ground registration, shrink, responsive shop and classic restore passed.');
} finally { await browser.close(); server.closeAllConnections(); server.close(); }
