"""Encode previews rendered from the final game atlas (requires Pillow)."""
import json
from pathlib import Path

from PIL import Image

root = Path(__file__).resolve().parent.parent
output = root / "output" / "animation"
manifest = json.loads((output / "preview-frames.json").read_text())

for filename, state in [("motion-preview.gif", None), ("run-preview.gif", "run")]:
    selected = [frame for frame in manifest if state is None or frame["state"] == state]
    frames = [Image.open(root / frame["path"]).convert("RGB") for frame in selected[::2]]
    # One shared palette avoids palette flicker in thin black outlines.
    palette = frames[0].quantize(colors=256)
    indexed = [frame.quantize(palette=palette, dither=Image.Dither.NONE) for frame in frames]
    indexed[0].save(output / filename, save_all=True, append_images=indexed[1:],
                    duration=[40 if i % 3 == 2 else 30 for i in range(len(indexed))],
                    loop=0, disposal=2)
    print(f"Saved {filename}: {len(indexed)} frames")
