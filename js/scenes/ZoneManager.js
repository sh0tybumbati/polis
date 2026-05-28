import { TILE, MAP_OY } from '../config/gameConstants.js';
import { CROPS } from '../content/crops/index.js';

// Color per item key — used for stockpile map icons
const ITEM_COL = {
    'Food.Grain.Wheat':              0xe8d060,
    'Food.Grain.Wheat.Flour':        0xf0e8b0,
    'Food.Grain.Wheat.Bread':        0xd4944a,
    'Food.Produce.Berry':            0xcc2244,
    'Food.Produce.Olive':            0x8a7a2a,
    'Food.Produce.Olive.Oil':        0xddcc44,
    'Food.Meat.Venison':             0xaa4422,
    'Food.Meat.Venison.Cuts':        0xbb5533,
    'Food.Meat.Venison.Sausages':    0x994422,
    'Food.Drink.Beer':               0xddaa22,
    'Materials.Wood.Pine':           0x8b5e3c,
    'Materials.Wood.Pine.Sticks':    0xaa7744,
    'Materials.Wood.Pine.Planks':    0xcc9966,
    'Materials.Stone.Limestone':     0x9a9090,
    'Materials.Stone.Limestone.Stones': 0xb0a8a0,
    'Materials.Stone.Limestone.Blocks': 0xc0b8b0,
    'Materials.Metal.Copper.Ore':    0xcc7744,
    'Materials.Metal.Copper':        0xdd8833,
    'Materials.Metal.Bronze':        0xcc9933,
    'Textile.Fiber.Wool':            0xf0eeee,
    'Textile.Hide.Deer':             0xaa8844,
    'Textile.Leather':               0x996633,
    'Equipment.LeatherKit':          0x997744,
    'Equipment.BronzeKit':           0xbbaa44,
};

function _itemColor(key) {
    if (ITEM_COL[key]) return ITEM_COL[key];
    if (key.startsWith('Food.'))              return 0x88cc44;
    if (key.startsWith('Materials.Wood.'))    return 0x8b5e3c;
    if (key.startsWith('Materials.Stone.'))   return 0x9a9090;
    if (key.startsWith('Materials.Metal.'))   return 0x8899bb;
    if (key.startsWith('Textile.'))           return 0xaa88cc;
    if (key.startsWith('Equipment.'))         return 0xddaa33;
    return 0x888888;
}

const ZONE_STYLE = {
    work:    { fill: 0x4488ff, fillAlpha: 0.14, line: 0x4488ff, lineAlpha: 0.55 },
    storage: { fill: 0xffaa22, fillAlpha: 0.14, line: 0xffaa22, lineAlpha: 0.55 },
    market:  { fill: 0xddaa22, fillAlpha: 0.16, line: 0xddaa22, lineAlpha: 0.60 },
    pasture: { fill: 0x66aa44, fillAlpha: 0.16, line: 0x66aa44, lineAlpha: 0.60 },
};

// Growth slot colors: empty → early → late → ready
const SC = { empty: 0x334422, early: 0x66aa44, late: 0x99dd44, ready: 0xffdd22 };

export default class ZoneManager {
    constructor(scene) {
        this.scene        = scene;
        this.workTiles    = new Set();                  // tileKey
        this.storageTiles = new Map();    // tileKey → { accepts: string[] }
        this.growTiles    = new Map();    // tileKey → { crop, slots: number[] }
        this.marketTiles  = new Set();    // tileKey
        this.pastureTiles = new Set();    // tileKey
        this._gfx          = null;
        this._growGfx      = null;
        this._stockGfx     = null;
        this._growTickAcc  = 0;
    }

    tileKey(tx, ty) { return `${tx},${ty}`; }

    init() {
        this._gfx      = this.scene._w(this.scene.add.graphics().setDepth(2));
        this._growGfx  = this.scene._w(this.scene.add.graphics().setDepth(2));
        this._stockGfx = this.scene._w(this.scene.add.graphics().setDepth(3));
        this._selGfx   = this.scene._w(this.scene.add.graphics().setDepth(4));
    }

