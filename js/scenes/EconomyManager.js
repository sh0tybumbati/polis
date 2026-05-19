import {
    TILE, MAP_OY, APPLIANCE_DEF, CONSTRUCT_VOLUME,
} from '../config/gameConstants.js';
import { CONSTRUCTS as CONSTRUCTS } from '../content/constructs/index.js';
import { ITEMS } from '../content/items/index.js';

export default class EconomyManager {
    constructor(scene) {
        this.scene = scene;
    }

    _workerAt(construct, role) {
        return this.scene.units.some(u => 
            !u.isEnemy && u.hp > 0 && 
            u.isInside && 
            u.taskConstructId === construct.id && 
            u.role === role
        );
    }

    // Per-construct ctx so addResource writes to b.inventory (not global pool)
    buildCtx(b) {
        const scene = this.scene;
        const mgr   = this;
        return {
            workerAt:       (construct, role)    => mgr._workerAt(construct, role),
            addResource:    (key, qty)      => mgr.depositToConstruct(b, key, qty),
            hasStorageSpace:(key)           => true,  // local construct inventory, always room
            gainXp:         (unit, skill)   => scene.unitManager._gainSkillXp(unit, skill),
            floatText:      (construct, txt, col) => scene.uiManager.showFloatText(
                                                (construct.tx + construct.width / 2) * TILE,
                                                MAP_OY + construct.ty * TILE - 8, txt, col),
            floatTextAt:    (x, y, txt, col) => scene.uiManager.showFloatText(x, y, txt, col),
            redrawConstruct: (construct)          => scene.constructManager.redrawConstruct(construct),
            processOrders:  (construct, delta)   => mgr._processOrders(construct, delta),
            addGraphics:    ()              => scene.add.graphics().setDepth(7),
            tween:          (cfg)           => scene.tweens.add(cfg),
            get resources() { return scene.resources; },
            get constructs() { return scene.constructs; },
            get sheep()     { return scene.sheep; },
            get units()     { return scene.units; },
        };
    }

