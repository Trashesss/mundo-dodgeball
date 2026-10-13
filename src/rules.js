// 게임 밸런스 수치 (월드 유닛 기준. 롤 수치 / 100 정도로 맞춤)
import { ARENA } from './config.js';
import { THROW } from './throw-motion.js';

export const RULES = {
  arenaR: ARENA.R,
  midGap: ARENA.MID_GAP,
  champR: 0.75,
  moveSpeed: 4.4,
  maxHp: 640,
  regen: 1.8,
  q:     { cd: 4, range: 0, speed: 19, width: 0.42, dmgPct: 0.2, dmgMin: 80, cost: 50, windup: THROW.release, slow: 0.4, slowDur: 2, height: 1.25 },
  // dmgPct: 대상 현재 체력 비례 마법 피해(최소 dmgMin). cost: 시전 시 소모 체력, 적중 시 100% 회복
  flash: { cd: 15, dist: 4 },
  ghost: { cd: 25, dur: 5, mul: 1.4 },
  roundsToWin: 1,
};

// 사거리: 경기장 양 끝(지름)에 선 적까지 닿도록 계산.
// 챔피언 최대 이동 반경 × 2 − 식칼 출발 오프셋(0.6) − 피격 반경 + 여유 0.3
RULES.q.range = 2 * (RULES.arenaR - RULES.champR * 0.5) - 0.6 - (RULES.q.width + RULES.champR) + 0.3;
