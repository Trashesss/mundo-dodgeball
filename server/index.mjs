// 문도 피구 온라인 1대1 서버. nginx 가 wss://<host>/ws 를 127.0.0.1:PORT/ws 로 넘긴다.
import http from 'node:http';
import { randomInt } from 'node:crypto';
import { WebSocketServer } from 'ws';
import { NET, isRoomCode } from '../src/net-protocol.js';
import { Room } from './room.mjs';
import { GhostStore } from './ghosts.mjs';

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '127.0.0.1';
const MAX_ROOMS = 500;
const IDLE_MS = 10 * 60 * 1000;
const MAX_MSGS_PER_SEC = 120;
const MAX_CONNS_PER_IP = 8;     // 한 사람이 방을 잔뜩 만들어 서버를 채우지 못하게
const MAX_FAILED_JOINS = 10;    // 방 코드 무작위 대입 방지 (연결당)
// 빠른 대전: 이만큼 기다리면 '문도봇과 플레이'를 고를 수 있다. 기본은 바로 (검사용 서버만 바꿀 수 있음)
const QUICK_WAIT_MS = (process.env.MUNDO_TEST === '1' && Number(process.env.QUICK_WAIT_MS)) || 0;
// 배포 서버(NODE_ENV=production)는 게임 사이트만 허용한다. localhost 페이지는 로컬 개발 서버에서만 허용.
const PRODUCTION = process.env.NODE_ENV === 'production';
const ORIGINS = [
  /^https:\/\/trashesss\.github\.io$/,
  ...(PRODUCTION ? [] : [/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/]),
  ...(process.env.EXTRA_ORIGINS || '').split(',').filter(Boolean).map(o => new RegExp(`^${o.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`)),
];

const rooms = new Map();
const connsByIp = new Map();
const ghosts = new GhostStore();
const quickWaiting = []; // 한 사람이 상대를 기다리는 빠른 대전 방 (먼저 온 순)
const presence = new Set(); // 사이트를 열어 둔 탭마다 하나씩 있는 동접자 연결 (게임용 연결은 세지 않는다)
let presenceTimer = null;

// 들어오고 나갈 때마다 바로 보내면 사람이 몰릴 때 메시지가 폭증하므로 1초에 한 번만 알린다
function announcePresence() {
  if (presenceTimer) return;
  presenceTimer = setTimeout(() => {
    presenceTimer = null;
    const text = JSON.stringify({ type: 'online', count: presence.size });
    for (const ws of presence) if (ws.readyState === 1) ws.send(text);
  }, 1000);
}

function unqueue(room) {
  const i = quickWaiting.indexOf(room);
  if (i >= 0) quickWaiting.splice(i, 1);
}

// nginx 뒤에서는 접속 주소가 항상 127.0.0.1 이므로, 로컬 프록시가 붙인 X-Forwarded-For 의 마지막 값을 쓴다
function clientIp(req) {
  const remote = req.socket.remoteAddress || '';
  const local = remote === '127.0.0.1' || remote === '::1' || remote === '::ffff:127.0.0.1';
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',').map(s => s.trim()).filter(Boolean);
  return local && forwarded.length ? forwarded[forwarded.length - 1] : remote;
}

function newCode() {
  for (;;) {
    const code = Array.from({ length: NET.CODE_LEN }, () => NET.CODE_CHARS[randomInt(NET.CODE_CHARS.length)]).join('');
    if (!rooms.has(code)) return code;
  }
}

const server = http.createServer((req, res) => {
  // 서버 안에서만 확인용 (nginx 는 /ws 만 넘기므로 외부에 노출되지 않음)
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, rooms: rooms.size, online: presence.size, quickWaiting: quickWaiting.length, ghosts: ghosts.size }));
    return;
  }
  res.writeHead(404).end();
});

const wss = new WebSocketServer({
  server,
  path: '/ws',
  maxPayload: 4 * 1024,
  verifyClient: ({ origin }) => !origin || ORIGINS.some(re => re.test(origin)),
});

