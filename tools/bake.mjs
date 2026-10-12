// 사용법:
//   node tools/bake.mjs                 → assets/sprites/*, assets/arena.png 생성
//   node tools/bake.mjs preview <out.png> [clip,clip...]  → 방향/애니 확인용 시트
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { serve } from './serve.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 5199;

const writeDataUrl = (file, dataUrl) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.from(dataUrl.split(',')[1], 'base64'));
  console.log('wrote', path.relative(ROOT, file));
};

const server = await serve(PORT);
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  protocolTimeout: 600000,
});
try {
  const page = await browser.newPage();
  page.on('console', (m) => console.log('[page]', m.text()));
  page.on('pageerror', (e) => console.error('[pageerror]', e.message));
  await page.goto(`http://localhost:${PORT}/tools/bake.html`);
  await page.waitForFunction('window.BAKE_READY === true', { timeout: 60000 });

  const [mode, out, clips] = process.argv.slice(2);
  if (mode === 'preview') {
    const list = (clips || 'DrMundo_Run.anm,Spell1,Spell1_0.anm,Death,Dance_Loop').split(',');
    const dir = Number(process.env.DIR ?? 2);
    writeDataUrl(path.resolve(out), await page.evaluate((l, d) => window.bakePreview(l, d), list, dir));
  } else if (mode === 'arena') {
    const arena = await page.evaluate(() => window.bakeArena());
    writeDataUrl(path.join(ROOT, 'assets/arena.png'), arena.data);
    fs.writeFileSync(path.join(ROOT, 'assets/arena.json'), JSON.stringify(arena.meta, null, 2));
  } else {
    const sprites = await page.evaluate(() => window.bakeSprites());
    for (const img of sprites.images) writeDataUrl(path.join(ROOT, 'assets/sprites', img.name), img.data);
    fs.writeFileSync(path.join(ROOT, 'assets/sprites/mundo.json'), JSON.stringify(sprites.atlas));
    fs.writeFileSync(path.join(ROOT, 'assets/sprites/meta.json'), JSON.stringify(sprites.meta, null, 2));
    writeDataUrl(path.join(ROOT, 'assets/portrait.png'), await page.evaluate(() => window.bakePortrait()));
    const arena = await page.evaluate(() => window.bakeArena());
    writeDataUrl(path.join(ROOT, 'assets/arena.png'), arena.data);
    fs.writeFileSync(path.join(ROOT, 'assets/arena.json'), JSON.stringify(arena.meta, null, 2));
  }
} finally {
  await browser.close();
  server.close();
}
