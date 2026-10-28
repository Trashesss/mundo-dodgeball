# 문도 축구장

- Current source: user-selected attachment `codex-clipboard-05a4a401-e222-486a-8425-79245fa413e1.png`, used unchanged. Earlier generated variants below are historical.
- Current asset: `football-selected-v1.png` (1283 × 1226), byte-identical to the selected attachment. SHA-256: `8a8892193ba3557def82a9d862a8d4e10a2eed5f9628e5486cd95c35a632c969`.
- Registration: `football-selected-v1.json`, ground center (642, 645), usable ellipse radii (510, 365). Uniform scaling preserves the artwork and the existing movement boundary is overlaid on the turf. All maps share exactly the same camera zoom, center, character size and movement-area size.
- Design: circular ground required by gameplay, modern steel fence, blue plastic seating, football goals and floodlights, matching the existing bold cartoon style.
- Rejected early drafts: `output/football/draft-colosseum.png` (too much stone architecture) and `output/football/draft-rectangular.png` (wrong ground shape). The original v3 edit used these as separate shape and modern-prop references, plus `shop-classic-v1.png` for the character art style.
- Price: 500 in-game coins; purchase and equip remain separate steps. Movement and combat rules are unchanged.
- Historical v3, v4 and compact images/metadata referenced below are archived locally in `output/football/archive/`. The game ships only the selected `football-selected-v1.png` and its registration JSON.

## Original circular stadium prompt (v3)

Use case: style-transfer
Asset type: transparent game arena illustration for an existing 2.5D circular dodgeball game.
Input images: Image 1 is the FIRST football arena: KEEP its circular ground shape, exact ground footprint, and camera. REMOVE all its ancient stone architecture. Image 2 is the modern football stadium: use ONLY its modern metal goalposts, fence, plastic seats, floodlights, and sporty styling. Do NOT use its rectangular field shape or wide image composition. Image 3 is the game's character: style reference only; don't draw a character.
Primary request: A ROUND FOOTBALL ARENA, modern sports ground, completely without colosseum or medieval architecture. This is intentionally a CIRCULAR football ground adapted for a dodgeball game. Circular is mandatory.
Composition and registration: use the same portrait-near-square canvas and footprint as image 1 (approximately 1280 wide x 1230 high). Straight-on elevated orthographic camera at 52 degrees, no diagonal rotation. Large CIRCULAR green grass floor seen as an ellipse, centered at approximately x=50%, y=54%; floor ellipse radius around 35% image width horizontally and 28% image height vertically. Keep it wide OPEN and empty so game characters can move. Thin cream-white circular sideline ellipse around the entire pitch, vertical halfway line, centered white midfield circle seen as an ellipse, modest penalty boxes at left/right. Two small white metal goals with netting entirely OUTSIDE the grass ellipse at far left and right, angled inward. No rectangular touchline: the playfield boundary is ROUND.
Surroundings: low modern dark steel wire fence CURVES around the outside, a short crescent of empty blue plastic seats supported by dark steel along the back edge only, four slim modern floodlight poles outside the playable floor, a few triangular red/blue sports corner pennants and a narrow green grass apron. Front edge very low modern fence only so moving characters won't be hidden. Stadium remains compact and fully visible in canvas with transparent margin.
Style: polished hand-illustrated mobile-game cartoon matching the references, bold dark ink outlines, chunky friendly proportions, soft cel-shaded highlights. Rich moderately dark green grass with subtle mowing stripes and restrained texture, white markings, bright blue seats, gray metal fences. Game-ready readable shapes.
Strict requirements: CIRCULAR/ROUND ground, not rectangular. Modern football sports setting, not colosseum. Actual transparent alpha exterior, no dark gradient backdrop or glow. No stone, masonry, pillars, arches, bowl terraces, red hanging banners, torches, vines, fantasy architecture. No people, characters, audience, loose balls, words, labels, text, logos or watermark. Preserve image 1's ground composition while replacing architecture with modern sports equipment.

## Simplified floor (v4)

- Edit target: `football-stadium-v3.png`. Keep its canvas, camera and ground registration.
- Remove mowing stripes, grass texture, penalty boxes, penalty arcs/dots and the baked outer sideline. Only a quiet central line and circle remain. The game draws the exact movement and shrink boundaries once.
- The generated PNG was copied unchanged. The original v3 asset remains available for comparison.

### Final edit prompt

