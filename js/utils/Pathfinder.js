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
        if (this.scene.mapManager.isTileBlocked(endTx * TILE + TILE/2, MAP_OY + endTy * TILE + TILE/2)) {
             const adj = this._getAdjacent(endTx, endTy).find(t => !this._isBlocked(t.x, t.y));
             if (adj) { endTx = adj.x; endTy = adj.y; }
             else return null;
        }

        const key = (x, y) => `${x},${y}`;
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

            for (const neighbor of this._getAdjacent(current.x, current.y)) {
                const nk = key(neighbor.x, neighbor.y);
                if (closedSet.has(nk) || this._isBlocked(neighbor.x, neighbor.y)) continue;
                // Diagonals: only if both shared orthogonal cells are open (never cut a wall corner).
                if (neighbor.diag &&
                    (this._isBlocked(neighbor.x, current.y) || this._isBlocked(current.x, neighbor.y))) continue;

                const gScore = current.g + (neighbor.diag ? Math.SQRT2 : 1);
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

    // Octile distance: cardinal cost 1, diagonal cost √2.
    _dist(x1, y1, x2, y2) {
        const dx = Math.abs(x1 - x2), dy = Math.abs(y1 - y2);
        return (dx + dy) + (Math.SQRT2 - 2) * Math.min(dx, dy);
    }

    _getAdjacent(x, y) {
        return [
            { x: x - 1, y: y },
            { x: x + 1, y: y },
            { x: x, y: y - 1 },
            { x: x, y: y + 1 },
            { x: x - 1, y: y - 1, diag: true },
            { x: x + 1, y: y - 1, diag: true },
            { x: x - 1, y: y + 1, diag: true },
            { x: x + 1, y: y + 1, diag: true },
        ];
    }

    /**
     * True if a straight world-space line from (wx1,wy1) to (wx2,wy2) crosses no blocked tile.
     * Used by the movement funnel to skip redundant waypoints and cut corners naturally.
     */
    lineClear(wx1, wy1, wx2, wy2) {
        const dx = wx2 - wx1, dy = wy2 - wy1;
        const len = Math.hypot(dx, dy);
        const steps = Math.max(1, Math.ceil(len / (TILE * 0.5)));
        for (let i = 1; i <= steps; i++) {
            const t = i / steps;
            if (this.scene.mapManager.isTileBlocked(wx1 + dx * t, wy1 + dy * t)) return false;
        }
        return true;
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
