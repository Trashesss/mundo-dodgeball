import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
import { serve } from './serve.mjs';

// Bake the joint rig into two kinds of trimmed WebP atlases: one body layer per
// skin (legs, far arm and torso) and one near-arm layer per weapon. The near
// arm is always drawn last, so the game stacks any arm on any body and gets the
// same picture as a combined bake, without baking every skin/weapon pair.
// Usage: node tools/bake-cartoon.mjs [body:<skin> | arm:<weapon> ...] (default: all)
const SKINS = {
  classic: {},
  ronaldo: { body: 'assets/cartoon/ronaldo/parts-source-mask-v2.png', shop: 'assets/cartoon/ronaldo/shop-v5.png' },
  teemo: { body: 'assets/cartoon/teemo/parts-source-straps-v2.png', rig: 'assets/cartoon/teemo/rig.json', shop: 'assets/cartoon/teemo/shop-v1.png' },
  corporate: { body: 'assets/cartoon/corporate/parts-source-ivory-v3.png', rig: 'assets/cartoon/corporate/rig.json', shop: 'assets/cartoon/corporate/shop-v3.png' },
};
const WEAPONS = {
  cleaver: {},
  soccer: { grip: 'assets/cartoon/soccer-parts-v4.png' },
  mushroom: { grip: 'assets/cartoon/teemo-mushroom-parts-v1.png' },
};
const all = [...Object.keys(SKINS).map(id => `body:${id}`), ...Object.keys(WEAPONS).map(id => `arm:${id}`)];
const jobs = process.argv.slice(2).filter(a => a.includes(':'));
for (const job of jobs) if (!all.includes(job)) throw new Error(`Unknown layer ${job}. Choose from ${all.join(', ')}.`);

