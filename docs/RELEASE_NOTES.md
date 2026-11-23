# RELEASE NOTES — v2.1.0

## Fixed (confirmed bugs)

- **BUG-01 (Critical) — Carry state consistency.** Issuing a new order to a
  carrier used to sever the `carryId` link while the casualty stayed glued to
  them (`carriedBy` retained) — a permanent soft-lock. Carry is now a
  persistent relationship: new orders run at carry speed (×0.55), firing stays
  blocked, explicit DROP releases, and a downed **or killed** carrier releases
  the casualty to a downed state. Tested: keep-link, follow-while-moving,
  explicit drop, down-release, death-release (`tests/v21-acceptance.js`).
- **BUG-02 (High) — Unreachable heal/carry.** Support orders retried
  pathfinding every frame and idled forever. Now: bounded retries (0.8 s
  interval, max 4 → `no route`), stall-guard in `moveAlongPath` (pinned units
  force-advance the waypoint), reach-failure counter (path exhausted but
  patient out of reach ×3 → `cannot reach patient`), and heal hysteresis
  (locked-on medics no longer oscillate treat/walk). Tested: truly
  unreachable patient fails honestly; adjacent wounded soldier is still
  treated to full.
- **BUG-03 (High) — Drop edges were bidirectional** (ground units could climb
  a drop). Edges are now directed; drops go down only; climbing requires
  stairs/vault. Also fixed the drop matcher (horizontal proximity, fall-height
  cap) — drops previously *never formed* because the 60 px radius could not
  span the 118 px walkway height. Tested.
- **BUG-04 (Medium) — Formation slots inside solid props.** Slots are nudged
  out with a wide search (adjacent containers can form a 200 px wall). Tested.
- **BUG-05 (Medium) — Exposure map.** Now sorts nearby threats by distance and
  weights heat by proximity (1 − d/760), instead of checking the first three
  enemies in array order. Tested: a close threat heats exposure more.
- **BUG-07 (Medium) — Grenade Launcher sold in the Arsenal** although no ally
  role can equip it. GL is enemy-only (demo archetype); the arsenal now lists
  exactly the six equippable classes. Tested.
- **BUG-09 (Medium) — Queue drag-reorder.** Implemented for real: pointerdown
  on a queue chip, drag with insertion gap, drop reorders the queue (mouse +
  touch). The first implementation was wired to `click` (fired only after
  pointerup — dead on arrival); caught by the acceptance test and fixed.
  Tested with synthetic pointer sequences.
- **BUG-10 (Low) — Version labels.** `BUILD 1.0.0` hardcodes removed; single
  source `GAME_VERSION` = 2.1.0 feeds menu build label and footer. Tested.
- **BUG-14 (Medium) — CI.** GitHub Actions workflow: install → Playwright
  Chromium → build → stale-artifact check → `tests/run-all.js` (fails on any
  failure) → artifact upload.
- **BUG-08 (High, partial) — Animation states.** The layered character rig now
  renders from real simulation state: carried casualty draped over the
  carrier's shoulder, heal pose with a medic kit, reload phase (muzzle dip +
  spare magazine travelling belt→well), carrier hunch with forward hands,
  injury gait (serious wounds shorten stride and hunch the torso), fire recoil
  rocking the shoulder/torso, cover peek lean. Role silhouettes strengthened:
  medic pack with cross panel, support ammo box, sniper roll-mat, assault
  breaching charge, commander antenna (existing). Contact sheets:
  `tests/artifacts/contact-sheet*.png`.
- **BUG-11/12 (Low) — Documentation** rewritten to match reality
  (`AUDIT_V2_1.md`, this file).

## Verified unchanged / already correct

- BUG-13 Playwright portability (env var + local + sibling resolution) — in
  place since 2.0.
- BUG-15 extraction policies, BUG-16 perception FOV — covered by
  `tests/extraction.js` / `tests/ai.js`.
- BUG-06 role `stealth` field is unused by perception (stance-only) — recorded
  as a tuning knob, not claimed as a feature.

## Honest gaps (not done in 2.1.0)

- Environment plates remain procedural vector layers (no bitmap plates).
- No real Android-device testing — mobile is Playwright device-emulation only;
  **unverified on hardware**.
- Audio remains synthesized.

## Test status

15 suites, ~395 assertions, all green; `npm test` = build + all suites, exit 1
on any failure. New suite: `tests/v21-acceptance.js` (37 assertions covering
every fix above).
