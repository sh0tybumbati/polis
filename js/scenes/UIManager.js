import {
    TILE, MAP_OY,
    FM_TYPES, FM_LABELS, UNIT_NAMES, VET_LEVELS, SEASONS, SEASON_DAYS,
    CONSTRUCT_VOLUME, DAY_DURATION, NIGHT_DURATION,
} from '../config/gameConstants.js';
import { clockString, tabStrip, panel, statRow, THEME } from '../ui/UIKit.js';
import { CONSTRUCTS, CONSTRUCT_CATS, computeBuildCost } from '../content/constructs/index.js';
import UIPanel from './UIPanel.js';
import { ITEMS } from '../content/items/index.js';
import { WORKSHOP_JOBS } from '../content/jobs/index.js';

import uiInfoPaneMethods    from './ui/UIInfoPane.js';
import uiActionsZoneMethods from './ui/UIActionsZone.js';
import uiModalsMethods      from './ui/UIModals.js';
import uiWorkGridMethods    from './ui/UIWorkGrid.js';

// Known resource defs for the resources panel (ordered by importance)
const RESOURCE_DEFS = [
    // Food — Grain
    { key: 'Food.Grain.Wheat',                icon: '🌾', label: 'Wheat'    },
    { key: 'Food.Grain.Wheat.Flour',          icon: '🌾', label: 'Flour'    },
    { key: 'Food.Grain.Wheat.Bread',          icon: '🍞', label: 'Bread'    },
    // Food — Meat
    { key: 'Food.Meat.Venison',               icon: '🦌', label: 'Venison'  },
    { key: 'Food.Meat.Venison.Cuts',          icon: '🥩', label: 'Cuts'     },
    { key: 'Food.Meat.Venison.Sausages',      icon: '🥓', label: 'Sausage'  },
    // Food — Produce
    { key: 'Food.Produce.Berry',              icon: '🍓', label: 'Berries'  },
    { key: 'Food.Produce.Olive',              icon: '🫒', label: 'Olive'    },
    { key: 'Food.Produce.Olive.Oil',          icon: '🫒', label: 'Oil'      },
    { key: 'Food.Produce.WildGrapes',         icon: '🍇', label: 'Grapes'   },
    // Food — Drink
    { key: 'Food.Drink.Beer',                 icon: '🍺', label: 'Beer'     },
    // Materials — Wood
    { key: 'Materials.Wood.Pine',             icon: '🪵', label: 'Pine'     },
    { key: 'Materials.Wood.Pine.Sticks',      icon: '🪵', label: 'Sticks'   },
    { key: 'Materials.Wood.Pine.Plank',       icon: '🪵', label: 'Planks'   },
    // Materials — Stone
    { key: 'Materials.Stone.Limestone',           icon: '🪨', label: 'Limestone' },
    { key: 'Materials.Stone.Limestone.Stones',    icon: '🪨', label: 'Stones'    },
    { key: 'Materials.Stone.Limestone.Block',     icon: '🪨', label: 'Block'     },
    // Materials — Metal
    { key: 'Materials.Metal.Copper.Ore',      icon: '⛏',  label: 'Copper Ore' },
    { key: 'Materials.Metal.Copper.Ingot',    icon: '⚙',  label: 'Copper'     },
    // Textile
    { key: 'Textile.Fiber.Wool',              icon: '🧶', label: 'Wool'     },
    { key: 'Textile.Cloth.Wool',              icon: '🧶', label: 'Cloth'    },
    { key: 'Textile.Hide.Deer',               icon: '🦌', label: 'Hide'     },
    { key: 'Textile.Hide.Deer.Leather',       icon: '🟤', label: 'Leather'  },
    // Equipment
    { key: 'Equipment.Leather.Kit',           icon: '🎒', label: 'Leather Kit' },
    { key: 'Equipment.Bronze.Kit',            icon: '⚔',  label: 'Bronze Kit'  },
];

export default class UIManager {
    constructor(scene) {
        this.scene = scene;
        this._infoObjs    = [];
        this._tabObjs     = [];
        this._hintObjs    = [];
        this._hrowObjs         = [];
        this._inventoryObjs    = [];
        this._inventoryCollapsed = {};   // { 'Food': false, 'Food.Grain': true, ... }
        this._actionPanel = null;
        this._caravanModal = null;
        this._activePanel  = null;
        this._panelScrollX = {};
        this._censusPage   = 0;
        this._hrowDrag     = null;
        this._tooltipObjs  = [];
        // Left panel tab state
        this._unitTab      = 'Stats';
        this._constructTab = 'Info';
        this._oikosTab     = 'Family';
        this._zoneTab      = 'Info';
        // Right panel (actions) tab state
        this._actUnitTab       = 'Jobs';
        this._actMilTab        = 'Move';
        this._actConstructTab  = null;
        this._actConstructId   = null;
    }

    _ui(obj) { this.scene.cameras.main.ignore(obj); return obj; }

    rebuildUI() { this.scene.scene.restart(); }

    // ─── Layout ───────────────────────────────────────────────────────────────

    _computeLayout() {
        const W = this.scene.SW, H = this.scene.SH;
        const TOOLBAR_H   = 60;
        const TOOLBAR_Y   = H - TOOLBAR_H;
        const INSP_MAX_H  = Math.floor(H / 4);
        const INSP_W      = Math.min(450, Math.floor(W / 3));
        const FLOAT_W     = INSP_W * 2;
        const TAB_H       = 26;
        return {
            W, H, TOOLBAR_H, TOOLBAR_Y,
            PANEL_MAX_H: INSP_MAX_H,   // compat alias
            INSP_MAX_H, INSP_W, FLOAT_W, TAB_H,
            panelY: TOOLBAR_Y - INSP_MAX_H,
            PANEL_H: INSP_MAX_H,
            KEY_H: 0, QB_H: 0, MM_W: 0,
            INFO_W: INSP_W, INFO_X: 0,
            ACT_W: FLOAT_W, ACT_X: INSP_W,
        };
    }

    // ─── Create ───────────────────────────────────────────────────────────────

    createUI() {
        this.L = this._computeLayout();
        const { W, H } = this.L;

        this._buildToolbar();

        this._infoRoot      = this._ui(this.scene.add.container(0, 0).setDepth(21));
        this._tabRoot       = this._ui(this.scene.add.container(0, 0).setDepth(22));
        this._inventoryRoot = this._ui(this.scene.add.container(0, 0).setDepth(31));

        this.scene.phaseMsg = this._ui(this.scene.add.text(W / 2, H / 2 - 40, '', {
            fontSize: '22px', color: '#ffffff', fontFamily: THEME.fontMono,
            stroke: '#000000', strokeThickness: 4,
        }).setOrigin(0.5).setDepth(100).setAlpha(0));

        this.scene.buildCat = this.scene.buildCat ?? 'Structures';
        this.updateUI();
    }

    // ─── Toolbar ─────────────────────────────────────────────────────────────

