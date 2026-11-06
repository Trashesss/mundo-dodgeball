// Local MVP economy. No real-money purchases or server-side inventory.
export const SHOP_KEY = 'mundo-shop-v1';
export const COIN_REWARDS = Object.freeze({ firstVisit: 100, win: 100, loss: 30 });
export const MAPS = [
  { id: 'classic', name: '바위 협곡', subtitle: '익숙한 곳에서, 가볍게 한 판.', price: 0, image: 'assets/cartoon/arena.png', tag: '기본 맵', description: '둥근 바위와 잔잔한 물결. 문도들의 첫 번째 경기장입니다.' },
  { id: 'colosseum', name: '문도 콜로세움', subtitle: '모래 위에서 실력을 증명해.', price: 1500, image: 'assets/cartoon/colosseum-selected-v1.png', tag: '새로운 경기장', description: '황금빛 모래, 겹겹이 둘러선 석조 관중석, 붉은 깃발. 오늘의 주인공은 문도입니다.' },
  { id: 'football', name: '문도 축구장', subtitle: '문도, 잔디 위에서도 한 판!', unlock: 'share', image: 'assets/cartoon/football-selected-v1.png', tag: '새로운 경기장', description: '초록 잔디와 양쪽 골대가 있는 원형 축구장! 깔끔한 필드와 파란 관중석, 조명탑 사이에서 신나게 던져보세요.' },
];
export const WEAPONS = [
  { id: 'cleaver', name: '문도의 식칼', subtitle: '익숙한 손맛, 묵직한 한 방.', price: 0, image: 'assets/cartoon/cleaver-icon.png', description: '문도와 함께해 온 기본 투척 무기. 언제든 다시 장착할 수 있어요.' },
  { id: 'soccer', name: '클래식 축구공', subtitle: '발 대신 손으로, 골 대신 명중!', price: 300, image: 'assets/cartoon/soccer-ball-v2.png', description: '흑백 무늬 축구공을 힘껏 던져보세요! 손에 든 공부터 빙글빙글 날아가는 공까지 바뀌어요. 속도, 피해량, 재사용 대기시간은 식칼과 같아요.' },
  { id: 'mushroom', name: '티모의 버섯', subtitle: '문도, 버섯도 잘 던진다!', price: 300, image: 'assets/cartoon/teemo-mushroom-v1.png', description: '초록 갓에 빨간 반점! 티모의 버섯을 힘껏 던져보세요. 모든 스킨에서 손에 든 모습과 투척물, 스킬 아이콘이 바뀌어요. 속도, 피해량, 재사용 대기시간은 식칼과 같아요.' },
];
export const SKINS = [
  { id: 'classic', name: '기본 문도', subtitle: '문도, 원래 모습도 멋있다!', price: 0, image: 'assets/cartoon/shop-classic-v1.png', description: '보라색 근육과 익숙한 조끼. 언제든 돌아올 수 있는 문도의 기본 모습이에요.' },
  { id: 'ronaldo', name: '호날두 문도', subtitle: '문도, Siuuuu', price: 777, image: 'assets/cartoon/ronaldo/shop-v5.png', description: '빨간 7번 유니폼에 호날두 가면을 쓴 문도예요. 무기는 따로 선택할 수 있어요. 이동 속도와 공격 성능은 기본 문도와 같아요.' },
  { id: 'teemo', name: '티모 문도', subtitle: '문도, 정찰 준비 완료!', price: 600, image: 'assets/cartoon/teemo/shop-v1.png', description: '초록 정찰 모자와 빨간 고글, 스카프에 작은 배낭까지! 티모처럼 차려입은 보라색 문도예요. 무기는 따로 선택할 수 있고, 이동 속도와 공격 성능은 기본 문도와 같아요.' },
  { id: 'corporate', name: 'CEO 문도', subtitle: '문도, 오늘도 실적 달성!', price: 1000, image: 'assets/cartoon/corporate/shop-v4.png', description: '짙은 줄무늬 정장에 파란 넥타이, 검정 선글라스! 멋을 낸 CEO 문도예요. 무기는 따로 선택할 수 있고, 이동 속도와 공격 성능은 기본 문도와 같아요.' },
];
// 감정표현: 경기 중 1·2·3 키로 띄운다. id 는 src/net-protocol.js EMOTE_IDS 에도 넣어야 온라인 상대에게 보인다.
export const EMOTES = [
  { id: 'thumbs', name: '따봉 문도', subtitle: '문도, 좋았어!', price: 0, image: 'assets/cartoon/mundo-thumbs-up-emote-v1.png', description: '엄지를 척 세운 문도. 기본 감정표현이에요. 경기 중 장착한 번호 키를 누르면 머리 위에 떠요.' },
];
export const EMOTE_SLOTS = 3;
const DEFAULT_SLOTS = ['thumbs', null, null];
const fresh = () => ({ coins: COIN_REWARDS.firstVisit, owned: ['classic'], equipped: 'classic', ownedWeapons: ['cleaver'], equippedWeapon: 'cleaver', ownedSkins: ['classic'], equippedSkin: 'classic', ownedEmotes: ['thumbs'], emoteSlots: [...DEFAULT_SLOTS], rewarded: [] });
// 공유 아이템(unlock: 'share')은 코인으로 살 수 없고, 친구가 공유 링크를 열면 받는다 (src/referral.js)
const isFree = item => !item.unlock && item.price === 0;
const SHARE_ERROR = { ok: false, reason: '친구에게 공유하면 받을 수 있어요.' };
let state = fresh();
let persistent = true;

