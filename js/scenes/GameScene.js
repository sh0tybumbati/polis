import { SCENE_KEYS } from '../config/sceneKeys.js';
import {
    MAP_W, MAP_H, TILE, MAP_OY, MAP_BOTTOM,
    DAY_DURATION, BLDG
} from '../config/gameConstants.js';
import MapManager from './MapManager.js';
import UIManager from './UIManager.js';
import EconomyManager from './EconomyManager.js';
import BuildingManager from './BuildingManager.js';
import UnitManager from './UnitManager.js';
import InputManager from './InputManager.js';
import NatureManager from './NatureManager.js';
import WorldManager from './WorldManager.js';

export default class GameScene extends Phaser.Scene {
    constructor() {
        super({ key: SCENE_KEYS.GAME });
    }

    init() {
        // Core State
        this.mapData    = [];   
        this.terrainData = [];  
        this.biomeData  = [];   
        this.resNodes  = [];
        this.buildings = [];
        this.units     = [];
        this.selIds    = new Set();
        this.resources  = { stone: 15, wood: 0, sticks: 0, stones: 0, wool: 0, wheat: 10, flour: 0, bread: 0, meat: 0, sausages: 0, olives: 0, seeds: 0, hide: 0, ore: 0, ingot: 0, leather: 0, leatherKit: 0, bronzeKit: 0, planks: 0, stoneBlocks: 0 };
        this.storageMax = { stone: 0,  wood: 0, sticks: 0, stones: 0, wool: 0, wheat: 0,  flour: 0, bread: 0, meat: 0, sausages: 0, olives: 0, seeds: 0, hide: 0, ore: 0, ingot: 0, leather: 0, leatherKit: 0, bronzeKit: 0, planks: 0, stoneBlocks: 0 };
        this.discoveries = { oliveGrove: false, wildGarden: false };
        this.mealsDone       = 0;
        this.foodPressure    = false;
        this.titheRate       = 10;   // % of private inventory contributed to commons at dawn
        this.enemyAware      = false;
        this.enemyScoutTimer = 0;     
        this.enemyRes   = { food: 25, stone: 20, wood: 10 };
        this.day        = 1;
        this.phase      = 'DAY';
        this.nightsSurvived = 0;
        this.bldgType     = null;
        this.bldgMaterial = 'wood';
        this.fmType    = 'phalanx';
        this.floorPiles = [];
        this.selectedBuilding = null;
        this.visMap      = [];   
        this._litTiles   = [];   
        this._minimapTimer = 0;
        this.domains     = [];
        this.fordSet     = new Set();
        this.deer        = [];   
        this._edgeEntryTimer = 0; 
        this.sheep       = [];   
        this.trafficMap  = [];   
        this.roadMap     = [];   
        this.roadGfx     = null; 
        this.roadMode    = false;
        this._roadsDirty = false;
        this.timerMs   = DAY_DURATION;
        this.nextId    = 1;
        this.tickSpeed = 1;
        this.isPaused  = false;
        this.fmGfx = null; this.hoverGfx = null; this.dragGfx = null;
        this._fmDragging = false; this._fmDragStart = null;
        this.buildingBtns = {}; this.fmBtns = {};
        this._ptrDownX = 0; this._ptrDownY = 0; this._dragging = false;
        this._barTimer = 0; this._attractTimer = 0;
        this._pinch   = { active: false, dist: 0, mx: 0, my: 0 };
        this._touches = new Map();

        // Instantiate Managers
        this.mapManager = new MapManager(this);
        this.uiManager = new UIManager(this);
        this.economyManager = new EconomyManager(this);
        this.buildingManager = new BuildingManager(this);
        this.unitManager = new UnitManager(this);
        this.inputManager = new InputManager(this);
        this.natureManager = new NatureManager(this);
        this.worldManager = new WorldManager(this);
    }

    _w(obj) { this.uiCam?.ignore(obj); return obj; }

