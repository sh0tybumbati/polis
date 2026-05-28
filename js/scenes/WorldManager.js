import {
    DAY_DURATION, NIGHT_DURATION, TILE, MAP_OY, VET_LEVELS, pickVetName,
    APPLIANCE_DEF, SEASON_DAYS, pickFamilyName,
} from '../config/gameConstants.js';
import { CONSTRUCTS } from '../content/constructs/index.js';
import { UNITS } from '../content/units/index.js';
import { NODES } from '../content/nodes/index.js';
import { ITEMS } from '../content/items/index.js';

export default class WorldManager {
    constructor(scene) {
        this.scene = scene;
    }

    tick(delta) {
        if (this.scene.phase === 'LOSE' || this.scene.phase === 'WIN') return;

        if (this.scene.phase === 'DAY' || this.scene.phase === 'NIGHT') {
            this.scene.timerMs -= delta * this.scene.tickSpeed;
            if (this.scene.timerMs <= 0) {
                if (this.scene.phase === 'DAY') this.beginNight();
                else this.endNight();
            }
        }

        // Meals are now handled by the worker hunger system in UnitManager (handleEatTask)

        if (!this.scene.enemiesDisabled) {
            this.tickEnemyAI(delta * this.scene.tickSpeed);
            this.checkWinLose();
        }
    }

    checkWinLose() {
        if (this._gameOver) return;

        let outcome = null, reason = null;

        // Victory via enemy conquest disabled — no enemy faction in survival mode

        if (!outcome) {
            const playerTH = this.scene.constructs.find(b => !b.faction && b.type === 'townhall' && b.built);
            if (playerTH && playerTH.hp <= 0) {
                outcome = 'lose'; reason = 'Your townhall has been destroyed.';
            }
        }

        if (!outcome) {
            const alive = this.scene.units.filter(u => !u.isEnemy && u.hp > 0);
            const canBreed = this.scene.constructs.some(b => !b.faction && b.built && CONSTRUCTS[b.type]?.isHomeType);
            if (!alive.length && !canBreed) {
                outcome = 'lose'; reason = 'Your people are gone.';
            }
        }

        if (!outcome) return;

        this._gameOver = true;
        this.scene.phase = outcome.toUpperCase();
        this.scene.showPhaseMessage(outcome === 'win' ? `Victory! ${reason}` : reason, outcome === 'win' ? 0xffdd44 : 0xcc3311);
        this.scene.isPaused = true;
        this.scene.clearSave(); // game over — start fresh next time

        this.scene.cameras.main.fadeOut(1800, 0, 0, 0);
        this.scene.time.delayedCall(2000, () => {
            this.scene.scene.start('EndScene', { outcome, reason, days: this.scene.day });
        });
    }

    tickEnemyAI(delta) {
        if (this.scene.phase !== 'DAY' && this.scene.phase !== 'NIGHT') return;

        // Always: run the village economy regardless of awareness
        this._tickEnemyBarracks(delta);

        if (!this.scene.enemyAware) {
            this._checkDiscovery();
            return;
        }

        // Only after discovery: scout probes during the day
        if (this.scene.phase === 'DAY') {
            this._scoutTimer = (this._scoutTimer ?? 0) + delta;
            if (this._scoutTimer >= 45000) {
                this._scoutTimer = 0;
                this._launchScoutProbe();
            }
        }
    }

