import { MAP_W, MAP_H, TILE, MAP_OY } from '../config/gameConstants.js';
import { FURNITURE } from '../content/furniture/index.js';

// Instance shape:
// { itemId, built, buildWork, maxBuildWork, resourcesSpent, productionQueue }
// productionQueue: null = auto-mode, [] = queue-mode (idles when empty), [{qty,done},...] = has orders

export default class FurnitureManager {
    constructor(scene) {
        this.scene    = scene;
        this.furniture = new Map(); // tileKey → instance
        this._gfx      = null;
        this._txtObjs  = [];
    }

    tileKey(tx, ty) { return ty * MAP_W + tx; }

    init() {
        this._gfx = this.scene._w(this.scene.add.graphics().setDepth(5));
    }

    // ─── Orders ─────────────────────────────────────────────────────────────────

    placeOrder(tx, ty, itemId) {
        if (tx < 0 || tx >= MAP_W || ty < 0 || ty >= MAP_H) return false;
        const def = FURNITURE[itemId];
        if (!def) return false;
        const work = def.buildWork ?? 10;
        this.furniture.set(this.tileKey(tx, ty), {
            itemId,
            built: false,
            buildWork: work,
            maxBuildWork: work,
            resourcesSpent: false,
            productionQueue: null,
        });
        this.renderAll();
        return true;
    }

    completeBuild(tx, ty) {
        const item = this.furniture.get(this.tileKey(tx, ty));
        if (!item) return;
        item.built = true;
        item.buildWork = 0;
        this.renderAll();
    }

    remove(tx, ty) {
        const removed = this.furniture.delete(this.tileKey(tx, ty));
        if (removed) this.renderAll();
        return removed;
    }

    // Move a built item: remove from src, place unbuilt order at dst.
    relocate(srcTx, srcTy, dstTx, dstTy) {
        const item = this.furniture.get(this.tileKey(srcTx, srcTy));
        if (!item || !item.built) return false;
        const { itemId } = item;
        this.remove(srcTx, srcTy);
        return this.placeOrder(dstTx, dstTy, itemId);
    }

    getAt(tx, ty) {
        return this.furniture.get(this.tileKey(tx, ty)) ?? null;
    }

    findAt(wx, wy) {
        const tx = Math.floor(wx / TILE);
        const ty = Math.floor((wy - MAP_OY) / TILE);
        const item = this.getAt(tx, ty);
        return item ? { tx, ty, item } : null;
    }

    getPendingBuilds() {
        const result = [];
        for (const [key, item] of this.furniture) {
            if (item.built) continue;
            const tx = key % MAP_W, ty = Math.floor(key / MAP_W);
            result.push({ tx, ty, item });
        }
        return result;
    }

    // ─── Rendering ─────────────────────────────────────────────────────────────

    renderAll() {
        this._txtObjs.forEach(o => o.destroy());
        this._txtObjs = [];
        this._gfx.clear();

        for (const [key, item] of this.furniture) {
            const tx = key % MAP_W, ty = Math.floor(key / MAP_W);
            this._renderItem(tx, ty, item);
        }
    }

    _renderItem(tx, ty, item) {
        const def = FURNITURE[item.itemId];
        if (!def) return;

        const pad = 3, sz = TILE - pad * 2;
        const px  = tx * TILE + pad;
        const py  = MAP_OY + ty * TILE + pad;
        const alpha = item.built ? 0.88 : 0.35;

        this._gfx.fillStyle(def.color, alpha).fillRect(px, py, sz, sz);
        if (item.built) {
            this._gfx.lineStyle(1, 0xc8a030, 0.55).strokeRect(px, py, sz, sz);
        } else {
            // Dashed border + progress bar
            this._gfx.lineStyle(1, 0xc8a030, 0.3).strokeRect(px, py, sz, sz);
            const progress = item.maxBuildWork > 0
                ? 1 - item.buildWork / item.maxBuildWork : 0;
            this._gfx.fillStyle(0xffdd44, 0.7).fillRect(px, py + sz - 3, Math.round(sz * progress), 3);
        }

        const iconSz = Math.floor(sz * 0.52);
        const t = this.scene._w(
            this.scene.add.text(px + sz / 2, py + sz / 2, def.icon ?? def.label[0], {
                fontFamily: 'monospace', fontSize: `${iconSz}px`,
                color: item.built ? '#ffffff' : '#888866',
            }).setOrigin(0.5).setDepth(5)
        );
        this._txtObjs.push(t);
    }

    // ─── Room classification ─────────────────────────────────────────────────

    classifyRoom(tiles) {
        const counts = {};
        for (const { tx, ty } of tiles) {
            const item = this.getAt(tx, ty);
            if (!item?.built) continue;
            const def = FURNITURE[item.itemId];
            if (def?.zoneType) counts[def.zoneType] = (counts[def.zoneType] ?? 0) + 1;
        }
        const entries = Object.entries(counts);
        if (!entries.length) return null;
        return entries.sort((a, b) => b[1] - a[1])[0][0];
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
        for (const { key, ...item } of data) {
            if (!('productionQueue' in item)) item.productionQueue = null;
            this.furniture.set(key, item);
        }
    }
}
