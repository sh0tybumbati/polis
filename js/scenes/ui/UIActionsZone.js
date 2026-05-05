import { TILE, MAP_OY, BLDG, BLDG_CATS, FM_TYPES, FM_LABELS, computeBuildCost } from '../../config/gameConstants.js';
import UIPanel from '../UIPanel.js';

export default {
    _renderActionsZone() {
        this._clearTabs();
        if (this._actionPanel) { this._actionPanel.destroy(); this._actionPanel = null; }

        const { PANEL_H, KEY_H, TAB_H, panelY, INFO_W, MM_W, ACT_W } = this.L;
        const zx = INFO_W + MM_W;
        const zy = panelY + KEY_H;
        const fullH = PANEL_H - KEY_H;

        const sel      = this.scene.units.filter(u => u.selected && !u.isEnemy);
        const bldg     = this.scene.selectedBuilding;
        const workers  = sel.filter(u => u.type === 'worker' && u.age >= 2);
        const military = sel.filter(u => u.type !== 'worker');
        const scouts   = sel.filter(u => u.type === 'scout');

        if (bldg) {
            this._renderBldgActions(bldg, zx, zy, ACT_W, fullH);
        } else if (workers.length > 0 && military.length === 0) {
            this._renderWorkerActions(sel, workers, zx, zy, ACT_W, fullH);
        } else if (sel.length > 0) {
            this._renderMilActions(sel, military, scouts, zx, zy, ACT_W, fullH);
        } else {
            const MAT_H = 18;
            this._renderMaterialToggle(zx, zy, ACT_W, MAT_H);
            this._renderCategoryTabs(zx, zy + MAT_H, ACT_W, TAB_H);
            const panelH = fullH - MAT_H - TAB_H;
            this._actionPanel = new UIPanel(this.scene, zx, zy + MAT_H + TAB_H, ACT_W, panelH);
            this._actionPanel.setItems(this._buildMenuItems());
        }
    },

    _renderBldgActions(b, zx, zy, ACT_W, fullH) {
        const s     = this.scene;
        const TAB_H = 22;
        const STRIP = 34;
        const close = () => { s.selectedBuilding = null; this.updateUI(); };

        if (b.id !== this._actBldgId) { this._actBldgId = b.id; this._actBldgTab = null; }

        if (!b.built) {
            this._actStrip(zx, zy + fullH - STRIP, ACT_W, STRIP, [
                { label: 'Cancel Build', color: 0x443322, cb: () => { s.demolishBuilding(b); } },
                { label: '✕ Close', color: 0x2a1c10, cb: close },
            ]);
            return;
        }

        const tabs = this._bldgTabs(b);
        if (!this._actBldgTab || !tabs.includes(this._actBldgTab)) this._actBldgTab = tabs[0];
        this._actTabBar(zx, zy, ACT_W, tabs, this._actBldgTab,
            t => { this._actBldgTab = t; this.updateUI(); });

        const panelH = fullH - TAB_H - STRIP;
        this._actionPanel = new UIPanel(this.scene, zx, zy + TAB_H, ACT_W, panelH);
        this._actionPanel.setItems(this._bldgTabItems(b, this._actBldgTab));

        const noAssign = b.type === 'house' || b.type === 'wall' || b.type === 'palisade';
        const hasInv   = !b.faction && Object.values(b.inventory ?? {}).some(v => v > 0);
        this._actStrip(zx, zy + TAB_H + panelH, ACT_W, STRIP, [
            { label: '👷 Workers', color: 0x334422, dimmed: noAssign,
              cb: () => { s.orderWorkersToBuilding(b); this.updateUI(); } },
            { label: '📦 Inv', color: 0x1a2030, dimmed: !hasInv,
              cb: () => { this.showInventoryModal(b); } },
            b.deconstructing
                ? { label: '✗ Cancel', color: 0x332211, cb: () => { s.buildingManager.cancelDeconstruct(b); this.updateUI(); } }
                : { label: '🔨 Demo',  color: 0x441111, cb: () => { s.buildingManager.orderDeconstruct(b); this.updateUI(); } },
            { label: '✕ Close', color: 0x2a1c10, cb: close },
        ]);
    },

    _bldgTabs(b) {
        if (b.type === 'barracks' || b.type === 'archery' || b.type === 'stable') return ['Train'];
        if (b.type === 'camp')     return ['Upgrade'];
        if (b.type === 'house')    return ['Rooms'];
        if (b.type === 'agora')    return ['Trade'];
        if (b.type === 'townhall') return ['Manage'];
        return ['Actions'];
    },

    _bldgTabItems(b, tab) {
        const items = [];
        const s = this.scene;
        const afford = cost => s.economyManager.afford(cost);

        if (tab === 'Upgrade') {
            const upgCost = { 'Materials.Wood.Pine.Sticks': 15, 'Materials.Stone.Limestone.Stones': 10 };
            // Check private camp inventory + public commons combined
            const inv = b.inventory ?? {};
            const canUpgrade = Object.entries(upgCost).every(([r, n]) =>
                (inv[r] ?? 0) + (s.resources[r] ?? 0) >= n);
            const costStr = Object.entries(upgCost).map(([r, n]) => `${n} ${r.split('.').pop()}`).join(' · ');
            items.push({
                label: '🏠 Upgrade to House', sublabel: costStr,
                color: canUpgrade ? 0x664422 : 0x2a1c10, dimmed: !canUpgrade,
                callback: () => {
                    if (!canUpgrade) return;
                    // Drain private inventory first, then public
                    for (const [r, n] of Object.entries(upgCost)) {
                        let need = n;
                        const fromPriv = Math.min(need, inv[r] ?? 0);
                        if (fromPriv > 0) { inv[r] -= fromPriv; need -= fromPriv; }
                        if (need > 0) s.economyManager.takeFromCommons(r, need);
                    }
                    s.buildingManager.upgradeCampToHouse(b);
                },
            });
            const residents = s.units.filter(u => u.homeBldgId === b.id && u.hp > 0);
            if (residents.length) {
                items.push({ label: `${residents.length} resident${residents.length > 1 ? 's' : ''}`,
                    sublabel: residents.map(u => u.name?.split(' ')[0]).join(', '),
                    color: 0x1a1810, dimmed: true, callback: () => {} });
            }
            // Show what's in camp storage
            const stored = Object.entries(b.inventory ?? {}).filter(([, v]) => v > 0);
            if (stored.length) {
                items.push({ label: '📦 Storage',
                    sublabel: stored.map(([r, v]) => `${v} ${r.split('.').pop()}`).join('  '),
                    color: 0x1a2010, dimmed: true, callback: () => {} });
            }
        }

        if (tab === 'Actions') {
            if (b.type === 'gate') {
                items.push({ label: b.isOpen ? 'Close Gate' : 'Open Gate', color: 0x442200,
                    callback: () => { b.isOpen = !b.isOpen; s.redrawBuilding(b); this.updateUI(); } });
            }
            if (b.type === 'pasture' && ((b.males ?? 0) + (b.females ?? 0)) >= 1) {
                items.push({ label: 'Slaughter Sheep', color: 0x661111,
                    callback: () => { s._slaughterSheep(b); this.updateUI(); } });
            }
            if (b.type === 'temple') {
                const next = { ares: 'athena', athena: 'apollo', apollo: 'ares' };
                items.push({ label: `Deity: ${(b.deity ?? 'ares').toUpperCase()}`, color: 0x442266,
                    callback: () => { b.deity = next[b.deity ?? 'ares']; this.updateUI(); } });
            }
            if (b.type === 'garden') {
                const names = { lentils: 'Lentils', garlic: 'Garlic', onions: 'Onions' };
                const next  = { lentils: 'garlic', garlic: 'onions', onions: 'lentils' };
                items.push({ label: `Crop: ${names[b.cropType ?? 'lentils']}`, color: 0x336633,
                    callback: () => { b.cropType = next[b.cropType ?? 'lentils']; this.updateUI(); } });
            }
        }

        if (tab === 'Train') {
            const trainUnit = (type, cost, label, col) => {
                const can = afford(cost);
                items.push({ label, sublabel: Object.entries(cost).map(([r,n])=>`${n}${r[0]}`).join(' '),
                    color: can ? col : 0x2a1c10, dimmed: !can, callback: () => {
                        if (!can) return;
                        s.economyManager.spend(cost);
                        const cx = (b.tx+b.size/2)*TILE, cy = MAP_OY+(b.ty+b.size/2)*TILE;
                        s.spawnUnit(type, cx+Phaser.Math.Between(-16,16), cy+Phaser.Math.Between(-8,8), false);
                        this.updateUI();
                    }});
            };
            if (b.type === 'barracks') {
                trainUnit('clubman',  { 'Food.Grain.Wheat': 3 },                                   'Clubman',  0x4a3820);
                trainUnit('spearman', { 'Food.Grain.Wheat': 5, 'Materials.Stone.Limestone': 1 }, 'Spearman', 0x4a3820);
            }
            if (b.type === 'archery') {
                trainUnit('slinger', { 'Food.Grain.Wheat': 3 },                            'Slinger', 0x2a4030);
                trainUnit('archer',  { 'Food.Grain.Wheat': 5, 'Materials.Wood.Pine': 1 }, 'Archer',  0x2a4030);
            }
            if (b.type === 'stable') {
                const cost = { 'Food.Grain.Wheat': 8, 'Materials.Wood.Pine': 2 };
                const can  = afford(cost);
                items.push({ label: 'Cavalry', sublabel: '8f 2w', color: can ? 0x4a3010 : 0x2a1c10, dimmed: !can,
                    callback: () => {
                        if (!can) return;
                        s.economyManager.spend(cost);
                        const cx = (b.tx+b.size/2)*TILE, cy = MAP_OY+(b.ty+b.size/2)*TILE;
                        s.spawnUnit('cavalry', cx, cy, false);
                        this.updateUI();
                    }});
            }
        }

        if (tab === 'Rooms') {
            const bm = s.buildingManager, eco = s.economyManager;
            const canAdd = bm.canAddRoom(b);
            if (!b.rooms) {
                items.push({ label: '⚙ Setup Rooms', sublabel: 'convert legacy house', color: 0x2a3020,
                    callback: () => { b.rooms = []; this.updateUI(); } });
            } else {
                for (const [id, label, cost] of [
                    ['bedroom',   '🛏 Bedroom',   { 'Materials.Wood.Pine.Sticks': 8 }],
                    ['kitchen',   '🔥 Kitchen',   { 'Materials.Stone.Limestone.Stones': 6 }],
                    ['workshop',  '🔨 Workshop',  { 'Materials.Wood.Pine.Sticks': 10 }],
                    ['storeroom', '📦 Storeroom', { 'Materials.Wood.Pine.Sticks': 6 }],
                ]) {
                    const can = canAdd && eco.afford(cost);
                    items.push({ label, sublabel: Object.entries(cost).map(([k,v])=>`${v} ${k.split('.').pop()}`).join(', '),
                        color: can ? 0x2a3020 : 0x1a1810, dimmed: !can,
                        callback: () => { bm.addRoom(b, id); } });
                }
                if (!canAdd) items.push({ label: 'House full (6/6)', sublabel: 'no more rooms',
                    color: 0x1a1810, dimmed: true, callback: () => {} });
            }
        }

        if (tab === 'Trade') {
            items.push({ label: '📋 Trade Orders', color: 0x1a2a10,
                callback: () => { this.showAgoraPanel(b); } });
            const orders = b.tradeOrders ?? [];
            if (orders.length > 0)
                items.push({ label: `${orders.length} order${orders.length > 1 ? 's' : ''}`,
                    sublabel: 'active', color: 0x1a2010, dimmed: true, callback: () => {} });
            if ((b.tradeLog ?? []).length > 0)
                items.push({ label: 'Last trade', sublabel: `D${b.tradeLog[0].day}`,
                    color: 0x1a2818, dimmed: true, callback: () => {} });
        }

        if (tab === 'Manage') {
            if (b.type === 'townhall') {
                const can = afford({ 'Food.Grain.Wheat': 5 });
                items.push({ label: 'Train Scout', sublabel: '5w', color: can ? 0x334455 : 0x2a1c10, dimmed: !can,
                    callback: () => {
                        if (!can) { this.showPhaseMessage('Not enough wheat!', 0xff4444); return; }
                        s.economyManager.takeFromCommons('Food.Grain.Wheat', 5);
                        const cx = (b.tx+b.size/2)*TILE, cy = MAP_OY+(b.ty+b.size/2)*TILE;
                        s.spawnUnit('scout', cx, cy, false);
                        this.updateUI();
                    }});
                const rate = s.titheRate ?? 10;
                items.push({ label: `Tithe –  ${rate}%`, color: 0x332211,
                    callback: () => { s.titheRate = Math.max(0, (s.titheRate ?? 10) - 5); this.updateUI(); } });
                items.push({ label: `Tithe +  ${rate}%`, color: 0x223311,
                    callback: () => { s.titheRate = Math.min(40, (s.titheRate ?? 10) + 5); this.updateUI(); } });
                items.push({ label: 'New Game', color: 0x3a1111,
                    callback: () => { s.clearSave(); s.scene.restart(); } });
            }
        }

        return items;
    },

    _renderWorkerActions(sel, workers, zx, zy, ACT_W, fullH) {
        const s     = this.scene;
        const TAB_H = 22;
        const STRIP = 28;
        const tabs  = ['Jobs', 'Orders', 'Vocation'];
        if (!tabs.includes(this._actUnitTab)) this._actUnitTab = 'Jobs';
        this._actTabBar(zx, zy, ACT_W, tabs, this._actUnitTab,
            t => { this._actUnitTab = t; this.updateUI(); });

        const panelH = fullH - TAB_H - STRIP;
        const items  = [];

        if (this._actUnitTab === 'Jobs') {
            const ROLES = [
                { role: 'farmer',     label: 'Farm',   color: 0x336622 },
                { role: 'forager',    label: 'Forage', color: 0x2a4a22 },
                { role: 'woodcutter', label: 'Lumber', color: 0x5a3a18 },
                { role: 'miner',      label: 'Mine',   color: 0x444444 },
                { role: 'builder',    label: 'Build',  color: 0x554422 },
                { role: 'shepherd',   label: 'Herd',   color: 0x445533 },
                { role: 'hunter',     label: 'Hunt',   color: 0x553322 },
            ];
            for (const { role, label, color } of ROLES) {
                const active = workers.every(u => u.role === role);
                items.push({ label, color: active ? color + 0x222222 : color, active, callback: () => {
                    workers.forEach(u => { u.role = role; u.taskType = null; u.targetNode = null; u.moveTo = null; });
                    s.deselect(); this.updateUI();
                }});
            }
            if (workers.some(u => u.role)) {
                items.push({ label: 'Clear Role', color: 0x3a2a1a, callback: () => {
                    workers.forEach(u => { u.role = null; u.taskType = null; });
                    this.updateUI();
                }});
            }
        }

        if (this._actUnitTab === 'Orders') {
            items.push({ label: 'Recall Home', color: 0x223344, callback: () => {
                workers.forEach(u => {
                    const home = s.buildings.find(b => b.id === u.homeBldgId);
                    if (home) u.moveTo = { x: (home.tx+home.size/2)*TILE, y: MAP_OY+(home.ty+home.size/2)*TILE };
                    u.taskType = null; u.targetNode = null;
                });
                s.deselect(); this.updateUI();
            }});
        }

        if (this._actUnitTab === 'Vocation') {
            const VOCATIONS = ['farmer','hunter','woodcutter','miner','builder','shepherd',
                'carpenter','mason','smith','smelter','miller','baker','butcher','tanner','merchant','forager'];
            for (const voc of VOCATIONS) {
                const active = workers.every(u => u.vocation === voc);
                items.push({ label: voc[0].toUpperCase() + voc.slice(1),
                    color: active ? 0x334422 : 0x1e2c1a, active, callback: () => {
                        workers.forEach(u => { u.vocation = voc; });
                        this.updateUI();
                    }});
            }
        }

        this._actionPanel = new UIPanel(this.scene, zx, zy + TAB_H, ACT_W, panelH);
        this._actionPanel.setItems(items);

        this._actStrip(zx, zy + TAB_H + panelH, ACT_W, STRIP, [
            { label: '✕ Clear', color: 0x2a1c10, cb: () => {
                s.bldgType = null; s.roadMode = false;
                s.deselect(); s.hoverGfx?.clear(); this.updateUI();
            }},
        ]);
    },

    _renderMilActions(sel, military, scouts, zx, zy, ACT_W, fullH) {
        const s     = this.scene;
        const TAB_H = 22;
        const STRIP = 28;
        const hasMil = military.length > 0 || scouts.length > 0;
        const tabs  = hasMil ? ['Move', 'Orders'] : ['Move'];
        if (!tabs.includes(this._actMilTab)) this._actMilTab = 'Move';
        this._actTabBar(zx, zy, ACT_W, tabs, this._actMilTab,
            t => { this._actMilTab = t; this.updateUI(); });

        const panelH = fullH - TAB_H - STRIP;
        const items  = [];

        if (this._actMilTab === 'Move') {
            for (let i = 0; i < FM_TYPES.length; i++) {
                const type  = FM_TYPES[i];
                const label = FM_LABELS[i];
                const active = s.fmType === type;
                items.push({ label, color: active ? 0x336688 : 0x1e2c3a, active, callback: () => {
                    s.fmType = type;
                    const ax = sel.reduce((a, u) => a + u.x, 0) / sel.length;
                    const ay = sel.reduce((a, u) => a + u.y, 0) / sel.length;
                    s.moveSelectedTo(ax, ay);
                    this.updateUI();
                }});
            }
            if (scouts.length > 0) {
                items.push({ label: 'Explore', color: 0x3a2a50, callback: () => {
                    scouts.forEach(u => { u.role = 'scouting'; });
                    s.deselect(); this.updateUI();
                }});
            }
        }

        if (this._actMilTab === 'Orders') {
            const towers = s.buildings.filter(b => b.built && !b.faction && b.type === 'watchtower');
            if (towers.length > 0) {
                items.push({ label: 'Garrison Tower', color: 0x334455, callback: () => {
                    const cx = sel.reduce((a, u) => a + u.x, 0) / sel.length;
                    const cy = sel.reduce((a, u) => a + u.y, 0) / sel.length;
                    const tower = towers.reduce((best, b) => {
                        const d = Phaser.Math.Distance.Between(cx, cy, (b.tx+1)*TILE, MAP_OY+(b.ty+1)*TILE);
                        return (!best || d < best.d) ? { b, d } : best;
                    }, null)?.b;
                    if (tower) s.orderWorkersToBuilding(tower);
                    s.deselect(); this.updateUI();
                }});
            }
            if (military.some(u => (u.vetLevel ?? 0) === 0)) {
                items.push({ label: 'Dismiss', color: 0x663322, callback: () => {
                    military.forEach(u => { if ((u.vetLevel ?? 0) === 0) u.role = 'demobilizing'; });
                    s.deselect(); this.updateUI();
                }});
            }
        }

        this._actionPanel = new UIPanel(this.scene, zx, zy + TAB_H, ACT_W, panelH);
        this._actionPanel.setItems(items);

        this._actStrip(zx, zy + TAB_H + panelH, ACT_W, STRIP, [
            { label: '✕ Clear', color: 0x2a1c10, cb: () => {
                s.bldgType = null; s.roadMode = false;
                s.deselect(); s.hoverGfx?.clear(); this.updateUI();
            }},
        ]);
    },

    _renderMaterialToggle(x, y, w, h) {
        const mat = this.scene.bldgMaterial ?? 'Materials.Wood.Pine.Sticks';
        const options = [
            ['Materials.Wood.Pine.Sticks',       'Sticks'],
            ['Materials.Wood.Pine',               'Logs'],
            ['Materials.Stone.Limestone.Stones',  'Stones'],
            ['Materials.Stone.Limestone',         'Slabs'],
        ];
        const btnW = Math.floor(w / options.length);
        options.forEach(([m, label], i) => {
            const active = mat === m;
            const bx = x + i * btnW;
            const bg = this._tab(this.scene.add.graphics().setDepth(22));
            bg.fillStyle(active ? 0x4a3018 : 0x1a1208, active ? 0.95 : 0.7)
              .fillRect(bx, y, btnW - 1, h - 1);
            if (active) bg.lineStyle(1, 0xc8a030, 0.7).strokeRect(bx, y, btnW - 1, h - 1);
            this._tab(this.scene.add.text(bx + btnW / 2, y + h / 2, label, {
                fontFamily: 'monospace', fontSize: '9px',
                color: active ? '#e8d090' : '#5a4a28',
            }).setOrigin(0.5).setDepth(22));
            this._tab(this.scene.add.zone(bx + btnW / 2, y + h / 2, btnW - 1, h - 1)
                .setInteractive().setDepth(23))
                .on('pointerdown', () => { this.scene.bldgMaterial = m; this.updateUI(); });
        });
    },

    _renderCategoryTabs(x, y, w, h) {
        const cats  = Object.keys(BLDG_CATS);
        const tabW  = Math.floor((w - 2) / cats.length);

        cats.forEach((cat, i) => {
            const active = this.scene.buildCat === cat;
            const tx = x + 1 + i * tabW;
            const bg = this._tab(this.scene.add.graphics().setDepth(22));
            bg.fillStyle(active ? 0x4a6070 : 0x221a0e, active ? 0.95 : 0.8)
              .fillRect(tx, y, tabW - 1, h - 1);
            if (active) bg.lineStyle(1, 0xc8a030, 0.8).strokeRect(tx, y, tabW - 1, h - 1);

            const label = cat.length > 5 ? cat.slice(0, 4) : cat;
            this._tab(this.scene.add.text(tx + tabW / 2, y + h / 2, label, {
                fontFamily: 'monospace', fontSize: '11px',
                color: active ? '#e8d8a0' : '#6a5a3a',
            }).setOrigin(0.5).setDepth(22));

            const z = this._tab(this.scene.add.zone(tx + tabW / 2, y + h / 2, tabW - 1, h - 1)
                .setInteractive().setDepth(23));
            z.on('pointerdown', () => {
                this.scene.buildCat = cat; this.updateUI();
            });
        });
    },

    _buildMenuItems() {
        if (this.scene.buildCat === 'Debug') {
            return [
                { label: '✏ Sprite Editor', color: 0x101820,
                  callback: () => { this.scene.scene.launch('SpriteEditorScene'); } },
                { label: '🔄 New Game', color: 0x1a0808,
                  callback: () => { this.scene.clearSave(); this.scene.scene.restart(); } },
            ];
        }

        const mat   = this.scene.bldgMaterial ?? 'Materials.Wood.Pine';
        const bldgs = BLDG_CATS[this.scene.buildCat] ?? [];
        const items = bldgs.map(type => {
            const def      = BLDG[type];
            const cost     = computeBuildCost(type, mat);
            const canAfford = !Object.keys(cost).length || this.scene.economyManager.afford(cost);
            const isActive  = this.scene.bldgType === type;
            const costStr   = Object.keys(cost).length
                ? Object.entries(cost).map(([r, n]) => `${n}${r[0]}`).join(' ')
                : null;
            return {
                label: def.label, sublabel: costStr, desc: def.desc,
                color: isActive ? 0x4a6070 : canAfford ? (def.color > 0 ? Math.max(0, (def.color & 0xfefefe) >> 1) : 0x2a1e0e) : 0x1a1208,
                dimmed: false, active: isActive,
                callback: () => {
                    this.scene.bldgType = isActive ? null : type;
                    this.scene.roadMode = false;
                    this.scene.hoverGfx?.clear();
                    this.updateUI();
                },
            };
        });

        items.push({
            label: 'Road', sublabel: '1s',
            color: this.scene.roadMode ? 0x4a5a28 : 0x2a2010,
            active: this.scene.roadMode,
            callback: () => {
                this.scene.roadMode = !this.scene.roadMode;
                this.scene.bldgType = null;
                this.scene.hoverGfx?.clear();
                this.updateUI();
            },
        });

        return items;
    },
};