    _checkDiscovery() {
        const evc = this.scene.unitManager.getEnemyVillageCenter();
        const playerTH = this.scene.constructs.find(b => !b.faction && b.type === 'townhall' && b.built);
        const pvc = playerTH
            ? { x: (playerTH.tx + 1) * TILE, y: MAP_OY + (playerTH.ty + 1) * TILE }
            : null;

        const sightRange = TILE * 14;

        // Discovered if any player unit wanders near enemy village
        const playerNearEnemy = this.scene.units.some(u =>
            !u.isEnemy && u.hp > 0 &&
            Phaser.Math.Distance.Between(u.x, u.y, evc.x, evc.y) < sightRange);

        // Or any enemy unit wanders near player village
        const enemyNearPlayer = pvc && this.scene.units.some(u =>
            u.isEnemy && u.hp > 0 &&
            Phaser.Math.Distance.Between(u.x, u.y, pvc.x, pvc.y) < sightRange);

        if (playerNearEnemy || enemyNearPlayer) {
            this.scene.enemyAware = true;
            this.scene.showPhaseMessage('The enemy has spotted you!', 0xcc4422);
        }
    }

    _tickEnemyBarracks(delta) {
        const barracks = this.scene.constructs.find(b =>
            b.faction === 'enemy' && b.type === 'barracks' && b.built);
        if (!barracks) return;

        barracks.trainTimer = (barracks.trainTimer ?? 0) + delta;
        if (barracks.trainTimer < 40000) return;
        barracks.trainTimer = 0;

        // Convert an idle enemy adult worker into a soldier — no units from thin air
        const recruit = this.scene.units.find(u =>
            u.isEnemy && u.hp > 0 && u.type === 'worker' && u.age >= 2 &&
            !u.taskType && u.role !== 'farmer');
        if (!recruit) return;

        const soldierType = this.scene.day >= 10 ? 'spearman' : 'clubman';
        const def = UNITS[soldierType];
        recruit.type    = soldierType;
        recruit.atk     = def.atk;
        recruit.range   = def.range;
        recruit.speed   = def.speed;
        recruit.maxHp   = def.hp;
        recruit.hp      = Math.min(recruit.hp, def.hp);
        recruit.aiMode  = 'patrol';
        recruit.role    = null;
        recruit.taskType = null;
        recruit.targetNode = null;
        this.scene.unitManager.redrawUnit(recruit);
    }

    _launchScoutProbe() {
        const idle = this.scene.units.filter(u =>
            u.isEnemy && u.hp > 0 && u.type !== 'worker' && (u.aiMode ?? 'patrol') === 'patrol');
        const count = Math.min(2, idle.length);
        for (let i = 0; i < count; i++) {
            idle[i].aiMode = 'scout';
            idle[i].scoutTimer = 0;
        }
        if (count > 0)
            this.scene.showPhaseMessage('Enemy scouts spotted!', 0xcc4422);
    }

    _launchNightRaid() {
        const raiders = this.scene.units.filter(u =>
            u.isEnemy && u.hp > 0 && u.type !== 'worker');
        if (!raiders.length) return;
        for (const u of raiders) u.aiMode = 'raid';
        this.scene.showPhaseMessage(`Enemy raid! ${raiders.length} attackers.`, 0xff3311);
    }

    updateMeals() {
        const elapsed = 1.0 - (this.scene.timerMs / DAY_DURATION);
        if (this.scene.mealsDone === 0 && elapsed >= 0.25) { this.fireMeal(1); }
        if (this.scene.mealsDone === 1 && elapsed >= 0.50) { this.fireMeal(2); }
        if (this.scene.mealsDone === 2 && elapsed >= 0.75) { this.fireMeal(3); }
    }

    _nearestFoodConstruct(u) {
        const FOOD_TYPES = new Set(['bakery', 'butcher', 'granary', 'warehouse', 'townhall']);
        const FOOD_KEYS  = ['Food.Grain.Wheat.Bread', 'Food.Meat.Venison.Sausages', 'Food.Grain.Wheat.Flour', 'Food.Produce.Olive', 'Food.Grain.Wheat', 'Food.Meat.Venison'];
        let best = null, bd = Infinity;
        for (const b of this.scene.constructs) {
            if (!b.built || b.faction || !FOOD_TYPES.has(b.type)) continue;
            if (!FOOD_KEYS.some(k => (b.inventory?.[k] ?? 0) > 0)) continue;
            const bx = (b.tx + b.width / 2) * TILE, by = MAP_OY + (b.ty + b.width / 2) * TILE;
            const d  = Phaser.Math.Distance.Between(u.x, u.y, bx, by);
            if (d < bd) { bd = d; best = b; }
        }
        return best;
    }

