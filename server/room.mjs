// 1대1 방: 대기실 → 카운트다운 → 경기 → 결과/재대결. 서버가 src/sim.js 로 최종 판정한다.
// 빠른 대전 방(quick)은 준비 없이 바로 시작하고, 사람이 안 오면 문도봇(고스트)이 한 자리를 채운다.
import { randomUUID } from 'node:crypto';
import { RULES } from '../src/rules.js';
import { NET, packChamp, packCleaver, cleanLook } from '../src/net-protocol.js';
import {
  createWorld, createChamp, resetChamp, constrain, castQ, castFlash, castGhost, stepWorld, roundWinner,
} from '../src/sim.js';
import { initBot, updateBot } from '../src/bot.js';
import { botGame } from '../src/ghost.js';
import { GhostObserver } from './ghost-profile.mjs';

const STEP = 1 / NET.TICK_HZ;
const SNAP_EVERY = Math.round(NET.TICK_HZ / NET.SNAP_HZ);
const LIMIT = RULES.arenaR * 3; // 입력 좌표 허용 범위
const num = (v) => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= LIMIT;

export class Room {
  // ghosts: 사람끼리 끝난 경기의 성향을 남길 저장소 (server/ghosts.mjs)
  constructor(code, { onEmpty, now = () => performance.now(), quick = false, ghosts = null }) {
    this.code = code;
    this.onEmpty = onEmpty;
    this.quick = quick;
    this.ghosts = ghosts;
    this.now = now;
    this.slots = [null, null];
    this.phase = 'lobby';
    this.paused = false;
    this.world = null;
    this.bots = [];
    this.observer = null;
    this.timers = new Set();
    this.lastActive = Date.now();
  }

  // ---------- 연결 ----------
  add(ws, look) {
    const slot = this.slots.findIndex(s => !s);
    if (slot < 0 || this.phase !== 'lobby') return -1;
    this.slots[slot] = { ws, look: cleanLook(look), token: randomUUID(), connected: true, ready: false, rematch: false, ack: 0, grace: null };
    this.welcome(slot);
    this.broadcastLobby();
    if (this.quick && this.slots.every(Boolean)) {
      this.broadcast({ type: 'matched', bot: false });
      this.startMatch();
    }
    return slot;
  }

  // 빠른 대전에서 기다려도 사람이 안 오면: diff 는 src/bot.js 수치, runes 는 고스트의 룬 (GhostStore.pick)
  addBot(diff, runes) {
    const slot = this.slots.findIndex(s => !s);
    if (slot < 0 || this.phase !== 'lobby') return false;
    this.slots[slot] = { bot: true, diff, look: cleanLook({ runes }), token: null, connected: true, ready: true, rematch: true, ack: 0, grace: null };
    this.broadcast({ type: 'matched', bot: true });
    this.startMatch();
    return true;
  }

  hasBot() { return this.slots.some(s => s?.bot); }

  // 재접속 중에 바꾼 외형은 다음 경기부터 반영된다 (진행 중인 경기는 시작 때 외형 유지)
  rejoin(ws, token, look) {
    const slot = this.slots.findIndex(s => s && s.token === token);
    if (slot < 0) return -1;
    const s = this.slots[slot];
    if (s.ws && s.ws !== ws) s.ws.close(4000, 'replaced');
    clearTimeout(s.grace);
    Object.assign(s, { ws, connected: true, grace: null });
    if (look && !this.inMatch()) s.look = cleanLook(look);
    this.welcome(slot);
    if (this.inMatch()) {
      this.paused = !this.slots.every(x => x?.connected);
      this.send(1 - slot, { type: 'opponentBack' });
      this.sendSnap();
    } else if (this.phase === 'over') {
      this.send(slot, { type: 'over', winner: this.winner, reason: 'ko' });
      this.broadcastRematch();
    } else this.broadcastLobby();
    return slot;
  }

  disconnect(slot, ws) {
    const s = this.slots[slot];
    if (!s || s.ws !== ws) return;
    s.connected = false;
    s.ws = null;
    if (this.inMatch()) {
      this.paused = true;
      this.send(1 - slot, { type: 'opponentAway', graceMs: NET.GRACE_MS });
    } else this.broadcastLobby();
    s.grace = this.after(NET.GRACE_MS, () => this.leave(slot, 'timeout'));
  }

