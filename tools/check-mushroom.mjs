import assert from 'node:assert/strict';
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
import { serve } from './serve.mjs';
import { THROW } from '../src/throw-motion.js';
import { SKINS, meta, checkLayerAtlas } from './layer-atlas.mjs';

const manifest = JSON.parse(fs.readFileSync('assets/cartoon/mushroom/asset-set.json'));
assert.equal(manifest.throw.releaseSeconds, THROW.release);
assert.equal(manifest.throw.durationSeconds, THROW.duration);
for (const file of [manifest.projectile.image, manifest.shopImage, manifest.abilityIcon, manifest.gripSource, manifest.arm.atlas, manifest.arm.meta]) assert.ok(fs.existsSync(file), file);
assert.deepEqual([meta.frameW, meta.frameH, meta.anchor, meta.scale], [320, 320, .76, .8]);
checkLayerAtlas('arm', manifest.id);
assert.deepEqual(manifest.skins.map(s => s.skin), SKINS);
for (const skin of SKINS) checkLayerAtlas('body', skin);

const server = await serve(0);
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  await page.setViewport({ width: 1120, height: 1150 });
  await page.goto(`http://localhost:${server.address().port}/tools/mushroom-preview.html`);
  await page.waitForFunction(() => window.mushroomPreview, { timeout: 60000 });
  const result = await page.evaluate(async () => {
    const p = window.mushroomPreview; p.pause();
    const canvas = Object.assign(document.createElement('canvas'), { width: 320, height: 320 });
    const g = canvas.getContext('2d', { willReadFrequently: true });
    const failures = [], totals = [];
    for (const layer of [p.arm, ...[...p.sets.values()].map(set => set.body)]) {
      const label = `${layer.layer}/${layer.id}`;
      const images = new Set([...layer.frames.values()].map(entry => entry.image));
      for (const image of images) {
        const sheet = Object.assign(document.createElement('canvas'), { width: image.naturalWidth, height: image.naturalHeight });
        const ctx = sheet.getContext('2d'); ctx.drawImage(image, 0, 0);
        const alpha = ctx.getImageData(0, 0, sheet.width, sheet.height).data;
        if (!alpha.some((value, i) => i % 4 === 3 && value === 0)) failures.push(`${label}: lost transparency`);
      }
      for (const [name, entry] of layer.frames) {
        const r = entry.frame, s = entry.spriteSourceSize;
        if (entry.image.naturalWidth < r.x + r.w || entry.image.naturalHeight < r.y + r.h) failures.push(`${label}: invalid encoded bounds ${name}`);
        g.clearRect(0, 0, 320, 320);
        g.drawImage(entry.image, r.x, r.y, r.w, r.h, s.x, s.y, s.w, s.h);
        const pixels = g.getImageData(0, 0, 320, 320).data;
        let visible = 0;
        for (let i = 3; i < pixels.length; i += 4) if (pixels[i] > 40) visible++;
        if (visible < (layer.layer === 'arm' ? 300 : 1000)) failures.push(`${label}: empty frame ${name}`);
      }
      totals.push({ layer: label, frames: layer.frames.size, pages: images.size });
    }
    const { loadCartoonMotion } = await import('/tools/cartoon-motion.js');
    const gripImage = new Image(); gripImage.src = '/' + p.manifest.gripSource; await gripImage.decode();
    const original = await loadCartoonMotion(), mushroom = await loadCartoonMotion({ gripImage });
    const pixelsFor = (motion, view, frame) => {
      g.clearRect(0, 0, 320, 320); g.save(); g.translate(160, 243.2); g.scale(1.25, 1.25);
      motion.draw(g, 'throw', view, frame, 30); g.restore();
      return g.getImageData(0, 0, 320, 320).data;
    };
    for (let view = 0; view < 4; view++) {
      const bounds = mushroom.views[view].gripBounds;
      if (bounds.x + bounds.w > gripImage.width / 2) failures.push(`grip ${view}: crosses adjacent column`);
      for (const frame of [9, 14, 24]) {
        const base = pixelsFor(original, view, frame), held = pixelsFor(mushroom, view, frame);
        if (!base.every((value, i) => value === held[i])) failures.push(`view ${view}: weapon remains after release at ${frame}`);
      }
      for (const frame of [0, 8, 25, 29]) {
        const base = pixelsFor(original, view, frame), held = pixelsFor(mushroom, view, frame);
        if (base.every((value, i) => value === held[i])) failures.push(`view ${view}: missing held mushroom at ${frame}`);
      }
    }
    const sheet = Object.assign(document.createElement('canvas'), { width: 1600, height: 1560 });
    const ctx = sheet.getContext('2d'); ctx.fillStyle = '#2b414c'; ctx.fillRect(0, 0, sheet.width, sheet.height);
    const poses = [['idle', 0], ['run', 7], ['throw', 5], ['throw', 14], ['dance', 30], ['death', 45]];
    for (const [row, set] of [...p.sets.values()].entries()) {
      for (const [col, [key, frame]] of poses.entries()) {
        const x = col * 266 + 133, y = row * 520 + 245;
        ctx.fillStyle = '#f6eed8'; ctx.font = '16px system-ui'; ctx.fillText(`${set.name} · ${key} ${frame + 1}`, col * 266 + 12, row * 520 + 26);
        p.pose(ctx, set.skin, key, 1, frame, x, y, 1.1);
        p.pose(ctx, set.skin, key, 6, frame, x, y + 245, 1.1);
      }
    }
    return { failures, totals, sheet: sheet.toDataURL() };
  });
  fs.mkdirSync('output/mushroom', { recursive: true });
  fs.writeFileSync('output/mushroom/contact-sheet.png', Buffer.from(result.sheet.split(',')[1], 'base64'));
  await page.screenshot({ path: 'output/mushroom/preview.png', fullPage: true });
  assert.deepEqual(errors, []);
  assert.deepEqual(result.failures, []);
  console.log(JSON.stringify({ layers: result.totals, verified: ['mushroom arm and all three bodies decode', 'every baked direction and five states per layer', 'transparent sheets', 'unclipped source frames', 'registered four-view grip', 'empty hand at release and grip restored at recovery'] }, null, 2));
} finally {
  await browser.close(); server.close();
}
