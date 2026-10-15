// 모바일 조작: 왼쪽 조이스틱으로 이동, Q 는 누른 채 끌어 조준하고 떼면 시전, D·F 는 탭
import { PROJ } from './config.js';
import { RULES } from './rules.js';

const { SIN } = PROJ;
const JOY_R = 0.4;     // 노브가 움직일 수 있는 반경 (조이스틱 판 지름 대비, 화면 크기별로 판 크기가 다르다)
const JOY_DEAD = 10;   // 이 안쪽은 정지
const AIM_DEAD = 15;   // 이보다 짧게 끌면 탭으로 본다
// Q 조준: 가장 가까운 적 쪽(Q_BASE px 길이)에서 시작해, 끈 거리를 Q_SENS 배로 줄여 더한다.
// 옆으로 60px 끌면 약 30도 돌아가서 손가락을 조금 움직여도 조준이 크게 튀지 않는다.
const Q_BASE = 60, Q_SENS = 0.6;
const LOOKAHEAD = 2;   // 조이스틱 방향으로 이만큼 앞을 이동 목표로 찍는다
const REPEAT = 0.08;   // 이동 목표 갱신 주기 (클릭 이동 반복과 같다)
const AIM_COLOR = 0x5ff4ff;

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
  let aim = null; // { key, id, el, ox, oy, dx, dy }

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
      if (key === 'd') { // 바라보는 방향으로 항상 최대 사거리
        const d = RULES.flash.dist;
        scene.useSkill('d', p.x + Math.cos(p.facing) * d, p.z + Math.sin(p.facing) * d);
        return;
      }
      el.setPointerCapture(e.pointerId);
      el.classList.add('aiming');
      aim = { key, id: e.pointerId, el, ox: e.clientX, oy: e.clientY, dx: 0, dy: 0 };
      aim.base = qBase();
    });
    el.addEventListener('pointermove', (e) => {
      if (!aim || e.pointerId !== aim.id) return;
      aim.dx = e.clientX - aim.ox; aim.dy = e.clientY - aim.oy;
    });
    el.addEventListener('pointerup', (e) => {
      if (!aim || e.pointerId !== aim.id) return;
      const a = aim;
      endAim();
      if (!scene.canControl()) return;
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

  // Q 기본 방향: 누른 순간 가장 가까운 적 쪽(없으면 바라보는 방향). 누른 뒤 적이 움직여도 따라가지 않는다.
  function qBase() {
    const p = scene.player;
    const foe = scene.enemies.filter(e => e.alive)
      .sort((m, n) => Math.hypot(m.x - p.x, m.z - p.z) - Math.hypot(n.x - p.x, n.z - p.z))[0];
    if (foe && Math.hypot(foe.x - p.x, foe.z - p.z) > 0.01) return { x: foe.x - p.x, z: foe.z - p.z };
    return { x: Math.cos(p.facing), z: Math.sin(p.facing) };
  }

  // Q 방향(지면 단위벡터): 누를 때 정한 기본 방향에서, 끌면 그쪽으로 천천히 돈다
  function qDir(a) {
    const { x: bx, z: bz } = a.base;
    // 화면 기준으로 더해야 손가락 방향과 맞는다 (지면 z 는 화면에서 SIN 만큼 눌려 보인다)
    const sl = Math.hypot(bx, bz * SIN);
    const drag = Math.hypot(a.dx, a.dy) > AIM_DEAD ? Q_SENS : 0;
    return groundDir(bx / sl * Q_BASE + a.dx * drag, bz * SIN / sl * Q_BASE + a.dy * drag)
      || { x: bx / Math.hypot(bx, bz), z: bz / Math.hypot(bx, bz) };
  }

  // 조준 중인 목표 지점 (지면 좌표)
  function aimTarget(a) {
    const p = scene.player, dir = qDir(a);
    return { x: p.x + dir.x, z: p.z + dir.z };
  }

  function drawAim() {
    g.clear();
    const p = scene.player;
    if (!aim || !p?.alive) return;
    const dir = qDir(aim);
    const w = RULES.q.width, len = RULES.q.range;
    const nx = -dir.z * w, nz = dir.x * w;
    const ex = p.x + dir.x * len, ez = p.z + dir.z * len;
    const pts = [
      { x: sx(p.x + nx), y: sy(p.z + nz) }, { x: sx(ex + nx), y: sy(ez + nz) },
      { x: sx(ex - nx), y: sy(ez - nz) }, { x: sx(p.x - nx), y: sy(p.z - nz) },
    ];
    g.fillStyle(AIM_COLOR, 0.22).fillPoints(pts, true);
    g.lineStyle(3, AIM_COLOR, 0.9).strokePoints(pts, true);
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