Use case: precise-object-edit
Asset type: transparent circular football game arena, simplified for clear action gameplay.
Input image 1 is the exact existing game background to edit. Keep its canvas dimensions 1283 x 1226, camera, scale, circular grass footprint, grass ground center, goal positions, stands, lights and composition unchanged.
Primary request: the floor is visually too busy during gameplay. Make the entire playable green turf a quiet, flat, muted medium green surface. Remove ALL alternating mowing stripes, speckles, grass blades, small leaf clumps and texture across the floor. Use one consistent green color with at most an extremely subtle broad lighting gradient, not bands or patches.
Field markings: remove ALL penalty boxes, small goal boxes, penalty arcs, penalty dots, and the large white outer elliptical sideline. The game draws the exact outside boundary itself, so do not bake any outer circle line into this artwork. Keep ONLY a thin, low-contrast pale greenish-cream halfway line and one simple small midfield ellipse/circle at center; no center dot. These two faint markings are supporting background details, clearly less prominent than the previous bright white lines.
Keep the circular grass apron and modern football goals, curved low steel fence, empty blue seats, slim floodlights and corner flags so the scene still reads as a circular modern football stadium. Simplify minor details on the peripheral props slightly: reduced mesh density and few simple shrub shapes. Preserve all their locations and silhouettes.
Style: retain the game's clean bold-outline friendly cartoon/cel-shaded illustration, but make the large playing field calm and sparse. No photoreal texture or added decorations.
Invariants: ROUND arena, never rectangular. Same projection, registration and layout. Transparent alpha outside stadium, no backdrop, no glow. No stone architecture, no people, no text, logos or watermark. The field must be visibly much simpler than the original.

## User-selected reference and superseded camera change

The selected reference was attached by the user on 2026-10-27 and copied unchanged from `codex-clipboard-eb979a1e-9042-4fb5-a443-4133d39ede52.png`. The full SHA-256 is `8a8892193ba3557def82a9d862a8d4e10a2eed5f9628e5486cd95c35a632c969`. Historical v3/v4 prompts above describe earlier iterations, not a new edit of the selected attachment.

A closer-camera experiment was reverted after the user clarified that the empty feeling was inside the artwork. All maps again use the same original camera, movement area and character size.

## Historical compact internal composition (not currently applied)

- Edit target: user attachment `codex-clipboard-df6b007a-8756-404d-b5e4-4ab6d3fa4f2a.png`, matching the previously selected design.
- Tool: built-in `image_gen`, transparent-background edit. Generated output copied unchanged into the project.
- Change: reduce the bare-green proportion within the same overall stadium silhouette, replace thin fencing with broad blue seating and padded barriers, and use larger simple goals. Keep the floor free of small grass details and busy markings.
- Game integration: all maps use exactly the same camera zoom and center, keeping character dimensions/position and the movement-area size identical. The camera does not fit itself to the full football illustration. World radius, combat rules, reward values and the 500-coin price remain unchanged. The new floor is registered separately to the existing circular movement boundary.

### Final edit prompt

Use case: precise-object-edit
Asset type: transparent PNG arena background for an existing cartoon dodgeball game.
Edit target: the attached circular football stadium. The user says THE IMAGE ITSELF feels too empty: the huge green interior dominates, while the perimeter is too thin. Change the internal composition, not the canvas crop or camera zoom.
Primary request: make the circular stadium feel compact, cozy and visually full using FEWER, LARGER, SIMPLE architectural masses around the field. Reduce the proportion occupied by bare grass by roughly 25-30% while keeping a clear circular playing floor.
Composition: keep canvas approximately 1283 x 1226, same elevated straight-on orthographic view (52 degrees), vertical halfway line, left-right goals, centered round arena, actual transparent exterior. Outer stadium silhouette stays approximately the same size in the canvas. Ground center around (642,650). The green playing floor should now be an ellipse of about 435 px horizontal radius and 335 px vertical radius, rather than the original broad expanse. This central floor must be totally clear, opaque and green across the entire ellipse.
Replace the thin peripheral treatment with a substantial modern stadium enclosure: a thick curved bank of blue seating wrapping around the BACK and SIDES, in two or three broad stepped rows with large simple seat/bench blocks. A short clean neutral-gray concourse and a broad dark-teal padded inner barrier form a readable chunky ring. FRONT boundary is a low broad modern padded barrier, not a high stand, so game characters remain visible. Goals become larger, chunky white sports goals at far left/right OUTSIDE the new grass ellipse, with only a few widely spaced net lines. Keep four simple lights and a few red/blue sports pennants integrated into the perimeter. No props inside the clear playing floor.
Field: quiet flat muted green, no airbrushed blobs, broad blurry shadows, stripes, grass blades or speckles. Keep just one restrained thin central line and a simple medium-sized center circle. No penalty boxes, arcs, dots or white outer rim (the game draws the exact movement boundary).
Style: preserve the existing friendly game cartoon, bold clean ink, crisp simple cel shading, big rounded shapes. Peripheral objects may be bigger and sturdier, but do not add fine detail or clutter. Cast only short crisp contact shadows directly under props. No stone, ancient architecture, arches, torches or fantasy banners. This is a MODERN football arena with a circular floor.
Crucial: keep the circular gameplay floor, but make the surrounding architecture occupy much more of the image, so it feels composed and enclosed rather than a huge empty green disk. Do not solve this by just cropping, zooming, adding people, or adding grass textures.
Transparency: alpha 255 across the entire grass floor, transparent outside the stadium with clean edges. No sky, landscape, backdrop, text, people, balls, logos or watermark.
