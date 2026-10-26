// 친구와 대결·빠른 대전: 서버 연결, 재접속, 서버 시계 맞추기, 대기실 화면.
// 경기 화면 처리는 main.js 가 Online.hooks 로 받는다.
import { NET, isRoomCode } from './net-protocol.js';
import { track } from './analytics.js';
import { getShopState } from './shop-state.js';

const $ = (id) => document.getElementById(id);
const DEFAULT_SERVER = 'wss://3.37.101.179/ws';
const TOKEN_KEY = (code) => `mundo-room:${code}`;
const CONNECT_TIMEOUT_MS = 6000;
const RETRY_MS = 1500;

const storage = {
  get(key) { try { return sessionStorage.getItem(key); } catch { return null; } },
  set(key, value) { try { sessionStorage.setItem(key, value); } catch { /* 새로고침 재접속만 안 될 뿐 */ } },
  remove(key) { try { sessionStorage.removeItem(key); } catch { /* 무시 */ } },
};

// 로컬 개발 페이지에서만 ?server= 로 다른 서버를 지정할 수 있다.
// 배포 페이지는 항상 공식 서버를 쓴다 (남이 만든 링크로 친구를 엉뚱한 서버에 붙이지 못하게).
const LOCAL_PAGE = ['localhost', '127.0.0.1'].includes(location.hostname);
export function serverUrl() {
  if (!LOCAL_PAGE) return DEFAULT_SERVER;
  const q = new URLSearchParams(location.search).get('server');
  if (q && /^wss?:\/\//.test(q)) return q;
  return `ws://${location.hostname}:3000/ws`;
}

export function roomFromUrl() {
  const code = (new URLSearchParams(location.search).get('room') || '').toUpperCase();
  return isRoomCode(code) ? code : null;
}

function setUrlRoom(code) {
  const url = new URL(location.href);
  if (code) url.searchParams.set('room', code);
  else url.searchParams.delete('room');
  history.replaceState(null, '', url);
}

function inviteUrl(code) {
  const url = new URL(location.pathname, location.origin);
  url.searchParams.set('room', code);
  const server = new URLSearchParams(location.search).get('server');
  if (server && LOCAL_PAGE) url.searchParams.set('server', server);
  return url.href;
}

const ERRORS = {
  notFound: '방을 찾을 수 없어요',
  full: '이미 정원이 찬 방이에요',
  started: '이미 경기가 진행 중이에요',
  busy: '서버가 혼잡해요',
  offline: '게임 서버에 연결할 수 없어요',
};

export const Online = {
  hooks: {},
  ws: null,
  room: null,
  slot: -1,
  token: null,
  players: [null, null],
  rtt: 120,
  offset: null,
  intent: null,
  gen: 0,
  reconnectUntil: 0,
  pingTimer: null,
  createStatusTimer: null,
  snackbarTimer: null,
  isQuick: false,      // 빠른 대전 방
  opponentBot: false,  // 상대가 문도봇
  queueStart: 0,
  queueEnd: 0,
  queueTimer: null,

  // ---------- 연결 ----------
  connect() {
    const gen = this.gen;
    return new Promise((resolve, reject) => {
      let ws;
      try { ws = new WebSocket(serverUrl()); } catch (error) { reject(error); return; }
      const timer = setTimeout(() => { ws.close(); reject(new Error('timeout')); }, CONNECT_TIMEOUT_MS);
      ws.onopen = () => {
        clearTimeout(timer);
        // 연결되는 사이 취소·다른 모드로 바뀌었으면 이 연결은 버린다
        if (gen !== this.gen) { ws.close(); reject(new Error('stale')); return; }
        this.ws = ws;
        this.ping();
        clearInterval(this.pingTimer);
        this.pingTimer = setInterval(() => this.ping(), 2000);
        resolve();
      };
      ws.onerror = () => { clearTimeout(timer); reject(new Error('connect failed')); };
      ws.onmessage = (event) => {
        let msg;
        try { msg = JSON.parse(event.data); } catch { return; }
        if (ws === this.ws) this.handle(msg);
      };
      ws.onclose = () => {
        clearTimeout(timer);
        if (ws === this.ws) this.onClose();
      };
    });
  },

  // 상대 화면에 보일 내 외형
  look() {
    const shop = getShopState();
    return { skin: shop.equippedSkin, weapon: shop.equippedWeapon };
  },

  send(msg) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  },

  ping() {
    this.send({ type: 'ping', c: performance.now() });
  },

  serverNow() {
    return performance.now() + (this.offset ?? 0);
  },

  closeSocket() {
    clearInterval(this.pingTimer);
    const ws = this.ws;
    this.ws = null;
    ws?.close();
  },

  // 내 연결이 끊김: 같은 토큰으로 15초 동안 다시 들어가 본다
  onClose() {
    clearInterval(this.pingTimer);
    this.ws = null;
    if (!this.room || !this.token) {
      if (!$('lobby').classList.contains('hidden')) this.lobbyError(ERRORS.offline);
      return;
    }
    if (!this.reconnectUntil) {
      this.reconnectUntil = performance.now() + NET.GRACE_MS;
      this.hooks.onReconnecting?.();
    }
    if (performance.now() > this.reconnectUntil) { this.giveUp(); return; }
    setTimeout(async () => {
      if (!this.room) return;
      try {
        await this.connect();
        this.send({ type: 'join', room: this.room, token: this.token, look: this.look() });
      } catch (error) {
        if (error.message !== 'stale' && !this.ws) this.onClose();
      }
    }, RETRY_MS);
  },

  giveUp() {
    const room = this.room;
    this.reset();
    if (room) storage.remove(TOKEN_KEY(room));
    setUrlRoom(null);
    this.hideLobby();
    this.hooks.onLost?.();
  },

  reset() {
    this.gen++;
    clearTimeout(this.createStatusTimer);
    clearInterval(this.queueTimer);
    this.closeSocket();
    Object.assign(this, {
      room: null, slot: -1, token: null, players: [null, null], intent: null, reconnectUntil: 0,
      isQuick: false, opponentBot: false, queueStart: 0, queueEnd: 0,
    });
  },

  // ---------- 방 ----------
  openLobby() {
    this.reset();
    this.showLobby('');
    $('lobby').dataset.state = 'entry';
    $('lobby-leave').textContent = '뒤로가기';
    $('lobby-join-code').value = '';
    $('lobby-join-code').removeAttribute('aria-invalid');
    $('lobby-join-status').textContent = '';
  },

  async create() {
    this.reset();
    this.intent = 'create';
    // 방이 만들어질 때까지 입장 화면을 그대로 두어 레이아웃이 흔들리지 않게 한다
    $('lobby').dataset.state = 'creating';
    this.setEntryBusy(true);
    this.createStatusTimer = setTimeout(() => {
      $('lobby-create').textContent = '방을 생성하는 중';
    }, 1000);
    try {
      await this.connect();
      this.send({ type: 'create', look: this.look() });
    } catch (error) {
      if (error.message !== 'stale') this.lobbyError(ERRORS.offline);
    }
  },

  async join(code) {
    this.reset();
    this.intent = 'join';
    this.showLobby('방에 들어가는 중…', code);
    try {
      await this.connect();
      this.send({ type: 'join', room: code, token: storage.get(TOKEN_KEY(code)) || undefined, look: this.look() });
    } catch (error) {
      if (error.message !== 'stale') this.lobbyError(ERRORS.offline);
    }
  },

  // 빠른 대전: 기다리는 사람이 있으면 바로, 없으면 서버가 정한 시간 뒤 문도봇과 붙는다
  async quick() {
    this.reset();
    this.intent = 'quick';
    this.isQuick = true;
    this.queueStart = performance.now();
    this.showQueue();
    try {
      await this.connect();
      this.send({ type: 'quick', look: this.look() });
      track('quick_queue_started');
    } catch (error) {
      if (error.message !== 'stale') this.lobbyError(ERRORS.offline);
    }
  },

  toggleReady() {
    const me = this.players[this.slot];
    this.send({ type: 'ready', ready: !me?.ready });
  },

  rematch() {
    this.send({ type: 'rematch' });
  },

  leave() {
    if (this.room) storage.remove(TOKEN_KEY(this.room));
    this.send({ type: 'leave' });
    this.reset();
    setUrlRoom(null);
    this.hideLobby();
  },

  // ---------- 서버 메시지 ----------
  handle(msg) {
    const h = this.hooks;
    switch (msg.type) {
      case 'pong': return this.onPong(msg);
      case 'joined': {
        clearTimeout(this.createStatusTimer);
        const reconnected = !!this.reconnectUntil;
        Object.assign(this, {
          room: msg.room, slot: msg.slot, token: msg.token, reconnectUntil: 0,
          isQuick: !!msg.quick, opponentBot: !!msg.bot,
        });
        storage.set(TOKEN_KEY(msg.room), msg.token);
        setUrlRoom(msg.room);
        if (this.intent === 'create') track('online_room_created', { room: msg.room });
        else if (this.intent === 'join') track('online_room_joined', { room: msg.room, slot: msg.slot });
        this.intent = null;
        if (reconnected) h.onReconnected?.();
        if (msg.phase === 'lobby') { h.onLobby?.(); if (this.isQuick) this.showQueue(); else this.showLobby(); }
        else { this.hideLobby(); h.onResume?.(msg); }
        return;
      }
      case 'lobby':
        this.players = msg.players;
        if (!this.isQuick) this.renderLobby();
        return;
      case 'queue':
        this.queueEnd = performance.now() + msg.waitMs;
        clearInterval(this.queueTimer);
        this.queueTimer = setInterval(() => this.renderQueue(), 250);
        this.renderQueue();
        return;
      case 'matched':
        clearInterval(this.queueTimer);
        this.opponentBot = !!msg.bot;
        track('quick_matched', { room: this.room, opponent: msg.bot ? 'bot' : 'human', wait_ms: Math.round(performance.now() - this.queueStart) });
        return;
      case 'start':
        this.hideLobby();
        h.onStart?.(msg);
        return;
      case 'snap':
        if (this.offset == null) this.offset = msg.t - performance.now();
        h.onSnap?.(msg);
        return;
      case 'go': return h.onGo?.(msg);
      case 'ev': return h.onEvents?.(msg.list);
      case 'roundEnd': return h.onRoundEnd?.(msg.winner);
      case 'over': return h.onOver?.(msg.winner);
      case 'rematch': return h.onRematch?.(msg.want);
      case 'opponentAway': return h.onAway?.(msg.graceMs);
      case 'opponentBack': return h.onBack?.();
      case 'opponentLeft':
        if (this.room) storage.remove(TOKEN_KEY(this.room));
        return h.onOpponentLeft?.(msg.reason);
      case 'error':
        if (this.reconnectUntil) { this.giveUp(); return; }
        if (this.room == null) {
          this.closeSocket();
          setUrlRoom(null);
        }
        this.lobbyError(ERRORS[msg.code] || ERRORS.offline);
    }
  },

  // 왕복 시간이 짧았던 측정일수록 서버 시계 추정이 정확하다
  onPong(msg) {
    const now = performance.now();
    const rtt = now - msg.c;
    const sample = msg.t + rtt / 2 - now;
    if (this.offset == null || rtt <= this.rtt * 1.2) {
      this.offset = this.offset == null ? sample : this.offset + (sample - this.offset) * 0.25;
    }
    this.rtt = this.rtt * 0.8 + rtt * 0.2;
  },

  // ---------- 대기실 화면 ----------
  setEntryBusy(busy) {
    $('lobby-create').disabled = busy;
    $('lobby-join').disabled = busy;
    if (!busy) $('lobby-create').textContent = '방 만들기';
  },

  showQueue() {
    $('lobby').classList.remove('hidden');
    $('lobby').dataset.state = 'queue';
    $('lobby-title').textContent = '빠른 대전';
    $('lobby').querySelector('.lobby-brand-image').src = 'assets/cartoon/mundo-quick-match-v2.png';
    $('lobby-leave').textContent = '취소';
    this.renderQueue();
  },

  // 큰 줄: 지금 하는 일 · 작은 줄: 문도봇까지 남은 시간
  renderQueue() {
    const left = this.queueEnd ? Math.ceil((this.queueEnd - performance.now()) / 1000) : null;
    const main = document.createElement('span');
    main.className = 'queue-main';
    // 점은 . → .. → ... 를 반복한다. 남은 점은 숨겨 두어 늘 '...' 폭으로 가운데 정렬한다
    const n = Math.floor((performance.now() - this.queueStart) / 500) % 3 + 1;
    const rest = document.createElement('span');
    rest.className = 'queue-dots-rest';
    rest.textContent = '.'.repeat(3 - n);
    main.append(left == null || left > 0 ? '상대를 찾는 중' : '문도봇을 부르는 중', '.'.repeat(n), rest);
    const lines = [main];
    if (left > 0) {
      const sub = document.createElement('span');
      sub.className = 'queue-sub';
      const sec = document.createElement('b');
      sec.textContent = `${left}초`;
      sub.append(sec, ' 뒤에는 문도봇과 붙어요');
      const note = document.createElement('span');
      note.className = 'queue-note';
      note.textContent = '문도봇은 다른 플레이어의 플레이 습관을 따라 해요';
      lines.push(sub, note);
    }
    $('lobby-status').replaceChildren(...lines);
  },

  showLobby(status, code = this.room) {
    this.setEntryBusy(false);
    $('lobby').classList.remove('hidden');
    $('lobby-title').textContent = '친구와 1대1';
    $('lobby').querySelector('.lobby-brand-image').src = 'assets/cartoon/mundo-friends-v4.png';
    $('lobby').dataset.state = this.room ? 'room' : 'connecting';
    $('lobby-code').textContent = code || '------';
    $('lobby-link').value = code ? inviteUrl(code) : '';
    $('lobby-link').classList.add('hidden');
    $('lobby-leave').textContent = '뒤로가기';
    if (status !== undefined) $('lobby-status').textContent = status;
    this.renderLobby();
  },

  hideLobby() {
    clearTimeout(this.createStatusTimer);
    clearInterval(this.queueTimer);
    clearTimeout(this.snackbarTimer);
    $('copy-snackbar').classList.remove('visible');
    $('copy-snackbar').textContent = '';
    $('lobby').classList.add('hidden');
  },

  lobbyError(text) {
    clearTimeout(this.createStatusTimer);
    this.setEntryBusy(false);
    $('lobby').classList.remove('hidden');
    $('lobby').dataset.state = 'error';
    $('lobby-status').textContent = '';
    $('lobby-error-title').textContent = text;
    $('lobby-leave').textContent = '뒤로가기';
  },

  renderLobby() {
    if (!this.room) return;
    $('lobby').dataset.state = 'room';
    const me = this.players[this.slot], other = this.players[1 - this.slot];
    this.players.forEach((p, i) => {
      const el = $(`lobby-p${i}`);
      const state = !p ? 'empty' : !p.connected ? 'away' : p.ready ? 'ready' : 'joined';
      el.dataset.state = state;
      el.querySelector('.lobby-role').textContent = `${i === 0 ? '방장' : '상대방'}${i === this.slot ? ' (나)' : ''}`;
      el.querySelector('.lobby-player-status').textContent = {
        empty: '기다리는 중', away: '연결 끊김', ready: '준비 완료', joined: '준비 중',
      }[state];
    });
    $('lobby-ready').textContent = me?.ready ? '준비 취소' : '준비';
    $('lobby-ready').classList.toggle('on', !!me?.ready);
    $('lobby-status').textContent = !other ? ''
      : !other.connected ? '상대방 연결이 끊겼어요. 다시 들어오길 기다리는 중…'
        : me?.ready && other.ready ? '곧 시작합니다!'
          : me?.ready ? '상대방을 기다리는 중'
            : '준비되면 버튼을 눌러주세요.';
  },

  async shareInvite() {
    const url = $('lobby-link').value;
    if (!url) return;
    const data = { title: '문도 피구 1대1 초대', text: '[문도 피구] 1대1 게임에 초대합니다.', url };
    if (navigator.share && matchMedia('(pointer: coarse)').matches) {
      try { await navigator.share(data); return; } catch (error) { if (error.name === 'AbortError') return; }
    }
    try {
      await navigator.clipboard.writeText(`${data.text}\n${url}`);
      clearTimeout(this.snackbarTimer);
      $('copy-snackbar').textContent = '초대 링크 복사 완료';
      $('copy-snackbar').classList.add('visible');
      this.snackbarTimer = setTimeout(() => {
        $('copy-snackbar').classList.remove('visible');
        $('copy-snackbar').textContent = '';
      }, 2000);
    } catch {
      $('lobby-link').classList.remove('hidden');
      $('lobby-link').focus();
      $('lobby-link').select();
    }
    track('online_invite_shared', { room: this.room });
  },
};