    _buildToolbar() {
        const { W, TOOLBAR_H, TOOLBAR_Y } = this.L;

        this._ui(this.scene.add.rectangle(W / 2, TOOLBAR_Y + TOOLBAR_H / 2, W, TOOLBAR_H, 0x0c0904, 0.98).setDepth(27));
        const tg = this._ui(this.scene.add.graphics().setDepth(27));
        tg.lineStyle(1, 0x5a4010, 0.7).lineBetween(0, TOOLBAR_Y, W, TOOLBAR_Y);

        const TOOLS = [
            { id: 'architect', icon: '🔨', label: 'Build'  },
            { id: 'zones',     icon: '🗺',  label: 'Zones'  },
            { id: 'people',    icon: '👥',  label: 'People' },
            { id: 'orders',    icon: '📋',  label: 'Orders' },
        ];
        const BTN_W = 66, BTN_H = TOOLBAR_H - 8, BTN_PAD = 4;

        this._toolbarBtnDrawers = {};
        TOOLS.forEach((tool, i) => {
            const bx = BTN_PAD + i * (BTN_W + BTN_PAD);
            const by = TOOLBAR_Y + 4;

            const bg = this._ui(this.scene.add.graphics().setDepth(28));
            const drawBg = (active) => {
                bg.clear();
                bg.fillStyle(active ? 0x2e2818 : 0x1a1610, 0.92).fillRect(bx, by, BTN_W, BTN_H);
                bg.lineStyle(1, active ? 0xc8a030 : 0x3a2e18, active ? 0.8 : 0.4).strokeRect(bx, by, BTN_W, BTN_H);
                if (active) bg.lineStyle(2, 0xc8a030, 0.9).lineBetween(bx, by, bx + BTN_W, by);
            };
            drawBg(false);
            this._toolbarBtnDrawers[tool.id] = drawBg;

            const hov = this._ui(this.scene.add.graphics().setDepth(29).setAlpha(0));
            hov.fillStyle(0xffffff, 0.08).fillRect(bx, by, BTN_W, BTN_H);

            this._ui(this.scene.add.text(bx + BTN_W / 2, by + BTN_H / 2 - 7, tool.icon, {
                fontSize: '18px', fontFamily: THEME.fontMono,
            }).setOrigin(0.5).setDepth(29));
            this._ui(this.scene.add.text(bx + BTN_W / 2, by + BTN_H / 2 + 9, tool.label, {
                fontSize: '9px', fontFamily: THEME.fontMono, color: '#9a8868',
            }).setOrigin(0.5).setDepth(29));

            const z = this._ui(this.scene.add.zone(bx + BTN_W / 2, by + BTN_H / 2, BTN_W, BTN_H)
                .setInteractive({ cursor: 'pointer' }).setDepth(30));
            z.on('pointerover', () => hov.setAlpha(1));
            z.on('pointerout',  () => hov.setAlpha(0));
            z.on('pointerdown', () => this._onToolClick(tool.id));
        });

        this.scene.dayInfo = this._ui(this.scene.add.text(W - 192, TOOLBAR_Y + TOOLBAR_H / 2, '', {
            fontFamily: THEME.fontMono, fontSize: this._fs(9), color: '#c8a030',
            stroke: '#000000', strokeThickness: 2,
        }).setOrigin(0, 0.5).setDepth(28));

        this.scene.enemyCount = this._ui(this.scene.add.text(W - 192, TOOLBAR_Y + TOOLBAR_H / 2 - 14, '', {
            fontFamily: THEME.fontMono, fontSize: this._fs(9), color: '#ee6655',
            stroke: '#000000', strokeThickness: 2,
        }).setOrigin(0, 0.5).setDepth(28));

        const pBtn = this._ui(this.scene.add.text(W - 52, TOOLBAR_Y + TOOLBAR_H / 2, '⏸', {
            fontFamily: THEME.fontMono, fontSize: this._fs(14), color: '#cccccc',
        }).setOrigin(0.5).setDepth(28).setInteractive({ cursor: 'pointer' }));
        pBtn.on('pointerover', () => pBtn.setColor('#ffffff'));
        pBtn.on('pointerout',  () => pBtn.setColor('#cccccc'));
        pBtn.on('pointerdown', () => {
            this.scene.isPaused = !this.scene.isPaused;
            pBtn.setText(this.scene.isPaused ? '▶' : '⏸');
        });
        this._pauseBtn = pBtn;

        const sBtn = this._ui(this.scene.add.text(W - 18, TOOLBAR_Y + TOOLBAR_H / 2, '1×', {
            fontFamily: THEME.fontMono, fontSize: this._fs(11), color: '#ffdd44',
        }).setOrigin(0.5).setDepth(28).setInteractive({ cursor: 'pointer' }));
        sBtn.on('pointerover', () => sBtn.setColor('#ffee88'));
        sBtn.on('pointerout',  () => sBtn.setColor('#ffdd44'));
        sBtn.on('pointerdown', () => {
            this.scene.tickSpeed = (this.scene.tickSpeed % 5) + 1;
            sBtn.setText(`${this.scene.tickSpeed}×`);
        });

        this.scene.foodText    = null;
        this.scene.woodText    = null;
        this.scene.stoneText   = null;
        this.scene.workerInfo  = null;
        this.scene.woolText    = null;
        this.scene.phaseTag    = null;
        this.scene.selInfo     = null;
        this.scene.timerText   = null;
        this.scene.timerBarGfx = null;
    }

    _onToolClick(id) {
        if (this._activePanel === id) {
            this._activePanel = null;
            if (id === 'orders') {
                this.scene.slateModeType  = null;
                this.scene.slateNodeTypes = null;
            }
            if (id === 'architect' || id === 'zones') {
                this.scene.constructType  = null;
                this.scene.wallMode       = false;
                this.scene.wallRectMode   = false;
                this.scene.roadMode       = false;
                this.scene.zoneMode       = null;
                this.scene.hoverGfx?.clear();
            }
        } else {
            this._activePanel = id;
            if (id === 'zones')     this.scene.buildCat = 'Zones';
            else if (id === 'architect' && this.scene.buildCat === 'Zones')
                                    this.scene.buildCat = 'Structures';
            if (id === 'people')    this._censusPage = 0;
        }
        this.updateUI();
    }

    // ─── Update ──────────────────────────────────────────────────────────────

    updateUI() {
        if (!this.L) return;
        this._hrowDrag = null;
        this._updateResources();
        this._renderSheet();
        this._renderModeHint();
        this._renderInventoryColumn();
        this._updateCursor();
        Object.entries(this._toolbarBtnDrawers ?? {}).forEach(([id, draw]) => {
            draw(this._activePanel === id);
        });
    }

    _renderSheet() {
        const { W, TOOLBAR_Y, INSP_W, FLOAT_W } = this.L;

        const sel       = this.scene.units.filter(u => u.selected && !u.isEnemy);
        const construct = this.scene.selectedConstruct;
        const workers   = sel.filter(u => u.type === 'worker' && u.age >= 2);
        const military  = sel.filter(u => u.type !== 'worker');
        const scouts    = sel.filter(u => u.type === 'scout');

        const hasSelection = sel.length > 0 || !!construct ||
            !!this.scene.selectedNode || !!this.scene.selectedZoneTile;
        const hasTool = this._activePanel !== null;

        const panelH    = Math.min(this.L.INSP_MAX_H, TOOLBAR_Y - 4);
        const panelTopY = TOOLBAR_Y - panelH;

        this._clearInfo();
        this._clearTabs();
        this._clearHrow();
        this._hideTooltip();
        if (this._actionPanel) { this._actionPanel.destroy(); this._actionPanel = null; }

        if (hasSelection) {
            // Inspector panel — left side
            this._drawPanelBg(o => this._inf(o), 0, panelTopY, INSP_W, panelH);
            this.L.INFO_X  = 0;
            this.L.INFO_W  = INSP_W;
            this.L.panelY  = panelTopY;
            this.L.PANEL_H = panelH;
            this.L.KEY_H   = 0;
            this.L.QB_H    = 0;
            this._renderInfoPane();

            // Float panel — right of inspector
            // Skip for unit-only selections and for zone-tile-only selections (info pane handles those)
            const onlyUnits = sel.length > 0 && !construct && !this.scene.selectedZoneTile && !hasTool;
            const onlyZone  = !!this.scene.selectedZoneTile && sel.length === 0 && !construct;
            if (!onlyUnits && !onlyZone) {
                const rx = INSP_W, rw = FLOAT_W;
                this._drawPanelBg(o => this._tab(o), rx, panelTopY, rw, panelH);
                this.L.ACT_X = rx;
                this.L.ACT_W = rw;

                if (hasTool) {
                    this._renderActiveToolPanel(rx, panelTopY, rw, panelH);
                } else if (construct) {
                    this._renderConstructActions(construct, rx, panelTopY, rw, panelH);
                }
            }

        } else if (hasTool) {
            // While actively painting a zone, suppress the panel — mode hint bar above toolbar is enough
            if (this._activePanel === 'zones' && this.scene.zoneMode) return;
            const compact = this._activePanel === 'zones' || this._activePanel === 'orders';
            const fw = compact ? Math.min(200, W) : Math.min(FLOAT_W, W);
            this._drawPanelBg(o => this._tab(o), 0, panelTopY, fw, panelH);
            this.L.ACT_X   = 0;
            this.L.ACT_W   = fw;
            this.L.panelY  = panelTopY;
            this.L.PANEL_H = panelH;
            this.L.KEY_H   = 0;
            this.L.QB_H    = 0;
            this._renderActiveToolPanel(0, panelTopY, fw, panelH);
        }
    }

    _drawPanelBg(addFn, x, y, w, h) {
        const g = addFn(this.scene.add.graphics().setDepth(20));
        g.fillStyle(0x130e06, 0.97).fillRect(x, y, w, h);
        g.lineStyle(2, 0xc8a030, 0.55).lineBetween(x, y, x + w, y);
        if (x > 0) g.lineStyle(1, 0x3a2e18, 0.5).lineBetween(x, y, x, y + h);
    }

    // ─── Tool Panel Routing ───────────────────────────────────────────────────

    _renderActiveToolPanel(x, y, w, h) {
        if (this._activePanel === 'architect') {
            if (this.scene.materialPickMode) {
                this._renderMaterialPickPanel(this.scene.materialPickMode, x, y, w, h);
            } else {
                this._renderBuildPanel(x, y, w, h);
            }
        } else if (this._activePanel === 'zones') {
            this._renderZonesPanel(x, y, w, h);
        } else if (this._activePanel === 'people') {
            this._renderPeoplePanel(x, y, w, h);
        } else if (this._activePanel === 'orders') {
            this._renderOrdersPanel(x, y, w, h);
        }
    }

    // ─── Build Panel ─────────────────────────────────────────────────────────

    _renderBuildPanel(x, y, w, h) {
        const CAT_W = 140;
        const gap   = 3;
        const cats  = [...Object.keys(CONSTRUCT_CATS)];
        const cols  = 2;
        const rows  = Math.ceil(cats.length / cols);
        const btnW  = Math.floor((CAT_W - gap * (cols + 1)) / cols);
        const btnH  = Math.floor((h - gap * (rows + 1)) / rows);

        // Category buttons (left column)
        cats.forEach((cat, i) => {
            const col   = i % cols;
            const row   = Math.floor(i / cols);
            const bx    = x + gap + col * (btnW + gap);
            const by    = y + gap + row * (btnH + gap);
            const active = this.scene.buildCat === cat;

            const bg = this._tab(this.scene.add.graphics().setDepth(21));
            bg.fillStyle(active ? 0x4a6070 : 0x1e1a10, 0.92).fillRect(bx, by, btnW, btnH);
            if (active) {
                bg.lineStyle(2, 0xc8a030, 0.8).strokeRect(bx, by, btnW, btnH);
                bg.lineStyle(2, 0xc8a030, 1.0).lineBetween(bx, by, bx + btnW, by);
            } else {
                bg.lineStyle(1, 0x3a2e18, 0.4).strokeRect(bx, by, btnW, btnH);
            }

            const hov = this._tab(this.scene.add.graphics().setDepth(22).setAlpha(0));
            hov.fillStyle(0xffffff, 0.1).fillRect(bx, by, btnW, btnH);

            this._tab(this.scene.add.text(bx + btnW / 2, by + btnH / 2, cat, {
                fontFamily: THEME.fontMono, fontSize: '10px',
                color: active ? '#e8d8a0' : '#7a6a3a',
                align: 'center', wordWrap: { width: btnW - 4 },
            }).setOrigin(0.5).setDepth(22));

            const z = this._tab(this.scene.add.zone(bx + btnW / 2, by + btnH / 2, btnW, btnH)
                .setInteractive({ cursor: 'pointer' }).setDepth(23));
            z.on('pointerover', () => hov.setAlpha(1));
            z.on('pointerout',  () => hov.setAlpha(0));
            z.on('pointerdown', () => {
                this.scene.buildCat = cat;
                this._panelScrollX['architect'] = 0;
                this.updateUI();
            });
        });

        // Divider
        const dg = this._tab(this.scene.add.graphics().setDepth(21));
        dg.lineStyle(1, 0x3a2e18, 0.6).lineBetween(x + CAT_W, y, x + CAT_W, y + h);

        // Construct items for active category (3-row square grid)
        const rx = x + CAT_W + gap + 1;
        const rw = w - CAT_W - gap - 1;
        const items = this._buildCatItems();
        this._renderItemGrid(rx, y, rw, h, items);
    }

