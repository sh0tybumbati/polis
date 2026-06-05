import {
    TILE, MAP_OY,
    TILE_SPD, T_GRASS, T_ROCK, HIGH_GROUND_BONUS,
    VET_LEVELS,
    pickName,
    ENABLE_PROACTIVE_AI, DESIRE_THRESHOLD, ROAD_DESIRE, ROAD_NONE, HUNGER_THRESHOLD,
    ARCHON_BUILD_ORDER,
    randomAttributes, blendAttributes, randomPhenotype, blendPhenotype,
    inheritHairStyle,
    randomPassions, blendPassions,
    emptySkills,
    pickTraits, blendTraits,
    YEARS_PER_AGE_STEP,
} from '../config/gameConstants.js';
import { THEME } from '../ui/UIKit.js';
import { CONSTRUCTS } from '../content/constructs/index.js';
import { NODES } from '../content/nodes/index.js';
import { ANIMALS } from '../content/animals/index.js';
import { ITEMS } from '../content/items/index.js';
import { JOBS, WORKSHOP_JOBS } from '../content/jobs/index.js';
import { CROPS, CROPS_BY_WILD } from '../content/crops/index.js';
import { UNITS } from '../content/units/index.js';
import { MathUtils } from '../utils/MathUtils.js';
import { Pathfinder } from '../utils/Pathfinder.js';
import GameLogger from '../GameLogger.js';

import unitRenderMethods    from './unit/UnitRender.js';
import unitCombatMethods    from './unit/UnitCombat.js';
import unitMovementMethods  from './unit/UnitMovement.js';
import unitNeedsMethods     from './unit/UnitNeeds.js';
import unitEnemyMethods     from './unit/UnitEnemy.js';
import unitWorkerMethods    from './unit/UnitWorker.js';

// ── Vocation system ───────────────────────────────────────────────────────────

// Attribute affinities per job. Weights 0–1; multiplied against attribute value (1–10).
// Max bonus from one weight-1 affinity at attr 10 = 20 pts. Two attrs at max ≈ 40 pts.
const JOB_AFFINITIES = {
    builder:   { str: 1.0, con: 0.8 },
    farmer:    { con: 1.0, wil: 0.8 },
    forager:   { dex: 1.0, agi: 0.8 },
    woodcutter:{ str: 0.8, dex: 1.0 },
    miner:     { str: 1.0, con: 0.8 },
    shepherd:  { con: 0.8, wil: 1.0 },
    hunter:    { dex: 1.0, agi: 1.0 },
    miller:    { int: 1.0, wil: 0.8 },
    baker:     { int: 0.8, wil: 1.0 },
    butcher:   { str: 0.8, dex: 1.0 },
    tanner:    { dex: 1.0, int: 0.8 },
    smelter:   { str: 1.0, con: 0.8 },
    smith:     { str: 1.0, dex: 0.8, int: 0.6 },
    carpenter: { dex: 1.0, int: 0.8 },
    mason:     { str: 0.8, int: 1.0 },
    merchant:  { int: 1.0, wil: 0.8 },
};

// When a unit's vocation construct doesn't exist yet, they prefer these fallback roles instead.
const VOCATION_FALLBACKS = {
    smith:     ['smelter', 'miner', 'woodcutter'],
    baker:     ['miller', 'farmer'],
    butcher:   ['hunter', 'shepherd'],
    tanner:    ['hunter', 'shepherd'],
    mason:     ['miner', 'builder'],
    carpenter: ['woodcutter', 'builder'],
    smelter:   ['miner'],
    miller:    ['farmer'],
    merchant:  ['forager', 'farmer'],
    farmer:    ['forager'],
    hunter:    ['forager'],
    woodcutter:['forager'],
    miner:     ['builder'],
    shepherd:  ['farmer'],
    builder:   [],
    forager:   [],
};

// Bonus from matching attributes to job affinities (0–~40 pts).
function _attrBonus(u, jobId) {
    const affs  = JOB_AFFINITIES[jobId] ?? {};
    const attrs = u.attributes ?? {};
    let total = 0;
    for (const [attr, w] of Object.entries(affs)) total += (attrs[attr] ?? 5) * w * 2;
    return total;
}

// Bonus from passion matching the job's skill (0, 25, or 60 pts).
function _passionBonus(u, skill) {
    if (!skill || !u.passions) return 0;
    const lv = u.passions[skill];
    return lv === 'burning' ? 60 : lv === 'interested' ? 25 : 0;
}


export default class UnitManager {
    constructor(scene) {
        this.scene = scene;
        this.pathfinder = new Pathfinder(scene);
        this.idleGfx  = scene.add.graphics().setDepth(4);
        this.selGfx   = scene.add.graphics().setDepth(5);
        scene.unitsGfx = scene._w(scene.add.graphics().setDepth(6));
        this._byUnitId = new Map(); // unit.id → unit for O(1) lookup
    }

    spawnTrainedUnit(construct, type) {
        const u = this.spawnUnit(type, construct.tx * TILE + TILE/2, MAP_OY + construct.ty * TILE + TILE/2, !!construct.faction);
        this.scene.uiManager.showFloatText(u.x, u.y - 20, `${type} ready!`, '#88ff88');
    }