$('lobby-ready').addEventListener('click', () => Online.toggleReady());
$('lobby-create').addEventListener('click', () => Online.create());
$('lobby-join-code').addEventListener('input', () => {
  $('lobby-join-code').value = $('lobby-join-code').value.toUpperCase();
  $('lobby-join-code').removeAttribute('aria-invalid');
  $('lobby-join-status').textContent = '';
});
$('lobby-join-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const code = $('lobby-join-code').value.trim().toUpperCase();
  if (!isRoomCode(code)) {
    $('lobby-join-code').setAttribute('aria-invalid', 'true');
    $('lobby-join-status').textContent = '올바른 6자리 방 코드를 입력하세요.';
    $('lobby-join-code').focus();
    return;
  }
  Online.join(code);
});
$('lobby-copy').addEventListener('click', () => Online.shareInvite());
$('lobby-leave').addEventListener('click', () => {
  // 에러 화면에서는 방 만들기/입장 화면으로 돌아가 다시 시도할 수 있게 한다
  if ($('lobby').dataset.state === 'error') {
    if (Online.isQuick) { Online.leave(); Online.hooks.onExit?.(); }
    else Online.openLobby();
    return;
  }
  if ($('lobby').dataset.state === 'queue') track('quick_cancelled', { wait_ms: Math.round(performance.now() - Online.queueStart) });
  Online.leave();
  Online.hooks.onExit?.();
});
