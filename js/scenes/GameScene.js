// ─── Constants ───────────────────────────────────────────────────────────────

const TILE      = 32;
const MAP_OY    = 52;   // topbar height; map starts here

// World (fixed large grid — camera scrolls over it)
const WORLD_W   = 80;
const WORLD_H   = 128;
const MAP_W     = WORLD_W;       // alias used throughout
const MAP_H     = WORLD_H;
const MAP_BOTTOM = MAP_OY + MAP_H * TILE;   // world pixel height

// Screen / viewport — canvas size, used for UI layout
const SCREEN_W  = window.innerWidth;
const SCREEN_H  = window.innerHeight;

const T_GRASS = 0, T_SAND = 1, T_ROCK = 2, T_FOREST = 3, T_WATER = 4;
// Fallback tile colours (used when biomeData not yet available)
const TILE_A  = [0x5a8c28, 0xc0984c, 0x706050, 0x1d4a14, 0x1a3a88];
const TILE_B  = [0x4a7820, 0xb08840, 0x60544a, 0x163c10, 0x142e70];

// Per-biome tile colours — [biome 0..3][terrain T_GRASS..T_WATER]
//   Biome 0 = Heartland  (lush, fertile)
//   Biome 1 = Scrubland  (dry, yellowy)
//   Biome 2 = Forest     (dense, dark)
//   Biome 3 = Badlands   (dusty, reddish)
const BIOME_A = [
  [0x5a9c2c, 0xb89040, 0x686050, 0x1d4a14, 0x1a3a88], // heartland
  [0x8a9430, 0xc8a450, 0x686050, 0x1d4a14, 0x1a3a88], // scrubland — yellower grass
  [0x2e6818, 0x907858, 0x5a5040, 0x163c10, 0x1a3a88], // forest    — dark & mossy
  [0x6a6840, 0xb07038, 0x786858, 0x1d4a14, 0x1a3a88], // badlands  — dusty olive, rusty rock
];
const BIOME_B = [
  [0x4a8820, 0xa88030, 0x585448, 0x163c10, 0x142e70], // heartland
  [0x7a8428, 0xb89440, 0x585040, 0x163c10, 0x142e70], // scrubland
  [0x1e5010, 0x806848, 0x4a4438, 0x0e3208, 0x142e70], // forest
  [0x5a5838, 0xa06030, 0x686048, 0x163c10, 0x142e70], // badlands
];
// Movement speed multiplier per tile type (index = T_* constant)
const TILE_SPD  = [1.0, 0.75, 0.6, 0.65, 0.0];

// Road / desire-path layer (stored in roadMap, separate from terrain)
const ROAD_NONE   = 0;  // no road
const ROAD_DESIRE = 1;  // worn desire path  — ×1.15 speed bonus
const ROAD_PAVED  = 2;  // player-built road — ×1.45 speed bonus
const ROAD_SPD    = [1.0, 1.15, 1.45];  // indexed by ROAD_* constant
const DESIRE_THRESHOLD  = 120;   // traffic count before a desire path appears
const TRAFFIC_DECAY_PER_DAY = 18; // subtracted from every tile each day transition

// Deer / hunting
const DEER_MAX        = 8;    // max live deer on map at once
const DEER_MEAT       = 8;    // food units per carcass
const DEER_FLEE_R     = 3.5 * TILE; // flee when a friendly unit is this close
const DEER_SPEED      = 52;   // px/s (outpaces workers at 40, slower than archers at 62)
const DEER_ATK_RANGE  = TILE * 0.9; // melee kill range for hunter workers

// Sheep / pasture
const SHEEP_MAX       = 10;   // max wild sheep on map
const SHEEP_SPEED     = 38;   // px/s (slow, catchable by workers)
const SHEEP_FLEE_R    = 2.5 * TILE;
const SHEEP_TAME_COST = 1;    // food spent to tame one wild sheep
const SHEEP_WOOL_MS   = 35000;// ms per wool clip per adult sheep in pasture
const SHEEP_MEAT      = 4;    // food from slaughtering one adult sheep

const BLDG = {
  // ── Starting (pre-built, not in toolbar) ──────────────────────────────────
  townhall: { label: 'Town Hall', color: 0xaa7733, cost: null, size: 2,
              capacity: 6, spawnMs: 22000, stores: { food: 25, stone: 25, wood: 25 }, hidden: true },
  // ── Buildable ─────────────────────────────────────────────────────────────
  house:    { label: 'House',     color: 0xcc8844, cost: { stone: 3 },          size: 1,
              capacity: 4, spawnMs: 20000 },
  granary:  { label: 'Granary',   color: 0xcc9933, cost: { stone: 4, wood: 3 }, size: 2,
              stores: { food: 60 } },
  woodshed: { label: 'Wood Shed', color: 0x7a5030, cost: { stone: 3, wood: 4 }, size: 2,
              stores: { wood: 60 } },
  stonepile:{ label: 'Stone Pile',color: 0x888878, cost: { stone: 3 },          size: 2,
              stores: { stone: 50 } },
  farm:     { label: 'Field',     color: 0x5a9a28, cost: { stone: 4, wood: 2 }, size: 2, stockMax: 32 },
  barracks: { label: 'Barracks',  color: 0x8a6848, cost: { stone: 6, wood: 4 }, size: 2, spawnMs: 18000 },
  archery:  { label: 'Archery',   color: 0x2a7a4a, cost: { stone: 5, wood: 3 }, size: 2, spawnMs: 16000 },
  wall:     { label: 'Wall',      color: 0x9a9888, cost: { stone: 2 },          size: 1 },
  pasture:  { label: 'Pasture',   color: 0x66aa44, cost: { stone: 3, wood: 6 },  size: 3,
              sheepCap: 10, stores: { wool: 30 } },
};

const BUILD_WORK = { house: 10, granary: 14, woodshed: 12, stonepile: 8, farm: 16, barracks: 22, archery: 18, wall: 6 };

const DAY_DURATION    = 90000;   // 90s day — larger world needs more management time
const NIGHT_DURATION  = 90000;   // 90s night — enemies travel further
const WAVE_SPAWN_Y    = Math.floor(MAP_H * 0.04);  // ~row 5 from top — enemies march south

const UDEF = {
  hoplite:   { hp: 4, atk: 1, speed: 55, color: 0x3a6acc, range: 34 },
  archer:    { hp: 2, atk: 1, speed: 62, color: 0x44aa77, range: 90 },
  worker:    { hp: 2, atk: 0, speed: 40, color: 0xaa8844, gatherRange: 52, gatherRate: 2800 },
  raider:    { hp: 3, atk: 1, speed: 68, color: 0xcc3a2a, range: 32 },
  berserker: { hp: 5, atk: 2, speed: 82, color: 0xdd5522, range: 32 },
  veteran:   { hp: 8, atk: 2, speed: 38, color: 0x885533, range: 32 },
};

// Resource node types
const NODE_DEF = {
  berry_bush:    { resource: 'food',  stock: 14, large: false },
  small_boulder: { resource: 'stone', stock: 10, large: false },
  large_boulder: { resource: 'stone', stock: 24, large: true  },
  small_tree:    { resource: 'wood',  stock: 8,  large: false },
  large_tree:    { resource: 'wood',  stock: 20, large: true  },
};

// Role each node type assigns
const NODE_ROLE = {
  berry_bush: 'forager', small_boulder: 'miner', large_boulder: 'miner',
  small_tree: 'woodcutter', large_tree: 'woodcutter',
};

const NIGHT_START = 10;  // first night (enemies attack)
const WIN_NIGHTS  = 3;   // survive this many nights to win

// Night compositions indexed from night 1 (day NIGHT_START)
const WAVES = [
  { raider: 6 },
  { raider: 7, berserker: 3 },
  { raider: 6, berserker: 5, veteran: 2 },
  { raider: 5, berserker: 6, veteran: 4 },
  { raider: 4, berserker: 6, veteran: 6 },
];
const FM_TYPES  = ['phalanx', 'wedge', 'screen'];
const FM_LABELS = ['| LINE', '▲ WEDGE', '≈ SCREEN'];
const TAP_DIST  = 14;

