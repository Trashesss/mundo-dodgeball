// 공유로 받는 상점 아이템. 공유 링크는 결과 공유와 같은 share_id 규약을 쓰고(utm_medium=shop),
// 친구가 링크를 열었는지는 게임 서버가 기억한다. PostHog는 측정만 하고 해금 판정에는 쓰지 않는다.
// 서버는 공유자가 아닌 방문자가 연 share_id만 돌려주므로 자기 링크를 열어서는 받을 수 없다.
import { serverUrl } from './online.js';
import { track, createTrackingId } from './analytics.js';
import { claimShareItems } from './shop-state.js';

export const REFERRAL_KEY = 'mundo-referral-v1';
const MAX_SHARES = 20;
const TIMEOUT_MS = 5000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

let data = null;
function load() {
  try {
    const data = JSON.parse(localStorage.getItem(REFERRAL_KEY));
    if (data && UUID.test(data.visitor)) {
      return { visitor: data.visitor, shares: Array.isArray(data.shares) ? data.shares.filter(id => UUID.test(id)).slice(-MAX_SHARES) : [] };
    }
  } catch { /* 저장소를 못 쓰면 이번 방문의 값을 그대로 쓴다 */ }
  return data ?? { visitor: createTrackingId(), shares: [] };
}
data = load();
let unlocked = []; // 아직 상점에서 알려주지 않은 새로 받은 아이템
function save() {
  try { localStorage.setItem(REFERRAL_KEY, JSON.stringify(data)); } catch { /* 이번 방문에만 유지 */ }
}
save();

// 보내고 답 하나 받으면 닫는 일회성 연결. 서버에 못 붙으면 null (다음에 다시 확인한다)
function ask(msg) {
  return new Promise(resolve => {
    let ws;
    try { ws = new WebSocket(serverUrl()); } catch { resolve(null); return; }
    const done = value => { clearTimeout(timer); resolve(value); try { ws.close(); } catch { /* 무시 */ } };
    const timer = setTimeout(() => done(null), TIMEOUT_MS);
    ws.onopen = () => ws.send(JSON.stringify({ type: 'referral', visitor: data.visitor, ...msg }));
    ws.onmessage = event => {
      try {
        const reply = JSON.parse(event.data);
        if (reply?.type === 'referral') done(reply);
      } catch { /* 무시 */ }
    };
    ws.onerror = () => done(null);
    ws.onclose = () => done(null);
  });
}

// 내 공유 링크 중 친구가 연 것이 있으면 공유 아이템을 지급한다
export async function checkReferrals(opened) {
  data = load();
  if (!data.shares.length && !opened) return;
  const reply = await ask({ ids: data.shares, ...(opened ? { opened } : {}) });
  const shareId = Array.isArray(reply?.opened) ? reply.opened.find(id => data.shares.includes(id)) : null;
  if (!shareId) return;
  const gained = claimShareItems();
  for (const { item, type } of gained) track('shop_item_unlocked', { item_type: type, item_id: item.id, method: 'share', share_id: shareId });
  if (!gained.length) return;
  unlocked.push(...gained.map(({ item }) => item));
  window.dispatchEvent(new Event('mundo-share-unlocked'));
}

// 상점이 알림을 띄울 때 꺼내 간다 (상점이 닫혀 있을 때 받았으면 다음에 열 때 알린다)
export function takeUnlocked() {
  const items = unlocked;
  unlocked = [];
  return items;
}

// 상점 공유 링크 공유. 결과: 'native' | 'clipboard' | 'cancelled' | 'failed'
export async function shareShopItem(item, itemType) {
  const shareId = createTrackingId();
  data = load();
  data.shares = [...data.shares.filter(id => id !== shareId), shareId].slice(-MAX_SHARES);
  save();
  const url = new URL(location.pathname, location.origin);
  url.searchParams.set('share_id', shareId);
  url.searchParams.set('utm_source', 'friend');
  url.searchParams.set('utm_medium', 'shop');
  const text = `[문도 피구] 이 링크로 들어와서 같이 하자! 날아오는 식칼을 피하고, 상대 문도를 쓰러뜨리는 피구 게임`;
  const properties = { kind: 'shop', item_type: itemType, item_id: item.id, share_id: shareId };
  track('share_clicked', properties);
  if (navigator.share && matchMedia('(pointer: coarse)').matches) {
    try {
      await navigator.share({ title: '문도 피구', text, url: url.href });
      track('share_completed', { ...properties, method: 'native' });
      return 'native';
    } catch (error) {
      if (error.name === 'AbortError') {
        track('share_cancelled', { ...properties, method: 'native' });
        return 'cancelled';
      }
    }
  }
  try {
    // 바로 붙여 넣어 쓸 수 있게 링크만 복사한다 (안내 문구는 네이티브 공유에만 붙인다)
    await navigator.clipboard.writeText(url.href);
    track('share_completed', { ...properties, method: 'clipboard' });
    return 'clipboard';
  } catch {
    track('share_failed', { ...properties, method: 'clipboard' });
    return 'failed';
  }
}

// 친구가 상점 공유 링크로 들어오면 연 사실을 알린다. 새로고침으로 다시 보내지 않게 주소에서 지운다
// (분석 귀속은 analytics.js가 이미 이 방문 동안 기억한다)
const params = new URLSearchParams(location.search);
const incoming = params.get('utm_medium') === 'shop' && UUID.test(params.get('share_id') ?? '') ? params.get('share_id') : null;
if (incoming) {
  const url = new URL(location.href);
  for (const key of ['share_id', 'utm_source', 'utm_medium']) url.searchParams.delete(key);
  history.replaceState(history.state, '', url);
}
checkReferrals(incoming);
