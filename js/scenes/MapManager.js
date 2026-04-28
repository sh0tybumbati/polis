import {
    TILE, MAP_OY, MAP_W, MAP_H, MAP_BOTTOM,
    T_SAND, T_GRASS, T_ROCK, T_FOREST, T_WATER,
    TILE_A, TILE_B, BIOME_A, BIOME_B,
    ROAD_NONE, ROAD_DESIRE, ROAD_PAVED, ROAD_SPD, TILE_SPD,
    NODE_DEF, BLDG
} from '../config/gameConstants.js';
import { MathUtils } from '../utils/MathUtils.js';

export default class MapManager {
    constructor(scene) {
        this.scene = scene;
    }

    biomAt(tx, ty) {
        const n = (MathUtils.valueNoise(tx * 0.025, ty * 0.028) - 0.5) * 26
                + (MathUtils.valueNoise(tx * 0.075 + 13.3, ty * 0.08  + 7.1) - 0.5) * 14
                + (MathUtils.valueNoise(tx * 0.170 + 29.7, ty * 0.190 + 41.5) - 0.5) * 6;
        const y = ty + n;
        if (y > MAP_H * 0.80) return 0; // heartland
        if (y > MAP_H * 0.56) return 1; // scrubland
        if (y > MAP_H * 0.30) return 2; // forest
        return 3;                      // badlands
    }

    genTile(tx, ty, biome) {
        if (biome === undefined) biome = this.biomAt(tx, ty);
        const r  = MathUtils.valueNoise(tx * 0.26 + 37,  ty * 0.22 + 83);
        const r2 = MathUtils.valueNoise(tx * 0.31 + 71,  ty * 0.28 + 53);

        const adjBiome = (ty > 0) ? this.biomAt(tx, ty - 1) : biome;
        const useBiome = (adjBiome !== biome && r2 < 0.30) ? adjBiome : biome;

        switch (useBiome) {
            case 0: return r < 0.07 ? T_SAND   : T_GRASS;
            case 1: return r < 0.38 ? T_SAND   : T_GRASS;
            case 2: return r < 0.20 ? T_ROCK   : T_FOREST;
            case 3: return r < 0.42 ? T_SAND   : T_ROCK;
        }
    }

    generateMap() {
        for (let y = 0; y < MAP_H; y++) {
            this.scene.mapData[y]     = new Array(MAP_W).fill(0);
            this.scene.terrainData[y] = new Array(MAP_W).fill(0);
            this.scene.biomeData[y]   = new Array(MAP_W).fill(0);
            this.scene.trafficMap[y]  = new Array(MAP_W).fill(0);
            this.scene.roadMap[y]     = new Array(MAP_W).fill(ROAD_NONE);
            for (let x = 0; x < MAP_W; x++) {
                const b = this.biomAt(x, y);
                this.scene.biomeData[y][x]   = b;
                this.scene.terrainData[y][x] = this.genTile(x, y, b);
            }
        }
    }

    generateRiver() {
        this.scene.fordSet.clear();
        const baseY = Math.floor(MAP_H * 0.43);
        const fordCols = [
            Math.floor(MAP_W * 0.20),
            Math.floor(MAP_W * 0.52),
            Math.floor(MAP_W * 0.78),
        ];

        for (let x = 0; x < MAP_W; x++) {
            const drift = (MathUtils.valueNoise(x * 0.055, 42.7) - 0.5) * 16;
            const cy    = Math.round(baseY + drift);
            const hw = 1 + Math.round(MathUtils.valueNoise(x * 0.10, 88.3));
            const isFord = fordCols.some(fx => Math.abs(x - fx) <= 1);

            for (let dy = -hw; dy <= hw; dy++) {
                const ty = cy + dy;
                if (ty < 0 || ty >= MAP_H) continue;
                if (isFord) {
                    this.scene.terrainData[ty][x] = T_SAND;
                    this.scene.fordSet.add(ty * MAP_W + x);
                } else {
                    this.scene.terrainData[ty][x] = T_WATER;
                }
            }
        }
    }

