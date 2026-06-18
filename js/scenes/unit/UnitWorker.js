import {
    TILE, MAP_OY,
    ARCHON_BUILD_ORDER, T_MOUNTAIN, T_GRASS,
} from '../../config/gameConstants.js';
import { CONSTRUCTS } from '../../content/constructs/index.js';
import { NODES } from '../../content/nodes/index.js';
import { ANIMALS } from '../../content/animals/index.js';
import { ITEMS } from '../../content/items/index.js';
import { JOBS, WORKSHOP_JOBS } from '../../content/jobs/index.js';
import { CROPS } from '../../content/crops/index.js';
import GameLogger from '../../GameLogger.js';

// Module-level constants to avoid per-frame allocations
const _NO_DEPOSIT = new Set(['build', 'roof_build', 'zone_workshop', 'workshop', 'eat', 'collect_tithe', 'leisure', 'merchant', 'plant_grow', 'harvest_grow', 'plant', 'mental_break', 'bury']);
// Rest / recreation tasks — these reset a unit's work streak (see tickWorker).
const _RECREATION_TASKS = new Set(['eat', 'leisure', 'chat', 'rest_break', 'stroll', 'mental_break']);
const _PRIVATE_ROLES = new Set(Object.values(JOBS).filter(j => j.private).map(j => j.id));
const _FOOD_PRIORITY = ['Food.Grain.Wheat.Bread', 'Food.Meat.Venison.Sausages', 'Food.Grain.Wheat.Flour', 'Food.Produce.Olive', 'Food.Grain.Wheat', 'Food.Meat.Venison', 'Food.Produce.Berry', 'Food.Produce.WildGrapes', 'Food.Produce.Greens', 'Food.Fish.Fresh'];
const _NUTRITION_MAP = Object.fromEntries(Object.values(ITEMS).filter(d => d.nutrition != null).map(d => [d.key, d.nutrition]));
const _FOOD_CONSTRUCT_TYPES = new Set(['oven', 'butchersblock', 'grainsilo', 'house', 'camp', 'townhall']);
const _STICKY_ROLES = new Set(['hunter', 'shepherd', 'farmer']);
// Survival-essential builds the archon AI may always pioneer even with auto-pioneer off (so a
// player-driven colony never starves or goes homeless waiting for orders).
const _SURVIVAL_BUILDS = new Set(['camp', 'bed', 'wall_edge', 'door', 'granary', 'woodshed', 'stonepile', 'storageshelf', 'grainsilo']);
const _STORAGE_APPL = new Set(['grainsilo', 'storageshelf']);
// Dedicated colony-scale storage buildings (used to decide whether the archon needs to designate a
// storage zone as a free fallback). Excludes furniture-scale storage like chests.
const _STORAGE_TYPES = new Set(['granary', 'woodshed', 'stonepile', 'grainsilo', 'storageshelf']);
const _PUBLIC_STORAGE = new Set(['grainsilo', 'storageshelf', 'townhall', 'chest']);
const _DEPOSIT_ROUTES  = Object.fromEntries(Object.values(JOBS).filter(j => j.depositTypes?.length > 0).map(j => [j.id, j.depositTypes]));
const _FETCH_SOURCES   = Object.fromEntries(Object.values(JOBS).filter(j => j.fetchSources).map(j => [j.id, j.fetchSources]));
const _SELF_SUPPLY     = Object.fromEntries(Object.values(JOBS).filter(j => j.selfSupply).map(j => [j.id, j.selfSupply]));

