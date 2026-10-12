// 문도 피구 — Phaser 2.5D 봇전
// 월드 로직은 지면 좌표 (x, z)에서 돌고, 화면에는 PROJ 투영으로 그린다. 깊이는 화면 y 로 정렬.
import { PROJ, ARENA } from './config.js';
import { RULES } from './rules.js';
import { initBot, updateBot } from './bot.js';
import { HUD } from './hud.js';
import { Sound } from './sound.js';

const { PPU, SIN, COS } = PROJ;
const sx = (x) => x * PPU;
const sy = (z, y = 0) => (z * SIN - y * COS) * PPU;
const DEPTH = { water: -1000, arena: -900, line: -850, decal: -800, ring: -700, fx: 5000, ui: 10000 };
const BAR_OFF = 2.75 * COS * PPU + 22;
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

const NAMES = {
  ally: ['자운의 인턴', '근육 문도', '문도 조수', '보라색 거인'],
  enemy: ['피구왕 문도', '식칼 장인', '문도 박사', '미치광이 문도', '자운의 망나니'],
};
const QUOTES = {
  start: ['문도! 문도! 문도!', '문도 식칼 많다!', '선 넘으면 문도 화낸다!', '문도 이름 크게 불러라!', '문도 가고 싶은 데로 간다!'],
  kill: ['문도 이겼다!', '식칼 맛 어떠냐!', '문도 진찰 끝!', '하하하! 문도 최고!', '다음 환자!'],
  death: ['문도... 아프다...', '문도 다시 온다!', '이건 문도 실수 아니다!', '으어어…'],
};
const KILL_TITLES = ['', '', '더블 킬!', '트리플 킬!', '쿼드라 킬!', '펜타 킬!'];

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
varying vec2 outTexCoord;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.03; a *= 0.5; }
  return v;
}
void main() {
  vec2 s = uOrigin + vec2(outTexCoord.x, 1.0 - outTexCoord.y) * uSize;
  vec2 g = vec2(s.x / uPPU, s.y / (uPPU * uSin));
  float r = length(g);
  float t = uTime;
  float n = fbm(g * 0.22 + vec2(t * 0.04, t * 0.03));
  float c = fbm(g * 0.7 + n * 2.0 - vec2(t * 0.07, t * 0.05));
  float caus = pow(1.0 - abs(c * 2.0 - 1.0), 7.0);
  vec3 deep = vec3(0.02, 0.12, 0.18);
  vec3 mid = vec3(0.05, 0.30, 0.38);
  vec3 lite = vec3(0.50, 0.90, 0.95);
  vec3 col = mix(deep, mid, smoothstep(0.25, 0.85, n));
  col += lite * caus * 0.11;
  col += lite * pow(1.0 - abs(fbm(g * 1.6 - t * 0.1) * 2.0 - 1.0), 12.0) * 0.06;
  col *= g.x < 0.0 ? vec3(0.88, 0.96, 1.18) : vec3(1.16, 0.92, 0.96);
  col *= mix(1.0, 0.45, smoothstep(uR * 0.7, uR + 1.5, r));
  col += vec3(0.22, 0.06, 0.32) * smoothstep(uR * 0.75, uR + 1.2, r) * 0.55;
  float ring = smoothstep(0.07, 0.0, abs(r - uR * 0.5)) * 0.06 + smoothstep(0.08, 0.0, abs(r - uR)) * 0.18;
  col += vec3(0.55, 0.75, 1.0) * ring;
  gl_FragColor = vec4(col, 1.0);
}
`;

// ---------------------------------------------------------------------------
class Champ {
  constructor(scene, { team, isPlayer, name }) {
    this.scene = scene;
    this.team = team;
    this.side = team === 0 ? -1 : 1;
    this.isPlayer = isPlayer;
    this.name = name;
    this.stats = { kills: 0, deaths: 0, throws: 0, hits: 0 };
    this.color = isPlayer ? 0x5ee05e : team === 0 ? 0x3a9cff : 0xff4040;
    this.barColor = isPlayer ? 0x48c848 : team === 0 ? 0x3d8fe0 : 0xd83838;

    const meta = scene.meta;
    this.shadow = scene.add.image(0, 0, 'shadow').setDepth(DEPTH.decal);
    this.shadow.setDisplaySize(RULES.champR * 3 * PPU, RULES.champR * 3 * PPU * SIN);
    this.ring = scene.add.graphics().setDepth(DEPTH.ring);
    const rw = RULES.champR * 2.3 * PPU, rh = rw * SIN;
    this.ring.fillStyle(this.color, 0.12).fillEllipse(0, 0, rw, rh);
    this.ring.lineStyle(isPlayer ? 3 : 2, this.color, 0.95).strokeEllipse(0, 0, rw, rh);
    this.sprite = scene.add.sprite(0, 0, 'mundo', 'idle_2_0').setOrigin(0.5, meta.anchor).setScale(meta.scale);
    this.bar = scene.add.graphics().setDepth(DEPTH.ui);
    this.label = scene.add.text(0, 0, name, {
      fontFamily: 'Noto Sans KR', fontSize: '12px', fontStyle: 'bold', color: isPlayer ? '#d8ffcf' : '#ffffff',
      stroke: '#000', strokeThickness: 3,
    }).setOrigin(0.5, 1).setDepth(DEPTH.ui).setResolution(2);
  }

  reset(x, z) {
    Object.assign(this, {
      x, z, vx: 0, vz: 0, hp: RULES.maxHp, alive: true,
      qCd: rand(0.6, 1.2), flashCd: 0, ghostCd: 0, ghostT: 0, slowT: 0,
      castT: 0, pending: null, moveTarget: null, actionT: 0, hitFlash: 0, rippleT: 0,
      celebrate: false, facing: this.team === 0 ? 0 : Math.PI, lastHp: -1, animKey: null,
      lastKillAt: -99, multi: 0, tintState: '',
    });
    this.sprite.setAlpha(1).clearTint();
    this.ring.setVisible(true);
    this.bar.setVisible(true);
    this.label.setVisible(true);
    this.shadow.setAlpha(0.6);
    this.setAnim('idle', true);
    this.sync();
  }

  speed() {
    return RULES.moveSpeed * (this.ghostT > 0 ? RULES.ghost.mul : 1) * (this.slowT > 0 ? 1 - RULES.q.slow : 1);
  }

  dirIndex() {
    const d = Math.round(this.facing / (Math.PI / 4));
    return ((d % 8) + 8) % 8;
  }

  setAnim(key, force = false) {
    const full = `${key}_${this.dirIndex()}`;
    const anims = this.sprite.anims;
    if (!force && anims.currentAnim?.key === full && anims.isPlaying) return;
    if (!force && anims.currentAnim?.key === full && key === 'death') return;
    let startFrame = 0;
    // 같은 동작에서 방향만 바뀌면 프레임 위상을 유지
    if (!force && this.animKey === key && anims.currentAnim && anims.currentFrame) {
      startFrame = anims.currentAnim.frames.indexOf(anims.currentFrame);
      if (startFrame < 0) startFrame = 0;
    }
    this.sprite.play({ key: full, startFrame });
    this.sprite.anims.timeScale = 1;
    this.animKey = key;
  }

  drawBar() {
    const g = this.bar;
    const w = 74, h = 9, lv = 14;
    const x0 = -w / 2 + lv / 2;
    const frac = clamp(this.hp / RULES.maxHp, 0, 1);
    g.clear();
    g.fillStyle(0x000000, 0.9).fillRect(x0 - lv - 2, -2, w + lv + 4, h + 4);
    g.fillStyle(0x1b1b1b, 1).fillRect(x0 - lv - 1, -1, lv, h + 2);
    g.lineStyle(1, 0x8a7445, 1).strokeRect(x0 - lv - 1, -1, lv, h + 2);
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
    this.shadow.setPosition(X, Y);
    this.ring.setPosition(X, Y);
    this.bar.setPosition(X, Y - BAR_OFF);
    this.label.setPosition(X + 7, Y - BAR_OFF - 3);
    const tint = this.hitFlash > 0 ? 'hit' : this.slowT > 0 ? 'slow' : '';
    if (tint !== this.tintState) {
      this.tintState = tint;
      if (tint === 'hit') this.sprite.setTint(0xff6a6a);
      else if (tint === 'slow') this.sprite.setTint(0xa8ccff);
      else this.sprite.clearTint();
    }
    if (this.alive) this.sprite.setAlpha(this.ghostT > 0 ? 0.82 : 1);
    if (this.alive && (this.hp !== this.lastHp || this.slowT > 0)) this.drawBar();
  }

  destroy() {
    for (const o of [this.sprite, this.shadow, this.ring, this.bar, this.label]) o.destroy();
  }
}

class Cleaver {
  constructor(scene, owner, dx, dz) {
    Object.assign(this, { owner, team: owner.team, dx, dz, dist: 0, age: 0, alive: true });
    this.x = owner.x + dx * 0.6;
    this.z = owner.z + dz * 0.6;
    this.cont = scene.add.container(0, 0).setScale(1.1, 1.1 * SIN);
    this.img = scene.add.image(0, 0, 'cleaver').setRotation(Math.atan2(dz, dx));
    this.cont.add(this.img);
    this.shadow = scene.add.image(0, 0, 'shadow').setDepth(DEPTH.decal).setAlpha(0.5);
    this.shadow.setDisplaySize(1.2 * PPU, 1.2 * PPU * SIN);
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
    this.cleavers = [];
    this.state = 'loading';
    this.userZoom = 1;
    this.time0 = 0;
  }

  preload() {
    this.load.on('progress', (v) => {
      document.getElementById('load-fill').style.width = `${v * 100}%`;
      document.getElementById('load-text').textContent = `문도 불러오는 중… ${Math.round(v * 100)}%`;
    });
    this.load.multiatlas('mundo', 'assets/sprites/mundo.json', 'assets/sprites/');
    this.load.json('meta', 'assets/sprites/meta.json');
    this.load.json('arenaMeta', 'assets/arena.json');
    this.load.image('arena', 'assets/arena.png');
  }

  create() {
    this.meta = this.cache.json.get('meta');
    this.makeTextures();
    this.makeAnims();
    this.buildArena();
    this.makeFx();
    this.setupInput();
    this.camX = 0; this.camY = 0;
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
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    g.fillStyle(0x3d4650).fillPoints([{ x: 1, y: 3 }, { x: 31, y: 1 }, { x: 35, y: 7 }, { x: 35, y: 23 }, { x: 3, y: 25 }], true);
    g.fillStyle(0xd9e0e6).fillPoints([{ x: 3, y: 4 }, { x: 30, y: 3 }, { x: 33, y: 8 }, { x: 33, y: 21 }, { x: 5, y: 23 }], true);
    g.fillStyle(0xffffff, 0.7).fillRect(5, 5, 24, 2);
    g.fillStyle(0xa51616).fillRect(8, 15, 11, 4).fillRect(20, 17, 4, 3);
    g.fillStyle(0x6b4426).fillRect(35, 10, 14, 7);
    g.fillStyle(0x3a2412).fillRect(45, 10, 4, 7);
    g.generateTexture('cleaver', 50, 27);
    g.destroy();
  }

  makeAnims() {
    for (const [key, a] of Object.entries(this.meta.anims)) {
      for (let d = 0; d < 8; d++) {
        this.anims.create({
          key: `${key}_${d}`,
          frames: this.anims.generateFrameNames('mundo', { prefix: `${key}_${d}_`, start: 0, end: a.frames - 1 }),
          frameRate: key === 'death' ? a.fps * 2.6 : a.fps,
          repeat: a.loop ? -1 : 0,
        });
      }
    }
  }

  buildArena() {
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
    });
    this.water = this.add.shader(base, -wx, -wy, wx * 2, wy * 2).setOrigin(0, 0).setDepth(DEPTH.water);
    this.midLine = this.add.graphics().setDepth(DEPTH.line).setBlendMode(Phaser.BlendModes.ADD);
    this.cameras.main.setBackgroundColor('#1b2623');
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
      if (!this.player || !this.player.alive || !['play', 'countdown'].includes(this.state)) return;
      this.moveHeld = true;
      this.moveRepeatT = 0.1;
      const g = this.pointerGround();
      this.player.moveTarget = this.constrain({ ...g }, this.player.team);
      this.clickMarker(g.x, g.z);
    });
    this.input.on('pointerup', (p) => {
      if (!p.leftButtonDown() && !p.rightButtonDown()) this.moveHeld = false;
    });
    this.input.on('wheel', (p, objs, dx, dy) => {
      this.userZoom = clamp(this.userZoom * (dy > 0 ? 0.9 : 1.1), 0.6, 1.6);
    });
    this.input.keyboard.on('keydown', (e) => {
      if (e.repeat) return;
      Sound.unlock();
      const p = this.player;
      if (e.code === 'KeyM') { Sound.toggleMute(); HUD.chat(null, Sound.muted ? '소리 끔' : '소리 켬'); return; }
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
  constrain(p, team) {
    const s = team === 0 ? -1 : 1;
    const minX = RULES.midGap + RULES.champR;
    const maxR = RULES.arenaR - RULES.champR * 0.5;
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
    c.castT = RULES.q.windup;
    c.pending = { dx, dz };
    c.actionT = 0.36;
    c.stats.throws++;
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
    const to = this.constrain({ x: c.x + dx * d, z: c.z + dz * d }, c.team);
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
    if (c.isPlayer) return 1;
    const f = this.followTarget();
    return clamp(1.1 - Math.hypot(c.x - f.x, c.z - f.z) / 25, 0.25, 0.8);
  }

  hit(victim, cleaver) {
    const k = cleaver.owner;
    const dmg = RULES.q.dmg;
    victim.hp -= dmg;
    victim.slowT = RULES.q.slowDur;
    victim.hitFlash = 0.14;
    k.stats.hits++;
    const X = sx(victim.x), Y = sy(victim.z, 1.3);
    this.fx.hitflash.explode(1, X, Y);
    this.fx.blood.explode(18, X, Y);
    const playerTeam = this.player?.team ?? 0;
    const txt = this.add.text(X + rand(-10, 10), Y - 30, `${dmg}`, {
      fontFamily: 'Noto Sans KR', fontSize: '24px', fontStyle: '900',
      color: victim.team === playerTeam ? '#ff5a5a' : '#ffd24a', stroke: '#000', strokeThickness: 4,
    }).setOrigin(0.5).setDepth(DEPTH.ui + 1).setScale(1.5);
    this.tweens.add({ targets: txt, y: txt.y - 46, scale: 1, alpha: 0, duration: 950, ease: 'Cubic.easeOut', onComplete: () => txt.destroy() });
    Sound.hit(Math.max(this.vol(victim), this.vol(k)));
    if (k === this.player || victim === this.player) this.cameras.main.shake(110, victim === this.player ? 0.006 : 0.003);
    if (victim.hp <= 0) this.kill(victim, k);
  }

  kill(v, k) {
    v.hp = 0;
    v.alive = false;
    v.moveTarget = null;
    v.pending = null;
    v.castT = 0;
    v.setAnim('death', true);
    v.ring.setVisible(false);
    v.bar.setVisible(false);
    v.label.setVisible(false);
    v.shadow.setAlpha(0.35);
    this.fx.puff.explode(16, sx(v.x), sy(v.z, 0.8));
    k.stats.kills++;
    v.stats.deaths++;
    Sound.death(this.vol(v));
    HUD.killfeed(k, v);

    const now = this.matchTime;
    k.multi = now - k.lastKillAt < 10 ? k.multi + 1 : 1;
    k.lastKillAt = now;
    const pt = this.player.team;
    const teamLeft = this.champs.some((c) => c.team === v.team && c.alive);
    let title;
    if (k.multi >= 2) title = KILL_TITLES[Math.min(k.multi, 5)];
    else if (!this.firstBlood) title = '선취점!';
    else if (k.isPlayer) title = '적을 처치했습니다!';
    else if (v.isPlayer) title = '당신이 처치되었습니다';
    else title = k.team === pt ? '아군이 적을 처치했습니다' : '아군이 당했습니다';
    if (!teamLeft && this.mode > 1) title = k.multi >= 2 ? `${title} 에이스!` : '에이스!';
    this.firstBlood = true;
    HUD.announce(title, `${k.name}  ⟶  ${v.name}`, k.team === pt ? 'ally' : 'enemy');

    if (!k.isPlayer && Math.random() < 0.45) this.time.delayedCall(rand(300, 900), () => HUD.chat(k, pick(QUOTES.kill)));
    if (!v.isPlayer && Math.random() < 0.3) this.time.delayedCall(rand(600, 1400), () => HUD.chat(v, pick(QUOTES.death)));
  }

  // ---------- 매치 흐름 ----------
  spawnMenuMundos() {
    this.menuMundos = [
      this.add.sprite(sx(-8.5), sy(1.5), 'mundo').setOrigin(0.5, this.meta.anchor).setScale(this.meta.scale).play('dance_1'),
      this.add.sprite(sx(8.5), sy(1.5), 'mundo').setOrigin(0.5, this.meta.anchor).setScale(this.meta.scale).play('dance_3'),
    ];
    this.menuMundos.forEach((s) => s.setDepth(s.y));
  }

  startMatch({ mode, diff }) {
    Sound.unlock();
    this.menuMundos?.forEach((s) => s.destroy());
    this.menuMundos = null;
    for (const c of this.champs) c.destroy();
    for (const p of this.cleavers) p.destroy();
    this.cleavers = [];
    this.mode = mode;
    this.diff = diff;
    const allyNames = Phaser.Utils.Array.Shuffle([...NAMES.ally]);
    const enemyNames = Phaser.Utils.Array.Shuffle([...NAMES.enemy]);
    this.champs = [];
    for (let i = 0; i < mode; i++) {
      this.champs.push(new Champ(this, { team: 0, isPlayer: i === 0, name: i === 0 ? '나' : allyNames[i - 1] }));
      this.champs.push(new Champ(this, { team: 1, isPlayer: false, name: enemyNames[i] }));
    }
    this.player = this.champs[0];
    this.score = [0, 0];
    this.round = 1;
    this.matchTime = 0;
    this.firstBlood = false;
    HUD.clearFeeds();
    HUD.show(true);
    this.startRound();
  }

  startRound() {
    for (const p of this.cleavers) p.destroy();
    this.cleavers = [];
    for (const t of [0, 1]) {
      const team = this.champs.filter((c) => c.team === t);
      const n = team.length;
      team.forEach((c, i) => {
        const z = (i - (n - 1) / 2) * (n > 3 ? 3 : 3.6);
        const x = (t === 0 ? -1 : 1) * (6.5 + (i % 2) * 1.6);
        c.reset(x, z);
        if (!c.isPlayer) initBot(c, this.diff);
      });
    }
    this.moveHeld = false;
    this.roundTime = 0;
    this.state = 'countdown';
    this.countT = 3;
    this.lastCount = 4;
    HUD.setScore(this.score, this.round);
    HUD.announce(`라운드 ${this.round}`, this.round === 1 ? '가운데 선을 넘을 수 없습니다' : `${this.score[0]} : ${this.score[1]}`, 'neutral');
    const talker = pick(this.champs.filter((c) => !c.isPlayer));
    if (talker) this.time.delayedCall(rand(400, 1600), () => HUD.chat(talker, pick(QUOTES.start)));
    const p = this.player;
    this.camX = sx(p.x * 0.55); this.camY = sy(p.z * 0.5);
  }

  endRound(winner) {
    this.state = 'roundEnd';
    this.endT = 3.4;
    const pt = this.player.team;
    if (winner >= 0) this.score[winner]++;
    HUD.setScore(this.score, this.round);
    if (winner < 0) HUD.announce('무승부', '라운드를 다시 진행합니다', 'neutral');
    else HUD.announce(winner === pt ? '라운드 승리' : '라운드 패배', `${winner === 0 ? 'BLUE' : 'RED'} 팀이 라운드를 가져갑니다`, winner === pt ? 'ally' : 'enemy');
    if (winner >= 0) {
      (winner === pt ? Sound.win : Sound.lose)();
      this.time.delayedCall(700, () => {
        for (const c of this.champs) if (c.alive && c.team === winner) { c.celebrate = true; c.moveTarget = null; }
      });
    }
  }

  endMatch() {
    this.state = 'over';
    const win = this.score[this.player.team] > this.score[1 - this.player.team];
    HUD.result(win, this.champs, this.score);
  }

  backToMenu() {
    for (const c of this.champs) c.destroy();
    for (const p of this.cleavers) p.destroy();
    this.champs = []; this.cleavers = []; this.player = null;
    HUD.show(false);
    HUD.clearFeeds();
    this.spawnMenuMundos();
    this.state = 'menu';
  }

  // ---------- 업데이트 ----------
  update(time, deltaMs) {
    const dt = Math.min(deltaMs / 1000, 0.05);
    this.time0 += dt;
    this.water.setUniform('uTime.value', this.time0);
    this.drawMidLine(this.time0);

    if (this.state === 'countdown') {
      this.countT -= dt;
      const n = Math.ceil(this.countT);
      if (n !== this.lastCount && n > 0) { this.lastCount = n; HUD.countdown(String(n)); Sound.tick(); }
      if (this.countT <= 0) {
        this.state = 'play';
        HUD.countdown('시작!');
        Sound.go();
        this.time.delayedCall(800, () => { if (this.state === 'play') HUD.countdown(''); });
      }
    }

    if (this.champs.length) {
      const playing = this.state === 'play';
      if (playing) { this.matchTime += dt; this.roundTime += dt; }

      const p = this.player;
      if (this.moveHeld && p.alive && ['play', 'countdown'].includes(this.state)) {
        this.moveRepeatT -= dt;
        if (this.moveRepeatT <= 0) {
          this.moveRepeatT = 0.08;
          p.moveTarget = this.constrain({ ...this.pointerGround() }, p.team);
        }
      }
      if (playing) for (const c of this.champs) if (!c.isPlayer && c.alive) updateBot(c, this, dt);

      for (const c of this.champs) this.updateChamp(c, dt);
      this.separate();
      for (const c of this.champs) c.sync();
      for (const cl of this.cleavers) this.updateCleaver(cl, dt);
      this.cleavers = this.cleavers.filter((cl) => cl.alive);

      if (playing) {
        const alive = [0, 1].map((t) => this.champs.some((c) => c.team === t && c.alive));
        if (!alive[0] || !alive[1]) this.endRound(alive[0] ? 0 : alive[1] ? 1 : -1);
      }
      if (this.state === 'roundEnd') {
        this.endT -= dt;
        if (this.endT <= 0) {
          if (Math.max(...this.score) >= RULES.roundsToWin) this.endMatch();
          else { if (this.score[0] + this.score[1] >= this.round) this.round++; this.startRound(); }
        }
      }
      HUD.update(p, this.game.loop.actualFps, this.matchTime);
      HUD.minimap(this);
    }
    this.updateCamera(dt);
  }

  updateChamp(c, dt) {
    c.qCd = Math.max(0, c.qCd - dt);
    c.flashCd = Math.max(0, c.flashCd - dt);
    c.ghostCd = Math.max(0, c.ghostCd - dt);
    c.ghostT = Math.max(0, c.ghostT - dt);
    c.slowT = Math.max(0, c.slowT - dt);
    c.hitFlash = Math.max(0, c.hitFlash - dt);
    c.actionT = Math.max(0, c.actionT - dt);
    if (c.alive) c.hp = Math.min(RULES.maxHp, c.hp + RULES.regen * dt);

    if (c.castT > 0) {
      c.castT -= dt;
      if (c.castT <= 0 && c.pending && c.alive) {
        const cl = new Cleaver(this, c, c.pending.dx, c.pending.dz);
        this.cleavers.push(cl);
        Sound.throw(this.vol(c));
        c.pending = null;
      }
    }

    const px = c.x, pz = c.z;
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
    if (c.alive) this.constrain(c, c.team);
    c.vx = (c.x - px) / dt;
    c.vz = (c.z - pz) / dt;
    const moving = Math.hypot(c.vx, c.vz) > 0.4;

    if (!c.alive) return;
    if (c.actionT > 0) { /* 투척 모션 유지 */ }
    else if (c.celebrate) c.setAnim('dance');
    else if (moving) { c.setAnim('run'); c.sprite.anims.timeScale = c.speed() / RULES.moveSpeed; }
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

  separate() {
    const min = RULES.champR * 2.3;
    for (let i = 0; i < this.champs.length; i++) {
      const a = this.champs[i];
      if (!a.alive) continue;
      for (let j = i + 1; j < this.champs.length; j++) {
        const b = this.champs[j];
        if (!b.alive || a.team !== b.team) continue;
        const dx = b.x - a.x, dz = b.z - a.z;
        const d = Math.hypot(dx, dz);
        if (d < min && d > 1e-4) {
          const push = (min - d) / 2;
          a.x -= (dx / d) * push; a.z -= (dz / d) * push;
          b.x += (dx / d) * push; b.z += (dz / d) * push;
          this.constrain(a, a.team);
          this.constrain(b, b.team);
        }
      }
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
        if (e.team === p.team || !e.alive) continue;
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

  drawMidLine(t) {
    const g = this.midLine;
    g.clear();
    const top = sy(-ARENA.R), bot = sy(ARENA.R), h = bot - top;
    const col = 0xb98cff;
    for (const [w, a] of [[34, 0.05], [16, 0.09], [7, 0.22], [2.5, 0.85]]) g.fillStyle(col, a).fillRect(-w / 2, top, w, h);
    const n = 16;
    for (let i = 0; i < n; i++) {
      const y = top + ((i * h) / n + t * 26) % h;
      const fade = Math.min(1, (y - top) / 50, (bot - y) / 50);
      g.fillStyle(0xeadcff, 0.75 * fade);
      g.fillTriangle(0, y - 7, 5, y, 0, y + 7);
      g.fillTriangle(0, y - 7, -5, y, 0, y + 7);
    }
  }

  followTarget() {
    const p = this.player;
    if (!p) return { x: 0, z: 0 };
    if (p.alive || this.state !== 'play') return p;
    return this.champs.find((c) => c.alive && c.team === p.team) || p;
  }

  updateCamera(dt) {
    const cam = this.cameras.main;
    const base = clamp(cam.width / (ARENA.R * 2.25 * PPU), 0.5, 1.4);
    cam.setZoom(base * this.userZoom);
    let tx = 0, ty = sy(1);
    if (this.player) {
      const f = this.followTarget();
      tx = sx(f.x * 0.55);
      ty = sy(f.z * 0.6) + 40 / cam.zoom; // 하단 HUD 만큼 살짝 아래로
    }
    const k = 1 - Math.exp(-dt * 5);
    this.camX += (tx - this.camX) * k;
    this.camY += (ty - this.camY) * k;
    cam.centerOn(this.camX, this.camY);
  }

  viewRect() {
    const v = this.cameras.main.worldView;
    return { x0: v.x / PPU, x1: (v.x + v.width) / PPU, z0: v.y / (PPU * SIN), z1: (v.y + v.height) / (PPU * SIN) };
  }
}

// ---------------------------------------------------------------------------
const game = new Phaser.Game({
  type: Phaser.WEBGL,
  parent: 'game',
  backgroundColor: '#1b2623',
  scale: { mode: Phaser.Scale.RESIZE, width: window.innerWidth, height: window.innerHeight },
  render: { antialias: true },
  scene: [GameScene],
});
window.__game = game;

// 메뉴 DOM
const opts = { mode: 3, diff: 'normal' };
for (const [id, key, parse] of [['opt-mode', 'mode', Number], ['opt-diff', 'diff', String]]) {
  const seg = document.getElementById(id);
  seg.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    seg.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
    opts[key] = parse(b.dataset.v);
  });
}
const scene = () => game.scene.getScene('game');
document.getElementById('start-btn').addEventListener('click', () => {
  document.getElementById('menu').classList.add('hidden');
  scene().startMatch(opts);
});
document.getElementById('again-btn').addEventListener('click', () => {
  document.getElementById('result').classList.add('hidden');
  scene().startMatch(opts);
});
document.getElementById('menu-btn').addEventListener('click', () => {
  document.getElementById('result').classList.add('hidden');
  document.getElementById('menu').classList.remove('hidden');
  scene().backToMenu();
});
