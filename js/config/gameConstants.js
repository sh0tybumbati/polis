// ─── Greek names ─────────────────────────────────────────────────────────────
export const GREEK_NAMES_M = [
  'Lysander','Themistokles','Alkibiades','Leonidas','Brasidas',
  'Nikias','Demetrios','Perikles','Miltiades','Xenophon',
  'Pausanias','Epaminondas','Iphikrates','Konon','Agesilaos',
  'Kleombrotos','Kallikrates','Thrasybulos','Phokion','Timoleon',
  'Aristides','Cimon','Philopoemen','Pelopidas','Agis'
];
export const GREEK_NAMES_F = [
  'Artemisia','Aspasia','Gorgo','Hydna','Telesilla',
  'Agnodike','Phano','Cynisca','Hipparchia','Arete',
  'Metrodora','Theano','Anyte','Nossis','Praxilla',
  'Cleopatra','Berenice','Eurydice','Olympias','Roxana',
  'Thais','Phryne','Lais','Leontion','Elpinice'
];
export function pickName(gender) {
  const list = gender === 'female' ? GREEK_NAMES_F : GREEK_NAMES_M;
  return list[Math.floor(Math.random() * list.length)];
}

export const GREEK_FAMILY_NAMES = [
  'Kallias','Themis','Drakos','Nikias','Solon',
  'Philon','Agias','Kratinos','Lykon','Mnesiphilos',
];
export const SUMER_FAMILY_NAMES = [
  'Ur-Namma','Ereshti','Kibri','Adad','Nabu-Zer',
  'Enlil-Bani','Rimush','Lugal-Zage','Sin-Muballit','Warad',
];
export function pickFamilyName(civ) {
  const list = civ === 'sumer' ? SUMER_FAMILY_NAMES : GREEK_FAMILY_NAMES;
  return list[Math.floor(Math.random() * list.length)];
}

// ─── Genetic helpers (M4) ────────────────────────────────────────────────────

const _SKIN = [0xc8a878, 0xb8945e, 0xa87848, 0xd4b888, 0x9a6840, 0xc09060];
const _HAIR = [0x2a1a08, 0x3a2010, 0x1a1008, 0x5a3820, 0x4a2c18, 0x180808];
const _EYE  = [0x5a6840, 0x3a4820, 0x6a5830, 0x4a3818, 0x385030, 0x2a3828];
const _pick = arr => arr[Math.floor(Math.random() * arr.length)];

export const V25_SKILLS = [
  'farming','woodcutting','mining','masonry',
  'bake','butcher','mill','tan','smelt','forge','animalTrap',
  'spear','sword','bow',
];

export function emptySkills() {
  return Object.fromEntries(V25_SKILLS.map(s => [s, { level: 1, xp: 0 }]));
}

export function randomAttributes() {
  const v = () => 3 + Math.floor(Math.random() * 5);
  return { str: v(), dex: v(), con: v(), int: v(), agi: v(), wil: v() };
}

export function blendAttributes(a1, a2) {
  const out = {};
  for (const k of ['str','dex','con','int','agi','wil']) {
    const mid = Math.round((a1[k] + a2[k]) / 2);
    out[k] = Math.max(1, Math.min(10, mid + Math.floor(Math.random() * 3) - 1));
  }
  return out;
}

export function randomPhenotype() {
  return {
    skinHex: _pick(_SKIN), hairHex: _pick(_HAIR), eyeHex: _pick(_EYE),
    heightScale: 0.85 + Math.random() * 0.3,
  };
}

