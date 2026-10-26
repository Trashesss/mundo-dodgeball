import { MAPS, WEAPONS, SKINS, COIN_REWARDS, getShopState, buyMap, equipMap, buyWeapon, equipWeapon, buySkin, equipSkin } from './shop-state.js';

const $ = id => document.getElementById(id);
const CATEGORIES = {
  maps: { items: MAPS, noun: '경기장', inventory: 'owned', equipped: 'equipped', list: 'shop-map-list', data: 'map', initial: 'colosseum', buy: buyMap, equip: equipMap, action: '이 맵 적용하기', active: '적용 중인 경기장', intro: '오늘은 어디서 한 판?', note: '온라인에서는 내 화면에만 적용돼요.' },
  weapons: { items: WEAPONS, noun: '투척 무기', inventory: 'ownedWeapons', equipped: 'equippedWeapon', list: 'shop-weapon-list', data: 'weapon', initial: 'soccer', buy: buyWeapon, equip: equipWeapon, action: '이 무기 장착하기', active: '장착 중인 무기', intro: '오늘은 뭘 던져볼까?', note: '내 문도와 투척물에 적용돼요. 온라인에서는 내 화면에만 보여요.' },
  skins: { items: SKINS, noun: '스킨', inventory: 'ownedSkins', equipped: 'equippedSkin', list: 'shop-skin-list', data: 'skin', initial: 'ronaldo', buy: buySkin, equip: equipSkin, action: '이 스킨 장착하기', active: '장착 중인 스킨', intro: '오늘은 어떤 문도로 뛰어볼까?', note: '내 문도의 모습이 바뀌어요. 온라인에서는 내 화면에만 보여요.' },
};

export function initShop(scene) {
  const dialog = $('shop-dialog');
  $('shop-reward-win').textContent = `+${COIN_REWARDS.win.toLocaleString('ko-KR')}`;
  $('shop-reward-loss').textContent = `+${COIN_REWARDS.loss.toLocaleString('ko-KR')}`;
  let selected = 'colosseum';
  let category = 'maps';
  const catalog = () => CATEGORIES[category].items;
  const currentItem = () => catalog().find(item => item.id === selected);

  function render() {
    const state = getShopState(), map = currentItem();
    const isMap = category === 'maps';
    const config = CATEGORIES[category];
    const inventory = state[config.inventory];
    const equippedId = state[config.equipped];
    const owned = inventory.includes(map.id), equipped = equippedId === map.id;
    const noun = config.noun;
    $('shop-catalog-title').textContent = noun;
    $('shop-detail-title').textContent = `선택한 ${noun}`;
    $('shop-catalog-intro').textContent = config.intro;
    for (const entry of Object.values(CATEGORIES)) $(entry.list).hidden = entry !== config;
    dialog.dataset.category = category;
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
    $('shop-action').textContent = equipped ? config.active : owned ? config.action : `${map.price.toLocaleString('ko-KR')} 코인으로 구매`;
    $('shop-owned-count').textContent = `${inventory.length} / ${catalog().length} 보유`;
    $('shop-price-note').textContent = config.note;
    $('shop-storage-note').textContent = state.persistent ? '코인과 구매 내역은 이 브라우저에 저장돼요.' : '브라우저 저장을 사용할 수 없어 이번 방문에만 유지돼요.';
    for (const button of $(config.list).children) {
      const item = catalog().find(item => item.id === button.dataset[config.data]);
      button.setAttribute('aria-pressed', String(item.id === selected));
      button.querySelector('small').textContent = equippedId === item.id ? (isMap ? '✓ 적용 중' : '✓ 장착 중') : inventory.includes(item.id) ? '보유 중' : `${item.price} 코인`;
      button.querySelector('.shop-map-check').textContent = item.id === selected ? '◈' : '';
      button.querySelector('.shop-card-badge').textContent = item.id === equippedId ? (isMap ? '적용 중' : '장착 중') : inventory.includes(item.id) ? '보유' : 'NEW';
      button.dataset.owned = String(inventory.includes(item.id));
    }
    if (scene.state === 'menu') {
      scene.applyArena(state.equipped);
      scene.applyWeapon(state.equippedWeapon);
      scene.applySkin(state.equippedSkin);
    }
  }

  for (const config of Object.values(CATEGORIES)) for (const map of config.items) {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'shop-map-card'; button.dataset[config.data] = map.id;
    // Catalog values are static, never user-provided.
    button.innerHTML = `<span class="shop-card-art"><img src="${map.image}" alt="" width="180" height="160"><span class="shop-card-badge"></span><span class="shop-map-check" aria-hidden="true"></span></span><span class="shop-card-info"><strong>${map.name}</strong><small></small></span>`;
    button.addEventListener('click', () => { selected = map.id; $('shop-status').textContent = ''; render(); });
    $(config.list).append(button);
  }
  for (const button of document.querySelectorAll('[data-shop-category]')) {
    button.addEventListener('click', () => {
      category = button.dataset.shopCategory;
      selected = CATEGORIES[category].initial;
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
    const map = currentItem(), config = CATEGORIES[category];
    const state = getShopState();
    if (!state[config.inventory].includes(map.id)) {
      const result = config.buy(map.id);
      $('shop-status').textContent = result.ok ? '' : result.reason;
    } else if (config.equip(map.id)) {
      $('shop-status').textContent = '';
    }
    render();
  });
  window.addEventListener('mundo-shop-change', render);
  render();
}
