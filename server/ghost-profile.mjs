// 대인전 한 경기를 지켜보며 두 사람의 성향을 잰다. 경기가 끝나면 문도봇 고스트 프로필이 된다.
// 이름·IP 같은 식별 정보는 없고 숫자만 남긴다.
import { RULES } from '../src/rules.js';

const HIT_R = RULES.q.width + RULES.champR;
const NEAR = HIT_R + 0.6;   // 이만큼 가까이 지나간 식칼은 "피해야 했던" 식칼로 본다
// 검사용 서버(MUNDO_TEST=1)는 짧은 판도 남길 수 있게 줄인다
const TEST = process.env.MUNDO_TEST === '1';
const MIN_THROWS = (TEST && Number(process.env.GHOST_MIN_THROWS)) || 4;
const MIN_SECONDS = (TEST && Number(process.env.GHOST_MIN_SECONDS)) || 15;

export class GhostObserver {
  constructor(world) {
    this.world = world;
    this.time = 0;
    this.slots = world.champs.map(() => ({ threats: 0, dodged: 0, readyT: 0, waitSum: 0, waitN: 0, flash: 0, ghost: 0, depthSum: 0, depthN: 0 }));
    this.flying = new Map(); // 식칼 id → { victim, min }
    this.hits = new Set();
  }

  // 판정 틱마다 (stepWorld 뒤)
  tick(dt) {
    const w = this.world;
    if (w.state !== 'play') return;
    this.time += dt;
    w.champs.forEach((c, i) => {
      if (!c.alive) return;
      const s = this.slots[i];
      s.depthSum += Math.abs(c.x); s.depthN++;
      if (c.qCd <= 0 && c.castT <= 0) s.readyT += dt;
    });
    const live = new Set();
    for (const p of w.cleavers) {
      live.add(p.id);
      const victim = w.champs.findIndex(c => c.team !== p.team);
      const c = w.champs[victim];
      const d = Math.hypot(c.x - p.x, c.z - p.z);
      const f = this.flying.get(p.id);
      if (!f) this.flying.set(p.id, { victim, min: d });
      else f.min = Math.min(f.min, d);
    }
    for (const [id, f] of this.flying) {
      if (live.has(id)) continue;
      this.flying.delete(id);
      const hit = this.hits.delete(id);
      if (!hit && f.min >= NEAR) continue;
      const s = this.slots[f.victim];
      s.threats++;
      if (!hit) s.dodged++;
    }
  }

  // world.feed 이벤트 (서버가 보내기 전에)
  events(list) {
    for (const e of list) {
      const s = this.slots[e.ci];
      if (e.type === 'hit') this.hits.add(e.id);
      else if (e.type === 'cast' && s) { s.waitSum += s.readyT; s.waitN++; s.readyT = 0; }
      else if (e.type === 'flash' && s) s.flash++;
      else if (e.type === 'ghost' && s) s.ghost++;
    }
  }

  // 기준을 넘은 사람만 프로필로 (너무 짧거나 거의 안 던진 판은 성향을 알 수 없다)
  profiles() {
    if (this.time < MIN_SECONDS) return [];
    const min = this.time / 60;
    return this.world.champs.flatMap((c, i) => {
      const s = this.slots[i];
      if (c.stats.throws < MIN_THROWS || !s.waitN) return [];
      const r3 = (v) => Math.round(v * 1000) / 1000;
      return [{
        acc: r3(c.stats.hits / c.stats.throws),
        dodge: s.threats >= 3 ? r3(s.dodged / s.threats) : null,
        wait: r3(s.waitSum / s.waitN),
        flashPerMin: r3(s.flash / min),
        ghostPerMin: r3(s.ghost / min),
        depth: r3(s.depthSum / Math.max(1, s.depthN)),
        seconds: Math.round(this.time),
        at: Date.now(),
      }];
    });
  }
}