  // 완전히 나감: 상대에게 알리고 경기를 끝낸다
  leave(slot, reason = 'left') {
    const s = this.slots[slot];
    if (!s) return;
    clearTimeout(s.grace);
    this.slots[slot] = null;
    const other = this.slots[1 - slot];
    if (this.inMatch() || this.phase === 'over') {
      this.stopLoop();
      this.phase = 'over';
      if (other) this.send(1 - slot, { type: 'opponentLeft', reason });
    } else this.broadcastLobby();
    if (!this.slots.some(s => s && !s.bot)) this.close();
  }

  close() {
    this.stopLoop();
    for (const t of this.timers) clearTimeout(t);
    for (const s of this.slots) s?.ws?.close(4001, 'room closed');
    this.slots = [null, null];
    this.onEmpty(this);
  }

  // ---------- 메시지 ----------
  handle(slot, msg) {
    const s = this.slots[slot];
    if (!s) return;
    this.lastActive = Date.now();
    switch (msg.type) {
      case 'ready':
        if (this.phase !== 'lobby') return;
        s.ready = !!msg.ready;
        this.broadcastLobby();
        if (this.slots.every(x => x?.connected && x.ready)) this.startMatch();
        return;
      case 'input': return this.input(slot, msg);
      case 'rematch':
        if (this.phase !== 'over' || !this.slots.every(Boolean)) return;
        s.rematch = true;
        this.broadcastRematch();
        if (this.slots.every(x => x.rematch)) this.startMatch();
        return;
      case 'leave': return this.leave(slot, 'left');
      case 'ping':
        if (Number.isFinite(msg.c)) this.send(slot, { type: 'pong', c: msg.c, t: this.time() });
        return;
      // tools/check-online.mjs 전용 (MUNDO_TEST=1 일 때만): 체력을 바꿔 빠르게 승부를 낸다
      case 'debug':
        if (process.env.MUNDO_TEST === '1' && this.world && Array.isArray(msg.hp)) {
          msg.hp.forEach((hp, i) => { if (Number.isFinite(hp)) Object.assign(this.world.champs[i], { hp, qCd: 0 }); });
        }
        return;
    }
  }

  input(slot, msg) {
    const s = this.slots[slot];
    if (Number.isInteger(msg.seq) && msg.seq > s.ack) s.ack = msg.seq;
    if (!this.world || this.paused || !(this.phase === 'play' || this.phase === 'countdown')) return;
    const w = this.world, c = w.champs[slot];
    if (!c.alive) return;
    if (msg.stop) c.moveTarget = null;
    if (msg.move && num(msg.move.x) && num(msg.move.z)) c.moveTarget = constrain(w, { x: msg.move.x, z: msg.move.z }, c);
    if (msg.cast && num(msg.tx) && num(msg.tz)) {
      if (msg.cast === 'q') castQ(w, c, msg.tx, msg.tz);
      else if (msg.cast === 'd') castFlash(w, c, msg.tx, msg.tz, { stop: true });
    }
    if (msg.cast === 'f') castGhost(w, c);
  }

  // ---------- 경기 흐름 ----------
  startMatch() {
    this.world = createWorld({ shrinkTeam: null, judge: true });
    this.world.champs = this.slots.map((s, i) => createChamp(i, s.look.runes));
    this.round = 0;
    this.winner = null;
    for (const s of this.slots) Object.assign(s, { ready: !!s.bot, rematch: !!s.bot });
    this.bots = this.slots.flatMap((s, i) => s.bot
      ? [{ c: this.world.champs[i], diff: s.diff, game: botGame(this.world, this.world.champs[i], this.world.champs[1 - i]) }] : []);
    this.observer = this.ghosts && !this.bots.length ? new GhostObserver(this.world) : null;
    this.startRound();
    this.startLoop();
  }

  startRound() {
    const w = this.world;
    this.round++;
    w.cleavers = [];
    w.roundTime = 0;
    w.champs.forEach((c, i) => resetChamp(c, NET.SPAWN[i].x, NET.SPAWN[i].z));
    for (const b of this.bots) initBot(b.c, b.diff);
    w.state = 'countdown';
    this.phase = 'countdown';
    this.countdownLeft = NET.COUNTDOWN_MS / 1000;
    this.broadcast({ type: 'start', round: this.round, countdownMs: NET.COUNTDOWN_MS, t: this.time(), looks: this.looks() });
    this.sendSnap();
  }

