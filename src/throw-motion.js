// Shared by the baked poses and live Q: the blade leaves on the release pose.
export const THROW = { fps: 60, frames: 30, release: 0.14, duration: 0.5 };

const smooth = t => {
  t = Math.max(0, Math.min(1, t));
  return t * t * (3 - 2 * t);
};

export function throwPose(seconds) {
  const lift = smooth(seconds / 0.09);
  const swing = smooth((seconds - 0.09) / (THROW.release - 0.09));
  const settle = smooth((seconds - 0.21) / (THROW.duration - 0.21));
  return {
    arm: (2.15 * lift * (1 - swing) - 1.05 * swing) * (1 - settle),
    counterArm: (-0.38 * lift + 0.7 * swing) * (1 - settle),
    lean: (-0.14 * lift + 0.4 * swing) * (1 - settle),
    crouch: (2 * lift + 5 * swing) * (1 - settle),
    step: 6 * swing * (1 - settle),
    released: seconds >= THROW.release,
  };
}
