import {
    TILE, MAP_OY,
    T_GRASS, T_SAND, T_FOREST
} from '../config/gameConstants.js';

// Animals roam freely — use large world bounds (1024 tiles = 32768px)
const NATURE_WORLD_W = 1024;
const NATURE_WORLD_H = 1024;
const NATURE_BOTTOM  = MAP_OY + NATURE_WORLD_H * TILE;
import { ANIMALS } from '../content/animals/index.js';

export default class NatureManager {
    constructor(scene) {
        this.scene = scene;
        this.critters = [];   // demo rig-animated creatures (opt-in, spawned with K)
    }

    // ── Critter (rig-animated demo creature) ────────────────────────────────────
    spawnCritter(x, y) {
        const c = {
            id: this.scene.getId(), x, y,
            _walkPhase: 0, moving: false, facing: 'south',
            _dir: Math.random() * Math.PI * 2, _go: true,
            wanderTimer: Phaser.Math.Between(1500, 4000),
            gfx: this.scene._w(this.scene.add.graphics().setDepth(5)),
        };
        this.critters.push(c);
        this.redrawCritter(c);
        return c;
    }

    redrawCritter(c) {
        const g = c.gfx;
        g.clear().setPosition(c.x, c.y);
        ANIMALS.critter.draw(g, c, { moving: c.moving });
    }

    tickCritter(delta, dt) {
        const sp = ANIMALS.critter.speed;
        for (const c of this.critters) {
            c.wanderTimer -= delta;
            if (c.wanderTimer <= 0) {
                c.wanderTimer = Phaser.Math.Between(1500, 4000);
                c._dir = Math.random() * Math.PI * 2;
                c._go = Math.random() < 0.7;
            }
            if (c._go) {
                c.x += Math.cos(c._dir) * sp * dt;
                c.y += Math.sin(c._dir) * sp * dt;
                c.facing = Math.cos(c._dir) >= 0 ? 'east' : 'west';
                c.moving = true;
            } else {
                c.moving = false;
            }
            c._walkPhase += c.moving ? 0.22 : 0.05;
            this.redrawCritter(c);   // rig animation needs a per-frame redraw
        }
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
        ANIMALS.deer.draw(g, d, { moving: d.moving ?? false });
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
        this.tickCritter(delta, dt);
        this.tickSpawning(delta);
        this.tickBreeding(delta);
    }

