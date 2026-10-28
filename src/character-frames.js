// A skin can reuse a shared weapon-arm direction without changing its body
// animation, frame timing, or the weapon's original atlas.
export function armFrameName(name, aliases) {
  if (!aliases) return name;
  const [key, direction, frame] = name.split('_');
  return `${key}_${aliases[direction] ?? direction}_${frame}`;
}
