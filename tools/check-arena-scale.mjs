import assert from 'node:assert/strict';
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
import { serve } from './serve.mjs';
import { skipConsent } from './skip-consent.mjs';

const server = await serve(0);
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
try {
  fs.mkdirSync('output/arena-scale', { recursive: true });
  for (const [width, height, touch] of [[1440, 1000, false], [1280, 720, false], [390, 844, true], [844, 390, true]]) {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewport({ width, height, hasTouch: touch, isMobile: touch });
    await skipConsent(page);
    await page.goto(`http://localhost:${server.address().port}/`);
    await page.waitForFunction(() => window.__game?.scene.getScene('game').state === 'menu');
    await page.click('#practice-btn'); await page.click('#start-btn');
    await page.waitForFunction(() => document.querySelector('#menu').classList.contains('hidden'));
    await page.evaluate(() => {
      const scene = window.__game.scene.getScene('game');
      scene.scene.pause();
      scene.startRound();
      scene.camKick = { x: 0, y: 0, trauma: 0 };
    });
    const measures = [];
    for (const map of ['classic', 'colosseum', 'football']) {
      measures.push(await page.evaluate(async id => {
        const scene = window.__game.scene.getScene('game');
        scene.applyArena(id); scene.updateCamera();
        // Wait for the actual camera transform to be rendered before sampling it.
        await new Promise(requestAnimationFrame);
        await new Promise(requestAnimationFrame);
        const cam = scene.cameras.main;
        const toScreen = (x, y) => cam.matrix.transformPoint(x - cam.scrollX, y - cam.scrollY);
        const player = scene.player.sprite;
        const image = scene.arenaImage;
        const center = toScreen(0, 0);
        return {
          zoom: cam.zoom, centerX: center.x, centerY: center.y,
          floorWidth: 1120 * cam.zoom, floorHeight: 1120 * Math.sin(52 * Math.PI / 180) * cam.zoom,
          playerWidth: player.displayWidth * cam.zoom, playerHeight: player.displayHeight * cam.zoom,
          playerX: toScreen(player.x, player.y).x, playerY: toScreen(player.x, player.y).y,
          imageAspectError: Math.abs((image.displayWidth / image.displayHeight) / (image.width / image.height) - 1),
          worldRadius: scene.arenaR, worldPlayerX: scene.player.x, worldPlayerZ: scene.player.z,
          left: toScreen(-560, 0).x, right: toScreen(560, 0).x,
          top: toScreen(0, -560 * Math.sin(52 * Math.PI / 180)).y,
          bottom: toScreen(0, 560 * Math.sin(52 * Math.PI / 180)).y,
        };
      }, map));
      await page.screenshot({ path: `output/arena-scale/${map}-${width}x${height}.png` });
    }
    const [classic, , football] = measures;
    for (const measure of measures.slice(1)) for (const key of Object.keys(classic)) {
      assert.ok(Math.abs(classic[key] - measure[key]) < 1e-7, `${width}x${height}: ${key} must match across all maps`);
    }
    assert.ok(football.imageAspectError < 1e-7, 'the artwork must retain its original aspect ratio');
    assert.ok(football.left >= 0 && football.right <= width && football.top >= 0 && football.bottom <= height, 'the full movement boundary must remain visible');
    const restored = await page.evaluate(async () => {
      const scene = window.__game.scene.getScene('game'); scene.applyArena('classic');
      await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame);
      return scene.cameras.main.zoom;
    });
    assert.equal(restored, classic.zoom, 'switching away from football must restore the original framing');
    assert.deepEqual(errors, []);
    fs.writeFileSync(`output/arena-scale/measures-${width}x${height}.json`, JSON.stringify(measures, null, 2));
    console.log(`Arena scale ${width}x${height}: identical camera zoom, center, character dimensions/position and movement-area size on all maps.`);
    await page.close();
  }
} finally { await browser.close(); server.close(); }
