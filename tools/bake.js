// GLB 문도 모델과 아레나를 2.5D 정사영 카메라로 렌더링해서 Phaser용 스프라이트 아틀라스로 굽는다.
// tools/bake.mjs 가 headless Chrome 에서 이 페이지를 열고 window.bake* 함수를 호출한다.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { PROJ, ARENA, SPRITE } from '../src/config.js';

// 모델이 +Z 를 바라보지 않을 경우 보정값 (preview 로 확인)
const MODEL_YAW_OFFSET = 0;
const MODEL_SCALE = 1.0;

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setClearColor(0x000000, 0);
renderer.setPixelRatio(1);

// 지면 점 (cx, 0, cz)가 화면에서 위에서부터 anchor 비율 지점에 오도록 하는 정사영 카메라
function makeCamera(cx, cz, wUnits, hUnits, anchor) {
  const cam = new THREE.OrthographicCamera(-wUnits / 2, wUnits / 2, hUnits * anchor, -hUnits * (1 - anchor), 0.1, 400);
  const target = new THREE.Vector3(cx, 0, cz);
  cam.position.copy(target).add(new THREE.Vector3(0, PROJ.SIN, PROJ.COS).multiplyScalar(150));
  cam.lookAt(target);
  return cam;
}

let gltfPromise;
function loadModel() {
  gltfPromise ??= new GLTFLoader().loadAsync('/assets/mundo.glb');
  return gltfPromise;
}

function grab(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  c.getContext('2d').drawImage(renderer.domElement, 0, 0);
  return c;
}

function trim(canvas) {
  const { width: w, height: h } = canvas;
  const data = canvas.getContext('2d').getImageData(0, 0, w, h).data;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > 2) {
        if (x < x0) x0 = x; if (x > x1) x1 = x;
        if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) return { x: 0, y: 0, w: 1, h: 1 };
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

// 방향 d(0..7): 지면에서 각도 d*45°, 0 = 오른쪽(+x), 2 = 화면 아래(+z)
function dirYaw(d) {
  const a = (d / SPRITE.DIRS) * Math.PI * 2;
  return Math.atan2(Math.cos(a), Math.sin(a)) + MODEL_YAW_OFFSET;
}

async function setupCharacter() {
  const gltf = await loadModel();
  const scene = new THREE.Scene();
  const model = gltf.scene;
  model.scale.setScalar(MODEL_SCALE);
  model.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
  scene.add(model);
  const mixer = new THREE.AnimationMixer(model);
  const clip = (name) => {
    const c = gltf.animations.find((a) => a.name === name);
    if (!c) throw new Error('clip not found: ' + name);
    return c;
  };
  return { scene, model, mixer, clip, clips: gltf.animations };
}

function poseAt(ch, clipName, t, yaw) {
  ch.mixer.stopAllAction();
  ch.mixer.uncacheRoot(ch.model);
  const action = ch.mixer.clipAction(ch.clip(clipName));
  action.play();
  ch.mixer.setTime(t);
  ch.model.rotation.y = yaw;
  ch.model.updateMatrixWorld(true);
}

function frameTimes(anim, clipDur) {
  const start = anim.start ?? 0;
  const end = Math.min(anim.end ?? clipDur, clipDur);
  const times = [];
  for (let f = 0; f < anim.frames; f++) {
    times.push(anim.loop ? start + ((end - start) * f) / anim.frames : start + ((end - start) * f) / (anim.frames - 1));
  }
  return times;
}

