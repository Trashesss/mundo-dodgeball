Generated with the built-in image_gen tool. Original prompt:

## Follow-up: arm motion and playback correction

User review found unnatural arms and discontinuous in-game motion. The generated eight-pose strips at 16fps are retained as references but no longer used for gameplay. Every state now uses the same existing painted cutout rig, keeping body silhouette and shoulder placement consistent on idle/run/throw transitions. Run has 30 frames played at 60fps. Foot travel and foot lift use a quarter-cycle offset so the trajectory does not retrace identical poses. The heavy weapon arm swings ±0.12 radians and the empty arm ±0.22 radians; throw windup is bounded by 0.58 radians instead of 2.25. Dance arm motion is also reduced. Game playback keeps the normal speed/effect cadence rather than following collision or short final-step velocity, and removes the separate hard render cap. No new character artwork was generated for this correction.

The browser checker additionally verifies that idle/run preserve the upper silhouette; output is saved in `output/animation/game-checks.json`. Interactive preview uses the exact game atlas at browser refresh speed. GIFs sample the 60fps preview at 30fps using GIF-compatible timing; they are a convenience preview, not the game render clock.

## 2026-10-13 natural motion revision

Referenced ChatGPT Pets `create-pet` and its sprite-sheet contract for grounded identity, coherent gait, stable shared scale and registration, attached props, and final-sheet motion previews. This is a game animation workflow; it does not create or upload a ChatGPT pet.

The built-in image generation tool produced four independent eight-pose running strips, referenced to `source.png`: `run-profile-source.png`, `run-front-source.png`, `run-rear-source.png`, and `run-back-source.png`. The first rear strip turned toward the camera and touched the canvas edge; it was rejected, preserved in `output/animation/run-rear-rejected.png`, and regenerated from `run-rear-reference.png` (a crop of the original approved rear pose).

Prompt set: preserve the squat purple brute, black tuft, huge jaw, cream torn vest, black shorts, bare feet, gray held cleaver, simple flat colors, and bold outlines. Generate eight separated complete chronological running poses in one transparent horizontal strip, alternating right/left contact, compression, passing, and airborne poses. Require opposite arm movement, modest torso bounce, a held cleaver in the same hand, consistent torso scale, shared contact baseline, wide gutters and exterior padding. Exclude text, shadows, particles, blur, speed lines, and detached effects. Each strip keeps one fixed view: right profile, front down-right, rear up-right, or directly back/up. The repaired rear prompt additionally requires the large cream back panel in every frame, only a small far cheek, no frontal face or mouth, and no turn toward the viewer.

`painted-run.js` extracts connected full-body poses, including antialiased edges, so interleaved bounding boxes never copy a neighboring character. It registers horizontal position using the cream torso centroid, applies one shared scale, and uses a shared baseline within each source strip to retain authored lift. `run-registration.json` records the actual extraction geometry. Idle retains the existing painted cutouts with subtle shoulder breathing and delayed hand movement. Throw, dance, and death retain their existing joint motion.

Final previews are rendered from the exact encoded game atlas, not directly from the generated artwork. `check:cartoon` checks complete atlas coverage and bounds, visible idle variation, distinct running-foot frames, boundary hysteresis, direction phase continuity, Q release/recovery, and browser errors.

## 2026-10-13 revision prompts

Edit target: attached game sprite sheet. Style-transfer to much simpler Carbot Animations-like slapstick cartoon style. Keep the exact sixteen poses, four columns/four rows, directional views, character identity, transparent background. Preserve purple skin, enormous square jaw with dangling pink tongue, black hair tuft, cream torn vest, black shorts and gray cleaver. CHANGE proportions to extremely squat, huge head almost half total body height, tiny stubby legs, big simple bean-shaped arms. Tiny dot eyes, one black curved eyebrow, giant silly empty smile. Bold clean thick BLACK outlines, completely flat solid lavender, cream, charcoal and gray colors. NO gradients, NO muscle anatomy, NO shading, NO rendering, NO highlights or textures. Like very minimal goofy web cartoon game characters, cute and dumb. Every pose must fit ENTIRELY inside its own equal grid cell with at least 24 pixels transparent margin on every side, including raised cleavers. Uniform 4x4 grid, no visible grid. Transparent alpha. No text. Each row: idle, run, throwing windup, defeated seated. Same column directions as source.

Use case: stylized-concept. Single square game ability icon for FLASH/instant teleport. Carbot-like simple slapstick cartoon style, very bold black outline, flat yellow and warm orange colors, no realistic rendering. A goofy tiny charcoal bean-shaped humanoid with giant round head and little stubby feet jumps toward upper right through a big sharp yellow lightning burst, with a small white puff left behind. Full bleed mustard golden background. Very simple silhouette readable at 64px. No text, letters, border, watermark. Clean funny cartoon symbol.

Use case: stylized-concept. Single square game ability icon for GHOST / running speed boost. Carbot-like simple slapstick cartoon style, very bold black outlines, simple flat cyan and navy colors. A funny cyan translucent-looking bean shaped ghost with a giant round head, two black oval eyes, excited open mouth, little arms pumping and tiny stubby feet sprinting fast toward the right; long light blue ribbon-like ghost trail and three horizontal speed lines behind. Full bleed dark navy blue background. Highly readable at 64px, minimal clean shapes, playful simple cartoon. No text, letters, border, watermark. No realistic rendering.

## Initial prompt

Use case: stylized-concept. Asset type: transparent 2D game animation sprite sheet.
Create a square sprite sheet with STRICT 4 columns x 4 rows uniform cells, 16 full-body sprites, transparent background, no grid or text. Generous clear margins inside each cell, no crossing boundaries.
Subject: a recognizably Dr. Mundo inspired goofy purple muscular brute: lavender purple skin, gigantic square lower jaw, tiny black dot eyes under thick black eyebrows, very short messy black hair tuft, huge rounded shoulders and forearms, wide dopey grin with a couple of square ivory teeth and floppy pink tongue. Torn cream sleeveless vest, dark charcoal shorts, bare purple feet. A comically oversized chunky gray meat cleaver with short brown handle. Squat two-head-tall proportions.
Style: the simple funny Carbot cartoon game aesthetic, bold thick black contours, beanlike rounded shapes, minimalist faces, very flat limited color fills with at most one shadow shade, hand drawn slapstick charm. Absolutely no realistic muscles, no 3D render, no texture or fine detailing.
Slight elevated isometric camera. Consistent character and size in all cells.
Columns in EVERY row: (1) profile facing right (2) three-quarter front facing down-right (3) three-quarter rear facing up-right, face mostly hidden (4) directly rear facing away, face invisible.
Row 1: idle, cleaver held down beside body.
Row 2: running, cleaver held, one foot forward one back, arms swung.
Row 3: throwing wind-up, cleaver raised behind head, other arm points forward.
Row 4: defeated slumped seated pose, cleaver on ground immediately beside body within same cell.
No logos, no lettering, no backgrounds, no floor shadows, actual alpha transparency. Make the purple skin, huge jaw, black hair, silly tongue, cleaver and hulking build unmistakable.
