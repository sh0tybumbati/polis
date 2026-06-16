import {
    TILE, MAP_OY, CHUNK_SIZE,
    T_SAND, T_GRASS, T_ROCK, T_FOREST, T_WATER, T_MOUNTAIN,
    TILE_A, TILE_B, BIOME_A, BIOME_B,
    ROAD_NONE, ROAD_DESIRE, ROAD_PAVED, ROAD_TRODDEN, ROAD_SPD, TILE_SPD
} from '../config/gameConstants.js';
import { CONSTRUCTS } from '../content/constructs/index.js';
import { NODES } from '../content/nodes/index.js';
import { MathUtils } from '../utils/MathUtils.js';

export default class MapManager {
    constructor(scene) {
        this.scene = scene;
        this.desireGfx = null;
    }

    // Kept for compatibility — ChunkManager handles actual terrain gen
    biomAt(tx, ty) {
        return this.scene.chunkManager?.biomAt(tx, ty) ?? 0;
    }

    redrawDomainBorders() {
        const g = this.scene.borderGfx;
        if (!g) return;
        g.clear();
        const PALETTE = [0xd4a855, 0x55a8d4, 0xa855d4, 0x55d488, 0xd45588, 0x88d455, 0x5588d4, 0xd48855];
        const cm = this.scene.constructManager;
        this.scene.estateBounds.forEach((dom, i) => {
            if (dom.cx == null) return;
            const col = PALETTE[i % PALETTE.length];
            const inEstate = (tx, ty) => cm.estateContains(dom, tx, ty);
            // Tile-based homestead area (like the fog): fill every tile inside the circular radius
            // and draw a stepped outline along edges where a tile borders the outside.
            g.fillStyle(col, 0.08);
            for (let ty = dom.y1; ty <= dom.y2; ty++)
                for (let tx = dom.x1; tx <= dom.x2; tx++) {
                    if (!inEstate(tx, ty)) continue;
                    g.fillRect(tx * TILE, MAP_OY + ty * TILE, TILE, TILE);
                }
            g.lineStyle(2, col, 0.55);
            for (let ty = dom.y1; ty <= dom.y2; ty++)
                for (let tx = dom.x1; tx <= dom.x2; tx++) {
                    if (!inEstate(tx, ty)) continue;
                    const px = tx * TILE, py = MAP_OY + ty * TILE;
                    if (!inEstate(tx, ty - 1)) g.lineBetween(px, py, px + TILE, py);
                    if (!inEstate(tx, ty + 1)) g.lineBetween(px, py + TILE, px + TILE, py + TILE);
                    if (!inEstate(tx - 1, ty)) g.lineBetween(px, py, px, py + TILE);
                    if (!inEstate(tx + 1, ty)) g.lineBetween(px + TILE, py, px + TILE, py + TILE);
                }
        });
    }

    // Roads convert the whole tile (no inset/outline): grass → worn dirt → trodden → paved.
    // Per-tile hash gives organic colour variation so a path doesn't read as a uniform block.
    drawDesirePath(tx, ty) {
        if (!this.desireGfx) {
            this.desireGfx = this.scene._w(this.scene.add.graphics().setDepth(1));
        }
        const road = this.scene.roadMap.get(`${tx},${ty}`) ?? ROAD_NONE;
        if (road === ROAD_NONE) return;
        const px = tx * TILE, py = MAP_OY + ty * TILE;
        const h  = (((tx * 73856093) ^ (ty * 19349663)) >>> 0);
        const jit = (h % 15) - 7;                       // ±7 per-tile shade jitter
        const shade = (c) => {
            const cl = v => Math.max(0, Math.min(255, v + jit));
            return (cl((c >> 16) & 0xff) << 16) | (cl((c >> 8) & 0xff) << 8) | cl(c & 0xff);
        };
        let col, alpha;
        if      (road === ROAD_DESIRE)  { col = 0xa98f63; alpha = 0.50; }  // faint worn dirt
        else if (road === ROAD_TRODDEN) { col = 0x95794c; alpha = 0.92; }  // hardened path
        else                            { col = 0x8a8478; alpha = 0.96; }  // paved road
        this.desireGfx.fillStyle(shade(col), alpha).fillRect(px, py, TILE, TILE);
        // A couple of darker pebbles/ruts on hardened/paved tiles for cartoony texture.
        if (road !== ROAD_DESIRE) {
            this.desireGfx.fillStyle(shade(col) & 0xe8e8e8, alpha * 0.6);
            this.desireGfx.fillCircle(px + 6 + (h % (TILE - 12)), py + 6 + ((h >> 4) % (TILE - 12)), 2);
        }
    }

