import { SCENE_KEYS } from '../config/sceneKeys.js';
import {
    TILE, MAP_OY,
    DAY_DURATION, pickFamilyName
} from '../config/gameConstants.js';
import { CONSTRUCTS } from '../content/constructs/index.js';

import ChunkManager from './ChunkManager.js';
import MapManager from './MapManager.js';
import UIManager from './UIManager.js';
import EconomyManager from './EconomyManager.js';
import UnitManager from './UnitManager.js';
import InputManager from './InputManager.js';
import NatureManager from './NatureManager.js';
import WorldManager from './WorldManager.js';
import ConstructManager from './ConstructManager.js';
import ZoneManager from './ZoneManager.js';
import RoofManager from './RoofManager.js';
import ProgressionManager from './ProgressionManager.js';
import GameLogger from '../GameLogger.js';

export default class GameScene extends Phaser.Scene {
    constructor() {
        super({ key: SCENE_KEYS.GAME });
    }

    init(data) {
        this.civ = data?.civ ?? 'greece';
        // Core State
        this.mapData    = new Map();   // occupancy: "tx,ty" → value (0/98/99)
        this.roadMap    = new Map();   // road layer: "tx,ty" → ROAD_* constant
        this.constructs = [];
        this.units      = [];
        this.resNodes  = [];
        this.selIds    = new Set();
        this.resources  = {
            'Food.Grain.Wheat': 0, 'Food.Grain.Wheat.Flour': 0, 'Food.Grain.Wheat.Bread': 0,
            'Food.Meat.Venison': 0, 'Food.Meat.Venison.Cuts': 0, 'Food.Meat.Venison.Sausages': 0,
            'Food.Produce.Olive': 0, 'Food.Produce.Olive.Oil': 0, 'Food.Produce.Berry': 0,
            'Food.Drink.Beer': 0,
            'Materials.Wood.Pine': 0, 'Materials.Wood.Pine.Sticks': 0, 'Materials.Wood.Pine.Plank': 0,
            'Materials.Stone.Limestone': 0, 'Materials.Stone.Limestone.Stones': 0, 'Materials.Stone.Limestone.Block': 0,
            'Materials.Metal.Copper.Ore': 0, 'Materials.Metal.Copper.Ingot': 0,
            'Textile.Fiber.Wool': 0, 'Textile.Cloth.Wool': 0, 'Textile.Hide.Deer': 0, 'Textile.Hide.Deer.Leather': 0,
            'Equipment.Leather.Kit': 0, 'Equipment.Bronze.Kit': 0,
            seeds: 0,
        };
        this.storageMax = {
            'Food.Grain.Wheat': 0, 'Food.Grain.Wheat.Flour': 0, 'Food.Grain.Wheat.Bread': 0,
            'Food.Meat.Venison': 0, 'Food.Meat.Venison.Cuts': 0, 'Food.Meat.Venison.Sausages': 0,
            'Food.Produce.Olive': 0, 'Food.Produce.Olive.Oil': 0, 'Food.Produce.Berry': 0,
            'Food.Drink.Beer': 0,
            'Materials.Wood.Pine': 0, 'Materials.Wood.Pine.Sticks': 0, 'Materials.Wood.Pine.Plank': 0,
            'Materials.Stone.Limestone': 0, 'Materials.Stone.Limestone.Stones': 0, 'Materials.Stone.Limestone.Block': 0,
            'Materials.Metal.Copper.Ore': 0, 'Materials.Metal.Copper.Ingot': 0,
            'Textile.Fiber.Wool': 0, 'Textile.Cloth.Wool': 0, 'Textile.Hide.Deer': 0, 'Textile.Hide.Deer.Leather': 0,
            'Equipment.Leather.Kit': 0, 'Equipment.Bronze.Kit': 0,
            seeds: 0,
        };
        this.discoveries = { oliveGrove: false, wildGarden: false };
        this.mealsDone       = 0;
        this.foodPressure    = false;
        this.titheRate       = 10;
        this.day        = 1;
        this.phase      = 'DAY';
        this.nightsSurvived = 0;
        this.constructType      = null;
        this.constructMaterials = {};
        this.materialPickMode   = null;
        this.fmType    = 'phalanx';
        this.tradeOrders = [];
        this.tradeLog    = [];
        this.groundItems    = [];           // on-map resource piles waiting to be hauled
        this.groundItemMap  = new Map();    // "tx,ty,sx,sy:resource" → item (fast merge lookup)
        this.selectedConstruct = null;
        // visMap is now a Map in MapManager (initFog)
        this.visMap      = new Map();
        this._litTiles   = [];
        this._minimapTimer = 0;
        this._exploredBounds = null;
        this.estateBounds = [];
        this.borderGfx   = null;
        this.fordSet     = new Set();   // string keys "tx,ty" — also in chunkManager.fordSet
        this.deer        = [];
        this.sheep       = [];
        this.discoveredCrops = new Set();   // crop keys unlocked by harvesting their wild form (#22)
        this.unlockedConstructs = new Set(['camp']);   // types the colony knows how to build (archon pioneers the first of each)
        this.knownTechs    = new Set();   // researched techs (tech tree); gates advanced constructs
        this.lore          = 0;           // accumulated research points
        this.researchTarget = null;       // tech id currently being researched (auto-picked if null)
        // Settings: archon AI auto-pioneers new build types (toggle off → player drives progress)
        this.archonPioneers = (() => {
            try { return JSON.parse(localStorage.getItem('epochs_settings') ?? '{}').archonPioneers ?? true; }
            catch { return true; }
        })();
        this.roadGfx     = null;
        this.roadMode    = false;
        this._roadsDirty = false;
        this.wallMode    = false;
        this.wallType    = 'wall_edge';
        this.wallMaterial = 'Materials.Wood.Pine';
        this._wallDragEdges = new Set();
        this._wallDragErasing = false;
        this.constructMode   = false;
        this.placementType = null;
        this.furnishCat      = 'Living';
        this.selectedConstruct = null;
        this.relocateMode    = false;
        this.relocateSrc     = null;
        this.timerMs   = DAY_DURATION;
        this.nextId    = 1;
        this.tickSpeed       = 1;
        this.isPaused        = false;
        const _cfg = (() => { try { return JSON.parse(localStorage.getItem('epochs_settings') ?? '{}'); } catch { return {}; } })();
        this.fogEnabled  = _cfg.fogEnabled  ?? true;
        this.showNeeds   = _cfg.showNeeds   ?? true;
        this.tickSpeed   = _cfg.gameSpeed   ?? 1;
        this._autosaveOn = _cfg.autosave    ?? true;
        this.fmGfx = null; this.hoverGfx = null; this.dragGfx = null;
        this._fmDragging = false; this._fmDragStart = null;
        this.constructBtns = {}; this.fmBtns = {};
        this._ptrDownX = 0; this._ptrDownY = 0; this._dragging = false;
        this._barTimer = 0; this._attractTimer = 0;
        this._pinch   = { active: false, dist: 0, mx: 0, my: 0 };
        this._touches = new Map();

        // Spawn position (set before ChunkManager is created)
        this.spawnTx = 0;
        this.spawnTy = 0;

        // Instantiate Managers
        this.mapManager = new MapManager(this);
        this.uiManager = new UIManager(this);
        this.economyManager = new EconomyManager(this);
        this.constructManager = new ConstructManager(this);
        this.unitManager = new UnitManager(this);
        this.inputManager = new InputManager(this);
        this.natureManager = new NatureManager(this);
        this.worldManager = new WorldManager(this);
        this.zoneManager      = new ZoneManager(this);
        this.roofManager      = new RoofManager(this);
        this.progression      = new ProgressionManager(this);
        this.zoneMode         = null;
        this._zoneDragTiles   = new Set();
        this._zoneDragStart   = null;
        this.selectedZoneTile  = null;
        this.selectedZoneTiles = null;
        this.selectedZoneType  = null;
        this.selectedZoneCrop  = null;
        this.selectedGroundTile = null;
    }

