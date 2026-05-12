import { MAP_W, MAP_H, TILE, MAP_OY } from '../config/gameConstants.js';

const WALL_MAT = {
    'Materials.Wood.Pine':       { color: 0x5c3317, hpMax: 80,  buildWork: 4  },
    'Materials.Stone.Limestone': { color: 0x7a7a8a, hpMax: 300, buildWork: 14 },
    'Materials.Clay.Brick':      { color: 0xa04828, hpMax: 200, buildWork: 10 },
    'Materials.Clay.Daub':       { color: 0x9a6e40, hpMax: 40,  buildWork: 3  },
};

const W = 6; // wall thickness in pixels

export default class WallManager {
    constructor(scene) {
        this.scene   = scene;
        this.wallGfx = null;
        // hWalls[y][x]: horizontal edge above tile row y; (MAP_H+1) rows × MAP_W cols
        this.hWalls  = Array.from({ length: MAP_H + 1 }, () => new Array(MAP_W).fill(null));
        // vWalls[y][x]: vertical edge left of tile col x; MAP_H rows × (MAP_W+1) cols
        this.vWalls  = Array.from({ length: MAP_H },     () => new Array(MAP_W + 1).fill(null));
        this.rooms   = [];
    }

    init() {
        this.wallGfx = this.scene._w(this.scene.add.graphics().setDepth(4));
    }

    // ─── Placement ──────────────────────────────────────────────────────────────

    placeWall(isH, row, col, material = 'Materials.Wood.Pine', height = 'full') {
        const mat = WALL_MAT[material] ?? WALL_MAT['Materials.Wood.Pine'];
        const seg = { material, height, hp: mat.hpMax, hpMax: mat.hpMax, buildProgress: 0, buildWork: mat.buildWork };
        if (isH) {
            if (row < 0 || row > MAP_H || col < 0 || col >= MAP_W) return;
            this.hWalls[row][col] = seg;
        } else {
            if (row < 0 || row >= MAP_H || col < 0 || col > MAP_W) return;
            this.vWalls[row][col] = seg;
        }
    }

    removeWall(isH, row, col) {
        if (isH) { if (this.hWalls[row]) this.hWalls[row][col] = null; }
        else      { if (this.vWalls[row]) this.vWalls[row][col] = null; }
    }

    getWall(isH, row, col) {
        return isH ? (this.hWalls[row]?.[col] ?? null) : (this.vWalls[row]?.[col] ?? null);
    }

    // ─── Edge detection ─────────────────────────────────────────────────────────

    // Returns { isH, row, col } of the edge nearest to world pixel (wx, wy),
    // or null if cursor is too far from any edge.
    nearestEdge(wx, wy) {
        const tx = Math.floor(wx / TILE);
        const ty = Math.floor((wy - MAP_OY) / TILE);
        if (tx < 0 || tx >= MAP_W || ty < 0 || ty >= MAP_H) return null;

        const ox = wx - tx * TILE;
        const oy = (wy - MAP_OY) - ty * TILE;

        const dTop    = oy;
        const dBottom = TILE - oy;
        const dLeft   = ox;
        const dRight  = TILE - ox;
        const min = Math.min(dTop, dBottom, dLeft, dRight);

        if (min > TILE * 0.38) return null;

        if (min === dTop)    return { isH: true,  row: ty,     col: tx };
        if (min === dBottom) return { isH: true,  row: ty + 1, col: tx };
        if (min === dLeft)   return { isH: false, row: ty,     col: tx };
                             return { isH: false, row: ty,     col: tx + 1 };
    }

    getPendingWalls() {
        const result = [];
        for (let y = 0; y <= MAP_H; y++)
            for (let x = 0; x < MAP_W; x++)
                if (this.hWalls[y]?.[x]?.buildProgress < 1)
                    result.push({ isH: true, row: y, col: x });
        for (let y = 0; y < MAP_H; y++)
            for (let x = 0; x <= MAP_W; x++)
                if (this.vWalls[y]?.[x]?.buildProgress < 1)
                    result.push({ isH: false, row: y, col: x });
        return result;
    }

    // ─── Rendering ─────────────────────────────────────────────────────────────

    getMaterialColor(material) {
        return (WALL_MAT[material] ?? WALL_MAT['Materials.Wood.Pine']).color;
    }

