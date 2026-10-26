import { MAPS, WEAPONS, COIN_REWARDS, getShopState, buyMap, equipMap, buyWeapon, equipWeapon } from './shop-state.js';

const $ = id => document.getElementById(id);

export function initShop(scene) {
  const dialog = $('shop-dialog');
  $('shop-reward-win').textContent = `+${COIN_REWARDS.win.toLocaleString('ko-KR')}`;
  $('shop-reward-loss').textContent = `+${COIN_REWARDS.loss.toLocaleString('ko-KR')}`;
  let selected = 'colosseum';
  let category = 'maps';
  const catalog = () => category === 'maps' ? MAPS : WEAPONS;
  const currentItem = () => catalog().find(item => item.id === selected);

  function render() {
    const state = getShopState(), map = currentItem();
    const isMap = category === 'maps';
    const inventory = isMap ? state.owned : state.ownedWeapons;
    const equippedId = isMap ? state.equipped : state.equippedWeapon;
    const owned = inventory.includes(map.id), equipped = equippedId === map.id;
    const noun = isMap ? '경기장' : '투척 무기';
    $('shop-catalog-title').textContent = noun;
    $('shop-detail-title').textContent = `선택한 ${noun}`;
    $('shop-catalog-intro').textContent = isMap ? '오늘은 어디서 한 판?' : '오늘은 뭘 던져볼까?';
    $('shop-keeper-message').textContent = isMap ? '문도, 마음에 드는 곳에서 싸운다!' : '문도, 축구공도 손으로 던진다!';
    $('shop-keeper-help').textContent = isMap ? '경기장을 골라 자세히 둘러보세요.' : '외형만 바뀌어요. 실력으로 승부하세요!';
    $('shop-map-list').hidden = !isMap;
    $('shop-weapon-list').hidden = isMap;
    for (const button of document.querySelectorAll('[data-shop-category]')) {
      const active = button.dataset.shopCategory === category;
      button.setAttribute('aria-pressed', String(active));
      button.classList.toggle('shop-category-current', active);
    }
    $('menu-coins').textContent = state.coins.toLocaleString('ko-KR');
    $('shop-coins').textContent = state.coins.toLocaleString('ko-KR');
    $('shop-map-name').textContent = map.name;
    $('shop-map-subtitle').textContent = map.subtitle;
    $('shop-map-description').textContent = map.description;
    $('shop-map-image').src = map.image;
    $('shop-map-image').alt = isMap ? `${map.name} 경기장 전경` : map.name;
    $('shop-ownership').textContent = equipped ? (isMap ? '✓ 현재 적용 중' : '✓ 현재 장착 중') : owned ? `내가 보유한 ${noun}` : '한 번 구매하면 계속 사용할 수 있어요';
    $('shop-action').disabled = equipped;
    $('shop-action').textContent = equipped ? (isMap ? '적용 중인 경기장' : '장착 중인 무기') : owned ? (isMap ? '이 맵 적용하기' : '이 무기 장착하기') : `${map.price.toLocaleString('ko-KR')} 코인으로 구매`;
    $('shop-owned-count').textContent = `${inventory.length} / ${catalog().length} 보유`;
    $('shop-price-note').textContent = isMap ? '온라인에서는 내 화면에만 적용돼요.' : '내 문도와 투척물에 적용돼요. 온라인에서는 내 화면에만 보여요.';
    $('shop-storage-note').textContent = state.persistent ? '코인과 구매 내역은 이 브라우저에 저장돼요.' : '브라우저 저장을 사용할 수 없어 이번 방문에만 유지돼요.';
    for (const button of $(isMap ? 'shop-map-list' : 'shop-weapon-list').children) {
      const item = catalog().find(item => item.id === (button.dataset.map || button.dataset.weapon));
      button.setAttribute('aria-pressed', String(item.id === selected));
      button.querySelector('small').textContent = equippedId === item.id ? (isMap ? '✓ 적용 중' : '✓ 장착 중') : inventory.includes(item.id) ? '보유 중' : `${item.price} 코인`;
      button.querySelector('.shop-map-check').textContent = item.id === selected ? '◈' : '';
      button.querySelector('.shop-card-badge').textContent = item.id === equippedId ? (isMap ? '적용 중' : '장착 중') : inventory.includes(item.id) ? '보유' : 'NEW';
      button.dataset.owned = String(inventory.includes(item.id));
    }
    if (scene.state === 'menu') {
      scene.applyArena(state.equipped);
      scene.applyWeapon(state.equippedWeapon);
    }
  }

  for (const map of [...MAPS, ...WEAPONS]) {
    const isMap = MAPS.includes(map);
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'shop-map-card'; button.dataset[isMap ? 'map' : 'weapon'] = map.id;
    // Catalog values are static, never user-provided.
    button.innerHTML = `<span class="shop-card-art"><img src="${map.image}" alt="" width="180" height="160"><span class="shop-card-badge"></span><span class="shop-map-check" aria-hidden="true"></span></span><span class="shop-card-info"><strong>${map.name}</strong><small></small></span>`;
    button.addEventListener('click', () => { selected = map.id; $('shop-status').textContent = ''; render(); });
    $(isMap ? 'shop-map-list' : 'shop-weapon-list').append(button);
  }
  for (const button of document.querySelectorAll('[data-shop-category]')) {
    button.addEventListener('click', () => {
      category = button.dataset.shopCategory;
      selected = category === 'maps' ? 'colosseum' : 'soccer';
      $('shop-status').textContent = '';
      render();
    });
  }
  $('shop-open').addEventListener('click', () => {
    $('shop-status').textContent = '';
    render(); dialog.showModal(); dialog.scrollTop = 0;
  });
  $('shop-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => $('shop-open').focus({ preventScroll: true }));
  $('shop-action').addEventListener('click', () => {
    const map = currentItem(), isMap = category === 'maps';
    const state = getShopState();
    if (!(isMap ? state.owned : state.ownedWeapons).includes(map.id)) {
      const result = (isMap ? buyMap : buyWeapon)(map.id);
      $('shop-status').textContent = result.ok ? `${map.name} 구매 완료! ‘${isMap ? '이 맵 적용하기' : '이 무기 장착하기'}’를 눌러주세요.` : result.reason;
    } else if ((isMap ? equipMap : equipWeapon)(map.id)) {
      $('shop-status').textContent = '';
    }
    render();
  });
  window.addEventListener('mundo-shop-change', render);
  render();
}
