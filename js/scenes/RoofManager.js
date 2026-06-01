import { TILE, MAP_OY, ROOF_SUPPORT_DIST, ROOF_BUILD_WORK, WARMTH_RADIUS } from '../config/gameConstants.js';
import { CONSTRUCTS } from '../content/constructs/index.js';

const _HEAT_TYPES = new Set(['hearth', 'campfire', 'firepit']);
function _isHeatSource(type) {
    return _HEAT_TYPES.has(type) || (CONSTRUCTS[type]?.provides?.warmth ?? 0) > 0;
}

// RimWorld-style roofing (#29). A roof tile may only exist within ROOF_SUPPORT_DIST tiles of a
// built full-height wall ("support"). Walling off a room auto-plans a roof over its interior; the
// player can also paint roof / remove roof over open areas. Roofs are free but worker-built — a
// builder spends labor per tile, so a roof shows as a blueprint until finished. Removing a
// supporting wall collapses any now-unsupported roof. A finished roof makes its tile "indoor",
// which grants a comfort (and, near a heat source, warmth) mood bonus — see UnitNeeds.
//
// Lightweight per-tile grid (NOT one construct per tile — rooms can be hundreds of tiles), modelled
// on ZoneManager: a Map keyed "tx,ty", a batched graphics layer, and a small save/load blob.

const ROOF_FILL  = 0x3a3326;   // shaded "covered" look for a finished roof
const PLAN_LINE  = 0x66ccdd;   // blueprint cyan for a planned (unbuilt) roof

// Tiny deterministic per-tile hash for organic plank-line jitter (mirrors MapManager road jitter).
function tileHash(tx, ty) {
    let h = (tx * 73856093) ^ (ty * 19349663);
    h = (h ^ (h >>> 13)) >>> 0;
    return h;
}

export default class RoofManager {
    constructor(scene) {
        this.scene = scene;
        this.roofs = new Map();   // "tx,ty" → { built:bool, work:number, auto:bool }
        this._gfx  = null;
        this.roofVersion = 0;     // bumped on any change (used to invalidate caches)
        this._collapseToastAcc = 0;
    }

    tileKey(tx, ty) { return `${tx},${ty}`; }

    init() {
        this._gfx = this.scene._w(this.scene.add.graphics().setDepth(2));
    }

    // ─── Queries ──────────────────────────────────────────────────────────────────

    getRoof(tx, ty)   { return this.roofs.get(this.tileKey(tx, ty)) ?? null; }
    isRoofed(tx, ty)  { const r = this.roofs.get(this.tileKey(tx, ty)); return !!(r && r.built); }
    isPlanned(tx, ty) { const r = this.roofs.get(this.tileKey(tx, ty)); return !!(r && !r.built); }

    // A tile is supported if any tile within ROOF_SUPPORT_DIST has a built full-height wall edge.
    isSupported(tx, ty) {
        const cm = this.scene.constructManager;
        if (!cm) return false;
        const R = ROOF_SUPPORT_DIST;
        for (let dy = -R; dy <= R; dy++) {
            for (let dx = -R; dx <= R; dx++) {
                const cx = tx + dx, cy = ty + dy;
                // Four edges bounding tile (cx,cy): top/bottom horizontal, left/right vertical.
                if (this._fullWall(true,  cy,     cx)    ) return true;
                if (this._fullWall(true,  cy + 1, cx)    ) return true;
                if (this._fullWall(false, cy,     cx)    ) return true;
                if (this._fullWall(false, cy,     cx + 1)) return true;
            }
        }
        return false;
    }

    _fullWall(isH, row, col) {
        const e = this.scene.constructManager.getEdge(isH, row, col);
        return !!(e && e.built && (e.height === 'full' || e.height === 'door'));
    }

    // Built heat sources (hearth/campfire/firepit), cached by the construct list version.
    _heatSources() {
        const cv = this.scene.constructManager?._cv ?? 0;
        if (this._heatCacheCv === cv && this._heatCache) return this._heatCache;
        this._heatCache = (this.scene.constructs ?? [])
            .filter(c => c.built && !c.faction && c.placement !== 'edge' && _isHeatSource(c.type));
        this._heatCacheCv = cv;
        return this._heatCache;
    }

    // Indoor + a heat source within WARMTH_RADIUS (Chebyshev). Cheap — heat sources are few.
    isWarm(tx, ty) {
        if (!this.isRoofed(tx, ty)) return false;
        for (const c of this._heatSources()) {
            if (Math.max(Math.abs(c.tx - tx), Math.abs(c.ty - ty)) <= WARMTH_RADIUS) return true;
        }
        return false;
    }

