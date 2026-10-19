// 게임 계산 (Phaser·DOM 없음). 브라우저 봇전과 온라인 서버가 같이 쓴다.
// world: { champs, cleavers, state, arenaR, roundTime, shrinkTeam, judge, nextCleaverId, feed }
//   shrinkTeam: 경기장 축소가 적용되는 팀 (봇전은 0, 대인전은 null)
//   fixedArenaR: 양 팀의 경기장을 같은 반경으로 고정 (페이커)
//   judge: 식칼 발사·충돌·피격을 여기서 판정할지 (온라인 클라이언트는 false, 서버가 판정)
// 화면 효과는 직접 그리지 않고 world.feed 에 쌓는다. 챔피언은 world.champs 의 번호(ci)로 가리킨다.
import { RULES } from './rules.js';
import { THROW } from './throw-motion.js';

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function createWorld({ shrinkTeam = null, judge = true, fixedArenaR = null } = {}) {
  return {
    champs: [], cleavers: [], state: 'play', arenaR: RULES.arenaR, roundTime: 0,
    shrinkTeam, judge, fixedArenaR, nextCleaverId: 1, feed: [],
  };
}

export function createChamp(team) {
  return { team, side: team === 0 ? -1 : 1, stats: { kills: 0, deaths: 0, throws: 0, hits: 0 } };
}

export function resetChamp(c, x, z) {
  Object.assign(c, {
    x, z, vx: 0, vz: 0, hp: RULES.maxHp, alive: true,
    qCd: rand(0.6, 1.2), flashCd: 0, ghostCd: 0, ghostT: 0, slowT: 0,
    castT: 0, pending: null, moveTarget: null, actionT: 0,
    celebrate: false, facing: c.team === 0 ? 0 : Math.PI,
  });
}

export function champSpeed(c) {
  return RULES.moveSpeed * (c.ghostT > 0 ? RULES.ghost.mul : 1) * (c.slowT > 0 ? 1 - RULES.q.slow : 1);
}

const emit = (world, event) => world.feed.push(event);
const ci = (world, c) => world.champs.indexOf(c);

export function updateArena(world) {
  if (world.fixedArenaR != null) { world.arenaR = world.fixedArenaR; return; }
  if (world.shrinkTeam == null) { world.arenaR = RULES.arenaR; return; }
  const { delay, duration, minScale } = RULES.shrink;
  const progress = clamp((world.roundTime - delay) / duration, 0, 1);
  world.arenaR = RULES.arenaR * (1 - (1 - minScale) * progress);
}

export function constrain(world, p, champ) {
  const s = champ.side;
  const minX = RULES.midGap + RULES.champR;
  const maxR = (world.fixedArenaR != null || champ.team === world.shrinkTeam ? world.arenaR : RULES.arenaR) - RULES.champR * 0.5;
  if (p.x * s < minX) p.x = s * minX;
  const r = Math.hypot(p.x, p.z);
  if (r > maxR) { p.x *= maxR / r; p.z *= maxR / r; }
  if (p.x * s < minX) {
    p.x = s * minX;
    const zMax = Math.sqrt(maxR * maxR - minX * minX);
    p.z = clamp(p.z, -zMax, zMax);
  }
  return p;
}

export function castQ(world, c, tx, tz) {
  if (world.state !== 'play' || !c.alive || c.qCd > 0 || c.castT > 0) return false;
  let dx = tx - c.x, dz = tz - c.z;
  let l = Math.hypot(dx, dz);
  if (l < 0.01) { dx = Math.cos(c.facing); dz = Math.sin(c.facing); l = 1; }
  dx /= l; dz /= l;
  c.facing = Math.atan2(dz, dx);
  c.qCd = RULES.q.cd;
  const paid = Math.min(RULES.q.cost, Math.max(0, c.hp - 1)); // 체력 비용으로 스스로 죽지 않음(최소 1)
  c.hp -= paid;
  c.castT = RULES.q.windup;
  c.pending = { dx, dz, paid };
  c.actionT = THROW.duration;
  emit(world, { type: 'cast', ci: ci(world, c), facing: c.facing });
  return true;
}

// stop: 점멸 후 이동 목표를 지운다 (사람이 조작하는 챔피언)
export function castFlash(world, c, tx, tz, { stop = false } = {}) {
  if (world.state !== 'play' || !c.alive || c.flashCd > 0) return false;
  let dx = tx - c.x, dz = tz - c.z;
  const l = Math.hypot(dx, dz);
  if (l < 0.01) { dx = Math.cos(c.facing); dz = Math.sin(c.facing); } else { dx /= l; dz /= l; }
  const d = Math.min(Math.max(l, 1.5), RULES.flash.dist);
  const fromX = c.x, fromZ = c.z;
  const to = constrain(world, { x: c.x + dx * d, z: c.z + dz * d }, c);
  c.x = to.x; c.z = to.z;
  c.facing = Math.atan2(dz, dx);
  c.flashCd = RULES.flash.cd;
  if (stop) c.moveTarget = null;
  emit(world, { type: 'flash', ci: ci(world, c), fromX, fromZ, x: c.x, z: c.z });
  return true;
}

