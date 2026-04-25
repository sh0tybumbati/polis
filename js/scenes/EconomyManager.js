import {
    BLDG, TILE, MAP_OY, APPLIANCE_DEF,
    SHEEP_WOOL_MS, SHEEP_TAME_COST,
} from '../config/gameConstants.js';

export default class EconomyManager {
    constructor(scene) {
        this.scene = scene;
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
        const cap = this.scene.storageMax[res] || 0;
        const current = this.scene.resources[res] || 0;
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
        this.tickHouseProduction(delta);
        this.tickHouseBirths(delta);
        this._refreshGarrisonBars(delta);
    }

    tickResourceNodes(delta) {
        let redraw = false;
        for (const n of this.scene.resNodes) {
            if (!n.sapling) continue;
            n.saplingTimer = (n.saplingTimer ?? 0) + delta;
            const growMs = n.type === 'large_tree' ? 180000 : 120000; // 3min / 2min
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

            switch (b.type) {
                case 'farm':
                    this.updateFarm(b, delta);
                    break;
                case 'tannery':
                    this.updateTannery(b, delta);
                    break;
                case 'smelter':
                    this.updateSmelter(b, delta);
                    break;
                case 'blacksmith':
                    this.updateBlacksmith(b, delta);
                    break;
                case 'mill':
                    this.updateMill(b, delta);
                    break;
                case 'bakery':
                    this.updateBakery(b, delta);
                    break;
                case 'butcher':
                    this.updateButcher(b, delta);
                    break;
                case 'olive_press':
                    this.updateOlivePress(b, delta);
                    break;
                case 'garden':
                    this.updateGarden(b, delta);
                    break;
                case 'carpenter':
                    this.updateCarpenter(b, delta);
                    break;
                case 'masons':
                    this.updateMasons(b, delta);
                    break;
                case 'pasture':
                    this.updatePasture(b, delta);
                    break;
                case 'watchtower':
                    this.updateWatchtower(b, delta);
                    break;
            }
        }
    }

    updateFarm(b, delta) {
        if (b.stock > 0) return;
        b.replantTimer = (b.replantTimer ?? 0) + delta;
        if (b.replantTimer >= 45000) { // ~45s fallow period
            b.replantTimer = 0;
            b.stock = b.maxStock ?? 32;
            b.drawnStock = b.stock;
            this.scene.buildingManager.redrawBuilding(b);
            this.scene.uiManager.showFloatText(
                (b.tx + 1) * TILE, MAP_OY + b.ty * TILE - 8, '🌱 ready', '#88cc44');
        }
    }

    updateTannery(b, delta) {
        const tanner = this._workerAt(b, 'tanner');
        if (!tanner) { b.tanTimer = 0; b.kitTimer = 0; return; }
        b.inbox = b.inbox ?? {};
        b.tanTimer = (b.tanTimer ?? 0) + delta;
        if (b.tanTimer >= 8000 && (b.inbox.hide ?? 0) >= 3 && this.hasStorageSpace('leather')) {
            b.inbox.hide -= 3;
            b.tanTimer = 0;
            this.addResource('leather', 1);
            this.scene.unitManager._gainSkillXp(tanner, 'tan');
            this.scene.uiManager.showFloatText((b.tx + 1) * TILE, MAP_OY + b.ty * TILE - 6, '🐾→leather', '#c0884c');
        }
        b.kitTimer = (b.kitTimer ?? 0) + delta;
        if (b.kitTimer >= 12000 && (this.scene.resources.leather ?? 0) >= 4 && (this.scene.resources.leatherKit ?? 0) < 10) {
            this.scene.resources.leather -= 4;
            b.kitTimer = 0;
            this.scene.resources.leatherKit = (this.scene.resources.leatherKit ?? 0) + 1;
            this.scene.updateUI();
        }
    }

    updateSmelter(b, delta) {
        const smelter = this._workerAt(b, 'smelter');
        if (!smelter) { b.smeltTimer = 0; return; }
        b.inbox = b.inbox ?? {};
        b.smeltTimer = (b.smeltTimer ?? 0) + delta;
        if (b.smeltTimer >= 10000 && (b.inbox.ore ?? 0) >= 2 && this.hasStorageSpace('ingot')) {
            b.inbox.ore -= 2;
            b.smeltTimer = 0;
            this.addResource('ingot', 1);
            this.scene.unitManager._gainSkillXp(smelter, 'smelt');
            this.scene.uiManager.showFloatText((b.tx + 1) * TILE, MAP_OY + b.ty * TILE - 6, '⛏→ingot', '#ffaa44');
        }
    }

