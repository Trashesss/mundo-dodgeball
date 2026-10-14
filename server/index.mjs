// 문도 피구 온라인 1대1 서버. nginx 가 wss://<host>/ws 를 127.0.0.1:PORT/ws 로 넘긴다.
import http from 'node:http';
import { randomInt } from 'node:crypto';
import { WebSocketServer } from 'ws';
import { NET, isRoomCode } from '../src/net-protocol.js';
import { Room } from './room.mjs';

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '127.0.0.1';
const MAX_ROOMS = 500;
const IDLE_MS = 10 * 60 * 1000;
const MAX_MSGS_PER_SEC = 120;
const MAX_CONNS_PER_IP = 8;     // 한 사람이 방을 잔뜩 만들어 서버를 채우지 못하게
const MAX_FAILED_JOINS = 10;    // 방 코드 무작위 대입 방지 (연결당)
const ORIGINS = [
  /^https:\/\/trashesss\.github\.io$/,
  /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/,
  ...(process.env.EXTRA_ORIGINS || '').split(',').filter(Boolean).map(o => new RegExp(`^${o.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`)),
];

const rooms = new Map();
const connsByIp = new Map();

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
    res.end(JSON.stringify({ ok: true, rooms: rooms.size }));
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
  let room = null;
  let slot = -1;
  let count = 0;
  let windowStart = Date.now();
  const send = (msg) => ws.readyState === 1 && ws.send(JSON.stringify(msg));
  const detach = () => {
    if (room && slot >= 0) room.leave(slot, 'left');
    room = null; slot = -1;
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
      room = new Room(newCode(), { onEmpty: (r) => rooms.delete(r.code) });
      rooms.set(room.code, room);
      slot = room.add(ws);
      return;
    }
    if (msg.type === 'join') {
      const target = isRoomCode(msg.room) ? rooms.get(msg.room) : null;
      if (!target) {
        send({ type: 'error', code: 'notFound' });
        if (++failedJoins >= MAX_FAILED_JOINS) ws.close(4029, 'too many failed joins');
        return;
      }
      if (target === room && slot >= 0) return;
      detach();
      let s = typeof msg.token === 'string' ? target.rejoin(ws, msg.token) : -1;
      if (s < 0) s = target.add(ws);
      if (s < 0) { send({ type: 'error', code: target.phase === 'lobby' ? 'full' : 'started' }); return; }
      room = target; slot = s;
      return;
    }
    if (msg.type === 'ping' && !room) {
      if (Number.isFinite(msg.c)) send({ type: 'pong', c: msg.c, t: Math.round(performance.now()) });
      return;
    }
    if (room && slot >= 0) {
      if (msg.type === 'leave') { detach(); return; }
      room.handle(slot, msg);
    }
  });

  ws.on('close', () => {
    const left = (connsByIp.get(ip) || 1) - 1;
    if (left > 0) connsByIp.set(ip, left); else connsByIp.delete(ip);
    if (room && slot >= 0) room.disconnect(slot, ws);
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
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 2000).unref();
  });
}
