import { PROJ } from '../src/config.js';

// Same ground projection and origin as the original arena; gameplay stays in sim.js.
export function bakeColosseumArena() {
  const canvas = document.createElement('canvas');
  canvas.width = 1920; canvas.height = 1833;
  const g = canvas.getContext('2d');
  const ox = 960, oy = 1036, unit = PROJ.PPU, flat = PROJ.SIN;
  const ink = '#3c2a2b';
  let seed = 614;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  const point = (a, r) => [ox + Math.cos(a) * r * unit, oy + Math.sin(a) * r * unit * flat];
  const ellipse = (r, fill, stroke, width = 4, dy = 0) => {
    g.beginPath(); g.ellipse(ox, oy + dy, r * unit, r * unit * flat, 0, 0, Math.PI * 2);
    if (fill) { g.fillStyle = fill; g.fill(); }
    if (stroke) { g.strokeStyle = stroke; g.lineWidth = width; g.stroke(); }
  };
  const line = (x, y, xx, yy, color, width = 3) => {
    g.beginPath(); g.moveTo(x, y); g.lineTo(xx, yy); g.strokeStyle = color; g.lineWidth = width; g.stroke();
  };
  g.fillStyle = '#574438'; g.fillRect(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < 2200; i++) {
    g.fillStyle = i % 2 ? '#604c3c' : '#503e34';
    g.fillRect(random() * 1920, random() * 1833, 3 + random() * 6, 2);
  }
  // Three stepped stone tiers, enclosed by an arcade.
  ellipse(20.2, '#382a2c', ink, 10, 25);
  ellipse(20.2, '#9d7c60', ink, 9);
  for (let tier = 0; tier < 4; tier++) {
    const radius = 19.6 - tier * 1.16;
    ellipse(radius, ['#ad8e69', '#bf9e74', '#c9aa7d', '#d7b98b'][tier], ink, 5);
    ellipse(radius - .27, null, '#e2c496', 5);
    for (let i = 0; i < 64; i++) {
      const a = i / 64 * Math.PI * 2;
      const [x, y] = point(a, radius), [xx, yy] = point(a, radius - .9);
      line(x, y, xx, yy, '#806047', 2);
    }
    // A restrained, colorful crowd sits on the rear terraces.
    for (let i = 0; i < 92; i++) {
      const a = Math.PI + (i + .5 + random() * .3) / 92 * Math.PI;
      const [x, y] = point(a, radius - .55);
      g.fillStyle = ['#7d4655', '#656481', '#5c8273', '#d7c59a', '#9d6b3d'][i % 5];
      g.beginPath(); g.ellipse(x, y - 7, 6, 9, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#ebc298'; g.beginPath(); g.arc(x, y - 17, 4.5, 0, Math.PI * 2); g.fill();
    }
  }
  // Rear arches are tall; the near balustrade remains below the playable floor.
  for (let i = 0; i <= 26; i++) {
    const a = Math.PI + i / 26 * Math.PI;
    const [x, y] = point(a, 19.8);
    const h = 104, w = 42;
    g.fillStyle = '#b99b78'; g.strokeStyle = ink; g.lineWidth = 5;
    g.beginPath(); g.roundRect(x - w / 2, y - h, w, h, [20, 20, 2, 2]); g.fill(); g.stroke();
    g.fillStyle = '#4c3935';
    g.beginPath(); g.roundRect(x - 12, y - 84, 24, 67, [12, 12, 0, 0]); g.fill();
    line(x - 25, y - h - 2, x + 25, y - h - 2, '#ebd1a2', 7);
  }
  ellipse(15.4, '#927151', ink, 6);
  ellipse(14.95, '#f0d19a', '#e9c58a', 7);
  const sand = g.createLinearGradient(0, oy - 450, 0, oy + 500);
  sand.addColorStop(0, '#dfbc7f'); sand.addColorStop(.5, '#eacb91'); sand.addColorStop(1, '#d9b477');
  ellipse(14.5, sand, '#ab8052', 3);
  g.save();
  g.beginPath(); g.ellipse(ox, oy, 14.4 * unit, 14.4 * unit * flat, 0, 0, Math.PI * 2); g.clip();
  for (let i = 0; i < 1800; i++) {
    const x = ox - 600 + random() * 1200, y = oy - 460 + random() * 920;
    g.fillStyle = i % 3 ? '#c7a46c55' : '#fff1c955';
    g.fillRect(x, y, 2 + random() * 4, 1.5);
  }
  // Decorative laurel at center, kept faint for projectile readability.
  g.save(); g.translate(ox, oy); g.scale(1, flat); g.globalAlpha = .19;
  for (const side of [-1, 1]) {
    g.strokeStyle = '#8a633f'; g.lineWidth = 5;
    g.beginPath(); g.ellipse(0, 0, 155, 155, 0, side < 0 ? Math.PI / 2 : -Math.PI / 2, side < 0 ? Math.PI * 1.5 : Math.PI / 2); g.stroke();
    for (let j = 0; j < 9; j++) {
      const a = -1.12 + j * .28;
      g.save(); g.translate(side * Math.cos(a) * 154, Math.sin(a) * 154);
      g.rotate(side * (a + .6)); g.fillStyle = '#8a633f';
      g.beginPath(); g.ellipse(0, 0, 23, 9, 0, 0, Math.PI * 2); g.fill(); g.restore();
    }
  }
  g.font = '38px Jua'; g.textAlign = 'center'; g.fillStyle = '#8a633f';
  g.fillText('M', 0, 14); g.restore();
  // Dashed center line uses the same x=0 divider as both maps.
  g.setLineDash([15, 16]); line(ox, oy - 425, ox, oy + 425, '#fff1cd', 5); g.setLineDash([]);
  g.restore();
  ellipse(14, null, '#fff0c3', 3);
  // Crimson pennants and braziers frame the arena outside the movement boundary.
  for (const a of [3.62, 4.22, 4.71, 5.20, 5.80, .48, 2.66]) {
    const [x, y] = point(a, 19.8);
    line(x, y, x, y - 168, ink, 7);
    g.fillStyle = '#a84643'; g.strokeStyle = ink; g.lineWidth = 4;
    g.beginPath(); g.moveTo(x + 3, y - 162); g.lineTo(x + 54, y - 152);
    g.lineTo(x + 48, y - 80); g.lineTo(x + 27, y - 91); g.lineTo(x + 4, y - 87); g.closePath(); g.fill(); g.stroke();
    line(x + 28, y - 142, x + 27, y - 108, '#edca84', 5);
    g.fillStyle = '#ebc688'; g.beginPath(); g.arc(x, y - 172, 6, 0, Math.PI * 2); g.fill();
  }
  for (const a of [3.84, 5.58, .72, 2.42]) {
    const [x, y] = point(a, 15.7);
    g.fillStyle = '#72513e'; g.strokeStyle = ink; g.lineWidth = 4;
    g.beginPath(); g.roundRect(x - 13, y - 43, 26, 46, 4); g.fill(); g.stroke();
    g.fillStyle = '#3d3030'; g.fillRect(x - 22, y - 50, 44, 13);
    g.fillStyle = '#ee9351'; g.beginPath(); g.moveTo(x - 16, y - 51);
    g.quadraticCurveTo(x - 18, y - 71, x - 4, y - 80); g.quadraticCurveTo(x, y - 68, x + 4, y - 92);
    g.quadraticCurveTo(x + 24, y - 68, x + 15, y - 51); g.closePath(); g.fill();
    g.fillStyle = '#ffe3a1'; g.beginPath(); g.ellipse(x, y - 58, 7, 12, 0, 0, Math.PI * 2); g.fill();
  }
  return { data: canvas.toDataURL('image/png'), meta: { width: canvas.width, height: canvas.height, originX: ox, originY: oy } };
}