export function castGhost(world, c) {
  if (world.state !== 'play' || !c.alive || c.ghostCd > 0) return false;
  c.ghostT = RULES.ghost.dur;
  c.ghostCd = RULES.ghost.cd;
  emit(world, { type: 'ghost', ci: ci(world, c) });
  return true;
}

export function hit(world, victim, cleaver) {
  const k = cleaver.owner;
  const dmg = Math.round(Math.max(RULES.q.dmgMin, victim.hp * RULES.q.dmgPct));
  victim.hp -= dmg;
  if (k.alive) k.hp = Math.min(RULES.maxHp, k.hp + cleaver.paid);
  victim.slowT = RULES.q.slowDur;
  k.stats.hits++;
  emit(world, {
    type: 'hit', id: cleaver.id, victim: ci(world, victim), killer: ci(world, k), dmg, x: victim.x, z: victim.z,
    dx: Math.round(cleaver.dx * 100) / 100, dz: Math.round(cleaver.dz * 100) / 100,
  });
  if (victim.hp <= 0) kill(world, victim, k);
}

export function kill(world, v, k) {
  v.hp = 0;
  v.alive = false;
  v.moveTarget = null;
  v.pending = null;
  v.castT = 0;
  k.stats.kills++;
  v.stats.deaths++;
  emit(world, { type: 'kill', victim: ci(world, v), killer: ci(world, k), x: v.x, z: v.z });
}

// 타이머·체력 재생·식칼 발사·이동. 반환값: 이번 프레임에 움직였는지
export function updateChamp(world, c, dt) {
  c.qCd = Math.max(0, c.qCd - dt);
  c.flashCd = Math.max(0, c.flashCd - dt);
  c.ghostCd = Math.max(0, c.ghostCd - dt);
  c.ghostT = Math.max(0, c.ghostT - dt);
  c.slowT = Math.max(0, c.slowT - dt);
  c.actionT = Math.max(0, c.actionT - dt);
  const playing = world.state === 'play';
  if (c.alive && playing) c.hp = Math.min(RULES.maxHp, c.hp + RULES.regen * dt);

  if (c.castT > 0) {
    c.castT -= dt;
    if (c.castT <= 0 && c.pending && c.alive) {
      if (world.judge) {
        const { dx, dz, paid } = c.pending;
        const cl = {
          id: world.nextCleaverId++, owner: c, team: c.team, dx, dz, paid,
          x: c.x + dx * 0.6, z: c.z + dz * 0.6, dist: 0, age: 0, alive: true,
        };
        world.cleavers.push(cl);
        c.stats.throws++;
        emit(world, { type: 'throw', id: cl.id, ci: ci(world, c), x: cl.x, z: cl.z, dx, dz });
      }
      c.pending = null;
    }
  }

  const px = c.x, pz = c.z;
  if (c.moveTarget) constrain(world, c.moveTarget, c);
  if (c.alive && playing && c.castT <= 0 && c.moveTarget) {
    const dx = c.moveTarget.x - c.x, dz = c.moveTarget.z - c.z;
    const l = Math.hypot(dx, dz);
    if (l < 0.06) c.moveTarget = null;
    else {
      const step = Math.min(l, champSpeed(c) * dt);
      c.x += (dx / l) * step;
      c.z += (dz / l) * step;
      if (c.actionT <= 0) c.facing = Math.atan2(dz, dx);
    }
  }
  if (c.alive) constrain(world, c, c);
  if (dt > 0) {
    c.vx = (c.x - px) / dt;
    c.vz = (c.z - pz) / dt;
  }
  return Math.hypot(c.vx, c.vz) > 0.4;
}

// 식칼 이동과 충돌. 사거리 끝이면 cleaverEnd 이벤트.
export function updateCleaver(world, p, dt) {
  const step = RULES.q.speed * dt;
  p.x += p.dx * step;
  p.z += p.dz * step;
  p.dist += step;
  p.age += dt;
  if (!world.judge) return;
  if (world.state === 'play') {
    const hitR = RULES.q.width + RULES.champR;
    for (const e of world.champs) {
      if (e.team === p.team || !e.alive) continue;
      if (Math.hypot(e.x - p.x, e.z - p.z) < hitR) {
        p.alive = false;
        hit(world, e, p);
        return;
      }
    }
  }
  if (p.dist >= RULES.q.range) {
    p.alive = false;
    emit(world, { type: 'cleaverEnd', id: p.id, x: p.x, z: p.z });
  }
}

// 라운드 판정: 양 팀 모두 살아 있으면 null, 아니면 승리 팀 (동시 사망 -1)
export function roundWinner(world) {
  const a = world.champs.some(c => c.team === 0 && c.alive);
  const b = world.champs.some(c => c.team === 1 && c.alive);
  if (a && b) return null;
  return a ? 0 : b ? 1 : -1;
}

// 서버용 한 틱 진행 (봇전 씬은 같은 순서로 직접 호출한다)
export function stepWorld(world, dt) {
  if (world.state === 'play') {
    world.roundTime += dt;
    updateArena(world);
  }
  for (const c of world.champs) updateChamp(world, c, dt);
  for (const cl of world.cleavers) if (cl.alive) updateCleaver(world, cl, dt);
  world.cleavers = world.cleavers.filter(cl => cl.alive);
}