export function blendPhenotype(p1, p2) {
  const cl = v => Math.max(0, Math.min(255, v));
  const jt = () => Math.floor(Math.random() * 17) - 8;
  const bh = (a, b) => {
    const r = cl(Math.round(((a>>16&0xff)+(b>>16&0xff))/2)+jt());
    const g = cl(Math.round(((a>>8 &0xff)+(b>>8 &0xff))/2)+jt());
    const bl= cl(Math.round(((a    &0xff)+(b    &0xff))/2)+jt());
    return (r<<16)|(g<<8)|bl;
  };
  return {
    skinHex: bh(p1.skinHex, p2.skinHex),
    hairHex: bh(p1.hairHex, p2.hairHex),
    eyeHex:  bh(p1.eyeHex,  p2.eyeHex),
    heightScale: Math.max(0.6, Math.min(1.4,
      (p1.heightScale + p2.heightScale) / 2 + (Math.random() * 0.1 - 0.05))),
  };
}

export function randomPassions() {
  const shuffled = [...V25_SKILLS].sort(() => Math.random() - 0.5);
  const p = Object.fromEntries(V25_SKILLS.map(s => [s, 'none']));
  p[shuffled[0]] = 'burning';
  p[shuffled[1]] = 'interested';
  p[shuffled[2]] = 'interested';
  return p;
}

export function blendPassions(p1, p2) {
  const rank = { none:0, interested:1, burning:2 };
  const p = {};
  for (const s of V25_SKILLS) {
    const avg = (rank[p1[s]??'none'] + rank[p2[s]??'none']) / 2;
    const r = Math.random();
    if      (avg >= 1.5) p[s] = r < 0.55 ? 'burning'    : r < 0.80 ? 'interested' : 'none';
    else if (avg >= 0.5) p[s] = r < 0.50 ? 'interested' : r < 0.65 ? 'burning'    : 'none';
    else                 p[s] = r < 0.10 ? 'interested' : 'none';
  }
  const ensure = (lv, min) => {
    while (Object.values(p).filter(v => v === lv).length < min) {
      const pool = V25_SKILLS.filter(s => p[s] === 'none');
      if (!pool.length) break;
      p[pool[Math.floor(Math.random() * pool.length)]] = lv;
    }
  };
  ensure('burning', 1);
  ensure('interested', 2);
  return p;
}

export const ENABLE_NEW_UI = false;
export const ENABLE_PROACTIVE_AI = true;

// ─── Archon AI Constants ─────────────────────────────────────────────────────
export const ARCHON_BUILD_ORDER = [
    'granary', 'woodshed', 'stonepile', // Tier 1: Storage
    'mill', 'carpenter', 'masons'      // Tier 2: Processing
];

// ─── World & Map Constants ───────────────────────────────────────────────────

export const TILE      = 32;
export const MAP_OY    = 52;   // topbar height; map starts here

// Chunk-based infinite map
export const CHUNK_SIZE = 16;
export const WORLD_SEED_DEFAULT = 0;

// Screen / viewport — canvas size, used for UI layout
export const SCREEN_W = 1024;
export const SCREEN_H = 768;
// These are likely fallback or default values. We'll use values from gameConfig.js.

// ─── Terrain Constants ───────────────────────────────────────────────────────

export const T_GRASS = 0, T_SAND = 1, T_ROCK = 2, T_FOREST = 3, T_WATER = 4, T_MOUNTAIN = 5;
// Fallback tile colours (used when biomeData not yet available)
export const TILE_A  = [0x5a8c28, 0xc0984c, 0x706050, 0x1d4a14, 0x1a3a88, 0x887888];
export const TILE_B  = [0x4a7820, 0xb08840, 0x60544a, 0x163c10, 0x142e70, 0x706070];