    _buildCatItems() {
        const s = this.scene;
        if (s.buildCat === 'Furniture') {
            return (CONSTRUCT_CATS['Furniture'] ?? []).filter(t => CONSTRUCTS[t]).map(type => {
                const def = CONSTRUCTS[type];
                const isActive = s.placementType === type && s.constructMode;
                return {
                    label: def.label, sublabel: def.desc,
                    color: isActive ? def.color : Math.max(0, (def.color & 0xfefefe) >> 1),
                    active: isActive,
                    callback: () => {
                        if (isActive) { s.constructMode = false; s.placementType = null; }
                        else { s.constructMode = true; s.placementType = type; s.constructType = null; s.roadMode = false; s.wallMode = false; }
                        s.hoverGfx?.clear();
                        this.updateUI();
                    },
                };
            });
        }
        // Delegate to the full _buildMenuItems for other cats (Civil/Industry/Military)
        return this._buildMenuItems();
    }

    // ─── Zones Panel ─────────────────────────────────────────────────────────

    _renderZonesPanel(x, y, w, h) {
        const prevCat = this.scene.buildCat;
        this.scene.buildCat = 'Zones';
        const items = this._buildMenuItems();
        this.scene.buildCat = prevCat;
        this._renderItemGrid(x, y, w, h, items);
    }

    // ─── Resources Panel ─────────────────────────────────────────────────────

    _renderResourcesPanel(x, y, w, h) {
        const r  = this.scene.resources  ?? {};
        const sm = this.scene.storageMax ?? {};

        const visible = RESOURCE_DEFS.filter(d => (r[d.key] ?? 0) > 0).map(d => {
            const count = r[d.key] ?? 0;
            const max   = sm[d.key];
            return {
                label:    `${d.icon}\n${d.label}`,
                sublabel: max ? `${count}/${max}` : String(count),
                color:    0x0e1828,
                active:   false,
                callback: () => {},
            };
        });

        if (visible.length === 0) {
            this._tab(this.scene.add.text(x + w / 2, y + h / 2, 'No resources yet', {
                fontFamily: THEME.fontMono, fontSize: '11px', color: '#443c2c',
            }).setOrigin(0.5).setDepth(22));
            return;
        }

        this._renderHRow(x, y, w, h, visible, 'resources');
    }

    // ─── People Panel ────────────────────────────────────────────────────────

    _renderPeoplePanel(x, y, w, h) {
        const workers = this.scene.units
            .filter(u => !u.isEnemy && u.hp > 0 && u.type === 'worker')
            .sort((a, b) => b.age - a.age || (a.name ?? '').localeCompare(b.name ?? ''));

        // Roster / Work toggle (RimWorld-style work-priority matrix lives under "Work")
        if (!['roster', 'work'].includes(this._peopleTab)) this._peopleTab = 'roster';
        const TABH = 20, tw = Math.floor(w / 2);
        [['roster', 'Roster'], ['work', 'Work']].forEach(([id, lbl], i) => {
            const bx = x + i * tw, on = this._peopleTab === id;
            const g = this._tab(this.scene.add.graphics().setDepth(21));
            g.fillStyle(on ? 0x2a3a4a : 0x141009, 0.95).fillRect(bx, y, tw, TABH);
            g.lineStyle(1, 0x3a2e18, 0.6).strokeRect(bx, y, tw, TABH);
            this._tab(this.scene.add.text(bx + tw / 2, y + TABH / 2, lbl, {
                fontFamily: THEME.fontMono, fontSize: '9px', color: on ? '#e8d8a0' : '#7a6a4a',
            }).setOrigin(0.5).setDepth(22));
            const z = this._tab(this.scene.add.zone(bx + tw / 2, y + TABH / 2, tw, TABH)
                .setInteractive({ cursor: 'pointer' }).setDepth(23));
            z.on('pointerdown', () => { this._peopleTab = id; this._censusPage = 0; this.updateUI(); });
        });
        y += TABH; h -= TABH;
        if (this._peopleTab === 'work') { this._renderWorkGrid(x, y, w, h); return; }

        const HDR_H  = 22;
        const ROW_H  = Math.floor((h - HDR_H) / Math.max(1, Math.floor((h - HDR_H) / 24)));
        const perPage = Math.max(1, Math.floor((h - HDR_H) / ROW_H));
        const totalPages = Math.ceil(workers.length / perPage) || 1;
        this._censusPage = Math.max(0, Math.min(this._censusPage, totalPages - 1));
        const paged = workers.slice(this._censusPage * perPage, (this._censusPage + 1) * perPage);

        const pad = 8;

        // Header
        const hg = this._tab(this.scene.add.graphics().setDepth(21));
        hg.fillStyle(0x0e1420, 0.9).fillRect(x, y, w, HDR_H);
        hg.lineStyle(1, 0x3a2e18, 0.5).lineBetween(x, y + HDR_H, x + w, y + HDR_H);

        this._tab(this.scene.add.text(x + pad, y + HDR_H / 2,
            `👥 ${workers.length} worker${workers.length !== 1 ? 's' : ''}`, {
                fontFamily: THEME.fontMono, fontSize: '10px', color: '#c8a030',
            }).setOrigin(0, 0.5).setDepth(22));

        if (totalPages > 1) {
            this._tab(this.scene.add.text(x + w / 2, y + HDR_H / 2,
                `${this._censusPage + 1} / ${totalPages}`, {
                    fontFamily: THEME.fontMono, fontSize: '9px', color: '#7a6850',
                }).setOrigin(0.5, 0.5).setDepth(22));

            if (this._censusPage > 0) {
                const pb = this._tab(this.scene.add.text(x + w - 70, y + HDR_H / 2, '◂', {
                    fontFamily: THEME.fontMono, fontSize: '14px', color: '#9a8858',
                }).setOrigin(0.5, 0.5).setDepth(22).setInteractive({ cursor: 'pointer' }));
                pb.on('pointerdown', () => { this._censusPage--; this.updateUI(); });
            }
            if (this._censusPage < totalPages - 1) {
                const nb = this._tab(this.scene.add.text(x + w - 40, y + HDR_H / 2, '▸', {
                    fontFamily: THEME.fontMono, fontSize: '14px', color: '#9a8858',
                }).setOrigin(0.5, 0.5).setDepth(22).setInteractive({ cursor: 'pointer' }));
                nb.on('pointerdown', () => { this._censusPage++; this.updateUI(); });
            }
        }

        // Column widths
        const nameW   = Math.floor(w * 0.28);
        const ageW    = Math.floor(w * 0.10);
        const roleW   = Math.floor(w * 0.22);
        const hpBarW  = w - nameW - ageW - roleW - pad * 5;

        const colX = {
            name: x + pad,
            age:  x + pad + nameW + pad,
            role: x + pad + nameW + pad + ageW + pad,
            hp:   x + pad + nameW + pad + ageW + pad + roleW + pad,
        };

        // Header labels
        const hdrs = [
            { x: colX.name, label: 'Name' },
            { x: colX.age,  label: 'Age' },
            { x: colX.role, label: 'Role' },
            { x: colX.hp,   label: 'HP' },
        ];
        // (skipped for compactness — rows self-describe)

        // Worker rows
        paged.forEach((u, i) => {
            const ry = y + HDR_H + i * ROW_H;

            // Row separator
            if (i > 0) {
                const sg = this._tab(this.scene.add.graphics().setDepth(21));
                sg.lineStyle(1, 0x2a2218, 0.5).lineBetween(x, ry, x + w, ry);
            }

            const ageLabel = u.age < 1 ? 'Child' : u.age < 2 ? 'Youth' : 'Adult';
            const roleLabel = (u.age < 1) ? '—' : (u.role ? u.role[0].toUpperCase() + u.role.slice(1) : 'Idle');
            const hpRatio  = Math.max(0, Math.min(1, (u.hp ?? 0) / (u.maxHp ?? 1)));
            const hpCol    = hpRatio > 0.6 ? 0x44aa44 : hpRatio > 0.3 ? 0xccaa33 : 0xcc3311;

            // Name (clickable — pan to unit)
            const nameTxt = this._tab(this.scene.add.text(colX.name, ry + ROW_H / 2, u.name ?? '?', {
                fontFamily: THEME.fontMono, fontSize: '9px', color: '#d4c8a8',
            }).setOrigin(0, 0.5).setDepth(22).setInteractive({ cursor: 'pointer' }));
            nameTxt.on('pointerover', () => nameTxt.setColor('#ffffff'));
            nameTxt.on('pointerout',  () => nameTxt.setColor('#d4c8a8'));
            nameTxt.on('pointerdown', () => {
                const cam = this.scene.cameras.main;
                cam.pan(u.x, u.y, 300, 'Sine.easeOut');
                cam.zoomTo(1.5, 300);
                this._activePanel = null;
                this.updateUI();
            });

            this._tab(this.scene.add.text(colX.age, ry + ROW_H / 2, ageLabel, {
                fontFamily: THEME.fontMono, fontSize: '9px', color: '#9a90aa',
            }).setOrigin(0, 0.5).setDepth(22));

            this._tab(this.scene.add.text(colX.role, ry + ROW_H / 2, roleLabel, {
                fontFamily: THEME.fontMono, fontSize: '9px', color: '#ccbb88',
            }).setOrigin(0, 0.5).setDepth(22));

            // HP bar
            const barY = ry + Math.floor((ROW_H - 6) / 2);
            const bg2  = this._tab(this.scene.add.graphics().setDepth(21));
            bg2.fillStyle(0x222222, 0.8).fillRect(colX.hp, barY, hpBarW, 6);
            bg2.fillStyle(hpCol, 0.9).fillRect(colX.hp, barY, Math.round(hpBarW * hpRatio), 6);
        });

        if (workers.length === 0) {
            this._tab(this.scene.add.text(x + w / 2, y + HDR_H + (h - HDR_H) / 2, 'No workers yet', {
                fontFamily: THEME.fontMono, fontSize: '10px', color: '#443c2c',
            }).setOrigin(0.5).setDepth(22));
        }
    }

