import {
    MAP_W, MAP_H, TILE, MAP_OY,
    FM_TYPES, FM_LABELS, UNIT_NAMES, VET_LEVELS, SEASONS, SEASON_DAYS,
    BLDG_VOLUME,
} from '../config/gameConstants.js';
import { CONSTRUCTS, computeBuildCost } from '../content/constructs/index.js';
import UIPanel from './UIPanel.js';
import { ITEMS } from '../content/items/index.js';
import { WORKSHOP_JOBS } from '../content/jobs/index.js';

import uiInfoPaneMethods    from './ui/UIInfoPane.js';
import uiActionsZoneMethods from './ui/UIActionsZone.js';
import uiModalsMethods      from './ui/UIModals.js';

export default class UIManager {
    constructor(scene) {
        this.scene = scene;
        this._infoObjs    = [];
        this._tabObjs     = [];
        this._actionPanel = null;
        this._caravanModal = null;
        // Left panel tab state
        this._unitTab     = 'Stats';
        this._buildingTab = 'Info';
        this._oikosTab    = 'Family';
        // Right panel (actions) tab state
        this._actUnitTab  = 'Jobs';
        this._actMilTab   = 'Move';
        this._actBldgTab  = null;
        this._actBldgId   = null;
    }

    _ui(obj) { this.scene.cameras.main.ignore(obj); return obj; }

    rebuildUI() { this.scene.scene.restart(); }

    // ─── Layout ───────────────────────────────────────────────────────────────

    _computeLayout() {
        const W = this.scene.SW, H = this.scene.SH;
        const PANEL_H = Math.min(340, Math.max(240, Math.floor(H * 0.30)));
        const TOP_H   = MAP_OY;   // must match MAP_OY so camera bounds align
        const KEY_H   = 10;   // decorative border strip
        const TAB_H   = 26;   // category tab row inside actions zone
        const panelY  = H - PANEL_H;
        const INFO_W  = Math.floor(W * 0.30);
        const MM_W    = Math.floor(W * 0.28);
        const ACT_W   = W - INFO_W - MM_W;
        return { W, H, PANEL_H, TOP_H, KEY_H, TAB_H, panelY, INFO_W, MM_W, ACT_W };
    }

    // ─── Create ───────────────────────────────────────────────────────────────

    createUI() {
        this.L = this._computeLayout();
        const { W, H } = this.L;

        this._buildTopBar();
        this._buildBottomPanel();
        this._buildMinimapZone();

        // Persistent containers for dynamically rebuilt zones
        this._infoRoot  = this._ui(this.scene.add.container(0, 0).setDepth(21));
        this._tabRoot   = this._ui(this.scene.add.container(0, 0).setDepth(22));

        // Phase message overlay
        this.scene.phaseMsg = this._ui(this.scene.add.text(W / 2, H / 2 - 40, '', {
            fontSize: '22px', color: '#ffffff', fontFamily: 'monospace',
            stroke: '#000000', strokeThickness: 4,
        }).setOrigin(0.5).setDepth(100).setAlpha(0));

        this.scene.buildCat = this.scene.buildCat ?? 'Economy';
        this.updateUI();
    }

    // ─── Top bar ─────────────────────────────────────────────────────────────

