import { ARENA, PROJ } from '../src/config.js';

// Draw at the same world scale and origin as the original baked arena.
export function bakeCartoonArena() {
  const canvas = document.createElement('canvas');
  canvas.width = 1920; canvas.height = 1833;
  const g = canvas.getContext('2d');
  const ox = 960, oy = 1036, ink = '#191d2d';
  let seed = 2917;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  const project = (x, z) => [ox + x * PROJ.PPU, oy + z * PROJ.PPU * PROJ.SIN];
  const ellipse = (x, y, rx, ry, fill, stroke, width = 5) => {
    g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    g.fillStyle = fill; g.fill();
    if (stroke) { g.strokeStyle = stroke; g.lineWidth = width; g.stroke(); }
  };
  // Leave the bank transparent so the repeating world texture shows through.
  // Preserve the prop seed so removing the patches doesn't rearrange the rocks.
  for (let i = 0; i < 400; i++) random();
  // Draw rocks directly on transparency without a colored strip beneath them.
  const props = [];
  for (let i = 0; i < 56; i++) {
    const a = i * Math.PI * 2 / 56;
    const r = ARENA.ROCK_R + 1.15 + random() * .5;
    const [x, y] = project(Math.cos(a) * r, Math.sin(a) * r);
    props.push({ x, y, w: 41 + random() * 29, h: 54 + random() * 62, shade: i % 3 });
  }
  props.sort((a, b) => a.y - b.y);
  for (const p of props) {
    const { x, y, w, h } = p;
    ellipse(x + 9, y + 7, w + 12, 17, '#202c39');
    g.beginPath();
    g.moveTo(x - w, y - 5);
    g.bezierCurveTo(x - w - 8, y - h * .5, x - w * .63, y - h, x - 8, y - h);
    g.bezierCurveTo(x + w * .6, y - h - 8, x + w, y - h * .6, x + w, y - 17);
    g.quadraticCurveTo(x + w + 5, y + 12, x + 7, y + 15);
    g.quadraticCurveTo(x - w * .8, y + 18, x - w, y - 5);
    g.closePath();
    g.fillStyle = ['#788398', '#8991a4', '#737c95'][p.shade]; g.fill();
    g.strokeStyle = ink; g.lineWidth = 7; g.stroke();
    g.save(); g.clip();
    g.strokeStyle = '#aab5c7'; g.lineWidth = 5; g.lineCap = 'round';
    g.beginPath(); g.moveTo(x - w * .63, y - h * .53);
    g.quadraticCurveTo(x - w * .52, y - h * .83, x - w * .15, y - h * .83); g.stroke();
    g.restore();
    g.strokeStyle = '#3c465e'; g.lineWidth = 4;
    g.beginPath(); g.moveTo(x - 7, y - 21); g.lineTo(x + 2, y - 36); g.lineTo(x + 16, y - 40); g.stroke();
    if (p.shade === 0) {
      g.beginPath(); g.moveTo(x - w - 10, y + 10); g.lineTo(x - w - 18, y - 12);
      g.lineTo(x - w - 6, y - 5); g.lineTo(x - w + 1, y - 23);
      g.lineTo(x - w + 9, y - 3); g.lineTo(x - w + 22, y - 12); g.lineTo(x - w + 17, y + 12);
      g.closePath(); g.fillStyle = '#75a78c'; g.fill(); g.strokeStyle = ink; g.lineWidth = 4; g.stroke();
    }
  }
  return { data: canvas.toDataURL('image/png'), meta: { width: canvas.width, height: canvas.height, originX: ox, originY: oy } };
}
