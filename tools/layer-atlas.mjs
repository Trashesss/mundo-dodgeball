import assert from 'node:assert/strict';
import fs from 'node:fs';

// Structural checks shared by the character checks: every baked pose of one
// body or arm layer exists, decodes from a listed page and is not clipped.
export const SKINS = ['classic', 'ronaldo', 'teemo', 'corporate'];
export const WEAPONS = ['cleaver', 'soccer', 'mushroom'];
export const meta = JSON.parse(fs.readFileSync('assets/cartoon/meta.json'));
// Facings that reuse another facing's frames are not baked.
export const bakedDirections = [0, 1, 2, 3, 4, 5, 6, 7].filter(d => !(d in (meta.aliases || {})));

export function checkLayerAtlas(layer, id) {
  const dir = `assets/cartoon/${layer}/${id}/`;
  const atlas = JSON.parse(fs.readFileSync(`${dir}atlas.json`));
  const entries = atlas.textures.flatMap(texture => texture.frames);
  const names = new Set(entries.map(frame => frame.filename));
  const count = Object.values(meta.anims).reduce((sum, anim) => sum + anim.frames * bakedDirections.length, 0);
  assert.equal(entries.length, count, `${layer}/${id}: frame count`); assert.equal(names.size, count, `${layer}/${id}: duplicate frame names`);
  for (const [key, anim] of Object.entries(meta.anims)) for (const d of bakedDirections) for (let f = 0; f < anim.frames; f++) {
    assert.ok(names.has(`${key}_${d}_${f}`), `${layer}/${id}: missing ${key}_${d}_${f}`);
  }
  for (const texture of atlas.textures) {
    assert.ok(texture.image.endsWith('.webp') && fs.existsSync(dir + texture.image), `${layer}/${id}: ${texture.image}`);
    assert.ok(texture.size.w <= 2048 && texture.size.h <= 2048);
    for (const { filename, frame: r, spriteSourceSize: s, sourceSize } of texture.frames) {
      assert.ok(r.x >= 0 && r.y >= 0 && r.x + r.w <= texture.size.w && r.y + r.h <= texture.size.h, filename);
      assert.deepEqual(sourceSize, { w: meta.frameW, h: meta.frameH });
      assert.ok(s.x > 0 && s.y > 0 && s.x + s.w < sourceSize.w && s.y + s.h < sourceSize.h, `${layer}/${id}: clipped ${filename}`);
    }
  }
  if (layer === 'body') {
    const offsets = JSON.parse(fs.readFileSync(`${dir}arm-offsets.json`));
    for (const [key, shift] of Object.entries(offsets)) {
      if (key === 'frameAliases') {
        for (const [from, to] of Object.entries(shift)) {
          assert.ok(bakedDirections.includes(+from) && bakedDirections.includes(to) && +from !== to);
          assert.ok(!(to in shift), `${layer}/${id}: chained arm alias`);
        }
        continue;
      }
      const [anim, d] = key.split('_');
      assert.ok(meta.anims[anim] && bakedDirections.includes(+d), `${layer}/${id}: offset for unknown ${key}`);
      if (Array.isArray(shift[0])) assert.equal(shift.length, meta.anims[anim].frames, `${layer}/${id}: ${key} offsets`);
    }
  }
  return atlas;
}

export const waitMenuLook = (page, skin, weapon) => page.waitForFunction((skin, weapon) => {
  const m = window.__game.scene.getScene('game').menuMundos?.[0];
  return m?.body.texture.key === `mundo-body-${skin}` && m.arm.texture.key === `mundo-arm-${weapon}`;
}, { timeout: 5000 }, skin, weapon);
