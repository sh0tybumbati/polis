import {
    BLDG, TILE, MAP_OY, APPLIANCE_DEF, BLDG_VOLUME,
} from '../config/gameConstants.js';
import { BUILDINGS } from '../content/buildings/index.js';
import { ITEMS } from '../content/items/index.js';

export default class EconomyManager {
    constructor(scene) {
        this.scene = scene;
    }

    // Per-building ctx so addResource writes to b.inventory (not global pool)
    buildCtx(b) {
        const scene = this.scene;
        const mgr   = this;
        return {
            workerAt:       (bldg, role)    => mgr._workerAt(bldg, role),
            addResource:    (key, qty)      => mgr.depositToBuilding(b, key, qty),
            hasStorageSpace:(key)           => true,  // local building inventory, always room
            gainXp:         (unit, skill)   => scene.unitManager._gainSkillXp(unit, skill),
            floatText:      (bldg, txt, col) => scene.uiManager.showFloatText(
                                                (bldg.tx + bldg.size / 2) * TILE,
                                                MAP_OY + bldg.ty * TILE - 8, txt, col),
            floatTextAt:    (x, y, txt, col) => scene.uiManager.showFloatText(x, y, txt, col),
            redrawBuilding: (bldg)          => scene.buildingManager.redrawBuilding(bldg),
            processOrders:  (bldg, delta)   => mgr._processOrders(bldg, delta),
            addGraphics:    ()              => scene.add.graphics().setDepth(7),
            tween:          (cfg)           => scene.tweens.add(cfg),
            get resources() { return scene.resources; },
            get buildings() { return scene.buildings; },
            get sheep()     { return scene.sheep; },
            get units()     { return scene.units; },
        };
    }

    // Deposit production output: reserves tithe + 1 unit wage for the active worker
    depositToBuilding(b, key, qty) {
        if (!qty || qty <= 0) return;
        b.inventory    = b.inventory    ?? {};
        b.dailyProduction = b.dailyProduction ?? {};

        // Track daily production
        b.dailyProduction[key] = (b.dailyProduction[key] ?? 0) + qty;

        // Wage: 1 unit to the worker currently processing at this building
        let keep = qty;
        if (keep >= 2) {
            const worker = this.scene.units.find(u =>
                !u.isEnemy && u.hp > 0 && u.taskBldgId === b.id && u.workshopPhase === 'process');
            if (worker) {
                b.wagePending = b.wagePending ?? {};
                b.wagePending[worker.id] = b.wagePending[worker.id] ?? {};
                b.wagePending[worker.id][key] = (b.wagePending[worker.id][key] ?? 0) + 1;
                keep -= 1;
            }
        }

        b.inventory[key] = (b.inventory[key] ?? 0) + keep;
        if (b.isPublic) this.syncResources();
        this.scene.updateUI();
    }

    // Dawn preparation: calculate daily tithe for each building
    collectFirstFruits() {
        for (const b of this.scene.buildings) {
            if (!b.built || b.faction || !b.dailyProduction) continue;
            
            b.tithePending = b.tithePending ?? {};
            const rate = this.scene.titheRate ?? 10;
            
            for (const [key, qty] of Object.entries(b.dailyProduction)) {
                if (qty <= 0) continue;
                
                // 1 unit First Fruits + Percentage Tithe
                const tithe = 1 + Math.floor(qty * rate / 100);
                b.tithePending[key] = (b.tithePending[key] ?? 0) + tithe;
            }
            // Reset daily production for the next day
            b.dailyProduction = {};
        }
        this.scene.updateUI();
    }


    // Recompute scene.resources as a derived aggregate of all public building inventories.
    // Call after any mutation to b.inventory so reads stay consistent.
    syncResources() {
        const totals = {};
        for (const b of this.scene.buildings) {
            if (!b.built || b.faction || !b.isPublic) continue;
            for (const [res, qty] of Object.entries(b.inventory ?? {})) {
                if (qty > 0) totals[res] = (totals[res] ?? 0) + qty;
            }
        }
        for (const key of Object.keys(this.scene.resources)) {
            this.scene.resources[key] = totals[key] ?? 0;
        }
        for (const [key, val] of Object.entries(totals)) {
            this.scene.resources[key] = val;
        }
    }

