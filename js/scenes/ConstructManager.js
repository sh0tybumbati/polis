import {
    TILE, MAP_OY, MAP_W, MAP_H, ROOM_DEFS, ROOM_MAX_SLOTS, CONSTRUCT_VOLUME
} from '../config/gameConstants.js';
import { CONSTRUCTS, computeBuildCost } from '../content/constructs/index.js';

export default class ConstructManager {
    constructor(scene) {
        this.scene = scene;
        this.constructs = []; // List of all construct instances
        
        // Spatial grids for fast lookup
        // hEdges[y][x]: horizontal edge above tile row y; (MAP_H+1) rows × MAP_W cols
        this.hEdges = Array.from({ length: MAP_H + 1 }, () => new Array(MAP_W).fill(null));
        // vEdges[y][x]: vertical edge left of tile col x; MAP_H rows × (MAP_W+1) cols
        this.vEdges = Array.from({ length: MAP_H }, () => new Array(MAP_W + 1).fill(null));
        
        this.constructGfx = null;
        this.edgeGfx = null;
        this.rooms = [];
    }

    init() {
        this.constructGfx = this.scene._w(this.scene.add.graphics().setDepth(5));
        this.edgeGfx      = this.scene._w(this.scene.add.graphics().setDepth(4));
    }

    // ─── Placement Logic ────────────────────────────────────────────────────────

    isFree(tx, ty, width, height, type = null) {
        for (let y = ty; y < ty + height; y++) {
            for (let x = tx; x < tx + width; x++) {
                if (x < 0 || x >= MAP_W || y < 0 || y >= MAP_H) return false;
                if (this.scene.mapData[y][x] !== 0) return false;
                if (this.scene.terrainData[y][x] === 4) return false; // T_WATER
            }
        }
        // House domain collision logic
        const def = CONSTRUCTS[type];
        if (def && def.id === 'house') {
            const pad = 3;
            for (let y = ty - pad; y <= ty + height - 1 + pad; y++) {
                for (let x = tx - pad; x <= tx + width - 1 + pad; x++) {
                    if (this.getDomainAt(x, y)) return false;
                }
            }
        }
        return true;
    }

    occupy(tx, ty, width, height, val) {
        for (let y = ty; y < ty + height; y++) {
            for (let x = tx; x < tx + width; x++) {
                if (this.scene.mapData[y] && this.scene.mapData[y][x] !== undefined)
                    this.scene.mapData[y][x] = val;
            }
        }
    }