function read() {
  if (!persistent) return state;
  try {
    const raw = localStorage.getItem(SHOP_KEY);
    if (raw === null) return state;
    const data = JSON.parse(raw);
    if (!data || !Number.isSafeInteger(data.coins) || data.coins < 0) return state;
    const owned = MAPS.filter(map => isFree(map) || (Array.isArray(data.owned) && data.owned.includes(map.id))).map(map => map.id);
    const ownedWeapons = WEAPONS.filter(item => isFree(item) || (Array.isArray(data.ownedWeapons) && data.ownedWeapons.includes(item.id))).map(item => item.id);
    const ownedSkins = SKINS.filter(item => isFree(item) || (Array.isArray(data.ownedSkins) && data.ownedSkins.includes(item.id))).map(item => item.id);
    const ownedEmotes = EMOTES.filter(item => isFree(item) || (Array.isArray(data.ownedEmotes) && data.ownedEmotes.includes(item.id))).map(item => item.id);
    // 예전 저장값(슬롯 없음)은 기본 슬롯. 보유하지 않았거나 중복된 이모티콘은 비운다.
    const rawSlots = Array.isArray(data.emoteSlots) ? data.emoteSlots : DEFAULT_SLOTS;
    const emoteSlots = Array.from({ length: EMOTE_SLOTS }, (_, i) => {
      const id = rawSlots[i];
      return ownedEmotes.includes(id) && rawSlots.indexOf(id) === i ? id : null;
    });
    return {
      coins: Math.min(data.coins, 1_000_000_000), owned,
      equipped: owned.includes(data.equipped) ? data.equipped : 'classic',
      ownedWeapons, equippedWeapon: ownedWeapons.includes(data.equippedWeapon) ? data.equippedWeapon : 'cleaver',
      ownedSkins, equippedSkin: ownedSkins.includes(data.equippedSkin) ? data.equippedSkin : 'classic',
      ownedEmotes, emoteSlots,
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
  return { ...state, owned: [...state.owned], ownedWeapons: [...state.ownedWeapons], ownedSkins: [...state.ownedSkins], ownedEmotes: [...state.ownedEmotes], emoteSlots: [...state.emoteSlots], rewarded: [...state.rewarded], persistent };
}
export function buyMap(id) {
  state = read();
  const map = MAPS.find(map => map.id === id);
  if (!map) return { ok: false, reason: '없는 맵이에요.' };
  if (state.owned.includes(id)) return { ok: false, reason: '이미 보유한 맵이에요.' };
  if (map.unlock) return SHARE_ERROR;
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
  if (weapon.unlock) return SHARE_ERROR;
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
  if (skin.unlock) return SHARE_ERROR;
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
export function buyEmote(id) {
  state = read();
  const emote = EMOTES.find(item => item.id === id);
  if (!emote) return { ok: false, reason: '없는 감정표현이에요.' };
  if (state.ownedEmotes.includes(id)) return { ok: false, reason: '이미 보유한 감정표현이에요.' };
  if (emote.unlock) return SHARE_ERROR;
  if (state.coins < emote.price) return { ok: false, reason: `${emote.price - state.coins} 코인이 더 필요해요.` };
  state.coins -= emote.price;
  state.ownedEmotes.push(id);
  // 빈 번호가 있으면 바로 넣어 준다
  const empty = state.emoteSlots.indexOf(null);
  if (empty >= 0) state.emoteSlots[empty] = id;
  save();
  return { ok: true };
}
// slot(0~2)에 장착. 다른 번호에 이미 있으면 두 번호를 맞바꾼다.
export function equipEmote(id, slot) {
  state = read();
  if (!state.ownedEmotes.includes(id) || !Number.isInteger(slot) || slot < 0 || slot >= EMOTE_SLOTS) return false;
  const from = state.emoteSlots.indexOf(id);
  if (from >= 0) state.emoteSlots[from] = state.emoteSlots[slot];
  state.emoteSlots[slot] = id;
  save();
  return true;
}
// 미보유 공유 아이템을 모두 지급하고, 새로 받은 것을 [{ item, type }]로 돌려준다
export function claimShareItems() {
  state = read();
  const gained = [];
  for (const [items, inventory, type] of [[MAPS, 'owned', 'map'], [WEAPONS, 'ownedWeapons', 'weapon'], [SKINS, 'ownedSkins', 'skin'], [EMOTES, 'ownedEmotes', 'emote']]) {
    for (const item of items) if (item.unlock === 'share' && !state[inventory].includes(item.id)) {
      state[inventory].push(item.id);
      gained.push({ item, type });
    }
  }
  if (gained.length) save();
  return gained;
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
