import {
    TILE, MAP_OY, ROOM_DEFS, ROOM_MAX_SLOTS, CONSTRUCT_VOLUME
} from '../config/gameConstants.js';
import { CONSTRUCTS, computeBuildCost } from '../content/constructs/index.js';
import { NODES } from '../content/nodes/index.js';
import { JOBS, WORKSHOP_JOBS } from '../content/jobs/index.js';
import { CROPS } from '../content/crops/index.js';
import { TECHS } from '../content/techs/index.js';

// Durability multiplier on an edge construct's HP, by the material it was built from.
// Order matters: most-specific resource paths are tested first (loose Stones before cut
// Limestone, Sticks before solid Pine).
export function materialHpMult(mat) {
    if (!mat) return 1.0;
    if (mat.includes('Metal.Iron') || mat.includes('Metal'))     return 2.5;  // iron — toughest
    if (mat.includes('Stone.Limestone.Stones'))                  return 1.3;  // loose field stones
    if (mat.includes('Stone'))                                   return 2.0;  // cut/solid stone
    if (mat.includes('Wood.Pine.Sticks'))                        return 0.7;  // flimsy sticks
    if (mat.includes('Wood'))                                    return 1.0;  // timber
    return 1.0;
}

// Reverse production map for build ordering / tech prerequisites (B2): which construct types
// produce a resource, and which resources come straight from nodes / crops.
const _RESOURCE_PRODUCERS = (() => {
    const m = {};
    for (const j of Object.values(WORKSHOP_JOBS))
        if (j.output && j.construct) (m[j.output] ??= new Set()).add(j.construct);
    return m;
})();
const _RESOURCE_FROM_NODE = new Set(Object.values(NODES).map(n => n.resource).filter(Boolean));
const _RESOURCE_FROM_CROP = new Set(Object.values(CROPS).map(c => c.output).filter(Boolean));

export default class ConstructManager {
    constructor(scene) {
        this.scene = scene;
        this.constructs = []; // List of all construct instances
        
        // Spatial grids for fast lookup — keyed by "row,col" strings
        // hEdges: horizontal edge above tile row y (key `${row},${col}`)
        this.hEdges = new Map();
        // vEdges: vertical edge left of tile col x (key `${row},${col}`)
        this.vEdges = new Map();
        
        this.constructGfx = null;
        this.edgeGfx = null;
        this.rooms = [];
        this._byId = new Map();
        this._preCivicAge = true; // cached: true until a townhall is built
        this._garlicGardens = [];
    }

    _updatePreCivicCache() {
        this._preCivicAge = !this.constructs.some(b => b.type === 'townhall' && b.built && !b.faction);
    }

    _updateGarlicCache() {
        this._garlicGardens = this.constructs.filter(b => b.type === 'garden' && b.built && b.cropType === 'garlic');
    }

    init() {
        this.constructGfx = this.scene._w(this.scene.add.graphics().setDepth(5));
        this.edgeGfx      = this.scene._w(this.scene.add.graphics().setDepth(4));
        // Keep scene.constructs pointing at our array for all consumers (UnitWorker etc.)
        this.scene.constructs = this.constructs;
    }

    // ─── Placement Logic ────────────────────────────────────────────────────────

    isFree(tx, ty, width, height, type = null) {
        const cm = this.scene.chunkManager;
        for (let y = ty; y < ty + height; y++) {
            for (let x = tx; x < tx + width; x++) {
                if (this.scene.mapData.get(`${x},${y}`) ?? 0) return false;
                if (cm && cm.getTile(x, y) === 4) return false; // T_WATER
            }
        }
        // Home construct domain collision logic
        const def = CONSTRUCTS[type];
        if (def?.isHomeType) {
            const pad = 3;
            for (let y = ty - pad; y <= ty + height - 1 + pad; y++) {
                for (let x = tx - pad; x <= tx + width - 1 + pad; x++) {
                    if (this.getEstateAt(x, y)) return false;
                }
            }
        }
        return true;
    }

    occupy(tx, ty, width, height, val) {
        for (let y = ty; y < ty + height; y++) {
            for (let x = tx; x < tx + width; x++) {
                if (val === 0) this.scene.mapData.delete(`${x},${y}`);
                else           this.scene.mapData.set(`${x},${y}`, val);
            }
        }
    }

    makeConstructObj(type, tx, ty, built) {
        const def = CONSTRUCTS[type];
        if (!def) return null;
        const work = def.buildWork || 1;
        const maxHp = work * 3;
        const isHouse = !!def?.isHomeType;

        const c = {
            id: this.scene.getId(),
            type,
            tx, ty,
            width: def.width || 1,
            height: def.height || 1,
            built,
            buildWork: built ? 0 : work,
            maxBuildWork: work,
            hp: built ? maxHp : 0,
            maxHp,
            stock: built && def.stockMax ? def.stockMax : 0,
            maxStock: def.stockMax || 0,
            replantTimer: 0,
            trainQueue: [],
            respawnQueue: [],
            resNeeded: {},
            drawnStock: -1,
            isOpen: type === 'gate' ? true : undefined,
            domainId: null,
            isPublic: false,
            inbox: {},
            applianceSlots: isHouse ? 2 : 0,
            applianceItems: [],
            inventory: {},
            tithePending: {},
            wagePending: {},
            productionQueue: null,
            gfx: null,
            barGfx: null,
            labelObj: null,
        };
        return c;
    }