    _w(obj) { this.uiCam?.ignore(obj); return obj; }

    create() {
        // Screen dimensions — read here where Phaser guarantees they're set
        this.SW = this.cameras.main.width;
        this.SH = this.cameras.main.height;
        console.log('[GameScene] SW:', this.SW, 'SH:', this.SH);

        this.uiCam = this.cameras.add(0, 0, this.SW, this.SH, false, 'ui');

        // Map + entities: load from save or generate fresh
        const loaded = this._loadGame();

        if (!loaded) {
            // Random spawn in a wide area
            this.spawnTx = Phaser.Math.Between(200, 800);
            this.spawnTy = Phaser.Math.Between(200, 800);
        }

        // ChunkManager must be created after spawnTx/spawnTy is set
        this.chunkManager = new ChunkManager(this);

        if (loaded && this._savedChunkMods) {
            this.chunkManager.loadModified(this._savedChunkMods);
            delete this._savedChunkMods;
        }

        // Pre-generate the immediate 3×3 spawn chunks synchronously (fast),
        // the rest streams in over the first few frames.
        this.cameras.main.centerOn(
            this.spawnTx * TILE + TILE / 2,
            MAP_OY + this.spawnTy * TILE + TILE / 2
        );
        this.cameras.main.setZoom(0.75);
        this.chunkManager.prewarmSpawn(this.spawnTx, this.spawnTy);

        this.constructManager.init();
        this.zoneManager.init();
        this.roofManager.init();

        this.borderGfx = this._w(this.add.graphics().setDepth(1));
        this.roadGfx = this._w(this.add.graphics().setDepth(1));
        this.mapManager.drawResourceNodes();
        this.groundItems.forEach(item => this.unitManager.drawGroundItem(item));
        this.mapManager.initFog();

        if (loaded) {
            this.constructManager.renderAll();
            this.zoneManager.renderAll();
            this.roofManager.renderAll();
            this.mapManager.redrawRoads();   // redraw the whole road layer

            this.constructManager.renderAll();
            for (const u of this.units) {
                u._visible = true;
                u._alpha = 1.0;
            }
            this.unitManager._redrawAllUnits();
            for (const d of this.deer) {
                d.gfx = this._w(this.add.graphics().setDepth(5));
                this.natureManager.redrawDeer(d);
            }
            for (const s of this.sheep) {
                s.gfx = this._w(this.add.graphics().setDepth(5));
                this.natureManager.redrawSheep(s);
            }
        }

        // Night overlay
        this.nightOverlay = this.add.rectangle(
            this.SW / 2, this.SH / 2,
            this.SW, this.SH,
            0x0a0a2a, 1
        ).setAlpha(loaded && this.phase === 'NIGHT' ? 0.6 : 0).setDepth(9);
        this.cameras.main.ignore(this.nightOverlay);

        this.mapManager.redrawDomainBorders();
        this.uiManager.createUI();
        this.inputManager.setupInput();
        if (!loaded) { this.spawnStartingState(); this.natureManager.seedInitialWildlife(); }

        this.mapManager.recomputeVis();
        this.mapManager.drawFog();
        this.mapManager.drawMinimap();

        const msg = loaded ? `Day ${this.day} — Game restored.` : `Day ${this.day} — Gather and build.`;
        this.showPhaseMessage(msg, 0xddaa44);
        this.cameras.main.fadeIn(400, 0, 0, 0);

        // Auto-save every 60 s and on tab hide
        if (this._autosaveOn !== false) {
            this._autosaveEvent = this.time.addEvent({ delay: 60000, loop: true, callback: () => this._saveGame(), callbackScope: this });
        }
        document.addEventListener('visibilitychange', this._onVisChange = () => {
            if (document.hidden) this._saveGame();
        });

        this.scale.on('resize', (gameSize) => {
            this.SW = gameSize.width;
            this.SH = gameSize.height;
            this.uiCam.setSize(this.SW, this.SH);
            this.uiManager.rebuildUI();
        });
    }

