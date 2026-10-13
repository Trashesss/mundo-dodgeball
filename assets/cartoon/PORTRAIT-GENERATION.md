# Mundo portrait — 2026-10-13

Generated with the built-in `image_gen` tool, with a transparent background.

References: the user's dark Dr. Mundo splash illustration for mood and design;
`portrait.png` for the existing game's cartoon linework and character identity.

Final prompt: Create one square cartoon game portrait of Dr. Mundo. Reference 1
supplies the purple and teal lighting palette, spiky dark hairstyle, broad jaw,
purple muscular shoulders and cream vest design. Reference 2 supplies the actual
game's simple bold line art and playful cartoon look. Combine these into a
polished friendly humorous fantasy character portrait with cel shading and thick
dark outlines. Head and upper shoulders, centered, slight turn to the right, full
hair visible with comfortable headroom. Purple skin, thick expressive eyebrows,
large goofy smile, uneven square teeth and a little tongue, off-white vest.
Bright clear readable face for a small HUD icon, subtly shaded shoulders with
soft cyan and violet rim light. Transparent empty background, lower shoulders
softly fading into transparency. No scene, medical equipment, hands, weapons,
text, border or watermark. One single character portrait.

The dedicated `portrait-hud.png` is used by both HUD fighters and champion
selection. It is independent of the sprite baking output `portrait.png`.
This earlier version is retained as a source variant.

## Pose and sprite identity revision

Final asset: `portrait-hud-v2.png`, generated using the built-in `image_gen` tool.
References: `source.png` strictly defines character identity and style; the user's
splash illustration defines only the forward-leaning, asymmetric upper-body pose.

Prompt: create one square portrait of the exact simple purple game character,
leaning forward with the head tilted toward the viewer, a large near shoulder
and arm forward on the left and the far arm extended right. Keep the enormous
blocky jaw, tiny black dot eyes without whites, simple thick eyebrows, short
black spiky tuft, open black mouth with one yellow rectangular tooth and pink
tongue, oversized rounded purple arms and torn cream sleeveless vest. Match the
sprite's thick black outlines, flat fills and minimal shading. Show the upper
torso, keep the full hair inside the frame and the face readable at 64px. Use a
cheerful energetic expression, genuine transparency and opaque crisp character
edges. No scenery, other people, medical equipment, wounds, weapons, frame,
text, watermark or sprite sheet.

Both HUD fighters and champion selection use this dedicated portrait. Only the
HUD uses CSS edge fading. The initial selection keeps opaque artwork inside its
cream and dark rounded frame with a muted teal background and checkmark.

## Newspaper, cleaver and background revision

Current asset: `portrait-hud-v3.png`. Built-in `image_gen` edit of
`portrait-hud-v2.png`, with `transparent_background: false`.

Final prompt: preserve the exact simple purple sprite character, thick outlines,
flat lavender skin, blocky jaw, dot eyes, simple eyebrows, short spiky tuft, one
yellow tooth, pink tongue, torn cream vest, forward lean and asymmetric shoulders.
Put a folded newspaper in the near hand at lower left, with a headline bar,
column lines and one picture. Put the brown handle of a large gray rectangular
cleaver with a small round blade hole in the far hand on the right. Both objects
must be held visibly, with the face unobstructed and hair, blade and newspaper
inside the square. Add a fully opaque low-detail dark teal fantasy workshop
background with an arched window, cyan light, silhouetted pipes and muted purple
accents, matching the cartoon style. No fading, frame, readable text or watermark.

Selection keeps the full illustration and cream frame without fading. The HUD
uses 12px rounded corners and intersecting horizontal/vertical edge masks,
fading across the outer 20% on each side. HUD and health-bar shadows are removed.
