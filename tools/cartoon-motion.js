// Animate painted cutouts around their joints. Never scale, shear, or redraw
// body parts per frame: every displayed part comes from the painted atlas.
import { THROW, throwPose } from '../src/throw-motion.js';

export async function loadCartoonMotion() {
  const image = new Image();
  image.src = '/assets/cartoon/parts-source.png';
  await image.decode();
  const source = document.createElement('canvas');
  source.width = image.width; source.height = image.height;
  const context = source.getContext('2d');
  context.drawImage(image, 0, 0);
  const pixels = context.getImageData(0, 0, image.width, image.height).data;
  // The generated atlas has transparent gutters, but its painted parts do
  // not land on exact row boundaries. Find the four actual silhouettes in
  // each column so a neighboring blade never gets included in an arm crop.
  function silhouettes(col) {
    const left = Math.round(col * image.width / 4), right = Math.round((col + 1) * image.width / 4);
    const visited = new Uint8Array(image.width * image.height), found = [];
    for (let y = 0; y < image.height; y++) for (let x = left; x < right; x++) {
      const first = y * image.width + x;
      if (visited[first] || pixels[first * 4 + 3] < 40) continue;
      const queue = [first]; visited[first] = 1;
      let x0 = x, y0 = y, x1 = x, y1 = y;
      for (let cursor = 0; cursor < queue.length; cursor++) {
        const index = queue[cursor], cx = index % image.width, cy = Math.floor(index / image.width);
        x0 = Math.min(x0, cx); x1 = Math.max(x1, cx); y0 = Math.min(y0, cy); y1 = Math.max(y1, cy);
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const nx = cx + dx, ny = cy + dy;
          if (nx < left || nx >= right || ny < 0 || ny >= image.height) continue;
          const next = ny * image.width + nx;
          if (visited[next] || pixels[next * 4 + 3] < 40) continue;
          visited[next] = 1; queue.push(next);
        }
      }
      if (queue.length > 200) found.push({ x: x0 - 1, y: y0 - 1, w: x1 - x0 + 3, h: y1 - y0 + 3, count: queue.length });
    }
    const parts = found.sort((a, b) => b.count - a.count).slice(0, 4).sort((a, b) => a.y - b.y);
    if (parts.length !== 4) throw new Error(`Expected four painted parts in column ${col}`);
    return parts;
  }
  const columns = Array.from({ length: 4 }, (_, col) => silhouettes(col));
  function cut(row, col, half = null) {
    const p = columns[col][row];
    const x = p.x + (half === 1 ? Math.floor(p.w / 2) : 0);
    const w = half === null ? p.w : half === 0 ? Math.floor(p.w / 2) : Math.ceil(p.w / 2);
    const result = document.createElement('canvas'); result.width = w; result.height = p.h;
    result.getContext('2d').drawImage(image, x, p.y, w, p.h, 0, 0, w, p.h);
    return result;
  }
  const views = Array.from({ length: 4 }, (_, row) => ({
    core: cut(row, 0), weapon: cut(row, 1), empty: cut(row, 2),
    legs: [cut(row, 3, 0), cut(row, 3, 1)],
  }));
  for (const [view, v] of views.entries()) {
    v.unarmed = document.createElement('canvas');
    v.unarmed.width = v.empty.width; v.unarmed.height = v.empty.height;
    const g = v.unarmed.getContext('2d');
    if (view !== 2) { g.translate(v.empty.width, 0); g.scale(-1, 1); }
    g.drawImage(v.empty, 0, 0);
  }
  const shoulders = [
    { near: [-27, -87], far: [27, -82], weaponPivot: .66, emptyPivot: .35 },
    { near: [-29, -85], far: [30, -82], weaponPivot: .65, emptyPivot: .34 },
    { near: [28, -84], far: [-27, -83], weaponPivot: .36, emptyPivot: .35 },
    { near: [31, -84], far: [-31, -84], weaponPivot: .40, emptyPivot: .65 },
  ];
  const ease = t => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
  function part(g, bitmap, x, y, height, pivotX, pivotY, angle = 0) {
    const scale = height / bitmap.height;
    g.save(); g.translate(x, y); g.rotate(angle);
    g.drawImage(bitmap, -bitmap.width * scale * pivotX, -height * pivotY, bitmap.width * scale, height);
    g.restore();
  }
  return {
    views,
    draw(g, key, view, f, frames) {
      const v = views[view], shoulder = shoulders[view];
      const phase = f / frames * Math.PI * 2;
      const running = key === 'run', dance = key === 'dance', throwing = key === 'throw';
      const cast = throwing ? throwPose(f / THROW.fps) : null;
      const breathing = key === 'idle' ? Math.sin(phase) : 0;
      const falling = key === 'death' ? ease(f / Math.max(1, frames - 1)) : 0;
      const stride = Math.sin(phase);
      // Feet anchor the breath; shoulders and heavy hands follow at a delay.
      const bob = -breathing * 1.3 - (running ? stride * stride * 2 : dance ? stride * stride * 1.5 : 0) + falling * 14 + (cast?.crouch || 0);
      // Heavy cleaver arm swings less than the empty arm. Small arcs keep the
      // painted shoulder cap covered, instead of exposing a second shoulder.
      let nearAngle = running ? stride * .12 : key === 'idle' ? Math.sin(phase - .35) * .018 : 0;
      let farAngle = running ? -stride * .22 : key === 'idle' ? Math.sin(phase - .6) * -.022 : 0;
      if (dance) { nearAngle = -.16 + stride * .18; farAngle = .16 - stride * .18; }
      if (throwing) {
        // An overhead windup, fast forward swing, then a weighted recovery.
        nearAngle = cast.arm * (view === 2 ? -1 : 1);
        farAngle = cast.counterArm * (view === 3 ? -1 : 1);
      }
      nearAngle -= falling * .3;
      farAngle += falling * .25;
      for (let i = 0; i < 2; i++) {
        const step = stride * (i ? -1 : 1);
        const travel = running ? step * (view === 0 || view === 2 ? 8 : 5)
          : dance ? stride * (i ? 2 : -2) : 0;
        // Lift follows the stride by a quarter cycle. Using the same sine
        // for travel and lift retraced identical poses and reversed mid-step.
        const swing = running ? Math.max(0, Math.cos(phase) * (i ? -1 : 1)) : 0;
        const lift = swing * swing * 5;
        const x = (i ? 18 : -18) + travel + falling * (i ? 9 : -9) + (cast ? cast.step * (i ? 1 : -.5) : 0);
        part(g, v.legs[i], x, -lift, 30, .5, 1, swing * -.08);
      }
      g.save();
      // Pivot the torso and both shoulders together above the planted feet.
      g.translate(0, -22);
      g.rotate((cast?.lean || 0) * (view === 3 ? -.35 : 1));
      g.translate(0, 22);
      part(g, v.empty, shoulder.far[0], shoulder.far[1] + bob, 71, shoulder.emptyPivot, .12, farAngle);
      part(g, v.core, 0, -13 + bob, 104, .5, 1);
      const weaponAlpha = cast?.released ? ease((f / THROW.fps - .40) / .08) : 1;
      if (weaponAlpha < 1) {
        g.globalAlpha = 1 - weaponAlpha;
        const pivot = view === 2 ? shoulder.emptyPivot : 1 - shoulder.emptyPivot;
        part(g, v.unarmed, shoulder.near[0], shoulder.near[1] + bob, 68, pivot, .12, nearAngle);
      }
      if (weaponAlpha > 0) {
        g.globalAlpha = weaponAlpha;
        part(g, v.weapon, shoulder.near[0], shoulder.near[1] + bob, 85, shoulder.weaponPivot, .12, nearAngle);
      }
      g.restore();
    },
  };
}