// ---------- 미리보기: 방향/애니메이션 확인용 컨택트 시트 ----------
window.bakePreview = async (clipNames, dir = 2) => {
  const ch = await setupCharacter();
  const S = 60, fw = Math.round(SPRITE.FRAME_W * S), fh = Math.round(SPRITE.FRAME_H * S);
  renderer.setSize(fw, fh, false);
  const cam = makeCamera(0, 0, SPRITE.FRAME_W, SPRITE.FRAME_H, SPRITE.ANCHOR);
  const rows = [];
  // 1행: 8방향 idle
  const row0 = [];
  for (let d = 0; d < 8; d++) {
    poseAt(ch, 'DrMundo_Idle01.anm', 0, dirYaw(d));
    renderer.render(ch.scene, cam);
    row0.push({ c: grab(fw, fh), label: 'dir ' + d });
  }
  rows.push(row0);
  for (const spec of clipNames) {
    // "Clip" 또는 "Clip@시작-끝"
    const [name, range] = spec.split('@');
    const clip = ch.clip(name);
    const [t0, t1] = range ? range.split('-').map(Number) : [0, clip.duration];
    const row = [];
    for (let i = 0; i < 8; i++) {
      const t = t0 + ((t1 - t0) * i) / 7;
      poseAt(ch, name, t, dirYaw(dir));
      renderer.render(ch.scene, cam);
      row.push({ c: grab(fw, fh), label: `${name} ${t.toFixed(2)}` });
    }
    rows.push(row);
  }
  const sheet = document.createElement('canvas');
  const cw = fw / 2, chh = fh / 2;
  sheet.width = cw * 8; sheet.height = chh * rows.length;
  const g = sheet.getContext('2d');
  g.fillStyle = '#2a4a55'; g.fillRect(0, 0, sheet.width, sheet.height);
  g.font = '12px sans-serif';
  rows.forEach((row, r) => row.forEach((cell, i) => {
    g.drawImage(cell.c, i * cw, r * chh, cw, chh);
    g.strokeStyle = '#0005'; g.strokeRect(i * cw, r * chh, cw, chh);
    g.beginPath(); g.arc(i * cw + cw / 2, r * chh + chh * SPRITE.ANCHOR, 3, 0, 7); g.fillStyle = '#f0f'; g.fill();
    g.fillStyle = '#fff'; g.fillText(cell.label, i * cw + 4, r * chh + 14);
  }));
  return sheet.toDataURL('image/png');
};

// ---------- 스프라이트 아틀라스 ----------
function packPages(items, pageSize = 2048, pad = 2) {
  items.sort((a, b) => b.rect.h - a.rect.h);
  const pages = [];
  let page = null, x = 0, y = 0, shelfH = 0;
  const newPage = () => { page = { items: [] }; pages.push(page); x = 0; y = 0; shelfH = 0; };
  newPage();
  for (const it of items) {
    const { w, h } = it.rect;
    if (x + w + pad > pageSize) { x = 0; y += shelfH + pad; shelfH = 0; }
    if (y + h + pad > pageSize) newPage();
    it.pos = { x, y };
    page.items.push(it);
    x += w + pad;
    shelfH = Math.max(shelfH, h);
  }
  return pages.map((p, i) => {
    let maxW = 0, maxH = 0;
    for (const it of p.items) { maxW = Math.max(maxW, it.pos.x + it.rect.w); maxH = Math.max(maxH, it.pos.y + it.rect.h); }
    const c = document.createElement('canvas');
    c.width = maxW; c.height = maxH;
    const g = c.getContext('2d');
    const frames = [];
    for (const it of p.items) {
      g.drawImage(it.canvas, it.rect.x, it.rect.y, it.rect.w, it.rect.h, it.pos.x, it.pos.y, it.rect.w, it.rect.h);
      frames.push({
        filename: it.name,
        rotated: false,
        trimmed: true,
        sourceSize: { w: it.canvas.width, h: it.canvas.height },
        spriteSourceSize: { x: it.rect.x, y: it.rect.y, w: it.rect.w, h: it.rect.h },
        frame: { x: it.pos.x, y: it.pos.y, w: it.rect.w, h: it.rect.h },
      });
    }
    return { canvas: c, frames, image: `mundo-${i}.png` };
  });
}

window.bakeSprites = async () => {
  const ch = await setupCharacter();
  const S = PROJ.PPU * PROJ.BAKE_SCALE;
  const fw = Math.round(SPRITE.FRAME_W * S), fh = Math.round(SPRITE.FRAME_H * S);
  renderer.setSize(fw, fh, false);
  const cam = makeCamera(0, 0, SPRITE.FRAME_W, SPRITE.FRAME_H, SPRITE.ANCHOR);
  const items = [];
  const meta = { frameW: fw, frameH: fh, anchor: SPRITE.ANCHOR, scale: 1 / PROJ.BAKE_SCALE, anims: {} };
  for (const anim of SPRITE.ANIMS) {
    const clip = ch.clip(anim.clip);
    const times = frameTimes(anim, clip.duration);
    const end = Math.min(anim.end ?? clip.duration, clip.duration) - (anim.start ?? 0);
    meta.anims[anim.key] = { frames: anim.frames, loop: anim.loop, fps: Math.round((anim.frames / end) * 100) / 100 };
    for (let d = 0; d < SPRITE.DIRS; d++) {
      times.forEach((t, f) => {
        poseAt(ch, anim.clip, t, dirYaw(d));
        renderer.render(ch.scene, cam);
        const canvas = grab(fw, fh);
        items.push({ name: `${anim.key}_${d}_${f}`, canvas, rect: trim(canvas) });
      });
    }
  }
  const pages = packPages(items);
  return {
    meta,
    atlas: { textures: pages.map((p) => ({ image: p.image, format: 'RGBA8888', size: { w: p.canvas.width, h: p.canvas.height }, scale: 1, frames: p.frames })) },
    images: pages.map((p) => ({ name: p.image, data: p.canvas.toDataURL('image/png') })),
  };
};