    generateResourceNodes() {
        const terrainOk = {
            berry_bush:    t => t === T_GRASS,
            small_tree:    t => t === T_GRASS || t === T_FOREST,
            large_tree:    t => t === T_FOREST || t === T_GRASS,
            small_boulder: t => t !== T_WATER,
            large_boulder: t => t !== T_WATER,
            scrub:         t => t === T_GRASS || t === T_SAND,
            olive_grove:   t => t === T_GRASS || t === T_SAND,
            wild_garden:   t => t === T_GRASS,
            ore_vein:      t => t === T_ROCK || t === T_FOREST,
        };

        const place = (type, targetBiome, count, allowed) => {
            const ok = terrainOk[type] ?? (t => t !== T_WATER);
            let placed = 0;
            for (let attempt = 0; attempt < count * 2 && placed < count; attempt++) {
                const sx = Phaser.Math.Between(2, MAP_W - 3);
                const sy = Phaser.Math.Between(2, MAP_H - 3);
                for (let i = 0; i < 4 && placed < count; i++) {
                    const tx = sx + Phaser.Math.Between(-5, 5);
                    const ty = sy + Phaser.Math.Between(-5, 5);
                    if (tx < 1 || tx >= MAP_W - 1 || ty < 1 || ty >= MAP_H - 1) continue;
                    if ((this.scene.biomeData[ty]?.[tx] ?? -1) !== targetBiome) continue;
                    if (!ok(this.scene.terrainData[ty]?.[tx] ?? T_GRASS)) continue;
                    if (allowed && !allowed(tx, ty)) continue;
                    const wx = tx * TILE + TILE / 2, wy = MAP_OY + ty * TILE + TILE / 2;
                    if (this.scene.resNodes.some(n => Phaser.Math.Distance.Between(wx, wy, n.x, n.y) < 40)) continue;
                    const def = NODE_DEF[type];
                    this.scene.resNodes.push({ id: this.scene.getId(), type, x: wx, y: wy,
                        stock: def.stock, maxStock: def.stock, gfx: null, labelObj: null,
                        dormantTimer: 0, sapling: false, saplingTimer: 0 });
                    placed++;
                }
            }
        };

        const clearOfPlayer = (_tx, ty) => ty < MAP_H - 14;
        const clearOfEnemy  = (_tx, ty) => ty > 14;

        // Scrub (biomes 0+1)
        const scrubOk = terrainOk.scrub;
        let scrubPlaced = 0;
        for (let attempt = 0; attempt < 2000 && scrubPlaced < 35; attempt++) {
            const tx = Phaser.Math.Between(1, MAP_W - 2);
            const ty = Phaser.Math.Between(1, MAP_H - 2);
            const biome = this.scene.biomeData[ty]?.[tx] ?? -1;
            if (biome > 1) continue;
            if (!scrubOk(this.scene.terrainData[ty]?.[tx] ?? T_GRASS)) continue;
            if (ty >= MAP_H - 12) continue;
            const wx = tx * TILE + TILE / 2, wy = MAP_OY + ty * TILE + TILE / 2;
            if (this.scene.resNodes.some(n => n.type === 'scrub' && Phaser.Math.Distance.Between(wx, wy, n.x, n.y) < 48)) continue;
            this.scene.resNodes.push({ id: this.scene.getId(), type: 'scrub', x: wx, y: wy,
                stock: NODE_DEF.scrub.stock, maxStock: NODE_DEF.scrub.stock,
                gfx: null, labelObj: null, dormantTimer: 0, sapling: false, saplingTimer: 0 });
            scrubPlaced++;
        }

        place('berry_bush',    0, 30, clearOfPlayer);
        place('small_tree',    0, 16, clearOfPlayer);
        place('small_boulder', 0, 12, clearOfPlayer);
        place('wild_garden',   0, 10, clearOfPlayer);
        place('olive_grove',   0, 6,  clearOfPlayer);
        place('small_boulder', 1, 20);
        place('large_boulder', 1, 12);
        place('small_tree',    1, 12);
        place('berry_bush',    1, 2);
        place('olive_grove',   1, 8);
        place('wild_garden',   1, 6);
        place('large_tree',    2, 9);
        place('small_tree',    2, 4);
        place('large_boulder', 2, 4);
        place('ore_vein',      2, 6);
        place('large_boulder', 3, 5, clearOfEnemy);
        place('small_boulder', 3, 3, clearOfEnemy);
        place('ore_vein',      3, 4, clearOfEnemy);
    }

