# RELEASE NOTES — v3.0.0

## Fixed (P0)
- **CI failure — AI suppression**: a pinned, engaged enemy whose target went
  stale collapsed straight to `patrol` (perception ran on `thinkT=0` and the
  stale-target branch reset the state before the cover transition could fire).
  Production fix: perception no longer downgrades a heavily-suppressed engaged
  enemy to patrol/search; the suppression→cover transition now works from the
  last-known position, never fakes a move when pathing fails, and falls back
  to a controlled `retreat` when no cover exists at all. Regression tests:
  stale-target determinism + no-cover fallback (`tests/ai.js`, 44 assertions).
- **Commander influence radius**: `enemyConfidence()` gave a global aura to a
  warlord anywhere on the map; now bound to a 560 px command radius (tested:
  near/far/dead).
- **MenuPlate cache**: keys now include viewport + DPR (resize/orientation
  flips served stale art), strict LRU budget of 5 full-screen plates,
  invalidation wired to resize. Tested.

## Art (visible changes)
- Forest mid-layer rebuilt: individual trees — tapered trunks, crooked branch
  clusters, layered canopy blobs with rim light, dead snags, ferns, rocks —
  replacing repeating triangles (pixel-verified in tests).
- Urban far skyline rebuilt: stepped setbacks, shelled/broken rooflines,
  antenna masts, water tanks, crane arms, roof highlights.
- Toasts: coalescing identical notifications, hard cap of three, click to
  dismiss (they previously stacked over headings).

## Version
- Single source v3.0.0 across GAME_VERSION / package.json / build label.
- README suite inventory corrected (18 suites) and queue capacity corrected
  to 6 to match the implementation.

## Honest gaps
- No bitmap art assets: the image-generation endpoint remains unavailable
  (invalid credential); all art is procedural per docs/ART_BIBLE.md.
- Persian localization covers menu/commands/hub/results/feeds; Barracks and
  Arsenal dynamic strings remain partially English.
- No physical-device (Samsung Galaxy A23) testing — Playwright emulation only.
