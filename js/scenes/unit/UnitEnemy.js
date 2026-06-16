import { TILE, MAP_OY } from '../../config/gameConstants.js';
import { NODES } from '../../content/nodes/index.js';
import { MathUtils } from '../../utils/MathUtils.js';

export default {
    tickEnemy(u, time, dt) {
        if (u.type === 'worker') { this.tickEnemyWorker(u, time, dt); return; }

        // Always attack any player unit in range
        const players = this.scene.units.filter(p => !p.isEnemy && p.hp > 0);
        let near = null, nd = Infinity;
        for (const p of players) {
            const d = Phaser.Math.Distance.Between(u.x, u.y, p.x, p.y);
            if (d < nd) { nd = d; near = p; }
        }
        if (near && nd <= u.range + 4) {
            if (time - u.lastAtk > 1000) {
                const nTx = Math.floor(near.x/TILE), nTy = Math.floor((near.y-MAP_OY)/TILE);
                const cover = MathUtils.coverMod(this.scene.chunkManager?.getTile(nTx, nTy) ?? 0);
                const dmg = Math.max(1, Math.round(u.atk * MathUtils.counterMod(u.type, near.type) * cover));
                near.hp -= dmg; u.lastAtk = time;
                this.scene.uiManager.showFloatText(near.x, near.y - 14, `-${dmg}`, '#ff6666');
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
                    this.scene.uiManager.showFloatText(gnear.x, gnear.y - 14, `-${dmg}`, '#ff8844');
                }
            }
        } else { // raid
            if (near && nd < u.range * 8) {
                this.moveToward(u, near.x, near.y, 10, dt);
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
                    const by = MAP_OY + (construct.ty + construct.width / 2) * TILE;
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