    // ─── Painting ────────────────────────────────────────────────────────────────

    _claimed(k) {
        return this.workTiles.has(k) || this.storageTiles.has(k) || this.marketTiles.has(k)
            || this.growTiles.has(k)  || this.pastureTiles.has(k);
    }

    paintWork(tx, ty) {
        const k = this.tileKey(tx, ty);
        if (this._claimed(k) && !this.workTiles.has(k)) return;
        this.workTiles.add(k);
        this.renderAll();
    }

    paintStorage(tx, ty) {
        const k = this.tileKey(tx, ty);
        if (this._claimed(k) && !this.storageTiles.has(k)) return;
        if (!this.storageTiles.has(k)) this.storageTiles.set(k, { accepts: [] });
        this.renderAll();
    }

    paintMarket(tx, ty) {
        const k = this.tileKey(tx, ty);
        if (this._claimed(k) && !this.marketTiles.has(k)) return;
        this.marketTiles.add(k);
        this.renderAll();
    }

    paintPasture(tx, ty) {
        const k = this.tileKey(tx, ty);
        if (this._claimed(k) && !this.pastureTiles.has(k)) return;
        this.pastureTiles.add(k);
        this.renderAll();
    }

    paintGrow(tx, ty, crop) {
        const k = this.tileKey(tx, ty);
        if (this._claimed(k) && !this.growTiles.has(k)) return;
        if (!this.growTiles.has(k)) {
            const def = crop ? CROPS[crop] : null;
            this.growTiles.set(k, { crop: crop ?? null, slots: new Array(def?.density ?? 0).fill(-1) });
        }
        this.renderAll();
    }

    // Set accepts filter for all connected storage tiles containing (tx, ty)
    setStorageAccepts(tx, ty, categories) {
        const { tiles } = this.getConnectedTiles(tx, ty);
        for (const { tx: ttx, ty: tty } of tiles) {
            const k = this.tileKey(ttx, tty);
            const cfg = this.storageTiles.get(k);
            if (cfg) cfg.accepts = [...categories];
        }
    }

    // Assign a crop to all tiles in the connected grow zone containing (tx, ty)
    setGrowZoneCrop(tx, ty, crop) {
        const def = CROPS[crop];
        if (!def) return;
        const { tiles } = this.getConnectedTiles(tx, ty);
        for (const { tx: ttx, ty: tty } of tiles) {
            const k = this.tileKey(ttx, tty);
            const existing = this.growTiles.get(k);
            if (existing && existing.crop !== crop) {
                existing.crop  = crop;
                existing.slots = new Array(def.density).fill(-1);
            } else if (!existing) {
                this.growTiles.set(k, { crop, slots: new Array(def.density).fill(-1) });
            }
        }
        this.renderAll();
    }

    erase(tx, ty) {
        const k = this.tileKey(tx, ty);
        const changed = this.workTiles.delete(k) || this.storageTiles.delete(k) || this.growTiles.delete(k) || this.marketTiles.delete(k) || this.pastureTiles.delete(k);
        if (changed) this.renderAll();
    }

    getAt(tx, ty) {
        const k = this.tileKey(tx, ty);
        return {
            work:    this.workTiles.has(k),
            storage: this.storageTiles.get(k) ?? null,
            grow:    this.growTiles.get(k) ?? null,
            market:  this.marketTiles.has(k),
            pasture: this.pastureTiles.has(k),
        };
    }

    getWorkZones()    { return this._components(this.workTiles); }
    getStorageZones() { return this._components(this.storageTiles); }
    getPastureZones() { return this._components(this.pastureTiles); }

    // Grow tile queries used by farmer AI
    getReadyGrowTiles() {
        const result = [];
        for (const [key, state] of this.growTiles)
            if (state.crop && state.slots.some(s => s >= 1)) result.push(key);
        return result;
    }

    getPlantableTiles() {
        const result = [];
        for (const [key, state] of this.growTiles)
            if (state.crop && state.slots.some(s => s < 0)) result.push(key);
        return result;
    }