const server = await serve(0);
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});
const write = (path, dataUrl) => fs.writeFileSync(path, Buffer.from(dataUrl.split(',')[1], 'base64'));
try {
  const page = await browser.newPage();
  await page.goto(`http://localhost:${server.address().port}/`);
  for (const job of jobs.length ? jobs : all) {
    const [layer, id] = job.split(':');
    const spec = layer === 'body' ? SKINS[id] : WEAPONS[id];
    const result = await page.evaluate(async ({ layer, id, spec }) => {
      const load = async (src) => { const image = new Image(); image.src = `/${src}`; await image.decode(); return image; };
      const canvas = (w, h) => Object.assign(document.createElement('canvas'), { width: w, height: h });
      const { loadCartoonMotion } = await import('/tools/cartoon-motion.js');
      const rig = spec.rig ? await (await fetch(`/${spec.rig}`)).json() : {};
      const motion = await loadCartoonMotion({
        gripImage: spec.grip ? await load(spec.grip) : null,
        bodyImage: spec.body ? await load(spec.body) : null,
        ...rig,
      });
      const { THROW } = await import('/src/throw-motion.js');
      const bakeScale = 1.25;
      // Round weapon grips extend higher during the rear-view windup. Extra
      // transparent headroom keeps the same normalized foot anchor and scale.
      const frameW = 320, frameH = 320, anchor = 0.76;
      const anims = {
        idle: { frames: 48, loop: true, fps: 24 },
        run: { frames: 30, loop: true, fps: 60 },
        throw: { frames: THROW.frames, loop: false, fps: THROW.fps },
        death: { frames: 46, loop: false, fps: 60 },
        dance: { frames: 60, loop: true, fps: 60 },
      };
      // World +z points down. Mirror the right-hand views for leftward facings.
      // Facing 2 is the same unmirrored view as facing 1, so the game reuses
      // facing 1's frames for it and it is not baked.
      const directions = [0, 1, 1, 1, 0, 2, 3, 2];
      const baked = [0, 1, 3, 4, 5, 6, 7];
      const mirrored = d => d >= 3 && d <= 5;
      const images = [], textures = [];
      // Trim transparent space before packing. Full untrimmed 60fps sheets
      // would waste hundreds of MB of GPU memory on empty pixels.
      const frameCanvas = canvas(frameW, frameH), frameContext = frameCanvas.getContext('2d', { willReadFrequently: true });
      function trimFrame() {
        const pixels = frameContext.getImageData(0, 0, frameW, frameH).data;
        let left = frameW, top = frameH, right = 0, bottom = 0;
        for (let y = 0; y < frameH; y++) for (let x = 0; x < frameW; x++) {
          if (pixels[(y * frameW + x) * 4 + 3] < 24) continue;
          left = Math.min(left, x); top = Math.min(top, y);
          right = Math.max(right, x); bottom = Math.max(bottom, y);
        }
        if (right < left) throw new Error('Empty frame');
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
          const name = `${key}${index ? `-${index}` : ''}.webp`;
          images.push({ name, data: sheet.toDataURL('image/webp', .92) });
          textures.push({ image: name, format: 'RGBA8888', size: { w: sheet.width, h: sheet.height }, scale: 1, frames });
        });
      }
      const round = v => Math.round(v * 100) / 100;
      // Frame-pixel shift of the arm layer on this body, per `${anim}_${facing}`:
      // one [x, y] when constant, or one per frame while the throw leans.
      const armOffsets = {};
      for (const [key, anim] of Object.entries(anims)) {
        const items = [];
        for (const d of baked) {
          const shifts = [];
          for (let f = 0; f < anim.frames; f++) {
            frameContext.clearRect(0, 0, frameW, frameH);
            frameContext.save();
            frameContext.translate(frameW / 2, frameH * anchor);
            frameContext.scale((mirrored(d) ? -1 : 1) * bakeScale, bakeScale);
            motion.draw(frameContext, key, directions[d], f, anim.frames, layer);
            frameContext.restore();
            items.push({ name: `${key}_${d}_${f}`, ...trimFrame() });
            const [x, y] = motion.armShift(key, directions[d], f);
            shifts.push([round((mirrored(d) ? -1 : 1) * bakeScale * x), round(bakeScale * y)]);
          }
          if (shifts.some(([x, y]) => x || y)) {
            armOffsets[`${key}_${d}`] = shifts.every(s => s[0] === shifts[0][0] && s[1] === shifts[0][1]) ? shifts[0] : shifts;
          }
        }
        pack(key, items);
      }
      const extras = {};
      if (layer === 'body') {
        // The shop shows each skin holding the default cleaver.
        const shop = canvas(256, 256), g = shop.getContext('2d');
        g.translate(128, 234); g.scale(1.5, 1.5);
        motion.draw(g, 'idle', 1, 0, anims.idle.frames);
        extras.shop = shop.toDataURL();
      }
      if (layer === 'body' && id === 'classic') {
        const image = await load('assets/cartoon/source.png');
        const source = canvas(image.width, image.height), ctx = source.getContext('2d');
        ctx.drawImage(image, 0, 0);
        const pixels = ctx.getImageData(0, 0, image.width, image.height).data;
        // Bust of the second pose in the first row of the painted source.
        const rows = [0, 325].map(y => Math.round(y * image.height / 1280));
        const left = Math.round(image.width / 4), right = Math.round(image.width / 2);
        let x0 = right, x1 = left, y0 = rows[1], y1 = rows[0];
        for (let y = rows[0]; y < rows[1]; y++) for (let x = left; x < right; x++) {
          if (pixels[(y * image.width + x) * 4 + 3] > 24) {
            x0 = Math.min(x0, x); x1 = Math.max(x1, x);
            y0 = Math.min(y0, y); y1 = Math.max(y1, y);
          }
        }
        const p = { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
        const portrait = canvas(256, 256);
        // Crop the bust to a square instead of stretching it vertically.
        const portraitSize = Math.min(p.w, p.h * 0.7);
        portrait.getContext('2d').drawImage(
          image, p.x + (p.w - portraitSize) / 2, p.y, portraitSize, portraitSize,
          4, 4, 248, 248,
        );
        extras.portrait = portrait.toDataURL();
      }
      return { images, atlas: { textures }, armOffsets, extras, meta: { frameW, frameH, anchor, scale: 1 / bakeScale, aliases: { 2: 1 }, anims } };
    }, { layer, id, spec });
    const out = `assets/cartoon/${layer}/${id}/`;
    fs.rmSync(out, { recursive: true, force: true });
    fs.mkdirSync(out, { recursive: true });
    for (const image of result.images) write(out + image.name, image.data);
    fs.writeFileSync(`${out}atlas.json`, JSON.stringify(result.atlas));
    if (layer === 'body') fs.writeFileSync(`${out}arm-offsets.json`, JSON.stringify(result.armOffsets));
    fs.writeFileSync('assets/cartoon/meta.json', JSON.stringify(result.meta, null, 2));
    if (result.extras.shop) write(spec.shop || 'assets/cartoon/shop-classic-v1.png', result.extras.shop);
    if (result.extras.portrait) write('assets/cartoon/portrait.png', result.extras.portrait);
    const bytes = result.images.reduce((sum, image) => sum + image.data.length * 3 / 4, 0);
    console.log(`${job}: ${result.images.length} sheets, ${(bytes / 2 ** 20).toFixed(1)}MB`);
  }
} finally {
  await browser.close();
  server.close();
}