    // Deposit production output: reserves tithe + 1 unit wage for the active worker
    depositToConstruct(b, key, qty) {
        if (!qty || qty <= 0) return;
        b.inventory    = b.inventory    ?? {};
        b.dailyProduction = b.dailyProduction ?? {};

        // Track daily production
        b.dailyProduction[key] = (b.dailyProduction[key] ?? 0) + qty;

        // Wage: 1 unit to the worker currently processing at this construct
        let keep = qty;
        if (keep >= 2) {
            const worker = this.scene.units.find(u =>
                !u.isEnemy && u.hp > 0 && u.taskConstructId === b.id && u.workshopPhase === 'process');  // TODO: unit map lookup
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

    // Dawn preparation: calculate daily tithe for each construct
    collectFirstFruits() {
        for (const b of this.scene.constructs) {
            if (!b.built || b.faction || !b.dailyProduction) continue;
            
            b.tithePending = b.tithePending ?? {};
            const rate = this.scene.titheRate ?? 10;
            
            for (const [key, qty] of Object.entries(b.dailyProduction)) {
                if (qty <= 0) continue;
                
                // 1 unit First Fruits + Percentage Tithe
                const tithe = 1 + Math.floor(qty * rate / 100);
                b.tithePending[key] = (b.tithePending[key] ?? 0) + tithe;
                this.scene._hasTithePending = true;
            }
            // Reset daily production for the next day
            b.dailyProduction = {};
        }
        this.scene.updateUI();
    }


    // Constructs the player can draw resources from: public commons + archon's private domain.
    _playerConstructs() {
        const archon = this.scene.units?.find(u => u.isArchon);
        const archonHome = archon?.homeConstructId
            ? this.scene.constructs.find(b => b.id === archon.homeConstructId)
            : null;
        const playerDomainId = archonHome?.domainId ?? null;
        return this.scene.constructs.filter(b => {
            if (!b.built || b.faction) return false;
            if (b.isPublic) return true;
            if (playerDomainId && b.domainId === playerDomainId) return true;
            if (!playerDomainId && b.id === archonHome?.id) return true;
            return false;
        });
    }

    // Recompute scene.resources as a derived aggregate of all player-accessible inventories.
    // Call after any mutation to b.inventory so reads stay consistent.
    syncResources() {
        const totals = {};
        for (const b of this._playerConstructs()) {
            for (const [res, qty] of Object.entries(b.inventory ?? {})) {
                if (qty > 0) totals[res] = (totals[res] ?? 0) + qty;
            }
        }
        for (const [, cfg] of this.scene.zoneManager?.storageTiles ?? []) {
            for (const [res, qty] of Object.entries(cfg.inventory ?? {})) {
                if (qty > 0) totals[res] = (totals[res] ?? 0) + qty;
            }
        }
        for (const key of Object.keys(this.scene.resources)) {
            this.scene.resources[key] = totals[key] ?? 0;
        }
        for (const [key, val] of Object.entries(totals)) {
            this.scene.resources[key] = val;
        }
        if (this.scene.zoneManager) this.scene.zoneManager._stockDirty = true;
    }

    // Take 'amount' of 'res' from player-accessible inventories, nearest first.
    // Returns how much was actually taken.
    takeFromCommons(res, amount) {
        let remaining = amount;
        for (const b of this._playerConstructs()) {
            if (remaining <= 0) break;
            const avail = b.inventory?.[res] ?? 0;
            const take = Math.min(remaining, avail);
            if (take > 0) { b.inventory[res] -= take; remaining -= take; }
        }
        for (const [, cfg] of this.scene.zoneManager?.storageTiles ?? []) {
            if (remaining <= 0) break;
            const avail = cfg.inventory?.[res] ?? 0;
            const take = Math.min(remaining, avail);
            if (take > 0) { cfg.inventory[res] -= take; remaining -= take; }
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

    getConstructCurrentVolume(b) {
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
            const maxVol = CONSTRUCT_VOLUME[b.type] ?? Infinity;
            return this.getConstructCurrentVolume(b) + vol <= maxVol;
        }
        // Global/public check: sum of all public construct capacities
        let totalFree = 0;
        for (const bl of this.scene.constructs) {
            if (bl.built && bl.isPublic && CONSTRUCT_VOLUME[bl.type]) {
                totalFree += Math.max(0, CONSTRUCT_VOLUME[bl.type] - this.getConstructCurrentVolume(bl));
            }
        }
        return totalFree >= vol;
    }

    addResource(res, amount) {
        let remaining = amount;
        const volPer = ITEMS[res]?.volume ?? 0;
        for (const b of this.scene.constructs) {
            if (remaining <= 0) break;
            if (b.built && b.isPublic && CONSTRUCT_VOLUME[b.type]) {
                const freeVol = CONSTRUCT_VOLUME[b.type] - this.getConstructCurrentVolume(b);
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
        if (totalAdded > 0) { this.syncResources(); }
        return totalAdded;
    }

    tick(delta) {
        this._syncAcc = (this._syncAcc ?? 0) + delta;
        if (this._syncAcc >= 500) { this._syncAcc = 0; this.syncResources(); }
        this.scene.constructManager.tick(delta);
        this.tickResourceNodes(delta);
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

        const house = this.scene.constructs.find(h => h.id === order.houseConstructId);
        if (house && (house.applianceItems?.length ?? 0) < (house.applianceSlots ?? 2)) {
            house.applianceItems = house.applianceItems ?? [];
            house.applianceItems.push({ id: order.appId, label: app.label });
            house.pendingOrders = (house.pendingOrders ?? []).filter(o => o.appId !== order.appId);
            this.scene.uiManager.showFloatText(
                (house.tx + 1) * TILE, MAP_OY + house.ty * TILE - 10,
                `📦 ${app.label}`, '#88cc88');
        }
    }

    paintRoad(tx, ty) {
        const rkey = `${tx},${ty}`;
        if (this.scene.roadMap.get(rkey) === 2) return;
        const terr = this.scene.chunkManager ? this.scene.chunkManager.getTile(tx, ty) : 0;
        if (terr === 4) return;  // T_WATER
        const isOccupied = (this.scene.mapData.get(rkey) ?? 0) >= 99;
        if (isOccupied) return;

        const isDesire = this.scene.roadMap.get(rkey) === 1;
        if (!isDesire) {
            if (!this.afford({ 'Materials.Stone.Limestone': 1 })) return;
            this.spend({ 'Materials.Stone.Limestone': 1 });
        }

        this.scene.roadMap.set(rkey, 2);
        this.scene._roadsDirty = true;
        this.scene.updateUI();
    }
}
