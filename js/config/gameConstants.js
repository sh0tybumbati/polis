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

// ─── World & Map Constants ───────────────────────────────────────────────────

export const TILE      = 32;
export const MAP_OY    = 52;   // topbar height; map starts here

// World (fixed large grid — camera scrolls over it)
export const WORLD_W   = 80;
export const WORLD_H   = 128;
export const MAP_W     = WORLD_W;       // alias used throughout
export const MAP_H     = WORLD_H;
export const MAP_BOTTOM = MAP_OY + MAP_H * TILE;   // world pixel height

// Screen / viewport — canvas size, used for UI layout
export const SCREEN_W = 1024;
export const SCREEN_H = 768;
// These are likely fallback or default values. We'll use values from gameConfig.js.

// ─── Terrain Constants ───────────────────────────────────────────────────────

export const T_GRASS = 0, T_SAND = 1, T_ROCK = 2, T_FOREST = 3, T_WATER = 4;
// Fallback tile colours (used when biomeData not yet available)
export const TILE_A  = [0x5a8c28, 0xc0984c, 0x706050, 0x1d4a14, 0x1a3a88];
export const TILE_B  = [0x4a7820, 0xb08840, 0x60544a, 0x163c10, 0x142e70];

// Per-biome tile colours — [biome 0..3][terrain T_GRASS..T_WATER]
//   Biome 0 = Heartland  (lush, fertile)
//   Biome 1 = Scrubland  (dry, yellowy)
//   Biome 2 = Forest     (dense, dark)
//   Biome 3 = Badlands   (dusty, reddish)
export const BIOME_A = [
  [0x5a9c2c, 0xb89040, 0x686050, 0x1d4a14, 0x1a3a88], // heartland
  [0x8a9430, 0xc8a450, 0x686050, 0x1d4a14, 0x1a3a88], // scrubland — yellower grass
  [0x2e6818, 0x907858, 0x5a5040, 0x163c10, 0x1a3a88], // forest    — dark & mossy
  [0x6a6840, 0xb07038, 0x786858, 0x1d4a14, 0x1a3a88], // badlands  — dusty olive, rusty rock
];
export const BIOME_B = [
  [0x4a8820, 0xa88030, 0x585448, 0x163c10, 0x142e70], // heartland
  [0x7a8428, 0xb89440, 0x585040, 0x163c10, 0x142e70], // scrubland
  [0x1e5010, 0x806848, 0x4a4438, 0x0e3208, 0x142e70], // forest
  [0x5a5838, 0xa06030, 0x686048, 0x163c10, 0x142e70], // badlands
];
// Movement speed multiplier per tile type (index = T_* constant)
export const TILE_SPD  = [1.0, 0.75, 0.6, 0.65, 0.0];

// Road / desire-path layer (stored in roadMap, separate from terrain)
export const ROAD_NONE   = 0;  // no road
export const ROAD_DESIRE = 1;  // worn desire path  — ×1.15 speed bonus
export const ROAD_PAVED  = 2;  // player-built road — ×1.45 speed bonus
export const ROAD_SPD    = [1.0, 1.15, 1.45];  // indexed by ROAD_* constant
export const DESIRE_THRESHOLD  = 120;   // traffic count before a desire path appears
export const TRAFFIC_DECAY_PER_DAY = 18; // subtracted from every tile each day transition

// ─── Deer / Hunting Constants ────────────────────────────────────────────────

export const DEER_MAX        = 8;    // max live deer on map at once
export const DEER_MEAT       = 8;    // food units per carcass
export const DEER_HIDE       = 2;    // hides per carcass
export const DEER_FLEE_R     = 3.5 * TILE; // flee when a friendly unit is this close
export const DEER_SPEED      = 52;   // px/s (outpaces workers at 40, slower than archers at 62)
export const DEER_ATK_RANGE  = TILE * 0.9; // melee kill range for hunter workers

// ─── Sheep / Pasture Constants ───────────────────────────────────────────────

export const SHEEP_MAX       = 10;   // max wild sheep on map
export const SHEEP_SPEED     = 38;   // px/s (slow, catchable by workers)
export const SHEEP_FLEE_R    = 2.5 * TILE;
export const SHEEP_TAME_COST = 1;    // food spent to tame one wild sheep
export const SHEEP_WOOL_MS   = 35000;// ms per wool clip per adult sheep in pasture
export const SHEEP_MEAT      = 4;    // food from slaughtering one adult sheep

// ─── Building Definitions ────────────────────────────────────────────────────