    renderWalls() {
        const g = this.wallGfx;
        if (!g) return;
        g.clear();

        const T = TILE, OY = MAP_OY;
        const _light = hex => {
            const r = Math.min(255, ((hex >> 16) & 0xff) + 55);
            const gv = Math.min(255, ((hex >> 8)  & 0xff) + 55);
            const b = Math.min(255, ( hex         & 0xff) + 55);
            return (r << 16) | (gv << 8) | b;
        };
        const _dark = hex => {
            const r = Math.max(0, ((hex >> 16) & 0xff) - 45);
            const gv = Math.max(0, ((hex >> 8)  & 0xff) - 45);
            const b = Math.max(0, ( hex         & 0xff) - 45);
            return (r << 16) | (gv << 8) | b;
        };

        for (let y = 0; y <= MAP_H; y++) {
            for (let x = 0; x < MAP_W; x++) {
                const wall = this.hWalls[y][x];
                if (!wall) continue;
                const mat = WALL_MAT[wall.material] ?? WALL_MAT['Materials.Wood.Pine'];
                const alpha = wall.buildProgress < 1 ? 0.45 : 1;
                const rx = x * T, ry = OY + y * T - W / 2;
                g.fillStyle(mat.color, alpha);
                g.fillRect(rx, ry, T, W);
                if (alpha === 1) {
                    g.fillStyle(_light(mat.color), 0.55);
                    g.fillRect(rx, ry, T, 1);
                    g.fillStyle(_dark(mat.color), 0.65);
                    g.fillRect(rx, ry + W - 1, T, 1);
                }
            }
        }

        for (let y = 0; y < MAP_H; y++) {
            for (let x = 0; x <= MAP_W; x++) {
                const wall = this.vWalls[y][x];
                if (!wall) continue;
                const mat = WALL_MAT[wall.material] ?? WALL_MAT['Materials.Wood.Pine'];
                const alpha = wall.buildProgress < 1 ? 0.45 : 1;
                const rx = x * T - W / 2, ry = OY + y * T;
                g.fillStyle(mat.color, alpha);
                g.fillRect(rx, ry, W, T);
                if (alpha === 1) {
                    g.fillStyle(_light(mat.color), 0.55);
                    g.fillRect(rx, ry, 1, T);
                    g.fillStyle(_dark(mat.color), 0.65);
                    g.fillRect(rx + W - 1, ry, 1, T);
                }
            }
        }

        // Corner posts where 2+ wall edges meet
        for (let y = 0; y <= MAP_H; y++) {
            for (let x = 0; x <= MAP_W; x++) {
                const h0 = x > 0     ? this.hWalls[y]?.[x - 1] : null;
                const h1 = x < MAP_W ? this.hWalls[y]?.[x]     : null;
                const v0 = y > 0     ? this.vWalls[y - 1]?.[x]  : null;
                const v1 = y < MAP_H ? this.vWalls[y]?.[x]      : null;
                const walls = [h0, h1, v0, v1].filter(Boolean);
                if (walls.length < 2) continue;
                const mat = WALL_MAT[walls[0].material] ?? WALL_MAT['Materials.Wood.Pine'];
                g.fillStyle(mat.color, 1);
                g.fillRect(x * T - W / 2, OY + y * T - W / 2, W, W);
            }
        }
    }

    // ─── Room detection (flood fill) ────────────────────────────────────────────

