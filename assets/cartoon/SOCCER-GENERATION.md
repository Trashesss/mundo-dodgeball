# Classic soccer ball · 2026-10-26

## Current asset: v2, character-matched cartoon

Generated with the built-in `image_gen` tool with `transparent_background: true` and `parts-source.png` as a style reference. The output is copied unchanged to `soccer-ball-v2.png` and used for the shop and projectile. The Q ability uses the dedicated action icon described below. No CLI fallback was used. Thick near-black ink, warm cream panels and a simple lavender-gray cel shadow replace v1's realistic leather, beveled seams and detailed lighting. The original v1 is retained as a previous version.

## Soccer throw ability icon

`soccer-throw-icon-v1.png` was generated with the built-in `image_gen` tool and an opaque background, editing `cleaver-icon.png` with `soccer-ball-v2.png` as the ball reference. It preserves the original throwing Mundo, emerald backdrop and mint speed swoosh while replacing the flying cleaver with a soccer ball. CSS uses it only for the equipped soccer Q icon. The existing frame, cooldown and Q badge remain drawn by the HUD.

### Final ability-icon generation prompt

Use case: precise-object-edit.

Asset type: full-bleed square 2D cartoon game ability icon.

Image 1 is the EDIT TARGET: the game's existing green cleaver-throw skill icon. Image 2 is the soccer-ball design reference.

Edit image 1 by REPLACING ONLY the flying cleaver in its upper-right corner with a flying soccer ball based on image 2. Preserve the same happy chunky purple Mundo character, cream ragged vest, black shorts, black spiky hair, one tooth, open throwing hand, dynamic pose and diagonal composition. Preserve the exact rich emerald green background and sweeping bright mint green/cream curved speed streaks. Make the ball clearly visible in the upper-right quadrant, in front of the end of the mint swoosh, with most of its circular silhouette fully inside the square. The ball should be large enough to read at 58x58 pixels, approximately 34 percent of the canvas width. The ball has warm cream panels, charcoal pentagon patches, bold near-black cartoon outlines and simple muted lavender-gray shading. It is moving up and to the right, with the character's open hand following through after the throw. No cleaver or blade remains.

This must look like the SAME illustrated skill-icon family as the original: thick bold ink, simple bright cel shapes, playful action, strong silhouette and saturated colored background. Match the original character rather than redesigning him. The foreground ball can have a thin mint rim glow like the original cleaver. Do not add fine realistic texture or glossy 3D rendering.

Square edge-to-edge opaque artwork, no border or rounded corner frame, no transparent margin, no letters, no Q badge, no numbers, no text, no watermark. The game already draws its own frame and Q label.

`npm run bake:soccer` combines the existing painted body parts from `parts-source.png` with the edited original weapon arms in `soccer-parts-v4.png` to produce `soccer/atlas.json` and WebP animation pages. The arm and ball share the shoulder pivot and release at the existing `THROW.release` timing. After release the rig switches to the existing empty arm, then restores the grip during recovery. Original cleaver animations remain intact. Movement, hitboxes, damage, cooldowns and the online protocol are unchanged.

## Current hand grip: v4, ball tucked behind the original fist

`soccer-parts-v4.png` was generated with the built-in `image_gen` tool and a transparent background. The edit target is the user's attached, selected v2-style atlas (`codex-clipboard-69494c2c-85b0-4920-8214-050094438da5.png`). Its simple hand and arm silhouettes are retained. Only the ball position and overlap change: roughly half of each ball is tucked behind the original fist/lower forearm, leaving the lower/right panels visible. No individual fingers or new thumb shapes are added. The brown handle stubs remain removed, and source-coordinate registration is unchanged.

### Final v4 generation prompt

Use case: precise-object-edit.

Image 1 is the EXACT user-selected edit target, a transparent 4x4 cartoon character parts atlas.

Make ONLY this change: tuck the four soccer balls in COLUMN TWO further BEHIND the existing purple hands, so roughly 45 to 55 percent of each full ball disk is hidden/occluded by the hand and lower forearm. The visible ball should peek out around the lower/right side of each fist, making it clear the hand is wrapped around a round object.

To achieve this, move each existing ball about one third of its diameter UP and about one quarter of its diameter toward the hand's center, placing the ball BEHIND the purple hand layer. Keep each ball's diameter and cream/charcoal panel design unchanged. Restore the original hand's black silhouette line IN FRONT of the ball. The ball's central pentagon may be partly obscured by the purple hand; only the exposed right/lower portion of the ball needs to remain visible.

