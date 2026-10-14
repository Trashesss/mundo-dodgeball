import puppeteer from 'puppeteer-core';
import { serve } from './serve.mjs';
import fs from 'node:fs';
import { DIFFICULTY_NAMES, shareContent } from '../src/share.js';

// Static metadata lets messenger crawlers read the result without executing JavaScript.
const site = 'https://trashesss.github.io/mundo-dodgeball/';
const rootHead = fs.readFileSync('index.html', 'utf8').split('</head>')[0];
fs.mkdirSync('share', { recursive: true });
const variants = [{ query: '', image: 'share-preview.png' }];
for (const difficulty of Object.keys(DIFFICULTY_NAMES)) {
  for (const result of ['win', 'loss']) {
    const { title, text, description } = shareContent(difficulty, result === 'win');
    const slug = `${difficulty}-${result}`;
    const url = `${site}share/${slug}.html`;
    const image = `share-preview-${slug}.png`;
    let head = rootHead.replace(/  <link[^\n]+\n/g, '').replace(/  <script[^\n]+\n/g, '');
    head = head.replace(/<title>.*?<\/title>/, `<title>${title}</title>`)
      .replace(/(<meta (?:name|property)="(?:og:title|twitter:title)" content=")[^"]*/g, `$1${title}`)
      .replace(/(<meta (?:name|property)="(?:description|og:description|twitter:description)" content=")[^"]*/g, `$1${description}`)
      .replace(/(<meta (?:name|property)="(?:og:image:alt|twitter:image:alt)" content=")[^"]*/g, `$1${title} · ${description}`)
      .replace(/(<meta property="og:url" content=")[^"]*/, `$1${url}`)
      .replaceAll('assets/cartoon/share-preview.png', `assets/cartoon/${image}`);
    fs.writeFileSync(`share/${slug}.html`, `${head}</head>
<body>
  <h1>${title}</h1>
  <p>${text}</p>
  <a href="../">문도 피구 하러 가기</a>
  <script>
    const game = new URL('../', location.href);
    game.search = location.search;
    location.replace(game.href);
  </script>
</body>
</html>
`);
    variants.push({ query: `?difficulty=${difficulty}&result=${result}`, image });
  }
}

const server = await serve(0);
let browser;
try {
  browser = await puppeteer.launch({
    executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 630, deviceScaleFactor: 1 });
  for (const variant of variants) {
    await page.goto(`http://localhost:${server.address().port}/tools/share-preview.html${variant.query}`, { waitUntil: 'networkidle0' });
    await page.waitForFunction(() => window.previewReady);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: `assets/cartoon/${variant.image}` });
  }
  console.log('Saved result share pages and 11 preview images (1200 × 630).');
} finally {
  await browser?.close();
  server.close();
}