    // Take 'amount' of 'res' from public building inventories, nearest first.
    // Returns how much was actually taken.
    takeFromCommons(res, amount) {
        let remaining = amount;
        for (const b of this.scene.buildings) {
            if (remaining <= 0) break;
            if (!b.built || b.faction || !b.isPublic) continue;
            const avail = b.inventory?.[res] ?? 0;
            const take = Math.min(remaining, avail);
            if (take > 0) {
                b.inventory[res] -= take;
                remaining -= take;
            }
        }
        const taken = amount - remaining;
        if (taken > 0) this.syncResources();
        return taken;
    }

    afford(cost) {
        return Object.entries(cost).every(([r, n]) => (this.scene.resources[r] ?? 0) >= n);
    }

    // Dynamic item value: scarce items worth much more. Formula: base × (1 + 5/max(5,qty))
    getItemValue(key) {
        const base = ITEMS[key]?.basePrice ?? 1;
        const qty  = this.scene.resources[key] ?? 0;
        return base * (1 + 5 / Math.max(5, qty));
    }

    // Items the player has in abundance (good to trade away)
    getSurplus(minQty = 12) {
        const r = this.scene.resources ?? {};
        return Object.entries(r)
            .filter(([, qty]) => qty >= minQty)
            .sort((a, b) => b[1] - a[1]);
    }

    // Items the player is short on (good to acquire)
    getDeficit(maxQty = 6) {
        const r = this.scene.resources ?? {};
        // Only consider items the economy knows about (have been produced at least once)
        return Object.entries(r)
            .filter(([key, qty]) => qty < maxQty && ITEMS[key]?.basePrice)
            .sort((a, b) => a[1] - b[1]);
    }

    // Generate count smart trade offers based on supply/demand.
    // Caravan margin: they want ~25% profit (player gets 80 cents on the dollar).
    generateTradeOffers(count = 3) {
        const MARGIN = 0.80; // player gets 80% fair value
        const surplus = this.getSurplus(10);
        const deficit = this.getDeficit(8);
        const offers  = [];

        for (const [giveKey, giveQty] of surplus) {
            if (offers.length >= count) break;
            if (!ITEMS[giveKey]?.basePrice) continue;

            // Pick the most-needed deficit item to receive
            const wantEntry = deficit.find(([wk]) => wk !== giveKey);
            if (!wantEntry) continue;
            const [wantKey] = wantEntry;

            const giveVal = this.getItemValue(giveKey);
            const wantVal = this.getItemValue(wantKey);

            // How much to give: cap at half surplus
            const giveAmt  = Math.min(Math.floor(giveQty / 2), 20);
            if (giveAmt < 1) continue;
            const receiveAmt = Math.max(1, Math.round((giveAmt * giveVal * MARGIN) / wantVal));

            const giveLabel  = ITEMS[giveKey]?.label  ?? giveKey.split('.').pop();
            const wantLabel  = ITEMS[wantKey]?.label  ?? wantKey.split('.').pop();

            offers.push({
                give:    { [giveKey]: giveAmt },
                receive: { [wantKey]: receiveAmt },
                label:   `${giveAmt}× ${giveLabel} → ${receiveAmt}× ${wantLabel}`,
                valueGiven:    Math.round(giveAmt * giveVal),
                valueReceived: Math.round(receiveAmt * wantVal),
            });
        }

        // Fallback offers if nothing was generated
        if (offers.length === 0) {
            const r = this.scene.resources ?? {};
            if ((r['Materials.Stone.Limestone'] ?? 0) >= 4)
                offers.push({ give: { 'Materials.Stone.Limestone': 4 }, receive: { 'Food.Grain.Wheat': 10 }, label: '4 Stone → 10 Wheat', valueGiven: 0, valueReceived: 0 });
            else
                offers.push({ give: { 'Food.Grain.Wheat': 8 }, receive: { 'Materials.Wood.Pine': 5 }, label: '8 Wheat → 5 Logs', valueGiven: 0, valueReceived: 0 });
        }

        return offers;
    }

