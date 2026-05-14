import {
    TILE, MAP_OY, MAP_W, MAP_H, MAP_BOTTOM,
    TILE_SPD, T_GRASS, T_ROCK, HIGH_GROUND_BONUS,
    VET_LEVELS,
    pickName,
    ENABLE_PROACTIVE_AI, DESIRE_THRESHOLD, ROAD_DESIRE, ROAD_NONE, HUNGER_THRESHOLD,
    ARCHON_BUILD_ORDER,
    randomAttributes, blendAttributes, randomPhenotype, blendPhenotype,
    randomPassions, blendPassions,
    emptySkills,
} from '../config/gameConstants.js';
import { CONSTRUCTS } from '../content/constructs/index.js';
import { NODES } from '../content/nodes/index.js';
import { ANIMALS } from '../content/animals/index.js';
import { ITEMS } from '../content/items/index.js';
import { JOBS, WORKSHOP_JOBS } from '../content/jobs/index.js';
import { UNITS } from '../content/units/index.js';
import { MathUtils } from '../utils/MathUtils.js';
import { Pathfinder } from '../utils/Pathfinder.js';

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
        // Idle-worker pulse ring layer (depth 4) and selection layer (depth 5).
        this.idleGfx = scene.add.graphics().setDepth(4);
        this.selGfx  = scene.add.graphics().setDepth(5);
    }

    spawnTrainedUnit(construct, type) {
        const u = this.spawnUnit(type, construct.tx * TILE + TILE/2, MAP_OY + construct.ty * TILE + TILE/2, !!construct.faction);
        this.scene.uiManager.showFloatText(u.x, u.y - 20, `${type} ready!`, '#88ff88');
    }

    spawnUnit(type, x, y, isEnemy) {
        const def = UNITS[type];
        const gender = Math.random() < 0.5 ? 'male' : 'female';

        // Genealogy & genetics (workers only — soldiers use def defaults)
        const isWorker = type === 'worker';
        const attributes = isWorker ? randomAttributes() : null;
        const phenotype  = isWorker ? randomPhenotype()  : null;
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
            wallSide: 0, homeConstructId: null, age: 2,
            taskType: null, taskConstructId: null, targetNode: null,
            carrying: { 'Food.Grain.Wheat': 0, 'Food.Grain.Wheat.Flour': 0, 'Food.Grain.Wheat.Bread': 0, 'Food.Meat.Venison': 0, 'Food.Meat.Venison.Sausages': 0, 'Food.Produce.Berry': 0, 'Food.Produce.Olive': 0, 'Materials.Stone.Limestone': 0, 'Materials.Wood.Pine': 0, 'Materials.Wood.Pine.Sticks': 0, 'Materials.Stone.Limestone.Stones': 0, 'Textile.Fiber.Wool': 0, 'Textile.Hide.Deer': 0, 'Materials.Metal.Copper.Ore': 0 }, carryMax,
            role: null, replantTimer: 0, trainTimer: 0, lastSeek: 0,
            roleMemory: {}, targetDeer: null, targetSheep: null,
            nightsSurvived: 0, vetLevel: 0, isInside: false, _wageCollected: false,
            fetchConstructId: null, _prevRole: null,
            taskStack: [],
            // Genealogy
            fatherId: null, motherId: null, spouseId: null,
            attributes, phenotype, passions,
            skills: emptySkills(),
            workProgress: 0,
            needs: { food: 1.0, rest: 1.0, social: 0.8, joy: 0.8 },
            mood: 1.0,
            gfx: this.scene._w(this.scene.add.graphics().setDepth(6)),
        };
        if (isWorker) this.assignVocation(unit);
        this.redrawUnit(unit);
        this.scene.units.push(unit);
        return unit;
    }

    spawnChild(father, mother) {
        const home = this.scene.constructs.find(b => b.id === (father.homeConstructId ?? mother.homeConstructId));
        if (!home) return null;

        const cx = (home.tx + home.width / 2) * TILE;
        const cy = MAP_OY + (home.ty + home.height / 2) * TILE;

        const child = this.spawnUnit('worker', cx, cy, false);
        child.fatherId  = father.id;
        child.motherId  = mother.id;
        child.age       = 0;
        child.homeConstructId = home.id;
        child.attributes = blendAttributes(father.attributes ?? randomAttributes(), mother.attributes ?? randomAttributes());
        child.phenotype  = blendPhenotype(father.phenotype ?? randomPhenotype(), mother.phenotype ?? randomPhenotype());
        child.passions   = blendPassions(father.passions ?? randomPassions(), mother.passions ?? randomPassions());
        child.maxHp   = 10 + child.attributes.con;
        child.hp      = child.maxHp;
        child.speed   = UNITS.worker.speed * (1 + (child.attributes.agi - 5) * 0.04);
        child.carryMax = 3 + Math.round(child.attributes.str / 2);

        this._applyRareTraits(child);
        this.redrawUnit(child);  // re-draw with age:0 size after overriding attributes
        this.scene.uiManager.showFloatText(cx, cy - 16, `${child.name} born!`, '#ffeeaa');
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
    getRestMult(u) {
        if (u.isEnemy || u.type !== 'worker') return 1.0;
        return 0.5 + (u.needs?.rest ?? 1.0) * 0.5;
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
        const archonHome = this.scene.constructs.find(b => b.id === deceased.homeConstructId && b.built);

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
        if (age === 0) return 0.48;
        if (age === 1) return 0.72;
        return 1.0;
    }

    tick(time, dt) {
        for (const u of this.scene.units) {
            if (u.hp <= 0) continue;

            if (!u.isEnemy && u.hp < u.maxHp) {
                const nearGarlic = this.scene.constructs.some(b => b.type === 'garden' && b.built && b.cropType === 'garlic'
                    && Phaser.Math.Distance.Between(u.x, u.y, (b.tx+b.width/2)*TILE, MAP_OY+(b.ty+b.width/2)*TILE) < 5 * TILE);
                if (nearGarlic) {
                    u._regenAcc = (u._regenAcc || 0) + dt;
                    if (u._regenAcc >= 2.0) { u.hp = Math.min(u.maxHp, u.hp + 1); u._regenAcc = 0; }
                }
            }

            if (u.isEnemy) {
                if (!this.scene.enemiesDisabled) this.tickEnemy(u, time, dt);
            } else {
                this.tickPlayer(u, time, dt);
            }
            u.gfx.setPosition(u.x, u.y);
            if (u.nameLabel) u.nameLabel.setPosition(u.x, u.y - 12);

            const inTower = u.taskType === 'garrison' || u.aiMode === 'tower_assault';
            u.gfx.setAlpha(inTower ? 0.55 : u.isInside ? 0.15 : 1.0);

            if (!this._isUnitCulled(u)) this.redrawUnit(u);
        }
        this._redrawIdlePulse(time);

        this._redrawSelections();

        this.scene.units.filter(u => u.hp <= 0).forEach(u => {
            this.scene.tweens.add({ targets: u.gfx, alpha: 0, duration: 280, onComplete: () => u.gfx.destroy() });
            if (u.nameLabel) { u.nameLabel.destroy(); u.nameLabel = null; }
            if (u._zzzLabel) { u._zzzLabel.destroy(); u._zzzLabel = null; }
            if (u.isScout) { this.waveIntelFlash(); return; }
            if (!u.isEnemy && u.type === 'worker') {
                // Widow/widower becomes eligible to remarry
                if (u.spouseId) {
                    const spouse = this.scene.units.find(s => s.id === u.spouseId);
                    if (spouse) spouse.spouseId = null;
                }
                this.handleSuccession(u);
            }
            // Hero death: morale collapse
            if (!u.isEnemy && u.isHero) {
                this.scene.showPhaseMessage(`${u.name} has fallen! Morale collapses!`, 0xff3311);
                this.scene.units.filter(f => !f.isEnemy && !f.isRouting && f.type !== 'worker' && f.hp > 0
                    && Phaser.Math.Distance.Between(u.x, u.y, f.x, f.y) < 8 * TILE
                ).forEach(f => {
                    f.isRouting = true;
                    this.scene.uiManager.showFloatText(f.x, f.y - 18, 'routing!', '#ff4422');
                });
            }
        });
        this.scene.units = this.scene.units.filter(u => u.hp > 0);
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
        return true;
    }

    orderWorkersToConstruct(b) {
        const sel = this.scene.units.filter(u => u.selected && !u.isEnemy && u.hp > 0 && u.type === 'worker' && u.age >= 2);
        if (!sel.length) return false;
        for (const u of sel) {
            u.targetNode = null; u.taskType = 'build'; u.taskConstructId = b.id;
            u.moveTo = null;
            u.role = 'builder';
        }
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

            let pick = 0;
            while (pick < n.stock && this.canUnitCarryMore(u, res, pick + 1)) {
                pick++;
            }
            if (pick === 0) { u.targetNode = null; return; }

            n.stock -= pick; u.carrying[res] += pick;

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

            // Debris byproducts: trees drop sticks, boulders drop stones
            if (res === 'Materials.Wood.Pine' && this.scene.economyManager.hasStorageSpace('Materials.Wood.Pine.Sticks')) {
                const debris = Math.floor(pick * (0.5 + Math.random() * 0.5));
                if (debris > 0) this.scene.economyManager.addResource('Materials.Wood.Pine.Sticks', debris);
            } else if (res === 'Materials.Stone.Limestone' && this.scene.economyManager.hasStorageSpace('Materials.Stone.Limestone.Stones')) {
                const debris = Math.floor(pick * (0.5 + Math.random() * 0.5));
                if (debris > 0) this.scene.economyManager.addResource('Materials.Stone.Limestone.Stones', debris);
            }

            if (n.type === 'mountain') {
                if (n.stock <= 0) {
                    this.scene.terrainData[n.ty][n.tx] = T_ROCK;
                    this.scene.mapManager.drawMap(); // redraw terrain
                }
            } else if (n.stock <= 0) {
                n.felled = false;
                n.sapling = true;
                n.stump = true;   // stump-sapling, distinct from seeded sapling
                n.saplingTimer = 0;
                this.scene.mapManager.drawResourceNodes();
            }
            if (this.totalCarrying(u) >= u.carryMax || n.stock <= 0) u.targetNode = null;
        }
    }
}

// ── Mixin assignments ─────────────────────────────────────────────────────────
Object.assign(UnitManager.prototype, unitRenderMethods);
Object.assign(UnitManager.prototype, unitCombatMethods);
Object.assign(UnitManager.prototype, unitMovementMethods);
Object.assign(UnitManager.prototype, unitNeedsMethods);
Object.assign(UnitManager.prototype, unitEnemyMethods);
Object.assign(UnitManager.prototype, unitWorkerMethods);
