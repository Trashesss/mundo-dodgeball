// 빠른 대전 확인: 로컬 서버 + 브라우저 창
// 두 사람 → 바로 매칭(준비 없음) → KO → 고스트 기록 / 혼자 → 문도봇 매칭 → 봇이 움직이고 던짐 → 결과(재대결 없음)·새 상대 찾기
// 대기 취소 → 큐에서 빠짐 / 문도봇 경기는 고스트로 남지 않음
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import puppeteer from 'puppeteer-core';
import { serve } from './serve.mjs';
import { skipConsent } from './skip-consent.mjs';

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
  await page.goto(base);
  await waitScene(page, "s.state === 'menu'");
  return page;
};
const scene = 'window.__game.scene.getScene("game")';
const waitScene = (page, expr, timeout = 10000) => page.waitForFunction(`(() => { const s = ${scene}; return ${expr}; })()`, { timeout });
const text = (page, sel) => page.$eval(sel, (el) => el.textContent);
const hidden = (page, sel) => page.$eval(sel, (el) => el.classList.contains('hidden'));
const health = () => fetch(`http://127.0.0.1:${WS_PORT}/health`).then((r) => r.json());
const ghosts = () => (fs.existsSync(ghostFile) ? JSON.parse(fs.readFileSync(ghostFile, 'utf8')) : []);
// 상대에게 식칼 한 번 (서버 판정). spread 만큼 비켜 던지면 빗나간다.
let seq = 9000;
const throwAt = (page, spread = 0) => page.evaluate(`(() => {
  const s = ${scene};
  window.__mundoOnline.send({ type: 'input', seq: ${++seq}, cast: 'q', tx: s.enemy.x, tz: s.enemy.z + ${spread} });
})()`);

try {
  step('사람 둘: 바로 매칭');
  const [a, b] = await Promise.all([open(), open()]);
  await a.click('#quick-btn');
  await a.waitForFunction(() => document.getElementById('lobby').dataset.state === 'queue');
  assert.equal(await text(a, '#lobby-title'), '빠른 대전');
  await a.waitForFunction(() => /초 뒤에는 문도봇/.test(document.getElementById('lobby-status').textContent));
  await b.click('#quick-btn');
  await waitScene(a, "s.mode === 'online' && s.state === 'play'");
  await waitScene(b, "s.mode === 'online' && s.state === 'play'");
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
  await sleep(2600); // 고스트 저장 디바운스
  const saved = ghosts();
  assert.equal(saved.length, 2, 'both humans recorded as ghosts');
  assert.ok(saved.every((g) => typeof g.acc === 'number' && typeof g.wait === 'number' && !('room' in g)));
  for (const p of [a, b]) await p.browser().close();

  step('혼자: 문도봇');
  const solo = await open();
  await solo.click('#quick-btn');
  await solo.waitForFunction(() => /\d초/.test(document.getElementById('lobby-status').textContent));
  await waitScene(solo, "s.mode === 'online' && s.state === 'play'", WAIT_MS + 8000);
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
  await sleep(2600);
  assert.equal(ghosts().length, 2, 'bot matches are not recorded');

  step('새 상대 찾기 → 대기 → 취소');
  await solo.click('#requeue-btn');
  await solo.waitForFunction(() => !document.getElementById('lobby').classList.contains('hidden') && document.getElementById('lobby').dataset.state === 'queue');
  await solo.waitForFunction(() => /\d초/.test(document.getElementById('lobby-status').textContent));
  assert.equal((await health()).quickWaiting, 1);
  await solo.click('#lobby-leave');
  await solo.waitForFunction(() => !document.getElementById('menu').classList.contains('hidden'));
  await sleep(300);
  assert.equal((await health()).quickWaiting, 0, 'cancel leaves the queue');
  await sleep(WAIT_MS + 500);
  assert.equal((await health()).rooms, 0, 'cancelled room never gets a bot');

  assert.deepEqual(errors, []);
  console.log('Quick match: human pairing without ready, ghost recording, 문도봇 fallback with moving/throwing bot, bot result without rematch, requeue and cancel passed.');
} finally {
  await Promise.all(browsers.map((b) => b.close().catch(() => {})));
  web.close();
  gameServer.kill();
  await new Promise((resolve) => gameServer.exitCode !== null ? resolve() : gameServer.once('exit', resolve));
  fs.rmSync(stateDir, { recursive: true, force: true });
}
