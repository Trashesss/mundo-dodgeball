// 로컬 서버 + 브라우저 세 창으로 빠른 대전 흐름 확인
// 대기열 취소 → 자동 매칭 → 바로 카운트다운 → KO 결과 → 새로운 상대 찾기 → 다음 상대와 매칭
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import puppeteer from 'puppeteer-core';
import { serve } from './serve.mjs';

const WS_PORT = 3600 + Math.floor(Math.random() * 300);
const gameServer = spawn(process.execPath, ['server/index.mjs'], {
  env: { ...process.env, PORT: String(WS_PORT), MUNDO_TEST: '1' },
  stdio: ['ignore', 'pipe', 'inherit'],
});
await new Promise((resolve, reject) => {
  gameServer.stdout.on('data', (d) => String(d).includes('mundo-pigu server') && resolve());
  gameServer.on('exit', (code) => reject(new Error(`server exited ${code}`)));
});
const web = await serve(0);
const base = `http://localhost:${web.address().port}/?server=${encodeURIComponent(`ws://localhost:${WS_PORT}/ws`)}`;
const browsers = [];
const step = (name) => process.env.DEBUG && console.log('step:', name);
const errors = [];
const open = async (url) => {
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
    protocolTimeout: 30000,
  });
  browsers.push(browser);
  const [page] = await browser.pages();
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewport({ width: 1200, height: 800 });
  await page.goto(url);
  return page;
};
const scene = 'window.__game.scene.getScene("game")';
const waitScene = (page, expr, timeout = 8000) => page.waitForFunction(`(() => { const s = ${scene}; return ${expr}; })()`, { timeout });
const evalScene = (page, body) => page.evaluate(`(() => { const s = ${scene}; ${body} })()`);
const text = (page, id) => page.$eval(`#${id}`, (el) => el.textContent);
const hidden = (page, id) => page.$eval(`#${id}`, (el) => el.classList.contains('hidden'));
const searching = (page) => page.waitForFunction(() => document.getElementById('quick-match-title').textContent === '상대를 찾는 중…'
  && !document.getElementById('quick-match-notice').classList.contains('hidden'));
const inMatch = (page) => waitScene(page, "s.mode === 'online' && (s.state === 'countdown' || s.state === 'play')");

try {
  const [a, b, c] = await Promise.all([open(base), open(base), open(base)]);
  for (const page of [a, b, c]) await waitScene(page, "s.state === 'menu'");

  step('대기열 취소');
  await a.click('#quick-match-btn');
  await searching(a);
  await a.waitForFunction(() => document.getElementById('quick-match-elapsed').textContent === '0:01', { timeout: 3000 });
  await a.click('#quick-match-back-btn');
  assert.ok(await hidden(a, 'quick-match-notice'));
  assert.ok(!(await hidden(a, 'mode-select')));

  step('취소한 사람과는 매칭되지 않음');
  await b.click('#quick-match-btn');
  await searching(b);
  await new Promise((r) => setTimeout(r, 800));
  assert.equal(await evalScene(b, 'return s.mode'), 'bot');

  step('자동 매칭 → 대기실 없이 바로 경기');
  await a.click('#quick-match-btn');
  for (const page of [a, b]) await inMatch(page);
  for (const page of [a, b]) {
    assert.ok(await hidden(page, 'menu'));
    assert.ok(await hidden(page, 'lobby'));
  }
  // 먼저 기다린 b 가 0번 자리
  assert.equal(await b.evaluate(() => window.__mundoOnline.slot), 0);
  assert.equal(await a.evaluate(() => window.__mundoOnline.slot), 1);

  step('KO → 결과');
  for (const page of [a, b]) await waitScene(page, "s.state === 'play'", 5000);
  await b.evaluate(() => window.__mundoOnline.send({ type: 'debug', hp: [640, 1] }));
  await evalScene(b, 's.player.qCd = 0; s.lastCastSeq = 0; if (s.castQ(s.player, s.enemy.x, s.enemy.z)) s.sendInput({ cast: "q", tx: s.enemy.x, tz: s.enemy.z });');
  for (const page of [a, b]) await page.waitForFunction(() => !document.getElementById('result').classList.contains('hidden'), { timeout: 8000 });
  assert.equal(await text(b, 'result-title'), '승리!');
  assert.equal(await text(a, 'result-title'), '패배');
  for (const page of [a, b]) assert.equal(await text(page, 'again-btn'), '새로운 상대 찾기');

  step('재대결 메시지는 무시됨');
  await a.evaluate(() => window.__mundoOnline.send({ type: 'rematch' }));
  await b.evaluate(() => window.__mundoOnline.send({ type: 'rematch' }));
  await new Promise((r) => setTimeout(r, 500));
  assert.equal(await evalScene(a, 'return s.state'), 'over');

  step('새로운 상대 찾기 → 상대의 결과 화면은 그대로');
  await a.click('#again-btn');
  await searching(a);
  assert.ok(await hidden(a, 'result'));
  await new Promise((r) => setTimeout(r, 500));
  assert.equal(await text(b, 'result-title'), '승리!');
  assert.ok(!(await hidden(b, 'result')));

  step('다음 상대와 매칭');
  await c.click('#quick-match-btn');
  for (const page of [a, c]) await inMatch(page);

  step('경기 중 상대가 나가면 새로운 상대 찾기만 남음');
  await c.evaluate(() => window.__mundoOnline.leave());
  await a.waitForFunction(() => document.getElementById('result-title').textContent === '상대가 나갔어요', { timeout: 8000 });
  assert.ok(!(await hidden(a, 'again-btn')));
  assert.equal(await text(a, 'again-btn'), '새로운 상대 찾기');

  step('뒤로가기 → 메뉴');
  await b.click('#menu-btn');
  await waitScene(b, "s.state === 'menu' && s.mode === 'bot'");
  assert.ok(!(await hidden(b, 'mode-select')));
  assert.doesNotMatch(new URL(await b.url()).search, /room=/);

  assert.deepEqual(errors, []);
  console.log('Quick match: queue cancel, auto pairing, instant countdown, KO result, rematch ignored, find new opponent, opponent left and back to menu passed.');
} finally {
  await Promise.all(browsers.map((br) => br.close()));
  web.close();
  gameServer.kill();
}
