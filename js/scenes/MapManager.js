import {
    TILE, MAP_OY, CHUNK_SIZE,
    T_SAND, T_GRASS, T_ROCK, T_FOREST, T_WATER, T_MOUNTAIN,
    TILE_A, TILE_B, BIOME_A, BIOME_B,
    ROAD_NONE, ROAD_DESIRE, ROAD_PAVED, ROAD_SPD, TILE_SPD
} from '../config/gameConstants.js';
import { CONSTRUCTS } from '../content/constructs/index.js';
import { NODES } from '../content/nodes/index.js';
import { ITEMS } from '../content/items/index.js';
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
        this.scene.domains.forEach((dom, i) => {
            const col = PALETTE[i % PALETTE.length];
            const x1 = dom.x1 * TILE;
            const y1 = MAP_OY + dom.y1 * TILE;
            const w  = (dom.x2 - dom.x1 + 1) * TILE;
            const h  = (dom.y2 - dom.y1 + 1) * TILE;
            g.fillStyle(col, 0.07).fillRect(x1, y1, w, h);
            g.lineStyle(2, col, 0.5).strokeRect(x1 + 1, y1 + 1, w - 2, h - 2);
        });
    }

    drawDesirePath(tx, ty) {
        if (!this.desireGfx) {
            this.desireGfx = this.scene._w(this.scene.add.graphics().setDepth(1));
        }
        const road = this.scene.roadMap.get(`${tx},${ty}`) ?? ROAD_NONE;
        if (road === ROAD_DESIRE) {
            this.desireGfx.fillStyle(0xb8946a, 0.55)
                .fillRect(tx * TILE + 3, MAP_OY + ty * TILE + 3, TILE - 6, TILE - 6);
        } else if (road === ROAD_PAVED) {
            this.desireGfx.fillStyle(0x9a8870, 0.75)
                .fillRect(tx * TILE + 1, MAP_OY + ty * TILE + 1, TILE - 2, TILE - 2);
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
            const clearR = u.type === 'worker' ? 3 : u.type === 'scout' ? 8 : 5;
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
        const visMap = this.scene.visMap;
        const view   = this.scene.cameras.main.worldView;

        const minTx = Math.floor(view.x / TILE) - 1;
        const maxTx = Math.ceil(view.right / TILE) + 1;
        const minTy = Math.floor((view.y - MAP_OY) / TILE) - 1;
        const maxTy = Math.ceil((view.bottom - MAP_OY) / TILE) + 1;

        const pb = this._fogPoolBlack, pd = this._fogPoolDim;
        let bi = 0, di = 0;

        for (let ty = minTy; ty <= maxTy; ty++) {
            for (let tx = minTx; tx <= maxTx; tx++) {
                const vis = visMap.get(`${tx},${ty}`) ?? 0;
                if (vis === 0 && bi < pb.length) {
                    const b = pb[bi++]; b.x = tx * TILE; b.y = ty * TILE; b.setVisible(true);
                } else if (vis === 1 && di < pd.length) {
                    const b = pd[di++]; b.x = tx * TILE; b.y = ty * TILE; b.setVisible(true);
                }
            }
        }

        // Return unused bobs to invisible
        for (let i = bi; i < pb.length; i++) pb[i].setVisible(false);
        for (let i = di; i < pd.length; i++) pd[i].setVisible(false);
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
        n.gfx?.destroy(); n.labelObj?.destroy();
        n.gfx = null; n.labelObj = null;

        if (n.discovered === false) return;

        if (n.type === 'scrub' && n.dormantTimer > 0) {
            n.gfx = this.scene._w(this.scene.add.graphics().setDepth(2)).setPosition(n.x, n.y);
            n.gfx.fillStyle(0x8a6840, 0.35).fillEllipse(0, 2, 18, 10);
            n.gfx.fillStyle(0x7a5830, 0.25).fillEllipse(-4, -1, 10, 6);
            return;
        }

        if (n.type === 'berry_bush' && n.dormantTimer > 0) {
            n.gfx = this.scene._w(this.scene.add.graphics().setDepth(2)).setPosition(n.x, n.y);
            n.gfx.fillStyle(0x3a5520, 0.22).fillCircle(-5, 2, 9);
            n.gfx.fillStyle(0x4a6630, 0.22).fillCircle(4, 1, 10);
            n.gfx.fillStyle(0x3a5520, 0.22).fillCircle(-1, -4, 8);
            return;
        }

        if (n.sapling) {
            n.gfx = this.scene._w(this.scene.add.graphics().setDepth(2)).setPosition(n.x, n.y);
            if (n.stump) {
                n.gfx.fillStyle(0x5a3318, 0.9).fillEllipse(0, 6, 18, 8);
                n.gfx.fillStyle(0x7a4a28, 0.7).fillEllipse(0, 5, 12, 5);
                n.gfx.fillStyle(0x6a4422, 0.85).fillRect(-1, -1, 2, 7);
                n.gfx.fillStyle(0x55cc33, 0.95).fillCircle(0, -3, 4);
            } else {
                n.gfx.fillStyle(0x6a4422, 0.85).fillRect(-1, 2, 2, 6);
                n.gfx.fillStyle(0x44bb22, 0.9).fillCircle(0, 0, 4);
            }
            return;
        }

        if (n.stock <= 0 && !n.felled) return;

        const def   = NODES[n.type];
        const ratio = n.stock / n.maxStock;

        if (n.type === 'scrub') {
            n.gfx = this.scene._w(this.scene.add.graphics().setDepth(2)).setPosition(n.x, n.y);
            NODES[n.type]?.draw(n.gfx, n, 0.45 + ratio * 0.55);
            return;
        }

        const alpha    = 0.45 + ratio * 0.55;
        const targeted = this.scene.units?.some(u => u.targetNode === n && u.hp > 0);

        n.gfx = this.scene._w(this.scene.add.graphics().setDepth(2));
        n.gfx.setPosition(n.x, n.y);
        NODES[n.type]?.draw(n.gfx, n, alpha);

        if (n.felled === false && n.fellWork !== undefined) {
            const maxFell = n.type === 'large_tree' ? 28 : 16;
            const p = Math.max(0, 1 - n.fellWork / maxFell);
            n.gfx.fillStyle(0x000000, 0.6).fillRect(-12, -22, 24, 6);
            n.gfx.fillStyle(0xddaa44, 0.9).fillRect(-12, -22, 24 * p, 6);
        }

        if (targeted) {
            const r = def.large ? 24 : 16;
            n.gfx.lineStyle(2, 0xffdd44, 0.9).strokeCircle(0, 0, r);
        }

        const bw = def.large ? 38 : 26;
        const by = def.large ? 20 : 14;
        n.gfx.fillStyle(0x000000, 0.55).fillRect(-bw/2, by, bw, 4);
        const isFood = def.resource.startsWith('Food.');
        const barColor = isFood ? 0x88dd44
                       : def.resource.startsWith('Materials.Metal') ? 0x55aa55
                       : def.resource === 'Textile.Fiber.Wool' ? 0xe8e0c0
                       : def.resource.startsWith('Materials.Stone') ? 0x9999aa : 0xaa7733;
        n.gfx.fillStyle(barColor, 0.9).fillRect(-bw/2, by, bw * ratio, 4);

        const sym = ITEMS[def.resource]?.icon ?? '📦';
        n.labelObj = this.scene._w(this.scene.add.text(n.x, n.y - (def.large ? 28 : 20), `${sym}${n.stock}`, {
            fontSize: '9px', color: '#ffffff', fontFamily: 'monospace',
            stroke: '#000000', strokeThickness: 2,
        }).setOrigin(0.5).setDepth(3));
    }
}