    _buildTopBar() {
        const { W, TOP_H } = this.L;
        this._ui(this.scene.add.rectangle(W / 2, TOP_H / 2, W, TOP_H, 0x130e06, 0.97).setDepth(20));

        const g = this._ui(this.scene.add.graphics().setDepth(20));
        // Bottom border
        g.lineStyle(2, 0xc8a030, 0.85).lineBetween(0, TOP_H - 1, W, TOP_H - 1);
        g.lineStyle(1, 0x7a5010, 0.5).lineBetween(0, TOP_H - 4, W, TOP_H - 4);
        // Row divider between resources and status line
        const rowDiv = Math.floor(TOP_H / 2);
        g.lineStyle(1, 0x3a2e18, 0.5).lineBetween(0, rowDiv, W, rowDiv);

        this.scene.timerBarGfx = this._ui(this.scene.add.graphics().setDepth(21));

        const ts  = { fontFamily: 'monospace', stroke: '#000000', strokeThickness: 2 };
        const cy1 = Math.floor(TOP_H * 0.27);   // row 1 centre: resources
        const cy2 = Math.floor(TOP_H * 0.73);   // row 2 centre: day / controls
        const fs1 = this._fs(10);

        // Row 1 — 4 equal resource columns
        const colW = W / 4;
        const mk1 = (i, color) => this._ui(this.scene.add.text(
            colW * i + colW / 2, cy1, '',
            { ...ts, fontSize: fs1, color, align: 'center' }
        ).setOrigin(0.5).setDepth(21));

        this.scene.foodText   = mk1(0, '#7add77');
        this.scene.woodText   = mk1(1, '#cc9944');
        this.scene.stoneText  = mk1(2, '#aaaacc');
        this.scene.workerInfo = mk1(3, '#ddcc88').setInteractive({ cursor: 'pointer' });
        this.scene.workerInfo.on('pointerover', () => this.scene.workerInfo.setColor('#ffee99'));
        this.scene.workerInfo.on('pointerout',  () => this.scene.workerInfo.setColor('#ddcc88'));
        this.scene.workerInfo.on('pointerdown', () => this.showCensusPanel());

        // Row 2 — day info anchored left; controls anchored right with fixed offsets
        this.scene.dayInfo = this._ui(this.scene.add.text(8, cy2, '', {
            ...ts, fontSize: this._fs(10), color: '#c8a030',
        }).setOrigin(0, 0.5).setDepth(21));

        this.scene.enemyCount = this._ui(this.scene.add.text(W - 100, cy2, '', {
            ...ts, fontSize: this._fs(10), color: '#ee6655',
        }).setOrigin(0.5).setDepth(21));

        const pBtn = this._ui(this.scene.add.text(W - 56, cy2, '⏸', {
            fontFamily: 'monospace', fontSize: this._fs(14), color: '#cccccc',
        }).setOrigin(0.5).setDepth(21).setInteractive({ cursor: 'pointer' }));
        pBtn.on('pointerover', () => pBtn.setColor('#ffffff'));
        pBtn.on('pointerout',  () => pBtn.setColor('#cccccc'));
        pBtn.on('pointerdown', () => {
            this.scene.isPaused = !this.scene.isPaused;
            pBtn.setText(this.scene.isPaused ? '▶' : '⏸');
        });

        const sBtn = this._ui(this.scene.add.text(W - 20, cy2, '1×', {
            fontFamily: 'monospace', fontSize: this._fs(11), color: '#ffdd44',
        }).setOrigin(0.5).setDepth(21).setInteractive({ cursor: 'pointer' }));
        sBtn.on('pointerover', () => sBtn.setColor('#ffee88'));
        sBtn.on('pointerout',  () => sBtn.setColor('#ffdd44'));
        sBtn.on('pointerdown', () => {
            this.scene.tickSpeed = (this.scene.tickSpeed % 5) + 1;
            sBtn.setText(`${this.scene.tickSpeed}×`);
        });

        // Retired refs kept as null so old callers don't crash
        this.scene.woolText = null;
        this.scene.phaseTag = null;
        this.scene.selInfo  = null;
        this.scene.timerText = null;
    }

    // ─── Bottom panel chrome ─────────────────────────────────────────────────

    _buildBottomPanel() {
        const { W, H, PANEL_H, panelY, KEY_H, INFO_W, MM_W } = this.L;

        // Background
        this._ui(this.scene.add.rectangle(W / 2, panelY + PANEL_H / 2, W, PANEL_H, 0x130e06, 0.97).setDepth(20));

        const g = this._ui(this.scene.add.graphics().setDepth(20));

        // Greek-key-inspired top border
        this._drawKeyBorder(g, 0, panelY, W, KEY_H);

        // Zone dividers
        g.lineStyle(1, 0x5a3f0e, 0.7)
            .lineBetween(INFO_W,          panelY + KEY_H + 2, INFO_W,          H - 2)
            .lineBetween(INFO_W + MM_W,   panelY + KEY_H + 2, INFO_W + MM_W,   H - 2);
    }

