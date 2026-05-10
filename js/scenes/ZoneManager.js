import { MAP_W, MAP_H, TILE, MAP_OY } from '../config/gameConstants.js';

const ZONE_STYLE = {
    work:    { fill: 0x4488ff, fillAlpha: 0.14, line: 0x4488ff, lineAlpha: 0.55 },
    storage: { fill: 0xffaa22, fillAlpha: 0.14, line: 0xffaa22, lineAlpha: 0.55 },
};

export default class ZoneManager {
    constructor(scene) {
        this.scene        = scene;
        this.workTiles    = new Set(); // tileKey
        this.storageTiles = new Set(); // tileKey
        this._gfx         = null;
    }

    tileKey(tx, ty) { return ty * MAP_W + tx; }

    init() {
        this._gfx = this.scene._w(this.scene.add.graphics().setDepth(2));
    }

    paintWork(tx, ty) {
        if (tx < 0 || tx >= MAP_W || ty < 0 || ty >= MAP_H) return;
        this.workTiles.add(this.tileKey(tx, ty));
        this.renderAll();
    }

    paintStorage(tx, ty) {
        if (tx < 0 || tx >= MAP_W || ty < 0 || ty >= MAP_H) return;
        this.storageTiles.add(this.tileKey(tx, ty));
        this.renderAll();
    }

    erase(tx, ty) {
        const k = this.tileKey(tx, ty);
        // eslint-disable-next-line no-bitwise
        if (this.workTiles.delete(k) | this.storageTiles.delete(k)) this.renderAll();
    }

    getAt(tx, ty) {
        const k = this.tileKey(tx, ty);
        return { work: this.workTiles.has(k), storage: this.storageTiles.has(k) };
    }

    // Returns connected components of work tiles: [{tx,ty}[]]
    getWorkZones()    { return this._components(this.workTiles); }
    getStorageZones() { return this._components(this.storageTiles); }

    _components(tileSet) {
        const visited = new Set();
        const zones   = [];
        for (const key of tileSet) {
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

    renderAll() {
        this._gfx.clear();
        this._renderLayer(this.workTiles,    ZONE_STYLE.work);
        this._renderLayer(this.storageTiles, ZONE_STYLE.storage);
    }

    _renderLayer(tileSet, style) {
        if (tileSet.size === 0) return;

        this._gfx.fillStyle(style.fill, style.fillAlpha);
        for (const key of tileSet) {
            const tx = key % MAP_W, ty = Math.floor(key / MAP_W);
            this._gfx.fillRect(tx * TILE, MAP_OY + ty * TILE, TILE, TILE);
        }

        this._gfx.lineStyle(1, style.line, style.lineAlpha);
        for (const key of tileSet) {
            const tx = key % MAP_W, ty = Math.floor(key / MAP_W);
            const px = tx * TILE, py = MAP_OY + ty * TILE;
            if (!tileSet.has(this.tileKey(tx,   ty-1))) this._gfx.lineBetween(px,        py,        px + TILE, py);
            if (!tileSet.has(this.tileKey(tx,   ty+1))) this._gfx.lineBetween(px,        py + TILE, px + TILE, py + TILE);
            if (!tileSet.has(this.tileKey(tx-1, ty  ))) this._gfx.lineBetween(px,        py,        px,        py + TILE);
            if (!tileSet.has(this.tileKey(tx+1, ty  ))) this._gfx.lineBetween(px + TILE, py,        px + TILE, py + TILE);
        }
    }

    save() {
        return { work: [...this.workTiles], storage: [...this.storageTiles] };
    }

    load(data) {
        if (!data) return;
        this.workTiles    = new Set(data.work    ?? []);
        this.storageTiles = new Set(data.storage ?? []);
    }
}
