// DOM 기반 HUD (하단 스킬바, 상단 체력, 채팅, 결과 화면)
import { RULES } from './rules.js';
import { track, createTrackingId } from './analytics.js';
import { DIFFICULTY_NAMES, shareContent } from './share.js';

const $ = (id) => document.getElementById(id);
let shareData;
let shareProperties;
let resultVersion = 0;

$('flash-swap-btn').addEventListener('click', () => {
  const button = $('flash-swap-btn');
  button.disabled = true;
  $('flash-prank').classList.remove('revealed');
  button.textContent = '점멸을 F로 바꾸는 중…';
  $('flash-swap-status').textContent = '';
  setTimeout(() => {
    button.textContent = '점멸을 F로 바꾸기';
    button.disabled = false;
    $('flash-swap-status').textContent = 'F는 Fail의 F다.';
    $('flash-prank').classList.add('revealed');
  }, 900);
});

$('share-btn').addEventListener('click', async () => {
  if (!shareData) return;
  const version = resultVersion;
  const shareId = createTrackingId();
  const url = new URL(shareData.url);
  url.searchParams.set('share_id', shareId);
  url.searchParams.set('utm_source', 'friend');
  url.searchParams.set('utm_medium', 'share');
  const data = { ...shareData, url: url.href };
  const properties = { ...shareProperties, share_id: shareId };
  track('share_clicked', properties);
  const isCurrent = () => version === resultVersion && !$('result').classList.contains('hidden');
  $('share-btn').disabled = true;
  $('share-status').textContent = '';
  $('share-copy').classList.add('hidden');
  try {
    if (navigator.share) {
      try {
        await navigator.share(data);
        track('share_completed', { ...properties, method: 'native' });
        if (isCurrent()) $('share-status').textContent = '문도, 친구 기다린다!';
        return;
      } catch (error) {
        if (error.name === 'AbortError') {
          track('share_cancelled', { ...properties, method: 'native' });
          return;
        }
        if (!isCurrent()) return;
      }
    }
    const invitation = `${data.text}\n${data.url}`;
    try {
      await navigator.clipboard.writeText(invitation);
      track('share_completed', { ...properties, method: 'clipboard' });
      if (isCurrent()) $('share-status').textContent = '메시지 복사 완료! 친구 채팅방에 던져줘. 🪓';
    } catch {
      if (!isCurrent()) return;
      $('share-status').textContent = '아래 메시지를 복사해서 친구에게 보내줘!';
      $('share-copy').value = invitation;
      $('share-copy').classList.remove('hidden');
      $('share-copy').focus();
      $('share-copy').select();
      track('share_manual_copy_shown', { ...properties, method: 'manual' });
    }
  } finally {
    if (version === resultVersion) $('share-btn').disabled = false;
  }
});