CRITICAL: preserve the hands and arms EXACTLY AS THEY ALREADY ARE in this target. Do NOT add fingers or a thumb, do NOT bend the elbow, do NOT extend the palm, do NOT change any purple anatomy, do NOT redesign the grip, and do NOT add detail. This is ONLY a ball position and overlap edit. The original simple closed hand silhouette stays unchanged. The amount of hand covering the ball is the requested correction.

Apply the same relative occlusion to all four balls in the existing four arm views. Keep shoulders, upper arms, wrists, skin colors, outlines, shading, body cores, empty arms and legs in the exact same locations and sizes. No cleavers, no brown handle stubs, no new objects. Preserve the square canvas, original four rows and four columns, and true transparent alpha background. No labels, text, floor, external shadow or watermark.

## Previous hand grip: v3, compact overlapping grip

`soccer-parts-v3.png` was generated with the built-in `image_gen` tool, a transparent background, `soccer-parts-v2.png` as the edit target and `parts-source.png` as a rendering-style reference. Only the four grip areas in the second column were changed. The ball is raised toward the palm; a short thumb and compact curled pad overlap the lower-left/front of the ball, making its contact with the hand visible at gameplay size. The original simple arm style, source-coordinate registration and removed brown handles are retained. V2 and v1 remain as previous assets.

### Final v3 generation prompt

Use case: precise-object-edit.

Asset type: surgical grip correction in a transparent four-by-four 2D cartoon sprite atlas.

Image 1 is the EDIT TARGET, the current soccer-arm atlas. Image 2 is STYLE REFERENCE ONLY, the game's original painted parts: copy only the simplicity of its mitten-like hands, purple skin and black outline. NEVER copy its cleavers, wood or handles.

Modify ONLY the FOUR hand-and-soccer-ball areas at the bottom of the arms in COLUMN TWO of image 1. Everything else must stay in exactly the same place, scale, shape and color, including the shoulders, upper arms, elbows, forearms, body parts, empty arms and legs.

PROBLEM TO FIX: the balls currently hang BELOW closed fists like ornaments, with almost the whole sphere visible and no thumb across the ball, so the character does not look like he is holding them.

REQUIRED GRIP: raise each existing ball by about ONE THIRD OF ITS DIAMETER and move it slightly toward the palm. The ball's center must be level with the palm, not below the entire hand. Keep the existing ball diameter and black/cream design. Put the purple palm UNDER the ball's lower-left quadrant, and add ONE SHORT THICK ROUNDED THUMB overlapping the FRONT-LEFT side of the ball. A compact mitten-like curled finger pad overlaps the lower-front edge of the ball. The visible purple hand must occlude about one quarter of the sphere's lower-left outline so the ball clearly sits INSIDE a firm grip. The ball's central pentagon and most upper/right panels remain visible. The wrist must join this compact palm continuously. Show clear purple-over-ball occlusion; a fist merely touching a full ball from above is NOT acceptable.

Keep the drawing as simple as the original cleaver hand: one short thumb lobe, one compact rounded finger pad, at most two short black creases total. No long fingers, no fan of four digits, no detailed anatomy, no extra muscle bulges. Preserve the original hanging arm and elbow silhouette; do not bend the whole arm into a new big cupping pose. Allow only a small local change at wrist/palm.

Apply this same unmistakable compact ball-grip in the existing four view directions. All four hands must hold the ball rather than dangling it. No blades, NO BROWN HANDLE STUBS, no brown objects, no extra limbs. No background or external shadow. True transparent alpha, original square canvas and original 4x4 arrangement. Use the exact purple/black cel rendering of the existing parts, not a new art style.

## Previous hand grip: v2, original arm proportions and detail

`soccer-parts-v2.png` is an edit of `parts-source.png` made with the built-in `image_gen` tool and a transparent background. Only the second column is consumed by the rig. The original compact arm and mitten/fist style is retained, replacing the cleaver with a soccer ball rather than adding long individual fingers or bending the arm into a new cupping pose. A second surgical edit removes all four leftover brown wooden handle stubs. The edited sheet's original shoulder coordinates determine each cutout's pivot and scale, keeping the arm registered with the original cleaver arm even when the ball changes its bounding box.