wss.on('connection', (ws, req) => {
  const ip = clientIp(req);
  const conns = (connsByIp.get(ip) || 0) + 1;
  if (conns > MAX_CONNS_PER_IP) { ws.close(4029, 'too many connections'); return; }
  connsByIp.set(ip, conns);
  let failedJoins = 0;
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  let count = 0;
  let windowStart = Date.now();
  const conn = { ws, room: null, slot: -1 };
  const send = (msg) => ws.readyState === 1 && ws.send(JSON.stringify(msg));
  const detach = () => {
    if (conn.room && conn.slot >= 0) conn.room.leave(conn.slot, 'left');
    conn.room = null; conn.slot = -1;
  };
  const openRoom = (opts = {}) => {
    const room = new Room(newCode(), {
      ...opts, ghosts, quickWaitMs: QUICK_WAIT_MS,
      onEmpty: (r) => { rooms.delete(r.code); unqueue(r); },
      onBot: (r) => { unqueue(r); r.addBot(ghosts.pick()); },
      // 준비 대기실에서 상대가 나감: 남은 사람은 다시 큐에 서고, 이미 기다린 만큼 봇 대기 시간이 줄어든다
      onRequeue: (r) => {
        if (!quickWaiting.includes(r)) quickWaiting.push(r);
        r.slots.forEach((s, i) => s && r.send(i, { type: 'queue', waitMs: Math.max(0, QUICK_WAIT_MS - (Date.now() - s.queuedAt)) }));
      },
    });
    rooms.set(room.code, room);
    return room;
  };

  ws.on('message', (data) => {
    const now = Date.now();
    if (now - windowStart > 1000) { windowStart = now; count = 0; }
    if (++count > MAX_MSGS_PER_SEC) { ws.close(4008, 'rate limit'); return; }
    let msg;
    try { msg = JSON.parse(data); } catch { return; }
    if (!msg || typeof msg.type !== 'string') return;

    if (msg.type === 'create') {
      detach();
      if (rooms.size >= MAX_ROOMS) { send({ type: 'error', code: 'busy' }); return; }
      conn.room = openRoom();
      conn.slot = conn.room.add(ws, msg.look);
      return;
    }
    if (msg.type === 'quick') {
      detach();
      const waiting = quickWaiting.find(r => r.slots.some(x => x?.connected) && r.slots.some(x => !x));
      if (waiting) {
        unqueue(waiting);
        conn.room = waiting;
        conn.slot = waiting.add(ws, msg.look);
        return;
      }
      if (rooms.size >= MAX_ROOMS) { send({ type: 'error', code: 'busy' }); return; }
      const room = openRoom({ quick: true });
      conn.room = room;
      conn.slot = room.add(ws, msg.look);
      quickWaiting.push(room);
      send({ type: 'queue', waitMs: QUICK_WAIT_MS });
      return;
    }
    if (msg.type === 'join') {
      const target = isRoomCode(msg.room) ? rooms.get(msg.room) : null;
      if (!target) {
        send({ type: 'error', code: 'notFound' });
        if (++failedJoins >= MAX_FAILED_JOINS) ws.close(4029, 'too many failed joins');
        return;
      }
      if (target === conn.room && conn.slot >= 0) return;
      detach();
      let s = typeof msg.token === 'string' ? target.rejoin(ws, msg.token, msg.look) : -1;
      if (s < 0) s = target.add(ws, msg.look);
      if (s < 0) { send({ type: 'error', code: target.phase === 'lobby' ? 'full' : 'started' }); return; }
      conn.room = target; conn.slot = s;
      if (target.phase !== 'lobby' || target.slots.every(Boolean)) unqueue(target);
      return;
    }
    if (msg.type === 'presence') {
      if (!presence.has(ws)) { presence.add(ws); send({ type: 'online', count: presence.size }); announcePresence(); }
      return;
    }
    if (msg.type === 'ping' && !conn.room) {
      if (Number.isFinite(msg.c)) send({ type: 'pong', c: msg.c, t: Math.round(performance.now()) });
      return;
    }
    if (conn.room && conn.slot >= 0) {
      if (msg.type === 'leave') { detach(); return; }
      conn.room.handle(conn.slot, msg);
    }
  });

  ws.on('close', () => {
    const left = (connsByIp.get(ip) || 1) - 1;
    if (left > 0) connsByIp.set(ip, left); else connsByIp.delete(ip);
    if (presence.delete(ws)) announcePresence();
    if (conn.room && conn.slot >= 0) conn.room.disconnect(conn.slot, ws);
  });
});

// 응답 없는 연결 정리 + 오래 방치된 방 삭제
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false;
    ws.ping();
  }
  const now = Date.now();
  for (const room of rooms.values()) if (now - room.lastActive > IDLE_MS) room.close();
}, 10000);

server.listen(PORT, HOST, () => console.log(`mundo-pigu server: ws://${HOST}:${PORT}/ws`));

for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => {
    for (const room of [...rooms.values()]) room.close();
    ghosts.save();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 2000).unref();
  });
}
