// 홈 메뉴가 여러 창 크기에서 스크롤 없이 한 화면에 들어오는지 확인
import puppeteer from 'puppeteer-core';
import { serve } from './serve.mjs';
import { skipConsent } from './skip-consent.mjs';

const SWEEP = process.env.SWEEP ? process.env.SWEEP.split(',').flatMap((w) => Array.from({ length: 50 }, (_, i) => [+w, 500 + i * 10])) : null;
const SIZES = SWEEP || [
  [1920, 1080], [1536, 864], [1440, 900], [1440, 820], [1280, 800], [1100, 700], [1000, 640], [1366, 768], [1280, 720], [1280, 650], [1024, 768], [900, 600], [800, 600],
  [768, 1024], [430, 932], [390, 844], [375, 667], [360, 640], [320, 568],
];
const web = await serve(0);
const url = `http://localhost:${web.address().port}/`;
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});
let failed = 0;
try {
  for (const [width, height] of SIZES) {
    const page = await browser.newPage();
    const mobile = width < 600;
    await page.setViewport({ width, height, isMobile: mobile, hasTouch: mobile });
    await skipConsent(page);
    await page.goto(url);
    await page.waitForFunction(() => window.__game?.scene.getScene('game').state === 'menu');
    await page.waitForSelector('#menu:not(.hidden)');
    await new Promise((r) => setTimeout(r, 600)); // 등장 애니메이션
    const { scroll, client } = await page.$eval('#menu', (el) => ({ scroll: el.scrollHeight, client: el.clientHeight }));
    // 모드 카드 바로 위 버튼 줄(숙련도·상점·설정)이 화면 안에 한 줄로, 서로·모드 카드와 겹치지 않는지
    const clear = await page.evaluate(() => {
      const nav = [...document.querySelectorAll('.menu-nav > :is(#profile-open, #shop-open)')].map(el => el.getBoundingClientRect());
      const modes = document.getElementById('mode-select').getBoundingClientRect();
      const gear = document.getElementById('analytics-settings').getBoundingClientRect();
      const overlap = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
      return nav.length === 2 && nav.every((b, i) => b.left >= 0 && b.right <= innerWidth && b.bottom <= modes.top + 1 && !overlap(b, gear)
        && Math.abs(b.top - nav[0].top) < 1 && Math.abs(gear.top - b.top) < 1 && gear.right <= innerWidth && gear.bottom <= modes.top + 1 && nav.every((o, j) => i === j || !overlap(b, o)));
    });
    const ok = scroll <= client && clear;
    if (!ok) failed++;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${width}x${height} scroll=${scroll} client=${client}${clear ? '' : ' nav-overlap'}`);
    if (process.env.SHOT) await page.screenshot({ path: `${process.env.SHOT}/menu-${width}x${height}.png` });
    await page.close();
  }
} finally {
  await browser.close();
  web.close();
}
process.exit(failed ? 1 : 0);
