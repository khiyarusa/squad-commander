'use strict';
/* ============================================================
   02 — DATA DEFINITIONS
   ============================================================ */
const GAME_VERSION = '2.3.0';
const SAVE_KEY = 'squadcommander.save.v3';
const SAVE_BACKUP = 'squadcommander.save.v3.bak';
const SAVE_PENDING = 'squadcommander.save.v3.pending';
const SAVE_VERSION = 3;

const SETTINGS_DEFAULT = {
  master: 0.85, sfx: 0.85, music: 0.5,
  quality: 'high', hudScale: 1, camSens: 1,
  aimAssist: true, shake: true, damageNumbers: true, hints: true
};
const QUALITY = {
  low: { particles: 90, weather: 0, grain: false, shadows: false, lights: false, decals: 10 },
  medium: { particles: 220, weather: 0.55, grain: false, shadows: true, lights: true, decals: 30 },
  high: { particles: 420, weather: 1, grain: true, shadows: true, lights: true, decals: 70 }
};

const DIFFICULTIES = {
  recruit: {
    label: 'RECRUIT', desc: 'Forgiving reactions. Enemies hesitate and coordinate loosely.',
    enemyAcc: 0.72, enemyReact: 1.35, enemyPerception: 0.78, enemyCoord: 0.45, enemyHp: 0.9, playerDamage: 0.85, reward: 0.9
  },
  veteran: {
    label: 'VETERAN', desc: 'The intended experience. Competent, coordinated opposition.',
    enemyAcc: 0.88, enemyReact: 1.0, enemyPerception: 1.0, enemyCoord: 1.0, enemyHp: 1.0, playerDamage: 1.0, reward: 1.0
  },
  elite: {
    label: 'ELITE', desc: 'Veteran hostiles with fast reactions and aggressive flanking.',
    enemyAcc: 1.08, enemyReact: 0.78, enemyPerception: 1.18, enemyCoord: 1.25, enemyHp: 1.08, playerDamage: 1.12, reward: 1.15
  }
};

const RANKS = [
  { name: 'RECRUIT', xp: 0 },
  { name: 'PRIVATE', xp: 160 },
  { name: 'CORPORAL', xp: 420 },
  { name: 'SERGEANT', xp: 820 },
  { name: 'LIEUTENANT', xp: 1350 },
  { name: 'CAPTAIN', xp: 2000 }
];

const ROLES = {
  commander: {
    key: 'commander', label: 'Commander', short: 'CMD', weapon: 'rifle',
    hp: 110, speed: 1.0, acc: 1.06, react: 1.05, armor: 2, stealth: 1.0,
    allowed: ['rifle', 'smg'], color: '#d8b04a', desc: 'Leads the squad. Provides coordination bonus while alive.'
  },
  rifleman: {
    key: 'rifleman', label: 'Rifleman', short: 'RFL', weapon: 'rifle',
    hp: 100, speed: 1.0, acc: 1.08, react: 1.0, armor: 2, stealth: 1.0,
    allowed: ['rifle', 'smg', 'shotgun'], color: '#a9b47a', desc: 'Balanced line infantry. Reliable at any range.'
  },
  assault: {
    key: 'assault', label: 'Assault', short: 'AST', weapon: 'shotgun',
    hp: 108, speed: 1.1, acc: 0.98, react: 1.03, armor: 2, stealth: 0.95,
    allowed: ['shotgun', 'smg', 'rifle'], color: '#c98f4f', desc: 'Close-quarters breacher. Moves fast, hits hard up close.'
  },
  support: {
    key: 'support', label: 'Support', short: 'SUP', weapon: 'lmg',
    hp: 118, speed: 0.9, acc: 0.92, react: 0.95, armor: 3, stealth: 0.85,
    allowed: ['lmg'], color: '#8e9a5e', desc: 'Heavy suppression. Locks enemies down behind cover.'
  },
  sniper: {
    key: 'sniper', label: 'Sniper', short: 'SNP', weapon: 'sniper',
    hp: 92, speed: 0.95, acc: 1.18, react: 0.96, armor: 1, stealth: 1.15,
    allowed: ['sniper'], color: '#89a3b4', desc: 'Long-range precision. Punishes exposed targets.'
  },
  medic: {
    key: 'medic', label: 'Medic', short: 'MED', weapon: 'smg',
    hp: 96, speed: 1.03, acc: 0.94, react: 1.0, armor: 1, stealth: 1.0,
    allowed: ['smg', 'rifle'], color: '#c2725c', desc: 'Treats wounds and revives downed soldiers in the field.'
  }
};