### Final v2 prompt set: original-arm edit

Use case: precise-object-edit.

Asset type: replacement weapon-arm source atlas for an existing 2D sprite rig.

IMAGE 1 IS THE EDIT TARGET AND THE STRICT MASTER. IMAGE 2 is ONLY the soccer-ball design reference.

Make a minimal surgical edit to image 1. Keep its exact square canvas, exact four rows and four columns, transparent background, and every body part at its original size, position and orientation. Change ONLY the cleavers and the tiny grip area at the bottom of the FOUR arms in the SECOND COLUMN. Replace each cleaver with one small warm cream-and-charcoal soccer ball matching image 2.

CRITICAL: Keep the existing purple shoulder, upper arm, forearm, elbow, wrist, muscle contour, arm length, skin colors, soft minimal shading and thick black linework IDENTICAL to image 1. Do not redraw or redesign the arm. The four arms must retain the source's original hanging/diagonal shape. Do not bend the forearm into an upturned carrying pose. Do not enlarge the biceps or make the limb longer.

The hand must retain the original simple chunky mitten/fist shape and same level of detail as the cleaver-holding hand. It holds the ball with ONE short rounded thumb lobe and at most ONE small black crease. The palm and thumb overlap a small side/lower portion of the ball to show contact. Absolutely NO row of extended individual fingers, no four separate sausage fingers, no realistic palm anatomy, no new wrist folds or extra muscle lines. The fist should look almost the same as the original cleaver fist, simply grasping a round object rather than a handle.

Each ball replaces the blade near the original hand position, rather than being held at chest level or raised above the hand. Ball diameter about the original blade width, around 100 to 115 pixels on the 1280-pixel source canvas; it must remain smaller than the entire arm length. Use simple cream hexagon panels and charcoal pentagon patches with bold black outline, no microtexture.

Keep the head/torso in column 1, empty arms in column 3 and legs in column 4 completely unchanged. No extra objects, no labels, no text, no background, no floor, no shadows outside silhouettes. True transparent alpha. This is a precise weapon replacement in the original sprite sheet, NOT a new illustration. Preserve the original simple arm/hand drawing quality exactly.

### Final v2 prompt set: handle cleanup

Use case: precise-object-edit.

Image 1 is the edit target: a transparent four-by-four cartoon character parts atlas. Preserve the image's exact canvas, layout and all artwork.

There are FOUR unwanted small BROWN WOODEN CLEAVER HANDLE STUBS sticking out LEFT from the purple hands in COLUMN TWO, one per row. These were accidentally left behind when the blades were replaced with soccer balls. REMOVE ALL FOUR BROWN HANDLE STUBS ENTIRELY. They are around (x443,y250), (x420,y545), (x457,y831), (x456,y1151) on the 1280-square image. Erase the brown wood and its projecting black outline to genuine transparent alpha, and cleanly continue the adjacent hand's short black exterior contour.

The hands must now hold ONLY their soccer balls. No brown pixels, wood, handle, collar, blade, or other object may protrude from any of these four gripping hands. Keep the original compact mitten/fist silhouettes, purple colors, tiny thumb, restrained detail and original arm shapes. Do not add individual fingers or change the grip pose.

Everything else must remain visually identical: all four soccer balls, their size and position, the purple arms, shoulders, bodies, empty arms, legs, all four rows and columns. Do not redraw or redesign the character. Do not recolor anything. No new shadows. Preserve genuine transparency. Exactly one surgical correction: remove the four leftover brown handle stubs.

## Previous hand grip: v1, cupped fingers

`soccer-grip-v1.png` was generated with the built-in `image_gen` tool, genuine transparent background, and `parts-source.png` plus `soccer-ball-v2.png` as references. It contains four complete connected arm/hand/ball silhouettes stacked vertically. The palm supports the ball, with fingers drawn over its lower front edge. Using a painted grip fixes the disconnected appearance of the earlier generic fist plus separate ball overlay. The baker extracts each connected silhouette independently to avoid including nearby rows, and registers each shoulder with a per-view pivot.

### Final grip generation prompt

Use case: stylized-concept / compositing.

Asset type: transparent painted arm-and-ball cutout atlas for an existing 2D cartoon game rig.

Input image 1 is the exact character style/anatomy/arm direction reference. Input image 2 is the exact soccer ball style reference. Create only FOUR isolated complete purple arms, each naturally HOLDING a small soccer ball in its hand. Do not draw a torso, head, legs or whole character.