export const HUD = {
  // online: { mySlot } 이면 대인전 이름표 (왼쪽 0번이 방장)
  show(on, twins = false, online = null) {
    for (const id of ['topbar', 'hud']) $(id).classList.toggle('hidden', !on);
    $('topbar').classList.toggle('twins', twins);
    if (online) {
      const mine = (slot) => slot === online.mySlot;
      $('player-name').textContent = mine(0) ? '나' : '친구';
      $('player-tag').textContent = mine(0) ? 'YOU' : 'FRIEND';
      $('enemy-name').textContent = mine(1) ? '나' : '친구';
      $('enemy-tag').textContent = mine(1) ? 'YOU' : 'FRIEND';
    } else {
      $('player-name').textContent = '문도 박사';
      $('player-tag').textContent = 'PLAYER 1';
      $('enemy-name').textContent = twins ? '쌍둥이 문도' : '문도 박사';
      $('enemy-tag').textContent = 'CPU';
    }
  },

  // 대인전 시작 카운트다운. ms=0 이면 숨김, go=true 면 '시작!'을 잠깐 보여준다.
  _cdTimer: null,
  countdown(ms, go = false) {
    const el = $('online-countdown');
    clearInterval(this._cdTimer);
    const show = (text) => {
      el.textContent = text;
      el.classList.remove('hidden', 'pop');
      void el.offsetWidth;
      el.classList.add('pop');
    };
    if (go) {
      show('시작!');
      this._cdTimer = setTimeout(() => el.classList.add('hidden'), 700);
      return;
    }
    if (ms <= 0) { el.classList.add('hidden'); return; }
    const end = performance.now() + ms;
    let shown = Math.ceil(ms / 1000);
    show(shown);
    this._cdTimer = setInterval(() => {
      const left = Math.ceil((end - performance.now()) / 1000);
      if (left !== shown && left > 0) show((shown = left));
    }, 50);
  },

  // 연결 상태 안내 (null 이면 숨김)
  banner(text) {
    $('net-banner').textContent = text || '';
    $('net-banner').classList.toggle('hidden', !text);
  },

  // 대인전 결과: win | lose | left(상대가 나감)
  onlineResult(kind) {
    resultVersion += 1;
    shareData = null;
    this.show(false);
    this.clearFeeds();
    this.banner(null);
    $('share-btn').classList.add('hidden');
    $('again-btn').classList.toggle('hidden', kind === 'left');
    $('again-btn').disabled = false;
    $('again-btn').textContent = '재대결';
    $('menu-btn').textContent = '메뉴로';
    $('share-copy').classList.add('hidden');
    $('share-status').textContent = kind === 'left' ? '친구 연결이 끊겨서 경기가 끝났어요.' : '';
    $('result').dataset.outcome = kind === 'win' ? 'win' : 'lose';
    $('result-title').textContent = { win: '친구를 이겼다!', lose: '친구에게 졌다…', left: '상대가 나갔어요' }[kind];
    $('result').classList.remove('hidden');
  },

  resultStatus(text) {
    $('share-status').textContent = text;
  },

  updateFight(champs, reset = false) {
    for (const c of champs) {
      const hp = Math.max(0, Math.min(RULES.maxHp, c.hp));
      const track = $(`health-${c.hudSlot}`);
      track.classList.toggle('reset', reset);
      track.style.setProperty('--health', hp / RULES.maxHp);
      track.setAttribute('aria-valuemax', RULES.maxHp);
      track.setAttribute('aria-valuenow', Math.ceil(hp));
      $(`hp-${c.hudSlot}`).textContent = `${Math.ceil(hp)} / ${RULES.maxHp}`;
      track.classList.toggle('knocked-out', !c.alive);
    }
    for (const team of [0, 1]) {
      const side = champs.filter(c => c.team === team);
      if (!side.length) continue;
      const hp = Math.max(...side.map(c => (c.alive ? c.hp : 0)));
      $(`fighter-${team}`).classList.toggle('low-health', hp > 0 && hp <= RULES.maxHp * 0.25);
      $(`fighter-${team}`).classList.toggle('knocked-out', side.every(c => !c.alive));
    }
  },

  _skill(id, cd, max, prevReady) {
    const el = $(id);
    const ready = cd <= 0;
    el.querySelector('.cd').style.setProperty('--p', ready ? 1 : 1 - cd / max);
    el.querySelector('.cdtext').textContent = ready ? '' : cd >= 1 ? Math.ceil(cd) : cd.toFixed(1);
    el.classList.toggle('ready', ready);
    if (ready && prevReady === false) {
      el.classList.remove('flash-ready'); void el.offsetWidth; el.classList.add('flash-ready');
    }
    return ready;
  },

  _prev: {},
  update(p) {
    this._prev.q = this._skill('sk-q', p.qCd, RULES.q.cd, this._prev.q);
    this._prev.d = this._skill('sk-d', p.flashCd, RULES.flash.cd, this._prev.d);
    this._prev.f = this._skill('sk-f', p.ghostCd, RULES.ghost.cd, this._prev.f);
    $('hud').classList.toggle('unavailable', !p.alive);
  },

  chat(text) {
    const el = document.createElement('div');
    el.className = 'line';
    el.innerHTML = `<span class="sys">${text}</span>`;
    const box = $('chat');
    box.append(el);
    while (box.children.length > 7) box.firstChild.remove();
    setTimeout(() => el.classList.add('fade'), 7000);
    setTimeout(() => el.remove(), 8000);
  },

  clearFeeds() {
    $('chat').innerHTML = '';
  },

  result(win, difficulty, matchProperties = {}) {
    const names = DIFFICULTY_NAMES;
    resultVersion += 1;
    shareProperties = { ...matchProperties, difficulty, result: win ? 'win' : 'loss' };
    const { title, text } = shareContent(difficulty, win);
    shareData = {
      title, text,
      url: new URL(`share/${difficulty}-${win ? 'win' : 'loss'}.html`, new URL(location.pathname, location.origin)).href,
    };
    $('share-btn').disabled = false;
    $('share-btn').classList.remove('hidden');
    $('share-btn').textContent = win ? '자랑하기' : '공유하기';
    $('again-btn').classList.remove('hidden');
    $('again-btn').disabled = false;
    $('again-btn').textContent = '다시 하기';
    $('menu-btn').textContent = '난이도 선택';
    $('share-status').textContent = '';
    $('share-copy').value = '';
    $('share-copy').classList.add('hidden');
    this.show(false);
    this.clearFeeds();
    $('result').dataset.outcome = win ? 'win' : 'lose';
    $('result-title').textContent = `${names[difficulty]} 난이도 ${win ? '클리어!' : '실패'}`;
    $('result').classList.remove('hidden');
  },
};
