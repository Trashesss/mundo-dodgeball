// 프로필: 경험치·숙련도(레벨, 표시용). 로컬 저장만 쓴다 (src/shop-state.js 와 같은 방식).

export const PROFILE_KEY = 'mundo-profile-v1';
export const XP_REWARDS = Object.freeze({ win: 100, loss: 40 });
const XP_MAX = 1_000_000_000;
const fresh = () => ({ xp: 0, rewarded: [] });
let state = fresh();
let persistent = true;

// 레벨 n 에서 n+1 까지 필요한 경험치
export const xpToNext = (level) => 100 + 50 * (level - 1);

export function levelInfo(xp) {
  let level = 1, into = xp;
  while (into >= xpToNext(level)) { into -= xpToNext(level); level++; }
  return { level, into, need: xpToNext(level) };
}

function read() {
  if (!persistent) return state;
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (raw === null) return state;
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return state;
    return {
      xp: Number.isSafeInteger(data.xp) && data.xp >= 0 ? Math.min(data.xp, XP_MAX) : 0,
      rewarded: Array.isArray(data.rewarded) ? data.rewarded.filter(id => typeof id === 'string').slice(-100) : [],
    };
  } catch { return state; }
}
function save() {
  try { localStorage.setItem(PROFILE_KEY, JSON.stringify(state)); persistent = true; }
  catch { persistent = false; }
  window.dispatchEvent(new Event('mundo-profile-change'));
}
state = read();
save();

export function getProfile() {
  return { ...state, rewarded: [...state.rewarded], ...levelInfo(state.xp), persistent };
}
// 반환값: 이번에 받은 경험치 (이미 받은 판이면 0)
export function awardXp(id, win) {
  state = read();
  if (!id || state.rewarded.includes(id)) return 0;
  const amount = win ? XP_REWARDS.win : XP_REWARDS.loss;
  state.xp = Math.min(XP_MAX, state.xp + amount);
  state.rewarded = [...state.rewarded, id].slice(-100);
  save();
  return amount;
}
window.addEventListener('storage', event => {
  if (event.key !== PROFILE_KEY) return;
  state = event.newValue === null ? fresh() : read();
  window.dispatchEvent(new Event('mundo-profile-change'));
});
