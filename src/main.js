// 문도 피구 — Phaser 2.5D 봇전
// 월드 로직은 지면 좌표 (x, z)에서 돌고, 화면에는 PROJ 투영으로 그린다. 깊이는 화면 y 로 정렬.
import { PROJ, ARENA } from './config.js';
import { RULES } from './rules.js';
import { initBot, updateBot } from './bot.js';
import { HUD } from './hud.js';
import { Sound } from './sound.js';
import { THROW } from './throw-motion.js';
import { createBaron } from './baron.js';
import { track, createTrackingId, referralContext } from './analytics.js';

const { PPU, SIN, COS } = PROJ;
const sx = (x) => x * PPU;
const sy = (z, y = 0) => (z * SIN - y * COS) * PPU;
const DEPTH = { water: -1000, arena: -900, decal: -800, ring: -700, fx: 5000, ui: 10000 };
const BAR_OFF = 154;
const EMOTE_DELAY = 0.25;
const EMOTE_DURATION = 1;
const EMOTE_SIZE = 104;
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
// Render at the display's physical pixel density so Retina screens are not upscaled.
const DPR = Math.min(window.devicePixelRatio || 1, 3);

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
varying vec2 outTexCoord;

void main() {
  vec2 s = uOrigin + vec2(outTexCoord.x, 1.0 - outTexCoord.y) * uSize;
  vec2 g = vec2(s.x / uPPU, s.y / (uPPU * uSin));
  float r = length(g);
  float boundaryR = g.x < 0.0 ? uR : uInitialR;
  if (r > uBankR) discard;
  vec3 col = mix(vec3(0.19, 0.39, 0.49), vec3(0.23, 0.40, 0.48), smoothstep(-1.2, 1.2, g.x));
  // Sparse, graphic ripples instead of realistic caustics.
  vec2 cell = vec2(g.x + sin(g.y * 1.8) * 0.23 + uTime * 0.12, g.y);
  vec2 tile = mod(cell + vec2(floor(g.y / 2.1) * 1.3, 0.0), vec2(3.8, 2.1));
  float wave = abs(tile.y - 1.05 - sin(tile.x * 2.4) * 0.055);
  float dash = smoothstep(0.2, 0.4, tile.x) * (1.0 - smoothstep(1.2, 1.5, tile.x));
  col = mix(col, vec3(0.48, 0.69, 0.73), (1.0 - smoothstep(0.025, 0.06, wave)) * dash * 0.38);
  float playerSide = 1.0 - smoothstep(-0.8, 0.0, g.x);
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
  constructor(scene, { team, isPlayer }) {
    this.scene = scene;
    this.team = team;
    this.side = team === 0 ? -1 : 1;
    this.isPlayer = isPlayer;
    this.hudSlot = team; // 상단 체력바 번호 (쌍둥이 모드의 두 번째 적은 2)
    this.stats = { kills: 0, deaths: 0, throws: 0, hits: 0 };
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
    if (!isPlayer) {
      this.emote = scene.add.image(0, 0, 'mundo-emote')
        .setDisplaySize(EMOTE_SIZE, EMOTE_SIZE).setDepth(DEPTH.ui + 2).setVisible(false);
    }
  }

  reset(x, z) {
    Object.assign(this, {
      x, z, vx: 0, vz: 0, hp: RULES.maxHp, alive: true,
      qCd: rand(0.6, 1.2), flashCd: 0, ghostCd: 0, ghostT: 0, slowT: 0,
      castT: 0, pending: null, moveTarget: null, actionT: 0, hitFlash: 0, rippleT: 0,
      celebrate: false, facing: this.team === 0 ? 0 : Math.PI, lastHp: -1, animKey: null,
      tintState: '', emoteT: 0, emoteDelayT: 0,
    });
    this.sprite.setAlpha(1).clearTint();
    this.ring.setVisible(true);
    this.bar.setVisible(true);
    this.shadow.setAlpha(0.6);
    this.setAnim('idle', true);
    this.sync();
  }

  speed() {
    return RULES.moveSpeed * (this.ghostT > 0 ? RULES.ghost.mul : 1) * (this.slowT > 0 ? 1 - RULES.q.slow : 1);
  }

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
    const X = sx(this.x), Y = sy(this.z);
    this.sprite.setPosition(X, Y).setDepth(this.alive ? Y : Y - 40);
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

class Cleaver {
  constructor(scene, owner, dx, dz) {
    Object.assign(this, { owner, team: owner.team, dx, dz, dist: 0, age: 0, alive: true });
    this.x = owner.x + dx * 0.6;
    this.z = owner.z + dz * 0.6;
    this.cont = scene.add.container(0, 0);
    this.img = scene.add.image(0, 0, 'cleaver').setDisplaySize(72, 43.2).setRotation(Math.atan2(dz * SIN, dx));
    this.cont.add(this.img);
    this.shadow = scene.add.image(0, 0, 'shadow').setDepth(DEPTH.decal).setAlpha(0.5);
    this.shadow.setDisplaySize(1.6 * PPU, 1.6 * PPU * SIN);
    this.cont.setPosition(sx(this.x), sy(this.z, RULES.q.height)).setDepth(sy(this.z) + 2);
    this.shadow.setPosition(sx(this.x), sy(this.z));
  }
  destroy() {
    this.alive = false;
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
    this.spawnMenuMundos();
    this.state = 'menu';
    document.getElementById('loading').classList.add('hidden');
    document.getElementById('menu').classList.remove('hidden');
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
      blood: P({ speed: { min: 60, max: 240 }, angle: { min: 180, max: 360 }, gravityY: 520, lifespan: 650, scale: { start: 0.55, end: 0.1 }, tint: [0xff2a2a, 0xb00000, 0x9a2fd0] }),
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
    this.input.on('pointerdown', (p) => {
      Sound.unlock();
      if (!this.player || !this.player.alive || this.state !== 'play') return;
      this.moveHeld = true;
      this.moveRepeatT = 0.1;
      const g = this.pointerGround();
      this.player.moveTarget = this.constrain({ ...g }, this.player);
      this.clickMarker(g.x, g.z);
    });
    this.input.on('pointerup', (p) => {
      if (!p.leftButtonDown() && !p.rightButtonDown()) this.moveHeld = false;
    });
    this.input.keyboard.on('keydown', (e) => {
      if (e.repeat) return;
      Sound.unlock();
      const p = this.player;
      if (e.code === 'KeyM') { Sound.toggleMute(); HUD.chat(Sound.muted ? '소리 끔' : '소리 켬'); return; }
      if (!p || !p.alive || this.state !== 'play') return;
      const g = this.pointerGround();
      if (e.code === 'KeyQ') this.castQ(p, g.x, g.z);
      else if (e.code === 'KeyD') this.castFlash(p, g.x, g.z);
      else if (e.code === 'KeyF') this.castGhost(p);
      else if (e.code === 'KeyS') { p.moveTarget = null; this.moveHeld = false; }
    });
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

  // ---------- 규칙 ----------
  updateArena() {
    const { delay, duration, minScale } = RULES.shrink;
    const progress = clamp((this.roundTime - delay) / duration, 0, 1);
    this.arenaR = RULES.arenaR * (1 - (1 - minScale) * progress);
    this.water.setUniform('uR.value', this.arenaR);
  }

  constrain(p, champ) {
    const s = champ.side;
    const minX = RULES.midGap + RULES.champR;
    const maxR = (champ.isPlayer ? this.arenaR : RULES.arenaR) - RULES.champR * 0.5;
    if (p.x * s < minX) p.x = s * minX;
    const r = Math.hypot(p.x, p.z);
    if (r > maxR) { p.x *= maxR / r; p.z *= maxR / r; }
    if (p.x * s < minX) {
      p.x = s * minX;
      const zMax = Math.sqrt(maxR * maxR - minX * minX);
      p.z = clamp(p.z, -zMax, zMax);
    }
    return p;
  }

  castQ(c, tx, tz) {
    if (this.state !== 'play' || !c.alive || c.qCd > 0 || c.castT > 0) return false;
    let dx = tx - c.x, dz = tz - c.z;
    let l = Math.hypot(dx, dz);
    if (l < 0.01) { dx = Math.cos(c.facing); dz = Math.sin(c.facing); l = 1; }
    dx /= l; dz /= l;
    c.facing = Math.atan2(dz, dx);
    c.qCd = RULES.q.cd;
    const paid = Math.min(RULES.q.cost, Math.max(0, c.hp - 1)); // 체력 비용으로 스스로 죽지 않음(최소 1)
    c.hp -= paid;
    c.castT = RULES.q.windup;
    c.pending = { dx, dz, paid };
    c.actionT = THROW.duration;
    c.setAnim('throw', true);
    return true;
  }

  castFlash(c, tx, tz) {
    if (this.state !== 'play' || !c.alive || c.flashCd > 0) return false;
    let dx = tx - c.x, dz = tz - c.z;
    const l = Math.hypot(dx, dz);
    if (l < 0.01) { dx = Math.cos(c.facing); dz = Math.sin(c.facing); } else { dx /= l; dz /= l; }
    const d = Math.min(Math.max(l, 1.5), RULES.flash.dist);
    this.fx.spark.explode(16, sx(c.x), sy(c.z, 1));
    const to = this.constrain({ x: c.x + dx * d, z: c.z + dz * d }, c);
    c.x = to.x; c.z = to.z;
    c.facing = Math.atan2(dz, dx);
    c.flashCd = RULES.flash.cd;
    if (c.isPlayer) { c.moveTarget = null; this.moveHeld = false; }
    this.fx.spark.explode(22, sx(c.x), sy(c.z, 1));
    Sound.flash(this.vol(c));
    return true;
  }

  castGhost(c) {
    if (this.state !== 'play' || !c.alive || c.ghostCd > 0) return false;
    c.ghostT = RULES.ghost.dur;
    c.ghostCd = RULES.ghost.cd;
    this.fx.ghost.explode(20, sx(c.x), sy(c.z, 1));
    Sound.ghost(this.vol(c));
    return true;
  }

  vol(c) {
    const p = this.player;
    if (!p || c === p) return 1;
    return clamp(1.1 - Math.hypot(c.x - p.x, c.z - p.z) / 25, 0.25, 0.8);
  }

  hit(victim, cleaver) {
    const k = cleaver.owner;
    const dmg = Math.round(Math.max(RULES.q.dmgMin, victim.hp * RULES.q.dmgPct));
    victim.hp -= dmg;
    if (k.alive) k.hp = Math.min(RULES.maxHp, k.hp + cleaver.paid);
    victim.slowT = RULES.q.slowDur;
    victim.hitFlash = 0.14;
    k.stats.hits++;
    k.showEmote();
    const X = sx(victim.x), Y = sy(victim.z, 1.3);
    this.fx.hitflash.explode(1, X, Y);
    this.fx.blood.explode(18, X, Y);
    const txt = this.add.text(X + rand(-10, 10), Y - 30, `${dmg}`, {
      fontFamily: 'Jua', fontSize: '24px', fontStyle: '900',
      color: victim.isPlayer ? '#ff5a5a' : '#ffd24a', stroke: '#000', strokeThickness: 4,
    }).setOrigin(0.5).setDepth(DEPTH.ui + 1).setScale(1.5).setResolution(DPR * 2);
    this.tweens.add({ targets: txt, y: txt.y - 46, scale: 1, alpha: 0, duration: 950, ease: 'Cubic.easeOut', onComplete: () => txt.destroy() });
    Sound.hit(Math.max(this.vol(victim), this.vol(k)));
    if (k === this.player || victim === this.player) this.cameras.main.shake(110, victim === this.player ? 0.006 : 0.003);
    if (victim.hp <= 0) this.kill(victim, k);
  }

  kill(v, k) {
    v.hp = 0;
    v.alive = false;
    v.emoteT = 0;
    v.emoteDelayT = 0;
    v.emote?.setVisible(false);
    v.moveTarget = null;
    v.pending = null;
    v.castT = 0;
    v.setAnim('death', true);
    v.ring.setVisible(false);
    v.bar.setVisible(false);
    v.shadow.setAlpha(0.35);
    this.fx.puff.explode(16, sx(v.x), sy(v.z, 0.8));
    k.stats.kills++;
    v.stats.deaths++;
    Sound.death(this.vol(v));
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
    this.menuMundos?.forEach((s) => s.destroy());
    this.menuMundos = null;
    for (const c of this.champs) c.destroy();
    for (const p of this.cleavers) p.destroy();
    this.cleavers = [];
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
    for (const p of this.cleavers) p.destroy();
    this.cleavers = [];
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
    for (const cleaver of this.cleavers) cleaver.destroy();
    this.cleavers = [];
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
    for (const c of this.champs) c.destroy();
    for (const p of this.cleavers) p.destroy();
    this.champs = []; this.cleavers = []; this.player = null; this.enemy = null; this.enemies = [];
    HUD.show(false);
    HUD.clearFeeds();
    this.roundTime = 0;
    this.updateArena();
    this.spawnMenuMundos();
    this.state = 'menu';
  }

  // ---------- 업데이트 ----------
  update(time, deltaMs) {
    const dt = Math.min(deltaMs / 1000, 0.05);
    this.time0 += dt;
    this.water.setUniform('uTime.value', this.time0);
    const watched = this.champs.find(c => c.alive && c.actionT > 0) || this.player;
    this.baron.update(this.time0, dt, watched ? sx(watched.x) : Math.sin(this.time0 * 0.45) * 400);

    if (this.champs.length) {
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
        const [a, b] = [p.alive, this.enemies.some(e => e.alive)];
        if (!a || !b) this.endRound(a ? 0 : b ? 1 : -1);
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
    this.updateCamera();
  }

  updateChamp(c, dt) {
    c.qCd = Math.max(0, c.qCd - dt);
    c.flashCd = Math.max(0, c.flashCd - dt);
    c.ghostCd = Math.max(0, c.ghostCd - dt);
    c.ghostT = Math.max(0, c.ghostT - dt);
    c.slowT = Math.max(0, c.slowT - dt);
    c.hitFlash = Math.max(0, c.hitFlash - dt);
    c.emoteT = Math.max(0, c.emoteT - dt);
    if (c.emoteDelayT > 0) {
      c.emoteDelayT = Math.max(0, c.emoteDelayT - dt);
      if (c.emoteDelayT === 0 && c.alive) c.emoteT = EMOTE_DURATION;
    }
    c.actionT = Math.max(0, c.actionT - dt);
    if (c.alive && this.state === 'play') c.hp = Math.min(RULES.maxHp, c.hp + RULES.regen * dt);

    if (c.castT > 0) {
      c.castT -= dt;
      if (c.castT <= 0 && c.pending && c.alive) {
        const cl = new Cleaver(this, c, c.pending.dx, c.pending.dz);
        cl.paid = c.pending.paid;
        this.cleavers.push(cl);
        c.stats.throws++;
        Sound.throw(this.vol(c));
        c.pending = null;
      }
    }

    const px = c.x, pz = c.z;
    if (c.moveTarget) this.constrain(c.moveTarget, c);
    if (c.alive && this.state === 'play' && c.castT <= 0 && c.moveTarget) {
      const dx = c.moveTarget.x - c.x, dz = c.moveTarget.z - c.z;
      const l = Math.hypot(dx, dz);
      if (l < 0.06) c.moveTarget = null;
      else {
        const step = Math.min(l, c.speed() * dt);
        c.x += (dx / l) * step;
        c.z += (dz / l) * step;
        if (c.actionT <= 0) c.facing = Math.atan2(dz, dx);
      }
    }
    if (c.alive) this.constrain(c, c);
    c.vx = (c.x - px) / dt;
    c.vz = (c.z - pz) / dt;
    const moving = Math.hypot(c.vx, c.vz) > 0.4;

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
    const step = RULES.q.speed * dt;
    p.x += p.dx * step;
    p.z += p.dz * step;
    p.dist += step;
    p.age += dt;
    p.img.rotation += dt * 24 * (p.dx >= 0 ? 1 : -1);
    const X = sx(p.x), Y = sy(p.z, RULES.q.height);
    p.cont.setPosition(X, Y).setDepth(sy(p.z) + 2);
    p.shadow.setPosition(X, sy(p.z));
    this.fx.trail.emitParticleAt(X, Y, 1);

    if (this.state === 'play') {
      const hitR = RULES.q.width + RULES.champR;
      for (const e of this.champs) {
        if (e.team === p.owner.team || !e.alive) continue;
        if (Math.hypot(e.x - p.x, e.z - p.z) < hitR) {
          this.hit(e, p);
          p.destroy();
          return;
        }
      }
    }
    if (p.dist >= RULES.q.range) {
      this.fx.trail.explode(6, X, Y);
      if (Math.hypot(p.x, p.z) < ARENA.ROCK_R) this.fx.splash.explode(8, sx(p.x), sy(p.z));
      p.destroy();
    }
  }

  ripple(x, z) {
    const r = this.add.image(sx(x), sy(z), 'ripple').setDepth(DEPTH.decal - 1).setAlpha(0.45);
    r.setScale(0.25, 0.25 * SIN);
    this.tweens.add({ targets: r, scaleX: 0.75, scaleY: 0.75 * SIN, alpha: 0, duration: 750, onComplete: () => r.destroy() });
  }

  updateCamera() {
    // 경기장 전체(암벽 + 캐릭터 머리 높이)가 상단바·하단 HUD를 피해 한 화면에 들어오도록 고정
    const cam = this.cameras.main;
    const padTop = 110 * DPR, padBot = 120 * DPR;
    const halfW = (ARENA.ROCK_R + 1) * PPU;
    const top = sy(-ARENA.ROCK_R, 3.2), bot = sy(ARENA.ROCK_R) + 0.5 * PPU;
    const zoom = Math.min(cam.width / (halfW * 2), (cam.height - padTop - padBot) / (bot - top));
    cam.setZoom(zoom);
    const centerY = (top + bot) / 2 - (padTop - padBot) / 2 / zoom;
    cam.centerOn(0, centerY);
    const width = Math.ceil(cam.width / zoom) + 4, height = Math.ceil(cam.height / zoom) + 4;
    const x = -width / 2, y = centerY - height / 2;
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
document.getElementById('again-btn').addEventListener('click', () => {
  track('replay_clicked', scene().analyticsMatch);
  document.getElementById('result').classList.add('hidden');
  scene().startMatch(opts, 'replay');
});
document.getElementById('menu-btn').addEventListener('click', () => {
  track('menu_returned', scene().analyticsMatch);
  document.getElementById('result').classList.add('hidden');
  document.getElementById('menu').classList.remove('hidden');
  scene().backToMenu();
});