    // Nearest planned (unbuilt) roof tile to a world point, for the builder seek.
    nearestPlannedRoof(wx, wy, maxTiles = 60) {
        let best = null, bestD = Infinity;
        const maxPx = maxTiles * TILE;
        for (const [k, r] of this.roofs) {
            if (r.built) continue;
            const [tx, ty] = k.split(',').map(Number);
            const cx = (tx + 0.5) * TILE, cy = MAP_OY + (ty + 0.5) * TILE;
            const d = (cx - wx) ** 2 + (cy - wy) ** 2;
            if (d < bestD && d <= maxPx * maxPx) { bestD = d; best = { tx, ty }; }
        }
        return best;
    }

    // ─── Mutation ─────────────────────────────────────────────────────────────────

    planRoof(tx, ty, { auto = false } = {}) {
        const k = this.tileKey(tx, ty);
        if (this.roofs.has(k)) return false;
        if (!this.isSupported(tx, ty)) return false;   // out of support range — silently skip
        this.roofs.set(k, { built: false, work: ROOF_BUILD_WORK, auto });
        this.roofVersion++;
        this.renderAll();
        return true;
    }

    removeRoof(tx, ty) {
        if (this.roofs.delete(this.tileKey(tx, ty))) { this.roofVersion++; this.renderAll(); }
    }

    completeRoof(tx, ty) {
        const r = this.roofs.get(this.tileKey(tx, ty));
        if (!r) return;
        r.built = true;
        this.roofVersion++;
        this.renderAll();
    }

    // Plan a roof over every interior tile of a freshly-enclosed room (all trivially supported).
    autoRoofRoom(tiles) {
        if (!tiles?.length) return;
        let any = false;
        for (const { tx, ty } of tiles) {
            const k = this.tileKey(tx, ty);
            if (this.roofs.has(k)) continue;
            this.roofs.set(k, { built: false, work: ROOF_BUILD_WORK, auto: true });
            any = true;
        }
        if (any) { this.roofVersion++; this.renderAll(); }
    }

    // After a wall is removed, drop any roof within range that is no longer supported.
    revalidateAround(tx, ty) {
        const R = ROOF_SUPPORT_DIST;
        let collapsed = 0;
        for (let dy = -R; dy <= R; dy++) {
            for (let dx = -R; dx <= R; dx++) {
                const k = this.tileKey(tx + dx, ty + dy);
                if (!this.roofs.has(k)) continue;
                if (!this.isSupported(tx + dx, ty + dy)) { this.roofs.delete(k); collapsed++; }
            }
        }
        if (collapsed) {
            this.roofVersion++;
            this.renderAll();
            this.scene.uiManager?.showToast?.(`🏚 Roof collapsed (no support)`, '#cc8855');
        }
    }

    // ─── Rendering ──────────────────────────────────────────────────────────────────

    renderAll() {
        if (!this._gfx) return;
        const g = this._gfx;
        g.clear();
        for (const [k, r] of this.roofs) {
            const [tx, ty] = k.split(',').map(Number);
            const px = tx * TILE, py = MAP_OY + ty * TILE;
            if (r.built) {
                g.fillStyle(ROOF_FILL, 0.34);
                g.fillRect(px, py, TILE, TILE);
                // Two faint plank lines, jittered per tile so a roof reads as boards not a flat tint.
                const j = (tileHash(tx, ty) % 6) - 3;
                g.lineStyle(1, 0x000000, 0.18);
                g.lineBetween(px, py + 11 + j, px + TILE, py + 11 + j);
                g.lineBetween(px, py + 22 - j, px + TILE, py + 22 - j);
            } else {
                // Planned: blueprint hatch + border so the designation is visible before it's built.
                g.fillStyle(PLAN_LINE, 0.10);
                g.fillRect(px, py, TILE, TILE);
                g.lineStyle(1, PLAN_LINE, 0.30);
                g.lineBetween(px, py + TILE, px + TILE, py);
                g.lineBetween(px, py + TILE / 2, px + TILE / 2, py);
                g.lineBetween(px + TILE / 2, py + TILE, px + TILE, py + TILE / 2);
                g.lineStyle(1, PLAN_LINE, 0.45);
                g.strokeRect(px + 0.5, py + 0.5, TILE - 1, TILE - 1);
            }
        }
    }

    // ─── Save / Load ──────────────────────────────────────────────────────────────

    save() {
        return { roofs: [...this.roofs].map(([k, r]) => ({ k, built: r.built, auto: r.auto })) };
    }

    load(data) {
        this.roofs = new Map();
        for (const { k, built, auto } of (data?.roofs ?? []))
            this.roofs.set(k, { built: !!built, work: built ? 0 : ROOF_BUILD_WORK, auto: !!auto });
        this.roofVersion++;
        this.renderAll();
    }
}