    // ─── Orders Panel ────────────────────────────────────────────────────────

    _renderOrdersPanel(x, y, w, h) {
        const s       = this.scene;
        const sel     = s.units.filter(u => u.selected && !u.isEnemy);
        const workers = sel.filter(u => u.type === 'worker' && u.age >= 2);

        if (workers.length > 0) {
            // Unit-specific orders
            const items = [
                {
                    label: '🏠\nRecall Home', color: 0x1a2a3a,
                    callback: () => {
                        workers.forEach(u => {
                            const home = s.constructs.find(b => b.id === u.homeConstructId);
                            if (home) u.moveTo = { x: (home.tx + home.width / 2) * TILE, y: MAP_OY + (home.ty + home.height / 2) * TILE };
                            u.taskType = null; u.targetNode = null;
                        });
                        s.deselect(); this.updateUI();
                    },
                },
                {
                    label: '⚔\nGuard Tower', color: 0x1a2535,
                    callback: () => {
                        const towers = s.constructs.filter(b => b.built && !b.faction && b.type === 'watchtower');
                        if (towers.length > 0) s.orderWorkersToConstruct(towers[0]);
                        s.deselect(); this.updateUI();
                    },
                },
            ];
            this._renderItemGrid(x, y, w, h, items);
            return;
        }

        // Generic harvest slate tools
        const SLATE_TOOLS = [
            { key: 'woodcutter', icon: '🪵', label: 'Chop\nTrees',
              types: ['small_tree', 'large_tree'], color: 0x5a3a18 },
            { key: 'miner', icon: '⛏', label: 'Mine\nStone',
              types: ['small_boulder', 'large_boulder'], color: 0x444448 },
            { key: 'forager', icon: '🍄', label: 'Forage\nPlants',
              types: ['berry_bush', 'wild_garden', 'olive_grove', 'grape_vine', 'wild_wheat', 'fishing_spot'], color: 0x2a4a22 },
            { key: 'hunter', icon: '🏹', label: 'Hunt\nGame',
              types: ['deer', 'sheep'], color: 0x553322 },
        ];

        const slatedCount = s.resNodes?.filter(n => n.slated).length ?? 0;
        const items = SLATE_TOOLS.map(t => {
            const active = s.slateModeType === t.key;
            return {
                label:    `${t.icon}\n${t.label}`,
                sublabel: active ? 'click nodes' : null,
                color:    active ? t.color + 0x222222 : t.color,
                active,
                callback: () => {
                    s.slateModeType  = active ? null : t.key;
                    s.slateNodeTypes = active ? null : t.types;
                    s.orderMode = null;   // harvest + order tools are mutually exclusive
                    this.updateUI();
                },
            };
        });

        // RimWorld-style designation tools: drag a rectangle (or tap) to apply.
        const ORDER_TOOLS = [
            { key: 'deconstruct', icon: '🛠', label: 'Decon-\nstruct', color: 0x4a2a12 },
            { key: 'forbid',      icon: '🚫', label: 'Forbid', color: 0x402038 },
            { key: 'cancel',      icon: '✖',  label: 'Cancel', color: 0x3a2a10 },
        ];
        for (const t of ORDER_TOOLS) {
            const active = s.orderMode === t.key;
            items.push({
                label:    `${t.icon}\n${t.label}`,
                sublabel: active ? 'drag area' : null,
                color:    active ? t.color + 0x222222 : t.color,
                active,
                callback: () => {
                    s.orderMode      = active ? null : t.key;
                    s.slateModeType  = null;   // mutually exclusive with harvest tools
                    s.slateNodeTypes = null;
                    this.updateUI();
                },
            });
        }

        if (slatedCount > 0) {
            items.push({
                label: `✕\nClear\n(${slatedCount})`, color: 0x3a1a10,
                callback: () => {
                    s.resNodes?.forEach(n => { n.slated = false; n.slateType = null; s.mapManager?.redrawNode(n); });
                    this.updateUI();
                },
            });
        }

        this._renderItemGrid(x, y, w, h, items);
    }

    // ─── Inventory Column ─────────────────────────────────────────────────────

    _inv(obj) {
        this.scene.cameras.main.ignore(obj);
        this._inventoryObjs.push(obj);
        this._inventoryRoot.add(obj);
        return obj;
    }

    _clearInventory() {
        this._inventoryObjs.forEach(o => o.destroy());
        this._inventoryObjs = [];
    }

    _renderInventoryColumn() {
        this._clearInventory();
        const r = this.scene.resources ?? {};

        // Build tree from RESOURCE_DEFS: split each key on '.' to form hierarchy
        const root = {};
        for (const def of RESOURCE_DEFS) {
            const count = r[def.key] ?? 0;
            if (count <= 0) continue;
            const parts = def.key.split('.');
            let cur = root;
            for (let i = 0; i < parts.length; i++) {
                const p = parts[i];
                if (!cur[p]) cur[p] = { _def: null, _count: 0, _children: {} };
                if (i === parts.length - 1) { cur[p]._def = def; cur[p]._count = count; }
                cur = cur[p]._children;
            }
        }

        // Flatten into display rows, honouring collapse state
        const rows = [];
        const visit = (nodeMap, pathPrefix, depth) => {
            for (const [key, item] of Object.entries(nodeMap)) {
                const fullPath  = pathPrefix ? `${pathPrefix}.${key}` : key;
                const childKeys = Object.keys(item._children);
                const isCategory  = childKeys.length > 0;
                const isCollapsed = this._inventoryCollapsed[fullPath] ?? false;
                rows.push({ key, fullPath, depth, isCategory, isCollapsed, def: item._def, count: item._count });
                if (isCategory && !isCollapsed) visit(item._children, fullPath, depth + 1);
            }
        };
        visit(root, '', 0);
        if (rows.length === 0) return;

        const sx    = 10;
        const sy    = 10;
        const ROW_H = 20;
        const IND   = 12;   // px indent per depth level
        const PW    = 162;  // panel width

        rows.forEach((row, i) => {
            const rx  = sx + row.depth * IND;
            const ry  = sy + 4 + i * ROW_H;
            const mid = ry + ROW_H / 2;

            if (row.isCategory) {
                const arrow = row.isCollapsed ? '▶' : '▼';
                const arrowBtn = this._inv(this.scene.add.text(rx, mid, arrow, {
                    fontFamily: THEME.fontMono, fontSize: '9px', color: '#c8a030',
                }).setOrigin(0, 0.5).setDepth(32).setInteractive({ cursor: 'pointer' }));
                arrowBtn.on('pointerdown', () => {
                    this._inventoryCollapsed[row.fullPath] = !row.isCollapsed;
                    this.updateUI();
                });

                // Category label — show icon too if this node is also a resource
                const prefix = row.def?.icon ? row.def.icon + ' ' : '';
                const label  = row.def?.label ?? row.key;
                this._inv(this.scene.add.text(rx + 13, mid, `${prefix}${label}`, {
                    fontFamily: THEME.fontMono,
                    fontSize: row.depth === 0 ? '10px' : '9px',
                    color: row.depth === 0 ? '#e8d080' : '#c8b870',
                }).setOrigin(0, 0.5).setDepth(32));

                // Count alongside the category label (when it's also a resource node)
                if (row.count > 0) {
                    this._inv(this.scene.add.text(sx + PW - 2, mid, String(row.count), {
                        fontFamily: THEME.fontMono, fontSize: '9px', color: '#88bb66',
                    }).setOrigin(1, 0.5).setDepth(32));
                }
            } else {
                // Leaf resource row
                const icon  = row.def?.icon  ?? '•';
                const label = row.def?.label ?? row.key;
                this._inv(this.scene.add.text(rx, mid, `${icon} ${label}`, {
                    fontFamily: THEME.fontMono, fontSize: '9px', color: '#a8a080',
                }).setOrigin(0, 0.5).setDepth(32));

                this._inv(this.scene.add.text(sx + PW - 2, mid, String(row.count), {
                    fontFamily: THEME.fontMono, fontSize: '9px', color: '#88bb66',
                }).setOrigin(1, 0.5).setDepth(32));
            }
        });
    }

