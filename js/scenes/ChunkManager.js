import {
    TILE, MAP_OY, CHUNK_SIZE,
    T_GRASS, T_SAND, T_ROCK, T_FOREST, T_WATER, T_MOUNTAIN,
    BIOME_A, BIOME_B, TILE_A, TILE_B,
    ROAD_NONE,
} from '../config/gameConstants.js';
import { MathUtils } from '../utils/MathUtils.js';
import { NODES } from '../content/nodes/index.js';
import { ITEMS } from '../content/items/index.js';

export default class ChunkManager {
    constructor(scene) {
        this.scene = scene;
        // Map of "cx,cy" → { tiles: Uint8Array(CHUNK_SIZE*CHUNK_SIZE), biomes: same,
        //                     gfx: Phaser.Graphics|null, nodes: [], generated: bool }
        this.chunks = new Map();
        // Per-column river centre/width cache (keyed by tx)
        this.riverCache = new Map();
        // Ford positions: Set of "tx,ty" strings
        this.fordSet = new Set();
        // Modified tiles for save/load (only overrides, keyed "tx,ty")
        this.modifiedChunks = new Map();
    }

    // ─── Biome formula (spawn-relative) ─────────────────────────────────────────

    biomAt(tx, ty) {
        const relY = ty - this.scene.spawnTy;
        const n = (MathUtils.valueNoise(tx * 0.025, ty * 0.028) - 0.5) * 26
                + (MathUtils.valueNoise(tx * 0.075 + 13.3, ty * 0.08 + 7.1) - 0.5) * 14
                + (MathUtils.valueNoise(tx * 0.170 + 29.7, ty * 0.190 + 41.5) - 0.5) * 6;
        const y = relY + n;
        if (y > -30) return 0;   // heartland
        if (y > -60) return 1;   // scrubland
        if (y > -100) return 2;  // forest
        return 3;                // badlands
    }

    genTile(tx, ty, biome) {
        if (biome === undefined) biome = this.biomAt(tx, ty);
        const r  = MathUtils.valueNoise(tx * 0.26 + 37, ty * 0.22 + 83);
        const r2 = MathUtils.valueNoise(tx * 0.31 + 71, ty * 0.28 + 53);

        const adjBiome = this.biomAt(tx, ty - 1);
        const useBiome = (adjBiome !== biome && r2 < 0.30) ? adjBiome : biome;

        switch (useBiome) {
            case 0: return r < 0.07 ? T_SAND   : T_GRASS;
            case 1: return r < 0.38 ? T_SAND   : T_GRASS;
            case 2: return r < 0.15 ? T_ROCK   : r < 0.25 ? T_MOUNTAIN : T_FOREST;
            case 3: return r < 0.42 ? T_SAND   : r < 0.70 ? T_ROCK : T_MOUNTAIN;
            default: return T_GRASS;
        }
    }

    // ─── River generation ────────────────────────────────────────────────────────

    _getRiverInfo(tx) {
        if (this.riverCache.has(tx)) return this.riverCache.get(tx);
        const baseRiverY = this.scene.spawnTy - 55;
        const drift = Math.round((MathUtils.valueNoise(tx * 0.055, 42.7) - 0.5) * 16);
        const cy = baseRiverY + drift;
        const hw = 1 + Math.round(MathUtils.valueNoise(tx * 0.10, 88.3));
        // Ford every ~20 tiles
        const isFord = (Math.round(MathUtils.valueNoise(tx * 0.05, 77.1) * 5) === 2);
        const info = { cy, hw, isFord };
        this.riverCache.set(tx, info);
        return info;
    }

    _isRiverTile(tx, ty) {
        const { cy, hw, isFord } = this._getRiverInfo(tx);
        if (ty < cy - hw || ty > cy + hw) return false;
        return isFord ? 'ford' : 'water';
    }

    // ─── Chunk generation ────────────────────────────────────────────────────────