    spawnUnit(type, x, y, isEnemy, forcedGender = null) {
        const def = UNITS[type];
        const gender = forcedGender ?? (Math.random() < 0.5 ? 'male' : 'female');

        // Genealogy & genetics (workers only — soldiers use def defaults)
        const isWorker = type === 'worker';
        const attributes = isWorker ? randomAttributes() : null;
        const phenotype  = isWorker ? randomPhenotype(gender) : null;
        const passions   = isWorker ? randomPassions()   : null;
        const maxHp  = isWorker ? 10 + attributes.con : def.hp;
        const speed  = isWorker ? def.speed * (1 + (attributes.agi - 5) * 0.04) : def.speed;
        const carryMax = isWorker ? 3 + Math.round(attributes.str / 2) : 5;

        const unit = {
            id: this.scene.getId(), type, x, y,
            hp: maxHp, maxHp,
            isEnemy, selected: false,
            gender, name: pickName(gender),
            moveTo: null, lastAtk: 0, lastGather: 0,
            speed, atk: def.atk, range: def.range,
            wallSide: 0, homeConstructId: null, bedConstructId: null, estateId: null, age: 2,
            taskType: null, taskConstructId: null, targetNode: null, targetItemId: null,
            carrying: { 'Food.Grain.Wheat': 0, 'Food.Grain.Wheat.Flour': 0, 'Food.Grain.Wheat.Bread': 0, 'Food.Meat.Venison': 0, 'Food.Meat.Venison.Sausages': 0, 'Food.Produce.Berry': 0, 'Food.Produce.Olive': 0, 'Materials.Stone.Limestone': 0, 'Materials.Wood.Pine': 0, 'Materials.Wood.Pine.Sticks': 0, 'Materials.Stone.Limestone.Stones': 0, 'Textile.Fiber.Wool': 0, 'Textile.Hide.Deer': 0, 'Materials.Metal.Copper.Ore': 0 }, carryMax,
            role: null, replantTimer: 0, trainTimer: 0, lastSeek: 0,
            roleMemory: {}, targetDeer: null, targetSheep: null,
            nightsSurvived: 0, vetLevel: 0, isInside: false, _wageCollected: false,
            fetchConstructId: null, _prevRole: null,
            taskStack: [],
            // Genealogy
            fatherId: null, motherId: null, spouseId: null, familyName: null,
            relations: {}, traits: [],
            attributes, phenotype, passions,
            skills: emptySkills(),
            workProgress: 0,
            needs: { food: 1.0, rest: 1.0, social: 0.8, joy: 0.8 },
            mood: 1.0,
            _visible: true,
            _alpha: 1.0,
            bodyParts: { head: 1.0, torso: 1.0, armL: 1.0, armR: 1.0, legL: 1.0, legR: 1.0 },
        };
        if (isWorker) {
            unit.traits = pickTraits();
            this._initAdultAge(unit);   // arrives as a working-age adult (spread of years)
            this.assignVocation(unit);
        } else {
            unit.ageYears = (unit.age ?? 2) * YEARS_PER_AGE_STEP;
        }
        this.redrawUnit(unit);
        this.scene.units.push(unit);
        this._byUnitId.set(unit.id, unit);
        return unit;
    }

    // Give a unit a believable adult age (≈18–35 years) with the integer life-stage derived
    // to match. Used for founders, migrants and estate-founding pairs.
    _initAdultAge(u) {
        u.ageYears = 18 + Math.floor(Math.random() * 18);
        u.age = Math.floor(u.ageYears / YEARS_PER_AGE_STEP);
        u._ageDayAcc = 0;
        return u;
    }

    spawnChild(father, mother) {
        const home = this.scene.constructManager?.getById(father.homeConstructId ?? mother.homeConstructId);
        if (!home) return null;

        const cx = (home.tx + home.width / 2) * TILE;
        const cy = MAP_OY + (home.ty + home.height / 2) * TILE;

        const child = this.spawnUnit('worker', cx, cy, false);
        child.fatherId   = father.id;
        child.motherId   = mother.id;
        child.familyName = father.familyName ?? mother.familyName ?? null;
        child.traits     = blendTraits(father.traits ?? [], mother.traits ?? []);
        child.age       = 0;
        child.ageYears  = 0;          // newborn — ages ~1 year/in-game-day in ageUpUnits
        child._ageDayAcc = 0;
        child.homeConstructId = home.id;
        child.estateId  = mother.estateId ?? father.estateId ?? null;   // born into the family estate
        child.attributes = blendAttributes(father.attributes ?? randomAttributes(), mother.attributes ?? randomAttributes());
        child.phenotype  = blendPhenotype(father.phenotype ?? randomPhenotype('male'), mother.phenotype ?? randomPhenotype('female'));
        child.phenotype.hairStyle = inheritHairStyle(child.gender, father.phenotype?.hairStyle, mother.phenotype?.hairStyle);
        child.passions   = blendPassions(father.passions ?? randomPassions(), mother.passions ?? randomPassions());
        child.maxHp   = 10 + child.attributes.con;
        child.hp      = child.maxHp;
        child.speed   = UNITS.worker.speed * (1 + (child.attributes.agi - 5) * 0.04);
        child.carryMax = 3 + Math.round(child.attributes.str / 2);

        this._applyRareTraits(child);

        // Seed family relations
        child.relations = { [father.id]: 0.5, [mother.id]: 0.5 };
        father.relations = father.relations ?? {};
        father.relations[child.id] = 0.5;
        mother.relations = mother.relations ?? {};
        mother.relations[child.id] = 0.5;
        // Siblings: seed mild positive relation with existing children in the same home
        for (const sib of this.scene.units) {
            if (sib === child || sib.type !== 'worker') continue;
            if (sib.fatherId === father.id || sib.motherId === mother.id) {
                child.relations[sib.id] = 0.3;
                sib.relations = sib.relations ?? {};
                sib.relations[child.id] = 0.3;
            }
        }

        this.redrawUnit(child);  // re-draw with age:0 size after overriding attributes
        const bornName = [child.name, child.familyName].filter(Boolean).join(' ');
        this.scene.uiManager.showFloatText(cx, cy - 16, `${bornName} born!`, '#ffeeaa');
        return child;
    }