    spend(cost) {
        for (const [res, n] of Object.entries(cost)) this.takeFromCommons(res, n);
        this.scene.updateUI();
    }

    getBuildingCurrentVolume(b) {
        let total = 0;
        const inv = b.inventory ?? {};
        for (const [res, qty] of Object.entries(inv)) {
            total += qty * (ITEMS[res]?.volume ?? 0);
        }
        // Also include inbox for workshops
        const inbox = b.inbox ?? {};
        for (const [res, qty] of Object.entries(inbox)) {
            total += qty * (ITEMS[res]?.volume ?? 0);
        }
        return total;
    }

    hasStorageSpace(res, amount = 1, b = null) {
        const vol = (ITEMS[res]?.volume ?? 0) * amount;
        if (b) {
            const maxVol = BLDG_VOLUME[b.type] ?? Infinity;
            return this.getBuildingCurrentVolume(b) + vol <= maxVol;
        }
        // Global/public check: sum of all public building capacities
        let totalFree = 0;
        for (const bl of this.scene.buildings) {
            if (bl.built && bl.isPublic && BLDG_VOLUME[bl.type]) {
                totalFree += Math.max(0, BLDG_VOLUME[bl.type] - this.getBuildingCurrentVolume(bl));
            }
        }
        return totalFree >= vol;
    }

    addResource(res, amount) {
        let remaining = amount;
        const volPer = ITEMS[res]?.volume ?? 0;
        for (const b of this.scene.buildings) {
            if (remaining <= 0) break;
            if (b.built && b.isPublic && BLDG_VOLUME[b.type]) {
                const freeVol = BLDG_VOLUME[b.type] - this.getBuildingCurrentVolume(b);
                const canFit = volPer > 0 ? Math.floor(freeVol / volPer) : remaining;
                const toAdd = Math.min(remaining, canFit);
                if (toAdd > 0) {
                    b.inventory = b.inventory ?? {};
                    b.inventory[res] = (b.inventory[res] ?? 0) + toAdd;
                    remaining -= toAdd;
                }
            }
        }
        const totalAdded = amount - remaining;
        if (totalAdded > 0) { this.syncResources(); this.scene.updateUI(); }
        return totalAdded;
    }

    tick(delta) {
        this.syncResources();
        this.tickProduction(delta);
        this.tickBuildingOperations(delta);
        this.tickResourceNodes(delta);
        this.tickFarmRegrowth(delta);
        this.tickHouseProduction(delta);
        this.tickHouseBirths(delta);
        this._refreshGarrisonBars(delta);
    }

    tickFarmRegrowth(delta) {
        for (const b of this.scene.buildings) {
            if (b.type !== 'farm' || b.stock > 0 || b.needsPlanting) continue;
            b._regrowTimer = (b._regrowTimer ?? 0) + delta;
            if (b._regrowTimer >= 90000) { // 90s day
                b._regrowTimer = 0;
                b.needsPlanting = true;
                this.scene.buildingManager.redrawBuildingBar(b);
            }
        }
    }

    tickResourceNodes(delta) {
        let redraw = false;
        for (const n of this.scene.resNodes) {
            if (!n.sapling) continue;
            n.saplingTimer = (n.saplingTimer ?? 0) + delta;
            const growMs = n.type === 'large_tree' ? 180000 : 120000;
            if (n.saplingTimer >= growMs) {
                n.sapling = false;
                n.stump = false;
                n.saplingTimer = 0;
                n.stock = n.maxStock;
                n.fellWork = undefined;
                redraw = true;
            }
        }
        if (redraw) this.scene.mapManager.drawResourceNodes();
    }