    // Consume best available food from inv for one unit, return nutrition gained.
    // Priority: bread/sausages (1.0) → flour (0.5) → olives (0.4) → raw wheat/meat (0.3)
    _feedFrom(u, inv) {
        const FOOD_PRIORITY = ['Food.Grain.Wheat.Bread', 'Food.Meat.Venison.Sausages', 'Food.Grain.Wheat.Flour', 'Food.Produce.Olive', 'Food.Grain.Wheat', 'Food.Meat.Venison'];
        for (const key of FOOD_PRIORITY) {
            if ((inv[key] ?? 0) >= 1) {
                inv[key]--;
                return ITEMS[key]?.nutrition ?? 0;
            }
        }
        return 0;
    }

    fireMeal(n) {
        this.scene.mealsDone = n;

        const allUnits = this.scene.units.filter(u => !u.isEnemy && u.hp > 0);

        for (const u of allUnits) {
            // Units who already hit full nutrition skip further meals
            if ((u.dailyNutrition ?? 0) >= 1.0) continue;

            let gained = 0;

            // 1. Private house inventory (wages brought home)
            const house = this.scene.constructs.find(b =>
                b.id === u.homeConstructId && b.built && CONSTRUCTS[b.type]?.isHomeType);
            if (house) {
                if (!house.inventory) house.inventory = {};
                gained = this._feedFrom(u, house.inventory);
            }

            // 2. Nearest food construct inventory (bakery, butcher, granary, etc.)
            if (gained === 0) {
                const foodConstruct = this._nearestFoodConstruct(u);
                if (foodConstruct?.inventory) gained = this._feedFrom(u, foodConstruct.inventory);
            }

            // 3. Public commons fallback (tithe reserves)
            if (gained === 0) gained = this._feedFrom(u, this.scene.resources);

            u.dailyNutrition = (u.dailyNutrition ?? 0) + gained;
        }

        // Report
        const wellFed = allUnits.filter(u => (u.dailyNutrition ?? 0) >= 0.3).length;
        const hungry  = allUnits.length - wellFed;
        if (hungry > 0)
            this.scene.showPhaseMessage(`Meal ${n}: ${hungry} hungry`, 0xffaa44);
        else
            this.scene.showPhaseMessage(`Meal ${n}: all fed`, 0x88ee88);

        // Enemy meal — uses generic food counter
        const enemyUnits = this.scene.units.filter(u => u.isEnemy && u.hp > 0);
        const er = this.scene.enemyRes;
        if (er.food >= enemyUnits.length) er.food -= enemyUnits.length;
        else {
            const starve = enemyUnits.length - er.food;
            er.food = 0;
            Phaser.Utils.Array.Shuffle(enemyUnits).slice(0, starve).forEach(u => { u.hp -= 1; });
        }

        this.scene.updateUI();
    }

    // Called at night — assess daily nutrition, apply HP effects, reset for next day
    assessNutrition() {
        const units = this.scene.units.filter(u => !u.isEnemy && u.hp > 0);
        let starvingCount = 0;
        for (const u of units) {
            const f = u.needs?.food ?? 1.0;
            if (f >= 0.8) {
                // Well fed — small HP regen if damaged
                if (u.hp < u.maxHp) u.hp = Math.min(u.maxHp, u.hp + 1);
            } else if (f >= 0.5) {
                // Adequate — no effect
            } else if (f >= 0.2) {
                // Hungry — lose 1 HP
                u.hp -= 1;
                starvingCount++;
                this.scene.uiManager.showFloatText(u.x, u.y - 14, 'hungry', '#ffaa44');
            } else {
                // Starving — lose 2 HP
                u.hp -= 2;
                starvingCount++;
                this.scene.uiManager.showFloatText(u.x, u.y - 14, 'starving!', '#ff4444');
            }
            // dailyNutrition is no longer the primary health driver
            u.dailyNutrition = 0;
        }
        this.scene.foodPressure = starvingCount > 0;
        if (starvingCount > 0)
            this.scene.showPhaseMessage(`${starvingCount} starved tonight`, 0xff4444);
    }

