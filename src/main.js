// 문도 피구 — Phaser 2.5D 봇전 + 친구와 온라인 1대1
// 월드 로직(src/sim.js)은 지면 좌표 (x, z)에서 돌고, 화면에는 PROJ 투영으로 그린다. 깊이는 화면 y 로 정렬.
// 씬 자체가 sim 의 world 역할을 한다 (champs, cleavers, state, arenaR, roundTime, shrinkTeam, judge, feed).
import { PROJ, ARENA } from './config.js';
import { RULES } from './rules.js';
import { initBot, updateBot } from './bot.js';
import { HUD } from './hud.js';
import { Sound } from './sound.js';
import { THROW } from './throw-motion.js';
import { createBaron } from './baron.js';
import { track, createTrackingId, referralContext } from './analytics.js';
import * as Sim from './sim.js';
import { NET, unpackChamp, unpackCleaver } from './net-protocol.js';
import { Online, roomFromUrl } from './online.js';
import { isTouchDevice, setupTouchControls } from './touch-controls.js';

const { PPU, SIN, COS } = PROJ;
const sx = (x) => x * PPU;
const sy = (z, y = 0) => (z * SIN - y * COS) * PPU;
const DEPTH = { water: -1000, arena: -900, decal: -800, ring: -700, fx: 5000, ui: 10000 };
const BAR_OFF = 154;
const EMOTE_DELAY = 0.25;
const EMOTE_DURATION = 1;
const EMOTE_SIZE = 104;
const INTERP_MS = 100; // 대인전 상대 표시 지연: 스냅샷 3개 간격 + 도착 흔들림 여유
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
// Render at the display's physical pixel density so Retina screens are not upscaled.
const DPR = Math.min(window.devicePixelRatio || 1, 3);
// 타격감: 피격 시 맞은 챔피언을 잠깐 멈추고(히트스톱), 카메라를 식칼 방향으로 튕긴다.
const HIT_STOP = { hit: 0.13, kill: 0.26, jitter: 8, catchUp: 30 };
const CAM_KICK = { recover: 45, traumaDecay: 14, noise: 8 }; // recover: 반동 복귀 속도(클수록 짧다)

const WATER_FRAG = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform float uTime;
uniform vec2 uSize;
uniform vec2 uOrigin;
uniform float uPPU;
uniform float uSin;
uniform float uR;
uniform float uInitialR;
uniform float uBankR;
uniform float uLeftOnly;
varying vec2 outTexCoord;