    getId() { return this.nextId++; }

    // --- Delegation Methods ---
    updateUI() { this._uiDirty = true; }
    // ─── Persistence ─────────────────────────────────────────────────────────

    _serUnit(u) {
        const { gfx, nameLabel, _zzzLabel, _needLabel, _mbLabel, ...d } = u;
        return { ...d, moveTo: null, targetNode: null, targetDeer: null, targetSheep: null,
                 taskType: null, workProgress: 0, workshopPhase: null, isInside: false,
                 fetchConstructId: null, _wageCollected: false, _prevRole: null,
                 _zzzLabel: null, _needLabel: null, _mbLabel: null };
    }
    _serConstruct(b) { const { gfx, barGfx, labelObj, ...d } = b; return d; }
    _serNode(n)     { const { gfx, labelObj, ...d } = n; return d; }
    _serAnimal(a)   { const { gfx, ...d } = a; return { ...d, followUnit: null }; }

    _saveGame() {
        if (this._gameOver) return;
        try {
            const state = {
                v: 7,
                day: this.day, phase: this.phase, timerMs: this.timerMs,
                nightsSurvived: this.nightsSurvived, mealsDone: this.mealsDone,
                resources: { ...this.resources }, storageMax: { ...this.storageMax },
                discoveries: { ...this.discoveries },
                nextId: this.nextId, tickSpeed: this.tickSpeed, titheRate: this.titheRate,
                constructMaterials: { ...(this.constructMaterials ?? {}) },
                spawnTx: this.spawnTx, spawnTy: this.spawnTy,
                chunkMods: this.chunkManager?.saveModified() ?? {},
                fordSet: [...(this.chunkManager?.fordSet ?? this.fordSet)],
                roadMap: Object.fromEntries(this.roadMap),
                estateBounds: this.estateBounds,
                constructs: this.constructManager.save(),
                zones:      this.zoneManager.save(),
                roofs:      this.roofManager.save(),
                units:     this.units.map(u => this._serUnit(u)),
                resNodes:  this.resNodes.map(n => this._serNode(n)),
                groundItems: this.groundItems.map(i => ({ id: i.id, resource: i.resource, qty: i.qty, x: i.x, y: i.y, subKey: i.subKey })),
                deer:  this.deer.map(d => this._serAnimal(d)),
                sheep: this.sheep.map(s => this._serAnimal(s)),
                discoveredCrops: [...this.discoveredCrops],
                unlockedConstructs: [...this.unlockedConstructs],
                knownTechs: [...this.knownTechs],
                lore: this.lore,
                researchTarget: this.researchTarget,
            };
            localStorage.setItem('epochs_save', JSON.stringify(state));
            this.uiManager.showSaveFlash?.();
        } catch(e) { console.warn('[save] failed:', e); }
    }