    drawMap() {
        const gfx = this.scene._w(this.scene.add.graphics().setDepth(0));
        this.desireGfx = this.scene._w(this.scene.add.graphics().setDepth(1));
        for (let y = 0; y < MAP_H; y++) {
            for (let x = 0; x < MAP_W; x++) {
                const t = Math.min(this.scene.terrainData[y][x], TILE_A.length - 1);
                const b = this.scene.biomeData[y]?.[x] ?? 0;
                const colA = (BIOME_A[b] ?? TILE_A)[t] ?? TILE_A[t];
                const colB = (BIOME_B[b] ?? TILE_B)[t] ?? TILE_B[t];
                gfx.fillStyle((x + y) % 2 === 0 ? colA : colB)
                  .fillRect(x * TILE, MAP_OY + y * TILE, TILE, TILE);
                if (t === T_WATER) {
                    gfx.fillStyle(0x4488cc, 0.28)
                      .fillRect(x*TILE+2, MAP_OY+y*TILE+5,  TILE-4, 3)
                      .fillRect(x*TILE+4, MAP_OY+y*TILE+17, TILE-8, 3);
                }
            }
        }
        if (this.scene.fordSet.size > 0) {
            gfx.fillStyle(0x3388cc, 0.35);
            for (const key of this.scene.fordSet) {
                const fx = key % MAP_W, fy = Math.floor(key / MAP_W);
                gfx.fillRect(fx * TILE, MAP_OY + fy * TILE, TILE, TILE);
            }
            gfx.fillStyle(0x66aaee, 0.22);
            for (const key of this.scene.fordSet) {
                const fx = key % MAP_W, fy = Math.floor(key / MAP_W);
                gfx.fillRect(fx*TILE+3,  MAP_OY+fy*TILE+7,  TILE-6, 2);
                gfx.fillRect(fx*TILE+5,  MAP_OY+fy*TILE+18, TILE-10, 2);
                gfx.fillRect(fx*TILE+2,  MAP_OY+fy*TILE+26, TILE-4, 2);
            }
        }
        gfx.lineStyle(1, 0x000000, 0.04);
        for (let x = 0; x <= MAP_W; x++) gfx.lineBetween(x*TILE, MAP_OY, x*TILE, MAP_BOTTOM);
        for (let y = 0; y <= MAP_H; y++) gfx.lineBetween(0, MAP_OY+y*TILE, MAP_W*TILE, MAP_OY+y*TILE);
    }

    drawDesirePath(tx, ty) {
        if (!this.desireGfx) return;
        const road = this.scene.roadMap[ty]?.[tx];
        if (road === ROAD_DESIRE) {
            this.desireGfx.fillStyle(0xb8946a, 0.55)
                .fillRect(tx * TILE + 3, MAP_OY + ty * TILE + 3, TILE - 6, TILE - 6);
        } else if (road === ROAD_PAVED) {
            this.desireGfx.fillStyle(0x9a8870, 0.75)
                .fillRect(tx * TILE + 1, MAP_OY + ty * TILE + 1, TILE - 2, TILE - 2);
        }
    }

    initFog() {
        for (let y = 0; y < MAP_H; y++)
            this.scene.visMap[y] = new Array(MAP_W).fill(0);
        this.scene.fogGfx = this.scene._w(this.scene.add.graphics().setDepth(8));
    }