    // ─── Growth tick (called from scene update, throttled to 1s intervals) ───────

    tickGrow(dt) {
        if (this.growTiles.size === 0) return;
        this._growTickAcc += dt;
        if (this._growTickAcc < 1000) return;
        const elapsed = this._growTickAcc;
        this._growTickAcc = 0;

        for (const state of this.growTiles.values()) {
            if (!state.crop) continue;
            const def = CROPS[state.crop];
            if (!def) continue;
            for (let i = 0; i < state.slots.length; i++) {
                if (state.slots[i] < 0 || state.slots[i] >= 1) continue;
                state.slots[i] = Math.min(1, state.slots[i] + elapsed / def.growTime);
            }
        }
        this._renderGrowSlots();
    }

    // ─── Rendering ───────────────────────────────────────────────────────────────

    renderAll() {
        this._gfx.clear();
        this._renderLayer(this.workTiles,    ZONE_STYLE.work);
        this._renderLayer(this.storageTiles, ZONE_STYLE.storage);
        this._renderLayer(this.marketTiles,  ZONE_STYLE.market);
        this._renderLayer(this.pastureTiles, ZONE_STYLE.pasture);
        this._renderGrowLayer();
        this._renderGrowSlots();
        this._renderStockpiles();
    }

    tickStockpile() {
        if (this._stockDirty) { this._stockDirty = false; this._renderStockpiles(); }
    }