    _drawKeyBorder(g, x, y, w, h) {
        // Solid gold band
        g.fillStyle(0xc8a030, 0.9).fillRect(x, y, w, h);
        // Dark meander cutouts — simplified step pattern
        g.fillStyle(0x130e06, 0.88);
        const u = h;   // step unit = strip height
        for (let i = 0; i * u * 4 < w; i++) {
            const ox = x + i * u * 4;
            // Upper-right notch
            g.fillRect(ox + u,     y,         u, Math.ceil(h * 0.55));
            // Lower-left notch (next half-beat)
            g.fillRect(ox + u * 2, y + Math.floor(h * 0.45), u, Math.ceil(h * 0.55));
        }
        // Bright top edge line
        g.fillStyle(0xf0cc60, 0.6).fillRect(x, y, w, 1);
    }

    // ─── Minimap zone ────────────────────────────────────────────────────────

    _buildMinimapZone() {
        const { H, PANEL_H, panelY, KEY_H, INFO_W, MM_W } = this.L;
        const pad  = 6;
        const mmX  = INFO_W + pad;
        const mmY  = panelY + KEY_H + pad;
        const mmW  = MM_W - pad * 2;
        const mmH  = PANEL_H - KEY_H - pad * 2;

        this.scene._mmX = mmX; this.scene._mmY = mmY;
        this.scene._mmW = mmW; this.scene._mmH = mmH;

        // Double border (gold outer, dark inner)
        const g = this._ui(this.scene.add.graphics().setDepth(21));
        g.lineStyle(2, 0xc8a030, 0.7).strokeRect(mmX - 2, mmY - 2, mmW + 4, mmH + 4);
        g.lineStyle(1, 0x6a4a08, 0.5).strokeRect(mmX - 4, mmY - 4, mmW + 8, mmH + 8);

        this.scene.minimapGfx = this._ui(this.scene.add.graphics().setDepth(22));

        const mmZone = this._ui(this.scene.add.zone(mmX + mmW / 2, mmY + mmH / 2, mmW, mmH)
            .setInteractive({ cursor: 'crosshair' }).setDepth(23));
        mmZone.on('pointerdown', ptr => {
            const fx = (ptr.x - this.scene._mmX) / this.scene._mmW;
            const fy = (ptr.y - this.scene._mmY) / this.scene._mmH;
            this.scene.cameras.main.pan(fx * MAP_W * TILE, MAP_OY + fy * MAP_H * TILE, 300, 'Sine.easeOut');
        });
    }

    // ─── Update ──────────────────────────────────────────────────────────────

    updateUI() {
        this.scene.economyManager.syncResources();
        this._updateResources();
        this._renderInfoPane();
        this._renderActionsZone();
    }

    updateEnemyCount() {
        const n = this.scene.units.filter(u => u.isEnemy && u.hp > 0).length;
        this.scene.enemyCount?.setText(n > 0 ? `⚔ ${n}` : '');
    }

