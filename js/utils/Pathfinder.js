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
             // If target is blocked, try to find an adjacent free tile
             const adj = this._getAdjacent(endTx, endTy, MAP_W, MAP_H).find(t => !this._isBlocked(t.x, t.y));
             if (adj) { endTx = adj.x; endTy = adj.y; }
             else return null;
        }

        const openSet = [{ x: startTx, y: startTy, g: 0, h: this._dist(startTx, startTy, endTx, endTy), parent: null }];
        const closedSet = new Set();
        const key = (x, y) => y * MAP_W + x;

        let iterations = 0;
        const MAX_ITERATIONS = 400; // Cap search for performance

        while (openSet.length > 0 && iterations < MAX_ITERATIONS) {
            iterations++;
            openSet.sort((a, b) => (a.g + a.h) - (b.g + b.h));
            const current = openSet.shift();

            if (current.x === endTx && current.y === endTy) {
                return this._reconstructPath(current);
            }

            closedSet.add(key(current.x, current.y));

            const neighbors = this._getAdjacent(current.x, current.y, MAP_W, MAP_H);
            for (const neighbor of neighbors) {
                if (closedSet.has(key(neighbor.x, neighbor.y)) || this._isBlocked(neighbor.x, neighbor.y)) {
                    continue;
                }

                const gScore = current.g + 1;
                let existing = openSet.find(o => o.x === neighbor.x && o.y === neighbor.y);

                if (!existing) {
                    openSet.push({
                        x: neighbor.x,
                        y: neighbor.y,
                        g: gScore,
                        h: this._dist(neighbor.x, neighbor.y, endTx, endTy),
                        parent: current
                    });
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