// Per-biome tile colours — [biome 0..3][terrain T_GRASS..T_MOUNTAIN]
//   Biome 0 = Heartland  (lush, fertile)
//   Biome 1 = Scrubland  (dry, yellowy)
//   Biome 2 = Forest     (dense, dark)
//   Biome 3 = Badlands   (dusty, reddish)
export const BIOME_A = [
  [0x5a9c2c, 0xb89040, 0x686050, 0x1d4a14, 0x1a3a88, 0x807888], // heartland
  [0x8a9430, 0xc8a450, 0x686050, 0x1d4a14, 0x1a3a88, 0x907880], // scrubland — yellower grass
  [0x2e6818, 0x907858, 0x5a5040, 0x163c10, 0x1a3a88, 0x706870], // forest    — dark & mossy
  [0x6a6840, 0xb07038, 0x786858, 0x1d4a14, 0x1a3a88, 0xa08070], // badlands  — dusty olive, rusty rock
];
export const BIOME_B = [
  [0x4a8820, 0xa88030, 0x585448, 0x163c10, 0x142e70, 0x686070], // heartland
  [0x7a8428, 0xb89440, 0x585040, 0x163c10, 0x142e70, 0x786868], // scrubland
  [0x1e5010, 0x806848, 0x4a4438, 0x0e3208, 0x142e70, 0x585860], // forest
  [0x5a5838, 0xa06030, 0x686048, 0x163c10, 0x142e70, 0x887060], // badlands
];
// Movement speed multiplier per tile type (index = T_* constant)
// T_MOUNTAIN = 0.0 (impassable until mined through)
export const TILE_SPD  = [1.0, 0.75, 0.6, 0.65, 0.0, 0.0];

// Road / desire-path layer (stored in roadMap, separate from terrain)
export const ROAD_NONE   = 0;  // no road
export const ROAD_DESIRE = 1;  // worn desire path  — ×1.15 speed bonus
export const ROAD_PAVED  = 2;  // player-built road — ×1.45 speed bonus
export const ROAD_SPD    = [1.0, 1.15, 1.45];  // indexed by ROAD_* constant
export const DESIRE_THRESHOLD  = 120;   // traffic count before a desire path appears
export const HUNGER_THRESHOLD  = 28;    // game-seconds between meals (~3 meals per 90s day)
export const TRAFFIC_DECAY_PER_DAY = 18; // subtracted from every tile each day transition

// ─── Construct Definitions ────────────────────────────────────────────────────

// ─── Day/Night Cycle Constants ──────────────────────────────────────────────

export const DAY_DURATION    = 90000;   // 90s day
export const NIGHT_DURATION  = 90000;   // 90s night
export const WIN_NIGHTS      = 20;    // number of nights to survive to win
export const SEASONS         = ['Spring', 'Summer', 'Autumn', 'Winter'];
export const SEASON_DAYS     = 8;     // days per season

// ─── UI / Display Constants ──────────────────────────────────────────────────

export const UI_PANEL_H = 150; // height of bottom UI panel
export const UI_BTN_SIZE = 48; // size for square UI buttons
export const UI_MM_W = 200, UI_MM_H = 120; // minimap width and height
export const TAP_DIST    = 8; // Max distance for a pointerdown/up to count as a tap (vs drag)

// ─── Unit Definitions ────────────────────────────────────────────────────────

export const UNIT_NAMES = {
  worker: 'Thetes', clubman: 'Machimos', archer: 'Toxotes', spearman: 'Hoplite',
  cavalry: 'Hippeis', slinger: 'Sphendonetes', peltast: 'Peltast',
  hoplite: 'Hoplite', toxotes: 'Toxotes', scout: 'Scout', berserker: 'Berserker',
  veteran: 'Veteran'
};

// ─── Veteran Levels ──────────────────────────────────────────────────────────

export const VET_LEVELS = [
  { label: 'Recruit', nights: 3, hpBonus: 2, speedMult: 1.02, color: 0xccaa44 },
  { label: 'Veteran', nights: 7, hpBonus: 3, speedMult: 1.03, color: 0xddbb55 },
  { label: 'Elite', nights: 12, hpBonus: 4, speedMult: 1.04, color: 0xeecc66 },
  { label: 'Hero', nights: 20, hpBonus: 5, speedMult: 1.05, color: 0xffdd88 },
];
const VET_NAMES = ['Achilles','Ajax','Hector','Odysseus','Perseus','Jason','Heracles','Theseus','Minos','Bellerophon'];
export function pickVetName() { return VET_NAMES[Math.floor(Math.random() * VET_NAMES.length)]; }


