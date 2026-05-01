import {
    TILE, MAP_OY, MAP_W, MAP_H, MAP_BOTTOM,
    T_GRASS, T_SAND, T_FOREST
} from '../config/gameConstants.js';
import { ANIMALS } from '../content/animals/index.js';

export default class NatureManager {
    constructor(scene) {
        this.scene = scene;
    }

    spawnDeer(x, y, gender = null) {
        const def = ANIMALS.deer;
        if (!gender) gender = Math.random() < 0.5 ? 'male' : 'female';
        const d = {
            id: this.scene.getId(), x, y, gender,
            hp: 2, isDead: false, meatLeft: def.meat, hideLeft: def.hide,
            speed: def.speed + Phaser.Math.Between(-5, 5),
            wanderTimer: Phaser.Math.Between(2000, 5000),
            ateToday: 3, hungryDays: 0,
            gfx: this.scene._w(this.scene.add.graphics().setDepth(5)),
        };
        this.redrawDeer(d);
        this.scene.deer.push(d);
        return d;
    }

    redrawDeer(d) {
        const g = d.gfx;
        g.clear().setPosition(d.x, d.y);
        ANIMALS.deer.draw(g, d);
    }

    spawnSheep(x, y, gender = null) {
        if (!gender) gender = Math.random() < 0.5 ? 'male' : 'female';
        const s = {
            id: this.scene.getId(), x, y, gender,
            hp: 2, isDead: false, isTamed: false, followUnit: null,
            woolReady: true, woolTimer: 0,
            ateToday: 3, hungryDays: 0,
            gfx: this.scene._w(this.scene.add.graphics().setDepth(5)),
        };
        this.redrawSheep(s);
        this.scene.sheep.push(s);
        return s;
    }

    redrawSheep(s) {
        const g = s.gfx;
        g.clear().setPosition(s.x, s.y);
        ANIMALS.sheep.draw(g, s);
    }

    tick(delta, dt) {
        this.tickDeer(delta, dt);
        this.tickSheep(delta, dt);
        this.tickSpawning(delta);
    }

    tickDeer(delta, dt) {
        const friendlies = this.scene.units.filter(u => !u.isEnemy && u.hp > 0);
        for (const d of this.scene.deer) {
            if (d.isDead) continue;
            const fleeRadius = d.fleeR ?? ANIMALS.deer.fleeRadius;
            let fleeFrom = null, fleeD = fleeRadius;
            for (const u of friendlies) {
                const dist = Phaser.Math.Distance.Between(d.x, d.y, u.x, u.y);
                if (dist < fleeD) { fleeD = dist; fleeFrom = u; }
            }

            if (fleeFrom) {
                const angle = Math.atan2(d.y - fleeFrom.y, d.x - fleeFrom.x);
                const nx = d.x + Math.cos(angle) * d.speed * dt;
                const ny = d.y + Math.sin(angle) * d.speed * dt;
                if (!this.scene.tileAt(nx, ny) || this.scene.tileAt(nx, ny).type === 4) {
                    const nx2 = d.x + Math.cos(angle + Math.PI / 2) * d.speed * dt;
                    const ny2 = d.y + Math.sin(angle + Math.PI / 2) * d.speed * dt;
                    if (this.scene.tileAt(nx2, ny2) && this.scene.tileAt(nx2, ny2).type !== 4) { d.x = nx2; d.y = ny2; }
                } else { d.x = nx; d.y = ny; }
                d.moveTo = null; d.wanderTimer = 0;
            } else {
                // Grazing/Wander logic simplified for now
                d.wanderTimer -= delta;
                if (!d.moveTo || d.wanderTimer <= 0) {
                    const angle = Math.random() * Math.PI * 2;
                    const dist = Phaser.Math.Between(TILE * 2, TILE * 6);
                    d.moveTo = { x: Phaser.Math.Clamp(d.x + Math.cos(angle) * dist, TILE, MAP_W * TILE - TILE),
                                 y: Phaser.Math.Clamp(d.y + Math.sin(angle) * dist, MAP_OY + TILE, MAP_BOTTOM - TILE) };
                    d.wanderTimer = Phaser.Math.Between(3000, 6000);
                }
                if (d.moveTo) {
                    const dist = Phaser.Math.Distance.Between(d.x, d.y, d.moveTo.x, d.moveTo.y);
                    if (dist < 8) d.moveTo = null;
                    else {
                        const a = Math.atan2(d.moveTo.y - d.y, d.moveTo.x - d.x);
                        d.x += Math.cos(a) * d.speed * 0.4 * dt;
                        d.y += Math.sin(a) * d.speed * 0.4 * dt;
                    }
                }
            }
            d.x = Phaser.Math.Clamp(d.x, TILE, MAP_W * TILE - TILE);
            d.y = Phaser.Math.Clamp(d.y, MAP_OY + TILE, MAP_BOTTOM - TILE);
            d.gfx.setPosition(d.x, d.y);
        }
    }