    _loadGame() {
        try {
            const raw = localStorage.getItem('epochs_save');
            if (!raw) return false;
            const s = JSON.parse(raw);
            if (s.v !== 6) { localStorage.removeItem('epochs_save'); return false; }

            const KEY_MIGRATION = {
                wheat: 'Food.Grain.Wheat', flour: 'Food.Grain.Wheat.Flour', bread: 'Food.Grain.Wheat.Bread',
                meat: 'Food.Meat.Venison', cuts: 'Food.Meat.Venison.Cuts', sausages: 'Food.Meat.Venison.Sausages',
                olives: 'Food.Produce.Olive', berries: 'Food.Produce.Berry',
                wood: 'Materials.Wood.Pine', sticks: 'Materials.Wood.Pine.Sticks', planks: 'Materials.Wood.Pine.Plank',
                stone: 'Materials.Stone.Limestone', stones: 'Materials.Stone.Limestone.Stones', stoneBlocks: 'Materials.Stone.Limestone.Block',
                ore: 'Materials.Metal.Copper.Ore', ingot: 'Materials.Metal.Copper.Ingot',
                wool: 'Textile.Fiber.Wool', hide: 'Textile.Hide.Deer', leather: 'Textile.Hide.Deer.Leather',
                leatherKit: 'Equipment.Leather.Kit', bronzeKit: 'Equipment.Bronze.Kit',
            };
            function migrateKeys(obj) {
                if (!obj) return obj;
                const out = {};
                for (const [k, v] of Object.entries(obj)) out[KEY_MIGRATION[k] ?? k] = v;
                return out;
            }

            this.day = s.day; this.phase = s.phase; this.timerMs = s.timerMs;
            this.nightsSurvived = s.nightsSurvived ?? 0; this.mealsDone = s.mealsDone ?? 0;
            const legacyResources = migrateKeys(s.resources ?? {});
            Object.assign(this.storageMax, migrateKeys(s.storageMax));
            Object.assign(this.discoveries, s.discoveries ?? {});
            this.nextId = s.nextId; this.tickSpeed = s.tickSpeed ?? 1; this.titheRate = s.titheRate ?? 10;
            this.constructMaterials = s.constructMaterials ?? {};

            this.spawnTx = s.spawnTx ?? 0;
            this.spawnTy = s.spawnTy ?? 0;

            // Chunk mods will be loaded after ChunkManager is constructed
            this._savedChunkMods = s.chunkMods ?? {};

            // Restore fordSet (string keys from v6 save)
            this.fordSet = new Set(s.fordSet ?? []);

            // Restore roadMap
            this.roadMap = new Map(Object.entries(s.roadMap ?? {}));

            this.estateBounds = s.estateBounds ?? s.domains ?? [];
            this.constructManager.load({ constructs: s.constructs, walls: s.walls, furniture: s.furniture });
            this.zoneManager.load(s.zones ?? null);
            this.roofManager.load(s.roofs ?? null);

            this.resNodes    = (s.resNodes  ?? []).map(n => ({ ...n, gfx: null, labelObj: null }));
            this.groundItems   = [];
            this.groundItemMap = new Map();
            for (const d of s.groundItems ?? []) {
                // Derive subKey from saved position if not stored (legacy saves)
                let sk = d.subKey;
                if (!sk) {
                    const tx = Math.floor(d.x / TILE);
                    const ty = Math.floor((d.y - MAP_OY) / TILE);
                    const sx = Math.min(2, Math.max(0, Math.floor(((d.x - tx * TILE) * 3) / TILE)));
                    const sy = Math.min(2, Math.max(0, Math.floor(((d.y - MAP_OY - ty * TILE) * 3) / TILE)));
                    sk = `${tx},${ty},${sx},${sy}`;
                }
                const item = { ...d, subKey: sk, gfx: null, labelObj: null, reserved: null };
                this.groundItems.push(item);
                this.groundItemMap.set(`${sk}:${item.resource}`, item);
            }
            this.units     = (s.units     ?? []).map(u => {
                const carrying = migrateKeys(u.carrying);
                for (const k of Object.keys(carrying)) {
                    if (!Number.isFinite(carrying[k])) carrying[k] = 0;
                }
                carrying['Food.Produce.Berry'] = carrying['Food.Produce.Berry'] ?? 0;
                return { ...u, carrying, gfx: null, nameLabel: null,
                         _zzzLabel: null, _needLabel: null, _mbLabel: null };
            });
            this.deer      = (s.deer      ?? []).map(d => ({ ...d, gfx: null }));
            this.sheep     = (s.sheep     ?? []).map(ss => ({ ...ss, gfx: null, followUnit: null }));
            this.discoveredCrops = new Set(s.discoveredCrops ?? []);
            // Unlocked build types: restore, then back-fill from anything already built (old saves).
            this.unlockedConstructs = new Set(s.unlockedConstructs ?? ['camp']);
            this.unlockedConstructs.add('camp');
            for (const c of this.constructManager?.constructs ?? [])
                if (c.built && !c.faction && c.type) this.unlockedConstructs.add(c.type);
            this.knownTechs     = new Set(s.knownTechs ?? []);
            this.lore           = s.lore ?? 0;
            this.researchTarget = s.researchTarget ?? null;

            // If no construct has inventory (old saves), seed townhall from legacy resources
            const anyInventory = this.constructs.some(b => b.isPublic && Object.values(b.inventory ?? {}).some(v => v > 0));
            if (!anyInventory) {
                const th = this.constructs.find(b => b.type === 'townhall' && b.isPublic);
                if (th) th.inventory = { ...legacyResources };
            }
            this.economyManager.syncResources();
            return true;
        } catch(e) { console.warn('[load] failed:', e); return false; }
    }