    updateBlacksmith(b, delta) {
        const smith = this._workerAt(b, 'smith');
        if (!smith) { b.forgeTimer = 0; return; }
        b.inbox = b.inbox ?? {};
        b.forgeTimer = (b.forgeTimer ?? 0) + delta;
        if (b.forgeTimer >= 15000 && (b.inbox.ingot ?? 0) >= 1 && (this.scene.resources.leather ?? 0) >= 1
            && (this.scene.resources.bronzeKit ?? 0) < 10) {
            b.inbox.ingot--;
            this.scene.resources.leather--;
            b.forgeTimer = 0;
            this.scene.resources.bronzeKit = (this.scene.resources.bronzeKit ?? 0) + 1;
            this.scene.unitManager._gainSkillXp(smith, 'forge');
            this.scene.uiManager.showFloatText((b.tx + 1) * TILE, MAP_OY + b.ty * TILE - 6, '⚒ kit', '#ddaa44');
            this.scene.updateUI();
        }
    }

    updateMill(b, delta) {
        const miller = this._workerAt(b, 'miller');
        if (!miller) { b.millTimer = 0; return; }
        b.inbox = b.inbox ?? {};
        b.millTimer = (b.millTimer ?? 0) + delta;
        if (b.millTimer >= 10000 && (b.inbox.wheat ?? 0) >= 1 && this.hasStorageSpace('flour')) {
            b.inbox.wheat -= 1;
            b.millTimer = 0;
            this.addResource('flour', 3);  // 3 to commons
            // In-kind wage: 1 flour to miller's house inventory
            const home = this.scene.buildings.find(h => h.id === miller.homeBldgId && h.built && h.inventory);
            if (home) home.inventory.flour = (home.inventory.flour ?? 0) + 1;
            this.scene.unitManager._gainSkillXp(miller, 'mill');
            this.scene.uiManager.showFloatText(
                (b.tx + 1) * TILE, MAP_OY + b.ty * TILE - 6, '🌾→flour ×4', '#ddcc88');
        }
    }

    // Returns a worker with the given role who is staffing building b, or null
    _workerAt(b, role) {
        const cx = (b.tx + b.size / 2) * TILE, cy = MAP_OY + (b.ty + b.size / 2) * TILE;
        return this.scene.units.find(u =>
            !u.isEnemy && u.hp > 0 && u.role === role && u.taskBldgId === b.id &&
            Phaser.Math.Distance.Between(u.x, u.y, cx, cy) < TILE * 2) ?? null;
    }

    updateBakery(b, delta) {
        const baker = this._workerAt(b, 'baker');
        if (!baker) { b.bakeTimer = 0; return; }
        b.inbox = b.inbox ?? {};
        b.bakeTimer = (b.bakeTimer ?? 0) + delta;
        if (b.bakeTimer >= 12000 && (b.inbox.flour ?? 0) >= 6 && this.hasStorageSpace('bread')) {
            b.inbox.flour -= 6;
            b.bakeTimer = 0;
            this.addResource('bread', 3);  // 3 to commons
            // In-kind wage: 1 bread to baker's house inventory
            const home = this.scene.buildings.find(h => h.id === baker.homeBldgId && h.built && h.inventory);
            if (home) home.inventory.bread = (home.inventory.bread ?? 0) + 1;
            this.scene.unitManager._gainSkillXp(baker, 'bake');
            this.scene.uiManager.showFloatText((b.tx + 1) * TILE, MAP_OY + b.ty * TILE - 6, '🍞 bread ×4', '#ffdd88');
        }
    }

    updateButcher(b, delta) {
        const worker = this._workerAt(b, 'butcher');
        if (!worker) { b.cutsTimer = 0; b.sausageTimer = 0; return; }
        b.inbox = b.inbox ?? {};
        // Stage 1: raw meat → cuts (stays in building inbox as intermediate)
        b.cutsTimer = (b.cutsTimer ?? 0) + delta;
        if (b.cutsTimer >= 8000 && (b.inbox.meat ?? 0) >= 2) {
            b.inbox.meat -= 2;
            b.inbox.cuts = (b.inbox.cuts ?? 0) + 3;
            b.cutsTimer = 0;
            this.scene.unitManager._gainSkillXp(worker, 'butcher');
            this.scene.uiManager.showFloatText((b.tx + 1) * TILE, MAP_OY + b.ty * TILE - 6, '🥩 cuts', '#dd8866');
        }
        // Stage 2: cuts → sausages (output goes to global pool)
        b.sausageTimer = (b.sausageTimer ?? 0) + delta;
        if (b.sausageTimer >= 12000 && (b.inbox.cuts ?? 0) >= 3 && this.hasStorageSpace('sausages')) {
            b.inbox.cuts -= 3;
            b.sausageTimer = 0;
            this.addResource('sausages', 2);
            this.scene.unitManager._gainSkillXp(worker, 'butcher');
            this.scene.uiManager.showFloatText((b.tx + 1) * TILE, MAP_OY + b.ty * TILE - 6, '🌭 sausages', '#ffaa44');
        }
    }