// ─── Combat Modifiers ────────────────────────────────────────────────────────

export const HIGH_GROUND_BONUS = 30; // additional range for archers on T_ROCK

export function _coverMod(terrain) {
  if (terrain === T_FOREST) return 0.7; // 30% damage reduction in forest
  if (terrain === T_ROCK) return 0.85; // 15% damage reduction on rock
  return 1.0;
}

export function _counterMod(attackerType, defenderType) {
  // Melee vs Melee (e.g., spearman vs clubman)
  if (attackerType === 'spearman' && (defenderType === 'clubman' || defenderType === 'berserker')) return 1.15;
  if ((attackerType === 'clubman' || attackerType === 'berserker') && defenderType === 'spearman') return 0.85;

  // Ranged vs Melee (e.g., archer vs spearman)
  if (attackerType === 'archer' && (defenderType === 'clubman' || defenderType === 'spearman' || defenderType === 'berserker')) return 1.2;
  if ((attackerType === 'clubman' || attackerType === 'spearman' || attackerType === 'berserker') && attackerType === 'archer') return 0.8;

  // Cavalry vs Ranged
  if (attackerType === 'cavalry' && (defenderType === 'archer' || defenderType === 'slinger' || defenderType === 'toxotes')) return 1.3;
  if ((attackerType === 'archer' || attackerType === 'slinger' || attackerType === 'toxotes') && attackerType === 'cavalry') return 0.7;

  // Specific counters
  if (attackerType === 'peltast' && (defenderType === 'archer' || defenderType === 'slinger' || defenderType === 'toxotes')) return 1.1; // Peltasts good vs ranged
  if ((attackerType === 'archer' || attackerType === 'slinger' || attackerType === 'toxotes') && defenderType === 'peltast') return 0.9;

  return 1.0;
}

// ─── Construct Categories (for UI) ────────────────────────────────────────────

export const CONSTRUCT_VOLUME = {
    camp:      400,
    grainsilo: 1000,
    storageshelf: 800,
    house:     150,
    townhall:  500,
    melee_grounds:  400,
    archery_grounds:   400,
    mounted_grounds:    400,
    tanningrack:   500,
    forge:   500,
    anvil: 500,
    millstone:      600,
    oven:    500,
    olivepress: 500,
    temple:    300,
    oracle:    300,
    workbench: 600,
    stonecutter: 600,
};

// ─── Secondary material conversions ──────────────────────────────────────────
// Two tiers per material:
//   wood (logs)  — gathered from trees, 3 logs → 4 planks at carpenter
//   sticks       — debris around trees, 3 sticks → 1 plank; also used for arrows
//   stone (chunks) — quarried from boulders, 1 chunk → 4 stoneBlocks at masons
//   stones       — debris around boulders, 3 stones → 1 stoneBlock; slinger ammo
export const RAW_CONVERSION = {
  'Materials.Wood.Pine.Plank':        { input: 'Materials.Wood.Pine.Sticks',       inAmt: 3, outAmt: 1 },
  'Materials.Stone.Limestone.Block':  { input: 'Materials.Stone.Limestone.Stones', inAmt: 3, outAmt: 1 },
};