const WEAPONS = {
  rifle: {
    id: 'rifle', name: 'MK-17 CARBINE', cls: 'ASSAULT RIFLE', sound: 'rifle',
    dmg: 15, interval: 0.115, mag: 30, reload: 2.05, range: 680, spread: 1.5,
    vel: 1650, pellets: 1, suppression: 1.0, auto: true, burst: [3, 6], recoil: 1.2,
    aim: 0.5, desc: 'Standard-issue carbine. Balanced damage, control and range.'
  },
  smg: {
    id: 'smg', name: 'VX-9 VECTOR', cls: 'SUBMACHINE GUN', sound: 'smg',
    dmg: 9, interval: 0.075, mag: 32, reload: 1.85, range: 430, spread: 2.7,
    vel: 1200, pellets: 1, suppression: 1.15, auto: true, burst: [4, 8], recoil: 0.7,
    aim: 0.35, desc: 'High rate of fire. Dominates close quarters, falls off at range.'
  },
  shotgun: {
    id: 'shotgun', name: 'M870 BREACHER', cls: 'COMBAT SHOTGUN', sound: 'shotgun',
    dmg: 6, interval: 0.72, mag: 6, reload: 2.7, range: 250, spread: 6.5,
    vel: 1050, pellets: 7, suppression: 1.4, auto: false, burst: [1, 1], recoil: 3.2,
    aim: 0.45, desc: 'Devastating inside 200 metres. Reloads one shell at a time.'
  },
  sniper: {
    id: 'sniper', name: 'M92 LONGBOW', cls: 'SNIPER RIFLE', sound: 'sniper',
    dmg: 58, interval: 1.35, mag: 5, reload: 3.0, range: 1250, spread: 0.28,
    vel: 2600, pellets: 1, suppression: 0.6, auto: false, burst: [1, 1], recoil: 5,
    aim: 1.25, desc: 'Bolt-action precision rifle. One shot can drop a man.'
  },
  lmg: {
    id: 'lmg', name: 'M249 SAW', cls: 'LIGHT MACHINE GUN', sound: 'lmg',
    dmg: 11, interval: 0.082, mag: 100, reload: 4.4, range: 760, spread: 2.8,
    vel: 1500, pellets: 1, suppression: 2.3, auto: true, burst: [8, 16], recoil: 1.6,
    aim: 0.85, desc: 'Belt-fed suppression weapon. Pins enemies behind cover.'
  },
  pistol: {
    id: 'pistol', name: 'P12 SIDEARM', cls: 'PISTOL', sound: 'pistol',
    dmg: 9, interval: 0.2, mag: 12, reload: 1.45, range: 280, spread: 2.8,
    vel: 1100, pellets: 1, suppression: 0.5, auto: false, burst: [2, 3], recoil: 1.4,
    aim: 0.3, desc: 'Backup sidearm. Always available when the primary runs dry.'
  },
  gl: {
    id: 'gl', name: 'MK-19 GL', cls: 'GRENADE LAUNCHER', sound: 'gl',
    dmg: 55, interval: 2.4, mag: 4, reload: 3.6, range: 640, spread: 3.2,
    vel: 560, pellets: 1, suppression: 2.6, auto: false, burst: [1, 1], recoil: 4,
    aim: 1.1, grenade: true, desc: 'Lobbed 40mm grenades. Splash damage ignores most cover.'
  }
};
const WEAPON_ORDER = ['rifle', 'smg', 'shotgun', 'sniper', 'lmg', 'pistol', 'gl'];

