// 모바일 조작: 왼쪽 조이스틱으로 이동, 스킬 버튼을 누른 채 끌어 조준하고 떼면 시전
import { PROJ } from './config.js';
import { RULES } from './rules.js';

const { PPU, SIN } = PROJ;
const JOY_R = 0.4;     // 노브가 움직일 수 있는 반경 (조이스틱 판 지름 대비, 화면 크기별로 판 크기가 다르다)
const JOY_DEAD = 10;   // 이 안쪽은 정지
const AIM_R = 90;      // 이만큼 끌면 점멸 최대 거리
const AIM_DEAD = 15;   // 이보다 짧게 끌면 탭으로 본다
// Q 조준: 가장 가까운 적 쪽(Q_BASE px 길이)에서 시작해, 끈 거리를 Q_SENS 배로 줄여 더한다.
// 옆으로 60px 끌면 약 30도 돌아가서 손가락을 조금 움직여도 조준이 크게 튀지 않는다.
const Q_BASE = 60, Q_SENS = 0.6;
const LOOKAHEAD = 2;   // 조이스틱 방향으로 이만큼 앞을 이동 목표로 찍는다
const REPEAT = 0.08;   // 이동 목표 갱신 주기 (클릭 이동 반복과 같다)
const AIM_COLOR = 0x5ff4ff, CANCEL_COLOR = 0xff5050;

const $ = (id) => document.getElementById(id);

export function isTouchDevice() {
  return matchMedia('(pointer: coarse)').matches;
}

// 화면에서 끈 방향(px) → 지면 방향 단위벡터. 화면 y 는 z * SIN 으로 눌려 있으니 되돌린다.
function groundDir(dx, dy) {
  const x = dx, z = dy / SIN, l = Math.hypot(x, z);
  return l > 0 ? { x: x / l, z: z / l } : null;
}