    makeConstructObj(type, tx, ty, built) {
        const def = CONSTRUCTS[type];
        if (!def) return null;
        const work = def.buildWork || 1;
        const maxHp = work * 3;
        const isHouse = (type === 'house');

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
            spawnTimer: 0,
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

        if (type === 'house') {
            this.assignDomain(c);
            c.isPublic = false;
        } else {
            const dom = this.getDomainAt(tx, ty);
            if (dom) {
                c.domainId = dom.id;
                c.isPublic = false;
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
        return this.placeConstruct(this.scene.constructType, tx, ty, this.scene.constructMaterial);
    }

    placeBuiltConstruct(type, tx, ty) {
        const def = CONSTRUCTS[type];
        if (!def) return null;
        
        const isWallType = ['wall', 'palisade', 'gate', 'watchtower'].includes(type);
        this.occupy(tx, ty, def.width, def.height, isWallType ? 98 : 99);

        const c = this.makeConstructObj(type, tx, ty, true);
        c.resNeeded = {};
        this.constructs.push(c);

        if (type === 'house') {
            this.assignDomain(c);
            c.isPublic = false;
        } else {
            const dom = this.getDomainAt(tx, ty);
            if (dom) {
                c.domainId = dom.id;
                c.isPublic = false;
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
        this.scene.uiManager.showFloatText((b.tx + b.width / 2) * TILE, MAP_OY + b.ty * TILE - 10, 'Done!', '#88ff88');
    }

    _serConstruct(b) {
        const { gfx, barGfx, labelObj, ...d } = b;
        return d;
    }

    getRemainingCost(b) {
        return b.resNeeded ?? {};
    }

    getHouseCapacity(house) {
        return CONSTRUCTS[house.type]?.capacity || 4;
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
        const cost = def?.cost ?? {};
        const resNeeded = construct.resNeeded ?? {};
        for (const [r, n] of Object.entries(cost)) {
            const spent = n - (resNeeded[r] ?? 0);
            if (spent > 0) {
                const refund = Math.floor(spent * refundFraction);
                if (refund > 0) this.scene.economyManager.addResource(r, refund);
            }
        }
        for (const [r, qty] of Object.entries(construct.inventory ?? {})) {
            if (qty > 0) this.scene.economyManager.addResource(r, Math.floor(qty * refundFraction));
        }
        
        this.removeConstruct(construct);

        if (construct.type === 'house' && construct.domainId) {
            this.scene.domains = this.scene.domains.filter(d => d.id !== construct.domainId);
        }
        
        if (this.scene.selectedConstruct === construct) this.scene.selectedConstruct = null;
        this.scene.mapManager.redrawDomainBorders();
        this.scene.updateUI();
    }


    // Edge-based placement (walls, fences)
    placeEdge(type, isH, row, col, material = 'Materials.Wood.Pine') {
        const def = CONSTRUCTS[type];
        if (!def) return null;
        
        const work = def.buildWork || 10;
        const maxHp = work * 3;
        
        const c = {
            id: this.scene.getId(),
            type,
            isH, row, col,
            built: false,
            buildWork: work,
            maxBuildWork: work,
            hp: 0,
            maxHp,
            material,
            height: def.height || 'full',
            resNeeded: { [material]: def.cost?.[material] ?? 1 },
            buildProgress: 0,
        };

        if (isH) {
            if (row < 0 || row > MAP_H || col < 0 || col >= MAP_W) return null;
            this.hEdges[row][col] = c;
        } else {
            if (row < 0 || row >= MAP_H || col < 0 || col > MAP_W) return null;
            this.vEdges[row][col] = c;
        }

        this.constructs.push(c);
        this.renderAll();
        return c;
    }

    removeConstruct(c) {
        if (!c) return;
        if (c.placement === 'edge') {
            if (c.isH) this.hEdges[c.row][c.col] = null;
            else       this.vEdges[c.row][c.col] = null;
        } else {
            this.occupy(c.tx, c.ty, c.width, c.height, 0);
        }
        this.constructs = this.constructs.filter(cc => cc.id !== c.id);
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
        return this.constructs.find(c => c.id === id);
    }

    getEdge(isH, row, col) {
        return isH ? (this.hEdges[row]?.[col] ?? null) : (this.vEdges[row]?.[col] ?? null);
    }

    // Aliases for InputManager wall drag mode
    getWall(isH, row, col) { return this.getEdge(isH, row, col); }
    placeWall(isH, row, col, material) {
        return this.placeEdge(this.scene.wallType ?? 'wall', isH, row, col, material);
    }
    removeWall(isH, row, col) { return this.removeEdge(isH, row, col); }

    removeEdge(isH, row, col) {
        const c = this.getEdge(isH, row, col);
        if (!c) return;
        if (isH) this.hEdges[c.row][c.col] = null;
        else      this.vEdges[c.row][c.col] = null;
        this.constructs = this.constructs.filter(cc => cc.id !== c.id);
        this.renderAll();
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

    findPublicBuildSite(type) {
        const def = CONSTRUCTS[type];
        if (!def) return null;
        const th = this.constructs.find(b => b.type === 'townhall' && !b.faction);
        const center = th ? { tx: th.tx, ty: th.ty } : { tx: Math.floor(MAP_W/2), ty: Math.floor(MAP_H/2) };
        
        for (let r = 2; r < 25; r++) {
            for (let dy = -r; dy <= r; dy++) {
                for (let dx = -r; dx <= r; dx++) {
                    if (Math.abs(dx) < r && Math.abs(dy) < r) continue;
                    const tx = center.tx + dx, ty = center.ty + dy;
                    if (this.isFree(tx, ty, def.width, def.height, type)) {
                        return { tx, ty };
                    }
                }
            }
        }
        return null;
    }

    nearestEdge(wx, wy) {
        const tx = Math.floor(wx / TILE);
        const ty = Math.floor((wy - MAP_OY) / TILE);
        if (tx < 0 || tx >= MAP_W || ty < 0 || ty >= MAP_H) return null;

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
        const def = CONSTRUCTS[c.type];
        const g = this.edgeGfx;
        const T = TILE, OY = MAP_OY;
        const W = 6;
        
        const px = c.col * T, py = OY + c.row * T;
        const color = def.color || 0xcccccc;
        const alpha = c.built ? 1.0 : 0.4;

        g.fillStyle(color, alpha);
        if (c.isH) g.fillRect(px, py - W / 2, T, W);
        else       g.fillRect(px - W / 2, py, W, T);
        
        if (!c.built) {
            const progress = c.maxBuildWork > 0 ? 1 - c.buildWork / c.maxBuildWork : 0;
            g.fillStyle(0xffdd44, 0.7);
            if (c.isH) g.fillRect(px, py - 1, Math.round(T * progress), 2);
            else       g.fillRect(px - 1, py, 2, Math.round(T * progress));
        }
    }

    // ─── Domain & Storage Logic (from ConstructManager) ─────────────────────────

    assignDomain(house) {
        const pad = 3;
        const dom = {
            id: this.scene.getId(),
            houseConstructId: house.id,
            x1: house.tx - pad,
            y1: house.ty - pad,
            x2: house.tx + house.width - 1 + pad,
            y2: house.ty + house.height - 1 + pad,
        };
        this.scene.domains.push(dom);
        house.domainId = dom.id;
        this.scene.mapManager.redrawDomainBorders();
        return dom;
    }

    getDomainAt(tx, ty) {
        return this.scene.domains.find(d => tx >= d.x1 && tx <= d.x2 && ty >= d.y1 && ty <= d.y2);
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
        return !!(edge && edge.height === 'full' && edge.built);
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
        const key = (x, y) => y * MAP_W + x;
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
                if (nx < 0 || nx >= MAP_W || ny < 0 || ny >= MAP_H) return null;
                if (blocksFn(isH, row, col)) continue;
                const nk = key(nx, ny);
                if (visited.has(nk)) continue;
                if (visited.size >= maxTiles) return null;
                visited.add(nk);
                queue.push([nx, ny]);
            }
        }
        return [...visited].map(k => ({ tx: k % MAP_W, ty: Math.floor(k / MAP_W) }));
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
        const tileData = this.constructs.filter(c => c.placement !== 'edge').map(c => {
            const { gfx, barGfx, labelObj, ...d } = c;
            return d;
        });
        const hData = [], vData = [];
        for (let y = 0; y <= MAP_H; y++)
            for (let x = 0; x < MAP_W; x++)
                if (this.hEdges[y][x]) hData.push({ y, x, c: this.hEdges[y][x] });
        for (let y = 0; y < MAP_H; y++)
            for (let x = 0; x <= MAP_W; x++)
                if (this.vEdges[y][x]) vData.push({ y, x, c: this.vEdges[y][x] });
        
        return { tileData, hData, vData };
    }

    load(data) {
        if (!data) return;
        this.constructs = [];
        // Tile based
        for (const d of data.tileData ?? []) {
            this.constructs.push(d);
        }
        // Edges
        for (const { y, x, c } of data.hData ?? []) {
            if (this.hEdges[y]) {
                this.hEdges[y][x] = c;
                this.constructs.push(c);
            }
        }
        for (const { y, x, c } of data.vData ?? []) {
            if (this.vEdges[y]) {
                this.vEdges[y][x] = c;
                this.constructs.push(c);
            }
        }
    }

    tick(delta) {
        for (const c of this.constructs) {
            const def = CONSTRUCTS[c.type];
            if (def?.tick) def.tick(c, delta, this.scene.economyManager.buildCtx(c));
        }
        this.tickFarmRegrowth(delta);
        this.tickHouseProduction(delta);
        this.tickHouseBirths(delta);
        this._refreshGarrisonBars(delta);
        this.tickGarrisonHeal(delta);
        this.tickUnitTraining(delta);
    }

    tickGarrisonHeal(delta) {
        // Heal units inside constructs at a slow rate
        for (const b of this.constructs) {
            if (!b.built || !b.garrison?.length) continue;
            const healAmt = delta * 0.0002; // 1 HP per 5s
            for (const uid of b.garrison) {
                const u = this.scene.units.find(uu => uu.id === uid);
                if (u && u.hp < u.maxHp) {
                    u.hp = Math.min(u.maxHp, u.hp + healAmt);
                }
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

    tickHouseBirths(delta) {
        const POP_BASELINE = 8;
        const totalAdults = this.scene.units.filter(u =>
            !u.isEnemy && u.type === 'worker' && u.age >= 2 && u.hp > 0).length;
        const growthScale = Math.max(0.5, totalAdults / POP_BASELINE);
        const houseDef = CONSTRUCTS.house;
        const effectiveSpawnMs = (houseDef?.spawnMs || 200000) * growthScale;

        for (const house of this.constructs) {
            if (!house.built || house.faction || house.type !== 'house') continue;

            const cap = this.getHouseCapacity(house);
            const residents = this.scene.units.filter(u =>
                u.homeConstructId === house.id && !u.isEnemy && u.hp > 0);
            const adults = residents.filter(u => u.age >= 2);

            this._tryMarriage(adults);

            const father = adults.find(u =>
                u.gender === 'male' && u.spouseId && adults.some(f => f.id === u.spouseId));
            const mother = father ? adults.find(u => u.id === father.spouseId) : null;

            if (!father || !mother || residents.length >= cap) {
                house.spawnTimer = 0;
                continue;
            }

            house.spawnTimer = (house.spawnTimer ?? 0) + delta;
            if (house.spawnTimer >= effectiveSpawnMs) {
                house.spawnTimer = 0;
                this.scene.unitManager.spawnChild(father, mother);
            }
        }
    }

    _tryMarriage(adults) {
        const single = adults.filter(u => !u.spouseId);
        const male   = single.find(u => u.gender === 'male');
        const female = single.find(u => u.gender === 'female');
        if (!male || !female) return;
        male.spouseId   = female.id;
        female.spouseId = male.id;
        this.scene.uiManager.showFloatText(
            male.x, male.y - 20, '💍 wed', '#ffeeaa');
    }

    tickHouseProduction(delta) {
        for (const house of this.constructs) {
            if (!house.built || house.faction || house.type !== 'house') continue;
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
            
            // Re-occupy mapData if it's a construct
            if (c.placement !== 'edge') {
                const isWallType = ['wall', 'palisade', 'gate', 'watchtower'].includes(c.type);
                this.occupy(c.tx, c.ty, c.width, c.height, isWallType ? 98 : 99);
            }

            // Rebuild edge references
            if (c.placement === 'edge') {
                if (c.isH) {
                    if (!this.hEdges[c.row]) this.hEdges[c.row] = [];
                    this.hEdges[c.row][c.col] = c;
                } else {
                    if (!this.vEdges[c.row]) this.vEdges[c.row] = [];
                    this.vEdges[c.row][c.col] = c;
                }
            }
        }
        
        // Sync with scene reference if it was replaced (though we shouldn't replace it)
        this.scene.constructs = this.constructs;
        
        this.renderAll();
        this.updateStorageCap();
    }
}
