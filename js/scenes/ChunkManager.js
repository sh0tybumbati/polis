import {
    TILE, MAP_OY, CHUNK_SIZE,
    T_GRASS, T_SAND, T_ROCK, T_FOREST, T_WATER, T_MOUNTAIN,
    BIOME_A, BIOME_B, TILE_A, TILE_B,
    ROAD_NONE,
} from '../config/gameConstants.js';
import { MathUtils } from '../utils/MathUtils.js';
import { NODES } from '../content/nodes/index.js';
import { ITEMS } from '../content/items/index.js';

// Deterministic per-tile hash → stable colour variation & tuft placement.
function tileHash(tx, ty) { return (((tx * 73856093) ^ (ty * 19349663)) >>> 0); }
function lerpHex(a, b, t) {
    const r = Math.round(((a >> 16) & 0xff) + (((b >> 16) & 0xff) - ((a >> 16) & 0xff)) * t);
    const g = Math.round(((a >> 8)  & 0xff) + (((b >> 8)  & 0xff) - ((a >> 8)  & 0xff)) * t);
    const bl= Math.round((a & 0xff) + ((b & 0xff) - (a & 0xff)) * t);
    return (r << 16) | (g << 8) | bl;
}
function shadeHex(c, d) {
    const cl = v => Math.max(0, Math.min(255, v + d));
    return (cl((c >> 16) & 0xff) << 16) | (cl((c >> 8) & 0xff) << 8) | cl(c & 0xff);
}

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
        // Chunks that have had their graphics rendered (discovery-gated)
        this.renderedChunks = new Set();
    }

    get isLoading() { return false; }

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

        const chunk = { tiles, biomes, rt: null, nodes: [], generated: true };
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

        const _makeNode = (type, wx, wy) => {
            const def = NODES[type];
            if (!def) return null;
            const minS = def.stockMin ?? def.stock ?? 1;
            const maxS = def.stockMax ?? def.stock ?? minS;
            const s = Math.floor(rng() * (maxS - minS + 1)) + minS;
            const isTree = type === 'small_tree' || type === 'large_tree';
            return {
                id: this.scene.getId(), type, x: wx, y: wy,
                stock: s, maxStock: maxS,
                gfx: null, labelObj: null,
                dormantTimer: 0, sapling: false, saplingTimer: 0,
                ...(isTree ? { treeAge: 0 } : {}),
            };
        };

        // One resource node per tile, globally. Seeded from existing nodes (so cross-chunk
        // placements never collide) and updated as each node is committed within this chunk
        // (so different clusters in the same chunk can't stack on the same tile either).
        const tileKey = (x, y) => `${Math.floor(x / TILE)},${Math.floor((y - MAP_OY) / TILE)}`;
        const occupied = new Set(this.scene.resNodes.map(n => tileKey(n.x, n.y)));

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
                const key = `${tx},${ty}`;
                if (occupied.has(key)) continue;
                const wx = tx * TILE + TILE / 2;
                const wy = MAP_OY + ty * TILE + TILE / 2;
                const tooClose = existing.some(n => Phaser.Math.Distance.Between(wx, wy, n.x, n.y) < 40)
                              || placed.some(n => Phaser.Math.Distance.Between(wx, wy, n.x, n.y) < 40);
                if (tooClose) continue;
                const node = _makeNode(type, wx, wy);
                if (node) { occupied.add(key); placed.push(node); }
            }
            return placed;
        };

        const tryCluster = (type, count, okFn, clusterRadius = 2) => {
            const placed = [];
            const existing = this.scene.resNodes;
            let cTx = -1, cTy = -1;
            for (let i = 0; i < 20 && cTx === -1; i++) {
                const lx = Math.floor(rng() * (CHUNK_SIZE - 6)) + 3;
                const ly = Math.floor(rng() * (CHUNK_SIZE - 6)) + 3;
                const tx = cx * CHUNK_SIZE + lx, ty = cy * CHUNK_SIZE + ly;
                if (okFn(getT(tx, ty), getB(tx, ty), tx, ty)) { cTx = tx; cTy = ty; }
            }
            if (cTx === -1) return placed;
            for (let attempt = 0; attempt < count * 8 && placed.length < count; attempt++) {
                const tx = cTx + Math.round((rng() * 2 - 1) * clusterRadius);
                const ty = cTy + Math.round((rng() * 2 - 1) * clusterRadius);
                if (!okFn(getT(tx, ty), getB(tx, ty), tx, ty)) continue;
                const key = `${tx},${ty}`;
                if (occupied.has(key)) continue;
                const wx = tx * TILE + TILE / 2, wy = MAP_OY + ty * TILE + TILE / 2;
                if (existing.some(n => Phaser.Math.Distance.Between(wx, wy, n.x, n.y) < 28)) continue;
                if (placed.some(n => Phaser.Math.Distance.Between(wx, wy, n.x, n.y) < 22)) continue;
                const node = _makeNode(type, wx, wy);
                if (node) { occupied.add(key); placed.push(node); }
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
            nodes.push(...tryCluster('berry_bush', 5, (t) => t === T_GRASS));
            // Two larger small-tree groves + an occasional oak stand — trees common in the heartland
            nodes.push(...tryCluster('small_tree', 7, (t) => t === T_GRASS || t === T_FOREST, 3));
            nodes.push(...tryCluster('small_tree', 6, (t) => t === T_GRASS || t === T_FOREST, 3));
            nodes.push(...tryCluster('large_tree', 4, (t) => t === T_FOREST || t === T_GRASS, 3));
            nodes.push(...tryCluster('small_boulder', 4, (t) => t !== T_WATER));
            nodes.push(...tryCluster('scrub', 5, (t) => t === T_GRASS || t === T_SAND));
            if (distFromSpawn > 1) {
                nodes.push(...tryCluster('wild_garden', 3, (t) => t === T_GRASS));
                nodes.push(...tryCluster('olive_grove', 2, (t) => t === T_GRASS || t === T_SAND));
            }
        } else if (centerBiome === 1) { // scrubland
            nodes.push(...tryCluster('small_boulder', 5, (t) => t !== T_WATER));
            nodes.push(...tryCluster('large_boulder', 4, (t) => t !== T_WATER));
            nodes.push(...tryCluster('small_tree', 5, (t) => t === T_GRASS || t === T_FOREST, 3));
            nodes.push(...tryCluster('scrub', 7, (t) => t === T_GRASS || t === T_SAND));
            nodes.push(...tryCluster('olive_grove', 2, (t) => t === T_GRASS || t === T_SAND));
        } else if (centerBiome === 2) { // forest
            // Dense forest — two large groves plus an understory of small trees
            nodes.push(...tryCluster('large_tree', 8, (t) => t === T_FOREST || t === T_GRASS, 3));
            nodes.push(...tryCluster('large_tree', 6, (t) => t === T_FOREST || t === T_GRASS, 3));
            nodes.push(...tryCluster('small_tree', 6, (t) => t === T_FOREST || t === T_GRASS, 3));
            nodes.push(...tryCluster('large_boulder', 3, (t) => t !== T_WATER));
            nodes.push(...tryCluster('scrub', 3, (t) => t === T_GRASS || t === T_FOREST));
            nodes.push(...tryPlace('ore_vein', 1, (t) => t === T_ROCK || t === T_FOREST));
        } else { // badlands
            nodes.push(...tryCluster('large_boulder', 4, (t) => t !== T_WATER));
            nodes.push(...tryCluster('small_boulder', 3, (t) => t !== T_WATER));
            nodes.push(...tryCluster('scrub', 4, (t) => t !== T_WATER));
            nodes.push(...tryPlace('ore_vein', 1, (t) => t === T_ROCK));
        }

        chunk.nodes = nodes;
        for (const n of nodes) this.scene.resNodes.push(n);
        // Only the freshly-generated nodes need drawing — not every node on the map.
        for (const n of nodes) this.scene.mapManager?.redrawNode?.(n);
    }

    // Called at game start: generate + render the 3×3 chunks around spawn so
    // the player's starting units have ground under them immediately.
    prewarmSpawn(spawnTx, spawnTy) {
        const cx = Math.floor(spawnTx / CHUNK_SIZE);
        const cy = Math.floor(spawnTy / CHUNK_SIZE);
        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                const key = this._chunkKey(cx + dx, cy + dy);
                if (!this.chunks.has(key)) this._generateChunk(cx + dx, cy + dy);
                if (!this.renderedChunks.has(key)) {
                    this.renderChunk(cx + dx, cy + dy);
                    this.renderedChunks.add(key);
                }
            }
        }
    }

    // Called by MapManager when a chunk is first discovered (any tile in it reaches vis>=1).
    // Renders this chunk and pre-generates (but doesn't render) its 8 neighbours so
    // pathfinding can traverse into them before units physically arrive.
    onChunkDiscovered(cx, cy) {
        const key = this._chunkKey(cx, cy);

        // Generate + render this chunk if not already done
        if (!this.chunks.has(key)) this._generateChunk(cx, cy);
        if (!this.renderedChunks.has(key)) {
            this.renderChunk(cx, cy);
            this.renderedChunks.add(key);
        }

        // Pre-generate (data only) adjacent chunks for pathfinding
        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                if (dx === 0 && dy === 0) continue;
                const nk = this._chunkKey(cx + dx, cy + dy);
                if (!this.chunks.has(nk)) this._generateChunk(cx + dx, cy + dy);
            }
        }
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

        const size   = CHUNK_SIZE * TILE;
        const worldX = cx * size;
        const worldY = MAP_OY + cy * size;

        // Create the RenderTexture once; reuse it on subsequent re-renders (e.g. setTile)
        if (!chunk.rt) {
            chunk.rt = this.scene._w(
                this.scene.add.renderTexture(worldX, worldY, size, size)
                    .setDepth(0).setOrigin(0, 0)
            );
        }

        // Draw all tiles into a temporary off-screen Graphics using LOCAL coords
        // (0,0) → (size,size), so the RT position handles world placement.
        const g = this.scene.make.graphics({ add: false });

        for (let ly = 0; ly < CHUNK_SIZE; ly++) {
            for (let lx = 0; lx < CHUNK_SIZE; lx++) {
                const tx = cx * CHUNK_SIZE + lx;
                const ty = cy * CHUNK_SIZE + ly;
                const i  = ly * CHUNK_SIZE + lx;
                const t  = Math.min(chunk.tiles[i], TILE_A.length - 1);
                const b  = chunk.biomes[i];
                const colA = (BIOME_A[b] ?? TILE_A)[t] ?? TILE_A[t];
                const colB = (BIOME_B[b] ?? TILE_B)[t] ?? TILE_B[t];
                // Seamless terrain: blend the two biome shades by a per-tile hash (continuous
                // variation) instead of a hard A/B checkerboard.
                const hsh  = tileHash(tx, ty);
                const base = lerpHex(colA, colB, (hsh & 0xff) / 255);
                g.fillStyle(base).fillRect(lx * TILE, ly * TILE, TILE, TILE);

                // Cartoony grass: a few soft dappled tufts (deterministic) so the field reads as
                // textured rather than flat squares.
                if (t === T_GRASS) {
                    const dark = shadeHex(base, -16), lite = shadeHex(base, 14);
                    const n = 2 + (hsh % 2);
                    for (let k = 0; k < n; k++) {
                        const hx = ((hsh >> (k * 6)) % (TILE - 8)) + 4;
                        const hy = ((hsh >> (k * 6 + 9)) % (TILE - 8)) + 4;
                        g.fillStyle(k % 2 ? lite : dark, 0.45)
                         .fillCircle(lx * TILE + hx, ly * TILE + hy, 2);
                    }
                }

                if (t === T_WATER) {
                    g.fillStyle(0x4488cc, 0.28)
                     .fillRect(lx * TILE + 2, ly * TILE + 5,  TILE - 4, 3)
                     .fillRect(lx * TILE + 4, ly * TILE + 17, TILE - 8, 3);
                }

                const fkey = `${tx},${ty}`;
                if (this.fordSet.has(fkey)) {
                    g.fillStyle(0x3388cc, 0.35)
                     .fillRect(lx * TILE, ly * TILE, TILE, TILE);
                    g.fillStyle(0x66aaee, 0.22)
                     .fillRect(lx * TILE + 3,  ly * TILE + 7,  TILE - 6, 2)
                     .fillRect(lx * TILE + 5,  ly * TILE + 18, TILE - 10, 2)
                     .fillRect(lx * TILE + 2,  ly * TILE + 26, TILE - 4, 2);
                }
            }
        }

        // (No per-tile grid lines — terrain reads as a seamless field. Placement ghosts/hover
        //  draw their own gridding when building.)

        // Stamp into the RT then discard the temp Graphics
        chunk.rt.clear();
        chunk.rt.draw(g, 0, 0);
        g.destroy();
    }

    // ─── Tick (called every frame) ───────────────────────────────────────────────

    // Chunk generation is now discovery-driven (via onChunkDiscovered).
    // tick() only unloads graphics for chunks far from the camera to reclaim memory.
    tick(camera) {
        if (!camera) return;
        const view = camera.worldView;

        const unloadPad = CHUNK_SIZE * 6;
        const unloadMinCx = Math.floor((view.x - unloadPad * TILE) / (CHUNK_SIZE * TILE));
        const unloadMaxCx = Math.ceil((view.right + unloadPad * TILE) / (CHUNK_SIZE * TILE));
        const unloadMinCy = Math.floor((view.y - MAP_OY - unloadPad * TILE) / (CHUNK_SIZE * TILE));
        const unloadMaxCy = Math.ceil((view.bottom - MAP_OY + unloadPad * TILE) / (CHUNK_SIZE * TILE));

        for (const [key, chunk] of this.chunks) {
            if (!chunk.rt) continue;
            const [cxStr, cyStr] = key.split(',');
            const cx = +cxStr, cy = +cyStr;
            if (cx < unloadMinCx || cx > unloadMaxCx || cy < unloadMinCy || cy > unloadMaxCy) {
                chunk.rt.destroy();
                chunk.rt = null;
                this.renderedChunks.delete(key);
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
            if (dirty && chunk.rt) this.renderChunk(cx, cy);
        }
    }
}
