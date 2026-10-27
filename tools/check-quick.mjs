// 빠른 대전 확인: 로컬 서버 + 브라우저 창
// 두 사람 → 준비 대기실 → 둘 다 준비해야 시작 → KO → 고스트 기록 / 준비 대기실에서 나가면 남은 사람은 다시 큐
// 혼자 → 시간이 지나도 계속 대기 → 문도봇과 플레이 버튼 → 봇이 움직이고 던짐 → 결과(재대결 없음)·새 상대 찾기
// 대기 취소 → 큐에서 빠짐 / 문도봇 경기는 고스트로 남지 않음
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import puppeteer from 'puppeteer-core';
import { serve } from './serve.mjs';
import { skipConsent } from './skip-consent.mjs';

const map = process.env.QUICK_MAP || 'colosseum';
assert.ok(['classic', 'colosseum'].includes(map), 'QUICK_MAP must be a valid map ID');
const WS_PORT = 3600 + Math.floor(Math.random() * 300);
const WAIT_MS = 1500;
const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mundo-ghosts-'));
const ghostFile = path.join(stateDir, 'ghosts.json');
const gameServer = spawn(process.execPath, ['server/index.mjs'], {
  env: {
    ...process.env, PORT: String(WS_PORT), MUNDO_TEST: '1', QUICK_WAIT_MS: String(WAIT_MS),
    GHOST_MIN_THROWS: '1', GHOST_MIN_SECONDS: '1', STATE_DIRECTORY: stateDir,
  },
  stdio: ['ignore', 'pipe', 'inherit'],
});
await new Promise((resolve, reject) => {
  gameServer.stdout.on('data', (d) => String(d).includes('mundo-pigu server') && resolve());
  gameServer.on('exit', (code) => reject(new Error(`server exited ${code}`)));
});
const web = await serve(0);
const base = `http://localhost:${web.address().port}/?server=${encodeURIComponent(`ws://localhost:${WS_PORT}/ws`)}`;
const browsers = [];
const errors = [];
const step = (name) => process.env.DEBUG && console.log('step:', name);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const open = async () => {
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
    protocolTimeout: 30000,
  });
  browsers.push(browser);
  const [page] = await browser.pages();
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewport({ width: 1200, height: 800 });
  await skipConsent(page);
  await page.evaluateOnNewDocument(id => {
    if (localStorage.getItem('mundo-shop-v1') === null) {
      localStorage.setItem('mundo-shop-v1', JSON.stringify({
        coins: 200, owned: ['classic', 'colosseum'], equipped: id, rewarded: [],
      }));
    }
  }, map);
  await page.goto(base);
  await waitScene(page, "s.state === 'menu'");
  return page;
};
const scene = 'window.__game.scene.getScene("game")';
const waitScene = (page, expr, timeout = 10000) => page.waitForFunction(`(() => { const s = ${scene}; return ${expr}; })()`, { timeout });
const text = (page, sel) => page.$eval(sel, (el) => el.textContent);
const hidden = (page, sel) => page.$eval(sel, (el) => el.classList.contains('hidden'));
const visible = (page, sel) => page.$eval(sel, (el) => getComputedStyle(el).display !== 'none');
const lobbyState = (page) => page.$eval('#lobby', (el) => el.dataset.state);
const health = () => fetch(`http://127.0.0.1:${WS_PORT}/health`).then((r) => r.json());
const ghosts = () => (fs.existsSync(ghostFile) ? JSON.parse(fs.readFileSync(ghostFile, 'utf8')) : []);
// 상대에게 식칼 한 번 (서버 판정). spread 만큼 비켜 던지면 빗나간다.
let seq = 9000;
const throwAt = (page, spread = 0) => page.evaluate(`(() => {
  const s = ${scene};
  window.__mundoOnline.send({ type: 'input', seq: ${++seq}, cast: 'q', tx: s.enemy.x, tz: s.enemy.z + ${spread} });
})()`);