const WEAPON_UPGRADES = [
  { id: 'optic', label: 'OPTIC', cost: 340, desc: '−25% spread' },
  { id: 'mag', label: 'EXT. MAG', cost: 300, desc: '+35% magazine' },
  { id: 'tuned', label: 'TUNED ACTION', cost: 380, desc: '−15% reload, −6% cycle' }
];
const ARMOR_LEVELS = [
  { level: 1, label: 'LIGHT PLATE', cost: 0, dmgReduction: 0.06 },
  { level: 2, label: 'STANDARD PLATE', cost: 420, dmgReduction: 0.13 },
  { level: 3, label: 'HEAVY PLATE', cost: 850, dmgReduction: 0.2, speed: -0.05 }
];

const ENEMIES = {
  rifleman: {
    id: 'rifleman', label: 'Rifleman', weapon: 'rifle', hp: 84, armor: 0,
    speed: 1.0, acc: 0.9, react: 0.9, view: 600, color: '#7c4536', visor: '#d0533b',
    desc: 'Standard hostile infantry.'
  },
  heavy: {
    id: 'heavy', label: 'Heavy Gunner', weapon: 'lmg', hp: 150, armor: 2,
    speed: 0.72, acc: 0.78, react: 1.1, view: 650, color: '#55372c', visor: '#e06a3f',
    desc: 'Armoured suppression unit. Slow but punishing.'
  },
  sniper: {
    id: 'sniper', label: 'Sniper', weapon: 'sniper', hp: 70, armor: 0,
    speed: 0.85, acc: 1.2, react: 1.2, view: 1150, color: '#4c5140', visor: '#b9c98a',
    desc: 'Camouflaged marksman. Hunts from high ground.'
  },
  scout: {
    id: 'scout', label: 'Scout', weapon: 'smg', hp: 68, armor: 0,
    speed: 1.24, acc: 0.82, react: 0.8, view: 560, color: '#6c5636', visor: '#e3a63f',
    desc: 'Fast flanker. Pushes aggressively.'
  },
  flanker: {
    id: 'flanker', label: 'Flanker', weapon: 'smg', hp: 82, armor: 1,
    speed: 1.1, acc: 0.92, react: 0.9, view: 640, color: '#5a4132', visor: '#e07d3a',
    desc: 'Seeks side angles and close range.'
  },
  commander: {
    id: 'commander', label: 'Warlord', weapon: 'rifle', hp: 132, armor: 2,
    speed: 0.95, acc: 1.05, react: 0.9, view: 760, color: '#5d3a2c', visor: '#ff5a3c',
    desc: 'Enemy commander. Buffs nearby hostiles; high-value target.'
  },
  demo: {
    id: 'demo', label: 'Demolitionist', weapon: 'gl', hp: 92, armor: 1,
    speed: 0.9, acc: 0.8, react: 1.15, view: 620, color: '#6a4a2f', visor: '#e3a63f',
    desc: 'Fires 40mm grenades at clustered units.'
  }
};

const SKILLS = {
  marksmanship: { id: 'marksmanship', label: 'Marksmanship', icon: 'crosshair', desc: '+7% accuracy per level.', max: 3 },
  mobility: { id: 'mobility', label: 'Mobility', icon: 'sprint', desc: '+7% movement speed per level.', max: 3 },
  awareness: { id: 'awareness', label: 'Awareness', icon: 'overwatch', desc: '+12% reaction speed, +10% suppression resistance.', max: 3 },
  endurance: { id: 'endurance', label: 'Endurance', icon: 'heart', desc: '+12 maximum health per level.', max: 3 },
  leadership: { id: 'leadership', label: 'Leadership', icon: 'regroup', desc: '+4% squad accuracy and morale per level.', max: 3 },
  medicine: { id: 'medicine', label: 'Field Medicine', icon: 'medkit', desc: '+20% treatment and revive speed per level.', max: 3 }
};
const SKILL_ORDER = ['marksmanship', 'mobility', 'awareness', 'endurance', 'leadership', 'medicine'];

