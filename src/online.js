// 친구와 대결: 서버 연결, 재접속, 서버 시계 맞추기, 대기실 화면.
// 경기 화면 처리는 main.js 가 Online.hooks 로 받는다.
import { NET, isRoomCode } from './net-protocol.js';
import { track } from './analytics.js';

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

// ?server= 로 테스트 서버 지정, 로컬 개발은 localhost:3000
export function serverUrl() {
  const q = new URLSearchParams(location.search).get('server');
  if (q && /^wss?:\/\//.test(q)) return q;
  if (['localhost', '127.0.0.1'].includes(location.hostname)) return `ws://${location.hostname}:3000/ws`;
  return DEFAULT_SERVER;
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
  if (server) url.searchParams.set('server', server);
  return url.href;
}

const ERRORS = {
  notFound: '방을 찾을 수 없어요. 링크를 다시 확인해 주세요.',
  full: '이미 두 명이 들어간 방이에요.',
  started: '이미 경기가 진행 중인 방이에요.',
  busy: '서버가 붐벼요. 잠시 후 다시 시도해 주세요.',
  offline: '게임 서버에 연결할 수 없어요. 잠시 후 다시 시도해 주세요.',
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
  reconnectUntil: 0,
  pingTimer: null,

  // ---------- 연결 ----------
  connect() {
    return new Promise((resolve, reject) => {
      let ws;
      try { ws = new WebSocket(serverUrl()); } catch (error) { reject(error); return; }
      const timer = setTimeout(() => { ws.close(); reject(new Error('timeout')); }, CONNECT_TIMEOUT_MS);
      ws.onopen = () => {
        clearTimeout(timer);
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
        this.send({ type: 'join', room: this.room, token: this.token });
      } catch {
        if (!this.ws) this.onClose();
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
    this.closeSocket();
    Object.assign(this, { room: null, slot: -1, token: null, players: [null, null], intent: null, reconnectUntil: 0 });
  },

  // ---------- 방 ----------
  async create() {
    this.reset();
    this.intent = 'create';
    this.showLobby('방을 만드는 중…');
    try {
      await this.connect();
      this.send({ type: 'create' });
    } catch {
      this.lobbyError(ERRORS.offline);
    }
  },

  async join(code) {
    this.reset();
    this.intent = 'join';
    this.showLobby('방에 들어가는 중…', code);
    try {
      await this.connect();
      this.send({ type: 'join', room: code, token: storage.get(TOKEN_KEY(code)) || undefined });
    } catch {
      this.lobbyError(ERRORS.offline);
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
        const reconnected = !!this.reconnectUntil;
        Object.assign(this, { room: msg.room, slot: msg.slot, token: msg.token, reconnectUntil: 0 });
        storage.set(TOKEN_KEY(msg.room), msg.token);
        setUrlRoom(msg.room);
        if (this.intent === 'create') track('online_room_created', { room: msg.room });
        else if (this.intent === 'join') track('online_room_joined', { room: msg.room, slot: msg.slot });
        this.intent = null;
        if (reconnected) h.onReconnected?.();
        if (msg.phase === 'lobby') { h.onLobby?.(); this.showLobby(); }
        else { this.hideLobby(); h.onResume?.(msg); }
        return;
      }
      case 'lobby':
        this.players = msg.players;
        this.renderLobby();
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
  showLobby(status, code = this.room) {
    $('lobby').classList.remove('hidden');
    $('lobby').dataset.state = this.room ? 'room' : 'connecting';
    $('lobby-code').textContent = code || '------';
    $('lobby-link').value = code ? inviteUrl(code) : '';
    $('lobby-copy-status').textContent = '';
    $('lobby-leave').textContent = '나가기';
    if (status) $('lobby-status').textContent = status;
    this.renderLobby();
  },

  hideLobby() {
    $('lobby').classList.add('hidden');
  },

  lobbyError(text) {
    $('lobby').classList.remove('hidden');
    $('lobby').dataset.state = 'error';
    $('lobby-status').textContent = text;
    $('lobby-leave').textContent = '메뉴로';
  },

  renderLobby() {
    if (!this.room) return;
    $('lobby').dataset.state = 'room';
    const me = this.players[this.slot], other = this.players[1 - this.slot];
    this.players.forEach((p, i) => {
      const el = $(`lobby-p${i}`);
      const state = !p ? 'empty' : !p.connected ? 'away' : p.ready ? 'ready' : 'joined';
      el.dataset.state = state;
      el.querySelector('.lobby-role').textContent = `${i === 0 ? '방장' : '친구'}${i === this.slot ? ' (나)' : ''}`;
      el.querySelector('.lobby-player-status').textContent = {
        empty: '기다리는 중…', away: '연결 끊김', ready: '준비 완료!', joined: '준비 중',
      }[state];
    });
    $('lobby-ready').textContent = me?.ready ? '준비 취소' : '준비';
    $('lobby-ready').classList.toggle('on', !!me?.ready);
    $('lobby-status').textContent = !other ? '친구에게 초대 링크를 보내주세요.'
      : !other.connected ? '친구 연결이 끊겼어요. 다시 들어오길 기다리는 중…'
        : me?.ready && other.ready ? '곧 시작합니다!'
          : me?.ready ? '친구가 준비하길 기다리는 중…'
            : '준비되면 버튼을 눌러주세요.';
  },

  async shareInvite() {
    const url = $('lobby-link').value;
    if (!url) return;
    const data = { title: '문도 피구 1대1', text: '[문도 피구] 식칼 피구 한 판 붙자! 링크 눌러서 들어와.', url };
    if (navigator.share && matchMedia('(pointer: coarse)').matches) {
      try { await navigator.share(data); return; } catch (error) { if (error.name === 'AbortError') return; }
    }
    try {
      await navigator.clipboard.writeText(`${data.text}\n${url}`);
      $('lobby-copy-status').textContent = '초대 메시지 복사 완료! 친구에게 보내주세요.';
    } catch {
      $('lobby-link').focus();
      $('lobby-link').select();
      $('lobby-copy-status').textContent = '링크를 복사해서 친구에게 보내주세요.';
    }
    track('online_invite_shared', { room: this.room });
  },
};

$('lobby-ready').addEventListener('click', () => Online.toggleReady());
$('lobby-copy').addEventListener('click', () => Online.shareInvite());
$('lobby-leave').addEventListener('click', () => {
  Online.leave();
  Online.hooks.onExit?.();
});