    pushTask(u, type, targetId = null, extra = {}) {
        if (!u.taskStack) u.taskStack = [];
        // Save current task state
        u.taskStack.push({
            type: u.taskType,
            constructId: u.taskConstructId,
            node: u.targetNode,
            workProgress: u.workProgress,
            role: u.role,
            ...extra
        });
        u.taskType = type;
        if (type === 'eat') {
            u.taskConstructId = targetId;
            u.targetNode = null;
        } else {
            u.taskConstructId = targetId;
        }
        u.workProgress = 0;
    }

    popTask(u) {
        if (!u.taskStack.length) {
            u.taskType = null;
            u.taskConstructId = null;
            u.targetNode = null;
            u.workProgress = 0;
            return;
        }
        const prev = u.taskStack.pop();
        u.taskType = prev.type;
        u.taskConstructId = prev.constructId;
        u.targetNode = prev.node;
        u.workProgress = prev.workProgress;
        if (prev.role) u.role = prev.role;
    }

    getAttrMult(u, attrs) {
        if (!u.attributes) return 1.0;
        let sum = 0;
        attrs.forEach(a => sum += (u.attributes[a] ?? 5));
        const avg = sum / attrs.length;
        // 5 is baseline (1.0). Each point above 5 is +10%, each point below is -10%.
        return 1.0 + (avg - 5) * 0.1;
    }

    // Rest need feeds into work speed. Exhausted workers (rest=0) work at 50% speed.
    getRestMult(u) { return this.getWorkMult(u); }  // backwards-compat alias

    getWorkMult(u) {
        if (u.isEnemy || u.type !== 'worker') return 1.0;
        const restMult = 0.5 + (u.needs?.rest ?? 1.0) * 0.5;  // 0.5–1.0
        const moodMult = 0.6 + (u.mood ?? 1.0) * 0.4;          // 0.6–1.0
        return restMult * moodMult;
    }

    _applyRareTraits(u) {
        const r = Math.random();
        if (r < 0.005) {
            // Albinism
            u.phenotype.skinHex = 0xf0e8d8; u.phenotype.hairHex = 0xf0f0e8; u.phenotype.eyeHex = 0xeeddcc;
            this.scene.uiManager.showFloatText(u.x, u.y - 24, '✦ Albino!', '#f0e8e0');
        } else if (r < 0.010) {
            // Gigantism
            u.phenotype.heightScale = Math.min(1.4, u.phenotype.heightScale + 0.3);
            u.attributes.str = Math.min(10, u.attributes.str + 2);
            u.attributes.con = Math.min(10, u.attributes.con + 1);
            u.attributes.agi = Math.max(1, u.attributes.agi - 1);
            u.maxHp = 10 + u.attributes.con; u.hp = u.maxHp;
            this.scene.uiManager.showFloatText(u.x, u.y - 24, '✦ Giant!', '#ddaa44');
        } else if (r < 0.015) {
            // Dwarfism
            u.phenotype.heightScale = Math.max(0.6, u.phenotype.heightScale - 0.25);
            u.attributes.str = Math.max(1, u.attributes.str - 1);
            u.attributes.dex = Math.min(10, u.attributes.dex + 1);
            u.attributes.agi = Math.min(10, u.attributes.agi + 1);
            this.scene.uiManager.showFloatText(u.x, u.y - 24, '✦ Dwarf!', '#cc88cc');
        } else if (r < 0.020) {
            // Prodigy: one burning passion skill starts at level 4
            const burning = Object.entries(u.passions ?? {}).find(([,v]) => v === 'burning');
            if (burning) {
                u.skills[burning[0]].level = 4;
                u.skills[burning[0]].xp    = 30;
                this.scene.uiManager.showFloatText(u.x, u.y - 24, `✦ Prodigy: ${burning[0]}!`, '#ffdd44');
            }
        }
    }

    handleSuccession(deceased) {
        if (!deceased.homeConstructId) return;
        const alive = this.scene.units.filter(u =>
            !u.isEnemy && u.hp > 0 && u.id !== deceased.id && u.type === 'worker' && u.age >= 2);

        if (deceased.isArchon) {
            this._archonSuccession(deceased, alive);
        } else {
            // Ordinary household: eldest child inherits the home slot
            const children = alive.filter(u => u.fatherId === deceased.id || u.motherId === deceased.id);
            const heir = children.length
                ? children.reduce((a, b) => b.age > a.age ? b : a)
                : alive.find(u => u.fatherId === deceased.fatherId || u.motherId === deceased.motherId);
            if (heir) {
                heir.homeConstructId = deceased.homeConstructId;
                this.scene.uiManager.showFloatText(heir.x, heir.y - 16, `${heir.name} inherits`, '#c8a030');
            }
        }
    }

