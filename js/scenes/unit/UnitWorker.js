import {
    TILE, MAP_W, MAP_OY,
    ARCHON_BUILD_ORDER, T_MOUNTAIN,
} from '../../config/gameConstants.js';
import { CONSTRUCTS } from '../../content/constructs/index.js';
import { NODES } from '../../content/nodes/index.js';
import { ANIMALS } from '../../content/animals/index.js';
import { ITEMS } from '../../content/items/index.js';
import { JOBS, WORKSHOP_JOBS } from '../../content/jobs/index.js';
import { CROPS } from '../../content/crops/index.js';

export default {
    tickWorker(u, time, dt) {
        if (u.age < 2) { this.tickChild(u, dt); return; }

        this._tickNeeds(u, dt);

        // Wage collection: once per night phase (economic mechanic, keep phase-gated)
        if (this.scene.phase === 'NIGHT' && !u._wageCollected && u.taskType !== 'garrison') {
            this._collectWage(u);
            u._wageCollected = true;
        }
        if (this.scene.phase === 'DAY') u._wageCollected = false;

        // Rest need: tired villagers go home to sleep
        const needsRest = (u.needs?.rest ?? 1.0) < 0.25 && !u.isSleeping;
        if (needsRest && u.taskType !== 'garrison' && !u.isRouting) {
            // Auto-assign to nearest camp appliance if homeless
            if (!u.homeConstructId && !u.homeConstructId) this._seekCampHome(u);

            const fm = this.scene.constructManager;
            if (u.homeConstructId != null) {
                const campItem = fm?.getById(u.homeConstructId);
                if (!campItem?.built) {
                    u.homeConstructId = null;
                } else {
                    const htx = campItem.tx, hty = campItem.ty;
                    const hcx = htx * TILE + TILE / 2, hcy = MAP_OY + hty * TILE + TILE / 2;
                    if (Phaser.Math.Distance.Between(u.x, u.y, hcx, hcy) > 10) {
                        if (this.totalCarrying(u) > 0 && u.taskType !== 'deposit' && u.taskType !== 'deposit_zone')
                            this.seekDeposit(u);
                        if (u.taskType === 'deposit')      { this.handleDepositTask(u, dt);     return; }
                        if (u.taskType === 'deposit_zone') { this.handleDepositZoneTask(u, dt); return; }
                        u.targetNode = null; u.moveTo = null;
                        this.moveToward(u, hcx, hcy, u.speed, dt);
                        u.isInside = false;
                        return;
                    } else {
                        u.isInside = false; // camps are outdoors
                        u.isSleeping = true;
                        if (u.taskType && u.taskType !== 'garrison') {
                            u.taskType = null; u.targetNode = null; u.workProgress = 0;
                            u.workshopPhase = null; u.fetchConstructId = null;
                        }
                    }
                }
            } else if (u.homeConstructId) {
                const home = this.scene.constructs.find(b => b.id === u.homeConstructId && b.built);
                if (home) {
                    const hcx = (home.tx + home.width / 2) * TILE;
                    const hcy = MAP_OY + (home.ty + home.height / 2) * TILE;
                    if (Phaser.Math.Distance.Between(u.x, u.y, hcx, hcy) > 10) {
                        if (this.totalCarrying(u) > 0 && u.taskType !== 'deposit') {
                            u.taskType = 'deposit'; u.taskConstructId = home.id; u._depositPrivate = !home.isPublic;
                        }
                        if (u.taskType === 'deposit') { this.handleDepositTask(u, dt); return; }
                        u.targetNode = null; u.moveTo = null;
                        this.moveToward(u, hcx, hcy, u.speed, dt);
                        u.isInside = false;
                        return;
                    } else {
                        u.isInside = true;
                        u.isSleeping = true;
                        if (u.taskType && u.taskType !== 'garrison') {
                            u.taskType = null; u.targetNode = null; u.workProgress = 0;
                            u.workshopPhase = null; u.fetchConstructId = null;
                        }
                    }
                }
            }
            if (u.isSleeping) return;
        }

        // Wake up when rested
        if (u.isSleeping && (u.needs?.rest ?? 0) >= 0.95) {
            u.isSleeping = false;
            u.isInside = false;
        }
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
            const d = Phaser.Math.Distance.Between(u.x, u.y, u.moveTo.x, u.moveTo.y);
            if (d > 3) {
                const a = Phaser.Math.Angle.Between(u.x, u.y, u.moveTo.x, u.moveTo.y);
                u.x += Math.cos(a) * u.speed * dt;
                u.y += Math.sin(a) * u.speed * dt;
                return;
            }
            u.moveTo = null;
        }

        // Collect tithes when idle
        if (!u.taskType && !u.targetNode &&
            this.scene.constructs.some(b => b.built && Object.values(b.tithePending ?? {}).some(v => v > 0))) {
            u.taskType = 'collect_tithe';
        }

        // Deposit takes priority
        const _noDeposit = new Set(['build', 'zone_workshop', 'workshop', 'eat', 'collect_tithe', 'leisure', 'merchant']);
        if (this.totalCarrying(u) > 0 && !u.targetNode && !_noDeposit.has(u.taskType)) {
            if (u.taskType !== 'deposit' && u.taskType !== 'deposit_zone') this.seekDeposit(u);
            if (u.taskType === 'deposit')      { this.handleDepositTask(u, dt);     return; }
            if (u.taskType === 'deposit_zone') { this.handleDepositZoneTask(u, dt); return; }
        }

        // Rebuild day plan every 3s or when empty
        if (!u.dayPlan || time - (u._planTime ?? 0) > 3000) {
            this._rebuildDayPlan(u);
            u._planTime = time;
        }

        // Execute head intent when idle
        if (!u.taskType && !u.targetNode && time - u.lastSeek > 1500) {
            u.lastSeek = time;
            const intent = u.dayPlan?.[0]?.intent ?? 'work';
            u.currentIntent = intent;

            if (intent === 'eat') {
                this.pushTask(u, 'eat');
            } else if (intent === 'sleep') {
                // Proactive sleep: head home before the emergency threshold (< 0.25)
                if (u.homeConstructId != null) {
                    const fm = this.scene.constructManager;
                    const campItem = fm?.getById(u.homeConstructId);
                    if (campItem?.built) {
                        const htx = campItem.tx, hty = campItem.ty;
                        const dist = Phaser.Math.Distance.Between(u.x, u.y, htx * TILE + TILE / 2, MAP_OY + hty * TILE + TILE / 2);
                        u.moveTo = { x: htx * TILE + TILE / 2, y: MAP_OY + hty * TILE + TILE / 2 };
                    }
                } else if (u.homeConstructId) {
                    const home = this.scene.constructs.find(b => b.id === u.homeConstructId && b.built);
                    if (home) {
                        u.moveTo = { x: (home.tx + home.width / 2) * TILE, y: MAP_OY + (home.ty + home.height / 2) * TILE };
                    }
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
                    this.pickRole(u, time);
                    if (u.role && !u.taskType) {
                        if (u.role === 'farmer') this.seekFarmerTask(u);
                        else if (u.role === 'builder') this.seekBuilderTask(u);
                        else if (u.role in WORKSHOP_JOBS) this.seekWorkshopTask(u);
                        else if (JOBS[u.role]?.nodeTypes) this.seekNodeTask(u, JOBS[u.role].nodeTypes);
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
                        // Absolute last resort: gather any nearby resource node
                        if (!u.taskType && !u.targetNode) {
                            this.seekNodeTask(u, ['berry_bush', 'wild_garden', 'olive_grove', 'small_tree', 'large_tree', 'small_boulder', 'large_boulder']);
                        }
                    }
                }
            }
        }

        // Design fix: if unit has a role but no task/node for 12s, re-evaluate
        // Prevents permanent lock when e.g. all farms are fallow and no nodes in range
        const stickyRoles = new Set(['hunter', 'shepherd']); // player-directed, don't auto-reassign
        if (u._prevRole) stickyRoles.add(u.role); // self-supplying — keep temporary role until deposit done
        if (!stickyRoles.has(u.role) && !u.taskType && !u.targetNode) {
            u._roleIdleTimer = (u._roleIdleTimer ?? 0) + dt;
            if (u._roleIdleTimer > 15) { u._roleIdleTimer = 0; u.role = null; }
        } else {
            u._roleIdleTimer = 0;
        }

        if (u.role === 'builder') {
            if (time - u.lastSeek > 1500) { u.lastSeek = time; this.seekBuilderTask(u); }
        } else if (u.role === 'farmer') {
            if (time - u.lastSeek > 1500) { u.lastSeek = time; this.seekFarmerTask(u); }
        } else if (u.role in WORKSHOP_JOBS) {
            if (!u.taskType && time - u.lastSeek > 2000) { u.lastSeek = time; this.seekWorkshopTask(u); }
        } else if (u.role === 'merchant') {
            if (!u.taskType && time - u.lastSeek > 3000) { u.lastSeek = time; this.seekMerchantTask(u); }
        }

        if (u.taskType === 'eat') this.handleEatTask(u, dt);
        else if (u.taskType === 'leisure') this.handleLeisureTask(u, dt);
        else if (u.taskType === 'chat') this.handleChatTask(u, dt);
        else if (u.taskType === 'rest_break') this.handleRestBreakTask(u, dt);
        else if (u.taskType === 'stroll') this.handleStrollTask(u, dt);
        else if (u.taskType === 'build') this.handleBuildTask(u, dt);
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
            let meatPick = 0;
            while (meatPick < deer.meatLeft && this.canUnitCarryMore(u, 'Food.Meat.Venison', meatPick + 1)) {
                meatPick++;
            }
            let hidePick = 0;
            while (hidePick < deer.hideLeft && this.canUnitCarryMore(u, 'Textile.Hide.Deer', hidePick + 1, meatPick)) {
                // The 4th param 'meatPick' would need to be handled by canUnitCarryMore or manual weight calc
                // Let's just do manual check here for simplicity since it's mixed harvest
                const curW = this.getUnitCarryWeight(u) + meatPick * ITEMS['Food.Meat.Venison'].weight;
                const curV = this.getUnitCarryVolume(u) + meatPick * ITEMS['Food.Meat.Venison'].volume;
                const nextW = curW + (hidePick + 1) * ITEMS['Textile.Hide.Deer'].weight;
                const nextV = curV + (hidePick + 1) * ITEMS['Textile.Hide.Deer'].volume;
                if (nextW <= this.getUnitMaxWeight(u) && nextV <= this.getUnitMaxVolume(u)) hidePick++;
                else break;
            }

            if (meatPick > 0 || hidePick > 0) {
                deer.meatLeft -= meatPick;
                deer.hideLeft -= hidePick;
                u.carrying['Food.Meat.Venison'] = (u.carrying['Food.Meat.Venison'] ?? 0) + meatPick;
                u.carrying['Textile.Hide.Deer'] = (u.carrying['Textile.Hide.Deer'] ?? 0) + hidePick;

                // Track production
                this.scene.natureManager.redrawDeer(deer);
            }
            if (deer.meatLeft <= 0 && deer.hideLeft <= 0) u.targetDeer = null;
            if (meatPick === 0 && hidePick === 0) u.role = null; // full
            return;
        }

        // Chase and attack live deer
        const dist = Phaser.Math.Distance.Between(u.x, u.y, deer.x, deer.y);
        if (dist <= ANIMALS.deer.atkRange) {
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
        const b = this.scene.constructs.find(b => b.id === u.taskConstructId && b.built);
        if (!b) { u.taskType = null; return; }
        // Walk into the tower and stay
        const cx = (b.tx + 0.5) * TILE, cy = MAP_OY + (b.ty + 0.5) * TILE;
        this.moveToward(u, cx, cy, 6, dt);
    },

    handleRepairTask(u, dt) {
        const b = this.scene.constructs.find(b => b.id === u.taskConstructId && b.built);
        if (!b || b.hp >= b.maxHp) { u.taskType = null; return; }
        const cx = (b.tx + b.width / 2) * TILE, cy = MAP_OY + (b.ty + b.width / 2) * TILE;
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
        const b = this.scene.constructs.find(b => b.id === u.taskConstructId);
        if (!b || b.built) { u.taskType = null; return; }

        // Ensure resources are gathered for construction
        const cost = this.scene.constructManager.getRemainingCost(b);
        const res = Object.keys(cost).find(r => cost[r] > 0);
        if (res) {
            if ((u.carrying[res] ?? 0) === 0) {
                // Not carrying needed resource — attempt to take from commons
                if ((this.scene.resources[res] ?? 0) > 0) {
                    this.scene.economyManager.takeFromCommons(res, 1);
                    u.carrying[res] = (u.carrying[res] ?? 0) + 1;
                } else {
                    // Wait up to 10s for resources before releasing the site
                    u._buildWaitTimer = (u._buildWaitTimer ?? 0) + dt;
                    if (u._buildWaitTimer > 10.0) { u._buildWaitTimer = 0; u.taskType = null; }
                    return;
                }
            }
        }

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
        if (u.workProgress >= 25.0) {
            u.workProgress = 0;
            // Consume the resource if present
            if (res && (u.carrying[res] ?? 0) > 0) {
                u.carrying[res]--;
                if (b.resNeeded && b.resNeeded[res] > 0) {
                    b.resNeeded[res]--;
                }
            }
            b.buildWork -= 5;
            this._gainSkillXp(u, 'masonry');
            if (b.buildWork <= 0) { this.scene.constructManager.completeConstructConstruction(b); u.taskType = null; }
        }
    },
    handleZoneWorkshopTask(u, dt) {
        const fm = this.scene.constructManager;
        const item = fm?.getById(u.taskConstructId);
        if (!item?.built) { u.taskType = null; u.workshopPhase = null; return; }

        const def = WORKSHOP_JOBS[u.role];
        if (!def) { u.taskType = null; return; }

        const queue = item.productionQueue; // null=auto, []=queue-idle, [...]= has orders
        const isQueueMode = Array.isArray(queue);

        // Queue mode: if nothing to do, idle
        if (isQueueMode) {
            if (queue.length === 0) { u.workshopPhase = 'idle'; return; }
            // Advance to next order if front is done
            while (queue.length > 0 && queue[0].done >= queue[0].qty) {
                queue.shift();
                this.scene.uiManager.showFloatText(
                    (u.taskZoneKey % MAP_W) * TILE + TILE / 2,
                    MAP_OY + Math.floor(u.taskZoneKey / MAP_W) * TILE - 14,
                    'Order done!', '#88ffaa');
            }
            if (queue.length === 0) { u.workshopPhase = 'idle'; return; }
        }

        const tx = u.taskZoneKey % MAP_W, ty = Math.floor(u.taskZoneKey / MAP_W);
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
            if (isQueueMode && queue.length > 0) queue[0].done++;
            if ((u.carrying[def.input] ?? 0) <= 0) u.workshopPhase = 'procure';
        }
    },

    handleDeconstructTask(u, dt) {
        const b = this.scene.constructs.find(b => b.id === u.taskConstructId && b.built && b.deconstructing);
        if (!b) { u.taskType = null; return; }

        const cx = (b.tx + b.width / 2) * TILE, cy = MAP_OY + (b.ty + b.width / 2) * TILE;
        if (this.moveToward(u, cx, cy, 28, dt)) return;
        u.isInside = false;

        const attrMult = this.getAttrMult(u, ['str']);
        const workSpeed = (1.0 + (u.skills.masonry?.level ?? 1) * 0.2) * attrMult * this.getRestMult(u);
        u.workProgress = (u.workProgress ?? 0) + dt * workSpeed;
        if (u.workProgress >= 25.0) {
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
            const tx = key % MAP_W, ty = Math.floor(key / MAP_W);
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
        const agora = this.scene.constructs.find(b => b.id === u.taskConstructId && b.built);
        if (!agora) { u.taskType = null; u.merchantPhase = null; return; }

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
        const tx = u.taskZoneKey % MAP_W, ty = Math.floor(u.taskZoneKey / MAP_W);
        const cx = tx * TILE + TILE / 2, cy = MAP_OY + ty * TILE + TILE / 2;
        if (this.moveToward(u, cx, cy, 28, dt)) return;

        u.workProgress = (u.workProgress ?? 0) + dt;
        if (u.workProgress >= 2000) {
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
        const tx = u.taskZoneKey % MAP_W, ty = Math.floor(u.taskZoneKey / MAP_W);
        const cx = tx * TILE + TILE / 2, cy = MAP_OY + ty * TILE + TILE / 2;
        if (this.moveToward(u, cx, cy, 28, dt)) return;

        u.workProgress = (u.workProgress ?? 0) + dt;
        if (u.workProgress >= 3000) {
            u.workProgress = 0;
            let planted = 0;
            for (let i = 0; i < state.slots.length; i++) {
                if (state.slots[i] < 0) { state.slots[i] = 0; planted++; }
            }
            this._gainSkillXp(u, 'farming');
            zm._renderGrowSlots();
            if (planted > 0)
                this.scene.uiManager.showFloatText(cx, cy - 14, 'planted!', '#aaddaa');
            u.taskType = null;
        }
    },

    handleHarvestFarmTask(u, dt) {
        const b = this.scene.constructs.find(b => b.id === u.taskConstructId && b.built && (b.type === 'farm' || b.type === 'garden'));
        if (!b) { u.taskType = null; return; }

        // Garden: scoop inventory into carrying, then deposit home
        if (b.type === 'garden') {
            const cx = (b.tx + b.width / 2) * TILE, cy = MAP_OY + (b.ty + b.width / 2) * TILE;
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
        const cx = (b.tx + b.width / 2) * TILE, cy = MAP_OY + (b.ty + b.width / 2) * TILE;
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
            u.carrying['Food.Grain.Wheat'] += pick;
            b.dailyProduction = b.dailyProduction ?? {};
            b.dailyProduction['Food.Grain.Wheat'] = (b.dailyProduction['Food.Grain.Wheat'] ?? 0) + pick;
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
        const b = this.scene.constructs.find(b => b.id === u.taskConstructId && b.built && b.type === 'farm');
        if (!b || !b.needsPlanting) { u.taskType = null; return; }
        const cx = (b.tx + b.width / 2) * TILE, cy = MAP_OY + (b.ty + b.width / 2) * TILE;
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

        const b = this.scene.constructs.find(b => b.id === u.targetConstructId && b.built);
        if (!b) { u.targetConstructId = null; u.taskType = null; return; }

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
        } else {
            u.targetConstructId = null; u.taskType = null;
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

    // Converted from getter: returns the Set of public storage construct types
    _publicStorage() {
        return new Set(['grainsilo', 'storageshelf', 'townhall', 'chest']);
    },

    // Converted from getter: returns deposit route map from job definitions
    _depositRoutes() {
        return Object.fromEntries(Object.values(JOBS).filter(j => j.depositTypes?.length > 0).map(j => [j.id, j.depositTypes]));
    },

    // Find nearest built construct of one of the given types
    _nearestOfTypes(x, y, types) {
        let best = null, bd = Infinity;
        for (const b of this.scene.constructs) {
            if (!b.built || b.faction === 'enemy') continue;
            if (!types.includes(b.type)) continue;
            const bx = (b.tx + b.width / 2) * TILE, by = MAP_OY + (b.ty + b.width / 2) * TILE;
            const d = Phaser.Math.Distance.Between(x, y, bx, by);
            if (d < bd) { bd = d; best = b; }
        }
        return best;
    },

    _seekCampHome(u) {
        if (u.homeConstructId != null || u.homeConstructId) return;
        const fm = this.scene.constructManager;
        if (!fm) return;
        const slots = CONSTRUCTS['camp']?.provides?.sleepSlots ?? 2;
        let bestKey = null, bestDist = Infinity;
        for (const item of fm.constructs) {
            if (!item.built || item.type !== 'camp') continue;
            const occupants = this.scene.units.filter(w => w.homeConstructId === item.id).length;
            if (occupants >= slots) continue;
            const d = Phaser.Math.Distance.Between(u.x, u.y, (item.tx + 0.5) * TILE, MAP_OY + (item.ty + 0.5) * TILE);
            if (d < bestDist) { bestDist = d; bestKey = item.id; }
        }
        if (bestKey !== null) u.homeConstructId = bestKey;
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
        u.needs.joy = Math.min(1.0, (u.needs.joy ?? 0.5) + dt * 0.018);
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

    seekDeposit(u) {
        const hasCarry = Object.keys(u.carrying).some(r => (u.carrying[r] || 0) > 0);
        if (!hasCarry) return;

        // Private roles → home oikos
        const privateRoles = new Set(Object.values(JOBS).filter(j => j.private).map(j => j.id));
        if (privateRoles.has(u.role) && u.homeConstructId) {
            const home = this.scene.constructs.find(b => b.id === u.homeConstructId && b.built && CONSTRUCTS[b.type]?.isHomeType);
            if (home) {
                u.taskType = 'deposit'; u.taskConstructId = home.id; u._depositPrivate = true;
                return;
            }
        }

        // Farmers at private farms deposit to their home oikos, not the commons
        if (u.role === 'farmer') {
            const workplace = this.scene.constructs.find(b => b.id === u.taskConstructId && b.built);
            const isPublicFarm = !workplace || workplace.isPublic;
            if (!isPublicFarm && u.homeConstructId) {
                const home = this.scene.constructs.find(b => b.id === u.homeConstructId && b.built && CONSTRUCTS[b.type]?.isHomeType);
                if (home) { u.taskType = 'deposit'; u.taskConstructId = home.id; u._depositPrivate = true; return; }
            }
        }

        // Storage zone deposit: prefer appliance tiles, fall back to bare zone tiles
        const zm = this.scene.zoneManager;
        const fm = this.scene.constructManager;
        if (zm?.storageTiles.size > 0) {
            const STORAGE_APPL = new Set(['grainsilo', 'storageshelf']);
            let bestKey = null, bestDist = Infinity;
            // First pass: tiles with a built storage appliance
            for (const key of zm.storageTiles) {
                const tx = key % MAP_W, ty = Math.floor(key / MAP_W);
                const item = fm?.getAt(tx, ty);
                if (!item?.built || !STORAGE_APPL.has(item.type)) continue;
                const d = Phaser.Math.Distance.Between(u.x, u.y, (tx + 0.5) * TILE, MAP_OY + (ty + 0.5) * TILE);
                if (d < bestDist) { bestDist = d; bestKey = key; }
            }
            // Second pass: any storage tile
            if (bestKey === null) {
                for (const key of zm.storageTiles) {
                    const tx = key % MAP_W, ty = Math.floor(key / MAP_W);
                    const d = Phaser.Math.Distance.Between(u.x, u.y, tx * TILE + TILE / 2, MAP_OY + ty * TILE + TILE / 2);
                    if (d < bestDist) { bestDist = d; bestKey = key; }
                }
            }
            if (bestKey !== null) { u.taskType = 'deposit_zone'; u.taskZoneKey = bestKey; return; }
        }

        // Role-based routing: prefer private construct in home domain, fall back to nearest public
        const routeTypes = this._depositRoutes()[u.role];
        if (routeTypes) {
            const homeDomain = u.homeConstructId
                ? this.scene.constructManager.getDomainAt(
                    ...(this.scene.constructs.find(b => b.id === u.homeConstructId)
                        ? [this.scene.constructs.find(b => b.id === u.homeConstructId).tx,
                           this.scene.constructs.find(b => b.id === u.homeConstructId).ty]
                        : [0, 0]))
                : null;

            // First try: private construct in worker's home domain
            const privateDest = homeDomain
                ? this.scene.constructs.find(b =>
                    b.built && !b.faction && !b.isPublic &&
                    routeTypes.includes(b.type) &&
                    this.scene.constructManager.getDomainAt(b.tx, b.ty)?.id === homeDomain.id)
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
            const home = this.scene.constructs.find(b => b.id === u.homeConstructId && b.built);
            if (home) { u.taskType = 'deposit'; u.taskConstructId = home.id; u._depositPrivate = !home.isPublic; }
        }
    },

    handleDepositTask(u, dt) {
        const b = this.scene.constructs.find(b => b.id === u.taskConstructId && b.built && !b.faction);
        if (!b) { u.taskType = null; u._depositPrivate = false; return; }
        const cx = (b.tx + b.width / 2) * TILE, cy = MAP_OY + (b.ty + b.width / 2) * TILE;
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
        if (!zm?.storageTiles.has(u.taskZoneKey)) { u.taskType = null; return; }
        const tx = u.taskZoneKey % MAP_W, ty = Math.floor(u.taskZoneKey / MAP_W);
        const cx = tx * TILE + TILE / 2, cy = MAP_OY + ty * TILE + TILE / 2;
        if (this.moveToward(u, cx, cy, 30, dt)) return;

        for (const [res, amt] of Object.entries(u.carrying)) {
            if ((amt ?? 0) <= 0) continue;
            this.scene.economyManager.addResource(res, amt);
            u.carrying[res] = 0;
            this.scene.uiManager.showFloatText(cx, cy - 14, `+${amt} ${res.split('.').pop()}`, '#88ff88');
        }
        this.scene.economyManager.syncResources();
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
            if (site.placement === 'edge') {
                const ex = site.isH ? (site.col + 0.5) * TILE : site.col * TILE;
                const ey = site.isH ? MAP_OY + site.row * TILE : MAP_OY + (site.row + 0.5) * TILE;
                u.moveTo = { x: ex, y: ey };
            } else {
                u.moveTo = { x: (site.tx + site.width / 2) * TILE, y: MAP_OY + (site.ty + site.height / 2) * TILE };
            }
            return;
        }
    },

    seekFarmerTask(u) {
        const home = u.homeConstructId
            ? this.scene.constructs.find(b => b.id === u.homeConstructId)
            : null;
        const homeDomain = home?.domainId
            ? this.scene.domains.find(d => d.id === home.domainId)
            : null;

        // ── Grow zones (tile-based crops) ─────────────────────────────────────
        const zm = this.scene.zoneManager;
        if (zm) {
            const nearest = (keys) => {
                let bestKey = null, bestDist = Infinity;
                for (const key of keys) {
                    const tx = key % MAP_W, ty = Math.floor(key / MAP_W);
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

        // No grow zones ready — forage nodes
        this.seekNodeTask(u, ['berry_bush', 'wild_garden', 'olive_grove']);
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
                    const key = fm.tileKey(tx, ty);
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
        if (!construct) return;

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

    // Returns true if construct b is inside the same oikos domain as unit u's home
    _isInUnitDomain(u, b) {
        const home = u.homeConstructId
            ? this.scene.constructs.find(h => h.id === u.homeConstructId)
            : null;
        if (!home?.domainId) return false;
        return b.domainId === home.domainId;
    },

    // Pre-civic age: no townhall yet → ownership/domain distinctions don't apply
    _isPreCivicAge() {
        return !this.scene.constructs.some(b => b.type === 'townhall' && b.built && !b.faction);
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
            const bx = (b.tx + b.width / 2) * TILE, by2 = MAP_OY + (b.ty + b.width / 2) * TILE;
            const d = Phaser.Math.Distance.Between(x, y, bx, by2);
            if (d < bd) { bd = d; best = b; }
        }
        return best;
    },

    handleWorkshopTask(u, dt) {
        const def = WORKSHOP_JOBS[u.role];
        const b   = this.scene.constructs.find(b => b.id === u.taskConstructId && b.built);
        if (!b || !def) { u.taskType = null; u.workshopPhase = null; u.isInside = false; return; }

        // === PROCURER: goFetch → goWork → loop back to goFetch ===
        if (u.workshopSubrole === 'procure') {
            if (u.workshopPhase === 'goFetch' || !u.workshopPhase) {
                const src = this.scene.constructs.find(s => s.id === u.fetchConstructId && s.built);
                if (!src) {
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
            const cx = (b.tx + b.width / 2) * TILE;
            const cy = MAP_OY + (b.ty + b.width / 2) * TILE;
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
            const src = this.scene.constructs.find(s => s.id === u.fetchConstructId && s.built);
            if (!src) {
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
        const cy = MAP_OY + (b.ty + b.width / 2) * TILE;
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

    _doProcessTick(u, b, def, dt) {
        const attrMult = this.getAttrMult(u, ['dex', 'int']);
        const workSpeed = (1.0 + (u.skills[def.skill]?.level ?? 1) * 0.2) * attrMult * this.getRestMult(u);
        u.workProgress = (u.workProgress ?? 0) + dt * workSpeed;
        if (u.workProgress >= 3.0) {
            u.workProgress = 0;
            b.inbox[def.input] -= 1;

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
        const FOOD_PRIORITY = ['Food.Grain.Wheat.Bread', 'Food.Meat.Venison.Sausages', 'Food.Grain.Wheat.Flour', 'Food.Produce.Olive', 'Food.Grain.Wheat', 'Food.Meat.Venison', 'Food.Produce.Berry'];
        const NUTRITION_MAP = Object.fromEntries(Object.values(ITEMS).filter(d => d.nutrition != null).map(d => [d.key, d.nutrition]));

        // Eat from own carrying inventory first (no travel needed)
        if (FOOD_PRIORITY.some(k => (u.carrying[k] ?? 0) > 0)) {
            if (!u.needs) u.needs = { food: 0, rest: 1, social: 0.8, joy: 0.8 };
            while ((u.needs.food ?? 0) < 0.95) {
                let found = false;
                for (const food of FOOD_PRIORITY) {
                    if ((u.carrying[food] ?? 0) >= 1) {
                        u.carrying[food]--;
                        const nut = NUTRITION_MAP[food] ?? 0.2;
                        u.needs.food = Math.min(1.0, (u.needs.food ?? 0) + nut);
                        u.dailyNutrition = Math.min(1.0, (u.dailyNutrition ?? 0) + nut);
                        found = true; break;
                    }
                }
                if (!found) break;
            }
            this.scene.uiManager.showFloatText(u.x, u.y - 14, '🍱 full', '#ffee88');
            this.popTask(u);
            return;
        }

        // Try to eat from the nearest food construct's inventory
        const FOOD_CONSTRUCT_TYPES = new Set(['oven', 'butchersblock', 'grainsilo', 'house', 'camp', 'townhall']);
        let foodConstruct = null, bd = Infinity;
        for (const b of this.scene.constructs) {
            if (!b.built || b.faction || !FOOD_CONSTRUCT_TYPES.has(b.type)) continue;
            // Houses and camps: only eat from own home, or if the construct is public
            const isHome = b.id === u.homeConstructId;
            const inv = (CONSTRUCTS[b.type]?.isHomeType) && !isHome && !b.isPublic ? null : b.inventory;
            if (!inv || !FOOD_PRIORITY.some(k => (inv[k] ?? 0) > 0)) continue;
            const bx = (b.tx + b.width / 2) * TILE, by = MAP_OY + (b.ty + b.width / 2) * TILE;
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
                for (const food of FOOD_PRIORITY) {
                    if ((foodConstruct.inventory?.[food] ?? 0) >= 1) {
                        foodConstruct.inventory[food]--;
                        if (foodConstruct.isPublic) {
                            this.scene.economyManager.syncResources();
                        }
                        const nut = NUTRITION_MAP[food];
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
                for (const food of FOOD_PRIORITY) {
                    if ((this.scene.resources[food] ?? 0) >= 1) {
                        this.scene.economyManager.takeFromCommons(food, 1);
                        const nut = NUTRITION_MAP[food];
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
                this.scene.uiManager.showFloatText(u.x, u.y - 14, 'hungry!', '#ff6644');
            }
        }

        // Restore saved task
        this.popTask(u);
    },

    seekNodeTask(u, types) {
        const near = this.findNearNode(u, 8000, types);
        if (near) {
            u.targetNode = near; u.moveTo = null;
        }
    },

    findNearNode(u, maxDist, filterType) {
        let best = null, bd = Infinity;
        for (const n of this.scene.resNodes) {
            if (n.stock <= 0) continue;
            if (filterType && !filterType.includes(n.type)) continue;
            const d = Phaser.Math.Distance.Between(u.x, u.y, n.x, n.y);
            if (d < maxDist && d < bd) { bd = d; best = n; }
        }
        if (filterType && filterType.includes('mountain')) {
            const utx = Math.floor(u.x / 32), uty = Math.floor((u.y - 52) / 32);
            for (let dy = -15; dy <= 15; dy++) {
                for (let dx = -15; dx <= 15; dx++) {
                    const tx = utx + dx, ty = uty + dy;
                    if (tx < 0 || tx >= 80 || ty < 0 || ty >= 128) continue;
                    if (this.scene.terrainData[ty][tx] === T_MOUNTAIN) {
                        const px = tx * 32 + 16, py = 52 + ty * 32 + 16;
                        const d = Phaser.Math.Distance.Between(u.x, u.y, px, py);
                        if (d < maxDist && d < bd) {
                            bd = d;
                            best = { isTile: true, type: 'mountain', tx, ty, x: px, y: py, stock: 10 };
                        }
                    }
                }
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

    _runArchonAI(u, dt) {
        // Rate limit: evaluate once every 5 seconds
        u._archonAiTimer = (u._archonAiTimer ?? 0) + dt;
        if (u._archonAiTimer < 5.0) return;
        u._archonAiTimer = 0;

        // If something is already being built, the Archon waits
        if (this.scene.constructs.some(b => !b.built && !b.faction)) return;

        for (const type of ARCHON_BUILD_ORDER) {
            // Check if construct already exists
            if (this.scene.constructs.some(b => b.type === type && !b.faction)) continue;

            const def = CONSTRUCTS[type];
            if (!def) continue;

            // Archon only places if state can afford it
            const cost = def.cost || {};
            // Simplified check: can we afford basic cost?
            if (!this.scene.economyManager.afford(cost)) continue;

            // Find a site
            const site = this.scene.constructManager.findPublicBuildSite(type);
            if (site) {
                console.log(`[Archon AI] ${u.name} decides to build a public ${type} at ${site.tx}, ${site.ty}`);
                // Use a temporary state to trigger placeConstruct logic
                const prevType = this.scene.constructType;
                this.scene.constructType = type;
                this.scene.constructManager.placeConstruct(site.tx, site.ty);
                this.scene.constructType = prevType;

                // Ensure it's marked public (it should be by default now, but let's be certain for Archon tasks)
                const newConstruct = this.scene.constructs[this.scene.constructs.length - 1];
                if (newConstruct && newConstruct.type === type) newConstruct.isPublic = true;

                this.scene.uiManager.showFloatText(u.x, u.y - 25, `⚜ Archon: "Build a ${type}!"`, '#ffdd44');
                break; // One construct placement at a time
            }
        }
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

    _fetchSources() {
        return Object.fromEntries(Object.values(JOBS).filter(j => j.fetchSources).map(j => [j.id, j.fetchSources]));
    },

    _selfSupply() {
        return Object.fromEntries(Object.values(JOBS).filter(j => j.selfSupply).map(j => [j.id, j.selfSupply]));
    },
};
