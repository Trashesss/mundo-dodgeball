# Teemo mushroom assets · 2026-10-27

Generated with the built-in `image_gen` tool. No CLI fallback was used. Both files are copied unchanged from the generated outputs.

## Deliverables

- `teemo-mushroom-v1.png`: 1254 × 1254, transparent PNG. One green mushroom with five coral-red spots, a cream stalk, bold dark outline and simple cel shading. Intended for the projectile and the shop item image, following the existing soccer-ball convention.
- `teemo-mushroom-throw-icon-v1.png`: 1254 × 1254, opaque square PNG. Existing throwing Mundo and emerald/mint motion composition, with the soccer ball replaced by the same mushroom. Intended for the Q ability button. The game supplies its frame and Q label.

The complete set includes the four-view grip source and all three character animation sets described below. The mushroom is registered as a 300-coin cosmetic weapon in the shop, gameplay, HUD and shared online appearance validation.

## Sprite generation

References: `soccer-ball-v2.png` and `teemo/shop-v1.png`, both as style references. Genuine transparent background requested and preserved.

### Final prompt

Use case: stylized-concept.
Asset type: one transparent projectile sprite and reusable shop item image for an existing cute 2D cartoon dodgeball game.
Input image 1 is STYLE REFERENCE ONLY: the game's cream-and-charcoal soccer ball with chunky ink outline and simple cel shading. Input image 2 is STYLE REFERENCE ONLY: the game's purple Mundo wearing Teemo scout gear. Do not draw either reference subject.
Primary request: Draw exactly ONE instantly recognizable classic Teemo noxious-trap mushroom as a throwable game prop. A very broad, plump domed bright lime/olive green mushroom cap with FIVE large irregular rounded red/coral spots, a thick dark green lower cap rim and a short stout warm cream stalk that flares gently at its round base. The cap is about 2.5 times the stalk width. Slight three-quarter view from above, so its broad spotted dome and short stalk are both clear. Cute compact sturdy silhouette, not a tall thin toadstool. No face or eyes.
Style: same simple FLAT 2D cartoon style as the references, bold slightly organic near-black ink contour #292333, about 2.5 percent of the object width; very few large color shapes; one dark green cel shadow under the cap, one muted lavender-beige shadow on the right of the stalk, one small pale lime highlight on the upper-left cap. The saturated red spots are big and readable at 40 pixels. Crisp handmade cartoon contours. Do not use 3D or realistic lighting, gradients, texture, gills, pores or fine speckles.
Composition: exactly one centered complete upright mushroom occupies 86 percent of the square canvas width and roughly 80 percent of its height; balanced transparent margin, no cropped edges.
Background: genuine transparent alpha. No floor, grass, dirt, external shadow, backdrop, frame, particles, trails, hands, characters, other objects, lettering, watermark or logo. This is a clean reusable game sprite, not an illustration scene.

## Throw icon generation

Edit target: `soccer-throw-icon-v1.png`. Mushroom reference: `teemo-mushroom-v1.png`. Opaque background requested.

### Final prompt

Use case: precise-object-edit.
Asset type: full-bleed square 2D cartoon game ability icon, matching an existing skill icon family.
Image 1 is the EDIT TARGET: the existing soccer-throw skill icon. Image 2 is the EXACT mushroom design reference.
Replace ONLY the flying soccer ball in the UPPER RIGHT of image 1 with one flying Teemo noxious-trap mushroom matching image 2: broad plump lime green cap, large coral-red spots, dark green cap rim, short thick warm cream stalk, bold near-black contour. Tilt the mushroom clockwise about 25 degrees so its spotted dome and stalk both read clearly as it flies toward the upper right. Mushroom should occupy about 36 percent of the square width, slightly larger than the original ball if needed, entirely within the image except for none of the cap being cropped.
Preserve the exact same chunky happy purple Mundo character, black spiky hair, one tooth, open mouth and pink tongue, ragged cream vest, black shorts, large muscular open throwing hand, pose and diagonal composition. Preserve the rich dark emerald green full-bleed backdrop and the large bright mint sweeping motion arc, with the mushroom at the arc's end. The mushroom replaces the ball and shares the original object's mint rim light. There must be no soccer ball, pentagon pattern, cleaver, blade or other thrown object anywhere.
Match the existing simple thick ink drawing, flat fills, restrained cel shadows and playful energetic pose. No realistic texture, 3D rendering or extra detail.
Opaque square edge-to-edge artwork, no border, rounded frame, text, Q badge, letters, numbers, logo or watermark. The game draws the frame and Q label separately.

## Four-view mushroom grip · 2026-10-27

