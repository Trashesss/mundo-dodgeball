import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
import { serve } from './serve.mjs';

// Bake a consistent joint rig for every state into the game's trimmed atlas.
const soccer = process.argv.includes('--soccer');
const ronaldo = process.argv.includes('--ronaldo');
const teemo = process.argv.includes('--teemo');
if (ronaldo && teemo) throw new Error('Choose one skin per bake.');
const server = await serve(0);
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});
try {
  const page = await browser.newPage();
  await page.goto(`http://localhost:${server.address().port}/`);
  const result = await page.evaluate(async ({ soccer, ronaldo, teemo }) => {
    const image = new Image();
    image.src = '/assets/cartoon/source.png';
    await image.decode();
    const canvas = (w, h) => Object.assign(document.createElement('canvas'), { width: w, height: h });
    const source = canvas(image.width, image.height);
    const ctx = source.getContext('2d');
    ctx.drawImage(image, 0, 0);
    const pixels = ctx.getImageData(0, 0, image.width, image.height).data;
    const rows = [0, 325, 624, 956, 1280].map(y => Math.round(y * image.height / 1280));
    const poses = Array.from({ length: 4 }, (_, row) => Array.from({ length: 4 }, (_, col) => {
      const left = Math.round(col * image.width / 4), right = Math.round((col + 1) * image.width / 4);
      let x0 = right, x1 = left, y0 = rows[row + 1], y1 = rows[row];
      for (let y = rows[row]; y < rows[row + 1]; y++) for (let x = left; x < right; x++) {
        if (pixels[(y * image.width + x) * 4 + 3] > 24) {
          x0 = Math.min(x0, x); x1 = Math.max(x1, x);
          y0 = Math.min(y0, y); y1 = Math.max(y1, y);
        }
      }
      return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
    }));
    const { loadCartoonMotion } = await import('/tools/cartoon-motion.js');
    let gripImage = null;
    if (soccer) {
      gripImage = new Image();
      gripImage.src = '/assets/cartoon/soccer-parts-v4.png';
      await gripImage.decode();
    }
    let bodyImage = null;
    if (ronaldo || teemo) {
      bodyImage = new Image();
      bodyImage.src = teemo ? '/assets/cartoon/teemo/parts-source-straps-v2.png' : '/assets/cartoon/ronaldo/parts-source-mask-v2.png';
      await bodyImage.decode();
    }
    const rig = teemo ? await (await fetch('/assets/cartoon/teemo/rig.json')).json() : {};
    const motion = await loadCartoonMotion({ gripImage, bodyImage, ...rig });
    const webp = soccer || ronaldo || teemo;
    const { THROW } = await import('/src/throw-motion.js');
    const bakeScale = 1.25;
    // The ball grip extends higher during the rear-view windup. Extra
    // transparent headroom keeps the same normalized foot anchor and scale.
    const frameW = 320, frameH = webp ? 320 : 280, anchor = 0.76;
    const anims = {
      idle: { frames: 48, loop: true, fps: 24 },
      run: { frames: 30, loop: true, fps: 60 },
      throw: { frames: THROW.frames, loop: false, fps: THROW.fps },
      death: { frames: 46, loop: false, fps: 60 },
      dance: { frames: 60, loop: true, fps: 60 },
    };
    // World +z points down. Mirror the right-hand views for leftward facings.
    const directions = [0, 1, 1, 1, 0, 2, 3, 2];
    const images = [], textures = [];
    // Trim transparent space before packing. Full untrimmed 60fps sheets
    // would waste hundreds of MB of GPU memory on empty pixels.
    const frameCanvas = canvas(frameW, frameH), frameContext = frameCanvas.getContext('2d');
    function trimFrame() {
      const pixels = frameContext.getImageData(0, 0, frameW, frameH).data;
      let left = frameW, top = frameH, right = 0, bottom = 0;
      for (let y = 0; y < frameH; y++) for (let x = 0; x < frameW; x++) {
        if (pixels[(y * frameW + x) * 4 + 3] < 24) continue;
        left = Math.min(left, x); top = Math.min(top, y);
        right = Math.max(right, x); bottom = Math.max(bottom, y);
      }
      // Keep a transparent border so filtering does not bleed adjacent frames.
      left = Math.max(0, left - 1); top = Math.max(0, top - 1);
      right = Math.min(frameW - 1, right + 1); bottom = Math.min(frameH - 1, bottom + 1);
      const bitmap = canvas(right - left + 1, bottom - top + 1);
      bitmap.getContext('2d').drawImage(frameCanvas, left, top, bitmap.width, bitmap.height, 0, 0, bitmap.width, bitmap.height);
      return { bitmap, left, top };
    }
    function pack(key, items) {
      items.sort((a, b) => b.bitmap.height - a.bitmap.height);
      const pages = [[]]; let x = 0, y = 0, shelfHeight = 0;
      for (const item of items) {
        const { width: w, height: h } = item.bitmap;
        if (x + w > 2048) { x = 0; y += shelfHeight + 2; shelfHeight = 0; }
        if (y + h > 2048) { pages.push([]); x = 0; y = 0; shelfHeight = 0; }
        item.x = x; item.y = y; pages.at(-1).push(item);
        x += w + 2; shelfHeight = Math.max(shelfHeight, h);
      }
      pages.forEach((items, index) => {
        const sheet = canvas(Math.max(...items.map(it => it.x + it.bitmap.width)), Math.max(...items.map(it => it.y + it.bitmap.height)));
        const g = sheet.getContext('2d');
        const frames = items.map(it => {
          const { width: w, height: h } = it.bitmap;
          g.drawImage(it.bitmap, it.x, it.y);
          return { filename: it.name, rotated: false, trimmed: true,
            sourceSize: { w: frameW, h: frameH },
            spriteSourceSize: { x: it.left, y: it.top, w, h },
            frame: { x: it.x, y: it.y, w, h } };
        });
        const name = `${key}${index ? `-${index}` : ''}.${webp ? 'webp' : 'png'}`;
        images.push({ name, data: webp ? sheet.toDataURL('image/webp', .92) : sheet.toDataURL() });
        textures.push({ image: name, format: 'RGBA8888', size: { w: sheet.width, h: sheet.height }, scale: 1, frames });
      });
    }
    for (const [key, anim] of Object.entries(anims)) {
      const items = [];
      for (let d = 0; d < 8; d++) for (let f = 0; f < anim.frames; f++) {
        frameContext.clearRect(0, 0, frameW, frameH);
        frameContext.save();
        frameContext.translate(frameW / 2, frameH * anchor);
        frameContext.scale((d >= 3 && d <= 5 ? -1 : 1) * bakeScale, bakeScale);
        motion.draw(frameContext, key, directions[d], f, anim.frames);
        frameContext.restore();
        items.push({ name: `${key}_${d}_${f}`, ...trimFrame() });
      }
      pack(key, items);
    }
    const portrait = canvas(256, 256), p = poses[0][1];
    // Crop the bust to a square instead of stretching it vertically.
    const portraitSize = Math.min(p.w, p.h * 0.7);
    portrait.getContext('2d').drawImage(
      image, p.x + (p.w - portraitSize) / 2, p.y, portraitSize, portraitSize,
      4, 4, 248, 248,
    );
    if (!soccer && !ronaldo && !teemo) images.push({ name: 'portrait.png', data: portrait.toDataURL() });
    if (!soccer) {
      const shop = canvas(256, 256), g = shop.getContext('2d');
      g.translate(128, 234); g.scale(1.5, 1.5);
      motion.draw(g, 'idle', 1, 0, anims.idle.frames);
      images.push({ name: teemo ? 'shop-v1.png' : ronaldo ? 'shop-v5.png' : 'shop-classic-v1.png', data: shop.toDataURL() });
    }
    return { images, atlas: { textures }, meta: { frameW, frameH, anchor, scale: 1 / bakeScale, anims } };
  }, { soccer, ronaldo, teemo });
  const skinFolder = teemo ? 'teemo/' : ronaldo ? 'ronaldo/' : '';
  const out = new URL(`../assets/cartoon/${skinFolder}${soccer ? 'soccer/' : ''}`, import.meta.url);
  fs.mkdirSync(out, { recursive: true });
  for (const image of result.images) fs.writeFileSync(new URL(image.name, out), Buffer.from(image.data.split(',')[1], 'base64'));
  fs.writeFileSync(new URL('atlas.json', out), JSON.stringify(result.atlas));
  fs.writeFileSync(new URL('meta.json', out), JSON.stringify(result.meta, null, 2));
  fs.mkdirSync(new URL('../output/animation/', import.meta.url), { recursive: true });
  console.log(`${teemo ? 'Teemo skin' : ronaldo ? 'Ronaldo skin' : 'Classic Mundo'} ${soccer ? 'soccer ball' : 'cleaver'} atlas saved.`);
} finally {
  await browser.close();
  server.close();
}