    placeConstruct(type, tx, ty, material = 'Materials.Wood.Pine') {
        const def = CONSTRUCTS[type];
        if (!def) return null;

        // Tech gate (player + AI): can't build a type until its tech is researched.
        if (!this.isConstructResearched(type)) {
            const techId = this.scene.progression?.techForConstruct(type);
            const techLbl = techId ? (TECHS[techId]?.label ?? techId) : 'research';
            this.scene.uiManager?.showToast?.(`🔒 Research ${techLbl} first`, '#cc9966');
            return null;
        }

        if (def.placement === 'edge') {
            const edge = this.nearestEdge(tx * TILE + TILE/2, MAP_OY + ty * TILE + TILE/2);
            if (edge) return this.placeEdge(type, edge.isH, edge.row, edge.col, material);
            return null;
        }

        if (!this.isFree(tx, ty, def.width, def.height, type)) return null;

        const isWallType = ['wall', 'palisade', 'gate', 'watchtower'].includes(type);
        this.occupy(tx, ty, def.width, def.height, isWallType ? 98 : 99);

        const c = this.makeConstructObj(type, tx, ty, false);
        const cost = computeBuildCost(type, material);
        if (Object.keys(cost).length) c.resNeeded = { ...cost };

        this.constructs.push(c);
        this._byId.set(c.id, c);

        if (CONSTRUCTS[type]?.isHomeType) {
            this.registerEstateBounds(c);
            c.isPublic = false;
        } else {
            const dom = this.getEstateAt(tx, ty);
            if (dom) {
                c.domainId = dom.id;
                c.isPublic = false;
                this.growEstateToInclude(dom, tx, ty, def.width || 1, def.height || 1);
            } else {
                const hasTH = this.constructs.some(cc => cc.type === 'townhall' && cc.built && !cc.faction);
                c.isPublic = hasTH;
            }
        }

        this.renderAll();
        this.updateStorageCap();

        const canAfford = !Object.keys(cost).length || this.scene.economyManager.afford(cost);
        const msg = canAfford ? 'Workers will build!' : 'Plan placed — gather resources!';
        const col = canAfford ? '#88ee88' : '#ffaa44';
        this.scene.uiManager.showFloatText((tx + def.width / 2) * TILE, MAP_OY + ty * TILE - 6, msg, col);

        return c;
    }

    placeConstructAt(tx, ty) {
        const type = this.scene.constructType;
        const def  = CONSTRUCTS[type];
        const mats = def?.allowedMaterials ?? [];
        const mat  = mats.length > 0
            ? (this.scene.constructMaterials?.[type] ?? mats[0])
            : null;
        return this.placeConstruct(type, tx, ty, mat);
    }

    placeBuiltConstruct(type, tx, ty) {
        const def = CONSTRUCTS[type];
        if (!def) return null;
        
        const isWallType = ['wall', 'palisade', 'gate', 'watchtower'].includes(type);
        this.occupy(tx, ty, def.width, def.height, isWallType ? 98 : 99);

        const c = this.makeConstructObj(type, tx, ty, true);
        c.resNeeded = {};
        this.constructs.push(c);
        this._byId.set(c.id, c);   // register for getById (camps/agora/etc. were missing this)

        if (CONSTRUCTS[type]?.isHomeType) {
            this.registerEstateBounds(c);
            c.isPublic = false;
        } else {
            const dom = this.getEstateAt(tx, ty);
            if (dom) {
                c.domainId = dom.id;
                c.isPublic = false;
                this.growEstateToInclude(dom, tx, ty, def.width || 1, def.height || 1);
            } else {
                c.isPublic = true;
            }
        }

        this.renderAll();
        this.updateStorageCap();
        return c;
    }

    completeConstructConstruction(b) {
        b.built = true;
        b.hp = b.maxHp;
        b.buildWork = 0;
        this.renderAll();
        this.updateStorageCap();
        const fx = b.placement === 'edge'
            ? (b.isH ? (b.col + 0.5) * TILE : b.col * TILE)
            : (b.tx + b.width / 2) * TILE;
        const fy = b.placement === 'edge'
            ? MAP_OY + b.row * TILE - 10
            : MAP_OY + b.ty * TILE - 10;
        this.scene.uiManager.showFloatText(fx, fy, 'Done!', '#88ff88');
        const label = b.label ?? (b.type ? b.type[0].toUpperCase() + b.type.slice(1) : 'Building');
        this.scene.uiManager?.showToast?.(`⚒ ${label} complete`, '#a8dda8');

        if (b.placement === 'edge') this._checkRoomsFormedAtEdge(b);
        if (b.type === 'townhall') this._updatePreCivicCache();
        if (b.type === 'garden') this._updateGarlicCache();

        // Tech foundation: completing the first of a type teaches the colony to build it. Because
        // locked types can only be initiated by the archon's household, this first build is always
        // archon-driven — so citizens may build more of it from now on.
        if (!b.faction && b.type && this.scene.unlockedConstructs && !this.scene.unlockedConstructs.has(b.type)) {
            this.scene.unlockedConstructs.add(b.type);
            this.scene.uiManager?.showToast?.(`🏛 Colony learned to build ${label}`, '#e8d8a0');
        }
    }

    _checkRoomsFormedAtEdge(edge) {
        const sides = edge.isH
            ? [{ tx: edge.col, ty: edge.row - 1 }, { tx: edge.col, ty: edge.row }]
            : [{ tx: edge.col - 1, ty: edge.row }, { tx: edge.col, ty: edge.row }];
        for (const { tx, ty } of sides) {
            const room = this.getRoomAt(tx, ty, 80);
            if (room && room.length >= 2 && room.length <= 60) {
                const type = this.classifyRoom(room);
                const name = type ? `${type} room` : 'room';
                this.scene.uiManager?.showToast?.(`🏠 ${name} formed (${room.length} tiles)`, '#88ccff');
                // RimWorld-style: enclosing a room auto-plans a roof over its interior (#29).
                this.scene.roofManager?.autoRoofRoom(room);
                return;
            }
        }
    }

    _serConstruct(b) {
        const { gfx, barGfx, labelObj, ...d } = b;
        return d;
    }

    getRemainingCost(b) {
        return b.resNeeded ?? {};
    }

    getHouseCapacity(house) {
        if (house?.type === 'bed') return this._bedsInRoom(house).length;
        return CONSTRUCTS[house.type]?.capacity || 4;
    }

