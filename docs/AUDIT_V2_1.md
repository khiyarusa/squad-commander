# AUDIT v2.1 — SQUAD COMMANDER

Audit date: after v2.0.0 (commit 0694cdb). Findings re-verified against current code.

## Confirmed bugs

| ID | Severity | Location | Root cause | Consequence | Fix |
|---|---|---|---|---|---|
| BUG-01 | **Critical** | `08-battle.js startOrder` | `u.carryId = null` clears the carrier side only; casualty keeps `carriedBy`/`carried=true` | Casualty is glued to a carrier who is no longer carrying; can never be re-carried (startCarry rejects `target.carriedBy`); permanent soft-lock | Carry is a persistent relationship: startOrder no longer breaks it; new orders run at carry speed; explicit DROP releases; down/death of carrier releases |
| BUG-02 | High | `08-battle.js` heal/carry cases | `findPath` failure retried every frame, order stays `active` forever | Soldier never arrives, never fails, HUD stuck | Retry timer (0.8 s), max 4 attempts, then `failOrder('no route')` with feed |
| BUG-03 | High | `06-world.js addEdge` | Drop-down edges created through the always-bidirectional `addEdge` | Ground units can climb a *drop* edge (upward teleport walk) | Directed edge support; drop edges are one-way (down only) |
| BUG-04 | Medium | `08-battle.js formationSlots` | Slots resolved by `floorAt` only; solid props not checked | Squad can be ordered to stand inside a solid crate/wall | Slot rejection + nudge to nearest free position via `inSolid` scan |
| BUG-05 | Medium | `06-world.js updateNavExposure` | Checks the first 3 enemies in array order (not nearest), no distance weighting | Exposure map blind to a close enemy behind a far one; flat 0/1 target | Sort nearby threats by distance, weight target by proximity |
| BUG-07 | Medium | `13-ui.js renderArsenal` | Upgrade grid renders for every `WEAPON_ORDER` entry incl. `gl` | Player can buy GL upgrades no ally can ever equip | GL is enemy-only (demo archetype); arsenal hides non-equippable weapons |
| BUG-09 | Medium | `14-ui-battle.js` | Queue chips render but have no reorder interaction | Queue editing limited to cancel only | Pointer-drag reorder on chips with visual insertion gap |
| BUG-10 | Low | `src/head.html` | Hardcoded `BUILD 1.0.0` labels + footer | Version mismatch in UI | Single source `GAME_VERSION` (2.1.0), injected/JS-set everywhere |
| BUG-12 | Low | docs/README | Suite inventory/docs drifted | Misleading docs | Docs rewritten to match reality |
| BUG-14 | Medium | repo | No CI workflow | Tests only run locally | GitHub Actions: install, build, run-all, artifacts |
| BUG-08 | High | `03-art.js` | No visual state for reload / heal / carry / carried / cover-peek / injury gait; fire recoil shifts weapon only | Logical states invisible to player | Animation state machine inside the layered rig (see ANIMATION notes) |

## Verified OK (re-tested in v2.0 suite, kept)

- BUG-13 Playwright portability — harness already resolves via `PLAYWRIGHT_MODULE` / local `node_modules` / sibling fallbacks (tests/lib/harness.js).
- BUG-15 Extraction policies — all five policies tested (tests/extraction.js).
- BUG-16 Perception FOV — front/acquire, rear/unnoticed, hearing, memory→search tested (tests/ai.js). Peripheral detection exists but is slow (0.14/call) and cannot acquire alone — documented behaviour, fair.
- BUG-06 Role armor/stealth — role `armor` feeds `armorRed`; `stealth` is currently *unused* in perception (only stance matters). Accepted as a tuning knob, documented; not fake — no UI claims it.

## Not done in 2.0 (honest gaps)

- Environment plates: backgrounds are procedural vector layers with parallax (multi-layer sky/mid/near exists in `11-render.js`); no bitmap plates. Recorded as Artistic Deficiency, not fake.
- Real-device mobile testing: Playwright device emulation only. **Unverified on hardware** (no Android device available to this environment).
- Audio: synthesized only.
- Queue drag-reorder: was missing → implemented in 2.1.