const FIRST_NAMES = ['R.', 'D.', 'M.', 'K.', 'S.', 'A.', 'J.', 'T.', 'L.', 'N.', 'E.', 'V.', 'H.', 'C.', 'P.', 'B.'];
const LAST_NAMES = ['VANCE', 'OKAFOR', 'REYES', 'LARSEN', 'KOVAC', 'HADDAD', 'MERCER', 'ARAN', 'DALTON', 'SHIRAZI', 'VOLKOV', 'BAUER', 'CROSS', 'NAKAMURA', 'ORTIZ', 'STONE', 'ADEYEMI', 'RASK', 'MORROW', 'KHAN'];
const CALLSIGNS = ['HAVOC', 'BISHOP', 'SPARK', 'ANVIL', 'KESTREL', 'DOC', 'WRAITH', 'CINDER', 'HALO', 'RIVET', 'GHOST', 'TALON', 'SABLE', 'ECHO', 'GRIT', 'JACKAL'];

const ACHIEVEMENTS = [
  { id: 'first_blood', label: 'First Blood', desc: 'Win your first operation.', test: (c) => c.stats.missionsWon >= 1 },
  { id: 'no_scratch', label: 'No Scratch', desc: 'Finish an operation with no injuries.', test: (c) => c.stats.flawlessMissions >= 1 },
  { id: 'full_house', label: 'Full House', desc: 'Deploy six soldiers and lose none.', test: (c) => c.stats.sixDeployWins >= 1 },
  { id: 'halfway', label: 'Steel Nerves', desc: 'Complete six operations.', test: (c) => c.stats.missionsWon >= 6 },
  { id: 'veteran', label: 'Veteran', desc: 'Complete the campaign.', test: (c) => c.stats.missionsWon >= 12 },
  { id: 'butcher', label: 'Butcher\'s Bill', desc: 'Eliminate 60 hostiles.', test: (c) => c.stats.kills >= 60 },
  { id: 'savior', label: 'Savior', desc: 'Rescue five hostages or VIPs.', test: (c) => c.stats.rescued >= 5 },
  { id: 'medic', label: 'Field Angel', desc: 'Revive five downed soldiers.', test: (c) => c.stats.revives >= 5 }
];

/* ---------- mission definitions ---------- */
const REGIONS = [
  { id: 'r1', name: 'ASHEN DISTRICT', sub: 'URBAN / DUSK', desc: 'A shattered border town choked with rubble and militias.' },
  { id: 'r2', name: 'BLACKPINE', sub: 'FOREST / DAWN', desc: 'Dense pine ridges hiding a supply corridor.' },
  { id: 'r3', name: 'IRONWORKS', sub: 'INDUSTRIAL / OVERCAST', desc: 'A rusting foundry complex turned fortress.' }
];

