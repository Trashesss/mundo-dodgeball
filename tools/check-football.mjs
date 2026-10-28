import assert from 'node:assert/strict';
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
import { serve } from './serve.mjs';
import { spawn } from 'node:child_process';
import { skipConsent } from './skip-consent.mjs';

// 축구장은 공유 전용: 공유 링크를 친구(다른 브라우저 프로필)가 열어야 받는다. 서버 기록은 임시 폴더에 둔다.
const WS_PORT = 3600 + Math.floor(Math.random() * 300);
const stateDir = fs.mkdtempSync('output/football-state-');
const startGameServer = () => {
  const child = spawn(process.execPath, ['server/index.mjs'], {
    env: { ...process.env, PORT: String(WS_PORT), MUNDO_TEST: '1', STATE_DIRECTORY: stateDir },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  return new Promise((resolve, reject) => {
    child.stdout.on('data', d => String(d).includes('mundo-pigu server') && resolve(child));
    child.on('exit', code => reject(new Error(`server exited ${code}`)));
  });
};
const stopGameServer = child => new Promise(resolve => { child.removeAllListeners('exit'); child.once('exit', resolve); child.kill('SIGTERM'); });
let gameServer = await startGameServer();
const server = await serve(0);
const withServer = href => { const url = new URL(href); url.searchParams.set('server', `ws://localhost:${WS_PORT}/ws`); return url.href; };
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
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => { window.copied = text; } } });
  });
  const home = withServer(`http://localhost:${server.address().port}/`);
  await page.goto(home);
  await ready(page);
  assert.equal(await page.evaluate(async () => (await import('/src/shop-state.js')).equipMap('football')), false);
  assert.equal(await page.evaluate(async () => (await import('/src/shop-state.js')).buyMap('football').reason), '친구에게 공유하면 받을 수 있어요.');
  await page.evaluate(async () => (await import('/src/shop-state.js')).awardMatch('football-funds', true));
  await page.click('#shop-open');
  await page.click('[data-map="football"]');
  assert.equal(await page.$eval('#shop-action', el => el.textContent), '친구에게 공유하고 받기');
  assert.equal(await page.$eval('[data-map="football"] small', el => el.textContent), '공유로 받기');
  await page.click('#shop-action');
  await page.waitForFunction(() => window.copied);
  assert.match(await page.$eval('#shop-status', el => el.textContent), /링크를 복사했어요/);
  assert.equal(await page.$eval('#shop-coins', el => el.textContent), '500', 'sharing must not spend coins');
  const link = new URL((await page.evaluate(() => window.copied)).split('\n').at(-1));
  assert.equal(link.searchParams.get('utm_medium'), 'shop');
  assert.match(link.searchParams.get('share_id'), /^[0-9a-f-]{36}$/);

  // 자기 링크를 열어서는 받을 수 없다
  const self = await browser.newPage();
  await self.goto(withServer(link.href)); await ready(self);
  assert.equal(new URL(self.url()).searchParams.has('share_id'), false, 'the share id is removed from the address after reporting');
  await self.close();
  await page.click('#shop-close'); await page.click('#shop-open');
  await new Promise(resolve => setTimeout(resolve, 1000));
  assert.equal(await page.$eval('#shop-action', el => el.textContent), '친구에게 공유하고 받기');

  // 서버가 재시작해도 친구가 연 기록으로 받는다
  await page.click('#shop-close');
  await stopGameServer(gameServer);
  gameServer = await startGameServer();
  const friendContext = await browser.createBrowserContext();
  const friend = await friendContext.newPage();
  await skipConsent(friend);
  await friend.goto(withServer(link.href)); await ready(friend);
  assert.equal(await friend.evaluate(async () => (await import('/src/shop-state.js')).getShopState().owned.includes('football')), false, 'only the sharer receives the item');
  await stopGameServer(gameServer);
  gameServer = await startGameServer();
  await friendContext.close();
  await page.click('#shop-open');
  await page.waitForFunction(() => document.getElementById('shop-status').textContent.includes('문도 축구장을(를) 받았어요'));
  assert.equal(await page.$eval('#shop-action', el => el.textContent), '이 맵 적용하기');
  assert.equal(await page.evaluate(() => window.__game.scene.getScene('game').arenaId), 'colosseum', 'unlocking and equipping remain separate');
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
  assert.equal(saved.coins, 500);
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
  console.log('Football: share-only unlock (no coin purchase, self-open ignored, friend open survives server restart), old-save compatibility, equip/reload, transparent artwork, ground registration, shrink, responsive shop and classic restore passed.');
} finally {
  await browser.close(); server.closeAllConnections(); server.close();
  await stopGameServer(gameServer); fs.rmSync(stateDir, { recursive: true, force: true });
}
