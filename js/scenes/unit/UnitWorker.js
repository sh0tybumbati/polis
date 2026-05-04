import {
    TILE, MAP_OY, BLDG,
    ARCHON_BUILD_ORDER,
} from '../../config/gameConstants.js';
import { NODES } from '../../content/nodes/index.js';
import { ANIMALS } from '../../content/animals/index.js';
import { ITEMS } from '../../content/items/index.js';
import { JOBS, WORKSHOP_JOBS } from '../../content/jobs/index.js';

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
            if (u.homeBldgId) {
                const home = this.scene.buildings.find(b => b.id === u.homeBldgId && b.built);
                if (home) {
                    const hcx = (home.tx + home.size / 2) * TILE;
                    const hcy = MAP_OY + (home.ty + home.size / 2) * TILE;
                    if (Phaser.Math.Distance.Between(u.x, u.y, hcx, hcy) > 10) {
                        if (this.totalCarrying(u) > 0 && u.taskType !== 'deposit') {
                            u.taskType = 'deposit'; u.taskBldgId = home.id; u._depositPrivate = true;
                        }
                        if (u.taskType === 'deposit') { this.handleDepositTask(u, dt); return; }
                        this.moveToward(u, hcx, hcy, u.speed, dt);
                        u.isInside = false;
                    } else {
                        u.isInside = true;
                        u.isSleeping = true;
                        // Clear active task so they resume fresh when rested
                        if (u.taskType && u.taskType !== 'garrison') {
                            u.taskType = null; u.targetNode = null; u.workProgress = 0;
                            u.workshopPhase = null; u.fetchBldgId = null;
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

        // Exit building when not sleeping
        if (u.isInside && u.workshopPhase !== 'process') u.isInside = false;

        // Food need: eat interrupt anytime (not just during day)
        if (u.taskType !== 'garrison' && u.taskType !== 'eat') {
            if ((u.needs?.food ?? 1.0) < 0.4) {
                this.pushTask(u, 'eat');
                u.workshopPhase = null;
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
            this.scene.buildings.some(b => b.built && Object.values(b.tithePending ?? {}).some(v => v > 0))) {
            u.taskType = 'collect_tithe';
        }

        // Deposit takes priority
        if (this.totalCarrying(u) > 0 && !u.targetNode && u.taskType !== 'build' && u.taskType !== 'eat' && u.taskType !== 'collect_tithe') {
            if (u.taskType !== 'deposit') this.seekDeposit(u);
            if (u.taskType === 'deposit') { this.handleDepositTask(u, dt); return; }
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
                if (u.homeBldgId) {
                    const home = this.scene.buildings.find(b => b.id === u.homeBldgId && b.built);
                    if (home) {
                        u.moveTo = { x: (home.tx + home.size / 2) * TILE, y: MAP_OY + (home.ty + home.size / 2) * TILE };
                    }
                }
            } else if (intent === 'socialize') {
                this._handleSocializeIntent(u);
            } else if (intent === 'leisure') {
                // Placeholder — joy recovers passively while idle
            } else {
                // work intent
                this.pickRole(u, time);
                if (u.role && !u.taskType) {
                    if (u.role === 'farmer') this.seekFarmerTask(u);
                    else if (u.role === 'builder') this.seekBuilderTask(u);
                    else if (u.role in WORKSHOP_JOBS) this.seekWorkshopTask(u);
                    else if (JOBS[u.role]?.nodeTypes) this.seekNodeTask(u, JOBS[u.role].nodeTypes);
                }
                // No task found — fall through to socialize if available
                if (!u.taskType && !u.targetNode) {
                    const fallback = u.dayPlan?.find(p => p.intent === 'socialize' || p.intent === 'leisure');
                    if (fallback?.intent === 'socialize') this._handleSocializeIntent(u);
                }
            }
        }

        // Design fix: if unit has a role but no task/node for 12s, re-evaluate
        // Prevents permanent lock when e.g. all farms are fallow and no nodes in range
        const stickyRoles = new Set(['hunter', 'shepherd']); // player-directed, don't auto-reassign
        if (u._prevRole) stickyRoles.add(u.role); // self-supplying — keep temporary role until deposit done
        if (!stickyRoles.has(u.role) && !u.taskType && !u.targetNode) {
            u._roleIdleTimer = (u._roleIdleTimer ?? 0) + dt;
            if (u._roleIdleTimer > 45) { u._roleIdleTimer = 0; u.role = null; }
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
        else if (u.taskType === 'build') this.handleBuildTask(u, dt);
        else if (u.taskType === 'deconstruct') this.handleDeconstructTask(u, dt);
        else if (u.taskType === 'repair') this.handleRepairTask(u, dt);
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
        const b = this.scene.buildings.find(b => b.id === u.taskBldgId && b.built);
        if (!b) { u.taskType = null; return; }
        // Walk into the tower and stay
        const cx = (b.tx + 0.5) * TILE, cy = MAP_OY + (b.ty + 0.5) * TILE;
        this.moveToward(u, cx, cy, 6, dt);
    },

    handleRepairTask(u, dt) {
        const b = this.scene.buildings.find(b => b.id === u.taskBldgId && b.built);
        if (!b || b.hp >= b.maxHp) { u.taskType = null; return; }
        const cx = (b.tx + b.size / 2) * TILE, cy = MAP_OY + (b.ty + b.size / 2) * TILE;
        if (this.moveToward(u, cx, cy, 28, dt)) return;
        u.workProgress = (u.workProgress ?? 0) + dt;
        if (u.workProgress >= 25.0) {
            u.workProgress = 0;
            // Costs half the build materials — spend stone if available
            const repairCost = { 'Materials.Stone.Limestone': 1 };
            if (this.scene.economyManager.afford(repairCost)) {
                this.scene.economyManager.spend(repairCost);
                b.hp = Math.min(b.maxHp, b.hp + Math.ceil(b.maxHp / 10));
                this.scene.buildingManager.redrawBuildingBar(b);
                this._gainSkillXp(u, 'masonry');
                if (b.hp >= b.maxHp) u.taskType = null;
            }
        }
    },

    handleBuildTask(u, dt) {
        const b = this.scene.buildings.find(b => b.id === u.taskBldgId);
        if (!b || b.built) { u.taskType = null; return; }

        // Ensure resources are gathered for construction
        const cost = this.scene.buildingManager.getRemainingCost(b);
        const res = Object.keys(cost).find(r => cost[r] > 0);
        if (res) {
            if (this.totalCarrying(u) === 0) {
                // Nothing in hand — pull from public storage or self-supply
                if ((this.scene.resources[res] ?? 0) >= 1) {
                    this.scene.economyManager.takeFromCommons(res, 1);
                    u.carrying[res] += 1;
                } else {
                    // Fallback: self-supply (records debt for later compensation)
                    u.carrying[res] += 1;
                    u._soldRes = { res, amt: 1 };
                }
            } else if ((u.carrying[res] ?? 0) === 0) {
                // Carrying something else but not the needed resource — deposit first
                this.handleDepositTask(u, dt);
                return;
            }
            // else: already carrying the needed resource — fall through to build
        }

        const cx = (b.tx+b.size/2)*TILE, cy = MAP_OY+(b.ty+b.size/2)*TILE;
        if (this.moveToward(u, cx, cy, 28, dt)) return;
        u.isInside = false;

        const attrMult = this.getAttrMult(u, ['str']);
        const workSpeed = (1.0 + (u.skills.masonry?.level ?? 1) * 0.2) * attrMult * this.getRestMult(u);
        u.workProgress = (u.workProgress ?? 0) + dt * workSpeed;
        if (u.workProgress >= 25.0) {
            u.workProgress = 0;
            b.buildWork -= 5;
            this._gainSkillXp(u, 'masonry');
            // If we used private resources, add to building debt for compensation
            if (u._soldRes) {
                b.tithePending = b.tithePending ?? {}; // using tithePending as a proxy for debt for now
                b.tithePending[u._soldRes.res] = (b.tithePending[u._soldRes.res] ?? 0) - u._soldRes.amt;
                u._soldRes = null;
            }
            if (b.buildWork <= 0) { this.scene.buildingManager.completeBuildingConstruction(b); u.taskType = null; }
        }
    },

    handleDeconstructTask(u, dt) {
        const b = this.scene.buildings.find(b => b.id === u.taskBldgId && b.built && b.deconstructing);
        if (!b) { u.taskType = null; return; }

        const cx = (b.tx + b.size / 2) * TILE, cy = MAP_OY + (b.ty + b.size / 2) * TILE;
        if (this.moveToward(u, cx, cy, 28, dt)) return;
        u.isInside = false;

        const attrMult = this.getAttrMult(u, ['str']);
        const workSpeed = (1.0 + (u.skills.masonry?.level ?? 1) * 0.2) * attrMult * this.getRestMult(u);
        u.workProgress = (u.workProgress ?? 0) + dt * workSpeed;
        if (u.workProgress >= 25.0) {
            u.workProgress = 0;
            b.deconstructWork -= 5;
            this._gainSkillXp(u, 'masonry');
            this.scene.buildingManager.redrawBuilding(b);
            if (b.deconstructWork <= 0) {
                u.taskType = null;
                this.scene.buildingManager.demolishBuilding(b, 0.5);
                this.scene.uiManager.showFloatText(cx, cy - 12, 'Deconstructed', '#ffaa44');
            }
        }
    },

    seekMerchantTask(u) {
        const agora = this.scene.buildings.find(b => b.type === 'agora' && b.built && !b.faction);
        if (!agora) { u.role = null; return; }
        u.taskType = 'merchant';
        u.taskBldgId = agora.id;
        u.merchantPhase = 'seek';
    },

    handleMerchantTask(u, dt) {
        const agora = this.scene.buildings.find(b => b.id === u.taskBldgId && b.built);
        if (!agora) { u.taskType = null; u.merchantPhase = null; return; }

        const cx = (agora.tx + agora.size / 2) * TILE;
        const cy = MAP_OY + (agora.ty + agora.size / 2) * TILE;

        // Walk to agora
        if (this.moveToward(u, cx, cy, 28, dt)) return;
        u.isInside = true;

        // Seek an executable order
        if (u.merchantPhase === 'seek' || !u.merchantPhase) {
            const orders = agora.tradeOrders ?? [];
            const order = orders.find(o => (this.scene.resources[o.give] ?? 0) >= o.qty);
            if (!order) {
                // Nothing to trade — idle at agora
                u.workProgress = 0;
                return;
            }
            // Reserve the goods from commons
            this.scene.economyManager.takeFromCommons(order.give, order.qty);
            u._merchantOrder = order;
            u.merchantPhase = 'simulate';
            u.workProgress = 0;
            this.scene.uiManager.showFloatText(u.x, u.y - 14, `Trading ${order.giveLabel}…`, '#ddaa44');
            return;
        }

        // Simulate finding a buyer (work timer)
        if (u.merchantPhase === 'simulate') {
            const def = JOBS.merchant;
            const attrMult = this.getAttrMult(u, ['int', 'agi']);
            const spd = (1.0 + (u.skills.trading?.level ?? 1) * 0.15) * attrMult * this.getRestMult(u);
            u.workProgress = (u.workProgress ?? 0) + dt * spd;
            if (u.workProgress >= def.simulateMs) {
                u.workProgress = 0;
                const order = u._merchantOrder;
                if (order) {
                    // Calculate receive qty at local market rate
                    const em = this.scene.economyManager;
                    const giveVal  = em.getItemValue(order.give);
                    const wantVal  = em.getItemValue(order.want);
                    const receiveQty = Math.max(1, Math.round(
                        (order.qty * giveVal * def.valueRatio) / wantVal));

                    em.addResource(order.want, receiveQty);

                    // Log the trade on the agora
                    agora.tradeLog = agora.tradeLog ?? [];
                    agora.tradeLog.unshift({
                        day: this.scene.day,
                        gave: { key: order.give, qty: order.qty },
                        got:  { key: order.want, qty: receiveQty },
                    });
                    if (agora.tradeLog.length > 8) agora.tradeLog.pop();

                    this._gainSkillXp(u, 'trading');
                    this.scene.uiManager.showFloatText(u.x, u.y - 14,
                        `+${receiveQty} ${order.wantLabel}`, '#88ffaa');
                    u._merchantOrder = null;
                }
                u.merchantPhase = 'seek';
            }
            return;
        }

        u.merchantPhase = 'seek';
    },

    handleHarvestFarmTask(u, dt) {
        const b = this.scene.buildings.find(b => b.id === u.taskBldgId && b.built && b.type === 'farm');
        if (!b || b.stock <= 0) { u.taskType = null; return; }
        const cx = (b.tx + b.size / 2) * TILE, cy = MAP_OY + (b.ty + b.size / 2) * TILE;
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
            // Redraw full building graphic when a crop row boundary is crossed
            const rows = b.maxStock > 0 ? Math.round(b.stock / b.maxStock * 5) : 0;
            const prevRows = b.maxStock > 0 ? Math.round((b.drawnStock ?? b.maxStock) / b.maxStock * 5) : 0;
            if (rows !== prevRows) {
                b.drawnStock = b.stock;
                this.scene.buildingManager.redrawBuilding(b);
            } else {
                this.scene.buildingManager.redrawBuildingBar(b);
            }
        }
    },

    handlePlantTask(u, dt) {
        const b = this.scene.buildings.find(b => b.id === u.taskBldgId && b.built && b.type === 'farm');
        if (!b || !b.needsPlanting) { u.taskType = null; return; }
        const cx = (b.tx + b.size / 2) * TILE, cy = MAP_OY + (b.ty + b.size / 2) * TILE;
        if (this.moveToward(u, cx, cy, 28, dt)) return;

        u.workProgress = (u.workProgress ?? 0) + dt;
        if (u.workProgress >= 6000) { // 6s plant time
            u.workProgress = 0;
            b.needsPlanting = false;
            b.stock = b.maxStock;
            this.scene.buildingManager.redrawBuildingBar(b);
            u.taskType = null;
        }
    },

    handleCollectTitheTask(u, dt) {
        // Step 1: Find building with tithePending
        if (!u.targetBldgId) {
            const b = this.scene.buildings.find(b => b.built && Object.values(b.tithePending ?? {}).some(v => v > 0));
            if (!b) { u.taskType = null; return; }
            u.targetBldgId = b.id;
        }

        const b = this.scene.buildings.find(b => b.id === u.targetBldgId && b.built);
        if (!b) { u.targetBldgId = null; u.taskType = null; return; }

        const door = this._bldgDoor(b);
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
            u.targetBldgId = null;
            u.taskType = 'deposit_tithe';
        } else {
            u.targetBldgId = null; u.taskType = null;
        }
    },

    handleDepositTitheTask(u, dt) {
        const th = this._nearestOfTypes(u.x, u.y, ['granary', 'warehouse', 'woodshed', 'stonepile']);
        if (!th) { u.taskType = null; return; }
        const door = this._bldgDoor(th);
        if (this.moveToward(u, door.x, door.y, 30, dt)) return;

        for (const [key, qty] of Object.entries(u.carrying)) {
            if (qty > 0) {
                this.scene.economyManager.addResource(key, qty);
                u.carrying[key] = 0;
                this.scene.uiManager.showFloatText(u.x, u.y - 14, `deposited ${qty} ${key}`, '#aaffcc');
            }
        }
        u.taskType = null;
    },

    // Converted from getter: returns the Set of public storage building types
    _publicStorage() {
        return new Set(['granary', 'warehouse', 'stonepile', 'woodshed']);
    },

    // Converted from getter: returns deposit route map from job definitions
    _depositRoutes() {
        return Object.fromEntries(Object.values(JOBS).filter(j => j.depositTypes?.length > 0).map(j => [j.id, j.depositTypes]));
    },

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
    },

    seekDeposit(u) {
        const hasCarry = Object.keys(u.carrying).some(r => (u.carrying[r] || 0) > 0);
        if (!hasCarry) return;

        // Private roles → home oikos
        const privateRoles = new Set(Object.values(JOBS).filter(j => j.private).map(j => j.id));
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
        const routeTypes = this._depositRoutes()[u.role];
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
    },

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
                // Private deposit to house: just update house inventory
                b.inventory[res] = (b.inventory[res] ?? 0) + amt;
                u.carrying[res] = 0;
                this.scene.uiManager.showFloatText(u.x, u.y - 14, `+${amt} ${res}`, '#aaffcc');
            } else if (this._publicStorage().has(b.type) && b.isPublic) {
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
    },

    seekBuilderTask(u) {
        // Deconstruction jobs take priority over new construction
        const deconSite = this.scene.buildings.find(b =>
            b.built && b.deconstructing && !b.faction &&
            !this.scene.units.some(w => w.id !== u.id && w.taskType === 'deconstruct' && w.taskBldgId === b.id));
        if (deconSite) {
            u.taskType = 'deconstruct'; u.taskBldgId = deconSite.id;
            return;
        }

        const site = this.scene.buildings.find(b => {
            if (b.built || b.faction === 'enemy') return false;
            if (b.resourcesSpent) return true;
            return true;
        });
        if (!site) return;

        if (!site.resourcesSpent) {
            const cost = BLDG[site.type]?.cost;
            if (cost && this.scene.economyManager.afford(cost)) {
                this.scene.economyManager.spend(cost);
                site.resourcesSpent = true;
            }
        }

        u.taskType = 'build'; u.taskBldgId = site.id;
        u.moveTo = { x: (site.tx + site.size/2) * TILE, y: MAP_OY + (site.ty + site.size/2) * TILE };
    },

    seekFarmerTask(u) {
        const home = u.homeBldgId
            ? this.scene.buildings.find(b => b.id === u.homeBldgId)
            : null;
        const homeDomain = home?.domainId
            ? this.scene.domains.find(d => d.id === home.domainId)
            : null;

        // 1. Try planting first (high priority)
        const plantFarm = this.scene.buildings.find(b => {
            if (b.type !== 'farm' || !b.built || !b.needsPlanting) return false;
            if (b.isPublic) return true;
            const farmDomain = this.scene.buildingManager.getDomainAt(b.tx, b.ty);
            return !farmDomain || (homeDomain && farmDomain.id === homeDomain.id);
        });
        if (plantFarm) {
            u.taskType = 'plant'; u.taskBldgId = plantFarm.id;
            u.moveTo = { x: (plantFarm.tx + plantFarm.size/2) * TILE, y: MAP_OY + (plantFarm.ty + plantFarm.size/2) * TILE };
            return;
        }

        // 2. Try harvest
        const farm = this.scene.buildings.find(b => {
            if (b.type !== 'farm' || !b.built || b.stock <= 0 || b.faction === 'enemy') return false;
            if (b.isPublic) return true; // state farm — any worker can harvest
            const farmDomain = this.scene.buildingManager.getDomainAt(b.tx, b.ty);
            if (!farmDomain) return true; // unowned — anyone can work it
            return homeDomain && farmDomain.id === homeDomain.id;
        });
        if (!farm) {
            // Bug 4: farm fallow — forage all available food nodes, not just berry_bush
            this.seekNodeTask(u, ['berry_bush', 'wild_garden', 'olive_grove']);
            return;
        }
        u.taskType = 'harvest_farm'; u.taskBldgId = farm.id;
        u.moveTo = { x: (farm.tx + farm.size/2) * TILE, y: MAP_OY + (farm.ty + farm.size/2) * TILE };
    },

    seekWorkshopTask(u) {
        const def = WORKSHOP_JOBS[u.role];
        if (!def) { u.role = null; return; }

        // Find a building with an open procure OR process slot
        const bldg = this.scene.buildings.find(b => {
            if (b.type !== def.building || !b.built || b.faction) return false;
            if (!this._canAccessBuilding(u, b)) return false;
            const hasProcurer = this.scene.units.some(w => w.id !== u.id && w.role === u.role && w.workshopSubrole === 'procure' && w.taskBldgId === b.id);
            const hasProcessor = this.scene.units.some(w => w.id !== u.id && w.role === u.role && w.workshopSubrole === 'process' && w.taskBldgId === b.id);
            return !hasProcurer || !hasProcessor;
        });
        if (!bldg) return;

        const hasProcurer = this.scene.units.some(w => w.id !== u.id && w.role === u.role && w.workshopSubrole === 'procure' && w.taskBldgId === bldg.id);
        u.workshopSubrole = hasProcurer ? 'process' : 'procure';

        if (u.workshopSubrole === 'procure') {
            const sourceTypes = this._fetchSources()[u.role] ?? [];
            const source = this._findSourceBuildingNear(u.x, u.y, def.input, sourceTypes, u);
            if (!source) {
                const supply = this._selfSupply()[u.role];
                if (supply) {
                    const node = this.findNearNode(u, 8000, supply.nodes);
                    if (node) { u._prevRole = u.role; u.role = u.role === 'mason' ? 'miner' : 'woodcutter'; u.targetNode = node; return; }
                }
                return;
            }
            u.taskType = 'workshop'; u.taskBldgId = bldg.id;
            u.fetchBldgId = source.id; u.workshopPhase = 'goFetch';
        } else {
            u.taskType = 'workshop'; u.taskBldgId = bldg.id;
            u.workshopPhase = 'process';
            u.isInside = !(BLDG[bldg.type]?.outdoor ?? false);
        }
    },

    // Returns true if building b is inside the same oikos domain as unit u's home
    _isInUnitDomain(u, b) {
        const home = u.homeBldgId
            ? this.scene.buildings.find(h => h.id === u.homeBldgId)
            : null;
        if (!home?.domainId) return false;
        return b.domainId === home.domainId;
    },

    // Returns true if unit u is allowed to work in building b
    _canAccessBuilding(u, b) {
        if (b.isPublic) return true;
        return this._isInUnitDomain(u, b);
    },

    _findSourceBuildingNear(x, y, input, types, unit = null) {
        let best = null, bd = Infinity;
        for (const b of this.scene.buildings) {
            if (!b.built || b.faction === 'enemy') continue;
            if (!types.includes(b.type)) continue;
            if ((b.inventory?.[input] ?? 0) <= 0) continue;
            if (unit && !this._canAccessBuilding(unit, b)) continue;
            const bx = (b.tx + b.size / 2) * TILE, by2 = MAP_OY + (b.ty + b.size / 2) * TILE;
            const d = Phaser.Math.Distance.Between(x, y, bx, by2);
            if (d < bd) { bd = d; best = b; }
        }
        return best;
    },

    handleWorkshopTask(u, dt) {
        const def = WORKSHOP_JOBS[u.role];
        const b   = this.scene.buildings.find(b => b.id === u.taskBldgId && b.built);
        if (!b || !def) { u.taskType = null; u.workshopPhase = null; u.isInside = false; return; }

        // === PROCURER: goFetch → goWork → loop back to goFetch ===
        if (u.workshopSubrole === 'procure') {
            if (u.workshopPhase === 'goFetch' || !u.workshopPhase) {
                const src = this.scene.buildings.find(s => s.id === u.fetchBldgId && s.built);
                if (!src) {
                    const sourceTypes = this._fetchSources()[u.role] ?? [];
                    const newSrc = this._findSourceBuildingNear(u.x, u.y, def.input, sourceTypes, u);
                    if (!newSrc) { u.taskType = null; u.workshopPhase = null; return; }
                    u.fetchBldgId = newSrc.id;
                    return;
                }
                const door = this._bldgDoor(src);
                if (this.moveToward(u, door.x, door.y, 28, dt)) return;

                src.inventory = src.inventory ?? {};
                const avail = src.inventory[def.input] ?? 0;
                if (avail <= 0) {
                    const sourceTypes = this._fetchSources()[u.role] ?? [];
                    const newSrc = this._findSourceBuildingNear(u.x, u.y, def.input, sourceTypes, u);
                    if (!newSrc) { u.taskType = null; u.workshopPhase = null; return; }
                    u.fetchBldgId = newSrc.id;
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
                const door = this._bldgDoor(b);
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
                const nextSrc = this._findSourceBuildingNear(u.x, u.y, def.input, sourceTypes, u);
                if (!nextSrc) { u.taskType = null; u.workshopPhase = null; return; }
                u.fetchBldgId = nextSrc.id;
                return;
            }
            return;
        }

        // === PROCESSOR: stay at bench, consume inbox → output ===
        if (u.workshopSubrole === 'process') {
            const cx = (b.tx + b.size / 2) * TILE;
            const cy = MAP_OY + (b.ty + b.size / 2) * TILE;
            if (this.moveToward(u, cx, cy, 10, dt)) return;

            u.isInside = !(BLDG[b.type]?.outdoor ?? false);

            if ((b.inbox?.[def.input] ?? 0) <= 0) {
                // Idle — wait for procurer to refill inbox
                return;
            }

            this._doProcessTick(u, b, def, dt);
            return;
        }

        // === FALLBACK (old saves, no subrole): original full-cycle logic ===
        if (u.workshopPhase === 'goFetch') {
            const src = this.scene.buildings.find(s => s.id === u.fetchBldgId && s.built);
            if (!src) {
                const sourceTypes = this._fetchSources()[u.role] ?? [];
                const newSrc = this._findSourceBuildingNear(u.x, u.y, def.input, sourceTypes, u);
                if (!newSrc) { u.taskType = null; u.workshopPhase = null; return; }
                u.fetchBldgId = newSrc.id;
                return;
            }
            const door = this._bldgDoor(src);
            if (this.moveToward(u, door.x, door.y, 28, dt)) return;

            src.inventory = src.inventory ?? {};
            const avail = src.inventory[def.input] ?? 0;
            if (avail <= 0) {
                const sourceTypes = this._fetchSources()[u.role] ?? [];
                const newSrc = this._findSourceBuildingNear(u.x, u.y, def.input, sourceTypes, u);
                if (!newSrc) { u.taskType = null; u.workshopPhase = null; return; }
                u.fetchBldgId = newSrc.id;
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

        const cx = (b.tx + b.size / 2) * TILE;
        const cy = MAP_OY + (b.ty + b.size / 2) * TILE;
        if (this.moveToward(u, cx, cy, 10, dt)) return;

        if ((b.inbox?.[def.input] ?? 0) <= 0) {
            u.isInside = false;
            const sourceTypes = this._fetchSources()[u.role] ?? [];
            const newSrc = this._findSourceBuildingNear(u.x, u.y, def.input, sourceTypes, u);
            if (!newSrc) { u.taskType = null; u.workshopPhase = null; return; }
            u.fetchBldgId   = newSrc.id;
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

        // Try to eat from the nearest food building's inventory
        const FOOD_BLDG_TYPES = new Set(['bakery', 'butcher', 'granary', 'warehouse', 'house']);
        let foodBldg = null, bd = Infinity;
        for (const b of this.scene.buildings) {
            if (!b.built || b.faction || !FOOD_BLDG_TYPES.has(b.type)) continue;
            const inv = b.type === 'house' && b.id !== u.homeBldgId ? null : b.inventory;
            if (!inv || !FOOD_PRIORITY.some(k => (inv[k] ?? 0) > 0)) continue;
            const bx = (b.tx + b.size / 2) * TILE, by = MAP_OY + (b.ty + b.size / 2) * TILE;
            const d = Phaser.Math.Distance.Between(u.x, u.y, bx, by);
            if (d < bd) { bd = d; foodBldg = b; }
        }

        if (foodBldg) {
            const door = this._bldgDoor(foodBldg);
            if (this.moveToward(u, door.x, door.y, 40, dt)) return;

            // Eat until full (or out of food)
            if (!u.needs) u.needs = { food: 0, rest: 1, social: 0.8, joy: 0.8 };
            let ate = false;
            while ((u.needs.food ?? 0) < 0.95) {
                let found = false;
                for (const food of FOOD_PRIORITY) {
                    if ((foodBldg.inventory?.[food] ?? 0) >= 1) {
                        foodBldg.inventory[food]--;
                        if (this._publicStorage().has(foodBldg.type) && foodBldg.isPublic) {
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
            // No food building — try commons directly
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
        return best;
    },

    runCityPlannerAI(u) {
        // Simple version for now
        const needs = [
            { type: 'farm', urgency: (this.scene.resources['Food.Grain.Wheat'] / (this.scene.storageMax['Food.Grain.Wheat'] || 1)) < 0.4 ? 10 : 0 },
            { type: 'house', urgency: (this.scene.units.length / (this.scene.storageMax.pop || 10)) > 0.8 ? 8 : 0 }
        ];
        needs.sort((a,b) => b.urgency - a.urgency);
        const target = needs.find(n => n.urgency > 0 && !this.scene.buildings.some(b => b.type === n.type && !b.built));
        if (target && this.scene.economyManager.afford(BLDG[target.type].cost)) {
            // Logic to find site and place...
        }
    },

    _runArchonAI(u, dt) {
        // Rate limit: evaluate once every 5 seconds
        u._archonAiTimer = (u._archonAiTimer ?? 0) + dt;
        if (u._archonAiTimer < 5.0) return;
        u._archonAiTimer = 0;

        // If something is already being built, the Archon waits
        if (this.scene.buildings.some(b => !b.built && !b.faction)) return;

        for (const type of ARCHON_BUILD_ORDER) {
            // Check if building already exists
            if (this.scene.buildings.some(b => b.type === type && !b.faction)) continue;

            const def = BLDG[type];
            if (!def) continue;

            // Archon only places if state can afford it
            const cost = def.cost || {};
            // Simplified check: can we afford basic cost?
            if (!this.scene.economyManager.afford(cost)) continue;

            // Find a site
            const site = this.scene.buildingManager.findPublicBuildSite(type);
            if (site) {
                console.log(`[Archon AI] ${u.name} decides to build a public ${type} at ${site.tx}, ${site.ty}`);
                // Use a temporary state to trigger placeBuilding logic
                const prevType = this.scene.bldgType;
                this.scene.bldgType = type;
                this.scene.buildingManager.placeBuilding(site.tx, site.ty);
                this.scene.bldgType = prevType;

                // Ensure it's marked public (it should be by default now, but let's be certain for Archon tasks)
                const newBldg = this.scene.buildings[this.scene.buildings.length - 1];
                if (newBldg && newBldg.type === type) newBldg.isPublic = true;

                this.scene.uiManager.showFloatText(u.x, u.y - 25, `⚜ Archon: "Build a ${type}!"`, '#ffdd44');
                break; // One building placement at a time
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

    _fetchSources() {
        return Object.fromEntries(Object.values(JOBS).filter(j => j.fetchSources).map(j => [j.id, j.fetchSources]));
    },

    _selfSupply() {
        return Object.fromEntries(Object.values(JOBS).filter(j => j.selfSupply).map(j => [j.id, j.selfSupply]));
    },
};