    clearSave() { localStorage.removeItem('epochs_save'); }

    showPhaseMessage(text, color) { this.uiManager.showPhaseMessage(text, color); }

    placeBuiltConstruct(type, tx, ty) { return this.constructManager.placeBuiltConstruct(type, tx, ty); }
    placeConstruct(tx, ty) { this.constructManager.placeConstructAt(tx, ty); }
    redrawConstruct(b) { this.constructManager.redrawConstruct(b); }
    redrawConstructBar(b) { this.constructManager.redrawConstructBar(b); }
    updateStorageCap() { this.constructManager.updateStorageCap(); }
    findConstructAt(wx, wy) { return this.constructManager.findConstructAt(wx, wy); }
    orderWorkersToConstruct(construct) { return this.constructManager.orderWorkersToConstruct(construct); }
    orderWorkersToSleep(construct) { return this.unitManager.orderWorkersToSleep(construct); }
    demolishConstruct(b) { this.constructManager.demolishConstruct(b); }
    findNodeAt(wx, wy) { return this.mapManager.findNodeAt(wx, wy); }
    orderWorkersToNode(node) { return this.unitManager.orderWorkersToNode(node); }
    _slaughterSheep(b) { this.natureManager.slaughterSheep(b); }
    attractAdults() {
        const homeless = this.units.filter(u => !u.isEnemy && u.hp > 0 && u.type === 'worker' && u.age >= 2 && !u.homeConstructId);
        for (const u of homeless) {
            const house = this.constructs.find(b => b.built && !b.faction && CONSTRUCTS[b.type]?.isHomeType &&
                this.units.filter(w => w.homeConstructId === b.id && !w.isEnemy && w.hp > 0).length < (CONSTRUCTS[b.type].capacity ?? 4));
            if (house) u.homeConstructId = house.id;
        }
    }