    updateOlivePress(b, delta) {
        // Olive press stores olives — olives are directly edible (0.4 nutrition)
        // Future: press olives → olive oil for cooking bonus
    }

    updatePasture(b, delta) {
        // Clip wool from tamed sheep assigned to this pasture
        const pastured = this.scene.sheep?.filter(s => s.pastureId === b.id && s.isTamed && !s.isDead) ?? [];
        for (const s of pastured) {
            s.woolTimer = (s.woolTimer ?? 0) + delta;
            if (s.woolTimer >= SHEEP_WOOL_MS && s.woolReady !== false) {
                s.woolTimer = 0;
                if (this.hasStorageSpace('wool')) {
                    this.addResource('wool', 1);
                    this.scene.natureManager.redrawSheep(s);
                    this.scene.uiManager.showFloatText(
                        (b.tx + 1) * TILE, MAP_OY + b.ty * TILE - 8, '🧶 wool', '#e8e0c0');
                }
            }
        }
    }

    updateGarden(b, delta) {
        b.growTimer = (b.growTimer ?? 0) + delta;
        if (b.growTimer >= 15000 && this.hasStorageSpace('olives')) {
            b.growTimer = 0;
            this.addResource('olives', 2);
            this.scene.uiManager.showFloatText((b.tx + 1) * TILE, MAP_OY + b.ty * TILE - 8, '🌿 harvest', '#44bb66');
            if (Math.random() < 0.4 && (this.scene.resources.seeds ?? 0) >= 1) {
                this.scene.resources.seeds -= 1;
                this.scene.updateUI();
            }
        }
    }

    updateCarpenter(b, delta) {
        const worker = this._workerAt(b, 'carpenter');
        if (!worker) { b.carpenterTimer = 0; return; }
        b.inbox = b.inbox ?? {};
        b.carpenterTimer = (b.carpenterTimer ?? 0) + delta;
        if (b.carpenterTimer >= 12000 && (b.inbox.wood ?? 0) >= 3 && this.hasStorageSpace('planks')) {
            b.inbox.wood -= 3;
            b.carpenterTimer = 0;
            this.addResource('planks', 4);
            this.scene.unitManager._gainSkillXp(worker, 'woodcutting');
            this.scene.uiManager.showFloatText((b.tx + 1) * TILE, MAP_OY + b.ty * TILE - 6, '🪵 planks', '#c0a050');
        }
        this._processOrders(b, delta);
    }

    updateMasons(b, delta) {
        const worker = this._workerAt(b, 'mason');
        if (!worker) { b.masonsTimer = 0; return; }
        b.inbox = b.inbox ?? {};
        b.masonsTimer = (b.masonsTimer ?? 0) + delta;
        if (b.masonsTimer >= 14000 && (b.inbox.stone ?? 0) >= 1 && this.hasStorageSpace('stoneBlocks')) {
            b.inbox.stone -= 1;
            b.masonsTimer = 0;
            this.addResource('stoneBlocks', 4);
            this.scene.unitManager._gainSkillXp(worker, 'masonry');
            this.scene.uiManager.showFloatText((b.tx + 1) * TILE, MAP_OY + b.ty * TILE - 6, '🪨 blocks', '#aaaaa0');
        }
        this._processOrders(b, delta);
    }

