import {
    BLDG, BUILD_WORK, TILE, MAP_OY, computeBuildCost
} from '../config/gameConstants.js';
import { BUILDINGS } from '../content/buildings/index.js';

export default class BuildingManager {
    constructor(scene) {
        this.scene = scene;
    }

    isFree(tx, ty, size) {
        for (let y = ty; y < ty + size; y++) {
            for (let x = tx; x < tx + size; x++) {
                if (x < 0 || x >= this.scene.mapData[0].length || y < 0 || y >= this.scene.mapData.length) return false;
                if (this.scene.mapData[y][x] !== 0) return false;
                if (this.scene.terrainData[y][x] === 4) return false; // T_WATER
            }
        }
        return true;
    }

    occupy(tx, ty, size, val) {
        for (let y = ty; y < ty + size; y++) {
            for (let x = tx; x < tx + size; x++) {
                if (this.scene.mapData[y] && this.scene.mapData[y][x] !== undefined)
                    this.scene.mapData[y][x] = val;
            }
        }
    }

    makeBldgObj(type, tx, ty, built) {
        const def  = BLDG[type];
        const work = BUILD_WORK[type] || 1;
        const isHouse = (type === 'house');
        const maxHp = work * 3;
        return {
            id: this.scene.getId(), type, tx, ty, size: def.size,
            built, buildWork: built ? 0 : work, maxBuildWork: work,
            hp: built ? maxHp : 0, maxHp,
            stock: built && def.stockMax ? def.stockMax : 0, maxStock: def.stockMax || 0,
            replantTimer: 0, trainQueue: [], spawnTimer: 0, respawnQueue: [], resNeeded: {}, drawnStock: -1,
            isOpen: type === 'gate' ? true : undefined,
            domainId: null,
            isPublic: false,
            inbox: {},
            applianceSlots: isHouse ? 2 : 0,
            applianceItems: [],
            inventory: {},
            tithePending: {}, wagePending: {},
            gfx: null, barGfx: null, labelObj: null,
        };
    }

    placeBuilding(tx, ty) {
        const def = BLDG[this.scene.bldgType];
        if (!this.isFree(tx, ty, def.size)) return;
        const isWallType = ['wall','palisade','gate','watchtower'].includes(this.scene.bldgType);
        this.occupy(tx, ty, def.size, isWallType ? 98 : 99);
        const b = this.makeBldgObj(this.scene.bldgType, tx, ty, false);
        const cost = computeBuildCost(this.scene.bldgType, this.scene.bldgMaterial ?? 'wood');
        if (Object.keys(cost).length) b.resNeeded = { ...cost };
        this.scene.buildings.push(b);
        if (this.scene.bldgType === 'house') this.assignDomain(b);
        this.redrawBuilding(b);
        this.scene.bldgType = null;
        if (this.scene.hoverGfx) this.scene.hoverGfx.clear();
        this.updateStorageCap();
        
        const canAfford = !Object.keys(cost).length || this.scene.economyManager.afford(cost);
        const msg = canAfford ? 'Workers will build!' : 'Plan placed — gather resources!';
        const col = canAfford ? '#88ee88' : '#ffaa44';
        this.scene.uiManager.showFloatText((tx + def.size/2) * TILE, MAP_OY + ty * TILE - 6, msg, col);
    }

    placeBuiltBuilding(type, tx, ty) {
        const size = BLDG[type].size;
        this.occupy(tx, ty, size, ['wall','palisade','gate','watchtower'].includes(type) ? 98 : 99);
        const b = this.makeBldgObj(type, tx, ty, true);
        this.scene.buildings.push(b);
        if (type === 'house') this.assignDomain(b);
        this.redrawBuilding(b);
        return b;
    }

    assignDomain(house) {
        const pad = 3;
        const dom = {
            id: this.scene.getId(),
            houseBldgId: house.id,
            x1: house.tx - pad,
            y1: house.ty - pad,
            x2: house.tx + house.size - 1 + pad,
            y2: house.ty + house.size - 1 + pad,
        };
        this.scene.domains.push(dom);
        house.domainId = dom.id;
        return dom;
    }

    getDomainAt(tx, ty) {
        return this.scene.domains.find(d => tx >= d.x1 && tx <= d.x2 && ty >= d.y1 && ty <= d.y2);
    }

    completeBuildingConstruction(bldg) {
        bldg.built = true;
        bldg.hp = bldg.maxHp;
        if (bldg.type === 'farm') bldg.stock = bldg.maxStock;
        this.redrawBuilding(bldg);
        this.updateStorageCap();
        this.scene.uiManager.showFloatText((bldg.tx + bldg.size/2) * TILE, MAP_OY + bldg.ty * TILE - 8,
            `${BLDG[bldg.type].label} complete!`, '#44ee88');
        if (BLDG[bldg.type].capacity) this.scene.time.delayedCall(500, () => this.scene.attractAdults());
    }

    updateStorageCap() {
        // Seed with every key that exists in resources so existing stock isn't clamped to 0
        const max = {};
        for (const r in this.scene.resources) max[r] = 0;
        for (const b of this.scene.buildings) {
            if (b.faction === 'enemy' || !b.built) continue;
            const s = BLDG[b.type]?.stores;
            if (!s) continue;
            for (const [r, n] of Object.entries(s)) max[r] = (max[r] || 0) + n;
        }
        this.scene.storageMax = max;
        for (const r in this.scene.resources) {
            this.scene.resources[r] = Math.min(this.scene.resources[r] || 0, max[r] || 0);
        }
        this.scene.updateUI();
    }

    findBuildingAt(wx, wy) {
        return this.scene.buildings.find(b => {
            const bx1 = b.tx * TILE, by1 = MAP_OY + b.ty * TILE;
            return wx >= bx1 && wx < bx1 + b.size * TILE
                && wy >= by1 && wy < by1 + b.size * TILE;
        });
    }

