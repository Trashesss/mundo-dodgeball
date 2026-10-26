import { MAPS, COIN_REWARDS, getShopState, buyMap, equipMap } from './shop-state.js';

const $ = id => document.getElementById(id);

export function initShop(scene) {
  const dialog = $('shop-dialog');
  $('shop-reward-win').textContent = `+${COIN_REWARDS.win.toLocaleString('ko-KR')}`;
  $('shop-reward-loss').textContent = `+${COIN_REWARDS.loss.toLocaleString('ko-KR')}`;
  let selected = 'colosseum';
  const currentMap = () => MAPS.find(map => map.id === selected);

  function render() {
    const state = getShopState(), map = currentMap();
    const owned = state.owned.includes(map.id), equipped = state.equipped === map.id;
    $('menu-coins').textContent = state.coins.toLocaleString('ko-KR');
    $('shop-coins').textContent = state.coins.toLocaleString('ko-KR');
    $('shop-map-name').textContent = map.name;
    $('shop-map-subtitle').textContent = map.subtitle;
    $('shop-map-description').textContent = map.description;
    $('shop-map-image').src = map.image;
    $('shop-map-image').alt = `${map.name} 경기장 전경`;
    $('shop-ownership').textContent = equipped ? '✓ 현재 적용 중' : owned ? '내가 보유한 경기장' : '한 번 구매하면 계속 사용할 수 있어요';
    $('shop-action').disabled = equipped;
    $('shop-action').textContent = equipped ? '적용 중인 경기장' : owned ? '이 맵 적용하기' : `${map.price.toLocaleString('ko-KR')} 코인으로 구매`;
    $('shop-owned-count').textContent = `${state.owned.length} / ${MAPS.length} 보유`;
    $('shop-storage-note').textContent = state.persistent ? '코인과 구매 내역은 이 브라우저에 저장돼요.' : '브라우저 저장을 사용할 수 없어 이번 방문에만 유지돼요.';
    for (const button of $('shop-map-list').children) {
      const item = MAPS.find(map => map.id === button.dataset.map);
      button.setAttribute('aria-pressed', String(item.id === selected));
      button.querySelector('small').textContent = state.equipped === item.id ? '✓ 적용 중' : state.owned.includes(item.id) ? '보유 중' : `${item.price} 코인`;
      button.querySelector('.shop-map-check').textContent = item.id === selected ? '◈' : '';
      button.querySelector('.shop-card-badge').textContent = item.id === state.equipped ? '적용 중' : state.owned.includes(item.id) ? '보유' : 'NEW';
      button.dataset.owned = String(state.owned.includes(item.id));
    }
    if (scene.state === 'menu') scene.applyArena(state.equipped);
  }

  for (const map of MAPS) {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'shop-map-card'; button.dataset.map = map.id;
    // Catalog values are static, never user-provided.
    button.innerHTML = `<span class="shop-card-art"><img src="${map.image}" alt="" width="180" height="160"><span class="shop-card-badge"></span><span class="shop-map-check" aria-hidden="true"></span></span><span class="shop-card-info"><strong>${map.name}</strong><small></small></span>`;
    button.addEventListener('click', () => { selected = map.id; $('shop-status').textContent = ''; render(); });
    $('shop-map-list').append(button);
  }
  $('shop-open').addEventListener('click', () => {
    $('shop-status').textContent = '';
    render(); dialog.showModal(); dialog.scrollTop = 0;
  });
  $('shop-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => $('shop-open').focus({ preventScroll: true }));
  $('shop-action').addEventListener('click', () => {
    const map = currentMap();
    if (!getShopState().owned.includes(map.id)) {
      const result = buyMap(map.id);
      $('shop-status').textContent = result.ok ? `${map.name} 구매 완료! ‘이 맵 적용하기’를 누르면 경기장이 바뀌어요.` : result.reason;
    } else if (equipMap(map.id)) {
      $('shop-status').textContent = '';
    }
    render();
  });
  window.addEventListener('mundo-shop-change', render);
  render();
}
