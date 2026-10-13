import assert from 'node:assert/strict';
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
import { serve } from './serve.mjs';
import { THROW, throwPose } from '../src/throw-motion.js';
import { RULES } from '../src/rules.js';

assert.equal(RULES.q.windup, THROW.release);
assert.equal(THROW.frames / THROW.fps, THROW.duration);
assert.ok(throwPose(.09).arm > 2, 'windup must raise the weapon overhead');
assert.ok(throwPose(THROW.release).released && throwPose(THROW.release).arm < -1);
assert.equal(throwPose(THROW.duration).lean, 0, 'recovery must return to rest');

const meta = JSON.parse(fs.readFileSync('assets/cartoon/meta.json'));
const atlas = JSON.parse(fs.readFileSync('assets/cartoon/atlas.json'));
const frames = new Map(atlas.textures.flatMap(t => t.frames.map(f => [f.filename, f])));
for (const [key, anim] of Object.entries(meta.anims)) {
  assert.ok(anim.fps > 0 && anim.fps <= 60, `${key} has invalid playback speed`);
  for (let d = 0; d < 8; d++) for (let f = 0; f < anim.frames; f++) {
    assert.ok(frames.has(`${key}_${d}_${f}`), `missing ${key}_${d}_${f}`);
  }
}
for (const t of atlas.textures) {
  assert.ok(t.size.w <= 2048 && t.size.h <= 2048);
  for (const { frame: f, spriteSourceSize: s, sourceSize } of t.frames) {
    assert.ok(f.x + f.w <= t.size.w && f.y + f.h <= t.size.h);
    assert.ok(s.x > 0 && s.y > 0 && s.x + s.w < sourceSize.w && s.y + s.h < sourceSize.h, 'clipped artwork');
  }
}
const server = await serve(0);
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1000 });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(`http://localhost:${server.address().port}/`);
  await page.waitForFunction(() => window.__game?.scene.getScene('game').state === 'menu');
  await page.click('#start-btn');
  await page.waitForFunction(() => window.__game.scene.getScene('game').state === 'play');
  const checks = await page.evaluate(async () => {
    const scene = window.__game.scene.getScene('game'), player = scene.player;
    const { THROW } = await import('/src/throw-motion.js');
    for (const c of scene.champs) if (!c.isPlayer) c.qCd = 99;
    player.moveTarget = { x: -11, z: 3 };
    await new Promise(resolve => setTimeout(resolve, 300));
    const running = player.sprite.anims.currentAnim.key.startsWith('run_');
    const oldFrame = player.sprite.anims.currentFrame.index, oldAccumulator = player.sprite.anims.accumulator;
    player.facing += Math.PI / 4; player.setAnim('run');
    const phasePreserved = player.sprite.anims.currentFrame.index === oldFrame && player.sprite.anims.accumulator === oldAccumulator;
    const sector = Math.PI / 4;
    player.visualDir = 0; player.facing = sector / 2 + .02;
    const stableNearBoundary = player.dirIndex() === 0;
    player.facing = sector / 2 + .12;
    const turnsPastBoundary = player.dirIndex() === 1;
    player.qCd = 0; const cast = scene.castQ(player, 10, 0);
    await new Promise(resolve => setTimeout(resolve, 180));
    const released = player.pending === null;
    await new Promise(resolve => setTimeout(resolve, THROW.duration * 1000));
    const recovered = player.animKey !== 'throw';
    const atlas = await (await fetch('/assets/cartoon/atlas.json')).json();
    const imgs = await Promise.all(atlas.textures.map(async t => {
      const image = new Image(); image.src = '/assets/cartoon/' + t.image; await image.decode(); return image;
    }));
    const hashes = [], idleHashes = [];
    const c = document.createElement('canvas'); c.width = scene.meta.frameW; c.height = scene.meta.frameH;
    const g = c.getContext('2d');
    for (let i = 0; i < scene.meta.anims.run.frames; i++) {
      const name = `run_0_${i}`, index = atlas.textures.findIndex(t => t.frames.some(f => f.filename === name));
      const entry = atlas.textures[index].frames.find(f => f.filename === name), f = entry.frame, s = entry.spriteSourceSize;
      g.clearRect(0, 0, c.width, c.height); g.drawImage(imgs[index], f.x, f.y, f.w, f.h, s.x, s.y, s.w, s.h);
      // Check the feet independently: moving only a torso cannot pass this.
      const pixels = g.getImageData(0, Math.floor(c.height * .70), c.width, Math.floor(c.height * .25)).data;
      let hash = 2166136261; for (const value of pixels) hash = Math.imul(hash ^ value, 16777619);
      hashes.push(hash);
    }
    for (const i of [0, 12, 24, 36]) {
      const name = `idle_0_${i}`, index = atlas.textures.findIndex(t => t.frames.some(f => f.filename === name));
      const entry = atlas.textures[index].frames.find(f => f.filename === name), f = entry.frame, s = entry.spriteSourceSize;
      g.clearRect(0, 0, c.width, c.height); g.drawImage(imgs[index], f.x, f.y, f.w, f.h, s.x, s.y, s.w, s.h);
      idleHashes.push(c.toDataURL());
    }
    const drawPixels = name => {
      const index = atlas.textures.findIndex(t => t.frames.some(f => f.filename === name));
      const entry = atlas.textures[index].frames.find(f => f.filename === name), f = entry.frame, s = entry.spriteSourceSize;
      g.clearRect(0, 0, c.width, c.height); g.drawImage(imgs[index], f.x, f.y, f.w, f.h, s.x, s.y, s.w, s.h);
      return g.getImageData(0, 0, c.width, Math.floor(c.height * .65)).data;
    };
    const resting = drawPixels('idle_0_0'), starting = drawPixels('run_0_0');
    let changed = 0;
    for (let i = 0; i < resting.length; i += 4) {
      if ([0, 1, 2, 3].some(channel => Math.abs(resting[i + channel] - starting[i + channel]) > 16)) changed++;
    }
    const torsoTransitionChange = changed / (resting.length / 4);
    await new Promise(resolve => setTimeout(resolve, 2500));
    return { running, phasePreserved, stableNearBoundary, turnsPastBoundary, cast, released, recovered,
      uniqueIdlePoses: new Set(idleHashes).size, uniqueFootFrames: new Set(hashes).size,
      torsoTransitionChange,
      totalRunFrames: scene.meta.anims.run.frames, actualFps: window.__game.loop.actualFps };
  });
  assert.deepEqual(errors, []);
  assert.ok(checks.running && checks.phasePreserved && checks.cast && checks.released && checks.recovered);
  assert.ok(checks.stableNearBoundary && checks.turnsPastBoundary, 'direction hysteresis must remain responsive');
  assert.ok(checks.uniqueIdlePoses >= 3, 'idle must visibly breathe');
  assert.ok(checks.uniqueFootFrames >= checks.totalRunFrames * .8, 'foot motion must contain real distinct poses');
  assert.ok(checks.torsoTransitionChange < .03, 'idle-to-run must preserve the torso silhouette');
  await page.screenshot({ path: 'output/animation/game-preview.png' });
  fs.writeFileSync('output/animation/game-checks.json', JSON.stringify({ ...checks, errors, atlasPages: atlas.textures.length }, null, 2));
  console.log(JSON.stringify({ ...checks, errors, atlasPages: atlas.textures.length }, null, 2));
} finally { await browser.close(); server.close(); }
