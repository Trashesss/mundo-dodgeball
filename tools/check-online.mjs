// 로컬 서버 + 브라우저 두 창으로 친구와 대결 전체 흐름 확인
// 방 만들기 → 초대 링크 입장 → 준비 → 카운트다운 → 이동 동기화 → 서버 판정 적중·따봉
// → KO 결과 → 재대결 → 새로고침 재접속 → 상대 이탈(15초) 안내
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import puppeteer from 'puppeteer-core';
import { serve } from './serve.mjs';
import { skipConsent } from './skip-consent.mjs';
import { RULES } from '../src/rules.js';

// ONLINE_MAPS=classic,colosseum npm run check:online 로 진영을 바꿔 검사할 수 있다.
const maps = (process.env.ONLINE_MAPS || 'colosseum,classic').split(',');
assert.ok(maps.length === 2 && maps.every(id => ['classic', 'colosseum'].includes(id)), 'ONLINE_MAPS must contain two valid map IDs');

const WS_PORT = 3100 + Math.floor(Math.random() * 500);
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
// 창마다 브라우저를 따로 띄운다 (같은 창의 뒤쪽 탭은 headless 에서 멈출 수 있음). 실제로도 두 기기다.
const browsers = [];
const step = (name) => process.env.DEBUG && console.log('step:', name);
const errors = [];
const open = async (url, map = 'classic') => {
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
  await page.goto(url);
  return page;
};
const scene = 'window.__game.scene.getScene("game")';
const waitScene = (page, expr, timeout = 8000) => page.waitForFunction(`(() => { const s = ${scene}; return ${expr}; })()`, { timeout });
const evalScene = (page, body) => page.evaluate(`(() => { const s = ${scene}; ${body} })()`);
const resultTitle = (page) => page.$eval('#result-title', (el) => el.textContent);
const checkMap = async (page, expected) => {
  const state = await evalScene(page, `return {
    id: s.arenaId, texture: s.arenaImage.texture.key, water: s.water.visible,
    boundary: s.sandBoundary.visible, radius: s.arenaR, fixed: s.fixedArenaR,
    shrinkTeam: s.shrinkTeam,
  };`);
  assert.deepEqual(state, {
    id: expected, texture: expected === 'classic' ? 'arena' : 'colosseum',
    water: expected === 'classic', boundary: expected === 'colosseum',
    radius: RULES.arenaR, fixed: null, shrinkTeam: null,
  });
};