export const BLDG = {
  // ── Starting (pre-built, not in toolbar) ──────────────────────────────────
  townhall:   { label: '🏛 Town Hall',    color: 0xaa7733, cost: null, size: 2,
                desc: 'Administrative center and residence of the Archon.',
                capacity: 4,
                stores: { wheat: 40, flour: 20, bread: 10, meat: 10, sausages: 10, olives: 10, stone: 40, wood: 40 }, hidden: true },
  // ── Buildable ─────────────────────────────────────────────────────────────
  // cost = minimum non-substitutable materials; materialQty = flexible (wood OR stone)
  house:      { label: '🏠 House',         color: 0xcc8844, cost: {},               materialQty: 5,  size: 2,
                desc: 'Provides housing for up to 6 citizens.',
                capacity: 6, spawnMs: 200000 },
  granary:    { label: '🌾 Granary',       color: 0xcc9933, cost: {},               materialQty: 10,  size: 2,
                desc: 'Stores large quantities of food and grain.',
                stores: { wheat: 80, flour: 40, bread: 30, meat: 40, sausages: 20, olives: 40 } },
  woodshed:   { label: '🪵 Woodshed',      color: 0x7a5030, cost: {},               materialQty: 6,  size: 2, outdoor: true,
                desc: 'Storage for wood and sticks.',
                stores: { wood: 60, sticks: 80 } },
  stonepile:  { label: '🧱 Stone Pile',    color: 0x888878, cost: { stone: 5 },                      size: 2, outdoor: true,
                desc: 'Storage for stone chunks and stones.',
                stores: { stone: 50, stones: 80 } },
  farm:       { label: '🚜 Farm',          color: 0x5a9a28, cost: {},               materialQty: 5,  size: 2, outdoor: true, stockMax: 32,
                desc: 'Produces wheat. Requires a farmer to harvest.' },
  garden:     { label: '🌻 Garden',        color: 0x448833, cost: {},               materialQty: 6,  size: 2, outdoor: true, stockMax: 20,
                desc: 'Grows olives for food and oil.',
                stores: { olives: 30 } },
  barracks:   { label: '⚔ Barracks',      color: 0x8a6848, cost: { stone: 2 },     materialQty: 6,  size: 2, spawnMs: 18000,
                desc: 'Trains and houses melee infantry.' },
  archery:    { label: '🏹 Archery Range', color: 0x2a7a4a, cost: { stone: 2 },     materialQty: 6,  size: 2, outdoor: true, spawnMs: 16000,
                desc: 'Trains and houses ranged units.' },
  stable:     { label: '🐎 Stable',        color: 0x7a5522, cost: {},               materialQty: 9,  size: 2, spawnMs: 22000,
                desc: 'Trains and houses cavalry units.' },
  tannery:    { label: '👞 Tannery',       color: 0x8a5530, cost: {},               materialQty: 7,  size: 2,
                desc: 'Processes hides into leather and kits.',
                stores: { hide: 30, leather: 30, leatherKit: 10 } },
  mine:       { label: '⛏ Mine',           color: 0x666655, cost: { stone: 3 },     materialQty: 4,  size: 2,
                desc: 'Extracts metal ore from the earth.',
                stores: { ore: 30 } },
  smelter:    { label: '🔥 Smelter',       color: 0xaa5522, cost: { stone: 6 },     materialQty: 3,  size: 2,
                desc: 'Smelts raw ore into bronze ingots.',
                stores: { ingot: 20 } },
  blacksmith: { label: '🔨 Blacksmith',    color: 0x555566, cost: { stone: 2 },     materialQty: 6,  size: 2,
                desc: 'Forges bronze kits for advanced units.',
                stores: { bronzeKit: 10 } },
  mill:       { label: '⚙ Mill',           color: 0xaa9955, cost: { stone: 5 },     materialQty: 5,  size: 2,
                desc: 'Grinds wheat into flour.',
                stores: { wheat: 40, flour: 30 } },
  bakery:     { label: '🍞 Bakery',        color: 0xcc9944, cost: { stone: 3 },     materialQty: 5,  size: 2,
                desc: 'Bakes flour into nutritious bread.',
                stores: { flour: 20, bread: 20 } },
  butcher:    { label: '🥩 Butcher',       color: 0xaa4433, cost: {},               materialQty: 5,  size: 2,
                desc: 'Processes raw meat into cuts and sausages.',
                stores: { meat: 40, sausages: 20, hide: 20 } },
  olive_press:{ label: '🫒 Olive Press',   color: 0x667733, cost: { stone: 3 },     materialQty: 5,  size: 2,
                desc: 'Presses olives into food.',
                stores: { olives: 40 } },
  temple:     { label: '🕯 Temple',        color: 0xddaa44, cost: { stone: 6 },     materialQty: 6,  size: 2,
                desc: 'A place of worship for the gods.' },
  oracle:     { label: '🔮 Oracle',        color: 0x8866aa, cost: { stone: 3 },     materialQty: 6,  size: 2,
                desc: 'Provides foresight and wisdom.' },
  palisade:   { label: '🪵 Palisade',      color: 0x8a6030, cost: { wood: 2 },                       size: 1, outdoor: true,
                desc: 'A basic wooden defensive wall.' },
  watchtower: { label: '🗼 Watchtower',    color: 0x7a7060, cost: { stone: 3 },     materialQty: 5,  size: 1, outdoor: true,
                desc: 'Provides vision and a platform for archers.',
                fogRadius: 6, atkRange: 5 * TILE, garrisonRanged: 2, garrisonMelee: 2 },
  gate:       { label: '🚪 Gate',          color: 0xa08858, cost: { stone: 1 },     materialQty: 3,  size: 1, outdoor: true,
                desc: 'Allows friendly units to pass through walls.' },
  wall:       { label: '🧱 Wall',          color: 0x9a9888, cost: { stone: 2 },                      size: 1, outdoor: true,
                desc: 'A sturdy stone defensive fortification.' },
  carpenter:  { label: '🪚 Carpenter',     color: 0x9a6030, cost: { stone: 1 },     materialQty: 7,  size: 2,
                desc: 'Processes wood into planks and appliances.',
                stores: { planks: 40 } },
  masons:     { label: '🪨 Masons',        color: 0x7a7060, cost: { stone: 4 },     materialQty: 5,  size: 2,
                desc: 'Processes stone into blocks and appliances.',
                stores: { stoneBlocks: 30 } },
  pasture:    { label: '🐑 Pasture',       color: 0x66aa44, cost: {},               materialQty: 8,  size: 3, outdoor: true,
                desc: 'Houses sheep for wool production.',
                sheepCap: 10, stores: { wool: 30 } },
  warehouse:  { label: '📦 Warehouse',     color: 0x554433, cost: { stone: 3 },     materialQty: 10, size: 3,
                desc: 'Massive storage for industrial materials.',
                stores: { leather: 50, wool: 50, ore: 50, ingot: 50, bronzeKit: 20, planks: 40, stoneBlocks: 30 } },
};

