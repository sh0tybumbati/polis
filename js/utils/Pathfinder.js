import { TILE, MAP_OY } from '../config/gameConstants.js';

// Binary min-heap keyed by node.f (= g + h). Lazy decrease-key: an improved node
// is re-pushed and the stale copy is skipped on pop via its `closed` flag.
class MinHeap {
    constructor() { this.a = []; }
    get size() { return this.a.length; }
    push(n) {
        const a = this.a;
        a.push(n);
        let i = a.length - 1;
        while (i > 0) {
            const p = (i - 1) >> 1;
            if (a[p].f <= a[i].f) break;
            const t = a[p]; a[p] = a[i]; a[i] = t;
            i = p;
        }
    }
    pop() {
        const a = this.a;
        const top = a[0];
        const last = a.pop();
        if (a.length > 0) {
            a[0] = last;
            let i = 0; const n = a.length;
            for (;;) {
                const l = 2 * i + 1, r = 2 * i + 2;
                let s = i;
                if (l < n && a[l].f < a[s].f) s = l;
                if (r < n && a[r].f < a[s].f) s = r;
                if (s === i) break;
                const t = a[s]; a[s] = a[i]; a[i] = t;
                i = s;
            }
        }
        return top;
    }
}

export class Pathfinder {
    constructor(scene) {
        this.scene = scene;
        // Per-frame A* budget. UnitManager.tick refills it; movers call
        // consumeSearch() before requesting a path so a crowd can't fire an
        // unbounded number of full searches in a single frame. Infinity = no cap
        // (unchanged behaviour if a caller never refills it).
        this._searchBudget = Infinity;
    }

    /** Refill the per-frame A* budget (called once per frame by UnitManager). */
    resetSearchBudget(n) { this._searchBudget = n; }

    /** Claim one A* search from this frame's budget; false if exhausted. */
    consumeSearch() {
        if (this._searchBudget <= 0) return false;
        this._searchBudget--;
        return true;
    }

    /**
     * Find a path from (startTx, startTy) to (endTx, endTy).
     * Returns an array of {tx, ty} or null if no path found.
     */
    findPath(startTx, startTy, endTx, endTy) {
        if (this._isBlocked(endTx, endTy)) {
            const adj = this._getAdjacent(endTx, endTy).find(t => !this._isBlocked(t.x, t.y));
            if (adj) { endTx = adj.x; endTy = adj.y; }
            else return null;
        }

        const key = (x, y) => `${x},${y}`;
        const nodes = new Map();   // key -> node (live g/f, `closed` once expanded)
        const heap  = new MinHeap();

        const startNode = { x: startTx, y: startTy, g: 0,
            h: this._dist(startTx, startTy, endTx, endTy), parent: null, closed: false };
        startNode.f = startNode.g + startNode.h;
        nodes.set(key(startTx, startTy), startNode);
        heap.push(startNode);

        let iterations = 0;
        const MAX_ITERATIONS = 1200;

        while (heap.size > 0 && iterations < MAX_ITERATIONS) {
            iterations++;
            const current = heap.pop();
            if (current.closed) continue;      // stale duplicate from a decrease-key
            current.closed = true;

            if (current.x === endTx && current.y === endTy) {
                return this._reconstructPath(current);
            }

            for (const neighbor of this._getAdjacent(current.x, current.y)) {
                if (this._isBlocked(neighbor.x, neighbor.y)) continue;
                // Diagonals: only if both shared orthogonal cells are open (never cut a wall corner).
                if (neighbor.diag &&
                    (this._isBlocked(neighbor.x, current.y) || this._isBlocked(current.x, neighbor.y))) continue;

                const nk = key(neighbor.x, neighbor.y);
                const existing = nodes.get(nk);
                if (existing && existing.closed) continue;

                const gScore = current.g + (neighbor.diag ? Math.SQRT2 : 1);
                if (!existing) {
                    const node = { x: neighbor.x, y: neighbor.y, g: gScore,
                        h: this._dist(neighbor.x, neighbor.y, endTx, endTy), parent: current, closed: false };
                    node.f = node.g + node.h;
                    nodes.set(nk, node);
                    heap.push(node);
                } else if (gScore < existing.g) {
                    existing.g = gScore;
                    existing.f = gScore + existing.h;
                    existing.parent = current;
                    heap.push(existing);       // lazy decrease-key
                }
            }
        }

        return null;
    }

    _isBlocked(tx, ty) {
        // isTileBlocked is frame-cached in MapManager, so a direct call is already
        // a Map hit for tiles seen earlier this frame by any mover or search.
        const wx = tx * TILE + TILE / 2;
        const wy = MAP_OY + ty * TILE + TILE / 2;
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
