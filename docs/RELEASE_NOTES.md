# RELEASE NOTES — v2.3.0

## Main Menu — Cinematic Command Center (rebuilt)
- Old menu removed: vertical six-button stack, oversized title, decorative
  brandlines/status rows and menu grain are gone.
- New composition: full-bleed cinematic hero scene (~60-70% of the screen)
  with a compact command panel (RTL-aware, inset-inline-start) containing a
  tight brand block, a live campaign save card (progress/next op/ready
  soldiers/credits — real data, honest empty state), exactly three primary
  CTAs and a compact secondary utility nav (آمار · تنظیمات · راهنما · درباره
  سازنده).

## Rendering
- Hero plate cache: the expensive menu background (sky → parallax → terrain →
  props) is pre-rendered once per camera step into an offscreen canvas (LRU
  of 8) and blitted; only units, dust, grade and vignette render per frame.
  Camera drift, warm ground grade and a softened vignette compose the menu
  look. Squad repositioned into the visible composition side.

## Fixed
- **Version drift** (P1): GAME_VERSION was 2.1.0 while package.json said
  2.0.0 and the menu carried a hardcoded "v1.0". Single source now:
  GAME_VERSION = 2.3.0 = package.json = menu build label = footer.
- **Vacuous test** (P1): the v22 diagnostics assertion (`r.visible === true || true`)
  proved nothing; it now asserts HUD visibility, real FPS/frame-time content,
  a plausible FPS reading and that toggling off hides the HUD.
- **package-lock.json** added; CI switched to `npm ci` for reproducible installs.
- Hub title/subtitle localized (عملیات‌ها) with a live Persian status suffix.

## Honest gaps
- The image-generation service was unavailable (credential error, tried
  twice), so the hero art is a **procedural pre-rendered plate**, not a
  bitmap illustration. It is rendered and cached at runtime; no external
  files. Recorded as an artistic gap, not a shipped bitmap asset.
- Hub/barracks/arsenal dynamic strings remain partially English; the L10N
  dictionary covers menu, commands, hub headers, results and feeds. Full
  coverage of every dynamic template is still open work.

## Tests
17 suites, ~445 assertions, all green. New: tests/v23-acceptance.js (menu
structure, save card, version single-source, plate cache, hub localization).
