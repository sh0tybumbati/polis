import {
    BLDG, TILE, MAP_OY, APPLIANCE_DEF,
} from '../config/gameConstants.js';
import { BUILDINGS } from '../content/buildings/index.js';

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
        b.tithePending = b.tithePending ?? {};
        b.wagePending  = b.wagePending  ?? {};

        const rate  = this.scene.titheRate ?? 10;
        const tithe = Math.floor(qty * rate / 100);
        let   keep  = qty - tithe;

        if (tithe > 0) b.tithePending[key] = (b.tithePending[key] ?? 0) + tithe;

        // Production wage: 1 unit to the worker currently processing at this building
        if (keep >= 2) {
            const worker = this.scene.units.find(u =>
                !u.isEnemy && u.hp > 0 && u.taskBldgId === b.id && u.workshopPhase === 'process');
            if (worker) {
                b.wagePending[worker.id] = b.wagePending[worker.id] ?? {};
                b.wagePending[worker.id][key] = (b.wagePending[worker.id][key] ?? 0) + 1;
                keep -= 1;
            }
        }

        if (keep > 0) b.inventory[key] = (b.inventory[key] ?? 0) + keep;
        this.scene.updateUI();
    }

    // Dawn collection: move all tithePending → public commons (scene.resources)
    collectFirstFruits() {
        const collected = {};
        for (const b of this.scene.buildings) {
            if (!b.built || b.faction || !b.tithePending) continue;
            for (const [key, qty] of Object.entries(b.tithePending)) {
                if ((qty ?? 0) <= 0) continue;
                this.scene.resources[key] = (this.scene.resources[key] ?? 0) + qty;
                collected[key] = (collected[key] ?? 0) + qty;
                b.tithePending[key] = 0;
            }
        }
        const parts = Object.entries(collected)
            .filter(([, v]) => v > 0)
            .map(([k, v]) => `${v} ${k.slice(0, 4)}`);
        if (parts.length) {
            this.scene.uiManager.showFloatText(
                this.scene.scale.width / 2, 80,
                `🌿 First fruits: ${parts.join(' ')}`, '#ffdd88');
        }
        this.scene.updateUI();
    }

    afford(cost) {
        return Object.entries(cost).every(([r, n]) => (this.scene.resources[r] ?? 0) >= n);
    }

    spend(cost) {
        Object.entries(cost).forEach(([r, n]) => {
            this.scene.resources[r] -= n;
        });
        this.scene.updateUI();
    }

    hasStorageSpace(res) {
        return (this.scene.resources[res] || 0) < (this.scene.storageMax[res] || 0);
    }

    addResource(res, amount) {
        const cap     = this.scene.storageMax[res] || 0;
        const current = this.scene.resources[res]  || 0;
        const canTake = Math.min(amount, cap - current);
        if (canTake > 0) {
            this.scene.resources[res] += canTake;
            this.scene.updateUI();
        }
        return canTake;
    }

    tick(delta) {
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
                        if (house._millTimer >= 18000 && (inv.wheat ?? 0) >= 1) {
                            inv.wheat--;
                            inv.flour = (inv.flour ?? 0) + 2;
                            house._millTimer = 0;
                            this.scene.uiManager.showFloatText(
                                (house.tx + 1) * TILE, MAP_OY + house.ty * TILE - 8,
                                '🌾 ground', '#ddcc88');
                        }
                        break;

                    case 'hearth':
                        house._hearthTimer = (house._hearthTimer ?? 0) + delta;
                        if (house._hearthTimer >= 24000 && (inv.flour ?? 0) >= 2) {
                            inv.flour -= 2;
                            inv.bread = (inv.bread ?? 0) + 1;
                            house._hearthTimer = 0;
                            this.scene.uiManager.showFloatText(
                                (house.tx + 1) * TILE, MAP_OY + house.ty * TILE - 8,
                                '🍞 home bread', '#ffdd88');
                        }
                        break;

                    case 'loom':
                        house._loomTimer = (house._loomTimer ?? 0) + delta;
                        if (house._loomTimer >= 20000 && (inv.wool ?? 0) >= 2) {
                            inv.wool -= 2;
                            house._loomTimer = 0;
                            // Woven cloth goes to public commons
                            this.addResource('wool', 1);
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
            if (!this.afford({ stone: 1 })) return;
            this.spend({ stone: 1 });
        }

        this.scene.roadMap[ty][tx] = 2;
        this.scene._roadsDirty = true;
        this.scene.updateUI();
    }
}