    spawnUnit(type, x, y, isEnemy, forcedGender = null) { return this.unitManager.spawnUnit(type, x, y, isEnemy, forcedGender); }
    redrawUnit(u) { this.unitManager.redrawUnit(u); }
    selectUnit(id, add) { this.unitManager.selectUnit(id, add); }
    deselect() { this.unitManager.deselect(); }
    boxSelect(x1, y1, x2, y2, add) { this.unitManager.boxSelect(x1, y1, x2, y2, add); }
    unitAt(x, y) { return this.unitManager.unitAt(x, y); }
    moveSelectedTo(wx, wy) { this.unitManager.moveSelectedTo(wx, wy); }

    findDeerAt(wx, wy) { return this.natureManager.findDeerAt(wx, wy); }
    findSheepAt(wx, wy) { return this.natureManager.findSheepAt(wx, wy); }
    assignHunters(deer) { return this.unitManager.assignHunters(deer); }
    assignShepherds(sheep) { return this.unitManager.assignShepherds(sheep); }

    showFloatText(x, y, text, color) { this.uiManager.showFloatText(x, y, text, color); }

    _paintRoad(tx, ty) { this.economyManager.paintRoad(tx, ty); }
    _applyFormation(cx, cy, angle) { this.unitManager.applyFormation(cx, cy, angle); }
    _drawFmDragPreview(x1, y1, x2, y2) { this.unitManager.drawFmDragPreview(x1, y1, x2, y2); }

    tileAt(wx, wy) {
        const tx = Math.floor(wx / TILE), ty = Math.floor((wy - MAP_OY) / TILE);
        const type = this.chunkManager ? this.chunkManager.getTile(tx, ty) : 0;
        return { tx, ty, type };
    }

    spawnStartingState() {
        const mx = this.spawnTx;
        const by = this.spawnTy;

        const camp = this.placeBuiltConstruct('camp', mx, by);
        camp.isPublic = false;
        camp.inventory = {
            'Food.Produce.Berry':                10,
            'Materials.Wood.Pine.Sticks':         8,
            'Materials.Stone.Limestone.Stones':   6,
        };
        this.constructManager.updateStorageCap();
        this.economyManager.syncResources();

        const sx = (camp.tx + camp.width / 2) * TILE, sy = MAP_OY + (camp.ty + camp.height / 2) * TILE;

        const founder = this.spawnUnit('worker', sx, sy, false, 'male');
        founder.isArchon   = true;
        founder.role       = 'builder';
        founder.homeConstructId = camp.id;
        if (founder.attributes) {
            for (const k of Object.keys(founder.attributes))
                founder.attributes[k] = Math.min(10, founder.attributes[k] + 2);
        }
        if (founder.skills?.masonry) founder.skills.masonry = { level: 3, xp: 0 };
        this.redrawUnit(founder);
        this.showFloatText(sx, sy - 20, `${founder.name}, Archon`, '#ffdd44');

        const consort = this.spawnUnit('worker', sx + 12, sy, false, 'female');
        consort.spouseId   = founder.id;
        consort.role       = 'farmer';
        consort.homeConstructId = camp.id;
        founder.spouseId   = consort.id;
        const founderFamily = pickFamilyName(this.civ);
        founder.familyName = founderFamily;
        consort.familyName = founderFamily;
        founder.relations = { [consort.id]: 0.6 };
        consort.relations = { [founder.id]: 0.6 };
        if (consort.attributes) {
            for (const k of Object.keys(consort.attributes))
                consort.attributes[k] = Math.min(10, consort.attributes[k] + 1);
        }
        this.redrawUnit(consort);
        this.showFloatText(sx + 12, sy - 20, `${consort.name}, Consort`, '#ffeecc');

        this._applyCivBonus(camp, mx, by);
        this.updateUI();
    }

