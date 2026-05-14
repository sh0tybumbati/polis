import {
    TILE, MAP_OY, MAP_W, MAP_H,
    TILE_SPD, DESIRE_THRESHOLD, ROAD_DESIRE, ROAD_NONE,
} from '../../config/gameConstants.js';
import { CONSTRUCTS } from '../../content/constructs/index.js';
import { ITEMS } from '../../content/items/index.js';

export default {
    moveToward(u, tx, ty, threshold, dt) {
        const d = Phaser.Math.Distance.Between(u.x, u.y, tx, ty);
        if (d <= threshold) {
            u.currentPath = null;
            return false;
        }

        // --- Stuck detection: if barely moved in 1.5s while still far from target, nudge and retry ---
        if (d > threshold * 3) {
            u._stuckAcc = (u._stuckAcc ?? 0) + dt;
            if (u._stuckAcc >= 1500) {
                const moved = Math.abs(u.x - (u._stuckPrevX ?? u.x)) + Math.abs(u.y - (u._stuckPrevY ?? u.y));
                if (moved < 3) {
                    u.x += (Math.random() - 0.5) * TILE * 1.2;
                    u.y += (Math.random() - 0.5) * TILE * 0.8;
                    u.currentPath = null; u._pathFailed = false; u._pathRetryTimer = 0;
                }
                u._stuckAcc = 0; u._stuckPrevX = u.x; u._stuckPrevY = u.y;
            }
        } else {
            u._stuckAcc = 0;
        }

        // --- Pathfinding Logic ---
        const startTx = Math.floor(u.x / TILE), startTy = Math.floor((u.y - MAP_OY) / TILE);
        const targetTx = Math.floor(tx / TILE), targetTy = Math.floor((ty - MAP_OY) / TILE);

        // Use pathfinding whenever more than ~1 tile away — prevents sticking near obstacles
        const isFar = d > TILE * 1.2;
        const targetChanged = u._pathTargetTx !== targetTx || u._pathTargetTy !== targetTy;
        // Throttle retries on failed paths: don't re-attempt for 2s after a null result
        if (targetChanged) { u._pathRetryTimer = 0; u._pathFailed = false; }
        if (u._pathRetryTimer > 0) { u._pathRetryTimer -= dt; if (u._pathRetryTimer <= 0) u._pathFailed = false; }
        const needsPath = isFar && (!u.currentPath || targetChanged) && !u._pathFailed;

        if (needsPath) {
            u.currentPath = this.pathfinder.findPath(startTx, startTy, targetTx, targetTy);
            u._pathTargetTx = targetTx;
            u._pathTargetTy = targetTy;
            u._pathIndex = 0;
            if (!u.currentPath) { u._pathFailed = true; u._pathRetryTimer = 2.0; }
        }

        let moveTargetX = tx, moveTargetY = ty;

        if (u.currentPath && u.currentPath.length > 0) {
            // Follow path waypoints
            if (u._pathIndex < u.currentPath.length) {
                const wp = u.currentPath[u._pathIndex];
                moveTargetX = wp.tx * TILE + TILE / 2;
                moveTargetY = MAP_OY + wp.ty * TILE + TILE / 2;

                const distToWp = Phaser.Math.Distance.Between(u.x, u.y, moveTargetX, moveTargetY);
                if (distToWp < 8) {
                    u._pathIndex++;
                    return true; // continue moving next tick
                }
            } else {
                u.currentPath = null;
            }
        }

        const a = Math.atan2(moveTargetY - u.y, moveTargetX - u.x);

        // Gate blocking: enemy units stop and attack closed gates in their path
        if (u.isEnemy) {
            const stepX = u.x + Math.cos(a) * TILE * 1.5;
            const stepY = u.y + Math.sin(a) * TILE * 1.5;
            const checkTx = Math.floor(stepX / TILE);
            const checkTy = Math.floor((stepY - MAP_OY) / TILE);
            const gate = this.scene.constructs.find(b =>
                b.type === 'gate' && b.built && !b.isOpen && !b.faction &&
                checkTx >= b.tx && checkTx <= b.tx + (b.width ?? 1) - 1 &&
                checkTy >= b.ty && checkTy <= b.ty + (b.width ?? 1) - 1);
            if (gate) {
                u._gateAttackTimer = (u._gateAttackTimer ?? 0) + dt;
                if (u._gateAttackTimer >= 1.2) {
                    u._gateAttackTimer = 0;
                    gate.hp = (gate.hp ?? gate.maxHp) - 2;
                    this.scene.redrawConstructBar(gate);
                    this.scene.uiManager.showFloatText(
                        (gate.tx + 0.5) * TILE, MAP_OY + gate.ty * TILE - 8, '-2', '#ff4444');
                    if (gate.hp <= 0) this._destroyConstruct(gate);
                }
                return true; // blocked — don't move
            }
        }

        const tileX = Math.floor(u.x / TILE), tileY = Math.floor((u.y - MAP_OY) / TILE);
        const spd = this.scene.mapManager.tileSpd(tileX, tileY);

        let onionMult = 1.0;
        if (!u.isEnemy && u.type === 'worker') {
            const nearOnion = this.scene.constructs.some(b => b.type === 'garden' && b.built && b.cropType === 'onions'
                && Phaser.Math.Distance.Between(u.x, u.y, (b.tx+b.width/2)*TILE, MAP_OY+(b.ty+b.width/2)*TILE) < 5 * TILE);
            if (nearOnion) onionMult = 1.25;
            if (this.scene.foodPressure) onionMult *= 0.7;
            // Hunger slows movement. Starving workers (food=0) move at 60% speed.
            onionMult *= 0.6 + (u.needs?.food ?? 1.0) * 0.4;
        }

        u.x += Math.cos(a) * u.speed * spd * onionMult * dt;
        u.y += Math.sin(a) * u.speed * spd * onionMult * dt;

        // Accumulate foot traffic; create desire path when threshold reached
        if (!u.isEnemy && tileX >= 0 && tileX < MAP_W && tileY >= 0 && tileY < MAP_H) {
            const tm = this.scene.trafficMap;
            tm[tileY][tileX] = (tm[tileY][tileX] ?? 0) + 1;
            if (tm[tileY][tileX] >= DESIRE_THRESHOLD &&
                (this.scene.roadMap[tileY][tileX] ?? ROAD_NONE) === ROAD_NONE) {
                this.scene.roadMap[tileY][tileX] = ROAD_DESIRE;
                this.scene.mapManager.drawDesirePath(tileX, tileY);
            }
        }

        return true;
    },

    _constructDoor(b) {
        return {
            x: (b.tx + b.width / 2) * TILE,
            y: MAP_OY + (b.ty + b.width) * TILE - 4,
        };
    },

    _destroyConstruct(b) {
        this.scene.uiManager.showFloatText(
            (b.tx + b.width / 2) * TILE, MAP_OY + b.ty * TILE - 8,
            `${CONSTRUCTS[b.type]?.label ?? b.type} destroyed!`, '#ff4422');
        this.scene.constructManager.demolishConstruct(b);
    },

    _nearestPlayerConstruct(x, y) {
        let best = null, bd = Infinity;
        for (const b of this.scene.constructs) {
            if (b.faction || !b.built) continue;
            const bx = (b.tx + b.width / 2) * TILE;
            const by = MAP_OY + (b.ty + b.width / 2) * TILE;
            const d = Phaser.Math.Distance.Between(x, y, bx, by);
            if (d < bd) { bd = d; best = b; }
        }
        return best;
    },

    getEnemyVillageCenter() {
        const th = this.scene.constructs.find(b => b.faction === 'enemy' && b.type === 'townhall' && b.built);
        if (th) return { x: (th.tx + 1) * TILE, y: MAP_OY + (th.ty + 1) * TILE };
        return { x: MAP_W / 2 * TILE, y: MAP_OY + 7 * TILE };
    },

    totalCarrying(u) {
        return Object.values(u.carrying).reduce((a, b) => a + (b || 0), 0);
    },

    getUnitCarryWeight(u) {
        let total = 0;
        for (const [res, qty] of Object.entries(u.carrying || {})) {
            total += qty * (ITEMS[res]?.weight ?? 0);
        }
        return total;
    },

    getUnitCarryVolume(u) {
        let total = 0;
        for (const [res, qty] of Object.entries(u.carrying || {})) {
            total += qty * (ITEMS[res]?.volume ?? 0);
        }
        return total;
    },

    getUnitMaxWeight(u) {
        const base = 20 + (u.attributes?.str ?? 5) * 5;
        const mult = u.equipment === 'backpack' ? 1.5 : u.equipment === 'wheelbarrow' ? 3.0 : 1.0;
        const cap  = u.equipment === 'backpack' ? 60 : u.equipment === 'wheelbarrow' ? 150 : Infinity;
        return Math.min(base * mult, cap);
    },

    getUnitMaxVolume(u) {
        const base = 10 + (u.attributes?.str ?? 5) * 2;
        const mult = u.equipment === 'backpack' ? 1.5 : u.equipment === 'wheelbarrow' ? 3.0 : 1.0;
        const cap  = u.equipment === 'backpack' ? 30 : u.equipment === 'wheelbarrow' ? 80 : Infinity;
        return Math.min(base * mult, cap);
    },

    canUnitCarryMore(u, res, qty = 1) {
        const w = (ITEMS[res]?.weight ?? 0) * qty;
        const v = (ITEMS[res]?.volume ?? 0) * qty;
        return (this.getUnitCarryWeight(u) + w <= this.getUnitMaxWeight(u)) &&
               (this.getUnitCarryVolume(u) + v <= this.getUnitMaxVolume(u));
    },

    waveIntelFlash() {
        this.scene.uiManager.showPhaseMessage("Scout killed!", 0x44ff88);
    },
};