// Compute the actual build cost for a type given the player's material choice ('wood' or 'stone')
export function computeBuildCost(type, material = 'wood') {
    const def = BLDG[type];
    if (!def) return {};
    if (!def.materialQty) return def.cost ?? {};   // fixed cost, no substitution
    const base = { ...(def.cost ?? {}) };
    base[material] = (base[material] ?? 0) + def.materialQty;
    return base;
}

export const BUILD_WORK = { house: 14, granary: 14, woodshed: 12, stonepile: 8, farm: 16, garden: 12, barracks: 22, archery: 18, stable: 24, palisade: 4, watchtower: 14, gate: 8, wall: 6, tannery: 18, mine: 20, smelter: 24, blacksmith: 22, mill: 16, bakery: 14, butcher: 12, olive_press: 16, temple: 24, oracle: 18, pasture: 15, warehouse: 20, carpenter: 18, masons: 20 };

// ─── Nutrition scores (daily need = 1.0) ─────────────────────────────────────
// fireMeal accumulates u.dailyNutrition; checked at night for HP effects
export const NUTRITION = {
    wheat:    0.3,   // raw grain — edible but unsatisfying
    flour:    0.5,   // ground meal / pasta
    bread:    1.0,   // baked loaf — full day's nutrition
    meat:     0.3,   // raw carcass — barely processed
    cuts:     0.5,   // butcher's cuts — like flour
    sausages: 1.0,   // cured sausages — full day's nutrition
    olives:   0.4,   // gathered / pressed
};

// ─── Day/Night Cycle Constants ──────────────────────────────────────────────

export const DAY_DURATION    = 90000;   // 90s day
export const NIGHT_DURATION  = 90000;   // 90s night
export const WIN_NIGHTS      = 20;    // number of nights to survive to win

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

