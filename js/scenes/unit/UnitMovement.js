import {
    TILE, MAP_OY,
    TILE_SPD, DESIRE_THRESHOLD, TROD_THRESHOLD, ROAD_DESIRE, ROAD_TRODDEN, ROAD_NONE,
} from '../../config/gameConstants.js';
import { CONSTRUCTS } from '../../content/constructs/index.js';
import { ITEMS } from '../../content/items/index.js';

export default {
    moveToward(u, tx, ty, threshold, dt) {
        u._mtCalled = true;   // flag for tickWorker's stuck-recovery (reset each worker tick)
        const d = Phaser.Math.Distance.Between(u.x, u.y, tx, ty);
        if (d <= threshold) {
            u.currentPath = null;
            u._reachFailT = 0; u._rfTarget = null;
            return false;
        }

        // Destination tile blocked (e.g. a construct footprint): the unit can never reach
        // `threshold` px of its centre. Once it's standing on an adjacent tile it's as close
        // as it can get, so count that as arrival — otherwise it grinds against the wall and
        // the stuck-nudge below teleport-jitters it on the bordering tile.
        const _tgtTx = Math.floor(tx / TILE), _tgtTy = Math.floor((ty - MAP_OY) / TILE);
        const _curTx = Math.floor(u.x / TILE), _curTy = Math.floor((u.y - MAP_OY) / TILE);
        if (Math.abs(_curTx - _tgtTx) <= 1 && Math.abs(_curTy - _tgtTy) <= 1 &&
            this.scene.mapManager.isTileBlocked(tx, ty)) {
            u.currentPath = null;
            u._reachFailT = 0; u._rfTarget = null;
            return false;
        }

        // Reach-failure tracker: accumulate time (s) the unit fails to get meaningfully
        // closer to *this* target. tickWorker abandons goals that stall here — no handler
        // has its own "can't reach" timeout, so otherwise the unit latches on forever.
        const _tt = `${_tgtTx},${_tgtTy}`;
        if (u._rfTarget !== _tt) { u._rfTarget = _tt; u._reachFailT = 0; u._rfDist = d; u._rfAcc = 0; }
        u._rfAcc = (u._rfAcc ?? 0) + dt;
        if (u._rfAcc >= 1.0) {
            if (d < (u._rfDist ?? Infinity) - 3) u._reachFailT = 0;                 // got closer
            else u._reachFailT = (u._reachFailT ?? 0) + u._rfAcc;                   // stalled
            u._rfDist = d; u._rfAcc = 0;
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
        if (!u.isEnemy) {
            const tKey = `${tileX},${tileY}`;
            const tm = this.scene._trafficMap ?? (this.scene._trafficMap = new Map());
            const count = (tm.get(tKey) ?? 0) + 1;
            tm.set(tKey, count);
            const cur = this.scene.roadMap.get(tKey) ?? ROAD_NONE;
            if (cur === ROAD_NONE && count >= DESIRE_THRESHOLD) {
                this.scene.roadMap.set(tKey, ROAD_DESIRE);          // worn path appears
                this.scene.mapManager.drawDesirePath(tileX, tileY);
            } else if (cur === ROAD_DESIRE && count >= TROD_THRESHOLD) {
                this.scene.roadMap.set(tKey, ROAD_TRODDEN);          // hardens into a trodden road
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
        return { x: (this.scene.spawnTx ?? 0) * TILE, y: MAP_OY + 7 * TILE };
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