    _archonSuccession(deceased, alive) {
        const archonHome = (() => { const c = this.scene.constructManager?.getById(deceased.homeConstructId); return c?.built ? c : null; })();

        // Priority: 1) eldest adult child, 2) housemates, 3) any adult
        const children   = alive.filter(u => u.fatherId === deceased.id || u.motherId === deceased.id);
        const housemates = alive.filter(u => u.homeConstructId === archonHome?.id);
        const pool = children.length ? children
                   : housemates.length ? housemates
                   : alive;

        if (!pool.length) {
            this.scene.showPhaseMessage('The line has ended — no heir to the Archonship!', 0xff3311);
            return;
        }

        const heir = pool.reduce((a, b) => b.age > a.age ? b : a);
        heir.isArchon   = true;
        // Heir keeps their existing home; if none, inherit the archon's house
        if (!heir.homeConstructId && archonHome) heir.homeConstructId = archonHome.id;

        this.redrawUnit(heir);
        this.scene.showPhaseMessage(`⚜ ${heir.name} succeeds as Archon`, 0xffdd44);
        this.scene.uiManager.showFloatText(heir.x, heir.y - 20, '⚜ Archon', '#ffdd44');
    }

    _gainSkillXp(u, skillName) {
        const skill = u.skills?.[skillName];
        if (!skill) return;
        const intMult  = u.attributes ? 1 + (u.attributes.int - 5) * 0.1 : 1.0;
        // Joy dampens/amplifies passion bonus. Joyless workers still feel passion, just less keenly.
        const joyMult  = u.type === 'worker' ? 0.7 + (u.needs?.joy    ?? 1.0) * 0.3 : 1.0;
        const passMult = (u.passions?.[skillName] === 'burning' ? 2.5
                       : u.passions?.[skillName] === 'interested' ? 1.5 : 1.0) * joyMult;
        // Social need gates knowledge transfer. Isolated workers learn slower.
        const socialMult = u.type === 'worker' ? 0.7 + (u.needs?.social ?? 1.0) * 0.3 : 1.0;
        // Cumulative XP required to reach each level (index = level-1)
        const XP_THRESHOLDS = [0, 25, 75, 175, 400, 900, 2000, 4500, 10000, 22000];
        skill.xp += intMult * passMult * socialMult;
        let newLevel = 1;
        for (let i = XP_THRESHOLDS.length - 1; i >= 0; i--) {
            if (skill.xp >= XP_THRESHOLDS[i]) { newLevel = i + 1; break; }
        }
        if (newLevel > skill.level) {
            skill.level = newLevel;
            this.scene.uiManager.showFloatText(u.x, u.y - 20, `${skillName} ${newLevel}!`, '#ffcc44');
        }
    }

    // Age → uniform scale applied to the sprite. All unit types use a single
    // adult-sized shape; the engine shrinks it for children and youth.
    static ageScale(age) {
        if (age === 0)  return 0.48;
        if (age === 1)  return 0.72;
        if (age >= 12)  return 0.88;
        if (age >= 10)  return 0.95;
        return 1.0;
    }

