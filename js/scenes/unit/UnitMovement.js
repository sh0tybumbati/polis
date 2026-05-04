import {
    TILE, MAP_OY, MAP_W, MAP_H,
    TILE_SPD, DESIRE_THRESHOLD, ROAD_DESIRE, ROAD_NONE,
    BLDG,
} from '../../config/gameConstants.js';
import { ITEMS } from '../../content/items/index.js';

export default {
    moveToward(u, tx, ty, threshold, dt) {
        const d = Phaser.Math.Distance.Between(u.x, u.y, tx, ty);
        if (d <= threshold) return false;
        const a = Math.atan2(ty - u.y, tx - u.x);

        // Gate blocking: enemy units stop and attack closed gates in their path
        if (u.isEnemy) {
            const stepX = u.x + Math.cos(a) * TILE * 1.5;
            const stepY = u.y + Math.sin(a) * TILE * 1.5;
            const checkTx = Math.floor(stepX / TILE);
            const checkTy = Math.floor((stepY - MAP_OY) / TILE);
            const gate = this.scene.buildings.find(b =>
                b.type === 'gate' && b.built && !b.isOpen && !b.faction &&
                checkTx >= b.tx && checkTx <= b.tx + (b.size ?? 1) - 1 &&
                checkTy >= b.ty && checkTy <= b.ty + (b.size ?? 1) - 1);
            if (gate) {
                u._gateAttackTimer = (u._gateAttackTimer ?? 0) + dt;
                if (u._gateAttackTimer >= 1.2) {
                    u._gateAttackTimer = 0;
                    gate.hp = (gate.hp ?? gate.maxHp) - 2;
                    this.scene.redrawBuildingBar(gate);
                    this.scene.uiManager.showFloatText(
                        (gate.tx + 0.5) * TILE, MAP_OY + gate.ty * TILE - 8, '-2', '#ff4444');
                    if (gate.hp <= 0) this._destroyBuilding(gate);
                }
                return true; // blocked — don't move
            }
        }

        const tileX = Math.floor(u.x / TILE), tileY = Math.floor((u.y - MAP_OY) / TILE);
        const spd = this.scene.mapManager.tileSpd(tileX, tileY);

        let onionMult = 1.0;
        if (!u.isEnemy && u.type === 'worker') {
            const nearOnion = this.scene.buildings.some(b => b.type === 'garden' && b.built && b.cropType === 'onions'
                && Phaser.Math.Distance.Between(u.x, u.y, (b.tx+b.size/2)*TILE, MAP_OY+(b.ty+b.size/2)*TILE) < 5 * TILE);
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

    _bldgDoor(b) {
        return {
            x: (b.tx + b.size / 2) * TILE,
            y: MAP_OY + (b.ty + b.size) * TILE - 4,
        };
    },

    _destroyBuilding(b) {
        this.scene.uiManager.showFloatText(
            (b.tx + b.size / 2) * TILE, MAP_OY + b.ty * TILE - 8,
            `${BLDG[b.type]?.label ?? b.type} destroyed!`, '#ff4422');
        this.scene.buildingManager.demolishBuilding(b);
    },

    _nearestPlayerBuilding(x, y) {
        let best = null, bd = Infinity;
        for (const b of this.scene.buildings) {
            if (b.faction || !b.built) continue;
            const bx = (b.tx + b.size / 2) * TILE;
            const by = MAP_OY + (b.ty + b.size / 2) * TILE;
            const d = Phaser.Math.Distance.Between(x, y, bx, by);
            if (d < bd) { bd = d; best = b; }
        }
        return best;
    },

    getEnemyVillageCenter() {
        const th = this.scene.buildings.find(b => b.faction === 'enemy' && b.type === 'townhall' && b.built);
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
