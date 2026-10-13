// Recover complete generated poses, rather than slicing assumed grid cells.
export async function loadPaintedRun() {
  const names = ['profile', 'front', 'rear', 'back'];
  const strips = await Promise.all(names.map(async name => {
    const image = new Image();
    image.src = `/assets/cartoon/run-${name}-source.png`;
    await image.decode();
    const canvas = Object.assign(document.createElement('canvas'), { width: image.width, height: image.height });
    const g = canvas.getContext('2d'); g.drawImage(image, 0, 0);
    const { data } = g.getImageData(0, 0, canvas.width, canvas.height);
    const seen = new Uint8Array(image.width * image.height), poses = [];
    for (let first = 0; first < seen.length; first++) {
      if (seen[first] || data[first * 4 + 3] < 40) continue;
      const queue = [first]; seen[first] = 1;
      let left = image.width, right = 0, top = image.height, bottom = 0;
      let vestX = 0, vestCount = 0;
      for (let cursor = 0; cursor < queue.length; cursor++) {
        const p = queue[cursor], x = p % image.width, y = Math.floor(p / image.width), i = p * 4;
        left = Math.min(left, x); right = Math.max(right, x);
        top = Math.min(top, y); bottom = Math.max(bottom, y);
        if (data[i] > 190 && data[i + 1] > 170 && data[i + 2] < data[i + 1] - 10) {
          vestX += x; vestCount++;
        }
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || nx >= image.width || ny < 0 || ny >= image.height) continue;
          const next = ny * image.width + nx;
          if (seen[next] || data[next * 4 + 3] < 40) continue;
          seen[next] = 1; queue.push(next);
        }
      }
      if (queue.length < 100) continue;
      if (!vestCount) throw new Error(`Missing torso anchor: ${name}`);
      if (left < 2 || top < 2 || right >= image.width - 2 || bottom >= image.height - 2) {
        throw new Error(`Clipped run source: ${name}`);
      }
      const bitmap = Object.assign(document.createElement('canvas'), { width: right - left + 3, height: bottom - top + 3 });
      const bg = bitmap.getContext('2d'), isolated = bg.createImageData(bitmap.width, bitmap.height);
      // Isolate the connected pose even when two bounding boxes interleave.
      // Include its antialiased fringe, without importing a neighbor's blade.
      for (const p of queue) {
        const x = p % image.width, y = Math.floor(p / image.width);
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy;
          const target = ((ny - top + 1) * bitmap.width + nx - left + 1) * 4;
          const from = (ny * image.width + nx) * 4;
          isolated.data.set(data.subarray(from, from + 4), target);
        }
      }
      bg.putImageData(isolated, 0, 0);
      poses.push({ left: left - 1, top: top - 1, right: right + 1, bottom: bottom + 1, anchorX: vestX / vestCount, bitmap });
    }
    poses.sort((a, b) => a.left - b.left);
    if (poses.length !== 8) throw new Error(`Expected 8 connected complete poses in ${name}; found ${poses.length}`);
    // One baseline per strip retains authored airborne displacement.
    return { image, poses, baseline: Math.max(...poses.map(p => p.bottom)) };
  }));
  // A single scale for the complete family, including airborne poses.
  const heights = strips.flatMap(s => s.poses.map(p => p.bottom - p.top)).sort((a, b) => a - b);
  const scale = 118 / heights[Math.floor(heights.length / 2)];
  return {
    review: { scale, strips: strips.map((s, i) => ({ view: names[i], baseline: s.baseline, poses: s.poses.map(({ bitmap, ...bounds }) => bounds) })) },
    draw(g, view, frame) {
      const s = strips[view], p = s.poses[frame % 8];
      const w = p.right - p.left + 1, h = p.bottom - p.top + 1;
      g.drawImage(p.bitmap, 0, 0, w, h,
        (p.left - p.anchorX) * scale, (p.top - s.baseline) * scale, w * scale, h * scale);
    },
  };
}