    tick(time, dt, frame = 0) {
        const units = this.scene.units;
        const STRIDE = 3; // each unit ticks every 3rd frame, accumulates dt in between

        for (let i = 0; i < units.length; i++) {
            const u = units[i];
            if (u.hp <= 0) continue;

            // Rendering state always current
            const inTower = u.taskType === 'garrison' || u.aiMode === 'tower_assault';
            u._alpha = inTower ? 0.55 : u.isInside ? 0.15 : 1.0;
            this._isUnitCulled(u);

            // Accumulate dt; only run full tick on this unit's assigned frame slot
            u._dtAcc = (u._dtAcc ?? 0) + dt;
            if (frame % STRIDE !== i % STRIDE) continue;

            const unitDt = u._dtAcc;
            u._dtAcc = 0;

            if (!u.isEnemy && u.hp < u.maxHp) {
                const nearGarlic = (this.scene.constructManager?._garlicGardens ?? []).some(b =>
                    Phaser.Math.Distance.Between(u.x, u.y, (b.tx+b.width/2)*TILE, MAP_OY+(b.ty+b.width/2)*TILE) < 5 * TILE);
                if (nearGarlic) {
                    u._regenAcc = (u._regenAcc || 0) + unitDt;
                    if (u._regenAcc >= 2.0) { u.hp = Math.min(u.maxHp, u.hp + 1); u._regenAcc = 0; }
                }
            }

            const _ut0 = performance.now();
            if (u.isEnemy) {
                if (!this.scene.enemiesDisabled) this.tickEnemy(u, time, unitDt);
            } else {
                this.tickPlayer(u, time, unitDt);
            }
            const _utMs = performance.now() - _ut0;
            if (_utMs > 20) GameLogger.log('slow_unit', { u: u.name ?? u.type, ms: Math.round(_utMs), task: u.taskType ?? 'none', role: u.role ?? 'none' });
        }

        // Handle newly-dead units: enemies fade out; friendly workers become burialable corpses.
        for (const u of this.scene.units) {
            if (u.hp > 0 || u._dying) continue;
            u._dying = true;
            u._alpha = 1.0;
            if (u.nameLabel) { u.nameLabel.destroy(); u.nameLabel = null; }
            if (u._zzzLabel) { u._zzzLabel.destroy(); u._zzzLabel = null; }
            if (u.isScout) this.waveIntelFlash();
            GameLogger.log('death', { u: u.name ?? '?', enemy: !!u.isEnemy, cause: (u.needs?.food ?? 1) <= 0 ? 'starvation' : 'combat', hp: +u.hp.toFixed(1) });
            if (!u.isEnemy && u.type === 'worker') {
                if (u.spouseId) {
                    const spouse = this.scene.units.find(s => s.id === u.spouseId);
                    if (spouse) {
                        spouse.spouseId = null;
                        spouse._widowed = true;
                        const title = spouse.gender === 'female' ? 'widow' : 'widower';
                        this.scene.uiManager?.showFloatText?.(spouse.x, spouse.y - 24,
                            `${spouse.name} is a ${title}`, '#bbaacc');
                    }
                }
                // Propagate grief to all units who knew the deceased
                const deadName = u.name ?? 'them';
                for (const w of this.scene.units) {
                    if (w === u || w.isEnemy || w.hp <= 0) continue;
                    const rel = w.relations?.[u.id] ?? 0;
                    if (rel <= 0.08) continue;
                    const strength = Math.min(1, rel * 0.9);
                    w._grief = Math.min(1, (w._grief ?? 0) + strength);
                    if (strength > 0.3) {
                        this.scene.uiManager?.showFloatText?.(w.x, w.y - 20,
                            `mourning ${deadName}`, '#9988aa');
                    }
                    delete (w.relations ?? {})[u.id];
                }
                this.handleSuccession(u);
            }
            if (!u.isEnemy && u.isHero) {
                this.scene.showPhaseMessage(`${u.name} has fallen! Morale collapses!`, 0xff3311);
                this.scene.units.filter(f => !f.isEnemy && !f.isRouting && f.type !== 'worker' && f.hp > 0
                    && Phaser.Math.Distance.Between(u.x, u.y, f.x, f.y) < 8 * TILE
                ).forEach(f => {
                    f.isRouting = true;
                    this.scene.uiManager.showFloatText(f.x, f.y - 18, 'routing!', '#ff4422');
                });
            }
            if (!u.isEnemy && u.type === 'worker') {
                // Friendly workers become corpses awaiting burial — no fade
                u._corpse = true;
                u.isSleeping = false;
                u.isInside = false;
                u.taskType = null; u.targetNode = null; u.moveTo = null;
                this.scene.uiManager?.showFloatText?.(u.x, u.y - 22, `${u.name ?? 'Worker'} has died`, '#cc8899');
            } else {
                this.scene.tweens.add({
                    targets: u, _alpha: 0, duration: 280,
                    onComplete: () => { this._byUnitId.delete(u.id); this.scene.units = this.scene.units.filter(x => x !== u); },
                });
            }
        }

        // Single-pass draw of all units into one shared Graphics object.
        this._redrawAllUnits();
        this._redrawIdlePulse(time);
        this._redrawSelections();
        this.scene.uiManager.updateEnemyCount();
    }

    tickPlayer(u, time, dt) {
        if (u.type === 'worker') {
            if (u.isArchon && ENABLE_PROACTIVE_AI) this._runArchonAI(u, dt);
            this.tickWorker(u, time, dt);
            return;
        }
        // Garrisoned combat unit — walk to tower; melee guards also fight assaulters
        if (u.taskType === 'garrison') {
            this.handleGarrisonTask(u, dt);
            const RANGED = new Set(['archer','slinger','toxotes','scout']);
            if (!RANGED.has(u.type)) this.updateCombat(u, time, dt);
            return;
        }

        if (u.moveTo) {
            const d = Phaser.Math.Distance.Between(u.x, u.y, u.moveTo.x, u.moveTo.y);
            if (d > 3) {
                const a = Phaser.Math.Angle.Between(u.x, u.y, u.moveTo.x, u.moveTo.y);
                u.x += Math.cos(a) * u.speed * dt;
                u.y += Math.sin(a) * u.speed * dt;
                return;
            }
            u.x = u.moveTo.x; u.y = u.moveTo.y; u.moveTo = null;
        }

        this.updateCombat(u, time, dt);
    }

    selectUnit(id, add) {
        if (!add) this.deselect();
        const u = this.scene.units.find(u => u.id === id && !u.isEnemy);
        if (!u) return;
        u.selected = true; this.scene.selIds.add(id);
        this.redrawUnit(u); this.scene.updateUI();
    }

    deselect() {
        this.scene.units.forEach(u => { if (u.selected) { u.selected = false; this.redrawUnit(u); } });
        this.scene.selIds.clear(); this.scene.updateUI();
    }

    boxSelect(x1, y1, x2, y2, add) {
        if (!add) this.deselect();
        this.scene.units.filter(u => !u.isEnemy && u.hp > 0
            && u.x >= x1 && u.x <= x2 && u.y >= y1 && u.y <= y2)
            .forEach(u => this.selectUnit(u.id, true));
    }

    unitAt(x, y) {
        const r = this.scene.sys.game.device.input.touch ? 16 : 12;
        return this.scene.units.find(u => u.hp > 0 && Phaser.Math.Distance.Between(x, y, u.x, u.y) < r);
    }