    _applyCivBonus(camp, mx, by) {
        if (this.civ === 'greece') {
            camp.inventory['Food.Produce.Olive'] = (camp.inventory['Food.Produce.Olive'] ?? 0) + 6;
            camp.inventory['Food.Produce.Berry'] = (camp.inventory['Food.Produce.Berry'] ?? 0) + 4;
            // Place a built agora nearby
            const agora = this.placeBuiltConstruct('agora', mx + 4, by - 2);
            if (agora) agora.isPublic = true;
            this.showFloatText((mx + 6) * TILE, MAP_OY + by * TILE, 'Hellas: Agora raised', '#9ecfff');
        } else if (this.civ === 'sumer') {
            camp.inventory['Food.Grain.Wheat'] = (camp.inventory['Food.Grain.Wheat'] ?? 0) + 12;
            camp.inventory['Materials.Wood.Pine.Sticks'] = (camp.inventory['Materials.Wood.Pine.Sticks'] ?? 0) + 8;
            // Place a grain silo nearby
            const silo = this.placeBuiltConstruct('grainsilo', mx + 4, by);
            if (silo) silo.isPublic = true;
            this.showFloatText((mx + 6) * TILE, MAP_OY + by * TILE, 'Sumer: Grain silo raised', '#ffd080');
        }
        this.constructManager.updateStorageCap();
        this.economyManager.syncResources();
    }

    update(time, delta) {
        if (this.isPaused) return;
        const dt = (delta / 1000) * this.tickSpeed;
        const f0 = performance.now();
        const fr = this._frame = ((this._frame ?? -1) + 1) % 60;

        let t0;
        t0 = performance.now(); this.chunkManager?.tick(this.cameras.main); GameLogger.sys('chunk', performance.now() - t0);
        t0 = performance.now(); this.uiManager.tickClock();                  GameLogger.sys('ui',    performance.now() - t0);
        t0 = performance.now(); this.worldManager.tick(delta);               GameLogger.sys('world', performance.now() - t0);
        t0 = performance.now(); this.unitManager.tick(time, dt, fr);         GameLogger.sys('units', performance.now() - t0);

        // Staggered managers — accumulate delta, each fires on its own frame offset
        this._econAcc   = (this._econAcc   ?? 0) + delta * this.tickSpeed;
        this._natureAcc = (this._natureAcc ?? 0) + delta * this.tickSpeed;
        this._zoneAcc   = (this._zoneAcc   ?? 0) + delta * this.tickSpeed;
        if (fr % 2 === 0) { t0 = performance.now(); this.economyManager.tick(this._econAcc);                                        GameLogger.sys('econ',   performance.now() - t0); this._econAcc   = 0; }
        if (fr % 3 === 1) { t0 = performance.now(); this.natureManager.tick(this._natureAcc, this._natureAcc / 1000); GameLogger.sys('nature', performance.now() - t0); this._natureAcc = 0; }
        if (fr % 4 === 2) { t0 = performance.now(); this.zoneManager?.tickGrow(this._zoneAcc);                                      GameLogger.sys('zones',  performance.now() - t0); this._zoneAcc   = 0; }

        this.zoneManager?.tickStockpile();
        if (this._uiDirty) { this._uiDirty = false; this.uiManager.updateUI(); }

        GameLogger.frame(delta, performance.now() - f0);

        // Fog drawn every frame — cheap with Blitter (just bob position assignments)
        this.mapManager.drawFog();

        this._minimapTimer += delta;
        if (this._minimapTimer >= 500) {
            this._minimapTimer = 0;
            this.mapManager.recomputeVis();
            this.mapManager.drawMinimap();
        }
    }
}
