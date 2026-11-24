# RELEASE NOTES — v5.0.0 (Operation Ascension)

## New mechanics
- **Stealth is now real** (was a dead stat): every soldier's role `stealth`
  value scales how quickly enemies accumulate awareness of them. A sniper
  (1.15) is noticed measurably slower than a support gunner (0.85); prone and
  crouched stances still multiply. Pixel-verified perception test included.
- **Suppression has a body**: soldiers under heavy fire (>60 suppression)
  physically cower — torso hunches, head ducks, weapon tucks; a fresh hit adds
  a stagger kick. Render-verified (measured silhouette height drops).
- **Results & Barracks localization**: operation outcome, field time, squad
  status, roles and roster status tags are now Persian-first with English
  fallback; verified on the live results screen and barracks cards.

## Tests
- `tests/v50-acceptance.js` (15 assertions): stealth perception delta,
  suppressed silhouette measurement, Persian results screen (no raw English
  leaks), Persian barracks cards.
- 20 suites, ~520 assertions, all green; run-all exits nonzero on failure.

## Honest gaps (unchanged)
- Bitmap art pipeline (image-generation credential unavailable).
- Barracks/Arsenal long-form descriptions remain partially English.
- No physical-device testing (Playwright emulation only).