    orderWorkersToBuilding(bldg) {
        const sel = this.scene.units.filter(u => u.selected && !u.isEnemy && u.hp > 0 && u.age >= 2);
        if (!sel.length) return false;
        let handled = false;
        for (const u of sel) {
            // Garrison: split ranged/melee slots
            if (bldg.built && (BLDG[bldg.type]?.garrisonRanged != null || BLDG[bldg.type]?.garrisonMelee != null)) {
                const RANGED = new Set(['archer','slinger','toxotes','scout']);
                const capR = BLDG[bldg.type].garrisonRanged ?? 0;
                const capM = BLDG[bldg.type].garrisonMelee ?? 0;
                const inTower = this.scene.units.filter(w => w.taskType === 'garrison' && w.taskBldgId === bldg.id && w.hp > 0);
                const curR = inTower.filter(w => RANGED.has(w.type)).length;
                const curM = inTower.filter(w => !RANGED.has(w.type)).length;
                const isRanged = RANGED.has(u.type);
                if ((isRanged && curR < capR) || (!isRanged && curM < capM)) {
                    u.role = null; u.taskType = 'garrison'; u.taskBldgId = bldg.id;
                    u.moveTo = null; u.targetNode = null; u.isRouting = false;
                    handled = true;
                }
                continue;
            }
            if (u.type !== 'worker') continue; // non-garrison buildings only accept workers
            if (!bldg.built) {
                u.role = 'builder'; u.taskType = 'build'; u.taskBldgId = bldg.id;
            } else if (bldg.type === 'farm') {
                u.role = 'farmer'; u.taskType = 'harvest_farm'; u.taskBldgId = bldg.id;
            } else if (bldg.built && bldg.hp < bldg.maxHp) {
                u.role = 'builder'; u.taskType = 'repair'; u.taskBldgId = bldg.id;
            }
            u.moveTo = null; u.targetNode = null;
            handled = true;
        }
        return handled;
    }

    demolishBuilding(bldg, refundFraction = 0.5) {
        if (bldg.type === 'townhall') {
            this.scene.uiManager.showFloatText(
                (bldg.tx + 1) * TILE, MAP_OY + bldg.ty * TILE - 10,
                'Cannot demolish Town Hall', '#cc4422');
            return;
        }
        if (bldg.resNeeded) {
            const cost = BLDG[bldg.type].cost || {};
            for (const [r, n] of Object.entries(cost)) {
                const spent = n - (bldg.resNeeded[r] || 0);
                if (spent > 0) {
                    const refund = Math.floor(spent * refundFraction);
                    this.scene.economyManager.addResource(r, refund);
                }
            }
        }
        this.occupy(bldg.tx, bldg.ty, bldg.size, 0);
        this.scene.buildings = this.scene.buildings.filter(b => b.id !== bldg.id);
        bldg.gfx?.destroy();
        bldg.barGfx?.destroy();
        bldg.labelObj?.destroy();
        if (this.scene.selectedBuilding === bldg) this.scene.selectedBuilding = null;
        this.updateStorageCap();
        this.scene.updateUI();
    }

    redrawBuilding(bldg) {
        bldg.gfx?.destroy(); bldg.barGfx?.destroy(); bldg.labelObj?.destroy();
        bldg.gfx = null; bldg.barGfx = null; bldg.labelObj = null;
        const px = bldg.tx * TILE, py = MAP_OY + bldg.ty * TILE, s = bldg.size * TILE;
        bldg.gfx = this.scene._w(this.scene.add.graphics().setDepth(3));
        if (bldg.built) {
            this.drawBuilding(bldg.gfx, bldg);
            if (bldg.faction === 'enemy') {
                bldg.gfx.fillStyle(0xcc2211, 0.28).fillRect(px, py, s, s);
                bldg.gfx.lineStyle(2, 0xee3322, 0.55).strokeRect(px+1, py+1, s-2, s-2);
            }
        } else {
            const def = BLDG[bldg.type];
            bldg.gfx.fillStyle(def.color, 0.2).fillRect(px+2, py+2, s-4, s-4);
            bldg.gfx.lineStyle(2, 0xffdd44, 0.7).strokeRect(px+2, py+2, s-4, s-4);
            bldg.gfx.lineStyle(1, 0xffdd44, 0.3)
                .lineBetween(px+2, py+2, px+s-2, py+s-2)
                .lineBetween(px+s-2, py+2, px+2, py+s-2);
            bldg.labelObj = this.scene._w(this.scene.add.text(px+s/2, py+s/2-4, '⚒', {
                fontSize: '14px', color: '#ffdd44', fontFamily: 'monospace',
            }).setOrigin(0.5).setDepth(4));
        }
        bldg.barGfx = this.scene._w(this.scene.add.graphics().setDepth(4));
        this.redrawBuildingBar(bldg);
    }

    drawBuilding(gfx, bldg) {
        BUILDINGS[bldg.type]?.draw?.(gfx, bldg, this.scene);
    }

