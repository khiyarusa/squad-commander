# ART BIBLE — SQUAD COMMANDER v2

## Visual target
Cinematic semi-realistic 2D military illustration, side view, readable at gameplay scale. Think
grainy war-photo lighting, worn equipment, desaturated olive/charcoal with controlled amber
accents. Depth is authored in five layers (sky → far silhouettes → midground → playfield →
foreground), never noise.

## Locked technical frame
- Internal 720-unit view height, camera 0.74–1.4× zoom, gameplay scale 1 m ≈ 34 px.
- Characters 58 px tall at rest, 7.5 heads, boots and shoulders silhouetted first.
- Light direction **upper-left, 35°**, ambient bounce cool teal from the right; rim light 2 px
  along helmet/shoulder/top of weapon. No pure black fills.
- Palette roles: charcoal `#12150f`, olive `#5d6940`, bone `#e8e4d4`, amber `#e0a33e`, rust
  `#a35a35`, danger `#cf4f3a`, sky teal accent `#7fa3ad`.
- Materials: concrete (pale chipped grey, dust), brick (rust-red, mortar), wood (split grain,
  splinters), metal (dark steel, rivets, sparks), sandbag (burlap weave), glass (blue-green
  glint), earth (grit, wet dark).
- Effects: short-lived, material-specific, additive only for sparks/fire/flash; smoke is soft
  and slow; tracers 26 px; muzzle flash 3-frame star; no effect may cover a unit's head.

## Asset families
1. **Soldier rigs** — procedural layered parts: body base, role helmet, vest, pouches, backpack,
   radio, thigh holster, knee pads, gloves, boots, weapon. Ally: olive + role patch. Enemy:
   desaturated brown-grey, red visor slit.
2. **Environment plates** — one authored 16:9 midground plate per theme (urban dusk, forest
   dawn, industrial overcast), consistent horizon, no characters, 3 value planes. Generated as
   image plates; normalized to 1280×720 JPEG q72, embedded.
3. **Tiles/props** — procedural, matching the plate palette: platforms, stairs, catwalks, walls,
   containers, sandbags, wrecks, trees, pipes, machinery, signs, glass, lamps, flares.
4. **Effects** — dust, splinters, sparks, glass, blood, smoke, fire, shockwave, shells, rain
   splashes, flare light.
5. **UI** — charcoal panels, 1 px bone lines, clipped corners, condensed caps; amber = selection,
   teal = queued, red = danger.

## Animation spec
Idle/breath 2.4 s; walk 0.55 s cycle; run 0.42; sprint lean 8°; crouch drop 16 px; prone hips 7 px;
aim 0.12 s ease; fire recoil 0.08 s; reload 3 beats (mag out 35 %, in 40 %, charge 25 %);
cover peek arm-only above cover; suppression head down + brace + 4 px jitter; hit flinch 0.1 s;
injured limp stride 0.75 with ground drag; heal kneel + hand wrap; carry victim over shoulders
(arms pinned), carrier lean back; death 2-stage fall + settle. Transitions are eased and always
finish the previous 0.1 s. Left-facing is drawn in local space flipped; aim angle solved local.

## QA gates
- Read silhouette test at 25 % zoom; each role distinguishable by helmet/gear/weapon.
- Plate must sit behind gameplay without swallowing units; contrast check on the darkest 10 %.
- Contact sheet of all animations at native scale before acceptance.
- No generated text in plates; no baked characters.

## Generation prompts (locked)
```
ROLE: side-view environment midground plate, no characters, no text
SUBJECT: <theme landmark composition>
VIEW: 2D side elevation, horizon at 62 % height
ART: cinematic semi-realistic military illustration, grainy, worn, desaturated
PALETTE: charcoal/olive/bone + amber windows
LIGHT: upper-left 35°, hazy depth, no pure black
OUTPUT: 16:9 1280x720, no frame, no labels
```


## Status after v3.0.0 (honest)
- All art remains **procedural** (vector + pre-rendered plates). No bitmap
  environment plates or sprite sheets exist in `assets/`; the image-generation
  endpoint was unavailable (invalid credential, two attempts in v2.3). Any
  future bitmap assets must pass the create-game-assets QA gates before
  integration.
- Forest mid-layer: individual trees with tapered trunks, branch clusters,
  layered canopy blobs, dead snags, ferns, rocks (replaces triangles).
- Urban far layer: varied skyline silhouettes (stepped tops, shelled roofs,
  antenna masts, water tanks, crane arms, rim light).
- Menu: full-bleed procedural hero scene with LRU plate cache (max 5
  full-screen canvases, keyed by camera step + viewport + DPR).