export default {
    tickWorker(u, time, dt) {
        if (u.age < 2) { this.tickChild(u, dt); return; }

        // ── Stuck recovery ──────────────────────────────────────────────────
        // moveToward records how long the unit has failed to get closer to its
        // target (u._reachFailT, seconds, set last tick). If it wasn't trying to
        // travel last tick, clear it; if it's been unable to reach its goal for
        // >8s, abandon the goal and role so it re-evaluates from scratch. Without
        // this a unit latched to an unreachable node/site/storage freezes forever,
        // since the role-idle timer only fires when it has NO task or target.
        if (!u._mtCalled) {
            u._reachFailT = 0;
        } else if ((u._reachFailT ?? 0) > 8 && (u.taskType || u.targetNode) && u.taskType !== 'garrison') {
            GameLogger.log('unstick', { u: u.name, task: u.taskType ?? 'gather', role: u.role ?? 'none' });
            u._reachFailT = 0; u._rfTarget = null;
            u.taskType = null; u.targetNode = null; u.taskConstructId = null;
            u.workshopPhase = null; u.fetchConstructId = null;
            u.currentPath = null; u._pathFailed = false; u._pathRetryTimer = 0;
            u.workProgress = 0; u._buildWaitTimer = 0;
            u.role = null; u.lastSeek = 0;
        }
        u._mtCalled = false;

        // Work-streak: seconds of continuous productive work, reset by any rest/recreation.
        // Feeds proactive-recreation scheduling in _rebuildDayPlan.
        const _working = !u.isSleeping && (u.targetNode ||
            (u.taskType && !_RECREATION_TASKS.has(u.taskType)));
        u._workStreak = _working ? (u._workStreak ?? 0) + dt : 0;

        this._tickNeeds(u, dt);
        this._tickRelations(u, dt);

        // Danger preempts work/eat/sleep: fight a nearby predator or flee to shelter. A unit safely
        // sheltered/asleep is left alone (NatureManager skips isInside units).
        if (!u.isSleeping && this._dangerResponse(u, time, dt)) return;

        if (u._mentalBreakPending && u.taskType && u.taskType !== 'garrison' && u.taskType !== 'eat') {
            u._mentalBreakPending = false;
            u.taskType = 'mental_break';
            u.taskConstructId = null; u.targetNode = null; u.workProgress = 0;
            u.workshopPhase = null; u.fetchConstructId = null;
            u._mbTimer = 0;
        }

        // Wage collection: once per night phase (economic mechanic, keep phase-gated)
        if (this.scene.phase === 'NIGHT' && !u._wageCollected && u.taskType !== 'garrison') {
            this._collectWage(u);
            u._wageCollected = true;
        }
        if (this.scene.phase === 'DAY') u._wageCollected = false;

        // Manual sleep order (player right-clicked a bed/tent/house with this unit selected).
        // Overrides need-based sleep: walk there and lie down now, regardless of rest level.
        if (u._orderedSleepId != null && !u.isSleeping && u.taskType !== 'garrison') {
            const sc = this.scene.constructManager?.getById(u._orderedSleepId);
            if (!sc || !sc.built) { u._orderedSleepId = null; }
            else {
                if (sc.type === 'bed') u.bedConstructId = sc.id; else u.homeConstructId = sc.id;
                const r = this._approachSleep(u, dt);
                if (r === 'moving') return;
                u._orderedSleepId = null;   // entered or nohome — order resolved
                if (r === 'entered') { u.taskType = null; u.targetNode = null; u.workProgress = 0; }
                if (u.isSleeping) return;
            }
        }

        // Rest need: villagers sleep only when genuinely tired (rest < 0.40), day or night —
        // not as a nightly ritual while still half-rested. The work-aware drain in _tickNeeds
        // brings a working unit here in the early night; idlers later.
        const needsRest = (u.needs?.rest ?? 1.0) < 0.40 && !u.isSleeping;
        if (needsRest && u.taskType !== 'garrison' && !u.isRouting) {
            // Auto-assign to nearest home (camp/house or a bedroom bed) if homeless.
            if (!u.homeConstructId) this._seekCampHome(u);

            if (u.homeConstructId != null) {
                const r = this._approachSleep(u, dt);
                if (r === 'nohome') { u.homeConstructId = null; u.bedConstructId = null; }
                else if (r === 'moving') { return; }
                else if (r === 'entered' && u.taskType && u.taskType !== 'garrison') {
                    u.taskType = null; u.targetNode = null; u.workProgress = 0;
                    u.workshopPhase = null; u.fetchConstructId = null;
                }
            }
            if (u.isSleeping) return;

            // No home and still exhausted — pass out where they stand
            if ((u.needs?.rest ?? 1.0) < 0.05) {
                u.isSleeping = true;
                u._passedOut = true;
                u.taskType = null; u.targetNode = null; u.moveTo = null;
                this.scene.uiManager?.showFloatText?.(u.x, u.y - 18, '😴 passed out!', '#ff8866');
                return;
            }
        }

        // _tickNeeds handles wake + tent exit; guard here in case needs aren't ticked yet
        if (u.isSleeping) return;

        // Exit construct when not sleeping
        if (u.isInside && u.workshopPhase !== 'process') u.isInside = false;

        // Food need: eat interrupt anytime (not just during day)
        if (u.taskType !== 'garrison' && u.taskType !== 'eat') {
            if ((u.needs?.food ?? 1.0) < 0.4) {
                this.pushTask(u, 'eat');
                u.workshopPhase = null;
                u.targetNode = null;
                u.moveTo = null;
            }
        }

        if (u.moveTo) {
            // Pathfind + steer (smooth, no clipping) like every other mover.
            if (this.moveToward(u, u.moveTo.x, u.moveTo.y, 4, dt)) return;
            u.moveTo = null; u.vx = 0; u.vy = 0;
        }

        // Collect tithes when idle
        if (!u.taskType && !u.targetNode && this.scene._hasTithePending) {
            u.taskType = 'collect_tithe';
        }

        // Deposit takes priority
        if (this.totalCarrying(u) > 0 && !u.targetNode && !_NO_DEPOSIT.has(u.taskType)) {
            if (u.taskType !== 'deposit' && u.taskType !== 'deposit_zone') this.seekDeposit(u);
            if (u.taskType === 'deposit')      { this.handleDepositTask(u, dt);     return; }
            if (u.taskType === 'deposit_zone') { this.handleDepositZoneTask(u, dt); return; }
        }

        // Rebuild day plan every 3s or when empty
        if (!u.dayPlan || time - (u._planTime ?? 0) > 3000) {
            this._rebuildDayPlan(u);
            u._planTime = time;
            // Claim a home proactively (not just when exhausted) so the unit can both
            // sleep there and eat from its food stores before hunger/fatigue turn critical.
            if (!u.homeConstructId) this._seekCampHome(u);
        }

        // Execute head intent when idle
        if (!u.taskType && !u.targetNode && time - u.lastSeek > 1500) {
            u.lastSeek = time;
            const intent = u.dayPlan?.[0]?.intent ?? 'work';
            u.currentIntent = intent;

            if (intent === 'eat') {
                this.pushTask(u, 'eat');
            } else if (intent === 'sleep') {
                // Proactive sleep: head to bed/home and lie down when close.
                if (!u.homeConstructId) this._seekCampHome(u);
                if (u.homeConstructId != null) {
                    const r = this._approachSleep(u, dt);
                    if (r === 'nohome') { u.homeConstructId = null; u.bedConstructId = null; }
                    else if (r === 'moving') { return; }
                    else if (r === 'entered') { u.taskType = null; u.targetNode = null; u.workProgress = 0; }
                }
            } else if (intent === 'socialize') {
                // Try to chat with a nearby awake adult; fall back to strolling
                const chatTarget = this.scene.units.find(w =>
                    w !== u && !w.isEnemy && w.hp > 0 && w.age >= 2 && !w.isSleeping &&
                    !['chat', 'sleep'].includes(w.taskType) &&
                    Phaser.Math.Distance.Between(u.x, u.y, w.x, w.y) < 200);
                if (chatTarget) {
                    u.taskType = 'chat'; u._chatTargetId = chatTarget.id; u.workProgress = 0;
                } else {
                    this._handleSocializeIntent(u);
                }
            } else if (intent === 'leisure') {
                this.seekLeisureTask(u);
            } else {
                // work intent — drain manual task stack first
                if ((u.taskStack?.length ?? 0) > 0 && !u.taskType) {
                    this._dequeueTask(u);
                } else {
                    // Pursue the preferred-profession building first if it's missing (gated).
                    if (!u.taskType && !u.targetNode) this._seekVocationBuild(u, time);
                    // Pick/keep a role. Commit to it for a window so units stick to a job
                    // instead of re-scoring and thrashing every cycle.
                    if (!u.taskType && !u.targetNode && (!u.role || time > (u._roleCommitUntil ?? 0))) {
                        this.pickRole(u, time);
                        u._roleCommitUntil = time + 14000;
                    }
                    if (u.role && !u.taskType) {
                        if (u.role === 'farmer') this.seekFarmerTask(u);
                        else if (u.role === 'builder') this.seekBuilderTask(u);
                        else if (u.role in WORKSHOP_JOBS) this.seekWorkshopTask(u);
                        else if (JOBS[u.role]?.nodeTypes) {
                            // Stockpile before cutting more: harvesting drops resources on the ground
                            // next to the node — a raw-material gatherer hauls those loose piles to
                            // storage FIRST, then seeks a new node. Without this, gatherers keep
                            // harvesting (piling up ever more on the ground) and rarely store any of it.
                            if (!this.seekGroundItem(u)) this.seekNodeTask(u, JOBS[u.role].nodeTypes);
                        }
                    }
                    // Mood collapse: miserable units refuse productive work, seek relief
                    if (!u.taskType && !u.targetNode && u._moodCollapsed) {
                        const n = u.needs ?? {};
                        if ((n.joy ?? 1) <= (n.rest ?? 1)) { u.taskType = 'stroll'; u.workProgress = 0; u._strollPoints = null; }
                        else { u.taskType = 'rest_break'; u.workProgress = 0; }
                    }

                    // No task found — satisfy pressing needs before generic gather
                    if (!u.taskType && !u.targetNode) {
                        const n = u.needs ?? {};
                        if ((n.rest ?? 1) < 0.45 && !u.isSleeping) {
                            u.taskType = 'rest_break'; u.workProgress = 0;
                        } else if ((n.joy ?? 1) < 0.4) {
                            u.taskType = 'stroll'; u.workProgress = 0; u._strollPoints = null;
                        } else {
                            const fallback = u.dayPlan?.find(p => p.intent === 'socialize' || p.intent === 'leisure');
                            if (fallback?.intent === 'socialize') this._handleSocializeIntent(u);
                            else if (fallback?.intent === 'leisure') this.seekLeisureTask(u);
                        }
                        // Haul loose ground items before falling back to foraging
                        if (!u.taskType && !u.targetNode) this.seekBuryTask(u);
                        if (!u.taskType && !u.targetNode) this.seekGroundItem(u);
                        // Absolute last resort: gather any resource node, slate or not.
                        // Full map range so idle workers trek to distant resources instead
                        // of standing around when everything nearby is depleted.
                        if (!u.taskType && !u.targetNode) {
                            this.seekNodeTask(u, ['berry_bush', 'wild_garden', 'olive_grove', 'grape_vine', 'wild_wheat', 'fishing_spot', 'small_tree', 'large_tree', 'small_boulder', 'large_boulder'], false, 8000);
                            // Genuinely nothing to do — mill about rather than freeze in
                            // place (recovers a little joy, relocates to re-scan for work).
                            if (!u.taskType && !u.targetNode) {
                                GameLogger.log('idle', { u: u.name, role: u.role ?? 'none', food: +(u.needs?.food ?? 1).toFixed(2) });
                                u.taskType = 'stroll'; u.workProgress = 0; u._strollPoints = null;
                            }
                        }
                    }
                }
            }
        }

        // Design fix: if unit has a role but no task/node for 12s, re-evaluate
        // Prevents permanent lock when e.g. all farms are fallow and no nodes in range
        // u._prevRole = self-supplying role, keep until deposit done
        if (!_STICKY_ROLES.has(u.role) && !u._prevRole && !u.taskType && !u.targetNode) {
            u._roleIdleTimer = (u._roleIdleTimer ?? 0) + dt;
            if (u._roleIdleTimer > 15) { u._roleIdleTimer = 0; u.role = null; }
        } else {
            u._roleIdleTimer = 0;
        }

        if (u.role === 'builder') {
            if (!u.taskType && time - u.lastSeek > 1500) { u.lastSeek = time; this.seekBuilderTask(u); }
        } else if (u.role === 'farmer') {
            if (!u.taskType && time - u.lastSeek > 1500) { u.lastSeek = time; this.seekFarmerTask(u); }
        } else if (u.role in WORKSHOP_JOBS) {
            if (!u.taskType && time - u.lastSeek > 2000) { u.lastSeek = time; this.seekWorkshopTask(u); }
        } else if (u.role === 'merchant') {
            if (!u.taskType && time - u.lastSeek > 3000) { u.lastSeek = time; this.seekMerchantTask(u); }
        }

        if (u.taskType === 'bury') { this.handleBuryTask(u, dt); return; }

        if (u.taskType === 'haul') this.handleHaulTask(u, dt);
        else if (u.taskType === 'eat') this.handleEatTask(u, dt);
        else if (u.taskType === 'leisure') this.handleLeisureTask(u, dt);
        else if (u.taskType === 'chat') this.handleChatTask(u, dt);
        else if (u.taskType === 'rest_break') this.handleRestBreakTask(u, dt);
        else if (u.taskType === 'stroll') this.handleStrollTask(u, dt);
        else if (u.taskType === 'mental_break') this.handleMentalBreakTask(u, dt);
        else if (u.taskType === 'build') this.handleBuildTask(u, dt);
        else if (u.taskType === 'roof_build') this.handleRoofBuild(u, dt);
        else if (u.taskType === 'zone_workshop')   this.handleZoneWorkshopTask(u, dt);
        else if (u.taskType === 'deconstruct') this.handleDeconstructTask(u, dt);
        else if (u.taskType === 'repair') this.handleRepairTask(u, dt);
        else if (u.taskType === 'harvest_grow') this.handleHarvestGrowTask(u, dt);
        else if (u.taskType === 'plant_grow')   this.handlePlantGrowTask(u, dt);
        else if (u.taskType === 'harvest_farm') this.handleHarvestFarmTask(u, dt);
        else if (u.taskType === 'plant') this.handlePlantTask(u, dt);
        else if (u.taskType === 'collect_tithe') this.handleCollectTitheTask(u, dt);
        else if (u.taskType === 'deposit_tithe') this.handleDepositTitheTask(u, dt);
        else if (u.taskType === 'workshop') this.handleWorkshopTask(u, dt);
        else if (u.taskType === 'merchant') this.handleMerchantTask(u, dt);
        else if (u.taskType === 'garrison') this.handleGarrisonTask(u, dt);

        if (!u.taskType && u.role) {
            // Bug 5: rate-limit node seeking to match builder/farmer cadence
            if (u.role === 'hunter') this.tickHunter(u, dt);
            else if (u.role === 'shepherd') this.tickShepherd(u, dt);
            else if (!u.targetNode && time - u.lastSeek > 1500) {
                u.lastSeek = time;
                const nodeTypes = JOBS[u.role]?.nodeTypes;
                if (nodeTypes) this.seekNodeTask(u, nodeTypes);
            }
        }

        if (u.targetNode) this.handleGatherTask(u, dt);
    },

    // Game animals a hunter will pursue. Each species carries its own meatKey/hideKey so the
    // butcher/tanner get distinct meat & leather (venison/pork/beef, deer/boar/aurochs hide).
    _huntableHerds() {
        return [
            ['deer',    this.scene.deer],
            ['boar',    this.scene.boar],
            ['aurochs', this.scene.aurochs],
            ['wolf',    this.scene.wolf],
        ];
    },

    tickHunter(u, dt) {
        const nm = this.scene.natureManager;
        if (u.targetDeer && u.targetAnimal == null) { u.targetAnimal = u.targetDeer; u.targetDeer = null; } // migrate old saves
        const herds = this._huntableHerds();

        // Resolve the assigned target, or pick the nearest live (or still-harvestable) animal.
        let prey = null, species = null;
        if (u.targetAnimal != null) {
            for (const [s, arr] of herds) { const f = arr?.find(a => a.id === u.targetAnimal); if (f) { prey = f; species = s; break; } }
        }
        if (!prey) {
            let best = null;
            for (const [s, arr] of herds) for (const a of (arr ?? [])) {
                if (a.isDead && a.meatLeft <= 0 && a.hideLeft <= 0) continue;
                const dist = Phaser.Math.Distance.Between(u.x, u.y, a.x, a.y);
                if (!best || dist < best.dist) best = { a, s, dist };
            }
            if (best) { prey = best.a; species = best.s; u.targetAnimal = prey.id; }
            else { u.role = null; u.targetAnimal = null; return; } // release role so pickRole re-runs
        }

        const def     = ANIMALS[species];
        const meatKey = def.meatKey ?? 'Food.Meat.Venison';
        const hideKey = def.hideKey ?? 'Textile.Hide.Deer';

        if (prey.isDead) {
            // Harvest carcass: take meat and hide (species-specific keys)
            let meatPick = 0;
            while (meatPick < prey.meatLeft && this.canUnitCarryMore(u, meatKey, meatPick + 1)) meatPick++;
            let hidePick = 0;
            while (hidePick < prey.hideLeft) {
                const curW = this.getUnitCarryWeight(u) + meatPick * ITEMS[meatKey].weight;
                const curV = this.getUnitCarryVolume(u) + meatPick * ITEMS[meatKey].volume;
                const nextW = curW + (hidePick + 1) * ITEMS[hideKey].weight;
                const nextV = curV + (hidePick + 1) * ITEMS[hideKey].volume;
                if (nextW <= this.getUnitMaxWeight(u) && nextV <= this.getUnitMaxVolume(u)) hidePick++;
                else break;
            }

            if (meatPick > 0 || hidePick > 0) {
                prey.meatLeft -= meatPick;
                prey.hideLeft -= hidePick;
                u.carrying[meatKey] = (u.carrying[meatKey] ?? 0) + meatPick;
                u.carrying[hideKey] = (u.carrying[hideKey] ?? 0) + hidePick;
                nm.redrawAnimal(prey);
            }
            if (prey.meatLeft <= 0 && prey.hideLeft <= 0) u.targetAnimal = null;
            if (meatPick === 0 && hidePick === 0) u.role = null; // full
            return;
        }

        // Chase and attack live prey
        const dist = Phaser.Math.Distance.Between(u.x, u.y, prey.x, prey.y);
        if (dist <= def.atkRange) {
            const now = this.scene.time.now;
            if (now - (u.lastAtk ?? 0) > 1200) {
                u.lastAtk = now;
                prey.hp -= 1;
                this._gainSkillXp(u, 'animalTrap');
                // A struck animal fights back per its aggroChance (fight-or-flight); flee-types just run.
                const aggroPct = def.aggroChancePct ?? ((def.aggressive || def.defensive) ? 100 : (def.fightOrFlight === 'fight' ? 50 : 0));
                if (prey.hp > 0 && Math.random() * 100 < aggroPct) {
                    prey.aggroTarget = u.id;
                    prey.aggroUntil  = now + 9000;
                }
                if (prey.hp <= 0) {
                    prey.isDead = true;
                    prey.aggroTarget = null;
                    nm.redrawAnimal(prey);
                    this.scene.uiManager.showFloatText(prey.x, prey.y - 16, 'killed!', '#ffaa44');
                }
            }
        } else {
            this.moveToward(u, prey.x, prey.y, u.speed, dt);
        }
    },

    tickShepherd(u, dt) {
        const sheep = u.targetSheep ? this.scene.sheep?.find(s => s.id === u.targetSheep) : null;

        // ── Taming path (player-assigned via assignShepherds) ─────────────────
        if (u.tamingIntent) {
            if (!sheep || sheep.isDead) { u.tamingIntent = false; u.targetSheep = null; u.role = null; return; }
            if (sheep.isTamed) {
                // Sheep tamed — lead it to nearest enclosed pasture zone
                const zm = this.scene.zoneManager;
                const wm = this.scene.constructManager;
                let bestZone = null, bestDist = Infinity, bestPx = 0, bestPy = 0;

                if (zm && wm) {
                    for (const zoneTiles of zm.getPastureZones()) {
                        const first = zoneTiles[0];
                        if (!first) continue;
                        const enclosure = wm.getEnclosureAt(first.tx, first.ty);
                        if (!enclosure) continue; // Not fully enclosed

                        // Check capacity based on number of tiles (e.g. 1 sheep per 2 tiles)
                        const capacity = Math.max(1, Math.floor(zoneTiles.length / 2));
                        const currentSheep = this.scene.sheep?.filter(s => s.pastureZoneId === first.key).length ?? 0;
                        if (currentSheep >= capacity) continue;

                        const px = first.tx * TILE + TILE / 2;
                        const py = MAP_OY + first.ty * TILE + TILE / 2;
                        const dist = Phaser.Math.Distance.Between(u.x, u.y, px, py);
                        if (dist < bestDist) {
                            bestDist = dist; bestZone = first.key; bestPx = px; bestPy = py;
                        }
                    }
                }

                if (bestZone === null) { u.tamingIntent = false; u.role = null; return; }

                if (Phaser.Math.Distance.Between(u.x, u.y, bestPx, bestPy) > TILE * 1.5) {
                    this.moveToward(u, bestPx, bestPy, u.speed, dt);
                } else {
                    sheep.followUnit = null;
                    sheep.pastureZoneId = bestZone;
                    u.tamingIntent = false; u.targetSheep = null; u.role = null;
                    this.scene.uiManager.showFloatText(bestPx, bestPy - 16, '🐑 pastured', '#e8e0c0');
                }
                return;
            }
            // Approach and tame
            const dist = Phaser.Math.Distance.Between(u.x, u.y, sheep.x, sheep.y);
            if (dist > TILE * 1.5) { this.moveToward(u, sheep.x, sheep.y, u.speed, dt); return; }
            u.tameProgress = (u.tameProgress ?? 0) + dt;
            if (u.tameProgress >= 8000) {
                // Cost 1 wheat from public resources
                if ((this.scene.resources['Food.Grain.Wheat'] ?? 0) >= ANIMALS.sheep.tameCost) {
                    this.scene.economyManager.takeFromCommons('Food.Grain.Wheat', ANIMALS.sheep.tameCost);
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
            u.carrying['Textile.Fiber.Wool'] = (u.carrying['Textile.Fiber.Wool'] ?? 0) + 1;
            this.scene.natureManager.redrawSheep(target);
            this._gainSkillXp(u, 'animalTrap');
            u.targetSheep = null;
        } else {
            this.moveToward(u, target.x, target.y, u.speed, dt);
        }
    },

    handleGarrisonTask(u, dt) {
        const b = this.scene.constructManager?.getById(u.taskConstructId);
        if (!b?.built) { u.taskType = null; return; }
        // Walk into the tower and stay
        const cx = (b.tx + 0.5) * TILE, cy = MAP_OY + (b.ty + 0.5) * TILE;
        this.moveToward(u, cx, cy, 6, dt);
    },

    handleRepairTask(u, dt) {
        const b = this.scene.constructManager?.getById(u.taskConstructId);
        if (!b?.built || b.hp >= b.maxHp) { u.taskType = null; return; }
        const cx = (b.tx + b.width / 2) * TILE, cy = MAP_OY + (b.ty + b.height / 2) * TILE;
        if (this.moveToward(u, cx, cy, 28, dt)) return;
        u.workProgress = (u.workProgress ?? 0) + dt;
        if (u.workProgress >= 25.0) {
            u.workProgress = 0;
            // Costs half the build materials — spend stone if available
            const repairCost = { 'Materials.Stone.Limestone': 1 };
            if (this.scene.economyManager.afford(repairCost)) {
                this.scene.economyManager.spend(repairCost);
                b.hp = Math.min(b.maxHp, b.hp + Math.ceil(b.maxHp / 10));
                this.scene.constructManager.redrawConstructBar(b);
                this._gainSkillXp(u, 'masonry');
                if (b.hp >= b.maxHp) u.taskType = null;
            }
        }
    },

    handleBuildTask(u, dt) {
        const b = this.scene.constructManager?.getById(u.taskConstructId);
        if (!b || b.built) { u.taskType = null; u.workProgress = 0; return; }

        // Site build point (edge → its midpoint; tile → footprint centre).
        let cx, cy;
        if (b.placement === 'edge') {
            cx = b.isH ? (b.col + 0.5) * TILE : b.col * TILE;
            cy = b.isH ? MAP_OY + b.row * TILE : MAP_OY + (b.row + 0.5) * TILE;
        } else {
            cx = (b.tx + b.width / 2) * TILE;
            cy = MAP_OY + (b.ty + b.height / 2) * TILE;
        }

        // ── DELIVER PHASE ─────────────────────────────────────────────────────
        // resNeeded = materials still to be hauled in; b.inventory = delivered on-site.
        // Build can't start until the full cost is physically on the site.
        b.inventory = b.inventory ?? {};
        const needRes = Object.keys(b.resNeeded ?? {}).find(r => (b.resNeeded[r] ?? 0) > 0);
        if (needRes) {
            if ((u.carrying[needRes] ?? 0) > 0) {
                // Carry it to the site and stock the ghost's mini-inventory.
                if (this.moveToward(u, cx, cy, 28, dt)) return;
                const give = Math.min(b.resNeeded[needRes], u.carrying[needRes]);
                if (give > 0) {
                    u.carrying[needRes] -= give;
                    b.inventory[needRes] = (b.inventory[needRes] ?? 0) + give;
                    b.resNeeded[needRes] -= give;
                    this.scene.uiManager?.showFloatText?.(cx, cy - 12,
                        `+${give} ${needRes.split('.').pop()}`, '#cdd6e0');
                    this.scene.constructManager.redrawConstruct?.(b);
                }
                return;
            }
            // Fetch the material from the nearest storage or ground pile.
            const src = this._findBuildMaterial(u, needRes);
            if (!src) {
                u._buildWaitTimer = (u._buildWaitTimer ?? 0) + dt;
                if (u._buildWaitTimer > 12.0) { u._buildWaitTimer = 0; u.taskType = null; u.workProgress = 0; }
                return;
            }
            u._buildWaitTimer = 0;
            if (this.moveToward(u, src.x, src.y, 24, dt)) return;
            // Grab up to carry capacity (spare beyond this piece's need cuts return trips).
            const want = Math.max(0, (b.resNeeded[needRes] ?? 0) - (u.carrying[needRes] ?? 0));
            let take = 0;
            while (take < want && this.canUnitCarryMore(u, needRes, take + 1)) take++;
            take = this._withdrawMaterial(src, needRes, take);
            u.carrying[needRes] = (u.carrying[needRes] ?? 0) + take;
            return;
        }

        // ── BUILD PHASE (all materials delivered) ─────────────────────────────
        if (this.moveToward(u, cx, cy, 28, dt)) return;
        u.isInside = false;

        // Construction has started: give any resource nodes under the footprint one final
        // harvest, then clear them (deferred from plan time so a cancelled ghost keeps them).
        if (!b._salvaged && b.placement !== 'edge') {
            this.scene.constructManager._salvageNodesUnder(b.tx, b.ty, b.width, b.height);
            b._salvaged = true;
        }

        const attrMult = this.getAttrMult(u, ['str']);
        const workSpeed = (1.0 + (u.skills.masonry?.level ?? 1) * 0.2) * attrMult * this.getRestMult(u);
        u.workProgress = (u.workProgress ?? 0) + dt * workSpeed;
        if (u.workProgress >= 12.0) {
            u.workProgress = 0;
            b.buildWork -= 5;
            this._gainSkillXp(u, 'masonry');
            if (b.buildWork <= 0) {
                b.inventory = {};   // delivered materials consumed into the structure
                this.scene.constructManager.completeConstructConstruction(b);
                u.taskType = null;
            }
        }
    },

    // Nearest accessible source of a build material: a player construct holding it, or a loose
    // ground pile — whichever is closer. Returns { kind:'construct'|'ground', ref, x, y } or null.
    _findBuildMaterial(u, res) {
        let best = null, bd = Infinity;
        for (const b of this.scene.constructs) {
            if (!b.built || b.faction === 'enemy') continue;
            if ((b.inventory?.[res] ?? 0) <= 0) continue;
            if (!this._canAccessConstruct(u, b)) continue;
            const bx = (b.tx + (b.width ?? 1) / 2) * TILE, by = MAP_OY + (b.ty + (b.height ?? 1) / 2) * TILE;
            const d = Phaser.Math.Distance.Between(u.x, u.y, bx, by);
            if (d < bd) { bd = d; best = { kind: 'construct', ref: b, x: bx, y: by }; }
        }
        for (const it of this.scene.groundItems ?? []) {
            if (it.resource !== res || it.qty <= 0) continue;
            const d = Phaser.Math.Distance.Between(u.x, u.y, it.x, it.y);
            if (d < bd) { bd = d; best = { kind: 'ground', ref: it, x: it.x, y: it.y }; }
        }
        return best;
    },

    // Remove up to `amount` of `res` from a source, committing it (out of storage/commons).
    _withdrawMaterial(src, res, amount) {
        if (amount <= 0 || !src) return 0;
        if (src.kind === 'construct') {
            const avail = src.ref.inventory?.[res] ?? 0;
            const take = Math.min(amount, avail);
            if (take > 0) { src.ref.inventory[res] -= take; this.scene.economyManager.syncResources(); }
            return take;
        }
        const take = Math.min(amount, src.ref.qty);
        if (take > 0) {
            src.ref.qty -= take;
            if (src.ref.qty <= 0) this.scene.unitManager.removeGroundItem(src.ref);
            else this.scene.unitManager.drawGroundItem(src.ref);
        }
        return take;
    },
    // Resolve a multi-input workshop job (def.inputs) to a single concrete input/output for this
    // tick. Picks whatever the unit is carrying, else what the bench inbox holds, else the most-
    // stocked input in commons. Jobs without `inputs` pass through unchanged (safe for all roles).
    _wsResolveDef(u, def, b) {
        if (!def?.inputs) return def;
        const keys = def.inputs;
        let inKey = keys.find(k => (u.carrying?.[k] ?? 0) > 0);
        if (!inKey && b) inKey = keys.find(k => (b.inbox?.[k] ?? 0) > 0);
        if (!inKey) {
            let best = def.input, bestN = -1;
            for (const k of keys) {
                const n = this.scene.resources?.[k] ?? 0;
                if (n > bestN) { bestN = n; best = k; }
            }
            inKey = best;
        }
        const output = def.outputFor ? def.outputFor(inKey) : def.output;
        return { ...def, input: inKey, output };
    },

    handleZoneWorkshopTask(u, dt) {
        const fm = this.scene.constructManager;
        const item = fm?.getById(u.taskConstructId);
        if (!item?.built) { u.taskType = null; u.workshopPhase = null; return; }

        const def = this._wsResolveDef(u, WORKSHOP_JOBS[u.role], item);
        if (!def) { u.taskType = null; return; }

        const queue = item.productionQueue; // null=auto, []=queue-idle, [...]= has orders
        const isQueueMode = Array.isArray(queue);

        // Queue mode: drop finished count-orders, idle if no order is currently workable.
        let active = null;
        if (isQueueMode) {
            while (queue.length > 0 && (queue[0].mode ?? 'count') === 'count' && (queue[0].done ?? 0) >= queue[0].qty) {
                queue.shift();
                const [_qtx, _qty] = u.taskZoneKey.split(',').map(Number);
                this.scene.uiManager.showFloatText(
                    _qtx * TILE + TILE / 2,
                    MAP_OY + _qty * TILE - 14,
                    'Order done!', '#88ffaa');
            }
            active = this._billActiveOrder(item, def);
            if (!active) { u.workshopPhase = 'idle'; return; }
        }

        const [tx, ty] = u.taskZoneKey.split(',').map(Number);
        const cx = tx * TILE + TILE / 2, cy = MAP_OY + ty * TILE + TILE / 2;

        if (u.workshopPhase === 'procure' || u.workshopPhase === 'idle') {
            const avail = this.scene.resources[def.input] ?? 0;
            if (avail <= 0) return;
            const take = Math.min(def.carryQty, avail);
            this.scene.economyManager.takeFromCommons(def.input, take);
            u.carrying[def.input] = (u.carrying[def.input] ?? 0) + take;
            u.workshopPhase = 'process';
            return;
        }

        if ((u.carrying[def.input] ?? 0) <= 0) { u.workshopPhase = 'procure'; return; }
        if (this.moveToward(u, cx, cy, 10, dt)) return;
        u.isInside = false;

        const attrMult  = this.getAttrMult(u, ['dex', 'int']);
        const workSpeed = (1.0 + (u.skills[def.skill]?.level ?? 1) * 0.2) * attrMult * this.getRestMult(u);
        u.workProgress  = (u.workProgress ?? 0) + dt * workSpeed;
        if (u.workProgress >= 3.0) {
            u.workProgress = 0;
            u.carrying[def.input]--;
            this.scene.economyManager.addResource(def.output, 1);
            this._gainSkillXp(u, def.skill);
            this.scene.uiManager.showFloatText(cx, cy - 14,
                `+1 ${def.output.split('.').pop()}`, '#ffe066');
            if (isQueueMode && active) active.done = (active.done ?? 0) + 1;
            if ((u.carrying[def.input] ?? 0) <= 0) u.workshopPhase = 'procure';
        }
    },

    handleDeconstructTask(u, dt) {
        const b = this.scene.constructManager?.getById(u.taskConstructId);
        if (!b?.built || !b.deconstructing) { u.taskType = null; return; }

        let cx, cy;
        if (b.placement === 'edge') {
            cx = b.isH ? (b.col + 0.5) * TILE : b.col * TILE;
            cy = b.isH ? MAP_OY + b.row * TILE : MAP_OY + (b.row + 0.5) * TILE;
        } else {
            cx = (b.tx + b.width / 2) * TILE;
            cy = MAP_OY + (b.ty + b.height / 2) * TILE;
        }
        if (this.moveToward(u, cx, cy, 28, dt)) return;
        u.isInside = false;

        const attrMult = this.getAttrMult(u, ['str']);
        const workSpeed = (1.0 + (u.skills.masonry?.level ?? 1) * 0.2) * attrMult * this.getRestMult(u);
        u.workProgress = (u.workProgress ?? 0) + dt * workSpeed;
        if (u.workProgress >= 12.0) {
            u.workProgress = 0;
            b.deconstructWork -= 5;
            this._gainSkillXp(u, 'masonry');
            this.scene.constructManager.redrawConstruct(b);
            if (b.deconstructWork <= 0) {
                u.taskType = null;
                this.scene.constructManager.demolishConstruct(b, 0.5);
                this.scene.uiManager.showFloatText(cx, cy - 12, 'Deconstructed', '#ffaa44');
            }
        }
    },

    seekMerchantTask(u) {
        const fm = this.scene.constructManager;
        if (fm) {
            let bestKey = null, bestDist = Infinity;
            for (const item of fm.constructs) {
                if (item.type !== 'marketstall' || !item.built) continue;
                const d = Phaser.Math.Distance.Between(u.x, u.y, (item.tx + 0.5) * TILE, MAP_OY + (item.ty + 0.5) * TILE);
                if (d < bestDist) { bestDist = d; bestKey = item.id; }
            }
            if (bestKey != null) {
                u.taskType = 'merchant';
                u.taskZoneKey = null;
                u.taskConstructId  = bestKey;
                u.merchantPhase = 'seek';
                return;
            }
        }
        // Fallback: legacy agora construct
        const agora = this.scene.constructs.find(b => b.type === 'agora' && b.built && !b.faction);
        if (!agora) { u.role = null; return; }
        u.taskType = 'merchant';
        u.taskConstructId = agora.id;
        u.taskZoneKey = null;
        u.merchantPhase = 'seek';
    },

    handleMerchantTask(u, dt) {
        // ── Market Stall path ──────────────────────────────────────────────────
        if (u.taskZoneKey != null) {
            const key = u.taskZoneKey;
            const [tx, ty] = key.split(',').map(Number);
            const cx = tx * TILE + TILE / 2, cy = MAP_OY + ty * TILE + TILE / 2;
            if (this.moveToward(u, cx, cy, 28, dt)) return;
            u.isInside = true;

            if (u.merchantPhase === 'seek' || !u.merchantPhase) {
                const orders = this.scene.tradeOrders ?? [];
                const order = orders.find(o => (this.scene.resources[o.give] ?? 0) >= o.qty);
                if (!order) { u.workProgress = 0; return; }
                this.scene.economyManager.takeFromCommons(order.give, order.qty);
                u._merchantOrder = order;
                u.merchantPhase = 'simulate';
                u.workProgress = 0;
                this.scene.uiManager.showFloatText(u.x, u.y - 14, `Trading ${order.giveLabel}…`, '#ddaa44');
                return;
            }

            if (u.merchantPhase === 'simulate') {
                const def = JOBS.merchant;
                const attrMult = this.getAttrMult(u, ['int', 'agi']);
                const spd = (1.0 + (u.skills.trading?.level ?? 1) * 0.15) * attrMult * this.getRestMult(u);
                u.workProgress = (u.workProgress ?? 0) + dt * spd;
                if (u.workProgress >= def.simulateMs) {
                    u.workProgress = 0;
                    const order = u._merchantOrder;
                    if (order) {
                        const em = this.scene.economyManager;
                        const giveVal  = em.getItemValue(order.give);
                        const wantVal  = em.getItemValue(order.want);
                        const receiveQty = Math.max(1, Math.round(
                            (order.qty * giveVal * def.valueRatio) / wantVal));
                        em.addResource(order.want, receiveQty);
                        this.scene.tradeLog = this.scene.tradeLog ?? [];
                        this.scene.tradeLog.unshift({ day: this.scene.day,
                            gave: { key: order.give, qty: order.qty },
                            got:  { key: order.want, qty: receiveQty } });
                        if (this.scene.tradeLog.length > 12) this.scene.tradeLog.pop();
                        this._gainSkillXp(u, 'trading');
                        this.scene.uiManager.showFloatText(u.x, u.y - 14, `+${receiveQty} ${order.wantLabel}`, '#88ffaa');
                        u._merchantOrder = null;
                    }
                    u.merchantPhase = 'seek';
                }
                return;
            }
            u.merchantPhase = 'seek';
            return;
        }

        // ── Legacy agora path ─────────────────────────────────────────────────
        const agora = this.scene.constructManager?.getById(u.taskConstructId);
        if (!agora?.built) { u.taskType = null; u.merchantPhase = null; return; }

        const cx = (agora.tx + agora.width / 2) * TILE;
        const cy = MAP_OY + (agora.ty + agora.height / 2) * TILE;

        if (this.moveToward(u, cx, cy, 28, dt)) return;
        u.isInside = true;

        if (u.merchantPhase === 'seek' || !u.merchantPhase) {
            const orders = agora.tradeOrders ?? [];
            const order = orders.find(o => (this.scene.resources[o.give] ?? 0) >= o.qty);
            if (!order) { u.workProgress = 0; return; }
            this.scene.economyManager.takeFromCommons(order.give, order.qty);
            u._merchantOrder = order;
            u.merchantPhase = 'simulate';
            u.workProgress = 0;
            this.scene.uiManager.showFloatText(u.x, u.y - 14, `Trading ${order.giveLabel}…`, '#ddaa44');
            return;
        }

        if (u.merchantPhase === 'simulate') {
            const def = JOBS.merchant;
            const attrMult = this.getAttrMult(u, ['int', 'agi']);
            const spd = (1.0 + (u.skills.trading?.level ?? 1) * 0.15) * attrMult * this.getRestMult(u);
            u.workProgress = (u.workProgress ?? 0) + dt * spd;
            if (u.workProgress >= def.simulateMs) {
                u.workProgress = 0;
                const order = u._merchantOrder;
                if (order) {
                    const em = this.scene.economyManager;
                    const giveVal  = em.getItemValue(order.give);
                    const wantVal  = em.getItemValue(order.want);
                    const receiveQty = Math.max(1, Math.round(
                        (order.qty * giveVal * def.valueRatio) / wantVal));
                    em.addResource(order.want, receiveQty);
                    agora.tradeLog = agora.tradeLog ?? [];
                    agora.tradeLog.unshift({ day: this.scene.day,
                        gave: { key: order.give, qty: order.qty },
                        got:  { key: order.want, qty: receiveQty } });
                    if (agora.tradeLog.length > 8) agora.tradeLog.pop();
                    this._gainSkillXp(u, 'trading');
                    this.scene.uiManager.showFloatText(u.x, u.y - 14, `+${receiveQty} ${order.wantLabel}`, '#88ffaa');
                    u._merchantOrder = null;
                }
                u.merchantPhase = 'seek';
            }
            return;
        }

        u.merchantPhase = 'seek';
    },

    handleHarvestGrowTask(u, dt) {
        const zm = this.scene.zoneManager;
        const state = zm?.growTiles.get(u.taskZoneKey);
        if (!state || !state.slots.some(s => s >= 1)) { u.taskType = null; return; }
        const [tx, ty] = u.taskZoneKey.split(',').map(Number);
        const cx = tx * TILE + TILE / 2, cy = MAP_OY + ty * TILE + TILE / 2;
        if (this.moveToward(u, cx, cy, 28, dt)) return;

        u.workProgress = (u.workProgress ?? 0) + dt;
        if (u.workProgress >= 2.0) {
            u.workProgress = 0;
            const crop = CROPS[state.crop];
            if (!crop) { u.taskType = null; return; }
            let harvested = 0;
            for (let i = 0; i < state.slots.length; i++) {
                if (state.slots[i] < 1) continue;
                if (!this.canUnitCarryMore(u, crop.output, 1)) break;
                u.carrying[crop.output] = (u.carrying[crop.output] ?? 0) + 1;
                state.slots[i] = -1;
                harvested++;
            }
            this._gainSkillXp(u, 'farming');
            zm._renderGrowSlots();
            if (harvested > 0)
                this.scene.uiManager.showFloatText(cx, cy - 14, `+${harvested} ${crop.output.split('.').pop()}`, '#ffee88');
            u.taskType = null;
        }
    },

    handlePlantGrowTask(u, dt) {
        const zm = this.scene.zoneManager;
        const state = zm?.growTiles.get(u.taskZoneKey);
        if (!state || !state.slots.some(s => s < 0)) { u.taskType = null; return; }
        const [tx, ty] = u.taskZoneKey.split(',').map(Number);
        const cx = tx * TILE + TILE / 2, cy = MAP_OY + ty * TILE + TILE / 2;
        if (this.moveToward(u, cx, cy, 28, dt)) return;

        u.workProgress = (u.workProgress ?? 0) + dt;
        if (u.workProgress >= 1.0) {
            u.workProgress = 0;
            // Plant one slot at a time — loops until tile is fully planted
            const idx = state.slots.findIndex(s => s < 0);
            if (idx >= 0) {
                state.slots[idx] = 0;
                this._gainSkillXp(u, 'farming');
                zm._renderGrowSlots();
                this.scene.uiManager.showFloatText(cx, cy - 14, 'planted!', '#aaddaa');
            }
            if (!state.slots.some(s => s < 0)) u.taskType = null;
        }
    },

    handleHarvestFarmTask(u, dt) {
        const b = this.scene.constructManager?.getById(u.taskConstructId);
        if (!b?.built || (b.type !== 'farm' && b.type !== 'garden')) { u.taskType = null; return; }

        // Garden: scoop inventory into carrying, then deposit home
        if (b.type === 'garden') {
            const cx = (b.tx + b.width / 2) * TILE, cy = MAP_OY + (b.ty + b.height / 2) * TILE;
            if (this.moveToward(u, cx, cy, 28, dt)) return;
            const avail = b.inventory?.['Food.Produce.Olive'] ?? 0;
            if (avail <= 0) { u.taskType = null; return; }
            let pick = 0;
            while (pick < avail && this.canUnitCarryMore(u, 'Food.Produce.Olive', pick + 1)) pick++;
            if (pick === 0) { u.taskType = null; return; }
            b.inventory['Food.Produce.Olive'] -= pick;
            u.carrying['Food.Produce.Olive'] = (u.carrying['Food.Produce.Olive'] ?? 0) + pick;
            u.taskType = null;
            return;
        }

        if (b.stock <= 0) { u.taskType = null; return; }
        const cx = (b.tx + b.width / 2) * TILE, cy = MAP_OY + (b.ty + b.height / 2) * TILE;
        if (this.moveToward(u, cx, cy, 28, dt)) return;
        u.isInside = false;
        const attrMult = this.getAttrMult(u, ['dex']);
        const workSpeed = (1.0 + (u.skills.farming?.level ?? 1) * 0.2) * attrMult * this.getRestMult(u);
        u.workProgress = (u.workProgress ?? 0) + dt * workSpeed;
        // Task 88n: burst harvest (threshold 2.0s)
        if (u.workProgress >= 2.0) {
            u.workProgress = 0;

            let pick = 0;
            while (pick < b.stock && this.canUnitCarryMore(u, 'Food.Grain.Wheat', pick + 1)) {
                pick++;
            }
            if (pick === 0) { u.taskType = null; return; }

            b.stock -= pick;
            // Sumer civ bonus: 25% extra grain on harvest
            const wheatPick = this.scene.civ === 'sumer' ? pick + Math.max(1, Math.floor(pick * 0.25)) : pick;
            u.carrying['Food.Grain.Wheat'] += wheatPick;
            b.dailyProduction = b.dailyProduction ?? {};
            b.dailyProduction['Food.Grain.Wheat'] = (b.dailyProduction['Food.Grain.Wheat'] ?? 0) + wheatPick;
            this._gainSkillXp(u, 'farming');
            // Redraw full construct graphic when a crop row boundary is crossed
            const rows = b.maxStock > 0 ? Math.round(b.stock / b.maxStock * 5) : 0;
            const prevRows = b.maxStock > 0 ? Math.round((b.drawnStock ?? b.maxStock) / b.maxStock * 5) : 0;
            if (rows !== prevRows) {
                b.drawnStock = b.stock;
                this.scene.constructManager.redrawConstruct(b);
            } else {
                this.scene.constructManager.redrawConstructBar(b);
            }
        }
    },

    handlePlantTask(u, dt) {
        const b = this.scene.constructManager?.getById(u.taskConstructId);
        if (!b?.built || b.type !== 'farm' || !b.needsPlanting) { u.taskType = null; return; }
        const cx = (b.tx + b.width / 2) * TILE, cy = MAP_OY + (b.ty + b.height / 2) * TILE;
        if (this.moveToward(u, cx, cy, 28, dt)) return;

        u.workProgress = (u.workProgress ?? 0) + dt;
        if (u.workProgress >= 6000) { // 6s plant time
            u.workProgress = 0;
            b.needsPlanting = false;
            b.stock = b.maxStock;
            this.scene.constructManager.redrawConstructBar(b);
            u.taskType = null;
        }
    },

    handleCollectTitheTask(u, dt) {
        // Step 1: Find construct with tithePending
        if (!u.targetConstructId) {
            const b = this.scene.constructs.find(b => b.built && Object.values(b.tithePending ?? {}).some(v => v > 0));
            if (!b) { u.taskType = null; return; }
            u.targetConstructId = b.id;
        }

        const b = this.scene.constructManager?.getById(u.targetConstructId);
        if (!b?.built) { u.targetConstructId = null; u.taskType = null; return; }

        const door = this._constructDoor(b);
        if (this.moveToward(u, door.x, door.y, 30, dt)) return;

        // Step 2: Collect tithe
        let collected = false;
        for (const [key, qty] of Object.entries(b.tithePending ?? {})) {
            if (qty > 0) {
                u.carrying[key] = (u.carrying[key] ?? 0) + qty;
                b.tithePending[key] = 0;
                collected = true;
                this.scene.uiManager.showFloatText(u.x, u.y - 14, `+${qty} ${key}`, '#88cc88');
            }
        }

        if (collected) {
            u.targetConstructId = null;
            u.taskType = 'deposit_tithe';
            // Clear flag if no more pending tithes anywhere
            if (!this.scene.constructs.some(b => b.built && Object.values(b.tithePending ?? {}).some(v => v > 0)))
                this.scene._hasTithePending = false;
        } else {
            u.targetConstructId = null; u.taskType = null;
            this.scene._hasTithePending = false;
        }
    },

    handleDepositTitheTask(u, dt) {
        const th = this._nearestOfTypes(u.x, u.y, ['grainsilo', 'storageshelf', 'townhall', 'chest']);
        if (th) {
            const door = this._constructDoor(th);
            if (this.moveToward(u, door.x, door.y, 30, dt)) return;
        } else {
            // No storage constructs — fall back to nearest storage appliance or zone tile
            if (u.taskType !== 'deposit_zone') this.seekDeposit(u);
            if (u.taskType === 'deposit_zone') { this.handleDepositZoneTask(u, dt); return; }
            u.taskType = null; return;
        }

        for (const [key, qty] of Object.entries(u.carrying)) {
            if (qty > 0) {
                this.scene.economyManager.addResource(key, qty);
                u.carrying[key] = 0;
                this.scene.uiManager.showFloatText(u.x, u.y - 14, `deposited ${qty} ${key}`, '#aaffcc');
            }
        }
        u.taskType = null;
    },

    _publicStorage() { return _PUBLIC_STORAGE; },
    _depositRoutes()  { return _DEPOSIT_ROUTES; },

    // Find nearest built construct of one of the given types
    _nearestOfTypes(x, y, types) {
        let best = null, bd = Infinity;
        for (const b of this.scene.constructs) {
            if (!b.built || b.faction === 'enemy') continue;
            if (!types.includes(b.type)) continue;
            const bx = (b.tx + b.width / 2) * TILE, by = MAP_OY + (b.ty + b.height / 2) * TILE;
            const d = Phaser.Math.Distance.Between(x, y, bx, by);
            if (d < bd) { bd = d; best = b; }
        }
        return best;
    },

    // Walk to the unit's sleeping spot and lie down. Resolves the target as the unit's own
    // bed (bedroom) or its home construct (camp/house). Returns 'entered' (now asleep),
    // 'moving' (walking — caller should return), or 'nohome' (target gone/unbuilt).
    _approachSleep(u, dt) {
        const fm = this.scene.constructManager;
        if (!fm) return 'nohome';
        let target = u.bedConstructId ? fm.getById(u.bedConstructId) : null;
        if (!target || !target.built || target.type !== 'bed') {
            target = fm.getById(u.homeConstructId);
            u.bedConstructId = (target && target.type === 'bed') ? target.id : null;
        }
        if (!target || !target.built) return 'nohome';

        const isBed = target.type === 'bed';
        const hw = target.width ?? 1, hh = target.height ?? 1;
        const cx = (target.tx + hw / 2) * TILE;
        const cy = MAP_OY + (target.ty + hh / 2) * TILE;
        // Bed → approach the bed tile itself (the unit paths in through the door). Camp/house →
        // one tile south of the blocked footprint (reliably walkable doorstep). Generous enter
        // radius avoids the wall/footprint dead-band that otherwise strands the unit.
        const ax = cx;
        const ay = isBed ? cy : MAP_OY + (target.ty + hh) * TILE + TILE;
        // ≥ diagonal-adjacent (≈1.42 tiles) so a unit that stops on a tile next to the
        // blocked bed/footprint still counts as "at the bed" and lies down.
        const enterR = isBed ? TILE * 1.6 : TILE * 1.6;

        if (Phaser.Math.Distance.Between(u.x, u.y, ax, ay) > enterR) {
            // Drop a carried load at storage on the way to bed.
            if (this.totalCarrying(u) > 0 && u.taskType !== 'deposit' && u.taskType !== 'deposit_zone')
                this.seekDeposit(u);
            if (u.taskType === 'deposit')      { this.handleDepositTask(u, dt);     return 'moving'; }
            if (u.taskType === 'deposit_zone') { this.handleDepositZoneTask(u, dt); return 'moving'; }
            u.targetNode = null; u.moveTo = null;
            this.moveToward(u, ax, ay, TILE * 0.4, dt);
            return 'moving';
        }
        u.x = cx; u.y = cy;
        u.isSleeping = true;
        u.currentPath = null; u._reachFailT = 0;
        if (isBed) { u._sleepConstructId = target.id; u.isInside = false; }
        else       { u.isInside = true; u._sleepConstructId = null; }
        return 'entered';
    },

    _seekCampHome(u) {
        const fm = this.scene.constructManager;
        if (!fm) return;
        // Family ownership: once a unit belongs to an estate, it sleeps only on its own estate.
        const estate = u.estateId ? this.scene.estateBounds.find(d => d.id === u.estateId) : null;
        const onEstate = (tx, ty) => !estate || fm.estateContains(estate, tx, ty);

        // Keep the current home if it's still valid; relocate onto the estate only once the
        // estate actually has a free bed (so units don't go homeless waiting for their bedroom).
        if (u.homeConstructId != null) {
            const home = fm.getById(u.homeConstructId);
            const homeOk = home && home.built && onEstate(home.tx, home.ty);
            // Upgrade from the communal camp/tent to a real bedroom bed once one is free on-estate
            // (so units actually move into newly built bedrooms instead of clinging to the camp). #3
            const campUpgrade = homeOk && home.type === 'camp' && !u.bedConstructId
                && this._estateBedFree(u, onEstate);
            if (homeOk && !campUpgrade) return;
            if (!homeOk) {
                if (estate) {
                    const claimed = this.scene.units.filter(w => w !== u && w.estateId === estate.id && w.bedConstructId).length;
                    if (fm.estateBedCapacity(estate) - claimed <= 0) return;   // no on-estate bed yet → stay
                } else if (home && home.built) return;
            }
            u.homeConstructId = null; u.bedConstructId = null;            // relocate
        }

        // Prefer a real bed (tier 0) over a communal camp/house slot (tier 1); break ties by distance.
        let best = null, bestDist = Infinity, bestTier = 99;
        const consider = (id, tx, ty, bedId) => {
            const tier = bedId ? 0 : 1;
            const d = Phaser.Math.Distance.Between(u.x, u.y, (tx + 0.5) * TILE, MAP_OY + (ty + 0.5) * TILE);
            if (tier < bestTier || (tier === bestTier && d < bestDist)) { bestTier = tier; bestDist = d; best = { id, bedId }; }
        };
        // 1) Prefab homes (camp / house).
        for (const item of fm.constructs) {
            if (!item.built || item.faction || !CONSTRUCTS[item.type]?.isHomeType) continue;
            if (!onEstate(item.tx, item.ty)) continue;
            const occupants = this.scene.units.filter(w => w.homeConstructId === item.id).length;
            if (occupants >= fm.getHouseCapacity(item)) continue;
            consider(item.id, item.tx, item.ty, null);
        }
        // 2) Bedrooms — enclosed rooms with beds. Residents share the room's anchor bed as
        //    homeConstructId (so cohabitation/breeding work), each claiming a specific bed.
        const seen = new Set();
        const takenBeds = new Set(this.scene.units.map(w => w.bedConstructId).filter(Boolean));
        for (const bed of fm.constructs) {
            if (bed.type !== 'bed' || !bed.built || bed.faction) continue;
            if (!onEstate(bed.tx, bed.ty)) continue;
            const anchor = fm.bedroomAnchor(bed);
            if (seen.has(anchor.id)) continue;
            seen.add(anchor.id);
            const beds = fm._bedsInRoom(anchor);
            const occupants = this.scene.units.filter(w => w.homeConstructId === anchor.id).length;
            if (occupants >= beds.length) continue;
            const freeBed = beds.find(b => !takenBeds.has(b.id)) ?? anchor;
            consider(anchor.id, anchor.tx, anchor.ty, freeBed.id);
        }
        if (best) {
            u.homeConstructId = best.id;
            if (best.bedId) u.bedConstructId = best.bedId;
        }
    },

    // True if an unclaimed, built bed exists within (onEstate) bounds — used to pull a camped
    // unit into a real bedroom once one is available.
    _estateBedFree(u, onEstate) {
        const fm = this.scene.constructManager;
        const taken = new Set(this.scene.units.filter(w => w !== u).map(w => w.bedConstructId).filter(Boolean));
        for (const bed of fm.constructs) {
            if (bed.type !== 'bed' || !bed.built || bed.faction) continue;
            if (!onEstate(bed.tx, bed.ty)) continue;
            if (!taken.has(bed.id)) return true;
        }
        return false;
    },

    seekLeisureTask(u) {
        const fm = this.scene.constructManager;
        if (!fm) return;
        let bestKey = null, bestDist = Infinity;
        for (const item of fm.constructs) {
            if (!item.built) continue;
            if (CONSTRUCTS[item.type]?.zoneType !== 'Leisure') continue;
            if (this.scene.units.some(w => w.id !== u.id && w.taskType === 'leisure' && w.taskConstructId === item.id)) continue;
            const d = Phaser.Math.Distance.Between(u.x, u.y, (item.tx + 0.5) * TILE, MAP_OY + (item.ty + 0.5) * TILE);
            if (d < bestDist) { bestDist = d; bestKey = item.id; }
        }
        if (bestKey !== null) { u.taskType = 'leisure'; u.taskConstructId = bestKey; u.workProgress = 0; }
    },

    handleLeisureTask(u, dt) {
        const fm = this.scene.constructManager;
        const item = fm?.getById(u.taskConstructId);
        if (!item?.built) { u.taskType = null; return; }
        const cx = (item.tx + 0.5) * TILE, cy = MAP_OY + (item.ty + 0.5) * TILE;
        if (this.moveToward(u, cx, cy, 18, dt)) return;

        if (!u.needs) u.needs = { food: 0.8, rest: 1, social: 0.8, joy: 0.8 };
        // Greece civ bonus: 40% faster joy recovery from leisure
        const joyRate = this.scene.civ === 'greece' ? 0.0252 : 0.018;
        u.needs.joy    = Math.min(1.0, (u.needs.joy    ?? 0.5) + dt * joyRate);
        u.needs.social = Math.min(1.0, (u.needs.social ?? 0.5) + dt * 0.010);
        u.workProgress = (u.workProgress ?? 0) + dt;

        // Drink beer for bonus joy (once every 2s)
        if (!u._lastBeerDrink || u.workProgress > u._lastBeerDrink + 2) {
            if ((this.scene.resources['Food.Drink.Beer'] ?? 0) >= 1) {
                this.scene.economyManager.takeFromCommons('Food.Drink.Beer', 1);
                u.needs.joy = Math.min(1.0, u.needs.joy + 0.12);
                u._lastBeerDrink = u.workProgress;
                this.scene.uiManager.showFloatText(cx, cy - 14, '🍺 cheers!', '#ffdd66');
            }
        }

        if (u.workProgress >= 5 || (u.needs.joy ?? 0) >= 0.95) {
            u.taskType = null; u.taskZoneKey = null; u.workProgress = 0; u._lastBeerDrink = null;
        }
    },

    // Chat with a nearby unit for ~6-8s; fast social recovery
    handleChatTask(u, dt) {
        if (!u.needs) u.needs = { food: 1, rest: 1, social: 0.8, joy: 0.8 };
        const target = this.scene.units.find(w => w.id === u._chatTargetId);
        if (!target || target.hp <= 0 || target.isSleeping) { u.taskType = null; return; }

        const d = Phaser.Math.Distance.Between(u.x, u.y, target.x, target.y);
        if (d > 28) { this.moveToward(u, target.x, target.y, 20, dt); return; }

        u.needs.social = Math.min(1.0, u.needs.social + dt * 0.03);
        u.needs.joy    = Math.min(1.0, u.needs.joy    + dt * 0.01);
        u.workProgress = (u.workProgress ?? 0) + dt;

        if (!u._chatEmitted) {
            this.scene.uiManager.showFloatText(u.x, u.y - 18, '💬', '#aaddff');
            u._chatEmitted = true;
        }

        if (u.workProgress >= 7 || u.needs.social >= 0.9) {
            u.taskType = null; u.workProgress = 0; u._chatTargetId = null; u._chatEmitted = false;
        }
    },

    // Sit or pause for ~15s; partial rest recovery (not full sleep)
    handleRestBreakTask(u, dt) {
        if (!u.needs) u.needs = { food: 1, rest: 1, social: 0.8, joy: 0.8 };

        // Walk to nearest seat/bench if one exists, otherwise rest in place
        const seat = this.scene.constructs.find(b => b.built && (b.type === 'bench' || b.type === 'tavernseat' || b.type === 'throne'));
        if (seat) {
            const sx = (seat.tx + 0.5) * TILE, sy = MAP_OY + (seat.ty + 0.5) * TILE;
            if (Phaser.Math.Distance.Between(u.x, u.y, sx, sy) > 20) {
                this.moveToward(u, sx, sy, 16, dt); return;
            }
        }

        u.needs.rest = Math.min(1.0, u.needs.rest + dt * 0.012);
        u.needs.joy  = Math.min(1.0, u.needs.joy  + dt * 0.005);
        u.workProgress = (u.workProgress ?? 0) + dt;

        if (!u._restEmitted) {
            this.scene.uiManager.showFloatText(u.x, u.y - 18, '😴', '#ccccff');
            u._restEmitted = true;
        }

        if (u.workProgress >= 15 || u.needs.rest >= 0.8) {
            u.taskType = null; u.workProgress = 0; u._restEmitted = false;
        }
    },

    // Stroll to 3 random nearby points for ~20s; joy recovery via wandering
    handleStrollTask(u, dt) {
        if (!u.needs) u.needs = { food: 1, rest: 1, social: 0.8, joy: 0.8 };

        if (!u._strollPoints || u._strollPoints.length === 0) {
            // Generate 3 random waypoints near current position
            u._strollPoints = Array.from({ length: 3 }, () => ({
                x: u.x + Phaser.Math.Between(-120, 120),
                y: u.y + Phaser.Math.Between(-80, 80),
            }));
            u._strollEmitted = false;
        }

        if (!u._strollEmitted) {
            this.scene.uiManager.showFloatText(u.x, u.y - 18, '🚶', '#bbffcc');
            u._strollEmitted = true;
        }

        const wp = u._strollPoints[0];
        const arrived = !this.moveToward(u, wp.x, wp.y, 12, dt);
        if (arrived) u._strollPoints.shift();

        u.needs.joy = Math.min(1.0, u.needs.joy + dt * 0.008);
        u.workProgress = (u.workProgress ?? 0) + dt;

        if (u._strollPoints.length === 0 || u.workProgress >= 25 || u.needs.joy >= 0.9) {
            u.taskType = null; u.workProgress = 0; u._strollPoints = null; u._strollEmitted = false;
        }
    },

    handleMentalBreakTask(u, dt) {
        if (!u._moodCollapsed) { u.taskType = null; u._mbTimer = 0; u._mbNode = null; return; }
        u._mbTimer = (u._mbTimer ?? 0) + dt;
        // The break overrides any normal gather target so tickWorker's trailing harvest can't fire.
        u.targetNode = null;

        // Act out: storm off and grab/eat the nearest food — forbidden or reserved, doesn't matter;
        // a colonist in crisis ignores every designation. Falls back to erratic wandering when
        // there's nothing within reach (or they've gorged themselves full).
        if ((u.needs?.food ?? 1) < 0.98) {
            const r = this._eatFromGroundPile(u, dt, 7 * TILE);   // already ignores forbidden + reservations
            if (r === 'moving' || r === 'ate') { u._mbNode = null; return; }
            if (this._mbRaidNode(u, dt)) return;                  // grab straight off the nearest food node
        }
        u._mbNode = null;

        // Erratic wandering between binges.
        if (!u._mbPoints || u._mbTimer > (u._mbNextPoint ?? 0)) {
            const range = 80;
            u._mbPoints = {
                x: Phaser.Math.Clamp(u.x + Phaser.Math.Between(-range, range), TILE, 1024 * TILE - TILE),
                y: Phaser.Math.Clamp(u.y + Phaser.Math.Between(-range, range), MAP_OY + TILE, MAP_OY + 1024 * TILE - TILE),
            };
            u._mbNextPoint = u._mbTimer + Phaser.Math.Between(5, 12);
        }
        if (u._mbPoints) {
            const d = Phaser.Math.Distance.Between(u.x, u.y, u._mbPoints.x, u._mbPoints.y);
            if (d > 6) this.moveToward(u, u._mbPoints.x, u._mbPoints.y, u.speed * 0.7, dt);
            else u._mbPoints = null;
        }
    },

    // Mental-break binge: walk to the nearest food node (forbidden allowed — findNearNode honors the
    // mental_break exception) and tear bites off it. Uses its own _mbNode so it never collides with
    // the normal gather pipeline. Returns true while it's busy (moving or biting).
    _mbRaidNode(u, dt) {
        if (!u._mbNode || (u._mbNode.stock ?? 0) <= 0) {
            u._mbNode = this.findNearNode(u, 7 * TILE,
                ['berry_bush', 'wild_garden', 'olive_grove', 'grape_vine', 'wild_wheat'], false);
        }
        const n = u._mbNode;
        if (!n) return false;
        if (this.moveToward(u, n.x, n.y, 20, dt)) return true;   // still walking over
        const res = NODES[n.type]?.resource;
        const nut = _NUTRITION_MAP[res] ?? 0.15;
        n.stock = Math.max(0, (n.stock ?? 0) - 1);
        u.needs = u.needs ?? {};
        u.needs.food = Math.min(1.0, (u.needs.food ?? 0) + nut);
        const now = this.scene.time?.now ?? 0;
        if (now - (u._grabFloatT ?? 0) > 1000) {     // don't spam a float every single bite
            u._grabFloatT = now;
            this.scene.uiManager?.showFloatText?.(u.x, u.y - 14,
                `😡 grabs ${res ? res.split('.').pop() : 'food'}`, '#ffcc66');
        }
        if (n.stock <= 0) { this.scene.mapManager?.redrawNode?.(n); u._mbNode = null; }
        return true;
    },

    seekGroundItem(u) {
        // Haul is a prioritizable work type (People → Work grid): Off disables picking up loose items.
        if ((u.taskPriorities?.haul ?? 3) === 0) return false;
        const items = this.scene.groundItems;
        if (!items?.length) return false;
        let best = null, bd = Infinity;
        for (const item of items) {
            if (item.forbidden) continue;
            // A reservation only counts if its owner still exists and is actively hauling THIS
            // item. Otherwise the holder died / was retasked / fled / drafted mid-haul and never
            // released it — self-heal the stale claim so the pile is haulable again.
            if (item.reserved != null) {
                const owner = this._byUnitId?.get(item.reserved)
                    ?? this.scene.units.find(w => w.id === item.reserved);
                const validClaim = owner && owner.hp > 0
                    && owner.taskType === 'haul' && owner.targetItemId === item.id;
                if (validClaim) continue;
                item.reserved = null;
            }
            if (!this.canUnitCarryMore(u, item.resource, 1)) continue;
            const d = Phaser.Math.Distance.Between(u.x, u.y, item.x, item.y);
            if (d < 4000 && d < bd) { bd = d; best = item; }
        }
        if (!best) return false;
        best.reserved = u.id;
        u.taskType    = 'haul';
        u.targetItemId = best.id;
        return true;
    },

    handleHaulTask(u, dt) {
        const item = this.scene.groundItems.find(i => i.id === u.targetItemId);
        if (!item) { u.taskType = null; u.targetItemId = null; return; }

        const dist = Phaser.Math.Distance.Between(u.x, u.y, item.x, item.y);
        if (dist > 22) { u.moveTo = { x: item.x, y: item.y }; return; }

        let pick = 0;
        while (pick < item.qty && this.canUnitCarryMore(u, item.resource, pick + 1)) pick++;
        if (pick > 0) {
            u.carrying[item.resource] = (u.carrying[item.resource] ?? 0) + pick;
            item.qty -= pick;
        }

        if (item.qty <= 0) {
            this.scene.unitManager.removeGroundItem(item);
        } else {
            item.reserved = null;
            this.scene.unitManager.drawGroundItem(item);
        }

        u.taskType = null;
        u.targetItemId = null;
    },

    seekBuryTask(u) {
        const corpse = this.scene.units.find(c =>
            c._corpse && c !== u &&
            !this.scene.units.some(w => w !== u && w.taskType === 'bury' && w._buryTargetId === c.id));
        if (!corpse) return;
        u.taskType = 'bury';
        u._buryTargetId = corpse.id;
        u.workProgress = 0;
    },

    handleBuryTask(u, dt) {
        const corpse = this.scene.units.find(c => c.id === u._buryTargetId && c._corpse);
        if (!corpse) { u.taskType = null; u._buryTargetId = null; return; }

        const d = Phaser.Math.Distance.Between(u.x, u.y, corpse.x, corpse.y);
        if (d > TILE * 0.6) {
            this.moveToward(u, corpse.x, corpse.y, TILE * 0.5, dt);
            return;
        }

        u.workProgress = (u.workProgress ?? 0) + dt;
        if (u.workProgress < 12) return;  // ~12 game-seconds of rite

        // Complete burial
        const name = corpse.name ?? 'the fallen';
        this.scene.uiManager?.showFloatText?.(corpse.x, corpse.y - 20, `⚰ ${name} buried`, '#bbaacc');
        // Small grief relief for nearby workers
        for (const w of this.scene.units) {
            if (w === u || w._corpse || w.hp <= 0 || w.isEnemy) continue;
            if (Phaser.Math.Distance.Between(w.x, w.y, corpse.x, corpse.y) < 5 * TILE) {
                w._grief = Math.max(0, (w._grief ?? 0) - 0.15);
            }
        }
        this.scene.units = this.scene.units.filter(c => c !== corpse);
        u.taskType = null; u._buryTargetId = null; u.workProgress = 0;
    },

    seekDeposit(u) {
        const hasCarry = Object.keys(u.carrying).some(r => (u.carrying[r] || 0) > 0);
        if (!hasCarry) return;

        // Private roles → home oikos
        if (_PRIVATE_ROLES.has(u.role) && u.homeConstructId) {
            const home = this.scene.constructManager?.getById(u.homeConstructId);
            if (home?.built && CONSTRUCTS[home.type]?.isHomeType) {
                u.taskType = 'deposit'; u.taskConstructId = home.id; u._depositPrivate = true;
                return;
            }
        }

        // Farmers at private farms deposit to their home oikos, not the commons
        if (u.role === 'farmer') {
            const workplace = this.scene.constructManager?.getById(u.taskConstructId);
            const isPublicFarm = !workplace?.built || workplace.isPublic;
            if (!isPublicFarm && u.homeConstructId) {
                const home = this.scene.constructManager?.getById(u.homeConstructId);
                if (home?.built && CONSTRUCTS[home.type]?.isHomeType) {
                    u.taskType = 'deposit'; u.taskConstructId = home.id; u._depositPrivate = true; return;
                }
            }
        }

        // Storage zone deposit: prefer appliance tiles, fall back to bare zone tiles
        const zm = this.scene.zoneManager;
        const fm = this.scene.constructManager;
        if (zm?.storageTiles.size > 0) {
            // Pick a storage tile that accepts the carried goods and still has room, biased by
            // zone priority (higher fills first), then a small appliance-tile preference, then
            // proximity. Full tiles (capacity reached) are skipped so haulers overflow to the
            // next-best zone instead of piling onto a full one.
            const carryKeys = Object.keys(u.carrying).filter(r => (u.carrying[r] ?? 0) > 0);
            const tileOk = (cfg) => zm.zoneHasRoom(cfg) &&
                (!cfg?.accepts?.length || carryKeys.some(r => cfg.accepts.some(cat => r.startsWith(cat))));
            let bestKey = null, bestScore = -Infinity;
            for (const [key, cfg] of zm.storageTiles) {
                if (!tileOk(cfg)) continue;
                const [tx, ty] = key.split(',').map(Number);
                const item = fm?.getAt(tx, ty);
                const isAppl = item?.built && _STORAGE_APPL.has(item.type);
                const d = Phaser.Math.Distance.Between(u.x, u.y, (tx + 0.5) * TILE, MAP_OY + (ty + 0.5) * TILE);
                const score = zm.zonePriority(cfg) * 100000 + (isAppl ? 5000 : 0) - d;
                if (score > bestScore) { bestScore = score; bestKey = key; }
            }
            if (bestKey !== null) { u.taskType = 'deposit_zone'; u.taskZoneKey = bestKey; return; }
        }

        // Role-based routing: prefer private construct in home domain, fall back to nearest public
        const routeTypes = this._depositRoutes()[u.role];
        if (routeTypes) {
            const _homeC = u.homeConstructId ? this.scene.constructManager?.getById(u.homeConstructId) : null;
            const homeDomain = _homeC
                ? this.scene.constructManager.getEstateAt(_homeC.tx, _homeC.ty)
                : null;

            // First try: private construct in worker's home domain
            const privateDest = homeDomain
                ? this.scene.constructs.find(b =>
                    b.built && !b.faction && !b.isPublic &&
                    routeTypes.includes(b.type) &&
                    this.scene.constructManager.getEstateAt(b.tx, b.ty)?.id === homeDomain.id)
                : null;

            if (privateDest) {
                u.taskType = 'deposit'; u.taskConstructId = privateDest.id; u._depositPrivate = false; return;
            }

            // Second try: public (or any, pre-civic) construct of the route type
            const preCivic = this._isPreCivicAge();
            const publicDest = this.scene.constructs.find(b =>
                b.built && !b.faction && (b.isPublic || preCivic) && routeTypes.includes(b.type));
            if (publicDest) { u.taskType = 'deposit'; u.taskConstructId = publicDest.id; u._depositPrivate = false; return; }
        }

        // Last resort: bring it home; private only if the home construct is itself private
        if (u.homeConstructId) {
            const home = this.scene.constructManager?.getById(u.homeConstructId);
            if (home?.built) { u.taskType = 'deposit'; u.taskConstructId = home.id; u._depositPrivate = !home.isPublic; }
        }
    },

    handleDepositTask(u, dt) {
        const b = this.scene.constructManager?.getById(u.taskConstructId);
        if (!b?.built || b.faction) { u.taskType = null; u._depositPrivate = false; return; }
        const cx = (b.tx + b.width / 2) * TILE, cy = MAP_OY + (b.ty + b.height / 2) * TILE;
        if (this.moveToward(u, cx, cy, 30, dt)) return;
        u.isInside = !(CONSTRUCTS[b.type]?.outdoor ?? false);

        b.inventory = b.inventory ?? {};
        for (const [res, amt] of Object.entries(u.carrying)) {
            if ((amt || 0) <= 0) continue;

            if (u._depositPrivate) {
                // Private deposit to house: just update house inventory
                b.inventory[res] = (b.inventory[res] ?? 0) + amt;
                u.carrying[res] = 0;
                this.scene.uiManager.showFloatText(u.x, u.y - 14, `+${amt} ${res}`, '#aaffcc');
            } else {
                // Deposit to construct inventory; syncResources() below keeps commons in sync
                b.inventory[res] = (b.inventory[res] ?? 0) + amt;
                u.carrying[res] = 0;
                this.scene.uiManager.showFloatText(u.x, u.y - 14, `+${amt} ${res}`, b.isPublic ? '#88ff88' : '#88ccff');
            }
        }
        const wasPrivate = u._depositPrivate;
        u.taskType = null;
        u._depositPrivate = false;
        u.isInside = false;

        // Keep commons in sync if deposited to a public construct
        if (b.isPublic) {
            this.scene.economyManager.syncResources();
            this.scene.updateUI();
        }

        // Restore role immediately after self-supply deposit
        if (u._prevRole) {
            u.role = u._prevRole;
            u._prevRole = null;
            this.seekWorkshopTask(u);
        }
    },

    handleDepositZoneTask(u, dt) {
        const zm = this.scene.zoneManager;
        const cfg = zm?.storageTiles.get(u.taskZoneKey);
        if (!cfg) { u.taskType = null; return; }
        const [tx, ty] = u.taskZoneKey.split(',').map(Number);
        const cx = tx * TILE + TILE / 2, cy = MAP_OY + ty * TILE + TILE / 2;
        if (this.moveToward(u, cx, cy, 30, dt)) return;

        const accepts = cfg.accepts ?? [];
        cfg.inventory = cfg.inventory ?? {};
        let deposited = false;
        for (const [res, amt] of Object.entries(u.carrying)) {
            if ((amt ?? 0) <= 0) continue;
            if (accepts.length && !accepts.some(cat => res.startsWith(cat))) continue;
            cfg.inventory[res] = (cfg.inventory[res] ?? 0) + amt;
            u.carrying[res] = 0;
            this.scene.uiManager.showFloatText(cx, cy - 14, `+${amt} ${res.split('.').pop()}`, '#88ff88');
            GameLogger.log('deposit', { u: u.name, res: res.split('.').pop(), qty: amt, tile: u.taskZoneKey });
            deposited = true;
        }
        if (deposited) this.scene.economyManager.syncResources();
        u.taskType = null;
        u.isInside = false;
    },

    seekBuilderTask(u) {
        // Deconstruction jobs take priority over new construction
        const deconSite = this.scene.constructs.find(b =>
            b.built && b.deconstructing && !b.faction &&
            !this.scene.units.some(w => w.id !== u.id && w.taskType === 'deconstruct' && w.taskConstructId === b.id));
        if (deconSite) {
            u.taskType = 'deconstruct'; u.taskConstructId = deconSite.id;
            return;
        }

        const site = this.scene.constructs.find(c => {
            if (c.built || c.faction === 'enemy') return false;
            // Ensure no other worker is already on this specific task
            const alreadyClaimed = this.scene.units.some(w => w.id !== u.id && w.taskConstructId === c.id);
            return !alreadyClaimed;
        });

        if (site) {
            u.taskType = 'build';
            u.taskConstructId = site.id;
            u.workProgress = 0;
            // No moveTo here — handleBuildTask routes the builder to materials first, then the site.
            return;
        }

        // No construct to raise — pick up a planned roof tile if one is in reach (#29).
        this._seekRoofBuild(u);
    },

    _seekRoofBuild(u) {
        const rm = this.scene.roofManager;
        if (!rm || rm.roofs.size === 0) return;
        const claimed = new Set(this.scene.units
            .filter(w => w.id !== u.id && w.taskType === 'roof_build' && w._roofKey)
            .map(w => w._roofKey));
        // nearestPlannedRoof gives the closest unbuilt tile; skip if another builder already has it.
        let best = null, bestD = Infinity;
        for (const [k, r] of rm.roofs) {
            if (r.built || claimed.has(k)) continue;
            const [tx, ty] = k.split(',').map(Number);
            const cx = (tx + 0.5) * TILE, cy = MAP_OY + (ty + 0.5) * TILE;
            const d = (cx - u.x) ** 2 + (cy - u.y) ** 2;
            if (d < bestD) { bestD = d; best = k; }
        }
        if (best) { u.taskType = 'roof_build'; u._roofKey = best; u.workProgress = 0; }
    },

    handleRoofBuild(u, dt) {
        const rm = this.scene.roofManager;
        const k  = u._roofKey;
        const roof = k ? rm?.roofs.get(k) : null;
        if (!roof || roof.built) { u.taskType = null; u._roofKey = null; u.workProgress = 0; return; }

        const [tx, ty] = k.split(',').map(Number);
        const cx = (tx + 0.5) * TILE, cy = MAP_OY + (ty + 0.5) * TILE;
        if (this.moveToward(u, cx, cy, 28, dt)) return;
        u.isInside = false;

        const attrMult  = this.getAttrMult(u, ['str']);
        const workSpeed = (1.0 + (u.skills.masonry?.level ?? 1) * 0.2) * attrMult * this.getRestMult(u);
        u.workProgress = (u.workProgress ?? 0) + dt * workSpeed;
        if (u.workProgress >= 12.0) {
            u.workProgress = 0;
            roof.work -= 5;
            this._gainSkillXp(u, 'masonry');
            if (roof.work <= 0) {
                rm.completeRoof(tx, ty);
                u.taskType = null; u._roofKey = null;
            }
        }
    },

    seekFarmerTask(u) {
        const home = u.homeConstructId
            ? this.scene.constructManager?.getById(u.homeConstructId)
            : null;
        const homeDomain = home?.domainId
            ? this.scene.estateBounds.find(d => d.id === home.domainId)
            : null;

        // ── Grow zones (tile-based crops) ─────────────────────────────────────
        const zm = this.scene.zoneManager;
        if (zm) {
            const nearest = (keys) => {
                let bestKey = null, bestDist = Infinity;
                for (const key of keys) {
                    const [tx, ty] = key.split(',').map(Number);
                    const d = Phaser.Math.Distance.Between(u.x, u.y, tx * TILE + TILE / 2, MAP_OY + ty * TILE + TILE / 2);
                    if (d < bestDist) { bestDist = d; bestKey = key; }
                }
                return bestKey;
            };
            const readyKey = nearest(zm.getReadyGrowTiles());
            if (readyKey !== null) { u.taskType = 'harvest_grow'; u.taskZoneKey = readyKey; u.workProgress = 0; return; }
            const plantKey = nearest(zm.getPlantableTiles());
            if (plantKey !== null) { u.taskType = 'plant_grow';   u.taskZoneKey = plantKey; u.workProgress = 0; return; }
        }

        // Crops growing but nothing to do — forage food nodes (no slate required)
        this.seekNodeTask(u, ['berry_bush', 'wild_garden', 'olive_grove', 'grape_vine', 'wild_wheat', 'fishing_spot'], false, 2000);
    },

    seekWorkshopTask(u) {
        const def = WORKSHOP_JOBS[u.role];
        if (!def) { u.role = null; return; }

        // ── Zone-based path: freeform appliances inside a work zone ───────────
        const fm = this.scene.constructManager, zm = this.scene.zoneManager;
        if (fm && zm) {
            for (const zoneTiles of zm.getWorkZones()) {
                for (const { tx, ty } of zoneTiles) {
                    const item = fm.getAt(tx, ty);
                    if (!item?.built) continue;
                    if (CONSTRUCTS[item.type]?.job !== u.role) continue;
                    const key = `${tx},${ty}`;
                    if (this.scene.units.some(w => w.id !== u.id && w.taskType === 'zone_workshop' && w.taskZoneKey === key)) continue;
                    u.taskType      = 'zone_workshop';
                    u.taskZoneKey   = key;
                    u.workshopPhase = 'procure';
                    u.workshopSubrole = null;
                    u.workProgress  = 0;
                    return;
                }
            }
        }

        // ── Construct-based path (legacy constructs) ────────────────────────────
        // Find a construct with an open procure OR process slot
        const construct = this.scene.constructs.find(b => {
            if (b.type !== def.construct || !b.built || b.faction) return false;
            if (!this._canAccessConstruct(u, b)) return false;
            const hasProcurer = this.scene.units.some(w => w.id !== u.id && w.role === u.role && w.workshopSubrole === 'procure' && w.taskConstructId === b.id);
            const hasProcessor = this.scene.units.some(w => w.id !== u.id && w.role === u.role && w.workshopSubrole === 'process' && w.taskConstructId === b.id);
            return !hasProcurer || !hasProcessor;
        });
        if (!construct) {
            // If no built construct — check for unbuilt ghost (builder will handle it)
            const unbuilt = this.scene.constructs.find(b => b.type === def.construct && !b.built && !b.faction);
            if (!unbuilt) this._autoPlaceWorkshop(u, def);
            return;
        }

        const hasProcurer = this.scene.units.some(w => w.id !== u.id && w.role === u.role && w.workshopSubrole === 'procure' && w.taskConstructId === construct.id);
        u.workshopSubrole = hasProcurer ? 'process' : 'procure';

        if (u.workshopSubrole === 'procure') {
            const sourceTypes = this._fetchSources()[u.role] ?? [];
            const source = this._findSourceConstructNear(u.x, u.y, def.input, sourceTypes, u);
            if (!source) {
                const supply = this._selfSupply()[u.role];
                if (supply) {
                    const node = this.findNearNode(u, 8000, supply.nodes);
                    if (node) { u._prevRole = u.role; u.role = u.role === 'mason' ? 'miner' : 'woodcutter'; u.targetNode = node; return; }
                }
                return;
            }
            u.taskType = 'workshop'; u.taskConstructId = construct.id;
            u.fetchConstructId = source.id; u.workshopPhase = 'goFetch';
        } else {
            u.taskType = 'workshop'; u.taskConstructId = construct.id;
            u.workshopPhase = 'process';
            u.isInside = !(CONSTRUCTS[construct.type]?.outdoor ?? false);
        }
    },

    // Pursue the unit's preferred profession by getting its building constructed when none
    // exists yet — gated so it never starves the colony or clutters the map. On success the
    // unit becomes a builder and raises the ghost via the normal build flow; once built, its
    // ordinary seekWorkshopTask activates the vocation. Returns true if a build was started.
    _seekVocationBuild(u, time) {
        if (time - (u._vocBuildCheck ?? 0) < 6000) return false;   // throttle scans
        u._vocBuildCheck = time;

        const def = u.vocation && JOBS[u.vocation];
        const ctype = def?.construct;
        if (!ctype || !CONSTRUCTS[ctype]) return false;            // vocation needs no building
        if (CONSTRUCTS[ctype].placement === 'edge') return false;

        const cm = this.scene.constructManager;
        // The archon's household pioneers new build types; other citizens only build what the
        // colony already knows how to build (unlocked). And the archon respects the pioneer toggle.
        if (u.isArchon) { if (!this._archonMayInitiate(ctype)) return false; }
        else if (!cm.isConstructUnlocked(ctype)) return false;
        // Don't pioneer a workshop whose input can't be supplied yet — e.g. an oven before a mill. (B2)
        if (def.input && !(def.inputs ?? [def.input]).some(k => cm.inputAvailable(k))) return false;

        // Already exists (built or ghost) — the normal workshop flow will use/finish it.
        if (this.scene.constructs.some(b => b.type === ctype && !b.faction)) return false;

        const workers = this.scene.units.filter(w => w.type === 'worker' && !w.isEnemy && w.hp > 0);
        const pop = workers.length;
        const econ = this.scene.economyManager;

        // Gate (a): no food crisis / spare labour — staple provisioning pressure must be modest.
        const foodPressure = Math.max(
            econ?.provisioningPressure?.('Food.Grain.Wheat',  pop) ?? 0,
            econ?.provisioningPressure?.('Food.Produce.Berry', pop) ?? 0,
            econ?.provisioningPressure?.('Food.Meat.Venison',  pop) ?? 0);
        if (foodPressure > 0.6) return false;

        // Gate (b): per-type cap so the map doesn't fill with one workshop.
        const cap = Math.max(1, Math.ceil(pop / 8));
        const builtCount = this.scene.constructs.filter(b => b.type === ctype && b.built && !b.faction).length;
        if (builtCount >= cap) return false;

        // (Materials are consumed from commons by the build flow as they become available, so
        // we don't hard-block on affordability here — gathering is part of pursuing the goal.)
        const placed = this._autoPlaceWorkshop(u, def);
        if (placed) GameLogger.log('vocation_build', { u: u.name, voc: u.vocation, build: ctype });
        return placed;
    },

    // Place a workshop's construct ghost near the unit. Indoor workshops need an enclosed
    // room; outdoor ones can sit on any free ground. Returns true if a ghost was placed.
    _autoPlaceWorkshop(u, def) {
        const type = def.construct;
        if (!type || !CONSTRUCTS[type]) return false;
        const cDef = CONSTRUCTS[type];
        if (cDef.placement === 'edge') return false;
        const cm = this.scene.constructManager;
        const baseTx = Math.floor(u.x / TILE);
        const baseTy = Math.floor((u.y - MAP_OY) / TILE);
        const w = cDef.width ?? 1, h = cDef.height ?? 1;
        const outdoor = !!cDef.outdoor;

        let site;
        if (outdoor) {
            // Outdoor workshop → best-scoring open site (prefers road/building adjacency). #9
            site = cm.findScoredSite({ tx: baseTx, ty: baseTy }, w, h, 20);
        } else {
            // Indoor workshop → first free tile inside an enclosed room (room placement, which is
            // itself road-scored, decides the location).
            for (let r = 1; r <= 20 && !site; r++)
                for (let dx = -r; dx <= r && !site; dx++)
                    for (let dy = -r; dy <= r; dy++) {
                        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
                        const tx = baseTx + dx, ty = baseTy + dy;
                        if (tx < 1 || ty < 1 || !cm.isFree(tx, ty, w, h, type)) continue;
                        const room = cm.getRoomAt(tx, ty, 60);
                        if (!room || room.length < 2 || room.length > 60) continue;
                        site = { tx, ty }; break;
                    }
        }
        if (!site) return false;   // no valid site (indoor workshop needs a room built first)
        cm.placeConstruct(type, site.tx, site.ty);
        u.role = 'builder';
        this.scene.uiManager?.showFloatText?.(site.tx * TILE, MAP_OY + site.ty * TILE - 14,
            `${def.construct} planned`, '#aaddff');
        return true;
    },

    // Returns true if construct b is inside the same oikos domain as unit u's home
    _isInUnitDomain(u, b) {
        const home = u.homeConstructId
            ? this.scene.constructs.find(h => h.id === u.homeConstructId)
            : null;
        if (!home?.domainId) return false;
        return b.domainId === home.domainId;
    },

    _isPreCivicAge() {
        return this.scene.constructManager?._preCivicAge ?? true;
    },

    // Returns true if unit u is allowed to work in construct b
    _canAccessConstruct(u, b) {
        if (this._isPreCivicAge()) return true; // Before townhall, everything is shared
        if (b.isPublic) return true;
        if (!b.domainId) return true; // unowned — accessible to all until claimed by an oikos
        return this._isInUnitDomain(u, b);
    },

    _findSourceConstructNear(x, y, input, types, unit = null) {
        let best = null, bd = Infinity;
        for (const b of this.scene.constructs) {
            if (!b.built || b.faction === 'enemy') continue;
            if (!types.includes(b.type)) continue;
            if ((b.inventory?.[input] ?? 0) <= 0) continue;
            if (unit && !this._canAccessConstruct(unit, b)) continue;
            const bx = (b.tx + b.width / 2) * TILE, by2 = MAP_OY + (b.ty + b.height / 2) * TILE;
            const d = Phaser.Math.Distance.Between(x, y, bx, by2);
            if (d < bd) { bd = d; best = b; }
        }
        return best;
    },

    handleWorkshopTask(u, dt) {
        const b   = this.scene.constructManager?.getById(u.taskConstructId);
        const def = this._wsResolveDef(u, WORKSHOP_JOBS[u.role], b);
        if (!b?.built || !def) { u.taskType = null; u.workshopPhase = null; u.isInside = false; return; }

        // === PROCURER: goFetch → goWork → loop back to goFetch ===
        if (u.workshopSubrole === 'procure') {
            // Queue mode: idle if no order is currently workable (mirrors processor check below)
            if (Array.isArray(b.productionQueue) && !this._billActiveOrder(b, def)) {
                u.workshopPhase = 'idle';
                return;
            }
            if (u.workshopPhase === 'goFetch' || !u.workshopPhase) {
                const src = this.scene.constructManager?.getById(u.fetchConstructId);
                if (!src?.built) {
                    const sourceTypes = this._fetchSources()[u.role] ?? [];
                    const newSrc = this._findSourceConstructNear(u.x, u.y, def.input, sourceTypes, u);
                    if (!newSrc) { u.taskType = null; u.workshopPhase = null; return; }
                    u.fetchConstructId = newSrc.id;
                    return;
                }
                const door = this._constructDoor(src);
                if (this.moveToward(u, door.x, door.y, 28, dt)) return;

                src.inventory = src.inventory ?? {};
                const avail = src.inventory[def.input] ?? 0;
                if (avail <= 0) {
                    const sourceTypes = this._fetchSources()[u.role] ?? [];
                    const newSrc = this._findSourceConstructNear(u.x, u.y, def.input, sourceTypes, u);
                    if (!newSrc) { u.taskType = null; u.workshopPhase = null; return; }
                    u.fetchConstructId = newSrc.id;
                    return;
                }
                const take = Math.min(def.carryQty, avail);
                src.inventory[def.input] -= take;
                this.scene.economyManager.syncResources();
                u.carrying[def.input] = (u.carrying[def.input] ?? 0) + take;
                u.workshopPhase = 'goWork';
                return;
            }

            if (u.workshopPhase === 'goWork') {
                const door = this._constructDoor(b);
                if (this.moveToward(u, door.x, door.y, 28, dt)) return;

                const carry = u.carrying[def.input] ?? 0;
                if (carry > 0) {
                    b.inbox = b.inbox ?? {};
                    b.inbox[def.input] = (b.inbox[def.input] ?? 0) + carry;
                    u.carrying[def.input] = 0;
                }
                // Loop back — procurer never processes
                u.workshopPhase = 'goFetch';
                const sourceTypes = this._fetchSources()[u.role] ?? [];
                const nextSrc = this._findSourceConstructNear(u.x, u.y, def.input, sourceTypes, u);
                if (!nextSrc) { u.taskType = null; u.workshopPhase = null; return; }
                u.fetchConstructId = nextSrc.id;
                return;
            }
            return;
        }

        // === PROCESSOR: stay at bench, consume inbox → output ===
        if (u.workshopSubrole === 'process') {
            // Queue mode: idle if no order is currently workable
            if (Array.isArray(b.productionQueue) && !this._billActiveOrder(b, def)) return;

            const cx = (b.tx + b.width / 2) * TILE;
            const cy = MAP_OY + (b.ty + b.height / 2) * TILE;
            if (this.moveToward(u, cx, cy, 10, dt)) return;

            u.isInside = !(CONSTRUCTS[b.type]?.outdoor ?? false);

            if ((b.inbox?.[def.input] ?? 0) <= 0) {
                // Idle — wait for procurer to refill inbox
                return;
            }

            this._doProcessTick(u, b, def, dt);
            return;
        }

        // === FALLBACK (old saves, no subrole): original full-cycle logic ===
        if (u.workshopPhase === 'goFetch') {
            const src = this.scene.constructManager?.getById(u.fetchConstructId);
            if (!src?.built) {
                const sourceTypes = this._fetchSources()[u.role] ?? [];
                const newSrc = this._findSourceConstructNear(u.x, u.y, def.input, sourceTypes, u);
                if (!newSrc) { u.taskType = null; u.workshopPhase = null; return; }
                u.fetchConstructId = newSrc.id;
                return;
            }
            const door = this._constructDoor(src);
            if (this.moveToward(u, door.x, door.y, 28, dt)) return;

            src.inventory = src.inventory ?? {};
            const avail = src.inventory[def.input] ?? 0;
            if (avail <= 0) {
                const sourceTypes = this._fetchSources()[u.role] ?? [];
                const newSrc = this._findSourceConstructNear(u.x, u.y, def.input, sourceTypes, u);
                if (!newSrc) { u.taskType = null; u.workshopPhase = null; return; }
                u.fetchConstructId = newSrc.id;
                return;
            }
            const take = Math.min(def.carryQty, avail);
            src.inventory[def.input] -= take;
            this.scene.economyManager.syncResources();
            u.carrying[def.input] = (u.carrying[def.input] ?? 0) + take;
            u.workshopPhase = 'goWork';
            return;
        }

        if (u.workshopPhase === 'goWork') {
            const door = this._constructDoor(b);
            if (this.moveToward(u, door.x, door.y, 28, dt)) return;

            const carry = u.carrying[def.input] ?? 0;
            if (carry > 0) {
                b.inbox = b.inbox ?? {};
                b.inbox[def.input] = (b.inbox[def.input] ?? 0) + carry;
                u.carrying[def.input] = 0;
            }
            u.workshopPhase = 'process';
            u.isInside = !(CONSTRUCTS[b.type]?.outdoor ?? false);
            return;
        }

        const cx = (b.tx + b.width / 2) * TILE;
        const cy = MAP_OY + (b.ty + b.height / 2) * TILE;
        if (this.moveToward(u, cx, cy, 10, dt)) return;

        if ((b.inbox?.[def.input] ?? 0) <= 0) {
            u.isInside = false;
            const sourceTypes = this._fetchSources()[u.role] ?? [];
            const newSrc = this._findSourceConstructNear(u.x, u.y, def.input, sourceTypes, u);
            if (!newSrc) { u.taskType = null; u.workshopPhase = null; return; }
            u.fetchConstructId   = newSrc.id;
            u.workshopPhase = 'goFetch';
            return;
        }

        this._doProcessTick(u, b, def, dt);
    },

    // ── Bill model ──────────────────────────────────────────────────────────────
    // Each queue order is { qty, done, mode?, suspended? }. mode:
    //   'count'   (default) — produce qty, then the order is removed
    //   'untilN'           — keep colony stock of the output at ≥ qty (re-activates if it drops)
    //   'forever'          — never stops
    // Suspended orders are skipped. Returns the first workable order, or null if the bill is
    // exhausted/suspended (workshop idles).
    _billOrderActive(b, def, o) {
        if (!o || o.suspended) return false;
        const mode = o.mode ?? 'count';
        if (mode === 'forever') return true;
        if (mode === 'untilN')  return (this.scene.resources?.[def.output] ?? 0) < o.qty;
        return (o.done ?? 0) < o.qty;
    },
    _billActiveOrder(b, def) {
        const q = b.productionQueue;
        if (!Array.isArray(q)) return null;
        for (const o of q) if (this._billOrderActive(b, def, o)) return o;
        return null;
    },

    _doProcessTick(u, b, def, dt) {
        const queue = b.productionQueue;
        let active = null;
        if (Array.isArray(queue)) {
            // Remove front-most finished count-orders (untilN/forever persist).
            while (queue.length > 0 && (queue[0].mode ?? 'count') === 'count' && (queue[0].done ?? 0) >= queue[0].qty) {
                queue.shift();
                this.scene.uiManager.showFloatText(u.x, u.y - 20, 'Order done!', '#88ffaa');
            }
            active = this._billActiveOrder(b, def);
            if (!active) { u.workshopPhase = 'goFetch'; return; }
        }

        const attrMult = this.getAttrMult(u, ['dex', 'int']);
        const workSpeed = (1.0 + (u.skills[def.skill]?.level ?? 1) * 0.2) * attrMult * this.getRestMult(u);
        u.workProgress = (u.workProgress ?? 0) + dt * workSpeed;
        if (u.workProgress >= 3.0) {
            u.workProgress = 0;
            b.inbox[def.input] -= 1;
            if (active) active.done = (active.done ?? 0) + 1;

            b.dailyProduction = b.dailyProduction ?? {};
            b.dailyProduction[def.output] = (b.dailyProduction[def.output] ?? 0) + 1;

            b.wagePending = b.wagePending ?? {};
            b.wagePending[u.id] = b.wagePending[u.id] ?? {};
            b.wagePending[u.id][def.output] = (b.wagePending[u.id][def.output] ?? 0) + 1;

            b.inventory = b.inventory ?? {};
            b.inventory[def.output] = (b.inventory[def.output] ?? 0) + 1;
            if (b.isPublic) this.scene.economyManager.syncResources();
            this._gainSkillXp(u, def.skill);
            this.scene.uiManager.showFloatText(u.x, u.y - 14, `+1 ${def.output}`, '#ffe066');
        }
    },

    handleEatTask(u, dt) {
        // Eat from own carrying inventory first (no travel needed)
        if (_FOOD_PRIORITY.some(k => (u.carrying[k] ?? 0) > 0)) {
            if (!u.needs) u.needs = { food: 0, rest: 1, social: 0.8, joy: 0.8 };
            while ((u.needs.food ?? 0) < 0.95) {
                let found = false;
                for (const food of _FOOD_PRIORITY) {
                    if ((u.carrying[food] ?? 0) >= 1) {
                        u.carrying[food]--;
                        const nut = _NUTRITION_MAP[food] ?? 0.2;
                        u.needs.food = Math.min(1.0, (u.needs.food ?? 0) + nut);
                        u.dailyNutrition = Math.min(1.0, (u.dailyNutrition ?? 0) + nut);
                        found = true; break;
                    }
                }
                if (!found) break;
            }
            this.addThought(u, 'ate', 0.04, 'Ate a meal', 25000);
            this.scene.uiManager.showFloatText(u.x, u.y - 14, '🍱 full', '#ffee88');
            this.popTask(u);
            return;
        }

        // Eat from a loose food pile lying nearby (harvested food not yet hauled to storage). Nobody
        // should starve standing next to a pile of berries just outside the larder.
        const near = this._eatFromGroundPile(u, dt, 8 * TILE);
        if (near === 'moving') return;
        if (near === 'ate') { this.addThought(u, 'ate', 0.04, 'Ate a meal', 25000); this.scene.uiManager.showFloatText(u.x, u.y - 14, '🍱 full', '#ffee88'); this.popTask(u); return; }

        // Try to eat from the nearest food construct's inventory
        let foodConstruct = null, bd = Infinity;
        for (const b of this.scene.constructs) {
            if (!b.built || b.faction || !_FOOD_CONSTRUCT_TYPES.has(b.type)) continue;
            // Houses and camps: only eat from own home, or if the construct is public
            const isHome = b.id === u.homeConstructId;
            const inv = (CONSTRUCTS[b.type]?.isHomeType) && !isHome && !b.isPublic ? null : b.inventory;
            if (!inv || !_FOOD_PRIORITY.some(k => (inv[k] ?? 0) > 0)) continue;
            const bx = (b.tx + b.width / 2) * TILE, by = MAP_OY + (b.ty + b.height / 2) * TILE;
            const d = Phaser.Math.Distance.Between(u.x, u.y, bx, by);
            if (d < bd) { bd = d; foodConstruct = b; }
        }

        if (foodConstruct) {
            const door = this._constructDoor(foodConstruct);
            if (this.moveToward(u, door.x, door.y, 40, dt)) return;

            // Eat until full (or out of food)
            if (!u.needs) u.needs = { food: 0, rest: 1, social: 0.8, joy: 0.8 };
            let ate = false;
            while ((u.needs.food ?? 0) < 0.95) {
                let found = false;
                for (const food of _FOOD_PRIORITY) {
                    if ((foodConstruct.inventory?.[food] ?? 0) >= 1) {
                        foodConstruct.inventory[food]--;
                        if (foodConstruct.isPublic) {
                            this.scene.economyManager.syncResources();
                        }
                        const nut = _NUTRITION_MAP[food];
                        u.needs.food = Math.min(1.0, (u.needs.food ?? 0) + nut);
                        u.dailyNutrition = Math.min(1.0, (u.dailyNutrition ?? 0) + nut);
                        ate = true; found = true;
                        break;
                    }
                }
                if (!found) break;
            }
            if (ate) this.scene.uiManager.showFloatText(u.x, u.y - 14, '🍱 full', '#ffee88');
        } else {
            // No food construct — try commons directly
            if (!u.needs) u.needs = { food: 0, rest: 1, social: 0.8, joy: 0.8 };
            let ate = false;
            while ((u.needs.food ?? 0) < 0.95) {
                let found = false;
                for (const food of _FOOD_PRIORITY) {
                    if ((this.scene.resources[food] ?? 0) >= 1) {
                        this.scene.economyManager.takeFromCommons(food, 1);
                        const nut = _NUTRITION_MAP[food];
                        u.needs.food = Math.min(1.0, (u.needs.food ?? 0) + nut);
                        u.dailyNutrition = Math.min(1.0, (u.dailyNutrition ?? 0) + nut);
                        ate = true; found = true;
                        break;
                    }
                }
                if (!found) break;
            }
            if (ate) {
                this.scene.uiManager.showFloatText(u.x, u.y - 14, '🍱 full', '#ffee88');
            } else {
                // No stored food anywhere — eat the nearest harvested pile on the ground if one
                // exists (beats foraging from scratch), else go forage.
                const far = this._eatFromGroundPile(u, dt, 4000);
                if (far === 'moving') return;
                if (far === 'ate') {
                    this.scene.uiManager.showFloatText(u.x, u.y - 14, '🍱 full', '#ffee88');
                } else {
                    this.scene.uiManager.showFloatText(u.x, u.y - 14, 'hungry!', '#ff6644');
                    this.seekNodeTask(u, ['berry_bush', 'wild_garden', 'olive_grove', 'grape_vine', 'wild_wheat', 'fishing_spot'], false, 2000);
                }
            }
        }

        // Restore saved task
        this.popTask(u);
    },

    // Eat directly from a loose food pile on the ground within `maxDist`. Returns 'moving' (walking
    // to it — caller should return and resume next tick), 'ate' (consumed some), or 'none'. Eating
    // ignores haul reservations — hunger outranks stockpiling.
    _eatFromGroundPile(u, dt, maxDist) {
        let best = null, bd = Infinity;
        for (const it of this.scene.groundItems ?? []) {
            if ((it.qty ?? 0) <= 0) continue;
            if (!((_NUTRITION_MAP[it.resource] ?? 0) > 0)) continue;   // edible only
            const d = Phaser.Math.Distance.Between(u.x, u.y, it.x, it.y);
            if (d < maxDist && d < bd) { bd = d; best = it; }
        }
        if (!best) return 'none';
        if (this.moveToward(u, best.x, best.y, 20, dt)) return 'moving';

        if (!u.needs) u.needs = { food: 0, rest: 1, social: 0.8, joy: 0.8 };
        const nut = _NUTRITION_MAP[best.resource] ?? 0.2;
        let ate = false;
        while ((u.needs.food ?? 0) < 0.95 && best.qty > 0) {
            best.qty--;
            u.needs.food = Math.min(1.0, (u.needs.food ?? 0) + nut);
            u.dailyNutrition = Math.min(1.0, (u.dailyNutrition ?? 0) + nut);
            ate = true;
        }
        if (best.qty <= 0) this.scene.unitManager.removeGroundItem(best);
        else this.scene.unitManager.drawGroundItem(best);
        return ate ? 'ate' : 'none';
    },

    seekNodeTask(u, types, requireSlated = true, maxDist = 8000) {
        const near = this.findNearNode(u, maxDist, types, requireSlated);
        if (near) {
            u.targetNode = near; u.moveTo = null;
        }
    },

    findNearNode(u, maxDist, filterType, requireSlated = false) {
        // A colonist having a mental break ignores forbidding (they're acting out, not following
        // designations). Everyone else respects the forbidden flag.
        const ignoreForbid = u.taskType === 'mental_break';
        let best = null, bd = Infinity;
        for (const n of this.scene.resNodes) {
            if ((n.stock ?? 0) <= 0) continue;
            if (n.forbidden && !ignoreForbid) continue;
            if (filterType && !filterType.includes(n.type)) continue;
            if (requireSlated && !n.slated) continue;
            const d = Phaser.Math.Distance.Between(u.x, u.y, n.x, n.y);
            if (d < maxDist && d < bd) { bd = d; best = n; }
        }
        if (filterType && filterType.includes('mountain')) {
            // Cache nearest mountain per unit; refresh only when unit moves >2 tiles or cache expires (10s)
            const utx = Math.floor(u.x / 32), uty = Math.floor((u.y - 52) / 32);
            const cacheKey = `${utx},${uty}`;
            const now = this.scene.time.now;
            if (!u._mtCache || u._mtCacheKey !== cacheKey || now - u._mtCacheTime > 10000) {
                u._mtCacheKey = cacheKey;
                u._mtCacheTime = now;
                u._mtCache = null;
                let mbest = null, mbd = Infinity;
                for (let dy = -15; dy <= 15; dy++) {
                    for (let dx = -15; dx <= 15; dx++) {
                        const tx = utx + dx, ty = uty + dy;
                        if (this.scene.chunkManager?.getTile(tx, ty) === T_MOUNTAIN) {
                            const px = tx * 32 + 16, py = 52 + ty * 32 + 16;
                            const d = Phaser.Math.Distance.Between(u.x, u.y, px, py);
                            if (d < mbd) { mbd = d; mbest = { isTile: true, type: 'mountain', tx, ty, x: px, y: py, stock: 10 }; }
                        }
                    }
                }
                u._mtCache = mbest;
            }
            if (u._mtCache) {
                const d = Phaser.Math.Distance.Between(u.x, u.y, u._mtCache.x, u._mtCache.y);
                if (d < maxDist && d < bd) { bd = d; best = u._mtCache; }
            }
        }
        return best;
    },

    runCityPlannerAI(u) {
        const needs = [
            { type: 'camp', urgency: (this.scene.units.length / (this.scene.storageMax.pop || 10)) > 0.8 ? 8 : 0 }
        ];
        needs.sort((a,b) => b.urgency - a.urgency);
        const target = needs.find(n => n.urgency > 0 && !this.scene.constructs.some(b => b.type === n.type && !b.built));
        if (target && this.scene.economyManager.afford(CONSTRUCTS[target.type].cost)) {
            // Logic to find site and place...
        }
    },

    // Needs-driven settlement planner: build the top unmet infrastructure need, one at a
    // time. Housing (emergent bedrooms) and food/workshop rooms come first, then the fixed
    // storage/processing order. Rate-limited; waits while anything is still under construction.
    // May the archon AI *initiate* a new (locked) build type? Always for survival essentials and
    // already-unlocked types; for anything else only when the auto-pioneer setting is on (off →
    // the player drives new production). Also respects the input-supply check (B2).
    _archonMayInitiate(type) {
        const cm = this.scene.constructManager;
        if (!cm.isConstructResearched(type)) return false;   // tech gate (player + AI)
        if (cm.isConstructUnlocked(type) || _SURVIVAL_BUILDS.has(type)) return true;
        return this.scene.archonPioneers !== false;
    },

    _runArchonAI(u, dt) {
        u._archonAiTimer = (u._archonAiTimer ?? 0) + dt;
        if (u._archonAiTimer < 5.0) return;
        u._archonAiTimer = 0;

        const fm = this.scene.constructManager;
        const econ = this.scene.economyManager;
        const workers = this.scene.units.filter(w => w.type === 'worker' && !w.isEnemy && w.hp > 0);
        const pop = workers.length;

        // ── FOOD FIRST (survival) ─────────────────────────────────────────────
        // Securing a grow zone costs no materials and no builder labour, so it must run BEFORE the
        // "finish the current build first" guard below. Otherwise a single stuck/unaffordable
        // blueprint freezes the archon forever and the colony never plants food → mass starvation.
        const GROW_CROPS = [
            { res: 'Food.Grain.Wheat',   crop: 'wheat'   },
            { res: 'Food.Produce.Berry', crop: 'berries' },
        ];
        for (const gc of GROW_CROPS) {
            if (econ.provisioningPressure(gc.res, pop) < 0.5) continue;
            // Gated: only cultivate crops whose wild form the colony has discovered. (#22)
            const cdef = CROPS[gc.crop];
            if ((cdef?.wild?.length ?? 0) > 0 && !this.scene.discoveredCrops?.has(gc.crop)) continue;
            const haveZone = [...(this.scene.zoneManager?.growTiles?.values() ?? [])]
                .some(st => st.crop && CROPS[st.crop]?.output === gc.res);
            if (haveZone) continue;
            if (this._archonPaintGrowZone(u, gc.crop)) return;
        }

        // ── STORAGE (survival) ────────────────────────────────────────────────
        // The colony must always have somewhere to stockpile what it harvests, or gathered goods
        // rot on the ground. A storage zone is free (no materials, no builder labour), so — like a
        // grow zone — it runs above the build-freeze guard. A proper granary/woodshed/stonepile is
        // still raised later via ARCHON_BUILD_ORDER once materials allow; this just guarantees a
        // deposit destination exists from day one.
        const hasStorageConstruct = this.scene.constructs.some(b =>
            b.built && !b.faction && _STORAGE_TYPES.has(b.type));
        const hasStorageZone = (this.scene.zoneManager?.storageTiles?.size ?? 0) > 0;
        if (!hasStorageConstruct && !hasStorageZone && this._archonPaintStorageZone(u)) return;

        // ── Heavier building waits for the current project to finish (keeps the archon from
        //    carpeting the map / over-committing labour). A blueprint that can never be supplied is
        //    auto-cancelled by ConstructManager.tickBlueprintGC, so this guard can't freeze forever.
        if (this.scene.constructs.some(b => !b.built && !b.faction)) return;

        // Room budget (proxy: 1 door = 1 room) keeps the archon from carpeting the map.
        const roomCount  = this.scene.constructs.filter(b => b.type === 'door' && !b.faction).length;
        const roomBudget = Math.ceil(pop / 3);

        // 1) Family housing: build a family bedroom on an under-housed estate (familySize at or
        //    above its bed capacity), or a freshly-founded estate with no beds yet.
        for (const e of this.scene.estateBounds) {
            const familySize = workers.filter(w => w.estateId === e.id).length;
            if (familySize === 0) continue;
            if (familySize > fm.estateBedCapacity(e) - 1 && roomCount < roomBudget
                && this._archonBuildRoom(u, 'bedroom', e)) return;
        }
        // 1b) Pre-civic / estate-less units rely on the starting camp; build a generic bedroom
        //     only if more such units exist than the camp/house (non-estate) capacity.
        const estateless = workers.filter(w => !w.estateId).length;
        let openCap = 0;
        for (const b of fm.constructs) {
            if (b.built && !b.faction && CONSTRUCTS[b.type]?.isHomeType) openCap += fm.getHouseCapacity(b);
        }
        if (estateless > openCap && roomCount < roomBudget && this._archonBuildRoom(u, 'bedroom')) return;

        // 2) Bread needs a kitchen — an oven in an enclosed room. Only once flour can be supplied
        // (a mill exists) and the pioneer toggle allows it. (B2: no oven before the mill)
        if (econ.provisioningPressure('Food.Grain.Wheat.Bread', pop) >= 0.5
            && this._archonMayInitiate('oven') && fm.inputAvailable('Food.Grain.Wheat.Flour')
            && !this.scene.constructs.some(b => b.type === 'oven' && !b.faction)
            && roomCount < roomBudget && this._archonBuildRoom(u, 'workshop', null, 'oven')) return;

        // 3) A vocation wants an indoor workshop but none exists → build a PURPOSE-FURNISHED
        //    room: walls + the job's appliance (+ a chest as a prep/work surface) so it reads as a
        //    proper kitchen/workshop (classifyRoom types it by the appliance's zoneType). #4
        let wantType = null;
        for (const w of workers) {
            const job = w.vocation && JOBS[w.vocation];
            const ct = job?.construct;
            if (ct && CONSTRUCTS[ct] && CONSTRUCTS[ct].placement !== 'edge' && !CONSTRUCTS[ct].outdoor
                && !this.scene.constructs.some(b => b.type === ct && !b.faction)
                && this._archonMayInitiate(ct)                         // pioneer toggle / unlocked
                && (!job.input || (job.inputs ?? [job.input]).some(k => fm.inputAvailable(k)))) {     // supplier exists (B2)
                wantType = ct; break;
            }
        }
        if (wantType && roomCount < roomBudget && this._archonBuildRoom(u, 'workshop', null, wantType)) return;

        // 4) Fallback: the fixed storage/processing build order.
        for (const type of ARCHON_BUILD_ORDER) {
            if (this.scene.constructs.some(b => b.type === type && !b.faction)) continue;
            if (!CONSTRUCTS[type]) continue;
            if (!this._archonMayInitiate(type)) continue;             // pioneer toggle / unlocked
            if (!econ.afford(CONSTRUCTS[type].cost || {})) continue;
            if (this._archonPlace(u, type)) return;
        }
    },

    // Lay out a size×size grow-zone field on clear public grassland near the colony and assign
    // it a crop — the archon's way of farming without fixed farm buildings (see #6).
    _archonPaintGrowZone(u, cropKey, size = 3) {
        const zm = this.scene.zoneManager, fm = this.scene.constructManager, cm = this.scene.chunkManager;
        if (!zm || !fm) return false;
        const th = this.scene.constructs.find(b => b.type === 'townhall' && !b.faction);
        const center = th ? { tx: th.tx, ty: th.ty }
                          : { tx: this.scene.spawnTx ?? 0, ty: this.scene.spawnTy ?? 0 };
        const fits = (ox, oy) => {
            for (let dy = 0; dy < size; dy++) for (let dx = 0; dx < size; dx++) {
                const tx = ox + dx, ty = oy + dy;
                if (cm && cm.getTile(tx, ty) !== T_GRASS) return false;
                if (!fm.isFree(tx, ty, 1, 1)) return false;
                if (zm._claimed?.(zm.tileKey(tx, ty))) return false;
            }
            return true;
        };
        for (let r = 2; r < 22; r++) {
            for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
                if (Math.abs(dx) < r && Math.abs(dy) < r) continue;
                const ox = center.tx + dx, oy = center.ty + dy;
                if (!fits(ox, oy)) continue;
                for (let yy = 0; yy < size; yy++) for (let xx = 0; xx < size; xx++)
                    zm.paintGrow(ox + xx, oy + yy, cropKey);
                this.scene.uiManager?.showFloatText?.((ox + 1) * TILE, MAP_OY + oy * TILE - 8,
                    `⚜ ${cropKey} field`, '#aadd66');
                GameLogger.log('archon_grow', { u: u.name, crop: cropKey, tx: ox, ty: oy, size });
                return true;
            }
        }
        return false;
    },

    // Designate a free storage zone on clear ground near the settlement core so harvested goods
    // have a stockpile destination (counts toward commons via syncResources). Mirrors the grow-zone
    // siting; works pre-civic by centring on the camp when there's no townhall yet.
    _archonPaintStorageZone(u, size = 2) {
        const zm = this.scene.zoneManager, fm = this.scene.constructManager, cm = this.scene.chunkManager;
        if (!zm || !fm) return false;
        const core = this.scene.constructs.find(b => (b.type === 'townhall' || b.type === 'camp') && !b.faction);
        const center = core ? { tx: core.tx, ty: core.ty }
                            : { tx: this.scene.spawnTx ?? 0, ty: this.scene.spawnTy ?? 0 };
        const fits = (ox, oy) => {
            for (let dy = 0; dy < size; dy++) for (let dx = 0; dx < size; dx++) {
                const tx = ox + dx, ty = oy + dy;
                if (cm && cm.getTile(tx, ty) !== T_GRASS) return false;
                if (!fm.isFree(tx, ty, 1, 1)) return false;
                if (zm._claimed?.(zm.tileKey(tx, ty))) return false;
            }
            return true;
        };
        for (let r = 2; r < 22; r++) {
            for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
                if (Math.abs(dx) < r && Math.abs(dy) < r) continue;
                const ox = center.tx + dx, oy = center.ty + dy;
                if (!fits(ox, oy)) continue;
                for (let yy = 0; yy < size; yy++) for (let xx = 0; xx < size; xx++)
                    zm.paintStorage(ox + xx, oy + yy);
                this.scene.uiManager?.showFloatText?.((ox + 1) * TILE, MAP_OY + oy * TILE - 8,
                    '⚜ stockpile', '#cdd6e0');
                GameLogger.log('archon_storage', { u: u.name, tx: ox, ty: oy, size });
                return true;
            }
        }
        return false;
    },

    _archonPlace(u, type) {
        const fm = this.scene.constructManager;
        const site = fm.findPublicBuildSite(type);
        if (!site) return false;
        const c = fm.placeConstruct(type, site.tx, site.ty);
        if (!c) return false;
        c.isPublic = true;
        this.scene.uiManager?.showFloatText?.(u.x, u.y - 25, `⚜ Archon: build ${type}`, '#ffdd44');
        GameLogger.log('archon', { u: u.name, build: type });
        return true;
    },

    // Plan a walled room as ghosts. 'bedroom' = 3×3 interior with 4 beds (all reachable from
    // floor: back row of 3 + a front-corner bed; middle row + entry stay walkable); 'shell' =
    // empty 2×2 for a unit to furnish. When `estate` is given, the room is sited inside its
    // bounds so the beds inherit the estate's domainId (family ownership).
    _archonBuildRoom(u, kind, estate = null, applianceType = null) {
        const fm = this.scene.constructManager;
        const iw = kind === 'bedroom' ? 3 : 2;
        const ih = kind === 'bedroom' ? 3 : 2;
        const site = this._findRoomSite(iw, ih, estate);
        if (!site) return false;

        // Pick a wall material the colony can actually supply, by purpose: houses/workshops go up in
        // cheap wood first (so a room can be raised from the camp's starting sticks/logs), reserving
        // dressed stone for defensive walls. The colony doesn't gather build materials on demand, so
        // committing a room it can't supply just leaves a permanently-stuck ghost — bail if nothing
        // is affordable for the whole perimeter.
        const wallCount = 2 * iw + 2 * ih - 1;     // perimeter edges minus the south door
        const wallMat = this._chooseWallMaterial(wallCount, 'room');
        if (!wallMat) return false;

        const interior = this._planRoom(site.tx, site.ty, iw, ih, wallMat);
        if (!interior) return false;
        const { tx, ty } = site;
        let label = '⚜ workshop room planned';
        if (kind === 'bedroom') {
            fm.placeConstruct('bed', tx,     ty);       // back row
            fm.placeConstruct('bed', tx + 1, ty);
            fm.placeConstruct('bed', tx + 2, ty);
            fm.placeConstruct('bed', tx,     ty + 2);   // front-left corner
            label = '⚜ bedroom planned';
        } else if (kind === 'workshop' && applianceType && CONSTRUCTS[applianceType]) {
            // Furnish the room for its job: the appliance in the back-left, a chest (prep/work
            // surface & local storage) in the back-right. Front row stays walkable to the door.
            fm.placeConstruct(applianceType, tx, ty);
            if (CONSTRUCTS.chest && fm.isFree(tx + 1, ty, 1, 1)) fm.placeConstruct('chest', tx + 1, ty);
            label = `⚜ ${(CONSTRUCTS[applianceType].label ?? applianceType)} workshop planned`;
        }
        this.scene.uiManager?.showFloatText?.((site.tx + 1) * TILE, MAP_OY + site.ty * TILE - 10,
            label, '#ffdd44');
        GameLogger.log('archon_room', { u: u.name, kind, appliance: applianceType ?? null, estate: estate?.id ?? null, tx: site.tx, ty: site.ty });
        return true;
    },

    // Lay wall_edge ghosts around an iw×ih interior with a door on the south wall middle, built
    // from `wallMat` (null = wall_edge's default material). Returns interior tiles, or null if the
    // footprint/edges aren't clear.
    _planRoom(tx, ty, iw, ih, wallMat = null) {
        const fm = this.scene.constructManager;
        for (let r = ty; r < ty + ih; r++)
            for (let c = tx; c < tx + iw; c++)
                if (!fm.isFree(c, r, 1, 1)) return null;
        const edges = [];
        for (let c = tx; c < tx + iw; c++) { edges.push([true, ty, c]); edges.push([true, ty + ih, c]); }
        for (let r = ty; r < ty + ih; r++) { edges.push([false, r, tx]); edges.push([false, r, tx + iw]); }
        for (const [isH, row, col] of edges) if (fm.getEdge(isH, row, col)) return null;
        const doorCol = tx + Math.floor(iw / 2);   // south wall, middle segment
        for (const [isH, row, col] of edges) {
            if (isH && row === ty + ih && col === doorCol) fm.placeEdge('door', true, row, col, null);
            else fm.placeEdge('wall_edge', isH, row, col, wallMat);
        }
        const interior = [];
        for (let r = ty; r < ty + ih; r++) for (let c = tx; c < tx + iw; c++) interior.push({ tx: c, ty: r });
        return interior;
    },

    // Choose a wall material the colony can supply for `wallCount` segments, by purpose. Houses go
    // up cheap (wood first); defensive walls prefer the sturdiest available (block → brick later).
    // Returns the material key, or null if nothing on hand covers the whole run.
    _chooseWallMaterial(wallCount, purpose = 'room') {
        const fm = this.scene.constructManager;
        const def = CONSTRUCTS.wall_edge;
        // Preference order per purpose (clay brick slots into the sturdy end once #28 lands).
        const order = purpose === 'defense'
            ? ['Materials.Stone.Limestone', 'Materials.Stone.Limestone.Stones',
               'Materials.Wood.Pine', 'Materials.Wood.Pine.Sticks']
            : ['Materials.Wood.Pine', 'Materials.Wood.Pine.Sticks',
               'Materials.Stone.Limestone.Stones', 'Materials.Stone.Limestone'];
        let gatherable = null;
        for (const mat of order) {
            const per = def.costs?.[mat]?.[mat];
            if (per == null) continue;                                   // not a valid wall material
            if (fm.availableQty(mat) >= per * wallCount) return mat;      // in stock → raise it now
            if (!gatherable && this._materialGatherable(mat)) gatherable = mat;
        }
        // Nothing fully in stock, but a source exists for `gatherable` → commit anyway; on-demand
        // gathering (the build-pull in pickRole) will supply it, and the blueprint GC cancels it only
        // if the material truly never materialises. Returns null only when it's both unstocked AND
        // ungatherable, so the archon never plans a genuinely impossible room.
        return gatherable;
    },

    // Is `res` obtainable by gathering — i.e., does a live resource node produce its material family?
    _materialGatherable(res) {
        const fam = res.includes('Wood') ? 'Wood'
                  : res.includes('Metal') ? 'Metal'
                  : res.includes('Stone') ? 'Stone' : null;
        if (!fam) return false;
        for (const n of this.scene.resNodes ?? []) {
            if ((n.stock ?? 0) <= 0 || n.forbidden) continue;
            if ((NODES[n.type]?.resource ?? '').includes(fam)) return true;
        }
        return false;
    },

    // Find a clear site for a room: interior free, bounding edges empty, south-door exterior
    // walkable. With `estate`, scan inside the estate's bounds; otherwise ring-scan near the
    // townhall/camp.
    _findRoomSite(iw, ih, estate = null) {
        const fm = this.scene.constructManager;
        const zm = this.scene.zoneManager;
        const claimed = (xx, yy) => zm?._claimed?.(zm.tileKey(xx, yy));
        const fits = (tx, ty) => {
            for (let yy = ty; yy < ty + ih; yy++)
                for (let xx = tx; xx < tx + iw; xx++)
                    if (!fm.isFree(xx, yy, 1, 1) || claimed(xx, yy)) return false;   // don't build over grow/storage zones
            const doorCol = tx + Math.floor(iw / 2);
            if (!fm.isFree(doorCol, ty + ih, 1, 1) || claimed(doorCol, ty + ih)) return false;   // door exterior
            for (let cc = tx; cc < tx + iw; cc++) { if (fm.getEdge(true, ty, cc) || fm.getEdge(true, ty + ih, cc)) return false; }
            for (let rr = ty; rr < ty + ih; rr++) { if (fm.getEdge(false, rr, tx) || fm.getEdge(false, rr, tx + iw)) return false; }
            return true;
        };
        if (estate) {
            // Best-scoring fit within the estate (rooms line up along paths / against each other).
            const eAnchor = { tx: estate.cx ?? estate.x1, ty: estate.cy ?? estate.y1 };
            let best = null, bestScore = -Infinity;
            for (let ty = estate.y1; ty <= estate.y2 - ih + 1; ty++)
                for (let tx = estate.x1; tx <= estate.x2 - iw + 1; tx++) {
                    if (tx < 2 || ty < 2 || !fits(tx, ty)) continue;
                    // room must sit inside the circular estate (test its centre)
                    if (!fm.estateContains(estate, tx + (iw - 1) / 2, ty + (ih - 1) / 2)) continue;
                    const s = fm.siteScore(tx, ty, iw, ih, eAnchor);
                    if (s > bestScore) { bestScore = s; best = { tx, ty }; }
                }
            return best;
        }
        const anchor = fm.constructs.find(b => (b.type === 'townhall' || b.type === 'camp') && !b.faction);
        const c = anchor ? { tx: anchor.tx, ty: anchor.ty }
                         : { tx: this.scene.spawnTx ?? 20, ty: this.scene.spawnTy ?? 20 };
        return fm.findScoredSite(c, iw, ih, 22, fits);
    },

    // Internal helpers used by pickRole/assignVocation (defined in UnitNeeds but need JOB_AFFINITIES
    // and VOCATION_FALLBACKS which live as module-scope constants in UnitManager.js).
    // These are thin wrappers that delegate back to the class-level statics.
    _attrBonus(u, jobId) {
        // Replicated here so UnitNeeds sub-module can call it via this._attrBonus
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
        const affs  = JOB_AFFINITIES[jobId] ?? {};
        const attrs = u.attributes ?? {};
        let total = 0;
        for (const [attr, w] of Object.entries(affs)) total += (attrs[attr] ?? 5) * w * 2;
        return total;
    },

    _passionBonus(u, skill) {
        if (!skill || !u.passions) return 0;
        const lv = u.passions[skill];
        return lv === 'burning' ? 60 : lv === 'interested' ? 25 : 0;
    },

    _vocationFallbacks(vocation) {
        const VOCATION_FALLBACKS = {
            smith:     ['smelter', 'miner', 'woodcutter'],
            baker:     ['miller', 'farmer'],
            butcher:   ['hunter', 'shepherd'],
            tanner:    ['hunter', 'shepherd'],
            mason:     ['miner', 'builder'],
            carpenter: ['woodcutter', 'builder'],
            smelter:   ['miner'],
            miller:    ['farmer'],
            presser:   ['farmer'],
            weaver:    ['shepherd'],
            brewer:    ['farmer'],
            merchant:  ['forager', 'farmer'],
            farmer:    ['forager'],
            hunter:    ['forager'],
            woodcutter:['forager'],
            miner:     ['builder'],
            shepherd:  ['farmer'],
            builder:   [],
            forager:   [],
        };
        return VOCATION_FALLBACKS[vocation] ?? [];
    },

    _dequeueTask(u) {
        const task = u.taskStack?.shift();
        if (!task) return;
        if (task.type === 'zone_workshop') {
            u.taskType      = 'zone_workshop';
            u.taskZoneKey   = task.zoneKey;
            u.workshopPhase = 'procure';
            u.workProgress  = 0;
            if (task.role) u.role = task.role;
        } else if (task.type === 'deposit') {
            this.seekDeposit(u);
        } else if (task.type === 'move') {
            u.moveTo = { x: task.x, y: task.y };
        }
    },

    _fetchSources() { return _FETCH_SOURCES; },
    _selfSupply()   { return _SELF_SUPPLY; },
};
