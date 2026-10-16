import assert from 'node:assert/strict';
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
import { serve } from './serve.mjs';

const server = await serve(0);
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1100, height: 900, hasTouch: true });
  const errors = [];
  const posthogRequests = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setRequestInterception(true);
  page.on('request', request => {
    if (request.url().includes('.posthog.com')) {
      posthogRequests.push(request.url());
      return request.abort();
    }
    if (request.url().endsWith('/src/analytics.js')) {
      // Exercise production tracking locally, without sending test events to PostHog.
      return request.respond({ status: 200, contentType: 'application/javascript',
        body: fs.readFileSync('src/analytics.js', 'utf8').replace('const localHost =', 'const localHost = false &&') });
    }
    return request.continue();
  });
  await page.evaluateOnNewDocument(() => {
    localStorage.setItem('mundo-analytics-consent-v1', 'accepted');
    window.events = [];
    window.posthog = { init() {}, capture(name, properties) { window.events.push({ name, properties }); } };
  });
  const baseUrl = `http://localhost:${server.address().port}/`;
  const incomingId = '12345678-1234-4123-8123-123456789abc';
  await page.goto(`${baseUrl}share/twins-win.html?share_id=${incomingId}&private=do-not-forward#result`);
  await page.waitForFunction(() => window.__game?.scene.getScene('game').state === 'menu');
  await page.evaluate(() => {
    const scene = window.__game.scene.getScene('game');
    scene.scene.pause();
    scene.startMatch({ diff: 'twins' });
    scene.score = [1, 0];
    scene.endMatch();
    document.getElementById('menu').classList.add('hidden');
    Object.defineProperty(navigator, 'share', { configurable: true, value: async data => { window.shared = data; } });
  });
  await page.click('#share-btn');
  await page.waitForFunction(() => !document.getElementById('share-btn').disabled);
  let events = await page.evaluate(() => window.events);
  events = events.filter(event => event.name !== '$pageview');
  assert.deepEqual(events.map(event => event.name), ['invite_opened', 'game_started', 'game_finished', 'share_clicked', 'share_completed']);
  assert.equal(events[0].properties.share_id, incomingId);
  for (const event of events.slice(1, 3)) {
    assert.equal(event.properties.referral_share_id, incomingId);
    assert.equal(event.properties.entry_source, 'share');
  }
  const url = new URL(await page.evaluate(() => window.shared.url));
  const firstId = url.searchParams.get('share_id');
  assert.notEqual(firstId, incomingId);
  assert.equal(url.searchParams.has('private'), false);
  assert.equal(url.hash, '');
  assert.equal(url.searchParams.get('utm_source'), 'friend');
  assert.equal(url.searchParams.get('utm_medium'), 'share');
  assert.equal(events[3].properties.share_id, firstId);
  assert.equal(events[4].properties.share_id, firstId);
  assert.equal(events[4].properties.method, 'native');
  assert.equal(events[3].properties.match_id, events[2].properties.match_id);
  assert.equal(events[3].properties.difficulty, 'twins');
  assert.equal(events[3].properties.result, 'win');

  await page.evaluate(() => {
    Object.defineProperty(navigator, 'share', { configurable: true, value: async () => { throw new DOMException('Canceled', 'AbortError'); } });
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw Error('Must not copy on cancellation'); } } });
  });
  await page.click('#share-btn');
  await page.waitForFunction(() => !document.getElementById('share-btn').disabled);
  events = await page.evaluate(() => window.events);
  assert.deepEqual(events.slice(-2).map(event => event.name), ['share_clicked', 'share_cancelled']);
  assert.notEqual(events.at(-1).properties.share_id, firstId);

  await page.evaluate(() => {
    Object.defineProperty(navigator, 'share', { configurable: true, value: async () => { throw Error('Unsupported target'); } });
    navigator.clipboard.writeText = async text => { window.copied = text; };
  });
  await page.click('#share-btn');
  await page.waitForFunction(() => !document.getElementById('share-btn').disabled);
  events = await page.evaluate(() => window.events);
  assert.deepEqual(events.slice(-2).map(event => event.name), ['share_clicked', 'share_completed']);
  assert.equal(events.at(-1).properties.method, 'clipboard');
  assert.ok((await page.evaluate(() => window.copied)).includes(events.at(-1).properties.share_id));

  await page.evaluate(() => {
    Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
    navigator.clipboard.writeText = async () => { throw Error('Permission denied'); };
  });
  await page.click('#share-btn');
  await page.waitForFunction(() => !document.getElementById('share-btn').disabled);
  events = await page.evaluate(() => window.events);
  assert.deepEqual(events.slice(-2).map(event => event.name), ['share_clicked', 'share_failed']);
  assert.equal(events.at(-1).properties.method, 'clipboard');
  const shareIds = events.filter(event => event.name === 'share_clicked').map(event => event.properties.share_id);
  assert.equal(new Set(shareIds).size, 4);

  await page.click('#again-btn');
  const replay = await page.evaluate(() => window.events.at(-1));
  assert.equal(replay.name, 'game_started');
  assert.equal(replay.properties.source, 'replay');
  assert.equal(replay.properties.referral_share_id, incomingId);

  for (const suffix of ['', '?share_id=not-a-valid-id']) {
    await page.goto(baseUrl + suffix);
    await page.waitForFunction(() => window.__game?.scene.getScene('game').state === 'menu');
    await page.evaluate(() => window.__game.scene.getScene('game').startMatch({ diff: 'normal' }));
    events = await page.evaluate(() => window.events.filter(event => event.name !== '$pageview'));
    assert.deepEqual(events.map(event => event.name), ['game_started']);
    assert.equal(events[0].properties.entry_source, 'direct');
    assert.equal(events[0].properties.referral_share_id, undefined);
  }
  assert.deepEqual(errors, []);
  assert.deepEqual(posthogRequests, []);
  console.log('Share analytics: attribution, match linkage, unique share IDs, native/clipboard success, cancellation, manual fallback, replay and direct visits passed. No real events sent.');
} finally {
  await browser.close();
  server.close();
}