Layout: square transparent canvas with one single vertical column of four separate arm cutouts. Exactly one arm entirely within each horizontal quarter of the image, with transparent gutters and no contact between rows. Top to bottom: (1) side view matching row 1 column 2 of image 1, (2) front three-quarter view matching row 2 column 2, (3) rear three-quarter view matching row 3 column 2, (4) rear view matching row 4 column 2. Each arm must occupy the same height and roughly equal size. Arm shoulder on top, hand low, upper arm hanging naturally downward. Match the arm silhouettes, chunky rounded muscles, purple skin and thick near-black contour of the reference. The shoulder socket is a rounded cap, no protruding stump or extra anatomy.

The important repair is the GRIP: continuous forearm and wrist lead into a broad cupped palm SUPPORTING the ball from below and slightly behind. Three short rounded purple fingers curl up over the lower FRONT edge of the ball, with a short thumb wrapping one side. Fingers clearly overlap the lower ball silhouette, showing genuine contact and support. Keep most of the upper and central cream/black ball panels visible. Hand and ball must be a single connected cutout. No clenched fist hidden behind a floating ball. Do not place the ball at a straight arm's fingertip with no palm contact. No wrist gap, disconnected fingers, extra hands or sausage fingers.

Ball diameter roughly 1.2 times palm width, or around 38 percent of the full cutout's shoulder-to-bottom height. Ball design matches image 2: warm cream panels, dark charcoal pentagons, bold outline, simple muted purple shadow. Match the reference flat 2D cartoon rendering, restrained soft cel shading, purple skin #af7bd2. No realistic texture, no 3D. No blades, cleavers, weapons, captions, labels, text, logos, watermark, floor or external shadows. Genuine transparent alpha background.

## Final generation prompt (v2)

Use case: stylized-concept

Asset type: one transparent soccer ball sprite for the attached 2D cartoon game.

Input image 1 is STYLE REFERENCE ONLY: the actual painted character cutout atlas used by the game. Match its very simple chunky cartoon drawing, heavy near-black outlines, warm cream flat fills and a single muted purple-gray shadow. Do not include the character, limbs, atlas grid, weapons or any part of the reference image.

Primary request: Draw exactly one round classic soccer ball with black pentagon patches and cream white panels, as if drawn by the SAME artist who drew the attached purple cartoon character. It must look like a simple 2D cartoon prop belonging in that game. Big readable patches, few bold simple seams. Use a large charcoal central pentagon and a few partial charcoal patches at the circular edge, cream panels between them. Heavy slightly organic near-black ink outline, about 2.5 percent of the ball diameter. Rounded cartoon corners on the patches.

Style: FLAT 2D cel illustration with only 4 or 5 solid colors. Warm cream #ffeabd, charcoal #292333, one flat muted lavender-gray shadow on the lower-right edge. One small flat pale cream highlight at upper left is allowed. Make the shadows simple hard-edged graphic shapes, never smooth realistic gradients. The source character is the exact target level of simplicity.

Composition: one centered circular ball fills about 90 percent of a square canvas with a narrow transparent margin. Full clean silhouette, no attached objects.

Background: genuine transparent alpha, including the corners. No background, no floor, no external shadow.

Avoid: 3D rendering, photography, realistic leather, stitching, grain, speckles, texture, pores, tiny details, glossy highlights, bevels, metallic surfaces, realistic lighting, photorealistic shading, embossed panels, people, hands, characters, text, logos, watermarks. This must be a chunky flat CARTOON drawing readable at 32 pixels, not a product photograph.

## Previous generation prompt (v1)

Use case: stylized-concept

Asset type: transparent 2D game sprite and shop item icon for a cute cartoon dodgeball game.

Primary request: Exactly one classic black and white soccer ball, isolated on truly transparent background. Traditional recognizable black pentagonal and ivory white hexagonal panels, dark recessed seams, subtle leather texture. Perfect circular silhouette, bright soft upper-left highlight and gentle lower-right shading, thick crisp dark purple-black cartoon outline. Premium hand-painted 2D cartoon game item, slightly dimensional, clean bold readable shapes at 32 pixels. Center the single ball, full silhouette visible, filling 85 percent of a square canvas. No floor, no external cast shadow, no motion effects, no hands, no character, no pedestal, no text, no logo, no watermark.