    _refreshGarrisonBars(delta) {
        this._garrisonBarTimer = (this._garrisonBarTimer ?? 0) + delta;
        if (this._garrisonBarTimer < 1000) return;
        this._garrisonBarTimer = 0;
        for (const b of this.scene.buildings) {
            if (b.built && b.type === 'watchtower' && !b.faction)
                this.scene.redrawBuildingBar(b);
        }
    }

    tickProduction(delta) {
        for (const b of this.scene.buildings) {
            if (!b.built || b.faction === 'enemy') continue;
            BUILDINGS[b.type]?.tick?.(b, delta, this.buildCtx(b));
        }
    }

    _workerAt(b, role) {
        const cx = (b.tx + b.size / 2) * TILE, cy = MAP_OY + (b.ty + b.size / 2) * TILE;
        return this.scene.units.find(u =>
            !u.isEnemy && u.hp > 0 && u.role === role && u.taskBldgId === b.id &&
            Phaser.Math.Distance.Between(u.x, u.y, cx, cy) < TILE * 2) ?? null;
    }

    _processOrders(workshop, delta) {
        if (!(workshop.orderQueue?.length)) return;
        const order = workshop.orderQueue[0];
        order.timer = (order.timer ?? 0) + delta;
        if (order.timer < 25000) return;

        const app = APPLIANCE_DEF[order.appId];
        if (!app) { workshop.orderQueue.shift(); return; }

        if (!this.afford(app.costWorkshop)) return;
        this.spend(app.costWorkshop);

        workshop.orderQueue.shift();

        const house = this.scene.buildings.find(h => h.id === order.houseBldgId);
        if (house && (house.applianceItems?.length ?? 0) < (house.applianceSlots ?? 2)) {
            house.applianceItems = house.applianceItems ?? [];
            house.applianceItems.push({ id: order.appId, label: app.label });
            house.pendingOrders = (house.pendingOrders ?? []).filter(o => o.appId !== order.appId);
            this.scene.uiManager.showFloatText(
                (house.tx + 1) * TILE, MAP_OY + house.ty * TILE - 10,
                `📦 ${app.label}`, '#88cc88');
        }
    }

    tickHouseBirths(delta) {
        for (const house of this.scene.buildings) {
            if (!house.built || house.faction || !BLDG[house.type]?.capacity) continue;

            const cap = BLDG[house.type].capacity ?? 6;
            const residents = this.scene.units.filter(u =>
                u.homeBldgId === house.id && !u.isEnemy && u.hp > 0);
            const adults = residents.filter(u => u.age >= 2);

            this._tryMarriage(adults);

            const father = adults.find(u =>
                u.gender === 'male' && u.spouseId && adults.some(f => f.id === u.spouseId));
            const mother = father ? adults.find(u => u.id === father.spouseId) : null;

            if (!father || !mother || residents.length >= cap) {
                house.spawnTimer = 0;
                continue;
            }

            house.spawnTimer = (house.spawnTimer ?? 0) + delta;
            if (house.spawnTimer >= BLDG.house.spawnMs) {
                house.spawnTimer = 0;
                this.scene.unitManager.spawnChild(father, mother);
            }
        }
    }

    _tryMarriage(adults) {
        const single = adults.filter(u => !u.spouseId);
        const male   = single.find(u => u.gender === 'male');
        const female = single.find(u => u.gender === 'female');
        if (!male || !female) return;
        male.spouseId   = female.id;
        female.spouseId = male.id;
        this.scene.uiManager.showFloatText(
            male.x, male.y - 20, '💍 wed', '#ffeeaa');
    }

    tickBuildingOperations(delta) {
        // Training queues handled in UnitManager
    }