    _drawBuildingLegacy(gfx, bldg) {
        const { type, tx, ty, size } = bldg;
        const px = tx * TILE, py = MAP_OY + ty * TILE, s = size * TILE;
        const cx = px + s/2, cy = py + s/2;

        if (type === 'house') {
            gfx.fillStyle(0xd4a054).fillRect(px+4, py+20, s-8, s-22);
            gfx.fillStyle(0xaa4422).fillTriangle(px+2, py+20, px+s-2, py+20, cx, py+4);
            gfx.lineStyle(1, 0x7a2810, 0.8).strokeTriangle(px+2, py+20, px+s-2, py+20, cx, py+4);
            gfx.fillStyle(0x5a2a10).fillRect(cx-6, py+s-24, 12, 21);
            gfx.fillStyle(0x8a5030, 0.4).fillRect(cx-5, py+s-23, 5, 20);
            gfx.fillStyle(0xffeaa0, 0.85).fillRect(px+10, py+26, 11, 10);
            gfx.fillStyle(0xffeaa0, 0.85).fillRect(px+s-21, py+26, 11, 10);
            gfx.lineStyle(1, 0x9a6430, 0.5)
                .lineBetween(px+15, py+26, px+15, py+36).lineBetween(px+10, py+31, px+21, py+31)
                .lineBetween(px+s-16, py+26, px+s-16, py+36).lineBetween(px+s-21, py+31, px+s-10, py+31);
            gfx.lineStyle(1, 0x8a6030, 0.35).strokeRect(px+4, py+20, s-8, s-22);
        } else if (type === 'farm') {
            const ratio = bldg.maxStock > 0 ? Math.max(0, bldg.stock / bldg.maxStock) : 0;
            const lush = ratio > 0.6, mid = ratio > 0.25;
            gfx.fillStyle(lush ? 0x7a5c28 : mid ? 0x8a6630 : 0x6a4818).fillRect(px+3, py+3, s-6, s-10);
            const rowCount = Math.round(ratio * 5);
            for (let row = 0; row < 5; row++) {
                const ry = py + 6 + row * 10;
                if (row < rowCount) {
                    const clr = lush ? (row % 2 === 0 ? 0x4aaa22 : 0x338818) :
                                mid  ? (row % 2 === 0 ? 0x8a9a30 : 0x7a8a20) :
                                       (row % 2 === 0 ? 0xaa8822 : 0x997718);
                    gfx.fillStyle(clr).fillRect(px+6, ry, s-12, 6);
                    if (lush) {
                        for (let col = 0; col < 4; col++)
                            gfx.fillStyle(0x66cc33).fillTriangle(px+9+col*13, ry, px+12+col*13, ry-5, px+15+col*13, ry);
                    } else if (mid) {
                        for (let col = 0; col < 4; col++)
                            gfx.fillStyle(0xaacc44, 0.7).fillTriangle(px+9+col*13, ry, px+12+col*13, ry-4, px+15+col*13, ry);
                    }
                } else {
                    gfx.fillStyle(0x5a3c18, 0.6).fillRect(px+6, ry, s-12, 6);
                }
            }
            if (ratio === 0) {
                gfx.fillStyle(0xaa8844, 0.5).fillRect(px+8, py+10, s-16, s-18);
                gfx.lineStyle(1, 0x7a5c28, 0.4).strokeRect(px+8, py+10, s-16, s-18);
            }
            gfx.lineStyle(2, 0xaa7733, 0.9).strokeRect(px+3, py+3, s-6, s-10);
            gfx.fillStyle(0xaa7733)
                .fillRect(px+2, py+2, 4, 10).fillRect(px+s-6, py+2, 4, 10)
                .fillRect(px+2, py+s-16, 4, 8).fillRect(px+s-6, py+s-16, 4, 8);
        } else if (type === 'barracks') {
            gfx.fillStyle(0x9a8060).fillRect(px+4, py+20, s-8, s-22);
            gfx.fillStyle(0xb8996c).fillTriangle(px+4, py+20, px+s-4, py+20, cx, py+6);
            gfx.lineStyle(1, 0x7a5838, 0.7).strokeTriangle(px+4, py+20, px+s-4, py+20, cx, py+6);
            gfx.fillStyle(0xdac898).fillRect(px+10, py+22, 9, s-26).fillRect(px+s-19, py+22, 9, s-26);
            gfx.fillStyle(0xa08860, 0.45).fillRect(px+17, py+22, 3, s-26).fillRect(px+s-12, py+22, 3, s-26);
            gfx.fillStyle(0xeedd99).fillRect(px+8, py+20, 13, 4).fillRect(px+s-21, py+20, 13, 4);
            gfx.fillStyle(0x3a2010).fillRect(cx-8, py+s-26, 16, 23);
            gfx.fillStyle(0x5a3820, 0.5).fillRect(cx-7, py+s-25, 7, 22);
            gfx.lineStyle(2, 0x999988, 0.7).lineBetween(cx-5, py+28, cx-5, py+s-30).lineBetween(cx+5, py+28, cx+5, py+s-30);
            gfx.fillStyle(0xbbaa66).fillTriangle(cx-5, py+27, cx-3, py+32, cx-7, py+32).fillTriangle(cx+5, py+27, cx+7, py+32, cx+3, py+32);
        } else if (type === 'archery') {
            gfx.fillStyle(0x1e5c30).fillRect(px+3, py+3, s-6, s-10);
            gfx.fillStyle(0x4a7a3a).fillRect(px+6, py+s-18, s-12, 8);
            gfx.fillStyle(0x6a4422).fillRect(cx-2, py+30, 4, 24);
            gfx.fillStyle(0x5a3818).fillRect(cx-10, py+52, 20, 4);
            gfx.fillStyle(0xcc3322).fillCircle(cx, py+22, 17);
            gfx.fillStyle(0xffffff).fillCircle(cx, py+22, 12);
            gfx.fillStyle(0xcc3322).fillCircle(cx, py+22, 7);
            gfx.fillStyle(0xffd700).fillCircle(cx, py+22, 3);
            gfx.lineStyle(1, 0x8a5a20, 0.9).lineBetween(cx+5, py+8, cx+5, py+28).lineBetween(cx-7, py+10, cx-7, py+26);
            gfx.fillStyle(0x666644).fillTriangle(cx+5, py+7, cx+3, py+12, cx+7, py+12).fillTriangle(cx-7, py+9, cx-9, py+14, cx-5, py+14);
        } else if (type === 'townhall') {
            const marble = 0xf0ece0, stone = 0xc4bca0, shadow = 0xa8a080, terra = 0xcc5533, azure = 0x224488;
            gfx.fillStyle(shadow).fillRect(px, py+62, s, 2);
            gfx.fillStyle(marble).fillRect(px+2, py+58, s-4, 4);
            gfx.fillStyle(marble).fillRect(px+5, py+54, s-10, 4);
            gfx.fillStyle(marble).fillRect(px+7, py+50, s-14, 4);
            for (let i = 0; i < 6; i++) {
                const cx_ = px + 3 + i * 11;
                gfx.fillStyle(marble).fillRect(cx_, py+22, 5, 29);
                gfx.fillStyle(shadow, 0.45).fillRect(cx_+3, py+22, 2, 29);
                gfx.fillStyle(marble).fillRect(cx_-2, py+17, 9, 6);
                gfx.fillStyle(marble).fillRect(cx_-1, py+50, 7, 2);
            }
            gfx.fillStyle(marble).fillRect(px+2, py+12, s-4, 11);
            gfx.fillStyle(azure, 0.55).fillRect(px+3, py+14, s-6, 5);
            gfx.fillStyle(shadow).fillRect(px+2, py+22, s-4, 1);
            gfx.fillStyle(marble).fillTriangle(px+2, py+12, px+s-2, py+12, cx, py+2);
            gfx.fillStyle(terra, 0.4).fillTriangle(px+7, py+12, px+s-7, py+12, cx, py+5);
            gfx.lineStyle(1, stone, 0.9).strokeTriangle(px+2, py+12, px+s-2, py+12, cx, py+2);
            gfx.fillStyle(terra).fillTriangle(cx-4, py+4, cx+4, py+4, cx, py);
            gfx.fillStyle(terra).fillTriangle(px+2, py+11, px+8, py+11, px+5, py+7);
            gfx.fillStyle(terra).fillTriangle(px+s-8, py+11, px+s-2, py+11, px+s-5, py+7);
            gfx.fillStyle(0x140e06, 0.55).fillRect(px+8, py+22, s-16, 29);
            gfx.fillStyle(0x221408).fillRect(cx-7, py+34, 14, 17);
            gfx.fillStyle(0x4a2c12, 0.45).fillRect(cx-6, py+35, 6, 16);
        } else if (type === 'granary') {
            gfx.fillStyle(0xd4a830).fillEllipse(cx, cy+4, s-8, s-12);
            gfx.fillStyle(0x8a5820).fillEllipse(cx, py+14, s-10, 22);
            gfx.fillStyle(0xaa7030, 0.6).fillEllipse(cx, py+10, s-18, 14);
            gfx.fillStyle(0x4a2808).fillRect(cx-7, py+s-22, 14, 20);
            gfx.fillStyle(0xcc9930, 0.4).fillEllipse(cx-10, cy+8, 16, 20).fillEllipse(cx+10, cy+8, 16, 20).fillEllipse(cx, cy+2, 16, 20);
            gfx.lineStyle(1, 0x7a5010, 0.5).strokeEllipse(cx, cy+4, s-8, s-12);
        } else if (type === 'woodshed') {
            gfx.fillStyle(0x7a4c20).fillRect(px+3, py+18, s-6, s-20);
            gfx.fillStyle(0x5a3410).fillTriangle(px+2, py+18, px+s-2, py+18, px+s-2, py+6);
            gfx.fillStyle(0x6a3e18, 0.6).fillTriangle(px+2, py+18, px+s/2, py+10, px+s-2, py+6);
            gfx.lineStyle(1, 0x5a3010, 0.45);
            for (let i = 1; i < 4; i++) gfx.lineBetween(px+3, py+18+i*((s-20)/4), px+s-3, py+18+i*((s-20)/4));
            gfx.fillStyle(0x6a3a10).fillEllipse(cx-12, py+s-14, 22, 12).fillEllipse(cx+2, py+s-14, 22, 12).fillEllipse(cx-5, py+s-20, 22, 12);
            gfx.fillStyle(0x4a2208).fillEllipse(px+8, py+s-14, 8, 12).fillEllipse(px+s-8, py+s-14, 8, 12);
        } else if (type === 'stonepile') {
            gfx.fillStyle(0x444438, 0.3).fillEllipse(cx+2, cy+14, s-6, 18);
            gfx.fillStyle(0x888878).fillEllipse(cx-10, cy+4, 34, 26);
            gfx.fillStyle(0x9a9a88).fillEllipse(cx+12, cy+6, 28, 22);
            gfx.fillStyle(0x777768).fillEllipse(cx-2, cy-6, 30, 22);
            gfx.fillStyle(0xaaaaA0).fillEllipse(cx+2, cy-8, 20, 15);
            gfx.lineStyle(1, 0x555548, 0.5).lineBetween(cx-8, cy+2, cx-4, cy+10).lineBetween(cx+10, cy+4, cx+14, cy+12);
        } else if (type === 'tannery') {
            gfx.fillStyle(0x7a4422).fillRect(px+4, py+6, s-8, s-10);
            gfx.lineStyle(2, 0x5a3010, 0.9).lineBetween(px+8, py+8, px+8, py+s-6).lineBetween(px+s-8, py+8, px+s-8, py+s-6).lineBetween(px+8, py+14, px+s-8, py+14).lineBetween(px+8, py+s-12, px+s-8, py+s-12);
            gfx.fillStyle(0xcc9966, 0.6).fillRect(px+10, py+15, s-20, s-30);
        } else if (type === 'mine') {
            gfx.fillStyle(0x444433).fillRect(px+2, py+4, s-4, s-6);
            gfx.fillStyle(0x222211).fillRect(px+s/2-10, py+s/2-6, 20, s/2+2);
            gfx.lineStyle(3, 0x7a5830, 0.9).lineBetween(px+s/2-10, py+s/2-6, px+s/2-10, py+s-4).lineBetween(px+s/2+10, py+s/2-6, px+s/2+10, py+s-4).lineBetween(px+s/2-10, py+s/2-6, px+s/2+10, py+s/2-6);
            gfx.fillStyle(0x446644, 0.7).fillRect(px+s/2-5, py+s*0.7, 10, 6);
        } else if (type === 'smelter') {
            gfx.fillStyle(0x885533).fillRect(px+4, py+8, s-8, s-10);
            gfx.fillStyle(0x444433).fillRect(px+s/2-8, py+4, 16, 12);
            gfx.fillStyle(0xff6600, 0.5).fillRect(px+s/2-6, py+s/2, 12, 10);
            gfx.fillStyle(0xffaa00, 0.4).fillRect(px+s/2-4, py+s/2-2, 8, 8);
            gfx.lineStyle(2, 0x554422, 0.8).strokeRect(px+4, py+8, s-8, s-10);
        } else if (type === 'blacksmith') {
            gfx.fillStyle(0x443344).fillRect(px+4, py+6, s-8, s-10);
            gfx.fillStyle(0x888899).fillRect(px+s/2-10, py+s/2-2, 20, 8);
            gfx.fillStyle(0x777788).fillRect(px+s/2-6, py+s/2+6, 12, 4);
            gfx.fillStyle(0x999aaa).fillRect(px+s/2-12, py+s/2-4, 5, 4);
            gfx.fillStyle(0xaa8844, 0.8).fillRect(px+s/2+6, py+s/2-8, 4, 10);
            gfx.fillStyle(0x888877, 0.9).fillRect(px+s/2+4, py+s/2-10, 8, 5);
        } else if (type === 'mill') {
            gfx.fillStyle(0x998866).fillRect(px+4, py+6, s-8, s-10);
            gfx.lineStyle(2, 0x665533, 0.8).strokeRect(px+4, py+6, s-8, s-10);
            gfx.fillStyle(0xccbbaa).fillCircle(cx, cy-4, s*0.28);
            gfx.fillStyle(0x998877).fillCircle(cx, cy-4, s*0.10);
            gfx.lineStyle(1, 0x776655, 0.7).lineBetween(cx-s*0.28, cy-4, cx+s*0.28, cy-4).lineBetween(cx, cy-4-s*0.28, cx, cy-4+s*0.28);
            gfx.fillStyle(0x7a6644).fillRect(cx-8, cy+6, 16, 10);
        } else if (type === 'bakery') {
            gfx.fillStyle(0xcc9944).fillRect(px+4, py+6, s-8, s-10);
            gfx.lineStyle(2, 0x996622, 0.8).strokeRect(px+4, py+6, s-8, s-10);
            gfx.fillStyle(0x332211).fillRect(cx-10, cy, 20, 14);
            gfx.fillStyle(0x664422, 0.9).fillRect(cx-8, cy+2, 16, 10);
            gfx.fillStyle(0xff9900, 0.4).fillRect(cx-6, cy+6, 12, 6);
            gfx.fillStyle(0x886644).fillRect(cx+4, py+2, 8, 8);
        } else if (type === 'butcher') {
            gfx.fillStyle(0xddccbb).fillRect(px+4, py+6, s-8, s-10);
            gfx.lineStyle(2, 0xaa4433, 0.9).strokeRect(px+4, py+6, s-8, s-10);
            gfx.lineStyle(2, 0x885533, 0.9).lineBetween(px+10, py+8, px+10, py+s-10).lineBetween(cx, py+8, cx, py+s-10).lineBetween(px+s-10, py+8, px+s-10, py+s-10);
            gfx.fillStyle(0xaa3322, 0.7).fillRect(px+7, py+s/2-6, 6, 14);
            gfx.fillStyle(0xaa3322, 0.7).fillRect(cx-3, py+s/2-4, 6, 12);
            gfx.fillStyle(0xaa3322, 0.7).fillRect(px+s-13, py+s/2-6, 6, 14);
            gfx.fillStyle(0x8a6644).fillRect(cx-12, py+s-18, 24, 10);
        } else if (type === 'pasture') {
            gfx.fillStyle(0x5a9a38).fillRect(px+4, py+4, s-8, s-8);
            gfx.lineStyle(3, 0x8a5820, 0.9).lineBetween(px+2, py+s*0.3, px+s-2, py+s*0.3).lineBetween(px+2, py+s*0.65, px+s-2, py+s*0.65);
            for (let i = 0; i <= 4; i++) {
                const fx = px + 2 + i * (s-4) / 4;
                gfx.fillStyle(0x7a4818).fillRect(fx-3, py+2, 6, s-4);
            }
            gfx.fillStyle(0x5a9a38).fillRect(cx-10, py+s-6, 20, 8);
            gfx.fillStyle(0xf0ece0, 0.55).fillCircle(cx-14, cy-6, 7).fillCircle(cx+14, cy+6, 7).fillCircle(cx, cy-4, 7);
        } else if (type === 'palisade') {
            gfx.fillStyle(0x7a5030).fillRect(px+2, py+4, s-4, s-8);
            gfx.lineStyle(2, 0x5a3818, 0.9).lineBetween(px+s*0.25, py+2, px+s*0.25, py+s-2).lineBetween(px+s*0.5, py+2, px+s*0.5, py+s-2).lineBetween(px+s*0.75, py+2, px+s*0.75, py+s-2);
            gfx.fillStyle(0x9a7040).fillTriangle(px+s*0.25-4, py+4, px+s*0.25+4, py+4, px+s*0.25, py).fillTriangle(px+s*0.5-4, py+4, px+s*0.5+4, py+4, px+s*0.5, py).fillTriangle(px+s*0.75-4, py+4, px+s*0.75+4, py+4, px+s*0.75, py);
        } else if (type === 'watchtower') {
            gfx.fillStyle(0x7a7060).fillRect(px+4, py+8, s-8, s-10);
            gfx.fillStyle(0x9a9080).fillRect(px+2, py+4, s-4, 6);
            gfx.lineStyle(1, 0x555544, 0.8).lineBetween(px+s*0.5, py+10, px+s*0.5, py+s-2);
            gfx.fillStyle(0xaaa090).fillRect(px+2, py, 6, 6).fillRect(px+s-8, py, 6, 6);
            gfx.fillStyle(0x222018).fillRect(px+s/2-1, py+5, 2, 4);
        } else if (type === 'gate') {
            const open = bldg?.isOpen ?? true;
            gfx.fillStyle(0xa08858).fillRect(px+2, py+4, s-4, s-6);
            if (open) {
                gfx.fillStyle(0x7a6030, 0.7).fillRect(px+2, py+4, 4, s-8).fillRect(px+s-6, py+4, 4, s-8);
                gfx.fillStyle(0x222200, 0.5).fillRect(px+6, py+4, s-12, s-8);
            } else {
                gfx.fillStyle(0x8a7040).fillRect(px+3, py+5, s-6, s-8);
                gfx.lineStyle(2, 0x5a4820, 0.9).lineBetween(px+s*0.5, py+5, px+s*0.5, py+s-4).lineBetween(px+3, py+s*0.5, px+s-3, py+s*0.5);
            }
            gfx.lineStyle(2, 0x888070, 0.8).strokeRect(px+2, py+4, s-4, s-6);
        } else if (type === 'wall') {
            gfx.fillStyle(0x9a9888).fillRect(px+2, py+6, s-4, s-12);
            gfx.lineStyle(1, 0x666655, 0.7).lineBetween(px+2, py+s/2, px+s-2, py+s/2).lineBetween(px+s/2, py+6, px+s/2, py+s/2).lineBetween(px+s/4, py+s/2, px+s/4, py+s-6).lineBetween(px+3*s/4, py+s/2, px+3*s/4, py+s-6);
            gfx.fillStyle(0xb0a898).fillRect(px+2, py+1, 8, 7).fillRect(px+s-10, py+1, 8, 7);
            gfx.fillStyle(0x7a7868).fillRect(px+11, py+1, s-22, 7);
            gfx.lineStyle(1, 0x555544, 0.5).strokeRect(px+2, py+6, s-4, s-12);
        } else if (type === 'olive_press') {
            gfx.fillStyle(0x8a8a6a).fillRect(px+4, py+6, s-8, s-10);
            gfx.lineStyle(2, 0x667733, 0.9).strokeRect(px+4, py+6, s-8, s-10);
            gfx.fillStyle(0xaaa888).fillCircle(cx, cy, s*0.28);
            gfx.fillStyle(0x667733, 0.6).fillCircle(cx, cy, s*0.12);
            gfx.lineStyle(2, 0x888866, 0.8).strokeCircle(cx, cy, s*0.28);
            gfx.fillStyle(0x445522, 0.7).fillEllipse(cx-s*0.3, py+10, 12, 6);
            gfx.fillStyle(0x445522, 0.7).fillEllipse(cx+s*0.3, py+10, 12, 6);
        } else if (type === 'garden') {
            gfx.fillStyle(0x3a6020).fillRect(px+4, py+4, s-8, s-8);
            gfx.lineStyle(2, 0x557733, 0.9).strokeRect(px+4, py+4, s-8, s-8);
            const rowCount = 4;
            for (let i = 0; i < rowCount; i++) {
                const ry = py + 8 + i * ((s-16)/rowCount);
                gfx.lineStyle(1, 0x6a4422, 0.6).lineBetween(px+8, ry, px+s-8, ry);
                for (let j = 0; j < 3; j++) {
                    const rx = px + 12 + j * ((s-24)/2);
                    gfx.fillStyle(0x55aa33, 0.8).fillCircle(rx, ry-3, 3);
                }
            }
        } else if (type === 'temple') {
            const deity = bldg?.deity ?? 'ares';
            const accentCol = deity === 'ares' ? 0xdd6644 : deity === 'athena' ? 0x6699cc : 0xddcc44;
            gfx.fillStyle(0xe8e4d8).fillRect(px+2, py+s*0.55, s-4, s*0.45-4);
            const colCount = 4;
            for (let i = 0; i < colCount; i++) {
                const cx2 = px + 8 + i * (s-16)/(colCount-1);
                gfx.fillStyle(0xf0ece0).fillRect(cx2-4, py+s*0.2, 8, s*0.38);
                gfx.lineStyle(1, 0xccccaa, 0.6).strokeRect(cx2-4, py+s*0.2, 8, s*0.38);
            }
            gfx.fillStyle(0xe8e4d8).fillTriangle(px+2, py+s*0.2+2, px+s-2, py+s*0.2+2, cx, py+2);
            gfx.lineStyle(2, 0xaaa888, 0.8).strokeTriangle(px+2, py+s*0.2+2, px+s-2, py+s*0.2+2, cx, py+2);
            gfx.fillStyle(accentCol, 0.4).fillTriangle(px+6, py+s*0.2, px+s-6, py+s*0.2, cx, py+6);
        } else if (type === 'oracle') {
            gfx.fillStyle(0x3a2a4a).fillRect(px+4, py+4, s-8, s-8);
            gfx.lineStyle(2, 0x8866aa, 0.9).strokeRect(px+4, py+4, s-8, s-8);
            gfx.lineStyle(2, 0xaa99bb, 0.9).lineBetween(cx, py+10, cx-14, py+s-10).lineBetween(cx, py+10, cx+14, py+s-10).lineBetween(cx-7, py+s*0.4, cx+7, py+s*0.4);
            gfx.fillStyle(0x9966bb, 0.8).fillEllipse(cx, py+10, 18, 10);
            gfx.lineStyle(1, 0xddbbff, 0.5).lineBetween(cx-4, py+12, cx+4, py+18).lineBetween(cx+4, py+18, cx-4, py+24);
        } else if (type === 'carpenter') {
            // Walls
            gfx.fillStyle(0x8a5020).fillRect(px+4, py+8, s-8, s-12);
            gfx.lineStyle(2, 0x5a3010, 0.8).strokeRect(px+4, py+8, s-8, s-12);
            // Lean-to roof
            gfx.fillStyle(0x6a3a10).fillTriangle(px+2, py+22, px+s-2, py+22, cx, py+6);
            gfx.lineStyle(1, 0x4a2808, 0.7).strokeTriangle(px+2, py+22, px+s-2, py+22, cx, py+6);
            // Planks stacked left
            for (let i = 0; i < 3; i++) {
                gfx.fillStyle(i === 0 ? 0xc0a050 : i === 1 ? 0xb09040 : 0xa08030)
                   .fillRect(px+6, cy-4+i*6, 18, 5);
                gfx.lineStyle(1, 0x7a5010, 0.4).strokeRect(px+6, cy-4+i*6, 18, 5);
            }
            // Workbench centre
            gfx.fillStyle(0xc88840).fillRect(cx-14, cy+4, 28, 10);
            gfx.fillStyle(0xa06828).fillRect(cx-12, cy+12, 24, 8);
            gfx.lineStyle(1, 0x7a5020, 0.5).strokeRect(cx-14, cy+4, 28, 10);
            // Saw blade right
            gfx.fillStyle(0x886644).fillRect(px+s-22, cy-2, 14, 6);
            gfx.fillStyle(0xcccccc, 0.85).fillRect(px+s-20, cy-5, 10, 3);
            gfx.lineStyle(1, 0x888888, 0.6).strokeRect(px+s-20, cy-5, 10, 3);
            // Door
            gfx.fillStyle(0x3a1c08).fillRect(cx-7, py+s-26, 14, 22);
            gfx.fillStyle(0x5a3010, 0.35).fillRect(cx-6, py+s-25, 6, 21);
        } else if (type === 'masons') {
            // Stone walls with visible courses
            gfx.fillStyle(0x888870).fillRect(px+4, py+8, s-8, s-12);
            gfx.lineStyle(2, 0x555544, 0.9).strokeRect(px+4, py+8, s-8, s-12);
            // Block courses
            gfx.lineStyle(1, 0x555544, 0.55);
            for (let i = 1; i < 5; i++) gfx.lineBetween(px+4, py+8+i*12, px+s-4, py+8+i*12);
            gfx.lineBetween(cx, py+8, cx, py+20);
            gfx.lineBetween(px+22, py+20, px+22, py+32);
            gfx.lineBetween(px+s-22, py+20, px+s-22, py+32);
            // Stacked cut blocks left
            gfx.fillStyle(0xaaaaA0).fillRect(px+6, cy+2, 16, 9);
            gfx.fillStyle(0x9a9a90).fillRect(px+7, cy-6, 14, 9);
            gfx.lineStyle(1, 0x555544, 0.4)
               .strokeRect(px+6, cy+2, 16, 9).strokeRect(px+7, cy-6, 14, 9);
            // Chisel right
            gfx.fillStyle(0x886644).fillRect(px+s-18, cy-4, 5, 10);
            gfx.fillStyle(0xcccccc, 0.9).fillRect(px+s-17, cy-10, 3, 7);
            // Door opening
            gfx.fillStyle(0x222211, 0.7).fillRect(cx-8, py+s-28, 16, 24);
            gfx.lineStyle(1, 0x7a7060, 0.55).strokeRect(cx-8, py+s-28, 16, 24);
        }
    }