void main() {
  vec2 s = uOrigin + vec2(outTexCoord.x, 1.0 - outTexCoord.y) * uSize;
  vec2 g = vec2(s.x / uPPU, s.y / (uPPU * uSin));
  float r = length(g);
  float boundaryR = g.x < 0.0 || uLeftOnly < 0.5 ? uR : uInitialR;
  if (r > uBankR) discard;
  vec3 col = mix(vec3(0.19, 0.39, 0.49), vec3(0.23, 0.40, 0.48), smoothstep(-1.2, 1.2, g.x));
  // Sparse, graphic ripples instead of realistic caustics.
  vec2 cell = vec2(g.x + sin(g.y * 1.8) * 0.23 + uTime * 0.12, g.y);
  vec2 tile = mod(cell + vec2(floor(g.y / 2.1) * 1.3, 0.0), vec2(3.8, 2.1));
  float wave = abs(tile.y - 1.05 - sin(tile.x * 2.4) * 0.055);
  float dash = smoothstep(0.2, 0.4, tile.x) * (1.0 - smoothstep(1.2, 1.5, tile.x));
  col = mix(col, vec3(0.48, 0.69, 0.73), (1.0 - smoothstep(0.025, 0.06, wave)) * dash * 0.38);
  float playerSide = mix(1.0, 1.0 - smoothstep(-0.8, 0.0, g.x), uLeftOnly);
  float edge = (1.0 - smoothstep(0.035, 0.085, abs(r - boundaryR))) * playerSide;
  col = mix(col, vec3(0.40, 0.62, 0.85), edge * 0.65);
  float outside = smoothstep(uR, uR + 0.2, r)
    * smoothstep(0.0, 0.2, uInitialR - uR) * playerSide;
  col = mix(col, vec3(0.12, 0.26, 0.62), outside * 0.65);
  float ring = (1.0 - smoothstep(0.025, 0.12, abs(r - boundaryR))) * playerSide;
  col = mix(col, vec3(0.32, 0.60, 0.88), ring * (0.8 + 0.2 * sin(uTime * 3.0)));
  gl_FragColor = vec4(col, 1.0);
}
`;

// ---------------------------------------------------------------------------
class Champ {
  // emote: 적중 시 따봉 표시 (봇전은 봇만, 대인전은 양쪽 모두)
  constructor(scene, { team, isPlayer, emote = !isPlayer }) {
    Object.assign(this, Sim.createChamp(team)); // team, side, stats
    this.scene = scene;
    this.isPlayer = isPlayer;
    this.hudSlot = team; // 상단 체력바 번호 (쌍둥이 모드의 두 번째 적은 2)
    this.color = isPlayer ? 0x5ee05e : 0xff4040;
    this.barColor = isPlayer ? 0x48c848 : 0xd83838;

    const meta = scene.meta;
    this.shadow = scene.add.image(0, 0, 'shadow').setDepth(DEPTH.decal);
    this.shadow.setDisplaySize(RULES.champR * 3 * PPU, RULES.champR * 3 * PPU * SIN);
    this.ring = scene.add.graphics().setDepth(DEPTH.ring);
    const rw = RULES.champR * 2.3 * PPU, rh = rw * SIN;
    this.ring.fillStyle(this.color, 0.12).fillEllipse(0, 0, rw, rh);
    this.ring.lineStyle(isPlayer ? 3 : 2, this.color, 0.95).strokeEllipse(0, 0, rw, rh);
    this.sprite = scene.add.sprite(0, 0, 'mundo', 'idle_2_0').setOrigin(0.5, meta.anchor).setScale(meta.scale);
    this.bar = scene.add.graphics().setDepth(DEPTH.ui);
    if (emote) {
      this.emote = scene.add.image(0, 0, 'mundo-emote')
        .setDisplaySize(EMOTE_SIZE, EMOTE_SIZE).setDepth(DEPTH.ui + 2).setVisible(false);
    }
  }

  reset(x, z) {
    Sim.resetChamp(this, x, z);
    Object.assign(this, {
      hitFlash: 0, rippleT: 0, lastHp: -1, animKey: null, tintState: '', emoteT: 0, emoteDelayT: 0,
      hitStop: 0, hitStopDur: 0, jitter: 0, stopX: 0, stopY: 0, lagX: 0, lagY: 0, kickX: 0, kickY: 0,
    });
    this.sprite.setAlpha(1).clearTint();
    this.ring.setVisible(true);
    this.bar.setVisible(true);
    this.shadow.setAlpha(0.6);
    this.setAnim('idle', true);
    this.sync();
  }

  speed() {
    return Sim.champSpeed(this);
  }

  // 화면 위치를 멈춘 채 떨게 한다. 계산 위치는 계속 움직이고, 풀린 뒤 lag 로 부드럽게 따라붙는다.
  freeze(dur, kickX, kickY) {
    if (this.hitStop <= 0) { this.stopX = this.sprite.x - this.jitterX(); this.stopY = this.sprite.y - this.jitterY(); }
    this.hitStop = Math.max(this.hitStop, dur);
    this.hitStopDur = this.hitStop;
    this.kickX = kickX; this.kickY = kickY;
  }

  jitterX() { return this.hitStop > 0 ? this.jitter * this.kickX : 0; }
  jitterY() { return this.hitStop > 0 ? this.jitter * this.kickY : 0; }

  showEmote() {
    if (!this.emote || !this.alive) return;
    this.emoteDelayT = EMOTE_DELAY;
  }

  dirIndex() {
    const sector = Math.PI / 4;
    // A small dead band stops the sprite flickering at a direction boundary.
    if (this.visualDir != null) {
      const delta = Math.atan2(Math.sin(this.facing - this.visualDir * sector), Math.cos(this.facing - this.visualDir * sector));
      if (Math.abs(delta) < sector / 2 + Math.PI / 36) return this.visualDir;
    }
    this.visualDir = ((Math.round(this.facing / sector) % 8) + 8) % 8;
    return this.visualDir;
  }

  setAnim(key, force = false) {
    const full = `${key}_${this.dirIndex()}`;
    const anims = this.sprite.anims;
    if (!force && anims.currentAnim?.key === full && anims.isPlaying) return;
    if (!force && anims.currentAnim?.key === full && key === 'death') return;
    let startFrame = 0;
    let elapsed = 0;
    // 같은 동작에서 방향만 바뀌면 프레임 위상을 유지
    if (!force && this.animKey === key && anims.currentAnim && anims.currentFrame) {
      startFrame = anims.currentAnim.frames.indexOf(anims.currentFrame);
      if (startFrame < 0) startFrame = 0;
      elapsed = anims.accumulator;
    }
    this.sprite.play({ key: full, startFrame });
    anims.accumulator = elapsed;
    this.sprite.anims.timeScale = 1;
    this.animKey = key;
  }

  drawBar() {
    const g = this.bar;
    const w = 74, h = 9;
    const x0 = -w / 2;
    const frac = clamp(this.hp / RULES.maxHp, 0, 1);
    g.clear();
    g.fillStyle(0x000000, 0.9).fillRect(x0 - 2, -2, w + 4, h + 4);
    g.fillStyle(0x2a2a2a, 1).fillRect(x0, 0, w, h);
    g.fillStyle(this.barColor, 1).fillRect(x0, 0, w * frac, h);
    g.fillStyle(0xffffff, 0.28).fillRect(x0, 0, w * frac, 2);
    g.fillStyle(0x000000, 0.75);
    for (let hp = 100; hp < RULES.maxHp; hp += 100) {
      const tx = x0 + (w * hp) / RULES.maxHp;
      g.fillRect(tx, hp % 500 === 0 ? 0 : 3, 1, hp % 500 === 0 ? h : h - 3);
    }
    if (this.slowT > 0) g.fillStyle(0x9fd4ff, 1).fillRect(x0, h + 2, w * (this.slowT / RULES.q.slowDur), 2);
    this.lastHp = this.hp;
  }

  sync() {
    let X = sx(this.x), Y = sy(this.z);
    if (this.hitStop > 0) { this.lagX = this.stopX - X; this.lagY = this.stopY - Y; }
    X += this.lagX; Y += this.lagY;
    // 식칼 방향으로 좌우 번갈아 떨리며 점점 잦아든다
    this.jitter = this.hitStop > 0
      ? HIT_STOP.jitter * (this.hitStop / this.hitStopDur) * (Math.floor(this.hitStop * 60) % 2 ? 1 : -1) : 0;
    this.sprite.setPosition(X + this.jitterX(), Y + this.jitterY()).setDepth(this.alive ? Y : Y - 40);
    this.sprite.anims.timeScale = this.hitStop > 0 ? 0 : this.animKey === 'run' ? this.sprite.anims.timeScale || 1 : 1;
    const opacity = this.alive && this.ghostT > 0 ? 0.82 : 1;
    this.sprite.setAlpha(opacity);
    this.shadow.setPosition(X, Y);
    this.ring.setPosition(X, Y);
    this.bar.setPosition(X, Y - BAR_OFF);
    if (this.emote) {
      const visible = this.alive && this.emoteT > 0;
      this.emote.setVisible(visible);
      if (visible) {
        const enter = clamp((EMOTE_DURATION - this.emoteT) / 0.15, 0, 1);
        const size = EMOTE_SIZE * (0.75 + 0.25 * enter);
        this.emote.setPosition(X, Y - BAR_OFF - 60 - enter * 8)
          .setDisplaySize(size, size).setAlpha(clamp(this.emoteT / 0.3, 0, 1));
      }
    }
    const tint = this.hitFlash > 0 ? 'hit' : this.slowT > 0 ? 'slow' : '';
    if (tint !== this.tintState) {
      this.tintState = tint;
      if (tint === 'hit') this.sprite.setTint(0xff6a6a);
      else if (tint === 'slow') this.sprite.setTint(0xa8ccff);
      else this.sprite.clearTint();
    }
    if (this.alive && (this.hp !== this.lastHp || this.slowT > 0)) this.drawBar();
  }

  destroy() {
    this.emote?.destroy();
    for (const o of [this.sprite, this.shadow, this.ring, this.bar]) o.destroy();
  }
}

// 식칼 화면 오브젝트. 계산 상태는 sim 의 식칼 객체(cl)가 갖고, cl.view 로 연결된다.
class CleaverView {
  constructor(scene, cl) {
    this.cont = scene.add.container(0, 0);
    this.img = scene.add.image(0, 0, 'cleaver').setDisplaySize(72, 43.2).setRotation(Math.atan2(cl.dz * SIN, cl.dx));
    this.cont.add(this.img);
    this.shadow = scene.add.image(0, 0, 'shadow').setDepth(DEPTH.decal).setAlpha(0.5);
    this.shadow.setDisplaySize(1.6 * PPU, 1.6 * PPU * SIN);
    this.sync(cl);
  }
  sync(cl) {
    const X = sx(cl.x), Y = sy(cl.z, RULES.q.height);
    this.cont.setPosition(X, Y).setDepth(sy(cl.z) + 2);
    this.shadow.setPosition(X, sy(cl.z));
  }
  destroy() {
    this.cont.destroy();
    this.shadow.destroy();
  }
}

// ---------------------------------------------------------------------------
class GameScene extends Phaser.Scene {
  constructor() {
    super('game');
    this.champs = [];
    this.enemies = [];
    this.cleavers = [];
    this.state = 'loading';
    this.time0 = 0;
    this.camKick = { x: 0, y: 0, trauma: 0 };
    // sim world 필드
    this.mode = 'bot';
    this.shrinkTeam = 0;
    this.judge = true;
    this.nextCleaverId = 1;
    this.feed = [];
    this.roundTime = 0;
    this.netPaused = false;
  }

  preload() {
    this.load.on('progress', (v) => {
      const percent = Math.round(v * 100);
      document.getElementById('load-fill').style.width = `${v * 100}%`;
      document.getElementById('load-percent').textContent = `${percent}%`;
      document.getElementById('load-progress').setAttribute('aria-valuenow', percent);
      document.getElementById('load-text').textContent = percent < 100 ? '경기장 준비하는 중…' : '문도, 준비 끝!';
    });
    this.load.multiatlas('mundo', 'assets/cartoon/atlas.json', 'assets/cartoon/');
    this.load.json('meta', 'assets/cartoon/meta.json');
    this.load.json('arenaMeta', 'assets/cartoon/arena.json');
    this.load.image('arena', 'assets/cartoon/arena.png');
    this.load.image('baron-cute', 'assets/cartoon/baron-cute.png');
    this.load.image('mundo-emote', 'assets/cartoon/mundo-thumbs-up-emote-v1.png');
  }

  create() {
    this.meta = this.cache.json.get('meta');
    this.makeTextures();
    this.makeAnims();
    this.buildArena();
    this.makeFx();
    this.setupInput();
    if (this.touchMode) this.touch = setupTouchControls(this, { sx, sy, depth: DEPTH.ring + 1 });
    this.spawnMenuMundos();
    this.state = 'menu';
    document.getElementById('loading').classList.add('hidden');
    this.game.events.emit('mundo-ready');
  }

  // ---------- 리소스 ----------
  makeTextures() {
    const canvasTex = (key, w, h, draw) => {
      const t = this.textures.createCanvas(key, w, h);
      draw(t.getContext(), w, h);
      t.refresh();
    };
    canvasTex('bank', 1024, 1024, (g, w, h) => {
      g.fillStyle = '#293b43'; g.fillRect(0, 0, w, h);
      let seed = 2917;
      const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
      g.fillStyle = '#30464b';
      for (let i = 0; i < 30; i++) {
        const x = random() * w, y = random() * h;
        const rx = 25 + random() * 90, ry = 12 + random() * 28;
        // Wrap each patch onto the opposite edges to make the tile seamless.
        for (const dx of [-w, 0, w]) for (const dy of [-h, 0, h]) {
          g.beginPath(); g.ellipse(x + dx, y + dy, rx, ry, 0, 0, Math.PI * 2); g.fill();
        }
      }
    });
    canvasTex('dot', 32, 32, (g) => {
      const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
      gr.addColorStop(0, 'rgba(255,255,255,1)');
      gr.addColorStop(0.4, 'rgba(255,255,255,0.6)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 32, 32);
    });
    canvasTex('shadow', 64, 64, (g) => {
      const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, 'rgba(0,0,0,0.75)');
      gr.addColorStop(0.6, 'rgba(0,0,0,0.4)');
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    });
    canvasTex('ripple', 96, 96, (g) => {
      g.strokeStyle = 'rgba(200,240,255,0.9)'; g.lineWidth = 3;
      g.beginPath(); g.arc(48, 48, 44, 0, Math.PI * 2); g.stroke();
    });
    // Chunky cartoon ward; flat colors and the same dark ink as the champions.
    // Keep the foot at (48, 100) for ground placement.
    canvasTex('ward', 192, 216, (g) => {
      g.scale(2, 2);
      g.lineJoin = 'round';
      g.lineCap = 'round';
      const shape = (points, fill, stroke = '#292333', width = 4) => {
        g.beginPath();
        points.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y));
        g.closePath(); g.fillStyle = fill; g.fill();
        if (stroke) { g.strokeStyle = stroke; g.lineWidth = width; g.stroke(); }
      };
      for (const side of [-1, 1]) {
        g.save(); g.translate(48, 0); g.scale(side, 1);
        g.beginPath(); g.moveTo(7, 47);
        g.quadraticCurveTo(25, 50, 41, 32);
        g.quadraticCurveTo(44, 57, 28, 66);
        g.quadraticCurveTo(17, 74, 7, 64);
        g.closePath(); g.fillStyle = '#f4cb48'; g.fill();
        g.strokeStyle = '#292333'; g.lineWidth = 4; g.stroke();
        g.beginPath(); g.moveTo(12, 61); g.quadraticCurveTo(27, 64, 36, 50);
        g.strokeStyle = '#c58b35'; g.lineWidth = 4; g.stroke();
        g.beginPath(); g.moveTo(15, 51); g.quadraticCurveTo(27, 50, 35, 43);
        g.strokeStyle = '#fff2a0'; g.lineWidth = 3; g.stroke();
        g.restore();
      }
      g.beginPath(); g.moveTo(37, 44); g.lineTo(59, 44);
      g.quadraticCurveTo(55, 72, 58, 86);
      g.quadraticCurveTo(69, 101, 48, 101);
      g.quadraticCurveTo(28, 101, 38, 86);
      g.quadraticCurveTo(43, 72, 37, 44);
      g.closePath(); g.fillStyle = '#79754d'; g.fill();
      g.strokeStyle = '#292333'; g.lineWidth = 4; g.stroke();
      g.strokeStyle = '#b1ab6d'; g.lineWidth = 5;
      for (const y of [64, 81]) {
        g.beginPath(); g.moveTo(42, y + 3); g.quadraticCurveTo(50, y, 55, y - 4); g.stroke();
      }
      shape([[32, 39], [64, 39], [60, 49], [36, 49]], '#d9a444');
      shape([[25, 30], [34, 10], [47, 6], [62, 13], [71, 31], [58, 42], [37, 42]], '#74df4e');
      shape([[27, 30], [47, 27], [69, 31], [57, 40], [38, 40]], '#38a94a', null);
      shape([[47, 8], [47, 27], [61, 29], [59, 15]], '#a4f578', null);
      g.strokeStyle = '#e0ffb8'; g.lineWidth = 4;
      g.beginPath(); g.moveTo(36, 17); g.lineTo(32, 26); g.stroke();
    });
    // Draw at double resolution so the ink outline stays crisp as it spins.
    canvasTex('cleaver', 160, 96, (g) => {
      g.scale(2, 2);
      g.lineJoin = 'round';
      g.lineCap = 'round';
      g.strokeStyle = '#292333';
      g.lineWidth = 3;
      const shape = (points, color, outline = true) => {
        g.beginPath();
        points.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y));
        g.closePath();
        g.fillStyle = color; g.fill();
        if (outline) g.stroke();
      };
      // Chunky wooden grip, metal collar, and an oversized chipped blade.
      shape([[5, 19], [30, 17], [32, 29], [5, 30], [3, 26]], '#a45c39');
      shape([[6, 26], [29, 24], [30, 28], [6, 29]], '#693b32', false);
      g.lineWidth = 2;
      for (const x of [11, 18, 25]) {
        g.beginPath(); g.moveTo(x, 20); g.lineTo(x - 1, 25); g.stroke();
      }
      g.lineWidth = 3;
      shape([[28, 16], [36, 16], [36, 31], [29, 31]], '#b3bec6');
      shape([[35, 8], [69, 5], [76, 10], [75, 34], [65, 41], [57, 40], [54, 36], [50, 40], [35, 40]], '#d7e4e7');
      shape([[37, 30], [73, 27], [73, 33], [64, 38], [58, 37], [54, 33], [49, 37], [37, 37]], '#91aab5', false);
      g.strokeStyle = '#ffffff'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(40, 13); g.lineTo(65, 10); g.stroke();
      g.fillStyle = '#292333';
      g.beginPath(); g.arc(68, 15, 3, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#687f8f'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(45, 19); g.lineTo(42, 25); g.stroke();
    });
  }

  makeAnims() {
    for (const [key, a] of Object.entries(this.meta.anims)) {
      for (let d = 0; d < 8; d++) {
        this.anims.create({
          key: `${key}_${d}`,
          frames: this.anims.generateFrameNames('mundo', { prefix: `${key}_${d}_`, start: 0, end: a.frames - 1 }),
          frameRate: a.fps,
          repeat: a.loop ? -1 : 0,
        });
      }
    }
  }

  buildArena() {
    this.arenaR = RULES.arenaR;
    this.bank = this.add.tileSprite(0, 0, 1, 1, 'bank').setOrigin(0, 0).setDepth(DEPTH.water - 1);
    const am = this.cache.json.get('arenaMeta');
    this.add.image(0, 0, 'arena').setOrigin(am.originX / am.width, am.originY / am.height).setDepth(DEPTH.arena);
    const wx = (ARENA.ROCK_R + 2.5) * PPU, wy = (ARENA.ROCK_R + 2.5) * SIN * PPU;
    const base = new Phaser.Display.BaseShader('water', WATER_FRAG, undefined, {
      uTime: { type: '1f', value: 0 },
      uSize: { type: '2f', value: { x: wx * 2, y: wy * 2 } },
      uOrigin: { type: '2f', value: { x: -wx, y: -wy } },
      uPPU: { type: '1f', value: PPU },
      uSin: { type: '1f', value: SIN },
      uR: { type: '1f', value: ARENA.R },
      uInitialR: { type: '1f', value: RULES.arenaR },
      // Continue the two water colors beneath the rocks where the strip was removed.
      uBankR: { type: '1f', value: ARENA.ROCK_R + 0.75 },
      // 1: 봇전처럼 플레이어 쪽(왼쪽)만 경계를 강조, 0: 대인전 양쪽 동일
      uLeftOnly: { type: '1f', value: 1 },
    });
    this.water = this.add.shader(base, -wx, -wy, wx * 2, wy * 2).setOrigin(0, 0).setDepth(DEPTH.water);
    this.baron = createBaron(this, sx(-11), sy(-9.8), DEPTH.arena + 1);
    // Four separated wards mark the same x=0 boundary used by movement rules.
    this.boundaryWards = Array.from({ length: 4 }, (_, i) => {
      const z = ARENA.R * 0.82 * (i * 2 / 3 - 1);
      const y = sy(z);
      const shadow = this.add.image(0, y, 'shadow').setScale(0.85, 0.3).setAlpha(0.6).setDepth(DEPTH.decal);
      const ward = this.add.image(0, y, 'ward').setOrigin(0.5, 100 / 108)
        .setScale(0.42).setDepth(y + 1);
      return { ward, shadow };
    });
    this.cameras.main.setBackgroundColor('#293b43');
  }

  makeFx() {
    const P = (config) => this.add.particles(0, 0, 'dot', { emitting: false, ...config }).setDepth(DEPTH.fx);
    this.fx = {
      blood: P({ speed: { min: 60, max: 240 }, angle: { min: 180, max: 360 }, gravityY: 520, lifespan: 650, scale: { start: 0.55, end: 0.1 }, tint: [0xc45cff, 0x8a2be2, 0x5e1a9e] }),
      hitflash: P({ speed: 0, lifespan: 180, scale: { start: 2.4, end: 0.5 }, alpha: { start: 0.9, end: 0 }, blendMode: 'ADD', tint: 0xffe0e0 }),
      trail: P({ speed: 0, lifespan: 220, scale: { start: 0.55, end: 0 }, alpha: { start: 0.55, end: 0 }, blendMode: 'ADD', tint: 0xcfe3ff }),
      spark: P({ speed: { min: 40, max: 200 }, lifespan: 420, scale: { start: 0.6, end: 0 }, blendMode: 'ADD', tint: [0xfff3a0, 0xffd040, 0xffffff] }),
      ghost: P({ speed: { min: 5, max: 30 }, lifespan: 500, scale: { start: 0.6, end: 0 }, alpha: { start: 0.5, end: 0 }, blendMode: 'ADD', tint: [0x7fe8ff, 0x4fb8ff] }),
      splash: P({ speed: { min: 20, max: 70 }, angle: { min: 220, max: 320 }, gravityY: 300, lifespan: 380, scale: { start: 0.28, end: 0 }, alpha: { start: 0.7, end: 0 }, tint: 0xbfefff }),
      puff: P({ speed: { min: 20, max: 90 }, lifespan: 700, scale: { start: 1.1, end: 0 }, alpha: { start: 0.6, end: 0 }, blendMode: 'ADD', tint: [0x9b5cff, 0x5a2a9a] }),
      mote: this.add.particles(0, 0, 'dot', {
        x: { min: -ARENA.R * PPU, max: ARENA.R * PPU }, y: { min: -ARENA.R * SIN * PPU, max: ARENA.R * SIN * PPU },
        speedY: { min: -18, max: -6 }, speedX: { min: -6, max: 6 }, lifespan: 4000, frequency: 120,
        scale: { start: 0.25, end: 0 }, alpha: { start: 0.5, end: 0 }, blendMode: 'ADD', tint: [0xb48cff, 0x7fd8ff],
      }).setDepth(DEPTH.fx - 1),
    };
  }

  // ---------- 입력 ----------
  setupInput() {
    this.input.mouse.disableContextMenu();
    this.moveHeld = false;
    // 터치 기기는 화면 탭 이동 대신 조이스틱으로 움직인다 (src/touch-controls.js)
    this.touchMode = isTouchDevice();
    this.input.on('pointerdown', () => {
      Sound.unlock();
      if (this.touchMode || !this.canControl()) return;
      this.moveHeld = true;
      this.moveRepeatT = 0.1;
      const g = this.pointerGround();
      this.setMoveTarget(g);
      this.clickMarker(g.x, g.z);
    });
    this.input.on('pointerup', (p) => {
      if (!p.leftButtonDown() && !p.rightButtonDown()) this.moveHeld = false;
    });
    this.input.keyboard.on('keydown', (e) => {
      if (e.target.closest?.('input, textarea, [contenteditable="true"]')) return;
      if (e.repeat) return;
      Sound.unlock();
      const p = this.player;
      if (e.code === 'KeyM') { Sound.toggleMute(); HUD.chat(Sound.muted ? '소리 끔' : '소리 켬'); return; }
      if (!this.canControl()) return;
      const g = this.pointerGround();
      if (e.code === 'KeyQ') this.useSkill('q', g.x, g.z);
      else if (e.code === 'KeyD') this.useSkill('d', g.x, g.z);
      else if (e.code === 'KeyF') this.useSkill('f');
      else if (e.code === 'KeyS') { p.moveTarget = null; this.moveHeld = false; this.sendInput({ stop: true }); }
    });
  }

  // 키보드와 터치가 함께 쓰는 시전. 성공하면 대인전 서버에도 보낸다.
  useSkill(key, tx, tz) {
    const p = this.player;
    if (key === 'q') { if (this.castQ(p, tx, tz)) this.sendInput({ cast: 'q', tx, tz }); }
    else if (key === 'd') { if (this.castFlash(p, tx, tz)) this.sendInput({ cast: 'd', tx, tz }); }
    else if (key === 'f') { if (this.castGhost(p)) this.sendInput({ cast: 'f' }); }
  }

  canControl() {
    const p = this.player;
    if (!p || !p.alive) return false;
    // 대인전은 카운트다운 중에도 이동 목표를 미리 찍을 수 있다 (출발은 시작 신호 후)
    if (this.mode === 'online') return !this.netPaused && (this.state === 'play' || this.state === 'countdown');
    return this.state === 'play';
  }

  setMoveTarget(g) {
    const p = this.player;
    if (!p.moveTarget) this.moveSince = performance.now(); // 서 있다가 출발한 시각 (대인전 보정용)
    p.moveTarget = this.constrain({ x: g.x, z: g.z }, p);
    this.sendInput({ move: { x: p.moveTarget.x, z: p.moveTarget.z } });
  }

  // 대인전: 내 입력을 서버로 보낸다. 화면에는 이미 로컬로 반영(예측)되어 있다.
  sendInput(data) {
    if (this.mode !== 'online') return;
    const seq = ++this.inputSeq;
    if (data.cast) this.lastCastSeq = seq;
    if (data.cast === 'd') this.lastFlashSeq = seq;
    Online.send({ type: 'input', seq, ...data });
  }

  pointerGround() {
    const ptr = this.input.activePointer;
    const w = this.cameras.main.getWorldPoint(ptr.x, ptr.y);
    return { x: w.x / PPU, z: w.y / (PPU * SIN) };
  }

  clickMarker(x, z) {
    const g = this.add.graphics().setDepth(DEPTH.ring + 1).setPosition(sx(x), sy(z));
    g.fillStyle(0x6cff6c, 1);
    for (let k = 0; k < 4; k++) {
      const a = Math.PI / 4 + (k * Math.PI) / 2;
      const cx = Math.cos(a) * 16, cy = Math.sin(a) * 16;
      const tx = Math.cos(a) * 7, ty = Math.sin(a) * 7;
      const px = -Math.sin(a) * 6, py = Math.cos(a) * 6;
      g.fillTriangle(tx, ty, cx + px, cy + py, cx - px, cy - py);
    }
    g.setScale(1.3, 1.3 * SIN);
    this.tweens.add({ targets: g, scaleX: 0.55, scaleY: 0.55 * SIN, alpha: 0, duration: 380, onComplete: () => g.destroy() });
  }

  // ---------- 규칙 (계산은 src/sim.js, 여기서는 효과 표시) ----------
  updateArena() {
    Sim.updateArena(this);
    this.water.setUniform('uR.value', this.arenaR);
  }

  constrain(p, champ) {
    return Sim.constrain(this, p, champ);
  }

  castQ(c, tx, tz) {
    const ok = Sim.castQ(this, c, tx, tz);
    this.flushFeed();
    return ok;
  }

  castFlash(c, tx, tz) {
    const ok = Sim.castFlash(this, c, tx, tz, { stop: c.isPlayer });
    if (ok && c.isPlayer) this.moveHeld = false;
    this.flushFeed();
    return ok;
  }

  castGhost(c) {
    const ok = Sim.castGhost(this, c);
    this.flushFeed();
    return ok;
  }

  hit(victim, cleaver) {
    Sim.hit(this, victim, cleaver);
    this.flushFeed();
  }

  kill(v, k) {
    Sim.kill(this, v, k);
    this.flushFeed();
  }

  vol(c) {
    const p = this.player;
    if (!p || c === p) return 1;
    return this.volAt(c.x, c.z);
  }

  volAt(x, z) {
    const p = this.player;
    if (!p) return 1;
    return clamp(1.1 - Math.hypot(x - p.x, z - p.z) / 25, 0.25, 0.8);
  }

  flushFeed() {
    if (!this.feed.length) return;
    const list = this.feed;
    this.feed = [];
    for (const e of list) this.showEvent(e);
  }

  // sim 이벤트 → 효과. 봇전은 로컬 sim 이, 대인전은 서버가 보낸다(remote).
  // remote 에서는 서버가 판정한 결과(체력·사망·식칼 제거)도 여기서 반영한다.
  showEvent(e, remote = false) {
    const c = this.champs[e.ci];
    const mine = remote && c === this.player; // 내 동작은 이미 로컬에서 표시함
    switch (e.type) {
      case 'cast':
        if (!c || mine) return;
        if (remote) { c.facing = e.facing; c.actionT = THROW.duration; }
        c.setAnim('throw', true);
        return;
      case 'throw': {
        if (!c) return;
        let cl = this.cleavers.find(p => p.id === e.id);
        if (!cl && remote) {
          cl = { id: e.id, team: c.team, x: e.x, z: e.z, dx: e.dx, dz: e.dz, dist: 0, age: 0, alive: true };
          this.cleavers.push(cl);
        }
        if (cl && !cl.view) cl.view = new CleaverView(this, cl);
        if (remote) c.stats.throws++;
        Sound.throw(this.vol(c));
        return;
      }
      case 'flash':
        if (!c || mine) return;
        this.fx.spark.explode(16, sx(e.fromX), sy(e.fromZ, 1));
        this.fx.spark.explode(22, sx(e.x), sy(e.z, 1));
        Sound.flash(this.vol(c));
        return;
      case 'ghost':
        if (!c || mine) return;
        this.fx.ghost.explode(20, sx(c.x), sy(c.z, 1));
        Sound.ghost(this.vol(c));
        return;
      case 'hit': {
        const victim = this.champs[e.victim], k = this.champs[e.killer];
        if (!victim || !k) return;
        if (remote) {
          this.removeCleaver(e.id);
          k.stats.hits++;
          victim.hp = Math.max(0, victim.hp - e.dmg);
          victim.slowT = RULES.q.slowDur;
        }
        victim.hitFlash = 0.14;
        // 식칼 진행 방향(화면 좌표). 예전 서버 이벤트에는 방향이 없어 던진 쪽 → 맞은 쪽으로 대신한다.
        let kx = e.dx ?? victim.x - k.x, ky = (e.dz ?? victim.z - k.z) * SIN;
        const kl = Math.hypot(kx, ky) || 1;
        kx /= kl; ky /= kl;
        victim.freeze(HIT_STOP.hit, kx, ky);
        this.kickCamera(e.dmg, kx, ky, victim, k);
        k.showEmote();
        const X = sx(victim.x), Y = sy(victim.z, 1.3);
        this.fx.hitflash.explode(1, X, Y);
        this.fx.blood.explode(18, X, Y);
        const txt = this.add.text(X + rand(-10, 10), Y - 30, `${e.dmg}`, {
          fontFamily: 'Jua', fontSize: '24px', fontStyle: '900',
          color: victim.isPlayer ? '#ff5a5a' : '#ffd24a', stroke: '#000', strokeThickness: 4,
        }).setOrigin(0.5).setDepth(DEPTH.ui + 1).setScale(1.5).setResolution(DPR * 2);
        this.tweens.add({ targets: txt, y: txt.y - 46, scale: 1, alpha: 0, duration: 950, ease: 'Cubic.easeOut', onComplete: () => txt.destroy() });
        Sound.hit(Math.max(this.vol(victim), this.vol(k)));
        return;
      }
      case 'cleaverEnd': {
        if (remote) this.removeCleaver(e.id);
        this.fx.trail.explode(6, sx(e.x), sy(e.z, RULES.q.height));
        this.missFx(e.x, e.z, Math.hypot(e.x, e.z) >= ARENA.ROCK_R);
        return;
      }
      case 'kill': {
        const v = this.champs[e.victim], k = this.champs[e.killer];
        if (!v) return;
        if (remote) {
          if (!v.alive) return;
          Object.assign(v, { hp: 0, alive: false, moveTarget: null, pending: null, castT: 0 });
          if (k) k.stats.kills++;
          v.stats.deaths++;
        }
        v.freeze(HIT_STOP.kill, v.kickX, v.kickY);
        this.kickCamera(0, v.kickX, v.kickY, v, k, true);
        this.knockOut(v);
        Sound.death(this.vol(v));
      }
    }
  }

  // 식칼 방향으로 카메라를 한 번 튕긴다 + 아주 짧은 무작위 떨림(trauma). 내가 맞았을 때 가장 세다.
  kickCamera(dmg, kx, ky, victim, killer, isKill = false) {
    const s = this.camKick;
    const mine = victim === this.player ? 1 : killer === this.player ? 0.6 : 0.3;
    const size = isKill ? 1.6 : clamp(dmg / (RULES.maxHp * RULES.q.dmgPct), 0.8, 1.5);
    const px = 12 * mine * size * DPR / this.cameras.main.zoom; // 최대 변위(화면 px)를 월드 px 로
    s.x += kx * px;
    s.y += ky * px;
    s.trauma = Math.min(1, s.trauma + (isKill ? 0.7 : 0.45) * mine * size);
  }

  updateCamKick(dt) {
    const s = this.camKick;
    // 맞은 프레임에 최대로 밀린 모습을 먼저 보여주고, 다음 프레임부터 빠르게 원위치
    const n = s.trauma * s.trauma * CAM_KICK.noise * DPR / this.cameras.main.zoom;
    const out = { x: s.x + rand(-n, n), y: s.y + rand(-n, n) };
    const k = Math.exp(-CAM_KICK.recover * dt);
    s.x *= k; s.y *= k;
    s.trauma = Math.max(0, s.trauma - dt * CAM_KICK.traumaDecay);
    return out;
  }

  // 쓰러진 모습 (사망 이벤트, 또는 재접속 시 이미 쓰러져 있던 경우)
  knockOut(v) {
    v.emoteT = 0;
    v.emoteDelayT = 0;
    v.emote?.setVisible(false);
    v.setAnim('death', true);
    v.ring.setVisible(false);
    v.bar.setVisible(false);
    v.shadow.setAlpha(0.35);
    this.fx.puff.explode(16, sx(v.x), sy(v.z, 0.8));
  }

  removeCleaver(id) {
    const i = this.cleavers.findIndex(p => p.id === id);
    if (i < 0) return;
    this.cleavers[i].view?.destroy();
    this.cleavers.splice(i, 1);
  }

  clearCleavers() {
    for (const p of this.cleavers) p.view?.destroy();
    this.cleavers = [];
  }

  // 봇전: 로컬 판정 + 플레이어 쪽 축소. 대인전: 서버 판정 + 양쪽 같은 경기장.
  setMode(mode) {
    this.mode = mode;
    this.shrinkTeam = mode === 'bot' ? 0 : null;
    this.judge = mode === 'bot';
    this.netPaused = false;
    this.water.setUniform('uLeftOnly.value', mode === 'bot' ? 1 : 0);
  }

  clearMatch() {
    this.menuMundos?.forEach((s) => s.destroy());
    this.menuMundos = null;
    for (const c of this.champs) c.destroy();
    this.champs = [];
    this.clearCleavers();
  }

  // ---------- 매치 흐름 ----------
  spawnMenuMundos() {
    this.menuMundos = [
      this.add.sprite(sx(-8.5), sy(1.5), 'mundo').setOrigin(0.5, this.meta.anchor).setScale(this.meta.scale).play('dance_1'),
      this.add.sprite(sx(8.5), sy(1.5), 'mundo').setOrigin(0.5, this.meta.anchor).setScale(this.meta.scale).play('dance_3'),
    ];
    this.menuMundos.forEach((s) => s.setDepth(s.y));
  }

  // diff: easy | normal | hard | faker | twins(보통 봇 둘)
  startMatch({ diff }, source = 'menu') {
    Sound.unlock();
    this.clearMatch();
    this.setMode('bot');
    this.twins = diff === 'twins';
    this.diff = this.twins ? 'normal' : diff;
    this.player = new Champ(this, { team: 0, isPlayer: true });
    this.enemies = Array.from({ length: this.twins ? 2 : 1 }, () => new Champ(this, { team: 1, isPlayer: false }));
    this.enemies.forEach((e, i) => { e.hudSlot = i + 1; });
    this.enemy = this.enemies[0];
    this.champs = [this.player, ...this.enemies];
    this.score = [0, 0];
    this.round = 1;
    this.matchTime = 0;
    HUD.clearFeeds();
    HUD.show(true, this.twins);
    this.startRound();
    this.analyticsMatch = {
      match_id: createTrackingId(),
      difficulty: diff,
      source,
      ...referralContext,
    };
    track('game_started', this.analyticsMatch);
  }

  startRound() {
    this.roundTime = 0;
    this.updateArena();
    this.clearCleavers();
    this.player.reset(-6.5, 0);
    this.enemies.forEach((e, i) => {
      const lane = this.twins ? (i ? 1 : -1) : 0;
      e.reset(6.5, lane * 4);
      initBot(e, this.diff, lane);
    });
    this.moveHeld = false;
    this.state = 'play';
    HUD.updateFight(this.champs, true);
  }

  endRound(winner) {
    this.state = 'roundEnd';
    // 판정 이후 날아가던 식칼이나 준비 중인 투척이 결과를 바꾸지 않도록 한다.
    this.clearCleavers();
    for (const champ of this.champs) champ.pending = null;
    this.endT = 3.4;
    const pt = this.player.team;
    const winnerChamp = winner === pt ? this.player : this.enemies.find(e => e.alive);
    if (winner >= 0) this.score[winner]++;
    if (winner >= 0) {
      (winner === pt ? Sound.win : Sound.lose)();
      this.time.delayedCall(700, () => {
        if (winnerChamp?.alive) { winnerChamp.celebrate = true; winnerChamp.moveTarget = null; }
      });
    }
  }

  endMatch() {
    if (this.state === 'over') return;
    this.state = 'over';
    const win = this.score[this.player.team] > this.score[this.enemy.team];
    HUD.result(win, this.twins ? 'twins' : this.diff, this.analyticsMatch);
    this.trackFinished(win);
  }

  trackFinished(win) {
    const enemyThrows = this.enemies.reduce((total, enemy) => total + enemy.stats.throws, 0);
    const enemyHits = this.enemies.reduce((total, enemy) => total + enemy.stats.hits, 0);
    track('game_finished', {
      ...this.analyticsMatch,
      result: win ? 'win' : 'loss',
      duration_seconds: Math.round(this.matchTime * 10) / 10,
      throws: this.player.stats.throws,
      hits: this.player.stats.hits,
      accuracy: this.player.stats.throws > 0
        ? this.player.stats.hits / this.player.stats.throws : 0,
      enemy_throws: enemyThrows,
      enemy_hits: enemyHits,
      enemy_accuracy: enemyThrows > 0 ? enemyHits / enemyThrows : 0,
    });
  }

  backToMenu() {
    this.clearMatch();
    this.player = null; this.enemy = null; this.enemies = [];
    HUD.show(false);
    HUD.clearFeeds();
    HUD.banner(null);
    HUD.countdown(0);
    this.setMode('bot');
    this.roundTime = 0;
    this.updateArena();
    this.spawnMenuMundos();
    this.state = 'menu';
  }

  // ---------- 온라인 1대1 (서버 판정) ----------
  setupOnlineMatch(slot, source = 'online') {
    Sound.unlock();
    this.clearMatch();
    this.setMode('online');
    this.mySlot = slot;
    // 방장(0)은 왼쪽, 친구(1)는 오른쪽. 내 캐릭터만 초록색, 따봉은 양쪽 모두.
    this.champs = [0, 1].map(team => new Champ(this, { team, isPlayer: team === slot, emote: true }));
    this.player = this.champs[slot];
    this.enemy = this.champs[1 - slot];
    this.enemies = [this.enemy];
    this.twins = false;
    this.score = [0, 0];
    this.matchTime = 0;
    this.inputSeq = 0;
    this.lastCastSeq = 0;
    this.lastFlashSeq = 0;
    this.snaps = [];
    this.snapOffset = null;
    this.moveSince = 0;
    this.correction = null;
    this.moveHeld = false;
    HUD.clearFeeds();
    HUD.show(true, false, { mySlot: slot });
    this.analyticsMatch = {
      match_id: createTrackingId(), difficulty: 'online', mode: Online.quick ? 'quick' : 'online', room: Online.room, source, ...referralContext,
    };
  }

  startOnlineRound({ round, countdownMs }) {
    this.clearCleavers();
    this.champs.forEach((c, i) => c.reset(NET.SPAWN[i].x, NET.SPAWN[i].z));
    this.snaps = [];
    this.correction = null;
    this.moveHeld = false;
    this.roundTime = 0;
    this.state = 'countdown';
    HUD.updateFight(this.champs, true);
    HUD.countdown(countdownMs);
    if (round === 1) track('game_started', this.analyticsMatch);
    else HUD.chat('동시에 쓰러졌어요! 재경기합니다.');
  }

  onlineGo() {
    if (this.mode !== 'online') return;
    this.state = 'play';
    HUD.countdown(0, true);
  }

  onlineRoundEnd(winner) {
    if (this.mode !== 'online') return;
    this.state = 'roundEnd';
    this.clearCleavers();
    for (const champ of this.champs) champ.pending = null;
    this.moveHeld = false;
    if (winner >= 0) (winner === this.mySlot ? Sound.win : Sound.lose)();
  }

  onlineOver(winner) {
    if (this.mode !== 'online' || this.state === 'over') return;
    this.state = 'over';
    const win = winner === this.mySlot;
    HUD.onlineResult(win ? 'win' : 'lose', { quick: Online.quick, room: Online.room });
    this.trackFinished(win);
  }

  // 상대가 끝내 돌아오지 않았거나 나감
  onlineOpponentLeft() {
    if (this.mode !== 'online') return;
    const wasOver = this.state === 'over';
    // 빠른 대전은 경기가 끝나면 서로 새 상대를 찾아 떠나므로 결과 화면을 그대로 둔다
    if (wasOver && Online.quick) return;
    this.state = 'over';
    this.netPaused = false;
    HUD.banner(null);
    HUD.countdown(0);
    HUD.onlineResult('left', { quick: Online.quick, room: Online.room });
    if (!wasOver) track('online_opponent_left', this.analyticsMatch);
  }

  setNetPaused(paused) {
    this.netPaused = paused;
    if (paused) this.moveHeld = false;
  }

  // 서버 스냅샷: 상대는 보간 버퍼에 넣고, 나는 예측 위치를 서버 결과 쪽으로 보정한다.
  applySnap(msg) {
    if (this.mode !== 'online' || !this.player) return;
    const now = Online.serverNow();
    const states = msg.c.map(unpackChamp);
    this.setNetPaused(!!msg.p);
    if (['countdown', 'play', 'roundEnd'].includes(msg.ph) && this.state !== 'over' && this.state !== msg.ph) {
      if (msg.ph === 'play') this.onlineGo();
      else this.state = msg.ph;
    }

    // 상대 재생 시계: 서버 시각과 도착 시각의 차이를 부드럽게 따라가 지연 크기와 상관없이 보간한다
    const arrival = msg.t - performance.now();
    this.snapOffset = this.snapOffset == null ? arrival : this.snapOffset + (arrival - this.snapOffset) * 0.05;
    const other = states[1 - this.mySlot];
    this.snaps.push({ t: msg.t, s: other });
    if (this.snaps.length > 40) this.snaps.shift();

    const me = this.player, s = states[this.mySlot];
    me.hp = s.hp;
    me.slowT = s.slowT;
    me.ghostT = s.ghostT;
    me.celebrate = s.celebrate;
    if (msg.ack >= this.lastCastSeq) Object.assign(me, { qCd: s.qCd, flashCd: s.flashCd, ghostCd: s.ghostCd });
    if (me.alive && !s.alive) { me.alive = false; me.hp = 0; this.knockOut(me); }
    if (me.celebrate) me.moveTarget = null;
    if (me.alive && msg.ack >= this.lastFlashSeq) {
      // 서버 위치를 '지금'까지 내 이동 목표 쪽으로 진행시켜 비교한다 (이동 중 뒤로 당겨지지 않게).
      // 내가 출발한 지 얼마 안 됐으면 서버는 아직 출발 전이므로 그만큼만, 서버가 투척 준비 중이면 그 시간만큼 덜 진행한다.
      const sinceMove = (performance.now() - this.moveSince) / 1000;
      const ahead = Math.min(0.3, Online.rtt / 2000 + Math.max(0, now - msg.t) / 1000, sinceMove);
      const advance = Math.max(0, ahead - Math.max(0, s.castT));
      let tx = s.x, tz = s.z;
      const target = me.moveTarget;
      if (target && advance > 0 && this.state === 'play') {
        const dx = target.x - tx, dz = target.z - tz, l = Math.hypot(dx, dz);
        const step = Math.min(l, Sim.champSpeed(s) * advance);
        if (l > 0) { tx += (dx / l) * step; tz += (dz / l) * step; }
      }
      // 이동 중에는 시계 추정 오차만큼의 차이는 무시하고(뒤로 끌려가는 떨림 방지), 크게 어긋날 때만 맞춘다.
      const ex = tx - me.x, ez = tz - me.z, err = Math.hypot(ex, ez);
      const tolerance = me.moveTarget ? 0.35 : 0.05;
      if (err > 1.5) { me.x = tx; me.z = tz; this.correction = null; }
      else if (err > tolerance) this.correction = { x: ex, z: ez };
      else this.correction = null;
    }

    // 식칼: 서버 목록 기준으로 생성·제거, 위치는 경과 시간만큼 앞으로
    const lead = (Math.max(0, now - msg.t) / 1000) * RULES.q.speed;
    const ids = new Set();
    for (const a of msg.k) {
      const k = unpackCleaver(a);
      ids.add(k.id);
      let cl = this.cleavers.find(p => p.id === k.id);
      if (!cl) {
        cl = { ...k, age: 0, alive: true };
        this.cleavers.push(cl);
      }
      Object.assign(cl, { x: k.x + k.dx * lead, z: k.z + k.dz * lead, dist: k.dist + lead });
      if (!cl.view) cl.view = new CleaverView(this, cl);
    }
    for (const cl of [...this.cleavers]) if (!ids.has(cl.id)) this.removeCleaver(cl.id);
  }

  // 상대는 ~100ms 이전 시점을 두 스냅샷 사이에서 보간해 부드럽게 그린다.
  interpolateOpponent(dt) {
    const e = this.enemy, buf = this.snaps;
    if (!buf.length) return;
    const t = performance.now() + (this.snapOffset ?? 0) - INTERP_MS;
    let a = buf[0], b = buf[0];
    for (let i = buf.length - 1; i >= 0; i--) {
      if (buf[i].t <= t) { a = buf[i]; b = buf[i + 1] || buf[i]; break; }
    }
    const k = b.t > a.t ? clamp((t - a.t) / (b.t - a.t), 0, 1) : 1;
    const px = e.x, pz = e.z;
    e.x = a.s.x + (b.s.x - a.s.x) * k;
    e.z = a.s.z + (b.s.z - a.s.z) * k;
    if (dt > 0) { e.vx = (e.x - px) / dt; e.vz = (e.z - pz) / dt; }
    const latest = buf[buf.length - 1].s;
    Object.assign(e, {
      hp: latest.hp, qCd: latest.qCd, flashCd: latest.flashCd, ghostCd: latest.ghostCd,
      ghostT: b.s.ghostT, slowT: b.s.slowT, celebrate: b.s.celebrate,
    });
    if (e.actionT <= 0 && Math.hypot(e.vx, e.vz) > 0.4) e.facing = Math.atan2(e.vz, e.vx);
    else if (e.actionT <= 0 && !e.celebrate) e.facing = b.s.facing;
    if (e.alive && !latest.alive) { e.alive = false; e.hp = 0; this.knockOut(e); }
  }

  updateOnline(dt) {
    const p = this.player;
    const active = !this.netPaused;
    if (active && this.state === 'play') {
      this.matchTime += dt;
      this.roundTime += dt;
    }
    if (this.moveHeld && this.canControl()) {
      this.moveRepeatT -= dt;
      if (this.moveRepeatT <= 0) {
        this.moveRepeatT = 0.08;
        this.setMoveTarget(this.pointerGround());
      }
    }
    if (active) {
      this.updateChamp(p, dt);
      if (this.correction && p.alive) {
        // 남은 오차의 일부씩, 초당 최대 3유닛까지만 밀어 순간이동처럼 보이지 않게 한다
        const err = Math.hypot(this.correction.x, this.correction.z);
        const f = Math.min(1, dt * 10, (3 * dt) / Math.max(err, 1e-6));
        const cx = this.correction.x * f, cz = this.correction.z * f;
        p.x += cx; p.z += cz;
        this.correction.x -= cx; this.correction.z -= cz;
        this.constrain(p, p);
      }
      this.interpolateOpponent(dt);
      this.updateChamp(this.enemy, dt);
      for (const cl of this.cleavers) this.updateCleaver(cl, dt);
    }
    for (const c of this.champs) c.sync();
    HUD.update(p);
    HUD.updateFight(this.champs);
  }

  // ---------- 업데이트 ----------
  update(time, deltaMs) {
    const dt = Math.min(deltaMs / 1000, 0.05);
    this.time0 += dt;
    this.water.setUniform('uTime.value', this.time0);
    const watched = this.champs.find(c => c.alive && c.actionT > 0) || this.player;
    this.baron.update(this.time0, dt, watched ? sx(watched.x) : Math.sin(this.time0 * 0.45) * 400);

    if (this.mode === 'online') {
      if (this.champs.length) this.updateOnline(dt);
    } else if (this.champs.length) {
      const playing = this.state === 'play';
      if (playing) {
        this.matchTime += dt;
        this.roundTime += dt;
        this.updateArena();
      }

      const p = this.player;
      if (this.moveHeld && p.alive && this.state === 'play') {
        this.moveRepeatT -= dt;
        if (this.moveRepeatT <= 0) {
          this.moveRepeatT = 0.08;
          p.moveTarget = this.constrain({ ...this.pointerGround() }, p);
        }
      }
      if (playing) for (const e of this.enemies) if (e.alive) updateBot(e, this, dt);

      for (const c of this.champs) this.updateChamp(c, dt);
      for (const c of this.champs) c.sync();
      for (const cl of this.cleavers) this.updateCleaver(cl, dt);
      this.cleavers = this.cleavers.filter((cl) => cl.alive);

      if (playing) {
        const winner = Sim.roundWinner(this);
        if (winner !== null) this.endRound(winner);
      }
      if (this.state === 'roundEnd') {
        this.endT -= dt;
        if (this.endT <= 0) {
          if (Math.max(...this.score) >= RULES.roundsToWin) this.endMatch();
          else { if (this.score[0] + this.score[1] >= this.round) this.round++; this.startRound(); }
        }
      }
      HUD.update(p);
      HUD.updateFight(this.champs);
    }
    this.touch?.update(dt);
    this.updateCamera(dt);
  }

  updateChamp(c, dt) {
    c.hitFlash = Math.max(0, c.hitFlash - dt);
    c.hitStop = Math.max(0, c.hitStop - dt);
    if (c.hitStop <= 0) {
      const k = Math.exp(-dt * HIT_STOP.catchUp);
      c.lagX *= k; c.lagY *= k;
    }
    c.emoteT = Math.max(0, c.emoteT - dt);
    if (c.emoteDelayT > 0) {
      c.emoteDelayT = Math.max(0, c.emoteDelayT - dt);
      if (c.emoteDelayT === 0 && c.alive) c.emoteT = EMOTE_DURATION;
    }
    let moving;
    if (this.mode === 'online' && c !== this.player) {
      // 상대는 서버 스냅샷 보간으로 움직인다
      c.actionT = Math.max(0, c.actionT - dt);
      moving = Math.hypot(c.vx, c.vz) > 0.4;
    } else {
      moving = Sim.updateChamp(this, c, dt);
      this.flushFeed();
    }

    if (!c.alive) return;
    if (c.actionT > 0) { /* 투척 모션 유지 */ }
    else if (c.celebrate) c.setAnim('dance');
    else if (moving) {
      c.setAnim('run');
      // Collisions and a final short movement step must not stall the gait.
      c.sprite.anims.timeScale = c.speed() / RULES.moveSpeed;
    }
    else c.setAnim('idle');

    if (moving) {
      c.rippleT -= dt;
      if (c.rippleT <= 0) {
        c.rippleT = 0.26;
        this.ripple(c.x, c.z);
        this.fx.splash.explode(3, sx(c.x) + rand(-8, 8), sy(c.z));
      }
      if (c.ghostT > 0) this.fx.ghost.emitParticleAt(sx(c.x) + rand(-12, 12), sy(c.z, rand(0.3, 2)), 1);
    }
  }

  updateCleaver(p, dt) {
    Sim.updateCleaver(this, p, dt);
    this.flushFeed();
    if (!p.view) return;
    if (!p.alive) { p.view.destroy(); p.view = null; return; }
    p.view.img.rotation += dt * 24 * (p.dx >= 0 ? 1 : -1);
    p.view.sync(p);
    this.fx.trail.emitParticleAt(sx(p.x), sy(p.z, RULES.q.height), 1);
  }

  // 빗나간 식칼: 사거리 끝에서 물보라와 물결(암벽이면 불꽃)과 소리만 낸다
  missFx(x, z, rock) {
    const X = sx(x), Y = sy(z), vol = this.volAt(x, z);
    if (rock) {
      this.fx.spark.explode(10, X, Y);
      Sound.clank(vol);
      return;
    }
    this.fx.splash.explode(14, X, Y);
    this.ripple(x, z);
    this.time.delayedCall(140, () => this.ripple(x, z));
    Sound.splash(vol);
  }

  ripple(x, z) {
    const r = this.add.image(sx(x), sy(z), 'ripple').setDepth(DEPTH.decal - 1).setAlpha(0.45);
    r.setScale(0.25, 0.25 * SIN);
    this.tweens.add({ targets: r, scaleX: 0.75, scaleY: 0.75 * SIN, alpha: 0, duration: 750, onComplete: () => r.destroy() });
  }

  updateCamera(dt = 0) {
    // 경기장 전체(암벽 + 캐릭터 머리 높이)가 상단바·하단 HUD를 피해 한 화면에 들어오도록 고정
    const cam = this.cameras.main;
    // 터치 가로 화면은 상단바·조이스틱·스킬이 양옆 구석에 있으니 위아래를 거의 비우지 않는다
    const landscape = this.touchMode && cam.width > cam.height;
    const padTop = (landscape ? 8 : 110) * DPR, padBot = (landscape ? 22 : 120) * DPR;
    const halfW = (ARENA.ROCK_R + 1) * PPU;
    const top = sy(-ARENA.ROCK_R, 3.2), bot = sy(ARENA.ROCK_R) + 0.5 * PPU;
    const zoom = Math.min(cam.width / (halfW * 2), (cam.height - padTop - padBot) / (bot - top));
    cam.setZoom(zoom);
    // 카메라를 반대로 밀어 화면 속 경기장이 식칼 방향으로 튕기게 한다
    const kick = this.updateCamKick(dt);
    const centerX = -kick.x, centerY = (top + bot) / 2 - (padTop - padBot) / 2 / zoom - kick.y;
    cam.centerOn(centerX, centerY);
    const width = Math.ceil(cam.width / zoom) + 4, height = Math.ceil(cam.height / zoom) + 4;
    const x = centerX - width / 2, y = centerY - height / 2;
    this.bank.setPosition(x, y).setSize(width, height);
    this.bank.tilePositionX = x;
    this.bank.tilePositionY = y;
  }
}

// ---------------------------------------------------------------------------
// Canvas text must be created after the bundled cartoon font is ready.
await document.fonts.load('16px Jua').catch(() => {});
const game = new Phaser.Game({
  type: Phaser.WEBGL,
  parent: 'game',
  backgroundColor: '#293b43',
  scale: { mode: Phaser.Scale.NONE, width: window.innerWidth * DPR, height: window.innerHeight * DPR, zoom: 1 / DPR },
  render: { antialias: true },
  fps: { target: 60 },
  scene: [GameScene],
});
window.__game = game;
window.__mundoOnline = Online;
window.addEventListener('resize', () => game.scale.resize(window.innerWidth * DPR, window.innerHeight * DPR));

// 메뉴 DOM
const opts = { diff: 'normal' };
for (const [id, key, parse] of [['opt-diff', 'diff', String]]) {
  const seg = document.getElementById(id);
  seg.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    seg.querySelectorAll('button').forEach((x) => {
      x.classList.toggle('on', x === b);
      x.setAttribute('aria-pressed', String(x === b));
    });
    opts[key] = parse(b.dataset.v);
  });
}
const scene = () => game.scene.getScene('game');
document.getElementById('start-btn').addEventListener('click', async (event) => {
  const button = event.currentTarget;
  const menu = document.getElementById('menu');
  button.disabled = true;
  scene().startMatch(opts);
  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    await menu.animate([{ opacity: 1 }, { opacity: 0 }], {
      duration: 240, easing: 'ease-out', fill: 'forwards',
    }).finished;
  }
  menu.classList.add('hidden');
  menu.getAnimations().forEach(animation => animation.cancel());
  button.disabled = false;
});
const $ = (id) => document.getElementById(id);
function selectMenuView(view = 'modes') {
  const practice = view === 'practice';
  if (view !== 'quick-match') stopQuickSearch();
  $('menu').classList.toggle('practice-view', practice);
  $('menu').classList.toggle('quick-match-view', view === 'quick-match');
  $('practice-heading').classList.toggle('hidden', !practice);
  $('mode-select').classList.toggle('hidden', view !== 'modes');
  $('practice-select').classList.toggle('hidden', !practice);
  $('quick-match-notice').classList.toggle('hidden', view !== 'quick-match');
  $('select-title').textContent = practice ? '인공지능 상대 연습' : '게임 모드 선택';
  $('difficulty-label').textContent = practice ? '시간이 지날수록 경기장이 좁아집니다.' : '어떤 모드를 플레이할까요?';
}
// ---------- 빠른 대전 ----------
let quickSearchTimer = null;
const stopQuickSearch = () => clearInterval(quickSearchTimer);
function startQuickSearch() {
  Sound.unlock();
  stopQuickSearch();
  selectMenuView('quick-match');
  $('quick-match-notice').dataset.state = 'searching';
  $('quick-match-title').textContent = '상대를 찾는 중…';
  $('quick-match-back-btn').textContent = '취소';
  const start = performance.now();
  const tick = () => {
    const sec = Math.floor((performance.now() - start) / 1000);
    $('quick-match-elapsed').textContent = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
  };
  tick();
  quickSearchTimer = setInterval(tick, 250);
  $('quick-match-back-btn').focus();
  Online.quickMatch();
}
$('quick-match-btn').addEventListener('click', () => {
  track('quick_match_clicked', referralContext);
  startQuickSearch();
});
$('quick-match-back-btn').addEventListener('click', () => {
  if ($('quick-match-notice').dataset.state === 'searching') track('quick_match_cancelled', referralContext);
  stopQuickSearch();
  Online.cancelQueue();
  selectMenuView();
  $('quick-match-btn').focus();
});
$('practice-btn').addEventListener('click', () => {
  selectMenuView('practice');
  $('opt-diff').querySelector('button.on').focus();
});
$('mode-back-btn').addEventListener('click', () => {
  selectMenuView();
  $('practice-btn').focus();
});
// 대인전 재대결 안내: 승자는 가르쳐주고 패자는 배운다
const rematchStatus = (kind) => {
  const won = $('result').dataset.outcome === 'win';
  if (kind === 'wanted') return won ? '상대방이 한 수 더 배우고 싶대요!' : '상대방이 한 수 더 가르쳐주겠대요!';
  return won ? '상대방이 배우러 오길 기다리는 중…' : '상대방이 가르쳐주길 기다리는 중…';
};
$('again-btn').addEventListener('click', () => {
  if (scene().mode === 'online' && Online.quick) {
    track('quick_match_next', scene().analyticsMatch);
    Online.leave();
    $('result').classList.add('hidden');
    $('menu').classList.remove('hidden');
    scene().backToMenu();
    startQuickSearch();
    return;
  }
  if (scene().mode === 'online') {
    track('online_rematch_clicked', scene().analyticsMatch);
    $('again-btn').disabled = true;
    HUD.resultStatus(rematchStatus('waiting'));
    Online.rematch();
    return;
  }
  track('replay_clicked', scene().analyticsMatch);
  $('result').classList.add('hidden');
  scene().startMatch(opts, 'replay');
});
$('menu-btn').addEventListener('click', () => {
  track('menu_returned', scene().analyticsMatch);
  if (scene().mode === 'online') Online.leave();
  $('result').classList.add('hidden');
  selectMenuView();
  $('menu').classList.remove('hidden');
  scene().backToMenu();
});

// ---------- 친구와 대결 ----------
const showMenu = () => {
  $('result').classList.add('hidden');
  selectMenuView();
  $('menu').classList.remove('hidden');
  if (scene().mode === 'online' || scene().champs.length) scene().backToMenu();
};
$('online-btn').addEventListener('click', () => {
  Sound.unlock();
  $('menu').classList.add('hidden');
  Online.openLobby();
});

Online.hooks = {
  onExit: showMenu,
  onLobby: () => {
    // 재대결 대신 대기실로 돌아온 경우 (예: 서버 재시작 후 새 방)
    $('result').classList.add('hidden');
    if (scene().mode === 'online') scene().backToMenu();
    $('menu').classList.add('hidden');
  },
  onQuickError: (text) => {
    stopQuickSearch();
    $('quick-match-notice').dataset.state = 'error';
    $('quick-match-title').textContent = text;
    $('quick-match-back-btn').textContent = '뒤로가기';
  },
  onStart: (msg) => {
    stopQuickSearch();
    const s = scene();
    $('menu').classList.add('hidden');
    $('result').classList.add('hidden');
    if (s.mode !== 'online' || msg.round === 1) s.setupOnlineMatch(Online.slot, Online.quick ? 'quick' : s.mode === 'online' ? 'rematch' : 'online');
    s.startOnlineRound(msg);
  },
  // 새로고침·재연결로 진행 중인 경기에 다시 들어옴
  onResume: (msg) => {
    stopQuickSearch();
    const s = scene();
    $('menu').classList.add('hidden');
    HUD.banner(null);
    if (s.mode !== 'online') {
      s.setupOnlineMatch(Online.slot, 'resume');
      s.champs.forEach((c, i) => c.reset(NET.SPAWN[i].x, NET.SPAWN[i].z));
      s.state = msg.phase === 'over' ? 'roundEnd' : msg.phase;
    }
    s.setNetPaused(!!msg.paused);
    if (msg.paused) HUD.banner('상대방 연결을 기다려요');
  },
  onGo: () => scene().onlineGo(),
  onSnap: (msg) => scene().applySnap(msg),
  onEvents: (list) => {
    const s = scene();
    if (s.mode === 'online' && s.champs.length) for (const e of list) s.showEvent(e, true);
  },
  onRoundEnd: (winner) => scene().onlineRoundEnd(winner),
  onOver: (winner) => scene().onlineOver(winner),
  onRematch: (want) => {
    if (scene().mode !== 'online' || $('result').classList.contains('hidden')) return;
    const mine = want[Online.slot], theirs = want[1 - Online.slot];
    if (theirs && !mine) HUD.resultStatus(rematchStatus('wanted'));
    else if (mine && !theirs) HUD.resultStatus(rematchStatus('waiting'));
  },
  onAway: (graceMs) => {
    scene().setNetPaused(true);
    const end = performance.now() + graceMs;
    clearInterval(awayTimer);
    const tick = () => {
      const left = Math.max(0, Math.ceil((end - performance.now()) / 1000));
      HUD.banner('상대방 연결이 끊겼어요', { detail: '', seconds: left });
    };
    tick();
    awayTimer = setInterval(tick, 250);
  },
  onBack: () => {
    clearInterval(awayTimer);
    scene().setNetPaused(false);
    HUD.banner('상대방이 다시 돌아왔어요!', { state: 'back', detail: '' });
  },
  onOpponentLeft: () => {
    clearInterval(awayTimer);
    const s = scene();
    if (s.mode === 'online' && s.champs.length) s.onlineOpponentLeft();
    else if (!$('lobby').classList.contains('hidden')) Online.renderLobby();
  },
  onReconnecting: () => {
    scene().setNetPaused(true);
    HUD.banner('다시 연결하고 있어요', { detail: '연결되면 대결을 이어서 할 수 있어요.' });
  },
  onReconnected: () => {
    HUD.banner(null);
  },
  onLost: () => {
    clearInterval(awayTimer);
    showMenu();
    HUD.chat('서버 연결이 끊겨서 메뉴로 돌아왔어요.');
  },
};
let awayTimer = null;

// 초대 링크(?room=CODE)로 들어오면 메뉴 대신 바로 대기실로
game.events.once('mundo-ready', () => {
  const code = roomFromUrl();
  if (code) Online.join(code);
  else $('menu').classList.remove('hidden');
});