    _updateResources() {
        const sm = this.scene.storageMax ?? {};
        const r  = this.scene.resources  ?? {};
        const units = this.scene.units.filter(u => !u.isEnemy && u.hp > 0);
        // Food column: show wheat/flour/bread as a chain
        const avgNut = units.length > 0
            ? units.reduce((s, u) => s + (u.dailyNutrition ?? 0), 0) / units.length : 1;
        const foodWarn = units.length > 0 && avgNut < 0.3 && this.scene.mealsDone > 0;
        const w = r['Food.Grain.Wheat'] ?? 0, br = r['Food.Grain.Wheat.Bread'] ?? 0;
        const mt = r['Food.Meat.Venison'] ?? 0, sa = r['Food.Meat.Venison.Sausages'] ?? 0;
        const ct = this.scene.constructs.reduce((s, b) => s + (b.inbox?.['Food.Meat.Venison.Cuts'] ?? 0), 0);
        const narrow = this.L.W < 480;
        const meatStr = (!narrow && (mt + ct + sa) > 0) ? `  🥩${mt + ct + sa}` : '';
        const foodStr = narrow ? `🌾${w} 🍞${br}` : `🌾${w}  🍞${br}${meatStr}`;
        this.scene.foodText?.setText(foodStr).setColor(foodWarn ? '#ff6655' : '#7add77');
        const wood = r['Materials.Wood.Pine'] ?? 0, woodMax = sm['Materials.Wood.Pine'] ?? 0;
        const stone = r['Materials.Stone.Limestone'] ?? 0, stoneMax = sm['Materials.Stone.Limestone'] ?? 0;
        this.scene.woodText?.setText(narrow ? `🪵${wood}` : `🪵 ${wood}/${woodMax}`);
        this.scene.stoneText?.setText(narrow ? `⛏${stone}` : `⛏ ${stone}/${stoneMax}`);

        const adults = units.filter(u => u.type === 'worker' && u.age >= 2).length;
        const popCap = this.scene.constructs
            .filter(b => !b.faction && b.built && CONSTRUCTS[b.type]?.capacity)
            .reduce((s, b) => s + CONSTRUCTS[b.type].capacity, 0);
        this.scene.workerInfo?.setText(narrow ? `👥${adults}` : `👥 ${adults}/${popCap}`);

        const phase = this.scene.phase;
        const seasonIdx = Math.floor((this.scene.day - 1) / SEASON_DAYS) % 4;
        const seasonName = SEASONS[seasonIdx];
        this.scene.dayInfo?.setText(phase === 'NIGHT'
            ? `🌙 N${this.scene.day}  ${seasonName}` : `☀ D${this.scene.day}  ${seasonName}`);

        this.updateEnemyCount();
    }

    showSaveFlash() {
        const txt = this.scene.add.text(this.scene.SW - 45, 10, '💾 saved', {
            fontSize: '9px', color: '#88cc88', fontFamily: 'monospace',
            stroke: '#000000', strokeThickness: 1,
        }).setDepth(25).setOrigin(1, 0);
        this.scene.tweens.add({ targets: txt, alpha: 0, duration: 1500, onComplete: () => txt.destroy() });
    }

