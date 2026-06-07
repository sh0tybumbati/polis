import {
    TILE, MAP_OY,
    T_GRASS, T_SAND, T_FOREST
} from '../config/gameConstants.js';

// Animals roam freely — use large world bounds (1024 tiles = 32768px)
const NATURE_WORLD_W = 1024;
const NATURE_WORLD_H = 1024;
const NATURE_BOTTOM  = MAP_OY + NATURE_WORLD_H * TILE;
import { ANIMALS } from '../content/animals/index.js';
import { randomAnimalPheno, blendAnimalPheno } from '../content/genetics.js';

// ── Animal needs tuning ──────────────────────────────────────────────────────
// Food/rest are 0..1. Rates are per-second (multiplied by dt). Mirrors the unit
// needs model (UnitNeeds) but a touch slower so wildlife survives unattended.
const FOOD_DECAY   = 0.00060;   // hunger growth while awake
const REST_DECAY   = 0.00045;   // tiredness growth while awake
const REST_RECOVER = 0.0050;    // rest regained while sleeping
const STARVE_HP    = 0.25;      // hp lost per second when food is empty
const HUNGRY_SEEK  = 0.5;       // herbivore starts foraging below this
const HUNT_HUNGER  = 0.6;       // wolf starts hunting below this
const TIRED        = 0.20;      // forced sleep below this
const WAKE_REST    = 0.95;      // wakes once rest climbs back to here
const GRAZE_RANGE  = 1.2 * TILE;
const GRAZE_RATE   = 0.12;      // food gained per second while grazing brush

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
            id: this.scene.getId(), species: 'deer', x, y, gender,
            hp: 2, isDead: false, meatLeft: def.meat, hideLeft: def.hide,
            speed: def.speed + Phaser.Math.Between(-5, 5),
            wanderTimer: Phaser.Math.Between(2000, 5000),
            ateToday: 3, hungryDays: 0,
            ageDays: (def.timeToAdulthoodDays ?? 0) + Phaser.Math.Between(0, 10),
            pheno: randomAnimalPheno(def),
            needs: { food: 0.7 + Math.random() * 0.3, rest: 0.7 + Math.random() * 0.3 },
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
        this._drawNeedsBars(d);
    }

    spawnSheep(x, y, gender = null) {
        if (!gender) gender = Math.random() < 0.5 ? 'male' : 'female';
        const s = {
            id: this.scene.getId(), species: 'sheep', x, y, gender,
            hp: 2, isDead: false, isTamed: false, followUnit: null,
            woolReady: true, woolTimer: 0,
            ateToday: 3, hungryDays: 0,
            ageDays: (ANIMALS.sheep.timeToAdulthoodDays ?? 0) + Phaser.Math.Between(0, 10),
            pheno: randomAnimalPheno(ANIMALS.sheep),
            needs: { food: 0.7 + Math.random() * 0.3, rest: 0.7 + Math.random() * 0.3 },
            gfx: this.scene._w(this.scene.add.graphics().setDepth(5)),
        };
        this.redrawSheep(s);
        this.scene.sheep.push(s);
        return s;
    }

    redrawSheep(s) {
        const g = s.gfx;
        g.clear().setPosition(s.x, s.y);
        ANIMALS.sheep.draw(g, s, { moving: s.moving ?? false });
        this._drawNeedsBars(s);
    }

    // Derive facing + gait from this tick's motion delta, then redraw so the directional rig
    // animates (mirrors tickDeer's per-frame block). Replaces the bare gfx.setPosition calls.
    _animSheep(s) {
        const mdx = s.x - (s._px ?? s.x), mdy = s.y - (s._py ?? s.y);
        s._px = s.x; s._py = s.y;
        const moving = (mdx * mdx + mdy * mdy) > 0.02;
        if (moving) {
            s._walkPhase = (s._walkPhase ?? 0) + 0.16;
            if (Math.abs(mdx) > Math.abs(mdy)) s.facing = mdx >= 0 ? 'east' : 'west';
            else                                s.facing = mdy >= 0 ? 'south' : 'north';
        } else {
            s._walkPhase = (s._walkPhase ?? 0) * 0.8;
        }
        s.moving = moving;
        this.redrawSheep(s);
    }

    // Generic per-species redraw (dispatches on a.species). Used by the hunter and the beast tick.
    redrawAnimal(a) {
        const g = a.gfx; if (!g) return;
        g.clear().setPosition(a.x, a.y);
        (ANIMALS[a.species] ?? ANIMALS.deer).draw(g, a, { moving: a.moving ?? false });
        this._drawNeedsBars(a);
    }

    // Facing + gait from motion delta, then generic redraw (mirrors _animSheep for boar/aurochs).
    _animBeast(a) {
        const mdx = a.x - (a._px ?? a.x), mdy = a.y - (a._py ?? a.y);
        a._px = a.x; a._py = a.y;
        const moving = (mdx * mdx + mdy * mdy) > 0.02;
        if (moving) {
            a._walkPhase = (a._walkPhase ?? 0) + 0.16;
            if (Math.abs(mdx) > Math.abs(mdy)) a.facing = mdx >= 0 ? 'east' : 'west';
            else                                a.facing = mdy >= 0 ? 'south' : 'north';
        } else {
            a._walkPhase = (a._walkPhase ?? 0) * 0.8;
        }
        a.moving = moving;
        this.redrawAnimal(a);
    }

    // ── Needs (food + rest) shared across every animal ───────────────────────────
    // Returns true if the animal is asleep (caller should skip movement this frame).
    // Food decays while awake; empty food drains hp → death. Rest decays while awake
    // and recovers while sleeping; empty rest forces sleep in place. (#28)
    _tickAnimalNeeds(a, def, dt) {
        if (!a.needs) a.needs = { food: 0.7 + Math.random() * 0.3, rest: 0.7 + Math.random() * 0.3 };
        if (!a.pheno) a.pheno = randomAnimalPheno(def);   // lazy-init for old saves
        const n = a.needs;

        if (a.isSleeping) {
            n.rest = Math.min(1, n.rest + dt * REST_RECOVER);
            if (n.rest >= WAKE_REST) a.isSleeping = false;
            a.hungryDays = n.food < 0.35 ? 1 : 0;
            return a.isSleeping;
        }

        n.food = Math.max(0, n.food - dt * FOOD_DECAY);
        n.rest = Math.max(0, n.rest - dt * REST_DECAY);
        if (n.rest <= TIRED) { a.isSleeping = true; a.moveTo = null; }
        // Off-cycle (a diurnal animal at night / nocturnal by day): drift to sleep when undisturbed.
        else if (!a.aggroTarget && !this._isActiveTime(def) && n.rest < 0.7 && Math.random() < dt * 0.6) { a.isSleeping = true; a.moveTo = null; }
        if (n.food <= 0) {
            a.hp = (a.hp ?? 1) - dt * STARVE_HP;
            if (a.hp <= 0) { this._killAnimal(a); return true; }
        }
        a.hungryDays = n.food < 0.35 ? 1 : 0;
        return false;
    }

    // Animal dies in place, leaving a harvestable carcass (each draw() has an isDead branch).
    _killAnimal(a) {
        if (a.isDead) return;
        a.isDead = true; a.hp = 0; a.moveTo = null; a.moving = false; a.aggroTarget = null;
        this.redrawAnimal(a);
    }

    // ── Behaviour params (entity-editor fields → sim). All read def.<field> with fallbacks so
    //    base values come from the def and live edits flow through Object.assign overrides. (#28b)
    _allHerds() {
        return [['deer', this.scene.deer], ['sheep', this.scene.sheep], ['boar', this.scene.boar],
                ['aurochs', this.scene.aurochs], ['wolf', this.scene.wolf]];
    }
    _isAdult(a, def) { return (a.ageDays ?? (def.timeToAdulthoodDays ?? 0)) >= (def.timeToAdulthoodDays ?? 0); }

    // Juveniles spawn small and grow to the def's full scale by adulthood.
    _applyGrowth(a, def) {
        const adult = def.timeToAdulthoodDays ?? 0, full = (def.scale ?? 1) * (a.pheno?.sizeGene ?? 1);
        a.scale = (adult > 0 && (a.ageDays ?? adult) < adult)
            ? full * (0.5 + 0.5 * (a.ageDays ?? 0) / adult) : full;
    }

    // Once per game-day: age every animal, grow juveniles, roll old-age death past lifespan.
    _onNewDay() {
        for (const [sp, arr] of this._allHerds()) {
            const def = ANIMALS[sp]; if (!def) continue;
            for (const a of (arr ?? [])) {
                if (a.isDead) continue;
                a.ageDays = (a.ageDays ?? 0) + 1;
                this._applyGrowth(a, def);
                const span = def.lifespanDays ?? 0;
                if (span > 0 && a.ageDays > span && Math.random() < Math.min(1, (a.ageDays - span) / 5)) {
                    this._killAnimal(a);
                    this.scene.uiManager?.showFloatText?.(a.x, a.y - 14, '☠ old age', '#9a8a7a');
                } else this.redrawAnimal(a);   // reflect new scale
            }
        }
    }

    // Active-cycle: does this animal forage/hunt now, or is this its rest window?
    _isActiveTime(def) {
        const cyc = def.activeCycle ?? 'always';
        if (cyc === 'always') return true;
        const night = this.scene.phase === 'NIGHT';
        return cyc === 'nocturnal' ? night : !night;
    }

    // Nearest carcass (dead animal with meat left) — omnivores scavenge these.
    _nearestCarcass(a, r) {
        let best = null, bd = r;
        for (const [, arr] of this._allHerds()) for (const o of (arr ?? [])) {
            if (o === a || !o.isDead || (o.meatLeft ?? 0) <= 0) continue;
            const d = Phaser.Math.Distance.Between(a.x, a.y, o.x, o.y);
            if (d < bd) { bd = d; best = o; }
        }
        return best;
    }

    // Diet-aware foraging when hungry: herbivores graze brush; omnivores graze or scavenge a
    // carcass; carnivores hunt elsewhere. Returns true if it owns movement this frame.
    _forage(a, def, delta, dt) {
        const diet = def.diet ?? 'herbivore';
        if (diet === 'carnivore') return false;
        if (this._grazeSeek(a, def, delta, dt)) return true;
        if (diet === 'omnivore') return this._scavengeSeek(a, def, delta, dt);
        return false;
    }
    _scavengeSeek(a, def, delta, dt) {
        const n = a.needs; if (!n || n.food >= HUNGRY_SEEK) return false;
        let c = a._carcass;
        if (!c || !c.isDead || (c.meatLeft ?? 0) <= 0) { c = this._nearestCarcass(a, 16 * TILE); a._carcass = c; }
        if (!c) return false;
        const d = Phaser.Math.Distance.Between(a.x, a.y, c.x, c.y);
        if (d > GRAZE_RANGE) { a.moveTo = { x: c.x, y: c.y }; this._stepToward(a, (def.speed ?? 40) * 0.5, dt); }
        else {
            a.moveTo = null;
            n.food = Math.min(1, n.food + dt * GRAZE_RATE * 1.5);
            a._grazeAcc = (a._grazeAcc ?? 0) + dt;
            if (a._grazeAcc >= 2) { a._grazeAcc = 0; c.meatLeft = Math.max(0, (c.meatLeft ?? 0) - 1); this.redrawAnimal(c); if (c.meatLeft <= 0) a._carcass = null; }
            if (n.food >= 1) a._carcass = null;
        }
        return true;
    }

    // Pack/herd cohesion: centroid of nearby same-species animals (biases wander).
    _herdCentroid(s, r) {
        const arr = this.scene[s.species]; if (!arr) return null;
        let sx = 0, sy = 0, k = 0;
        for (const o of arr) { if (o === s || o.isDead) continue; const d = Phaser.Math.Distance.Between(s.x, s.y, o.x, o.y); if (d < r) { sx += o.x; sy += o.y; k++; } }
        return k ? { x: sx / k, y: sy / k } : null;
    }

    // Roll whether a struck/approached animal turns hostile (% aggroChance, with fight/flight default).
    _willFight(def) {
        const pct = def.aggroChancePct ?? (def.aggressive || def.defensive ? 100 : (def.fightOrFlight === 'fight' ? 50 : 0));
        return Math.random() * 100 < pct;
    }

    // Nearest grazable brush (scrub) node with stock remaining. Mirrors the worker's findNearNode
    // pattern (UnitWorker.findNearNode) but local so animals don't depend on the worker mixin.
    _nearestBrush(a, maxDist) {
        let best = null, bd = maxDist;
        for (const node of (this.scene.resNodes ?? [])) {
            if (node.type !== 'scrub' || (node.stock ?? 0) <= 0) continue;
            const d = Phaser.Math.Distance.Between(a.x, a.y, node.x, node.y);
            if (d < bd) { bd = d; best = node; }
        }
        return best;
    }

    // Herbivore foraging: when hungry, walk to the nearest brush and graze it (refills food,
    // depletes node stock; regrowth handled by WorldManager.tickNodeRespawn). Returns true when
    // it owns movement this frame so the caller skips its idle wander.
    _grazeSeek(a, def, delta, dt) {
        const n = a.needs;
        if (!n || n.food >= HUNGRY_SEEK) { a.grazeNode = null; return false; }

        let node = a.grazeNode;
        if (!node || node.isDead || (node.stock ?? 0) <= 0) {
            node = this._nearestBrush(a, 14 * TILE);
            a.grazeNode = node;
        }
        if (!node) return false;

        const d = Phaser.Math.Distance.Between(a.x, a.y, node.x, node.y);
        if (d > GRAZE_RANGE) {
            a.moveTo = { x: node.x, y: node.y };
            this._stepToward(a, (def.speed ?? 40) * 0.5, dt);
        } else {
            a.moveTo = null;
            n.food = Math.min(1, n.food + dt * GRAZE_RATE);
            a._grazeAcc = (a._grazeAcc ?? 0) + dt;
            if (a._grazeAcc >= 2) {   // nibble one stock every couple seconds
                a._grazeAcc = 0;
                node.stock = Math.max(0, (node.stock ?? 0) - 1);
                this.scene.mapManager?.redrawNode?.(node);
                if (node.stock <= 0) a.grazeNode = null;
            }
            if (n.food >= 1) a.grazeNode = null;
        }
        return true;
    }

    // Nearest living wolf within r (herbivores flee these like they flee colonists).
    _nearestWolf(a, r) {
        let best = null, bd = r;
        for (const w of (this.scene.wolf ?? [])) {
            if (w.isDead) continue;
            const d = Phaser.Math.Distance.Between(a.x, a.y, w.x, w.y);
            if (d < bd) { bd = d; best = w; }
        }
        return best;
    }

    // Two thin status bars (food green→red, rest blue) above an animal, drawn in the gfx's local
    // space. Only shown when something is low or while sleeping, to keep the field uncluttered.
    _drawNeedsBars(a) {
        const g = a.gfx, n = a.needs;
        if (!g || !n || a.isDead) return;
        if (n.food >= 0.6 && n.rest >= 0.6 && !a.isSleeping) return;
        const sc = a.scale ?? 1;
        const bw = 16 * sc, bh = 2 * sc, bx = -bw / 2, by = -24 * sc;
        const bar = (y, frac, col) => {
            g.fillStyle(0x000000, 0.45).fillRect(bx - 0.5, y - 0.5, bw + 1, bh + 1);
            g.fillStyle(0x222a33, 0.7).fillRect(bx, y, bw, bh);
            g.fillStyle(col, 0.95).fillRect(bx, y, bw * Phaser.Math.Clamp(frac, 0, 1), bh);
        };
        const foodCol = n.food < 0.3 ? 0xdd4433 : n.food < 0.55 ? 0xddaa33 : 0x66cc44;
        bar(by, n.food, foodCol);
        bar(by + bh + 1.5, n.rest, 0x4aa0ff);
        if (a.isSleeping) g.fillStyle(0xcfe0ff, 0.9).fillCircle(bw / 2 + 3 * sc, by - 2, 1.4 * sc);
    }

    spawnBoar(x, y, gender = null)    { return this._spawnBeast('boar', x, y, gender); }
    spawnAurochs(x, y, gender = null) { return this._spawnBeast('aurochs', x, y, gender); }
    spawnWolf(x, y, gender = null)    { return this._spawnBeast('wolf', x, y, gender); }

    _spawnBeast(species, x, y, gender = null) {
        const def = ANIMALS[species];
        if (!gender) gender = Math.random() < 0.5 ? 'male' : 'female';
        const a = {
            id: this.scene.getId(), species, x, y, gender,
            hp: def.hp ?? 3, isDead: false, meatLeft: def.meat, hideLeft: def.hide, scale: def.scale ?? 1,
            speed: def.speed + Phaser.Math.Between(-4, 4),
            wanderTimer: Phaser.Math.Between(2000, 5000),
            ateToday: 3, hungryDays: 0,
            ageDays: (def.timeToAdulthoodDays ?? 0) + Phaser.Math.Between(0, 10),   // seeded/edge animals are adults
            pheno: randomAnimalPheno(def),
            needs: { food: 0.7 + Math.random() * 0.3, rest: 0.7 + Math.random() * 0.3 },
            aggroTarget: null, aggroUntil: 0,
            gfx: this.scene._w(this.scene.add.graphics().setDepth(5)),
        };
        this.redrawAnimal(a);
        this.scene[species].push(a);
        return a;
    }

    tick(delta, dt) {
        // Daily aging / growth / lifespan, driven off the scene's day counter.
        if (this._lastDay === undefined) this._lastDay = this.scene.day;
        else if (this.scene.day !== this._lastDay) { this._lastDay = this.scene.day; this._onNewDay(); }

        this.tickDeer(delta, dt);
        this.tickSheep(delta, dt);
        this.tickBeasts(delta, dt);
        this.tickWolves(delta, dt);
        this.tickCritter(delta, dt);
        this.tickSpawning(delta);
        this.tickBreeding(delta);
    }

    // Boar & aurochs share one hostile-capable AI. Aggressive species (boar) charge anyone within
    // aggroRadius; defensive ones (aurochs) only turn hostile when struck or cornered. Both flee
    // mild threats and graze otherwise. (#27)
    tickBeasts(delta, dt) {
        const friendlies = this.scene.units.filter(u => !u.isEnemy && u.hp > 0);
        for (const a of this.scene.boar)    this._tickBeast(a, ANIMALS.boar, delta, dt, friendlies);
        for (const a of this.scene.aurochs) this._tickBeast(a, ANIMALS.aurochs, delta, dt, friendlies);
    }

    _tickBeast(a, def, delta, dt, friendlies) {
        if (a.isDead) return;   // carcass already drawn at death; no movement
        if (this._tickAnimalNeeds(a, def, dt)) { a.moving = false; this.redrawAnimal(a); return; }
        const now = this.scene.time.now;
        if (a.aggroUntil && now > a.aggroUntil) { a.aggroTarget = null; a.aggroUntil = 0; }

        let near = null, nd = Infinity;
        for (const u of friendlies) {
            const d = Phaser.Math.Distance.Between(a.x, a.y, u.x, u.y);
            if (d < nd) { nd = d; near = u; }
        }

        // Resolve a hostile target: an existing grudge, proximity/territorial aggro (gated by the
        // animal's aggroChance), or a defensive beast cornered very close. A struck animal's grudge
        // is set by the hunter (UnitWorker.tickHunter) using the same aggroChance roll.
        let target = a.aggroTarget != null ? friendlies.find(u => u.id === a.aggroTarget) ?? null : null;
        if (!target && near && now > (a._aggroRollUntil ?? 0)) {
            const terr = (def.territorialRadius ?? 0) > 0 && nd <= def.territorialRadius;
            const prox = def.aggressive && nd <= (def.aggroRadius ?? 2.5 * TILE);
            const cornered = def.defensive && nd <= def.atkRange * 1.2;
            if ((terr || prox) && this._willFight(def)) target = near;
            else if (cornered) target = near;
            else a._aggroRollUntil = now + 1500;   // don't re-roll every frame
            if (target) { a.aggroTarget = near.id; a.aggroUntil = now + 9000; }
        }

        if (target) {
            const d = Phaser.Math.Distance.Between(a.x, a.y, target.x, target.y);
            if (d <= def.atkRange) {
                if (now - (a.lastAtk ?? 0) > 1100) {
                    a.lastAtk = now;
                    target.hp -= def.atk ?? 2;
                    this.scene.uiManager?.showFloatText?.(target.x, target.y - 14, `-${def.atk ?? 2}`, '#ff6666');
                }
            } else {
                const ang = Math.atan2(target.y - a.y, target.x - a.x);   // charge
                a.x += Math.cos(ang) * def.speed * 1.2 * dt;
                a.y += Math.sin(ang) * def.speed * 1.2 * dt;
            }
            a.moveTo = null; a.wanderTimer = 0;
        } else {
            // Flee the nearest threat (colonist within fleeRadius, or any wolf), else graze.
            let fleeFrom = (near && nd < def.fleeRadius) ? near : null;
            let fleeDist = fleeFrom ? nd : def.fleeRadius;
            const wolf = this._nearestWolf(a, def.fleeRadius);
            if (wolf) { const wd = Phaser.Math.Distance.Between(a.x, a.y, wolf.x, wolf.y); if (wd < fleeDist) { fleeFrom = wolf; fleeDist = wd; } }
            if (fleeFrom) {
                const ang = Math.atan2(a.y - fleeFrom.y, a.x - fleeFrom.x);   // flee
                a.x += Math.cos(ang) * def.speed * dt;
                a.y += Math.sin(ang) * def.speed * dt;
                a.moveTo = null; a.wanderTimer = 0;
            } else if (!this._forage(a, def, delta, dt)) {
                this._wander(a, delta, dt, def.speed * 0.3);                 // graze / scavenge
            }
        }

        a.x = Phaser.Math.Clamp(a.x, TILE, NATURE_WORLD_W * TILE - TILE);
        a.y = Phaser.Math.Clamp(a.y, MAP_OY + TILE, NATURE_BOTTOM - TILE);
        this._animBeast(a);
    }

    // ── Wolves: apex predator. Hunt wild herbivores when hungry and raid the colony (attack
    //    colonists & tamed sheep). Killing prey refills the wolf's food bar. (#28)
    tickWolves(delta, dt) {
        for (const w of (this.scene.wolf ?? [])) this._tickWolf(w, ANIMALS.wolf, delta, dt);
    }

    _tickWolf(w, def, delta, dt) {
        if (w.isDead) return;
        if (this._tickAnimalNeeds(w, def, dt)) { this._animBeast(w); return; }   // died or sleeping
        const now = this.scene.time.now;
        const active = this._isActiveTime(def);                 // nocturnal → hunts at night
        const hungry = w.needs.food < HUNT_HUNGER && active;

        // Pick the nearest valid target. Prey (any herbivore) is fair game when hungry & active;
        // colonists are raided when hunting and defended against up close (or in territory).
        let target = null, td = Infinity, targetIsUnit = false;
        const consider = (o, isUnit, maxR) => {
            if (!o || o.isDead || (o.hp ?? 1) <= 0) return;
            const d = Phaser.Math.Distance.Between(w.x, w.y, o.x, o.y);
            if (d < maxR && d < td) { td = d; target = o; targetIsUnit = isUnit; }
        };
        if (hungry) {
            for (const list of [this.scene.deer, this.scene.sheep, this.scene.boar, this.scene.aurochs]) {
                for (const p of (list ?? [])) consider(p, false, def.huntRadius);
            }
        }
        const guardR = Math.max(def.aggroRadius ?? 0, def.territorialRadius ?? 0);
        for (const u of this.scene.units) {
            if (u.isEnemy || u.hp <= 0) continue;
            consider(u, true, hungry ? def.huntRadius : guardR);
        }

        if (target) {
            w.aggroTarget = target.id ?? 0;
            const d = Phaser.Math.Distance.Between(w.x, w.y, target.x, target.y);
            if (d <= def.atkRange) {
                if (now - (w.lastAtk ?? 0) > 900) {
                    w.lastAtk = now;
                    target.hp = (target.hp ?? 1) - def.atk;
                    this.scene.uiManager?.showFloatText?.(target.x, target.y - 14, `-${def.atk}`, '#ff6666');
                    if (!targetIsUnit && target.hp <= 0) {   // prey down — feed
                        this._killAnimal(target);
                        w.needs.food = 1;
                        w.aggroTarget = null;
                    }
                }
            } else {
                const ang = Math.atan2(target.y - w.y, target.x - w.x);   // charge
                w.x += Math.cos(ang) * def.speed * 1.2 * dt;
                w.y += Math.sin(ang) * def.speed * 1.2 * dt;
            }
            w.moveTo = null; w.wanderTimer = 0;
        } else {
            w.aggroTarget = null;
            this._wander(w, delta, dt, def.speed * 0.3);
        }

        w.x = Phaser.Math.Clamp(w.x, TILE, NATURE_WORLD_W * TILE - TILE);
        w.y = Phaser.Math.Clamp(w.y, MAP_OY + TILE, NATURE_BOTTOM - TILE);
        this._animBeast(w);
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
            if (this._tickAnimalNeeds(d, ANIMALS.deer, dt)) { d.moving = false; this.redrawDeer(d); continue; }
            const fleeRadius = d.fleeR ?? ANIMALS.deer.fleeRadius;
            let fleeFrom = null, fleeD = fleeRadius;
            for (const u of friendlies) {
                const dist = Phaser.Math.Distance.Between(d.x, d.y, u.x, u.y);
                if (dist < fleeD) { fleeD = dist; fleeFrom = u; }
            }
            const wolf = this._nearestWolf(d, fleeRadius);
            if (wolf) { const wd = Phaser.Math.Distance.Between(d.x, d.y, wolf.x, wolf.y); if (wd < fleeD) { fleeD = wd; fleeFrom = wolf; } }

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
            } else if (!this._forage(d, ANIMALS.deer, delta, dt)) {
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
            if (this._tickAnimalNeeds(s, ANIMALS.sheep, dt)) { s.moving = false; this.redrawSheep(s); continue; }

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
                        this._animSheep(s);
                        continue;
                    }
                    s.followUnit = null;   // leader gone — stay tamed and graze
                }
                if (!this._forage(s, ANIMALS.sheep, delta, dt)) this._grazeTamed(s, delta, dt, cc);
                s.x = Phaser.Math.Clamp(s.x, TILE, NATURE_WORLD_W * TILE - TILE);
                s.y = Phaser.Math.Clamp(s.y, MAP_OY + TILE, NATURE_BOTTOM - TILE);
                this._animSheep(s);
                continue;
            }

            // ── Wild sheep: flee from people, otherwise wander ──
            let fleeFrom = null, fleeD = ANIMALS.sheep.fleeRadius;
            for (const u of friendlies) {
                if (u.role === 'shepherd' && u.targetSheep === s.id) continue;
                const d = Phaser.Math.Distance.Between(s.x, s.y, u.x, u.y);
                if (d < fleeD) { fleeD = d; fleeFrom = u; }
            }
            const wolf = this._nearestWolf(s, ANIMALS.sheep.fleeRadius);
            if (wolf) { const wd = Phaser.Math.Distance.Between(s.x, s.y, wolf.x, wolf.y); if (wd < fleeD) { fleeD = wd; fleeFrom = wolf; } }
            if (fleeFrom) {
                const angle = Math.atan2(s.y - fleeFrom.y, s.x - fleeFrom.x);
                s.x += Math.cos(angle) * ANIMALS.sheep.speed * dt;
                s.y += Math.sin(angle) * ANIMALS.sheep.speed * dt;
                s.moveTo = null; s.wanderTimer = 0;
            } else if (!this._forage(s, ANIMALS.sheep, delta, dt)) {
                this._wander(s, delta, dt, ANIMALS.sheep.speed * 0.3);
            }
            s.x = Phaser.Math.Clamp(s.x, TILE, NATURE_WORLD_W * TILE - TILE);
            s.y = Phaser.Math.Clamp(s.y, MAP_OY + TILE, NATURE_BOTTOM - TILE);
            this._animSheep(s);
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

    // Generic random wander (wild animals), biased toward the herd/pack centroid by packCohesion.
    _wander(s, delta, dt, speed) {
        s.wanderTimer = (s.wanderTimer ?? 0) - delta;
        if (!s.moveTo || s.wanderTimer <= 0) {
            const angle = Math.random() * Math.PI * 2;
            const dist  = Phaser.Math.Between(TILE * 1, TILE * 3);
            let tx = s.x + Math.cos(angle) * dist, ty = s.y + Math.sin(angle) * dist;
            const coh = ANIMALS[s.species]?.packCohesion ?? 0;
            if (coh > 0 && s.species) {
                const c = this._herdCentroid(s, 12 * TILE);
                if (c) { tx += (c.x - tx) * coh; ty += (c.y - ty) * coh; }
            }
            s.moveTo = { x: Phaser.Math.Clamp(tx, TILE, NATURE_WORLD_W * TILE - TILE),
                         y: Phaser.Math.Clamp(ty, MAP_OY + TILE, NATURE_BOTTOM - TILE) };
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
        const wildDeer    = this.scene.deer.filter(d => !d.isDead).length;
        const wildSheep   = this.scene.sheep.filter(s => !s.isDead && !s.isTamed).length;
        const wildBoar    = this.scene.boar.filter(a => !a.isDead).length;
        const wildAurochs = this.scene.aurochs.filter(a => !a.isDead).length;
        const wildWolf    = (this.scene.wolf ?? []).filter(a => !a.isDead).length;
        if (wildDeer    < 2) this.spawnDeerAtEdge();
        if (wildSheep   < 2) this.spawnSheepAtEdge();
        if (wildBoar    < 2) this._spawnAtEdge((x, y) => this.spawnBoar(x, y));
        if (wildAurochs < 1) this._spawnAtEdge((x, y) => this.spawnAurochs(x, y));
        if (wildWolf    < 1 && Math.random() < 0.3) this._spawnAtEdge((x, y) => this.spawnWolf(x, y));   // predators stay scarce
    }

    _spawnAtEdge(spawnFn) {
        const side = Math.floor(Math.random() * 4);
        let x, y;
        if (side === 0)      { x = Phaser.Math.Between(TILE, NATURE_WORLD_W*TILE-TILE); y = MAP_OY + TILE; }
        else if (side === 1) { x = Phaser.Math.Between(TILE, NATURE_WORLD_W*TILE-TILE); y = NATURE_BOTTOM - TILE; }
        else if (side === 2) { x = TILE; y = Phaser.Math.Between(MAP_OY + TILE, NATURE_BOTTOM - TILE); }
        else                 { x = NATURE_WORLD_W*TILE - TILE; y = Phaser.Math.Between(MAP_OY + TILE, NATURE_BOTTOM - TILE); }
        spawnFn(x, y);
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
        this._breedSpecies(this.scene.boar.filter(a => !a.isDead), ANIMALS.boar, ANIMALS.boar.maxCount,
            (x, y) => this.spawnBoar(x, y), false);
        this._breedSpecies(this.scene.aurochs.filter(a => !a.isDead), ANIMALS.aurochs, ANIMALS.aurochs.maxCount,
            (x, y) => this.spawnAurochs(x, y), false);
        // Wolves only breed when well-fed, so the pack grows only when prey is plentiful.
        this._breedSpecies((this.scene.wolf ?? []).filter(w => !w.isDead && (w.needs?.food ?? 1) > 0.6),
            ANIMALS.wolf, ANIMALS.wolf.maxCount, (x, y) => this.spawnWolf(x, y), false);
    }

    _breedSpecies(herd, def, cap, spawnFn, tamed) {
        if (herd.length >= cap) return;
        // Only sexually-mature adults breed (timeToAdulthoodDays gate).
        const adults = herd.filter(a => this._isAdult(a, def));
        const males   = adults.filter(a => a.gender === 'male');
        const females = adults.filter(a => a.gender === 'female');
        if (!males.length || !females.length) return;
        const R = def.breedRadius ?? 4 * TILE;
        const litter = Math.max(1, def.litterSize ?? 1);
        for (const f of females) {
            const mate = males.find(m => Phaser.Math.Distance.Between(m.x, m.y, f.x, f.y) < R);
            if (!mate || Math.random() > 0.5) continue;
            let last = null;
            for (let k = 0; k < litter && herd.length + k < cap; k++) {
                const bx = f.x + Phaser.Math.Between(-TILE, TILE);
                const by = f.y + Phaser.Math.Between(-TILE, TILE);
                const baby = spawnFn(Phaser.Math.Clamp(bx, TILE, NATURE_WORLD_W * TILE - TILE),
                                     Phaser.Math.Clamp(by, MAP_OY + TILE, NATURE_BOTTOM - TILE));
                if (!baby) continue;
                baby.ageDays = 0;                       // born a juvenile → grows to adult over time
                baby.pheno = blendAnimalPheno(def, f.pheno, mate.pheno);   // inherit coat/size/marking
                if (tamed) { baby.isTamed = true; baby.pastureZoneId = f.pastureZoneId ?? null; }
                this._applyGrowth(baby, def);
                this.redrawAnimal(baby);
                last = baby;
            }
            if (!last) return;
            const bornText = tamed ? '🐑 lamb born'
                : def === ANIMALS.deer    ? '🦌 fawn born'
                : def === ANIMALS.boar    ? '🐗 piglet born'
                : def === ANIMALS.aurochs ? '🐂 calf born'
                : def === ANIMALS.wolf    ? '🐺 pup born'
                : '🐑 lamb born';
            const note = litter > 1 ? `${bornText} ×${litter}` : bornText;
            this.scene.uiManager?.showFloatText?.(last.x, last.y - 14, note, '#cfeac0');
            return;   // one litter per breed window per species
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
        place((x, y) => this.spawnDeer(x, y),    ANIMALS.deer.maxCount);
        place((x, y) => this.spawnSheep(x, y),   Math.ceil(ANIMALS.sheep.maxCount * 0.7));
        place((x, y) => this.spawnBoar(x, y),    Math.ceil(ANIMALS.boar.maxCount * 0.6));
        place((x, y) => this.spawnAurochs(x, y), Math.ceil(ANIMALS.aurochs.maxCount * 0.5));
        place((x, y) => this.spawnWolf(x, y),    Math.ceil(ANIMALS.wolf.maxCount * 0.4));
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