const MISSIONS = [
  {
    id: 'm01', region: 0, name: 'COLD ENTRY', type: 'ELIMINATION', theme: 'urban', tod: 'dusk',
    seed: 1101, width: 3300, heights: [620, 620, 552, 620], coverDensity: 1.0,
    timeLimit: 420, par: 120, threat: 1,
    deploy: { x: 0.06, spread: 120, width: 190 }, evac: { x: 0.94 },
    objectives: [{ type: 'killAll', label: 'Eliminate all hostiles' }],
    optional: [{ type: 'noInjury', label: 'Squad takes no injuries' }],
    enemies: [
      { type: 'rifleman', x: 0.44 }, { type: 'rifleman', x: 0.53 },
      { type: 'scout', x: 0.62 }, { type: 'rifleman', x: 0.72 }
    ],
    waves: [],
    brief: 'A militia cell has seized the eastern checkpoint. Command wants it quiet, quick and clean. Move your squad up the main road and clear the position.',
    intel: 'Four hostiles confirmed. Light weapons, no armour. Watch the raised terrace on the right — it covers the whole street.',
    outro: 'Checkpoint secure. The road east is open.'
  },
  {
    id: 'm02', region: 0, name: 'NO MAN LEFT BEHIND', type: 'SEARCH & RESCUE', theme: 'urban', tod: 'dusk',
    seed: 1102, width: 3600, heights: [620, 572, 500, 572, 620], coverDensity: 1.1,
    timeLimit: 480, par: 150, threat: 2,
    deploy: { x: 0.05, spread: 110, width: 170 }, evac: { x: 0.94 }, extractPolicy: 'vip',
    objectives: [
      { type: 'rescue', x: 0.72, label: 'Locate and treat the downed pilot', seconds: 3.5, tag: 'pilot' },
      { type: 'extract', label: 'Extract the pilot' }
    ],
    optional: [{ type: 'noInjury', label: 'No squad injuries' }],
    enemies: [
      { type: 'rifleman', x: 0.38 }, { type: 'scout', x: 0.5 },
      { type: 'rifleman', x: 0.6 }, { type: 'sniper', x: 0.78 },
      { type: 'rifleman', x: 0.85 }
    ],
    waves: [],
    brief: 'A recon bird went down behind the lines. The pilot is alive, pinned in the old market. Reach her, stabilise her wounds and bring her home.',
    intel: 'A sniper is holding the terrace above the market. The pilot is in the open — smoke and speed are your friends.',
    outro: 'Pilot recovered. She will fly again.'
  },
  {
    id: 'm03', region: 0, name: 'HOLD THE LINE', type: 'DEFEND', theme: 'urban', tod: 'night',
    seed: 1103, width: 3400, heights: [600, 600, 540, 600], coverDensity: 0.9,
    timeLimit: 400, par: 140, threat: 3,
    deploy: { x: 0.3, spread: 150, width: 230 }, evac: { x: 0.96 },
    objectives: [{ type: 'hold', x: 0.5, width: 230, seconds: 120, label: 'Hold the relay station' }],
    optional: [{ type: 'noKia', label: 'No soldiers killed' }],
    enemies: [
      { type: 'rifleman', x: 0.72 }, { type: 'scout', x: 0.8 }, { type: 'heavy', x: 0.88 }
    ],
    waves: [
      { t: 10, count: 2, pool: ['rifleman', 'scout'], side: 'right' },
      { t: 38, count: 2, pool: ['rifleman', 'flanker'], side: 'right' },
      { t: 66, count: 2, pool: ['rifleman', 'heavy', 'scout'], side: 'right' },
      { t: 94, count: 3, pool: ['rifleman', 'flanker', 'sniper'], side: 'right' }
    ],
    brief: 'The relay station carries the whole sector\'s comms. Hold it for two minutes while engineers bring the backup array online. They will come in waves.',
    intel: 'No armour support. Expect massed riflemen and at least one heavy gunner. Interlocking fire on the approach will break their momentum.',
    outro: 'Relay online. The sector can hear us again.'
  },
  {
    id: 'm04', region: 0, name: 'SILENT LEDGER', type: 'SABOTAGE', theme: 'urban', tod: 'night',
    seed: 1104, width: 3800, heights: [620, 540, 620, 560, 620], coverDensity: 1.0,
    timeLimit: 520, par: 170, threat: 3,
    deploy: { x: 0.05, spread: 100, width: 160 }, evac: { x: 0.95 },
    objectives: [
      { type: 'interact', x: 0.36, label: 'Plant charge — antenna A', seconds: 5 },
      { type: 'interact', x: 0.64, label: 'Plant charge — antenna B', seconds: 5 },
      { type: 'extract', label: 'Fall back to extraction' }
    ], extractPolicy: 'all',
    optional: [{ type: 'noKia', label: 'No soldiers killed' }],
    enemies: [
      { type: 'rifleman', x: 0.28 }, { type: 'sniper', x: 0.48 },
      { type: 'rifleman', x: 0.58 }, { type: 'heavy', x: 0.7 },
      { type: 'scout', x: 0.82 }, { type: 'rifleman', x: 0.9 }
    ],
    waves: [],
    brief: 'Their command net runs through two rooftop antennas. Plant charges on both, then get out before the response teams seal the district.',
    intel: 'Sentries are spaced along the avenue. A marksman covers the central terrace. Charges take five seconds to set.',
    outro: 'Both arrays dark. Their commanders are shouting into static.'
  },
  {
    id: 'm05', region: 1, name: 'KILO PASS', type: 'AMBUSH', theme: 'forest', tod: 'dawn',
    seed: 2201, width: 3700, heights: [610, 540, 620, 560, 630], coverDensity: 1.2,
    timeLimit: 170, par: 95, threat: 3,
    deploy: { x: 0.1, spread: 140, width: 220 }, evac: { x: 0.95 },
    objectives: [{ type: 'killAll', label: 'Destroy the supply column escort' }],
    optional: [{ type: 'noInjury', label: 'No squad injuries' }],
    enemies: [
      { type: 'rifleman', x: 0.4 }, { type: 'rifleman', x: 0.48 },
      { type: 'flanker', x: 0.56 }, { type: 'heavy', x: 0.64 },
      { type: 'scout', x: 0.72 }, { type: 'rifleman', x: 0.8 }
    ],
    waves: [],
    brief: 'A supply column is moving through Kilo Pass at first light. You have under three minutes before it clears the trees. Hit them before they scatter.',
    intel: 'Six escorts, one heavy weapon. They are strung out along the pass and will dig in fast. Speed matters more than caution.',
    outro: 'Column destroyed. Their northern push stalls.'
  },
  {
    id: 'm06', region: 1, name: 'THE LONG WALK', type: 'ESCORT', theme: 'forest', tod: 'dawn',
    seed: 2202, width: 4000, heights: [620, 570, 520, 610, 560, 620], coverDensity: 1.15,
    timeLimit: 560, par: 190, threat: 4,
    deploy: { x: 0.05, spread: 110, width: 170 }, evac: { x: 0.95 },
    objectives: [
      { type: 'protect', tag: 'vip', label: 'Keep the defector alive' },
      { type: 'escort', tag: 'vip', label: 'Escort the defector to extraction' }
    ],
    optional: [{ type: 'noInjury', label: 'No squad injuries' }],
    enemies: [
      { type: 'rifleman', x: 0.32 }, { type: 'scout', x: 0.44 },
      { type: 'rifleman', x: 0.53 }, { type: 'flanker', x: 0.63 },
      { type: 'sniper', x: 0.74 }, { type: 'heavy', x: 0.86 }
    ],
    waves: [
      { t: 55, count: 2, pool: ['scout', 'flanker'], side: 'right' }
    ],
    brief: 'Our defector carries the location of every supply cache in the valley. Walk him to the extraction point alive. He will follow the squad.',
    intel: 'They know he is coming. Expect a blocking force and a sniper on the ridge. The defector is unarmed and will not survive a direct hit.',
    outro: 'Defector delivered. The valley is ours to map.'
  },
  {
    id: 'm07', region: 1, name: 'HOLLOW GROUND', type: 'RESCUE', theme: 'forest', tod: 'dusk',
    seed: 2203, width: 3900, heights: [620, 550, 610, 530, 620], coverDensity: 1.0,
    timeLimit: 520, par: 175, threat: 4,
    deploy: { x: 0.05, spread: 100, width: 160 }, evac: { x: 0.95 },
    objectives: [
      { type: 'rescueUnits', tags: ['hostage1', 'hostage2'], seconds: 2.6, label: 'Free the hostages' },
      { type: 'extract', label: 'Extract hostages and squad' }
    ], extractPolicy: 'all',
    optional: [{ type: 'noKia', label: 'No soldiers killed' }],
    enemies: [
      { type: 'rifleman', x: 0.3 }, { type: 'rifleman', x: 0.42 },
      { type: 'flanker', x: 0.5 }, { type: 'heavy', x: 0.6 },
      { type: 'rifleman', x: 0.7 }, { type: 'scout', x: 0.8 },
      { type: 'sniper', x: 0.87 }
    ],
    waves: [],
    brief: 'Two aid workers are being held in a logging camp. Go in quiet, cut them loose and bring them out through the treeline.',
    intel: 'Seven hostiles including a marksman. The hostages are in the central camp — do not use grenades near them.',
    outro: 'Both hostages safe. The camp is silent.'
  },
  {
    id: 'm08', region: 1, name: 'NIGHTFALL', type: 'SURVIVE', theme: 'forest', tod: 'night',
    seed: 2204, width: 3400, heights: [610, 610, 545, 610], coverDensity: 0.9,
    timeLimit: 380, par: 160, threat: 4,
    deploy: { x: 0.26, spread: 150, width: 220 }, evac: { x: 0.95 },
    objectives: [{ type: 'survive', seconds: 150, label: 'Survive until extraction' }],
    optional: [{ type: 'noKia', label: 'No soldiers killed' }],
    enemies: [
      { type: 'rifleman', x: 0.62 }, { type: 'scout', x: 0.7 }
    ],
    waves: [
      { t: 8, count: 2, pool: ['scout', 'rifleman'], side: 'right' },
      { t: 26, count: 2, pool: ['rifleman', 'flanker'], side: 'right' },
      { t: 52, count: 3, pool: ['rifleman', 'heavy', 'scout'], side: 'right' },
      { t: 78, count: 3, pool: ['flanker', 'rifleman', 'sniper'], side: 'right' },
      { t: 105, count: 3, pool: ['rifleman', 'heavy', 'scout', 'flanker'], side: 'right' }
    ],
    brief: 'Cut off and out of time. Hold the ridge clearing until the transport can touch down. They will keep coming out of the dark.',
    intel: 'Hostiles are probing from the east. Suppression discipline and staggered positions will keep them from overrunning the clearing.',
    outro: 'Transport away. The ridge goes quiet.'
  },
  {
    id: 'm09', region: 2, name: 'RUST BELT', type: 'CAPTURE', theme: 'industrial', tod: 'overcast',
    seed: 3301, width: 3600, heights: [620, 560, 620, 540, 620], coverDensity: 1.1,
    timeLimit: 480, par: 165, threat: 4,
    deploy: { x: 0.06, spread: 110, width: 180 }, evac: { x: 0.94 },
    objectives: [{ type: 'hold', x: 0.52, width: 250, seconds: 70, label: 'Secure the loading bay' }],
    optional: [{ type: 'noInjury', label: 'No squad injuries' }],
    enemies: [
      { type: 'rifleman', x: 0.4 }, { type: 'heavy', x: 0.5 },
      { type: 'scout', x: 0.62 }, { type: 'rifleman', x: 0.72 },
      { type: 'sniper', x: 0.84 }
    ],
    waves: [
      { t: 30, count: 2, pool: ['flanker', 'rifleman'], side: 'right' },
      { t: 62, count: 3, pool: ['rifleman', 'heavy', 'scout'], side: 'right' }
    ],
    brief: 'The loading bay is the only route for their heavy equipment. Take it and hold it while our engineers strip the place.',
    intel: 'Defenders have dug into the containers. Expect a marksman on the gantry and a counterattack from the east gate.',
    outro: 'Bay secure. Their armour is going nowhere.'
  },
  {
    id: 'm10', region: 2, name: 'HARD RAIN', type: 'ELIMINATION', theme: 'industrial', tod: 'overcast',
    seed: 3302, width: 3900, heights: [620, 575, 520, 600, 560, 620], coverDensity: 1.2,
    timeLimit: 520, par: 180, threat: 5,
    deploy: { x: 0.05, spread: 110, width: 170 }, evac: { x: 0.95 },
    objectives: [
      { type: 'killAll', label: 'Clear the foundry yard' },
      { type: 'interact', x: 0.45, label: 'Destroy supply cache A', seconds: 4, optional: true },
      { type: 'interact', x: 0.8, label: 'Destroy supply cache B', seconds: 4, optional: true }
    ],
    optional: [{ type: 'noInjury', label: 'No squad injuries' }],
    enemies: [
      { type: 'rifleman', x: 0.34 }, { type: 'flanker', x: 0.44 },
      { type: 'heavy', x: 0.54 }, { type: 'rifleman', x: 0.63 },
      { type: 'demo', x: 0.72 }, { type: 'sniper', x: 0.82 },
      { type: 'rifleman', x: 0.9 }
    ],
    waves: [],
    brief: 'The foundry yard is their forward staging area. Clear it out. While you are there, burn the supply caches if you can.',
    intel: 'They have a demolitionist with a launcher — do not cluster. Caches are marked with yellow tarps.',
    outro: 'Yard cleared. Their staging area is ash.'
  },
  {
    id: 'm11', region: 2, name: 'THE FOUNDRY', type: 'EXTRACTION', theme: 'industrial', tod: 'overcast',
    seed: 3303, width: 4100, heights: [620, 560, 510, 590, 540, 620], coverDensity: 1.15,
    timeLimit: 580, par: 195, threat: 5,
    deploy: { x: 0.05, spread: 110, width: 170 }, evac: { x: 0.95 },
    objectives: [
      { type: 'rescue', x: 0.68, label: 'Reach the captive engineer', seconds: 4, tag: 'vip' },
      { type: 'protect', tag: 'vip', label: 'Keep the engineer alive' },
      { type: 'escort', tag: 'vip', label: 'Escort the engineer to extraction' }
    ],
    optional: [{ type: 'noKia', label: 'No soldiers killed' }],
    enemies: [
      { type: 'rifleman', x: 0.3 }, { type: 'scout', x: 0.4 },
      { type: 'heavy', x: 0.5 }, { type: 'rifleman', x: 0.58 },
      { type: 'sniper', x: 0.68 }, { type: 'flanker', x: 0.77 },
      { type: 'demo', x: 0.86 }, { type: 'rifleman', x: 0.92 }
    ],
    waves: [
      { t: 80, count: 2, pool: ['scout', 'flanker'], side: 'right' }
    ],
    brief: 'An engineer who knows the foundry\'s control systems is being held in the main hall. Get her out. She is the key to shutting this place down.',
    intel: 'Heavy security. A sniper overwatches the hall entrance and a demolitionist guards the east approach. The engineer cannot run fast.',
    outro: 'Engineer extracted. The foundry\'s secrets are ours.'
  },
  {
    id: 'm12', region: 2, name: 'LAST STAND', type: 'DECAPITATION', theme: 'industrial', tod: 'night',
    seed: 3304, width: 4000, heights: [620, 550, 600, 520, 620], coverDensity: 1.0,
    timeLimit: 520, par: 170, threat: 5,
    deploy: { x: 0.05, spread: 110, width: 170 }, evac: { x: 0.95 },
    objectives: [
      { type: 'killTarget', tag: 'warlord', label: 'Eliminate the warlord' },
      { type: 'extract', label: 'Extract the squad' }
    ], extractPolicy: 'commander',
    optional: [{ type: 'noKia', label: 'No soldiers killed' }],
    enemies: [
      { type: 'rifleman', x: 0.3 }, { type: 'flanker', x: 0.42 },
      { type: 'heavy', x: 0.52 }, { type: 'sniper', x: 0.62 },
      { type: 'rifleman', x: 0.7 }, { type: 'demo', x: 0.78 },
      { type: 'commander', x: 0.86, tag: 'warlord' },
      { type: 'rifleman', x: 0.92 }
    ],
    waves: [
      { t: 45, count: 2, pool: ['scout', 'flanker'], side: 'right' }
    ],
    brief: 'The warlord who started this war is in the foundry tonight. Cut the head off and the militia ends. He will not go quietly.',
    intel: 'He is surrounded by his best: a heavy gunner, a marksman and a demolitionist. Expect reinforcements once the shooting starts.',
    outro: 'The warlord is dead. The valley is quiet for the first time in years.'
  }
];

/* ============================================================ */
const MISSION_REWARDS = {
  m01: [900, 80, 1, 1], m02: [1000, 90, 1, 1], m03: [1100, 100, 1, 1], m04: [1250, 110, 2, 1],
  m05: [1300, 110, 1, 1], m06: [1400, 120, 2, 1], m07: [1500, 130, 2, 2], m08: [1500, 140, 2, 1],
  m09: [1600, 140, 2, 2], m10: [1750, 150, 2, 2], m11: [1900, 160, 3, 2], m12: [2400, 200, 3, 3]
};
for (const m of MISSIONS) {
  const r = MISSION_REWARDS[m.id];
  if (r && !m.rewards) m.rewards = { credits: r[0], ammo: r[1], med: r[2], intel: r[3] };
}

const MISSIONS_BY_ID = Object.fromEntries(MISSIONS.map((m, i) => [m.id, m]));
const MISSION_INDEX = Object.fromEntries(MISSIONS.map((m, i) => [m.id, i]));
const REGION_MISSIONS = REGIONS.map((r, ri) => MISSIONS.filter((m) => m.region === ri));
