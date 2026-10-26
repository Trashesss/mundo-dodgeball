// Local MVP economy. No real-money purchases or server-side inventory.
export const SHOP_KEY = 'mundo-shop-v1';
export const MAPS = [
  { id: 'classic', name: '바위 협곡', subtitle: '익숙한 곳에서, 가볍게 한 판.', price: 0, image: 'assets/cartoon/arena.png', tag: '기본 맵', description: '둥근 바위와 잔잔한 물결. 문도들의 첫 번째 경기장입니다.' },
  { id: 'colosseum', name: '문도 콜로세움', subtitle: '모래 위에서 실력을 증명해.', price: 1500, image: 'assets/cartoon/colosseum-selected-v1.png', tag: '새로운 경기장', description: '황금빛 모래, 겹겹이 둘러선 석조 관중석, 붉은 깃발. 오늘의 주인공은 문도입니다.' },
];
const fresh = () => ({ coins: 100, owned: ['classic'], equipped: 'classic', rewarded: [] });
let state = fresh();
let persistent = true;

function read() {
  if (!persistent) return state;
  try {
    const raw = localStorage.getItem(SHOP_KEY);
    if (raw === null) return state;
    const data = JSON.parse(raw);
    if (!data || !Number.isSafeInteger(data.coins) || data.coins < 0) return state;
    const owned = MAPS.filter(map => map.price === 0 || (Array.isArray(data.owned) && data.owned.includes(map.id))).map(map => map.id);
    return {
      coins: Math.min(data.coins, 1_000_000_000), owned,
      equipped: owned.includes(data.equipped) ? data.equipped : 'classic',
      rewarded: Array.isArray(data.rewarded) ? data.rewarded.filter(id => typeof id === 'string').slice(-100) : [],
    };
  } catch { return state; }
}
function save() {
  try { localStorage.setItem(SHOP_KEY, JSON.stringify(state)); persistent = true; }
  catch { persistent = false; }
  window.dispatchEvent(new Event('mundo-shop-change'));
}
state = read();
save();

export function getShopState() {
  return { ...state, owned: [...state.owned], rewarded: [...state.rewarded], persistent };
}
export function buyMap(id) {
  state = read();
  const map = MAPS.find(map => map.id === id);
  if (!map) return { ok: false, reason: '없는 맵이에요.' };
  if (state.owned.includes(id)) return { ok: false, reason: '이미 보유한 맵이에요.' };
  if (state.coins < map.price) return { ok: false, reason: `${map.price - state.coins} 코인이 더 필요해요. 한 판 플레이하고 돌아오세요!` };
  state.coins -= map.price;
  state.owned.push(id);
  save();
  return { ok: true };
}
export function equipMap(id) {
  state = read();
  if (!state.owned.includes(id)) return false;
  state.equipped = id;
  save();
  return true;
}
export function awardMatch(id, win) {
  state = read();
  if (!id || state.rewarded.includes(id)) return 0;
  const amount = win ? 100 : 30;
  state.coins = Math.min(1_000_000_000, state.coins + amount);
  state.rewarded = [...state.rewarded, id].slice(-100);
  save();
  return amount;
}
window.addEventListener('storage', event => {
  if (event.key !== SHOP_KEY) return;
  state = event.newValue === null ? fresh() : read();
  window.dispatchEvent(new Event('mundo-shop-change'));
});
