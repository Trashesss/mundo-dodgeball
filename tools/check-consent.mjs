import assert from 'node:assert/strict';
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';
import { serve } from './serve.mjs';

const server = await serve(0);
// 동의 팝업은 아직 고르지 않은 첫 화면에서만 뜬다: 선택을 지우고 새로고침
const openConsent = async (page) => {
  await page.evaluate(() => localStorage.removeItem('mundo-analytics-consent-v1'));
  await page.reload();
  await page.waitForSelector('#analytics-consent[open]');
};
// 톱니바퀴 → 설정 → 플레이 통계 전송 스위치
const flipAnalytics = async (page) => {
  await page.click('#analytics-settings');
  await page.waitForSelector('#settings-dialog[open]');
  await page.click('#analytics-toggle');
  await page.keyboard.press('Escape');
  await page.waitForSelector('#settings-dialog:not([open])');
};
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});
try {
  const page = await browser.newPage();
  const errors = [], requests = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setRequestInterception(true);
  page.on('request', request => {
    if (request.url().includes('.posthog.com')) {
      requests.push(request.url());
      // Replay the real async loader queue against a fake SDK; never send data.
      return request.respond({ status: 200, contentType: 'application/javascript', headers: { 'Access-Control-Allow-Origin': '*' }, body: `
        const queued = window.posthog;
        window.sdkCalls = []; window.captured = []; let allowed = false;
        window.posthog = {
          capture(...args) { if (allowed) window.captured.push(args); },
          opt_in_capturing() { allowed = true; window.sdkCalls.push('in'); },
          opt_out_capturing() { allowed = false; window.sdkCalls.push('out'); }
        };
        for (const [method, ...args] of queued) window.posthog[method](...args);
      ` });
    }
    if (request.url().endsWith('/src/analytics.js')) {
      return request.respond({ status: 200, contentType: 'application/javascript',
        body: fs.readFileSync('src/analytics.js', 'utf8').replace('const localHost =', 'const localHost = false &&') });
    }
    return request.continue();
  });
  const url = `http://localhost:${server.address().port}/`;
  const track = () => page.evaluate(async () => (await import('/src/analytics.js')).track('consent_test'));
  await page.setViewport({ width: 1440, height: 1000 });
  await page.goto(url);
  await page.waitForSelector('#menu:not(.hidden)');
  await page.waitForSelector('#analytics-consent[open]');
  assert.equal(await page.$eval('#analytics-consent', el => el.matches(':modal')), true);
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.getElementById('analytics-consent').contains(document.activeElement)), true, 'focus stays in popup');
  await track();
  assert.equal(requests.length, 0, 'no SDK or analytics requests before consent');
  assert.equal(await page.evaluate(() => window.posthog), undefined);
  fs.mkdirSync('output/consent', { recursive: true });
  await page.$eval('#menu', async el => Promise.all(el.getAnimations().map(animation => animation.finished)));
  await page.screenshot({ path: 'output/consent/desktop.png' });
  await page.keyboard.press('Escape');
  await page.waitForSelector('#analytics-consent:not([open])');
  assert.equal(await page.$eval('#analytics-consent', el => el.open), false);
  assert.equal(await page.evaluate(() => localStorage.getItem('mundo-analytics-consent-v1')), null, 'closing does not grant consent');
  // Escape 는 이번 방문에만: 새로고침하면 다시 묻는다
  await page.reload();
  await page.waitForSelector('#analytics-consent[open]');
  await page.click('#analytics-decline');
  await page.reload();
  await page.waitForSelector('#menu:not(.hidden)');
  assert.equal(await page.$eval('#analytics-settings', el => el.getAttribute('aria-expanded')), 'false');
  await track();
  assert.equal(requests.length, 0, 'decline persists without SDK loading');
  await page.$eval('#analytics-settings', el => el.scrollIntoView({ block: 'center' }));
  await page.$eval('#menu', async el => Promise.all(el.getAnimations().map(animation => animation.finished)));
  await page.screenshot({ path: 'output/consent/desktop-settings.png' });
  await openConsent(page);
  await page.click('#analytics-consent summary');
  assert.equal(await page.$eval('#analytics-consent details', el => el.open), true);
  await page.screenshot({ path: 'output/consent/desktop-details.png' });
  await page.click('#analytics-consent summary');
  await page.click('#analytics-accept');
  await page.waitForFunction(() => window.captured?.length === 1);
  assert.equal(requests.length, 1, 'SDK only loads after explicit consent');
  await track();
  assert.deepEqual(await page.evaluate(() => window.captured.map(event => event[0])), ['$pageview', 'consent_test']);
  await flipAnalytics(page);
  await track();
  assert.deepEqual(await page.evaluate(() => window.sdkCalls), ['in', 'out']);
  assert.equal(await page.evaluate(() => window.captured.length), 2, 'withdrawal stops capture');
  await flipAnalytics(page);
  await page.reload();
  await page.waitForFunction(() => window.captured?.length === 1);
  assert.equal(await page.$eval('#analytics-settings', el => el.getAttribute('aria-expanded')), 'false');

  // A second tab's withdrawal and clearing the choice stop this tab too.
  const other = await browser.newPage();
  await other.goto(url);
  await other.evaluate(() => localStorage.setItem('mundo-analytics-consent-v1', 'declined'));
  await page.waitForFunction(() => window.sdkCalls.includes('out'));
  await track();
  assert.equal(await page.evaluate(() => window.captured.length), 1);
  await other.close();

  for (const [name, width, height] of [['mobile', 390, 844], ['small-mobile', 320, 568], ['landscape', 844, 390]]) {
    await page.setViewport({ width, height, isMobile: true, hasTouch: true });
    await page.evaluate(() => localStorage.removeItem('mundo-analytics-consent-v1'));
    await page.reload();
    await page.waitForSelector('#menu:not(.hidden)');
    await page.waitForSelector('#analytics-consent[open]');
    for (const selector of ['#analytics-accept', '#analytics-decline']) {
      await page.$eval(selector, el => el.scrollIntoView({ block: 'center' }));
      const bounds = await page.$eval(selector, el => {
        const r = el.getBoundingClientRect();
        return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, height: r.height };
      });
      assert.ok(bounds.left >= 0 && bounds.right <= width && bounds.top >= 0 && bounds.bottom <= height, `${name}: ${selector} reachable`);
      assert.ok(bounds.height >= 44, 'touch targets are at least 44px');
    }
    await page.$eval('#analytics-consent', el => { el.scrollTop = 0; });
    await page.$eval('#menu', async el => Promise.all(el.getAnimations().map(animation => animation.finished)));
    await page.screenshot({ path: `output/consent/${name}.png` });
    await page.tap('#analytics-decline');
    assert.equal(await page.$eval('#analytics-consent', el => el.open), false, 'choice dismisses popup');
    await page.screenshot({ path: `output/consent/${name}-closed.png` });
    await page.$eval('#analytics-settings', el => el.scrollIntoView({ block: 'center' }));
    await page.screenshot({ path: `output/consent/${name}-settings.png` });
    await openConsent(page);
    await page.tap('#analytics-consent summary');
    assert.equal(await page.$eval('#analytics-consent details', el => el.open), true, `${name}: details expand`);
    await page.$eval('#analytics-consent', el => { el.scrollTop = 0; });
    await page.screenshot({ path: `output/consent/${name}-details.png` });
    await page.$eval('#analytics-decline', el => el.scrollIntoView({ block: 'center' }));
    await page.tap('#analytics-decline');
    await page.tap('#practice-btn');
    await page.tap('#start-btn');
    await page.waitForFunction(() => window.__game.scene.getScene('game').state === 'play');
  }
  // 설정의 소리 스위치: 켜고 끄기, 새로고침 뒤에도 유지, M 키와 같은 상태
  await page.setViewport({ width: 1200, height: 800, isMobile: false, hasTouch: false });
  await page.goto(url);
  await page.waitForSelector('#menu:not(.hidden)');
  await page.click('#analytics-settings');
  await page.waitForSelector('#settings-dialog[open]');
  assert.equal(await page.$eval('#sound-toggle', el => el.getAttribute('aria-checked')), 'true');
  await page.click('#sound-toggle');
  assert.equal(await page.$eval('#sound-toggle', el => el.getAttribute('aria-checked')), 'false');
  await new Promise(resolve => setTimeout(resolve, 250)); // 스위치 전환 애니메이션
  await page.screenshot({ path: 'output/consent/desktop-sound-off.png' });
  await page.click('#settings-close');
  assert.equal(await page.$eval('#settings-dialog', el => el.open), false);
  await page.reload();
  await page.waitForSelector('#menu:not(.hidden)');
  assert.equal(await page.$eval('#bgm', el => el.muted || el.paused), true);
  await page.click('#analytics-settings');
  assert.equal(await page.$eval('#sound-toggle', el => el.getAttribute('aria-checked')), 'false', 'mute persists');
  await page.click('#sound-toggle');
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(() => localStorage.getItem('mundo-muted-v1')), '0');

  // 설정의 플레이 통계 전송 스위치: 바로 동의·철회
  await page.evaluate(() => localStorage.setItem('mundo-analytics-consent-v1', 'declined'));
  await page.reload();
  await page.waitForSelector('#menu:not(.hidden)');
  await page.click('#analytics-settings');
  assert.equal(await page.$eval('#analytics-toggle', el => el.getAttribute('aria-checked')), 'false');
  await page.click('#analytics-toggle');
  assert.equal(await page.evaluate(() => localStorage.getItem('mundo-analytics-consent-v1')), 'accepted');
  assert.equal(await page.$eval('#analytics-toggle', el => el.getAttribute('aria-checked')), 'true');
  await page.waitForFunction(() => window.sdkCalls?.includes('in'));
  await page.click('#analytics-toggle');
  assert.equal(await page.evaluate(() => localStorage.getItem('mundo-analytics-consent-v1')), 'declined');
  await page.waitForFunction(() => window.sdkCalls.at(-1) === 'out');
  assert.equal(await page.$eval('#settings-dialog', el => el.open), true, 'toggling keeps settings open');
  await new Promise(resolve => setTimeout(resolve, 250));
  await page.screenshot({ path: 'output/consent/desktop-settings-dialog.png' });
  await page.keyboard.press('Escape');

  assert.deepEqual(errors, []);
  console.log('Settings sound switch and persistence, analytics switch, consent: modal focus, Escape, no capture before consent, persistence, acceptance, withdrawal, cross-tab sync, desktop/mobile layouts and gameplay after decline passed. No real data sent.');
} finally {
  await browser.close();
  server.close();
}