    _chunkKey(cx, cy) { return `${cx},${cy}`; }

    getChunk(cx, cy) {
        const key = this._chunkKey(cx, cy);
        if (this.chunks.has(key)) return this.chunks.get(key);
        return this._generateChunk(cx, cy);
    }

    _generateChunk(cx, cy) {
        const key = this._chunkKey(cx, cy);
        const tiles  = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE);
        const biomes = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE);

        for (let ly = 0; ly < CHUNK_SIZE; ly++) {
            for (let lx = 0; lx < CHUNK_SIZE; lx++) {
                const tx = cx * CHUNK_SIZE + lx;
                const ty = cy * CHUNK_SIZE + ly;
                const b  = this.biomAt(tx, ty);
                let t    = this.genTile(tx, ty, b);

                // Apply river
                const river = this._isRiverTile(tx, ty);
                if (river === 'water') {
                    t = T_WATER;
                } else if (river === 'ford') {
                    t = T_SAND;
                    this.fordSet.add(`${tx},${ty}`);
                }

                // Apply saved modifications
                const modKey = `${tx},${ty}`;
                if (this.modifiedChunks.has(modKey)) {
                    t = this.modifiedChunks.get(modKey);
                }

                const i = ly * CHUNK_SIZE + lx;
                tiles[i]  = t;
                biomes[i] = b;
            }
        }

        const chunk = { tiles, biomes, gfx: null, nodes: [], generated: true };
        this.chunks.set(key, chunk);

        // Spawn resource nodes for this chunk
        this._spawnChunkNodes(cx, cy, chunk);

        return chunk;
    }

    // ─── Node spawning ───────────────────────────────────────────────────────────

    _spawnChunkNodes(cx, cy, chunk) {
        const spawnTx = this.scene.spawnTx;
        const spawnTy = this.scene.spawnTy;

        // Seeded RNG per chunk (deterministic)
        const seed = (cx * 73856093) ^ (cy * 19349663);
        let rngState = seed | 1;
        const rng = () => {
            rngState ^= rngState << 13;
            rngState ^= rngState >> 17;
            rngState ^= rngState << 5;
            return ((rngState >>> 0) / 4294967296);
        };

        const getT = (tx, ty) => {
            const lx = tx - cx * CHUNK_SIZE, ly = ty - cy * CHUNK_SIZE;
            if (lx < 0 || lx >= CHUNK_SIZE || ly < 0 || ly >= CHUNK_SIZE) return T_GRASS;
            return chunk.tiles[ly * CHUNK_SIZE + lx];
        };
        const getB = (tx, ty) => {
            const lx = tx - cx * CHUNK_SIZE, ly = ty - cy * CHUNK_SIZE;
            if (lx < 0 || lx >= CHUNK_SIZE || ly < 0 || ly >= CHUNK_SIZE) return 0;
            return chunk.biomes[ly * CHUNK_SIZE + lx];
        };

        const tryPlace = (type, count, okFn) => {
            const placed = [];
            const existing = this.scene.resNodes;
            for (let attempt = 0; attempt < count * 4 && placed.length < count; attempt++) {
                const lx = Math.floor(rng() * (CHUNK_SIZE - 2)) + 1;
                const ly = Math.floor(rng() * (CHUNK_SIZE - 2)) + 1;
                const tx = cx * CHUNK_SIZE + lx;
                const ty = cy * CHUNK_SIZE + ly;
                const t = getT(tx, ty);
                const b = getB(tx, ty);
                if (!okFn(t, b, tx, ty)) continue;
                const wx = tx * TILE + TILE / 2;
                const wy = MAP_OY + ty * TILE + TILE / 2;
                const tooClose = existing.some(n => Phaser.Math.Distance.Between(wx, wy, n.x, n.y) < 40)
                              || placed.some(n => Phaser.Math.Distance.Between(wx, wy, n.x, n.y) < 40);
                if (tooClose) continue;
                const def = NODES[type];
                if (!def) continue;
                const node = {
                    id: this.scene.getId(), type, x: wx, y: wy,
                    stock: def.stock, maxStock: def.stock,
                    gfx: null, labelObj: null,
                    dormantTimer: 0, sapling: false, saplingTimer: 0,
                };
                placed.push(node);
            }
            return placed;
        };

        // Determine chunk biome (sample centre)
        const cCx = cx * CHUNK_SIZE + CHUNK_SIZE / 2;
        const cCy = cy * CHUNK_SIZE + CHUNK_SIZE / 2;
        const centerBiome = this.biomAt(cCx, cCy);

        // Near-spawn guard: skip nodes right at spawn
        const distFromSpawn = Math.abs(cx - Math.floor(spawnTx / CHUNK_SIZE))
                            + Math.abs(cy - Math.floor(spawnTy / CHUNK_SIZE));

        const nodes = [];

        if (centerBiome === 0) { // heartland
            nodes.push(...tryPlace('berry_bush', 2, (t) => t === T_GRASS));
            nodes.push(...tryPlace('small_tree', 1, (t) => t === T_GRASS || t === T_FOREST));
            nodes.push(...tryPlace('small_boulder', 1, (t) => t !== T_WATER));
            if (distFromSpawn > 1) {
                nodes.push(...tryPlace('wild_garden', 1, (t) => t === T_GRASS));
                nodes.push(...tryPlace('olive_grove', 1, (t) => t === T_GRASS || t === T_SAND));
            }
            nodes.push(...tryPlace('scrub', 2, (t) => t === T_GRASS || t === T_SAND));
        } else if (centerBiome === 1) { // scrubland
            nodes.push(...tryPlace('small_boulder', 2, (t) => t !== T_WATER));
            nodes.push(...tryPlace('large_boulder', 1, (t) => t !== T_WATER));
            nodes.push(...tryPlace('small_tree', 1, (t) => t === T_GRASS || t === T_FOREST));
            nodes.push(...tryPlace('scrub', 2, (t) => t === T_GRASS || t === T_SAND));
            nodes.push(...tryPlace('olive_grove', 1, (t) => t === T_GRASS || t === T_SAND));
        } else if (centerBiome === 2) { // forest
            nodes.push(...tryPlace('large_tree', 2, (t) => t === T_FOREST || t === T_GRASS));
            nodes.push(...tryPlace('small_tree', 1, (t) => t === T_FOREST || t === T_GRASS));
            nodes.push(...tryPlace('large_boulder', 1, (t) => t !== T_WATER));
            nodes.push(...tryPlace('ore_vein', 1, (t) => t === T_ROCK || t === T_FOREST));
        } else { // badlands
            nodes.push(...tryPlace('large_boulder', 1, (t) => t !== T_WATER));
            nodes.push(...tryPlace('small_boulder', 1, (t) => t !== T_WATER));
            nodes.push(...tryPlace('ore_vein', 1, (t) => t === T_ROCK));
        }

        chunk.nodes = nodes;
        for (const n of nodes) this.scene.resNodes.push(n);
        if (nodes.length > 0) this.scene.mapManager?.drawResourceNodes?.();
    }

    // ─── Tile API ────────────────────────────────────────────────────────────────

    getTile(tx, ty) {
        const modKey = `${tx},${ty}`;
        if (this.modifiedChunks.has(modKey)) return this.modifiedChunks.get(modKey);
        const cx = Math.floor(tx / CHUNK_SIZE);
        const cy = Math.floor(ty / CHUNK_SIZE);
        const chunk = this.getChunk(cx, cy);
        const lx = tx - cx * CHUNK_SIZE, ly = ty - cy * CHUNK_SIZE;
        return chunk.tiles[ly * CHUNK_SIZE + lx];
    }

    setTile(tx, ty, type) {
        const modKey = `${tx},${ty}`;
        this.modifiedChunks.set(modKey, type);
        const cx = Math.floor(tx / CHUNK_SIZE);
        const cy = Math.floor(ty / CHUNK_SIZE);
        const key = this._chunkKey(cx, cy);
        if (this.chunks.has(key)) {
            const chunk = this.chunks.get(key);
            const lx = tx - cx * CHUNK_SIZE, ly = ty - cy * CHUNK_SIZE;
            chunk.tiles[ly * CHUNK_SIZE + lx] = type;
            this.renderChunk(cx, cy);
        }
    }

    getBiome(tx, ty) {
        const cx = Math.floor(tx / CHUNK_SIZE);
        const cy = Math.floor(ty / CHUNK_SIZE);
        const chunk = this.getChunk(cx, cy);
        const lx = tx - cx * CHUNK_SIZE, ly = ty - cy * CHUNK_SIZE;
        return chunk.biomes[ly * CHUNK_SIZE + lx];
    }

    // ─── Chunk rendering ─────────────────────────────────────────────────────────

    renderChunk(cx, cy) {
        const key = this._chunkKey(cx, cy);
        const chunk = this.chunks.get(key);
        if (!chunk) return;

        if (!chunk.gfx) {
            chunk.gfx = this.scene._w(this.scene.add.graphics().setDepth(0));
        }
        const gfx = chunk.gfx;
        gfx.clear();

        for (let ly = 0; ly < CHUNK_SIZE; ly++) {
            for (let lx = 0; lx < CHUNK_SIZE; lx++) {
                const tx = cx * CHUNK_SIZE + lx;
                const ty = cy * CHUNK_SIZE + ly;
                const i  = ly * CHUNK_SIZE + lx;
                const t  = Math.min(chunk.tiles[i], TILE_A.length - 1);
                const b  = chunk.biomes[i];
                const colA = (BIOME_A[b] ?? TILE_A)[t] ?? TILE_A[t];
                const colB = (BIOME_B[b] ?? TILE_B)[t] ?? TILE_B[t];
                gfx.fillStyle((tx + ty) % 2 === 0 ? colA : colB)
                   .fillRect(tx * TILE, MAP_OY + ty * TILE, TILE, TILE);

                if (t === T_WATER) {
                    gfx.fillStyle(0x4488cc, 0.28)
                       .fillRect(tx * TILE + 2, MAP_OY + ty * TILE + 5,  TILE - 4, 3)
                       .fillRect(tx * TILE + 4, MAP_OY + ty * TILE + 17, TILE - 8, 3);
                }

                // Ford overlay
                const fkey = `${tx},${ty}`;
                if (this.fordSet.has(fkey)) {
                    gfx.fillStyle(0x3388cc, 0.35)
                       .fillRect(tx * TILE, MAP_OY + ty * TILE, TILE, TILE);
                    gfx.fillStyle(0x66aaee, 0.22)
                       .fillRect(tx * TILE + 3,  MAP_OY + ty * TILE + 7,  TILE - 6, 2)
                       .fillRect(tx * TILE + 5,  MAP_OY + ty * TILE + 18, TILE - 10, 2)
                       .fillRect(tx * TILE + 2,  MAP_OY + ty * TILE + 26, TILE - 4, 2);
                }
            }
        }

        // Grid lines
        gfx.lineStyle(1, 0x000000, 0.04);
        for (let lx = 0; lx <= CHUNK_SIZE; lx++) {
            const px = (cx * CHUNK_SIZE + lx) * TILE;
            gfx.lineBetween(px, MAP_OY + cy * CHUNK_SIZE * TILE, px, MAP_OY + (cy + 1) * CHUNK_SIZE * TILE);
        }
        for (let ly = 0; ly <= CHUNK_SIZE; ly++) {
            const py = MAP_OY + (cy * CHUNK_SIZE + ly) * TILE;
            gfx.lineBetween(cx * CHUNK_SIZE * TILE, py, (cx + 1) * CHUNK_SIZE * TILE, py);
        }
    }

    // ─── Tick (called every frame) ───────────────────────────────────────────────

    tick(camera) {
        if (!camera) return;
        const view = camera.worldView;

        // Tile bounds of viewport (with 2-chunk padding)
        const padTiles = CHUNK_SIZE * 2;
        const minTx = Math.floor((view.x - padTiles * TILE) / TILE);
        const maxTx = Math.ceil((view.right + padTiles * TILE) / TILE);
        const minTy = Math.floor((view.y - MAP_OY - padTiles * TILE) / TILE);
        const maxTy = Math.ceil((view.bottom - MAP_OY + padTiles * TILE) / TILE);

        // Chunk bounds (viewport + 2 chunk padding)
        const minCx = Math.floor(minTx / CHUNK_SIZE);
        const maxCx = Math.ceil(maxTx / CHUNK_SIZE);
        const minCy = Math.floor(minTy / CHUNK_SIZE);
        const maxCy = Math.ceil(maxTy / CHUNK_SIZE);

        // Load/render missing chunks in viewport
        for (let cy = minCy; cy <= maxCy; cy++) {
            for (let cx = minCx; cx <= maxCx; cx++) {
                const key = this._chunkKey(cx, cy);
                if (!this.chunks.has(key)) {
                    this._generateChunk(cx, cy);
                }
                const chunk = this.chunks.get(key);
                if (!chunk.gfx) {
                    this.renderChunk(cx, cy);
                }
            }
        }

        // Unload graphics for chunks > 4 chunks outside viewport
        const unloadPad = CHUNK_SIZE * 4;
        const unloadMinCx = Math.floor((view.x - unloadPad * TILE) / (CHUNK_SIZE * TILE));
        const unloadMaxCx = Math.ceil((view.right + unloadPad * TILE) / (CHUNK_SIZE * TILE));
        const unloadMinCy = Math.floor((view.y - MAP_OY - unloadPad * TILE) / (CHUNK_SIZE * TILE));
        const unloadMaxCy = Math.ceil((view.bottom - MAP_OY + unloadPad * TILE) / (CHUNK_SIZE * TILE));

        for (const [key, chunk] of this.chunks) {
            if (!chunk.gfx) continue;
            const [cxStr, cyStr] = key.split(',');
            const cx = parseInt(cxStr), cy = parseInt(cyStr);
            if (cx < unloadMinCx || cx > unloadMaxCx || cy < unloadMinCy || cy > unloadMaxCy) {
                chunk.gfx.destroy();
                chunk.gfx = null;
            }
        }
    }

    // ─── Save / Load ─────────────────────────────────────────────────────────────

    saveModified() {
        // Save as plain object for JSON
        const out = {};
        for (const [k, v] of this.modifiedChunks) out[k] = v;
        return out;
    }

    loadModified(data) {
        this.modifiedChunks = new Map();
        if (!data) return;
        for (const [k, v] of Object.entries(data)) {
            this.modifiedChunks.set(k, v);
        }
        // Re-apply modifications to already-generated chunks
        for (const [key, chunk] of this.chunks) {
            const [cxStr, cyStr] = key.split(',');
            const cx = parseInt(cxStr), cy = parseInt(cyStr);
            let dirty = false;
            for (let ly = 0; ly < CHUNK_SIZE; ly++) {
                for (let lx = 0; lx < CHUNK_SIZE; lx++) {
                    const tx = cx * CHUNK_SIZE + lx;
                    const ty = cy * CHUNK_SIZE + ly;
                    const mk = `${tx},${ty}`;
                    if (this.modifiedChunks.has(mk)) {
                        chunk.tiles[ly * CHUNK_SIZE + lx] = this.modifiedChunks.get(mk);
                        dirty = true;
                    }
                }
            }
            if (dirty && chunk.gfx) this.renderChunk(cx, cy);
        }
    }
}