    tickSheep(delta, dt) {
        const friendlies = this.scene.units.filter(u => !u.isEnemy && u.hp > 0);
        for (const s of this.scene.sheep) {
            if (s.isTamed && s.followUnit !== null) {
                const leader = this.scene.units.find(u => u.id === s.followUnit && u.hp > 0);
                if (!leader) { s.followUnit = null; s.isTamed = false; this.redrawSheep(s); continue; }
                const dd = Phaser.Math.Distance.Between(s.x, s.y, leader.x, leader.y);
                if (dd > 24) {
                    const a = Math.atan2(leader.y - s.y, leader.x - s.x);
                    s.x += Math.cos(a) * ANIMALS.sheep.speed * dt;
                    s.y += Math.sin(a) * ANIMALS.sheep.speed * dt;
                    s.gfx.setPosition(s.x, s.y);
                }
                continue;
            }

            if (!s.isTamed && !s.woolReady) {
                s.woolTimer = (s.woolTimer ?? 0) + delta;
                if (s.woolTimer >= ANIMALS.sheep.woolMs) { s.woolReady = true; s.woolTimer = 0; this.redrawSheep(s); }
            }

            // Simple flee and wander for sheep
            let fleeFrom = null, fleeD = ANIMALS.sheep.fleeRadius;
            for (const u of friendlies) {
                if (u.role === 'shepherd' && u.targetSheep === s.id) continue;
                const d = Phaser.Math.Distance.Between(s.x, s.y, u.x, u.y);
                if (d < fleeD) { fleeD = d; fleeFrom = u; }
            }
            if (fleeFrom) {
                const angle = Math.atan2(s.y - fleeFrom.y, s.x - fleeFrom.x);
                s.x += Math.cos(angle) * ANIMALS.sheep.speed * dt;
                s.y += Math.sin(angle) * ANIMALS.sheep.speed * dt;
            }
            s.x = Phaser.Math.Clamp(s.x, TILE, MAP_W * TILE - TILE);
            s.y = Phaser.Math.Clamp(s.y, MAP_OY + TILE, MAP_BOTTOM - TILE);
            s.gfx.setPosition(s.x, s.y);
        }
    }

    tickSpawning(delta) {
        this.scene._edgeEntryTimer = (this.scene._edgeEntryTimer || 0) + delta;
        if (this.scene._edgeEntryTimer >= 10000) {
            this.scene._edgeEntryTimer = 0;
            if (this.scene.deer.filter(d => !d.isDead).length < ANIMALS.deer.maxCount) {
                this.spawnDeerAtEdge();
            }
            if (this.scene.sheep.length < ANIMALS.sheep.maxCount) {
                this.spawnSheepAtEdge();
            }
        }
    }

    spawnDeerAtEdge() {
        const side = Math.floor(Math.random() * 4);
        let x, y;
        if (side === 0) { x = Phaser.Math.Between(TILE, MAP_W*TILE-TILE); y = MAP_OY + TILE; }
        else if (side === 1) { x = Phaser.Math.Between(TILE, MAP_W*TILE-TILE); y = MAP_BOTTOM - TILE; }
        else if (side === 2) { x = TILE; y = Phaser.Math.Between(MAP_OY + TILE, MAP_BOTTOM - TILE); }
        else { x = MAP_W*TILE - TILE; y = Phaser.Math.Between(MAP_OY + TILE, MAP_BOTTOM - TILE); }
        this.spawnDeer(x, y);
    }

    spawnSheepAtEdge() {
        const side = Math.floor(Math.random() * 4);
        let x, y;
        if (side === 0) { x = Phaser.Math.Between(TILE, MAP_W*TILE-TILE); y = MAP_OY + TILE; }
        else if (side === 1) { x = Phaser.Math.Between(TILE, MAP_W*TILE-TILE); y = MAP_BOTTOM - TILE; }
        else if (side === 2) { x = TILE; y = Phaser.Math.Between(MAP_OY + TILE, MAP_BOTTOM - TILE); }
        else { x = MAP_W*TILE - TILE; y = Phaser.Math.Between(MAP_OY + TILE, MAP_BOTTOM - TILE); }
        this.spawnSheep(x, y);
    }

    slaughterSheep(b) {
        if ((b.males ?? 0) + (b.females ?? 0) < 1) return;
        if ((b.males ?? 0) > 0) b.males--;
        else b.females--;
        const meat = ANIMALS.sheep.meat;
        this.scene.economyManager.addResource('Food.Meat.Venison', meat);
        this.scene.uiManager.showFloatText((b.tx + b.size / 2) * TILE, MAP_OY + b.ty * TILE - 8,
            `+${meat} meat`, '#cc6633');
        this.scene.updateUI();
    }

    findDeerAt(wx, wy, radius = 20) {
        return this.scene.deer.find(d => {
            const tx = Math.floor(d.x/TILE), ty = Math.floor((d.y-MAP_OY)/TILE);
            return (this.scene.visMap[ty]?.[tx] ?? 0) >= 1
                && Phaser.Math.Distance.Between(wx, wy, d.x, d.y) < radius;
        });
    }

    findSheepAt(wx, wy, radius = 22) {
        return this.scene.sheep.find(s => {
            const tx = Math.floor(s.x/TILE), ty = Math.floor((s.y-MAP_OY)/TILE);
            return (this.scene.visMap[ty]?.[tx] ?? 0) >= 1
                && Phaser.Math.Distance.Between(wx, wy, s.x, s.y) < radius;
        });
    }
}
