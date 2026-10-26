// 빠른 대전의 문도봇: 대인전 유저의 성향(측정치)을 봇 수치로 바꾼다. 서버와 도구가 같이 쓴다.
// 단계 t: 0 쉬움 · 1 보통 · 2 어려움 · 3 페이커 · 4 페이커보다 어려움 (사이 값은 보간)
import { DIFFICULTY } from './bot.js';
import { constrain, castQ, castFlash, castGhost, champSpeed } from './sim.js';

const FAKER_PLUS = { react: 0.04, dodgeChance: 1, aimErr: 0.08, lead: 1, hesitate: [0.01, 0.06], flashChance: 1, ghostChance: 1, tactical: true };
const TABLE = [DIFFICULTY.easy, DIFFICULTY.normal, DIFFICULTY.hard, DIFFICULTY.faker, FAKER_PLUS];
export const MAX_LEVEL = TABLE.length - 1;

// 각 단계 봇이 보통 봇을 상대로 낸 측정치 (npm run calibrate:ghost, 300판). 단계 순으로 단조롭게 다듬었다.
// acc: 명중률 · dodge: 위협 식칼 회피율 · wait: 식칼이 준비된 뒤 던지기까지 평균 초
// 명중률은 어려움부터 0.7 근처에서 더 오르지 않아, 그 위 단계는 회피·템포로 가른다 (profileToDiff).
export const ANCHORS = [
  { acc: 0.336, dodge: 0.37, wait: 2.062 },
  { acc: 0.417, dodge: 0.39, wait: 1.482 },
  { acc: 0.695, dodge: 0.557, wait: 0.724 },
  { acc: 0.709, dodge: 0.959, wait: 0.095 },
  { acc: 0.724, dodge: 1, wait: 0.064 },
];

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, f) => a + (b - a) * f;

function at(t, key) {
  t = clamp(t, 0, MAX_LEVEL);
  const i = Math.min(Math.floor(t), MAX_LEVEL - 1), f = t - i;
  const a = TABLE[i][key], b = TABLE[i + 1][key];
  return Array.isArray(a) ? a.map((v, k) => lerp(v, b[k], f)) : lerp(a, b, f);
}

// 측정치 v 가 단계 표에서 어디쯤인지 (단계가 오를수록 커지는 값도, 작아지는 값도 된다)
function levelOf(key, v) {
  const xs = ANCHORS.map(a => a[key]);
  const up = xs[MAX_LEVEL] > xs[0];
  if (up ? v <= xs[0] : v >= xs[0]) return 0;
  for (let i = 0; i < MAX_LEVEL; i++) {
    const a = xs[i], b = xs[i + 1];
    if (up ? v <= b : v >= b) return i + (v - a) / (b - a || 1);
  }
  return MAX_LEVEL;
}

// 한 단계 t 의 봇 수치 (기본 문도봇)
export function levelDiff(t) {
  return {
    react: at(t, 'react'), dodgeChance: at(t, 'dodgeChance'), aimErr: at(t, 'aimErr'), lead: at(t, 'lead'),
    hesitate: at(t, 'hesitate'), flashChance: at(t, 'flashChance'), ghostChance: at(t, 'ghostChance'), tactical: t >= 3,
  };
}

// 기본 성향: 어려움 ~ 페이커 ~ 페이커보다 어려움 12가지에, 가끔 나오는 쉬움·보통 3가지 (15개 중 3개 = 20%)
export const SEEDS = [
  ...Array.from({ length: 12 }, (_, i) => ({ seed: true, t: 2 + (2 * i) / 11, style: ((i * 7) % 12) / 11 })),
  { seed: true, t: 0, style: 0.3 },
  { seed: true, t: 0.5, style: 0.8 },
  { seed: true, t: 1, style: 0.5 },
];

// profile: server/ghost-profile.mjs 가 만든 측정치, 또는 SEEDS 항목
export function profileToDiff(profile) {
  if (profile.seed) return { ...levelDiff(profile.t), style: profile.style };
  const tWait = levelOf('wait', profile.wait);
  let tAim = levelOf('acc', profile.acc);
  const tDodge = profile.dodge == null ? Math.min(tAim, 2) : levelOf('dodge', profile.dodge);
  // 어려움 근처부터는 명중률이 비슷해 회피·템포 단계를 따른다
  if (tAim >= 1.5) tAim = Math.max(Math.min(tAim, 2), (tDodge + tWait) / 2);
  return {
    aimErr: at(tAim, 'aimErr'), lead: at(tAim, 'lead'),
    react: at(tDodge, 'react'), dodgeChance: at(tDodge, 'dodgeChance'),
    hesitate: at(tWait, 'hesitate'),
    flashChance: clamp(profile.flashPerMin / 2, 0, 1),   // 점멸 재사용 15초 → 분당 최대 4번
    ghostChance: clamp(profile.ghostPerMin / 1.2, 0, 1), // 유체화 재사용 25초 → 분당 최대 2.4번
    tactical: (tAim + tDodge) / 2 >= 3,
    // 봇은 중앙선에서 1.8 + style·3 ~ +7 사이를 돌아다닌다 (잰 평균 |x| = 5.3 + 3·style)
    style: clamp((profile.depth - 5.3) / 3, 0, 1),
  };
}

// src/bot.js 의 updateBot 이 쓰는 game 인터페이스를 sim world 위에 만든다 (서버 방, 도구)
export function botGame(world, bot, target) {
  bot.speed = () => champSpeed(bot);
  return {
    get cleavers() { return world.cleavers; },
    get roundTime() { return world.roundTime; },
    player: target,
    constrain: (p, c) => constrain(world, p, c),
    castQ: (c, x, z) => castQ(world, c, x, z),
    castFlash: (c, x, z) => castFlash(world, c, x, z),
    castGhost: (c) => castGhost(world, c),
  };
}