    _renderStockpiles() {
        if (!this._stockGfx) return;
        this._stockGfx.clear();
        if (this.storageTiles.size === 0) return;

        // 3×3 cubit grid — cubit centers at [5, 16, 27]px within each 32px tile
        const SUB = [5, 16, 27];
        const ICO = 8;   // icon square size, centered on cubit center

        for (const [key, cfg] of this.storageTiles) {
            const inv = cfg.inventory ?? {};
            const items = Object.entries(inv)
                .filter(([, v]) => v > 0)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 9);
            if (items.length === 0) continue;

            const [tx, ty] = key.split(',').map(Number);
            const bx = tx * TILE;
            const by = MAP_OY + ty * TILE;

            items.forEach(([itemKey], i) => {
                const col = _itemColor(itemKey);
                const cx = bx + SUB[i % 3];
                const cy = by + SUB[Math.floor(i / 3)];
                const ix = cx - ICO / 2, iy = cy - ICO / 2;
                // Drop shadow
                this._stockGfx.fillStyle(0x000000, 0.35);
                this._stockGfx.fillRect(ix + 1, iy + 1, ICO, ICO);
                // Item block
                this._stockGfx.fillStyle(col, 0.92);
                this._stockGfx.fillRect(ix, iy, ICO, ICO);
                // Highlight on top-left edge for depth
                this._stockGfx.fillStyle(0xffffff, 0.28);
                this._stockGfx.fillRect(ix, iy, ICO - 1, 2);
                this._stockGfx.fillRect(ix, iy, 2, ICO - 1);
            });
        }
    }

    _renderLayer(tileSet, style) {
        if (tileSet.size === 0) return;
        // tileSet may be a Set or Map — iterate keys either way
        const keys = tileSet instanceof Map ? [...tileSet.keys()] : [...tileSet];
        const has  = k => tileSet.has(k);
        this._gfx.fillStyle(style.fill, style.fillAlpha);
        for (const key of keys) {
            const [tx, ty] = key.split(',').map(Number);
            this._gfx.fillRect(tx * TILE, MAP_OY + ty * TILE, TILE, TILE);
        }
        this._gfx.lineStyle(1, style.line, style.lineAlpha);
        for (const key of keys) {
            const [tx, ty] = key.split(',').map(Number);
            const px = tx * TILE, py = MAP_OY + ty * TILE;
            if (!has(this.tileKey(tx,   ty-1))) this._gfx.lineBetween(px,        py,        px + TILE, py);
            if (!has(this.tileKey(tx,   ty+1))) this._gfx.lineBetween(px,        py + TILE, px + TILE, py + TILE);
            if (!has(this.tileKey(tx-1, ty  ))) this._gfx.lineBetween(px,        py,        px,        py + TILE);
            if (!has(this.tileKey(tx+1, ty  ))) this._gfx.lineBetween(px + TILE, py,        px + TILE, py + TILE);
        }
    }

    _renderGrowLayer() {
        if (this.growTiles.size === 0) return;
        for (const [key, state] of this.growTiles) {
            const [tx, ty] = key.split(',').map(Number);
            const def = state.crop ? CROPS[state.crop] : null;
            const col = def ? def.zoneColor : 0x336622;
            this._gfx.fillStyle(col, 0.16);
            this._gfx.fillRect(tx * TILE, MAP_OY + ty * TILE, TILE, TILE);
        }
        this._gfx.lineStyle(1, 0x558833, 0.55);
        for (const key of this.growTiles.keys()) {
            const [tx, ty] = key.split(',').map(Number);
            const px = tx * TILE, py = MAP_OY + ty * TILE;
            if (!this.growTiles.has(this.tileKey(tx,   ty-1))) this._gfx.lineBetween(px,        py,        px + TILE, py);
            if (!this.growTiles.has(this.tileKey(tx,   ty+1))) this._gfx.lineBetween(px,        py + TILE, px + TILE, py + TILE);
            if (!this.growTiles.has(this.tileKey(tx-1, ty  ))) this._gfx.lineBetween(px,        py,        px,        py + TILE);
            if (!this.growTiles.has(this.tileKey(tx+1, ty  ))) this._gfx.lineBetween(px + TILE, py,        px + TILE, py + TILE);
        }
    }

    _renderGrowSlots() {
        this._growGfx.clear();
        for (const [key, state] of this.growTiles) {
            const def = CROPS[state.crop];
            if (!def) continue;
            const [tx, ty] = key.split(',').map(Number);
            const bx = tx * TILE;
            const by = MAP_OY + ty * TILE;
            for (let i = 0; i < state.slots.length; i++) {
                const sv = state.slots[i];
                const [fx, fy] = def.slotPositions[i];
                const px = Math.round(bx + fx * TILE);
                const py = Math.round(by + fy * TILE);
                let color, alpha;
                if (sv < 0)       { color = SC.empty; alpha = 0.45; }
                else if (sv < 0.5){ color = SC.early; alpha = 1.0; }
                else if (sv < 1)  { color = SC.late;  alpha = 1.0; }
                else              { color = SC.ready; alpha = 1.0; }
                this._growGfx.fillStyle(color, alpha);
                this._growGfx.fillRect(px - 2, py - 2, 4, 4);
            }
        }
    }

    // Returns { tiles:[{tx,ty}], zoneType, cropKey } for the connected zone under (tx,ty)
    getConnectedTiles(tx, ty) {
        const k    = this.tileKey(tx, ty);
        const zAt  = this.getAt(tx, ty);
        let tileSet = null, zoneType = null, cropKey = null;

        if (zAt.work)         { tileSet = this.workTiles;    zoneType = 'work'; }
        else if (zAt.storage) { tileSet = this.storageTiles; zoneType = 'storage'; }  // Map
        else if (zAt.market)  { tileSet = this.marketTiles;  zoneType = 'market'; }
        else if (zAt.pasture) { tileSet = this.pastureTiles; zoneType = 'pasture'; }
        else if (zAt.grow)    { zoneType = 'grow'; cropKey = zAt.grow.crop; }

        if (zoneType === 'grow') {
            const visited = new Set([k]), queue = [k], result = [];
            while (queue.length) {
                const ck = queue.shift();
                const [ctx, cty] = ck.split(',').map(Number);
                result.push({ tx: ctx, ty: cty });
                for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
                    const nk = this.tileKey(ctx + dx, cty + dy);
                    if (!visited.has(nk) && this.growTiles.has(nk)) { visited.add(nk); queue.push(nk); }
                }
            }
            // Use the most common assigned crop as the zone crop
            const crops = result.map(t => this.growTiles.get(this.tileKey(t.tx, t.ty))?.crop).filter(Boolean);
            cropKey = crops[0] ?? null;
            return { tiles: result, zoneType, cropKey };
        }

        if (!tileSet) return { tiles: [], zoneType: null, cropKey: null };
        const visited = new Set([k]), queue = [k], result = [];
        while (queue.length) {
            const ck = queue.shift();
            const [ctx, cty] = ck.split(',').map(Number);
            result.push({ tx: ctx, ty: cty });
            for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
                const nk = this.tileKey(ctx + dx, cty + dy);
                if (!visited.has(nk) && tileSet.has(nk)) { visited.add(nk); queue.push(nk); }
            }
        }
        return { tiles: result, zoneType, cropKey };
    }

    setSelection(tiles, col) {
        this._selGfx.clear();
        if (!tiles?.length) return;
        const keySet = new Set(tiles.map(t => this.tileKey(t.tx, t.ty)));
        this._selGfx.fillStyle(col, 0.10);
        for (const { tx, ty } of tiles)
            this._selGfx.fillRect(tx * TILE, MAP_OY + ty * TILE, TILE, TILE);
        this._selGfx.lineStyle(2, col, 0.95);
        for (const { tx, ty } of tiles) {
            const px = tx * TILE, py = MAP_OY + ty * TILE;
            if (!keySet.has(this.tileKey(tx,   ty-1))) this._selGfx.lineBetween(px,        py,        px + TILE, py);
            if (!keySet.has(this.tileKey(tx,   ty+1))) this._selGfx.lineBetween(px,        py + TILE, px + TILE, py + TILE);
            if (!keySet.has(this.tileKey(tx-1, ty  ))) this._selGfx.lineBetween(px,        py,        px,        py + TILE);
            if (!keySet.has(this.tileKey(tx+1, ty  ))) this._selGfx.lineBetween(px + TILE, py,        px + TILE, py + TILE);
        }
    }

    clearSelection() { this._selGfx?.clear(); }

    _components(tileSet) {
        const visited = new Set();
        const zones   = [];
        const iter    = tileSet instanceof Map ? tileSet.keys() : tileSet;
        for (const key of iter) {
            if (visited.has(key)) continue;
            const zone = [], queue = [key];
            visited.add(key);
            while (queue.length) {
                const k  = queue.shift();
                const [tx, ty] = k.split(',').map(Number);
                zone.push({ tx, ty });
                for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
                    const nk = this.tileKey(tx + dx, ty + dy);
                    if (!visited.has(nk) && tileSet.has(nk)) { visited.add(nk); queue.push(nk); }
                }
            }
            zones.push(zone);
        }
        return zones;
    }

    // ─── Save / Load ─────────────────────────────────────────────────────────────

    save() {
        return {
            work:    [...this.workTiles],
            storage: [...this.storageTiles].map(([k, v]) => ({ k, accepts: v.accepts ?? [], inventory: v.inventory ?? {} })),
            market:  [...this.marketTiles],
            grow:    [...this.growTiles].map(([k, v]) => ({ k, crop: v.crop, slots: [...v.slots] })),
        };
    }

    load(data) {
        if (!data) return;
        this.workTiles  = new Set(data.work   ?? []);
        this.marketTiles = new Set(data.market ?? []);
        this.growTiles  = new Map((data.grow ?? []).map(({ k, crop, slots }) => [k, { crop, slots }]));
        // Support both old format (array of numbers) and new format (array of {k, accepts})
        const storageRaw = data.storage ?? [];
        if (storageRaw.length > 0 && typeof storageRaw[0] === 'number') {
            this.storageTiles = new Map(storageRaw.map(k => [k, { accepts: [] }]));
        } else {
            this.storageTiles = new Map(storageRaw.map(({ k, accepts, inventory }) => [k, { accepts: accepts ?? [], inventory: inventory ?? {} }]));
        }
    }
}