// 초상화 (HUD용)
window.bakePortrait = async () => {
  const ch = await setupCharacter();
  poseAt(ch, 'DrMundo_Idle01.anm', 0.3, dirYaw(2));
  const head = ch.model.getObjectByName('Head').getWorldPosition(new THREE.Vector3());
  const cam = new THREE.PerspectiveCamera(28, 1, 0.01, 50);
  cam.position.set(head.x + 0.35, head.y + 0.2, head.z + 2.4);
  cam.lookAt(head.x, head.y - 0.05, head.z);
  renderer.setSize(256, 256, false);
  renderer.render(ch.scene, cam);
  return renderer.domElement.toDataURL('image/png');
};

// ---------- 아레나 (암벽/외곽 지형, 물은 게임에서 셰이더로 그림) ----------
function seeded(seed) {
  return () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
}

function rockGeometry(rnd) {
  let g = new THREE.IcosahedronGeometry(1, 2);
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  g = mergeVertices(g);
  const p = g.attributes.position;
  const v = new THREE.Vector3();
  const k1 = rnd() * 10, k2 = rnd() * 10;
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = 1 + 0.22 * Math.sin(v.x * 3.1 + k1) * Math.cos(v.z * 2.7 + k2) + (rnd() - 0.5) * 0.18;
    v.multiplyScalar(n);
    if (v.y > 0.55) v.y = 0.55 + (v.y - 0.55) * 0.35; // 윗면을 평평하게 (절벽 느낌)
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  const colors = [];
  const n = g.attributes.normal;
  const stone = new THREE.Color(0x737b84), dark = new THREE.Color(0x3a4048), moss = new THREE.Color(0x56723a);
  for (let i = 0; i < p.count; i++) {
    const ny = n.getY(i);
    const c = stone.clone().lerp(dark, 0.2 + rnd() * 0.35);
    if (ny > 0.75 && rnd() < 0.55) c.lerp(moss, Math.min(1, (ny - 0.75) * 3) * (0.5 + rnd() * 0.4));
    colors.push(c.r, c.g, c.b);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return g;
}

window.bakeArena = async () => {
  const rnd = seeded(1337);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0x9fb4d8, 0x1a1420, 1.1));
  const sun = new THREE.DirectionalLight(0xdfe8ff, 2.2);
  sun.position.set(-12, 30, 8);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 80 });
  scene.add(sun);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  for (const [x, z, col] of [[-13, -10, 0x9b4dff], [14, -6, 0x6a3dff], [-6, 15, 0x3dbbff], [11, 13, 0xb04dff]]) {
    const l = new THREE.PointLight(col, 60, 18, 1.6);
    l.position.set(x, 4, z);
    scene.add(l);
  }

  const rockMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95 });
  const addRock = (x, z, sx, sy, sz, rot) => {
    const m = new THREE.Mesh(rockGeometry(rnd), rockMat);
    m.position.set(x, sy * 0.35 - 0.2, z);
    m.scale.set(sx, sy, sz);
    m.rotation.y = rot;
    m.castShadow = m.receiveShadow = true;
    scene.add(m);
  };

  // 바깥 지형 (구멍 뚫린 원판) — 높게 깔아서 구덩이 느낌
  const ground = new THREE.Mesh(
    new THREE.RingGeometry(ARENA.ROCK_R + 1.2, 60, 96, 1),
    new THREE.MeshStandardMaterial({ color: 0x1d2a24, roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = 1.6;
  ground.receiveShadow = true;
  scene.add(ground);
  // 구덩이 벽 (원통 안쪽)
  const wall = new THREE.Mesh(
    new THREE.CylinderGeometry(ARENA.ROCK_R + 1.3, ARENA.ROCK_R + 0.6, 1.8, 96, 1, true),
    new THREE.MeshStandardMaterial({ color: 0x26302f, roughness: 1, side: THREE.BackSide }),
  );
  wall.position.y = 0.7;
  wall.receiveShadow = true;
  scene.add(wall);

  // 안쪽 암벽 링
  const N = 96;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2 + rnd() * 0.05;
    const r = ARENA.ROCK_R + 0.4 + rnd() * 1.0;
    // 화면 아래쪽(카메라 쪽) 바위는 낮게 해서 시야를 가리지 않게
    const front = Math.max(0, Math.sin(a));
    const h = (1.2 + rnd() * 1.6) * (1 - front * 0.5);
    addRock(Math.cos(a) * r, Math.sin(a) * r, 0.7 + rnd() * 0.6, h, 0.7 + rnd() * 0.5, rnd() * 6.28);
  }
  // 두 번째 줄 (조금 더 크고 높게)
  for (let i = 0; i < 70; i++) {
    const a = (i / 70) * Math.PI * 2 + rnd() * 0.06;
    const r = ARENA.ROCK_R + 1.8 + rnd() * 1.2;
    const back = Math.max(0, -Math.sin(a));
    addRock(Math.cos(a) * r, Math.sin(a) * r, 0.9 + rnd() * 0.7, 1.8 + rnd() * 1.6 + back * 2.5, 0.9 + rnd() * 0.6, rnd() * 6.28);
  }
  // 뒤쪽 절벽
  for (let i = 0; i < 40; i++) {
    const a = Math.PI + (i / 39) * Math.PI + (rnd() - 0.5) * 0.08;
    const r = ARENA.ROCK_R + 3.6 + rnd() * 2.5;
    addRock(Math.cos(a) * r, Math.sin(a) * r, 1.2 + rnd() * 1.0, 3.5 + rnd() * 3.5, 1.1 + rnd() * 0.8, rnd() * 6.28);
  }
  // 바깥에 흩어진 바위
  for (let i = 0; i < 40; i++) {
    const a = rnd() * Math.PI * 2;
    const r = ARENA.ROCK_R + 4 + rnd() * 6;
    addRock(Math.cos(a) * r, Math.sin(a) * r, 0.6 + rnd() * 1.0, 1.5 + rnd() * 2, 0.6 + rnd() * 0.8, rnd() * 6.28);
  }

  // 풀
  const blade = new THREE.ConeGeometry(0.09, 0.7, 4);
  blade.translate(0, 0.35, 0);
  const grass = new THREE.InstancedMesh(blade, new THREE.MeshStandardMaterial({ color: 0x5f8a3a, roughness: 1 }), 2600);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  let gi = 0;
  for (let c = 0; c < 70 && gi < 2600; c++) {
    const a = rnd() * Math.PI * 2, r = ARENA.ROCK_R + 1.5 + rnd() * 9;
    const cx = Math.cos(a) * r, cz = Math.sin(a) * r;
    for (let k = 0; k < 36 && gi < 2600; k++) {
      const x = cx + (rnd() - 0.5) * 2.4, z = cz + (rnd() - 0.5) * 2.4;
      const s = 0.6 + rnd() * 0.9;
      q.setFromEuler(e.set((rnd() - 0.5) * 0.5, rnd() * 6.28, (rnd() - 0.5) * 0.5));
      m4.compose(new THREE.Vector3(x, 1.6, z), q, new THREE.Vector3(s, s, s));
      grass.setMatrixAt(gi++, m4);
    }
  }
  grass.count = gi;
  scene.add(grass);

  // 화면 범위: 지면 z ∈ [-EXTENT, EXTENT], 위쪽으로 바위 높이만큼 여유
  const ext = ARENA.EXTENT;
  const S = PROJ.PPU;
  const wU = ext * 2, top = ext * PROJ.SIN + 7, bottom = ext * PROJ.SIN + 1;
  const hU = top + bottom;
  const w = Math.round(wU * S), h = Math.round(hU * S);
  renderer.setSize(w, h, false);
  const cam = makeCamera(0, 0, wU, hU, top / hU);
  renderer.render(scene, cam);
  const data = renderer.domElement.toDataURL('image/png');
  renderer.shadowMap.enabled = false;
  return { data, meta: { width: w, height: h, originX: w / 2, originY: Math.round(top * S) } };
};

window.BAKE_READY = true;