export const UDEF = {
  worker:    { hp: 10, atk: 1, speed: 40, range: 0, color: 0xccccaa, vetLevels: false },
  clubman:   { hp: 16, atk: 4, speed: 40, range: 24, color: 0x886644 },
  archer:    { hp: 12, atk: 5, speed: 62, range: 120, color: 0x558866 },
  spearman:  { hp: 18, atk: 5, speed: 38, range: 28, color: 0x6688cc },
  cavalry:   { hp: 25, atk: 7, speed: 80, range: 36, color: 0xaa8833 },
  slinger:   { hp: 14, atk: 4, speed: 50, range: 100, color: 0x775599 },
  peltast:   { hp: 20, atk: 6, speed: 42, range: 30, color: 0xcc8844 },
  hoplite:   { hp: 25, atk: 8, speed: 40, range: 32, color: 0xddaa44 },
  toxotes:   { hp: 18, atk: 7, speed: 65, range: 140, color: 0xddaa44 },
  scout:     { hp: 10, atk: 1, speed: 70, range: 0, color: 0x336655, isScout: true, vetLevels: false },
  berserker: { hp: 30, atk: 10, speed: 50, range: 36, color: 0xbb5533 },
};

// ─── Resource Node Definitions ───────────────────────────────────────────────

export const NODE_DEF = {
  tree: { resource: 'wood', stock: 10 },
  berry_bush: { resource: 'wheat', stock: 8 },
  small_tree: { resource: 'wood', stock: 10 },
  large_tree: { resource: 'wood', stock: 18 },
  small_boulder: { resource: 'stone', stock: 12 },
  large_boulder: { resource: 'stone', stock: 24 },
  wild_garden: { resource: 'olives', stock: 10 },
  olive_grove: { resource: 'olives', stock: 12 },
  scrub: { resource: 'wool', stock: 4, large: true }, // Placeholder for 'scrub' node
  ore_vein: { resource: 'ore', stock: 20, large: true },
};

export const NODE_ROLE = {
  tree: 'woodcutter', berry_bush: 'forager', small_tree: 'woodcutter', large_tree: 'woodcutter',
  small_boulder: 'miner', large_boulder: 'miner', wild_garden: 'forager', olive_grove: 'forager',
  scrub: 'shepherd', ore_vein: 'miner'
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

// ─── Building Categories (for UI) ────────────────────────────────────────────

export const BLDG_CATS = {
  Economy: ['house', 'farm', 'garden', 'granary', 'woodshed', 'stonepile', 'carpenter', 'masons', 'tannery', 'mine', 'smelter', 'blacksmith', 'mill', 'bakery', 'butcher', 'olive_press', 'pasture', 'warehouse'],
  Military: ['barracks', 'archery', 'stable', 'watchtower', 'wall', 'palisade', 'gate'],
  Culture: ['temple', 'oracle'],
};

// ─── Secondary material conversions ──────────────────────────────────────────
// Two tiers per material:
//   wood (logs)  — gathered from trees, 3 logs → 4 planks at carpenter
//   sticks       — debris around trees, 3 sticks → 1 plank; also used for arrows
//   stone (chunks) — quarried from boulders, 1 chunk → 4 stoneBlocks at masons
//   stones       — debris around boulders, 3 stones → 1 stoneBlock; slinger ammo
export const RAW_CONVERSION = {
  planks:      { input: 'sticks', inAmt: 3, outAmt: 1 },
  stoneBlocks: { input: 'stones', inAmt: 3, outAmt: 1 },
};

// ─── Appliance Definitions (M5) ──────────────────────────────────────────────
// source: workshop that crafts it
// skillReq: minimum skill level to desire/self-craft
// costWorkshop: via workshop (uses planks/stoneBlocks)
// costRaw: primitive at-home route (uses sticks/stones, 3:1 ratio baked in)
export const APPLIANCE_DEF = {
  workbench: { label: 'Workbench', source: 'carpenter', skillReq: { woodcutting: 5 },
               costWorkshop: { planks: 6 },       costRaw: { sticks: 18 } },
  loom:      { label: 'Loom',      source: 'carpenter', skillReq: { woodcutting: 5 },
               costWorkshop: { planks: 4 },       costRaw: { sticks: 12 } },
  millstone: { label: 'Millstone', source: 'masons',    skillReq: { masonry: 5 },
               costWorkshop: { stoneBlocks: 6 },  costRaw: { stones: 18 } },
  hearth:    { label: 'Hearth',    source: 'masons',    skillReq: { masonry: 5 },
               costWorkshop: { stoneBlocks: 4 },  costRaw: { stones: 12 } },
  anvil:     { label: 'Anvil',     source: 'blacksmith', skillReq: { forge: 5 },
               costWorkshop: { ingot: 3 },        costRaw: { ingot: 3 } },
};

// ─── Formation Types (for UI) ────────────────────────────────────────────────

export const FM_TYPES = ['phalanx', 'wedge', 'screen'];
export const FM_LABELS = ['Phalanx', 'Wedge', 'Screen'];

// ─────────────────────────────────────────────────────────────────────────────