    detectRooms() {
        const visited = Array.from({ length: MAP_H }, () => new Array(MAP_W).fill(false));
        const rooms   = [];

        for (let y = 0; y < MAP_H; y++) {
            for (let x = 0; x < MAP_W; x++) {
                if (visited[y][x]) continue;

                const tiles = [];
                const queue = [[y, x]];
                visited[y][x] = true;
                let bounded   = true;

                while (queue.length) {
                    const [cy, cx] = queue.shift();
                    tiles.push({ ty: cy, tx: cx });

                    // North
                    if (!this._blocks(true, cy, cx)) {
                        if (cy > 0 && !visited[cy - 1][cx]) { visited[cy - 1][cx] = true; queue.push([cy - 1, cx]); }
                        else if (cy === 0) bounded = false;
                    }
                    // South
                    if (!this._blocks(true, cy + 1, cx)) {
                        if (cy < MAP_H - 1 && !visited[cy + 1][cx]) { visited[cy + 1][cx] = true; queue.push([cy + 1, cx]); }
                        else if (cy === MAP_H - 1) bounded = false;
                    }
                    // West
                    if (!this._blocks(false, cy, cx)) {
                        if (cx > 0 && !visited[cy][cx - 1]) { visited[cy][cx - 1] = true; queue.push([cy, cx - 1]); }
                        else if (cx === 0) bounded = false;
                    }
                    // East
                    if (!this._blocks(false, cy, cx + 1)) {
                        if (cx < MAP_W - 1 && !visited[cy][cx + 1]) { visited[cy][cx + 1] = true; queue.push([cy, cx + 1]); }
                        else if (cx === MAP_W - 1) bounded = false;
                    }
                }

                if (bounded && tiles.length >= 1 && tiles.length <= 400) {
                    rooms.push({ id: `room_${this.scene.nextId++}`, tiles, enclosed: true });
                }
            }
        }

        this.rooms = rooms;
        return rooms;
    }

    _blocks(isH, row, col) {
        const wall = isH ? this.hWalls[row]?.[col] : this.vWalls[row]?.[col];
        return !!(wall && wall.height === 'full' && wall.buildProgress >= 1);
    }

    _blocksEnclosure(isH, row, col) {
        const wall = isH ? this.hWalls[row]?.[col] : this.vWalls[row]?.[col];
        return !!(wall && (wall.height === 'full' || wall.height === 'fence') && wall.buildProgress >= 1);
    }

    // ─── Targeted room query ────────────────────────────────────────────────────

    // BFS from (tx,ty) blocked by full walls. Returns tile array if enclosed
    // (≤ maxTiles, never touches boundary), or null if open/too large.
    getRoomAt(tx, ty, maxTiles = 400) {
        return this._getRegionAt(tx, ty, maxTiles, (isH, row, col) => this._blocks(isH, row, col));
    }

    // BFS blocked by full walls AND fences
    getEnclosureAt(tx, ty, maxTiles = 400) {
        return this._getRegionAt(tx, ty, maxTiles, (isH, row, col) => this._blocksEnclosure(isH, row, col));
    }

    _getRegionAt(tx, ty, maxTiles, blocksFn) {
        const key = (x, y) => y * MAP_W + x;
        const visited = new Set([key(tx, ty)]);
        const queue   = [[tx, ty]];

        while (queue.length) {
            const [cx, cy] = queue.shift();
            for (const [dx, dy, isH, row, col] of [
                [ 0, -1, true,  cy,     cx    ],
                [ 0, +1, true,  cy + 1, cx    ],
                [-1,  0, false, cy,     cx    ],
                [+1,  0, false, cy,     cx + 1],
            ]) {
                const nx = cx + dx, ny = cy + dy;
                if (nx < 0 || nx >= MAP_W || ny < 0 || ny >= MAP_H) return null;
                if (blocksFn(isH, row, col)) continue;
                const nk = key(nx, ny);
                if (visited.has(nk)) continue;
                if (visited.size >= maxTiles) return null;
                visited.add(nk);
                queue.push([nx, ny]);
            }
        }
        return [...visited].map(k => ({ tx: k % MAP_W, ty: Math.floor(k / MAP_W) }));
    }

    // ─── Save / Load ────────────────────────────────────────────────────────────

    save() {
        const hData = [], vData = [];
        for (let y = 0; y <= MAP_H; y++)
            for (let x = 0; x < MAP_W; x++)
                if (this.hWalls[y][x]) hData.push({ y, x, w: this.hWalls[y][x] });
        for (let y = 0; y < MAP_H; y++)
            for (let x = 0; x <= MAP_W; x++)
                if (this.vWalls[y][x]) vData.push({ y, x, w: this.vWalls[y][x] });
        return { hData, vData };
    }

    load(data) {
        if (!data) return;
        for (const { y, x, w } of data.hData ?? [])
            if (this.hWalls[y]) this.hWalls[y][x] = w;
        for (const { y, x, w } of data.vData ?? [])
            if (this.vWalls[y]) this.vWalls[y][x] = w;
    }
}