    // Clear and redraw the whole road layer (used on load and after a paint, so upgrades don't
    // leave stale fills layered underneath).
    redrawRoads() {
        if (!this.desireGfx) {
            this.desireGfx = this.scene._w(this.scene.add.graphics().setDepth(1));
        }
        this.desireGfx.clear();
        for (const [key, road] of this.scene.roadMap) {
            if (!road) continue;
            const [tx, ty] = key.split(',').map(Number);
            this.drawDesirePath(tx, ty);
        }
    }

    initFog() {
        this.scene.visMap = new Map();
        this.scene._litTiles = [];

        // 1×TILE white square — used as the fog tile sprite for both blitters
        if (!this.scene.textures.exists('fog_px')) {
            const g = this.scene.make.graphics({ add: false });
            g.fillStyle(0x000000, 1).fillRect(0, 0, TILE, TILE);
            g.generateTexture('fog_px', TILE, TILE);
            g.destroy();
        }

        // Two blitters share the same texture, differ only in alpha:
        //   black = undiscovered (vis 0),  dim = explored-not-lit (vis 1)
        const mkBlitter = (alpha) => this.scene._w(
            this.scene.add.blitter(0, MAP_OY, 'fog_px')
                .setDepth(8).setAlpha(alpha)
        );
        this._fogBlack = mkBlitter(0.97);
        this._fogDim   = mkBlitter(0.52);

        // Pre-allocate bob pools sized for ~60×40 tiles (covers zoomed-out viewport)
        const POOL = 2500;
        this._fogPoolBlack = [];
        this._fogPoolDim   = [];
        for (let i = 0; i < POOL; i++) {
            this._fogPoolBlack.push(this._fogBlack.create(0, 0, null, false));
            this._fogPoolDim.push(this._fogDim.create(0, 0, null, false));
        }
    }

    recomputeVis() {
        const visMap = this.scene.visMap;
        const cm = this.scene.chunkManager;

        // Dim previously bright tiles
        for (const key of this.scene._litTiles) {
            if ((visMap.get(key) ?? 0) === 2) visMap.set(key, 1);
        }
        this.scene._litTiles = [];

        // Collect chunks newly reaching vis>=1 this cycle
        const newlyDiscovered = new Set();

        const paintCircle = (cx, cy, r, state) => {
            const r2 = r * r;
            for (let dy = -r; dy <= r; dy++) {
                for (let dx = -r; dx <= r; dx++) {
                    if (dx * dx + dy * dy > r2) continue;
                    const nx = cx + dx, ny = cy + dy;
                    if (isNaN(nx) || isNaN(ny)) continue;
                    const nk = `${nx},${ny}`;
                    const prev = visMap.get(nk) ?? 0;
                    if (prev < state) {
                        if (prev === 0 && cm) {
                            // First time this tile is seen — note its chunk
                            const chunkKey = `${Math.floor(nx / CHUNK_SIZE)},${Math.floor(ny / CHUNK_SIZE)}`;
                            if (!cm.renderedChunks.has(chunkKey)) newlyDiscovered.add(chunkKey);
                        }
                        visMap.set(nk, state);
                        if (state === 2) this.scene._litTiles.push(nk);
                    }
                }
            }
        };

        for (const u of this.scene.units) {
            if (u.isEnemy || u.hp <= 0) continue;
            const clearR = u.type === 'worker' ? 5 : u.type === 'scout' ? 10 : 6;
            const dimR   = clearR * 2;
            const cx = Math.floor(u.x / TILE);
            const cy = Math.floor((u.y - MAP_OY) / TILE);
            paintCircle(cx, cy, dimR,   1);
            paintCircle(cx, cy, clearR, 2);
        }

        for (const b of this.scene.constructs) {
            if (!b.built || b.faction === 'enemy') continue;
            const cx = Math.floor(b.tx + (b.width ?? 1) / 2);
            const cy = Math.floor(b.ty + (b.height ?? 1) / 2);
            const r = CONSTRUCTS[b.type]?.fogRadius ?? 3;
            paintCircle(cx, cy, r, 2);
        }

        // Update explored bounds
        if (!this.scene._exploredBounds) {
            this.scene._exploredBounds = {
                minTx: Infinity, maxTx: -Infinity,
                minTy: Infinity, maxTy: -Infinity,
            };
        }
        const eb = this.scene._exploredBounds;
        for (const key of this.scene._litTiles) {
            const [tx, ty] = key.split(',').map(Number);
            if (tx < eb.minTx) eb.minTx = tx;
            if (tx > eb.maxTx) eb.maxTx = tx;
            if (ty < eb.minTy) eb.minTy = ty;
            if (ty > eb.maxTy) eb.maxTy = ty;
        }

        // Trigger chunk generation + rendering for newly discovered chunks (throttled)
        if (cm && newlyDiscovered.size > 0) {
            let count = 0;
            for (const ck of newlyDiscovered) {
                const [cx, cy] = ck.split(',').map(Number);
                cm.onChunkDiscovered(cx, cy);
                if (++count >= 3) break; // max 3 new chunks per vis cycle
            }
        }
    }