try {
  fs.mkdirSync('output', { recursive: true });
  // 방 만들기
  step('방 만들기');
  const host = await open(base, maps[0]);
  await waitScene(host, "s.state === 'menu'");
  // 좁은 봇전에서 돌아온 뒤에도 온라인에는 축소 규칙이 남지 않아야 한다.
  await evalScene(host, `s.startMatch({ diff: 'faker' });`);
  assert.ok(await evalScene(host, 'return s.arenaR < 14;'));
  await evalScene(host, 's.backToMenu();');
  await host.click('#online-btn');
  await host.click('#lobby-create');
  await host.waitForFunction(() => /^[A-Z2-9]{6}$/.test(document.getElementById('lobby-code').textContent));
  const link = await host.$eval('#lobby-link', (el) => el.value);
  assert.match(link, /[?&]room=[A-Z2-9]{6}/);
  assert.match(new URL(await host.url()).search, /room=/, 'host URL keeps the room for refresh');

  // 초대 링크로 친구 입장 → 메뉴 없이 바로 대기실
  step('초대 링크로 친구 입장 → 메뉴 없이 바로 대기실');
  const guest = await open(link, maps[1]);
  await guest.waitForFunction(() => document.getElementById('lobby-p1').dataset.state === 'joined');
  await host.waitForFunction(() => document.getElementById('lobby-p1').dataset.state === 'joined');
  assert.ok(await guest.$eval('#menu', (el) => el.classList.contains('hidden')));
  assert.match(await guest.$eval('#lobby-p1 .lobby-role', (el) => el.textContent), /\(나\)/);

  // 둘 다 준비 → 카운트다운 → 시작
  step('둘 다 준비 → 카운트다운 → 시작');
  await host.click('#lobby-ready');
  await guest.waitForFunction(() => document.getElementById('lobby-p0').dataset.state === 'ready');
  await guest.click('#lobby-ready');
  for (const page of [host, guest]) await waitScene(page, "s.mode === 'online' && s.state === 'countdown'");
  for (const page of [host, guest]) await waitScene(page, "s.state === 'play'", 5000);
  const roles = await Promise.all([host, guest].map((p) => evalScene(p, 'return [s.mySlot, s.player.team, s.player.isPlayer, s.enemy.isPlayer, s.arenaR, !!s.enemy.emote, !!s.player.emote];')));
  assert.deepEqual(roles[0].slice(0, 4), [0, 0, true, false]);
  assert.deepEqual(roles[1].slice(0, 4), [1, 1, true, false]);
  assert.ok(roles.every((r) => r[4] === 14 && r[5] && r[6]), 'no shrink, both champs have thumbs-up emote');
  assert.equal(await host.$eval('#player-name', (el) => el.textContent), '나');
  assert.equal(await guest.$eval('#player-name', (el) => el.textContent), '상대방');
  for (const [i, page] of [host, guest].entries()) {
    await checkMap(page, maps[i]);
    await evalScene(page, 's.roundTime = 3600; s.updateArena(); s.roundTime = 0;');
    await checkMap(page, maps[i]);
  }

  step('맵별 실제 클릭 좌표 → 이동 동기화');
  const click = await evalScene(guest, `
    const cam = s.cameras.main;
    const point = cam.matrix.transformPoint(9 * 40 - cam.scrollX, 4 * 40 * Math.sin(52 * Math.PI / 180) - cam.scrollY);
    const canvas = s.game.canvas, bounds = canvas.getBoundingClientRect();
    return { x: bounds.left + point.x * bounds.width / canvas.width, y: bounds.top + point.y * bounds.height / canvas.height };
  `);
  await guest.mouse.click(click.x, click.y);
  await waitScene(host, 'Math.hypot(s.enemy.x - 9, s.enemy.z - 4) < 0.3', 6000);
  await waitScene(guest, 'Math.hypot(s.player.x - 9, s.player.z - 4) < 0.3');

  step('양쪽 맵의 외곽 이동 제한·점멸·유체화 서버 동기화');
  const edge = (RULES.arenaR - RULES.champR * .5) / Math.SQRT2;
  for (const page of [host, guest]) await evalScene(page, 's.setMoveTarget({ x: s.player.side * 42, z: 42 });');
  for (const page of [host, guest]) {
    await waitScene(page, `s.champs.every(c => Math.hypot(c.x - c.side * ${edge}, c.z - ${edge}) < .15)`, 8000);
    assert.ok(await evalScene(page, `return s.champs.every(c => Math.hypot(c.x, c.z) <= ${RULES.arenaR - RULES.champR * .5 + .03});`));
  }
  await evalScene(guest, 's.useSkill("d", 6.5, 0); s.useSkill("f");');
  for (const page of [host, guest]) await waitScene(page, `s.champs[1].flashCd > 10 && s.champs[1].ghostT > 0 && Math.hypot(s.champs[1].x - ${edge}, s.champs[1].z - ${edge}) > 3.7`);
  await evalScene(host, 's.setMoveTarget({ x: -6.5, z: 0 });');
  await waitScene(guest, 'Math.hypot(s.enemy.x + 6.5, s.enemy.z) < .15');

  // 이동 동기화: 친구가 움직이면 방장 화면의 상대도 따라온다
  step('이동 동기화: 친구가 움직이면 방장 화면의 상대도 따라온다');
  await evalScene(guest, 's.setMoveTarget({ x: 9, z: 4 });');
  await waitScene(host, 'Math.hypot(s.enemy.x - 9, s.enemy.z - 4) < 0.3', 6000);
  await waitScene(guest, 'Math.hypot(s.player.x - 9, s.player.z - 4) < 0.3');

  // 서버 판정 적중: 방장이 친구에게 Q → 양쪽 모두 체력 감소, 방장 문도에 따봉
  step('서버 판정 적중: 방장이 친구에게 Q → 양쪽 모두 체력 감소, 방장 문도에 따봉');
  await evalScene(host, 's.player.qCd = 0; s.lastCastSeq = 0; if (s.castQ(s.player, s.enemy.x, s.enemy.z)) s.sendInput({ cast: "q", tx: s.enemy.x, tz: s.enemy.z });');
  for (const page of [host, guest]) {
    await waitScene(page, 's.champs[1].hp < 600 && s.champs[0].stats.hits === 1', 4000);
    await waitScene(page, 's.champs[0].emote.visible', 2000);
  }
  await host.screenshot({ path: 'output/online-hit-host.png' });
  await guest.screenshot({ path: 'output/online-hit-guest.png' });

  // KO → 결과
  step('KO → 결과');
  await host.evaluate(() => window.__mundoOnline.send({ type: 'debug', hp: [640, 1] }));
  await evalScene(host, 's.player.qCd = 0; s.lastCastSeq = 0; if (s.castQ(s.player, s.enemy.x, s.enemy.z)) s.sendInput({ cast: "q", tx: s.enemy.x, tz: s.enemy.z });');
  await waitScene(guest, '!s.player.alive', 4000);
  for (const page of [host, guest]) await page.waitForFunction(() => !document.getElementById('result').classList.contains('hidden'), { timeout: 8000 });
  assert.equal(await resultTitle(host), '승리!');
  assert.equal(await resultTitle(guest), '패배');
  assert.ok(await host.$eval('#share-btn', (el) => el.classList.contains('hidden')));
  const coins = (page) => page.evaluate(async () => (await import('/src/shop-state.js')).getShopState().coins);
  assert.equal(await coins(host), 300);
  assert.equal(await coins(guest), 230);
  await guest.screenshot({ path: 'output/online-result-guest.png' });

  // 굴욕 선사하기: 승자에게만 버튼, 상대 이름을 넣은 문구와 짤 미리보기 링크를 복사
  step('굴욕 선사하기');
  assert.ok(await guest.$eval('#humiliate-btn', (el) => el.classList.contains('hidden')), 'loser has no humiliate button');
  assert.ok(await host.$eval('#humiliate-btn', (el) => !el.classList.contains('hidden')), 'winner has humiliate button');
  await host.browser().defaultBrowserContext().overridePermissions(new URL(base).origin, ['clipboard-read', 'clipboard-write', 'clipboard-sanitized-write']);
  await host.click('#humiliate-btn');
  await host.waitForFunction(() => document.getElementById('humiliate-dialog').open);
  assert.equal(await host.$eval('#humiliate-preview', (el) => el.textContent), '넌 발로 해도 이긴다 ㅋ');
  await host.type('#humiliate-name', '철수');
  assert.equal(await host.$eval('#humiliate-preview', (el) => el.textContent), '철수? 발로 해도 이긴다 ㅋ');
  await host.screenshot({ path: 'output/humiliate-dialog.png' });
  await host.setViewport({ width: 390, height: 844 });
  await host.screenshot({ path: 'output/humiliate-dialog-mobile.png' });
  await host.setViewport({ width: 1200, height: 800 });
  await host.click('#humiliate-copy');
  await host.waitForFunction(() => !document.getElementById('humiliate-dialog').open);
  const copied = await host.evaluate(() => navigator.clipboard.readText());
  assert.match(copied, /^철수\? 발로 해도 이긴다 ㅋ\nhttp:\/\/localhost:\d+\/share\/humiliate\.html\?share_id=[0-9a-f-]{36}&utm_source=friend&utm_medium=humiliate$/);
  assert.match(await host.$eval('#copy-snackbar', (el) => el.textContent), /굴욕 링크 복사 완료/);
  await host.click('#humiliate-btn');
  await host.waitForFunction(() => document.getElementById('humiliate-dialog').open);
  await host.click('#humiliate-close');
  await host.waitForFunction(() => !document.getElementById('humiliate-dialog').open);

  // 재대결: 한쪽이 누르면 상대에게 안내, 둘 다 누르면 다시 시작
  step('재대결: 한쪽이 누르면 상대에게 안내, 둘 다 누르면 다시 시작');
  await host.click('#again-btn');
  await guest.waitForFunction(() => document.getElementById('share-status').textContent === '상대방이 한 수 더 가르쳐주겠대요!');
  assert.equal(await host.$eval('#share-status', (el) => el.textContent), '상대방이 배우러 오길 기다리는 중…');
  await guest.click('#again-btn');
  for (const page of [host, guest]) await waitScene(page, "s.state === 'countdown' || s.state === 'play'");
  assert.ok(await host.$eval('#result', (el) => el.classList.contains('hidden')));
  for (const page of [host, guest]) await waitScene(page, "s.state === 'play' && s.champs.every(c => c.alive && c.hp > 600)", 5000);
  for (const [i, page] of [host, guest].entries()) await checkMap(page, maps[i]);

  // 새로고침 재접속: 잠시 멈췄다가 같은 자리로 복귀
  step('새로고침 재접속: 잠시 멈췄다가 같은 자리로 복귀');
  await guest.reload();
  await waitScene(guest, "s.mode === 'online' && s.mySlot === 1 && s.state === 'play' && !s.netPaused", 10000);
  await waitScene(host, '!s.netPaused');
  for (const [i, page] of [host, guest].entries()) await checkMap(page, maps[i]);
  await host.waitForFunction(() => document.getElementById('net-banner').dataset.state === 'back' && !document.getElementById('net-banner').classList.contains('hidden'));
  assert.equal(await host.$eval('#net-title', (el) => el.textContent), '상대방이 다시 돌아왔어요!');
  await host.screenshot({ path: 'output/online-back.png' });
  await host.waitForFunction(() => document.getElementById('net-banner').classList.contains('hidden'));
  assert.ok(await host.$eval('#net-banner', (el) => el.classList.contains('hidden')));

  // 상대 이탈: 15초 동안 기다린 뒤 안내
  step('상대 이탈: 15초 동안 기다린 뒤 안내');
  await guest.browser().close();
  await host.waitForFunction(() => document.getElementById('net-banner').textContent.includes('상대방 연결이 끊겼어요'), { timeout: 15000 });
  assert.ok(await evalScene(host, 'return s.netPaused;'));
  await host.screenshot({ path: 'output/online-away.png' });
  await host.setViewport({ width: 390, height: 844 });
  await host.screenshot({ path: 'output/online-away-mobile.png' });
  await host.setViewport({ width: 844, height: 390 });
  await host.screenshot({ path: 'output/online-away-landscape.png' });
  await host.setViewport({ width: 1200, height: 800 });
  await host.waitForFunction(() => document.getElementById('result-title').textContent === '상대가 나갔어요', { timeout: 20000 });
  assert.ok(await host.$eval('#again-btn', (el) => el.classList.contains('hidden')));
  await host.click('#menu-btn');
  await waitScene(host, "s.state === 'menu' && s.mode === 'bot'");
  assert.doesNotMatch(new URL(await host.url()).search, /room=/);

  // 없는 방 링크
  step('없는 방 링크');
  const lost = await open(base.replace('/?', '/?room=ZZZZZZ&'));
  await lost.waitForFunction(() => document.getElementById('lobby').dataset.state === 'error');

  fs.mkdirSync('output', { recursive: true });
  assert.deepEqual(errors, []);
  console.log(`Online (${maps.join(' vs ')}): map persistence, bot-to-online reset, no shrink, click projection, movement limits, flash/ghost sync, room link, lobby ready, countdown, server hit + both emotes, KO rewards, humiliate share, rematch, refresh rejoin, opponent-left notice and missing room passed.`);
} finally {
  await Promise.all(browsers.map((b) => b.close()));
  web.close();
  gameServer.kill();
}