    // Colony centre (townhall → first camp → spawn) — tamed sheep without a pasture mill here.
    _colonyCenter() {
        const cm = this.scene.constructManager;
        const civic = cm?.constructs?.find(b => b.built && !b.faction && (b.type === 'townhall' || b.type === 'camp'));
        if (civic) return { x: (civic.tx + (civic.width ?? 1) / 2) * TILE, y: MAP_OY + (civic.ty + (civic.height ?? 1) / 2) * TILE };
        return { x: (this.scene.spawnTx ?? 0) * TILE, y: MAP_OY + (this.scene.spawnTy ?? 0) * TILE };
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
                    d.moveTo = { x: Phaser.Math.Clamp(d.x + Math.cos(angle) * dist, TILE, NATURE_WORLD_W * TILE - TILE),
                                 y: Phaser.Math.Clamp(d.y + Math.sin(angle) * dist, MAP_OY + TILE, NATURE_BOTTOM - TILE) };
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
            d.x = Phaser.Math.Clamp(d.x, TILE, NATURE_WORLD_W * TILE - TILE);
            d.y = Phaser.Math.Clamp(d.y, MAP_OY + TILE, NATURE_BOTTOM - TILE);

            // Facing + gait from motion (drives the directional rig + leg swing).
            const mdx = d.x - (d._px ?? d.x), mdy = d.y - (d._py ?? d.y);
            d._px = d.x; d._py = d.y;
            const moving = (mdx * mdx + mdy * mdy) > 0.02;
            if (moving) {
                d._walkPhase = (d._walkPhase ?? 0) + 0.16;
                if (Math.abs(mdx) > Math.abs(mdy)) d.facing = mdx >= 0 ? 'east' : 'west';
                else                                d.facing = mdy >= 0 ? 'south' : 'north';
            } else {
                d._walkPhase = (d._walkPhase ?? 0) * 0.8;
            }
            d.moving = moving;
            this.redrawDeer(d);   // per-frame redraw so the rig animates
        }
    }

    tickSheep(delta, dt) {
        const friendlies = this.scene.units.filter(u => !u.isEnemy && u.hp > 0);
        const cc = this._colonyCenter();
        for (const s of this.scene.sheep) {
            if (s.isDead) continue;

            // Wool regrows on wild sheep (autonomous shepherds shear them)
            if (!s.isTamed && !s.woolReady) {
                s.woolTimer = (s.woolTimer ?? 0) + delta;
                if (s.woolTimer >= ANIMALS.sheep.woolMs) { s.woolReady = true; s.woolTimer = 0; this.redrawSheep(s); }
            }

            // ── Tamed sheep: follow a leading shepherd, else graze (pasture or colony). Never
            //    flees, never reverts to wild — losing a leader just drops it into grazing. (#26)
            if (s.isTamed) {
                if (s.followUnit != null) {
                    const leader = friendlies.find(u => u.id === s.followUnit);
                    if (leader) {
                        if (Phaser.Math.Distance.Between(s.x, s.y, leader.x, leader.y) > 24) {
                            const a = Math.atan2(leader.y - s.y, leader.x - s.x);
                            s.x += Math.cos(a) * ANIMALS.sheep.speed * dt;
                            s.y += Math.sin(a) * ANIMALS.sheep.speed * dt;
                        }
                        s.gfx.setPosition(s.x, s.y);
                        continue;
                    }
                    s.followUnit = null;   // leader gone — stay tamed and graze
                }
                this._grazeTamed(s, delta, dt, cc);
                s.x = Phaser.Math.Clamp(s.x, TILE, NATURE_WORLD_W * TILE - TILE);
                s.y = Phaser.Math.Clamp(s.y, MAP_OY + TILE, NATURE_BOTTOM - TILE);
                s.gfx.setPosition(s.x, s.y);
                continue;
            }

            // ── Wild sheep: flee from people, otherwise wander ──
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
                s.moveTo = null; s.wanderTimer = 0;
            } else {
                this._wander(s, delta, dt, ANIMALS.sheep.speed * 0.3);
            }
            s.x = Phaser.Math.Clamp(s.x, TILE, NATURE_WORLD_W * TILE - TILE);
            s.y = Phaser.Math.Clamp(s.y, MAP_OY + TILE, NATURE_BOTTOM - TILE);
            s.gfx.setPosition(s.x, s.y);
        }
    }

    // Tamed-sheep grazing: roam the assigned pasture zone if it still exists, else mill within a
    // few tiles of the colony centre.
    _grazeTamed(s, delta, dt, cc) {
        const zm = this.scene.zoneManager;
        let anchor = cc, radius = TILE * 5;
        if (s.pastureZoneId != null && zm?.pastureTiles?.has(s.pastureZoneId)) {
            const myZone = zm.getPastureZones().find(z => z.some(t => t.key === s.pastureZoneId));
            if (myZone) {
                s.wanderTimer = (s.wanderTimer ?? 0) - delta;
                if (!s.moveTo || s.wanderTimer <= 0) {
                    const t = myZone[Math.floor(Math.random() * myZone.length)];
                    s.moveTo = { x: t.tx * TILE + TILE / 2 + Phaser.Math.Between(-8, 8),
                                 y: MAP_OY + t.ty * TILE + TILE / 2 + Phaser.Math.Between(-8, 8) };
                    s.wanderTimer = Phaser.Math.Between(3000, 7000);
                }
                this._stepToward(s, ANIMALS.sheep.speed * 0.3, dt);
                return;
            }
            s.pastureZoneId = null;   // pasture removed
        }
        // No pasture: wander near the colony centre.
        s.wanderTimer = (s.wanderTimer ?? 0) - delta;
        if (!s.moveTo || s.wanderTimer <= 0) {
            const ang = Math.random() * Math.PI * 2, r = Phaser.Math.Between(0, radius);
            s.moveTo = { x: anchor.x + Math.cos(ang) * r, y: anchor.y + Math.sin(ang) * r };
            s.wanderTimer = Phaser.Math.Between(3000, 7000);
        }
        this._stepToward(s, ANIMALS.sheep.speed * 0.3, dt);
    }

    // Generic random wander (wild animals).
    _wander(s, delta, dt, speed) {
        s.wanderTimer = (s.wanderTimer ?? 0) - delta;
        if (!s.moveTo || s.wanderTimer <= 0) {
            const angle = Math.random() * Math.PI * 2;
            const dist  = Phaser.Math.Between(TILE * 1, TILE * 3);
            s.moveTo = { x: Phaser.Math.Clamp(s.x + Math.cos(angle) * dist, TILE, NATURE_WORLD_W * TILE - TILE),
                         y: Phaser.Math.Clamp(s.y + Math.sin(angle) * dist, MAP_OY + TILE, NATURE_BOTTOM - TILE) };
            s.wanderTimer = Phaser.Math.Between(4000, 8000);
        }
        this._stepToward(s, speed, dt);
    }

    _stepToward(s, speed, dt) {
        if (!s.moveTo) return;
        const dist = Phaser.Math.Distance.Between(s.x, s.y, s.moveTo.x, s.moveTo.y);
        if (dist < 4) { s.moveTo = null; return; }
        const a = Math.atan2(s.moveTo.y - s.y, s.moveTo.x - s.x);
        s.x += Math.cos(a) * speed * dt;
        s.y += Math.sin(a) * speed * dt;
    }

    // Edge entry is now only an extinction safety-net: if a wild species is nearly wiped out,
    // a fresh animal wanders in from the map edge. Sustained growth comes from breeding below.
    tickSpawning(delta) {
        this.scene._edgeEntryTimer = (this.scene._edgeEntryTimer || 0) + delta;
        if (this.scene._edgeEntryTimer < 12000) return;
        this.scene._edgeEntryTimer = 0;
        const wildDeer  = this.scene.deer.filter(d => !d.isDead).length;
        const wildSheep = this.scene.sheep.filter(s => !s.isDead && !s.isTamed).length;
        if (wildDeer  < 2) this.spawnDeerAtEdge();
        if (wildSheep < 2) this.spawnSheepAtEdge();
    }

    // Wild reproduction: a male & female of a species near each other occasionally produce
    // offspring, up to the species cap. Tamed sheep breed too (domestic flocks can grow larger),
    // their lambs born tame in the same pasture. (#16)
    tickBreeding(delta) {
        this._breedTimer = (this._breedTimer ?? 0) + delta;
        if (this._breedTimer < 12000) return;
        this._breedTimer = 0;
        this._breedSpecies(this.scene.deer.filter(d => !d.isDead), ANIMALS.deer, ANIMALS.deer.maxCount,
            (x, y) => this.spawnDeer(x, y), false);
        this._breedSpecies(this.scene.sheep.filter(s => !s.isDead && !s.isTamed), ANIMALS.sheep, ANIMALS.sheep.maxCount,
            (x, y) => this.spawnSheep(x, y), false);
        this._breedSpecies(this.scene.sheep.filter(s => !s.isDead && s.isTamed), ANIMALS.sheep, ANIMALS.sheep.maxCount * 2,
            (x, y) => this.spawnSheep(x, y), true);
    }

    _breedSpecies(herd, def, cap, spawnFn, tamed) {
        if (herd.length < 2 || herd.length >= cap) return;
        const males   = herd.filter(a => a.gender === 'male');
        const females = herd.filter(a => a.gender === 'female');
        if (!males.length || !females.length) return;
        const R = def.breedRadius ?? 4 * TILE;
        for (const f of females) {
            const mate = males.find(m => Phaser.Math.Distance.Between(m.x, m.y, f.x, f.y) < R);
            if (!mate || Math.random() > 0.5) continue;
            const bx = f.x + Phaser.Math.Between(-TILE, TILE);
            const by = f.y + Phaser.Math.Between(-TILE, TILE);
            const baby = spawnFn(Phaser.Math.Clamp(bx, TILE, NATURE_WORLD_W * TILE - TILE),
                                 Phaser.Math.Clamp(by, MAP_OY + TILE, NATURE_BOTTOM - TILE));
            if (baby && tamed) { baby.isTamed = true; baby.pastureZoneId = f.pastureZoneId ?? null; this.redrawSheep(baby); }
            this.scene.uiManager?.showFloatText?.(baby.x, baby.y - 14,
                tamed ? '🐑 lamb born' : (def === ANIMALS.deer ? '🦌 fawn born' : '🐑 lamb born'), '#cfeac0');
            return;   // one birth per breed window per species
        }
    }

    // Seed a starting wildlife population scattered across the discovered area (called once on a
    // fresh game so the world isn't empty until edge-entry trickles animals in). (#17)
    seedInitialWildlife() {
        const cm = this.scene.chunkManager;
        const cx = this.scene.spawnTx ?? 0, cy = this.scene.spawnTy ?? 0;
        const place = (spawnFn, n) => {
            let made = 0, tries = 0;
            while (made < n && tries < n * 12) {
                tries++;
                const tx = cx + Phaser.Math.Between(-36, 36);
                const ty = cy + Phaser.Math.Between(-36, 36);
                if (tx < 1 || ty < 1) continue;
                const terr = cm ? cm.getTile(tx, ty) : 0;
                if (terr === T_FOREST || terr === T_GRASS || terr === T_SAND) {
                    spawnFn(tx * TILE + TILE / 2, MAP_OY + ty * TILE + TILE / 2);
                    made++;
                }
            }
        };
        place((x, y) => this.spawnDeer(x, y),  ANIMALS.deer.maxCount);
        place((x, y) => this.spawnSheep(x, y), Math.ceil(ANIMALS.sheep.maxCount * 0.7));
    }

    spawnDeerAtEdge() {
        const side = Math.floor(Math.random() * 4);
        let x, y;
        if (side === 0) { x = Phaser.Math.Between(TILE, NATURE_WORLD_W*TILE-TILE); y = MAP_OY + TILE; }
        else if (side === 1) { x = Phaser.Math.Between(TILE, NATURE_WORLD_W*TILE-TILE); y = NATURE_BOTTOM - TILE; }
        else if (side === 2) { x = TILE; y = Phaser.Math.Between(MAP_OY + TILE, NATURE_BOTTOM - TILE); }
        else { x = NATURE_WORLD_W*TILE - TILE; y = Phaser.Math.Between(MAP_OY + TILE, NATURE_BOTTOM - TILE); }
        this.spawnDeer(x, y);
    }

    spawnSheepAtEdge() {
        const side = Math.floor(Math.random() * 4);
        let x, y;
        if (side === 0) { x = Phaser.Math.Between(TILE, NATURE_WORLD_W*TILE-TILE); y = MAP_OY + TILE; }
        else if (side === 1) { x = Phaser.Math.Between(TILE, NATURE_WORLD_W*TILE-TILE); y = NATURE_BOTTOM - TILE; }
        else if (side === 2) { x = TILE; y = Phaser.Math.Between(MAP_OY + TILE, NATURE_BOTTOM - TILE); }
        else { x = NATURE_WORLD_W*TILE - TILE; y = Phaser.Math.Between(MAP_OY + TILE, NATURE_BOTTOM - TILE); }
        this.spawnSheep(x, y);
    }

    slaughterSheep(b) {
        if ((b.males ?? 0) + (b.females ?? 0) < 1) return;
        if ((b.males ?? 0) > 0) b.males--;
        else b.females--;
        const meat = ANIMALS.sheep.meat;
        this.scene.economyManager.addResource('Food.Meat.Venison', meat);
        this.scene.uiManager.showFloatText((b.tx + b.width / 2) * TILE, MAP_OY + b.ty * TILE - 8,
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