    create() {
        // Screen dimensions — read here where Phaser guarantees they're set
        this.SW = this.cameras.main.width;
        this.SH = this.cameras.main.height;
        console.log('[GameScene] SW:', this.SW, 'SH:', this.SH, 'window:', window.innerWidth, window.innerHeight);

        // Camera setup — extend bounds down by panel height so bottom map rows aren't hidden behind UI
        const panelH = Math.min(280, Math.max(210, Math.floor(this.SH * 0.24)));
        this.cameras.main.setBounds(0, 0, MAP_W * TILE, MAP_BOTTOM + panelH + this.SH);
        this.cameras.main.centerOn((MAP_W / 2) * TILE, MAP_OY + (MAP_H - 6) * TILE);
        this.uiCam = this.cameras.add(0, 0, this.SW, this.SH, false, 'ui');

        // Map + entities: load from save or generate fresh
        const loaded = this._loadGame();
        if (!loaded) {
            this.mapManager.generateMap();
            this.mapManager.generateRiver();
            this.mapManager.generateResourceNodes();
        }
        console.log('[GameScene] map rows:', this.terrainData.length, 'cam center:', this.cameras.main.scrollX, this.cameras.main.scrollY);
        this.mapManager.drawMap();

        this.roadGfx = this._w(this.add.graphics().setDepth(1));
        this.mapManager.drawResourceNodes();
        this.mapManager.initFog();

        if (loaded) {
            // Redraw any desire/paved paths stored in roadMap
            for (let y = 0; y < this.roadMap.length; y++)
                for (let x = 0; x < (this.roadMap[y]?.length ?? 0); x++)
                    if (this.roadMap[y][x] > 0) this.mapManager.drawDesirePath(x, y);

            for (const b of this.buildings) this.buildingManager.redrawBuilding(b);
            for (const u of this.units) {
                u.gfx = this._w(this.add.graphics().setDepth(6));
                this.unitManager.redrawUnit(u);
            }
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
            this.SW / 2, MAP_OY + (this.SH - MAP_OY) / 2,
            this.SW, this.SH - MAP_OY,
            0x0a0a2a, 1
        ).setAlpha(loaded && this.phase === 'NIGHT' ? 0.6 : 0).setDepth(9);
        this.cameras.main.ignore(this.nightOverlay);

        this.uiManager.createUI();
        this.inputManager.setupInput();
        if (!loaded) this.spawnStartingState();

        this.mapManager.recomputeVis();
        this.mapManager.drawFog();
        this.mapManager.drawMinimap();

        const msg = loaded ? `Day ${this.day} — Game restored.` : `Day ${this.day} — Gather and build.`;
        this.showPhaseMessage(msg, 0xddaa44);
        this.cameras.main.fadeIn(400, 0, 0, 0);

        // Auto-save every 60 s and on tab hide
        this.time.addEvent({ delay: 60000, loop: true, callback: () => this._saveGame(), callbackScope: this });
        document.addEventListener('visibilitychange', this._onVisChange = () => {
            if (document.hidden) this._saveGame();
        });

        this.scale.on('resize', (gameSize) => {
            this.SW = gameSize.width;
            this.SH = gameSize.height;
            this.uiCam.setSize(this.SW, this.SH);
            const ph = Math.min(280, Math.max(210, Math.floor(this.SH * 0.24)));
            this.cameras.main.setBounds(0, 0, MAP_W * TILE, MAP_BOTTOM + ph + this.SH);
            this.uiManager.rebuildUI();
        });
    }

    getId() { return this.nextId++; }

    // --- Delegation Methods ---
    updateUI() { this.uiManager.updateUI(); }
    // ─── Persistence ─────────────────────────────────────────────────────────

    _serUnit(u) {
        const { gfx, nameLabel, ...d } = u;
        // Don't persist live object references — re-seek on load
        return { ...d, moveTo: null, targetNode: null, targetDeer: null, targetSheep: null,
                 taskType: null, workProgress: 0, workshopPhase: null, isInside: false,
                 fetchBldgId: null, _wageCollected: false, _prevRole: null };
    }
    _serBuilding(b) { const { gfx, barGfx, labelObj, ...d } = b; return d; }
    _serNode(n)     { const { gfx, labelObj, ...d } = n; return d; }
    _serAnimal(a)   { const { gfx, ...d } = a; return { ...d, followUnit: null }; }