    // ─── Item Grid (3-row square buttons) ────────────────────────────────────

    _splitIcon(label) {
        if (!label) return { icon: '', name: '' };
        const m = label.match(/^([\p{Emoji_Presentation}\p{Extended_Pictographic}✕✗✓•⛏🗡⚙⚔]+\s*)/u);
        if (m) return { icon: m[1].trim(), name: label.slice(m[1].length).trim() };
        return { icon: '', name: label };
    }

    _renderItemGrid(x, y, w, h, items) {
        if (!items || !items.length) return;
        const ROWS = 3;
        const gap  = 4;
        const sz   = Math.floor((h - gap * (ROWS + 1)) / ROWS);
        const cols  = Math.max(1, Math.floor((w - gap) / (sz + gap)));

        items.forEach((item, i) => {
            const col = i % cols;
            const row = Math.floor(i / cols);
            if (row >= ROWS) return;

            const bx = x + gap + col * (sz + gap);
            const by = y + gap + row * (sz + gap);

            const active = !!item.active;
            const dimmed = !!item.dimmed;

            const g = this._tab(this.scene.add.graphics().setDepth(21));
            g.fillStyle(item.color ?? 0x1a1610, dimmed ? 0.30 : 0.88).fillRect(bx, by, sz, sz);
            if (active) {
                g.lineStyle(2, 0xffdd44, 0.9).strokeRect(bx, by, sz, sz);
                g.lineStyle(2, 0xffdd44, 1.0).lineBetween(bx, by, bx + sz, by);
            } else {
                g.lineStyle(1, 0xc8a030, 0.20).strokeRect(bx, by, sz, sz);
            }

            const hov = this._tab(this.scene.add.graphics().setDepth(22).setAlpha(0));
            hov.fillStyle(0xffffff, 0.1).fillRect(bx, by, sz, sz);

            const { icon, name } = this._splitIcon(item.label ?? '');
            const iconFS = `${Math.max(14, Math.floor(sz * 0.32))}px`;
            const nameFS = `${Math.max(8,  Math.floor(sz * 0.17))}px`;

            if (icon) {
                this._tab(this.scene.add.text(bx + sz / 2, by + sz * 0.33, icon, {
                    fontFamily: THEME.fontMono, fontSize: iconFS, align: 'center',
                }).setOrigin(0.5).setDepth(22));
                this._tab(this.scene.add.text(bx + sz / 2, by + sz * 0.72, name, {
                    fontFamily: THEME.fontMono, fontSize: nameFS,
                    color: dimmed ? '#554433' : '#d4c8a8',
                    align: 'center', wordWrap: { width: sz - 4 },
                }).setOrigin(0.5).setDepth(22));
            } else {
                this._tab(this.scene.add.text(bx + sz / 2, by + sz / 2, name, {
                    fontFamily: THEME.fontMono, fontSize: nameFS,
                    color: dimmed ? '#554433' : '#d4c8a8',
                    align: 'center', wordWrap: { width: sz - 4 },
                }).setOrigin(0.5).setDepth(22));
            }

            const z = this._tab(this.scene.add.zone(bx + sz / 2, by + sz / 2, sz, sz)
                .setInteractive({ cursor: dimmed ? 'default' : 'pointer' }).setDepth(23));
            z.on('pointerover', () => {
                hov.setAlpha(1);
                const ttTitle = name || item.label;
                const ttLines = [item.desc, item.sublabel].filter(Boolean).join('\n');
                if (ttTitle || ttLines) this._showTooltip(bx + sz / 2, by, ttTitle, ttLines);
            });
            z.on('pointerout',  () => { hov.setAlpha(0); this._hideTooltip(); });
            z.on('pointerdown', () => { if (!dimmed) item.callback?.(); });
        });
    }

    // ─── Tooltip ─────────────────────────────────────────────────────────────

    _showTooltip(cx, topY, title, body) {
        this._hideTooltip();
        const TW = 190, PAD = 6;
        const lineH   = 13;
        const bodyLines = body ? body.split('\n').filter(Boolean) : [];
        const th = PAD * 2 + 14 + (bodyLines.length ? bodyLines.length * lineH + 4 : 0);

        const { W } = this.L;
        let tx = cx - TW / 2;
        tx = Math.max(4, Math.min(W - TW - 4, tx));
        const ty = Math.max(4, topY - th - 4);

        const g = this._ui(this.scene.add.graphics().setDepth(50));
        g.fillStyle(0x0c0906, 0.97).fillRect(tx, ty, TW, th);
        g.lineStyle(1, 0xc8a030, 0.55).strokeRect(tx, ty, TW, th);
        this._tooltipObjs.push(g);

        const titleTxt = this._ui(this.scene.add.text(tx + PAD, ty + PAD, title, {
            fontFamily: THEME.fontMono, fontSize: '10px', color: '#e8d8a0', fontStyle: 'bold',
        }).setDepth(51));
        this._tooltipObjs.push(titleTxt);

        if (bodyLines.length) {
            const bodyTxt = this._ui(this.scene.add.text(tx + PAD, ty + PAD + 16, bodyLines.join('\n'), {
                fontFamily: THEME.fontMono, fontSize: '9px', color: '#aa9966',
                wordWrap: { width: TW - PAD * 2 },
            }).setDepth(51));
            this._tooltipObjs.push(bodyTxt);
        }
    }

    _hideTooltip() {
        this._tooltipObjs.forEach(o => o.destroy());
        this._tooltipObjs = [];
    }

    // ─── Horizontal Scroll Row ────────────────────────────────────────────────

    _hrow(obj) {
        this.scene.cameras.main.ignore(obj);
        this._hrowObjs.push(obj);
        this._tabRoot.add(obj);
        return obj;
    }

    _clearHrow() {
        this._hrowObjs.forEach(o => o.destroy());
        this._hrowObjs = [];
    }

    _renderHRow(x, y, w, h, items, key) {
        if (!items || !items.length) return;
        const sz = h - 8;
        const gap = 4;
        const totalW   = items.length * (sz + gap) - gap;
        const maxScroll = Math.max(0, totalW - w + 8);
        this._panelScrollX[key] = Math.max(0, Math.min(maxScroll, this._panelScrollX[key] ?? 0));

        const state = { x, y, w, h, items, key, sz, gap, maxScroll };

        // Render initial content
        this._renderHRowContent(state);

        // Interactive zone (tracked via _tab — cleaned up with other tab objects on next updateUI)
        const zone = this._tab(this.scene.add.zone(x + w / 2, y + h / 2, w, h)
            .setInteractive({ cursor: maxScroll > 0 ? 'grab' : 'pointer' }).setDepth(29));

        zone.on('pointerdown', ptr => {
            this._hrowDrag = { ...state, startX: ptr.x, startScroll: this._panelScrollX[key] };
        });

        zone.on('pointermove', ptr => {
            if (!this._hrowDrag || !ptr.isDown) return;
            const dx = this._hrowDrag.startX - ptr.x;
            this._panelScrollX[key] = Math.max(0, Math.min(maxScroll, this._hrowDrag.startScroll + dx));
            this._clearHrow();
            this._renderHRowContent(state);
        });

        zone.on('pointerup', ptr => {
            const drag = this._hrowDrag;
            this._hrowDrag = null;
            if (!drag) return;
            const moved = Math.abs(ptr.x - drag.startX) > 6;
            if (moved) return;
            // Click: find item under pointer
            const scrollX = this._panelScrollX[key];
            const relX    = ptr.x - x - 4 + scrollX;
            const idx     = Math.floor(relX / (sz + gap));
            if (idx >= 0 && idx < items.length && !items[idx].dimmed) {
                if (ptr.button === 2) items[idx].rightCallback?.();
                else                  items[idx].callback?.();
            }
        });

        zone.on('pointerout', () => { this._hrowDrag = null; });
    }

    _renderHRowContent({ x, y, w, h, items, key, sz, gap, maxScroll }) {
        const scrollX = this._panelScrollX[key] ?? 0;
        const pad = 4;
        const labelFS = `${Math.max(9, Math.floor(sz * 0.14))}px`;
        const subFS   = `${Math.max(8, Math.floor(sz * 0.11))}px`;

        items.forEach((item, i) => {
            const bx = x + pad + i * (sz + gap) - scrollX;
            const by = y + 4;

            if (bx + sz < x || bx > x + w) return; // outside visible area

            const active = !!item.active;
            const dimmed = !!item.dimmed;

            const g = this._hrow(this.scene.add.graphics().setDepth(21));
            g.fillStyle(item.color ?? 0x1a1610, dimmed ? 0.30 : 0.88).fillRect(bx, by, sz, sz);
            if (active) {
                g.lineStyle(2, 0xffdd44, 0.9).strokeRect(bx, by, sz, sz);
                g.lineStyle(2, 0xffdd44, 1.0).lineBetween(bx, by, bx + sz, by);
            } else {
                g.lineStyle(1, 0xc8a030, 0.20).strokeRect(bx, by, sz, sz);
            }

            const hasSubLabel = !!item.sublabel;
            const labelY = by + sz * (hasSubLabel ? 0.40 : 0.50);

            this._hrow(this.scene.add.text(bx + sz / 2, labelY, item.label ?? '', {
                fontFamily: THEME.fontMono, fontSize: labelFS,
                color: dimmed ? '#554433' : '#d4c8a8',
                align: 'center', wordWrap: { width: sz - 4 },
            }).setOrigin(0.5).setDepth(22));

            if (hasSubLabel) {
                this._hrow(this.scene.add.text(bx + sz / 2, by + sz * 0.72, item.sublabel, {
                    fontFamily: THEME.fontMono, fontSize: subFS,
                    color: dimmed ? '#443322' : '#aa9966',
                    align: 'center', wordWrap: { width: sz - 4 },
                }).setOrigin(0.5).setDepth(22));
            }
        });

        // Scroll fade indicators
        if (scrollX > 0) {
            const fg = this._hrow(this.scene.add.graphics().setDepth(23));
            fg.fillStyle(0x130e06, 0.55).fillRect(x, y, 18, h);
            fg.fillStyle(0x130e06, 0.25).fillRect(x + 18, y, 8, h);
        }
        if (scrollX < maxScroll) {
            const fg = this._hrow(this.scene.add.graphics().setDepth(23));
            fg.fillStyle(0x130e06, 0.55).fillRect(x + w - 18, y, 18, h);
            fg.fillStyle(0x130e06, 0.25).fillRect(x + w - 26, y, 8, h);
        }
    }

