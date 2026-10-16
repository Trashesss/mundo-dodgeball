import puppeteer from 'puppeteer-core';
import { serve } from './serve.mjs';
import fs from 'node:fs';
import { DIFFICULTY_NAMES, GAME_DESCRIPTION, HUMILIATE_PATH, HUMILIATE_TITLE, shareContent } from '../src/share.js';

// Static metadata lets messenger crawlers read the result without executing JavaScript.
const site = 'https://trashesss.github.io/mundo-dodgeball/';
const rootHead = fs.readFileSync('index.html', 'utf8').split('</head>')[0];
fs.mkdirSync('share', { recursive: true });

function writeSharePage(path, title, description, image) {
  let head = rootHead.replace(/  <link[^\n]+\n/g, '').replace(/  <!--[^\n]*-->\n/g, '')
    .replace(/  <script[\s\S]*?<\/script>\n/g, '');
  head = head.replace(/<title>.*?<\/title>/, `<title>${title}</title>`)
    .replace(/(<meta (?:name|property)="(?:og:title|twitter:title)" content=")[^"]*/g, `$1${title}`)
    .replace(/(<meta (?:name|property)="(?:description|og:description|twitter:description)" content=")[^"]*/g, `$1${description}`)
    .replace(/(<meta (?:name|property)="(?:og:image:alt|twitter:image:alt)" content=")[^"]*/g, `$1${title} · ${description}`)
    .replace(/(<meta property="og:url" content=")[^"]*/, `$1${site}${path}`)
    .replaceAll('assets/cartoon/share-preview.png', `assets/cartoon/${image}`);
  fs.writeFileSync(path, `${head}</head>
<body>
  <h1>${title}</h1>
  <p>${description}</p>
  <a href="../">문도 피구 하러 가기</a>
  <script>
    const game = new URL('../', location.href);
    game.search = location.search;
    location.replace(game.href);
  </script>
</body>
</html>
`);
}

const variants = [{ query: '', image: 'share-preview.png' }];
for (const difficulty of Object.keys(DIFFICULTY_NAMES)) {
  for (const result of ['win', 'loss']) {
    const { title, description } = shareContent(difficulty, result === 'win');
    const slug = `${difficulty}-${result}`;
    const image = `share-preview-${slug}.png`;
    writeSharePage(`share/${slug}.html`, title, description, image);
    variants.push({ query: `?difficulty=${difficulty}&result=${result}`, image });
  }
}
// 굴욕 공유: 승리 도발 짤을 1200 × 630 미리보기에 맞춘다 (짤 배경이 검은색이라 여백이 묻힌다)
const humiliateImage = 'share-preview-humiliate.png';
writeSharePage(HUMILIATE_PATH, HUMILIATE_TITLE, GAME_DESCRIPTION, humiliateImage);

const server = await serve(0);
let browser;
try {
  browser = await puppeteer.launch({
    executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 630, deviceScaleFactor: 1 });
  const origin = `http://localhost:${server.address().port}`;
  for (const variant of variants) {
    await page.goto(`${origin}/tools/share-preview.html${variant.query}`, { waitUntil: 'networkidle0' });
    await page.waitForFunction(() => window.previewReady);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: `assets/cartoon/${variant.image}` });
  }
  const meme = `${origin}/assets/cartoon/mundo-victory-taunt-meme-v2.png`;
  await page.setContent(`<body style="margin:0;overflow:hidden;background:#000">
    <img src="${meme}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;filter:blur(32px) brightness(.55);transform:scale(1.15)">
    <img src="${meme}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:contain">
  </body>`, { waitUntil: 'load' });
  await page.waitForFunction(() => [...document.images].every((img) => img.complete && img.naturalWidth > 0));
  await page.screenshot({ path: `assets/cartoon/${humiliateImage}` });
  console.log(`Saved share pages and ${variants.length + 1} preview images (1200 × 630).`);
} finally {
  await browser?.close();
  server.close();
}
