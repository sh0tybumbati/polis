import {
    TILE, MAP_OY, MAP_W, MAP_H, MAP_BOTTOM,
    DEER_MAX, DEER_MEAT, DEER_HIDE, DEER_FLEE_R, DEER_SPEED,
    SHEEP_MAX, SHEEP_SPEED, SHEEP_FLEE_R, SHEEP_WOOL_MS, SHEEP_MEAT,
    T_GRASS, T_SAND, T_FOREST
} from '../config/gameConstants.js';

export default class NatureManager {
    constructor(scene) {
        this.scene = scene;
    }

    spawnDeer(x, y, gender = null) {
        if (!gender) gender = Math.random() < 0.5 ? 'male' : 'female';
        const d = {
            id: this.scene.getId(), x, y, gender,
            hp: 2, isDead: false, meatLeft: DEER_MEAT, hideLeft: DEER_HIDE,
            speed: DEER_SPEED + Phaser.Math.Between(-5, 5),
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
        if (d.isDead) {
            g.fillStyle(0x5a3010, 0.9).fillEllipse(0, 2, 26, 10);
            if (d.meatLeft > 0) {
                const r = d.meatLeft / DEER_MEAT;
                g.fillStyle(0x331010, 0.7).fillRect(-10, -5, 20, 4);
                g.fillStyle(0xdd3311, 0.9).fillRect(-10, -5, 20 * r, 4);
            }
        } else {
            const sc = d.scale ?? 1.0;
            const hungry = (d.hungryDays ?? 0) > 0;
            g.fillStyle(0x000000, 0.12).fillEllipse(0, 10, 22 * sc, 7 * sc);
            g.fillStyle(hungry ? 0x806020 : 0xb07030, hungry ? 0.5 : 1.0).fillEllipse(0, 0, 20 * sc, 13 * sc);
            g.fillStyle(0xb07030).fillCircle(11 * sc, -4 * sc, 6 * sc);
            if (d.gender === 'male') {
                g.lineStyle(1.5, 0x7a4010, 0.9);
                g.lineBetween(10 * sc, -9 * sc, 8 * sc, -16 * sc);
                g.lineBetween(13 * sc, -9 * sc, 15 * sc, -16 * sc);
            }
            g.fillStyle(0x8a5020).fillEllipse(14 * sc, -9 * sc, 4 * sc, 7 * sc);
            g.fillStyle(0x110800).fillCircle(13 * sc, -5 * sc, 1.5 * sc);
            g.lineStyle(2, 0x8a5020, 0.9);
            g.lineBetween(-6*sc, 5*sc, -7*sc, 14*sc);
            g.lineBetween(-2*sc, 6*sc, -3*sc, 15*sc);
            g.lineBetween( 4*sc, 5*sc,  3*sc, 14*sc);
            g.lineBetween( 8*sc, 4*sc,  9*sc, 13*sc);
        }
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
        const hungry = !s.isTamed && (s.hungryDays ?? 0) > 0;
        const col = hungry ? 0xb0a888
                  : s.isTamed ? 0xe8e0c0
                  : (s.woolReady === false) ? 0xb8a880
                  : 0xf0ece0;
        const bodyAlpha = hungry ? 0.5 : 1.0;
        g.fillStyle(0x000000, 0.10).fillEllipse(0, 10, 20, 6);
        g.fillStyle(col, bodyAlpha).fillCircle(-3, 0, 9);
        g.fillStyle(col, bodyAlpha).fillCircle(4,  1, 10);
        g.fillStyle(col, bodyAlpha).fillCircle(0, -4,  8);
        g.fillStyle(0xd0c4a0).fillCircle(12, -3, 5);
        g.fillStyle(0x221100).fillCircle(13, -4, 1.2);
        g.lineStyle(2, 0xb8a880, 0.9);
        g.lineBetween(-5, 7, -6, 14);
        g.lineBetween(-1, 8, -1, 15);
        g.lineBetween(4,  8,  4, 15);
        g.lineBetween(8,  7,  9, 14);
        if (s.isTamed) {
            g.fillStyle(0xcc4444, 0.85).fillRect(-2, -12, 10, 3);
        }
        if (s.gender) {
            g.fillStyle(s.gender === 'male' ? 0x6688cc : 0xdd88aa, 0.85).fillCircle(12, -9, 2);
        }
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
            const fleeRadius = d.fleeR ?? DEER_FLEE_R;
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
                    s.x += Math.cos(a) * SHEEP_SPEED * dt;
                    s.y += Math.sin(a) * SHEEP_SPEED * dt;
                    s.gfx.setPosition(s.x, s.y);
                }
                continue;
            }

            if (!s.isTamed && !s.woolReady) {
                s.woolTimer = (s.woolTimer ?? 0) + delta;
                if (s.woolTimer >= SHEEP_WOOL_MS) { s.woolReady = true; s.woolTimer = 0; this.redrawSheep(s); }
            }

            // Simple flee and wander for sheep
            let fleeFrom = null, fleeD = SHEEP_FLEE_R;
            for (const u of friendlies) {
                if (u.role === 'shepherd' && u.targetSheep === s.id) continue;
                const d = Phaser.Math.Distance.Between(s.x, s.y, u.x, u.y);
                if (d < fleeD) { fleeD = d; fleeFrom = u; }
            }
            if (fleeFrom) {
                const angle = Math.atan2(s.y - fleeFrom.y, s.x - fleeFrom.x);
                s.x += Math.cos(angle) * SHEEP_SPEED * dt;
                s.y += Math.sin(angle) * SHEEP_SPEED * dt;
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
            if (this.scene.deer.filter(d => !d.isDead).length < DEER_MAX) {
                this.spawnDeerAtEdge();
            }
            if (this.scene.sheep.length < SHEEP_MAX) {
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
        this.scene.economyManager.addResource('meat', SHEEP_MEAT);
        this.scene.uiManager.showFloatText((b.tx + b.size / 2) * TILE, MAP_OY + b.ty * TILE - 8,
            `+${SHEEP_MEAT} meat`, '#cc6633');
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
