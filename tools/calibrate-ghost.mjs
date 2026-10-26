// 문도봇 고스트 보정: 화면 없이 단계별 봇을 보통 봇과 붙여, 대인전과 같은 방법(server/ghost-profile.mjs)으로 잰다.
// 출력된 값을 src/ghost.js 의 ANCHORS 에 붙여 넣는다. ROUNDS 환경 변수로 판 수를 바꾼다.
import { NET } from '../src/net-protocol.js';
import { createWorld, createChamp, resetChamp, stepWorld, roundWinner } from '../src/sim.js';
import { initBot, updateBot } from '../src/bot.js';
import { levelDiff, botGame, MAX_LEVEL, profileToDiff } from '../src/ghost.js';
import { GhostObserver } from '../server/ghost-profile.mjs';

const ROUNDS = Number(process.env.ROUNDS) || 60;
const STEP = 1 / NET.TICK_HZ;
const ROUND_LIMIT = 90;

function measure(t) {
  const w = createWorld({ shrinkTeam: null, judge: true });
  w.champs = [createChamp(0), createChamp(1)];
  const diffs = [levelDiff(t), levelDiff(1)];
  const games = w.champs.map((c, i) => botGame(w, c, w.champs[1 - i]));
  const obs = new GhostObserver(w);
  let wins = 0;
  for (let r = 0; r < ROUNDS; r++) {
    w.cleavers = [];
    w.roundTime = 0;
    w.state = 'play';
    w.champs.forEach((c, i) => { resetChamp(c, NET.SPAWN[i].x, NET.SPAWN[i].z); initBot(c, diffs[i]); });
    for (let time = 0; time < ROUND_LIMIT; time += STEP) {
      w.champs.forEach((c, i) => c.alive && updateBot(c, games[i], STEP));
      stepWorld(w, STEP);
      obs.events(w.feed);
      w.feed = [];
      obs.tick(STEP);
      const win = roundWinner(w);
      if (win !== null) { if (win === 0) wins++; break; }
    }
    w.cleavers = [];
    obs.tick(0); // 남은 식칼 정리
  }
  const [p] = obs.profiles();
  return { ...p, winRate: wins / ROUNDS };
}

const rows = [];
for (let t = 0; t <= MAX_LEVEL; t++) {
  const p = measure(t);
  rows.push(p);
  console.log(`t=${t}`, JSON.stringify({ acc: p.acc, dodge: p.dodge, wait: p.wait, flashPerMin: p.flashPerMin, ghostPerMin: p.ghostPerMin, depth: p.depth, winVsNormal: p.winRate }));
}
console.log('\nANCHORS = [');
for (const p of rows) console.log(`  { acc: ${p.acc}, dodge: ${p.dodge}, wait: ${p.wait} },`);
console.log('];');
// 측정치를 다시 봇 수치로 바꿨을 때 원래 단계 근처로 돌아오는지
console.log('\n되돌림 확인 (aimErr / dodgeChance / hesitate):');
rows.forEach((p, t) => {
  const d = profileToDiff(p), o = levelDiff(t);
  console.log(`t=${t}`, d.aimErr.toFixed(2), '/', o.aimErr.toFixed(2), ' ', d.dodgeChance.toFixed(2), '/', o.dodgeChance.toFixed(2), ' ', d.hesitate.map(v => v.toFixed(2)).join('-'), '/', o.hesitate.map(v => v.toFixed(2)).join('-'));
});
