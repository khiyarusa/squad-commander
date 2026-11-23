# SQUAD COMMANDER — Internal Design Specification

**Deliverable:** one self-contained `SQUAD_COMMANDER.html` (Canvas 2D, vanilla JS, no runtime network).
**Build:** source files in `src/` are concatenated by `build.js`; end user only needs the HTML.

---

## 1. Design pillars
1. Readable squad-level tactics in side view: elevation, cover, suppression, lines of fire.
2. The player is a commander: pause, plan, queue orders, then watch autonomy execute them.
3. Cohesive cinematic presentation built procedurally (consistent art beats generated asset soup).

## 2. References & takeaways
- **Door Kickers 2** — pause/plan, per-unit queues, contextual orders, top-down clarity → adapted to side view.
- **Bad North** — readable silhouettes, limited squads, high value of positioning → strong unit shapes + tier elevation.
- **Into the Breach** — explicit consequences and telegraphed intent → enemy "last seen / alarmed" markers, objective transparency.
- **XCOM** — persistent roster, injuries, permadeath, base economy → campaign layer between missions.
- Avoided: fog-of-war opacity (hurts clarity on phones), grid turns (slower), deep inventory micromanagement.

## 3. Technical architecture (single scope inside one IIFE)
- **Loop:** fixed 60 Hz simulation accumulator, clamped frame delta, render interpolation not required.
- **Coordinates:** world units; view height fixed at 720; camera {x, y, zoom}; DPR-aware canvas; CSS letterbox.
- **UI:** DOM overlay for all menus/HUD (crisp text, safe areas, accessibility) on top of canvas battlefield.
- **Terrain:** chain of horizontal surfaces joined by ramps, each with `y(x)`; nav nodes sampled every 24 px; A* over a surface graph. Cover does not block walking (2.5D abstraction); tall props block line of sight.
- **Combat:** projectiles with velocity + gravity (grenades), hitscan-equivalent fast rounds; ray tests against cover rects and unit hitboxes; suppression via near-miss sampling; stance (stand/crouch/prone) modifies hitbox and cover use.
- **AI:** friendly FSM + autonomy priorities (survival > threat > order > idle); enemy utility scoring over patrol/investigate/engage/cover/suppress/flank/retreat; perception = LOS + range + hearing events, never global knowledge.
- **Rendering:** procedural layered soldier rig (13 animation states), parallax background tiles cached per theme, poolable particles, muzzle/explosion lights, vignette + grain + color grade.
- **Audio:** all synthesized via Web Audio (weapon layers, impacts, explosions, UI, generative ambient score); unlock on first pointer event.
- **Save:** versioned JSON in localStorage, validated + migrated, atomic write, corruption fallback, export/import.

## 4. Gameplay decisions
- Squad of 6 roles; deploy all ready soldiers. Persistent roster, XP, skills, wounds, permadeath.
- Orders: move, sprint, hold, follow, take cover, overwatch, focus fire, suppress, reload, heal, retreat, regroup; queue up to 4; cancel.
- Formations: line, column, wedge, defensive — offsets affect exposure and fields of fire.
- 12 missions, 3 regions, 10 objective archetypes combined (kill, rescue, extract, defend, sabotage, capture, escort, ambush, search, survive).
- Economy: credits, ammo, medkits, intel; rewards from performance; injuries require recovery missions.
- Difficulty alters reaction delay, accuracy, perception, coordination — not health sponges.

## 5. Art bible
- Side-view, camera slightly above horizon; light from upper-left (warm) with cool ambient bounce.
- Palette: olive `#6f7a4a`, charcoal `#151812`, bone `#e9e6d8`, amber `#e0a33e`, rust `#a35a35`, danger `#cf4f3a`.
- Soldiers: ~1.8 m, 7.5 heads, heavy boots, plate carrier with pouches, helmet + goggles, rim light; role color tab on shoulder.
- Enemies: darker desaturated palette, red visor accents, distinct silhouettes (bulky heavy, ghillie sniper, light scout).
- Weapon silhouettes must be immediately readable at 1× zoom.
- Terrain: layered silhouettes + atmospheric fog; 3 themes (urban dusk, forest dawn, industrial overcast).
- Effects never obscure tactical glyphs; particles capped by quality tier.

## 6. UX decisions
- Landscape-first; portrait shows a quiet rotate overlay (non-blocking for landscape).
- Touch: tap = order at default mode; drag = pan; two-finger = pan/zoom; long-press squad card = add to multi-select; explicit "ALL" and order-mode buttons; no hover dependencies.
- Every order has canvas feedback (markers, paths, confirmation ring) + HUD log line.
- Scale controls: HUD scale, SFX/music, effects quality, camera sensitivity, aim assist toggle.

## 7. Risks & mitigations
| Risk | Mitigation |
|---|---|
| Single-file size | procedural art + compact JS, cached tiles, no bitmap sprites |
| Mobile frame pacing | particle caps, cached layers, quality tiers, no per-frame allocations in hot loops |
| Gesture conflicts | tap vs 12 px drag threshold, two-pointer pinch, mode buttons |
| Save corruption | versioned schema, validation, backup key, export |
| AI omniscience | perception events only, last-seen markers |
| Scope blow-up | vertical slice locked first, then content |

## 8. Verification
- Headless Chromium (Playwright) drives real UI: campaign start, deploy, orders, combat simulation, objectives, save/load, all screens, mobile viewport screenshots.
- Debug hook (`window.__SC`) exposes deterministic stepping for 60 s+ simulations and edge-case scenarios.