    beginNight() {
        this.scene.phase = 'NIGHT';
        this.scene.timerMs = NIGHT_DURATION;
        this.assessNutrition();
        this.scene._saveGame();
        this.setNightOverlay(true);
        this.setGates(false);
        this.scene.updateUI();
        if (this.scene.enemyAware)
            this.scene.time.delayedCall(1200, () => this._launchNightRaid());
    }

    endNight() {
        this.scene.phase = 'RESULT';
        this.setNightOverlay(false);
        this.scene.time.delayedCall(1800, () => {
            this.scene.day++;
            this.scene.phase = 'DAY';
            this.scene.timerMs = DAY_DURATION;
            this.scene.mealsDone = 0;

            this.tickNodeRespawn();
            this.ageUpUnits();
            this.scene.units.forEach(u => { u._wageCollected = false; });
            this.scene.economyManager.collectFirstFruits(); // Restored: calculate daily tithe delivery preparation

            if ((this.scene.day - 1) % 8 === 0) {
                this.scene.constructManager.renderAll();
            }

            this._trySpawnMigrant();
            this.scene.updateUI();

            const newDay = this.scene.day;
            const YEAR_DAYS = SEASON_DAYS * 4;
            const year = Math.floor((newDay - 1) / YEAR_DAYS) + 1;
            if ((newDay - 1) % YEAR_DAYS === 0 && newDay > 1) {
                this.scene.uiManager?.showToast?.(`🌅 Year ${year} begins`, '#ffd88a');
            }
            this.scene.showPhaseMessage(`Day ${newDay} begins.`, 0xddaa44);
            if ((this.scene.day - 1) % 8 === 0 && this.scene.day > 1)
                this.scene.time.delayedCall(2500, () => this._spawnCaravan());
        });
    }

    tickNodeRespawn() {
        for (const n of this.scene.resNodes) {
            if (n.stock <= 0) {
                n.respawnTimer = (n.respawnTimer ?? 0) + 1;
                const def = NODES[n.type];
                if (def && def.respawnDays > 0 && n.respawnTimer >= def.respawnDays) {
                    n.stock = def.stock;
                    n.respawnTimer = 0;
                    this.scene.mapManager.redrawNode(n);
                    this.scene.uiManager.showFloatText(n.x, n.y - 12, '🌱 regrown', '#88cc44');
                }
            }
        }
    }

    setNightOverlay(active) {
        if (!this.scene.nightOverlay) return;
        this.scene.tweens.add({
            targets: this.scene.nightOverlay,
            alpha: active ? 0.6 : 0,
            duration: 2000
        });
    }

    setGates(open) {
        for (const b of this.scene.constructs) {
            if (b.type !== 'gate' || !b.built) continue;
            b.isOpen = open;
            this.scene.redrawConstruct(b);
        }
    }