  endRound(winner) {
    const w = this.world;
    this.phase = 'roundEnd';
    w.state = 'roundEnd';
    w.cleavers = [];
    for (const c of w.champs) c.pending = null;
    this.endLeft = NET.ROUND_END_MS / 1000;
    this.celebrateLeft = winner >= 0 ? 0.7 : Infinity;
    this.roundResult = winner;
    this.broadcast({ type: 'roundEnd', winner, t: this.time() });
  }

  // 일시정지 중에는 타이머도 멈추도록 카운트다운·결과 대기는 틱에서 센다
  tick() {
    if (this.paused) return;
    const w = this.world;
    if (this.phase === 'countdown') {
      this.countdownLeft -= STEP;
      if (this.countdownLeft <= 0) {
        this.phase = 'play';
        w.state = 'play';
        this.broadcast({ type: 'go', t: this.time() });
      }
    }
    if (this.phase === 'play') for (const b of this.bots) if (b.c.alive) updateBot(b.c, b.game, STEP);
    stepWorld(w, STEP);
    if (this.observer) {
      this.observer.events(w.feed);
      this.observer.tick(STEP);
    }
    if (this.phase === 'play') {
      const winner = roundWinner(w);
      if (winner !== null) this.endRound(winner);
    } else if (this.phase === 'roundEnd') {
      this.celebrateLeft -= STEP;
      if (this.celebrateLeft <= 0) {
        this.celebrateLeft = Infinity;
        const c = w.champs[this.roundResult];
        if (c?.alive) { c.celebrate = true; c.moveTarget = null; }
      }
      this.endLeft -= STEP;
      if (this.endLeft <= 0) {
        if (this.roundResult < 0) this.startRound();
        else {
          this.phase = 'over';
          this.winner = this.roundResult;
          for (const p of this.observer?.profiles() ?? []) this.ghosts.record(p);
          this.observer = null;
          this.flushEvents();
          this.sendSnap();
          this.broadcast({ type: 'over', winner: this.winner, reason: 'ko' });
          this.stopLoop();
          return;
        }
      }
    }
    this.flushEvents();
    if (++this.tickN % SNAP_EVERY === 0) this.sendSnap();
  }

  flushEvents() {
    const w = this.world;
    if (!w.feed.length) return;
    this.broadcast({ type: 'ev', t: this.time(), list: w.feed });
    w.feed = [];
  }

  startLoop() {
    this.stopLoop();
    this.tickN = 0;
    let last = this.now();
    let acc = 0;
    this.loop = setInterval(() => {
      const now = this.now();
      acc = Math.min(acc + (now - last) / 1000, 0.25);
      last = now;
      while (acc >= STEP && this.loop) { acc -= STEP; this.tick(); }
    }, 1000 / NET.TICK_HZ);
  }

  stopLoop() {
    clearInterval(this.loop);
    this.loop = null;
  }

  // ---------- 전송 ----------
  inMatch() { return ['countdown', 'play', 'roundEnd'].includes(this.phase); }
  time() { return Math.round(this.now()); }

  after(ms, fn) {
    const t = setTimeout(() => { this.timers.delete(t); fn(); }, ms);
    this.timers.add(t);
    return t;
  }

  welcome(slot) {
    const s = this.slots[slot];
    this.send(slot, {
      type: 'joined', room: this.code, slot, token: s.token, phase: this.phase, round: this.round ?? 0, paused: this.paused,
      quick: this.quick, bot: this.hasBot(), looks: this.looks(),
    });
  }

  looks() { return this.slots.map(s => cleanLook(s?.look)); }

  lobbyState() {
    return this.slots.map(s => s && { connected: s.connected, ready: s.ready, bot: !!s.bot, runes: cleanLook(s.look).runes });
  }

  broadcastLobby() { this.broadcast({ type: 'lobby', players: this.lobbyState() }); }
  broadcastRematch() { this.broadcast({ type: 'rematch', want: this.slots.map(s => !!s?.rematch) }); }

  sendSnap() {
    const w = this.world;
    if (!w) return;
    const base = { type: 'snap', t: this.time(), ph: this.phase, p: this.paused ? 1 : 0,
      c: w.champs.map(packChamp), k: w.cleavers.map(packCleaver) };
    this.slots.forEach((s, i) => s && this.send(i, { ...base, ack: s.ack }));
  }

  send(slot, msg) {
    const ws = this.slots[slot]?.ws;
    if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg));
  }

  broadcast(msg) {
    const text = JSON.stringify(msg);
    for (const s of this.slots) if (s?.ws?.readyState === 1) s.ws.send(text);
  }
}