    _saveGame() {
        if (this._gameOver) return;
        try {
            const state = {
                v: 2,
                day: this.day, phase: this.phase, timerMs: this.timerMs,
                nightsSurvived: this.nightsSurvived, mealsDone: this.mealsDone,
                resources: { ...this.resources }, storageMax: { ...this.storageMax },
                discoveries: { ...this.discoveries },
                enemyAware: this.enemyAware, enemyRes: { ...this.enemyRes },
                nextId: this.nextId, tickSpeed: this.tickSpeed, titheRate: this.titheRate,
                terrainData: this.terrainData, biomeData: this.biomeData, mapData: this.mapData,
                fordSet: [...this.fordSet], roadMap: this.roadMap, domains: this.domains,
                buildings: this.buildings.map(b => this._serBuilding(b)),
                units:     this.units.map(u => this._serUnit(u)),
                resNodes:  this.resNodes.map(n => this._serNode(n)),
                deer:  this.deer.map(d => this._serAnimal(d)),
                sheep: this.sheep.map(s => this._serAnimal(s)),
            };
            localStorage.setItem('polis_save', JSON.stringify(state));
            this.uiManager.showSaveFlash?.();
        } catch(e) { console.warn('[save] failed:', e); }
    }

    _loadGame() {
        try {
            const raw = localStorage.getItem('polis_save');
            if (!raw) return false;
            const s = JSON.parse(raw);
            if (s.v !== 2) { localStorage.removeItem('polis_save'); return false; }

            this.day = s.day; this.phase = s.phase; this.timerMs = s.timerMs;
            this.nightsSurvived = s.nightsSurvived ?? 0; this.mealsDone = s.mealsDone ?? 0;
            Object.assign(this.resources, s.resources);
            Object.assign(this.storageMax, s.storageMax);
            Object.assign(this.discoveries, s.discoveries ?? {});
            this.enemyAware = s.enemyAware ?? false;
            Object.assign(this.enemyRes, s.enemyRes ?? {});
            this.nextId = s.nextId; this.tickSpeed = s.tickSpeed ?? 1; this.titheRate = s.titheRate ?? 10;

            this.terrainData = s.terrainData; this.biomeData = s.biomeData; this.mapData = s.mapData;
            this.fordSet = new Set(s.fordSet ?? []); this.roadMap = s.roadMap ?? []; this.domains = s.domains ?? [];
            // trafficMap is not saved — reinitialise blank so moveToward rows are always present
            this.trafficMap = Array.from({ length: MAP_H }, () => new Array(MAP_W).fill(0));

            this.resNodes  = (s.resNodes  ?? []).map(n => ({ ...n, gfx: null, labelObj: null }));
            this.buildings = (s.buildings ?? []).map(b => ({ inbox: {}, ...b, gfx: null, barGfx: null, labelObj: null }));
            this.units     = (s.units     ?? []).map(u => ({ ...u, gfx: null, nameLabel: null }));
            this.deer      = (s.deer      ?? []).map(d => ({ ...d, gfx: null }));
            this.sheep     = (s.sheep     ?? []).map(ss => ({ ...ss, gfx: null, followUnit: null }));
            return true;
        } catch(e) { console.warn('[load] failed:', e); return false; }
    }

    clearSave() { localStorage.removeItem('polis_save'); }

    showPhaseMessage(text, color) { this.uiManager.showPhaseMessage(text, color); }
    