    ageUpUnits() {
        this.setGates(true); // reopen at dawn
        const _PHYS = ['str', 'dex', 'agi', 'con'];
        for (const u of this.scene.units) {
            u.isRouting = false;
            if (u.isEnemy) { u.aiMode = 'patrol'; u._assaultTowerId = null; }
            if (u.type !== 'worker') continue;
            u.age++;
            if (!u.isEnemy) {
                if (u.age === 1) this.scene.uiManager.showFloatText(u.x, u.y - 18, '→ youth', '#ffeeaa');
                if (u.age === 2) this.scene.uiManager.showFloatText(u.x, u.y - 18, '→ adult', '#ffdd44');

                // Elder onset: first physical decline + wisdom bonus
                if (u.age === 10 && u.attributes) {
                    for (const s of _PHYS) u.attributes[s] = Math.max(1, u.attributes[s] - 1);
                    u.attributes.int = Math.min(10, u.attributes.int + 1);
                    u.maxHp  = Math.max(5, 10 + u.attributes.con);
                    u.hp     = Math.min(u.hp, u.maxHp);
                    u.speed  = UNITS.worker.speed * (1 + (u.attributes.agi - 5) * 0.04);
                    this.scene.unitManager.redrawUnit(u);
                    this.scene.uiManager.showFloatText(u.x, u.y - 20, `${u.name} grows old`, '#aa9977');
                }

                // Ongoing decline: -1 to a random physical stat each year past 10
                if (u.age > 10 && u.attributes) {
                    const s = _PHYS[Math.floor(Math.random() * _PHYS.length)];
                    u.attributes[s] = Math.max(1, u.attributes[s] - 1);
                    if (s === 'con') { u.maxHp = Math.max(5, 10 + u.attributes.con); u.hp = Math.min(u.hp, u.maxHp); }
                    if (s === 'agi') u.speed = UNITS.worker.speed * (1 + (u.attributes.agi - 5) * 0.04);
                }

                // Elder death chance — rises steeply each year past 10
                if (u.age >= 10) {
                    const chance = 0.04 + (u.age - 10) * 0.03;
                    if (Math.random() < chance) {
                        u.hp = 0;
                        this.scene.uiManager.showFloatText(u.x, u.y - 22, `${u.name} passes away`, '#9988aa');
                    }
                }
            }
        }
        this._tickGestation();
        this.checkReproduction();
        this._decayGrief();
        this.checkMarriage();
        this.checkApplianceDesires();
        this.autoRepairHomes();
        this.applyEquipmentUpgrades();
        this.applyTithe();
    }

    _tickGestation() {
        for (const u of this.scene.units) {
            if (!u._gestationDays || u._gestationDays <= 0) continue;
            u._gestationDays--;
            if (u._gestationDays === 0) {
                const father = this.scene.units.find(s => s.id === u.spouseId);
                if (father) this.scene.unitManager.spawnChild(father, u);
            }
        }
    }

    checkReproduction() {
        const units = this.scene.units;
        for (const u of units) {
            if (u.type !== 'worker' || u.age < 2 || u.age >= 9 || u.gender !== 'female') continue;
            if (!u.spouseId) continue;
            if ((u._gestationDays ?? 0) > 0) continue;
            const spouse = units.find(s => s.id === u.spouseId);
            if (!spouse || spouse.age < 2 || spouse.type !== 'worker') continue;
            if (!u.homeConstructId || u.homeConstructId !== spouse.homeConstructId) continue;
            if ((u.mood ?? 1) < 0.25 || (u.needs?.food ?? 1) < 0.1) continue;
            if ((spouse.mood ?? 1) < 0.25 || (spouse.needs?.food ?? 1) < 0.1) continue;
            const home = this.scene.constructManager?.getById(u.homeConstructId);
            if (home) {
                const cap = this.scene.constructManager.getHouseCapacity(home);
                const residents = units.filter(v => v.homeConstructId === home.id && !v.isEnemy && v.hp > 0);
                if (residents.length >= cap) continue;
            }
            if (Math.random() < 0.22) {
                u._gestationDays = 3;
                this.scene.uiManager?.showFloatText?.(u.x, u.y - 20, `${u.name} is expecting`, '#ffddff');
            }
        }
    }

    _decayGrief() {
        for (const u of this.scene.units) {
            if (!(u._grief > 0)) continue;
            const traits = u.traits ?? [];
            const rate = traits.includes('resilient') ? 0.165
                       : traits.includes('melancholic') ? 0.072
                       : 0.11;
            u._grief = Math.max(0, u._grief - rate);
            if (u._grief === 0) u._widowed = false;
        }
    }

