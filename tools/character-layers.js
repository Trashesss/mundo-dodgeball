// Browser helpers for previews and checks: load a body or arm layer and draw
// one pose the way the game stacks them (arm over body, shifted per body).
import { armFrameName } from '../src/character-frames.js';

export async function loadLayer(layer, id) {
  const dir = `/assets/cartoon/${layer}/${id}/`;
  const atlas = await (await fetch(`${dir}atlas.json`)).json();
  const offsets = layer === 'body' ? await (await fetch(`${dir}arm-offsets.json`)).json() : {};
  const frames = new Map();
  await Promise.all(atlas.textures.map(async (texture) => {
    const image = new Image(); image.src = dir + texture.image; await image.decode();
    for (const frame of texture.frames) frames.set(frame.filename, { image, ...frame });
  }));
  return { layer, id, atlas, offsets, frames };
}

export const frameName = (meta, key, direction, f) => `${key}_${meta.aliases?.[direction] ?? direction}_${f}`;

export function armShift(body, name) {
  const [key, d, f] = name.split('_'), shift = body.offsets[`${key}_${d}`];
  return !shift ? [0, 0] : Array.isArray(shift[0]) ? shift[f] : shift;
}

// x, y is the foot anchor on ctx. Pass arm = null for the body alone.
export function drawPose(ctx, meta, body, arm, key, direction, f, x, y, scale = 1) {
  const name = frameName(meta, key, direction, f);
  const layers = [[body, [0, 0]], ...(arm ? [[arm, armShift(body, name)]] : [])];
  for (const [layer, [ox, oy]] of layers) {
    const entry = layer.frames.get(layer === arm ? armFrameName(name, body.offsets.frameAliases) : name), r = entry.frame, s = entry.spriteSourceSize;
    ctx.drawImage(entry.image, r.x, r.y, r.w, r.h,
      x + (s.x + ox - meta.frameW / 2) * scale, y + (s.y + oy - meta.frameH * meta.anchor) * scale, s.w * scale, s.h * scale);
  }
}
