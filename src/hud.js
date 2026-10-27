// DOM 기반 HUD (하단 스킬바, 상단 체력, 채팅, 결과 화면)
import { RULES } from './rules.js';
import { track, createTrackingId } from './analytics.js';
import { DIFFICULTY_NAMES, shareContent } from './share.js';
import { setHumiliateAvailable } from './humiliate.js';

const $ = (id) => document.getElementById(id);
let shareData;
let shareProperties;
let resultVersion = 0;
let flashReplyTimer;

$('flash-swap-btn').addEventListener('click', () => {
  clearTimeout(flashReplyTimer);
  $('flash-swap-status').textContent = 'F는 Fail의 F다.';
  $('flash-prank').classList.add('revealed');
  flashReplyTimer = setTimeout(() => {
    $('flash-prank').classList.remove('revealed');
    $('flash-swap-status').textContent = '';
  }, 1500);
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
  try {
    if (navigator.share && matchMedia('(pointer: coarse)').matches) {
      try {
        await navigator.share(data);
        track('share_completed', { ...properties, method: 'native' });
        return;
      } catch (error) {
        if (error.name === 'AbortError') {
          track('share_cancelled', { ...properties, method: 'native' });
          return;
        }
        if (!isCurrent()) return;
      }
    }
    try {
      await navigator.clipboard.writeText(`${data.text}\n${data.url}`);
      track('share_completed', { ...properties, method: 'clipboard' });
      if (isCurrent()) {
        $('share-status').textContent = properties.result === 'win'
          ? '결과와 링크를 복사했어요! 친구에게 보내 자랑해보세요.'
          : '결과와 링크를 복사했어요! 친구에게 도움을 요청하세요.';
      }
    } catch {
      track('share_failed', { ...properties, method: 'clipboard' });
      if (isCurrent()) $('share-status').textContent = '복사하지 못했어요. 브라우저의 클립보드 권한을 확인하고 다시 눌러 주세요.';
    }
  } finally {
    if (version === resultVersion) $('share-btn').disabled = false;
  }
});

export const HUD = {
  // online: { mySlot, bot } 이면 대인전 이름표 (왼쪽 0번이 방장, bot 이면 상대는 문도봇)
  show(on, twins = false, online = null) {
    for (const id of ['topbar', 'hud', 'joy-zone']) $(id).classList.toggle('hidden', !on);
    $('topbar').classList.toggle('twins', twins);
    if (online) {
      const mine = (slot) => slot === online.mySlot;
      const other = online.bot ? ['문도봇', 'BOT'] : ['상대방', 'FRIEND'];
      $('player-name').textContent = mine(0) ? '나' : other[0];
      $('player-tag').textContent = mine(0) ? 'YOU' : other[1];
      $('enemy-name').textContent = mine(1) ? '나' : other[0];
      $('enemy-tag').textContent = mine(1) ? 'YOU' : other[1];
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
  _bannerTimer: null,
  banner(text, { state = 'waiting', detail = '곧 돌아올 거예요. 잠시만 기다려 주세요.', seconds = null } = {}) {
    clearTimeout(this._bannerTimer);
    const el = $('net-banner');
    el.classList.toggle('hidden', !text);
    if (!text) return;
    el.dataset.state = state;
    $('net-title').textContent = text;
    $('net-detail').textContent = detail;
    $('net-detail').classList.toggle('hidden', !detail);
    $('net-wait').classList.toggle('hidden', state === 'back');
    $('net-seconds').textContent = seconds === null ? '' : `${seconds}초`;
    if (state === 'back') this._bannerTimer = setTimeout(() => this.banner(null), 1800);
  },

  // 대인전 결과: win | lose | left(상대가 나감)
  // bot: 상대가 문도봇 · quick: 빠른 대전 (굴욕·재대결 없이 새 상대 찾기)
  onlineResult(kind, { room, bot = false, quick = false } = {}) {
    resultVersion += 1;
    shareData = null;
    this.show(false);
    this.clearFeeds();
    this.banner(null);
    $('share-btn').classList.add('hidden');
    setHumiliateAvailable(kind === 'win' && !bot && !quick, { mode: 'online', room });
    // 빠른 대전과 문도봇 경기는 재대결 없이 새 상대 찾기만
    $('again-btn').classList.toggle('hidden', kind === 'left' || bot || quick);
    $('again-btn').disabled = false;
    $('again-btn').textContent = kind === 'win' ? '다시 한 수 가르쳐주기' : '다시 한 수 배우기';
    $('requeue-btn').classList.toggle('hidden', !quick);
    $('requeue-btn').disabled = false;
    $('menu-btn').textContent = '뒤로가기';
    $('share-status').textContent = '';
    $('result').dataset.outcome = kind === 'win' ? 'win' : 'lose';
    $('result').dataset.art = { win: 'custom-win', lose: 'custom-loss', left: 'portrait' }[kind];
    $('result-title').textContent = { win: '승리!', lose: '패배', left: '상대가 나갔어요' }[kind];
    $('result-subtitle').textContent = { win: '실력으로 증명하셨습니다.', lose: '실력이 들통났습니다..' }[kind] || '';
    $('result-subtitle').classList.toggle('hidden', kind === 'left');
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
    setHumiliateAvailable(false);
    $('requeue-btn').classList.add('hidden');
    $('again-btn').classList.remove('hidden');
    $('again-btn').disabled = false;
    $('again-btn').textContent = '다시 하기';
    $('menu-btn').textContent = '뒤로가기';
    $('share-status').textContent = '';
    this.show(false);
    this.clearFeeds();
    $('result').dataset.outcome = win ? 'win' : 'lose';
    $('result').dataset.art = 'portrait';
    $('result-subtitle').textContent = '';
    $('result-subtitle').classList.add('hidden');
    $('result-title').textContent = `${names[difficulty]} 난이도 ${win ? '클리어!' : '실패'}`;
    $('result').classList.remove('hidden');
  },
};