    orderWorkersToNode(node) {
        const roleMap = {
            berry_bush: 'forager', wild_garden: 'forager', olive_grove: 'forager',
            small_tree: 'woodcutter', large_tree: 'woodcutter',
            small_boulder: 'miner', large_boulder: 'miner', ore_vein: 'miner',
            scrub: 'shepherd',
        };
        const sel = this.scene.units.filter(u => u.selected && !u.isEnemy && u.hp > 0 && u.type === 'worker' && u.age >= 2);
        if (!sel.length) return false;
        for (const u of sel) {
            u.targetNode = node; u.taskType = null; u.taskConstructId = null;
            u.moveTo = null;
            u.role = roleMap[node.type] ?? 'forager';
        }
        this.scene.uiManager?.showFloatText?.(node.x, node.y - 18, `${sel.length} → harvest`, '#cfe8a0');
        return true;
    }

    orderWorkersToConstruct(b) {
        const sel = this.scene.units.filter(u => u.selected && !u.isEnemy && u.hp > 0 && u.type === 'worker' && u.age >= 2);
        if (!sel.length) return false;
        for (const u of sel) {
            u.targetNode = null; u.taskType = 'build'; u.taskConstructId = b.id;
            u.moveTo = null; u._orderedSleepId = null;
            u.role = 'builder';
        }
        this._orderFloat(b, `${sel.length} → build`, '#a0d8e8');
        return true;
    }

    // Confirmation float-text anchored over a construct (tile-based) or edge.
    _orderFloat(b, msg, color) {
        const fx = b.tx != null ? (b.tx + (b.width ?? 1) / 2) * TILE : (b.x ?? this.scene.cameras.main.midPoint.x);
        const fy = b.ty != null ? MAP_OY + b.ty * TILE - 6 : (b.y ?? this.scene.cameras.main.midPoint.y);
        this.scene.uiManager?.showFloatText?.(fx, fy, msg, color);
    }

    // Manual order: haul a specific ground-item pile to storage.
    orderWorkersToHaul(item) {
        const sel = this.scene.units.filter(u => u.selected && !u.isEnemy && u.hp > 0 && u.type === 'worker' && u.age >= 2);
        if (!sel.length) return false;
        for (const u of sel) {
            u.taskType = 'haul'; u.targetItemId = item.id;
            u.targetNode = null; u.taskConstructId = null; u.moveTo = null; u._orderedSleepId = null;
        }
        item.reserved = sel[0].id;
        this.scene.uiManager?.showFloatText?.(item.x, item.y - 16, `${sel.length} → haul`, '#e8d0a0');
        return true;
    }

    // Manual order: work at a specific production construct (oven/mill/etc.).
    // Seeds the worker's role to the building's job and lets seekWorkshopTask bind the station.
    orderWorkersToWorkshop(b) {
        const job = CONSTRUCTS[b.type]?.job;
        if (!job || !(job in WORKSHOP_JOBS)) return false;
        const sel = this.scene.units.filter(u => u.selected && !u.isEnemy && u.hp > 0 && u.type === 'worker' && u.age >= 2);
        if (!sel.length) return false;
        const now = this.scene.time.now;
        for (const u of sel) {
            u.role = job;
            u.taskType = null; u.targetNode = null; u.taskConstructId = null;
            u.moveTo = null; u._orderedSleepId = null;
            u._roleCommitUntil = now + 60000;   // hold the role so the AI won't re-pick it
            u.lastSeek = 0;                       // force an immediate workshop seek
        }
        this._orderFloat(b, `${sel.length} → work`, '#e8c070');
        return true;
    }

    // Manual order: repair a specific damaged construct.
    orderWorkersToRepair(b) {
        const sel = this.scene.units.filter(u => u.selected && !u.isEnemy && u.hp > 0 && u.type === 'worker' && u.age >= 2);
        if (!sel.length) return false;
        for (const u of sel) {
            u.taskType = 'repair'; u.taskConstructId = b.id; u.workProgress = 0;
            u.targetNode = null; u.moveTo = null; u._orderedSleepId = null;
            u.role = 'builder';
        }
        this._orderFloat(b, `${sel.length} → repair`, '#a0e8c0');
        return true;
    }

    // Manual order: send selected workers to sleep at a specific bed / tent / house now.
    orderWorkersToSleep(b) {
        const sel = this.scene.units.filter(u => u.selected && !u.isEnemy && u.hp > 0 && u.type === 'worker' && u.age >= 2);
        if (!sel.length) return false;
        for (const u of sel) {
            u._orderedSleepId = b.id;
            u.taskType = null; u.targetNode = null; u.moveTo = null;
        }
        const fx = b.tx != null ? (b.tx + (b.width ?? 1) / 2) * TILE : sel[0].x;
        const fy = b.ty != null ? MAP_OY + b.ty * TILE - 6 : sel[0].y;
        this.scene.uiManager?.showFloatText?.(fx, fy, `${sel.length} → sleep`, '#aab0ff');
        return true;
    }

    assignHunters(deer) {
        const sel = this.scene.units.filter(u => u.selected && !u.isEnemy && u.hp > 0
            && (u.type === 'worker' || u.type === 'archer'));
        if (!sel.length) return false;
        for (const u of sel) {
            u.targetDeer = deer.id;
            if (u.type === 'worker') { u.role = 'hunter'; u.taskType = null; u.targetNode = null; }
        }
        this.scene.uiManager.showFloatText(deer.x, deer.y - 20, `${sel.length} hunting`, '#ffcc66');
        return true;
    }