`teemo-mushroom-parts-v1.png` was generated with the built-in `image_gen` tool and a genuine transparent background. The edit target was `soccer-parts-v4.png`; the prop reference was `teemo-mushroom-v1.png`. A second edit removed accidental duplicate stalks and reduced cap size to keep each arm inside its source column. Only the second column is consumed by the animation baker. Body cores, empty arms, legs, skin-specific costumes and rig registration are read from their existing source assets.

### Initial grip prompt

Use case: precise-object-edit.
Asset type: transparent 4-by-4 character body-parts source atlas for the game's existing joint animation rig.
Image 1 is the EDIT TARGET and exact registration master: a square 4-row 4-column sprite parts sheet. Image 2 is the mushroom design reference.
Edit ONLY the FOUR soccer balls in COLUMN TWO, one attached to each existing purple weapon arm. Replace each soccer ball with a single small Teemo mushroom matching image 2: wide lime-green cap with big coral-red spots, thick near-black contour, dark green underside rim and short warm cream stalk. The original hand naturally grips the SHORT STALK, occluding its middle, while most of the green cap with at least two red spots is visible immediately to the lower-right of the fist. Tilt each mushroom about 25 degrees clockwise so it sits in roughly the original ball area. The mushroom cap width is about 110 to 125 pixels on this 1280-wide canvas. Each mushroom is a small handheld prop, never as large as the full arm.
CRITICAL: keep the original purple shoulder, upper arm, forearm and compact mitten-like hand shapes EXACTLY unchanged. Preserve their exact source positions, proportions, purple colors, heavy ink and existing short finger creases. No new fingers, detailed thumbs, extra joints or anatomical redesign. The existing purple fist must visibly overlap the mushroom's stalk so this is a held object, not a floating object or a dangling ornament. Keep each complete arm and mushroom as a single connected silhouette.
Retain exact original square canvas and four rows/four columns with transparent gutters. All parts in column 1 (body), column 3 (empty arms), column 4 (legs) must be visually unchanged at identical coordinates and sizes. Only column two's soccer balls change. No black/cream soccer panels remain in any of the four hands. No brown wooden handles, blades, extra objects or particles. Match the same simple flat cartoon rendering and line weight as image 1. True transparent alpha background, no labels, text, floor, external shadows or watermark.

### Final grip cleanup prompt

Use case: precise-object-edit.
Image 1 is the exact EDIT TARGET: the newly made transparent four-row four-column mushroom arm parts sheet. Image 2 is the mushroom design reference.
Make ONLY these small local corrections around the FOUR mushroom props in COLUMN TWO:
1. Each mushroom must have exactly ONE short cream stalk, running up-left into the existing purple fist. The green spotted cap is down-right of the fist. REMOVE the accidental EXTRA small cream stalk/foot sticking out from underneath the green cap in rows 2, 3 and 4. There must be NO cream protrusion on the lower side of any cap. Preserve the single cream stalk between fist and cap in all four rows.
2. Make each mushroom cap about 15 percent smaller and shift it a little LEFT toward the fist, so the entire cap, stalk and outline fit safely WITHIN column two. On this square canvas column two spans x=25% to x=50% of the width. Keep all mushroom edges at least 1.5% of total canvas width LEFT of the x=50% column boundary. No mushroom pixels may spill into column three. Keep the fist visibly overlapping and holding the stalk; arm and mushroom stay one connected silhouette.
Keep the original purple arms and hands EXACTLY unchanged, including shoulder positions, anatomy, elbow silhouettes, colors and outline. Do not add fingers or redraw the arm. Keep all other columns, all row spacing, exact square canvas, transparent gutters and true transparent alpha unchanged. No balls, brown handles, extra limbs, extra cream stems, text, shadows or background. Clean flat cartoon prop anatomy: ONE green red-spotted cap plus ONE short cream stalk per hand, no other mushroom parts.

## Complete animation export

The existing joint animation baker now accepts `--mushroom`. `npm run bake:mushroom` creates separate new WebP multi-atlases for classic, Ronaldo and Teemo Mundo. Each set includes 1,712 frames (five states, eight directions), retaining the existing 0.14-second release, 0.5-second throw duration and recovery. No existing atlases are replaced. The baker omits shop portraits for mushroom exports.

See `mushroom/README.md` and `mushroom/asset-set.json` for the complete asset inventory and integration details. `tools/mushroom-preview.html` previews the final encoded frames without loading the game.

The game loads the three new character atlases and the separate mushroom projectile. Equipping the weapon updates its Q label and icon, and the shared appearance validation preserves the mushroom on both online clients. Speed, damage, collision, cooldown and other gameplay rules use the existing throw simulation unchanged.