    // ─── Mode hint ────────────────────────────────────────────────────────────

    _clearHint() {
        this._hintObjs.forEach(o => o.destroy());
        this._hintObjs = [];
    }

    _hint(obj) {
        this.scene.cameras.main.ignore(obj);
        this._hintObjs.push(obj);
        return obj;
    }

    _renderModeHint() {
        this._clearHint();
        const label = this._getModeLabel?.();
        if (!label) return;
        const { W, TOOLBAR_Y } = this.L;
        const H = 14;
        const { col, bg } = this._modeBarStyle?.() ?? { col: 0x555555, bg: 0x141414 };
        const g = this._hint(this.scene.add.graphics().setDepth(26));
        g.fillStyle(bg, 0.97).fillRect(0, TOOLBAR_Y - H, W, H);
        g.lineStyle(1, col, 0.5).lineBetween(0, TOOLBAR_Y - H, W, TOOLBAR_Y - H);
        this._hint(this.scene.add.text(W / 2, TOOLBAR_Y - H / 2, label, {
            fontFamily: THEME.fontMono, fontSize: '9px', color: '#c8d4c0',
        }).setOrigin(0.5).setDepth(27));
    }

    // ─── Resource / time updates ──────────────────────────────────────────────

    updateEnemyCount() {
        const n = this.scene.units.filter(u => u.isEnemy && u.hp > 0).length;
        this.scene.enemyCount?.setText(n > 0 ? `⚔ ${n}` : '');
    }

    _updateResources() {
        this.scene.foodText?.setText?.('');
        this.scene.woodText?.setText?.('');
        this.scene.stoneText?.setText?.('');
        this.scene.workerInfo?.setText?.('');

        const phase      = this.scene.phase;
        const day        = this.scene.day;
        const seasonIdx  = Math.floor((day - 1) / SEASON_DAYS) % 4;
        const seasonName = SEASONS[seasonIdx];
        const year       = Math.floor((day - 1) / (SEASON_DAYS * 4)) + 1;
        const yearStr    = year > 1 ? `  Yr${year}` : '';
        const clock      = phase === 'NIGHT'
            ? clockString(this.scene.timerMs, NIGHT_DURATION, 12, 18)
            : clockString(this.scene.timerMs, DAY_DURATION,   12,  6);
        this.scene.dayInfo?.setText(phase === 'NIGHT'
            ? `🌙 D${day}  ${seasonName}${yearStr}  ${clock}`
            : `☀  D${day}  ${seasonName}${yearStr}  ${clock}`);

        this.updateEnemyCount();
    }

    tickClock() {
        if (!this.scene.dayInfo) return;
        const phase      = this.scene.phase;
        const day        = this.scene.day;
        const seasonIdx  = Math.floor((day - 1) / SEASON_DAYS) % 4;
        const seasonName = SEASONS[seasonIdx];
        const year       = Math.floor((day - 1) / (SEASON_DAYS * 4)) + 1;
        const clock      = phase === 'NIGHT'
            ? clockString(this.scene.timerMs, NIGHT_DURATION, 12, 18)
            : clockString(this.scene.timerMs, DAY_DURATION,   12,  6);
        const yearStr    = year > 1 ? `  Yr${year}` : '';
        this.scene.dayInfo.setText(phase === 'NIGHT'
            ? `🌙 D${day}  ${seasonName}${yearStr}  ${clock}`
            : `☀  D${day}  ${seasonName}${yearStr}  ${clock}`);
    }

    showSaveFlash() {
        const txt = this.scene.add.text(this.scene.SW - 45, 10, '💾 saved', {
            fontSize: '9px', color: '#88cc88', fontFamily: THEME.fontMono,
            stroke: '#000000', strokeThickness: 1,
        }).setDepth(25).setOrigin(1, 0);
        this.scene.tweens.add({ targets: txt, alpha: 0, duration: 1500, onComplete: () => txt.destroy() });
    }

    showToast(msg, color = '#b8e8a0') {
        if (!this.L) return;
        const { W, TOOLBAR_Y } = this.L;
        const baseY = TOOLBAR_Y - 10;
        this._toasts = (this._toasts ?? []).filter(t => t.active);
        // Bump existing toasts upward (position only — never touch their lifecycle, so the
        // guaranteed-destroy timer below is never orphaned when toasts stack rapidly).
        this._toasts.forEach(t => {
            this.scene.tweens.add({ targets: t, y: t.y - 20, duration: 150, ease: 'Sine.easeOut' });
        });
        const t = this.scene.add.text(W / 2, baseY, msg, {
            fontFamily: THEME.fontMono, fontSize: this._fs(10), color,
            stroke: '#000000', strokeThickness: 2, align: 'center',
            backgroundColor: '#000000a0', padding: { x: 6, y: 3 },
        }).setOrigin(0.5, 1).setDepth(60).setAlpha(0);
        this._ui(t);
        this._toasts.push(t);
        // Fade in (alpha only — vertical position is owned by the bump tween above).
        this.scene.tweens.add({ targets: t, alpha: 1, duration: 180, ease: 'Sine.easeOut' });
        // Guaranteed lifetime: a fixed timer fades the toast out and destroys it regardless of
        // any bump tweens, so a toast can never get stranded on screen.
        const kill = () => {
            if (!t.active) return;
            this.scene.tweens.add({
                targets: t, alpha: 0, duration: 600, ease: 'Sine.easeIn',
                onComplete: () => { t.destroy(); this._toasts = (this._toasts ?? []).filter(x => x !== t); },
            });
        };
        t._toastTimer = this.scene.time.delayedCall(2400, kill);
    }

    // ─── Right-click action menu ────────────────────────────────────────────────
    // A small screen-space popup of order buttons, anchored at the pointer. Items are
    // { label, color, exec } (exec performs the order). Includes a Cancel row. The
    // backdrop and ESC dismiss it; selecting a row runs exec then closes.
    showContextMenu(sx, sy, items) {
        if (!this.L) return;
        this._destroyCtxObjs();
        const objs = [];
        const reg = o => { this._ui(o); objs.push(o); return o; };
        const fsz = this._fs(11);
        const ROW = Math.max(24, Math.round(this.L.H * 0.034));
        const W = Phaser.Math.Clamp(Math.round(this.L.W * 0.18), 156, 248);
        const rows = items.map(it => ({ label: it.label, color: it.color ?? 0x242424, exec: it.exec }));
        rows.push({ label: '✕ Cancel', color: 0x2a1c10, exec: () => true });
        const H = rows.length * ROW;
        let x = sx, y = sy;
        if (x + W > this.L.W - 4) x = this.L.W - W - 4;
        if (y + H > this.L.H - 4) y = this.L.H - H - 4;
        x = Math.max(4, x); y = Math.max(4, y);

        // Full-screen backdrop: any outside click closes the menu.
        const back = reg(this.scene.add.rectangle(this.L.W / 2, this.L.H / 2, this.L.W, this.L.H, 0x000000, 0.001)
            .setDepth(61).setInteractive());
        back.on('pointerup', () => this.closeContextMenu());

        const bg = reg(this.scene.add.graphics().setDepth(62));
        bg.fillStyle(0x12100a, 0.97).fillRect(x, y, W, H);
        bg.lineStyle(1, 0x5a4010, 0.85).strokeRect(x, y, W, H);

        rows.forEach((r, i) => {
            const ry = y + i * ROW;
            const g = reg(this.scene.add.graphics().setDepth(63));
            g.fillStyle(r.color, 0.92).fillRect(x + 2, ry + 1, W - 4, ROW - 2);
            const hov = reg(this.scene.add.graphics().setDepth(64).setAlpha(0));
            hov.fillStyle(0xffffff, 0.14).fillRect(x + 2, ry + 1, W - 4, ROW - 2);
            reg(this.scene.add.text(x + 10, ry + ROW / 2, r.label, {
                fontFamily: THEME.fontMono, fontSize: fsz, color: '#e8dcc0',
            }).setOrigin(0, 0.5).setDepth(65));
            const z = reg(this.scene.add.zone(x + W / 2, ry + ROW / 2, W - 4, ROW - 2)
                .setInteractive({ cursor: 'pointer' }).setDepth(66));
            z.on('pointerover', () => hov.setAlpha(1));
            z.on('pointerout', () => hov.setAlpha(0));
            z.on('pointerup', () => { try { r.exec?.(); } finally { this.closeContextMenu(); } });
        });

        this._ctxMenu = objs;
        this._ctxMenuOpen = true;
    }