    assignShepherds(sheep) {
        const sel = this.scene.units.filter(u => u.selected && !u.isEnemy && u.hp > 0 && u.type === 'worker' && u.age >= 2);
        if (!sel.length) return false;
        for (const u of sel) {
            u.role = 'shepherd';
            u.targetSheep = sheep.id;
            u.tamingIntent = !sheep.isTamed; // tame if wild, just lead if already tamed
            u.tameProgress = 0;
            u.taskType = null; u.targetNode = null;
        }
        const verb = sheep.isTamed ? 'leading' : 'taming';
        this.scene.uiManager.showFloatText(sheep.x, sheep.y - 22, `${sel.length} ${verb}`, '#e8e8cc');
        return true;
    }

    handleGatherTask(u, dt) {
        const n = u.targetNode;
        if (!n || n.stock <= 0) { u.targetNode = null; return; }
        if (this.moveToward(u, n.x, n.y, 20, dt)) return;

        const isTree = n.type === 'small_tree' || n.type === 'large_tree';

        // Felling phase
        if (isTree && !n.felled) {
            // Target: 5s felling
            if (n.fellWork === undefined) n.fellWork = n.type === 'large_tree' ? 5.0 : 5.0;
            const attrMult = this.getAttrMult(u, ['str']);
            const skillSpeed = (1.0 + (u.skills.woodcutting?.level ?? 1) * 0.2) * attrMult * this.getRestMult(u);
            n.fellWork -= dt * skillSpeed;
            if (n.fellWork <= 0) {
                n.felled = true;
                this._gainSkillXp(u, 'woodcutting');
                this.scene.mapManager.drawResourceNodes();
                this.scene.uiManager.showFloatText(n.x, n.y - 14, '🪓 timber!', '#c0a050');
            }
            return;
        }

        const skillKey = isTree ? 'woodcutting'
                       : (n.type.includes('boulder') || n.type.includes('ore') || n.type === 'mountain') ? 'mining'
                       : 'farming';

        const attrMult = isTree ? this.getAttrMult(u, ['str'])
                       : (n.type.includes('boulder') || n.type.includes('ore') || n.type === 'mountain') ? this.getAttrMult(u, ['str'])
                       : this.getAttrMult(u, ['dex']);

        const workSpeed = (1.0 + (u.skills[skillKey]?.level ?? 1) * 0.2) * attrMult * this.getRestMult(u);

        // Timing: Wood (felled)=2s, Berries=1s, Stone/Ore=3s
        const threshold = isTree ? 2.0 : (n.type === 'berry_bush' ? 1.0 : 3.0);
        u.workProgress = (u.workProgress ?? 0) + dt * workSpeed;

        if (u.workProgress >= threshold) {
            u.workProgress = 0;
            const res = n.type === 'mountain' ? (Math.random() < 0.1 ? 'Materials.Metal.Copper.Ore' : 'Materials.Stone.Limestone') : NODES[n.type]?.resource;

            // Harvest a burst from the node and drop items on the ground
            const pick = Math.min(n.stock, 3 + Math.floor(Math.random() * 4));
            n.stock -= pick;

            // Greece civ bonus: olive groves yield 40% extra
            const civBonus = (this.scene.civ === 'greece' && (n.type === 'olive_grove' || n.type === 'wild_garden') && res === 'Food.Produce.Olive')
                ? Math.max(1, Math.floor(pick * 0.4)) : 0;

            this.spawnGroundItems(n, res, pick + civBonus);
            this.scene.mapManager.redrawNode(n);

            // Track daily production for resource nodes
            n.dailyProduction = n.dailyProduction ?? {};
            n.dailyProduction[res] = (n.dailyProduction[res] ?? 0) + pick;

            // Task e1k: Hired workers get a 10% commission on materials
            const pile = this.scene.constructs.find(b =>
                (b.type === 'woodshed' || b.type === 'stonepile') && b.built && b.isPublic && b.hiring);
            if (pile) {
                u.commission = u.commission ?? {};
                u.commission[res] = (u.commission[res] ?? 0) + Math.max(1, Math.floor(pick * 0.1));
            }

            this._gainSkillXp(u, skillKey);
            this.scene.uiManager.showFloatText(u.x, u.y - 14, `+${pick}${res[0].toUpperCase()}`, '#ffffff');

            // Harvesting a wild plant teaches the colony to cultivate its domestic crop(s). (#22)
            const newCrops = (CROPS_BY_WILD[n.type] ?? []).filter(k => !this.scene.discoveredCrops.has(k));
            if (newCrops.length) {
                for (const k of newCrops) this.scene.discoveredCrops.add(k);
                this.scene.uiManager?.showToast?.(
                    `🌱 Learned to farm: ${newCrops.map(k => CROPS[k].label).join(', ')}`, '#bfe8a0');
            }

            // Debris byproducts: trees drop sticks, boulders drop small stones — also on the ground
            if (res === 'Materials.Wood.Pine') {
                const debris = Math.floor(pick * (0.5 + Math.random() * 0.5));
                if (debris > 0) this.spawnGroundItems(n, 'Materials.Wood.Pine.Sticks', debris);
            } else if (res === 'Materials.Stone.Limestone') {
                const debris = Math.floor(pick * (0.5 + Math.random() * 0.5));
                if (debris > 0) this.spawnGroundItems(n, 'Materials.Stone.Limestone.Stones', debris);
            }

            if (n.type === 'mountain') {
                if (n.stock <= 0) {
                    this.scene.chunkManager?.setTile(n.tx, n.ty, T_ROCK);
                    // chunk will auto-redraw via setTile
                }
            } else if (n.stock <= 0) {
                n.felled = false;
                n.sapling = true;
                n.stump = true;   // stump-sapling, distinct from seeded sapling
                n.saplingTimer = 0;
                this.scene.mapManager.drawResourceNodes();
            }
            if (n.stock <= 0) u.targetNode = null;
        }
    }