export function setupTouchControls(scene, { sx, sy, depth }) {
  document.body.classList.add('touch');
  const g = scene.add.graphics().setDepth(depth);
  const joy = { id: null, ox: 0, oy: 0, dir: null, t: 0 };
  let aim = null; // { key, id, el, ox, oy, dx, dy, left, cancel }

  // ---------- 조이스틱 ----------
  const zone = $('joy-zone'), base = $('joy-base'), knob = $('joy-knob');
  const placeBase = (x, y) => { base.style.left = `${x}px`; base.style.top = `${y}px`; };
  const resetJoy = () => {
    joy.id = null; joy.dir = null;
    base.classList.remove('active');
    base.style.left = base.style.top = '';
    knob.style.transform = '';
  };
  zone.addEventListener('pointerdown', (e) => {
    if (joy.id !== null) return;
    e.preventDefault();
    zone.setPointerCapture(e.pointerId);
    const r = zone.getBoundingClientRect();
    joy.id = e.pointerId; joy.ox = e.clientX; joy.oy = e.clientY; joy.t = 0;
    placeBase(e.clientX - r.left, e.clientY - r.top);
    base.classList.add('active');
  });
  zone.addEventListener('pointermove', (e) => {
    if (e.pointerId !== joy.id) return;
    let dx = e.clientX - joy.ox, dy = e.clientY - joy.oy;
    const l = Math.hypot(dx, dy);
    const max = base.offsetWidth * JOY_R;
    if (l > max) { dx *= max / l; dy *= max / l; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    const dir = l > JOY_DEAD ? groundDir(dx, dy) : null;
    if (dir && !joy.dir) joy.t = 0; // 새로 밀기 시작하면 바로 출발
    joy.dir = dir;
  });
  const releaseJoy = (e) => {
    if (e.pointerId !== joy.id) return;
    const moving = !!joy.dir;
    resetJoy();
    const p = scene.player;
    if (moving && p && scene.canControl()) {
      p.moveTarget = null;
      scene.sendInput({ stop: true });
    }
  };
  zone.addEventListener('pointerup', releaseJoy);
  zone.addEventListener('pointercancel', releaseJoy);

  // ---------- 스킬 버튼 ----------
  const cdOf = { q: 'qCd', d: 'flashCd', f: 'ghostCd' };
  for (const key of ['q', 'd', 'f']) {
    const el = $(`sk-${key}`);
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const p = scene.player;
      if (aim || !p || !scene.canControl() || p[cdOf[key]] > 0) return;
      if (key === 'f') { scene.useSkill('f'); return; }
      el.setPointerCapture(e.pointerId);
      el.classList.add('aiming');
      aim = { key, id: e.pointerId, el, ox: e.clientX, oy: e.clientY, dx: 0, dy: 0, left: false, cancel: false };
    });
    el.addEventListener('pointermove', (e) => {
      if (!aim || e.pointerId !== aim.id) return;
      aim.dx = e.clientX - aim.ox; aim.dy = e.clientY - aim.oy;
      const r = el.getBoundingClientRect();
      const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      if (!inside) aim.left = true;
      aim.cancel = aim.left && inside; // 밖으로 끌었다가 버튼 위로 되돌아오면 취소
    });
    el.addEventListener('pointerup', (e) => {
      if (!aim || e.pointerId !== aim.id) return;
      const a = aim;
      endAim();
      if (a.cancel || !scene.canControl()) return;
      const t = aimTarget(a);
      scene.useSkill(a.key, t.x, t.z);
    });
    el.addEventListener('pointercancel', (e) => { if (aim && e.pointerId === aim.id) endAim(); });
  }
  function endAim() {
    aim.el.classList.remove('aiming');
    aim = null;
    g.clear();
  }

  // Q 방향(지면 단위벡터): 기본은 가장 가까운 적(없으면 바라보는 방향), 끌면 그쪽으로 천천히 돈다
  function qDir(a) {
    const p = scene.player;
    const foe = scene.enemies.filter(e => e.alive)
      .sort((m, n) => Math.hypot(m.x - p.x, m.z - p.z) - Math.hypot(n.x - p.x, n.z - p.z))[0];
    let bx = Math.cos(p.facing), bz = Math.sin(p.facing);
    if (foe && Math.hypot(foe.x - p.x, foe.z - p.z) > 0.01) { bx = foe.x - p.x; bz = foe.z - p.z; }
    // 화면 기준으로 더해야 손가락 방향과 맞는다 (지면 z 는 화면에서 SIN 만큼 눌려 보인다)
    const sl = Math.hypot(bx, bz * SIN);
    const drag = Math.hypot(a.dx, a.dy) > AIM_DEAD ? Q_SENS : 0;
    return groundDir(bx / sl * Q_BASE + a.dx * drag, bz * SIN / sl * Q_BASE + a.dy * drag)
      || { x: bx / Math.hypot(bx, bz), z: bz / Math.hypot(bx, bz) };
  }

  // 조준 중인 목표 지점 (지면 좌표)
  function aimTarget(a) {
    const p = scene.player;
    if (a.key === 'q') {
      const dir = qDir(a);
      return { x: p.x + dir.x, z: p.z + dir.z };
    }
    const l = Math.hypot(a.dx, a.dy);
    const dir = l > AIM_DEAD ? groundDir(a.dx, a.dy) : null;
    if (!dir) return { x: p.x, z: p.z }; // 점멸 탭: 바라보는 방향으로 최대 거리
    const d = Math.min(1, l / AIM_R) * RULES.flash.dist;
    return { x: p.x + dir.x * d, z: p.z + dir.z * d };
  }

  function drawAim() {
    g.clear();
    const p = scene.player;
    if (!aim || !p?.alive) return;
    const color = aim.cancel ? CANCEL_COLOR : AIM_COLOR;
    const l = Math.hypot(aim.dx, aim.dy);
    if (aim.key === 'q') {
      const dir = qDir(aim);
      const w = RULES.q.width, len = RULES.q.range;
      const nx = -dir.z * w, nz = dir.x * w;
      const ex = p.x + dir.x * len, ez = p.z + dir.z * len;
      const pts = [
        { x: sx(p.x + nx), y: sy(p.z + nz) }, { x: sx(ex + nx), y: sy(ez + nz) },
        { x: sx(ex - nx), y: sy(ez - nz) }, { x: sx(p.x - nx), y: sy(p.z - nz) },
      ];
      g.fillStyle(color, 0.22).fillPoints(pts, true);
      g.lineStyle(3, color, 0.9).strokePoints(pts, true);
      return;
    }
    const r = RULES.flash.dist * PPU;
    g.lineStyle(2, color, 0.5).strokeEllipse(sx(p.x), sy(p.z), r * 2, r * 2 * SIN);
    const t = scene.constrain(aimTarget(aim), p);
    if (l <= AIM_DEAD) return;
    g.fillStyle(color, 0.35).fillEllipse(sx(t.x), sy(t.z), 1.4 * PPU, 1.4 * PPU * SIN);
    g.lineStyle(3, color, 0.95).strokeEllipse(sx(t.x), sy(t.z), 1.4 * PPU, 1.4 * PPU * SIN);
  }

  return {
    update(dt) {
      const p = scene.player;
      if (joy.dir && p && scene.canControl()) {
        joy.t -= dt;
        if (joy.t <= 0) {
          joy.t = REPEAT;
          scene.setMoveTarget({ x: p.x + joy.dir.x * LOOKAHEAD, z: p.z + joy.dir.z * LOOKAHEAD });
        }
      }
      if (aim && (!p || !scene.canControl())) endAim();
      drawAim();
    },
  };
}
