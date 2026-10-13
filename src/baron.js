// The spectator uses the same bold outline and goofy expression as Mundo.
export function createBaron(scene, x, y, depth) {
  const root = scene.add.container(x, y).setDepth(depth);
  // Keep the contact shadow on the ground while the spectator gently sways.
  const shadow = scene.add.ellipse(12, -6, 100, 24, 0x202c39, 1);
  const sprite = scene.add.image(0, 0, 'baron-cute').setOrigin(0.5, 0.95);
  const height = 252;
  const scale = height / sprite.height;
  sprite.setScale(scale);
  root.add([shadow, sprite]);
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  let look = 0;
  return {
    root, sprite, shadow,
    update(t, dt, targetX = 0) {
      const desired = Phaser.Math.Clamp((targetX - x) / 650, -1, 1);
      look += (desired - look) * Math.min(1, dt * 2);
      if (reduced.matches) {
        sprite.setPosition(0, 0).setRotation(0).setScale(scale);
        return;
      }
      // A slow curious lean and a soft breathing bounce keep its face readable.
      sprite.x = Math.sin(t * 1.3) * 2;
      sprite.y = Math.sin(t * 1.8) * 2.5;
      sprite.rotation = Math.sin(t * 1.3) * 0.025 + look * 0.025;
      sprite.setScale(scale * (1 + Math.sin(t * 1.8) * 0.012),
        scale * (1 - Math.sin(t * 1.8) * 0.012));
    },
  };
}
