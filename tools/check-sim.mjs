// 브라우저 없이 src/sim.js 판정 확인 (서버와 봇전이 같은 계산을 쓰는지)
import assert from 'node:assert/strict';
import { RULES } from '../src/rules.js';
import * as Sim from '../src/sim.js';

const world = (opts) => {
  const w = Sim.createWorld(opts);
  w.champs = [Sim.createChamp(0), Sim.createChamp(1)];
  Sim.resetChamp(w.champs[0], -6.5, 0);
  Sim.resetChamp(w.champs[1], 6.5, 0);
  return w;
};
const run = (w, seconds) => { for (let t = 0; t < seconds; t += 1 / 60) Sim.stepWorld(w, 1 / 60); };

// 이동: 가운데 선을 넘지 못하고 경기장 안에 머문다
{
  const w = world();
  const [a] = w.champs;
  a.moveTarget = { x: 5, z: 0 };
  run(w, 4);
  assert.ok(a.x <= -(RULES.midGap + RULES.champR) + 1e-9, 'midline');
  a.moveTarget = { x: -40, z: 0 };
  run(w, 8);
  assert.ok(Math.hypot(a.x, a.z) <= RULES.arenaR - RULES.champR * 0.5 + 1e-9, 'arena edge');
}

// Q 적중: 현재 체력 비례 피해, 시전 비용 회복, 둔화, 이벤트 순서
{
  const w = world();
  const [a, b] = w.champs;
  a.qCd = 0; b.qCd = 99; a.hp = 500;
  assert.ok(Sim.castQ(w, a, b.x, b.z));
  assert.equal(a.hp, 450);
  run(w, 1);
  const hitEvent = w.feed.find(e => e.type === 'hit');
  assert.equal(hitEvent.dmg, Math.round(RULES.maxHp * RULES.q.dmgPct), 'damage from current HP');
  assert.ok(b.hp < RULES.maxHp - hitEvent.dmg + RULES.regen, 'damage applied');
  assert.ok(b.slowT > 0, 'slow');
  assert.ok(a.hp > 495, 'cost refunded');
  const types = w.feed.map(e => e.type);
  assert.deepEqual(types, ['cast', 'throw', 'hit']);
  assert.equal(a.stats.throws, 1);
  assert.equal(a.stats.hits, 1);
  assert.equal(w.cleavers.length, 0);
}

// 쿨다운 중에는 다시 던질 수 없고, 시작 전(state != play)에도 못 던진다
{
  const w = world();
  const [a] = w.champs;
  a.qCd = 0;
  assert.ok(Sim.castQ(w, a, 0, 0));
  assert.equal(Sim.castQ(w, a, 0, 0), false);
  const c = world();
  c.state = 'countdown';
  c.champs[0].qCd = 0;
  assert.equal(Sim.castQ(c, c.champs[0], 0, 0), false);
  c.champs[0].moveTarget = { x: -10, z: 0 };
  run(c, 1);
  assert.equal(c.champs[0].x, -6.5, 'no movement during countdown');
}

// 점멸은 경기장·가운데 선 안으로 제한, stop 옵션은 이동 목표를 지운다
{
  const w = world();
  const [a] = w.champs;
  a.moveTarget = { x: -8, z: 0 };
  assert.ok(Sim.castFlash(w, a, 50, 0, { stop: true }));
  assert.ok(a.x <= -(RULES.midGap + RULES.champR) + 1e-9);
  assert.equal(a.moveTarget, null);
  assert.equal(Sim.castFlash(w, a, 0, 0), false, 'flash cooldown');
}

// 처치와 라운드 판정, 동시 사망은 무승부(-1)
{
  const w = world();
  const [a, b] = w.champs;
  assert.equal(Sim.roundWinner(w), null);
  b.hp = 10;
  Sim.hit(w, b, { owner: a, paid: 0 });
  assert.equal(b.alive, false);
  assert.equal(Sim.roundWinner(w), 0);
  a.alive = false;
  assert.equal(Sim.roundWinner(w), -1);
}

// 대인전(shrinkTeam=null)은 경기장이 줄지 않고 양쪽 경계가 같다. 봇전은 플레이어 쪽만 준다.
{
  const pvp = world({ shrinkTeam: null });
  run(pvp, 70);
  assert.equal(pvp.arenaR, RULES.arenaR);
  const bot = world({ shrinkTeam: 0 });
  run(bot, 70);
  assert.ok(Math.abs(bot.arenaR - RULES.arenaR * RULES.shrink.minScale) < 1e-9);
  const p = Sim.constrain(bot, { x: -40, z: 0 }, bot.champs[0]);
  const q = Sim.constrain(bot, { x: 40, z: 0 }, bot.champs[1]);
  assert.ok(Math.abs(p.x) < Math.abs(q.x));
  const p2 = Sim.constrain(pvp, { x: -40, z: 0 }, pvp.champs[0]);
  const q2 = Sim.constrain(pvp, { x: 40, z: 0 }, pvp.champs[1]);
  assert.equal(Math.abs(p2.x), Math.abs(q2.x));
}

// 페이커는 시작부터 양쪽 모두 최종 축소 크기이며 시간이 지나도 같다.
{
  const radius = RULES.arenaR * RULES.shrink.minScale;
  const w = world({ shrinkTeam: 0, fixedArenaR: radius });
  for (const time of [0, 30, 70]) {
    w.roundTime = time;
    Sim.updateArena(w);
    assert.equal(w.arenaR, radius);
    const left = Sim.constrain(w, { x: -40, z: 0 }, w.champs[0]);
    const right = Sim.constrain(w, { x: 40, z: 0 }, w.champs[1]);
    assert.equal(Math.abs(left.x), radius - RULES.champR * 0.5);
    assert.equal(Math.abs(left.x), Math.abs(right.x));
  }
}

// judge=false (온라인 클라이언트 예측)는 식칼을 만들지 않는다
{
  const w = world({ judge: false });
  const [a] = w.champs;
  a.qCd = 0;
  Sim.castQ(w, a, 6, 0);
  run(w, 0.5);
  assert.equal(w.cleavers.length, 0);
  assert.equal(a.pending, null);
}

console.log('Sim: movement limits, Q damage/refund/slow, cooldowns, countdown lock, flash, knockouts, draw, no-shrink PvP and prediction mode passed.');
