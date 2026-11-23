# AUDIT — SQUAD COMMANDER v1.0.0 (commit ae38f37)

## Verdict
A complete, playable game, but several systems are shallow ad-hoc implementations rather than
simulations. Visuals are coherent vector art but lack the density, animation set and lighting a
tactical game of this ambition needs. Below is the defect inventory that drives this overhaul.

## Critical / architectural
| # | Defect | Where | Impact |
|---|---|---|---|
| A1 | Navigation is a 1D horizontal chain; "2D pathfinding" is A* over x-samples only | `06-world.js`, `08-battle.js` | No alternate routes, no real tier choice, stairs are decorative |
| A2 | Cover does not block walking, so there is no route around obstacles | `06-world.js` | Battlefields are corridors; flanking is horizontal only |
| A3 | Command "completion" is inconsistent: overwatch/focus/suppress/hold complete instantly and become loose flags | `08-battle.js` | Queue example "move → reload → overwatch" works only by accident; no failure/cancel states |
| A4 | Queue has no editing: no per-order cancel, no reorder, no visible state/lifecycle | `08-battle.js`, `14-ui-battle.js` | Player cannot correct plans |
| A5 | Interruption logic cancels orders on any damage and can strand soldiers | `09-combat.js` | Unpredictable behavior; no resume policy |
| A6 | Formations are x-offsets only | `08-battle.js` | No 2D slots, no role awareness, no preview |
| A7 | Cover selection is nearest-with-claims; no threat-side evaluation, no material penetration, no reservation expiry | `06-world.js`, `10-ai.js` | Cover feels arbitrary; stacking still possible |
| A8 | Morale/stress are unused fields; only suppression exists | `07-units.js` | Stats are decorative |
| A9 | Injury model is binary (downed/not); no light/serious wounds, no bleeding, no carrying | `09-combat.js`, `07-units.js` | Medicine is shallow |
| A10 | Extraction succeeds with any one soldier in the zone | `09-combat.js` | Missions end while squad is still in contact |
| A11 | Backup save is written but never read; no checksum, partial-write risk | `12-campaign.js` | "Recovery" is cosmetic |
| A12 | Import validates almost nothing | `12-campaign.js` | Malformed save can poison a campaign |
| A13 | Tests print `PASS/FAIL` but almost never exit non-zero; absolute Playwright path | `tests/*` | CI cannot fail; portability |
| A14 | Enemy perception is omnidirectional (no FOV cone), no confidence, no hearing decay | `10-ai.js` | Unfair, unreadable AI |
| A15 | Enemies re-target only when losing sight; all can lock one soldier | `10-ai.js` | Focus-fire spikes |
| A16 | Damage cancels heal instantly; carrying evacuated soldiers impossible | `09-combat.js` | Medic flow fragile; casualties must crawl |
| A17 | Overwatch has no cone visual in HUD, no expiry, no state chip | – | Feature is invisible |
| A18 | Formation/queue state not represented in HUD; no failure reasons shown | `14-ui-battle.js` | Player cannot read intent |

## Visual
- Soldier rig is 2D vector but thin: no thigh gear, radios, holsters, glove detail, role helmets; the
  same body for all roles with colour swaps.
- Environment plates are procedurally drawn at half resolution; depth is good but detail density
  and material legibility are low; buildings are block masses.
- Animation set lacks carry, drag, suppression brace, injured limp, peek-over-cover, turn.
- Effects are generic: dust colour swaps per material, no penetration, no splinters/shards, no rain
  splashes, limited lighting.
- No authored landmarks; all maps share one generator layout family.

## Gameplay / UX
- Objectives mostly "stand in a ring"; no multi-stage e.g. secure → interact → escape pressure.
- Briefing does not state extraction policy.
- No off-screen threat indicator; enemy awareness states invisible.
- No formation preview; no custom formation.
- Touch: long-press works, but queue markers are not tappable to cancel.
- Settings lacks ambient/radio buses and telegraph toggles.

## Preserve
Build pipeline, single-file packaging, procedural art system, audio synthesis, campaign schema,
role identity, UI visual language, test scenarios, deploy/level-up flow.