    checkMarriage() {
        const units = this.scene.units;
        const eligible = units.filter(u =>
            u.type === 'worker' && u.age >= 2 && !u.spouseId && !u.isEnemy && u.hp > 0 && !(u._grief > 0.4));

        const males   = eligible.filter(u => u.gender === 'male');
        const females = eligible.filter(u => u.gender === 'female');
        const usedMaleIds = new Set();

        for (const f of females) {
            let bestMale = null, bestScore = 0.55;
            for (const m of males) {
                if (usedMaleIds.has(m.id)) continue;
                const score = f.relations?.[m.id] ?? 0;
                if (score > bestScore) { bestScore = score; bestMale = m; }
            }
            if (!bestMale) continue;

            f.spouseId = bestMale.id;
            bestMale.spouseId = f.id;
            usedMaleIds.add(bestMale.id);

            // Boost and cross-seed relation
            f.relations[bestMale.id] = Math.min(1, bestScore + 0.1);
            bestMale.relations = bestMale.relations ?? {};
            bestMale.relations[f.id] = Math.min(1, (bestMale.relations[f.id] ?? bestScore) + 0.1);

            // Female takes male's family name if she has none
            if (!f.familyName && bestMale.familyName) f.familyName = bestMale.familyName;

            const midX = (f.x + bestMale.x) / 2;
            const midY = Math.min(f.y, bestMale.y) - 20;
            this.scene.uiManager?.showFloatText?.(midX, midY,
                `♥ ${f.name} & ${bestMale.name} wed`, '#ffaabb');
        }
    }

    checkApplianceDesires() {
        const houses = this.scene.constructs.filter(b =>
            b.built && !b.faction && CONSTRUCTS[b.type]?.isHomeType);

        for (const house of houses) {
            const slots = this.scene.constructManager.getApplianceSlots(house);
            if ((house.applianceItems?.length ?? 0) >= slots) continue;

            const residents = this.scene.units.filter(u =>
                u.homeConstructId === house.id && !u.isEnemy && u.hp > 0 && u.age >= 2);
            if (!residents.length) continue;

            for (const [appId, app] of Object.entries(APPLIANCE_DEF)) {
                // Skip if already installed or on order
                if (house.applianceItems?.some(a => a.id === appId)) continue;
                if (house.pendingOrders?.some(o => o.appId === appId)) continue;

                // Need a resident skilled enough to desire it
                const [skillName, minLevel] = Object.entries(app.skillReq)[0];
                const qualified = residents.find(u =>
                    (u.skills?.[skillName]?.level ?? 1) >= minLevel);
                if (!qualified) continue;

                // Try at-home craft from private inventory
                const rawCost = app.costRaw;
                const inv = house.inventory ?? {};
                const canSelf = rawCost && Object.entries(rawCost)
                    .every(([r, n]) => (inv[r] ?? 0) >= n);

                if (canSelf) {
                    for (const [r, n] of Object.entries(rawCost))
                        inv[r] -= n;
                    house.applianceItems = house.applianceItems ?? [];
                    house.applianceItems.push({ id: appId, label: app.label });
                    this.scene.uiManager.showFloatText(
                        (house.tx + 1) * TILE, MAP_OY + house.ty * TILE - 10,
                        `🔨 ${app.label}`, '#c8a050');
                    this.scene.updateUI();
                    break; // one appliance install per house per dawn
                }

                // Otherwise queue a workshop order
                const workshop = this.scene.constructs.find(b =>
                    b.built && !b.faction && b.type === app.source);
                if (workshop) {
                    workshop.orderQueue = workshop.orderQueue ?? [];
                    workshop.orderQueue.push({ appId, houseConstructId: house.id, timer: 0 });
                    house.pendingOrders = house.pendingOrders ?? [];
                    house.pendingOrders.push({ appId });
                }
                break; // one desire evaluated per house per dawn
            }
        }
    }

