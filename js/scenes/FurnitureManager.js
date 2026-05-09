import { MAP_W, MAP_H, TILE, MAP_OY } from '../config/gameConstants.js';
import { FURNITURE } from '../content/furniture/index.js';

export default class FurnitureManager {
    constructor(scene) {
        this.scene    = scene;
        // sparse map: tileKey → { itemId, ownerId? }
        this.furniture = new Map();
        this._gfx      = null;
        this._txtObjs  = [];
    }

    tileKey(tx, ty) { return ty * MAP_W + tx; }

    init() {
        this._gfx = this.scene._w(this.scene.add.graphics().setDepth(5));
    }

    // ─── Placement ──────────────────────────────────────────────────────────────

    place(tx, ty, itemId) {
        if (tx < 0 || tx >= MAP_W || ty < 0 || ty >= MAP_H) return false;
        if (!FURNITURE[itemId]) return false;
        this.furniture.set(this.tileKey(tx, ty), { itemId });
        this.renderAll();
        return true;
    }

    remove(tx, ty) {
        const removed = this.furniture.delete(this.tileKey(tx, ty));
        if (removed) this.renderAll();
        return removed;
    }

    getAt(tx, ty) {
        return this.furniture.get(this.tileKey(tx, ty)) ?? null;
    }

    // ─── Rendering ─────────────────────────────────────────────────────────────

    renderAll() {
        this._txtObjs.forEach(o => o.destroy());
        this._txtObjs = [];
        this._gfx.clear();

        for (const [key, item] of this.furniture) {
            const tx = key % MAP_W;
            const ty = Math.floor(key / MAP_W);
            this._renderItem(tx, ty, item);
        }
    }

    _renderItem(tx, ty, item) {
        const def = FURNITURE[item.itemId];
        if (!def) return;

        const pad = 3;
        const px  = tx * TILE + pad;
        const py  = MAP_OY + ty * TILE + pad;
        const sz  = TILE - pad * 2;

        this._gfx.fillStyle(def.color, 0.88).fillRect(px, py, sz, sz);
        this._gfx.lineStyle(1, 0xc8a030, 0.55).strokeRect(px, py, sz, sz);

        const iconSz = Math.floor(sz * 0.52);
        const t = this.scene._w(
            this.scene.add.text(px + sz / 2, py + sz / 2, def.icon ?? def.label[0], {
                fontFamily: 'monospace', fontSize: `${iconSz}px`, color: '#ffffff',
            }).setOrigin(0.5).setDepth(5)
        );
        this._txtObjs.push(t);
    }

    // ─── Room classification ─────────────────────────────────────────────────
    // Score tiles in a room to suggest a zone type.

    classifyRoom(tiles) {
        const counts = {};
        for (const { tx, ty } of tiles) {
            const item = this.getAt(tx, ty);
            if (!item) continue;
            const def = FURNITURE[item.itemId];
            if (def?.zoneType) counts[def.zoneType] = (counts[def.zoneType] ?? 0) + 1;
        }
        const entries = Object.entries(counts);
        if (!entries.length) return null;
        entries.sort((a, b) => b[1] - a[1]);
        return entries[0][0]; // highest-count zoneType
    }

    // ─── Save / Load ────────────────────────────────────────────────────────────

    save() {
        const data = [];
        for (const [key, item] of this.furniture) data.push({ key, ...item });
        return data;
    }

    load(data) {
        if (!data) return;
        this.furniture.clear();
        for (const { key, itemId, ownerId } of data) {
            this.furniture.set(key, { itemId, ...(ownerId ? { ownerId } : {}) });
        }
    }
}
