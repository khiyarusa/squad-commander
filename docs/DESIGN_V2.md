# DESIGN SPEC v2 — command, navigation, simulation

## 1. Navigation graph (replaces 1D chain)
Levels are composed of **tiers**: ground, platforms, catwalks, roofs, connected by stairs.
- `surfaces[]`: horizontal walkable spans with `tier`, material, kind.
- `stairs[]`: ramp spans with two endpoint nodes; bidirectional, higher cost.
- Nav nodes sampled every 28 px per surface + stair endpoints/segments.
- Solid props (`wall`, `container`, `machinery`) **block nodes** in their footprint; low cover does not.
- Edges: adjacent nodes on a surface; stair endpoints; drop-down links (≤ 90 px) with a landing check.
- **A\*** over nodes. Cost = `dist × tierFactor + exposure×0.55 + hazard×2 + crowd×0.35`.
  Exposure is a per-node 0–1 threat value refreshed at 4 Hz from visible enemies; pathing
  prefers covered/low-exposure routes when they are within 35 % of the shortest path.
- Every generated level is flood-filled from the deploy zone; if an objective/evac is
  unreachable, the generator carves a stair or removes the blocking prop (checked in tests).

## 2. Formations (2D, role-aware)
Slot templates with `{dx, tierPref, rank}`: line, column, wedge, defensive, custom.
- Slots resolve to the nearest free node of the preferred tier within 90 px, expanding outward.
- Roles: commander centre-rear, medic rear, support mid, sniper highest available tier, assault
  front, rifleman wings.
- Re-evaluate when the destination changes, a member dies/downs, or 1.2 s elapse.
- Custom formation = capture current squad offsets relative to the centroid; reapplied 1:1.
- Preview ghosts + numbered slots are drawn at the order point.
- Collapse fallback: if fewer free nodes than units, extra units take the closest remaining nodes.

## 3. Command lifecycle
```
Command: { id, type, params, state, startedAt, reason, persistent }
states: queued → active → (waiting) → completed | failed | cancelled
```
- Queue max 6, editable: tap a queue chip or world marker to cancel; drag chips to reorder.
- Completion is conditional, never "on start":
  - move/sprint/cover/retreat/regroup: arrival / cover attach / unreachable(fail).
  - reload: `reloadT` reaches 0 (complete) or damage interrupts (failed).
  - heal: target healed/revived (complete) or target lost / no kits (fail).
  - overwatch/focus/suppress/hold/follow: persistent; terminate on explicit cancel/new order,
    target death (focus), ammo dry (suppress), or `WAIT` completion semantics.
- `wait`: seconds param; also "until calm" (suppression<25). Used between steps.
- **Interruption policy**: emergency = heavy suppression, no cover within 260 px, active
  move/cover command. Active command → `waiting`, emergency cover runs ≤ 2 s, then the command
  resumes from the new position (path repath). Getting hit alone no longer cancels orders.
- Failure/cancel feeds + state chips. New command replaces queue unless queue mode is ON.
- Panic (stress>85, morale<25) may inject a self-preservation command, flagged `AUTO`.

## 4. Soldier simulation
- `stress` 0–100 and `morale` 100→0. Stress sources: near miss, explosion, ally down (+12),
  injury (+10), isolation (+1/s), suppression. Decay 2/s in cover near allies, 4/s under medic.
- Effects: accuracy ×(0.72 + morale/360), reaction ×(0.7 + morale/300), panic threshold,
  cover-seeking bias. HUD shows SHAKEN/BREAKING.
- Injuries: healthy / light (hp<65: −10 % acc, −8 % speed) / serious (hp<30: bleed 0.5 hp/s,
  −20 % speed, −15 % acc) / downed / dead. Bleeding stops on treatment. Medkit heals 45 +
  stops bleeding; revive 3 s, target returns at 35 % hp.
- **Carry**: any soldier may carry a downed ally (order, ≤35 px). Speed ×0.55, cannot fire.
  Bullets ignore the carried body. Downed carrier drops. Drop automatic in evac zone or via order.
- Commander down: succession to highest-XP survivor; leadership aura halves for 20 s, then drops.

## 5. Cover
Cover = `{material, protection, capacity(2), durability, hardness, coveredDir}`.
- Score: protection − dist/500 − claims×0.35 + threat alignment + approach safety − exposure.
- Reservations expire after 8 s or on arrival; capacity enforced.
- Bullets: if `penetration > hardness` pass with `damage × (1−protection)` while chipping the cover;
  otherwise stop. Materials: concrete stops all small arms; brick stops rifle but not sniper;
  wood/metal allow sniper & LMG penetration; sandbags stop except heavy.
- Destruction updates nav (unblocks), visuals, claims and occupants.

## 6. Extraction policies
`mission.extractPolicy`: `all` (default), `percent:0.6`, `commander`, `vip`, `casualty`.
Extract objective requires policy satisfied **and** ≥1 effective soldier in zone. Escort VIPS
included where relevant. HUD + briefing always state the policy. No extraction while the policy
is unmet; ring turns from grey to live green only when satisfied.

## 7. Enemy AI
- Perception: 100° cone, 2-point LOS (head/chest), distance, hearing with confidence decay;
  `awareness` 0–100 builds 35–70/s in cone. Marks: `?` investigating, `!` alerted, off-screen
  edge arrows for `!` in the last 6 s.
- Squad blackboard shares contacts with latency 0.4–1.2 s; commander reduces latency.
- Behaviours: patrol, guard, investigate (last-known + searched points), cover, suppress,
  advance, flank (nav route around exposure), retreat, regroup, reinforce.
- Fairness: reaction 0.25–0.6 s, strafing bursts, 2.5 s target rotation, cover use.

## 8. Missions
Multi-stage objectives: `secure` (clear radius) → `interact` → `exfil` pressure. Each mission
declares a landmark composition (`landmark: 'checkpoint'|'clinic'|'radio-tower'|...`), extraction
policy, one unique event (counterattack, patrol, alarm, storm) and named hazard props.

## 9. Persistence v3
- Schema `{version:3, checksum, savedAt, campaign, settings}`.
- Write: pending key → validate → commit primary → rotate previous primary to backup. Load:
  primary validate → migrate → backup validate → defaults. Deep import validation with clamps.
- Recovery surfaces a toast. Corrupt data is never committed over a valid save.

## 10. Performance budget
≤ 6 ms CPU/frame at 60 Hz mid-phone: ≤ 24 nav searches/s (4 Hz per squad member, 6 max per tick),
≤ 45 units, ≤ 320 particles high tier, 3 background layers from cache, 1 draw per layer.
Quality tiers degrade particles/weather/decals/shadow, never simulation.