    redrawBuildingBar(bldg) {
        if (!bldg.barGfx) return;
        bldg.barGfx.clear();
        const px = bldg.tx * TILE, py = MAP_OY + bldg.ty * TILE, s = bldg.size * TILE;
        const bw = s - 8, bx = px + 4, by = py + s - 7;
        
        if (bldg.hp !== undefined && bldg.maxHp && bldg.hp < bldg.maxHp) {
            const r = Math.max(0, bldg.hp / bldg.maxHp);
            const bg = bldg.faction === 'enemy' ? 0x331111 : 0x111122;
            const fg = bldg.faction === 'enemy'
                ? (r > 0.5 ? 0xcc3322 : r > 0.25 ? 0xdd6622 : 0xff4400)
                : (r > 0.5 ? 0x4488cc : r > 0.25 ? 0xddaa22 : 0xcc3311);
            bldg.barGfx.fillStyle(bg, 0.9).fillRect(bx, by, bw, 4);
            bldg.barGfx.fillStyle(fg).fillRect(bx, by, bw * r, 4);
            if (!bldg.faction) return; // player buildings: only show HP bar, skip rest
        }
        if (bldg.faction === 'enemy') return;

        if (!bldg.built) {
            const totalNeeded = Object.values(bldg.resNeeded || {}).reduce((s,v)=>s+v, 0);
            if (totalNeeded > 0) {
                const totalCost = Object.values(BLDG[bldg.type].cost || {}).reduce((s,v)=>s+v, 0);
                const p = totalCost > 0 ? Math.max(0, 1 - totalNeeded / totalCost) : 0;
                bldg.barGfx.fillStyle(0x111111, 0.8).fillRect(bx, by, bw, 4);
                bldg.barGfx.fillStyle(0xff8833).fillRect(bx, by, bw * p + 1, 4);
            } else {
                const p = 1 - bldg.buildWork / bldg.maxBuildWork;
                bldg.barGfx.fillStyle(0x111111, 0.8).fillRect(bx, by, bw, 4);
                bldg.barGfx.fillStyle(0xffdd44).fillRect(bx, by, bw * p, 4);
            }
        } else if (bldg.type === 'farm') {
            const r = bldg.maxStock > 0 ? bldg.stock / bldg.maxStock : 0;
            bldg.barGfx.fillStyle(0x111111, 0.8).fillRect(bx, by, bw, 4);
            bldg.barGfx.fillStyle(r > 0.5 ? 0x88dd44 : r > 0.15 ? 0xddaa22 : 0x886633)
                .fillRect(bx, by, bw * r, 4);
        } else if (bldg.type === 'townhall' || bldg.type === 'house') {
            const capacity  = BLDG[bldg.type].capacity;
            const residents = this.scene.units.filter(u => u.homeBldgId === bldg.id && !u.isEnemy && u.hp > 0);
            const adults    = residents.filter(u => u.age >= 2).length;
            const popR      = Math.min(1, residents.length / capacity);
            bldg.barGfx.fillStyle(0x222222, 0.8).fillRect(bx, by, bw, 4);
            bldg.barGfx.fillStyle(adults >= 2 ? 0xddaa55 : 0x887755).fillRect(bx, by, bw * popR, 4);
            if (adults >= 2 && residents.length < capacity) {
                const tr = Math.min(1, bldg.spawnTimer / BLDG[bldg.type].spawnMs);
                if (tr > 0) bldg.barGfx.fillStyle(0xffffff, 0.55).fillRect(bx, by, bw * tr, 2);
            }
            if (bldg.respawnQueue.length) {
                const rr = Math.min(1, bldg.respawnQueue[0].elapsed / BLDG[bldg.type].spawnMs);
                bldg.barGfx.fillStyle(0xaaddff, 0.7).fillRect(bx, by, bw * rr, 2);
            }
        } else if (bldg.type === 'watchtower') {
            const RANGED = new Set(['archer','slinger','toxotes','scout']);
            const inTower = this.scene.units.filter(u => !u.isEnemy && u.hp > 0 && u.taskType === 'garrison' && u.taskBldgId === bldg.id);
            const capR = BLDG.watchtower.garrisonRanged, capM = BLDG.watchtower.garrisonMelee;
            const curR = inTower.filter(u => RANGED.has(u.type)).length;
            const curM = inTower.filter(u => !RANGED.has(u.type)).length;
            bldg.barGfx.fillStyle(0x222222, 0.8).fillRect(bx, by, bw, 5);
            // top 2px: ranged (blue), bottom 2px: melee (amber)
            bldg.barGfx.fillStyle(0x4488dd).fillRect(bx, by, bw * (curR / capR), 2);
            bldg.barGfx.fillStyle(0xddaa33).fillRect(bx, by + 3, bw * (curM / capM), 2);
        } else if (bldg.type === 'barracks') {
            if (bldg.respawnQueue.length) {
                const delay = BLDG.barracks.spawnMs || 18000;
                const r = Math.min(1, bldg.respawnQueue[0].elapsed / delay);
                bldg.barGfx.fillStyle(0x111111, 0.8).fillRect(bx, by, bw, 4);
                bldg.barGfx.fillStyle(0xaaddff).fillRect(bx, by, bw * r, 4);
            } else if (bldg.trainQueue.length) {
                const r = bldg.trainQueue[0].elapsed / 15000;
                bldg.barGfx.fillStyle(0x111111, 0.8).fillRect(bx, by, bw, 4);
                bldg.barGfx.fillStyle(0x3a6acc).fillRect(bx, by, bw * r, 4);
            }
        } else if (bldg.type === 'archery') {
            if (bldg.respawnQueue.length) {
                const delay = BLDG.archery.spawnMs || 16000;
                const r = Math.min(1, bldg.respawnQueue[0].elapsed / delay);
                bldg.barGfx.fillStyle(0x111111, 0.8).fillRect(bx, by, bw, 4);
                bldg.barGfx.fillStyle(0xaaddff).fillRect(bx, by, bw * r, 4);
            } else if (bldg.trainQueue.length) {
                const r = bldg.trainQueue[0].elapsed / 12000;
                bldg.barGfx.fillStyle(0x111111, 0.8).fillRect(bx, by, bw, 4);
                bldg.barGfx.fillStyle(0x44aa77).fillRect(bx, by, bw * r, 4);
            }
        } else if (bldg.type === 'stable') {
            if (bldg.respawnQueue.length) {
                const delay = BLDG.stable.spawnMs || 22000;
                const r = Math.min(1, bldg.respawnQueue[0].elapsed / delay);
                bldg.barGfx.fillStyle(0x111111, 0.8).fillRect(bx, by, bw, 4);
                bldg.barGfx.fillStyle(0xaaddff).fillRect(bx, by, bw * r, 4);
            } else if (bldg.trainQueue.length) {
                const r = bldg.trainQueue[0].elapsed / 22000;
                bldg.barGfx.fillStyle(0x111111, 0.8).fillRect(bx, by, bw, 4);
                bldg.barGfx.fillStyle(0xcc9922).fillRect(bx, by, bw * r, 4);
            }
        } else if (bldg.type === 'pasture') {
            const cap = BLDG.pasture.sheepCap;
            const adults = (bldg.males ?? 0) + (bldg.females ?? 0), lambs = bldg.lambs ?? 0;
            bldg.barGfx.fillStyle(0x222222, 0.8).fillRect(bx, by, bw, 4);
            bldg.barGfx.fillStyle(0x88ee44).fillRect(bx, by, bw * adults / cap, 4);
            bldg.barGfx.fillStyle(0xeeee44).fillRect(bx + bw * adults / cap, by, bw * lambs / cap, 4);
        }
    }

    redrawAll(type) {
        this.scene.buildings.filter(b => b.type === type).forEach(b => this.redrawBuilding(b));
    }
}
