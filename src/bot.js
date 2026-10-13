// 봇 AI: 자기 진영 안에서 돌아다니다가, 날아오는 식칼을 보고 피하고, 예측 사격으로 식칼을 던진다.
import { RULES } from './rules.js';

export const DIFFICULTY = {
  easy:   { react: 0.42, dodgeChance: 0.45, aimErr: 2.0, lead: 0.35, hesitate: [0.8, 2.2], flashChance: 0.0,  ghostChance: 0.1 },
  normal: { react: 0.26, dodgeChance: 0.75, aimErr: 1.4, lead: 0.75, hesitate: [0.25, 1.1], flashChance: 0.35, ghostChance: 0.3 },
  hard:   { react: 0.14, dodgeChance: 0.93, aimErr: 0.55, lead: 1.0, hesitate: [0.05, 0.5], flashChance: 0.75, ghostChance: 0.6 },
  // 페이커: 거의 다 보고 피하고, 무빙을 섞어 읽고, 빈틈(시전 경직·둔화·점멸 쿨)을 놓치지 않는다.
  // 그래도 4% 정도는 반응을 놓치고, 점멸이 빠진 근거리 식칼은 걸어서 못 피한다.
  faker:  { react: 0.08, dodgeChance: 0.96, aimErr: 0.3, lead: 1.0, hesitate: [0.02, 0.22], flashChance: 0.95, ghostChance: 1,
            leadMix: [1, 1, 0.55, 1.3], punish: true, smartGhost: true },
};

const rand = (a, b) => a + Math.random() * (b - a);
const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;

export function initBot(c, diffKey) {
  c.ai = {
    diff: DIFFICULTY[diffKey],
    wanderT: 0,
    aimT: rand(0.6, 1.6),
    seen: new Map(),       // cleaver -> 피할지 여부
    dodgeT: 0,
    ghostUsed: false,
    ghostAt: rand(3, 25),
    style: rand(0, 1),     // 0: 뒤에서 버티는 타입, 1: 선 가까이 붙는 타입
  };
}

function pickWanderPoint(c, game) {
  const s = c.side;
  const near = 1.8 + c.ai.style * 3;
  const x = s * rand(near, near + 7);
  const z = rand(-RULES.arenaR * 0.75, RULES.arenaR * 0.75);
  return game.constrain({ x, z }, c.team);
}

// 날아오는 식칼 중 맞을 것 같은 가장 급한 것
function findThreat(c, game) {
  const d = c.ai.diff;
  let best = null;
  for (const p of game.cleavers) {
    if (!p.alive || p.team === c.team) continue;
    if (p.age < d.react) continue;
    if (!c.ai.seen.has(p)) c.ai.seen.set(p, Math.random() < d.dodgeChance);
    if (!c.ai.seen.get(p)) continue;
    const rx = c.x - p.x, rz = c.z - p.z;
    const along = rx * p.dx + rz * p.dz;
    if (along < -0.5 || along > RULES.q.range - p.dist + 1) continue;
    const px = rx - p.dx * along, pz = rz - p.dz * along;
    const perp = Math.hypot(px, pz);
    const hitR = RULES.q.width + RULES.champR;
    if (perp > hitR + 0.45) continue;
    const t = along / RULES.q.speed;
    if (!best || t < best.t) best = { p, t, px, pz, perp, hitR };
  }
  return best;
}

