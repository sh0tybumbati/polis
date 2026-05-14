import { TILE, MAP_OY } from '../config/gameConstants.js';

export class Pathfinder {
    constructor(scene) {
        this.scene = scene;
    }

    /**
     * Find a path from (startTx, startTy) to (endTx, endTy).
     * Returns an array of {tx, ty} or null if no path found.
     */
    findPath(startTx, startTy, endTx, endTy) {
        const MAP_W = this.scene.mapData[0].length;
        const MAP_H = this.scene.mapData.length;

        if (endTx < 0 || endTx >= MAP_W || endTy < 0 || endTy >= MAP_H) return null;
        if (this.scene.mapManager.isTileBlocked(endTx * TILE + TILE/2, MAP_OY + endTy * TILE + TILE/2)) {
             const adj = this._getAdjacent(endTx, endTy, MAP_W, MAP_H).find(t => !this._isBlocked(t.x, t.y));
             if (adj) { endTx = adj.x; endTy = adj.y; }
             else return null;
        }

        const key = (x, y) => y * MAP_W + x;
        const closedSet = new Set();
        // openMap gives O(1) lookup instead of O(n) find()
        const openMap  = new Map();
        const openSet  = [];

        const startNode = { x: startTx, y: startTy, g: 0, h: this._dist(startTx, startTy, endTx, endTy), parent: null };
        openSet.push(startNode);
        openMap.set(key(startTx, startTy), startNode);

        let iterations = 0;
        const MAX_ITERATIONS = 1200;

        while (openSet.length > 0 && iterations < MAX_ITERATIONS) {
            iterations++;
            // Linear min-scan instead of sorting the whole array each iteration
            let minIdx = 0;
            for (let i = 1; i < openSet.length; i++) {
                if ((openSet[i].g + openSet[i].h) < (openSet[minIdx].g + openSet[minIdx].h)) minIdx = i;
            }
            const current = openSet[minIdx];
            openSet.splice(minIdx, 1);
            openMap.delete(key(current.x, current.y));

            if (current.x === endTx && current.y === endTy) {
                return this._reconstructPath(current);
            }

            const ck = key(current.x, current.y);
            if (closedSet.has(ck)) continue;
            closedSet.add(ck);

            for (const neighbor of this._getAdjacent(current.x, current.y, MAP_W, MAP_H)) {
                const nk = key(neighbor.x, neighbor.y);
                if (closedSet.has(nk) || this._isBlocked(neighbor.x, neighbor.y)) continue;

                const gScore = current.g + 1;
                const existing = openMap.get(nk);
                if (!existing) {
                    const node = { x: neighbor.x, y: neighbor.y, g: gScore,
                        h: this._dist(neighbor.x, neighbor.y, endTx, endTy), parent: current };
                    openSet.push(node);
                    openMap.set(nk, node);
                } else if (gScore < existing.g) {
                    existing.g = gScore;
                    existing.parent = current;
                }
            }
        }

        return null;
    }

    _isBlocked(tx, ty) {
        const wx = tx * TILE + TILE/2;
        const wy = MAP_OY + ty * TILE + TILE/2;
        return this.scene.mapManager.isTileBlocked(wx, wy);
    }

    _dist(x1, y1, x2, y2) {
        return Math.abs(x1 - x2) + Math.abs(y1 - y2);
    }

    _getAdjacent(x, y, w, h) {
        const res = [];
        if (x > 0) res.push({ x: x - 1, y: y });
        if (x < w - 1) res.push({ x: x + 1, y: y });
        if (y > 0) res.push({ x: x, y: y - 1 });
        if (y < h - 1) res.push({ x: x, y: y + 1 });
        return res;
    }

    _reconstructPath(node) {
        const path = [];
        let curr = node;
        while (curr) {
            path.push({ tx: curr.x, ty: curr.y });
            curr = curr.parent;
        }
        return path.reverse();
    }
}
