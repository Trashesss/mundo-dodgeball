// 게임 밸런스 수치 (월드 유닛 기준. 롤 수치 / 100 정도로 맞춤)
import { ARENA } from './config.js';

export const RULES = {
  arenaR: ARENA.R,
  midGap: ARENA.MID_GAP,
  champR: 0.75,
  moveSpeed: 4.4,
  maxHp: 628,
  regen: 1.8,
  q:     { cd: 4, range: 15, speed: 19, width: 0.42, dmg: 230, windup: 0.14, slow: 0.35, slowDur: 1.5, height: 1.25 },
  flash: { cd: 15, dist: 4 },
  ghost: { cd: 25, dur: 5, mul: 1.4 },
  roundsToWin: 3,
};
