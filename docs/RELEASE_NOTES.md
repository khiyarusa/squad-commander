# RELEASE NOTES — v4.0.0

## Critical fixes (all verified by tests)
- **BUG-001 — Menu NaN transform**: `MenuPlate.key()` returns a string key;
  `MenuScene.render()` multiplied it by the step (`key * step` → NaN), so the
  hero squad never rendered on the live layer. Fixed with dedicated numeric
  `snapX()/snapY()` helpers; background and live units now share the same
  snapped camera. Pixel-verified: soldiers are actually painted onto the menu
  (`tests/v40-acceptance.js` counts uniform-colored pixels).
- **BUG-002 — Incomplete cache key**: plate key now includes snapped camera X
  AND Y + viewport + DPR; the LRU evicts by a real byte budget
  (`width × height × 4`, 96 MB cap) as well as entry count.
- **BUG-003 — Stale commander buff**: `enemyCoord()` clears every
  `commanderBuff` when no living commander exists; aura uses 2D distance.
- **BUG-004 — Suppression→cover completeness**: a dead target no longer wipes
  the tactical response (engage held under heavy suppression); the cover
  transition also fires from `search` when suppressed. A suppressed enemy with
  a dead target demonstrably reaches cover (tested).
- **BUG-005 — Cover arrival snap**: the one-sided `Math.max(...)` snap is
  replaced with approach-direction settlement on both flanks.
- **BUG-006 — 2D commander distance**: confidence and coordination use 2D
  distance (vertical separation breaks the command link).
- **BUG-007 — Noise selection**: all audible events are scored
  (proximity × loudness × recency); noise pruning runs once per simulation
  tick, not per enemy.
- **BUG-008 — Coordination intel**: units receive the sighting nearest to
  them, not `workers[0]`.
- **BUG-009 — Toast priority**: severity-aware eviction (critical never
  evicted by ordinary messages), tested.
- **BUG-010 — Drag cancellation**: pointercancel / blur / Escape all clean up
  the ghost, chip styling and listeners; queue untouched after cancellation
  (tested).
- **BUG-011 — package-lock** synced (4.0.0) via `npm install
  --package-lock-only`; CI continues on `npm ci`.
- **BUG-012 — Docs**: help text now states the real queue capacity (six).

## Visual
- Hero squad in the main menu now renders at ~1.7× scale — five distinct
  soldiers (commander, rifleman, sniper prone, support, medic with kit) are
  prominently visible in the composition.
- Composition: camera lowered to ground the enlarged squad in frame.

## Version
- Single source 4.0.0 across GAME_VERSION / package.json / package-lock /
  build label.

## Honest gaps
- Bitmap art pipeline still blocked (image-generation credential unavailable);
  art remains procedural per docs/ART_BIBLE.md.
- Persian localization: menu/commands/hub/results/feeds/settings groups
  covered; Barracks/Arsenal dynamic strings remain partially English.
- No physical-device testing (Playwright emulation only).