    placeBuiltBuilding(type, tx, ty) { return this.buildingManager.placeBuiltBuilding(type, tx, ty); }
    placeBuilding(tx, ty) { this.buildingManager.placeBuilding(tx, ty); }
    redrawBuilding(b) { this.buildingManager.redrawBuilding(b); }
    redrawBuildingBar(b) { this.buildingManager.redrawBuildingBar(b); }
    updateStorageCap() { this.buildingManager.updateStorageCap(); }
    findBuildingAt(wx, wy) { return this.buildingManager.findBuildingAt(wx, wy); }
    orderWorkersToBuilding(bldg) { return this.buildingManager.orderWorkersToBuilding(bldg); }
    demolishBuilding(b) { this.buildingManager.demolishBuilding(b); }
    findNodeAt(wx, wy) { return this.mapManager.findNodeAt(wx, wy); }
    orderWorkersToNode(node) { return this.unitManager.orderWorkersToNode(node); }
    _slaughterSheep(b) { this.natureManager.slaughterSheep(b); }
    attractAdults() {
        const homeless = this.units.filter(u => !u.isEnemy && u.hp > 0 && u.type === 'worker' && u.age >= 2 && !u.homeBldgId);
        for (const u of homeless) {
            const house = this.buildings.find(b => b.built && !b.faction && BLDG[b.type]?.capacity &&
                this.units.filter(w => w.homeBldgId === b.id && !w.isEnemy && w.hp > 0).length < BLDG[b.type].capacity);
            if (house) u.homeBldgId = house.id;
        }
    }
    