// ─── Noise ────────────────────────────────────────────────────────────────────
// Smooth 2D value noise — deterministic, no dependencies.
function _valueNoise(x, y) {
  const hash = (ix, iy) => {
    let h = (ix * 1619 + iy * 31337 + 5003) | 0;
    h = (Math.imul(h ^ (h >>> 16), 0x45d9f3b)) | 0;
    h = (Math.imul(h ^ (h >>> 16), 0x45d9f3b)) | 0;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const s  = t => t * t * (3 - 2 * t);
  const sx = s(fx), sy = s(fy);
  return hash(ix,iy)*(1-sx)*(1-sy) + hash(ix+1,iy)*sx*(1-sy)
       + hash(ix,iy+1)*(1-sx)*sy   + hash(ix+1,iy+1)*sx*sy;
}

// ─── Scene ────────────────────────────────────────────────────────────────────

class GameScene extends Phaser.Scene {
  constructor() { super({ key: 'GameScene' }); }

  init() {
    this.mapData    = [];   // occupancy grid: 0=free, 98=wall, 99=building
    this.terrainData = [];  // permanent terrain type (T_GRASS … T_WATER), never changes after gen
    this.biomeData  = [];   // biome index (0-3) per tile, stored during generateMap
    this.resNodes  = [];
    this.buildings = [];
    this.units     = [];
    this.selIds    = new Set();
    this.resources  = { food: 10, stone: 15, wood: 0, wool: 0 };
    this.storageMax = { food: 0,  stone: 0,  wood: 0, wool: 0 };
    this.enemyRes   = { food: 25, stone: 20, wood: 10 };
    this.day        = 1;
    this.phase      = 'DAY';
    this.nightsSurvived = 0;
    this.bldgType  = null;
    this.fmType    = 'phalanx';
    this.floorPiles = [];
    this.selectedBuilding = null;
    this.visMap      = [];   // fog of war: 0=black, 1=seen/dim, 2=lit
    this._litTiles   = [];   // tiles lit this frame (reset each frame)
    this._minimapTimer = 0;
    this.fordSet     = new Set(); // encoded tile keys (y*MAP_W+x) that are ford crossings
    this.deer        = [];   // wild deer + carcasses
    this._deerRespawn = 0;   // ms until next deer respawn check
    this.sheep       = [];   // wild sheep (tame sheep live in pasture data)
    this._sheepRespawn = 0;
    this.trafficMap  = [];   // cumulative footfall per tile (integer)
    this.roadMap     = [];   // ROAD_NONE / ROAD_DESIRE / ROAD_PAVED per tile
    this.roadGfx     = null; // world-space Graphics for road overlay
    this.roadMode    = false;// true while the road-paint tool is active
    this._roadsDirty = false;// set true when roadMap changes; redrawn once per frame
    this.timerMs   = DAY_DURATION;
    this.nextId    = 1;
    this.fmGfx = null; this.hoverGfx = null; this.dragGfx = null;
    this._fmDragging = false; this._fmDragStart = null;
    this.buildingBtns = {}; this.fmBtns = {};
    this._ptrDownX = 0; this._ptrDownY = 0; this._dragging = false;
    this._barTimer = 0; this._attractTimer = 0;
    this._pinch   = { active: false, dist: 0, mx: 0, my: 0 };
    this._touches = new Map();
  }

  // Tag a world-space object so the fixed UI camera ignores it
  _w(obj) { this.uiCam?.ignore(obj); return obj; }

  create() {
    // ── Camera setup ──────────────────────────────────────────────────────────
    // Main camera: game world (80×128 tiles) — player can zoom & pan
    this.cameras.main.setBounds(0, 0, MAP_W * TILE, MAP_BOTTOM);
    // Start camera centred on the player's starting area (bottom centre)
    this.cameras.main.centerOn((MAP_W / 2) * TILE, MAP_OY + (MAP_H - 6) * TILE);
    // UI camera: screen-locked HUD — no scroll, no zoom
    this.uiCam = this.cameras.add(0, 0, SCREEN_W, SCREEN_H, false, 'ui');

    this.generateMap();
    this._generateRiver();
    this.generateResourceNodes();
    this.drawMap();
    this.roadGfx = this._w(this.add.graphics().setDepth(1)); // sits just above terrain, below buildings
    this.drawResourceNodes();
    this._initFog();
    // Night overlay — covers the screen map area during NIGHT phase (uiCam renders it)
    this.nightOverlay = this.add.rectangle(
      SCREEN_W / 2, MAP_OY + (SCREEN_H - MAP_OY) / 2,
      SCREEN_W, SCREEN_H - MAP_OY,
      0x0a0a2a, 0
    ).setDepth(9);
    this.cameras.main.ignore(this.nightOverlay);
    this.createUI();
    this.setupInput();
    this.spawnStartingState();
    this._recomputeVis();
    this._drawFog();
    this._drawMinimap();
    this.showPhaseMessage(`Day ${this.day} — Gather and build.`, 0xddaa44);
    this.cameras.main.fadeIn(400, 0, 0, 0);
  }

  getId() { return this.nextId++; }

  // ─── Map ──────────────────────────────────────────────────────────────────

  // ── Biome boundaries (noise-displaced y for organic north-south bands) ──────
  // Portrait map: player starts at BOTTOM (south), enemy at TOP (north).
  //   Row 0 = top (enemy / badlands), Row MAP_H-1 = bottom (player / heartland)
  _biomAt(tx, ty) {
    // Three octaves: primary sweep, peninsula-scale features, fine roughness
    const n = (_valueNoise(tx * 0.025, ty * 0.028) - 0.5) * 26   // ±13 primary
            + (_valueNoise(tx * 0.075 + 13.3, ty * 0.08  + 7.1) - 0.5) * 14  // ±7 peninsulas
            + (_valueNoise(tx * 0.170 + 29.7, ty * 0.190 + 41.5) - 0.5) * 6; // ±3 roughness
    const y = ty + n;
    if (y > MAP_H * 0.80) return 0; // heartland  (bottom 20%)
    if (y > MAP_H * 0.56) return 1; // scrubland
    if (y > MAP_H * 0.30) return 2; // forest
    return 3;                        // badlands   (top 30%)
  }

  _genTile(tx, ty, biome) {
    if (biome === undefined) biome = this._biomAt(tx, ty);
    const r  = _valueNoise(tx * 0.26 + 37,  ty * 0.22 + 83);
    const r2 = _valueNoise(tx * 0.31 + 71,  ty * 0.28 + 53); // independent seed for blending

    // Border blending: if the tile to the north is a different biome, bleed its tile
    // type in ~30% of cases to create a soft, organic transition instead of a hard line
    const adjBiome = (ty > 0) ? this._biomAt(tx, ty - 1) : biome;
    const useBiome = (adjBiome !== biome && r2 < 0.30) ? adjBiome : biome;

    switch (useBiome) {
      case 0: return r < 0.07 ? T_SAND   : T_GRASS;  // heartland: fertile
      case 1: return r < 0.38 ? T_SAND   : T_GRASS;  // scrubland: dry
      case 2: return r < 0.20 ? T_ROCK   : T_FOREST; // forest: dense canopy
      case 3: return r < 0.42 ? T_SAND   : T_ROCK;   // badlands: harsh
    }
  }

  generateMap() {
    for (let y = 0; y < MAP_H; y++) {
      this.mapData[y]     = new Array(MAP_W).fill(0);
      this.terrainData[y] = new Array(MAP_W).fill(0);
      this.biomeData[y]   = new Array(MAP_W).fill(0);
      this.trafficMap[y]  = new Array(MAP_W).fill(0);
      this.roadMap[y]     = new Array(MAP_W).fill(ROAD_NONE);
      for (let x = 0; x < MAP_W; x++) {
        const b = this._biomAt(x, y);
        this.biomeData[y][x]   = b;
        this.terrainData[y][x] = this._genTile(x, y, b);
      }
    }
  }

  // ─── River ────────────────────────────────────────────────────────────────
  // Called after generateMap() — carves T_WATER into terrainData.
  // Portrait map: river runs roughly EAST-WEST (horizontal) at ~row 55 from top.
  // Ford crossings are left as T_SAND and recorded in fordSet (passable).
  _generateRiver() {
    this.fordSet.clear();
    const baseY = Math.floor(MAP_H * 0.43); // river center row (~55 from top)

    // Three ford columns: left-quarter, centre, right-third
    const fordCols = [
      Math.floor(MAP_W * 0.20),
      Math.floor(MAP_W * 0.52),
      Math.floor(MAP_W * 0.78),
    ];

    for (let x = 0; x < MAP_W; x++) {
      // Vertical meander — slow noise drift ±8 tiles
      const drift = (_valueNoise(x * 0.055, 42.7) - 0.5) * 16;
      const cy    = Math.round(baseY + drift);

      // Half-width: 1–2 tiles (total width 3–5)
      const hw = 1 + Math.round(_valueNoise(x * 0.10, 88.3));

      // Is this column near a ford crossing?
      const isFord = fordCols.some(fx => Math.abs(x - fx) <= 1);

      for (let dy = -hw; dy <= hw; dy++) {
        const ty = cy + dy;
        if (ty < 0 || ty >= MAP_H) continue;
        if (isFord) {
          this.terrainData[ty][x] = T_SAND;
          this.fordSet.add(ty * MAP_W + x);
        } else {
          this.terrainData[ty][x] = T_WATER;
        }
      }
    }
  }

  generateResourceNodes() {
    // Place `count` nodes of `type` in tiles matching `targetBiome`.
    // `allowed(tx,ty)` is an optional extra gate (e.g. keep clear of start areas).
    // Preferred terrain per type keeps nodes on visually appropriate tiles.
    const terrainOk = {
      berry_bush:    t => t === T_GRASS,
      small_tree:    t => t === T_GRASS || t === T_FOREST,
      large_tree:    t => t === T_FOREST || t === T_GRASS,
      small_boulder: t => t !== T_WATER,
      large_boulder: t => t !== T_WATER,
    };

    const place = (type, targetBiome, count, allowed) => {
      const ok = terrainOk[type] ?? (t => t !== T_WATER);
      let placed = 0;
      for (let attempt = 0; attempt < count * 50 && placed < count; attempt++) {
        const tx = Phaser.Math.Between(1, MAP_W - 2);
        const ty = Phaser.Math.Between(1, MAP_H - 2);
        if ((this.biomeData[ty]?.[tx] ?? -1) !== targetBiome) continue;
        if (!ok(this.terrainData[ty]?.[tx] ?? T_GRASS)) continue;
        if (allowed && !allowed(tx, ty)) continue;
        const wx = tx * TILE + TILE / 2, wy = MAP_OY + ty * TILE + TILE / 2;
        if (this.resNodes.some(n => Phaser.Math.Distance.Between(wx, wy, n.x, n.y) < 56)) continue;
        const def = NODE_DEF[type];
        this.resNodes.push({ id: this.getId(), type, x: wx, y: wy,
          stock: def.stock, maxStock: def.stock, gfx: null, labelObj: null,
          dormantTimer: 0, sapling: false, saplingTimer: 0 });
        placed++;
      }
    };

    const clearOfPlayer = (_tx, ty) => ty < MAP_H - 14; // leave room for player buildings
    const clearOfEnemy  = (_tx, ty) => ty > 14;          // leave room for enemy buildings

    // Heartland (biome 0): food-rich, light stone/wood
    place('berry_bush',    0, 7, clearOfPlayer);
    place('small_tree',    0, 4, clearOfPlayer);
    place('small_boulder', 0, 3, clearOfPlayer);

    // Scrubland (biome 1): stone-heavy, some wood, sparse food
    place('small_boulder', 1, 5);
    place('large_boulder', 1, 3);
    place('small_tree',    1, 3);
    place('berry_bush',    1, 2);

    // Forest (biome 2): wood-rich, some stone
    place('large_tree',    2, 9);
    place('small_tree',    2, 4);
    place('large_boulder', 2, 4);

    // Badlands (biome 3): dense stone for enemy mining
    place('large_boulder', 3, 5, clearOfEnemy);
    place('small_boulder', 3, 3, clearOfEnemy);

    // Scatter stick bundles (floor piles of wood) near every tree node
    // — gives an early wood supply without changing tree rarity
    for (const n of this.resNodes) {
      if (n.type !== 'small_tree' && n.type !== 'large_tree') continue;
      const bundles = n.type === 'large_tree' ? 3 : 2;
      for (let i = 0; i < bundles; i++) {
        const angle  = Math.random() * Math.PI * 2;
        const dist   = TILE * (1.2 + Math.random() * 1.8); // 1–3 tiles away
        const px     = n.x + Math.cos(angle) * dist;
        const py     = n.y + Math.sin(angle) * dist;
        // Clamp to map bounds and skip water
        const tx = Math.floor(px / TILE), ty = Math.floor((py - MAP_OY) / TILE);
        if (tx < 0 || tx >= MAP_W || ty < 0 || ty >= MAP_H) continue;
        if (this.terrainData[ty]?.[tx] === T_WATER) continue;
        // Merge into a nearby pile or create a new one (reuse dropOnFloor)
        this.dropOnFloor(px, py, { wood: n.type === 'large_tree' ? 4 : 2 });
      }
    }
  }

  drawMap() {
    const gfx = this._w(this.add.graphics().setDepth(0));
    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        const t = Math.min(this.terrainData[y][x], TILE_A.length - 1);
        const b = this.biomeData[y]?.[x] ?? 0;
        const colA = (BIOME_A[b] ?? TILE_A)[t] ?? TILE_A[t];
        const colB = (BIOME_B[b] ?? TILE_B)[t] ?? TILE_B[t];
        gfx.fillStyle((x + y) % 2 === 0 ? colA : colB)
          .fillRect(x * TILE, MAP_OY + y * TILE, TILE, TILE);
        // Water: add simple wave detail
        if (t === T_WATER) {
          gfx.fillStyle(0x4488cc, 0.28)
            .fillRect(x*TILE+2, MAP_OY+y*TILE+5,  TILE-4, 3)
            .fillRect(x*TILE+4, MAP_OY+y*TILE+17, TILE-8, 3);
        }
      }
    }
    // Ford crossings — blue-tinted shimmer over sand tiles to mark shallow water
    if (this.fordSet.size > 0) {
      gfx.fillStyle(0x3388cc, 0.35);
      for (const key of this.fordSet) {
        const fx = key % MAP_W, fy = Math.floor(key / MAP_W);
        gfx.fillRect(fx * TILE, MAP_OY + fy * TILE, TILE, TILE);
      }
      // Ripple lines across each ford tile row
      gfx.fillStyle(0x66aaee, 0.22);
      for (const key of this.fordSet) {
        const fx = key % MAP_W, fy = Math.floor(key / MAP_W);
        gfx.fillRect(fx*TILE+3,  MAP_OY+fy*TILE+7,  TILE-6, 2);
        gfx.fillRect(fx*TILE+5,  MAP_OY+fy*TILE+18, TILE-10, 2);
        gfx.fillRect(fx*TILE+2,  MAP_OY+fy*TILE+26, TILE-4, 2);
      }
    }
    // Subtle grid
    gfx.lineStyle(1, 0x000000, 0.04);
    for (let x = 0; x <= MAP_W; x++) gfx.lineBetween(x*TILE, MAP_OY, x*TILE, MAP_BOTTOM);
    for (let y = 0; y <= MAP_H; y++) gfx.lineBetween(0, MAP_OY+y*TILE, MAP_W*TILE, MAP_OY+y*TILE);
  }

  drawResourceNodes() { this.resNodes.forEach(n => this.redrawNode(n)); }

  // ─── Fog of war ───────────────────────────────────────────────────────────

  _initFog() {
    for (let y = 0; y < MAP_H; y++)
      this.visMap[y] = new Array(MAP_W).fill(0); // all black
    this.fogGfx = this._w(this.add.graphics().setDepth(8));
  }

  _recomputeVis() {
    // Demote last frame's lit tiles back to "seen" (1)
    for (const [tx, ty] of this._litTiles) {
      if (this.visMap[ty]?.[tx] === 2) this.visMap[ty][tx] = 1;
    }
    this._litTiles = [];

    // Helper: paint a circle of tiles at a given state (only upgrades, never downgrades)
    const paintCircle = (cx, cy, r, state) => {
      const r2 = r * r;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (dx*dx + dy*dy > r2) continue;
          const nx = cx+dx, ny = cy+dy;
          if (nx < 0 || nx >= MAP_W || ny < 0 || ny >= MAP_H) continue;
          if ((this.visMap[ny][nx] ?? 0) < state) {
            this.visMap[ny][nx] = state;
            if (state === 2) this._litTiles.push([nx, ny]);
          }
        }
      }
    };

    // Units: clear inner circle (state 2) + dim outer ring (state 1)
    //   workers: clear=3, dim out to 6
    //   all others: clear=5, dim out to 10
    for (const u of this.units) {
      if (u.isEnemy || u.hp <= 0) continue;
      const clearR = u.type === 'worker' ? 3 : 5;
      const dimR   = clearR * 2;
      const cx = Math.floor(u.x / TILE);
      const cy = Math.floor((u.y - MAP_OY) / TILE);
      paintCircle(cx, cy, dimR,   1); // dim outer ring first (lower state)
      paintCircle(cx, cy, clearR, 2); // then overwrite inner with lit
    }

    // Buildings: clear radius = 10 (≈ 2× soldier inner radius), no dim ring
    for (const b of this.buildings) {
      if (!b.built || b.faction === 'enemy') continue;
      const cx = Math.floor((b.tx + b.size / 2));
      const cy = Math.floor((b.ty + b.size / 2));
      paintCircle(cx, cy, 10, 2);
    }
  }

  _drawFog() {
    const gfx = this.fogGfx;
    gfx.clear();
    // Draw all tiles — no viewport culling.
    // Phaser batches same-fillStyle rects into very few draw calls,
    // so 128×80 tiles is fine. Viewport culling caused the fog to
    // disappear at some zoom levels because the Graphics object's
    // internal bounding box shrank to the culled region and got
    // camera-culled when zoomed out.
    gfx.fillStyle(0x000000, 0.97);
    for (let y = 0; y < MAP_H; y++)
      for (let x = 0; x < MAP_W; x++)
        if ((this.visMap[y]?.[x] ?? 0) === 0)
          gfx.fillRect(x * TILE, MAP_OY + y * TILE, TILE, TILE);
    gfx.fillStyle(0x000000, 0.52);
    for (let y = 0; y < MAP_H; y++)
      for (let x = 0; x < MAP_W; x++)
        if ((this.visMap[y]?.[x] ?? 0) === 1)
          gfx.fillRect(x * TILE, MAP_OY + y * TILE, TILE, TILE);
  }

  // ─── Minimap ──────────────────────────────────────────────────────────────

  _drawMinimap() {
    const gfx = this.minimapGfx;
    if (!gfx) return;
    gfx.clear();
    const { _mmX: mx, _mmY: my, _mmW: mw, _mmH: mh } = this;

    // Background
    gfx.fillStyle(0x050c05, 1).fillRect(mx - 1, my - 1, mw + 2, mh + 2);

    // Tile width/height on minimap (sub-pixel; use ceil to avoid gaps)
    const tw = Math.ceil(mw / MAP_W), th = Math.ceil(mh / MAP_H);

    // ── Terrain + fog grouped by fillStyle for batching ──────────────────
    // Build buckets: key = color|alpha string → array of {x,y}
    const buckets = new Map();
    const addBucket = (col, alpha, x, y) => {
      const k = col * 1000 + Math.round(alpha * 100);
      if (!buckets.has(k)) buckets.set(k, { col, alpha, tiles: [] });
      buckets.get(k).tiles.push(x, y); // flat pairs
    };

    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        const vis = this.visMap[y]?.[x] ?? 0;
        if (vis === 0) {
          addBucket(0x000000, 1.0, x, y);
        } else {
          const t   = Math.min(this.terrainData[y][x], TILE_A.length - 1);
          const b   = this.biomeData[y]?.[x] ?? 0;
          // Ford tiles appear as blue on minimap (not tan) so the river reads continuous
          const col = this.fordSet?.has(y * MAP_W + x) ? 0x2266aa
                    : ((BIOME_A[b] ?? TILE_A)[t] ?? TILE_A[t]);
          addBucket(col, vis === 1 ? 0.38 : 1.0, x, y);
        }
      }
    }
    for (const { col, alpha, tiles } of buckets.values()) {
      gfx.fillStyle(col, alpha);
      for (let i = 0; i < tiles.length; i += 2) {
        const px = mx + (tiles[i]   / MAP_W) * mw;
        const py = my + (tiles[i+1] / MAP_H) * mh;
        gfx.fillRect(px, py, tw, th);
      }
    }

    // ── Buildings ─────────────────────────────────────────────────────────
    for (const b of this.buildings) {
      const vis = this.visMap[b.ty]?.[b.tx] ?? 0;
      if (vis === 0) continue;
      const px = mx + (b.tx / MAP_W) * mw;
      const py = my + (b.ty / MAP_H) * mh;
      const col = b.faction === 'enemy' ? 0xdd3322 : BLDG[b.type].color;
      gfx.fillStyle(col, vis === 2 ? 1.0 : 0.5)
        .fillRect(px, py, Math.max(2, b.size * tw), Math.max(2, b.size * th));
    }

    // ── Units ─────────────────────────────────────────────────────────────
    for (const u of this.units) {
      if (u.hp <= 0) continue;
      const ux = Math.floor(u.x / TILE), uy = Math.floor((u.y - MAP_OY) / TILE);
      if (ux < 0 || ux >= MAP_W || uy < 0 || uy >= MAP_H) continue;
      if (u.isEnemy && (this.visMap[uy]?.[ux] ?? 0) < 2) continue;
      const px = mx + (u.x / (MAP_W * TILE)) * mw;
      const py = my + ((u.y - MAP_OY) / (MAP_H * TILE)) * mh;
      const col = u.isEnemy ? 0xee3311
                : u.type === 'worker' ? 0xddaa33 : 0x4499ee;
      gfx.fillStyle(col).fillRect(px - 1, py - 1, 3, 3);
    }

    // ── Camera viewport rect ───────────────────────────────────────────────
    const cam = this.cameras.main;
    const vx = mx + (cam.scrollX / (MAP_W * TILE)) * mw;
    const vy = my + (Math.max(0, cam.scrollY - MAP_OY) / (MAP_H * TILE)) * mh;
    const vw = (SCREEN_W / cam.zoom / (MAP_W * TILE)) * mw;
    const vh = (SCREEN_H / cam.zoom / (MAP_H * TILE)) * mh;
    gfx.lineStyle(1, 0xffffff, 0.55).strokeRect(vx, vy, vw, vh);

    // Border
    gfx.lineStyle(1, 0xc8a030, 0.55).strokeRect(mx - 1, my - 1, mw + 2, mh + 2);
  }

  // Draw the graphic body for each node type, centered at (0, 0)
  _drawNodeBody(gfx, n, alpha) {
    const type = n.type;
    if (type === 'berry_bush') {
      gfx.fillStyle(0x338818, alpha).fillCircle(-5, 2, 9);
      gfx.fillStyle(0x44aa22, alpha).fillCircle(4, 1, 10);
      gfx.fillStyle(0x55bb33, alpha).fillCircle(-1, -4, 8);
      // Berries
      const bc = 0xcc2244;
      [[-3,-2],[3,1],[0,3],[-5,4],[5,-2]].forEach(([bx,by]) =>
        gfx.fillStyle(bc, Math.min(1, alpha + 0.2)).fillCircle(bx, by, 2.5));
    } else if (type === 'small_boulder') {
      gfx.fillStyle(0x887766, alpha).fillEllipse(2, 3, 28, 19);
      gfx.fillStyle(0x9a8877, alpha).fillEllipse(-3, -1, 14, 9);
      gfx.lineStyle(1, 0x665544, alpha * 0.5).lineBetween(-2, 1, 4, 8);
    } else if (type === 'large_boulder') {
      gfx.fillStyle(0x776655, alpha).fillEllipse(2, 4, 44, 30);
      gfx.fillStyle(0x887766, alpha).fillEllipse(-6, -3, 22, 14);
      gfx.fillStyle(0x665544, alpha).fillEllipse(8, 6, 14, 10);
      gfx.lineStyle(1, 0x554433, alpha * 0.6)
        .lineBetween(-8, 2, -2, 12).lineBetween(4, -4, 10, 6);
    } else if (type === 'small_tree') {
      gfx.fillStyle(0x6a4422, alpha).fillRect(-3, 7, 6, 13);
      gfx.fillStyle(0x1a5a12, alpha).fillCircle(0, -1, 14);
      gfx.fillStyle(0x2a7a1e, alpha).fillCircle(-5, 3, 10);
      gfx.fillStyle(0x2a7a1e, alpha).fillCircle(5, 3, 10);
      gfx.fillStyle(0x338a28, alpha).fillCircle(0, -5, 10);
    } else if (type === 'large_tree') {
      gfx.fillStyle(0x5a3318, alpha).fillRect(-5, 10, 10, 18);
      gfx.fillStyle(0x144a0e, alpha).fillCircle(0, -5, 22);
      gfx.fillStyle(0x1a6a12, alpha).fillCircle(-8, 4, 16);
      gfx.fillStyle(0x1a6a12, alpha).fillCircle(8, 4, 16);
      gfx.fillStyle(0x2a8020, alpha).fillCircle(0, -10, 16);
      gfx.fillStyle(0x338a28, alpha).fillCircle(0, -3, 12);
    }
  }

  redrawNode(n) {
    n.gfx?.destroy(); n.labelObj?.destroy();
    n.gfx = null; n.labelObj = null;

    // Dormant berry bush — faded bare shrub, no berries
    if (n.type === 'berry_bush' && n.dormantTimer > 0) {
      n.gfx = this._w(this.add.graphics().setDepth(2)).setPosition(n.x, n.y);
      n.gfx.fillStyle(0x3a5520, 0.22).fillCircle(-5, 2, 9);
      n.gfx.fillStyle(0x4a6630, 0.22).fillCircle(4, 1, 10);
      n.gfx.fillStyle(0x3a5520, 0.22).fillCircle(-1, -4, 8);
      return;
    }

    // Sapling — tiny green shoot
    if (n.sapling) {
      n.gfx = this._w(this.add.graphics().setDepth(2)).setPosition(n.x, n.y);
      n.gfx.fillStyle(0x6a4422, 0.85).fillRect(-1, 2, 2, 6);
      n.gfx.fillStyle(0x44bb22, 0.9).fillCircle(0, 0, 4);
      return;
    }

    if (n.stock <= 0) return;

    const def      = NODE_DEF[n.type];
    const ratio    = n.stock / n.maxStock;
    const alpha    = 0.45 + ratio * 0.55;
    const targeted = this.units?.some(u => u.targetNode === n && u.hp > 0);

    n.gfx = this._w(this.add.graphics().setDepth(2));
    n.gfx.setPosition(n.x, n.y);
    this._drawNodeBody(n.gfx, n, alpha);

    // Selection ring if targeted
    if (targeted) {
      const r = def.large ? 24 : 16;
      n.gfx.lineStyle(2, 0xffdd44, 0.9).strokeCircle(0, 0, r);
    }

    // Stock bar beneath
    const bw = def.large ? 38 : 26;
    const by = def.large ? 20 : 14;
    n.gfx.fillStyle(0x000000, 0.55).fillRect(-bw/2, by, bw, 4);
    const barColor = def.resource === 'food' ? 0x88dd44
                   : def.resource === 'stone' ? 0x9999aa : 0xaa7733;
    n.gfx.fillStyle(barColor, 0.9).fillRect(-bw/2, by, bw * ratio, 4);

    // Stock label
    const sym = def.resource === 'food' ? '🌾' : def.resource === 'stone' ? '⛏' : '🪵';
    n.labelObj = this._w(this.add.text(n.x, n.y - (def.large ? 28 : 20), `${sym}${n.stock}`, {
      fontSize: '9px', color: '#ffffff', fontFamily: 'monospace',
      stroke: '#000000', strokeThickness: 2,
    }).setOrigin(0.5).setDepth(3));
  }

  // ─── Tile helpers ─────────────────────────────────────────────────────────

  tileAt(wx, wy) {
    const tx = Math.floor(wx / TILE), ty = Math.floor((wy - MAP_OY) / TILE);
    if (tx < 0 || tx >= MAP_W || ty < 0 || ty >= MAP_H) return null;
    return { tx, ty, type: this.terrainData[ty][tx] };
  }

  isFree(tx, ty, size) {
    for (let dy = 0; dy < size; dy++)
      for (let dx = 0; dx < size; dx++) {
        const nx = tx + dx, ny = ty + dy;
        if (nx < 0 || nx >= MAP_W || ny < 0 || ny >= MAP_H) return false;
        const terr = this.terrainData[ny]?.[nx] ?? 0;
        // Water and bare rock are unbuildable; forest floor can be cleared
        if (terr === T_WATER || terr === T_ROCK) return false;
        // Ford crossings are passable terrain but not buildable (keep fords open)
        if (this.fordSet?.has(ny * MAP_W + nx)) return false;
        // Check occupancy (walls = 98, buildings = 99)
        if ((this.mapData[ny]?.[nx] ?? 0) >= 98) return false;
      }
    return true;
  }

  occupy(tx, ty, size, marker = 99) {
    for (let dy = 0; dy < size; dy++)
      for (let dx = 0; dx < size; dx++)
        this.mapData[ty + dy][tx + dx] = marker;
  }

  unoccupy(tx, ty, size) {
    for (let dy = 0; dy < size; dy++)
      for (let dx = 0; dx < size; dx++)
        this.mapData[ty + dy][tx + dx] = 0;
  }

  isBlocked(wx, wy) {
    const tx = Math.floor(wx / TILE), ty = Math.floor((wy - MAP_OY) / TILE);
    if (tx < 0 || tx >= MAP_W || ty < 0 || ty >= MAP_H) return true;
    if ((this.terrainData[ty]?.[tx] ?? 0) === T_WATER) return true; // water impassable
    return (this.mapData[ty]?.[tx] ?? 0) >= 98; // wall or building
  }

  // ─── Roads & desire paths ─────────────────────────────────────────────────

  // Effective speed multiplier at tile (tx,ty): road layer overrides terrain baseline
  _tileSpd(tx, ty) {
    const road = this.roadMap[ty]?.[tx] ?? ROAD_NONE;
    if (road !== ROAD_NONE) return ROAD_SPD[road];
    const terr = this.terrainData[ty]?.[tx] ?? T_GRASS;
    return TILE_SPD[Math.min(terr, TILE_SPD.length - 1)] ?? 1.0;
  }

  // Lay a paved road on tile (tx,ty). Water and occupied cells are skipped.
  // Costs 1 stone; upgrades a desire path for free (already paid in traffic).
  _paintRoad(tx, ty) {
    if (tx < 0 || tx >= MAP_W || ty < 0 || ty >= MAP_H) return;
    if ((this.terrainData[ty]?.[tx] ?? 0) === T_WATER) return;
    if ((this.mapData[ty]?.[tx] ?? 0) >= 98) return; // wall/building tile
    if ((this.roadMap[ty]?.[tx] ?? 0) === ROAD_PAVED) return; // already paved
    if (!this.afford({ stone: 1 })) return;
    this.spend({ stone: 1 });
    this.roadMap[ty][tx] = ROAD_PAVED;
    this.trafficMap[ty][tx] = DESIRE_THRESHOLD + 1; // reset decay clock
    this._roadsDirty = true;
    this.updateUI();
  }

  // Redraw the road overlay graphics object (world-space, depth 1)
  _redrawRoads() {
    const gfx = this.roadGfx;
    if (!gfx) return;
    gfx.clear();
    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        const r = this.roadMap[y][x];
        if (r === ROAD_NONE) continue;
        if ((this.mapData[y]?.[x] ?? 0) >= 98) continue; // don't draw over buildings
        const px = x * TILE, py = MAP_OY + y * TILE;
        if (r === ROAD_PAVED) {
          // DEBUG: bright blue to confirm paved road rendering
          gfx.fillStyle(0x0000ff, 0.90).fillRect(px, py, TILE, TILE);
        } else {
          // Worn desire path — full-tile dirt overlay so adjacent tiles blend naturally;
          // traffic intensity varies opacity (more worn = more visible)
          const traffic = this.trafficMap[y]?.[x] ?? DESIRE_THRESHOLD;
          const worn = Math.min(1, traffic / (DESIRE_THRESHOLD * 3));
          gfx.fillStyle(0xff0000, 0.22 + worn * 0.22).fillRect(px, py, TILE, TILE);
          gfx.fillStyle(0xff0000, 0.15 + worn * 0.15).fillRect(px + 5, py + 5, TILE - 10, TILE - 10);
        }
      }
    }
  }

  // Called each day: decay traffic, promote/demote desire paths
  _tickRoads() {
    let changed = false;
    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        if (this.roadMap[y][x] === ROAD_PAVED) continue; // paved never decays
        this.trafficMap[y][x] = Math.max(0, this.trafficMap[y][x] - TRAFFIC_DECAY_PER_DAY);
        const was = this.roadMap[y][x];
        this.roadMap[y][x] = this.trafficMap[y][x] >= DESIRE_THRESHOLD ? ROAD_DESIRE : ROAD_NONE;
        if (this.roadMap[y][x] !== was) changed = true;
      }
    }
    if (changed) this._roadsDirty = true;
  }

  // ─── Deer / Hunting ───────────────────────────────────────────────────────

  _spawnDeer(wx, wy) {
    const gender = Math.random() < 0.5 ? 'male' : 'female';
    const d = {
      id: this.getId(),
      x: wx, y: wy,
      gender,
      hp: 3, maxHp: 3,
      speed: DEER_SPEED,
      // Males are slightly larger and flee a bit later
      scale: gender === 'male' ? 1.1 : 1.0,
      fleeR: gender === 'male' ? DEER_FLEE_R - 0.5 * TILE : DEER_FLEE_R,
      isDead: false,
      meatLeft: DEER_MEAT,
      moveTo: null,
      wanderTimer: 0,
      gfx: this._w(this.add.graphics().setDepth(5)),
    };
    this._redrawDeer(d);
    this.deer.push(d);
    return d;
  }

  _redrawDeer(d) {
    const g = d.gfx;
    g.clear().setPosition(d.x, d.y);
    if (d.isDead) {
      // Flat carcass — elongated dark shape
      g.fillStyle(0x5a3010, 0.9).fillEllipse(0, 2, 26, 10);
      // Meat remaining indicator (red bar)
      if (d.meatLeft > 0) {
        const r = d.meatLeft / DEER_MEAT;
        g.fillStyle(0x331010, 0.7).fillRect(-10, -5, 20, 4);
        g.fillStyle(0xdd3311, 0.9).fillRect(-10, -5, 20 * r, 4);
      }
    } else {
      const sc = d.scale ?? 1.0;
      // Shadow
      g.fillStyle(0x000000, 0.12).fillEllipse(0, 10, 22 * sc, 7 * sc);
      // Body
      g.fillStyle(0xb07030).fillEllipse(0, 0, 20 * sc, 13 * sc);
      // Head
      g.fillStyle(0xb07030).fillCircle(11 * sc, -4 * sc, 6 * sc);
      // Antlers on males (two short lines above head)
      if (d.gender === 'male') {
        g.lineStyle(1.5, 0x7a4010, 0.9);
        g.lineBetween(10 * sc, -9 * sc, 8 * sc, -16 * sc);
        g.lineBetween(13 * sc, -9 * sc, 15 * sc, -16 * sc);
      }
      // Ear
      g.fillStyle(0x8a5020).fillEllipse(14 * sc, -9 * sc, 4 * sc, 7 * sc);
      // Eye
      g.fillStyle(0x110800).fillCircle(13 * sc, -5 * sc, 1.5 * sc);
      // Legs (4 lines)
      g.lineStyle(2, 0x8a5020, 0.9);
      g.lineBetween(-6*sc, 5*sc, -7*sc, 14*sc);
      g.lineBetween(-2*sc, 6*sc, -3*sc, 15*sc);
      g.lineBetween( 4*sc, 5*sc,  3*sc, 14*sc);
      g.lineBetween( 8*sc, 4*sc,  9*sc, 13*sc);
    }
  }

  _tickDeer(delta, dt) {
    const friendlies = this.units.filter(u => !u.isEnemy && u.hp > 0);
    for (const d of this.deer) {
      if (d.isDead) continue;

      // Check if any friendly is close enough to trigger flee
      const fleeRadius = d.fleeR ?? DEER_FLEE_R; // males have smaller flee radius
      let fleeFrom = null, fleeD = fleeRadius;
      for (const u of friendlies) {
        const dist = Phaser.Math.Distance.Between(d.x, d.y, u.x, u.y);
        if (dist < fleeD) { fleeD = dist; fleeFrom = u; }
      }

      if (fleeFrom) {
        // Flee directly away from the nearest threat
        const angle = Math.atan2(d.y - fleeFrom.y, d.x - fleeFrom.x);
        const nx = d.x + Math.cos(angle) * d.speed * dt;
        const ny = d.y + Math.sin(angle) * d.speed * dt;
        // Don't flee into water or off-map
        if (!this.isBlocked(nx, ny)) { d.x = nx; d.y = ny; }
        else {
          // Perpendicular escape
          const nx2 = d.x + Math.cos(angle + Math.PI / 2) * d.speed * dt;
          const ny2 = d.y + Math.sin(angle + Math.PI / 2) * d.speed * dt;
          if (!this.isBlocked(nx2, ny2)) { d.x = nx2; d.y = ny2; }
        }
        d.moveTo = null;
        d.wanderTimer = 0;
      } else {
        // Wander — pick a new wander target every 3–6 seconds
        d.wanderTimer -= delta;
        if (!d.moveTo || d.wanderTimer <= 0) {
          const angle = Math.random() * Math.PI * 2;
          const dist  = Phaser.Math.Between(TILE * 2, TILE * 6);
          const tx = d.x + Math.cos(angle) * dist;
          const ty = d.y + Math.sin(angle) * dist;
          // Keep in bounds
          const cx = Phaser.Math.Clamp(tx, TILE, MAP_W * TILE - TILE);
          const cy = Phaser.Math.Clamp(ty, MAP_OY + TILE, MAP_BOTTOM - TILE);
          if (!this.isBlocked(cx, cy)) d.moveTo = { x: cx, y: cy };
          d.wanderTimer = Phaser.Math.Between(3000, 6000);
        }
        if (d.moveTo) {
          const close = Phaser.Math.Distance.Between(d.x, d.y, d.moveTo.x, d.moveTo.y) < 8;
          if (close) { d.moveTo = null; }
          else {
            const a = Math.atan2(d.moveTo.y - d.y, d.moveTo.x - d.x);
            const nx = d.x + Math.cos(a) * d.speed * 0.4 * dt; // slow wander
            const ny = d.y + Math.sin(a) * d.speed * 0.4 * dt;
            if (!this.isBlocked(nx, ny)) { d.x = nx; d.y = ny; }
            else d.moveTo = null;
          }
        }
      }

      // Clamp to map bounds
      d.x = Phaser.Math.Clamp(d.x, TILE, MAP_W * TILE - TILE);
      d.y = Phaser.Math.Clamp(d.y, MAP_OY + TILE, MAP_BOTTOM - TILE);
      d.gfx.setPosition(d.x, d.y);
    }
  }

  _killDeer(d) {
    d.isDead = true;
    d.hp = 0;
    this._redrawDeer(d);
    this.showFloatText(d.x, d.y - 18, `+${DEER_MEAT} meat`, '#ffcc44');
  }

  spawnStartingDeer() {
    // Spread deer across heartland and scrubland — bottom 50% of map
    const tyMin = Math.floor(MAP_H * 0.50);
    for (let i = 0; i < 5; i++) {
      const tx = Phaser.Math.Between(2, MAP_W - 3);
      const ty = Phaser.Math.Between(tyMin, MAP_H - 3);
      const terr = this.terrainData[ty]?.[tx] ?? T_GRASS;
      if (terr === T_WATER || terr === T_ROCK) { i--; continue; }
      this._spawnDeer(tx * TILE + TILE / 2, MAP_OY + ty * TILE + TILE / 2);
    }
  }

  findDeerAt(wx, wy, radius = 20) {
    return this.deer.find(d => {
      const tx = Math.floor(d.x/TILE), ty = Math.floor((d.y-MAP_OY)/TILE);
      return (this.visMap[ty]?.[tx] ?? 0) >= 1
          && Phaser.Math.Distance.Between(wx, wy, d.x, d.y) < radius;
    });
  }

  // Assign selected units (workers + archers) to hunt a specific deer
  assignHunters(deer) {
    const sel = this.units.filter(u => u.selected && !u.isEnemy && u.hp > 0
      && (u.type === 'worker' || u.type === 'archer'));
    if (!sel.length) return false;
    for (const u of sel) {
      u.targetDeer = deer.id;
      if (u.type === 'worker') { u.role = 'hunter'; u.taskType = null; u.targetNode = null; }
    }
    const count = sel.length;
    this.showFloatText(deer.x, deer.y - 20, `${count} hunting`, '#ffcc66');
    return true;
  }

  // ─── Sheep / Pasture ──────────────────────────────────────────────────────

  _spawnWildSheep(wx, wy, gender = null) {
    const s = {
      id: this.getId(),
      x: wx, y: wy,
      gender: gender ?? (Math.random() < 0.5 ? 'male' : 'female'),
      speed: SHEEP_SPEED,
      isTamed: false,       // true once a shepherd has spent food on it
      followUnit: null,     // unit id of shepherd leading it to pasture
      wanderTimer: 0,
      moveTo: null,
      woolReady: true,      // shearable immediately; resets after each clip
      woolTimer: 0,         // ms since last shear
      gfx: this._w(this.add.graphics().setDepth(5)),
    };
    this._redrawSheep(s);
    this.sheep.push(s);
    return s;
  }

  _redrawSheep(s) {
    const g = s.gfx;
    g.clear().setPosition(s.x, s.y);
    // Shorn sheep look darker/thinner; wool-ready are fluffy white
    const col = s.isTamed ? 0xe8e0c0
              : (s.woolReady === false) ? 0xb8a880   // shorn — darker, shorter coat
              : 0xf0ece0;
    // Shadow
    g.fillStyle(0x000000, 0.10).fillEllipse(0, 10, 20, 6);
    // Fluffy body — layered circles
    g.fillStyle(col).fillCircle(-3, 0, 9);
    g.fillStyle(col).fillCircle(4,  1, 10);
    g.fillStyle(col).fillCircle(0, -4,  8);
    // Head
    g.fillStyle(0xd0c4a0).fillCircle(12, -3, 5);
    // Eye
    g.fillStyle(0x221100).fillCircle(13, -4, 1.2);
    // Legs
    g.lineStyle(2, 0xb8a880, 0.9);
    g.lineBetween(-5, 7, -6, 14);
    g.lineBetween(-1, 8, -1, 15);
    g.lineBetween(4,  8,  4, 15);
    g.lineBetween(8,  7,  9, 14);
    // Tamed ribbon indicator
    if (s.isTamed) {
      g.fillStyle(0xcc4444, 0.85).fillRect(-2, -12, 10, 3);
    }
    // Gender dot — top of head, subtle
    if (s.gender) {
      g.fillStyle(s.gender === 'male' ? 0x6688cc : 0xdd88aa, 0.85).fillCircle(12, -9, 2);
    }
  }

  _tickSheep(delta, dt) {
    const friendlies = this.units.filter(u => !u.isEnemy && u.hp > 0);
    for (const s of this.sheep) {
      // Tamed sheep following a shepherd
      if (s.isTamed && s.followUnit !== null) {
        const leader = this.units.find(u => u.id === s.followUnit && u.hp > 0);
        if (!leader) { s.followUnit = null; s.isTamed = false; this._redrawSheep(s); continue; }
        const dd = Phaser.Math.Distance.Between(s.x, s.y, leader.x, leader.y);
        if (dd > 24) {
          const a = Math.atan2(leader.y - s.y, leader.x - s.x);
          s.x += Math.cos(a) * SHEEP_SPEED * dt;
          s.y += Math.sin(a) * SHEEP_SPEED * dt;
          s.gfx.setPosition(s.x, s.y);
        }
        continue;
      }

      // Wool regrowth timer for wild (untamed) sheep
      if (!s.isTamed) {
        if (!s.woolReady) {
          s.woolTimer = (s.woolTimer ?? 0) + delta;
          if (s.woolTimer >= SHEEP_WOOL_MS) { s.woolReady = true; s.woolTimer = 0; this._redrawSheep(s); }
        }
      }

      // Flee from nearby friendlies
      let fleeFrom = null, fleeD = SHEEP_FLEE_R;
      for (const u of friendlies) {
        // Shepherds with this sheep as target don't trigger flee
        if (u.role === 'shepherd' && u.targetSheep === s.id) continue;
        const d = Phaser.Math.Distance.Between(s.x, s.y, u.x, u.y);
        if (d < fleeD) { fleeD = d; fleeFrom = u; }
      }
      if (fleeFrom) {
        const angle = Math.atan2(s.y - fleeFrom.y, s.x - fleeFrom.x);
        const nx = s.x + Math.cos(angle) * SHEEP_SPEED * dt;
        const ny = s.y + Math.sin(angle) * SHEEP_SPEED * dt;
        if (!this.isBlocked(nx, ny)) { s.x = nx; s.y = ny; }
        s.moveTo = null;
      } else {
        // Wander
        s.wanderTimer -= delta;
        if (!s.moveTo || s.wanderTimer <= 0) {
          const a = Math.random() * Math.PI * 2;
          const dist = Phaser.Math.Between(TILE, TILE * 4);
          const tx = Phaser.Math.Clamp(s.x + Math.cos(a)*dist, TILE, MAP_W*TILE-TILE);
          const ty = Phaser.Math.Clamp(s.y + Math.sin(a)*dist, MAP_OY+TILE, MAP_BOTTOM-TILE);
          if (!this.isBlocked(tx, ty)) s.moveTo = { x: tx, y: ty };
          s.wanderTimer = Phaser.Math.Between(4000, 8000);
        }
        if (s.moveTo) {
          if (Phaser.Math.Distance.Between(s.x, s.y, s.moveTo.x, s.moveTo.y) < 8) { s.moveTo = null; }
          else {
            const a = Math.atan2(s.moveTo.y - s.y, s.moveTo.x - s.x);
            const nx = s.x + Math.cos(a) * SHEEP_SPEED * 0.35 * dt;
            const ny = s.y + Math.sin(a) * SHEEP_SPEED * 0.35 * dt;
            if (!this.isBlocked(nx, ny)) { s.x = nx; s.y = ny; }
            else s.moveTo = null;
          }
        }
      }
      s.x = Phaser.Math.Clamp(s.x, TILE, MAP_W*TILE-TILE);
      s.y = Phaser.Math.Clamp(s.y, MAP_OY+TILE, MAP_BOTTOM-TILE);
      s.gfx.setPosition(s.x, s.y);
    }
  }

  // Tick all pastures: wool production (lamb spawning now happens at dawn via _ageSheepInPastures)
  _tickPastures(delta) {
    for (const b of this.buildings) {
      if (b.type !== 'pasture' || !b.built || b.faction === 'enemy') continue;
      // Migrate old adults field and init new gender-aware fields
      if (b.males === undefined) {
        b.males = b.adults ?? 0; b.females = 0;
        b.lambs = b.lambs ?? 0; b.lambDays = b.lambDays ?? 0;
        b.woolTimer = b.woolTimer ?? 0; b.fedToday = false;
        delete b.adults; delete b.lambTimer;
      }

      const totalAdults = b.males + b.females;
      // Wool production: one wool per adult per SHEEP_WOOL_MS
      if (totalAdults > 0 && this.hasStorageSpace('wool')) {
        b.woolTimer += delta;
        const clips = Math.floor(b.woolTimer / SHEEP_WOOL_MS * totalAdults);
        if (clips > 0) {
          b.woolTimer = b.woolTimer % (SHEEP_WOOL_MS / totalAdults);
          this.addResource('wool', clips);
          const bx = (b.tx + b.size/2)*TILE, by = MAP_OY + b.ty*TILE - 6;
          this.showFloatText(bx, by, `+${clips}🧶`, '#e8e0c0');
        }
      }
    }
  }

  // Called each dawn — dawn breeding, lamb aging, fed-flag reset
  _ageSheepInPastures() {
    for (const b of this.buildings) {
      if (b.type !== 'pasture' || !b.built) continue;
      if (b.males === undefined) continue; // not yet initialised
      const cap = BLDG.pasture.sheepCap;
      const bx = (b.tx+b.size/2)*TILE, by = MAP_OY+b.ty*TILE - 6;

      // Dawn breeding: fed pen with ≥1 male and ≥1 female breeds
      if (b.fedToday && b.males >= 1 && b.females >= 1) {
        let newLambs = 0;
        for (let f = 0; f < b.females; f++) {
          if (b.males + b.females + b.lambs + newLambs < cap && Math.random() < 0.4) newLambs++;
        }
        if (newLambs > 0) {
          b.lambs += newLambs;
          b.lambDays = this.day;
          this.showFloatText(bx, by, `${newLambs} lamb${newLambs > 1 ? 's' : ''} born!`, '#eeffcc');
          this.redrawBuildingBar(b);
        }
      }

      // Reset fed flag for next day
      b.fedToday = false;

      // Age lambs → adults after 2 days (random gender assignment)
      if (b.lambs > 0 && this.day - b.lambDays >= 2) {
        for (let i = 0; i < b.lambs; i++) {
          if (Math.random() < 0.5) b.males++; else b.females++;
        }
        b.lambs = 0;
        this.showFloatText(bx, by, 'sheep grown!', '#ddffaa');
        this.redrawBuildingBar(b);
      }
    }
  }

  // Slaughter one adult sheep from a pasture building (prefers extra males)
  _slaughterSheep(b) {
    if (!b || b.type !== 'pasture') return;
    const totalAdults = (b.males ?? 0) + (b.females ?? 0);
    if (totalAdults < 1) return;
    // Cull extra males first; keep ≥1 male if females are present
    if ((b.males ?? 0) > 1) b.males--;
    else if ((b.females ?? 0) > 0) b.females--;
    else b.males--;
    this.addResource('food', SHEEP_MEAT);
    const bx = (b.tx+b.size/2)*TILE, by = MAP_OY+b.ty*TILE-6;
    this.showFloatText(bx, by, `+${SHEEP_MEAT}🌾`, '#ff9944');
    this.updateUI();
  }

  spawnStartingWildSheep() {
    // Sheep graze in heartland/scrubland — bottom 50% of map
    const tyMin = Math.floor(MAP_H * 0.52);
    for (let i = 0; i < 4; i++) {
      const tx = Phaser.Math.Between(2, MAP_W - 3);
      const ty = Phaser.Math.Between(tyMin, MAP_H - 3);
      const terr = this.terrainData[ty]?.[tx] ?? T_GRASS;
      if (terr === T_WATER || terr === T_ROCK) { i--; continue; }
      this._spawnWildSheep(tx * TILE + TILE/2, MAP_OY + ty * TILE + TILE/2);
    }
  }

  findSheepAt(wx, wy, radius = 22) {
    return this.sheep.find(s => {
      const tx = Math.floor(s.x/TILE), ty = Math.floor((s.y-MAP_OY)/TILE);
      return (this.visMap[ty]?.[tx] ?? 0) >= 1
          && Phaser.Math.Distance.Between(wx, wy, s.x, s.y) < radius;
    });
  }

  // Assign selected workers as shepherds targeting a wild sheep
  assignShepherds(sheep) {
    const sel = this.units.filter(u => u.selected && !u.isEnemy && u.hp > 0 && u.type === 'worker' && u.age >= 2);
    if (!sel.length) return false;
    for (const u of sel) {
      u.role = 'shepherd';
      u.targetSheep = sheep.id;
      u.taskType = null; u.targetNode = null;
    }
    this.showFloatText(sheep.x, sheep.y - 22, `${sel.length} shepherding`, '#e8e8cc');
    return true;
  }

  // ─── Buildings ────────────────────────────────────────────────────────────

  makeBldgObj(type, tx, ty, built) {
    const def  = BLDG[type];
    const work = BUILD_WORK[type] || 1;
    return {
      id: this.getId(), type, tx, ty, size: def.size,
      built, buildWork: built ? 0 : work, maxBuildWork: work,
      stock: built && def.stockMax ? def.stockMax : 0, maxStock: def.stockMax || 0,
      replantTimer: 0, trainQueue: [], spawnTimer: 0, respawnQueue: [], resNeeded: {}, drawnStock: -1,
      gfx: null, barGfx: null, labelObj: null,
    };
  }

  placeBuilding(tx, ty) {
    const def = BLDG[this.bldgType];
    if (!this.isFree(tx, ty, def.size)) return;
    this.occupy(tx, ty, def.size, this.bldgType === 'wall' ? 98 : 99);
    const b = this.makeBldgObj(this.bldgType, tx, ty, false);
    if (def.cost) b.resNeeded = { ...def.cost };
    this.buildings.push(b); this.redrawBuilding(b);
    this.bldgType = null; this.hoverGfx?.clear();
    this.updateStorageCap(); // reserved capacity for planned building's stores
    const canAfford = !def.cost || this.afford(def.cost);
    const msg = canAfford ? 'Workers will build!' : 'Plan placed — gather resources!';
    const col = canAfford ? '#88ee88' : '#ffaa44';
    this.showFloatText((tx + def.size/2) * TILE, MAP_OY + ty * TILE - 6, msg, col);
  }

  placeBuiltBuilding(type, tx, ty) {
    this.occupy(tx, ty, BLDG[type].size, type === 'wall' ? 98 : 99);
    const b = this.makeBldgObj(type, tx, ty, true);
    this.buildings.push(b); this.redrawBuilding(b);
    return b;
  }

  completeBuildingConstruction(bldg) {
    bldg.built = true;
    if (bldg.type === 'farm') bldg.stock = bldg.maxStock;
    this.redrawBuilding(bldg);
    this.updateStorageCap();
    this.showFloatText((bldg.tx + bldg.size/2) * TILE, MAP_OY + bldg.ty * TILE - 8,
      `${BLDG[bldg.type].label} complete!`, '#44ee88');
    if (BLDG[bldg.type].capacity) this.time.delayedCall(500, () => this.attractAdults());
  }

  updateStorageCap() {
    const max     = { food: 0, stone: 0, wood: 0, wool: 0 };
    const planned = { food: 0, stone: 0, wood: 0, wool: 0 };
    for (const b of this.buildings) {
      if (b.faction === 'enemy') continue;
      const s = BLDG[b.type].stores;
      if (!s) continue;
      if (b.built) {
        for (const [r, n] of Object.entries(s)) max[r] = (max[r] || 0) + n;
      } else {
        // Under-construction plans reserve capacity so workers can start gathering
        for (const [r, n] of Object.entries(s)) planned[r] = (planned[r] || 0) + n;
      }
    }
    // Planned capacity is available but only up to the same amount as the built cap
    // (prevents hoarding infinite resources into ghost buildings)
    for (const r of ['food', 'stone', 'wood', 'wool'])
      max[r] = (max[r] || 0) + (planned[r] || 0);
    this.storageMax = max;
    // Clamp current resources to new cap
    for (const r of ['food', 'stone', 'wood', 'wool'])
      this.resources[r] = Math.min(this.resources[r], max[r] || 0);
    this.updateUI();
  }

  addResource(type, amount) {
    const cap = this.storageMax[type] ?? 0;
    this.resources[type] = Math.min(cap, (this.resources[type] || 0) + amount);
    this.updateUI();
  }

  _drawBuilding(gfx, bldg) {
    const { type, tx, ty, size } = bldg;
    const px = tx * TILE, py = MAP_OY + ty * TILE, s = size * TILE;
    const cx = px + s/2, cy = py + s/2;

    if (type === 'house') {
      // Walls
      gfx.fillStyle(0xd4a054).fillRect(px+4, py+20, s-8, s-22);
      // Roof
      gfx.fillStyle(0xaa4422).fillTriangle(px+2, py+20, px+s-2, py+20, cx, py+4);
      gfx.lineStyle(1, 0x7a2810, 0.8).strokeTriangle(px+2, py+20, px+s-2, py+20, cx, py+4);
      // Door
      gfx.fillStyle(0x5a2a10).fillRect(cx-6, py+s-24, 12, 21);
      gfx.fillStyle(0x8a5030, 0.4).fillRect(cx-5, py+s-23, 5, 20);
      // Windows
      gfx.fillStyle(0xffeaa0, 0.85).fillRect(px+10, py+26, 11, 10);
      gfx.fillStyle(0xffeaa0, 0.85).fillRect(px+s-21, py+26, 11, 10);
      gfx.lineStyle(1, 0x9a6430, 0.5)
        .lineBetween(px+15, py+26, px+15, py+36).lineBetween(px+10, py+31, px+21, py+31)
        .lineBetween(px+s-16, py+26, px+s-16, py+36).lineBetween(px+s-21, py+31, px+s-10, py+31);
      // Base line
      gfx.lineStyle(1, 0x8a6030, 0.35).strokeRect(px+4, py+20, s-8, s-22);

    } else if (type === 'farm') {
      const ratio = bldg.maxStock > 0 ? Math.max(0, bldg.stock / bldg.maxStock) : 0;
      const lush = ratio > 0.6, mid = ratio > 0.25;
      // Soil (darker when barren)
      gfx.fillStyle(lush ? 0x7a5c28 : mid ? 0x8a6630 : 0x6a4818).fillRect(px+3, py+3, s-6, s-10);
      // Crop rows — only draw crops that still exist
      const rowCount = Math.round(ratio * 5);
      for (let row = 0; row < 5; row++) {
        const ry = py + 6 + row * 10;
        if (row < rowCount) {
          const clr = lush ? (row % 2 === 0 ? 0x4aaa22 : 0x338818) :
                      mid  ? (row % 2 === 0 ? 0x8a9a30 : 0x7a8a20) :
                             (row % 2 === 0 ? 0xaa8822 : 0x997718);
          gfx.fillStyle(clr).fillRect(px+6, ry, s-12, 6);
          if (lush) {
            for (let col = 0; col < 4; col++)
              gfx.fillStyle(0x66cc33).fillTriangle(px+9+col*13, ry, px+12+col*13, ry-5, px+15+col*13, ry);
          } else if (mid) {
            for (let col = 0; col < 4; col++)
              gfx.fillStyle(0xaacc44, 0.7).fillTriangle(px+9+col*13, ry, px+12+col*13, ry-4, px+15+col*13, ry);
          }
        } else {
          // Bare soil row
          gfx.fillStyle(0x5a3c18, 0.6).fillRect(px+6, ry, s-12, 6);
        }
      }
      if (ratio === 0) {
        // Empty field indicator: small dry tufts
        gfx.fillStyle(0xaa8844, 0.5).fillRect(px+8, py+10, s-16, s-18);
        gfx.lineStyle(1, 0x7a5c28, 0.4).strokeRect(px+8, py+10, s-16, s-18);
      }
      // Fence
      gfx.lineStyle(2, 0xaa7733, 0.9).strokeRect(px+3, py+3, s-6, s-10);
      gfx.fillStyle(0xaa7733)
        .fillRect(px+2, py+2, 4, 10).fillRect(px+s-6, py+2, 4, 10)
        .fillRect(px+2, py+s-16, 4, 8).fillRect(px+s-6, py+s-16, 4, 8);

    } else if (type === 'barracks') {
      // Floor
      gfx.fillStyle(0x9a8060).fillRect(px+4, py+20, s-8, s-22);
      // Pediment
      gfx.fillStyle(0xb8996c).fillTriangle(px+4, py+20, px+s-4, py+20, cx, py+6);
      gfx.lineStyle(1, 0x7a5838, 0.7).strokeTriangle(px+4, py+20, px+s-4, py+20, cx, py+6);
      // Columns
      gfx.fillStyle(0xdac898)
        .fillRect(px+10, py+22, 9, s-26).fillRect(px+s-19, py+22, 9, s-26);
      gfx.fillStyle(0xa08860, 0.45)
        .fillRect(px+17, py+22, 3, s-26).fillRect(px+s-12, py+22, 3, s-26);
      // Column caps
      gfx.fillStyle(0xeedd99)
        .fillRect(px+8, py+20, 13, 4).fillRect(px+s-21, py+20, 13, 4);
      // Door arch
      gfx.fillStyle(0x3a2010).fillRect(cx-8, py+s-26, 16, 23);
      gfx.fillStyle(0x5a3820, 0.5).fillRect(cx-7, py+s-25, 7, 22);
      // Spear rack
      gfx.lineStyle(2, 0x999988, 0.7)
        .lineBetween(cx-5, py+28, cx-5, py+s-30)
        .lineBetween(cx+5, py+28, cx+5, py+s-30);
      gfx.fillStyle(0xbbaa66)
        .fillTriangle(cx-5, py+27, cx-3, py+32, cx-7, py+32)
        .fillTriangle(cx+5, py+27, cx+7, py+32, cx+3, py+32);

    } else if (type === 'archery') {
      // Base
      gfx.fillStyle(0x1e5c30).fillRect(px+3, py+3, s-6, s-10);
      // Ground strip
      gfx.fillStyle(0x4a7a3a).fillRect(px+6, py+s-18, s-12, 8);
      // Target post
      gfx.fillStyle(0x6a4422).fillRect(cx-2, py+30, 4, 24);
      // Target base
      gfx.fillStyle(0x5a3818).fillRect(cx-10, py+52, 20, 4);
      // Target rings (largest to smallest)
      gfx.fillStyle(0xcc3322).fillCircle(cx, py+22, 17);
      gfx.fillStyle(0xffffff).fillCircle(cx, py+22, 12);
      gfx.fillStyle(0xcc3322).fillCircle(cx, py+22, 7);
      gfx.fillStyle(0xffd700).fillCircle(cx, py+22, 3);
      // Arrows stuck in target
      gfx.lineStyle(1, 0x8a5a20, 0.9)
        .lineBetween(cx+5, py+8, cx+5, py+28)
        .lineBetween(cx-7, py+10, cx-7, py+26);
      gfx.fillStyle(0x666644)
        .fillTriangle(cx+5, py+7, cx+3, py+12, cx+7, py+12)
        .fillTriangle(cx-7, py+9, cx-9, py+14, cx-5, py+14);

    } else if (type === 'townhall') {
      // Wide stone base
      gfx.fillStyle(0xb8975a).fillRect(px+2, py+24, s-4, s-26);
      // Central tower
      gfx.fillStyle(0xcca96a).fillRect(cx-20, py+8, 40, s-10);
      // Tower roof (flat battlement style)
      gfx.fillStyle(0x8a6030).fillRect(cx-22, py+6, 44, 8);
      // Battlements
      for (let i = 0; i < 4; i++)
        gfx.fillStyle(0xaa7733).fillRect(cx-20+i*11, py+2, 7, 8);
      // Main gate arch
      gfx.fillStyle(0x3a1e08).fillRect(cx-9, py+s-26, 18, 24);
      gfx.fillStyle(0x5a3010, 0.5).fillRect(cx-8, py+s-25, 8, 23);
      // Side windows
      gfx.fillStyle(0xffe880, 0.7).fillRect(cx-18, py+30, 10, 12);
      gfx.fillStyle(0xffe880, 0.7).fillRect(cx+8, py+30, 10, 12);
      // Wing walls
      gfx.fillStyle(0xaa8848).fillRect(px+4, py+28, cx-26, s-32);
      gfx.fillStyle(0xaa8848).fillRect(cx+22, py+28, px+s-4-(cx+22), s-32);
      // Flag pole + flag
      gfx.lineStyle(2, 0x8a6030, 1).lineBetween(cx, py+2, cx, py-6);
      gfx.fillStyle(0xcc3322).fillTriangle(cx, py-6, cx+10, py-3, cx, py);

    } else if (type === 'granary') {
      // Round barn body
      gfx.fillStyle(0xd4a830).fillEllipse(cx, cy+4, s-8, s-12);
      // Roof
      gfx.fillStyle(0x8a5820).fillEllipse(cx, py+14, s-10, 22);
      gfx.fillStyle(0xaa7030, 0.6).fillEllipse(cx, py+10, s-18, 14);
      // Door
      gfx.fillStyle(0x4a2808).fillRect(cx-7, py+s-22, 14, 20);
      // Grain sacks hint
      gfx.fillStyle(0xcc9930, 0.4)
        .fillEllipse(cx-10, cy+8, 16, 20).fillEllipse(cx+10, cy+8, 16, 20).fillEllipse(cx, cy+2, 16, 20);
      // Outline
      gfx.lineStyle(1, 0x7a5010, 0.5).strokeEllipse(cx, cy+4, s-8, s-12);

    } else if (type === 'woodshed') {
      // Plank walls
      gfx.fillStyle(0x7a4c20).fillRect(px+3, py+18, s-6, s-20);
      // Roof lean-to
      gfx.fillStyle(0x5a3410).fillTriangle(px+2, py+18, px+s-2, py+18, px+s-2, py+6);
      gfx.fillStyle(0x6a3e18, 0.6).fillTriangle(px+2, py+18, px+s/2, py+10, px+s-2, py+6);
      // Plank lines
      gfx.lineStyle(1, 0x5a3010, 0.45);
      for (let i = 1; i < 4; i++) gfx.lineBetween(px+3, py+18+i*((s-20)/4), px+s-3, py+18+i*((s-20)/4));
      // Log stack
      gfx.fillStyle(0x6a3a10)
        .fillEllipse(cx-12, py+s-14, 22, 12).fillEllipse(cx+2, py+s-14, 22, 12)
        .fillEllipse(cx-5, py+s-20, 22, 12);
      // End rings
      gfx.fillStyle(0x4a2208)
        .fillEllipse(px+8, py+s-14, 8, 12).fillEllipse(px+s-8, py+s-14, 8, 12);

    } else if (type === 'stonepile') {
      // Ground shadow
      gfx.fillStyle(0x444438, 0.3).fillEllipse(cx+2, cy+14, s-6, 18);
      // Main boulders
      gfx.fillStyle(0x888878).fillEllipse(cx-10, cy+4, 34, 26);
      gfx.fillStyle(0x9a9a88).fillEllipse(cx+12, cy+6, 28, 22);
      gfx.fillStyle(0x777768).fillEllipse(cx-2, cy-6, 30, 22);
      // Top stone
      gfx.fillStyle(0xaaaaA0).fillEllipse(cx+2, cy-8, 20, 15);
      // Cracks
      gfx.lineStyle(1, 0x555548, 0.5)
        .lineBetween(cx-8, cy+2, cx-4, cy+10).lineBetween(cx+10, cy+4, cx+14, cy+12);

    } else if (type === 'pasture') {
      // Fenced paddock — green ground with wooden fence
      gfx.fillStyle(0x5a9a38).fillRect(px+4, py+4, s-8, s-8);
      // Horizontal fence rails
      gfx.lineStyle(3, 0x8a5820, 0.9)
        .lineBetween(px+2, py+s*0.3, px+s-2, py+s*0.3)
        .lineBetween(px+2, py+s*0.65, px+s-2, py+s*0.65);
      // Fence posts (verticals)
      for (let i = 0; i <= 4; i++) {
        const fx = px + 2 + i * (s-4) / 4;
        gfx.fillStyle(0x7a4818).fillRect(fx-3, py+2, 6, s-4);
      }
      // Gate opening (centre-bottom)
      gfx.fillStyle(0x5a9a38).fillRect(cx-10, py+s-6, 20, 8);
      // Decorative sheep silhouettes inside
      gfx.fillStyle(0xf0ece0, 0.55).fillCircle(cx-14, cy-6, 7).fillCircle(cx+14, cy+6, 7).fillCircle(cx, cy-4, 7);

    } else if (type === 'wall') {
      // Main body
      gfx.fillStyle(0x9a9888).fillRect(px+2, py+6, s-4, s-12);
      // Stone block texture
      gfx.lineStyle(1, 0x666655, 0.7)
        .lineBetween(px+2, py+s/2, px+s-2, py+s/2)
        .lineBetween(px+s/2, py+6, px+s/2, py+s/2)
        .lineBetween(px+s/4, py+s/2, px+s/4, py+s-6)
        .lineBetween(px+3*s/4, py+s/2, px+3*s/4, py+s-6);
      // Crenellations (merlons)
      gfx.fillStyle(0xb0a898)
        .fillRect(px+2, py+1, 8, 7).fillRect(px+s-10, py+1, 8, 7);
      gfx.fillStyle(0x7a7868).fillRect(px+11, py+1, s-22, 7);
      gfx.lineStyle(1, 0x555544, 0.5).strokeRect(px+2, py+6, s-4, s-12);
    }
  }

  redrawBuilding(bldg) {
    bldg.gfx?.destroy(); bldg.barGfx?.destroy(); bldg.labelObj?.destroy();
    bldg.gfx = null; bldg.barGfx = null; bldg.labelObj = null;
    const px = bldg.tx * TILE, py = MAP_OY + bldg.ty * TILE, s = bldg.size * TILE;
    bldg.gfx = this._w(this.add.graphics().setDepth(3));
    if (bldg.built) {
      this._drawBuilding(bldg.gfx, bldg);
      // Enemy buildings get a red hostile tint
      if (bldg.faction === 'enemy') {
        bldg.gfx.fillStyle(0xcc2211, 0.28).fillRect(px, py, s, s);
        bldg.gfx.lineStyle(2, 0xee3322, 0.55).strokeRect(px+1, py+1, s-2, s-2);
      }
    } else {
      // Under construction: faint colour + scaffold X-bracing
      const def = BLDG[bldg.type];
      bldg.gfx.fillStyle(def.color, 0.2).fillRect(px+2, py+2, s-4, s-4);
      bldg.gfx.lineStyle(2, 0xffdd44, 0.7).strokeRect(px+2, py+2, s-4, s-4);
      bldg.gfx.lineStyle(1, 0xffdd44, 0.3)
        .lineBetween(px+2, py+2, px+s-2, py+s-2)
        .lineBetween(px+s-2, py+2, px+2, py+s-2);
      bldg.labelObj = this._w(this.add.text(px+s/2, py+s/2-4, '⚒', {
        fontSize: '14px', color: '#ffdd44', fontFamily: 'monospace',
      }).setOrigin(0.5).setDepth(4));
    }
    bldg.barGfx = this._w(this.add.graphics().setDepth(4));
    this.redrawBuildingBar(bldg);
  }

  redrawBuildingBar(bldg) {
    if (!bldg.barGfx) return;
    bldg.barGfx.clear();
    const px = bldg.tx * TILE, py = MAP_OY + bldg.ty * TILE, s = bldg.size * TILE;
    const bw = s - 8, bx = px + 4, by = py + s - 7;
    // Enemy buildings: show HP bar (red)
    if (bldg.faction === 'enemy' && bldg.hp !== undefined) {
      const r = Math.max(0, bldg.hp / bldg.maxHp);
      bldg.barGfx.fillStyle(0x331111, 0.9).fillRect(bx, by, bw, 4);
      bldg.barGfx.fillStyle(r > 0.5 ? 0xcc3322 : r > 0.25 ? 0xdd6622 : 0xff4400)
        .fillRect(bx, by, bw * r, 4);
      return;
    }
    if (!bldg.built) {
      const totalNeeded = Object.values(bldg.resNeeded || {}).reduce((s,v)=>s+v, 0);
      if (totalNeeded > 0) {
        // Show resource delivery progress (orange)
        const totalCost = Object.values(BLDG[bldg.type].cost || {}).reduce((s,v)=>s+v, 0);
        const p = totalCost > 0 ? Math.max(0, 1 - totalNeeded / totalCost) : 0;
        bldg.barGfx.fillStyle(0x111111, 0.8).fillRect(bx, by, bw, 4);
        bldg.barGfx.fillStyle(0xff8833).fillRect(bx, by, bw * p + 1, 4);
      } else {
        // Show construction progress (yellow)
        const p = 1 - bldg.buildWork / bldg.maxBuildWork;
        bldg.barGfx.fillStyle(0x111111, 0.8).fillRect(bx, by, bw, 4);
        bldg.barGfx.fillStyle(0xffdd44).fillRect(bx, by, bw * p, 4);
      }
    } else if (bldg.type === 'farm') {
      const r = bldg.maxStock > 0 ? bldg.stock / bldg.maxStock : 0;
      bldg.barGfx.fillStyle(0x111111, 0.8).fillRect(bx, by, bw, 4);
      bldg.barGfx.fillStyle(r > 0.5 ? 0x88dd44 : r > 0.15 ? 0xddaa22 : 0x886633)
        .fillRect(bx, by, bw * r, 4);
    } else if (bldg.type === 'townhall' || bldg.type === 'house') {
      const capacity  = BLDG[bldg.type].capacity;
      const residents = this.units.filter(u => u.homeBldgId === bldg.id && !u.isEnemy && u.hp > 0);
      const adults    = residents.filter(u => u.age >= 2).length;
      const popR      = Math.min(1, residents.length / capacity);
      // Bottom bar: population fill (grey = capacity, segments per person)
      bldg.barGfx.fillStyle(0x222222, 0.8).fillRect(bx, by, bw, 4);
      bldg.barGfx.fillStyle(adults >= 2 ? 0xddaa55 : 0x887755).fillRect(bx, by, bw * popR, 4);
      // Spawn timer tick on top if active (white pulse)
      if (adults >= 2 && residents.length < capacity) {
        const tr = Math.min(1, bldg.spawnTimer / BLDG[bldg.type].spawnMs);
        if (tr > 0) bldg.barGfx.fillStyle(0xffffff, 0.55).fillRect(bx, by, bw * tr, 2);
      }
      // Respawn progress (cyan overlay)
      if (bldg.respawnQueue.length) {
        const rr = Math.min(1, bldg.respawnQueue[0].elapsed / BLDG[bldg.type].spawnMs);
        bldg.barGfx.fillStyle(0xaaddff, 0.7).fillRect(bx, by, bw * rr, 2);
      }
    } else if (bldg.type === 'barracks') {
      if (bldg.respawnQueue.length) {
        const delay = BLDG.barracks.spawnMs || 18000;
        const r = Math.min(1, bldg.respawnQueue[0].elapsed / delay);
        bldg.barGfx.fillStyle(0x111111, 0.8).fillRect(bx, by, bw, 4);
        bldg.barGfx.fillStyle(0xaaddff).fillRect(bx, by, bw * r, 4);
      } else if (bldg.trainQueue.length) {
        const r = bldg.trainQueue[0].elapsed / 15;
        bldg.barGfx.fillStyle(0x111111, 0.8).fillRect(bx, by, bw, 4);
        bldg.barGfx.fillStyle(0x3a6acc).fillRect(bx, by, bw * r, 4);
      }
    } else if (bldg.type === 'archery') {
      if (bldg.respawnQueue.length) {
        const delay = BLDG.archery.spawnMs || 16000;
        const r = Math.min(1, bldg.respawnQueue[0].elapsed / delay);
        bldg.barGfx.fillStyle(0x111111, 0.8).fillRect(bx, by, bw, 4);
        bldg.barGfx.fillStyle(0xaaddff).fillRect(bx, by, bw * r, 4);
      } else if (bldg.trainQueue.length) {
        const r = bldg.trainQueue[0].elapsed / 12;
        bldg.barGfx.fillStyle(0x111111, 0.8).fillRect(bx, by, bw, 4);
        bldg.barGfx.fillStyle(0x44aa77).fillRect(bx, by, bw * r, 4);
      }
    } else if (bldg.type === 'pasture') {
      // Sheep count bar (green = adults, yellow = lambs)
      const cap = BLDG.pasture.sheepCap;
      const adults = (bldg.males ?? 0) + (bldg.females ?? 0), lambs = bldg.lambs ?? 0;
      bldg.barGfx.fillStyle(0x222222, 0.8).fillRect(bx, by, bw, 4);
      bldg.barGfx.fillStyle(0x88ee44).fillRect(bx, by, bw * adults / cap, 4);
      bldg.barGfx.fillStyle(0xeeee44).fillRect(bx + bw * adults / cap, by, bw * lambs / cap, 4);
    }
  }

  findBuildingAt(wx, wy) {
    return this.buildings.find(b =>
      wx >= b.tx * TILE && wx < (b.tx + b.size) * TILE &&
      wy >= MAP_OY + b.ty * TILE && wy < MAP_OY + (b.ty + b.size) * TILE);
  }

  orderWorkersToBuilding(bldg) {
    const workers = this.units.filter(u => u.selected && u.type === 'worker');
    if (!workers.length) return false;
    let taskType;
    if (!bldg.built) taskType = 'build';
    else if (bldg.type === 'farm') taskType = bldg.stock <= 0 ? 'replant' : 'harvest_farm';
    else if (bldg.type === 'barracks') taskType = 'train';
    else if (bldg.type === 'archery')  taskType = 'train_archer';
    else return false;
    const roleForTask = { build: 'builder', harvest_farm: 'farmer', replant: 'farmer', train: null, train_archer: null };
    const cx = (bldg.tx + bldg.size / 2) * TILE, cy = MAP_OY + (bldg.ty + bldg.size / 2) * TILE;
    workers.forEach(u => {
      u.taskType = taskType; u.taskBldgId = bldg.id;
      u.targetNode = null; u.replantTimer = 0; u.trainTimer = 0;
      if (roleForTask[taskType] !== undefined) u.role = roleForTask[taskType];
      u.moveTo = { x: cx + Phaser.Math.Between(-10,10), y: cy + Phaser.Math.Between(-10,10) };
    });
    this.tweens.add({ targets: bldg.gfx, alpha: { from: 0.4, to: 1 }, duration: 200, yoyo: true });
    return true;
  }

  // ─── Units ────────────────────────────────────────────────────────────────

  spawnUnit(type, x, y, isEnemy) {
    const def = UDEF[type];
    const unit = {
      id: this.getId(), type, x, y,
      hp: def.hp, maxHp: def.hp,
      isEnemy, selected: false,
      gender: Math.random() < 0.5 ? 'male' : 'female',
      moveTo: null, lastAtk: 0, lastGather: 0,
      speed: def.speed, atk: def.atk, range: def.range,
      wallSide: 0, homeBldgId: null, age: 0,
      taskType: null, taskBldgId: null, targetNode: null,
      carrying: { food: 0, stone: 0, wood: 0, wool: 0 }, carryMax: 5,
      role: null, replantTimer: 0, trainTimer: 0, lastSeek: 0,
      roleMemory: {}, targetDeer: null, targetSheep: null,
      gfx: this._w(this.add.graphics().setDepth(6)),
    };
    this.redrawUnit(unit); this.units.push(unit);
    return unit;
  }

  redrawUnit(u) {
    const def = UDEF[u.type];
    u.gfx.clear().setPosition(u.x, u.y);
    u.gfx.fillStyle(0x000000, 0.18).fillEllipse(0, 9, 22, 7);
    if (u.type === 'worker') {
      const age = u.age ?? 2;
      if (age === 0) {
        // Child — small round shape
        u.gfx.fillStyle(def.color).fillCircle(0, 0, 5);
        if (u.selected) u.gfx.lineStyle(2, 0xffdd44).strokeCircle(0, 0, 7);
      } else if (age === 1) {
        // Youth — small triangle
        u.gfx.fillStyle(def.color).fillTriangle(0, -6, -5, 3, 5, 3);
        if (u.selected) u.gfx.lineStyle(2, 0xffdd44).strokeTriangle(0, -8, -7, 4, 7, 4);
      } else {
        // Adult — full triangle
        u.gfx.fillStyle(def.color).fillTriangle(0, -9, -8, 5, 8, 5);
        if (u.selected) u.gfx.lineStyle(2, 0xffdd44).strokeTriangle(0, -11, -10, 6, 10, 6);
      }
      if (u.role && age >= 1) {
        const rc = u.role === 'builder'   ? 0xffdd44
                 : u.role === 'farmer'    ? 0x66dd44
                 : u.role === 'forager'   ? 0xee4466
                 : u.role === 'miner'     ? 0x9999bb
                 : u.role === 'shepherd'  ? 0xf0ece0   // fluffy white
                 : u.role === 'hunter'    ? 0xdd8833   // amber
                 : 0xaa7733;
        u.gfx.fillStyle(rc).fillCircle(age === 1 ? 5 : 7, age === 1 ? -6 : -9, 2);
      }
      // Carry dot: colour shows what's being carried
      if (u.carrying) {
        const tot = u.carrying.food + u.carrying.stone + u.carrying.wood + (u.carrying.wool||0);
        if (tot > 0) {
          const cc = u.carrying.food > 0   ? 0x88ee44
                   : u.carrying.stone > 0  ? 0xaaaadd
                   : u.carrying.wool > 0   ? 0xeeddcc   // pale wool
                   : 0xcc9944;
          u.gfx.fillStyle(cc).fillCircle(age === 0 ? 4 : 6, age === 0 ? 3 : 5, 2);
        }
      }
    } else if (u.type === 'archer') {
      // Diamond shape (two triangles)
      u.gfx.fillStyle(def.color)
        .fillTriangle(0, -12, -9, 0, 9, 0)
        .fillTriangle(0, 10, -9, 0, 9, 0);
      u.gfx.fillStyle(0x228855, 0.7).fillTriangle(0, 10, -4, 0, 4, 0);
      if (u.selected) u.gfx.lineStyle(2, 0xffdd44)
        .strokeTriangle(0, -14, -11, 1, 11, 1).strokeTriangle(0, 13, -11, 1, 11, 1);
    } else if (u.type === 'berserker') {
      u.gfx.fillStyle(def.color).fillCircle(0, 0, 13);
      u.gfx.lineStyle(2, 0xff8844, 0.9).strokeCircle(0, 0, 13);
      if (u.selected) u.gfx.lineStyle(2, 0xffdd44).strokeCircle(0, 0, 16);
    } else if (u.type === 'veteran') {
      u.gfx.fillStyle(def.color).fillRect(-12, -12, 24, 24);
      u.gfx.lineStyle(2, 0xccaa88, 0.6).strokeRect(-12, -12, 24, 24);
      if (u.selected) u.gfx.lineStyle(2, 0xffdd44).strokeRect(-14, -14, 28, 28);
    } else {
      // hoplite, raider
      u.gfx.fillStyle(def.color).fillCircle(0, 0, 10);
      if (u.selected) u.gfx.lineStyle(2, 0xffdd44).strokeCircle(0, 0, 13);
    }
    const bw = (u.type === 'veteran') ? 26 : (u.type === 'berserker') ? 24 : 20;
    const barY = (u.type === 'veteran') ? -18 : (u.type === 'berserker') ? -20 : -21;
    u.gfx.fillStyle(0x111111).fillRect(-bw/2, barY, bw, 3);
    const r = Math.max(0, u.hp / u.maxHp);
    u.gfx.fillStyle(r > 0.6 ? 0x44dd44 : r > 0.3 ? 0xddaa22 : 0xdd3333).fillRect(-bw/2, barY, bw * r, 3);
    // Gender marker — tiny dot just to the right of the HP bar
    if (u.gender) {
      u.gfx.fillStyle(u.gender === 'male' ? 0x6688cc : 0xdd88aa, 0.8).fillCircle(bw / 2 + 4, barY + 1, 2);
    }
  }

  spawnStartingState() {
    // Player starts at bottom-centre of the portrait map
    const mx = Math.floor(MAP_W / 2) - 1; // centre column
    const by = MAP_H - 8;                 // near bottom
    const th = this.placeBuiltBuilding('townhall', mx, by);
    this.placeBuiltBuilding('farm', mx - 4, by - 2);
    this.updateStorageCap();
    const wx = (mx + 1) * TILE, wy = MAP_OY + (by + 1.5) * TILE;
    const w1 = this.spawnUnit('worker', wx,      wy,      false);
    const w2 = this.spawnUnit('worker', wx + 20, wy + 20, false);
    w1.homeBldgId = th.id; w1.age = 2; w1.gender = 'male';
    w2.homeBldgId = th.id; w2.age = 2; w2.gender = 'female';
    this.redrawUnit(w1); this.redrawUnit(w2);
    this.spawnStartingDeer();
    this.spawnStartingWildSheep();
    // Enemy polis stub at the top
    this._placeEnemyVillage();
  }

  _placeEnemyVillage() {
    // Enemy starts at top-centre of the portrait map
    const mx = Math.floor(MAP_W / 2) - 1;
    const ey = 5; // near top
    // Force sand terrain at placement sites so building is always valid
    const clearFor = (tx, ty, size) => {
      for (let dy = 0; dy < size; dy++)
        for (let dx = 0; dx < size; dx++) {
          const nx = tx+dx, ny = ty+dy;
          if (ny >= 0 && ny < MAP_H && nx >= 0 && nx < MAP_W)
            this.terrainData[ny][nx] = T_SAND;
        }
    };
    // Building HP pools: destroying them degrades waves
    const bldgHp = { townhall: 20, farm: 10, barracks: 14 };
    const sites = [
      { type: 'townhall', tx: mx,     ty: ey     },
      { type: 'farm',     tx: mx - 4, ty: ey + 3 },
      { type: 'barracks', tx: mx + 3, ty: ey + 3 },
    ];
    for (const s of sites) {
      clearFor(s.tx, s.ty, BLDG[s.type].size);
      const b = this.placeBuiltBuilding(s.type, s.tx, s.ty);
      b.faction = 'enemy';
      b.hp    = bldgHp[s.type];
      b.maxHp = bldgHp[s.type];
    }

    // Spawn 2 real enemy workers tied to the townhall
    const th = this.buildings.find(b => b.faction === 'enemy' && b.type === 'townhall');
    const wx0 = mx * TILE, wy0 = MAP_OY + (ey + 2) * TILE;
    for (let i = 0; i < 2; i++) {
      const w = this.spawnUnit('worker', wx0 + Phaser.Math.Between(-20, 20), wy0 + i * 24, true);
      w.homeBldgId = th?.id ?? null;
      w.age = 2;
    }
  }

  spawnWave() {
    const enemyBldgs = this.buildings.filter(b => b.faction === 'enemy');
    const hasTownhall = enemyBldgs.some(b => b.type === 'townhall' && b.built && (b.hp ?? 1) > 0);
    const hasBarracks = enemyBldgs.some(b => b.type === 'barracks' && b.built && (b.hp ?? 1) > 0);
    const hasFarm     = enemyBldgs.some(b => b.type === 'farm'     && b.built && (b.hp ?? 1) > 0);

    // Townhall destroyed — village broken, wave is cancelled entirely
    if (!hasTownhall) {
      this.showPhaseMessage('Enemy village broken — no wave tonight!', 0x44dd88);
      return;
    }

    const base = WAVES[Math.min(this.day - 1, WAVES.length - 1)];
    // Copy wave composition and apply building-loss penalties
    const comp = {};
    for (const [type, n] of Object.entries(base)) {
      let count = n;
      if (!hasBarracks) {
        // Barracks gone: 50% fewer raiders, no berserkers/veterans
        if (type === 'raider')    count = Math.ceil(count * 0.5);
        if (type === 'berserker' || type === 'veteran') count = 0;
      }
      if (!hasFarm) {
        // Farm gone: weaker wave — fewer of everything
        count = Math.ceil(count * 0.65);
      }
      if (count > 0) comp[type] = count;
    }

    if (Object.keys(comp).length === 0) {
      this.showPhaseMessage('Enemy too weakened — skirmishers only!', 0x88cc88);
      comp.raider = 2;
    }

    const types = [];
    Object.entries(comp).forEach(([type, n]) => { for (let i = 0; i < n; i++) types.push(type); });
    for (let i = types.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [types[i], types[j]] = [types[j], types[i]];
    }
    const total = types.length;
    types.forEach((type, i) => {
      // Enemies march from the top — spread horizontally across the map width
      const x = TILE * 1.5 + i * ((MAP_W - 3) * TILE / total) + TILE / 2;
      const y = MAP_OY + WAVE_SPAWN_Y * TILE + Phaser.Math.Between(0, TILE * 2);
      this.spawnUnit(type, x, y, true);
    });
  }

  // ─── Selection ────────────────────────────────────────────────────────────

  selectUnit(id, add) {
    if (!add) this.deselect();
    const u = this.units.find(u => u.id === id && !u.isEnemy);
    if (!u) return;
    u.selected = true; this.selIds.add(id);
    this.redrawUnit(u); this.updateSelInfo();
  }

  deselect() {
    this.units.forEach(u => { if (u.selected) { u.selected = false; this.redrawUnit(u); } });
    this.selIds.clear(); this.updateSelInfo();
  }

  boxSelect(x1, y1, x2, y2, add) {
    if (!add) this.deselect();
    this.units.filter(u => !u.isEnemy && u.hp > 0
      && u.x >= x1 && u.x <= x2 && u.y >= y1 && u.y <= y2)
      .forEach(u => this.selectUnit(u.id, true));
  }

  unitAt(x, y) {
    const r = this.sys.game.device.input.touch ? 16 : 12;
    return this.units.find(u => u.hp > 0 && Phaser.Math.Distance.Between(x, y, u.x, u.y) < r);
  }

  // ─── Resource nodes ───────────────────────────────────────────────────────

  findNodeAt(wx, wy) {
    // Larger hit area for big objects
    return this.resNodes.find(n => {
      if (n.stock <= 0) return false;
      const r = NODE_DEF[n.type].large ? 26 : 18;
      return Phaser.Math.Distance.Between(wx, wy, n.x, n.y) < r;
    });
  }

  orderWorkersToNode(node) {
    const workers = this.units.filter(u => u.selected && u.type === 'worker');
    if (!workers.length) return false;
    workers.forEach(u => {
      u.targetNode = node; u.taskType = null; u.taskBldgId = null;
      u.role = NODE_ROLE[node.type] || 'miner';
      u.moveTo = { x: node.x + Phaser.Math.Between(-8,8), y: node.y + Phaser.Math.Between(-8,8) };
    });
    this.tweens.add({ targets: node.gfx, alpha: { from: 0.3, to: 1 }, duration: 180, yoyo: true });
    this.redrawNode(node);
    return true;
  }

  findNearNode(u, maxDist, filterType) {
    // Workers only seek nodes in explored (seen or lit) tiles — no psychic knowledge
    let best = null, bd = Infinity;
    for (const n of this.resNodes) {
      if (n.stock <= 0) continue;
      if (filterType && !filterType.includes(n.type)) continue;
      const tx = Math.floor(n.x / TILE), ty = Math.floor((n.y - MAP_OY) / TILE);
      if ((this.visMap[ty]?.[tx] ?? 0) === 0) continue; // skip black/unexplored tiles
      const d = Phaser.Math.Distance.Between(u.x, u.y, n.x, n.y);
      if (d < maxDist && d < bd) { bd = d; best = n; }
    }
    return best;
  }

  showGatherPop(x, y, resource) {
    const [label, color] =
      resource === 'stone' ? ['+⛏', '#aaaadd'] :
      resource === 'wood'  ? ['+🪵', '#cc9944'] :
                             ['+🌾', '#88ee88'];
    this.showFloatText(x, y - 14, label, color);
  }

  showFloatText(x, y, text, color = '#ffffff') {
    const t = this._w(this.add.text(x, y, text, {
      fontSize: '11px', color, fontFamily: 'monospace', stroke: '#000', strokeThickness: 2,
    }).setOrigin(0.5).setDepth(15));
    this.tweens.add({ targets: t, y: y - 22, alpha: 0, duration: 900, onComplete: () => t.destroy() });
  }

  // ─── Role-based auto-seek ─────────────────────────────────────────────────

  seekBuilderTask(u) {
    const site = this.buildings.find(b => !b.built);
    if (!site) return;
    u.taskType = 'build'; u.taskBldgId = site.id;
    u.moveTo = { x: (site.tx + site.size/2) * TILE + Phaser.Math.Between(-10,10),
                 y: MAP_OY + (site.ty + site.size/2) * TILE + Phaser.Math.Between(-10,10) };
  }

  seekFarmerTask(u) {
    // Always prioritize replanting depleted farms; only harvest when food storage has space
    const emptyFarm = this.buildings.find(b => b.type === 'farm' && b.built && b.faction !== 'enemy' && b.stock <= 0);
    const fullFarm  = this.hasStorageSpace('food')
                    ? this.buildings.find(b => b.type === 'farm' && b.built && b.faction !== 'enemy' && b.stock > 0)
                    : null;
    const target = emptyFarm || fullFarm;
    if (!target) return;
    u.taskType = target.stock <= 0 ? 'replant' : 'harvest_farm';
    u.taskBldgId = target.id; u.replantTimer = 0;
    u.moveTo = { x: (target.tx + target.size/2) * TILE + Phaser.Math.Between(-10,10),
                 y: MAP_OY + (target.ty + target.size/2) * TILE + Phaser.Math.Between(-10,10) };
  }

  // Assign the most-needed unoccupied role to an idle worker
  pickRole(u, time) {
    u.lastSeek = time;
    const workers = this.units.filter(w => w.type==='worker' && !w.isEnemy && w.hp>0);
    const cnt = r => workers.filter(w => w.role===r).length;
    const cands = [];

    // Adults (age 2+) can build and do heavy work
    if (u.age >= 2 && this.buildings.some(b => !b.built))
      cands.push({ role:'builder',    score: 100 - cnt('builder')    * 20 });
    // Youths (age 1+) can farm and forage
    const farmUseful = this.buildings.some(b => b.type==='farm' && b.built && b.faction !== 'enemy' &&
      (b.stock <= 0 || (b.stock > 0 && this.hasStorageSpace('food'))));
    if (farmUseful)
      cands.push({ role:'farmer',     score: 80  - cnt('farmer')     * 25 });
    const visNode = (types) => this.resNodes.some(n => {
      if (!types.includes(n.type) || n.stock <= 0) return false;
      const tx = Math.floor(n.x/TILE), ty = Math.floor((n.y-MAP_OY)/TILE);
      return (this.visMap[ty]?.[tx] ?? 0) >= 1;
    });
    if (visNode(['berry_bush']) && this.hasStorageSpace('food'))
      cands.push({ role:'forager',    score: 55  - cnt('forager')    * 22 });
    // Adults only: woodcutting and mining
    if (u.age >= 2 && visNode(['small_tree','large_tree']) && this.hasStorageSpace('wood'))
      cands.push({ role:'woodcutter', score: 50  - cnt('woodcutter') * 22 });
    if (u.age >= 2 && visNode(['small_boulder','large_boulder']) && this.hasStorageSpace('stone'))
      cands.push({ role:'miner',      score: 45  - cnt('miner')      * 22 });
    // Adults can shepherd if there are visible wool-ready sheep and wool storage exists
    const visWoolSheep = this.sheep.some(s => {
      if (!s.woolReady) return false;
      const tx = Math.floor(s.x/TILE), ty = Math.floor((s.y-MAP_OY)/TILE);
      return (this.visMap[ty]?.[tx] ?? 0) >= 1;
    });
    const pastureExists = this.buildings.some(b => b.type === 'pasture' && b.built);
    if (u.age >= 2 && (visWoolSheep || pastureExists) && this.hasStorageSpace('wool'))
      cands.push({ role:'shepherd',   score: 40  - cnt('shepherd')   * 20 });

    cands.sort((a, b) => b.score - a.score);
    const best = cands.find(c => c.score > 0);
    if (best) u.role = best.role;
  }

  _totalCarrying(u) {
    return (u.carrying.food||0) + (u.carrying.stone||0) + (u.carrying.wood||0) + (u.carrying.wool||0);
  }

  hasStorageSpace(res) {
    return (this.resources[res] || 0) < (this.storageMax[res] || 0);
  }

  dropOnFloor(x, y, res) {
    // res = { food, stone, wood, wool } — only drops non-zero amounts
    const total = (res.food||0) + (res.stone||0) + (res.wood||0) + (res.wool||0);
    if (total <= 0) return;
    // Merge into a nearby pile or create a new one
    let pile = this.floorPiles.find(p =>
      Phaser.Math.Distance.Between(p.x, p.y, x, y) < 28 &&
      (p.food||0) + (p.stone||0) + (p.wood||0) + (p.wool||0) < 40);
    if (!pile) {
      pile = { id: this.getId(), x, y, food: 0, stone: 0, wood: 0, wool: 0,
               gfx: this._w(this.add.graphics().setDepth(3.5)) };
      pile.gfx.setPosition(x, y);
      this.floorPiles.push(pile);
    }
    for (const r of ['food','stone','wood','wool']) pile[r] = (pile[r]||0) + (res[r]||0);
    this.redrawFloorPile(pile);
  }

  redrawFloorPile(pile) {
    pile.gfx.clear();
    const tot = (pile.food||0) + (pile.stone||0) + (pile.wood||0);
    if (tot <= 0) { pile.gfx.destroy(); pile.label?.destroy(); this.floorPiles = this.floorPiles.filter(p => p !== pile); return; }
    // Shadow
    pile.gfx.fillStyle(0x000000, 0.2).fillEllipse(0, 4, 18, 8);
    let ox = -6;
    if ((pile.food||0) > 0) {
      pile.gfx.fillStyle(0x66cc44).fillCircle(ox, 0, 4);
      if (pile.food > 4) pile.gfx.fillStyle(0x44aa22).fillCircle(ox-3, 3, 3);
      ox += 7;
    }
    if ((pile.stone||0) > 0) {
      pile.gfx.fillStyle(0x9999bb).fillCircle(ox, 1, 4);
      if (pile.stone > 4) pile.gfx.fillStyle(0x7777aa).fillCircle(ox+3, -2, 3);
      ox += 7;
    }
    if ((pile.wood||0) > 0) {
      pile.gfx.fillStyle(0xaa7733).fillRect(ox-4, -2, 8, 5);
      if (pile.wood > 4) pile.gfx.fillStyle(0x885522).fillRect(ox-3, 3, 6, 4);
      ox += 7;
    }
    // Amount label for larger piles
    if (tot >= 5 && !pile.label) {
      pile.label = this._w(this.add.text(pile.x, pile.y + 8, '', {
        fontSize: '8px', color: '#eeeecc', fontFamily: 'monospace', stroke: '#000', strokeThickness: 2,
      }).setOrigin(0.5).setDepth(3.6));
    }
    if (pile.label) pile.label.setText(`${tot}`);
  }

  findFloorPileAt(wx, wy, radius = 18) {
    return this.floorPiles.find(p => Phaser.Math.Distance.Between(p.x, p.y, wx, wy) < radius);
  }

  // Assign selected (or idle) adult workers to haul floor piles to the given storeroom
  _triggerCollect(bldg) {
    const candidates = this.selIds.size > 0
      ? this.units.filter(u => u.selected && !u.isEnemy && u.type === 'worker' && u.hp > 0)
      : this.units.filter(u => !u.isEnemy && u.type === 'worker' && u.hp > 0 && u.age >= 2 && !u.taskType && !u.moveTo);
    let assigned = 0;
    for (const u of candidates) {
      u.taskType   = 'collect_floor';
      u.taskBldgId = bldg.id;
      u.role       = 'collector';
      u.targetNode = null;
      u.moveTo     = null;
      assigned++;
    }
    if (assigned > 0) this.showFloatText(
      (bldg.tx + bldg.size/2) * TILE, MAP_OY + bldg.ty * TILE - 8,
      `${assigned} collecting`, '#cceeaa'
    );
  }

  demolishBuilding(bldg, refundFraction = 0.5) {
    const def = BLDG[bldg.type];
    const cx = (bldg.tx + bldg.size/2) * TILE, cy = MAP_OY + (bldg.ty + bldg.size/2) * TILE;
    if (!bldg.built) {
      // Under construction: resources were deducted as workers physically picked them up.
      // Drop already-delivered materials as floor piles so workers can reclaim them.
      // Undelivered portion is still in the storeroom — nothing to refund.
      if (def.cost) {
        for (const [r, n] of Object.entries(def.cost)) {
          const undelivered = bldg.resNeeded?.[r] || 0;
          const delivered   = n - undelivered;
          if (delivered > 0) this.dropOnFloor(cx + Phaser.Math.Between(-10,10), cy + Phaser.Math.Between(-10,10), { [r]: delivered });
        }
      }
    } else {
      // Built: drop fractional recoup as floor piles
      if (def.cost) {
        for (const [r, n] of Object.entries(def.cost)) {
          const recoup = Math.floor(n * refundFraction);
          if (recoup > 0) this.dropOnFloor(cx + Phaser.Math.Between(-10,10), cy + Phaser.Math.Between(-10,10), { [r]: recoup });
        }
      }
    }
    // Evict residents — clear their homeBldgId so they re-seek
    this.units.forEach(u => { if (u.homeBldgId === bldg.id) { u.homeBldgId = null; u.role = null; u.taskType = null; } });
    // Remove from occupancy grid
    this.unoccupy(bldg.tx, bldg.ty, bldg.size);
    // Destroy graphics
    bldg.gfx?.destroy(); bldg.barGfx?.destroy(); bldg.labelObj?.destroy();
    this.buildings = this.buildings.filter(b => b !== bldg);
    if (this.selectedBuilding === bldg) this.selectedBuilding = null;
    this.updateStorageCap();
    this.updateUI();
    this.showFloatText(cx, cy - 12, 'Demolished', '#ff8844');
  }

  findNearestStoreroomFor(u, resource) {
    // Nearest built building that can store this resource type
    const accepts = b => b.built && BLDG[b.type].stores && BLDG[b.type].stores[resource] !== undefined;
    let best = null, bd = Infinity;
    for (const b of this.buildings) {
      if (!accepts(b)) continue;
      const d = Phaser.Math.Distance.Between(u.x, u.y, (b.tx+b.size/2)*TILE, MAP_OY+(b.ty+b.size/2)*TILE);
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }

  findNearestStoreroom(u) {
    let best = null, bd = Infinity;
    for (const b of this.buildings) {
      if (!b.built || !BLDG[b.type].stores) continue;
      const d = Phaser.Math.Distance.Between(u.x, u.y, (b.tx+b.size/2)*TILE, MAP_OY+(b.ty+b.size/2)*TILE);
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }

  seekNodeTask(u, types) {
    const res = NODE_DEF[types[0]]?.resource;
    if (res && !this.hasStorageSpace(res)) return;
    // 3000px ≈ 93 tiles — covers most of the world map
    const near = this.findNearNode(u, 3000, types);
    if (near) {
      u.targetNode = near; u.moveTo = null;
      // Update memory: remember where we last found this kind of resource
      if (!u.roleMemory) u.roleMemory = {};
      u.roleMemory[u.role] = { x: near.x, y: near.y };
      return;
    }
    // No visible node found — wander toward last known position if we have one
    if (!u.roleMemory) u.roleMemory = {};
    const mem = u.roleMemory[u.role];
    if (mem && !u.moveTo) {
      const d = Phaser.Math.Distance.Between(u.x, u.y, mem.x, mem.y);
      if (d > TILE * 2) {
        // Wander toward memory with a little random jitter so workers spread out
        const jx = mem.x + Phaser.Math.Between(-TILE * 3, TILE * 3);
        const jy = mem.y + Phaser.Math.Between(-TILE * 3, TILE * 3);
        u.moveTo = { x: Phaser.Math.Clamp(jx, TILE, MAP_W*TILE-TILE),
                     y: Phaser.Math.Clamp(jy, MAP_OY+TILE, MAP_BOTTOM-TILE) };
      } else {
        // Arrived at memory location and still nothing — forget it
        delete u.roleMemory[u.role];
      }
    }
  }

  // ─── Formation ────────────────────────────────────────────────────────────

  // angle = direction units spread along (radians). Default π/2 = north-south spread,
  // matching the old hardcoded vertical layout.
  getFormationPositions(type, cx, cy, count, angle = Math.PI / 2) {
    switch (type) {
      case 'wedge':  return this._wedgePos(cx, cy, count, angle);
      case 'screen': return this._screenPos(cx, cy, count, angle);
      default:       return this._phalanxPos(cx, cy, count, angle);
    }
  }

  _phalanxPos(cx, cy, count, angle) {
    // Units stand shoulder-to-shoulder along 'angle', facing perpendicular
    const sp = 36, half = (count - 1) * sp / 2;
    const ca = Math.cos(angle), sa = Math.sin(angle);
    return Array.from({ length: count }, (_, i) => {
      const t = -half + i * sp;
      return { x: cx + ca * t, y: cy + sa * t };
    });
  }

  _wedgePos(cx, cy, count, angle) {
    // Tip of wedge points forward (perpendicular to spread line).
    // 'angle' = spread direction; forward = angle - π/2 (rotated 90° left)
    const ca = Math.cos(angle), sa = Math.sin(angle);
    const fa = Math.cos(angle - Math.PI / 2), fb = Math.sin(angle - Math.PI / 2);
    const pos = [{ x: cx, y: cy }];
    let rank = 1;
    while (pos.length < count) {
      const fwd = rank * 26, side = rank * 30;
      const bx = cx - fa * fwd, by = cy - fb * fwd; // back from tip
      if (pos.length < count) pos.push({ x: bx + ca * side,  y: by + sa * side  });
      if (pos.length < count) pos.push({ x: bx - ca * side,  y: by - sa * side  });
      rank++;
    }
    return pos;
  }

  _screenPos(cx, cy, count, angle) {
    // Wide skirmish spread with alternating depth stagger
    const sp = 50, half = (count - 1) * sp / 2;
    const ca = Math.cos(angle), sa = Math.sin(angle);
    const fa = Math.cos(angle - Math.PI / 2), fb = Math.sin(angle - Math.PI / 2);
    return Array.from({ length: count }, (_, i) => {
      const t   = -half + i * sp;
      const off = (i % 2 === 0 ? 0 : 20); // alternate depth
      return { x: cx + ca * t - fa * off, y: cy + sa * t - fb * off };
    });
  }

  moveSelectedTo(wx, wy) {
    const sel = this.units.filter(u => u.selected && !u.isEnemy);
    if (!sel.length) return;
    // Default angle = π/2 (vertical spread), same as old behaviour
    this._applyFormation(wx, wy, Math.PI / 2, sel);
  }

  // Draw a live formation preview while the player is drag-drawing a line
  _drawFmDragPreview(x1, y1, x2, y2) {
    const sel = this.units.filter(u => u.selected && !u.isEnemy);
    if (!sel.length) return;

    if (this.fmGfx) this.fmGfx.destroy();
    this.fmGfx = this._w(this.add.graphics().setDepth(5));

    const angle = Math.atan2(y2 - y1, x2 - x1);
    const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2;

    // The drag line
    this.fmGfx.lineStyle(2, 0xffdd44, 0.75).lineBetween(x1, y1, x2, y2);
    this.fmGfx.fillStyle(0xffdd44, 0.9).fillCircle(x1, y1, 4).fillCircle(x2, y2, 4);

    // Forward arrow (perpendicular to the line, pointing "ahead")
    const fwd = angle - Math.PI / 2;
    const aLen = 24;
    const ax = cx + Math.cos(fwd) * aLen, ay = cy + Math.sin(fwd) * aLen;
    this.fmGfx.lineStyle(1, 0xffdd44, 0.45).lineBetween(cx, cy, ax, ay);
    this.fmGfx.fillStyle(0xffdd44, 0.6)
      .fillTriangle(ax, ay,
        ax - Math.cos(fwd - 0.5) * 8, ay - Math.sin(fwd - 0.5) * 8,
        ax - Math.cos(fwd + 0.5) * 8, ay - Math.sin(fwd + 0.5) * 8);

    // Ghost unit circles at formation positions
    const positions = this.getFormationPositions(this.fmType, cx, cy, sel.length, angle);
    this.fmGfx.fillStyle(0xffdd44, 0.18);
    positions.forEach(p => this.fmGfx.fillCircle(p.x, p.y, 9));
  }

  // Apply formation centred at (cx,cy) spread along angle, then fade the markers
  _applyFormation(cx, cy, angle, sel) {
    if (!sel) sel = this.units.filter(u => u.selected && !u.isEnemy);
    if (!sel.length) return;
    const positions = this.getFormationPositions(this.fmType, cx, cy, sel.length, angle);
    if (this.fmGfx) this.fmGfx.destroy();
    this.fmGfx = this._w(this.add.graphics().setDepth(5));
    this.fmGfx.fillStyle(0xffdd44, 0.18);
    positions.forEach(p => this.fmGfx.fillCircle(p.x, p.y, 9));
    if (positions.length > 1) {
      this.fmGfx.lineStyle(1, 0xffdd44, 0.3);
      for (let i = 1; i < positions.length; i++)
        this.fmGfx.lineBetween(positions[i-1].x, positions[i-1].y, positions[i].x, positions[i].y);
    }
    this.tweens.add({ targets: this.fmGfx, alpha: 0, delay: 2000, duration: 500 });
    sel.forEach((u, i) => {
      u.moveTo = positions[i];
      u.taskType = null; u.taskBldgId = null; u.targetNode = null;
    });
  }

  // ─── Update ───────────────────────────────────────────────────────────────

  update(time, delta) {
    if (this.phase === 'LOSE' || this.phase === 'WIN') return;
    const dt = delta / 1000;
    if (this.phase === 'DAY' || this.phase === 'NIGHT') {
      this.timerMs -= delta;
      if (this.timerMs <= 0) {
        if (this.phase === 'DAY') this.beginNight();
        else this.endNight();
      }
      this.tickBuildings(delta, dt);
      this.tickUnits(time, dt);
      this._tickDeer(delta, dt);
      this._tickSheep(delta, dt);
      this._tickPastures(delta);
    }
    const secs = Math.max(0, Math.ceil(this.timerMs / 1000));
    this.timerText.setText(
      this.phase === 'DAY'   ? `☀ ${secs}s` :
      this.phase === 'NIGHT' ? `🌙 ${secs}s` : '');
    this.timerText.setColor(secs <= 10 ? '#ff6666' : (this.phase === 'NIGHT' ? '#aabbff' : '#ffdd88'));
    this._updateTimerBar();
    this._attractTimer += delta;
    if (this._attractTimer >= 25000) { this._attractTimer = 0; this.attractAdults(); }
    // Wild sheep respawn: one every 60s if below cap
    this._sheepRespawn -= delta;
    if (this._sheepRespawn <= 0) {
      this._sheepRespawn = 60000;
      if (this.sheep.filter(s => !s.isTamed).length < SHEEP_MAX) {
        const tx = Phaser.Math.Between(2, MAP_W - 3);
        const ty = Phaser.Math.Between(Math.floor(MAP_H * 0.52), MAP_H - 3);
        const terr = this.terrainData[ty]?.[tx] ?? T_GRASS;
        if (terr !== T_WATER && terr !== T_ROCK)
          this._spawnWildSheep(tx * TILE + TILE/2, MAP_OY + ty * TILE + TILE/2);
      }
    }
    // Deer respawn: one new deer every 40s if below cap, in heartland/scrubland
    this._deerRespawn -= delta;
    if (this._deerRespawn <= 0) {
      this._deerRespawn = 40000;
      if (this.deer.filter(d => !d.isDead).length < DEER_MAX) {
        const tx = Phaser.Math.Between(2, MAP_W - 3);
        const ty = Phaser.Math.Between(Math.floor(MAP_H * 0.50), MAP_H - 3);
        const terr = this.terrainData[ty]?.[tx] ?? T_GRASS;
        if (terr !== T_WATER && terr !== T_ROCK) {
          this._spawnDeer(tx * TILE + TILE / 2, MAP_OY + ty * TILE + TILE / 2);
        }
      }
    }
    this._barTimer += delta;
    if (this._barTimer >= 400) {
      this._barTimer = 0;
      this.buildings.forEach(b => {
        this.redrawBuildingBar(b);
        if (b.built && b.type === 'farm' && b.drawnStock !== b.stock) {
          b.drawnStock = b.stock;
          this.redrawBuilding(b);
        }
      });
    }
    // Roads — redraw only when roadMap changed
    if (this._roadsDirty) { this._roadsDirty = false; this._redrawRoads(); }
    // Fog of war — runs every frame
    this._recomputeVis();
    this._drawFog();
    // Minimap — updated at 2fps
    this._minimapTimer += delta;
    if (this._minimapTimer >= 500) { this._minimapTimer = 0; this._drawMinimap(); }
  }

  tickBuildings(delta) {
    // Population: houses/townhall spawn a child when 2 adults live there and capacity not full
    for (const b of this.buildings) {
      if (b.faction === 'enemy') continue;
      if (!BLDG[b.type].capacity || !b.built) continue;
      const residents = this.units.filter(u => u.homeBldgId === b.id && !u.isEnemy && u.hp > 0);
      const adults    = residents.filter(u => u.age >= 2);
      const hasMale   = adults.some(u => u.gender === 'male');
      const hasFemale = adults.some(u => u.gender === 'female');
      const capacity  = BLDG[b.type].capacity;
      const canSpawn  = hasMale && hasFemale && residents.length < capacity && b.respawnQueue.length === 0;
      if (!canSpawn) { b.spawnTimer = Math.max(0, b.spawnTimer - delta * 0.5); continue; }
      b.spawnTimer += delta;
      if (b.spawnTimer >= BLDG[b.type].spawnMs) {
        b.spawnTimer = 0;
        const cx = (b.tx + b.size / 2) * TILE, cy = MAP_OY + (b.ty + b.size / 2) * TILE;
        const child = this.spawnUnit('worker', cx + Phaser.Math.Between(-8, 8), cy + Phaser.Math.Between(-8, 8), false);
        child.homeBldgId = b.id; child.age = 0;
        // Child inherits gender randomly — already set by spawnUnit, no override needed
        this.showFloatText(cx, cy - 8, '👶 new child', '#ffeeaa');
        this.updateUI();
      }
    }

    // Barracks training
    for (const b of this.buildings) {
      if (b.faction === 'enemy') continue;
      if (b.type !== 'barracks' || !b.built || !b.trainQueue.length) continue;
      const item = b.trainQueue[0]; item.elapsed += delta;
      if (item.elapsed >= 15000) {
        b.trainQueue.shift();
        const w = this.units.find(u => u.id === item.workerId);
        if (w) w.hp = 0;
        const cx = (b.tx + 1) * TILE, cy = MAP_OY + (b.ty + 1) * TILE;
        const sol = this.spawnUnit('hoplite', cx + Phaser.Math.Between(-10, 10), cy + Phaser.Math.Between(-10, 10), false);
        sol.homeBldgId = b.id; sol.age = 2;
        this.showFloatText(cx, cy - 10, 'Hoplite ready!', '#4a9aee');
        this.updateUI();
      }
    }

    // Archery training
    for (const b of this.buildings) {
      if (b.faction === 'enemy') continue;
      if (b.type !== 'archery' || !b.built || !b.trainQueue.length) continue;
      const item = b.trainQueue[0]; item.elapsed += delta;
      if (item.elapsed >= 12000) {
        b.trainQueue.shift();
        const w = this.units.find(u => u.id === item.workerId);
        if (w) w.hp = 0;
        const cx = (b.tx + 1) * TILE, cy = MAP_OY + (b.ty + 1) * TILE;
        const arc = this.spawnUnit('archer', cx + Phaser.Math.Between(-10, 10), cy + Phaser.Math.Between(-10, 10), false);
        arc.homeBldgId = b.id; arc.age = 2;
        this.showFloatText(cx, cy - 10, 'Archer ready!', '#44aa77');
        this.updateUI();
      }
    }

    // Respawn queue — free, delayed respawn for units that died
    for (const b of this.buildings) {
      if (b.faction === 'enemy') continue;
      if (!b.built || !b.respawnQueue.length) continue;
      const item = b.respawnQueue[0];
      item.elapsed += delta;
      const delay = BLDG[b.type].spawnMs || 18000;
      if (item.elapsed >= delay) {
        b.respawnQueue.shift();
        const cx = (b.tx + b.size / 2) * TILE, cy = MAP_OY + (b.ty + b.size / 2) * TILE;
        const u = this.spawnUnit(item.type, cx + Phaser.Math.Between(-10, 10), cy + Phaser.Math.Between(-10, 10), false);
        u.homeBldgId = b.id;
        u.age = item.type === 'worker' ? 0 : 2; // workers born as children; soldiers respawn as adults
        const label = item.type === 'worker' ? '👶 child' : item.type === 'hoplite' ? '⚔ hoplite' : '🏹 archer';
        this.showFloatText(cx, cy - 10, `↺ ${label}`, '#aaddff');
        this.updateUI();
      }
    }
    this._tickEnemyBuildings(delta);
  }

  tickUnits(time, dt) {
    for (const u of this.units) {
      if (u.hp <= 0) continue;
      u.isEnemy ? this.tickEnemy(u, time, dt) : this.tickPlayer(u, time, dt);
      u.gfx.setPosition(u.x, u.y); this.redrawUnit(u);
    }
    this.units.filter(u => u.hp <= 0).forEach(u => {
      this.tweens.add({ targets: u.gfx, alpha: 0, duration: 280, onComplete: () => u.gfx.destroy() });
      if (u.homeBldgId && !u.isEnemy) {
        const home = this.buildings.find(b => b.id === u.homeBldgId);
        if (home && home.built) home.respawnQueue.push({ type: u.type, elapsed: 0 });
      }
      // Enemy workers respawn from their home building (soldiers must be re-trained)
      if (u.homeBldgId && u.isEnemy && u.type === 'worker') {
        const home = this.buildings.find(b => b.id === u.homeBldgId);
        if (home && home.built && (home.hp ?? 1) > 0) home.respawnQueue.push({ type: 'worker', elapsed: 0 });
      }
    });
    this.units = this.units.filter(u => u.hp > 0);
    this.updateEnemyCount();
  }

  tickEnemy(u, time, dt) {
    if (u.type === 'worker') { this._tickEnemyWorker(u, time, dt); return; }

    // ── Combat unit ──────────────────────────────────────────────────────────
    const players = this.units.filter(p => !p.isEnemy && p.hp > 0);
    let near = null, nd = Infinity;
    if (u.type === 'berserker' && players.length) {
      near = players.reduce((best, p) => p.hp > best.hp ? p : best, players[0]);
      nd = Phaser.Math.Distance.Between(u.x, u.y, near.x, near.y);
    } else {
      for (const p of players) { const d = Phaser.Math.Distance.Between(u.x,u.y,p.x,p.y); if (d<nd){nd=d;near=p;} }
    }
    // Attack if in range (any phase)
    if (near && nd <= u.range + 4) {
      if (time - u.lastAtk > 1000) {
        near.hp -= u.atk; u.lastAtk = time; this.flash(near);
        this.showFloatText(near.x, near.y - 14, `-${u.atk}`, '#ff6666');
      }
      return;
    }

    const vc = this._enemyVillageCenter();

    if (this.phase === 'DAY') {
      // Drift back toward village at half speed, attack any player unit that comes near
      const homeDist = Phaser.Math.Distance.Between(u.x, u.y, vc.x, vc.y);
      if (homeDist > 7 * TILE) {
        const angle = Math.atan2(vc.y - u.y, vc.x - u.x);
        const eTileX = Math.floor(u.x / TILE), eTileY = Math.floor((u.y - MAP_OY) / TILE);
        const eTerr  = this.terrainData[eTileY]?.[eTileX] ?? T_GRASS;
        const step   = u.speed * (TILE_SPD[Math.min(eTerr, TILE_SPD.length-1)] ?? 1.0) * 0.5 * dt;
        const nx = u.x + Math.cos(angle) * step, ny = u.y + Math.sin(angle) * step;
        if (!this.isBlocked(nx, ny)) { u.x = nx; u.y = ny; }
      } else {
        // Patrol: pick a new wander target near the village
        if (!u.moveTo || Phaser.Math.Distance.Between(u.x, u.y, u.moveTo.x, u.moveTo.y) < 12) {
          u.moveTo = { x: vc.x + Phaser.Math.Between(-48, 48), y: vc.y + Phaser.Math.Between(-48, 48) };
        }
        this.moveToward(u, u.moveTo.x, u.moveTo.y, 10, dt);
      }
      return;
    }

    // NIGHT — march south toward player base
    const chasing = u.type !== 'veteran' || (near && nd < u.range * 3);
    const tx = chasing && near && nd < u.range * 4 ? near.x : u.x;
    const ty = chasing && near && nd < u.range * 4 ? near.y : u.y + TILE * 3;
    const angle = Math.atan2(ty - u.y, tx - u.x);
    const eTileX = Math.floor(u.x / TILE), eTileY = Math.floor((u.y - MAP_OY) / TILE);
    const eTerr  = this.terrainData[eTileY]?.[eTileX] ?? T_GRASS;
    const eSpd   = TILE_SPD[Math.min(eTerr, TILE_SPD.length - 1)] ?? 1.0;
    const step   = u.speed * eSpd * dt;
    const nx = u.x + Math.cos(angle) * step, ny = u.y + Math.sin(angle) * step;
    if (!this.isBlocked(nx, ny)) { u.x = nx; u.y = ny; u.wallSide = 0; }
    else {
      const sides = u.wallSide === -1 ? [-1, 1] : [1, -1]; let moved = false;
      for (const side of sides) {
        const px = u.x + Math.cos(angle + side * Math.PI/2) * step;
        const py = u.y + Math.sin(angle + side * Math.PI/2) * step;
        if (!this.isBlocked(px, py)) { u.x = px; u.y = py; u.wallSide = side; moved = true; break; }
      }
      if (!moved) u.y += step * 0.4;
    }
    u.y = Math.max(MAP_OY + TILE, Math.min(MAP_BOTTOM - TILE, u.y));
  }

  // ─── Enemy AI helpers ─────────────────────────────────────────────────────

  _markEnemyBuildingRuined(b) {
    b.hp = 0; b.built = false; b.ruined = true;
    b.trainQueue = []; b.respawnQueue = [];
    // Evict any units homed here so they re-seek
    this.units.forEach(u => { if (u.homeBldgId === b.id) { u.homeBldgId = null; u.taskType = null; u.role = null; } });
    this.redrawBuilding(b);
    this.redrawBuildingBar(b);
  }

  _enemyVillageCenter() {
    const th = this.buildings.find(b => b.faction === 'enemy' && b.type === 'townhall' && b.built);
    if (th) return { x: (th.tx + 1) * TILE, y: MAP_OY + (th.ty + 1) * TILE };
    return { x: MAP_W / 2 * TILE, y: MAP_OY + 7 * TILE };
  }

  _enemyStorageMax() {
    const max = { food: 0, stone: 0, wood: 0 };
    for (const b of this.buildings) {
      if (b.faction !== 'enemy' || !b.built) continue;
      const s = BLDG[b.type].stores;
      if (!s) continue;
      for (const [r, n] of Object.entries(s)) max[r] = (max[r] || 0) + n;
    }
    return max;
  }

  _enemyAddRes(res, amt) {
    const cap = this._enemyStorageMax()[res] ?? 30;
    this.enemyRes[res] = Math.min(cap, (this.enemyRes[res] || 0) + amt);
  }

  _tickEnemyWorker(u, time, dt) {
    const carrying = this._totalCarrying(u);

    // Active rebuild task
    if (u.taskType === 'rebuild') {
      const b = this.buildings.find(b => b.id === u.taskBldgId);
      if (!b || !b.ruined) { u.taskType = null; u.replantTimer = 0; return; }
      const cx = (b.tx + b.size / 2) * TILE, cy = MAP_OY + (b.ty + b.size / 2) * TILE;
      if (this.moveToward(u, cx, cy, 28, dt)) return;
      u.replantTimer += dt;
      if (u.replantTimer >= 15) {
        const cost = BLDG[b.type].cost;
        if (cost) for (const [r, n] of Object.entries(cost))
          this.enemyRes[r] = Math.max(0, (this.enemyRes[r] || 0) - n);
        b.built = true; b.ruined = false; b.hp = b.maxHp;
        this.redrawBuilding(b); this.redrawBuildingBar(b);
        u.taskType = null; u.replantTimer = 0;
      }
      return;
    }

    // Deposit when full or carrying something with no target
    if (carrying >= u.carryMax || (carrying > 0 && !u.targetNode)) {
      const depot = this.buildings.find(b => b.faction === 'enemy' && b.built && BLDG[b.type].stores);
      if (depot) {
        const dx = (depot.tx + depot.size / 2) * TILE, dy = MAP_OY + (depot.ty + depot.size / 2) * TILE;
        if (!this.moveToward(u, dx, dy, UDEF.worker.gatherRange, dt)) {
          for (const r of ['food', 'stone', 'wood']) {
            if (u.carrying[r] > 0) { this._enemyAddRes(r, u.carrying[r]); u.carrying[r] = 0; }
          }
        }
        return;
      }
    }

    // Gather from assigned node
    if (u.targetNode) {
      const n = u.targetNode;
      if (n.stock <= 0 || carrying >= u.carryMax) { u.targetNode = null; return; }
      if (!this.moveToward(u, n.x, n.y, UDEF.worker.gatherRange, dt)) {
        if (time - u.lastGather > UDEF.worker.gatherRate) {
          const res = NODE_DEF[n.type]?.resource;
          const pick = Math.min(u.carryMax - carrying, n.stock);
          n.stock -= pick; u.carrying[res] += pick; u.lastGather = time;
          if (n.stock <= 0) {
            if (n.type === 'berry_bush') { n.dormantTimer = 2; }
            else if (n.type === 'small_tree') { n.sapling = true; n.saplingTimer = 3; }
            else if (n.type === 'large_tree') { n.sapling = true; n.saplingTimer = 5; }
          }
          this.redrawNode(n);
          if (carrying + pick >= u.carryMax || n.stock <= 0) u.targetNode = null;
        }
      }
      return;
    }

    // Prioritise rebuilding a ruined enemy building if resources allow
    if (time - u.lastSeek > 1500) {
      const ruined = this.buildings.find(b => b.faction === 'enemy' && b.ruined);
      if (ruined) {
        const cost = BLDG[ruined.type].cost;
        const canAfford = !cost || Object.entries(cost).every(([r, n]) => (this.enemyRes[r] || 0) >= n);
        if (canAfford) {
          u.taskType = 'rebuild'; u.taskBldgId = ruined.id; u.replantTimer = 0;
          return;
        }
      }
    }

    // Seek nearest node in enemy/neutral territory (top 55% of map)
    if (time - u.lastSeek > 1500) {
      u.lastSeek = time;
      const maxTy = Math.floor(MAP_H * 0.55);
      let best = null, bestD = Infinity;
      for (const n of this.resNodes) {
        if (n.stock <= 0) continue;
        const nty = Math.floor((n.y - MAP_OY) / TILE);
        if (nty > maxTy) continue;
        const d = Phaser.Math.Distance.Between(u.x, u.y, n.x, n.y);
        if (d < bestD) { bestD = d; best = n; }
      }
      if (best) { u.targetNode = best; return; }
    }

    // Wander near village
    const vc = this._enemyVillageCenter();
    if (!u.moveTo || Phaser.Math.Distance.Between(u.x, u.y, u.moveTo.x, u.moveTo.y) < 12)
      u.moveTo = { x: vc.x + Phaser.Math.Between(-40, 40), y: vc.y + Phaser.Math.Between(-40, 40) };
    this.moveToward(u, u.moveTo.x, u.moveTo.y, 10, dt);
  }

  _tickEnemyBuildings(delta) {
    for (const b of this.buildings) {
      if (b.faction !== 'enemy' || !b.built || (b.hp ?? 1) <= 0) continue;

      // Worker respawn queue (townhall / houses)
      if (BLDG[b.type].capacity && b.respawnQueue.length > 0) {
        const item = b.respawnQueue[0];
        item.elapsed += delta;
        if (item.elapsed >= (BLDG[b.type].spawnMs || 20000)) {
          b.respawnQueue.shift();
          const cx = (b.tx + b.size / 2) * TILE, cy = MAP_OY + (b.ty + b.size / 2) * TILE;
          const w = this.spawnUnit('worker', cx + Phaser.Math.Between(-10,10), cy + Phaser.Math.Between(-10,10), true);
          w.homeBldgId = b.id; w.age = 2;
        }
      }

      // Barracks: process training queue then auto-queue hoplites
      if (b.type === 'barracks') {
        if (b.trainQueue.length > 0) {
          const item = b.trainQueue[0];
          item.elapsed += delta;
          if (item.elapsed >= 15000) {
            b.trainQueue.shift();
            const cx = (b.tx + 1) * TILE, cy = MAP_OY + (b.ty + 1) * TILE;
            const sol = this.spawnUnit('hoplite', cx + Phaser.Math.Between(-10,10), cy + Phaser.Math.Between(-10,10), true);
            sol.homeBldgId = b.id;
          }
        } else if ((this.enemyRes.food || 0) >= 6) {
          this.enemyRes.food -= 6;
          b.trainQueue.push({ type: 'hoplite', elapsed: 0 });
        }
      }

      // Archery range: process training queue then auto-queue archers
      if (b.type === 'archery') {
        if (b.trainQueue.length > 0) {
          const item = b.trainQueue[0];
          item.elapsed += delta;
          if (item.elapsed >= 12000) {
            b.trainQueue.shift();
            const cx = (b.tx + 1) * TILE, cy = MAP_OY + (b.ty + 1) * TILE;
            const arc = this.spawnUnit('archer', cx + Phaser.Math.Between(-10,10), cy + Phaser.Math.Between(-10,10), true);
            arc.homeBldgId = b.id;
          }
        } else if ((this.enemyRes.food || 0) >= 5) {
          this.enemyRes.food -= 5;
          b.trainQueue.push({ type: 'archer', elapsed: 0 });
        }
      }
    }
  }

  _enemyBuildOrder() {
    const vc = this._enemyVillageCenter();
    const vcTx = Math.floor(vc.x / TILE), vcTy = Math.floor((vc.y - MAP_OY) / TILE);
    const eb = this.buildings.filter(b => b.faction === 'enemy' && b.built);
    const count = (t) => eb.filter(b => b.type === t).length;

    // Decide what to build (priority order)
    let toBuild = null;
    const er = this.enemyRes;
    if      (count('farm')     < 3 && (er.stone||0) >= 4 && (er.wood||0) >= 2) toBuild = 'farm';
    else if (count('barracks') < 2 && (er.stone||0) >= 5 && (er.wood||0) >= 3) toBuild = 'barracks';
    else if (count('archery')  < 1 && (er.stone||0) >= 5 && (er.wood||0) >= 4) toBuild = 'archery';
    else if (count('house')    < 3 && (er.stone||0) >= 3)                       toBuild = 'house';
    if (!toBuild) return;

    const cost = BLDG[toBuild].cost;
    const size = BLDG[toBuild].size;
    for (let attempt = 0; attempt < 40; attempt++) {
      const tx = vcTx + Phaser.Math.Between(-7, 7);
      const ty = vcTy + Phaser.Math.Between(-7, 7);
      if (ty < 1 || ty + size > MAP_H - 1) continue;
      if (!this.isFree(tx, ty, size)) continue;
      // Deduct resources
      if (cost) for (const [r, n] of Object.entries(cost)) this.enemyRes[r] = Math.max(0, (this.enemyRes[r]||0) - n);
      const b = this.placeBuiltBuilding(toBuild, tx, ty);
      b.faction = 'enemy';
      b.hp = b.maxHp = toBuild === 'barracks' ? 14 : toBuild === 'farm' ? 10 : 8;
      break;
    }
  }

  tickPlayer(u, time, dt) {
    if (u.type === 'worker') { this.tickWorker(u, time, dt); return; }
    if (u.moveTo) {
      const d=Phaser.Math.Distance.Between(u.x,u.y,u.moveTo.x,u.moveTo.y);
      if (d>3) { const a=Phaser.Math.Angle.Between(u.x,u.y,u.moveTo.x,u.moveTo.y); u.x+=Math.cos(a)*u.speed*dt; u.y+=Math.sin(a)*u.speed*dt; return; }
      u.x=u.moveTo.x; u.y=u.moveTo.y; u.moveTo=null;
    }
    // ── Archer hunting (runs during DAY too) ─────────────────────────────
    if (u.type === 'archer' && u.targetDeer) {
      const prey = this.deer.find(d => d.id === u.targetDeer && !d.isDead);
      if (prey) {
        u.lastDeerPos = { x: prey.x, y: prey.y }; // remember where deer was seen
        const dd = Phaser.Math.Distance.Between(u.x, u.y, prey.x, prey.y);
        if (dd <= u.range) {
          if (time - u.lastAtk > 1600) {
            prey.hp -= u.atk; u.lastAtk = time;
            this.showArrow(u.x, u.y, prey.x, prey.y);
            if (prey.hp <= 0) { this._killDeer(prey); u.targetDeer = null; }
          }
        } else {
          const a = Math.atan2(prey.y - u.y, prey.x - u.x);
          u.x += Math.cos(a) * u.speed * dt;
          u.y += Math.sin(a) * u.speed * dt;
        }
        return;
      }
      u.targetDeer = null; // target dead or missing — clear
    }

    if (this.phase!=='NIGHT') return;
    const enemies=this.units.filter(e=>e.isEnemy&&e.hp>0);
    let near=null,nd=Infinity;
    for (const e of enemies){const d=Phaser.Math.Distance.Between(u.x,u.y,e.x,e.y);if(d<nd){nd=d;near=e;}}
    if (!near) return;

    if (u.type === 'archer') {
      // Back off if enemy too close
      if (nd < 44) {
        const a = Math.atan2(u.y - near.y, u.x - near.x);
        u.x += Math.cos(a)*u.speed*dt; u.y += Math.sin(a)*u.speed*dt; return;
      }
      // Shoot if in range
      if (nd <= u.range) {
        if (time-u.lastAtk > 1400) {
          near.hp -= u.atk; u.lastAtk = time; this.flash(near);
          this.showArrow(u.x, u.y, near.x, near.y);
          this.showFloatText(near.x, near.y - 14, `-${u.atk}`, '#ff6666');
        }
        return;
      }
      // Advance toward enemy if too far away
      if (nd < u.range * 2.2) {
        const a = Phaser.Math.Angle.Between(u.x,u.y,near.x,near.y);
        u.x += Math.cos(a)*u.speed*0.7*dt; u.y += Math.sin(a)*u.speed*0.7*dt;
      }
      return;
    }

    // Hoplite
    if (nd<=u.range+4) {
      if (time-u.lastAtk>1000) {
        near.hp-=u.atk; u.lastAtk=time; this.flash(near);
        this.showFloatText(near.x, near.y - 14, `-${u.atk}`, '#ff6666');
      }
    } else if (nd<115) {
      const a=Phaser.Math.Angle.Between(u.x,u.y,near.x,near.y);
      u.x+=Math.cos(a)*u.speed*0.8*dt; u.y+=Math.sin(a)*u.speed*0.8*dt;
    } else {
      // No enemies nearby — attack enemy buildings if adjacent
      this._tryAttackBuilding(u, time);
    }
  }

  // Attack the nearest enemy building within melee range; called when no unit targets are close
  _tryAttackBuilding(u, time) {
    if (time - u.lastAtk < 1200) return;
    const attkRange = u.range + TILE;
    let bestB = null, bestD = Infinity;
    for (const b of this.buildings) {
      if (b.faction !== 'enemy' || !b.built || b.hp === undefined) continue;
      const bx = (b.tx + b.size / 2) * TILE, by = MAP_OY + (b.ty + b.size / 2) * TILE;
      const d  = Phaser.Math.Distance.Between(u.x, u.y, bx, by);
      if (d < attkRange && d < bestD) { bestD = d; bestB = b; }
    }
    if (!bestB) return;
    bestB.hp -= u.atk;
    u.lastAtk = time;
    const bx = (bestB.tx + bestB.size / 2) * TILE, by = MAP_OY + (bestB.ty + bestB.size / 2) * TILE;
    this.showFloatText(bx, by - 14, `-${u.atk}`, '#ff9944');
    if (bestB.hp <= 0) {
      this.showFloatText(bx, by - 24, 'Destroyed!', '#ffdd44');
      this._markEnemyBuildingRuined(bestB);
    }
  }

  _tickChild(u, dt) {
    // Children wander near home, can be manually moved but drift back
    if (u.moveTo) {
      const d = Phaser.Math.Distance.Between(u.x, u.y, u.moveTo.x, u.moveTo.y);
      if (d > 3) {
        const a = Phaser.Math.Angle.Between(u.x, u.y, u.moveTo.x, u.moveTo.y);
        u.x += Math.cos(a) * u.speed * 0.5 * dt;
        u.y += Math.sin(a) * u.speed * 0.5 * dt;
        return;
      }
      u.moveTo = null;
    }
    const home = this.buildings.find(b => b.id === u.homeBldgId);
    if (!home) return;
    const hx = (home.tx + home.size / 2) * TILE, hy = MAP_OY + (home.ty + home.size / 2) * TILE;
    const dist = Phaser.Math.Distance.Between(u.x, u.y, hx, hy);
    if (dist > TILE * 2.5) {
      u.moveTo = { x: hx + Phaser.Math.Between(-TILE, TILE), y: hy + Phaser.Math.Between(-TILE, TILE) };
    } else if (Math.random() < 0.004) {
      u.moveTo = { x: hx + Phaser.Math.Between(-TILE, TILE), y: hy + Phaser.Math.Between(-TILE, TILE) };
    }
  }

  tickWorker(u, time, dt) {
    // ── Child: lingers near home, no tasks ────────────────────────────────
    if (u.age === 0) { this._tickChild(u, dt); return; }

    // ── Task: collect floor piles → deposit at storeroom ──────────────────
    if (u.taskType === 'collect_floor') {
      const store = this.buildings.find(b => b.id === u.taskBldgId && b.built);
      if (!store || !BLDG[store.type].stores) { u.taskType = null; return; }
      const carrying = this._totalCarrying(u);
      if (carrying > 0) {
        // Walk to storeroom and deposit
        const sx = (store.tx+store.size/2)*TILE, sy = MAP_OY+(store.ty+store.size/2)*TILE;
        if (this.moveToward(u, sx, sy, 30, dt)) return;
        for (const r of ['food','stone','wood','wool']) {
          if (u.carrying[r] > 0) { this.addResource(r, u.carrying[r]); u.carrying[r] = 0; }
        }
        this.showGatherPop(u.x, u.y, 'food');
        // Look for more floor piles to collect
      }
      // Find nearest floor pile that has something
      const pile = this.floorPiles
        .filter(p => (p.food||0)+(p.stone||0)+(p.wood||0) > 0)
        .sort((a,b) => Phaser.Math.Distance.Between(u.x,u.y,a.x,a.y) - Phaser.Math.Distance.Between(u.x,u.y,b.x,b.y))[0];
      if (!pile || carrying >= u.carryMax) { if (!pile) u.taskType = null; return; }
      // Walk to pile
      if (this.moveToward(u, pile.x, pile.y, 18, dt)) return;
      // Pick up
      const space = u.carryMax - this._totalCarrying(u);
      for (const r of ['food','stone','wood','wool']) {
        const take = Math.min(pile[r]||0, space - this._totalCarrying(u));
        if (take > 0) { u.carrying[r] = (u.carrying[r]||0) + take; pile[r] -= take; }
      }
      this.redrawFloorPile(pile);
      return;
    }

    // ── Honour explicit player move commands before any role AI ──────────
    if (u.moveTo) {
      const d = Phaser.Math.Distance.Between(u.x, u.y, u.moveTo.x, u.moveTo.y);
      if (d > 3) {
        const a = Phaser.Math.Angle.Between(u.x, u.y, u.moveTo.x, u.moveTo.y);
        u.x += Math.cos(a) * u.speed * dt; u.y += Math.sin(a) * u.speed * dt;
        return;
      }
      u.moveTo = null;
    }

    // ── Hunter role: chase deer, kill, haul meat ──────────────────────────
    if (u.role === 'hunter') {
      // Deposit any meat already carried first
      if (u.carrying.food > 0) {
        const store = this.findNearestStoreroomFor(u, 'food') || this.findNearestStoreroom(u);
        if (store) {
          const sx = (store.tx+store.size/2)*TILE, sy = MAP_OY+(store.ty+store.size/2)*TILE;
          if (this.moveToward(u, sx, sy, 30, dt)) return;
          this.addResource('food', u.carrying.food);
          this.showGatherPop(u.x, u.y, 'food');
          u.carrying.food = 0;
        }
      }
      // Find current target deer
      let target = this.deer.find(d => d.id === u.targetDeer);
      // If target is gone, find nearest carcass with meat or nearest live deer
      if (!target || (target.isDead && target.meatLeft <= 0)) {
        const visible = d => {
          const tx = Math.floor(d.x / TILE), ty = Math.floor((d.y - MAP_OY) / TILE);
          return (this.visMap[ty]?.[tx] ?? 0) >= 1;
        };
        target = this.deer.find(d => d.isDead && d.meatLeft > 0 && visible(d))
               || this.deer.find(d => !d.isDead && visible(d));
        if (target) { u.targetDeer = target.id; u.lastDeerPos = { x: target.x, y: target.y }; }
      }
      if (!target) {
        // No deer visible — wander toward last known deer location
        if (u.lastDeerPos && !u.moveTo) {
          const d = Phaser.Math.Distance.Between(u.x, u.y, u.lastDeerPos.x, u.lastDeerPos.y);
          if (d > TILE * 2) {
            const jx = u.lastDeerPos.x + Phaser.Math.Between(-TILE*4, TILE*4);
            const jy = u.lastDeerPos.y + Phaser.Math.Between(-TILE*4, TILE*4);
            u.moveTo = { x: Phaser.Math.Clamp(jx, TILE, MAP_W*TILE-TILE),
                         y: Phaser.Math.Clamp(jy, MAP_OY+TILE, MAP_BOTTOM-TILE) };
          } else {
            u.lastDeerPos = null; // arrived — nothing here anymore
          }
        }
        return;
      }

      if (!target.isDead) {
        // Chase and melee-kill
        if (this.moveToward(u, target.x, target.y, DEER_ATK_RANGE, dt)) return;
        // In range — kill deer
        this._killDeer(target);
        u.targetDeer = target.id; // stay on carcass
      } else if (target.meatLeft > 0) {
        // Haul meat from carcass
        if (this.moveToward(u, target.x, target.y, 20, dt)) return;
        const take = Math.min(target.meatLeft, u.carryMax - this._totalCarrying(u));
        if (take > 0) {
          target.meatLeft -= take;
          u.carrying.food += take;
          this._redrawDeer(target);
          if (target.meatLeft <= 0) {
            target.gfx.destroy();
            this.deer = this.deer.filter(d => d !== target);
          }
        } else {
          // Carry full — deposit on next tick
        }
      }
      return;
    }

    // ── Shepherd role: feed pens, transfer, tame wild, shear, slaughter surplus ──
    if (u.role === 'shepherd') {
      // ① Deposit any carried wool at storeroom
      if (u.carrying.wool > 0) {
        const store = this.findNearestStoreroomFor(u, 'wool') || this.findNearestStoreroom(u);
        if (store) {
          const sx = (store.tx+store.size/2)*TILE, sy = MAP_OY+(store.ty+store.size/2)*TILE;
          if (this.moveToward(u, sx, sy, 30, dt)) return;
          this.addResource('wool', u.carrying.wool); u.carrying.wool = 0;
          this.showGatherPop(u.x, u.y, 'wool'); this.updateUI();
        }
        return;
      }

      // ② Feed an unfed pasture (highest priority productive task)
      const unfedPasture = this.buildings.find(b =>
        b.type === 'pasture' && b.built && !b.fedToday &&
        (b.males ?? 0) + (b.females ?? 0) + (b.lambs ?? 0) > 0
      );
      if (unfedPasture) {
        const needed = (unfedPasture.males ?? 0) + (unfedPasture.females ?? 0) + (unfedPasture.lambs ?? 0);
        if ((u.carrying.food ?? 0) < needed) {
          if ((this.resources.food ?? 0) < needed) { /* skip — no food available */ }
          else {
            const store = this.findNearestStoreroomFor(u, 'food') || this.findNearestStoreroom(u);
            if (store) {
              const sx = (store.tx+store.size/2)*TILE, sy = MAP_OY+(store.ty+store.size/2)*TILE;
              if (this.moveToward(u, sx, sy, 30, dt)) return;
              this.resources.food -= needed; u.carrying.food = needed; this.updateUI();
              return;
            }
          }
        } else {
          const ppx = (unfedPasture.tx+unfedPasture.size/2)*TILE;
          const ppy = MAP_OY+(unfedPasture.ty+unfedPasture.size/2)*TILE;
          if (this.moveToward(u, ppx, ppy, 30, dt)) return;
          u.carrying.food -= needed;
          unfedPasture.fedToday = true;
          this.showFloatText(ppx, ppy - 12, `fed (${needed})`, '#eeffcc');
          this.updateUI();
          return;
        }
      }

      // ③ Transfer one adult from full pen to underpopulated pen
      if (u.carryingSheep) {
        const destPen = this.buildings.find(b => b.id === u.sheepDestId && b.built);
        if (!destPen) {
          // Destination gone — drop into any pasture
          const anyPen = this.buildings.find(b => b.type === 'pasture' && b.built);
          if (anyPen) {
            if (u.carryingSheep === 'male') anyPen.males = (anyPen.males ?? 0) + 1;
            else anyPen.females = (anyPen.females ?? 0) + 1;
            this.redrawBuildingBar(anyPen);
          }
          u.carryingSheep = null; u.sheepDestId = null;
          return;
        }
        const epx = (destPen.tx+destPen.size/2)*TILE, epy = MAP_OY+(destPen.ty+destPen.size/2)*TILE;
        if (this.moveToward(u, epx, epy, 30, dt)) return;
        if (u.carryingSheep === 'male') destPen.males = (destPen.males ?? 0) + 1;
        else destPen.females = (destPen.females ?? 0) + 1;
        u.carryingSheep = null; u.sheepDestId = null;
        this.redrawBuildingBar(destPen);
        return;
      }
      {
        const fullPen = this.buildings.find(b => b.type === 'pasture' && b.built
          && (b.males??0)+(b.females??0)+(b.lambs??0) >= BLDG.pasture.sheepCap);
        const emptyPen = fullPen && this.buildings.find(b =>
          b.type === 'pasture' && b.built && b !== fullPen &&
          (b.males??0)+(b.females??0)+(b.lambs??0) < 3
        );
        if (fullPen && emptyPen) {
          const fpx = (fullPen.tx+fullPen.size/2)*TILE, fpy = MAP_OY+(fullPen.ty+fullPen.size/2)*TILE;
          if (this.moveToward(u, fpx, fpy, 30, dt)) return;
          let gender;
          if ((fullPen.males ?? 0) > 1) { fullPen.males--; gender = 'male'; }
          else if ((fullPen.females ?? 0) > 0) { fullPen.females--; gender = 'female'; }
          else return;
          u.carryingSheep = gender; u.sheepDestId = emptyPen.id;
          this.redrawBuildingBar(fullPen);
          return;
        }
      }

      // ④ Find a visible wool-ready wild sheep to shear
      let shearTarget = null;
      {
        let bd = Infinity;
        for (const s of this.sheep) {
          if (!s.woolReady) continue;
          const tx = Math.floor(s.x/TILE), ty = Math.floor((s.y-MAP_OY)/TILE);
          if ((this.visMap[ty]?.[tx] ?? 0) === 0) continue;
          const d = Phaser.Math.Distance.Between(u.x, u.y, s.x, s.y);
          if (d < bd) { bd = d; shearTarget = s; }
        }
      }
      if (shearTarget) {
        u.lastSheepPos = { x: shearTarget.x, y: shearTarget.y };
        u.targetSheep = shearTarget.id;
        if (this.moveToward(u, shearTarget.x, shearTarget.y, 22, dt)) return;
        shearTarget.woolReady = false; shearTarget.woolTimer = 0;
        this._redrawSheep(shearTarget);
        u.carrying.wool += 1; this.updateUI();
        this.showFloatText(shearTarget.x, shearTarget.y - 16, '🧶 sheared', '#e8e8cc');
        return;
      }

      // ⑤ No shearable sheep visible — wander toward last known location
      if (u.lastSheepPos && !u.moveTo) {
        const d = Phaser.Math.Distance.Between(u.x, u.y, u.lastSheepPos.x, u.lastSheepPos.y);
        if (d > TILE * 2) {
          const jx = u.lastSheepPos.x + Phaser.Math.Between(-TILE*4, TILE*4);
          const jy = u.lastSheepPos.y + Phaser.Math.Between(-TILE*4, TILE*4);
          u.moveTo = { x: Phaser.Math.Clamp(jx, TILE, MAP_W*TILE-TILE),
                       y: Phaser.Math.Clamp(jy, MAP_OY+TILE, MAP_BOTTOM-TILE) };
        } else {
          u.lastSheepPos = null;
        }
      }

      // ⑥ Tame a wild sheep for an underpopulated pasture
      const needsPasture = this.buildings.find(b => b.type === 'pasture' && b.built
        && (b.males??0) + (b.females??0) + (b.lambs??0) < 3);
      if (needsPasture && !u.moveTo) {
        let target = this.sheep.find(s => s.id === u.targetSheep && !s.isTamed);
        if (!target) {
          // Prefer the gender the pasture needs most (seed with ≥1 of each)
          const needsMale = (needsPasture.males ?? 0) === 0;
          let bd = Infinity;
          for (const s of this.sheep) {
            if (s.isTamed) continue;
            const tx = Math.floor(s.x/TILE), ty = Math.floor((s.y-MAP_OY)/TILE);
            if ((this.visMap[ty]?.[tx] ?? 0) === 0) continue;
            const d = Phaser.Math.Distance.Between(u.x, u.y, s.x, s.y);
            const genderBonus = (needsMale && s.gender === 'male') ? -TILE * 5 : 0;
            if (d + genderBonus < bd) { bd = d + genderBonus; target = s; }
          }
        }
        if (target) {
          u.targetSheep = target.id;
          u.lastSheepPos = { x: target.x, y: target.y };
          if ((u.carrying.food ?? 0) < SHEEP_TAME_COST) {
            if ((this.resources.food ?? 0) < SHEEP_TAME_COST) return;
            const store = this.findNearestStoreroomFor(u, 'food') || this.findNearestStoreroom(u);
            if (!store) return;
            const sx = (store.tx+store.size/2)*TILE, sy = MAP_OY+(store.ty+store.size/2)*TILE;
            if (this.moveToward(u, sx, sy, 30, dt)) return;
            const take = Math.min(SHEEP_TAME_COST, this.resources.food ?? 0);
            this.resources.food -= take; u.carrying.food += take; this.updateUI();
            return;
          }
          if (this.moveToward(u, target.x, target.y, 22, dt)) return;
          u.carrying.food -= SHEEP_TAME_COST; this.updateUI();
          target.isTamed = true; target.followUnit = u.id;
          this._redrawSheep(target);
          this.showFloatText(target.x, target.y - 16, 'tamed!', '#ffeeaa');
          const ppx = (needsPasture.tx+needsPasture.size/2)*TILE;
          const ppy = MAP_OY+(needsPasture.ty+needsPasture.size/2)*TILE;
          if (this.moveToward(u, ppx, ppy, 32, dt)) return;
          // Arrived — deposit as adult with wild sheep's gender
          target.gfx.destroy();
          this.sheep = this.sheep.filter(s => s !== target);
          if (target.gender === 'male') needsPasture.males = (needsPasture.males ?? 0) + 1;
          else needsPasture.females = (needsPasture.females ?? 0) + 1;
          this.showFloatText(ppx, ppy - 12, 'sheep arrived!', '#ccffaa');
          this.redrawBuildingBar(needsPasture);
          u.targetSheep = null; u.carrying.food = 0;
        }
      }

      // ⑦ Slaughter surplus adults (≥ sheepCap) — lowest priority
      const surplusPasture = this.buildings.find(b => b.type === 'pasture' && b.built
        && (b.males ?? 0) + (b.females ?? 0) >= BLDG.pasture.sheepCap);
      if (surplusPasture) {
        const px = (surplusPasture.tx+surplusPasture.size/2)*TILE;
        const py = MAP_OY+(surplusPasture.ty+surplusPasture.size/2)*TILE;
        if (this.moveToward(u, px, py, 32, dt)) return;
        this._slaughterSheep(surplusPasture);
        u.carrying.food += SHEEP_MEAT; this.updateUI();
        return;
      }
      return;
    }

    // ── Training states (no movement needed) ──────────────────────────────
    if (u.taskType === 'training') return;

    if (u.taskType === 'train') {
      const b = this.buildings.find(b => b.id===u.taskBldgId && b.built && b.type==='barracks');
      if (!b) { u.taskType = null; return; }
      const cx=(b.tx+b.size/2)*TILE, cy=MAP_OY+(b.ty+b.size/2)*TILE;
      if (this.moveToward(u, cx, cy, 24, dt)) return;
      b.trainQueue.push({ workerId: u.id, elapsed: 0 });
      u.taskType = 'training'; u.gfx.setAlpha(0.3); return;
    }
    if (u.taskType === 'train_archer') {
      const b = this.buildings.find(b => b.id===u.taskBldgId && b.built && b.type==='archery');
      if (!b) { u.taskType = null; return; }
      const cx=(b.tx+b.size/2)*TILE, cy=MAP_OY+(b.ty+b.size/2)*TILE;
      if (this.moveToward(u, cx, cy, 24, dt)) return;
      b.trainQueue.push({ workerId: u.id, elapsed: 0 });
      u.taskType = 'training'; u.gfx.setAlpha(0.3); return;
    }

    // ── Replant (no resources involved) ──────────────────────────────────
    if (u.taskType === 'replant') {
      const b = this.buildings.find(b => b.id===u.taskBldgId && b.built && b.type==='farm');
      if (!b) { u.taskType = null; return; }
      const cx=(b.tx+b.size/2)*TILE, cy=MAP_OY+(b.ty+b.size/2)*TILE;
      if (this.moveToward(u, cx, cy, 28, dt)) return;
      u.replantTimer += dt;
      if (u.replantTimer >= 18) {
        b.stock = b.maxStock; u.taskType = 'harvest_farm'; u.replantTimer = 0;
        this.showFloatText(cx, MAP_OY + b.ty*TILE - 8, 'Field replanted!', '#88dd44');
      }
      return;
    }

    // ── Deposit if carrying resources (all non-build tasks) ───────────────
    const nonBuildTask = u.taskType !== 'build' && u.taskType !== 'harvest_farm';
    if (nonBuildTask && this._totalCarrying(u) > 0) {
      const res = Object.keys(u.carrying).find(k => u.carrying[k] > 0);
      // Always recalculate — don't cache a stale/full/destroyed storeroom
      const store = this.findNearestStoreroomFor(u, res) || this.findNearestStoreroom(u);
      u.depositBldgId = null; // clear cache; using local `store` directly
      if (store && store.built) {
        const cx=(store.tx+store.size/2)*TILE, cy=MAP_OY+(store.ty+store.size/2)*TILE;
        if (this.moveToward(u, cx, cy, 30, dt)) return;
        for (const r of ['food','stone','wood','wool']) {
          if (u.carrying[r] > 0) { this.addResource(r, u.carrying[r]); u.carrying[r] = 0; }
        }
        this.showGatherPop(u.x, u.y, res);
      } else {
        // No storeroom — drop resources as a floor pile
        this.dropOnFloor(u.x, u.y, { ...u.carrying });
        for (const r of ['food','stone','wood','wool']) u.carrying[r] = 0;
        u.role = null; u.taskType = null;
        this.showFloatText(u.x, u.y - 14, 'Dropped!', '#ff8844');
      }
      return;
    }

    // ── Task: build ────────────────────────────────────────────────────────
    if (u.taskType === 'build') {
      const b = this.buildings.find(b => b.id === u.taskBldgId);
      if (!b || b.built) { u.taskType = null; return; }
      const cx = (b.tx+b.size/2)*TILE, cy = MAP_OY+(b.ty+b.size/2)*TILE;

      // Phase 1: deliver resources
      const resLeft = Object.entries(b.resNeeded).filter(([,n]) => n > 0);
      if (resLeft.length > 0) {
        const [needRes, needAmt] = resLeft[0];
        if (u.carrying[needRes] > 0) {
          // Walk to site, deposit what we're carrying
          if (this.moveToward(u, cx, cy, 28, dt)) return;
          const deliver = Math.min(u.carrying[needRes], b.resNeeded[needRes] || 0);
          u.carrying[needRes] -= deliver;
          b.resNeeded[needRes] = (b.resNeeded[needRes] || 0) - deliver;
          if (b.resNeeded[needRes] <= 0) delete b.resNeeded[needRes];
          if (this._totalCarrying(u) > 0) {
            // Still carrying something else; deposit remaining at storeroom next tick
            u.depositBldgId = null;
          }
          return;
        }
        // Need to fetch resources from storeroom
        if ((this.resources[needRes] || 0) <= 0) return; // none available, wait
        const store = this.findNearestStoreroomFor(u, needRes) || this.findNearestStoreroom(u);
        if (!store) return;
        const sx = (store.tx+store.size/2)*TILE, sy = MAP_OY+(store.ty+store.size/2)*TILE;
        if (this.moveToward(u, sx, sy, 30, dt)) return;
        const pick = Math.min(u.carryMax, needAmt, this.resources[needRes] || 0);
        if (pick > 0) {
          this.resources[needRes] -= pick;
          u.carrying[needRes] = (u.carrying[needRes] || 0) + pick;
          this.updateUI();
        }
        return;
      }

      // Phase 2: construct (resources all delivered)
      if (this.moveToward(u, cx, cy, 28, dt)) return;
      b.buildWork -= dt;
      if (b.buildWork <= 0) { this.completeBuildingConstruction(b); u.taskType = null; }
      return;
    }

    // ── Task: harvest farm ─────────────────────────────────────────────────
    if (u.taskType === 'harvest_farm') {
      const b = this.buildings.find(b => b.id===u.taskBldgId && b.built && b.type==='farm');
      if (!b) { u.taskType = null; return; }
      if (b.stock <= 0) { u.taskType = 'replant'; u.replantTimer = 0; return; }
      // Food storage full and not already carrying → switch to replant if needed, else idle
      if (!this.hasStorageSpace('food') && this._totalCarrying(u) === 0) {
        const emptyFarm = this.buildings.find(f => f.type==='farm' && f.built && f.faction !== 'enemy' && f.stock <= 0);
        if (emptyFarm) { u.taskType = 'replant'; u.taskBldgId = emptyFarm.id; u.replantTimer = 0; }
        else { u.taskType = null; }
        return;
      }
      // If full, go deposit
      if (this._totalCarrying(u) >= u.carryMax) {
        u.taskType = null; // deposit logic runs next tick
        return;
      }
      const cx=(b.tx+b.size/2)*TILE, cy=MAP_OY+(b.ty+b.size/2)*TILE;
      if (this.moveToward(u, cx, cy, 28, dt)) return;
      if (time - u.lastGather > UDEF.worker.gatherRate) {
        const pick = Math.min(u.carryMax - this._totalCarrying(u), b.stock);
        b.stock -= pick; u.carrying.food += pick; u.lastGather = time;
        this.showGatherPop(u.x, u.y, 'food');
        if (this._totalCarrying(u) >= u.carryMax || b.stock <= 0) {
          u.taskType = null; // deposit then re-seek
        }
      }
      return;
    }

    // ── Targeted node (manual assignment or auto) ─────────────────────────
    if (u.targetNode) {
      const n = u.targetNode;
      const res = NODE_DEF[n.type]?.resource;
      const storageFull = res && !this.hasStorageSpace(res) && this._totalCarrying(u) === 0;
      if (n.stock <= 0 || this._totalCarrying(u) >= u.carryMax || storageFull) {
        u.targetNode = null;
      } else {
        if (this.moveToward(u, n.x, n.y, UDEF.worker.gatherRange, dt)) return;
        if (time - u.lastGather > UDEF.worker.gatherRate) {
          const pick = Math.min(u.carryMax - this._totalCarrying(u), n.stock);
          n.stock -= pick; u.carrying[res] += pick;
          u.lastGather = time;
          if (n.stock <= 0) {
            if (n.type === 'berry_bush') { n.dormantTimer = 2; }
            else if (n.type === 'small_tree') { n.sapling = true; n.saplingTimer = 3; }
            else if (n.type === 'large_tree') { n.sapling = true; n.saplingTimer = 5; }
          }
          this.showGatherPop(u.x, u.y, res); this.redrawNode(n);
          if (this._totalCarrying(u) >= u.carryMax || n.stock <= 0) u.targetNode = null;
        }
        return;
      }
    }

    // ── Manual move ───────────────────────────────────────────────────────
    if (u.moveTo) {
      const d = Phaser.Math.Distance.Between(u.x, u.y, u.moveTo.x, u.moveTo.y);
      if (d > 3) {
        const a = Phaser.Math.Angle.Between(u.x, u.y, u.moveTo.x, u.moveTo.y);
        u.x += Math.cos(a)*u.speed*dt; u.y += Math.sin(a)*u.speed*dt; return;
      }
      u.moveTo = null;
    }

    // ── Idle: seek next task by role ──────────────────────────────────────
    if (this.phase !== 'DAY' && this.phase !== 'NIGHT') return;
    if (!u.role) {
      if (time - u.lastSeek > 2000) this.pickRole(u, time);
      return;
    }
    // Youths can't do adult-only roles — clear and re-pick
    if (u.age < 2 && (u.role === 'builder' || u.role === 'woodcutter' || u.role === 'miner')) {
      u.role = null; return;
    }
    if (u.role === 'builder') {
      if (time - u.lastSeek > 1500) { u.lastSeek = time; this.seekBuilderTask(u); }
    } else if (u.role === 'farmer') {
      if (time - u.lastSeek > 1500) { u.lastSeek = time; this.seekFarmerTask(u); }
    } else if (u.role === 'forager') {
      if (!this.hasStorageSpace('food')) { u.role = null; return; }
      if (!u.targetNode && time - u.lastSeek > 1200) { u.lastSeek = time; this.seekNodeTask(u, ['berry_bush']); }
    } else if (u.role === 'woodcutter') {
      if (!this.hasStorageSpace('wood')) { u.role = null; return; }
      if (!u.targetNode && time - u.lastSeek > 1200) {
        u.lastSeek = time;
        this.seekNodeTask(u, ['small_tree','large_tree']);
        // No tree in sight — check for wood piles to collect (fallen branches near trees)
        if (!u.targetNode && !u.moveTo) {
          const pile = this.floorPiles.find(p => {
            if ((p.wood ?? 0) <= 0) return false;
            const tx = Math.floor(p.x / TILE), ty = Math.floor((p.y - MAP_OY) / TILE);
            return (this.visMap[ty]?.[tx] ?? 0) >= 1;
          });
          if (pile) u.targetWoodPile = pile.id;
        }
      }
      // Walk to and collect a targeted wood pile
      if (u.targetWoodPile && this._totalCarrying(u) < u.carryMax) {
        const pile = this.floorPiles.find(p => p.id === u.targetWoodPile && (p.wood ?? 0) > 0);
        if (!pile) { u.targetWoodPile = null; }
        else {
          const tx = Math.floor(pile.x / TILE), ty = Math.floor((pile.y - MAP_OY) / TILE);
          if ((this.visMap[ty]?.[tx] ?? 0) === 0) { u.targetWoodPile = null; } // fogged out
          else if (this.moveToward(u, pile.x, pile.y, 18, dt)) { /* walking */ }
          else {
            const take = Math.min(pile.wood, u.carryMax - this._totalCarrying(u));
            if (take > 0) { pile.wood -= take; u.carrying.wood += take; this.redrawFloorPile(pile); }
            u.targetWoodPile = null;
          }
        }
      }
    } else if (u.role === 'miner') {
      if (!this.hasStorageSpace('stone')) { u.role = null; return; }
      if (!u.targetNode && time - u.lastSeek > 1200) { u.lastSeek = time; this.seekNodeTask(u, ['small_boulder','large_boulder']); }
    } else if (u.role === 'shepherd') {
      // shepherd logic runs in its own block (handled above in tickWorker)
      // Drop role if no pasture and no visible sheep at all
      const hasPasture = this.buildings.some(b => b.type === 'pasture' && b.built);
      const hasVisibleSheep = this.sheep.some(s => {
        const tx = Math.floor(s.x/TILE), ty = Math.floor((s.y-MAP_OY)/TILE);
        return (this.visMap[ty]?.[tx] ?? 0) >= 1;
      });
      if (!hasPasture && !hasVisibleSheep) { u.role = null; return; }
    }
  }

  moveToward(u, tx, ty, threshold, dt) {
    const d = Phaser.Math.Distance.Between(u.x, u.y, tx, ty);
    if (d <= threshold) return false;
    const a = Math.atan2(ty - u.y, tx - u.x);
    const tileX = Math.floor(u.x / TILE), tileY = Math.floor((u.y - MAP_OY) / TILE);
    const spd = this._tileSpd(tileX, tileY);
    u.x += Math.cos(a) * u.speed * spd * dt;
    u.y += Math.sin(a) * u.speed * spd * dt;
    // Accumulate footfall — only for non-enemy units on non-paved tiles
    if (!u.isEnemy && tileX >= 0 && tileX < MAP_W && tileY >= 0 && tileY < MAP_H) {
      if ((this.roadMap[tileY]?.[tileX] ?? ROAD_NONE) !== ROAD_PAVED) {
        const prev = this.trafficMap[tileY][tileX];
        this.trafficMap[tileY][tileX] = Math.min(prev + 1, DESIRE_THRESHOLD * 4);
        // Promote to desire path the moment threshold is crossed
        if (prev < DESIRE_THRESHOLD && this.trafficMap[tileY][tileX] >= DESIRE_THRESHOLD) {
          this.roadMap[tileY][tileX] = ROAD_DESIRE;
          this._roadsDirty = true;
        }
      }
    }
    return true;
  }

  flash(unit) { this.tweens.add({targets:unit.gfx,alpha:{from:0.12,to:1},duration:130}); }

  showArrow(x1, y1, x2, y2) {
    const g = this._w(this.add.graphics().setDepth(7));
    g.lineStyle(2, 0xdddd88, 0.9).lineBetween(x1, y1, x2, y2);
    g.fillStyle(0xdddd88, 0.9).fillCircle(x2, y2, 3);
    this.tweens.add({ targets: g, alpha: 0, duration: 200, onComplete: () => g.destroy() });
  }

  _updateTimerBar() {
    const gfx = this.timerBarGfx;
    if (!gfx) return;
    gfx.clear();
    const isDay = this.phase === 'DAY', isNight = this.phase === 'NIGHT';
    if (!isDay && !isNight) return;
    const W = SCREEN_W;
    const duration = isNight ? NIGHT_DURATION : DAY_DURATION;
    const ratio = Math.max(0, this.timerMs / duration);
    const secs  = Math.max(0, Math.ceil(this.timerMs / 1000));
    const barColor = secs <= 10 ? 0xff4444 : (isNight ? 0x334488 : 0xddaa33);
    gfx.fillStyle(0x000000, 0.5).fillRect(0, MAP_OY - 4, W, 4);
    gfx.fillStyle(barColor, 0.85).fillRect(0, MAP_OY - 4, W * ratio, 4);
  }

  checkResult() {
    const enemies = this.units.filter(u => u.isEnemy && u.hp > 0);
    const defenders = this.units.filter(u => !u.isEnemy && u.hp > 0 && (u.type === 'hoplite' || u.type === 'archer'));
    if (defenders.length === 0 && enemies.length > 0) { this.endGame('LOSE'); return; }
    if (enemies.length === 0) this.nextDay();
  }

  // ─── Phase flow ───────────────────────────────────────────────────────────

  _setNightOverlay(on) {
    if (!this.nightOverlay) return;
    this.tweens.killTweensOf(this.nightOverlay);
    this.tweens.add({ targets: this.nightOverlay, fillAlpha: on ? 0.48 : 0, duration: 1400, ease: 'Sine.easeInOut' });
  }

  beginNight() {
    this.phase = 'NIGHT';
    this.timerMs = NIGHT_DURATION;
    this.showPhaseMessage(`Night falls.`, 0x6677cc);
    this._setNightOverlay(true);
    this.updateUI();
  }

  endNight() {
    this.phase = 'RESULT';
    this._setNightOverlay(false);
    this.showPhaseMessage(`Dawn — Day ${this.day + 1}.`, 0xddaa44);
    this.time.delayedCall(1800, () => {
      this.day++;
      this.phase = 'DAY';
      this.timerMs = DAY_DURATION;
      this.ageUpUnits();
      this.consumeFood();
      this.applyDayBonus();
      this.updateUI();
    });
  }

  ageUpUnits() {
    for (const u of this.units) {
      if (u.isEnemy || u.type !== 'worker') continue;
      u.age++;
      if (u.age === 1) this.showFloatText(u.x, u.y - 18, '→ youth', '#ffeeaa');
      if (u.age === 2) this.showFloatText(u.x, u.y - 18, '→ adult', '#ffdd44');
    }
  }

  attractAdults() {
    // Houses missing a male or female adult try to recruit the right gender from a surplus building
    for (const b of this.buildings) {
      if (b.faction === 'enemy' || !b.built || !BLDG[b.type].capacity) continue;
      const bAdults  = this.units.filter(u => u.homeBldgId === b.id && !u.isEnemy && u.hp > 0 && u.age >= 2);
      const hasMale  = bAdults.some(u => u.gender === 'male');
      const hasFem   = bAdults.some(u => u.gender === 'female');
      if (hasMale && hasFem) continue; // already has a breeding pair
      const wantGender = !hasMale ? 'male' : 'female';

      // Find the nearest building with a surplus (>2 adults) that has the needed gender
      let donor = null, donorDist = Infinity;
      for (const db of this.buildings) {
        if (db.id === b.id || !db.built || !BLDG[db.type].capacity) continue;
        const dbAdults = this.units.filter(u => u.homeBldgId === db.id && !u.isEnemy && u.hp > 0 && u.age >= 2);
        if (dbAdults.length <= 2) continue;
        // Prefer a donor that actually has the wanted gender to spare
        const hasWanted = dbAdults.filter(u => u.gender === wantGender).length > 1;
        if (!hasWanted) continue;
        const d = Phaser.Math.Distance.Between(
          (b.tx+b.size/2)*TILE, MAP_OY+(b.ty+b.size/2)*TILE,
          (db.tx+db.size/2)*TILE, MAP_OY+(db.ty+db.size/2)*TILE);
        if (d < donorDist) { donorDist = d; donor = db; }
      }
      if (!donor) continue;
      const donorAdults = this.units.filter(u => u.homeBldgId === donor.id && !u.isEnemy && u.hp > 0 && u.age >= 2);
      // Pick the most idle adult of the wanted gender
      const candidates = donorAdults.filter(u => u.gender === wantGender);
      const mover = candidates.find(u => !u.taskType && !u.moveTo) || candidates[candidates.length - 1];
      if (!mover) continue;
      mover.homeBldgId = b.id;
      mover.taskType = null; mover.role = null; mover.targetNode = null;
      const cx = (b.tx + b.size/2)*TILE, cy = MAP_OY + (b.ty + b.size/2)*TILE;
      mover.moveTo = { x: cx + Phaser.Math.Between(-12, 12), y: cy + Phaser.Math.Between(-12, 12) };
      this.showFloatText(cx, cy - 12, '→ moved in', '#ffddaa');
    }
  }

  consumeFood() {
    const eaters = this.units.filter(u => !u.isEnemy && u.hp > 0);
    if (!eaters.length) return;
    const need = eaters.length * 3;
    const have = this.resources.food || 0;
    if (have >= need) {
      this.resources.food -= need;
      this.updateUI();
      return;
    }
    // Not enough food — feed as many as possible, rest starve
    const fedCount   = Math.floor(have / 3);
    const starveCount = eaters.length - fedCount;
    this.resources.food = 0;
    // Kill random unfed units (shuffle then take first N)
    const order = [...eaters].sort(() => Math.random() - 0.5);
    for (let i = 0; i < starveCount; i++) order[i].hp = 0;
    this.updateUI();
    this.showPhaseMessage(
      starveCount === eaters.length ? 'All units starved!' : `${starveCount} unit${starveCount > 1 ? 's' : ''} starved!`,
      0xff3333);
    // Check immediate loss (everyone dead)
    this.time.delayedCall(200, () => {
      const alive = this.units.filter(u => !u.isEnemy && u.hp > 0).length;
      if (alive === 0) this.endGame('LOSE');
    });

    // Enemy food upkeep — same 3-food-per-unit rule
    const enemyEaters = this.units.filter(u => u.isEnemy && u.hp > 0);
    if (enemyEaters.length) {
      const eNeed = enemyEaters.length * 3;
      if ((this.enemyRes.food || 0) >= eNeed) {
        this.enemyRes.food -= eNeed;
      } else {
        const eFed = Math.floor((this.enemyRes.food || 0) / 3);
        const eStarve = enemyEaters.length - eFed;
        this.enemyRes.food = 0;
        const eOrder = [...enemyEaters].sort(() => Math.random() - 0.5);
        for (let i = 0; i < eStarve; i++) eOrder[i].hp = 0;
      }
    }
  }

  _trySpreadNode(src, type) {
    const srcTx = Math.floor(src.x / TILE);
    const srcTy = Math.floor((src.y - MAP_OY) / TILE);
    const dx = Phaser.Math.Between(-2, 2), dy = Phaser.Math.Between(-2, 2);
    if (dx === 0 && dy === 0) return false;
    const tx = srcTx + dx, ty = srcTy + dy;
    if (tx < 1 || tx >= MAP_W - 1 || ty < 1 || ty >= MAP_H - 1) return false;
    const terr = this.terrainData[ty]?.[tx];
    if (terr === T_WATER || terr === T_ROCK || terr === T_SAND) return false;
    const biome = this._biomAt(tx, ty);
    if (type === 'berry_bush' && biome > 1) return false;       // heartland/scrubland only
    if ((type === 'small_tree' || type === 'large_tree') && biome > 2) return false; // not badlands
    if ((this.mapData[ty]?.[tx] ?? 0) >= 98) return false;
    const nx = tx * TILE + TILE / 2, ny = MAP_OY + ty * TILE + TILE / 2;
    if (this.resNodes.some(n => Phaser.Math.Distance.Between(nx, ny, n.x, n.y) < 56)) return false;
    const def = NODE_DEF[type];
    const isSapling = type === 'small_tree' || type === 'large_tree';
    const node = { id: this.getId(), type, x: nx, y: ny,
      stock: 0, maxStock: def.stock, gfx: null, labelObj: null,
      dormantTimer: type === 'berry_bush' ? 2 : 0,
      sapling: isSapling,
      saplingTimer: type === 'small_tree' ? 3 : type === 'large_tree' ? 5 : 0 };
    this.resNodes.push(node);
    this.redrawNode(node);
    return true;
  }

  applyDayBonus() {
    this._ageSheepInPastures();
    this._tickRoads();
    this.addResource('stone', 6);
    this.buildings.filter(b => b.type === 'farm' && b.built && b.faction !== 'enemy')
      .forEach(b => { b.stock = Math.min(b.maxStock, b.stock + Math.ceil(b.maxStock * 0.5)); });
    // Enemy farms: harvest directly into enemyRes.food
    this.buildings.filter(b => b.type === 'farm' && b.built && b.faction === 'enemy' && (b.hp ?? 1) > 0)
      .forEach(b => {
        const harvest = Math.ceil(b.maxStock * 0.5);
        b.stock = 0; // workers don't harvest individually — output goes direct to pool
        this._enemyAddRes('food', harvest);
      });
    // Enemy AI build order (once per day)
    this._enemyBuildOrder();
    const berryCount = this.resNodes.filter(n => n.type === 'berry_bush').length;
    const treeCount  = this.resNodes.filter(n => n.type === 'small_tree' || n.type === 'large_tree').length;
    this.resNodes.forEach(n => {
      if (n.type === 'berry_bush') {
        if (n.dormantTimer > 0) {
          n.dormantTimer--;
          if (n.dormantTimer === 0) n.stock = n.maxStock;
        } else if (n.stock <= 0) {
          n.dormantTimer = 2; // shouldn't reach here normally (set on harvest), but safety net
        } else {
          if (berryCount < 30 && n.stock > n.maxStock * 0.5 && Math.random() < 0.10)
            this._trySpreadNode(n, 'berry_bush');
        }
      } else if (n.type === 'small_tree' || n.type === 'large_tree') {
        if (n.saplingTimer > 0) {
          n.saplingTimer--;
          if (n.saplingTimer === 0) { n.sapling = false; n.stock = n.maxStock; }
        } else if (n.stock <= 0) {
          n.sapling = true; // safety net
          n.saplingTimer = n.type === 'small_tree' ? 3 : 5;
        } else {
          if (treeCount < 60 && Math.random() < 0.12)
            this._trySpreadNode(n, n.type);
        }
      } else {
        // Boulders: partial natural replenishment
        n.stock = Math.min(n.maxStock, n.stock + Math.ceil(n.maxStock * 0.4));
      }
      this.redrawNode(n);
    });
  }

  endDay() {
    this.phase = 'RESULT';
    this._setNightOverlay(false);
    this.showPhaseMessage(`Day ${this.day} ends peacefully.`, 0xddaa44);
    this.time.delayedCall(2500, () => {
      this.day++; this.phase = 'DAY'; this.timerMs = DAY_DURATION;
      this.ageUpUnits();
      this.consumeFood();
      this.applyDayBonus();
      this.showPhaseMessage(`Day ${this.day} — Gather and build.`, 0xddaa44);
      this.updateUI();
    });
  }

  nextDay() {
    this.phase = 'RESULT';
    this.nightsSurvived++;
    if (this.nightsSurvived >= WIN_NIGHTS) { this.endGame('WIN'); return; }
    this.showPhaseMessage(`Dawn breaks! Day ${this.day + 1} begins.`, 0xddaa44);
    this._setNightOverlay(false);
    this.time.delayedCall(3000, () => {
      this.day++; this.phase = 'DAY'; this.timerMs = DAY_DURATION;
      this.ageUpUnits();
      this.consumeFood();
      this.applyDayBonus();
      this.showPhaseMessage(`Day ${this.day} — Gather and build.`, 0xddaa44);
      this.updateUI();
    });
  }

  endGame(result) {
    this.phase=result;
    this.showPhaseMessage(result==='WIN'?'VICTORY — the polis stands!':'The polis has fallen...',result==='WIN'?0xffdd44:0xff4444);
    this.time.delayedCall(4500,()=>{
      this.cameras.main.fadeOut(500,0,0,0);
      this.cameras.main.once('camerafadeoutcomplete',()=>this.scene.start('MenuScene'));
    });
  }

  // ─── Input ────────────────────────────────────────────────────────────────

  setupInput() {
    this.input.mouse?.disableContextMenu();
    // Enable tracking of a second touch point (Phaser only tracks 1 by default)
    this.input.addPointer(1);
    this.hoverGfx = this._w(this.add.graphics().setDepth(7));
    this.dragGfx  = this.add.graphics().setDepth(8);
    this.cameras.main.ignore(this.dragGfx); // screen-space selection box — UI cam only

    // Map of pointerId → {x, y} for all currently-down pointers
    this._touches = new Map();

    this.input.on('pointerdown', ptr => {
      this._touches.set(ptr.id, { x: ptr.x, y: ptr.y });
      if (this._touches.size === 1) {
        this._ptrDownX = ptr.x; this._ptrDownY = ptr.y; this._dragging = false;
      } else {
        // Second finger down — cancel any single-finger drag in progress
        this._dragging = false; this._fmDragging = false; this._fmDragStart = null;
        this.dragGfx.clear();
        if (this.fmGfx) { this.fmGfx.destroy(); this.fmGfx = null; }
      }
    });

    this.input.on('pointermove', ptr => {
      this._touches.set(ptr.id, { x: ptr.x, y: ptr.y });

      if (this._touches.size >= 2) {
        // ── Two-finger: pinch-zoom + pan ──────────────────────────────────
        const [a, b] = [...this._touches.values()];
        const dist = Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y);
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        if (this._pinch.active) {
          const cam = this.cameras.main;
          if (this._pinch.dist > 1) {
            cam.setZoom(Phaser.Math.Clamp(cam.zoom * (dist / this._pinch.dist), 0.3, 3));
          }
          cam.scrollX -= (mx - this._pinch.mx) / cam.zoom;
          cam.scrollY -= (my - this._pinch.my) / cam.zoom;
        }
        this._pinch.active = true;
        this._pinch.dist = dist; this._pinch.mx = mx; this._pinch.my = my;
        return;
      }

      // ── Single finger / mouse ─────────────────────────────────────────
      this._pinch.active = false;
      if (this.roadMode && ptr.isDown && ptr.leftButtonDown() && ptr.y >= MAP_OY) {
        // Drag-paint road tiles
        const t = this.tileAt(ptr.worldX, ptr.worldY);
        if (t) this._paintRoad(t.tx, t.ty);
      } else if (!this.bldgType && !this.roadMode && ptr.isDown && ptr.leftButtonDown() && ptr.y >= MAP_OY) {
        const d = Phaser.Math.Distance.Between(ptr.x, ptr.y, this._ptrDownX, this._ptrDownY);
        if (d > TAP_DIST) {
          // Multiple units selected → formation drag; otherwise box-select
          if (this.selIds.size > 1) {
            if (!this._fmDragStart) {
              const sp = this.cameras.main.getWorldPoint(this._ptrDownX, this._ptrDownY);
              this._fmDragStart = { x: sp.x, y: sp.y };
            }
            this._fmDragging = true;
            this.dragGfx.clear();
            this._drawFmDragPreview(this._fmDragStart.x, this._fmDragStart.y, ptr.worldX, ptr.worldY);
          } else {
            this._dragging = true;
            const rx = Math.min(ptr.x, this._ptrDownX), ry = Math.min(ptr.y, this._ptrDownY);
            const rw = Math.abs(ptr.x - this._ptrDownX), rh = Math.abs(ptr.y - this._ptrDownY);
            this.dragGfx.clear()
              .fillStyle(0x4a7acc, 0.12).fillRect(rx, ry, rw, rh)
              .lineStyle(1, 0x4a7acc, 0.75).strokeRect(rx, ry, rw, rh);
            this.hoverGfx.clear();
          }
        }
      } else if (this.bldgType && this.phase === 'DAY' && !ptr.isDown) {
        this.drawBuildGhost(ptr);
      }
    });

    this.input.on('pointerup', ptr => {
      this._touches.delete(ptr.id);
      this._pinch.active = false;
      this.dragGfx.clear();
      // Ignore lifts while a second finger was involved
      if (this._touches.size >= 1) return;

      // ── Formation drag release — commit the line ──────────────────────────
      if (this._fmDragging) {
        this._fmDragging = false;
        if (this._fmDragStart) {
          const x1 = this._fmDragStart.x, y1 = this._fmDragStart.y;
          const x2 = ptr.worldX, y2 = ptr.worldY;
          const angle = Math.atan2(y2 - y1, x2 - x1);
          const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2;
          this._applyFormation(cx, cy, angle);
          this._fmDragStart = null;
        }
        return;
      }

      if (this._dragging) {
        this._dragging = false;
        const cam = this.cameras.main;
        const tl = cam.getWorldPoint(Math.min(ptr.x, this._ptrDownX), Math.min(ptr.y, this._ptrDownY));
        const br = cam.getWorldPoint(Math.max(ptr.x, this._ptrDownX), Math.max(ptr.y, this._ptrDownY));
        this.boxSelect(tl.x, tl.y, br.x, br.y, ptr.event?.shiftKey ?? false);
        return;
      }
      if (ptr.y < MAP_OY) return;
      const wasTap = Phaser.Math.Distance.Between(ptr.x, ptr.y, this._ptrDownX, this._ptrDownY) < TAP_DIST;
      if (!wasTap) return;
      const wx = ptr.worldX, wy = ptr.worldY;
      if (ptr.rightButtonReleased()) { if (this.selIds.size > 0) this.moveSelectedTo(wx, wy); return; }
      if (this.roadMode) { const t = this.tileAt(wx, wy); if (t) this._paintRoad(t.tx, t.ty); return; }
      if (this.bldgType && this.phase === 'DAY') { const t = this.tileAt(wx, wy); if (t) this.placeBuilding(t.tx, t.ty); return; }
      const hit = this.unitAt(wx, wy);
      if (hit && !hit.isEnemy) { this.selectUnit(hit.id, ptr.event?.shiftKey ?? false); return; }
      // Tap on a deer — assign selected workers/archers as hunters
      const deerHit = this.findDeerAt(wx, wy);
      if (deerHit && this.selIds.size > 0) { this.assignHunters(deerHit); return; }
      // Tap on a wild sheep — assign selected workers as shepherds
      const sheepHit = this.findSheepAt(wx, wy);
      if (sheepHit && !sheepHit.isTamed && this.selIds.size > 0) { this.assignShepherds(sheepHit); return; }
      const bldg = this.findBuildingAt(wx, wy);
      if (this.selIds.size > 0) {
        if (bldg && this.orderWorkersToBuilding(bldg)) return;
        const node = this.findNodeAt(wx, wy);
        if (node && this.orderWorkersToNode(node)) return;
        // Tap storeroom with space → assign idle workers to collect floor piles
        if (bldg && bldg.built && BLDG[bldg.type].stores && this.floorPiles.length > 0) {
          this._triggerCollect(bldg); return;
        }
        this.moveSelectedTo(wx, wy);
      } else {
        // No units selected — select building for info/demolish
        if (bldg) { this.selectedBuilding = bldg; this.updateUI(); return; }
        if (this.selectedBuilding) { this.selectedBuilding = null; this.updateUI(); }
      }
    });

    this.input.keyboard?.on('keydown-ESC', () => { this.bldgType = null; this.roadMode = false; this.deselect(); this.selectedBuilding = null; this.hoverGfx.clear(); this.updateUI(); });
    this.input.keyboard?.on('keydown-A', () => this.units.filter(u => !u.isEnemy).forEach(u => this.selectUnit(u.id, true)));
    this.input.keyboard?.on('keydown-F', () => { const sel = this.units.filter(u => u.selected && !u.isEnemy); if (sel.length) this.moveSelectedTo((MAP_W / 2) * TILE, MAP_OY + (MAP_H - 10) * TILE); });
  }

  drawBuildGhost(ptr) {
    if (!this.bldgType || ptr.y < MAP_OY) { this.hoverGfx?.clear(); return; }
    const tile = this.tileAt(ptr.worldX, ptr.worldY); if (!tile) { this.hoverGfx?.clear(); return; }
    const def = BLDG[this.bldgType];
    const free    = this.isFree(tile.tx, tile.ty, def.size);
    const canAfford = !def.cost || this.afford(def.cost);
    // Green = free + affordable, amber = free but can't afford yet, red = tile blocked
    const col = !free ? 0xff4444 : canAfford ? 0xffffff : 0xffaa44;
    const s = def.size * TILE, px = tile.tx * TILE, py = MAP_OY + tile.ty * TILE;
    this.hoverGfx.clear().fillStyle(col, 0.15).fillRect(px+1, py+1, s-2, s-2)
      .lineStyle(2, col, 0.6).strokeRect(px+1, py+1, s-2, s-2);
  }

  // ─── UI ───────────────────────────────────────────────────────────────────

  createUI() {
    const W = SCREEN_W;   // UI is laid out in screen space, not world space
    const _ui = o => { this.cameras.main.ignore(o); return o; };

    // Topbar background + bottom border
    _ui(this.add.rectangle(W/2, MAP_OY/2, W, MAP_OY, 0x0e1520).setDepth(10));
    _ui(this.add.graphics().setDepth(10))
      .lineStyle(1, 0xc8a030, 0.4).lineBetween(0, MAP_OY, W, MAP_OY);
    // Timer progress bar (drawn at bottom of topbar, updated in _updateTimerBar)
    this.timerBarGfx = _ui(this.add.graphics().setDepth(10));

    // ── Row 1: stat text (y centred at 11) ──────────────────────────────────
    const r1 = 3;
    const ts = { fontSize:'11px', color:'#ffffff', fontFamily:'monospace' };
    this.foodText  = _ui(this.add.text(  6, r1, '', { ...ts, color:'#88ee88' }).setDepth(11));
    this.stoneText = _ui(this.add.text( 68, r1, '', { ...ts, color:'#aaaacc' }).setDepth(11));
    this.woodText  = _ui(this.add.text(130, r1, '', { ...ts, color:'#cc9944' }).setDepth(11));
    this.woolText  = _ui(this.add.text(196, r1, '', { ...ts, color:'#e8e0c0' }).setDepth(11));
    this.dayInfo   = _ui(this.add.text(246, r1, '', { ...ts, color:'#c8a030' }).setDepth(11));
    this.workerInfo= _ui(this.add.text(294, r1, '', { ...ts, color:'#cc9944' }).setDepth(11));
    this.enemyCount= _ui(this.add.text(360, r1, '', { ...ts, color:'#ee8888' }).setDepth(11));
    this.selInfo   = _ui(this.add.text(406, r1, '', { ...ts, color:'#dddd88' }).setDepth(11));
    this.timerText = _ui(this.add.text(W-6,  r1, '', { ...ts, fontSize:'12px' }).setOrigin(1,0).setDepth(11));
    this.phaseTag  = _ui(this.add.text(W-6, r1+14, '', { fontSize:'8px', color:'#aaaacc', fontFamily:'monospace' }).setOrigin(1,0).setDepth(11));

    // ── Row 2: buttons (centred at y = MAP_OY-btnH/2-4) ─────────────────────
    const bldgEntries = Object.entries(BLDG).filter(([, def]) => !def.hidden);
    const nTotal = bldgEntries.length + FM_TYPES.length + 2; // bldg + fm + ALL + X
    const btnH   = 30;
    const btnCY  = MAP_OY - btnH/2 - 4;
    // Fit all buttons in W; clamp between 30 and 68 px wide
    const btnW   = Math.min(68, Math.max(30, Math.floor((W - 30) / nTotal)));
    const wide   = btnW >= 48; // show full label + cost only when wide enough
    let bx = btnW / 2 + 4;

    bldgEntries.forEach(([type, def]) => {
      const btn = _ui(this.add.rectangle(bx, btnCY, btnW - 2, btnH, def.color, 0.85)
        .setDepth(11).setInteractive({ useHandCursor: true }));
      const lbl = wide ? def.label : def.label[0];
      _ui(this.add.text(bx, btnCY - (wide ? 6 : 0), lbl,
        { fontSize: wide?'9px':'10px', color:'#fff', fontFamily:'monospace' })
        .setOrigin(0.5).setDepth(12));
      if (wide) {
        const costStr = Object.entries(def.cost).map(([r,n]) =>
          `${n}${r==='stone'?'⛏':r==='wood'?'🪵':'🌾'}`).join(' ');
        _ui(this.add.text(bx, btnCY + 7, costStr, { fontSize:'7px', color:'#ccccee', fontFamily:'monospace' })
          .setOrigin(0.5).setDepth(12));
      }
      btn.on('pointerdown', () => { this.bldgType = this.bldgType===type?null:type; this.hoverGfx.clear(); this.updateUI(); });
      this.buildingBtns[type] = btn; bx += btnW;
    });

    _ui(this.add.graphics().setDepth(11)).lineStyle(1, 0xffffff, 0.12)
      .lineBetween(bx+2, btnCY-12, bx+2, btnCY+12);
    bx += 8;

    FM_TYPES.forEach((type, i) => {
      const fx = bx + i * btnW;
      const btn = _ui(this.add.rectangle(fx, btnCY, btnW - 2, btnH, 0x223344, 0.9)
        .setDepth(11).setInteractive({ useHandCursor: true }));
      _ui(this.add.text(fx, btnCY, FM_LABELS[i],
        { fontSize: wide?'8px':'9px', color:'#aaccdd', fontFamily:'monospace' })
        .setOrigin(0.5).setDepth(12));
      btn.on('pointerdown', () => {
        this.fmType = type; this.updateUI();
        const sel = this.units.filter(u => u.selected && !u.isEnemy);
        if (sel.length) {
          const ax = sel.reduce((s,u)=>s+u.x,0)/sel.length, ay = sel.reduce((s,u)=>s+u.y,0)/sel.length;
          this.moveSelectedTo(ax, ay);
        }
      });
      this.fmBtns[type] = btn;
    });
    bx += FM_TYPES.length * btnW + 6;

    _ui(this.add.graphics().setDepth(11)).lineStyle(1, 0xffffff, 0.12)
      .lineBetween(bx, btnCY-12, bx, btnCY+12);
    bx += 6;

    const aBtn = _ui(this.add.rectangle(bx, btnCY, btnW - 2, btnH, 0x334422, 0.9)
      .setDepth(11).setInteractive({ useHandCursor: true }));
    _ui(this.add.text(bx, btnCY, wide ? 'ALL' : '☰',
      { fontSize:'10px', color:'#aaddaa', fontFamily:'monospace' }).setOrigin(0.5).setDepth(12));
    aBtn.on('pointerdown', () => this.units.filter(u => !u.isEnemy).forEach(u => this.selectUnit(u.id, true)));
    bx += btnW;

    const xBtn = _ui(this.add.rectangle(bx, btnCY, btnW - 2, btnH, 0x332211, 0.9)
      .setDepth(11).setInteractive({ useHandCursor: true }));
    _ui(this.add.text(bx, btnCY, '✕', { fontSize:'12px', color:'#ddaaaa', fontFamily:'monospace' })
      .setOrigin(0.5).setDepth(12));
    xBtn.on('pointerdown', () => { this.bldgType = null; this.roadMode = false; this.deselect(); this.hoverGfx.clear(); this.updateUI(); });
    bx += btnW + 6;

    // ── Road-paint tool ───────────────────────────────────────────────────
    this.roadBtn = _ui(this.add.rectangle(bx, btnCY, btnW - 2, btnH, 0x5a4820, 0.9)
      .setDepth(11).setInteractive({ useHandCursor: true }));
    _ui(this.add.text(bx, btnCY - (wide ? 6 : 0), wide ? 'Road' : '🛤',
      { fontSize: wide ? '9px' : '11px', color: '#ddcc88', fontFamily: 'monospace' }).setOrigin(0.5).setDepth(12));
    if (wide) {
      _ui(this.add.text(bx, btnCY + 7, '1⛏/tile',
        { fontSize: '7px', color: '#ccccee', fontFamily: 'monospace' }).setOrigin(0.5).setDepth(12));
    }
    this.roadBtn.on('pointerdown', () => {
      this.roadMode = !this.roadMode;
      this.bldgType = null;
      this.hoverGfx.clear();
      this.updateUI();
    });

    this.phaseMsg = _ui(this.add.text(W/2, SCREEN_H/2 - 20, '', {
      fontSize:'22px', color:'#ffffff', fontFamily:'monospace', stroke:'#000000', strokeThickness:4,
    }).setOrigin(0.5).setDepth(20).setAlpha(0));

    // ── Building info panel (shown when a building is tapped with no units selected) ──
    const pW = 220, pH = 52, pX = W/2, pY = SCREEN_H - pH/2 - 6;
    this.bldgPanel = {
      bg:    _ui(this.add.rectangle(pX, pY, pW, pH, 0x0e1520, 0.92).setDepth(18).setStrokeStyle(1, 0xc8a030, 0.7).setVisible(false)),
      label: _ui(this.add.text(pX - pW/2 + 8, pY - 14, '', { fontSize:'10px', color:'#ddcc88', fontFamily:'monospace' }).setDepth(19).setVisible(false)),
      info:  _ui(this.add.text(pX - pW/2 + 8, pY,      '', { fontSize:'9px',  color:'#aaaacc', fontFamily:'monospace' }).setDepth(19).setVisible(false)),
    };
    // Action button (Demolish or Cancel construction)
    const abX = pX + pW/2 - 48, abY = pY - 2;
    this.bldgPanel.actionBtn = _ui(this.add.rectangle(abX, abY, 74, 26, 0x661111, 0.9)
      .setDepth(19).setStrokeStyle(1, 0xff6644, 0.6).setInteractive({ useHandCursor: true }).setVisible(false));
    this.bldgPanel.actionLbl = _ui(this.add.text(abX, abY, 'Demolish',
      { fontSize:'9px', color:'#ffaaaa', fontFamily:'monospace' }).setOrigin(0.5).setDepth(20).setVisible(false));
    this.bldgPanel.actionBtn.on('pointerdown', () => {
      if (this.selectedBuilding) this.demolishBuilding(this.selectedBuilding);
    });
    // Close button
    const cbX = pX + pW/2 - 8, cbY = pY - pH/2 + 8;
    this.bldgPanel.closeBtn = _ui(this.add.text(cbX, cbY, '✕',
      { fontSize:'10px', color:'#887766', fontFamily:'monospace' }).setOrigin(0.5).setDepth(20)
      .setInteractive({ useHandCursor: true }).setVisible(false));
    this.bldgPanel.closeBtn.on('pointerdown', () => { this.selectedBuilding = null; this.updateUI(); });

    // ── Minimap (bottom-right corner) — portrait map 80×128 → scale to ~70×112 ─
    const mmW = 70, mmH = 112, mmPad = 6;
    this._mmX = W - mmW - mmPad;
    this._mmY = SCREEN_H - mmH - mmPad;
    this._mmW = mmW;
    this._mmH = mmH;
    this.minimapGfx = _ui(this.add.graphics().setDepth(14));
    // Transparent hit zone for click-to-pan
    const mmZone = _ui(this.add.zone(
      this._mmX + mmW / 2, this._mmY + mmH / 2, mmW, mmH
    ).setInteractive());
    mmZone.on('pointerdown', ptr => {
      const fx = (ptr.x - this._mmX) / mmW;
      const fy = (ptr.y - this._mmY) / mmH;
      this.cameras.main.pan(
        fx * MAP_W * TILE,
        MAP_OY + fy * MAP_H * TILE,
        300, 'Sine.easeOut'
      );
    });

    this.updateUI();
  }

  updateUI() {
    const wc=this.units.filter(u=>u.type==='worker'&&!u.isEnemy&&u.hp>0).length;
    const popCap = this.buildings.filter(b => !b.faction && b.built && BLDG[b.type].capacity)
                     .reduce((s, b) => s + BLDG[b.type].capacity, 0);
    const cap = popCap; // used below for workerInfo
    const sm = this.storageMax;
    const upkeep = this.units.filter(u => !u.isEnemy && u.hp > 0).length * 3;
    const foodWarn = upkeep > 0 && this.resources.food < upkeep;
    this.foodText.setText(`🌾${this.resources.food}/${sm.food||0} -${upkeep}`);
    this.foodText.setColor(foodWarn ? '#ff6655' : '#88ee88');
    this.stoneText.setText(`⛏${this.resources.stone}/${sm.stone||0}`);
    this.woodText.setText(`🪵${this.resources.wood}/${sm.wood||0}`);
    if (this.woolText) {
      const woolCap = sm.wool || 0;
      this.woolText.setText(woolCap > 0 ? `🧶${this.resources.wool||0}/${woolCap}` : '');
    }
    this.dayInfo.setText(this.phase === 'NIGHT' ? `🌙 Night ${this.day}` : `☀ Day ${this.day}`);
    // Phase tag
    if (this.phaseTag) {
      if (this.phase === 'NIGHT') {
        this.phaseTag.setText('🌙 NIGHT').setColor('#8899ee');
      } else if (this.phase === 'DAY') {
        this.phaseTag.setText('☀ DAY').setColor('#ddaa44');
      } else {
        this.phaseTag.setText('');
      }
    }
    const adults  = this.units.filter(u => !u.isEnemy && u.hp > 0 && u.type === 'worker' && u.age >= 2).length;
    const youths  = this.units.filter(u => !u.isEnemy && u.hp > 0 && u.type === 'worker' && u.age === 1).length;
    const children= this.units.filter(u => !u.isEnemy && u.hp > 0 && u.type === 'worker' && u.age === 0).length;
    const popStr  = children > 0 ? `${adults}+${youths}+${children}` : youths > 0 ? `${adults}+${youths}` : `${adults}`;
    this.workerInfo.setText(`👥${popStr}/${cap}`);
    this.updateEnemyCount(); this.updateSelInfo();
    Object.entries(this.buildingBtns).forEach(([type,btn])=>{btn.setAlpha(this.bldgType===type?1:0.8);btn.setStrokeStyle(this.bldgType===type?2:0,0xffdd44);});
    Object.entries(this.fmBtns).forEach(([type,btn])=>{btn.setAlpha(this.fmType===type?1:0.7);btn.setStrokeStyle(this.fmType===type?2:0,0x88ccdd);});
    if (this.roadBtn) { this.roadBtn.setAlpha(this.roadMode?1:0.8); this.roadBtn.setStrokeStyle(this.roadMode?2:0,0xddcc44); }
    this._updateBldgPanel();
  }

  _updateBldgPanel() {
    const p = this.bldgPanel; if (!p) return;
    const b = this.selectedBuilding;
    const show = !!b;
    p.bg.setVisible(show); p.label.setVisible(show); p.info.setVisible(show);
    p.actionBtn.setVisible(show); p.actionLbl.setVisible(show); p.closeBtn.setVisible(show);
    if (!b) return;
    const def = BLDG[b.type];
    p.label.setText(def.label + (b.built ? '' : '  [building...]'));
    // Build info line
    let infoStr = '';
    if (!b.built) {
      // Show what still needs to be delivered
      const needs = Object.entries(b.resNeeded || {}).filter(([,n]) => n > 0)
        .map(([r,n]) => `${n}${r==='stone'?'⛏':r==='wood'?'🪵':'🌾'}`).join(' ');
      infoStr = needs ? `Needs: ${needs}` : 'Workers building...';
    } else {
      const residents = this.units.filter(u => u.homeBldgId === b.id && !u.isEnemy && u.hp > 0);
      if (def.capacity) infoStr = `👥 ${residents.length}/${def.capacity}`;
      if (def.stores) {
        const parts = Object.entries(def.stores).map(([r,cap]) =>
          `${r[0].toUpperCase()}:${this.resources[r]||0}/${cap}`).join(' ');
        infoStr = (infoStr ? infoStr + '  ' : '') + parts;
      }
    }
    p.info.setText(infoStr);
    // Pasture: show sheep count + slaughter option
    if (b.type === 'pasture' && b.built) {
      const males = b.males ?? 0, females = b.females ?? 0, lambs = b.lambs ?? 0;
      const adults = males + females;
      const fedMark = b.fedToday ? '✓' : '○';
      infoStr = `🐑 ${males}♂ ${females}♀  ${lambs} lambs / ${BLDG.pasture.sheepCap}  fed:${fedMark}  🧶${this.resources.wool||0}`;
      p.info.setText(infoStr);
      if (adults >= 1) {
        p.actionLbl.setText('Slaughter');
        p.actionBtn.setFillStyle(0x552200).setStrokeStyle(1, 0xff6622, 0.7).setVisible(true);
        p.actionLbl.setColor('#ffcc88').setVisible(true);
        p.actionBtn.off('pointerdown').on('pointerdown', () => this._slaughterSheep(b));
        p.closeBtn.setVisible(true);
        return;
      }
    }
    // Action button label
    const actionLabel = b.built ? 'Demolish' : 'Cancel';
    p.actionLbl.setText(actionLabel);
    p.actionBtn.setFillStyle(b.built ? 0x661111 : 0x114422);
    p.actionBtn.setStrokeStyle(1, b.built ? 0xff6644 : 0x44cc88, 0.7);
    p.actionLbl.setColor(b.built ? '#ffaaaa' : '#aaffcc');
  }

  updateSelInfo() {
    if (!this.selInfo) return;
    const n=this.selIds.size;
    if (n===0){this.selInfo.setText('');return;}
    const roles={};
    this.units.filter(u=>u.selected).forEach(u=>{
      const label=u.type==='worker'&&u.role?u.role:u.type;
      roles[label]=(roles[label]||0)+1;
    });
    this.selInfo.setText(Object.entries(roles).map(([t,c])=>`${c} ${t}`).join(', '));
  }

  updateEnemyCount() { const n=this.units.filter(u=>u.isEnemy&&u.hp>0).length; this.enemyCount?.setText(n>0?`☠${n}`:''); }

  showPhaseMessage(text,color) {
    this.phaseMsg.setText(text).setColor('#'+color.toString(16).padStart(6,'0')).setAlpha(1);
    this.tweens.add({targets:this.phaseMsg,alpha:0,delay:2800,duration:600});
  }

  afford(cost){return Object.entries(cost).every(([r,n])=>(this.resources[r]??0)>=n);}
  spend(cost){Object.entries(cost).forEach(([r,n])=>{this.resources[r]-=n;});this.updateUI();}
}