function dodge(c, game, threat) {
  const { p, t, perp, hitR } = threat;
  let nx = threat.px, nz = threat.pz;
  if (perp < 0.05) { nx = -p.dz; nz = p.dx; if (Math.random() < 0.5) { nx = -nx; nz = -nz; } }
  else { nx /= perp; nz /= perp; }
  const need = hitR - perp + 0.6;
  const trySide = (sx, sz) => {
    const target = game.constrain({ x: c.x + sx * (need + 0.8), z: c.z + sz * (need + 0.8) }, c.team);
    // 이동 후 탄도선에서 얼마나 벗어나는지
    const rx = target.x - p.x, rz = target.z - p.z;
    const along = rx * p.dx + rz * p.dz;
    const off = Math.hypot(rx - p.dx * along, rz - p.dz * along);
    return { target, off };
  };
  let a = trySide(nx, nz);
  if (a.off < hitR + 0.2) {
    const b = trySide(-nx, -nz);
    if (b.off > a.off) a = b;
  }
  c.moveTarget = a.target;
  c.ai.dodgeT = 0.35;

  // 걸어서는 못 피하면 점멸
  const moveTime = Math.max(0, hitR - perp + 0.1) / c.speed();
  if (moveTime > t && c.flashCd <= 0 && Math.random() < c.ai.diff.flashChance) {
    const dx = a.target.x - c.x, dz = a.target.z - c.z;
    const l = Math.hypot(dx, dz) || 1;
    game.castFlash(c, c.x + (dx / l) * RULES.flash.dist, c.z + (dz / l) * RULES.flash.dist);
  }
}

function aim(c, game, leadOverride) {
  const d = c.ai.diff;
  const target = game.player;
  if (!target.alive) return false;
  const dist = Math.hypot(target.x - c.x, target.z - c.z);
  if (dist > RULES.q.range + 1) return false;
  const t = dist / RULES.q.speed + RULES.q.windup;
  // leadMix: 예측량을 섞어서 같은 방향 무빙/역무빙 어느 쪽도 안전하지 않게
  const lead = leadOverride ?? (d.leadMix ? d.leadMix[(Math.random() * d.leadMix.length) | 0] : d.lead);
  let ax = target.x + target.vx * t * lead;
  let az = target.z + target.vz * t * lead;
  const err = d.aimErr * (0.4 + dist / RULES.q.range);
  ax += gauss() * err; az += gauss() * err;
  game.castQ(c, ax, az);
  return true;
}

export function updateBot(c, game, dt) {
  const ai = c.ai;
  ai.wanderT -= dt;
  ai.dodgeT -= dt;

  const threat = findThreat(c, game);
  if (threat && ai.dodgeT <= 0) dodge(c, game, threat);

  // 유체화를 아껴뒀다가 둔화됐거나 점멸 없이 위험할 때 켠다
  if (ai.diff.smartGhost && c.ghostCd <= 0 && c.ghostT <= 0 && (c.slowT > 0 || (threat && c.flashCd > 0))) {
    game.castGhost(c);
  }

  if (ai.dodgeT <= 0 && (ai.wanderT <= 0 || !c.moveTarget)) {
    c.moveTarget = pickWanderPoint(c, game);
    ai.wanderT = rand(0.6, 2.2);
  }

  // 유체화: 라운드 중 랜덤 타이밍
  if (!ai.diff.smartGhost && !ai.ghostUsed && game.roundTime > ai.ghostAt && c.ghostCd <= 0) {
    ai.ghostUsed = true;
    if (Math.random() < ai.diff.ghostChance) game.castGhost(c);
  }

  if (c.qCd <= 0 && c.castT <= 0) {
    ai.aimT -= dt;
    // 빈틈 응징: 상대가 던지는 경직(반응 시간 이후)이거나 둔화 중이면 바로 던진다
    const p = game.player;
    const casting = p.castT > 0 && p.castT < RULES.q.windup - ai.diff.react;
    if (ai.diff.punish && p.alive && (casting || p.slowT > 0) && aim(c, game, casting ? 0 : 1)) {
      ai.aimT = rand(...ai.diff.hesitate);
    } else if (ai.aimT <= 0) {
      aim(c, game);
      ai.aimT = rand(...ai.diff.hesitate);
    }
  }

  // 지나간 식칼 기억 정리
  for (const p of ai.seen.keys()) if (!p.alive) ai.seen.delete(p);
}