    autoRepairHomes() {
        const REPAIR_PER_DAWN = 5;
        const REPAIR_THRESHOLD = 0.8;
        for (const house of this.scene.constructs) {
            if (!house.built || house.faction || !CONSTRUCTS[house.type]?.isHomeType) continue;
            if (house.hp >= house.maxHp * REPAIR_THRESHOLD) continue;
            const inv = house.inventory ?? {};
            const sticks = inv['Materials.Wood.Pine.Sticks'] ?? 0;
            const stones = inv['Materials.Stone.Limestone.Stones'] ?? 0;
            const available = sticks + stones;
            if (available <= 0) continue;
            const missing = house.maxHp - house.hp;
            const repair = Math.min(REPAIR_PER_DAWN, missing, available);
            let remaining = repair;
            if (sticks > 0) {
                const use = Math.min(sticks, remaining);
                inv['Materials.Wood.Pine.Sticks'] -= use;
                remaining -= use;
            }
            if (remaining > 0 && stones > 0) {
                const use = Math.min(stones, remaining);
                inv['Materials.Stone.Limestone.Stones'] -= use;
                remaining -= use;
            }
            house.hp = Math.min(house.maxHp, house.hp + (repair - remaining));
            if (repair - remaining > 0) {
                this.scene.uiManager.showFloatText(
                    (house.tx + 1) * TILE, MAP_OY + house.ty * TILE - 10,
                    `🔨 +${repair - remaining} HP`, '#88cc88');
            }
        }
    }

    applyEquipmentUpgrades() {
        for (const u of this.scene.units) {
            if (u.type === 'worker' || !UNITS[u.type]?.vetLevels) continue;
            u.nightsSurvived = (u.nightsSurvived ?? 0) + 1;
            for (let i = VET_LEVELS.length - 1; i >= 0; i--) {
                if (u.nightsSurvived >= VET_LEVELS[i].nights && (u.vetLevel ?? 0) <= i) {
                    const prev = u.vetLevel ?? 0;
                    u.vetLevel = i + 1;
                    const vl = VET_LEVELS[i];
                    u.maxHp  += vl.hpBonus;
                    u.hp      = Math.min(u.hp + vl.hpBonus, u.maxHp);
                    u.speed  *= vl.speedMult;
                    if (!u.isEnemy) {
                        u.name = pickVetName();
                        const label = vl.label;
                        this.scene.uiManager.showFloatText(u.x, u.y - 20, `${label}!`, '#ffdd88');
                        if (i === VET_LEVELS.length - 1) {
                            u.isHero = true;
                            this.scene.showPhaseMessage(`${u.name} has become a Hero!`, 0xffdd44);
                        }
                    }
                    break;
                }
            }
        }
    }

    applyTithe() {
        const rate = (this.scene.titheRate ?? 0) / 100;
        if (rate <= 0) return;

        let totalContrib = {};
        for (const house of this.scene.constructs) {
            if (!house.built || house.faction || !CONSTRUCTS[house.type]?.isHomeType) continue;
            if (!house.inventory) continue;
            for (const [res, amt] of Object.entries(house.inventory)) {
                if ((amt ?? 0) <= 0) continue;
                const contrib = Math.floor(amt * rate);
                if (contrib <= 0) continue;
                house.inventory[res] -= contrib;
                this.scene.economyManager.addResource(res, contrib);
                totalContrib[res] = (totalContrib[res] ?? 0) + contrib;
            }
        }

        const parts = Object.entries(totalContrib).filter(([,v]) => v > 0)
            .map(([r, v]) => `${v} ${r.slice(0,4)}`).join(', ');
        if (parts)
            this.scene.showPhaseMessage(`Tithe: ${parts} → commons`, 0xddaa44);
    }

