import { TILE, MAP_OY } from '../../config/gameConstants.js';
import { NODES } from '../../content/nodes/index.js';
import { MathUtils } from '../../utils/MathUtils.js';

export default {
    tickEnemy(u, time, dt) {
        if (u.type === 'worker') { this.tickEnemyWorker(u, time, dt); return; }

        // Only the local crowd matters for combat decisions — use the per-frame spatial hash
        // instead of sweeping every unit on the map (O(enemies × units) → O(enemies × neighbours)).
        const nearbyUnits = this._neighbors(u, 9 * TILE) ?? this.scene.units;
        const players = nearbyUnits.filter(p => !p.isEnemy && p.hp > 0);
        let near = null, nd = Infinity;
        for (const p of players) {
            const d = Phaser.Math.Distance.Between(u.x, u.y, p.x, p.y);
            if (d < nd) { nd = d; near = p; }
        }

        // Pick a priority/focus-fire target to maneuver toward (wounded, ranged, hero, countered,
        // and whatever allies already pile onto). Movement uses this; in-range hits still land on
        // whoever is adjacent.
        const target = this._pickEnemyTarget(u, players);
        u._targetId = target ? target.id : null;

        // Withdraw when badly hurt and locally outnumbered — raiders live to fight another night.
        const hpFrac = u.hp / (u.maxHp || u.hp || 1);
        if (u.aiMode !== 'scout' && u.aiMode !== 'tower_assault'
            && hpFrac < 0.45 && this._outnumbered(u, 6 * TILE)) {
            u.aiMode = 'retreat';
        }

        // Attack any player unit in range (unless disengaging to retreat).
        if (near && nd <= u.range + 4 && u.aiMode !== 'retreat') {
            if (time - u.lastAtk > 1000) {
                const nTx = Math.floor(near.x/TILE), nTy = Math.floor((near.y-MAP_OY)/TILE);
                const cover = MathUtils.coverMod(this.scene.chunkManager?.getTile(nTx, nTy) ?? 0);
                const dmg = Math.max(1, Math.round(u.atk * MathUtils.counterMod(u.type, near.type) * cover));
                near.hp -= dmg; u.lastAtk = time;
                this._floatDmg(near, `-${dmg}`, '#ff6666');
            }
            return;
        }

        const mode = u.aiMode ?? 'patrol';
        const vc = this.getEnemyVillageCenter();

        if (mode === 'patrol') {
            const homeDist = Phaser.Math.Distance.Between(u.x, u.y, vc.x, vc.y);
            if (homeDist > 7 * TILE) {
                this.moveToward(u, vc.x, vc.y, 10, dt);
            } else {
                if (!u.moveTo || Phaser.Math.Distance.Between(u.x, u.y, u.moveTo.x, u.moveTo.y) < 12)
                    u.moveTo = { x: vc.x + Phaser.Math.Between(-48, 48), y: vc.y + Phaser.Math.Between(-48, 48) };
                this.moveToward(u, u.moveTo.x, u.moveTo.y, 10, dt);
            }
        } else if (mode === 'scout') {
            u.scoutTimer = (u.scoutTimer ?? 0) + dt;
            // Retreat if low HP or timer > 35s
            if (u.hp / u.maxHp < 0.4 || u.scoutTimer > 35) {
                u.aiMode = 'patrol';
                u.moveTo = null;
            } else {
                const th = this.scene.constructs.find(b => !b.faction && b.type === 'townhall' && b.built);
                const tx = th ? (th.tx + 1) * TILE : vc.x;
                const ty = th ? MAP_OY + (th.ty + 1) * TILE : vc.y + TILE * 60;
                this.moveToward(u, tx, ty, 10, dt);
            }
        } else if (mode === 'tower_assault') {
            const tower = this.scene.constructs.find(b => b.id === u._assaultTowerId && b.built);
            if (!tower) { u.aiMode = 'raid'; u._assaultTowerId = null; return; }
            const tx = (tower.tx + 0.5) * TILE, ty = MAP_OY + (tower.ty + 0.5) * TILE;
            this.moveToward(u, tx, ty, 6, dt);
            // Fight garrison units in range (normal combat)
            const garrisonUnits = this.scene.units.filter(g =>
                !g.isEnemy && g.hp > 0 && g.taskType === 'garrison' && g.taskConstructId === tower.id);
            if (!garrisonUnits.length) { u.aiMode = 'raid'; u._assaultTowerId = null; return; }
            let gnear = null, gnd = Infinity;
            for (const g of garrisonUnits) {
                const d = Phaser.Math.Distance.Between(u.x, u.y, g.x, g.y);
                if (d < gnd) { gnd = d; gnear = g; }
            }
            if (gnear && gnd <= u.range + TILE) {
                if (time - (u.lastAtk ?? 0) > 1000) {
                    u.lastAtk = time;
                    const dmg = Math.max(1, Math.round(u.atk * 0.7)); // attacker penalty climbing
                    gnear.hp -= dmg;
                    this._floatDmg(gnear, `-${dmg}`, '#ff8844');
                }
            }
        } else if (mode === 'retreat') {
            // Fall back to the village; rejoin the raid once healed or no longer outnumbered.
            if (hpFrac > 0.75 || !this._outnumbered(u, 7 * TILE)) { u.aiMode = 'raid'; }
            else { this.moveToward(u, vc.x, vc.y, 8, dt); return; }
        } else { // raid
            const chase = target ?? near;
            const cd = chase ? Phaser.Math.Distance.Between(u.x, u.y, chase.x, chase.y) : Infinity;
            if (chase && cd < u.range * 8) {
                this.moveToward(u, chase.x, chase.y, 10, dt);
            } else {
                // If a watchtower with melee garrison is nearby, try to assault it
                const RANGED = new Set(['archer','slinger','toxotes','scout']);
                const assaultable = this.scene.constructs.find(b =>
                    b.built && b.type === 'watchtower' && !b.faction &&
                    this.scene.units.some(g => !g.isEnemy && g.hp > 0 && g.taskType === 'garrison' && g.taskConstructId === b.id && !RANGED.has(g.type)) &&
                    this.scene.units.filter(e => e.isEnemy && e.hp > 0 && e._assaultTowerId === b.id).length < 2 &&
                    Phaser.Math.Distance.Between(u.x, u.y, (b.tx + 0.5) * TILE, MAP_OY + (b.ty + 0.5) * TILE) < TILE * 5);
                if (assaultable) {
                    u.aiMode = 'tower_assault';
                    u._assaultTowerId = assaultable.id;
                    return;
                }
                // Attack nearest player construct if no units nearby
                const construct = this._nearestPlayerConstruct(u.x, u.y);
                if (construct) {
                    const bx = (construct.tx + construct.width / 2) * TILE;
                    const by = MAP_OY + (construct.ty + construct.height / 2) * TILE;
                    const bd = Phaser.Math.Distance.Between(u.x, u.y, bx, by);
                    if (bd < TILE * 1.2) {
                        if (time - (u.lastAtk ?? 0) > 1200) {
                            u.lastAtk = time;
                            construct.hp = Math.max(0, construct.hp - u.atk);
                            this.scene.constructManager.redrawConstructBar(construct);
                            this.scene.uiManager.showFloatText(bx, by - 10, `-${u.atk}`, '#ff8844');
                            if (construct.hp <= 0) this._destroyConstruct(construct);
                        }
                    } else {
                        this.moveToward(u, bx, by, 10, dt);
                    }
                }
            }
        }
    },

    // Choose which player unit an enemy should maneuver toward. Scores proximity, then biases
    // toward wounded / soft (ranged, hero) / countered targets and toward whatever allies are
    // already focusing — producing focus-fire without a separate coordination pass.
    _pickEnemyTarget(u, players) {
        if (!players.length) return null;
        const RANGED = new Set(['archer', 'slinger', 'toxotes', 'scout']);
        // Tally current focus from the nearby squad's last-assigned targets (drives convergence) —
        // scoped to neighbours so it's both cheaper and a more sensible local focus-fire.
        const focus = {};
        const squad = this._neighbors(u, 10 * TILE) ?? this.scene.units;
        for (const e of squad) {
            if (e.isEnemy && e.hp > 0 && e._targetId != null) {
                focus[e._targetId] = (focus[e._targetId] ?? 0) + 1;
            }
        }
        let best = null, bestScore = -Infinity;
        for (const p of players) {
            const d = Phaser.Math.Distance.Between(u.x, u.y, p.x, p.y);
            let score = -d / TILE;                                   // closer is better
            const hpFrac = p.hp / (p.maxHp || p.hp || 1);
            score += (1 - hpFrac) * 4;                               // finish off the wounded
            if (RANGED.has(p.type)) score += 2.5;                    // soft, high-value
            if (p.isHero)           score += 3;
            score += (MathUtils.counterMod(u.type, p.type) - 1) * 3; // exploit type advantage
            score += Math.min(focus[p.id] ?? 0, 3) * 1.2;            // pile on (capped)
            if (score > bestScore) { bestScore = score; best = p; }
        }
        return best;
    },

    // True if nearby player combat power (soldiers + drafted colonists) clearly exceeds nearby
    // enemy power around u. Plain workers aren't counted as a threat.
    _outnumbered(u, r) {
        let mine = 0, theirs = 0;
        const near = this._neighbors(u, r) ?? this.scene.units;
        for (const e of near) {
            if (e.hp <= 0) continue;
            if (Phaser.Math.Distance.Between(u.x, u.y, e.x, e.y) > r) continue;
            const power = (e.atk || 1) * Phaser.Math.Clamp(e.hp / (e.maxHp || e.hp || 1), 0.2, 1);
            if (e.isEnemy) mine += power;
            else if (e.type !== 'worker' || e.drafted) theirs += power;
        }
        return theirs > mine * 1.4;
    },

    tickEnemyWorker(u, time, dt) {
        // Deposit when carrying something
        if (this.totalCarrying(u) > 0) {
            const depot = this.scene.constructs.find(b => b.faction === 'enemy' && b.built &&
                (b.type === 'townhall' || b.type === 'granary' || b.type === 'farm'));
            if (depot) {
                const dx = (depot.tx + 1) * TILE, dy = MAP_OY + (depot.ty + 1) * TILE;
                if (Phaser.Math.Distance.Between(u.x, u.y, dx, dy) < 28) {
                    const er = this.scene.enemyRes;
                    for (const [res, amt] of Object.entries(u.carrying)) {
                        if ((amt || 0) > 0) {
                            er[res] = (er[res] ?? 0) + amt;
                            u.carrying[res] = 0;
                        }
                    }
                } else {
                    this.moveToward(u, dx, dy, 10, dt);
                }
                return;
            }
        }

        // Harvest enemy farm if it has stock
        const eFarm = this.scene.constructs.find(b =>
            b.faction === 'enemy' && b.type === 'farm' && b.built && b.stock > 0);
        if (eFarm) {
            const fx = (eFarm.tx + 1) * TILE, fy = MAP_OY + (eFarm.ty + 1) * TILE;
            if (Phaser.Math.Distance.Between(u.x, u.y, fx, fy) < 28) {
                let pick = 0;
                while (pick < eFarm.stock && this.canUnitCarryMore(u, 'Food.Grain.Wheat', pick + 1)) {
                    pick++;
                }
                eFarm.stock -= pick;
                u.carrying['Food.Grain.Wheat'] = (u.carrying['Food.Grain.Wheat'] ?? 0) + pick;
            } else {
                this.moveToward(u, fx, fy, 10, dt);
                return;
            }
        }

        // Seek a nearby resource node
        if (!u.targetNode || u.targetNode.stock <= 0) {
            const vc = this.getEnemyVillageCenter();
            u.targetNode = this.scene.resNodes
                .filter(n => n.stock > 0 &&
                    Phaser.Math.Distance.Between(n.x, n.y, vc.x, vc.y) < TILE * 18)
                .sort((a, b) =>
                    Phaser.Math.Distance.Between(u.x, u.y, a.x, a.y) -
                    Phaser.Math.Distance.Between(u.x, u.y, b.x, b.y))[0] ?? null;
        }

        if (!u.targetNode) {
            // Nothing to gather — wander near village
            const vc = this.getEnemyVillageCenter();
            if (!u.moveTo || Phaser.Math.Distance.Between(u.x, u.y, u.moveTo.x, u.moveTo.y) < 12)
                u.moveTo = { x: vc.x + Phaser.Math.Between(-40, 40), y: vc.y + Phaser.Math.Between(-40, 40) };
            this.moveToward(u, u.moveTo.x, u.moveTo.y, 10, dt);
            return;
        }

        // Move to node and harvest
        const n = u.targetNode;
        if (this.moveToward(u, n.x, n.y, 20, dt)) return;
        u.workProgress = (u.workProgress ?? 0) + dt;
        if (u.workProgress >= 25.0) {
            u.workProgress = 0;
            const res = NODES[n.type]?.resource ?? 'Food.Grain.Wheat';

            let pick = 0;
            while (pick < n.stock && this.canUnitCarryMore(u, res, pick + 1)) {
                pick++;
            }
            if (pick === 0) { u.targetNode = null; return; }

            n.stock -= pick;
            u.carrying[res] = (u.carrying[res] ?? 0) + pick;
            if (n.stock <= 0) { u.targetNode = null; this.scene.mapManager.redrawNode(n); }
            if (!this.canUnitCarryMore(u, res, 1)) u.targetNode = null;
        }
    },
};
