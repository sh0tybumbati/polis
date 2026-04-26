import {
    UDEF, TILE, MAP_OY, MAP_W, MAP_H, MAP_BOTTOM,
    TILE_SPD, T_GRASS, T_ROCK, HIGH_GROUND_BONUS,
    VET_LEVELS, BLDG, NODE_DEF, NODE_ROLE, BUILD_WORK,
    DEER_ATK_RANGE, SHEEP_TAME_COST, NUTRITION, pickName,
    ENABLE_PROACTIVE_AI, BLDG_CATS, DESIRE_THRESHOLD, ROAD_DESIRE, ROAD_NONE,
    randomAttributes, blendAttributes,
    randomPhenotype, blendPhenotype,
    randomPassions, blendPassions,
    emptySkills,
} from '../config/gameConstants.js';
import { MathUtils } from '../utils/MathUtils.js';

export default class UnitManager {
    constructor(scene) {
        this.scene = scene;
    }

    spawnUnit(type, x, y, isEnemy) {
        const def = UDEF[type];
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
            wallSide: 0, homeBldgId: null, age: 2,
            taskType: null, taskBldgId: null, targetNode: null,
            carrying: { wheat: 0, flour: 0, bread: 0, meat: 0, sausages: 0, olives: 0, stone: 0, wood: 0, sticks: 0, stones: 0, wool: 0, hide: 0, ore: 0 }, carryMax,
            role: null, replantTimer: 0, trainTimer: 0, lastSeek: 0,
            roleMemory: {}, targetDeer: null, targetSheep: null,
            nightsSurvived: 0, vetLevel: 0, isInside: false, _wageCollected: false,
            fetchBldgId: null, _prevRole: null,
            // Genealogy
            fatherId: null, motherId: null, spouseId: null,
            attributes, phenotype, passions,
            skills: emptySkills(),
            workProgress: 0,
            gfx: this.scene._w(this.scene.add.graphics().setDepth(6)),
        };
        this.redrawUnit(unit);
        this.scene.units.push(unit);
        return unit;
    }

    spawnChild(father, mother) {
        const home = this.scene.buildings.find(b => b.id === (father.homeBldgId ?? mother.homeBldgId));
        if (!home) return null;

        const cx = (home.tx + home.size / 2) * TILE;
        const cy = MAP_OY + (home.ty + home.size / 2) * TILE;

        const child = this.spawnUnit('worker', cx, cy, false);
        child.fatherId  = father.id;
        child.motherId  = mother.id;
        child.age       = 0;
        child.homeBldgId = home.id;
        child.attributes = blendAttributes(father.attributes ?? randomAttributes(), mother.attributes ?? randomAttributes());
        child.phenotype  = blendPhenotype(father.phenotype ?? randomPhenotype(), mother.phenotype ?? randomPhenotype());
        child.passions   = blendPassions(father.passions ?? randomPassions(), mother.passions ?? randomPassions());
        child.maxHp   = 10 + child.attributes.con;
        child.hp      = child.maxHp;
        child.speed   = UDEF.worker.speed * (1 + (child.attributes.agi - 5) * 0.04);
        child.carryMax = 3 + Math.round(child.attributes.str / 2);

        this._applyRareTraits(child);
        this.redrawUnit(child);  // re-draw with age:0 size after overriding attributes
        this.scene.uiManager.showFloatText(cx, cy - 16, `${child.name} born!`, '#ffeeaa');
        return child;
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
        if (!deceased.homeBldgId) return;
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
                heir.homeBldgId = deceased.homeBldgId;
                this.scene.uiManager.showFloatText(heir.x, heir.y - 16, `${heir.name} inherits`, '#c8a030');
            }
        }
    }

    _archonSuccession(deceased, alive) {
        const townhall = this.scene.buildings.find(b => b.type === 'townhall' && !b.faction && b.built);

        // Priority: 1) eldest adult child, 2) eldest townhall resident, 3) any adult
        const children  = alive.filter(u => u.fatherId === deceased.id || u.motherId === deceased.id);
        const residents = alive.filter(u => u.homeBldgId === townhall?.id);
        const pool = children.length ? children
                   : residents.length ? residents
                   : alive;

        if (!pool.length) {
            this.scene.showPhaseMessage('The line has ended — no heir to the Archonship!', 0xff3311);
            return;
        }

        const heir = pool.reduce((a, b) => b.age > a.age ? b : a);
        heir.isArchon    = true;
        heir.homeBldgId  = townhall?.id ?? deceased.homeBldgId;

        this.redrawUnit(heir);
        this.scene.showPhaseMessage(`⚜ ${heir.name} succeeds as Archon`, 0xffdd44);
        this.scene.uiManager.showFloatText(heir.x, heir.y - 20, '⚜ Archon', '#ffdd44');
    }

    _gainSkillXp(u, skillName) {
        const skill = u.skills?.[skillName];
        if (!skill) return;
        const intMult  = u.attributes ? 1 + (u.attributes.int - 5) * 0.1 : 1.0;
        const passMult = u.passions?.[skillName] === 'burning' ? 2.5
                       : u.passions?.[skillName] === 'interested' ? 1.5 : 1.0;
        // Cumulative XP required to reach each level (index = level-1)
        const XP_THRESHOLDS = [0, 25, 75, 175, 400, 900, 2000, 4500, 10000, 22000];
        skill.xp += intMult * passMult;
        let newLevel = 1;
        for (let i = XP_THRESHOLDS.length - 1; i >= 0; i--) {
            if (skill.xp >= XP_THRESHOLDS[i]) { newLevel = i + 1; break; }
        }
        if (newLevel > skill.level) {
            skill.level = newLevel;
            this.scene.uiManager.showFloatText(u.x, u.y - 20, `${skillName} ${newLevel}!`, '#ffcc44');
        }
    }

    redrawUnit(u) {
        const def = UDEF[u.type];
        u.gfx.clear().setPosition(u.x, u.y);
        u.gfx.fillStyle(0x000000, 0.18).fillEllipse(0, 9, 22, 7);

        // Handle name label for children
        const showLabel = u.age < 2 && !u.isEnemy && u.hp > 0;
        if (showLabel) {
            if (!u.nameLabel) {
                u.nameLabel = this.scene._w(this.scene.add.text(u.x, u.y - 12, u.name, {
                    fontSize: '7px', color: '#ffeecc', fontFamily: 'monospace',
                    stroke: '#000000', strokeThickness: 1,
                }).setOrigin(0.5, 1).setDepth(7));
            }
        } else if (u.nameLabel) {
            u.nameLabel.destroy(); u.nameLabel = null;
        }

        if (u.type === 'worker') {
            const age = u.age ?? 2;
            const bodyCol = u.phenotype?.skinHex ?? def.color;
            
            // Task 15: Pulse indicator for idle adult workers
            if (u.role === null && u.age >= 2 && !u.isEnemy) {
                u.gfx.lineStyle(1, 0xddcc22, 0.5 + 0.4 * Math.sin(Date.now() / 400))
                   .strokeCircle(0, 0, 12);
            }
            
            if (age === 0) {
                u.gfx.fillStyle(bodyCol).fillCircle(0, 0, 5);
                if (u.selected) u.gfx.lineStyle(2, 0xffdd44).strokeCircle(0, 0, 7);
            } else if (age === 1) {
                u.gfx.fillStyle(bodyCol).fillTriangle(0, -6, -5, 3, 5, 3);
                if (u.selected) u.gfx.lineStyle(2, 0xffdd44).strokeTriangle(0, -8, -7, 4, 7, 4);
            } else {
                u.gfx.fillStyle(bodyCol).fillTriangle(0, -9, -8, 5, 8, 5);
                if (u.selected) u.gfx.lineStyle(2, 0xffdd44).strokeTriangle(0, -11, -10, 6, 10, 6);
            }
            if (u.role && age >= 1) {
                const rc = u.role === 'builder'   ? 0xffdd44
                         : u.role === 'farmer'    ? 0x66dd44
                         : u.role === 'forager'   ? 0xee4466
                         : u.role === 'miner'     ? 0x9999bb
                         : u.role === 'shepherd'  ? 0xf0ece0
                         : u.role === 'hunter'    ? 0xdd8833
                         : 0xaa7733;
                u.gfx.fillStyle(rc).fillCircle(age === 1 ? 5 : 7, age === 1 ? -6 : -9, 2);
            }
            // Archon crown — three small gold spikes above the head
            if (u.isArchon && age >= 2) {
                u.gfx.fillStyle(0xffdd00, 1);
                u.gfx.fillTriangle(-5, -11, -3, -11, -4, -15);
                u.gfx.fillTriangle(-1, -11,  1, -11,  0, -16);
                u.gfx.fillTriangle( 3, -11,  5, -11,  4, -15);
                u.gfx.lineStyle(0.5, 0xaa8800, 0.8);
                u.gfx.strokeTriangle(-5, -11, -3, -11, -4, -15);
                u.gfx.strokeTriangle(-1, -11,  1, -11,  0, -16);
                u.gfx.strokeTriangle( 3, -11,  5, -11,  4, -15);
            }
            if (u.carrying) {
                const tot = this.totalCarrying(u);
                if (tot > 0) {
                    const cc = u.carrying.bread > 0  ? 0xffdd88
                             : u.carrying.sausages > 0 ? 0xffaa44
                             : u.carrying.olives > 0 ? 0x88cc44
                             : u.carrying.meat > 0   ? 0xdd5533
                             : u.carrying.wheat > 0  ? 0xddcc66
                             : u.carrying.stone > 0  ? 0xaaaadd
                             : u.carrying.stones > 0 ? 0xbbbbcc
                             : u.carrying.wool > 0   ? 0xeeddcc
                             : u.carrying.hide > 0   ? 0xcc8855
                             : u.carrying.ore > 0    ? 0x55aa55
                             : u.carrying.sticks > 0 ? 0xaa8844
                             : 0xcc9944;
                    u.gfx.fillStyle(cc).fillCircle(age === 0 ? 4 : 6, age === 0 ? 3 : 5, 2);
                }
            }
            const wp = u.workProgress || 0;
            if (wp > 0) {
                const ratio = Math.min(1, wp / 25);
                const by = age === 0 ? -10 : age === 1 ? -13 : -17;
                const col = u.taskType === 'build' ? 0xffdd44 : 0x55dd55;
                u.gfx.fillStyle(0x111111, 0.7).fillRect(-11, by, 22, 3);
                u.gfx.fillStyle(col).fillRect(-11, by, Math.round(22 * ratio), 3);
            }
        } else if (u.type === 'archer') {
            u.gfx.fillStyle(def.color).fillTriangle(0, -12, -9, 0, 9, 0).fillTriangle(0, 10, -9, 0, 9, 0);
            u.gfx.fillStyle(0x228855, 0.7).fillTriangle(0, 10, -4, 0, 4, 0);
            if (u.selected) u.gfx.lineStyle(2, 0xffdd44).strokeTriangle(0, -14, -11, 1, 11, 1).strokeTriangle(0, 13, -11, 1, 11, 1);
        } else if (u.type === 'spearman') {
            u.gfx.fillStyle(def.color).fillTriangle(0, -11, -9, 6, 9, 6);
            u.gfx.lineStyle(2, 0x8899ff, 0.8).lineBetween(0, -15, 0, 8);
            if (u.selected) u.gfx.lineStyle(2, 0xffdd44).strokeTriangle(0, -13, -11, 7, 11, 7);
        } else if (u.type === 'cavalry') {
            u.gfx.fillStyle(def.color).fillTriangle(0, -13, -11, 0, 11, 0).fillTriangle(0, 11, -11, 0, 11, 0);
            u.gfx.lineStyle(2, 0xffee88, 0.7).strokeTriangle(0, -13, -11, 0, 11, 0);
            if (u.selected) u.gfx.lineStyle(2, 0xffdd44).strokeTriangle(0, -15, -13, 1, 13, 1).strokeTriangle(0, 13, -13, 1, 13, 1);
        } else if (u.type === 'clubman') {
            u.gfx.fillStyle(def.color).fillCircle(0, 0, 8);
            u.gfx.fillStyle(0xaa8855, 0.9).fillRect(6, -3, 7, 5);
            if (u.selected) u.gfx.lineStyle(2, 0xffdd44).strokeCircle(0, 0, 11);
        } else if (u.type === 'slinger') {
            u.gfx.fillStyle(def.color).fillTriangle(0, -9, -7, 0, 7, 0).fillTriangle(0, 8, -7, 0, 7, 0);
            if (u.selected) u.gfx.lineStyle(2, 0xffdd44).strokeTriangle(0, -11, -9, 1, 9, 1).strokeTriangle(0, 10, -9, 1, 9, 1);
        } else if (u.type === 'peltast') {
            u.gfx.fillStyle(def.color).fillCircle(0, 0, 9);
            u.gfx.lineStyle(2, 0xcc8844, 0.9).strokeCircle(0, 0, 9);
            u.gfx.fillStyle(0xaa7733, 0.8).fillRect(6, -2, 6, 4);
            if (u.selected) u.gfx.lineStyle(2, 0xffdd44).strokeCircle(0, 0, 12);
        } else if (u.type === 'hoplite') {
            u.gfx.fillStyle(def.color).fillCircle(0, 0, 11);
            u.gfx.lineStyle(2, 0xddaa44, 0.9).strokeCircle(0, 0, 11);
            u.gfx.fillStyle(0xddaa44, 0.5).fillEllipse(-4, 1, 10, 13);
            if (u.selected) u.gfx.lineStyle(2, 0xffdd44).strokeCircle(0, 0, 14);
        } else if (u.type === 'toxotes') {
            u.gfx.fillStyle(def.color).fillTriangle(0, -13, -10, 0, 10, 0).fillTriangle(0, 11, -10, 0, 10, 0);
            u.gfx.lineStyle(2, 0xddaa44, 0.8).strokeTriangle(0, -13, -10, 0, 10, 0).strokeTriangle(0, 11, -10, 0, 10, 0);
            if (u.selected) u.gfx.lineStyle(2, 0xffdd44).strokeTriangle(0, -15, -12, 1, 12, 1).strokeTriangle(0, 13, -12, 1, 12, 1);
        } else if (u.type === 'scout') {
            u.gfx.fillStyle(0x1a3328).fillTriangle(0, -9, -7, 4, 7, 4).fillTriangle(0, 7, -7, 4, 7, 4);
            u.gfx.lineStyle(1, 0x33aa77, 0.9).strokeTriangle(0, -9, -7, 4, 7, 4).strokeTriangle(0, 7, -7, 4, 7, 4);
            u.gfx.fillStyle(0x55ffaa, 0.85).fillCircle(0, 0, 2);
            if (u.selected) u.gfx.lineStyle(2, 0xffdd44).strokeCircle(0, 0, 11);
        } else if (u.type === 'berserker') {
            u.gfx.fillStyle(def.color).fillCircle(0, 0, 13);
            u.gfx.lineStyle(2, 0xff8844, 0.9).strokeCircle(0, 0, 13);
            if (u.selected) u.gfx.lineStyle(2, 0xffdd44).strokeCircle(0, 0, 16);
        }

        // Hero crown: gold crown above the hero unit
        if (u.isHero) {
            u.gfx.fillStyle(0xffdd44, 0.95);
            u.gfx.fillTriangle(-7, -20, -4, -15, -7, -15);
            u.gfx.fillTriangle( 0, -23,  0, -15,  0, -15);
            u.gfx.fillTriangle( 7, -20,  4, -15,  7, -15);
            u.gfx.fillRect(-7, -15, 14, 5);
            u.gfx.fillStyle(0xff4444, 0.9).fillCircle(-5, -17, 2).fillCircle(0, -20, 2).fillCircle(5, -17, 2);
        }

        // Idle alert: amber "!" above adult player workers with nothing to do
        if (!u.isEnemy && u.type === 'worker' && (u.age ?? 0) >= 2 &&
            !u.role && !u.taskType && !u.targetNode && !u.moveTo && this.totalCarrying(u) === 0) {
            const flash = Math.floor(Date.now() / 600) % 2 === 0;
            if (flash) {
                u.gfx.fillStyle(0xffaa22, 0.9).fillCircle(0, -19, 4);
                u.gfx.fillStyle(0x221100, 0.9).fillRect(-1, -22, 2, 5).fillRect(-1, -15, 2, 2);
            }
        }
    }

    tick(time, dt) {
        for (const u of this.scene.units) {
            if (u.hp <= 0) continue;
            
            if (!u.isEnemy && u.hp < u.maxHp) {
                const nearGarlic = this.scene.buildings.some(b => b.type === 'garden' && b.built && b.cropType === 'garlic'
                    && Phaser.Math.Distance.Between(u.x, u.y, (b.tx+b.size/2)*TILE, MAP_OY+(b.ty+b.size/2)*TILE) < 5 * TILE);
                if (nearGarlic) {
                    u._regenAcc = (u._regenAcc || 0) + dt;
                    if (u._regenAcc >= 2.0) { u.hp = Math.min(u.maxHp, u.hp + 1); u._regenAcc = 0; }
                }
            }

            u.isEnemy ? this.tickEnemy(u, time, dt) : this.tickPlayer(u, time, dt);
            u.gfx.setPosition(u.x, u.y);
            if (u.nameLabel) u.nameLabel.setPosition(u.x, u.y - 12);
            
            const inTower = u.taskType === 'garrison' || u.aiMode === 'tower_assault';
            u.gfx.setAlpha(inTower ? 0.55 : u.isInside ? 0.15 : 1.0);
            this.redrawUnit(u);
        }

        this.scene.units.filter(u => u.hp <= 0).forEach(u => {
            this.scene.tweens.add({ targets: u.gfx, alpha: 0, duration: 280, onComplete: () => u.gfx.destroy() });
            if (u.nameLabel) u.nameLabel.destroy();
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
        if (u.type === 'worker') { this.tickWorker(u, time, dt); return; }
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

    updateCombat(u, time, dt) {
        const enemies = this.scene.units.filter(e => e.isEnemy && e.hp > 0);
        let near = null, nd = Infinity;
        for (const e of enemies) {
            const d = Phaser.Math.Distance.Between(u.x, u.y, e.x, e.y);
            if (d < nd) { nd = d; near = e; }
        }

        if (this.scene.phase !== 'NIGHT' && this.scene.phase !== 'DAY') { u.isRouting = false; return; }

        const hpRatio = u.hp / u.maxHp;
        const heroNearby = this.scene.units.some(h => !h.isEnemy && h.isHero && h.hp > 0
            && Phaser.Math.Distance.Between(u.x, u.y, h.x, h.y) < 6 * TILE);

        const wil = u.attributes?.wil ?? 5;
        const routeThreshold = Math.max(0.05, 0.45 - wil * 0.04);
        if ((u.vetLevel ?? 0) === 0 && !heroNearby && hpRatio < routeThreshold && !u.isRouting) {
            u.isRouting = true;
            this.scene.uiManager.showFloatText(u.x, u.y - 18, 'routing!', '#ff8844');
            // Cascade
            this.scene.units.filter(f => !f.isEnemy && (f.vetLevel ?? 0) === 0 && !f.isRouting && f !== u && f.type !== 'worker'
                && Phaser.Math.Distance.Between(u.x, u.y, f.x, f.y) < 3 * TILE
                && f.hp / f.maxHp < 0.5
                && !this.scene.units.some(h => !h.isEnemy && h.isHero && h.hp > 0
                    && Phaser.Math.Distance.Between(f.x, f.y, h.x, h.y) < 6 * TILE)
            ).forEach(f => {
                f.isRouting = true;
                this.scene.uiManager.showFloatText(f.x, f.y - 18, 'routing!', '#ff8844');
            });
        }

        if (u.isRouting) {
            const home = this.scene.buildings.find(b => b.id === u.homeBldgId);
            const hx = home ? (home.tx + home.size / 2) * TILE : MAP_W / 2 * TILE;
            const hy = home ? MAP_OY + (home.ty + home.size / 2) * TILE : MAP_BOTTOM - TILE * 4;
            const dh = Phaser.Math.Distance.Between(u.x, u.y, hx, hy);
            if (dh > 8) {
                const a = Math.atan2(hy - u.y, hx - u.x);
                u.x += Math.cos(a) * u.speed * 1.2 * dt;
                u.y += Math.sin(a) * u.speed * 1.2 * dt;
            } else {
                u.isRouting = false;
            }
            return;
        }

        if (!near) {
            // No enemy units — attack nearest enemy building instead
            const eb = this.scene.buildings.filter(b => b.faction === 'enemy' && b.built && b.hp > 0);
            let nearBldg = null, nbd = Infinity;
            for (const b of eb) {
                const bx = (b.tx + b.size / 2) * TILE, by = MAP_OY + (b.ty + b.size / 2) * TILE;
                const d = Phaser.Math.Distance.Between(u.x, u.y, bx, by);
                if (d < nbd) { nbd = d; nearBldg = b; }
            }
            if (nearBldg) {
                const bx = (nearBldg.tx + nearBldg.size / 2) * TILE;
                const by = MAP_OY + (nearBldg.ty + nearBldg.size / 2) * TILE;
                if (nbd < TILE * 1.5) {
                    if (time - u.lastAtk > 1200) {
                        u.lastAtk = time;
                        nearBldg.hp = Math.max(0, nearBldg.hp - u.atk);
                        this.scene.buildingManager.redrawBuildingBar(nearBldg);
                        this.scene.uiManager.showFloatText(bx, by - 10, `-${u.atk}`, '#ffaa44');
                        if (nearBldg.hp <= 0) this._destroyBuilding(nearBldg);
                    }
                } else {
                    this.moveToward(u, bx, by, 10, dt);
                }
            }
            return;
        }

        const nearbyEnemies = enemies.filter(e => Phaser.Math.Distance.Between(u.x, u.y, e.x, e.y) <= u.range * 1.5);
        const quadrants = new Set(nearbyEnemies.map(e => {
            const a = Math.atan2(e.y - u.y, e.x - u.x);
            return Math.floor(((a + Math.PI) / (Math.PI / 2))) % 4;
        }));
        const flankMod = quadrants.size >= 2 ? 0.8 : 1.0;

        if (nd <= u.range + 4) {
            if (time - u.lastAtk > 1000) {
                const nTx = Math.floor(near.x/TILE), nTy = Math.floor((near.y-MAP_OY)/TILE);
                const cover = MathUtils.coverMod(this.scene.terrainData[nTy]?.[nTx] ?? T_GRASS);
                const highGround = u.taskType === 'garrison' ? 1.5 : 1.0;
                const dmg = Math.max(1, Math.round(u.atk * flankMod * MathUtils.counterMod(u.type, near.type) * cover * highGround));
                near.hp -= dmg; u.lastAtk = time;
                this.scene.uiManager.showFloatText(near.x, near.y - 14, `-${dmg}`, '#ff6666');
            }
        } else if (nd < 115) {
            const a = Phaser.Math.Angle.Between(u.x, u.y, near.x, near.y);
            u.x += Math.cos(a) * u.speed * 0.8 * dt;
            u.y += Math.sin(a) * u.speed * 0.8 * dt;
        }
    }

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
                const cover = MathUtils.coverMod(this.scene.terrainData[nTy]?.[nTx] ?? T_GRASS);
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
                const th = this.scene.buildings.find(b => !b.faction && b.type === 'townhall' && b.built);
                const tx = th ? (th.tx + 1) * TILE : vc.x;
                const ty = th ? MAP_OY + (th.ty + 1) * TILE : vc.y + TILE * 60;
                this.moveToward(u, tx, ty, 10, dt);
            }
        } else if (mode === 'tower_assault') {
            const tower = this.scene.buildings.find(b => b.id === u._assaultTowerId && b.built);
            if (!tower) { u.aiMode = 'raid'; u._assaultTowerId = null; return; }
            const tx = (tower.tx + 0.5) * TILE, ty = MAP_OY + (tower.ty + 0.5) * TILE;
            this.moveToward(u, tx, ty, 6, dt);
            // Fight garrison units in range (normal combat)
            const garrisonUnits = this.scene.units.filter(g =>
                !g.isEnemy && g.hp > 0 && g.taskType === 'garrison' && g.taskBldgId === tower.id);
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
                const assaultable = this.scene.buildings.find(b =>
                    b.built && b.type === 'watchtower' && !b.faction &&
                    this.scene.units.some(g => !g.isEnemy && g.hp > 0 && g.taskType === 'garrison' && g.taskBldgId === b.id && !RANGED.has(g.type)) &&
                    this.scene.units.filter(e => e.isEnemy && e.hp > 0 && e._assaultTowerId === b.id).length < 2 &&
                    Phaser.Math.Distance.Between(u.x, u.y, (b.tx + 0.5) * TILE, MAP_OY + (b.ty + 0.5) * TILE) < TILE * 5);
                if (assaultable) {
                    u.aiMode = 'tower_assault';
                    u._assaultTowerId = assaultable.id;
                    return;
                }
                // Attack nearest player building if no units nearby
                const bldg = this._nearestPlayerBuilding(u.x, u.y);
                if (bldg) {
                    const bx = (bldg.tx + bldg.size / 2) * TILE;
                    const by = MAP_OY + (bldg.ty + bldg.size / 2) * TILE;
                    const bd = Phaser.Math.Distance.Between(u.x, u.y, bx, by);
                    if (bd < TILE * 1.2) {
                        if (time - (u.lastAtk ?? 0) > 1200) {
                            u.lastAtk = time;
                            bldg.hp = Math.max(0, bldg.hp - u.atk);
                            this.scene.buildingManager.redrawBuildingBar(bldg);
                            this.scene.uiManager.showFloatText(bx, by - 10, `-${u.atk}`, '#ff8844');
                            if (bldg.hp <= 0) this._destroyBuilding(bldg);
                        }
                    } else {
                        this.moveToward(u, bx, by, 10, dt);
                    }
                }
            }
        }
    }

    tickWorker(u, time, dt) {
        if (u.age < 2) { this.tickChild(u, dt); return; }

        // Night: workers go home and rest; garrison units stay at post
        if (this.scene.phase === 'NIGHT' && u.taskType !== 'garrison' && !u.isRouting) {
            // Collect wage once per night before heading home
            if (!u._wageCollected) {
                const workplace = u.taskBldgId
                    ? this.scene.buildings.find(b => b.id === u.taskBldgId && b.built) : null;
                const isProductionRole = u.role in (this.WORKSHOP_ROLES ?? {});

                if (isProductionRole && workplace?.wagePending?.[u.id]) {
                    // Production share: collect per-batch wage set aside in building
                    for (const [res, amt] of Object.entries(workplace.wagePending[u.id])) {
                        if (amt > 0) {
                            u.carrying[res] = (u.carrying[res] ?? 0) + amt;
                            this.scene.uiManager.showFloatText(u.x, u.y - 16, `💰 ${amt} ${res}`, '#ffee88');
                        }
                    }
                    workplace.wagePending[u.id] = {};
                } else if (workplace?.isPublic) {
                    // State daily wage: 1 food from public commons
                    const WAGE_FOOD = ['bread', 'sausages', 'flour', 'olives', 'wheat', 'meat'];
                    for (const food of WAGE_FOOD) {
                        if ((this.scene.resources[food] ?? 0) >= 1) {
                            this.scene.resources[food]--;
                            u.carrying[food] = (u.carrying[food] ?? 0) + 1;
                            this.scene.uiManager.showFloatText(u.x, u.y - 16, `💰 ${food}`, '#ffee88');
                            break;
                        }
                    }
                }
                u._wageCollected = true;
            }

            if (u.homeBldgId) {
                const home = this.scene.buildings.find(b => b.id === u.homeBldgId && b.built);
                if (home) {
                    const hcx = (home.tx + home.size / 2) * TILE;
                    const hcy = MAP_OY + (home.ty + home.size / 2) * TILE;
                    if (Phaser.Math.Distance.Between(u.x, u.y, hcx, hcy) > 10) {
                        // Deposit any carrying to home inventory while walking
                        if (this.totalCarrying(u) > 0 && u.taskType !== 'deposit') {
                            u.taskType = 'deposit'; u.taskBldgId = home.id; u._depositPrivate = true;
                        }
                        if (u.taskType === 'deposit') { this.handleDepositTask(u, dt); return; }
                        this.moveToward(u, hcx, hcy, u.speed, dt);
                        u.isInside = false;
                    } else {
                        u.isInside = true;
                    }
                }
            }
            // Clear any non-garrison task so workers resume fresh at dawn
            if (u.taskType && u.taskType !== 'garrison') {
                u.taskType = null; u.targetNode = null; u.workProgress = 0;
                u.workshopPhase = null; u.fetchBldgId = null;
            }
            return;
        }
        // Exiting building at dawn
        if (u.isInside && u.workshopPhase !== 'process') u.isInside = false;

        if (u.moveTo) {
            const d = Phaser.Math.Distance.Between(u.x, u.y, u.moveTo.x, u.moveTo.y);
            if (d > 3) {
                const a = Phaser.Math.Angle.Between(u.x, u.y, u.moveTo.x, u.moveTo.y);
                u.x += Math.cos(a) * u.speed * dt;
                u.y += Math.sin(a) * u.speed * dt;
                return;
            }
            u.moveTo = null;
        }

        // Deposit takes priority — don't seek new tasks while carrying
        if (this.totalCarrying(u) > 0 && !u.targetNode && u.taskType !== 'build') {
            if (u.taskType !== 'deposit') this.seekDeposit(u);
            if (u.taskType === 'deposit') this.handleDepositTask(u, dt);
            return;
        }

        if (ENABLE_PROACTIVE_AI && u.role === null && u.age >= 2) {
            this.runCityPlannerAI(u);
        }

        if (!u.role) {
            if (time - u.lastSeek > 2000) this.pickRole(u, time);
            return;
        }

        // Design fix: if unit has a role but no task/node for 12s, re-evaluate
        // Prevents permanent lock when e.g. all farms are fallow and no nodes in range
        const stickyRoles = new Set(['hunter', 'shepherd']); // player-directed, don't auto-reassign
        if (u._prevRole) stickyRoles.add(u.role); // self-supplying — keep temporary role until deposit done
        if (!stickyRoles.has(u.role) && !u.taskType && !u.targetNode) {
            u._roleIdleTimer = (u._roleIdleTimer ?? 0) + dt;
            if (u._roleIdleTimer > 12000) { u._roleIdleTimer = 0; u.role = null; }
        } else {
            u._roleIdleTimer = 0;
        }

        if (u.role === 'builder') {
            if (time - u.lastSeek > 1500) { u.lastSeek = time; this.seekBuilderTask(u); }
        } else if (u.role === 'farmer') {
            if (time - u.lastSeek > 1500) { u.lastSeek = time; this.seekFarmerTask(u); }
        } else if (u.role in (this.WORKSHOP_ROLES ?? {})) {
            if (!u.taskType && time - u.lastSeek > 2000) { u.lastSeek = time; this.seekWorkshopTask(u); }
        }

        if (u.taskType === 'build') this.handleBuildTask(u, dt);
        else if (u.taskType === 'repair') this.handleRepairTask(u, dt);
        else if (u.taskType === 'harvest_farm') this.handleHarvestFarmTask(u, dt);
        else if (u.taskType === 'workshop') this.handleWorkshopTask(u, dt);
        else if (u.taskType === 'garrison') this.handleGarrisonTask(u, dt);

        if (!u.taskType && u.role) {
            // Bug 5: rate-limit node seeking to match builder/farmer cadence
            if (u.role === 'hunter') this.tickHunter(u, dt);
            else if (u.role === 'shepherd') this.tickShepherd(u, dt);
            else if (!u.targetNode && time - u.lastSeek > 1500) {
                u.lastSeek = time;
                if (u.role === 'forager') this.seekNodeTask(u, ['berry_bush', 'wild_garden', 'olive_grove']);
                else if (u.role === 'woodcutter') this.seekNodeTask(u, ['small_tree', 'large_tree']);
                else if (u.role === 'miner') this.seekNodeTask(u, ['small_boulder', 'large_boulder', 'ore_vein']);
            }
        }

        if (u.targetNode) this.handleGatherTask(u, dt);
    }

    tickHunter(u, dt) {
        // Find assigned or nearest deer
        let deer = u.targetDeer ? this.scene.deer.find(d => d.id === u.targetDeer) : null;
        if (!deer) {
            deer = this.scene.deer.filter(d => !d.isDead).reduce((best, d) => {
                const dist = Phaser.Math.Distance.Between(u.x, u.y, d.x, d.y);
                return (!best || dist < best.dist) ? { d, dist } : best;
            }, null)?.d ?? null;
            if (deer) u.targetDeer = deer.id;
            else { u.role = null; u.targetDeer = null; return; } // Bug 1: release role so pickRole re-runs
        }

        if (deer.isDead) {
            // Harvest carcass: take meat and hide
            const meatPick = Math.min(deer.meatLeft, u.carryMax - this.totalCarrying(u));
            const hidePick = Math.min(deer.hideLeft, Math.max(0, u.carryMax - this.totalCarrying(u) - meatPick));
            if (meatPick > 0 || hidePick > 0) {
                deer.meatLeft -= meatPick;
                deer.hideLeft -= hidePick;
                u.carrying.meat = (u.carrying.meat ?? 0) + meatPick;
                u.carrying.hide = (u.carrying.hide ?? 0) + hidePick;
                this.scene.natureManager.redrawDeer(deer);
            }
            if (deer.meatLeft <= 0 && deer.hideLeft <= 0) u.targetDeer = null;
            return;
        }

        // Chase and attack live deer
        const dist = Phaser.Math.Distance.Between(u.x, u.y, deer.x, deer.y);
        if (dist <= DEER_ATK_RANGE) {
            const now = this.scene.time.now;
            if (now - (u.lastAtk ?? 0) > 1200) {
                u.lastAtk = now;
                deer.hp -= 1;
                this._gainSkillXp(u, 'animalTrap');
                if (deer.hp <= 0) {
                    deer.isDead = true;
                    this.scene.natureManager.redrawDeer(deer);
                    this.scene.uiManager.showFloatText(deer.x, deer.y - 16, 'killed!', '#ffaa44');
                }
            }
        } else {
            this.moveToward(u, deer.x, deer.y, u.speed, dt);
        }
    }

    tickShepherd(u, dt) {
        const sheep = u.targetSheep ? this.scene.sheep?.find(s => s.id === u.targetSheep) : null;

        // ── Taming path (player-assigned via assignShepherds) ─────────────────
        if (u.tamingIntent) {
            if (!sheep || sheep.isDead) { u.tamingIntent = false; u.targetSheep = null; u.role = null; return; }
            if (sheep.isTamed) {
                // Sheep tamed — lead it to nearest pasture
                const pasture = this.scene.buildings.find(b =>
                    b.type === 'pasture' && b.built && !b.faction &&
                    (this.scene.sheep?.filter(s => s.pastureId === b.id).length ?? 0) < (BLDG.pasture.sheepCap ?? 10));
                if (!pasture) { u.tamingIntent = false; u.role = null; return; }
                const px = (pasture.tx + pasture.size / 2) * TILE, py = MAP_OY + (pasture.ty + pasture.size / 2) * TILE;
                if (Phaser.Math.Distance.Between(u.x, u.y, px, py) > TILE * 1.5) {
                    this.moveToward(u, px, py, u.speed, dt);
                } else {
                    sheep.followUnit = null;
                    sheep.pastureId = pasture.id;
                    u.tamingIntent = false; u.targetSheep = null; u.role = null;
                    this.scene.uiManager.showFloatText(px, py - 16, '🐑 pastured', '#e8e0c0');
                }
                return;
            }
            // Approach and tame
            const dist = Phaser.Math.Distance.Between(u.x, u.y, sheep.x, sheep.y);
            if (dist > TILE * 1.5) { this.moveToward(u, sheep.x, sheep.y, u.speed, dt); return; }
            u.tameProgress = (u.tameProgress ?? 0) + dt;
            if (u.tameProgress >= 8000) {
                // Cost 1 wheat from public resources
                if ((this.scene.resources.wheat ?? 0) >= SHEEP_TAME_COST) {
                    this.scene.resources.wheat -= SHEEP_TAME_COST;
                    sheep.isTamed = true;
                    sheep.followUnit = u.id;
                    u.tameProgress = 0;
                    this._gainSkillXp(u, 'animalTrap');
                    this.scene.natureManager.redrawSheep(sheep);
                    this.scene.uiManager.showFloatText(sheep.x, sheep.y - 18, '🐑 tamed!', '#e8e0c0');
                } else {
                    u.tameProgress = 0;
                    this.scene.uiManager.showFloatText(u.x, u.y - 16, 'need wheat', '#ff8844');
                }
            }
            return;
        }

        // ── Autonomous path: shear wool-ready wild sheep ───────────────────────
        let target = sheep && !sheep.isDead && sheep.woolReady ? sheep : null;
        if (!target) {
            target = this.scene.sheep?.filter(s => !s.isTamed && !s.isDead && s.woolReady).reduce((best, s) => {
                const dist = Phaser.Math.Distance.Between(u.x, u.y, s.x, s.y);
                return (!best || dist < best.dist) ? { s, dist } : best;
            }, null)?.s ?? null;
            if (target) u.targetSheep = target.id;
            else { u.role = null; return; }
        }
        const dist = Phaser.Math.Distance.Between(u.x, u.y, target.x, target.y);
        if (dist <= TILE * 1.2) {
            target.woolReady = false;
            target.woolTimer = 0;
            u.carrying.wool = (u.carrying.wool ?? 0) + 1;
            this.scene.natureManager.redrawSheep(target);
            this._gainSkillXp(u, 'animalTrap');
            u.targetSheep = null;
        } else {
            this.moveToward(u, target.x, target.y, u.speed, dt);
        }
    }

    handleGarrisonTask(u, dt) {
        const b = this.scene.buildings.find(b => b.id === u.taskBldgId && b.built);
        if (!b) { u.taskType = null; return; }
        // Walk into the tower and stay
        const cx = (b.tx + 0.5) * TILE, cy = MAP_OY + (b.ty + 0.5) * TILE;
        this.moveToward(u, cx, cy, 6, dt);
    }

    handleRepairTask(u, dt) {
        const b = this.scene.buildings.find(b => b.id === u.taskBldgId && b.built);
        if (!b || b.hp >= b.maxHp) { u.taskType = null; return; }
        const cx = (b.tx + b.size / 2) * TILE, cy = MAP_OY + (b.ty + b.size / 2) * TILE;
        if (this.moveToward(u, cx, cy, 28, dt)) return;
        u.workProgress = (u.workProgress ?? 0) + dt;
        if (u.workProgress >= 25.0) {
            u.workProgress = 0;
            // Costs half the build materials — spend stone if available
            const repairCost = { stone: 1 };
            if (this.scene.economyManager.afford(repairCost)) {
                this.scene.economyManager.spend(repairCost);
                b.hp = Math.min(b.maxHp, b.hp + Math.ceil(b.maxHp / 10));
                this.scene.buildingManager.redrawBuildingBar(b);
                this._gainSkillXp(u, 'masonry');
                if (b.hp >= b.maxHp) u.taskType = null;
            }
        }
    }

    handleBuildTask(u, dt) {
        const b = this.scene.buildings.find(b => b.id === u.taskBldgId);
        if (!b || b.built) { u.taskType = null; return; }
        const cx = (b.tx+b.size/2)*TILE, cy = MAP_OY+(b.ty+b.size/2)*TILE;
        if (this.moveToward(u, cx, cy, 28, dt)) return;
        u.isInside = false;
        const workSpeed = 1.0 + (u.skills.masonry?.level ?? 1) * 0.2;
        u.workProgress = (u.workProgress ?? 0) + dt * workSpeed;
        if (u.workProgress >= 25.0) {
            u.workProgress = 0;
            b.buildWork -= 5;
            this._gainSkillXp(u, 'masonry');
            if (b.buildWork <= 0) { this.scene.buildingManager.completeBuildingConstruction(b); u.taskType = null; }
        }
    }

    handleHarvestFarmTask(u, dt) {
        const b = this.scene.buildings.find(b => b.id === u.taskBldgId && b.built && b.type === 'farm');
        if (!b || b.stock <= 0) { u.taskType = null; return; }
        const cx = (b.tx+b.size/2)*TILE, cy = MAP_OY+(b.ty+b.size/2)*TILE;
        if (this.moveToward(u, cx, cy, 28, dt)) return;
        u.isInside = false;
        u.workProgress = (u.workProgress ?? 0) + dt * (1.0 + (u.skills.farming?.level ?? 1) * 0.2);
        if (u.workProgress >= 25.0) {
            u.workProgress = 0;
            const pick = Math.min(u.carryMax - this.totalCarrying(u), b.stock);
            b.stock -= pick; u.carrying.wheat += pick;
            this._gainSkillXp(u, 'farming');
            // Redraw full building graphic when a crop row boundary is crossed
            const rows = b.maxStock > 0 ? Math.round(b.stock / b.maxStock * 5) : 0;
            const prevRows = b.maxStock > 0 ? Math.round((b.drawnStock ?? b.maxStock) / b.maxStock * 5) : 0;
            if (rows !== prevRows) {
                b.drawnStock = b.stock;
                this.scene.buildingManager.redrawBuilding(b);
            } else {
                this.scene.buildingManager.redrawBuildingBar(b);
            }
            if (this.totalCarrying(u) >= u.carryMax || b.stock <= 0) u.taskType = null;
        }
    }

    handleGatherTask(u, dt) {
        const n = u.targetNode;
        if (!n || n.stock <= 0) { u.targetNode = null; return; }
        if (this.moveToward(u, n.x, n.y, 20, dt)) return;

        const isTree = n.type === 'small_tree' || n.type === 'large_tree';

        // Felling phase — multiple workers chip away at n.fellWork in parallel
        if (isTree && !n.felled) {
            if (n.fellWork === undefined) n.fellWork = n.type === 'large_tree' ? 28 : 16;
            const skillSpeed = 1.0 + (u.skills.woodcutting?.level ?? 1) * 0.2;
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
                       : (n.type.includes('boulder') || n.type.includes('ore')) ? 'mining'
                       : 'farming';
        const workSpeed = 1.0 + (u.skills[skillKey]?.level ?? 1) * 0.2;
        // Collecting a felled tree is lighter work
        const threshold = isTree ? 10.0 : 25.0;
        u.workProgress = (u.workProgress ?? 0) + dt * workSpeed;

        if (u.workProgress >= threshold) {
            u.workProgress = 0;
            const res = NODE_DEF[n.type]?.resource;
            const pick = Math.min(u.carryMax - this.totalCarrying(u), n.stock);
            n.stock -= pick; u.carrying[res] += pick;
            this._gainSkillXp(u, skillKey);
            this.scene.uiManager.showFloatText(u.x, u.y - 14, `+${pick}${res[0].toUpperCase()}`, '#ffffff');

            // Debris byproducts: trees drop sticks, boulders drop stones
            if (res === 'wood' && this.scene.economyManager.hasStorageSpace('sticks')) {
                const debris = Math.floor(pick * (0.5 + Math.random() * 0.5));
                if (debris > 0) this.scene.economyManager.addResource('sticks', debris);
            } else if (res === 'stone' && this.scene.economyManager.hasStorageSpace('stones')) {
                const debris = Math.floor(pick * (0.5 + Math.random() * 0.5));
                if (debris > 0) this.scene.economyManager.addResource('stones', debris);
            }

            if (n.stock <= 0) {
                n.felled = false;
                n.sapling = true;
                n.stump = true;   // stump-sapling, distinct from seeded sapling
                n.saplingTimer = 0;
                this.scene.mapManager.drawResourceNodes();
            }
            if (this.totalCarrying(u) >= u.carryMax || n.stock <= 0) u.targetNode = null;
        }
    }

    // Building types whose inventories count as public commons (deposit → scene.resources)
    get PUBLIC_STORAGE() {
        return new Set(['granary', 'warehouse', 'stonepile', 'woodshed', 'townhall']);
    }

    // Where each role's gathered resources should be deposited
    get DEPOSIT_ROUTES() {
        return {
            farmer:     ['granary'],
            woodcutter: ['woodshed'],
            hunter:     ['butcher'],
            miner:      ['stonepile', 'smelter'],
            // forager, shepherd → private (house)
            // warehouse/townhall only receive via explicit public worker routing
        };
    }

    // Find nearest built building of one of the given types
    _nearestOfTypes(x, y, types) {
        let best = null, bd = Infinity;
        for (const b of this.scene.buildings) {
            if (!b.built || b.faction === 'enemy') continue;
            if (!types.includes(b.type)) continue;
            const bx = (b.tx + b.size / 2) * TILE, by = MAP_OY + (b.ty + b.size / 2) * TILE;
            const d = Phaser.Math.Distance.Between(x, y, bx, by);
            if (d < bd) { bd = d; best = b; }
        }
        return best;
    }

    seekDeposit(u) {
        const hasCarry = Object.keys(u.carrying).some(r => (u.carrying[r] || 0) > 0);
        if (!hasCarry) return;

        // Archon household: home is the townhall — treat it as private oikos
        if (u.homeBldgId) {
            const home = this.scene.buildings.find(b => b.id === u.homeBldgId && b.built);
            if (home?.type === 'townhall') {
                u.taskType = 'deposit'; u.taskBldgId = home.id; u._depositPrivate = true;
                return;
            }
        }

        // Private roles: forager, shepherd → home oikos
        const privateRoles = new Set(['forager', 'shepherd']);
        if (privateRoles.has(u.role) && u.homeBldgId) {
            const home = this.scene.buildings.find(b => b.id === u.homeBldgId && b.built && b.type === 'house');
            if (home) {
                u.taskType = 'deposit'; u.taskBldgId = home.id; u._depositPrivate = true;
                return;
            }
        }

        // Farmers at private farms deposit to their home oikos, not the commons
        if (u.role === 'farmer') {
            const workplace = this.scene.buildings.find(b => b.id === u.taskBldgId && b.built);
            const isPublicFarm = !workplace || workplace.isPublic;
            if (!isPublicFarm && u.homeBldgId) {
                const home = this.scene.buildings.find(b => b.id === u.homeBldgId && b.built && b.type === 'house');
                if (home) { u.taskType = 'deposit'; u.taskBldgId = home.id; u._depositPrivate = true; return; }
            }
        }

        // Role-based routing: prefer private building in home domain, fall back to nearest public
        const routeTypes = this.DEPOSIT_ROUTES[u.role];
        if (routeTypes) {
            const homeDomain = u.homeBldgId
                ? this.scene.buildingManager.getDomainAt(
                    ...(this.scene.buildings.find(b => b.id === u.homeBldgId)
                        ? [this.scene.buildings.find(b => b.id === u.homeBldgId).tx,
                           this.scene.buildings.find(b => b.id === u.homeBldgId).ty]
                        : [0, 0]))
                : null;

            // First try: private building in worker's home domain
            const privateDest = homeDomain
                ? this.scene.buildings.find(b =>
                    b.built && !b.faction && !b.isPublic &&
                    routeTypes.includes(b.type) &&
                    this.scene.buildingManager.getDomainAt(b.tx, b.ty)?.id === homeDomain.id)
                : null;

            if (privateDest) {
                u.taskType = 'deposit'; u.taskBldgId = privateDest.id; u._depositPrivate = false; return;
            }

            // Second try: nearest public building of the route type
            const publicDest = this.scene.buildings.find(b =>
                b.built && !b.faction && b.isPublic && routeTypes.includes(b.type));
            if (publicDest) { u.taskType = 'deposit'; u.taskBldgId = publicDest.id; u._depositPrivate = false; return; }
        }

        // Last resort: bring it home
        if (u.homeBldgId) {
            const home = this.scene.buildings.find(b => b.id === u.homeBldgId && b.built);
            if (home) { u.taskType = 'deposit'; u.taskBldgId = home.id; u._depositPrivate = true; }
        }
    }

    handleDepositTask(u, dt) {
        const b = this.scene.buildings.find(b => b.id === u.taskBldgId && b.built && !b.faction);
        if (!b) { u.taskType = null; u._depositPrivate = false; return; }
        const cx = (b.tx + b.size / 2) * TILE, cy = MAP_OY + (b.ty + b.size / 2) * TILE;
        if (this.moveToward(u, cx, cy, 30, dt)) return;
        u.isInside = !(BLDG[b.type]?.outdoor ?? false);

        b.inventory = b.inventory ?? {};
        for (const [res, amt] of Object.entries(u.carrying)) {
            if ((amt || 0) <= 0) continue;

            if (u._depositPrivate) {
                // Private deposit to house: firstfruits (1 unit) go to commons if carrying ≥ 2
                let remainder = amt;
                if (remainder >= 2) {
                    this.scene.economyManager.addResource(res, 1);
                    remainder -= 1;
                }
                b.inventory[res] = (b.inventory[res] ?? 0) + remainder;
                u.carrying[res] = 0;
                this.scene.uiManager.showFloatText(u.x, u.y - 14, `+${remainder} ${res}`, '#aaffcc');
            } else if (this.PUBLIC_STORAGE.has(b.type) && b.isPublic) {
                // State-owned public storage: deposit to both b.inventory and commons
                b.inventory[res] = (b.inventory[res] ?? 0) + amt;
                const got = this.scene.economyManager.addResource(res, amt);
                u.carrying[res] = 0;
                if (got > 0) this.scene.uiManager.showFloatText(u.x, u.y - 14, `+${got} ${res}`, '#88ff88');
            } else {
                // Workshop/other building: deposit to b.inventory only
                b.inventory[res] = (b.inventory[res] ?? 0) + amt;
                u.carrying[res] = 0;
                this.scene.uiManager.showFloatText(u.x, u.y - 14, `+${amt} ${res}`, '#88ccff');
            }
        }
        const wasPrivate = u._depositPrivate;
        u.taskType = null;
        u._depositPrivate = false;
        u.isInside = false;

        // Restore role immediately after self-supply deposit (not home deposits)
        if (u._prevRole && !wasPrivate) {
            u.role = u._prevRole;
            u._prevRole = null;
            this.seekWorkshopTask(u);
        }
    }

    tickEnemyWorker(u, time, dt) {
        // Deposit when carrying something
        if (this.totalCarrying(u) > 0) {
            const depot = this.scene.buildings.find(b => b.faction === 'enemy' && b.built &&
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
        const eFarm = this.scene.buildings.find(b =>
            b.faction === 'enemy' && b.type === 'farm' && b.built && b.stock > 0);
        if (eFarm) {
            const fx = (eFarm.tx + 1) * TILE, fy = MAP_OY + (eFarm.ty + 1) * TILE;
            if (Phaser.Math.Distance.Between(u.x, u.y, fx, fy) < 28) {
                const pick = Math.min(u.carryMax - this.totalCarrying(u), eFarm.stock);
                eFarm.stock -= pick;
                u.carrying.wheat = (u.carrying.wheat ?? 0) + pick;
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
            const pick = Math.min(u.carryMax - this.totalCarrying(u), n.stock);
            n.stock -= pick;
            const res = NODE_DEF[n.type]?.resource ?? 'wheat';
            u.carrying[res] = (u.carrying[res] ?? 0) + pick;
            if (n.stock <= 0) { u.targetNode = null; this.scene.mapManager.drawResourceNodes(); }
            if (this.totalCarrying(u) >= u.carryMax) u.targetNode = null;
        }
    }

    tickChild(u, dt) {
        // Age progression: child(0) → youth(1) after 2 min, youth(1) → adult(2) after 3 min
        u.ageTimer = (u.ageTimer ?? 0) + dt;
        const threshold = u.age === 0 ? 120000 : 180000;
        if (u.ageTimer >= threshold) {
            u.age++;
            u.ageTimer = 0;
            this.redrawUnit(u);
            const stage = u.age === 1 ? 'youth' : 'adult';
            this.scene.uiManager.showFloatText(u.x, u.y - 20, `${u.name} is now a ${stage}`, '#ddcc88');
            return;
        }

        const home = this.scene.buildings.find(b => b.id === u.homeBldgId);
        if (!home) return;
        const hx = (home.tx + home.size / 2) * TILE, hy = MAP_OY + (home.ty + home.size / 2) * TILE;
        const radius = u.age === 0 ? TILE : TILE * 3;
        const dist = Phaser.Math.Distance.Between(u.x, u.y, hx, hy);
        if (dist > radius * 2.5 || Math.random() < 0.004) {
            u.moveTo = { x: hx + Phaser.Math.Between(-radius, radius), y: hy + Phaser.Math.Between(-radius, radius) };
        }
        if (u.moveTo) this.moveToward(u, u.moveTo.x, u.moveTo.y, u.age === 0 ? 3 : 5, dt);
    }

    pickRole(u, time) {
        u.lastSeek = time;
        const workers = this.scene.units.filter(w => w.type==='worker' && !w.isEnemy && w.hp>0);
        const cnt = r => workers.filter(w => w.role===r).length;
        const cands = [];
        const need = res => {
            const cap = this.scene.storageMax[res] || 0;
            if (cap <= 0) return 0;
            return 1.0 - Math.min(1.0, (this.scene.resources[res] || 0) / cap);
        };

        if (u.age >= 2 && this.scene.buildings.some(b => !b.built))
            cands.push({ role:'builder', score: (100 + (u.skills.masonry?.level ?? 1) * 10) - cnt('builder') * 20 });

        // Strong bonus if worker's home domain has a farm with stock
        const home = u.homeBldgId ? this.scene.buildings.find(b => b.id === u.homeBldgId) : null;
        const homeDomain = home?.domainId ? this.scene.domains.find(d => d.id === home.domainId) : null;
        const ownFarm = homeDomain ? this.scene.buildings.find(b =>
            b.type === 'farm' && b.built && b.stock > 0 &&
            this.scene.buildingManager.getDomainAt(b.tx, b.ty)?.id === homeDomain.id) : null;
        const domainFarmBonus = ownFarm ? 60 : 0;

        // Food need: highest shortage across the grain chain and olive supply
        const grainNeed  = Math.max(need('wheat'), need('flour'), need('bread'));
        const olivNeed   = need('olives');
        const foodNeed   = Math.max(grainNeed, olivNeed);

        cands.push({ role:'farmer',    score: (60 + domainFarmBonus + grainNeed * 50 + (u.skills.farming?.level    ?? 1) * 15) - cnt('farmer')    * 25 });
        cands.push({ role:'forager',   score: (40 + foodNeed  * 40 + (u.skills.farming?.level    ?? 1) * 15) - cnt('forager')   * 22 });

        // Workshop roles: score each if an unoccupied building exists and has input available
        for (const [role, def] of Object.entries(this.WORKSHOP_ROLES)) {
            const hasSlot = this.scene.buildings.some(b =>
                b.type === def.building && b.built && !b.faction &&
                !this.scene.units.some(w => w.role === role && w.taskBldgId === b.id));
            const sourceTypes = this.FETCH_SOURCES[role] ?? [];
            const hasInput = (this.scene.resources[def.input] ?? 0) > 0
                || this.scene.buildings.some(b =>
                    b.built && !b.faction && sourceTypes.includes(b.type) && (b.inventory?.[def.input] ?? 0) > 0);
            if (hasSlot && hasInput)
                cands.push({ role, score: def.baseScore + need(def.needKey) * 80 + (u.skills[def.skill]?.level ?? 1) * 15 });
        }

        if (u.age >= 2) {
            cands.push({ role:'woodcutter', score: (30 + need('wood')  * 60 + (u.skills.woodcutting?.level ?? 1) * 15) - cnt('woodcutter') * 22 });
            cands.push({ role:'miner',      score: (25 + need('stone') * 60 + (u.skills.mining?.level      ?? 1) * 15) - cnt('miner')      * 22 });
            // Shepherd: score based on untamed sheep presence and wool/fiber need
            const wildSheep = this.scene.sheep?.filter(s => !s.isTamed && !s.isDead).length ?? 0;
            if (wildSheep > 0)
                cands.push({ role:'shepherd', score: (20 + wildSheep * 8 + need('wool') * 40 + (u.skills.animalTrap?.level ?? 1) * 10) - cnt('shepherd') * 18 });
        }

        cands.sort((a, b) => b.score - a.score);
        const best = cands.find(c => c.score > 0);
        if (best) u.role = best.role;
    }

    seekBuilderTask(u) {
        const site = this.scene.buildings.find(b => {
            if (b.built || b.faction === 'enemy') return false;
            if (b.resourcesSpent) return true; // already paid, any builder can join
            const cost = BLDG[b.type]?.cost;
            return !cost || this.scene.economyManager.afford(cost);
        });
        if (!site) return;
        if (!site.resourcesSpent) {
            const cost = BLDG[site.type]?.cost;
            if (cost) this.scene.economyManager.spend(cost);
            site.resourcesSpent = true;
        }
        u.taskType = 'build'; u.taskBldgId = site.id;
        u.moveTo = { x: (site.tx + site.size/2) * TILE, y: MAP_OY + (site.ty + site.size/2) * TILE };
    }

    seekFarmerTask(u) {
        const home = u.homeBldgId
            ? this.scene.buildings.find(b => b.id === u.homeBldgId)
            : null;
        const homeDomain = home?.domainId
            ? this.scene.domains.find(d => d.id === home.domainId)
            : null;

        const farm = this.scene.buildings.find(b => {
            if (b.type !== 'farm' || !b.built || b.stock <= 0 || b.faction === 'enemy') return false;
            const farmDomain = this.scene.buildingManager.getDomainAt(b.tx, b.ty);
            if (!farmDomain) return true; // unowned/public — anyone can work it
            return homeDomain && farmDomain.id === homeDomain.id;
        });
        if (!farm) {
            // Bug 4: farm fallow — forage all available food nodes, not just berry_bush
            this.seekNodeTask(u, ['berry_bush', 'wild_garden', 'olive_grove']);
            return;
        }
        u.taskType = 'harvest_farm'; u.taskBldgId = farm.id;
        u.moveTo = { x: (farm.tx + farm.size/2) * TILE, y: MAP_OY + (farm.ty + farm.size/2) * TILE };
    }

    // Config for all workshop roles: role → { building, input, skill, needKey, baseScore }
    get WORKSHOP_ROLES() {
        return {
            miller:    { building: 'mill',       input: 'wheat',  carryQty: 5, skill: 'mill',        needKey: 'flour',       baseScore: 50 },
            baker:     { building: 'bakery',      input: 'flour',  carryQty: 7, skill: 'bake',        needKey: 'bread',       baseScore: 45 },
            butcher:   { building: 'butcher',     input: 'meat',   carryQty: 4, skill: 'butcher',     needKey: 'sausages',    baseScore: 40 },
            tanner:    { building: 'tannery',     input: 'hide',   carryQty: 6, skill: 'tan',         needKey: 'leather',     baseScore: 35 },
            smelter:   { building: 'smelter',     input: 'ore',    carryQty: 6, skill: 'smelt',       needKey: 'ingot',       baseScore: 35 },
            smith:     { building: 'blacksmith',  input: 'ingot',  carryQty: 3, skill: 'forge',       needKey: 'bronzeKit',   baseScore: 30 },
            carpenter: { building: 'carpenter',   input: 'wood',   carryQty: 6, skill: 'woodcutting', needKey: 'planks',      baseScore: 30 },
            mason:     { building: 'masons',      input: 'stone',  carryQty: 4, skill: 'masonry',     needKey: 'stoneBlocks', baseScore: 28 },
        };
    }

    // Where each workshop role fetches its input from (building types, in priority order)
    get FETCH_SOURCES() {
        return {
            miller:    ['granary', 'warehouse', 'townhall'],
            baker:     ['mill', 'granary', 'warehouse'],
            butcher:   ['butcher', 'warehouse', 'townhall'],
            tanner:    ['butcher', 'tannery', 'warehouse'],
            smelter:   ['mine', 'smelter', 'warehouse'],
            smith:     ['smelter', 'blacksmith', 'warehouse'],
            carpenter: ['woodshed', 'warehouse', 'townhall'],
            mason:     ['stonepile', 'warehouse', 'townhall'],
        };
    }

    // Find nearest building of given types that has qty > 0 of the given resource in inventory
    _findSourceBuilding(input, types) {
        let best = null, bd = Infinity;
        for (const b of this.scene.buildings) {
            if (!b.built || b.faction === 'enemy') continue;
            if (!types.includes(b.type)) continue;
            // Check both b.inventory and scene.resources for public storage types
            const inBldg  = (b.inventory?.[input] ?? 0);
            const inCommons = this.PUBLIC_STORAGE.has(b.type)
                ? (this.scene.resources[input] ?? 0) : 0;
            if (inBldg <= 0 && inCommons <= 0) continue;
            const bx = (b.tx + b.size / 2) * TILE, by = MAP_OY + (b.ty + b.size / 2) * TILE;
            const d = Phaser.Math.Distance.Between(0, 0, bx, by); // proximity score (use worker pos in seek)
            if (d < bd) { bd = d; best = b; }
        }
        return best;
    }

    // Roles that can self-gather when their source buildings are empty
    get SELF_SUPPLY() {
        return {
            carpenter: { nodes: ['large_tree', 'small_tree'], depositTypes: ['woodshed', 'warehouse', 'townhall'] },
            mason:     { nodes: ['boulder', 'ore_vein'],      depositTypes: ['stonepile', 'warehouse', 'townhall'] },
            smelter:   { nodes: ['ore_vein'],                 depositTypes: ['smelter', 'warehouse'] },
        };
    }

    seekWorkshopTask(u) {
        const def = this.WORKSHOP_ROLES[u.role];
        if (!def) { u.role = null; return; }

        // Find source building with input available
        const sourceTypes = this.FETCH_SOURCES[u.role] ?? [];
        const source = this._findSourceBuildingNear(u.x, u.y, def.input, sourceTypes);

        if (!source) {
            // Self-supply: temporarily become a gatherer to restock the source building
            const supply = this.SELF_SUPPLY[u.role];
            if (supply) {
                const node = this.findNearNode(u, 8000, supply.nodes);
                if (node) {
                    u._prevRole  = u.role;
                    u.role       = u.role === 'mason' ? 'miner' : 'woodcutter';
                    u.targetNode = node;
                    return;
                }
            }
            u.role = null;
            return;
        }

        const bldg = this.scene.buildings.find(b =>
            b.type === def.building && b.built && !b.faction &&
            !this.scene.units.some(w => w.id !== u.id && w.role === u.role && w.taskBldgId === b.id));
        if (!bldg) { u.role = null; return; }

        u.taskType      = 'workshop';
        u.taskBldgId    = bldg.id;
        u.fetchBldgId   = source.id;
        u.workshopPhase = 'goFetch';
    }

    _findSourceBuildingNear(x, y, input, types) {
        let best = null, bd = Infinity;
        for (const b of this.scene.buildings) {
            if (!b.built || b.faction === 'enemy') continue;
            if (!types.includes(b.type)) continue;
            const inBldg    = (b.inventory?.[input] ?? 0);
            const inCommons = this.PUBLIC_STORAGE.has(b.type) ? (this.scene.resources[input] ?? 0) : 0;
            if (inBldg <= 0 && inCommons <= 0) continue;
            const bx = (b.tx + b.size / 2) * TILE, by2 = MAP_OY + (b.ty + b.size / 2) * TILE;
            const d = Phaser.Math.Distance.Between(x, y, bx, by2);
            if (d < bd) { bd = d; best = b; }
        }
        return best;
    }

    handleWorkshopTask(u, dt) {
        const def = this.WORKSHOP_ROLES[u.role];
        const b   = this.scene.buildings.find(b => b.id === u.taskBldgId && b.built);
        if (!b || !def) { u.taskType = null; u.workshopPhase = null; u.isInside = false; return; }

        // === goFetch: walk to source building, pick up input ===
        if (u.workshopPhase === 'goFetch') {
            const src = this.scene.buildings.find(b => b.id === u.fetchBldgId && b.built);
            if (!src) {
                // re-seek source
                const sourceTypes = this.FETCH_SOURCES[u.role] ?? [];
                const newSrc = this._findSourceBuildingNear(u.x, u.y, def.input, sourceTypes);
                if (!newSrc) { u.taskType = null; u.workshopPhase = null; return; }
                u.fetchBldgId = newSrc.id;
                return;
            }
            const door = this._bldgDoor(src);
            if (this.moveToward(u, door.x, door.y, 28, dt)) return;

            // At source door — take resources
            src.inventory = src.inventory ?? {};
            let take = 0;
            if ((src.inventory[def.input] ?? 0) > 0) {
                take = Math.min(def.carryQty, src.inventory[def.input]);
                src.inventory[def.input] -= take;
                if (this.PUBLIC_STORAGE.has(src.type)) {
                    this.scene.resources[def.input] = Math.max(0, (this.scene.resources[def.input] ?? 0) - take);
                }
            } else if (this.PUBLIC_STORAGE.has(src.type) && (this.scene.resources[def.input] ?? 0) > 0) {
                take = Math.min(def.carryQty, this.scene.resources[def.input]);
                this.scene.resources[def.input] -= take;
            }
            if (take === 0) {
                // Source ran dry — try to find another
                const sourceTypes = this.FETCH_SOURCES[u.role] ?? [];
                const newSrc = this._findSourceBuildingNear(u.x, u.y, def.input, sourceTypes);
                if (!newSrc) { u.taskType = null; u.workshopPhase = null; return; }
                u.fetchBldgId = newSrc.id;
                return;
            }
            u.carrying[def.input] = (u.carrying[def.input] ?? 0) + take;
            u.workshopPhase = 'goWork';
            return;
        }

        // === goWork: carry input to workshop, deposit to inbox ===
        if (u.workshopPhase === 'goWork') {
            const door = this._bldgDoor(b);
            if (this.moveToward(u, door.x, door.y, 28, dt)) return;

            const carry = u.carrying[def.input] ?? 0;
            if (carry > 0) {
                b.inbox = b.inbox ?? {};
                b.inbox[def.input] = (b.inbox[def.input] ?? 0) + carry;
                u.carrying[def.input] = 0;
            }
            u.workshopPhase = 'process';
            u.isInside = !(BLDG[b.type]?.outdoor ?? false);
            return;
        }

        // === process: move to building center and work while inbox has stock ===
        const cx = (b.tx + b.size / 2) * TILE;
        const cy = MAP_OY + (b.ty + b.size / 2) * TILE;
        if (this.moveToward(u, cx, cy, 10, dt)) return;

        // Gain skill XP while manning the workshop
        const workSpeed = 1.0 + (u.skills[def.skill]?.level ?? 1) * 0.2;
        u.workProgress = (u.workProgress ?? 0) + dt * workSpeed;
        if (u.workProgress >= 30.0) {
            u.workProgress = 0;
            this._gainSkillXp(u, def.skill);
        }

        if ((b.inbox?.[def.input] ?? 0) > 0) return;

        // Inbox empty — go fetch more
        u.isInside = false;
        const sourceTypes = this.FETCH_SOURCES[u.role] ?? [];
        const newSrc = this._findSourceBuildingNear(u.x, u.y, def.input, sourceTypes);
        if (!newSrc) { u.taskType = null; u.workshopPhase = null; return; }
        u.fetchBldgId   = newSrc.id;
        u.workshopPhase = 'goFetch';
    }

    seekNodeTask(u, types) {
        const near = this.findNearNode(u, 8000, types);
        if (near) {
            u.targetNode = near; u.moveTo = null;
        }
    }

    findNearNode(u, maxDist, filterType) {
        let best = null, bd = Infinity;
        for (const n of this.scene.resNodes) {
            if (n.stock <= 0) continue;
            if (filterType && !filterType.includes(n.type)) continue;
            const d = Phaser.Math.Distance.Between(u.x, u.y, n.x, n.y);
            if (d < maxDist && d < bd) { bd = d; best = n; }
        }
        return best;
    }

    runCityPlannerAI(u) {
        // Simple version for now
        const needs = [
            { type: 'farm', urgency: (this.scene.resources.wheat / (this.scene.storageMax.wheat || 1)) < 0.4 ? 10 : 0 },
            { type: 'house', urgency: (this.scene.units.length / (this.scene.storageMax.pop || 10)) > 0.8 ? 8 : 0 }
        ];
        needs.sort((a,b) => b.urgency - a.urgency);
        const target = needs.find(n => n.urgency > 0 && !this.scene.buildings.some(b => b.type === n.type && !b.built));
        if (target && this.scene.economyManager.afford(BLDG[target.type].cost)) {
            // Logic to find site and place...
        }
    }

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
    }

    _destroyBuilding(b) {
        this.scene.uiManager.showFloatText(
            (b.tx + b.size / 2) * TILE, MAP_OY + b.ty * TILE - 8,
            `${BLDG[b.type]?.label ?? b.type} destroyed!`, '#ff4422');
        this.scene.buildingManager.demolishBuilding(b);
    }

    getEnemyVillageCenter() {
        const th = this.scene.buildings.find(b => b.faction === 'enemy' && b.type === 'townhall' && b.built);
        if (th) return { x: (th.tx + 1) * TILE, y: MAP_OY + (th.ty + 1) * TILE };
        return { x: MAP_W / 2 * TILE, y: MAP_OY + 7 * TILE };
    }

    totalCarrying(u) {
        return Object.values(u.carrying).reduce((a, b) => a + (b || 0), 0);
    }

    waveIntelFlash() {
        this.scene.uiManager.showPhaseMessage("Scout killed!", 0x44ff88);
    }

    _bldgDoor(b) {
        return {
            x: (b.tx + b.size / 2) * TILE,
            y: MAP_OY + (b.ty + b.size) * TILE - 4,
        };
    }

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
    }

    moveSelectedTo(wx, wy) {
        const sel = this.scene.units.filter(u => u.selected && !u.isEnemy);
        if (!sel.length) return;
        this.applyFormation(wx, wy, Math.PI / 2, sel);
    }

    applyFormation(cx, cy, angle, sel) {
        if (!sel) sel = this.scene.units.filter(u => u.selected && !u.isEnemy);
        if (!sel.length) return;
        const positions = this.getFormationPositions(this.scene.fmType, cx, cy, sel.length, angle);
        
        if (this.scene.fmGfx) this.scene.fmGfx.destroy();
        this.scene.fmGfx = this.scene._w(this.scene.add.graphics().setDepth(5));
        this.scene.fmGfx.fillStyle(0xffdd44, 0.18);
        positions.forEach(p => this.scene.fmGfx.fillCircle(p.x, p.y, 9));
        
        if (positions.length > 1) {
            this.scene.fmGfx.lineStyle(1, 0xffdd44, 0.3);
            for (let i = 1; i < positions.length; i++)
                this.scene.fmGfx.lineBetween(positions[i-1].x, positions[i-1].y, positions[i].x, positions[i].y);
        }
        this.scene.tweens.add({ targets: this.scene.fmGfx, alpha: 0, delay: 2000, duration: 500 });
        
        sel.forEach((u, i) => {
            u.moveTo = positions[i];
            u.taskType = null; u.taskBldgId = null; u.targetNode = null;
        });
    }

    drawFmDragPreview(x1, y1, x2, y2) {
        const sel = this.scene.units.filter(u => u.selected && !u.isEnemy);
        if (!sel.length) return;

        if (this.scene.fmGfx) this.scene.fmGfx.destroy();
        this.scene.fmGfx = this.scene._w(this.scene.add.graphics().setDepth(5));

        const angle = Math.atan2(y2 - y1, x2 - x1);
        const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2;

        this.scene.fmGfx.lineStyle(2, 0xffdd44, 0.75).lineBetween(x1, y1, x2, y2);
        this.scene.fmGfx.fillStyle(0xffdd44, 0.9).fillCircle(x1, y1, 4).fillCircle(x2, y2, 4);

        const fwd = angle - Math.PI / 2;
        const aLen = 24;
        const ax = cx + Math.cos(fwd) * aLen, ay = cy + Math.sin(fwd) * aLen;
        this.scene.fmGfx.lineStyle(1, 0xffdd44, 0.45).lineBetween(cx, cy, ax, ay);
        this.scene.fmGfx.fillStyle(0xffdd44, 0.6)
            .fillTriangle(ax, ay,
                ax - Math.cos(fwd - 0.5) * 8, ay - Math.sin(fwd - 0.5) * 8,
                ax - Math.cos(fwd + 0.5) * 8, ay - Math.sin(fwd + 0.5) * 8);

        const positions = this.getFormationPositions(this.scene.fmType, cx, cy, sel.length, angle);
        this.scene.fmGfx.fillStyle(0xffdd44, 0.18);
        positions.forEach(p => this.scene.fmGfx.fillCircle(p.x, p.y, 9));
    }

    getFormationPositions(type, cx, cy, count, angle = Math.PI / 2) {
        switch (type) {
            case 'wedge':  return this._wedgePos(cx, cy, count, angle);
            case 'screen': return this._screenPos(cx, cy, count, angle);
            default:       return this._phalanxPos(cx, cy, count, angle);
        }
    }

    _phalanxPos(cx, cy, count, angle) {
        const sp = 36, half = (count - 1) * sp / 2;
        const ca = Math.cos(angle), sa = Math.sin(angle);
        return Array.from({ length: count }, (_, i) => {
            const t = -half + i * sp;
            return { x: cx + ca * t, y: cy + sa * t };
        });
    }

    _wedgePos(cx, cy, count, angle) {
        const ca = Math.cos(angle), sa = Math.sin(angle);
        const fa = Math.cos(angle - Math.PI / 2), fb = Math.sin(angle - Math.PI / 2);
        const pos = [{ x: cx, y: cy }];
        let rank = 1;
        while (pos.length < count) {
            const fwd = rank * 26, side = rank * 30;
            const bx = cx - fa * fwd, by = cy - fb * fwd;
            if (pos.length < count) pos.push({ x: bx + ca * side, y: by + sa * side });
            if (pos.length < count) pos.push({ x: bx - ca * side, y: by - sa * side });
            rank++;
        }
        return pos;
    }

    _screenPos(cx, cy, count, angle) {
        const sp = 50, half = (count - 1) * sp / 2;
        const ca = Math.cos(angle), sa = Math.sin(angle);
        const fa = Math.cos(angle - Math.PI / 2), fb = Math.sin(angle - Math.PI / 2);
        return Array.from({ length: count }, (_, i) => {
            const t = -half + i * sp;
            const off = (i % 2 === 0 ? 0 : 20);
            return { x: cx + ca * t - fa * off, y: cy + sa * t - fb * off };
        });
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
            u.targetNode = node; u.taskType = null; u.taskBldgId = null;
            u.moveTo = null;
            u.role = roleMap[node.type] ?? 'forager';
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
}