    drawFog() {
        if (!this._fogPoolBlack) return;
        if (!this.scene.fogEnabled) {
            this._fogPoolBlack.forEach(b => b.setVisible(false));
            this._fogPoolDim.forEach(b => b.setVisible(false));
            for (const n of this.scene.resNodes) { n.gfx?.setVisible(true); n.labelObj?.setVisible(true); }
            for (const item of this.scene.groundItems ?? []) { item.gfx?.setVisible(true); item.labelObj?.setVisible(true); }
            return;
        }
        const visMap = this.scene.visMap;
        const view   = this.scene.cameras.main.worldView;

        const minTx = Math.floor(view.x / TILE) - 1;
        const maxTx = Math.ceil(view.right / TILE) + 1;
        const minTy = Math.floor((view.y - MAP_OY) / TILE) - 1;
        const maxTy = Math.ceil((view.bottom - MAP_OY) / TILE) + 1;

        // Grow pools on demand so zoomed-out views never leave uncovered tiles
        const needed = (maxTx - minTx + 1) * (maxTy - minTy + 1);
        while (this._fogPoolBlack.length < needed)
            this._fogPoolBlack.push(this._fogBlack.create(0, 0, null, false));
        while (this._fogPoolDim.length < needed)
            this._fogPoolDim.push(this._fogDim.create(0, 0, null, false));

        const pb = this._fogPoolBlack, pd = this._fogPoolDim;
        let bi = 0, di = 0;

        for (let ty = minTy; ty <= maxTy; ty++) {
            for (let tx = minTx; tx <= maxTx; tx++) {
                const vis = visMap.get(`${tx},${ty}`) ?? 0;
                if (vis === 0) {
                    const b = pb[bi++]; b.x = tx * TILE; b.y = ty * TILE; b.setVisible(true);
                } else if (vis === 1) {
                    const b = pd[di++]; b.x = tx * TILE; b.y = ty * TILE; b.setVisible(true);
                }
            }
        }

        // Return unused bobs to invisible
        for (let i = bi; i < pb.length; i++) pb[i].setVisible(false);
        for (let i = di; i < pd.length; i++) pd[i].setVisible(false);

        // Cull world objects under undiscovered (vis=0) fog
        for (const n of this.scene.resNodes) {
            const tx = Math.floor(n.x / TILE);
            const ty = Math.floor((n.y - MAP_OY) / TILE);
            const show = (visMap.get(`${tx},${ty}`) ?? 0) > 0;
            n.gfx?.setVisible(show);
            n.labelObj?.setVisible(show);
        }
        for (const item of this.scene.groundItems ?? []) {
            const tx = Math.floor(item.x / TILE);
            const ty = Math.floor((item.y - MAP_OY) / TILE);
            const show = (visMap.get(`${tx},${ty}`) ?? 0) > 0;
            item.gfx?.setVisible(show);
            item.labelObj?.setVisible(show);
        }
    }

