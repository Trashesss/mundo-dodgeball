import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
import { serve } from './serve.mjs';

// Slice the generated poses and add lightweight squash/bounce animation.
const server = await serve(0);
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});
try {
  const page = await browser.newPage();
  await page.goto(`http://localhost:${server.address().port}/`);
  const result = await page.evaluate(async () => {
    const image = new Image();
    image.src = '/assets/cartoon/source.png';
    await image.decode();
    const canvas = (w, h) => Object.assign(document.createElement('canvas'), { width: w, height: h });
    const source = canvas(image.width, image.height);
    const ctx = source.getContext('2d');
    ctx.drawImage(image, 0, 0);
    const pixels = ctx.getImageData(0, 0, image.width, image.height).data;
    const rows = [0, 325, 612, 956, 1280].map(y => Math.round(y * image.height / 1280));
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
    const frameW = 276, frameH = 252, anchor = 0.84;
    const anims = {
      idle: { frames: 4, loop: true, fps: 4 },
      run: { frames: 6, loop: true, fps: 12 },
      throw: { frames: 4, loop: false, fps: 12 },
      death: { frames: 4, loop: false, fps: 2 },
      dance: { frames: 6, loop: true, fps: 8 },
    };
    // World +z points down. Mirror the right-hand views for leftward facings.
    const directions = [0, 1, 1, 1, 0, 2, 3, 2];
    const images = [], textures = [];
    for (const [key, anim] of Object.entries(anims)) {
      const sheet = canvas(frameW * 8, frameH * anim.frames);
      const g = sheet.getContext('2d'), frames = [];
      for (let d = 0; d < 8; d++) for (let f = 0; f < anim.frames; f++) {
        const phase = f / anim.frames * Math.PI * 2;
        const row = key === 'death' ? (f === 0 ? 0 : 3) : key === 'throw' ? (f < 3 ? 2 : 0) : key === 'run' ? (f % 3 === 0 ? 0 : 1) : 0;
        const p = poses[row][directions[d]];
        const scale = 176 / poses[0][directions[d]].h;
        const w = p.w * scale, h = p.h * scale;
        const bounce = key === 'run' ? Math.abs(Math.sin(phase)) * 9 : key === 'dance' ? Math.abs(Math.sin(phase)) * 15 : key === 'idle' ? Math.sin(phase) * 2 : 0;
        g.save();
        g.translate(d * frameW + frameW / 2, f * frameH + frameH * anchor - bounce);
        g.scale(d >= 3 && d <= 5 ? -1 : 1, 1);
        if (key === 'dance') g.rotate(Math.sin(phase) * 0.12);
        if (key === 'throw') g.rotate([-0.12, -0.2, 0.12, 0][f]);
        g.drawImage(image, p.x, p.y, p.w, p.h, -w / 2, -h, w, h);
        g.restore();
        frames.push({ filename: `${key}_${d}_${f}`, rotated: false, trimmed: false,
          sourceSize: { w: frameW, h: frameH }, spriteSourceSize: { x: 0, y: 0, w: frameW, h: frameH },
          frame: { x: d * frameW, y: f * frameH, w: frameW, h: frameH } });
      }
      const name = `${key}.png`;
      images.push({ name, data: sheet.toDataURL() });
      textures.push({ image: name, format: 'RGBA8888', size: { w: sheet.width, h: sheet.height }, scale: 1, frames });
    }
    const portrait = canvas(256, 256), p = poses[0][1];
    portrait.getContext('2d').drawImage(image, p.x, p.y, p.w, p.h * 0.7, 12, 4, 232, 252);
    images.push({ name: 'portrait.png', data: portrait.toDataURL() });
    return { images, atlas: { textures }, meta: { frameW, frameH, anchor, scale: 2 / 3, anims } };
  });
  const out = new URL('../assets/cartoon/', import.meta.url);
  for (const image of result.images) fs.writeFileSync(new URL(image.name, out), Buffer.from(image.data.split(',')[1], 'base64'));
  fs.writeFileSync(new URL('atlas.json', out), JSON.stringify(result.atlas));
  fs.writeFileSync(new URL('meta.json', out), JSON.stringify(result.meta, null, 2));
  console.log('Cartoon atlas and portrait saved.');
} finally {
  await browser.close();
  server.close();
}