    tickHouseProduction(delta) {
        for (const house of this.scene.buildings) {
            if (!house.built || house.faction || house.type !== 'house') continue;
            const apps = house.applianceItems;
            if (!apps?.length) continue;
            const inv = house.inventory ?? (house.inventory = {});

            const hasResident = this.scene.units.some(u =>
                u.homeBldgId === house.id && !u.isEnemy && u.hp > 0 && u.age >= 2);
            if (!hasResident) continue;

            for (const app of apps) {
                switch (app.id) {
                    case 'millstone':
                        house._millTimer = (house._millTimer ?? 0) + delta;
                        if (house._millTimer >= 18000 && (inv['Food.Grain.Wheat'] ?? 0) >= 1) {
                            inv['Food.Grain.Wheat']--;
                            inv['Food.Grain.Wheat.Flour'] = (inv['Food.Grain.Wheat.Flour'] ?? 0) + 2;
                            house._millTimer = 0;
                            this.scene.uiManager.showFloatText(
                                (house.tx + 1) * TILE, MAP_OY + house.ty * TILE - 8,
                                '🌾 ground', '#ddcc88');
                        }
                        break;

                    case 'hearth':
                        house._hearthTimer = (house._hearthTimer ?? 0) + delta;
                        if (house._hearthTimer >= 24000 && (inv['Food.Grain.Wheat.Flour'] ?? 0) >= 2) {
                            inv['Food.Grain.Wheat.Flour'] -= 2;
                            inv['Food.Grain.Wheat.Bread'] = (inv['Food.Grain.Wheat.Bread'] ?? 0) + 1;
                            house._hearthTimer = 0;
                            this.scene.uiManager.showFloatText(
                                (house.tx + 1) * TILE, MAP_OY + house.ty * TILE - 8,
                                '🍞 home bread', '#ffdd88');
                        }
                        break;

                    case 'loom':
                        house._loomTimer = (house._loomTimer ?? 0) + delta;
                        if (house._loomTimer >= 20000 && (inv['Textile.Fiber.Wool'] ?? 0) >= 2) {
                            inv['Textile.Fiber.Wool'] -= 2;
                            house._loomTimer = 0;
                            // Woven cloth goes to public commons
                            this.addResource('Textile.Fiber.Wool', 1);
                            this.scene.uiManager.showFloatText(
                                (house.tx + 1) * TILE, MAP_OY + house.ty * TILE - 8,
                                '🧶 spun', '#eeddcc');
                        }
                        break;

                    case 'workbench':
                        house._benchTimer = (house._benchTimer ?? 0) + delta;
                        if (house._benchTimer >= 30000) {
                            house._benchTimer = 0;
                            const craftsman = this.scene.units.find(u =>
                                u.homeBldgId === house.id && !u.isEnemy && u.hp > 0 && u.age >= 2);
                            if (craftsman) this.scene.unitManager._gainSkillXp(craftsman, 'woodcutting');
                        }
                        break;

                    case 'anvil':
                        house._anvilTimer = (house._anvilTimer ?? 0) + delta;
                        if (house._anvilTimer >= 30000) {
                            house._anvilTimer = 0;
                            const smith = this.scene.units.find(u =>
                                u.homeBldgId === house.id && !u.isEnemy && u.hp > 0 && u.age >= 2);
                            if (smith) this.scene.unitManager._gainSkillXp(smith, 'forge');
                        }
                        break;
                }
            }
        }
    }

    paintRoad(tx, ty) {
        if (this.scene.roadMap[ty]?.[tx] === 2) return;
        if ((this.scene.terrainData[ty]?.[tx] ?? 0) === 4) return;
        const isOccupied = (this.scene.mapData[ty]?.[tx] ?? 0) >= 99;
        if (isOccupied) return;

        const isDesire = this.scene.roadMap[ty]?.[tx] === 1;
        if (!isDesire) {
            if (!this.afford({ 'Materials.Stone.Limestone': 1 })) return;
            this.spend({ 'Materials.Stone.Limestone': 1 });
        }

        this.scene.roadMap[ty][tx] = 2;
        this.scene._roadsDirty = true;
        this.scene.updateUI();
    }
}