    drawMinimap() {
        const gfx = this.scene.minimapGfx;
        if (!gfx) return;
        gfx.clear();
        const { _mmX: mx, _mmY: my, _mmW: mw, _mmH: mh } = this.scene;
        gfx.fillStyle(0x050c05, 1).fillRect(mx - 1, my - 1, mw + 2, mh + 2);

        const cm = this.scene.chunkManager;
        const visMap = this.scene.visMap;
        const eb = this.scene._exploredBounds;
        const spawnTx = this.scene.spawnTx ?? 0;
        const spawnTy = this.scene.spawnTy ?? 0;

        // Determine visible area in tile space
        let showRange = 80;
        if (eb && eb.minTx !== Infinity) {
            const rangeX = Math.max(40, eb.maxTx - eb.minTx + 20);
            const rangeY = Math.max(40, eb.maxTy - eb.minTy + 20);
            showRange = Math.max(rangeX, rangeY) / 2;
        }

        const centerTx = spawnTx;
        const centerTy = spawnTy;
        const totalTiles = showRange * 2;
        const tw = mw / totalTiles;
        const th = mh / totalTiles;
        const pxPerTile = Math.max(tw, th);

        const minTx = Math.floor(centerTx - showRange);
        const maxTx = Math.ceil(centerTx + showRange);
        const minTy = Math.floor(centerTy - showRange);
        const maxTy = Math.ceil(centerTy + showRange);

        const buckets = new Map();
        const addBucket = (col, alpha, px, py) => {
            const k = col * 1000 + Math.round(alpha * 100);
            if (!buckets.has(k)) buckets.set(k, { col, alpha, rects: [] });
            buckets.get(k).rects.push(px, py);
        };

        for (let ty = minTy; ty <= maxTy; ty++) {
            for (let tx = minTx; tx <= maxTx; tx++) {
                const vis = visMap.get(`${tx},${ty}`) ?? 0;
                const px = mx + (tx - centerTx + showRange) * pxPerTile;
                const py = my + (ty - centerTy + showRange) * pxPerTile;
                if (px < mx - 1 || px > mx + mw + 1 || py < my - 1 || py > my + mh + 1) continue;

                if (vis === 0) {
                    addBucket(0x000000, 1.0, px, py);
                } else {
                    const t   = cm ? cm.getTile(tx, ty) : 0;
                    const b   = cm ? cm.getBiome(tx, ty) : 0;
                    const tIdx = Math.min(t, TILE_A.length - 1);
                    const col  = (this.scene.chunkManager?.fordSet?.has(`${tx},${ty}`)) ? 0x2266aa
                               : ((BIOME_A[b] ?? TILE_A)[tIdx] ?? TILE_A[tIdx]);
                    addBucket(col, vis === 1 ? 0.38 : 1.0, px, py);
                }
            }
        }

        const pw = Math.max(1, Math.ceil(pxPerTile));
        for (const { col, alpha, rects } of buckets.values()) {
            gfx.fillStyle(col, alpha);
            for (let i = 0; i < rects.length; i += 2) {
                gfx.fillRect(rects[i], rects[i + 1], pw, pw);
            }
        }

        // Constructs on minimap
        for (const b of this.scene.constructs) {
            const vis = visMap.get(`${b.tx},${b.ty}`) ?? 0;
            if (vis === 0) continue;
            const px = mx + (b.tx - centerTx + showRange) * pxPerTile;
            const py = my + (b.ty - centerTy + showRange) * pxPerTile;
            if (px < mx || px > mx + mw || py < my || py > my + mh) continue;
            const col = CONSTRUCTS[b.type]?.color ?? 0x888888;
            gfx.fillStyle(col, 1).fillRect(px, py, Math.max(2, pw * (b.width ?? 1)), Math.max(2, pw * (b.height ?? 1)));
        }

        // Units on minimap
        for (const u of this.scene.units) {
            if (u.hp <= 0) continue;
            const tx = Math.floor(u.x / TILE), ty = Math.floor((u.y - MAP_OY) / TILE);
            const vis = visMap.get(`${tx},${ty}`) ?? 0;
            if (vis < 2) continue;
            const px = mx + (tx - centerTx + showRange) * pxPerTile;
            const py = my + (ty - centerTy + showRange) * pxPerTile;
            if (px < mx || px > mx + mw || py < my || py > my + mh) continue;
            gfx.fillStyle(0x00ffff, 1).fillRect(px, py, 2, 2);
        }
    }

    drawResourceNodes() {
        for (const n of this.scene.resNodes) this.redrawNode(n);
    }

    findNodeAt(wx, wy) {
        return this.scene.resNodes.find(n => n.stock > 0
            && Phaser.Math.Distance.Between(wx, wy, n.x, n.y) < 20);
    }

    tileSpd(tx, ty) {
        const road = this.scene.roadMap.get(`${tx},${ty}`) ?? ROAD_NONE;
        if (road !== ROAD_NONE) return ROAD_SPD[road];
        const terr = this.scene.chunkManager ? this.scene.chunkManager.getTile(tx, ty) : T_GRASS;
        return TILE_SPD[Math.min(terr, TILE_SPD.length - 1)] ?? 1.0;
    }

