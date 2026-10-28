import assert from 'node:assert/strict';
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
import { serve } from './serve.mjs';
import { skipConsent } from './skip-consent.mjs';

const server = await serve(0);
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
try {
  fs.mkdirSync('output/arena-quality', { recursive: true });
  for (const dpr of [1, 2, 3]) {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: dpr });
    await skipConsent(page);
    await page.goto(`http://localhost:${server.address().port}/`);
    await page.waitForFunction(() => window.__game?.scene.getScene('game').state === 'menu');
    await page.click('#practice-btn'); await page.click('#start-btn');
    await page.waitForFunction(() => document.querySelector('#menu').classList.contains('hidden'));
    const quality = await page.evaluate(async () => {
      const game = window.__game;
      const scene = game.scene.getScene('game');
      scene.scene.pause(); scene.applyArena('colosseum'); scene.updateCamera();
      await new Promise(requestAnimationFrame);
      await new Promise(requestAnimationFrame);
      const gl = game.renderer.gl;
      const textures = ['arena', 'colosseum', 'football', 'mundo'].map(key => {
        const texture = scene.textures.get(key);
        return { key, filters: texture.source.map(source => ({
          min: source.glTexture.minFilter, mag: source.glTexture.magFilter,
        })) };
      });
      return {
        pixelArt: game.config.pixelArt,
        antialias: game.renderer.config.antialias,
        canvasRendering: getComputedStyle(game.canvas).imageRendering,
        canvasWidth: game.canvas.width, canvasHeight: game.canvas.height,
        linear: gl.LINEAR, textures,
      };
    });
    assert.equal(quality.pixelArt, false, `DPR ${dpr}: Retina zoom must not enable pixel-art rendering`);
    assert.equal(quality.antialias, true);
    assert.notEqual(quality.canvasRendering, 'pixelated');
    assert.notEqual(quality.canvasRendering, 'crisp-edges');
    assert.equal(quality.canvasWidth, 1440 * dpr);
    assert.equal(quality.canvasHeight, 1000 * dpr);
    for (const { key, filters } of quality.textures) {
      for (const filter of filters) {
        assert.equal(filter.min, quality.linear, `${key} minification must use LINEAR at DPR ${dpr}`);
        assert.equal(filter.mag, quality.linear, `${key} magnification must use LINEAR at DPR ${dpr}`);
      }
    }
    if (dpr === 2) {
      await page.screenshot({ path: 'output/arena-quality/after-retina.png' });
      await page.screenshot({ path: 'output/arena-quality/after-crop.png', clip: { x: 90, y: 260, width: 240, height: 450 } });
    }
    assert.deepEqual(errors, []);
    console.log(`Arena quality DPR ${dpr}: physical-resolution canvas, no pixel-art CSS, LINEAR filters on all maps and character atlases.`);
    await page.close();
  }
} finally { await browser.close(); server.close(); }
