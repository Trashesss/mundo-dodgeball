import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
import { serve } from './serve.mjs';
const server = await serve(0);
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
});
try {
  const page = await browser.newPage();
  await page.goto(`http://localhost:${server.address().port}/tools/animation-preview.html`);
  await page.waitForFunction(() => window.motionPreview);
  const result = await page.evaluate(() => {
    const p = window.motionPreview; p.pause();
    const sheet = Object.assign(document.createElement('canvas'), { width: 1760, height: 1100 });
    const g = sheet.getContext('2d'); g.fillStyle = '#303943'; g.fillRect(0, 0, sheet.width, sheet.height);
    const states = ['idle', 'run', 'throw', 'dance', 'death'];
    for (const [row, key] of states.entries()) for (let col = 0; col < 8; col++) {
      const f = Math.floor(col * (p.meta.anims[key].frames - 1) / 7);
      g.fillStyle = '#dbe4eb'; g.font = '16px system-ui'; g.fillText(`${key} ${f+1}`, col*220+16, row*220+25);
      p.pose(g, key, 0, f, col * 220 + 110, row * 220 + 190);
    }
    const loops = [];
    for (const key of states) {
      const anim = p.meta.anims[key], duration = anim.loop ? (key === 'idle' ? 2 : 1) : anim.frames / anim.fps + .35;
      const count = Math.ceil(duration * 60);
      for (let i = 0; i < count; i++) {
        p.render(key, i / 60); loops.push({ key, data: document.querySelector('canvas').toDataURL() });
      }
    }
    return { sheet: sheet.toDataURL(), loops };
  });
  const out = 'output/animation'; fs.mkdirSync(`${out}/final-frames`, { recursive: true });
  fs.writeFileSync(`${out}/contact-sheet.png`, Buffer.from(result.sheet.split(',')[1], 'base64'));
  const manifest = result.loops.map((f, i) => {
    const path = `${out}/final-frames/${String(i).padStart(3,'0')}.png`;
    fs.writeFileSync(path, Buffer.from(f.data.split(',')[1], 'base64')); return { state:f.key, path };
  });
  fs.writeFileSync(`${out}/preview-frames.json`, JSON.stringify(manifest, null, 2));
  console.log(`Saved encoded-atlas contact sheet and ${manifest.length} animation frames.`);
} finally { await browser.close(); server.close(); }