    // ── Bedroom homes ─────────────────────────────────────────────────────────
    // An enclosed room (bounded getRoomAt) containing built beds is a home; its
    // capacity is the number of beds in it. Results memoised per constructs-version.
    _bedsInRoom(bed) {
        if (!bed || bed.type !== 'bed') return bed ? [bed] : [];
        if (bed._brCv === this._cv && bed._brBeds) return bed._brBeds;
        const room = this.getRoomAt(bed.tx, bed.ty, 80);
        let beds;
        if (!room) {
            beds = [bed];   // unbounded / too large — treat as a lone slot
        } else {
            const inRoom = new Set(room.map(t => `${t.tx},${t.ty}`));
            beds = this.constructs.filter(c => c.type === 'bed' && c.built && !c.faction
                && inRoom.has(`${c.tx},${c.ty}`));
            if (!beds.length) beds = [bed];
        }
        for (const b of beds) { b._brCv = this._cv; b._brBeds = beds; }
        return beds;
    }

    // Stable home anchor for a bedroom: the lowest-id built bed sharing the room.
    bedroomAnchor(bed) {
        const beds = this._bedsInRoom(bed);
        return beds.reduce((a, b) => (b.id < a.id ? b : a), beds[0]);
    }

    getHouseVolume(house) {
        return CONSTRUCT_VOLUME[house.type] || 200;
    }

    getApplianceSlots(house) {
        return house.applianceSlots || 2;
    }

    demolishConstruct(construct, refundFraction = 0.5) {
        if (construct.type === 'townhall') return;
        const def = CONSTRUCTS[construct.type];
        if (!construct.built) {
            // Cancelled plan: nothing was consumed, so return everything delivered on-site.
            for (const [r, qty] of Object.entries(construct.inventory ?? {})) {
                if (qty > 0) this.scene.economyManager.addResource(r, qty);
            }
        } else {
            // Deconstructed build: return a fraction of what it cost to build.
            const cost = construct.placement === 'edge'
                ? (def?.costs?.[construct.material] ?? def?.cost ?? {})
                : computeBuildCost(construct.type, construct.material ?? undefined);
            for (const [r, n] of Object.entries(cost)) {
                const refund = Math.floor(n * refundFraction);
                if (refund > 0) this.scene.economyManager.addResource(r, refund);
            }
        }

        this.removeConstruct(construct);

        if (CONSTRUCTS[construct.type]?.isHomeType && construct.domainId) {
            this.scene.estateBounds = this.scene.estateBounds.filter(d => d.id !== construct.domainId);
        }
        
        if (this.scene.selectedConstruct === construct) this.scene.selectedConstruct = null;
        this.scene.mapManager.redrawDomainBorders();
        this.scene.updateUI();
    }

    // Flag a built construct for deconstruction — builders pick it up via seekBuilderTask's
    // deconSite scan and work it down in handleDeconstructTask, then demolishConstruct refunds.
    orderDeconstruct(b) {
        if (!b?.built || b.type === 'townhall' || b.faction) return;
        b.deconstructing = true;
        b.deconstructWork = b.maxBuildWork ?? Math.max(5, Math.round((b.maxHp ?? 15) / 3));
        this.renderAll();
        this.scene.updateUI?.();
    }

    cancelDeconstruct(b) {
        if (!b) return;
        b.deconstructing = false;
        b.deconstructWork = 0;
        this.renderAll();
        this.scene.updateUI?.();
    }


    // Edge-based placement (walls, fences)
    placeEdge(type, isH, row, col, material) {
        const def = CONSTRUCTS[type];
        if (!def) return null;

        // Resolve material from allowedMaterials if not supplied
        const mats = def.allowedMaterials ?? [];
        const mat = material ?? (mats.length > 0 ? mats[0] : null);

        // Resolve cost: prefer per-material costs map, fall back to def.cost
        const cost = (def.costs && mat && def.costs[mat]) ? def.costs[mat]
                   : def.cost ? { ...def.cost }
                   : (mat ? { [mat]: 1 } : {});

        const work  = def.buildWork || 10;
        const maxHp = Math.round(work * 3 * materialHpMult(mat));

        const c = {
            id: this.scene.getId(),
            type,
            placement: 'edge',
            isH, row, col,
            built: false,
            buildWork: work,
            maxBuildWork: work,
            hp: 0,
            maxHp,
            material: mat,
            height: def.height || 'full',
            resNeeded: Object.keys(cost).length ? { ...cost } : undefined,
            buildProgress: 0,
        };

        if (isH) {
            this.hEdges.set(`${row},${col}`, c);
        } else {
            this.vEdges.set(`${row},${col}`, c);
        }

        this.constructs.push(c);
        this._byId.set(c.id, c);
        this.renderAll();
        return c;
    }

    removeConstruct(c) {
        if (!c) return;
        const wasSupport = c.placement === 'edge' && c.built && (c.height === 'full' || c.height === 'door');
        if (c.placement === 'edge') {
            if (c.isH) this.hEdges.delete(`${c.row},${c.col}`);
            else       this.vEdges.delete(`${c.row},${c.col}`);
        } else {
            this.occupy(c.tx, c.ty, c.width, c.height, 0);
        }
        this._byId.delete(c.id);
        this.constructs = this.constructs.filter(cc => cc.id !== c.id);
        if (c.type === 'townhall') this._updatePreCivicCache();
        if (c.type === 'garden') this._updateGarlicCache();
        if (wasSupport) this._collapseRoofsNearEdge(c.isH, c.row, c.col);
        this.renderAll();
        this.updateStorageCap();
    }

    // ─── Queries ───────────────────────────────────────────────────────────────

    getAt(tx, ty) {
        return this.constructs.find(c => 
            c.placement !== 'edge' &&
            tx >= c.tx && tx < c.tx + c.width &&
            ty >= c.ty && ty < c.ty + c.height
        );
    }

    getById(id) {
        return this._byId.get(id) ?? null;
    }

    getEdge(isH, row, col) {
        return isH ? (this.hEdges.get(`${row},${col}`) ?? null) : (this.vEdges.get(`${row},${col}`) ?? null);
    }