    _destroyCtxObjs() {
        if (this._ctxMenu) { for (const o of this._ctxMenu) o.destroy?.(); this._ctxMenu = null; }
    }

    closeContextMenu() {
        this._destroyCtxObjs();
        if (this._ctxMenuOpen) {
            // Hold the "open" gate through the rest of this input dispatch so the world
            // pointer handlers swallow the same click that closed us; clear it next tick.
            this.scene.time.delayedCall(0, () => { this._ctxMenuOpen = false; });
        }
    }

    // ─── Pause Menu ───────────────────────────────────────────────────────────

    showPauseMenu() {
        if (this._pauseMenuOpen) return;
        this._pauseMenuOpen = true;
        this._wasPaused = this.scene.isPaused;
        this.scene.isPaused = true;

        const W = this.scene.SW, H = this.scene.SH;
        const mw = Math.min(280, W * 0.7);
        const mh = 210;
        const mx = (W - mw) / 2, my = (H - mh) / 2;
        const objs = [];

        const dim = this._ui(this.scene.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.72).setDepth(200).setInteractive());
        const box = this._ui(this.scene.add.rectangle(mx + mw / 2, my + mh / 2, mw, mh, 0x120e08, 1).setDepth(201).setInteractive());
        const border = this._ui(this.scene.add.graphics().setDepth(202));
        border.lineStyle(2, 0xc8a030, 0.9).strokeRect(mx, my, mw, mh);
        objs.push(dim, box, border);

        const title = this._ui(this.scene.add.text(mx + mw / 2, my + 18, '⏸  PAUSED', {
            fontSize: '18px', color: '#ffdd88', fontFamily: THEME.fontMono,
            stroke: '#000000', strokeThickness: 3,
        }).setOrigin(0.5, 0).setDepth(203));
        objs.push(title);

        const sep = this._ui(this.scene.add.graphics().setDepth(202));
        sep.lineStyle(1, 0x5a4010, 0.7).lineBetween(mx + 16, my + 44, mx + mw - 16, my + 44);
        objs.push(sep);

        const hint = this._ui(this.scene.add.text(mx + mw / 2, my + mh - 14, 'ESC to resume', {
            fontSize: '9px', color: '#7a6a50', fontFamily: THEME.fontMono,
        }).setOrigin(0.5, 1).setDepth(203));
        objs.push(hint);

        const BTN_W = mw - 40, BTN_H = 30, BTN_X = mx + 20;
        const buttons = [
            { label: '💾  Save Game',    action: () => { this.scene._saveGame(); this.showToast('Game saved', '#88cc88'); } },
            { label: '⚙  Settings',      action: () => { this.hidePauseMenu(); this.showSettingsPanel(); } },
            { label: '⏏  Exit to Menu',  action: () => { this.hidePauseMenu(); window.location.reload(); } },
        ];

        buttons.forEach((b, i) => {
            const by = my + 58 + i * (BTN_H + 10);
            const bg = this._ui(this.scene.add.graphics().setDepth(203));
            bg.fillStyle(0x1e1608, 1).fillRect(BTN_X, by, BTN_W, BTN_H);
            bg.lineStyle(1, 0x5a4010, 0.8).strokeRect(BTN_X, by, BTN_W, BTN_H);
            const txt = this._ui(this.scene.add.text(BTN_X + BTN_W / 2, by + BTN_H / 2, b.label, {
                fontSize: '13px', color: '#ddcc88', fontFamily: THEME.fontMono,
            }).setOrigin(0.5).setDepth(204));
            const zone = this._ui(this.scene.add.zone(BTN_X + BTN_W / 2, by + BTN_H / 2, BTN_W, BTN_H)
                .setDepth(205).setInteractive({ cursor: 'pointer' }));
            zone.on('pointerover',  () => { bg.clear(); bg.fillStyle(0x3a2c14, 1).fillRect(BTN_X, by, BTN_W, BTN_H); bg.lineStyle(1, 0xc8a030, 0.8).strokeRect(BTN_X, by, BTN_W, BTN_H); txt.setColor('#ffffff'); });
            zone.on('pointerout',   () => { bg.clear(); bg.fillStyle(0x1e1608, 1).fillRect(BTN_X, by, BTN_W, BTN_H); bg.lineStyle(1, 0x5a4010, 0.8).strokeRect(BTN_X, by, BTN_W, BTN_H); txt.setColor('#ddcc88'); });
            zone.on('pointerdown',  () => b.action());
            objs.push(bg, txt, zone);
        });

