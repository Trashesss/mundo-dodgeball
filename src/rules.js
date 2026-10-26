// 게임 밸런스 수치 (월드 유닛 기준. 롤 수치 / 100 정도로 맞춤)
import { ARENA } from './config.js';
import { THROW } from './throw-motion.js';

export const RULES = {
  arenaR: ARENA.R,
  shrink: { delay: 0, duration: 60, minScale: 0.7 },
  midGap: ARENA.MID_GAP,
  champR: 0.75,
  moveSpeed: 4.4,
  maxHp: 640,
  regen: 7,
  q:     { cd: 4, range: 0, speed: 30, width: 0.42, dmgPct: 0.2, dmgMin: 80, cost: 50, windup: THROW.release, slow: 0.4, slowDur: 2, height: 1.25 },
  // dmgPct: 대상 현재 체력 비례 마법 피해(최소 dmgMin). cost: 시전 시 소모 체력, 적중 시 100% 회복
  flash: { cd: 15, dist: 4 },
  ghost: { cd: 25, dur: 5, mul: 1.4 },
  roundsToWin: 1,
};

// 사거리: 경기장 양 끝(지름)에 선 적까지 닿도록 계산.
// 챔피언 최대 이동 반경 × 2 − 식칼 출발 오프셋(0.6) − 피격 반경 + 여유 0.3
RULES.q.range = 2 * (RULES.arenaR - RULES.champR * 0.5) - 0.6 - (RULES.q.width + RULES.champR) + 0.3;

// 룬: 칸(throw·move·util)마다 하나씩 고른다. 'base' 는 효과 없음.
// 각 룬은 runeMods 의 기본값을 덮어쓴다 (배율은 1, 나머지는 RULES 수치 그대로가 기본).
export const RUNES = {
  throw: [
    { id: 'base', name: '기본', pros: [], cons: [] },
    { id: 'fastball', name: '강속구', mods: { qSpeed: 1.25, dmg: 0.8 }, pros: ['공 속도 +25%'], cons: ['주는 피해 −20%'] },
    { id: 'heavy', name: '묵직한 한 방', mods: { qSpeed: 0.8, dmg: 1.25 }, pros: ['주는 피해 +25%'], cons: ['공 속도 −20%'] },
    { id: 'frost', name: '서리 칼날', mods: { slowDur: 3, dmg: 0.85 }, pros: ['둔화 2→3초'], cons: ['주는 피해 −15%'] },
  ],
  move: [
    { id: 'base', name: '기본', pros: [], cons: [] },
    { id: 'swift', name: '날쌘 발', mods: { move: 1.12, taken: 1.15 }, pros: ['이동 속도 +12%'], cons: ['받는 피해 +15%'] },
    { id: 'iron', name: '강철 피부', mods: { move: 0.9, taken: 0.85 }, pros: ['받는 피해 −15%'], cons: ['이동 속도 −10%'] },
    { id: 'phantom', name: '유령 걸음', mods: { ghostDur: 7, ghostCd: 32 }, pros: ['유체화 지속 5→7초'], cons: ['유체화 쿨다운 25→32초'] },
  ],
  util: [
    { id: 'base', name: '기본', pros: [], cons: [] },
    { id: 'rapid', name: '연사', mods: { qCd: 3, qCost: 80 }, pros: ['투척 쿨다운 4→3초'], cons: ['투척 체력 소모 50→80'] },
    { id: 'regen', name: '재생', mods: { regen: 12, flashCd: 20 }, pros: ['체력 재생 7→12/초'], cons: ['점멸 쿨다운 15→20초'] },
    { id: 'vamp', name: '흡혈', mods: { lifesteal: 30, regen: 4 }, pros: ['명중 시 체력 +30 회복'], cons: ['체력 재생 7→4/초'] },
  ],
};
export const RUNE_SLOTS = ['throw', 'move', 'util'];
export const DEFAULT_RUNES = Object.freeze({ throw: 'base', move: 'base', util: 'base' });

// 모르는 값은 기본 룬으로 되돌린다 (저장·네트워크 입력 공용)
export const cleanRunes = (runes) => Object.fromEntries(RUNE_SLOTS.map(slot => [
  slot, RUNES[slot].some(r => r.id === runes?.[slot]) ? runes[slot] : 'base',
]));

// 화면 표시용: 칸 순서대로 룬 이름 (예: '강속구 · 기본 · 재생')
export const runeSummary = (runes) => {
  const clean = cleanRunes(runes);
  return RUNE_SLOTS.map(slot => RUNES[slot].find(r => r.id === clean[slot]).name).join(' · ');
};

export function runeMods(runes) {
  const mods = {
    qSpeed: 1, dmg: 1, move: 1, taken: 1, qCd: RULES.q.cd, qCost: RULES.q.cost, slowDur: RULES.q.slowDur,
    regen: RULES.regen, lifesteal: 0, flashCd: RULES.flash.cd, ghostDur: RULES.ghost.dur, ghostCd: RULES.ghost.cd,
  };
  const clean = cleanRunes(runes);
  for (const slot of RUNE_SLOTS) Object.assign(mods, RUNES[slot].find(r => r.id === clean[slot]).mods);
  return mods;
}