    spawnUnit(type, x, y, isEnemy) { return this.unitManager.spawnUnit(type, x, y, isEnemy); }
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
        if (tx < 0 || tx >= MAP_W || ty < 0 || ty >= MAP_H) return null;
        return { tx, ty, type: this.terrainData[ty][tx] };
    }

    spawnStartingState() {
        const mx = Math.floor(MAP_W / 2) - 1;
        const by = MAP_H - 16;

        // Townhall at centre
        const townhall = this.placeBuiltBuilding('townhall', mx, by);
        townhall.isPublic = true;
        this.updateStorageCap();

        // Founder — lives in the townhall, role locked to builder, boosted attributes
        const thx = (townhall.tx + townhall.size / 2) * TILE;
        const thy = MAP_OY + (townhall.ty + townhall.size / 2) * TILE;
        const founder = this.spawnUnit('worker', thx, thy, false);
        founder.gender   = 'male';
        founder.age      = 2;
        founder.homeBldgId = townhall.id;
        founder.isArchon = true;
        founder.role     = 'builder';
        // Boost all attributes by 2, capped at 10
        if (founder.attributes) {
            for (const k of Object.keys(founder.attributes))
                founder.attributes[k] = Math.min(10, founder.attributes[k] + 2);
        }
        // Seed masonry skill so he builds noticeably faster from the start
        if (founder.skills?.masonry) founder.skills.masonry = { level: 3, xp: 0 };
        this.redrawUnit(founder);
        this.showFloatText(thx, thy - 20, `${founder.name}, Archon`, '#ffdd44');

        // Consort — archon's wife, lives in townhall
        const consort = this.spawnUnit('worker', thx + 8, thy, false);
        consort.gender     = 'female';
        consort.age        = 2;
        consort.homeBldgId = townhall.id;
        consort.spouseId   = founder.id;
        founder.spouseId   = consort.id;
        if (consort.attributes) {
            for (const k of Object.keys(consort.attributes))
                consort.attributes[k] = Math.min(10, consort.attributes[k] + 1);
        }
        this.redrawUnit(consort);
        this.showFloatText(thx + 8, thy - 20, `${consort.name}, Consort`, '#ffeecc');

        // 4 farm+house pairs scattered at ~10 tile corners around the townhall
        const r = () => Phaser.Math.Between(-2, 2);
        const cx = mx + 1, cy = by + 1; // townhall centre tile
        const pairs = [
            { fx: cx - 9  + r(), fy: cy - 8 + r() },  // NW
            { fx: cx + 7  + r(), fy: cy - 8 + r() },  // NE
            { fx: cx - 9  + r(), fy: cy + 5 + r() },  // SW
            { fx: cx + 7  + r(), fy: cy + 5 + r() },  // SE
        ].map(p => ({
            fx: Math.max(1, Math.min(MAP_W - 3, p.fx)),
            fy: Math.max(1, Math.min(MAP_H - 5, p.fy)),
        }));

        const houses = pairs.map(({ fx, fy }) => {
            this.placeBuiltBuilding('farm', fx, fy);
            return this.placeBuiltBuilding('house', fx, fy + 2);
        });
        this.updateStorageCap();

        // 4 married couples, one per house
        for (let i = 0; i < 4; i++) {
            const h = houses[i];
            const hx = (h.tx + h.size / 2) * TILE, hy = MAP_OY + (h.ty + h.size / 2) * TILE;
            const male   = this.spawnUnit('worker', hx - 10, hy, false);
            const female = this.spawnUnit('worker', hx + 10, hy, false);
            male.gender   = 'male';   male.age   = 2; male.homeBldgId   = h.id;
            female.gender = 'female'; female.age = 2; female.homeBldgId = h.id;
            male.spouseId = female.id; female.spouseId = male.id;
            male.role = 'farmer'; // one per household works their own farm
            this.redrawUnit(male); this.redrawUnit(female);
        }

        this._placeEnemyVillage();
    }

    _placeEnemyVillage() {
        const mx = Math.floor(MAP_W / 2) - 1;
        const ey = 5;
        const sites = [
            { type: 'townhall', tx: mx,      ty: ey     },
            { type: 'farm',     tx: mx - 4,  ty: ey + 3 },
            { type: 'barracks', tx: mx + 3,  ty: ey + 3 },
            { type: 'house',    tx: mx - 4,  ty: ey     },  // couple A
            { type: 'house',    tx: mx + 3,  ty: ey     },  // couple B
        ];
        for (const s of sites) {
            const b = this.placeBuiltBuilding(s.type, s.tx, s.ty);
            b.faction = 'enemy';
            b.hp = b.maxHp = s.type === 'townhall' ? 20
                           : s.type === 'farm'     ? 10
                           : s.type === 'barracks' ? 14
                           : 12; // house
        }

        const houses = this.buildings.filter(b => b.faction === 'enemy' && b.type === 'house');
        const farm   = this.buildings.find(b => b.faction === 'enemy' && b.type === 'farm');

        const spawnCouple = (house) => {
            const bx = (house.tx + 1) * TILE, by = MAP_OY + (house.ty + 1) * TILE;
            const m = this.spawnUnit('worker', bx - 10, by, true);
            const f = this.spawnUnit('worker', bx + 10, by, true);
            m.age = 2; m.gender = 'male';   m.homeBldgId = house.id;
            f.age = 2; f.gender = 'female'; f.homeBldgId = house.id;
            m.spouseId = f.id; f.spouseId = m.id;
            this.redrawUnit(m); this.redrawUnit(f);
        };

        houses.forEach(h => spawnCouple(h));

        // Two extra workers at the farm (no home — they'll wander and gather)
        if (farm) {
            const bx = (farm.tx + 1) * TILE, by = MAP_OY + (farm.ty + 1) * TILE;
            for (let i = 0; i < 2; i++) {
                const w = this.spawnUnit('worker', bx + Phaser.Math.Between(-16, 16), by, true);
                w.age = 2;
                w.homeBldgId = houses[i % houses.length]?.id ?? null;
            }
        }
    }

    update(time, delta) {
        if (this.isPaused) return;
        const dt = (delta / 1000) * this.tickSpeed;

        this.worldManager.tick(delta);
        this.unitManager.tick(time, dt);
        this.economyManager.tick(delta * this.tickSpeed);
        this.natureManager.tick(delta * this.tickSpeed, dt);

        this._minimapTimer += delta;
        if (this._minimapTimer >= 500) {
            this._minimapTimer = 0;
            this.mapManager.recomputeVis();
            this.mapManager.drawFog();
            this.mapManager.drawMinimap();
        }
    }
}
