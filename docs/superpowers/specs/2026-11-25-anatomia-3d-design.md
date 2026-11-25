# Anatomia 3D — design (Seterra-style anatomy click quiz)

## Context
Atestat project (graded, presented) that should also impress. A web game in the style of Seterra: the game names a body part and you click it, but on an accurate, freely rotatable 3D human body instead of a map. Systems for now: bones, muscles, nerves (more later). Must ship with extensive but simple documentation in Romanian. The folder `/Users/mateichira/Coding/atestat-c` is empty, so this starts from scratch.

## Goals
- Accurate anatomy, 3D, free rotate + zoom.
- Three modes: **Click the named part**, **Name the highlighted part** (typing or picking from options), **Learn/explore** (no score: hover or click to see the name and a short description).
- Three detail levels, like Seterra: *main structures only* / *all* / *progressive* (starts with the main ones, then adds smaller ones). The user asked for "progressive difficulty"; it's a detail level, not a separate mode, so the menu doesn't repeat itself (my call).
- RO/EN toggle for the whole UI and all structure names.
- Clean, minimal, consistent style. One main effect: a **rotating 3D skeleton drawn with a 1-bit ordered-dither shader** on the title page. Secondary effects: **smooth camera fly-to**, **hover outline**, **animated result screen** (score counts up, small celebration at 100%).
- Theme: **light warm paper** (off-white background, ink-black text, one accent colour, e.g. a soft red).
- Readable, easy-to-follow code, without too many comments.
- Romanian documentation: extensive but simple.

## Non-goals (for now)
Accounts, backend, database, multiplayer, dark theme, page transitions, systems beyond bones/muscles/nerves.

## Anti-goals
- Looks flashy but is slow or janky on a school computer (large models, low FPS).
- Inconsistent style between screens or between systems.
- Code the student can't explain at the presentation (framework magic, build tooling hidden in the app).
- Anatomical errors or a model with an unclear licence.

## Constraints
- Static site: plain HTML/CSS/JS ES modules, **no build step**; three.js vendored locally (`vendor/three/`) so it works offline.
- Runs offline now via a one-line local server (`npx serve` or `python3 -m http.server`). GitHub Pages later, with the same files and no changes (relative paths only).
- Data: **BodyParts3D** (DBCLS, CC BY-SA 2.1 JP). Attribution goes in the app footer/credits and in the documentation.
- Machine has Node 24 and Python 3.14, and no Blender.

## Approaches considered
- **A. Process BodyParts3D with our own script — CHOSEN.** Accurate, clear licence, file size under our control, reproducible and easy to document. Ceiling: nerve coverage limited to the major nerves.
- B. Z-Anatomy Blender export: better-organised names (Latin), but manual Blender work, bigger files and hard to reproduce.
- C. Ready-made Sketchfab-style model: fast, but usually not split into clickable parts and has an unclear licence. Risky for a graded project.

## Design

### Data pipeline (dev-only, `tools/`)
- `tools/build-models.mjs`: takes the BodyParts3D OBJs for the selected FMA IDs, converts them (obj2gltf), simplifies and compresses them (`@gltf-transform` simplify + meshopt), and writes `assets/models/{bones,muscles,nerves}.glb`. Each mesh is named by its ID. Target: under about 5 MB per system.
- **Step zero:** BodyParts3D's original site (DBCLS) is unreliable. First find a working mirror or archive (e.g. archive.org, or the Z-Anatomy repos that redistribute it) and confirm the licence. You need the OBJs plus the file that maps FMA IDs to English names.
- Left/right pairs stay separate meshes (e.g. left and right femur) but share one quiz entry (clicking either counts). *(Builder's call.)*
- Content: **I write the RO/EN names and short descriptions**: about 30 tier-1 + about 30 tier-2/3 per system (about 180 in total). Tier 3 can stay empty. The student or their biology teacher reviews them before the presentation; the docs note that the content was reviewed.
- `data/structures.json` is the only source of truth per structure:
  `{ id, system, meshes:[...], tier: 1|2|3, name:{ro,en}, desc:{ro,en} }`
  Tier 1 = main structures (about 25–40 per system), tiers 2 and 3 = finer detail.

### App structure (`/`)
```
index.html
css/style.css            design tokens (paper, ink, accent), typography
js/main.js               router: title → menu → game → results
js/i18n.js               RO/EN strings + toggle (stored in localStorage)
js/scene.js              three.js renderer, OrbitControls, layer visibility, raycast picking, outline, camera fly-to
js/dither.js             ordered-dither (Bayer) post-process shader for the title skeleton
js/quiz.js               modes, tiers, 3-tries scoring, timer, progressive logic
js/results.js            score count-up + celebration
data/structures.json, data/strings.json
assets/models/*.glb
vendor/three/...
docs/documentatie.md     Romanian documentation
```

### Gameplay (Seterra-like)
- Menu: pick system (bones / muscles / nerves), mode, detail level (main / all / progressive).
- Click mode: prompt "Click: Femur". 3 tries; after the 3rd miss the correct part flashes in the accent colour and the camera flies to it. Score = % correct on the first try, weighted like Seterra (100 / 66 / 33 / 0). Time is shown but not folded into the score. For "best": higher % wins, and on a tie the shorter time wins (my call).
- Name mode: a part is highlighted. In "easy" you pick from 4 options, otherwise you type (forgiving match: ignores diacritics and case).
- Learn mode: hover outline + name; click opens a side panel with the RO/EN description.
- Progressive: starts with tier 1. Once a tier reaches ≥80%, the next tier's parts are added.
- Layer panel: Skin (translucent silhouette) / Muscles / Bones / Nerves, so deep parts can be reached.
- Best score and time per (system, mode, detail) saved in localStorage.

### Look
Warm paper `#f4efe6`, ink `#1a1a1a`, one accent (soft red). One serif display font for headings and one clean sans for the UI. Models use matte, flat-ish shading in ink and paper tones and the same material across systems. The accent appears only for hover, correct and wrong states.

### Documentation (Romanian, `docs/documentatie.md`)
Goal of the project, how to run it, how to play, structure of the code (one section per file), how the 3D works (raycasting, shader, dither), the data pipeline, sources and licences, possible extensions.

## Left to the builder
The exact list of tier 1/2/3 structures (high-school-biology level as the guide), fonts, the exact accent value, the simplification ratios, camera easing, the celebration effect.

## Next step after approval
Write the implementation plan (superpowers:writing-plans), then build in a worktree/git repo initialised in `atestat-c`. The design also gets copied to `docs/superpowers/specs/2026-11-25-anatomia-3d-design.md`.

## Verification
- `npx serve .` → open localhost; play each mode × each system × each detail level.
- FPS check on the title page and in the game (target 60 on a mid laptop); model files under about 5 MB each.
- RO/EN toggle switches every string and name; no missing keys (small `tools/check-strings.mjs` assert script).
- One check script `tools/check-data.mjs`: every structure in `structures.json` has an existing mesh in its GLB, both names and a tier.
- Test offline (network disabled) to confirm nothing loads from a CDN.