    recomputeVis() {
        for (const [tx, ty] of this.scene._litTiles) {
            if (this.scene.visMap[ty]?.[tx] === 2) this.scene.visMap[ty][tx] = 1;
        }
        this.scene._litTiles = [];

        const paintCircle = (cx, cy, r, state) => {
            const r2 = r * r;
            for (let dy = -r; dy <= r; dy++) {
                for (let dx = -r; dx <= r; dx++) {
                    if (dx*dx + dy*dy > r2) continue;
                    const nx = cx+dx, ny = cy+dy;
                    if (nx < 0 || nx >= MAP_W || ny < 0 || ny >= MAP_H) continue;
                    if ((this.scene.visMap[ny][nx] ?? 0) < state) {
                        this.scene.visMap[ny][nx] = state;
                        if (state === 2) this.scene._litTiles.push([nx, ny]);
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

        for (const b of this.scene.buildings) {
            if (!b.built || b.faction === 'enemy') continue;
            const cx = Math.floor((b.tx + b.size / 2));
            const cy = Math.floor((b.ty + b.size / 2));
            const r = BLDG[b.type]?.fogRadius ?? 3;
            paintCircle(cx, cy, r, 2);
        }
    }

    drawFog() {
        const gfx = this.scene.fogGfx;
        if (!gfx) return;
        gfx.clear();
        gfx.fillStyle(0x000000, 0.97);
        for (let y = 0; y < MAP_H; y++)
            for (let x = 0; x < MAP_W; x++)
                if ((this.scene.visMap[y]?.[x] ?? 0) === 0)
                    gfx.fillRect(x * TILE, MAP_OY + y * TILE, TILE, TILE);
        gfx.fillStyle(0x000000, 0.52);
        for (let y = 0; y < MAP_H; y++)
            for (let x = 0; x < MAP_W; x++)
                if ((this.scene.visMap[y]?.[x] ?? 1) === 1)
                    gfx.fillRect(x * TILE, MAP_OY + y * TILE, TILE, TILE);
    }

    drawMinimap() {
        const gfx = this.scene.minimapGfx;
        if (!gfx) return;
        gfx.clear();
        const { _mmX: mx, _mmY: my, _mmW: mw, _mmH: mh } = this.scene;

        gfx.fillStyle(0x050c05, 1).fillRect(mx - 1, my - 1, mw + 2, mh + 2);
        const tw = Math.ceil(mw / MAP_W), th = Math.ceil(mh / MAP_H);

        const buckets = new Map();
        const addBucket = (col, alpha, x, y) => {
            const k = col * 1000 + Math.round(alpha * 100);
            if (!buckets.has(k)) buckets.set(k, { col, alpha, tiles: [] });
            buckets.get(k).tiles.push(x, y);
        };

        for (let y = 0; y < MAP_H; y++) {
            for (let x = 0; x < MAP_W; x++) {
                const vis = this.scene.visMap[y]?.[x] ?? 0;
                if (vis === 0) {
                    addBucket(0x000000, 1.0, x, y);
                } else {
                    const t   = Math.min(this.scene.terrainData[y][x], TILE_A.length - 1);
                    const b   = this.scene.biomeData[y]?.[x] ?? 0;
                    const col = this.scene.fordSet?.has(y * MAP_W + x) ? 0x2266aa
                              : ((BIOME_A[b] ?? TILE_A)[t] ?? TILE_A[t]);
                    addBucket(col, vis === 1 ? 0.38 : 1.0, x, y);
                }
            }
        }
        for (const { col, alpha, tiles } of buckets.values()) {
            gfx.fillStyle(col, alpha);
            for (let i = 0; i < tiles.length; i += 2) {
                const px = mx + (tiles[i]   / MAP_W) * mw;
                const py = my + (tiles[i+1] / MAP_H) * mh;
                gfx.fillRect(px, py, tw, th);
            }
        }

        // Buildings on minimap
        for (const b of this.scene.buildings) {
            const vis = this.scene.visMap[b.ty]?.[b.tx] ?? 0;
            if (vis === 0) continue;
            const px = mx + (b.tx / MAP_W) * mw;
            const py = my + (b.ty / MAP_H) * mh;
            const col = BLDG[b.type]?.color ?? 0x888888;
            gfx.fillStyle(col, 1).fillRect(px, py, Math.max(2, tw * b.size), Math.max(2, th * b.size));
        }

        // Units on minimap
        for (const u of this.scene.units) {
            if (u.hp <= 0) continue;
            const tx = Math.floor(u.x / TILE), ty = Math.floor((u.y - MAP_OY) / TILE);
            const vis = this.scene.visMap[ty]?.[tx] ?? 0;
            if (vis < 2) continue;
            const px = mx + (tx / MAP_W) * mw;
            const py = my + (ty / MAP_H) * mh;
            const col = u.isEnemy ? 0xff0000 : 0x00ffff;
            gfx.fillStyle(col, 1).fillRect(px, py, 2, 2);
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
        const road = this.scene.roadMap[ty]?.[tx] ?? ROAD_NONE;
        if (road !== ROAD_NONE) return ROAD_SPD[road];
        const terr = this.scene.terrainData[ty]?.[tx] ?? T_GRASS;
        return TILE_SPD[Math.min(terr, TILE_SPD.length - 1)] ?? 1.0;
    }

    isTileBlocked(wx, wy) {
        const tx = Math.floor(wx / TILE), ty = Math.floor((wy - MAP_OY) / TILE);
        if (tx < 0 || tx >= MAP_W || ty < 0 || ty >= MAP_H) return true;
        if ((this.scene.terrainData[ty]?.[tx] ?? 0) === 4) return true; // 4 is T_WATER
        const cell = this.scene.mapData[ty]?.[tx] ?? 0;
        if (cell < 98) return false;
        const gate = this.scene.buildings.find(b => b.type === 'gate' && b.built && b.tx === tx && b.ty === ty);
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
                // Stump with shoot — felled tree regrowing
                n.gfx.fillStyle(0x5a3318, 0.9).fillEllipse(0, 6, 18, 8);   // stump disk
                n.gfx.fillStyle(0x7a4a28, 0.7).fillEllipse(0, 5, 12, 5);   // top ring
                n.gfx.fillStyle(0x6a4422, 0.85).fillRect(-1, -1, 2, 7);     // shoot stem
                n.gfx.fillStyle(0x55cc33, 0.95).fillCircle(0, -3, 4);       // shoot bud
            } else {
                // Seeded sapling — thin stick, small dot
                n.gfx.fillStyle(0x6a4422, 0.85).fillRect(-1, 2, 2, 6);
                n.gfx.fillStyle(0x44bb22, 0.9).fillCircle(0, 0, 4);
            }
            return;
        }

        if (n.stock <= 0 && !n.felled) return;

        const def   = NODE_DEF[n.type];
        const ratio = n.stock / n.maxStock;

        if (n.type === 'scrub') {
            n.gfx = this.scene._w(this.scene.add.graphics().setDepth(2)).setPosition(n.x, n.y);
            this.drawNodeBody(n.gfx, n, 0.45 + ratio * 0.55);
            return;
        }

        const alpha    = 0.45 + ratio * 0.55;
        const targeted = this.scene.units?.some(u => u.targetNode === n && u.hp > 0);

        n.gfx = this.scene._w(this.scene.add.graphics().setDepth(2));
        n.gfx.setPosition(n.x, n.y);
        this.drawNodeBody(n.gfx, n, alpha);

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
        const foodRes = new Set(['wheat','olives','meat','flour','bread','cuts','sausages']);
        const barColor = foodRes.has(def.resource) ? 0x88dd44
                       : def.resource === 'ore'   ? 0x55aa55
                       : def.resource === 'wool'  ? 0xe8e0c0
                       : def.resource === 'stone' ? 0x9999aa : 0xaa7733;
        n.gfx.fillStyle(barColor, 0.9).fillRect(-bw/2, by, bw * ratio, 4);

        const sym = def.resource === 'wheat'  ? '🌾'
                  : def.resource === 'olives' ? '🫒'
                  : def.resource === 'ore'    ? '⛏'
                  : def.resource === 'wool'   ? '🧶'
                  : def.resource === 'stone'  ? '⛏' : '🪵';
        n.labelObj = this.scene._w(this.scene.add.text(n.x, n.y - (def.large ? 28 : 20), `${sym}${n.stock}`, {
            fontSize: '9px', color: '#ffffff', fontFamily: 'monospace',
            stroke: '#000000', strokeThickness: 2,
        }).setOrigin(0.5).setDepth(3));
    }

    drawNodeBody(gfx, n, alpha) {
        const type = n.type;
        if (type === 'berry_bush') {
            gfx.fillStyle(0x338818, alpha).fillCircle(-5, 2, 9);
            gfx.fillStyle(0x44aa22, alpha).fillCircle(4, 1, 10);
            gfx.fillStyle(0x55bb33, alpha).fillCircle(-1, -4, 8);
            [[-3,-2],[3,1],[0,3],[-5,4],[5,-2]].forEach(([bx,by]) =>
                gfx.fillStyle(0xcc2244, Math.min(1, alpha + 0.2)).fillCircle(bx, by, 2.5));
        } else if (type === 'small_boulder') {
            gfx.fillStyle(0x887766, alpha).fillEllipse(2, 3, 28, 19);
            gfx.fillStyle(0x9a8877, alpha).fillEllipse(-3, -1, 14, 9);
            gfx.lineStyle(1, 0x665544, alpha * 0.5).lineBetween(-2, 1, 4, 8);
        } else if (type === 'large_boulder') {
            gfx.fillStyle(0x776655, alpha).fillEllipse(2, 4, 44, 30);
            gfx.fillStyle(0x887766, alpha).fillEllipse(-6, -3, 22, 14);
            gfx.fillStyle(0x665544, alpha).fillEllipse(8, 6, 14, 10);
            gfx.lineStyle(1, 0x554433, alpha * 0.6)
                .lineBetween(-8, 2, -2, 12).lineBetween(4, -4, 10, 6);
        } else if (type === 'small_tree') {
            if (n.felled) {
                // Felled log pile
                gfx.fillStyle(0x6a4422, alpha).fillEllipse(0, 4, 28, 10);
                gfx.fillStyle(0x8a5a30, alpha).fillEllipse(-6, 2, 10, 8).fillEllipse(6, 2, 10, 8);
                gfx.fillStyle(0x5a3318, alpha * 0.6).fillEllipse(0, 5, 22, 6);
            } else {
                gfx.fillStyle(0x6a4422, alpha).fillRect(-3, 7, 6, 13);
                gfx.fillStyle(0x1a5a12, alpha).fillCircle(0, -1, 14);
                gfx.fillStyle(0x2a7a1e, alpha).fillCircle(-5, 3, 10);
                gfx.fillStyle(0x2a7a1e, alpha).fillCircle(5, 3, 10);
                gfx.fillStyle(0x338a28, alpha).fillCircle(0, -5, 10);
            }
        } else if (type === 'large_tree') {
            if (n.felled) {
                // Felled log pile (bigger)
                gfx.fillStyle(0x5a3318, alpha).fillEllipse(0, 5, 40, 14);
                gfx.fillStyle(0x7a4a28, alpha).fillEllipse(-10, 2, 16, 11).fillEllipse(10, 2, 16, 11);
                gfx.fillStyle(0x4a2810, alpha * 0.6).fillEllipse(0, 6, 32, 8);
            } else {
                gfx.fillStyle(0x5a3318, alpha).fillRect(-5, 10, 10, 18);
                gfx.fillStyle(0x144a0e, alpha).fillCircle(0, -5, 22);
                gfx.fillStyle(0x1a6a12, alpha).fillCircle(-8, 4, 16);
                gfx.fillStyle(0x1a6a12, alpha).fillCircle(8, 4, 16);
                gfx.fillStyle(0x2a8020, alpha).fillCircle(0, -10, 16);
                gfx.fillStyle(0x338a28, alpha).fillCircle(0, -3, 12);
            }
        } else if (type === 'scrub') {
            gfx.fillStyle(0x7a8830, alpha).fillEllipse(-6, 2, 14, 8);
            gfx.fillStyle(0x6a7828, alpha).fillEllipse(4, 0, 12, 7);
            gfx.fillStyle(0x8a9838, alpha).fillEllipse(-2, -3, 10, 6);
            gfx.fillStyle(0x5a6820, alpha * 0.6).fillRect(-7, 4, 3, 5);
            gfx.fillStyle(0x5a6820, alpha * 0.6).fillRect(3, 3, 3, 4);
        } else if (type === 'ore_vein') {
            gfx.fillStyle(0x554433, alpha).fillEllipse(0, 2, 46, 32);
            gfx.fillStyle(0x446644, alpha * 0.9).fillEllipse(-8, -2, 16, 10);
            gfx.fillStyle(0x447744, alpha * 0.8).fillEllipse(6, 4, 12, 8);
            gfx.lineStyle(2, 0x55aa55, alpha * 0.7)
                .lineBetween(-10, 0, -4, 8).lineBetween(2, -4, 8, 6).lineBetween(-2, 2, 4, -4);
        } else if (type === 'olive_grove') {
            gfx.fillStyle(0x7a6644, alpha).fillRect(-4, 6, 8, 16);
            gfx.fillStyle(0x3a4a1e, alpha * 0.9).fillEllipse(-10, -4, 24, 18);
            gfx.fillStyle(0x4a5a28, alpha).fillEllipse(8, -6, 22, 16);
            gfx.fillStyle(0x5a6a30, alpha * 0.85).fillEllipse(0, -10, 20, 14);
            [[-6,-2],[4,0],[-2,4],[8,-4]].forEach(([ox,oy]) =>
                gfx.fillStyle(0x224411, alpha).fillCircle(ox, oy, 2.5));
        } else if (type === 'wild_garden') {
            gfx.fillStyle(0x3a6a18, alpha).fillEllipse(-4, 3, 16, 10);
            gfx.fillStyle(0x4a7a22, alpha).fillEllipse(5, 1, 14, 9);
            gfx.fillStyle(0x2a5a10, alpha * 0.8).fillEllipse(0, -2, 10, 7);
            [[-5,-1],[4,3],[0,0],[-2,5]].forEach(([fx,fy]) =>
                gfx.fillStyle(0xddcc44, alpha * 0.9).fillCircle(fx, fy, 2));
        }
    }
}