    isTileBlocked(wx, wy) {
        const tx = Math.floor(wx / TILE), ty = Math.floor((wy - MAP_OY) / TILE);
        const terr = this.scene.chunkManager ? this.scene.chunkManager.getTile(tx, ty) : 0;
        if (terr === T_WATER || terr === T_MOUNTAIN) return true;
        const cell = this.scene.mapData.get(`${tx},${ty}`) ?? 0;
        if (cell < 98) return false;
        const gate = this.scene.constructs.find(b => b.type === 'gate' && b.built && b.tx === tx && b.ty === ty);
        if (gate) return !gate.isOpen;
        return true;
    }

    redrawNode(n) {
        // Reuse the node's Graphics object (clear + redraw) rather than destroy +
        // recreate. The per-redraw teardown/alloc of a fresh Graphics was the
        // dominant frame cost wherever many nodes redraw; clearing is alloc-free.
        // Visibility is owned by drawFog() each frame, so it's left untouched here.
        let g = n.gfx;
        if (g) g.clear();
        else   g = n.gfx = this.scene._w(this.scene.add.graphics().setDepth(2));
        g.setPosition(n.x, n.y).setScale(1);
        if (n.labelObj) { n.labelObj.destroy(); n.labelObj = null; }

        // Branches that draw nothing leave the cleared Graphics empty — visually
        // identical to the old null gfx, minus the destroy/recreate churn.
        if (n.discovered === false) return;

        if (n.type === 'scrub' && n.dormantTimer > 0) {
            g.fillStyle(0x8a6840, 0.35).fillEllipse(0, 2, 18, 10);
            g.fillStyle(0x7a5830, 0.25).fillEllipse(-4, -1, 10, 6);
            return;
        }

        if (n.type === 'berry_bush' && n.dormantTimer > 0) {
            g.fillStyle(0x3a5520, 0.22).fillCircle(-5, 2, 9);
            g.fillStyle(0x4a6630, 0.22).fillCircle(4, 1, 10);
            g.fillStyle(0x3a5520, 0.22).fillCircle(-1, -4, 8);
            return;
        }

        if (n.sapling) {
            if (n.stump) {
                g.fillStyle(0x5a3318, 0.9).fillEllipse(0, 6, 18, 8);
                g.fillStyle(0x7a4a28, 0.7).fillEllipse(0, 5, 12, 5);
                g.fillStyle(0x6a4422, 0.85).fillRect(-1, -1, 2, 7);
                g.fillStyle(0x55cc33, 0.95).fillCircle(0, -3, 4);
            } else {
                g.fillStyle(0x6a4422, 0.85).fillRect(-1, 2, 2, 6);
                g.fillStyle(0x44bb22, 0.9).fillCircle(0, 0, 4);
            }
            return;
        }

        if (n.stock <= 0 && !n.felled) return;

        const def   = NODES[n.type];
        const ratio = n.stock / n.maxStock;

        if (n.type === 'scrub') {
            NODES[n.type]?.draw(g, n, 0.45 + ratio * 0.55);
            return;
        }

        const alpha    = 0.45 + ratio * 0.55;
        const targeted = this.scene.units?.some(u => u.targetNode === n && u.hp > 0);

        if ((n.type === 'small_tree' || n.type === 'large_tree') && !n.felled) {
            const treeScale = Math.min(1.0, 0.35 + (n.treeAge ?? 0) * 0.033);
            g.setScale(treeScale);
        }
        NODES[n.type]?.draw(g, n, alpha);

        if (n.felled === false && n.fellWork !== undefined) {
            const maxFell = n.type === 'large_tree' ? 28 : 16;
            const p = Math.max(0, 1 - n.fellWork / maxFell);
            g.fillStyle(0x000000, 0.6).fillRect(-12, -22, 24, 6);
            g.fillStyle(0xddaa44, 0.9).fillRect(-12, -22, 24 * p, 6);
        }

        if (targeted) {
            const r = def.large ? 24 : 16;
            g.lineStyle(2, 0xffdd44, 0.9).strokeCircle(0, 0, r);
        }

        if (n.slated) {
            const SLATE_COLORS = {
                woodcutter: 0x66dd44,
                miner:      0xaaaaee,
                forager:    0x44ccaa,
                hunter:     0xee7744,
            };
            const col = SLATE_COLORS[n.slateType] ?? 0xcccccc;
            const r   = def.large ? 27 : 19;
            g.lineStyle(2, col, 0.85).strokeCircle(0, 0, r);
            // Small upward triangle above the ring as a flag
            g.fillStyle(col, 1.0).fillTriangle(-4, -r - 1, 4, -r - 1, 0, -r - 7);
        }

    }
}
