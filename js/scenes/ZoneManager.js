import { MAP_W, MAP_H, TILE, MAP_OY } from '../config/gameConstants.js';
import { CROPS } from '../content/crops/index.js';

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
        this._gfx         = null;
        this._growGfx     = null;
        this._growTickAcc = 0;
    }

    tileKey(tx, ty) { return ty * MAP_W + tx; }

    init() {
        this._gfx     = this.scene._w(this.scene.add.graphics().setDepth(2));
        this._growGfx = this.scene._w(this.scene.add.graphics().setDepth(2));
        this._selGfx  = this.scene._w(this.scene.add.graphics().setDepth(4));
    }

    // ─── Painting ────────────────────────────────────────────────────────────────

    _claimed(k) {
        return this.workTiles.has(k) || this.storageTiles.has(k) || this.marketTiles.has(k)
            || this.growTiles.has(k)  || this.pastureTiles.has(k);
    }

    paintWork(tx, ty) {
        if (tx < 0 || tx >= MAP_W || ty < 0 || ty >= MAP_H) return;
        const k = this.tileKey(tx, ty);
        if (this._claimed(k) && !this.workTiles.has(k)) return;
        this.workTiles.add(k);
        this.renderAll();
    }

    paintStorage(tx, ty) {
        if (tx < 0 || tx >= MAP_W || ty < 0 || ty >= MAP_H) return;
        const k = this.tileKey(tx, ty);
        if (this._claimed(k) && !this.storageTiles.has(k)) return;
        if (!this.storageTiles.has(k)) this.storageTiles.set(k, { accepts: [] });
        this.renderAll();
    }

    paintMarket(tx, ty) {
        if (tx < 0 || tx >= MAP_W || ty < 0 || ty >= MAP_H) return;
        const k = this.tileKey(tx, ty);
        if (this._claimed(k) && !this.marketTiles.has(k)) return;
        this.marketTiles.add(k);
        this.renderAll();
    }

    paintPasture(tx, ty) {
        if (tx < 0 || tx >= MAP_W || ty < 0 || ty >= MAP_H) return;
        const k = this.tileKey(tx, ty);
        if (this._claimed(k) && !this.pastureTiles.has(k)) return;
        this.pastureTiles.add(k);
        this.renderAll();
    }

    paintGrow(tx, ty, crop) {
        if (tx < 0 || tx >= MAP_W || ty < 0 || ty >= MAP_H) return;
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
    }

    _renderLayer(tileSet, style) {
        if (tileSet.size === 0) return;
        // tileSet may be a Set or Map — iterate keys either way
        const keys = tileSet instanceof Map ? [...tileSet.keys()] : [...tileSet];
        const has  = k => tileSet.has(k);
        this._gfx.fillStyle(style.fill, style.fillAlpha);
        for (const key of keys) {
            const tx = key % MAP_W, ty = Math.floor(key / MAP_W);
            this._gfx.fillRect(tx * TILE, MAP_OY + ty * TILE, TILE, TILE);
        }
        this._gfx.lineStyle(1, style.line, style.lineAlpha);
        for (const key of keys) {
            const tx = key % MAP_W, ty = Math.floor(key / MAP_W);
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
            const def = state.crop ? CROPS[state.crop] : null;
            const col = def ? def.zoneColor : 0x336622;
            this._gfx.fillStyle(col, 0.16);
            this._gfx.fillRect((key % MAP_W) * TILE, MAP_OY + Math.floor(key / MAP_W) * TILE, TILE, TILE);
        }
        this._gfx.lineStyle(1, 0x558833, 0.55);
        for (const key of this.growTiles.keys()) {
            const tx = key % MAP_W, ty = Math.floor(key / MAP_W);
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
            const bx = (key % MAP_W) * TILE;
            const by = MAP_OY + Math.floor(key / MAP_W) * TILE;
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
                const ctx = ck % MAP_W, cty = Math.floor(ck / MAP_W);
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
            const ctx = ck % MAP_W, cty = Math.floor(ck / MAP_W);
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
                const tx = k % MAP_W, ty = Math.floor(k / MAP_W);
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
            storage: [...this.storageTiles].map(([k, v]) => ({ k, accepts: v.accepts ?? [] })),
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
            this.storageTiles = new Map(storageRaw.map(({ k, accepts }) => [k, { accepts: accepts ?? [] }]));
        }
    }
}
