import assert from 'node:assert/strict';
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
import { serve } from './serve.mjs';
import { skipConsent } from './skip-consent.mjs';

const server = await serve(0);
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewport({ width: 1440, height: 1000 });
  await skipConsent(page);
  await page.goto(`http://localhost:${server.address().port}/`);
  await page.waitForFunction(() => window.__game?.scene.getScene('game').state === 'menu');
  await page.click('#practice-btn');
  await page.click('#start-btn');
  await page.waitForFunction(() => window.__game.scene.getScene('game').state === 'play');
  await page.waitForFunction(() => document.getElementById('menu').classList.contains('hidden'));
  const checks = await page.evaluate(() => {
    const scene = window.__game.scene.getScene('game');
    scene.scene.pause();
    scene.startMatch({ diff: 'twins' });
    const [bot, other] = scene.enemies;
    const player = scene.player;
    const initiallyHidden = !bot.emote.visible && !other.emote.visible && !player.emote;
    // Exercise the actual projectile collision path.
    bot.qCd = 0;
    scene.castQ(bot, player.x, player.z);
    scene.updateChamp(bot, 0.2);
    const cleaver = scene.cleavers[0];
    cleaver.x = player.x;
    cleaver.z = player.z;
    scene.updateCleaver(cleaver, 0);
    scene.cleavers = scene.cleavers.filter(p => p.alive);
    const waitsAfterHit = !bot.emote.visible && bot.emoteDelayT > 0;
    scene.updateChamp(bot, 0.2);
    bot.sync();
    const stillWaiting = !bot.emote.visible;
    scene.updateChamp(bot, 0.06);
    bot.sync();
    const hitShows = bot.emote.visible && bot.stats.hits === 1 && !other.emote.visible;
    bot.x += 1;
    bot.z += 1;
    bot.sync();
    const follows = bot.emote.x === bot.sprite.x && bot.emote.y < bot.bar.y - 50;
    const layered = bot.emote.depth > bot.bar.depth;
    bot.emoteT = 0.1;
    scene.hit(player, { owner: bot, paid: 0 });
    scene.updateChamp(bot, 0.25);
    bot.sync();
    const refreshes = bot.emoteT === 1;
    scene.hit(other, { owner: player, paid: 0 });
    const playerExcluded = !player.emote && !other.emote.visible;
    scene.hit(player, { owner: other, paid: 0 });
    scene.updateChamp(other, 0.25);
    other.sync();
    const independent = bot.emote.visible && other.emote.visible;
    scene.updateChamp(bot, 0.8);
    bot.sync();
    const fades = bot.emote.alpha > 0 && bot.emote.alpha < 1;
    scene.updateChamp(bot, 0.3);
    bot.sync();
    const expires = !bot.emote.visible;
    scene.kill(other, player);
    const deathClears = !other.emote.visible && other.emoteDelayT === 0;
    bot.showEmote();
    scene.startRound();
    const resetClears = scene.enemies.every(e => !e.emote.visible && e.emoteT === 0 && e.emoteDelayT === 0);
    bot.showEmote();
    const oldEmote = bot.emote;
    scene.startMatch({ diff: 'normal' });
    const destroyed = !oldEmote.scene;
    scene.enemy.showEmote();
    scene.enemy.emoteT = 1;
    scene.enemy.sync();
    return { initiallyHidden, waitsAfterHit, stillWaiting, hitShows, follows, layered, refreshes, playerExcluded,
      independent, fades, expires, deathClears, resetClears, destroyed };
  });
  for (const [name, passed] of Object.entries(checks)) assert.ok(passed, name);
  fs.mkdirSync('output', { recursive: true });
  await page.screenshot({ path: 'output/bot-emote-desktop.png' });
  assert.deepEqual(errors, []);
  console.log('Bot emote: collision, bot-only display, movement, layering, refresh, twins, fade, expiry, death, reset and cleanup passed.');
} finally {
  await browser.close();
  server.close();
}