        this._pauseMenuObjs = objs;
        this._pauseBtn?.setText('▶');
    }

    _saveSettings(patch) {
        const cur = (() => { try { return JSON.parse(localStorage.getItem('epochs_settings') ?? '{}'); } catch { return {}; } })();
        localStorage.setItem('epochs_settings', JSON.stringify({ ...cur, ...patch }));
    }

    showSettingsPanel() {
        if (this._settingsMenuOpen) return;
        this._settingsMenuOpen = true;
        const s = this.scene;
        const W = s.SW, H = s.SH;
        const mw = Math.min(310, W * 0.75);
        const mh = 322;
        const mx = (W - mw) / 2, my = (H - mh) / 2;
        const objs = [];

        const dim  = this._ui(s.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.72).setDepth(200).setInteractive());
        const box  = this._ui(s.add.rectangle(mx + mw / 2, my + mh / 2, mw, mh, 0x120e08, 1).setDepth(201).setInteractive());
        const bord = this._ui(s.add.graphics().setDepth(202));
        bord.lineStyle(2, 0xc8a030, 0.9).strokeRect(mx, my, mw, mh);
        objs.push(dim, box, bord);

        objs.push(this._ui(s.add.text(mx + mw / 2, my + 16, '⚙  SETTINGS', {
            fontSize: '16px', color: '#ffdd88', fontFamily: THEME.fontMono,
            stroke: '#000000', strokeThickness: 3,
        }).setOrigin(0.5, 0).setDepth(203)));

        const sep = this._ui(s.add.graphics().setDepth(202));
        sep.lineStyle(1, 0x5a4010, 0.7).lineBetween(mx + 16, my + 42, mx + mw - 16, my + 42);
        objs.push(sep);

        const PAD = 16, ROW_H = 30, labelW = 96;
        const rowX = mx + PAD, contentW = mw - PAD * 2;
        let ry = my + 52;

        const addRow = (label, options, getCurrent, onSelect) => {
            objs.push(this._ui(s.add.text(rowX, ry + ROW_H / 2, label, {
                fontSize: '12px', color: '#aaa090', fontFamily: THEME.fontMono,
            }).setOrigin(0, 0.5).setDepth(203)));

            const btnArea = contentW - labelW;
            const bw = Math.floor(btnArea / options.length) - 3;
            options.forEach((opt, i) => {
                const bx = rowX + labelW + i * (bw + 3);
                const by = ry + 3;
                const bh = ROW_H - 6;
                const active = getCurrent() === opt.val;
                const bg2 = this._ui(s.add.graphics().setDepth(203));
                bg2.fillStyle(active ? 0x3a2c14 : 0x1e1608, 1).fillRect(bx, by, bw, bh);
                bg2.lineStyle(1, active ? 0xc8a030 : 0x5a4010, 0.9).strokeRect(bx, by, bw, bh);
                const lbl = this._ui(s.add.text(bx + bw / 2, by + bh / 2, opt.label, {
                    fontSize: '11px', color: active ? '#ffffff' : '#ddcc88', fontFamily: THEME.fontMono,
                }).setOrigin(0.5).setDepth(204));
                const zone = this._ui(s.add.zone(bx + bw / 2, by + bh / 2, bw, bh).setDepth(205).setInteractive({ cursor: 'pointer' }));
                zone.on('pointerover', () => { bg2.clear(); bg2.fillStyle(0x3a2c14, 1).fillRect(bx, by, bw, bh); bg2.lineStyle(1, 0xc8a030, 0.8).strokeRect(bx, by, bw, bh); lbl.setColor('#ffffff'); });
                zone.on('pointerout',  () => { bg2.clear(); const a2 = getCurrent() === opt.val; bg2.fillStyle(a2 ? 0x3a2c14 : 0x1e1608, 1).fillRect(bx, by, bw, bh); bg2.lineStyle(1, a2 ? 0xc8a030 : 0x5a4010, 0.9).strokeRect(bx, by, bw, bh); lbl.setColor(a2 ? '#ffffff' : '#ddcc88'); });
                zone.on('pointerdown', () => { onSelect(opt.val); this.hideSettingsPanel(); this.showSettingsPanel(); });
                objs.push(bg2, lbl, zone);
            });
            ry += ROW_H + 6;
        };

        addRow('Game Speed',
            [1,2,3,4,5].map(n => ({ label: `${n}×`, val: n })),
            () => s.tickSpeed,
            v => { s.tickSpeed = v; this._saveSettings({ gameSpeed: v }); this._pauseBtn?.setText(s.isPaused ? '▶' : '⏸'); }
        );
        addRow('Fog of War',
            [{ label: 'ON', val: true }, { label: 'OFF', val: false }],
            () => s.fogEnabled,
            v => { s.fogEnabled = v; this._saveSettings({ fogEnabled: v }); }
        );
        addRow('Need Icons',
            [{ label: 'ON', val: true }, { label: 'OFF', val: false }],
            () => s.showNeeds,
            v => { s.showNeeds = v; this._saveSettings({ showNeeds: v }); }
        );
        addRow('Autosave',
            [{ label: 'ON', val: true }, { label: 'OFF', val: false }],
            () => s._autosaveOn,
            v => {
                s._autosaveOn = v;
                this._saveSettings({ autosave: v });
                if (v && !s._autosaveEvent) {
                    s._autosaveEvent = s.time.addEvent({ delay: 60000, loop: true, callback: () => s._saveGame(), callbackScope: s });
                } else if (!v && s._autosaveEvent) {
                    s._autosaveEvent.remove(false); s._autosaveEvent = null;
                }
            }
        );

        addRow('Archon Builds',
            [{ label: 'AUTO', val: true }, { label: 'PLAYER', val: false }],
            () => s.archonPioneers !== false,
            v => { s.archonPioneers = v; this._saveSettings({ archonPioneers: v }); }
        );

        const sep2 = this._ui(s.add.graphics().setDepth(202));
        sep2.lineStyle(1, 0x5a4010, 0.7).lineBetween(mx + 16, ry + 2, mx + mw - 16, ry + 2);
        objs.push(sep2);

        const BBW = 90, BBH = 26, BBX = mx + mw / 2 - BBW / 2, BBY = ry + 10;
        const bbg = this._ui(s.add.graphics().setDepth(203));
        bbg.fillStyle(0x1e1608, 1).fillRect(BBX, BBY, BBW, BBH);
        bbg.lineStyle(1, 0x5a4010, 0.8).strokeRect(BBX, BBY, BBW, BBH);
        const bbt = this._ui(s.add.text(BBX + BBW / 2, BBY + BBH / 2, '← Back', {
            fontSize: '12px', color: '#ddcc88', fontFamily: THEME.fontMono,
        }).setOrigin(0.5).setDepth(204));
        const bbz = this._ui(s.add.zone(BBX + BBW / 2, BBY + BBH / 2, BBW, BBH).setDepth(205).setInteractive({ cursor: 'pointer' }));
        bbz.on('pointerover', () => { bbg.clear(); bbg.fillStyle(0x3a2c14, 1).fillRect(BBX, BBY, BBW, BBH); bbg.lineStyle(1, 0xc8a030, 0.8).strokeRect(BBX, BBY, BBW, BBH); bbt.setColor('#ffffff'); });
        bbz.on('pointerout',  () => { bbg.clear(); bbg.fillStyle(0x1e1608, 1).fillRect(BBX, BBY, BBW, BBH); bbg.lineStyle(1, 0x5a4010, 0.8).strokeRect(BBX, BBY, BBW, BBH); bbt.setColor('#ddcc88'); });
        bbz.on('pointerdown', () => { this.hideSettingsPanel(); this.showPauseMenu(); });
        objs.push(bbg, bbt, bbz);

        this._settingsMenuObjs = objs;
    }

    hideSettingsPanel() {
        if (!this._settingsMenuOpen) return;
        this._settingsMenuObjs?.forEach(o => o.destroy());
        this._settingsMenuObjs = [];
        this._settingsMenuOpen = false;
    }

    hidePauseMenu() {
        if (!this._pauseMenuOpen) return;
        this._pauseMenuObjs?.forEach(o => o.destroy());
        this._pauseMenuObjs = [];
        this._pauseMenuOpen = false;
        this.scene.isPaused = this._wasPaused ?? false;
        this._pauseBtn?.setText(this.scene.isPaused ? '▶' : '⏸');
    }

    _updateCursor() {
        const s = this.scene;
        let cursor = 'default';
        if (s.slateModeType)                                           cursor = 'crosshair';
        else if (s.wallMode)                                           cursor = 'crosshair';
        else if (s.zoneMode)                                           cursor = 'crosshair';
        else if (s.roadMode)                                           cursor = 'crosshair';
        else if (s.constructType || s.constructMode || s.relocateMode) cursor = 'cell';
        try { s.input.setDefaultCursor(cursor); } catch (_) {}
    }

    // ─── Info Pane helpers ────────────────────────────────────────────────────

    _clearInfo() {
        this._infoObjs.forEach(o => o.destroy());
        this._infoObjs = [];
    }

    _inf(obj) {
        this.scene.cameras.main.ignore(obj);
        this._infoObjs.push(obj);
        this._infoRoot.add(obj);
        return obj;
    }

    _infTxt(x, y, str, style) {
        return this._inf(this.scene.add.text(x, y, str,
            { fontFamily: THEME.fontMono, resolution: window.devicePixelRatio ?? 2, ...style }).setDepth(22));
    }

    _infBar(x, y, w, h, ratio, col) {
        const g = this._inf(this.scene.add.graphics().setDepth(22));
        g.fillStyle(0x221100, 0.8).fillRect(x, y, w, h);
        g.fillStyle(col).fillRect(x, y, Math.round(w * Math.max(0, Math.min(1, ratio))), h);
        return g;
    }

    _infBtn(x, y, w, h, label, color, cb, txtColor) {
        const g = this._inf(this.scene.add.graphics().setDepth(22));
        g.fillStyle(color, 0.88).fillRect(x, y, w, h);
        g.lineStyle(1, 0xc8a030, 0.45).strokeRect(x, y, w, h);

        const hov = this._inf(this.scene.add.graphics().setDepth(23).setAlpha(0));
        hov.fillStyle(0xffffff, 0.12).fillRect(x, y, w, h);

        this._infTxt(x + w / 2, y + h / 2, label,
            { fontSize: this._fs(11), color: txtColor ?? '#d4c8a8', align: 'center',
              wordWrap: { width: w - 4 } }).setOrigin(0.5);

        const z = this._inf(this.scene.add.zone(x + w / 2, y + h / 2, w, h)
            .setInteractive({ cursor: 'pointer' }).setDepth(24));
        z.on('pointerover', () => hov.setAlpha(1));
        z.on('pointerout',  () => hov.setAlpha(0));
        z.on('pointerdown', cb);
        return z;
    }

    _infCard(ox, oy, w, h) {
        return panel(this.scene, ox, oy, w, h, {
            color: 0x1a1408, alpha: 0.85, radius: 0,
            borderColor: 0x3a2e18, borderAlpha: 0.6,
            depth: 21, onAdd: o => this._inf(o),
        });
    }

    _infStatRow(ox, rx, y, label, value, color = '#9a9077', fs = null) {
        const fontSize = fs ?? this._fs(9);
        return statRow(this.scene, ox, rx, y, label, String(value), {
            labelColor: '#7a6850', valueColor: color, fontSize,
            depth: 22, onAdd: o => this._inf(o),
        });
    }

    _infTabBar(ox, oy, W, tabs, active, onSwitch) {
        const TH = this.L?.TAB_H ?? 34;
        tabStrip(this.scene, ox, oy, W, TH, tabs, active, (t) => onSwitch(t), {
            depth: 23, activeBg: 0x2e2212, inactiveBg: 0x181008,
            activeColor: '#e8d080', inactiveColor: '#7a6840',
            onAdd: (o) => this._inf(o),
        });
    }

    _actTabBar(ox, oy, W, tabs, active, onSwitch) {
        const TH = this.L?.TAB_H ?? 34;
        tabStrip(this.scene, ox, oy, W, TH, tabs, active, (t) => onSwitch(t), {
            depth: 23, activeBg: 0x2e2212, inactiveBg: 0x181008,
            activeColor: '#e8d080', inactiveColor: '#7a6840',
            onAdd: (o) => this._tab(o),
        });
        return TH;
    }

    _actStrip(zx, zy, w, h, items) {
        const bw = Math.floor(w / items.length);
        items.forEach((item, i) => {
            const bx = zx + i * bw;
            const g = this._tab(this.scene.add.graphics().setDepth(23));
            g.fillStyle(item.color, item.dimmed ? 0.35 : 0.88).fillRect(bx, zy, bw - 1, h);
            g.lineStyle(1, 0x5a4010, 0.4).strokeRect(bx, zy, bw - 1, h);
            const hov = this._tab(this.scene.add.graphics().setDepth(24).setAlpha(0));
            hov.fillStyle(0xffffff, 0.12).fillRect(bx, zy, bw - 1, h);
            this._tab(this.scene.add.text(bx + bw / 2, zy + h / 2, item.label, {
                fontFamily: THEME.fontMono, fontSize: this._fs(9),
                color: item.dimmed ? '#554433' : '#d4c8a8',
                align: 'center', wordWrap: { width: bw - 4 },
            }).setOrigin(0.5).setDepth(23));
            if (!item.dimmed) {
                const z = this._tab(this.scene.add.zone(bx + bw / 2, zy + h / 2, bw - 1, h)
                    .setInteractive({ cursor: 'pointer' }).setDepth(25));
                z.on('pointerover', () => hov.setAlpha(1));
                z.on('pointerout',  () => hov.setAlpha(0));
                z.on('pointerdown', item.cb);
            }
        });
    }

    _fontScale() { return Math.min(1.1, Math.max(0.9, this.L.H / 810)); }
    _fs(n)       { return `${Math.max(10, Math.round(n * this._fontScale()))}px`; }

    // ─── Actions Zone helpers ─────────────────────────────────────────────────

    _clearTabs() {
        this._tabObjs.forEach(o => o.destroy());
        this._tabObjs = [];
    }

    _tab(obj) {
        this.scene.cameras.main.ignore(obj);
        this._tabObjs.push(obj);
        this._tabRoot.add(obj);
        return obj;
    }
}

Object.assign(UIManager.prototype, uiInfoPaneMethods);
Object.assign(UIManager.prototype, uiActionsZoneMethods);
Object.assign(UIManager.prototype, uiModalsMethods);
Object.assign(UIManager.prototype, uiWorkGridMethods);
