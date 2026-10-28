import assert from 'node:assert/strict';
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
import { serve } from './serve.mjs';
import { skipConsent } from './skip-consent.mjs';

const server = await serve(0);
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
const url = `http://localhost:${server.address().port}/`;
const errors = [];
const ready = page => page.waitForFunction(() => window.__game?.scene.getScene('game').state === 'menu' && document.querySelector('[data-map="football"]'));
try {
  fs.mkdirSync('output/shop', { recursive: true });
  const page = await browser.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewport({ width: 1440, height: 1000 });
  await skipConsent(page);
  await page.goto(url);
  await ready(page);
  assert.equal(await page.$eval('#menu-coins', el => el.textContent), '100');
  assert.equal(await page.evaluate(async () => (await import('/src/shop-state.js')).equipMap('colosseum')), false);
  await page.click('#shop-open');
  await page.evaluate(() => document.fonts.ready);
  const shopBounds = () => page.$eval('#shop-dialog', el => {
    const { x, y, width, height } = el.getBoundingClientRect();
    return { x, y, width, height };
  });
  const desktopBounds = await shopBounds();
  await page.click('[data-map="classic"]');
  assert.deepEqual(await shopBounds(), desktopBounds, 'selecting a different map must not resize or move the shop');
  await page.click('[data-map="colosseum"]');
  assert.deepEqual(await shopBounds(), desktopBounds);
  await page.screenshot({ path: 'output/shop/shop-desktop.png' });
  await page.click('#shop-action');
  assert.equal(await page.$eval('#shop-coins', el => el.textContent), '100');
  assert.match(await page.$eval('#shop-status', el => el.textContent), /1400 코인이 더 필요/);
  assert.deepEqual(await page.$eval('#shop-status', el => [el.dataset.tone, el.parentElement.id, el.classList.contains('visible')]), ['error', 'shop-dialog', true]);
  await page.waitForFunction(() => getComputedStyle(document.getElementById('shop-status')).opacity === '1');
  await page.screenshot({ path: 'output/shop/shop-snackbar-error.png' });
  const snackbarInside = async (target) => target.evaluate(() => {
    const bar = document.getElementById('shop-status').getBoundingClientRect();
    const box = document.getElementById('shop-dialog').getBoundingClientRect();
    const footer = document.querySelector('.shop-footer').getBoundingClientRect();
    const button = document.getElementById('shop-action').getBoundingClientRect();
    const clearOfButton = innerWidth < 700 || bar.right <= button.left || bar.left >= button.right || bar.bottom <= button.top || bar.top >= button.bottom;
    return bar.left >= box.left && bar.right <= box.right && bar.top >= box.top && footer.top - bar.bottom >= 16 && clearOfButton;
  });
  assert.ok(await snackbarInside(page), 'snackbar sits inside the shop, above the footer with spacing');
  await page.evaluate(async () => {
    const shop = await import('/src/shop-state.js');
    for (let i = 0; i < 16; i++) shop.awardMatch(`test-win-${i}`, true);
  });
  assert.equal(await page.$eval('#shop-coins', el => el.textContent), '1,700');
  await page.click('#shop-action');
  assert.equal(await page.$eval('#shop-coins', el => el.textContent), '200');
  assert.deepEqual(await page.$eval('#shop-status', el => [el.textContent, el.dataset.tone]), ['문도 콜로세움 구매 완료!', 'success']);
  assert.deepEqual(await shopBounds(), desktopBounds, 'purchase messages must not resize or move the shop');
  assert.equal(await page.evaluate(async () => (await import('/src/shop-state.js')).buyMap('colosseum').ok), false);
  assert.equal(await page.$eval('#shop-coins', el => el.textContent), '200');
  await page.click('#shop-action');
  assert.ok(await page.$eval('#shop-action', el => el.disabled));
  assert.equal(await page.evaluate(() => window.__game.scene.getScene('game').arenaId), 'colosseum');
  const registration = await page.evaluate(() => {
    const scene = window.__game.scene.getScene('game');
    const meta = scene.cache.json.get('colosseumMeta');
    const image = scene.arenaImage;
    const canvas = document.createElement('canvas'); canvas.width = meta.width; canvas.height = meta.height;
    const context = canvas.getContext('2d'); context.drawImage(image.texture.getSourceImage(), 0, 0);
    return {
      painted: image.width === meta.width && image.height === meta.height
        && document.querySelector('#shop-map-image').src.endsWith('/colosseum-selected-v1.png'),
      cornerAlpha: context.getImageData(0, 0, 1, 1).data[3],
      floorAlpha: context.getImageData(meta.originX, meta.originY, 1, 1).data[3],
      centerX: (meta.originX - image.displayOriginX) * image.scaleX,
      centerY: (meta.originY - image.displayOriginY) * image.scaleY,
      radiusX: meta.groundRadiusX * image.scaleX,
      radiusY: meta.groundRadiusY * image.scaleY,
      scaleX: image.scaleX, scaleY: image.scaleY,
    };
  });
  assert.ok(registration.painted);
  assert.equal(registration.cornerAlpha, 0);
  assert.ok(registration.floorAlpha >= 250, 'sand must remain opaque while the exterior is transparent');
  assert.ok(Math.abs(registration.centerX) < .01 && Math.abs(registration.centerY) < .01);
  assert.equal(registration.scaleX, registration.scaleY, 'artwork must never be stretched differently on each axis');
  assert.ok(registration.radiusX >= 560 - .01, 'painted sand must contain the playable width');
  assert.ok(registration.radiusY >= 560 * Math.sin(52 * Math.PI / 180) - .01, 'painted sand must contain the playable height');
  await page.click('#shop-close');
  await page.reload(); await ready(page);
  assert.equal(await page.evaluate(() => window.__game.scene.getScene('game').arenaId), 'colosseum');
  assert.equal(await page.$eval('#menu-coins', el => el.textContent), '200');
  await page.click('#practice-btn'); await page.click('#start-btn');
  await page.waitForFunction(() => document.querySelector('#menu').classList.contains('hidden'));
  assert.equal(await page.evaluate(() => window.__game.scene.getScene('game').arenaId), 'colosseum');
  const rules = await page.evaluate(async () => {
    const s = window.__game.scene.getScene('game');
    s.scene.pause();
    s.roundTime = 60; s.updateArena();
    const max = s.constrain({ x: -50, z: 0 }, s.player);
    return { radius: s.arenaR, playerX: max.x, boundaryVisible: s.sandBoundary.visible, baronVisible: s.baron.root.visible };
  });
  assert.ok(rules.radius < 14 && rules.playerX > -14 && rules.boundaryVisible && !rules.baronVisible);
  await page.screenshot({ path: 'output/shop/colosseum-fight.png' });
  const reward = await page.evaluate(async () => {
    const s = window.__game.scene.getScene('game');
    s.score = [1, 0]; s.endMatch();
    const shop = await import('/src/shop-state.js');
    const first = shop.getShopState().coins;
    s.endMatch();
    return { first, after: shop.getShopState().coins, duplicate: shop.awardMatch(s.analyticsMatch.match_id, true) };
  });
  assert.equal(reward.first, 300); assert.equal(reward.after, 300); assert.equal(reward.duplicate, 0);
  const loss = await page.evaluate(async () => (await import('/src/shop-state.js')).awardMatch('test-loss', false));
  assert.equal(loss, 30);
  await page.click('#menu-btn');
  await page.click('#shop-open');
  await page.click('[data-map="classic"]');
  await page.click('#shop-action');
  assert.equal(await page.evaluate(() => window.__game.scene.getScene('game').water.visible), true);
  assert.ok(await page.evaluate(() => {
    const image = window.__game.scene.getScene('game').arenaImage;
    return image.scaleX === 1 && image.scaleY === 1 && image.displayOriginY === 1036;
  }));
  await page.click('[data-map="colosseum"]');
  for (const [width, height] of [[390, 844], [320, 568], [844, 390]]) {
    await page.setViewport({ width, height });
    const bounds = await shopBounds();
    await page.$eval('[data-map="classic"]', el => el.click());
    assert.deepEqual(await shopBounds(), bounds, `map selection must keep the shop fixed at ${width}x${height}`);
    await page.$eval('[data-map="colosseum"]', el => el.click());
    assert.deepEqual(await shopBounds(), bounds);
    const fits = await page.$eval('#shop-dialog', el => el.scrollWidth <= el.clientWidth && el.getBoundingClientRect().right <= innerWidth && el.getBoundingClientRect().bottom <= innerHeight);
    assert.ok(fits, `shop must fit ${width}x${height}`);
    const closeVisible = await page.$eval('#shop-dialog', el => {
      document.querySelector('.shop-body').scrollTop = document.querySelector('.shop-body').scrollHeight;
      const close = document.querySelector('#shop-close').getBoundingClientRect();
      return close.top >= 0 && close.bottom <= innerHeight;
    });
    assert.ok(closeVisible, `close button must stay reachable while scrolling at ${width}px`);
    if (width === 390) {
      await page.$eval('.shop-body', el => { el.scrollTop = 0; });
      await page.screenshot({ path: 'output/shop/shop-mobile.png' });
    }
  }
  const context = await browser.createBrowserContext();
  const poor = await context.newPage();
  await skipConsent(poor);
  await poor.evaluateOnNewDocument(() => localStorage.setItem('mundo-shop-v1', JSON.stringify({ coins: 20, owned: ['classic'], equipped: 'classic' })));
  await poor.goto(url); await ready(poor);
  await poor.click('#shop-open'); await poor.click('#shop-action');
  assert.match(await poor.$eval('#shop-status', el => el.textContent), /1480 코인/);
  await poor.setViewport({ width: 390, height: 844 });
  await poor.click('#shop-action');
  await poor.waitForFunction(() => getComputedStyle(document.getElementById('shop-status')).opacity === '1');
  assert.ok(await snackbarInside(poor), 'mobile snackbar sits inside the shop, above the footer with spacing');
  await poor.screenshot({ path: 'output/shop/shop-snackbar-mobile.png' });
  assert.equal(await poor.$eval('#shop-coins', el => el.textContent), '20');
  await context.close();
  const blockedContext = await browser.createBrowserContext();
  const blocked = await blockedContext.newPage();
  await skipConsent(blocked);
  await blocked.evaluateOnNewDocument(() => {
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'mundo-shop-v1') throw new DOMException('Storage blocked', 'QuotaExceededError');
      return set.call(this, key, value);
    };
  });
  await blocked.goto(url); await ready(blocked);
  await blocked.click('#shop-open');
  assert.match(await blocked.$eval('#shop-storage-note', el => el.textContent), /이번 방문/);
  await blocked.evaluate(async () => {
    const shop = await import('/src/shop-state.js');
    for (let i = 0; i < 16; i++) shop.awardMatch(`test-win-${i}`, true);
  });
  await blocked.click('#shop-action'); await blocked.click('#shop-action');
  assert.equal(await blocked.$eval('#shop-coins', el => el.textContent), '200');
  assert.equal(await blocked.evaluate(() => window.__game.scene.getScene('game').arenaId), 'colosseum');
  await blockedContext.close();
  assert.deepEqual(errors, []);
  console.log('Shop: fixed window bounds, purchase, duplicate prevention, equip/reload, classic restore, colosseum shrink boundary, win/loss rewards, insufficient funds, blocked storage and responsive layouts passed.');
} finally { await browser.close(); server.close(); }