    updateWatchtower(b, delta) {
        const RANGED = new Set(['archer','slinger','toxotes','scout']);
        const garrison = this.scene.units.filter(u =>
            !u.isEnemy && u.hp > 0 && u.taskType === 'garrison' && u.taskBldgId === b.id);
        const rangedGarrison = garrison.filter(u => RANGED.has(u.type));
        if (!garrison.length) return;
        // Only ranged garrison members fire; melee guards only fight in melee

        // Round-robin through ranged garrison only
        b._shooterIdx = ((b._shooterIdx ?? 0) + 1) % rangedGarrison.length;
        const shooter = rangedGarrison[b._shooterIdx];
        const effectiveRange = shooter.range + 2 * TILE;

        if (!rangedGarrison.length) return; // only ranged units shoot from the tower

        const rc = rangedGarrison.length;
        const fireMs = rc >= 2 ? 1800 : 3000;
        b.shotTimer = (b.shotTimer ?? 0) + delta;
        if (b.shotTimer < fireMs) return;

        const cx = (b.tx + 0.5) * TILE, cy = MAP_OY + (b.ty + 0.5) * TILE;
        const target = this.scene.units.find(u =>
            u.isEnemy && u.hp > 0 &&
            Phaser.Math.Distance.Between(u.x, u.y, cx, cy) <= effectiveRange);
        if (!target) return;

        b.shotTimer = 0;

        const hitChance = rc >= 2 ? 0.95 : 0.70;
        if (Math.random() > hitChance) return;

        const dmg = shooter.atk ?? 2;
        target.hp -= dmg;
        this.scene.uiManager.showFloatText(target.x, target.y - 12, `-${dmg}`, '#ffaa44');
        const gfx = this.scene.add.graphics().setDepth(7);
        gfx.lineStyle(1.5, 0xffcc66, 0.9);
        gfx.lineBetween(cx, cy, target.x, target.y);
        this.scene.tweens.add({ targets: gfx, alpha: 0, duration: 250, onComplete: () => gfx.destroy() });
    }

    _processOrders(workshop, delta) {
        if (!(workshop.orderQueue?.length)) return;
        const order = workshop.orderQueue[0];
        order.timer = (order.timer ?? 0) + delta;
        if (order.timer < 25000) return;

        const app = APPLIANCE_DEF[order.appId];
        if (!app) { workshop.orderQueue.shift(); return; }

        // Check and spend workshop materials
        if (!this.afford(app.costWorkshop)) return;
        this.spend(app.costWorkshop);

        workshop.orderQueue.shift();

        // Deliver to house
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

            // Need a married couple, both alive in this house, and space for a child
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

            // Need at least one adult resident home (alive)
            const hasResident = this.scene.units.some(u =>
                u.homeBldgId === house.id && !u.isEnemy && u.hp > 0 && u.age >= 2);
            if (!hasResident) continue;

            for (const app of apps) {
                switch (app.id) {

                    case 'millstone':
                        // Grinds house wheat → house flour (slower than public mill)
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
                        // Bakes house flour → house bread (slower than public bakery)
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
                        // Weaves house wool → public cloth (cloth resource TBD; for now adds food value via trade)
                        house._loomTimer = (house._loomTimer ?? 0) + delta;
                        if (house._loomTimer >= 20000 && (inv.wool ?? 0) >= 2) {
                            inv.wool -= 2;
                            house._loomTimer = 0;
                            // Placeholder: wool woven → deposited to public wool (cleaned/spun)
                            this.addResource('wool', 1);
                            this.scene.uiManager.showFloatText(
                                (house.tx + 1) * TILE, MAP_OY + house.ty * TILE - 8,
                                '🧶 spun', '#eeddcc');
                        }
                        break;

                    case 'workbench':
                        // Passive: resident gains woodcutting XP over time
                        house._benchTimer = (house._benchTimer ?? 0) + delta;
                        if (house._benchTimer >= 30000) {
                            house._benchTimer = 0;
                            const craftsman = this.scene.units.find(u =>
                                u.homeBldgId === house.id && !u.isEnemy && u.hp > 0 && u.age >= 2);
                            if (craftsman) this.scene.unitManager._gainSkillXp(craftsman, 'woodcutting');
                        }
                        break;

                    case 'anvil':
                        // Passive: resident gains forge XP over time
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
        if ((this.scene.terrainData[ty]?.[tx] ?? 0) === 4) return; // T_WATER
        const isOccupied = (this.scene.mapData[ty]?.[tx] ?? 0) >= 99;
        if (isOccupied) return;

        const isDesire = this.scene.roadMap[ty]?.[tx] === 1;
        if (!isDesire) {
            if (!this.afford({ stone: 1 })) return;
            this.spend({ stone: 1 });
        }
        
        this.scene.roadMap[ty][tx] = 2; // ROAD_PAVED
        this.scene._roadsDirty = true;
        this.scene.updateUI();
    }
}