    // Aliases for InputManager wall drag mode
    getWall(isH, row, col) { return this.getEdge(isH, row, col); }
    placeWall(isH, row, col) {
        const type = this.scene.wallType ?? 'wall_edge';
        const def  = CONSTRUCTS[type];
        const mats = def?.allowedMaterials ?? [];
        const mat  = mats.length > 0 ? (this.scene.constructMaterials?.[type] ?? mats[0]) : null;
        return this.placeEdge(type, isH, row, col, mat);
    }
    removeWall(isH, row, col) { return this.removeEdge(isH, row, col); }

    removeEdge(isH, row, col) {
        const c = this.getEdge(isH, row, col);
        if (!c) return;
        const wasSupport = c.built && (c.height === 'full' || c.height === 'door');
        if (isH) this.hEdges.delete(`${c.row},${c.col}`);
        else     this.vEdges.delete(`${c.row},${c.col}`);
        this._byId.delete(c.id);
        this.constructs = this.constructs.filter(cc => cc.id !== c.id);
        this.renderAll();
        if (wasSupport) this._collapseRoofsNearEdge(isH, row, col);
    }

    // Re-check roofs around a removed wall — drop any that lost their support (#29).
    _collapseRoofsNearEdge(isH, row, col) {
        const rm = this.scene.roofManager;
        if (!rm) return;
        // The two tiles this edge bordered.
        if (isH) { rm.revalidateAround(col, row - 1); rm.revalidateAround(col, row); }
        else     { rm.revalidateAround(col - 1, row); rm.revalidateAround(col, row); }
    }

    renderWalls() { this.renderAll(); } // Alias used by InputManager


    orderWorkersToConstruct(b) {
        return this.scene.unitManager.orderWorkersToConstruct(b);
    }

    findConstructAt(wx, wy) {
        const tx = Math.floor(wx / TILE);
        const ty = Math.floor((wy - MAP_OY) / TILE);
        return this.getAt(tx, ty);
    }

    // Score a candidate footprint (higher = better). Rewards growing ALONG roads/paths and
    // clustering next to existing buildings, penalises sitting on a road or straying far from the
    // town centre — so the settlement forms coherent streets instead of sprawling in rings. (#9)
    siteScore(tx, ty, w, h, anchor) {
        const hasRoad = (x, y) => (this.scene.roadMap?.get(`${x},${y}`) ?? 0) > 0;
        const occupied = (x, y) => (this.scene.mapData?.get(`${x},${y}`) ?? 0) >= 99;
        let road = 0, build = 0, onRoad = 0;
        for (let yy = ty; yy < ty + h; yy++)
            for (let xx = tx; xx < tx + w; xx++)
                if (hasRoad(xx, yy)) onRoad++;
        const edge = (xx, yy) => { if (hasRoad(xx, yy)) road++; if (occupied(xx, yy)) build++; };
        for (let xx = tx - 1; xx <= tx + w; xx++) { edge(xx, ty - 1); edge(xx, ty + h); }
        for (let yy = ty; yy < ty + h; yy++)     { edge(tx - 1, yy); edge(tx + w, yy); }
        let s = Math.min(road, 6) * 10 + Math.min(build, 4) * 4 - onRoad * 25;
        if (anchor) s -= Phaser.Math.Distance.Between(tx, ty, anchor.tx, anchor.ty) * 0.3;
        return s;
    }

