// A small, layered cartoon spectator. The rock rim hides the bottom of its neck.
export function createBaron(scene, x, y, depth) {
  const ink = '#292333';
  const texture = (key, w, h, draw) => {
    if (scene.textures.exists(key)) return;
    const t = scene.textures.createCanvas(key, w * 2, h * 2);
    const g = t.getContext();
    g.scale(2, 2);
    g.lineJoin = 'round'; g.lineCap = 'round'; g.lineWidth = 4;
    g.strokeStyle = ink;
    const path = (d, fill, width = 4) => {
      const p = new Path2D(d);
      g.fillStyle = fill; g.fill(p);
      g.strokeStyle = ink; g.lineWidth = width; g.stroke(p);
    };
    const ellipse = (cx, cy, rx, ry, fill) => {
      g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      g.fillStyle = fill; g.fill(); g.strokeStyle = ink; g.lineWidth = 3; g.stroke();
    };
    draw(g, path, ellipse); t.refresh();
  };
  texture('baron-neck', 210, 250, (g, p) => {
    p('M 128 222 Q 181 193 146 128 Q 123 89 137 38 L 82 29 Q 55 82 78 130 Q 99 173 64 211 Q 89 240 128 222 Z', '#675088');
    p('M 88 210 Q 128 176 109 131 Q 88 85 102 42 L 124 42 Q 112 91 132 132 Q 158 185 116 222 Z', '#74aaa6', 3);
    g.strokeStyle = '#426a79'; g.lineWidth = 3;
    for (let i = 0; i < 6; i++) {
      const yy = 74 + i * 23;
      g.beginPath(); g.moveTo(i < 3 ? 100 : 115, yy);
      g.quadraticCurveTo(120, yy + 7, i < 3 ? 127 : 136, yy - 1); g.stroke();
    }
    p('M 75 157 L 48 146 L 67 181 Z', '#8c72ac');
    p('M 145 151 L 168 133 L 157 172 Z', '#8c72ac');
    p('M 69 201 L 44 202 L 62 222 Z', '#8c72ac');
    p('M 143 195 L 170 182 L 156 213 Z', '#8c72ac');
  });
  texture('baron-head', 210, 170, (g, p, e) => {
    // Two smaller heads peek around the main face.
    p('M 54 87 Q 14 66 8 96 Q 2 122 34 126 L 67 113 Z', '#675088');
    p('M 154 85 Q 191 60 201 89 Q 211 116 181 124 L 147 110 Z', '#675088');
    e(27, 106, 15, 14, '#513348'); e(184, 104, 14, 16, '#513348');
    p('M 17 94 L 20 106 L 26 96 M 31 95 L 35 106 L 39 98', '#f3dfae', 2);
    p('M 174 92 L 178 105 L 184 92 M 189 92 L 193 105 L 197 95', '#f3dfae', 2);
    p('M 72 48 Q 60 18 79 7 Q 82 28 99 38 Z', '#9c83bc');
    p('M 128 38 Q 139 9 160 5 Q 151 27 149 52 Z', '#9c83bc');
    p('M 48 77 Q 49 43 75 36 L 101 27 L 120 39 Q 161 32 169 70 L 159 108 Q 144 148 106 150 Q 67 146 53 111 Z', '#8061a4');
    p('M 53 77 L 72 54 L 98 45 L 89 83 L 72 104 L 58 101 Z', '#a087c4', 2);
    p('M 146 54 L 159 72 L 150 110 L 132 129 L 133 87 Z', '#594578', 2);
    p('M 78 113 Q 107 124 142 106 Q 144 143 113 150 Q 84 146 78 113 Z', '#4c3047');
    p('M 99 140 Q 115 130 129 140 L 119 147 L 108 147 Z', '#d78c9b', 2);
    p('M 82 116 L 90 132 L 98 120 M 108 121 L 116 135 L 123 117 M 133 113 L 137 126 L 142 109', '#f3dfae', 2);
    p('M 63 105 Q 61 129 81 137 Q 68 140 60 129 Z', '#f3dfae', 3);
    p('M 153 100 Q 158 125 139 137 Q 155 137 163 120 Z', '#f3dfae', 3);
    e(104, 55, 8, 11, '#c6dd72');
    e(92, 74, 5, 7, '#d5ea88'); e(113, 81, 5, 7, '#d5ea88');
    g.strokeStyle = '#b6a0d0'; g.lineWidth = 4;
    g.beginPath(); g.moveTo(65, 66); g.lineTo(76, 56); g.stroke();
  });
  texture('baron-eyes', 210, 32, (g, p, e) => {
    e(75, 16, 10, 7, '#d6ed80'); e(137, 16, 10, 7, '#d6ed80');
    e(26, 14, 6, 4, '#d6ed80'); e(181, 11, 6, 4, '#d6ed80');
  });
  texture('baron-pupils', 210, 32, (g, p, e) => {
    for (const [cx, cy, r] of [[75, 16, 3], [137, 16, 3], [26, 14, 2], [181, 11, 2]]) e(cx, cy, r, r + 1, ink);
  });
  const root = scene.add.container(x, y).setDepth(depth);
  const neck = scene.add.image(0, 0, 'baron-neck').setOrigin(0.5, 0.9).setScale(0.5, 0.66);
  const head = scene.add.container(0, -190);
  const face = scene.add.image(0, 0, 'baron-head').setScale(0.5);
  const eyes = scene.add.image(0, 2, 'baron-eyes').setScale(0.5);
  const pupils = scene.add.image(0, 2, 'baron-pupils').setScale(0.5);
  head.add([face, eyes, pupils]); root.add([neck, head]);
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  let look = 0;
  return {
    root, head, eyes, pupils,
    update(t, dt, targetX = 0) {
      const desired = Phaser.Math.Clamp((targetX - x) / 650, -1, 1);
      look += (desired - look) * Math.min(1, dt * 2);
      pupils.x = look * 3;
      if (reduced.matches) return;
      head.x = Math.sin(t * 1.25) * 4 + look * 3;
      head.y = -190 + Math.sin(t * 1.8) * 3;
      head.rotation = Math.sin(t * 1.25) * 0.035 + look * 0.035;
      neck.scaleX = 0.5 + Math.sin(t * 1.8) * 0.008;
      // One quick blink every few seconds, with a pause between each glance.
      const phase = t % 4.7;
      const blink = phase > 4.45 ? Math.abs((phase - 4.45) / 0.125 - 1) : 1;
      eyes.scaleY = pupils.scaleY = 0.5 * Math.max(0.08, blink);
    },
  };
}
