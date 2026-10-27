// Local MVP economy. No real-money purchases or server-side inventory.
export const SHOP_KEY = 'mundo-shop-v1';
export const COIN_REWARDS = Object.freeze({ firstVisit: 100, win: 100, loss: 30 });
export const MAPS = [
  { id: 'classic', name: '바위 협곡', subtitle: '익숙한 곳에서, 가볍게 한 판.', price: 0, image: 'assets/cartoon/arena.png', tag: '기본 맵', description: '둥근 바위와 잔잔한 물결. 문도들의 첫 번째 경기장입니다.' },
  { id: 'colosseum', name: '문도 콜로세움', subtitle: '모래 위에서 실력을 증명해.', price: 1500, image: 'assets/cartoon/colosseum-selected-v1.png', tag: '새로운 경기장', description: '황금빛 모래, 겹겹이 둘러선 석조 관중석, 붉은 깃발. 오늘의 주인공은 문도입니다.' },
];
export const WEAPONS = [
  { id: 'cleaver', name: '문도의 식칼', subtitle: '익숙한 손맛, 묵직한 한 방.', price: 0, image: 'assets/cartoon/cleaver-icon.png', description: '문도와 함께해 온 기본 투척 무기. 언제든 다시 장착할 수 있어요.' },
  { id: 'soccer', name: '클래식 축구공', subtitle: '발 대신 손으로, 골 대신 명중!', price: 300, image: 'assets/cartoon/soccer-ball-v2.png', description: '흑백 무늬 축구공을 힘껏 던져보세요! 손에 든 공부터 빙글빙글 날아가는 공까지 바뀌어요. 속도, 피해량, 재사용 대기시간은 식칼과 같아요.' },
];
export const SKINS = [
  { id: 'classic', name: '기본 문도', subtitle: '문도, 원래 모습도 멋있다!', price: 0, image: 'assets/cartoon/shop-classic-v1.png', description: '보라색 근육과 익숙한 조끼. 언제든 돌아올 수 있는 문도의 기본 모습이에요.' },
  { id: 'ronaldo', name: '호날두 문도', subtitle: '문도, Siuuuu', price: 777, image: 'assets/cartoon/ronaldo/shop-v5.png', description: '빨간 7번 유니폼에 호날두 가면을 쓴 문도예요. 무기는 따로 선택할 수 있어요. 이동 속도와 공격 성능은 기본 문도와 같아요.' },
  { id: 'teemo', name: '티모 문도', subtitle: '문도, 정찰 준비 완료!', price: 600, image: 'assets/cartoon/teemo/shop-v1.png', description: '초록 정찰 모자와 빨간 고글, 스카프에 작은 배낭까지! 티모처럼 차려입은 보라색 문도예요. 무기는 따로 선택할 수 있고, 이동 속도와 공격 성능은 기본 문도와 같아요.' },
];
const fresh = () => ({ coins: COIN_REWARDS.firstVisit, owned: ['classic'], equipped: 'classic', ownedWeapons: ['cleaver'], equippedWeapon: 'cleaver', ownedSkins: ['classic'], equippedSkin: 'classic', rewarded: [] });
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
    const ownedWeapons = WEAPONS.filter(item => item.price === 0 || (Array.isArray(data.ownedWeapons) && data.ownedWeapons.includes(item.id))).map(item => item.id);
    const ownedSkins = SKINS.filter(item => item.price === 0 || (Array.isArray(data.ownedSkins) && data.ownedSkins.includes(item.id))).map(item => item.id);
    return {
      coins: Math.min(data.coins, 1_000_000_000), owned,
      equipped: owned.includes(data.equipped) ? data.equipped : 'classic',
      ownedWeapons, equippedWeapon: ownedWeapons.includes(data.equippedWeapon) ? data.equippedWeapon : 'cleaver',
      ownedSkins, equippedSkin: ownedSkins.includes(data.equippedSkin) ? data.equippedSkin : 'classic',
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
  return { ...state, owned: [...state.owned], ownedWeapons: [...state.ownedWeapons], ownedSkins: [...state.ownedSkins], rewarded: [...state.rewarded], persistent };
}
export function buyMap(id) {
  state = read();
  const map = MAPS.find(map => map.id === id);
  if (!map) return { ok: false, reason: '없는 맵이에요.' };
  if (state.owned.includes(id)) return { ok: false, reason: '이미 보유한 맵이에요.' };
  if (state.coins < map.price) return { ok: false, reason: `${map.price - state.coins} 코인이 더 필요해요.` };
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
export function buyWeapon(id) {
  state = read();
  const weapon = WEAPONS.find(item => item.id === id);
  if (!weapon) return { ok: false, reason: '없는 무기예요.' };
  if (state.ownedWeapons.includes(id)) return { ok: false, reason: '이미 보유한 무기예요.' };
  if (state.coins < weapon.price) return { ok: false, reason: `${weapon.price - state.coins} 코인이 더 필요해요.` };
  state.coins -= weapon.price;
  state.ownedWeapons.push(id);
  save();
  return { ok: true };
}
export function equipWeapon(id) {
  state = read();
  if (!state.ownedWeapons.includes(id)) return false;
  state.equippedWeapon = id;
  save();
  return true;
}
export function buySkin(id) {
  state = read();
  const skin = SKINS.find(item => item.id === id);
  if (!skin) return { ok: false, reason: '없는 스킨이에요.' };
  if (state.ownedSkins.includes(id)) return { ok: false, reason: '이미 보유한 스킨이에요.' };
  if (state.coins < skin.price) return { ok: false, reason: `${skin.price - state.coins} 코인이 더 필요해요.` };
  state.coins -= skin.price;
  state.ownedSkins.push(id);
  save();
  return { ok: true };
}
export function equipSkin(id) {
  state = read();
  if (!state.ownedSkins.includes(id)) return false;
  state.equippedSkin = id;
  save();
  return true;
}
export function awardMatch(id, win) {
  state = read();
  if (!id || state.rewarded.includes(id)) return 0;
  const amount = win ? COIN_REWARDS.win : COIN_REWARDS.loss;
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