    _trySpawnMigrant() {
        // Needs a civic construct (townhall or agora) to attract settlers
        const civic = this.scene.constructs.find(b =>
            !b.faction && b.built && (b.type === 'townhall' || b.type === 'agora'));
        if (!civic) return;

        // One couple every 5 days
        this._migrantCooldown = (this._migrantCooldown ?? 0) + 1;
        if (this._migrantCooldown < 5) return;
        this._migrantCooldown = 0;

        // Find a free 2×2 site near the civic construct for a camp
        const site = this._findCampSite(civic);
        if (!site) return; // map too full — skip this cycle

        // Place a private camp with basic supplies
        const camp = this.scene.constructManager.placeBuiltConstruct('camp', site.tx, site.ty);
        camp.isPublic = false;
        camp.inventory = {
            'Food.Produce.Berry':              8,
            'Materials.Wood.Pine.Sticks':      5,
            'Materials.Stone.Limestone.Stones': 3,
        };
        this.scene.constructManager.updateStorageCap();

        const hx = (camp.tx + camp.width / 2) * TILE;
        const hy = MAP_OY + (camp.ty + camp.height / 2) * TILE;

        const male   = this.scene.spawnUnit('worker', hx - 8, hy, false);
        const female = this.scene.spawnUnit('worker', hx + 8, hy, false);
        male.gender   = 'male';   male.age = 2; male.homeConstructId = camp.id; male.role = 'farmer';
        female.gender = 'female'; female.age = 2; female.homeConstructId = camp.id;
        male.spouseId = female.id; female.spouseId = male.id;
        const mFamilyName = pickFamilyName(this.scene.civ ?? 'greece');
        male.familyName = mFamilyName; female.familyName = mFamilyName;
        male.relations = { [female.id]: 0.6 }; female.relations = { [male.id]: 0.6 };
        this.scene.unitManager.redrawUnit(male);
        this.scene.unitManager.redrawUnit(female);

        this.scene.uiManager.showFloatText(hx, hy - 28,
            `✦ ${male.name} ${mFamilyName} & ${female.name} arrive`, '#88eeff');
    }

    _findCampSite(near) {
        const bm = this.scene.constructManager;
        const cx = near.tx + 1, cy = near.ty + 1;
        for (let r = 4; r <= 18; r++) {
            for (let dy = -r; dy <= r; dy++) {
                for (let dx = -r; dx <= r; dx++) {
                    if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
                    const tx = cx + dx - 1, ty = cy + dy - 1;
                    if (tx < 1 || ty < 1) continue;
                    if (bm.isFree(tx, ty, 2)) return { tx, ty };
                }
            }
        }
        return null;
    }

    _spawnCaravan() {
        if (this.scene.phase === 'LOSE' || this.scene.phase === 'WIN') return;

        const em = this.scene.economyManager;

        // If an Agora exists, auto-execute any matching standing orders first
        const agora = this.scene.constructs.find(b => b.type === 'agora' && b.built && !b.faction);
        const autoExecuted = [];
        if (agora) {
            for (const order of (agora.tradeOrders ?? [])) {
                const giveQty = this.scene.resources[order.give] ?? 0;
                if (giveQty < order.qty) continue;
                em.takeFromCommons(order.give, order.qty);
                em.addResource(order.want, order.receiveQty);
                agora.tradeLog = agora.tradeLog ?? [];
                agora.tradeLog.unshift({ day: this.scene.day, gave: { key: order.give, qty: order.qty }, got: { key: order.want, qty: order.receiveQty } });
                if (agora.tradeLog.length > 8) agora.tradeLog.pop();
                autoExecuted.push(`${order.qty}× ${order.giveLabel} → ${order.receiveQty}× ${order.wantLabel}`);
            }
        }

        // Generate smart dynamic offers
        const offers = em.generateTradeOffers(3);
        this.scene.uiManager.showCaravanOffer({ offers, autoExecuted, agoraExists: !!agora });
    }
}
