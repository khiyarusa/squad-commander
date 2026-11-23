# ROADMAP / RISK / TEST STRATEGY

## Roadmap (executed in this change)
1. **P0** Audit, design, art bible, threat risk register (this docs set).
2. **P1** Save v3 + recovery + validation; project-relative Playwright harness with real asserts and
   non-zero exits; package.json; CI-checkable `npm test`.
3. **P2** Nav graph: multi-tier surfaces, stairs, blocking props, A* costs, exposure map, entrances,
   reachability validation.
4. **P3** Command lifecycle + queue editing + interruption/waiting + persistent behaviours +
   formation slots (2D, role-aware, custom, preview).
5. **P4** Simulation: morale/stress, injury tiers, bleeding, carrying, cover evaluation/reservation,
   penetration, extraction policies.
6. **P5** Enemy AI: FOV, 2-point LOS, awareness, hearing decay, squad blackboard, role behaviours,
   off-screen telegraphs.
7. **P6** Art vertical slice: plates, soldier detail/roles, new animations, materials/effects,
   lighting; screenshot gate.
8. **P7** Mission overhaul: landmarks, staged objectives, extraction policies, events; campaign
   consequences.
9. **P8** UI: queue chips, formation preview/custom, stress/injury/carry readouts, extraction
   requirement, threat arrows, settings.
10. **P9** Eight QA passes, perf tuning, packaging, report, release.

## Risk register
| Risk | Prob. | Impact | Mitigation |
|---|---|---|---|
| Nav graph breaks existing missions | High | High | Reachability test per mission; generator auto-carve; keep surfaceAt fallback |
| Command rewrite strands units | Med | High | State-machine tests, 2 s resume watchdog, "no path" fail + feed |
| 2D formations overlap on narrow maps | Med | Med | Slot solver expands outward, collapse fallback, separation steering |
| Plate art clashes with vectors | Med | High | Single lock palette/light; grade plates toward game palette; native-scale review |
| File size explosion | Med | Med | JPEG q72 plates, cache, 1 KV only |
| Performance | High | High | Exposure refresh 4 Hz, nav budgets, particle caps, adaptive tiers |
| Save migration data loss | Low | High | Versioned migration, checksum, backup-first, import clamps |
| More UI crowds phones | Med | Med | Compact chips, existing responsive rules, 5.5" test viewport |

## Test strategy
- Node+Playwright harness (`tests/lib/harness.js`) with real asserts, per-suite exit codes,
  project-relative Playwright resolution, artifacts dir; `tests/run-all.js` fails CI on any failure.
- Suites (all green as of this overhaul):
  - `smoke` — offline boot, zero external requests, menu active.
  - `core` — full campaign flow via real clicks: menu → new campaign → briefing → deploy →
    battle HUD → orders → settings → abort → barracks/arsenal/recruit → save import.
  - `navigation` — multi-tier graph build, A\* across surfaces, stair climb, prop destruction
    rebuilds nav, `walkClear` semantics.
  - `commands` — explicit lifecycle (active/queued/cancelled/completed/failed), queue cap 6,
    per-index cancel, replace-on-issue, persistent overwatch, cover attach + reservation,
    reload, treat, carry-to-extraction, invalid-order failure counters, wait.
  - `combat` — 7 weapon classes, ammo consumption, real projectile hit, suppression wave,
    friendly fire, cover degradation/destruction, injury tiers, bleeding, treat, revive,
    explosion splash + nav rebuild.
  - `ai` — FOV acquisition, peripheral blindness, noise→alert, memory→search, warlord aura,
    coordinated alerting, archetype stat spread, suppression breaks frontal assault.
  - `extraction` — all/commander/vip/percent policies, mission-end gating, carried casualty
    counting.
  - `save` — checksummed v3 payload, rotation, backup recovery, forged import rejection,
    legacy v2 migration, export/import round-trip, persistence across reload.
  - `mobile` — phone viewport, rotate overlay, real touch selection, queue/support orders,
    all 12 missions boot, persistence, portrait overlay.
  - `edge-cases` — dry-weapon sidearm fallback, commander succession, cover destruction
    mid-occupancy, extraction gating, pause freezing, sight memory, pinch zoom + clamping.
  - `environments` — four theme/time-of-day scenes render clean, heap budget.
  - `fight` — live firefight produces shots/hits both ways, tracer screenshots.
  - `balance` — autopilot over four missions with stat-coherence assertions and campaign
    bookkeeping.
  - `perf` — step time inside frame budget, 10-simulated-minute soak with bounded state.
- Deterministic hooks under `window.__SC` only; screenshots land in `tests/artifacts/`.
- Release gate: all suites green, zero console errors, offline, single file, recovery verified.

## Verified status (end of overhaul)
- 13 suites, 300+ assertions, all green; `npm test` rebuilds and runs everything.
- Known accepted limitations: procedural art + synthesized audio only; localStorage required
  for saves; headless CI runs at low FPS (adaptive quality covers this).
