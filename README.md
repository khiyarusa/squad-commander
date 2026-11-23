# SQUAD COMMANDER

**Deliverable:** `SQUAD_COMMANDER.html` — one self-contained file. Open it in any modern mobile or
desktop browser (landscape on phones). No server, no build step, no internet connection required.

A real-time tactical military squad game: you command up to six specialised soldiers across a
12-mission campaign in three regions. Pause anytime — orders still work while paused.

## Quick start
1. Open `SQUAD_COMMANDER.html` (double-click, or serve it — both work).
2. **New Campaign** → pick a difficulty → **Deploy Task Force**.
3. Open **COLD ENTRY**, select your squad, deploy.
4. Tap a soldier (or a squad card), then tap the ground to move. Arm WATCH/COVER/FOCUS from the
   command deck and tap the battlefield. Drag pans, two fingers pinch-zoom, **SPACE** pauses.

## Feature map
- **Squad:** Commander, Rifleman, Assault, Support, Sniper, Medic — persistent XP, ranks, six
  specialisation trees, wounds, permadeath, recruitment, weapon assignment, armour plating.
- **Orders:** move, sprint, hold, follow, take cover, overwatch, focus fire, suppress area, reload,
  treat, retreat, regroup — with a 4-deep order queue (QUEUE), formations (line/column/wedge/
  defensive) and cancel.
- **Combat:** 7 weapon classes, per-magazine + reserve ammo (sidearm fallback), projectile ballistics,
  suppression, stances (stand/crouch/prone), destructible & explosive cover, injuries, bleeding-out,
  medic treatment and field revives.
- **AI:** friendly autonomy (emergency cover, auto-reload, medic triage, friendly-fire avoidance);
  enemies use perception (sight + sound), last-known-position investigation, cover, suppression,
  flanking, retreat and squad coordination. Difficulty changes reactions/accuracy/coordination —
  never just health.
- **Campaign:** 12 missions (eliminate, search & rescue, defend, sabotage, ambush, escort, rescue,
  survive, capture, extraction, decapitation) across urban / forest / industrial environments with
  day-night variants, weather, parallax and dynamic lighting.
- **Meta:** credits/ammo/medical/intel economy, mission ratings (stars), service record, honours,
  memorial, versioned save with export/import (`Settings → Save data`).

## Architecture (source in `src/`, bundled by `build.js`)
- Vanilla JS + Canvas 2D + Web Audio + Pointer Events. All art and audio are generated
  procedurally at runtime (no bitmaps); the only embedded binary assets are three subsets of the
  OFL-licensed *Barlow Condensed* font.
- Fixed-step 60 Hz simulation, DPR-aware rendering, particle pooling, cached parallax tiles,
  adaptive quality, atomic versioned localStorage saves.
- Design decisions: see `DESIGN.md`.

## Tests
`tests/` contains Playwright suites used during development (they reference the Playwright
install in `../LIMINAL/node_modules`):

```
node tests/smoke.js      # boot + menu
node tests/core.js       # campaign → battle → orders → results → hub
node tests/mobile.js     # touch, orders, all 12 missions, persistence, rotation
node tests/balance.js    # cautious-play campaign simulation
node tests/ui-flows.js   # every menu/action via real clicks
node tests/edge-cases.js # scripted spec edge cases
```

## Notes & limitations (honest)
- The visual style is fully procedural vector art — consistent by construction; no AI-generated
  bitmaps are embedded.
- Audio is synthesised (Web Audio); first tap unlocks it per browser policy.
- The browser must allow `localStorage` for saves (private modes may block it; the game degrades
  to in-memory progress and warns on export).