// ─── Appliance Definitions (M5) ──────────────────────────────────────────────
// source: workshop that crafts it
// skillReq: minimum skill level to desire/self-craft
// costWorkshop: via workshop (uses planks/stoneBlocks)
// costRaw: primitive at-home route (uses sticks/stones, 3:1 ratio baked in)
export const APPLIANCE_DEF = {
  workbench: { label: 'Workbench', source: 'carpenter', skillReq: { woodcutting: 5 },
               costWorkshop: { 'Materials.Wood.Pine.Plank': 6 },              costRaw: { 'Materials.Wood.Pine.Sticks': 18 } },
  loom:      { label: 'Loom',      source: 'carpenter', skillReq: { woodcutting: 5 },
               costWorkshop: { 'Materials.Wood.Pine.Plank': 4 },              costRaw: { 'Materials.Wood.Pine.Sticks': 12 } },
  millstone: { label: 'Millstone', source: 'masons',    skillReq: { masonry: 5 },
               costWorkshop: { 'Materials.Stone.Limestone.Block': 6 },        costRaw: { 'Materials.Stone.Limestone.Stones': 18 } },
  hearth:    { label: 'Hearth',    source: 'masons',    skillReq: { masonry: 5 },
               costWorkshop: { 'Materials.Stone.Limestone.Block': 4 },        costRaw: { 'Materials.Stone.Limestone.Stones': 12 } },
  anvil:     { label: 'Anvil',     source: 'blacksmith', skillReq: { forge: 5 },
               costWorkshop: { 'Materials.Metal.Copper.Ingot': 3 },           costRaw: { 'Materials.Metal.Copper.Ingot': 3 } },
};

// ─── Oikos Room Definitions ──────────────────────────────────────────────────
// rooms array on a house instance: undefined = legacy (all appliances work, cap=6)
// Each room occupies a slot (max 6 slots per house).
export const ROOM_DEFS = {
    bedroom:   { label: '🛏 Bedroom',   icon: '🛏', capacityBonus: 2,  storageBonus: 0,
                 cost: { 'Materials.Wood.Pine.Sticks': 8 },
                 desc: '+2 resident capacity' },
    kitchen:   { label: '🔥 Kitchen',   icon: '🔥', capacityBonus: 0,  storageBonus: 40, applianceBonus: 1,
                 cost: { 'Materials.Stone.Limestone.Stones': 6 },
                 desc: 'Enables hearth & millstone; +1 appliance slot; +40 volume' },
    workshop:  { label: '🔨 Workshop',  icon: '🔨', capacityBonus: 0,  storageBonus: 20, applianceBonus: 1,
                 cost: { 'Materials.Wood.Pine.Sticks': 10 },
                 desc: 'Enables workbench, loom & anvil; +1 appliance slot; +20 volume' },
    storeroom: { label: '📦 Storeroom', icon: '📦', capacityBonus: 0,  storageBonus: 80,
                 cost: { 'Materials.Wood.Pine.Sticks': 6 },
                 desc: '+80 storage volume' },
};
export const ROOM_MAX_SLOTS = 6; // max rooms per house

// ─── Formation Types (for UI) ────────────────────────────────────────────────

export const FM_TYPES = ['phalanx', 'wedge', 'screen'];
export const FM_LABELS = ['Phalanx', 'Wedge', 'Screen'];

// ─── Material display helpers ─────────────────────────────────────────────────

export const MATERIAL_LABELS = {
    'Materials.Wood.Pine.Sticks':      'Sticks',
    'Materials.Wood.Pine':             'Logs',
    'Materials.Stone.Limestone.Stones':'Stones',
    'Materials.Stone.Limestone':       'Slabs',
    'Materials.Metal.Iron':            'Iron',
    'Materials.Metal.Bronze':          'Bronze',
    'Materials.Metal.Gold':            'Gold',
};

export const MATERIAL_COLORS = {
    'Materials.Wood.Pine.Sticks':      0x7a4e28,
    'Materials.Wood.Pine':             0x5a3018,
    'Materials.Stone.Limestone.Stones':0x888888,
    'Materials.Stone.Limestone':       0x5a5a70,
    'Materials.Metal.Iron':            0x8899aa,
    'Materials.Metal.Bronze':          0xaa7722,
    'Materials.Metal.Gold':            0xddaa22,
};

// ─────────────────────────────────────────────────────────────────────────────