    // ── Ground Item System ────────────────────────────────────────────────────
    // Each world tile (32px) is divided into a 3×3 grid of cubits.
    // Cubit centers within the tile: [5, 16, 27]px — one item stack per cubit.
    // Same resource at the same cubit always merges into a single pile.

    spawnGroundItems(n, res, qty) {
        const SUB = [5, 16, 27];
        const items   = this.scene.groundItems;
        const itemMap = this.scene.groundItemMap ??= new Map();

        // Node's tile coords
        const ntx = Math.floor(n.x / TILE);
        const nty = Math.floor((n.y - MAP_OY) / TILE);

        // Build sorted candidate cubits in the 3×3 tile area around the node
        const candidates = [];
        for (let dtx = -1; dtx <= 1; dtx++) {
            for (let dty = -1; dty <= 1; dty++) {
                const tx = ntx + dtx, ty = nty + dty;
                for (let sx = 0; sx < 3; sx++) {
                    for (let sy = 0; sy < 3; sy++) {
                        const px = tx * TILE + SUB[sx];
                        const py = MAP_OY + ty * TILE + SUB[sy];
                        candidates.push({ tx, ty, sx, sy, px, py,
                            d: Math.hypot(n.x - px, n.y - py) });
                    }
                }
            }
        }
        candidates.sort((a, b) => a.d - b.d);

        // Build fast occupied-cubit set
        const occupied = new Set(items.map(i => i.subKey));

        let remaining = qty;

        // Pass 1: merge into existing same-resource pile
        for (const c of candidates) {
            if (remaining <= 0) break;
            const sk = `${c.tx},${c.ty},${c.sx},${c.sy}`;
            const mk = `${sk}:${res}`;
            const existing = itemMap.get(mk);
            if (existing) {
                existing.qty += remaining;
                remaining = 0;
                this.drawGroundItem(existing);
            }
        }

        // Pass 2: create a new pile at the nearest empty cubit
        for (const c of candidates) {
            if (remaining <= 0) break;
            const sk = `${c.tx},${c.ty},${c.sx},${c.sy}`;
            if (!occupied.has(sk)) {
                const item = {
                    id: this.scene.getId(), resource: res, qty: remaining,
                    x: c.px, y: c.py, subKey: sk,
                    gfx: null, labelObj: null, reserved: null,
                };
                this.drawGroundItem(item);
                items.push(item);
                itemMap.set(`${sk}:${res}`, item);
                occupied.add(sk);
                remaining = 0;
            }
        }

        // Overflow: all 81 cubits occupied — merge into nearest same-resource or any pile
        if (remaining > 0) {
            for (const c of candidates) {
                const mk = `${c.tx},${c.ty},${c.sx},${c.sy}:${res}`;
                const existing = itemMap.get(mk) ?? items[0];
                if (existing) {
                    existing.qty += remaining;
                    this.drawGroundItem(existing);
                    break;
                }
            }
        }
    }

    drawGroundItem(item) {
        const GROUND_COLORS = {
            'Materials.Wood.Pine.Sticks': 0xb8864e,
            'Materials.Wood':    0x7a4a1e,
            'Materials.Stone.Limestone.Stones': 0xbbbbcc,
            'Materials.Stone':   0x8888aa,
            'Materials.Metal':   0x557755,
            'Materials.Textile': 0xe8d8a0,
            'Food.Fish':         0x88ccee,
            'Food.':             0x88cc44,
            'Equipment.':        0xddaa44,
            'Textile.':          0xd0b880,
        };
        const col = Object.entries(GROUND_COLORS)
            .find(([k]) => item.resource.startsWith(k))?.[1] ?? 0xaaaaaa;

        item.gfx?.destroy();
        item.labelObj?.destroy();
        item.gfx = this.scene._w(this.scene.add.graphics().setDepth(3.5));
        item.gfx.fillStyle(col, 0.92).fillRoundedRect(item.x - 5, item.y - 5, 10, 10, 2);
        item.gfx.lineStyle(1, 0x000000, 0.35).strokeRoundedRect(item.x - 5, item.y - 5, 10, 10, 2);
        item.labelObj = this.scene._w(this.scene.add.text(item.x, item.y - 8, `${item.qty}`, {
            fontSize: '8px', color: '#ffffff', fontFamily: THEME.fontMono,
            stroke: '#000000', strokeThickness: 2, resolution: 2,
        }).setOrigin(0.5).setDepth(3.6));
    }

    removeGroundItem(item) {
        item.gfx?.destroy();
        item.labelObj?.destroy();
        const idx = this.scene.groundItems.indexOf(item);
        if (idx !== -1) this.scene.groundItems.splice(idx, 1);
        this.scene.groundItemMap?.delete(`${item.subKey}:${item.resource}`);
    }
}

// ── Mixin assignments ─────────────────────────────────────────────────────────
Object.assign(UnitManager.prototype, unitRenderMethods);
Object.assign(UnitManager.prototype, unitCombatMethods);
Object.assign(UnitManager.prototype, unitMovementMethods);
Object.assign(UnitManager.prototype, unitNeedsMethods);
Object.assign(UnitManager.prototype, unitEnemyMethods);
Object.assign(UnitManager.prototype, unitWorkerMethods);