try {
  step('사람 둘: 준비 대기실');
  const [a, b] = await Promise.all([open(), open()]);
  await a.click('#quick-btn');
  await a.waitForFunction(() => document.getElementById('lobby').dataset.state === 'queue');
  assert.equal(await text(a, '#lobby-title'), '빠른 대전');
  await a.waitForFunction(() => /초 뒤에 문도봇과 플레이/.test(document.getElementById('lobby-status').textContent));
  assert.ok(!(await visible(a, '#lobby-bot')), 'bot button waits for the timer');
  // 시간 전에 보낸 문도봇 요청은 서버가 무시한다
  await a.evaluate(() => window.__mundoOnline.send({ type: 'bot' }));
  await b.click('#quick-btn');
  for (const page of [a, b]) {
    await page.waitForFunction(() => document.getElementById('lobby').dataset.state === 'room' && document.getElementById('lobby-p1').dataset.state === 'joined');
    assert.equal(await text(page, '#lobby-title'), '빠른 대전');
    assert.ok(!(await visible(page, '.lobby-invite')), 'quick ready room has no invite code');
    assert.equal(await text(page, '#lobby-leave'), '나가기');
  }
  assert.equal((await health()).quickWaiting, 0);
  await sleep(WAIT_MS + 300);
  assert.notEqual(await a.evaluate(`${scene}.mode`), 'online', 'humans do not start before both are ready');
  assert.equal(await lobbyState(a), 'room', 'matched room never turns into a bot match');
  await a.click('#lobby-ready');
  await b.waitForFunction(() => document.querySelector('#lobby-p0 .lobby-player-status').textContent === '준비 완료');
  await sleep(500);
  assert.notEqual(await a.evaluate(`${scene}.mode`), 'online', 'one ready player does not start the match');
  await b.click('#lobby-ready');
  await waitScene(a, "s.mode === 'online' && s.state === 'play'");
  await waitScene(b, "s.mode === 'online' && s.state === 'play'");
  for (const page of [a, b]) assert.equal(await page.evaluate(() => window.__game.scene.getScene('game').arenaId), map);
  assert.equal(await text(a, '#enemy-tag'), 'FRIEND', 'human opponent is not labeled as bot');
  assert.equal((await health()).quickWaiting, 0);
  await throwAt(a, 4);
  await throwAt(b, 4);
  await sleep(1300);
  await a.evaluate(() => window.__mundoOnline.send({ type: 'debug', hp: [640, 1] }));
  await throwAt(a);
  for (const page of [a, b]) {
    await page.waitForFunction(() => !document.getElementById('result').classList.contains('hidden'), { timeout: 15000 });
    assert.ok(await hidden(page, '#humiliate-btn'), 'human quick results hide humiliation for both winner and loser');
    assert.ok(await hidden(page, '#again-btn'), 'human quick results hide rematch for both winner and loser');
    assert.ok(!(await hidden(page, '#requeue-btn')), 'quick result offers a new opponent');
  }
  // 버튼을 우회해 보내도 서버가 빠른 대전 재대결을 받지 않는다
  await a.evaluate(() => window.__mundoOnline.send({ type: 'rematch' }));
  await b.evaluate(() => window.__mundoOnline.send({ type: 'rematch' }));
  await sleep(800);
  for (const page of [a, b]) {
    assert.ok(!(await hidden(page, '#result')), 'quick room ignores rematch requests');
    assert.equal(await text(page, '#share-status'), '', 'no rematch status in quick results');
  }
  // 결과가 나온 뒤 상대가 나가도 승패 화면이 '상대가 나갔어요'로 바뀌지 않는다
  await b.click('#menu-btn');
  await sleep(800);
  assert.ok(!(await hidden(a, '#result')));
  assert.equal(await text(a, '#result-title'), '승리!', 'quick result stays after the opponent leaves');
  await sleep(2600); // 고스트 저장 디바운스
  const saved = ghosts();
  assert.equal(saved.length, 2, 'both humans recorded as ghosts');
  assert.ok(saved.every((g) => typeof g.acc === 'number' && typeof g.wait === 'number' && !('room' in g)));
  for (const p of [a, b]) await p.browser().close();

  step('준비 대기실에서 나가기 → 남은 사람은 다시 큐');
  const [c, d] = await Promise.all([open(), open()]);
  await c.click('#quick-btn');
  await c.waitForFunction(() => /\d초/.test(document.getElementById('lobby-status').textContent));
  await d.click('#quick-btn');
  await c.waitForFunction(() => document.getElementById('lobby').dataset.state === 'room');
  await c.click('#lobby-ready');
  await d.click('#lobby-leave');
  await d.waitForFunction(() => !document.getElementById('menu').classList.contains('hidden'));
  await c.waitForFunction(() => document.getElementById('lobby').dataset.state === 'queue');
  assert.equal((await health()).quickWaiting, 1, 'remaining player is back in the queue');
  await c.waitForFunction(() => getComputedStyle(document.getElementById('lobby-bot')).display !== 'none', { timeout: WAIT_MS + 3000 });
  await c.click('#lobby-leave');
  await c.waitForFunction(() => !document.getElementById('menu').classList.contains('hidden'));
  for (const p of [c, d]) await p.browser().close();

  step('혼자: 계속 기다리다 문도봇과 플레이');
  const solo = await open();
  await solo.click('#quick-btn');
  await solo.waitForFunction(() => /\d초/.test(document.getElementById('lobby-status').textContent));
  await solo.waitForFunction(() => getComputedStyle(document.getElementById('lobby-bot')).display !== 'none', { timeout: WAIT_MS + 3000 });
  await sleep(1000);
  assert.equal(await lobbyState(solo), 'queue', 'still waiting for a human after the timer');
  assert.notEqual(await solo.evaluate(`${scene}.mode`), 'online');
  assert.match(await text(solo, '#lobby-status'), /상대를 찾는 중/);
  assert.equal((await health()).quickWaiting, 1);
  await solo.click('#lobby-bot');
  await waitScene(solo, "s.mode === 'online' && s.state === 'play'", 8000);
  assert.equal((await health()).quickWaiting, 0, 'bot match leaves the queue');
  assert.equal(await solo.evaluate(() => window.__game.scene.getScene('game').arenaId), map);
  assert.equal(await text(solo, '#enemy-name'), '문도봇');
  assert.equal(await text(solo, '#enemy-tag'), 'BOT');
  const start = await solo.evaluate(`(() => { const s = ${scene}; return { x: s.enemy.x, z: s.enemy.z }; })()`);
  await solo.waitForFunction(`(() => { const s = ${scene}; return Math.hypot(s.enemy.x - ${start.x}, s.enemy.z - ${start.z}) > 0.5; })()`, { timeout: 8000 });
  // 봇 식칼이 날아오면 화면에 상대 팀 식칼이 생긴다
  await solo.waitForFunction(`(() => { const s = ${scene}; return s.cleavers.some(c => c.team === 1); })()`, { timeout: 10000 });
  await solo.evaluate(() => window.__mundoOnline.send({ type: 'debug', hp: [1, 640] }));
  await solo.waitForFunction(() => !document.getElementById('result').classList.contains('hidden'), { timeout: 15000 });
  assert.ok(await hidden(solo, '#humiliate-btn'), 'no humiliation against the bot');
  assert.ok(await hidden(solo, '#again-btn'), 'no rematch against the bot');
  assert.ok(!(await hidden(solo, '#requeue-btn')), 'bot result offers a new opponent');
  await solo.evaluate(() => window.__mundoOnline.send({ type: 'rematch' }));
  await sleep(800);
  assert.ok(!(await hidden(solo, '#result')), 'bot room ignores a rematch request');
  await sleep(2600);
  assert.equal(ghosts().length, 2, 'bot matches are not recorded');

  step('새 상대 찾기 → 대기 → 취소');
  await solo.click('#requeue-btn');
  await solo.waitForFunction(() => !document.getElementById('lobby').classList.contains('hidden') && document.getElementById('lobby').dataset.state === 'queue');
  await solo.waitForFunction(() => /\d초/.test(document.getElementById('lobby-status').textContent));
  assert.ok(!(await visible(solo, '#lobby-bot')), 'requeue restarts the bot timer');
  assert.equal((await health()).quickWaiting, 1);
  await solo.click('#lobby-leave');
  await solo.waitForFunction(() => !document.getElementById('menu').classList.contains('hidden'));
  await sleep(300);
  assert.equal((await health()).quickWaiting, 0, 'cancel leaves the queue');
  await sleep(WAIT_MS + 500);
  assert.equal((await health()).rooms, 0, 'cancelled room is closed');

  assert.deepEqual(errors, []);
  console.log(`Quick match (${map}): human ready room, requeue after a leave, ghost recording, 문도봇 button after waiting with moving/throwing bot, server-side rematch blocked for humans and bot, requeue and cancel passed.`);
} finally {
  await Promise.all(browsers.map((b) => b.close().catch(() => {})));
  web.close();
  gameServer.kill();
  await new Promise((resolve) => gameServer.exitCode !== null ? resolve() : gameServer.once('exit', resolve));
  fs.rmSync(stateDir, { recursive: true, force: true });
}