    // ─── Info Pane helpers ───────────────────────────────────────────────────

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
            { fontFamily: 'monospace', ...style }).setDepth(22));
    }

    _infBar(x, y, w, h, ratio, col) {
        const g = this._inf(this.scene.add.graphics().setDepth(22));
        g.fillStyle(0x221100, 0.8).fillRect(x, y, w, h);
        g.fillStyle(col).fillRect(x, y, Math.round(w * Math.max(0, Math.min(1, ratio))), h);
        return g;
    }

    _infBtn(x, y, w, h, label, color, cb) {
        const g = this._inf(this.scene.add.graphics().setDepth(22));
        g.fillStyle(color, 0.88).fillRect(x, y, w, h);
        g.lineStyle(1, 0xc8a030, 0.45).strokeRect(x, y, w, h);

        const hov = this._inf(this.scene.add.graphics().setDepth(23).setAlpha(0));
        hov.fillStyle(0xffffff, 0.12).fillRect(x, y, w, h);

        const t = this._infTxt(x + w / 2, y + h / 2, label,
            { fontSize: this._fs(11), color: '#d4c8a8', align: 'center',
              wordWrap: { width: w - 4 } }).setOrigin(0.5);

        const z = this._inf(this.scene.add.zone(x + w / 2, y + h / 2, w, h)
            .setInteractive({ cursor: 'pointer' }).setDepth(24));
        z.on('pointerover', () => hov.setAlpha(1));
        z.on('pointerout',  () => hov.setAlpha(0));
        z.on('pointerdown', cb);
        return z;
    }

    _infCard(ox, oy, w, h) {
        const g = this._inf(this.scene.add.graphics().setDepth(21));
        g.fillStyle(0x1a1408, 0.85).fillRect(ox, oy, w, h);
        g.lineStyle(1, 0x3a2e18, 0.6).strokeRect(ox, oy, w, h);
        return g;
    }

    _infTabBar(ox, oy, W, tabs, active, onSwitch) {
        const TH = 22, tw = Math.floor(W / tabs.length);
        tabs.forEach((t, i) => {
            const tx = ox + i * tw;
            const isActive = t === active;
            const g = this._inf(this.scene.add.graphics().setDepth(23));
            g.fillStyle(isActive ? 0x2a2010 : 0x130e06, 0.95).fillRect(tx, oy, tw, TH);
            g.lineStyle(1, isActive ? 0xc8a030 : 0x3a2e18, 0.7).strokeRect(tx, oy, tw, TH);
            const hov = this._inf(this.scene.add.graphics().setDepth(23).setAlpha(0));
            hov.fillStyle(0xffffff, 0.10).fillRect(tx, oy, tw, TH);
            const lbl = this._infTxt(tx + tw / 2, oy + TH / 2, t,
                { fontSize: this._fs(10), color: isActive ? '#c8a030' : '#6a5830' }).setOrigin(0.5);
            if (!isActive) {
                const z = this._inf(this.scene.add.zone(tx + tw / 2, oy + TH / 2, tw, TH)
                    .setInteractive({ cursor: 'pointer' }).setDepth(24));
                z.on('pointerover', () => { hov.setAlpha(1); lbl.setColor('#a08050'); });
                z.on('pointerout',  () => { hov.setAlpha(0); lbl.setColor('#6a5830'); });
                z.on('pointerdown', () => onSwitch(t));
            }
        });
    }

    _actTabBar(ox, oy, W, tabs, active, onSwitch) {
        const TH = 22, tw = Math.floor(W / tabs.length);
        tabs.forEach((t, i) => {
            const tx = ox + i * tw;
            const isActive = t === active;
            const g = this._tab(this.scene.add.graphics().setDepth(23));
            g.fillStyle(isActive ? 0x2a2010 : 0x130e06, 0.95).fillRect(tx, oy, tw, TH);
            g.lineStyle(1, isActive ? 0xc8a030 : 0x3a2e18, 0.7).strokeRect(tx, oy, tw, TH);
            const hov = this._tab(this.scene.add.graphics().setDepth(23).setAlpha(0));
            hov.fillStyle(0xffffff, 0.10).fillRect(tx, oy, tw, TH);
            const lbl = this._tab(this.scene.add.text(tx + tw / 2, oy + TH / 2, t, {
                fontFamily: 'monospace', fontSize: this._fs(10),
                color: isActive ? '#c8a030' : '#6a5830',
            }).setOrigin(0.5).setDepth(23));
            if (!isActive) {
                const z = this._tab(this.scene.add.zone(tx + tw / 2, oy + TH / 2, tw, TH)
                    .setInteractive({ cursor: 'pointer' }).setDepth(24));
                z.on('pointerover', () => { hov.setAlpha(1); lbl.setColor('#a08050'); });
                z.on('pointerout',  () => { hov.setAlpha(0); lbl.setColor('#6a5830'); });
                z.on('pointerdown', () => onSwitch(t));
            }
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
                fontFamily: 'monospace', fontSize: this._fs(9),
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

    // Font scale based on screen width — keeps text readable on small mobile screens
    _fontScale() { return Math.min(1.5, Math.max(1.0, this.L.W / 420)); }
    _fs(n)       { return `${Math.max(12, Math.round(n * this._fontScale()))}px`; }

    // ─── Actions Zone helpers ────────────────────────────────────────────────

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