    // Best-scoring free footprint within `radius` tiles of an anchor (replaces first-free-tile
    // ring scans). `extraFits(tx,ty)` adds caller-specific constraints (room edges, terrain, …).
    findScoredSite(anchor, w, h, radius = 22, extraFits = null) {
        const a = anchor ?? { tx: this.scene.spawnTx ?? 0, ty: this.scene.spawnTy ?? 0 };
        let best = null, bestScore = -Infinity;
        for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
                const tx = a.tx + dx, ty = a.ty + dy;
                if (tx < 1 || ty < 1) continue;
                if (!this.isFree(tx, ty, w, h)) continue;
                if (extraFits && !extraFits(tx, ty)) continue;
                const s = this.siteScore(tx, ty, w, h, a);
                if (s > bestScore) { bestScore = s; best = { tx, ty }; }
            }
        }
        return best;
    }

    findPublicBuildSite(type) {
        const def = CONSTRUCTS[type];
        if (!def) return null;
        const th = this.constructs.find(b => b.type === 'townhall' && !b.faction);
        const center = th ? { tx: th.tx, ty: th.ty } : { tx: this.scene.spawnTx ?? 0, ty: this.scene.spawnTy ?? 0 };
        return this.findScoredSite(center, def.width || 1, def.height || 1, 24);
    }

    // Tech foundation: a construct type the colony has learned to build (the archon's household
    // built the first one). The starting camp is always known.
    isConstructUnlocked(type) {
        return type === 'camp' || !!this.scene.unlockedConstructs?.has(type);
    }

    // Research gate: is this construct's tech researched? (types with no tech are always available.)
    isConstructResearched(type) {
        return this.scene.progression?.isConstructResearched(type) ?? true;
    }

    // Production-chain check (B2): is `res` obtainable right now? True if it's in stock, a producer
    // workshop (built or planned) exists, or a raw node / grow-zone source exists. Used so the
    // archon won't pioneer a workshop (e.g. oven→flour) before its supplier (mill→wheat) exists.
    inputAvailable(res) {
        if (!res) return true;
        if ((this.scene.resources?.[res] ?? 0) > 0) return true;
        const producers = _RESOURCE_PRODUCERS[res];
        if (producers && this.constructs.some(b => !b.faction && producers.has(b.type))) return true;
        if (_RESOURCE_FROM_NODE.has(res) &&
            (this.scene.resNodes ?? []).some(n => n.stock > 0 && NODES[n.type]?.resource === res)) return true;
        if (_RESOURCE_FROM_CROP.has(res)) {
            const gz = this.scene.zoneManager?.growTiles;
            if (gz && [...gz.values()].some(st => st.crop && CROPS[st.crop]?.output === res)) return true;
        }
        return false;
    }

    nearestEdge(wx, wy) {
        const tx = Math.floor(wx / TILE);
        const ty = Math.floor((wy - MAP_OY) / TILE);

        const ox = wx - tx * TILE;
        const oy = (wy - MAP_OY) - ty * TILE;

        const dTop    = oy;
        const dBottom = TILE - oy;
        const dLeft   = ox;
        const dRight  = TILE - ox;
        const min = Math.min(dTop, dBottom, dLeft, dRight);

        if (min > TILE * 0.38) return null;

        if (min === dTop)    return { isH: true,  row: ty,     col: tx };
        if (min === dBottom) return { isH: true,  row: ty + 1, col: tx };
        if (min === dLeft)   return { isH: false, row: ty,     col: tx };
                             return { isH: false, row: ty,     col: tx + 1 };
    }

    // ─── Rendering ─────────────────────────────────────────────────────────────

    renderAll() {
        this._cv = (this._cv ?? 0) + 1;   // constructs-version: bumped on any add/remove/build
        if (!this.constructGfx || !this.edgeGfx) return;
        this.constructGfx.clear();
        this.edgeGfx.clear();

        // Separate lists for depth sorting if needed, but for now just iterate
        for (const c of this.constructs) {
            if (c.placement === 'edge') {
                this._renderEdge(c);
            } else {
                this._renderConstruct(c);
            }
            if (c.barGfx) this.redrawConstructBar(c);
        }
    }

    redrawConstruct(c) { this.renderAll(); }

    redrawConstructBar(c) {
        if (!c.barGfx) {
            c.barGfx = this.scene._w(this.scene.add.graphics().setDepth(6));
        }
        c.barGfx.clear();
        if (!c.built) {
            // Draw build progress bar
            const bw = c.width * TILE - 8;
            const bx = c.tx * TILE + 4;
            const by = MAP_OY + c.ty * TILE + 4;
            const r = 1 - (c.buildWork / c.maxBuildWork);
            c.barGfx.fillStyle(0x000000, 0.5).fillRect(bx, by, bw, 4);
            c.barGfx.fillStyle(0x44aa44).fillRect(bx, by, bw * r, 4);
        }
    }


    _renderConstruct(c) {
        const def = CONSTRUCTS[c.type];
        if (!def) return;

        if (def.draw) {
            def.draw(this.constructGfx, c, this.scene);
        } else {
            // Fallback generic render (from FurnitureManager)
            const pad = 3;
            const szW = c.width * TILE - pad * 2;
            const szH = c.height * TILE - pad * 2;
            const px = c.tx * TILE + pad;
            const py = MAP_OY + c.ty * TILE + pad;
            const alpha = c.built ? 0.88 : 0.35;
            const color = def.color || 0xcccccc;

            this.constructGfx.fillStyle(color, alpha).fillRect(px, py, szW, szH);
            if (c.built) {
                this.constructGfx.lineStyle(1, 0xc8a030, 0.55).strokeRect(px, py, szW, szH);
            } else {
                this.constructGfx.lineStyle(1, 0xc8a030, 0.3).strokeRect(px, py, szW, szH);
                const progress = c.maxBuildWork > 0 ? 1 - c.buildWork / c.maxBuildWork : 0;
                this.constructGfx.fillStyle(0xffdd44, 0.7).fillRect(px, py + szH - 3, Math.round(szW * progress), 3);
            }
        }
    }

    _renderEdge(c) {
        const def   = CONSTRUCTS[c.type];
        const g     = this.edgeGfx;
        const T     = TILE, OY = MAP_OY;
        const color = def.color || 0xcccccc;
        const alpha = c.built ? 1.0 : 0.4;
        const px    = c.col * T, py = OY + c.row * T;
        const isFence = def.height === 'fence' || def.height === 'low';
        const isPassable = def.passable;

        if (c.isH) {
            // E-W wall: 2.5D face panel — extends UP from the boundary into the tile above
            const faceH = isFence ? Math.round(T * 0.14) : Math.round(T * 0.26);
            const topY  = py - faceH;

            // Top cap (lighter)
            const r = (color >> 16) & 0xff, gr = (color >> 8) & 0xff, b = color & 0xff;
            const topCol = Math.min(0xffffff, ((Math.min(255, r + 40) << 16) | (Math.min(255, gr + 40) << 8) | Math.min(255, b + 40)));
            g.fillStyle(topCol, alpha).fillRect(px, topY - 2, T, 3);

            // Front face
            g.fillStyle(color, alpha).fillRect(px, topY, T, faceH);

            // Bottom shadow line
            g.fillStyle(0x000000, alpha * 0.25).fillRect(px, py - 2, T, 2);

            // Door/gate opening
            if (isPassable) {
                g.fillStyle(0x111008, alpha * 0.8).fillRect(px + T * 0.3, topY, T * 0.4, faceH);
            }
        } else {
            // N-S wall: thin strip (side-on view)
            const W = isFence ? 3 : 5;
            g.fillStyle(color, alpha).fillRect(px - W / 2, py, W, T);
            // Slight right-side shadow
            g.fillStyle(0x000000, alpha * 0.2).fillRect(px + W / 2 - 1, py, 2, T);
        }

        if (!c.built) {
            const progress = c.maxBuildWork > 0 ? 1 - c.buildWork / c.maxBuildWork : 0;
            g.fillStyle(0xffdd44, 0.7);
            if (c.isH) g.fillRect(px, py - 2, Math.round(T * progress), 2);
            else       g.fillRect(px - 1, py, 2, Math.round(T * progress));
        }
    }

    // ─── Domain & Storage Logic (from ConstructManager) ─────────────────────────

    // Estate = a family's private land: a CIRCULAR radius `r` (tiles) around a centre that grows
    // to enclose the structures built within it (growEstateToInclude) and creeps outward over time
    // (growEstates). x1..y2 track the bounding box (cx±r) for fast iteration/quick-reject; the true
    // membership test is the circle (estateContains). familyId owns the estate 1:1.
    _syncEstateBox(d) { d.x1 = d.cx - d.r; d.y1 = d.cy - d.r; d.x2 = d.cx + d.r; d.y2 = d.cy + d.r; }

    estateContains(d, tx, ty) {
        if (d.cx == null) return false;
        const dx = tx - d.cx, dy = ty - d.cy, rr = d.r + 0.5;
        return dx * dx + dy * dy <= rr * rr;
    }

    createEstate(cx, cy, familyId, anchorId, r0 = 2) {
        const dom = {
            id: this.scene.getId(),
            familyId, anchorConstructId: anchorId, houseConstructId: anchorId,
            cx, cy, r: r0, maxR: 12,
        };
        this._syncEstateBox(dom);
        this.scene.estateBounds.push(dom);
        this._autoSlateEstateNodes(dom);
        this.scene.mapManager.redrawDomainBorders();
        return dom;
    }

    // Expand an estate's circle so a newly-built structure (footprint tx,ty,w,h) sits comfortably
    // inside it, clamped to maxR and the cultural border. Re-slates any nodes the growth swept in.
    growEstateToInclude(dom, tx, ty, w = 1, h = 1) {
        if (!dom || dom.cx == null) return;
        const { cx: bcx, cy: bcy, R } = this.culturalBounds();
        // farthest footprint corner from the estate centre
        let far = 0;
        for (const [px, py] of [[tx, ty], [tx + w - 1, ty], [tx, ty + h - 1], [tx + w - 1, ty + h - 1]])
            far = Math.max(far, Math.hypot(px - dom.cx, py - dom.cy));
        let want = Math.ceil(far) + 1;                                  // +1 tile margin
        want = Math.min(want, dom.maxR ?? 12);
        want = Math.min(want, Math.floor(R - Math.hypot(dom.cx - bcx, dom.cy - bcy))); // stay inside culture
        if (want > dom.r) {
            dom.r = want;
            this._syncEstateBox(dom);
            this._autoSlateEstateNodes(dom);
            this.scene.mapManager.redrawDomainBorders();
        }
    }

    // Auto-designate every harvestable resource node inside an estate's circle (or all estates if
    // none given) for harvest — the family works the resources on its own land automatically.
    _autoSlateEstateNodes(dom = null) {
        const doms = dom ? [dom] : this.scene.estateBounds;
        for (const n of this.scene.resNodes ?? []) {
            const role = NODES[n.type]?.role;
            if (role !== 'woodcutter' && role !== 'miner' && role !== 'forager') continue;
            const tx = Math.floor(n.x / TILE), ty = Math.floor((n.y - MAP_OY) / TILE);
            if (!doms.some(d => this.estateContains(d, tx, ty))) continue;
            if (!n.slated) {
                n.slated = true;
                n.slateType = role;
                this.scene.mapManager.redrawNode(n);
            }
        }
    }

    registerEstateBounds(house) {
        const cx = house.tx + Math.floor((house.width ?? 1) / 2);
        const cy = house.ty + Math.floor((house.height ?? 1) / 2);
        const dom = this.createEstate(cx, cy, house.id, house.id, 3);
        house.domainId = dom.id;
        return dom;
    }

    getEstateAt(tx, ty) {
        return this.scene.estateBounds.find(d => this.estateContains(d, tx, ty));
    }

    // Square cultural border around the civic centre; radius scales with population. Estates
    // grow only within it; land inside the border but in no estate is public.
    culturalBounds() {
        const civic = this.constructs.find(b => b.type === 'townhall' && b.built && !b.faction)
                   || this.constructs.find(b => b.type === 'camp' && !b.faction);
        const cx = civic ? civic.tx + Math.floor((civic.width ?? 1) / 2) : (this.scene.spawnTx ?? 20);
        const cy = civic ? civic.ty + Math.floor((civic.height ?? 1) / 2) : (this.scene.spawnTy ?? 20);
        const pop = this.scene.units.filter(u => u.type === 'worker' && !u.isEnemy && u.hp > 0).length;
        const R = Math.min(30, Math.round(6 + 1.5 * Math.sqrt(pop)));
        return { cx, cy, R };
    }

    // Grow each estate circle one tile/day until it nears a neighbouring circle (1-tile gap) or
    // reaches the cultural border. Newly-enclosed resource nodes are auto-slated.
    growEstates() {
        const { cx: bcx, cy: bcy, R } = this.culturalBounds();
        const ests = this.scene.estateBounds;
        for (const d of ests) {
            if (d.cx == null || d.r >= (d.maxR ?? 12)) continue;
            const nr = d.r + 1;
            // stay within the cultural circle
            if (Math.hypot(d.cx - bcx, d.cy - bcy) + nr > R) continue;
            // keep a 1-tile gap from every other estate circle
            let blocked = false;
            for (const o of ests) {
                if (o === d || o.cx == null) continue;
                if (Math.hypot(d.cx - o.cx, d.cy - o.cy) < nr + o.r + 1) { blocked = true; break; }
            }
            if (blocked) continue;
            d.r = nr; this._syncEstateBox(d);
        }
        this._autoSlateEstateNodes();
        this.scene.mapManager.redrawDomainBorders();
    }

    // Total built beds within an estate's circle — the family's breeding/housing capacity.
    estateBedCapacity(estate) {
        if (!estate) return 0;
        let n = 0;
        for (const c of this.constructs) {
            if (c.type !== 'bed' || !c.built || c.faction) continue;
            if (this.estateContains(estate, c.tx, c.ty)) n++;
        }
        return n;
    }

    updateStorageCap() {
        const max = {};
        for (const r in this.scene.resources) max[r] = 0;
        for (const c of this.constructs) {
            if (c.faction === 'enemy' || !c.built) continue;
            const def = CONSTRUCTS[c.type];
            const s = def?.stores;
            if (!s) continue;
            for (const [r, n] of Object.entries(s)) max[r] = (max[r] || 0) + n;
        }
        this.scene.storageMax = max;
        this.scene.economyManager.syncResources();
        this.scene.updateUI();
    }

    // ─── Room & Enclosure Logic (from WallManager) ─────────────────────────────

    _blocks(isH, row, col) {
        const edge = this.getEdge(isH, row, col);
        return !!(edge && (edge.height === 'full' || edge.height === 'door') && edge.built);
    }

    _blocksEnclosure(isH, row, col) {
        const edge = this.getEdge(isH, row, col);
        return !!(edge && (edge.height === 'full' || edge.height === 'fence') && edge.built);
    }

    getRoomAt(tx, ty, maxTiles = 400) {
        return this._getRegionAt(tx, ty, maxTiles, (isH, row, col) => this._blocks(isH, row, col));
    }

    getEnclosureAt(tx, ty, maxTiles = 400) {
        return this._getRegionAt(tx, ty, maxTiles, (isH, row, col) => this._blocksEnclosure(isH, row, col));
    }

    _getRegionAt(tx, ty, maxTiles, blocksFn) {
        const key = (x, y) => `${x},${y}`;
        const visited = new Set([key(tx, ty)]);
        const queue   = [[tx, ty]];

        while (queue.length) {
            const [cx, cy] = queue.shift();
            for (const [dx, dy, isH, row, col] of [
                [ 0, -1, true,  cy,     cx    ],
                [ 0, +1, true,  cy + 1, cx    ],
                [-1,  0, false, cy,     cx    ],
                [+1,  0, false, cy,     cx + 1],
            ]) {
                const nx = cx + dx, ny = cy + dy;
                if (blocksFn(isH, row, col)) continue;
                const nk = key(nx, ny);
                if (visited.has(nk)) continue;
                if (visited.size >= maxTiles) return null;
                visited.add(nk);
                queue.push([nx, ny]);
            }
        }
        return [...visited].map(k => { const [x, y] = k.split(',').map(Number); return { tx: x, ty: y }; });
    }

    classifyRoom(tiles) {
        const counts = {};
        for (const { tx, ty } of tiles) {
            const c = this.getAt(tx, ty);
            if (!c?.built) continue;
            const def = CONSTRUCTS[c.type];
            if (def?.zoneType) counts[def.zoneType] = (counts[def.zoneType] ?? 0) + 1;
        }
        const entries = Object.entries(counts);
        if (!entries.length) return null;
        return entries.sort((a, b) => b[1] - a[1])[0][0];
    }

    // ─── Save / Load ────────────────────────────────────────────────────────────

    save() {
        return this.constructs.map(c => this._serConstruct(c));
    }

    _saveEdges() {
        const hData = [], vData = [];
        for (const [k, c] of this.hEdges) {
            const [y, x] = k.split(',').map(Number);
            hData.push({ y, x, c });
        }
        for (const [k, c] of this.vEdges) {
            const [y, x] = k.split(',').map(Number);
            vData.push({ y, x, c });
        }
        return { hData, vData };
    }

    _loadEdges(data) {
        this.hEdges = new Map();
        this.vEdges = new Map();
        for (const { y, x, c } of data?.hData ?? []) this.hEdges.set(`${y},${x}`, c);
        for (const { y, x, c } of data?.vData ?? []) this.vEdges.set(`${y},${x}`, c);
    }

    tick(delta) {
        for (const c of this.constructs) {
            const def = CONSTRUCTS[c.type];
            if (def?.tick) {
                if (!c._ctx) c._ctx = this.scene.economyManager.buildCtx(c);
                def.tick(c, delta, c._ctx);
            }
        }
        this.tickFarmRegrowth(delta);
        this._refreshGarrisonBars(delta);
        this.tickGarrisonHeal(delta);
        this.tickUnitTraining(delta);

        // These only need to run every 2s — they're O(houses × units)
        this._houseTickAcc = (this._houseTickAcc ?? 0) + delta;
        if (this._houseTickAcc >= 2000) {
            const scaled = this._houseTickAcc; // pass accumulated delta so timers still advance correctly
            this._houseTickAcc = 0;
            this.tickHouseProduction(scaled);
        }
    }

    tickGarrisonHeal(delta) {
        for (const b of this.constructs) {
            if (!b.built || !b.garrison?.length) continue;
            const healAmt = delta * 0.0002;
            for (const uid of b.garrison) {
                const u = this.scene.unitManager?._byUnitId?.get(uid);
                if (u && u.hp < u.maxHp) u.hp = Math.min(u.maxHp, u.hp + healAmt);
            }
        }
    }

    tickUnitTraining(delta) {
        for (const b of this.constructs) {
            if (!b.built || b.faction || !b.trainingQueue?.length) continue;
            const def = CONSTRUCTS[b.type];
            if (!def) continue;

            const task = b.trainingQueue[0];
            task.progress = (task.progress ?? 0) + delta;
            
            const trainingTime = 10000; // 10s default
            if (task.progress >= trainingTime) {
                b.trainingQueue.shift();
                this.scene.unitManager.spawnTrainedUnit(b, task.unitType);
                this.redrawConstructBar(b);
            }
        }
    }

    tickFarmRegrowth(delta) {
        for (const b of this.constructs) {
            if (!b.built || b.faction) continue;
            if (b.type === 'farm') {
                if (b.stock > 0 || b.needsPlanting) continue;
                b._regrowTimer = (b._regrowTimer ?? 0) + delta;
                if (b._regrowTimer >= 90000) { // 90s day
                    b._regrowTimer = 0;
                    b.needsPlanting = true;
                    this.redrawConstructBar(b);
                }
            } else if (b.type === 'garden') {
                if (b.stock >= 20) continue;
                b._regrowTimer = (b._regrowTimer ?? 0) + delta;
                if (b._regrowTimer >= 45000) {
                    b._regrowTimer = 0;
                    b.stock = Math.min(20, b.stock + 5);
                    this.redrawConstructBar(b);
                }
            }
        }
    }

    tickHouseProduction(delta) {
        for (const house of this.constructs) {
            if (!house.built || house.faction || !CONSTRUCTS[house.type]?.isHomeType) continue;
            const apps = house.applianceItems;
            if (!apps?.length) continue;
            const inv = house.inventory ?? (house.inventory = {});

            const hasResident = this.scene.units.some(u =>
                u.homeConstructId === house.id && !u.isEnemy && u.hp > 0 && u.age >= 2);
            if (!hasResident) continue;

            const rooms = house.rooms;
            const hasKitchen  = !rooms || rooms.includes('kitchen');
            const hasWorkshop = !rooms || rooms.includes('workshop');

            for (const app of apps) {
                switch (app.id) {
                    case 'millstone':
                        if (!hasKitchen) break;
                        house._millTimer = (house._millTimer ?? 0) + delta;
                        if (house._millTimer >= 18000 && (inv['Food.Grain.Wheat'] ?? 0) >= 1) {
                            inv['Food.Grain.Wheat']--;
                            inv['Food.Grain.Wheat.Flour'] = (inv['Food.Grain.Wheat.Flour'] ?? 0) + 2;
                            house._millTimer = 0;
                            this.scene.uiManager.showFloatText(
                                (house.tx + 1) * TILE, MAP_OY + house.ty * TILE - 8,
                                '🌾 ground', '#ddcc88');
                        }
                        break;

                    case 'hearth':
                        if (!hasKitchen) break;
                        house._hearthTimer = (house._hearthTimer ?? 0) + delta;
                        if (house._hearthTimer >= 24000 && (inv['Food.Grain.Wheat.Flour'] ?? 0) >= 2) {
                            inv['Food.Grain.Wheat.Flour'] -= 2;
                            inv['Food.Grain.Wheat.Bread'] = (inv['Food.Grain.Wheat.Bread'] ?? 0) + 1;
                            house._hearthTimer = 0;
                            this.scene.uiManager.showFloatText(
                                (house.tx + 1) * TILE, MAP_OY + house.ty * TILE - 8,
                                '🍞 home bread', '#ffdd88');
                        }
                        break;

                    case 'loom':
                        if (!hasWorkshop) break;
                        house._loomTimer = (house._loomTimer ?? 0) + delta;
                        if (house._loomTimer >= 20000 && (inv['Textile.Fiber.Wool'] ?? 0) >= 2) {
                            inv['Textile.Fiber.Wool'] -= 2;
                            house._loomTimer = 0;
                            this.scene.economyManager.addResource('Textile.Fiber.Wool', 1);
                            this.scene.uiManager.showFloatText(
                                (house.tx + 1) * TILE, MAP_OY + house.ty * TILE - 8,
                                '🧶 spun', '#eeddcc');
                        }
                        break;

                    case 'workbench':
                        if (!hasWorkshop) break;
                        house._benchTimer = (house._benchTimer ?? 0) + delta;
                        if (house._benchTimer >= 30000) {
                            house._benchTimer = 0;
                            const craftsman = this.scene.units.find(u =>
                                u.homeConstructId === house.id && !u.isEnemy && u.hp > 0 && u.age >= 2);
                            if (craftsman) this.scene.unitManager._gainSkillXp(craftsman, 'woodcutting');
                        }
                        break;

                    case 'anvil':
                        if (!hasWorkshop) break;
                        house._anvilTimer = (house._anvilTimer ?? 0) + delta;
                        if (house._anvilTimer >= 30000) {
                            house._anvilTimer = 0;
                            const smith = this.scene.units.find(u =>
                                u.homeConstructId === house.id && !u.isEnemy && u.hp > 0 && u.age >= 2);
                            if (smith) this.scene.unitManager._gainSkillXp(smith, 'forge');
                        }
                        break;
                }
            }
        }
    }

    _refreshGarrisonBars(delta) {
        this._garrisonBarTimer = (this._garrisonBarTimer ?? 0) + delta;
        if (this._garrisonBarTimer < 1000) return;
        this._garrisonBarTimer = 0;
        for (const b of this.constructs) {
            if (b.built && b.type === 'watchtower' && !b.faction)
                this.redrawConstructBar(b);
        }
    }

    save() {
        return this.constructs.map(c => this._serConstruct(c));
    }

    load(data) {
        if (!data) return;
        this.constructs.length = 0; // clear current without reassigning reference
        this.hEdges = new Map();
        this.vEdges = new Map();
        this._byId = new Map();

        const list = [];
        const process = (src) => {
            if (!src) return;
            if (Array.isArray(src)) list.push(...src);
            else if (src.constructs && Array.isArray(src.constructs)) list.push(...src.constructs);
            else if (typeof src === 'object') list.push(src); // single object fallback
        };

        process(data.constructs);
        process(data.walls);
        process(data.furniture);
        if (Array.isArray(data)) list.push(...data);

        for (const d of list) {
            const c = {
                inbox: {}, ...d,
                gfx: null, barGfx: null, labelObj: null
            };
            this.constructs.push(c);
            this._byId.set(c.id, c);

            // Re-occupy mapData if it's a construct
            if (c.placement !== 'edge') {
                const isWallType = ['wall', 'palisade', 'gate', 'watchtower'].includes(c.type);
                this.occupy(c.tx, c.ty, c.width, c.height, isWallType ? 98 : 99);
            }

            // Rebuild edge references
            if (c.placement === 'edge') {
                if (c.isH) this.hEdges.set(`${c.row},${c.col}`, c);
                else       this.vEdges.set(`${c.row},${c.col}`, c);
            }
        }

        // Sync with scene reference if it was replaced (though we shouldn't replace it)
        this.scene.constructs = this.constructs;

        this._updatePreCivicCache();
        this._updateGarlicCache();
        this.renderAll();
        this.updateStorageCap();
    }
}
