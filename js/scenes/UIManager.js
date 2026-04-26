import {
    MAP_W, MAP_H, TILE, MAP_OY,
    BLDG, BLDG_CATS, FM_TYPES, FM_LABELS, UNIT_NAMES, VET_LEVELS, computeBuildCost, SEASONS, SEASON_DAYS,
} from '../config/gameConstants.js';
import UIPanel from './UIPanel.js';

export default class UIManager {
    constructor(scene) {
        this.scene = scene;
        this._infoObjs   = [];
        this._tabObjs    = [];
        this._actionPanel = null;
        this._caravanModal = null;
    }

    _ui(obj) { this.scene.cameras.main.ignore(obj); return obj; }

    rebuildUI() { this.scene.scene.restart(); }

    // ─── Layout ───────────────────────────────────────────────────────────────

    _computeLayout() {
        const W = this.scene.SW, H = this.scene.SH;
        const PANEL_H = Math.min(280, Math.max(210, Math.floor(H * 0.24)));
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

        // Double-line bottom border
        const g = this._ui(this.scene.add.graphics().setDepth(20));
        g.lineStyle(2, 0xc8a030, 0.85).lineBetween(0, TOP_H - 1, W, TOP_H - 1);
        g.lineStyle(1, 0x7a5010, 0.5).lineBetween(0, TOP_H - 4, W, TOP_H - 4);

        this.scene.timerBarGfx = this._ui(this.scene.add.graphics().setDepth(21));

        const ts = { fontFamily: 'monospace', stroke: '#000000', strokeThickness: 2, align: 'center' };
        const cy = TOP_H / 2 - 2;

        // Controls cluster width: enemyCount(~60) + gap + pause(28) + speed(28) + margins ≈ 150px
        const CTRL_W = 150;
        // 4 resource columns in the left (W - CTRL_W) region, day info in the gap
        const resW = W - CTRL_W;
        const cols = 4, colW = resW / cols;
        const mk = (i, color, fz = '11px') =>
            this._ui(this.scene.add.text(colW * i + colW / 2, cy, '',
                { ...ts, fontSize: fz, color }).setOrigin(0.5, 0.5).setDepth(21));

        this.scene.foodText   = mk(0, '#7add77');
        this.scene.woodText   = mk(1, '#cc9944');
        this.scene.stoneText  = mk(2, '#aaaacc');
        this.scene.workerInfo = mk(3, '#ddcc88');

        // Day + timer sits between resource cols and controls, centred in gap
        this.scene.dayInfo = this._ui(this.scene.add.text(resW + 8, cy, '', {
            ...ts, fontSize: '10px', color: '#c8a030',
        }).setOrigin(0, 0.5).setDepth(21));

        // Enemy count + pause + speed — top-right cluster
        this.scene.enemyCount = this._ui(this.scene.add.text(W - 110, cy, '', {
            fontFamily: 'monospace', fontSize: '11px', color: '#ee6655',
            stroke: '#000', strokeThickness: 2,
        }).setOrigin(0.5, 0.5).setDepth(21));

        const pBtn = this._ui(this.scene.add.text(W - 68, cy, '⏸', {
            fontFamily: 'monospace', fontSize: '15px', color: '#cccccc',
        }).setOrigin(0.5, 0.5).setDepth(21).setInteractive());
        pBtn.on('pointerdown', () => {
            this.scene.isPaused = !this.scene.isPaused;
            pBtn.setText(this.scene.isPaused ? '▶' : '⏸');
        });

        const sBtn = this._ui(this.scene.add.text(W - 36, cy, '1×', {
            fontFamily: 'monospace', fontSize: '12px', color: '#ffdd44',
        }).setOrigin(0.5, 0.5).setDepth(21).setInteractive());
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
            .setInteractive().setDepth(23));
        mmZone.on('pointerdown', ptr => {
            const fx = (ptr.x - this.scene._mmX) / this.scene._mmW;
            const fy = (ptr.y - this.scene._mmY) / this.scene._mmH;
            this.scene.cameras.main.pan(fx * MAP_W * TILE, MAP_OY + fy * MAP_H * TILE, 300, 'Sine.easeOut');
        });
    }

    // ─── Update ──────────────────────────────────────────────────────────────

    updateUI() {
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
        const w = r.wheat ?? 0, fl = r.flour ?? 0, br = r.bread ?? 0;
        const mt = r.meat ?? 0, sa = r.sausages ?? 0;
        const ct = this.scene.buildings.reduce((s, b) => s + (b.inbox?.cuts ?? 0), 0);
        const meatStr = (mt || ct || sa) ? `  🥩${mt} 🔪${ct} 🌭${sa}` : '';
        this.scene.foodText?.setText(`🌾${w} 🍚${fl} 🍞${br}${meatStr}`)
            .setColor(foodWarn ? '#ff6655' : '#7add77');
        this.scene.woodText?.setText(`🪵 ${r.wood ?? 0}/${sm.wood ?? 0}`);
        this.scene.stoneText?.setText(`⛏ ${r.stone ?? 0}/${sm.stone ?? 0}`);

        const adults = units.filter(u => u.type === 'worker' && u.age >= 2).length;
        const popCap = this.scene.buildings
            .filter(b => !b.faction && b.built && BLDG[b.type]?.capacity)
            .reduce((s, b) => s + BLDG[b.type].capacity, 0);
        this.scene.workerInfo?.setText(`👥 ${adults}/${popCap}`);

        const phase = this.scene.phase;
        const seasonIdx = Math.floor((this.scene.day - 1) / SEASON_DAYS) % 4;
        const seasonName = SEASONS[seasonIdx];
        this.scene.dayInfo?.setText(phase === 'NIGHT'
            ? `🌙 N${this.scene.day}  ${seasonName}` : `☀ D${this.scene.day}  ${seasonName}`);

        this.updateEnemyCount();
    }

    // ─── Info Pane ───────────────────────────────────────────────────────────

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
        g.lineStyle(1, 0xc8a030, 0.35).strokeRect(x, y, w, h);

        const t = this._infTxt(x + w / 2, y + h / 2, label,
            { fontSize: '10px', color: '#d4c8a8', align: 'center',
              wordWrap: { width: w - 4 } }).setOrigin(0.5);

        const z = this._inf(this.scene.add.zone(x + w / 2, y + h / 2, w, h)
            .setInteractive().setDepth(23));
        z.on('pointerdown', cb);
        return z;
    }

    _renderInfoPane() {
        this._clearInfo();
        const { INFO_W, PANEL_H, KEY_H, panelY } = this.L;
        const W = INFO_W - 2, H = PANEL_H - KEY_H;
        const ox = 0, oy = panelY + KEY_H;
        const pad = 8;
        const sel = this.scene.units.filter(u => u.selected && !u.isEnemy);

        if (this.scene.selectedBuilding) {
            this._renderBuildingInfo(ox, oy, W, H, pad);
        } else if (sel.length > 0) {
            this._renderUnitInfo(sel, ox, oy, W, H, pad);
        } else if (this.scene.selectedNode) {
            this._renderNodeInfo(ox, oy, W, H, pad);
        } else {
            this._renderIdleInfo(ox, oy, W, H, pad);
        }
    }

    _renderBuildingInfo(ox, oy, W, H, pad) {
        const b   = this.scene.selectedBuilding;
        const def = BLDG[b.type];

        if ((b.type === 'house' || b.type === 'townhall') && b.built) {
            this._renderOikosInfo(b, ox, oy, W, H, pad);
            return;
        }

        this._infTxt(ox + pad, oy + 6, def.label,
            { fontSize: '11px', color: '#c8a030' });
        if (def.desc) {
            this._infTxt(ox + pad, oy + 17, def.desc,
                { fontSize: '8px', color: '#aaaaaa' });
        }

        // Status line
        let status = '';
        if (!b.built) {
            // ... (keep previous status logic)
        } else {
            // State/Private Badge
            if (b.type !== 'house' && b.type !== 'townhall') {
                const label = b.isPublic ? '[STATE]' : '[PRIVATE]';
                const col   = b.isPublic ? '#c8a030' : '#6a5840';
                this._infTxt(ox + W - pad, oy + 6, label, { fontSize: '8px', color: col }).setOrigin(1, 0);
            }
            
            if (def.capacity) {
                const pop = this.scene.units.filter(u => u.homeBldgId === b.id && !u.isEnemy && u.hp > 0).length;
                status = `👥 ${pop}/${def.capacity}`;
            }
            if (def.stores) {
                const p = Object.entries(def.stores)
                    .map(([r, cap]) => `${r.slice(0,3)}:${this.scene.resources[r] ?? 0}/${cap}`)
                    .join(' ');
                status = status ? `${status}  ${p}` : p;
            }
        }
        if (status) this._infTxt(ox + pad, oy + 28, status,
            { fontSize: '9px', color: '#9a9077' });

        // HP bar for enemy buildings
        if (b.faction === 'enemy' && b.hp !== undefined) {
            this._infBar(ox + pad, oy + 30, W - pad * 2, 5, b.hp / b.maxHp, 0xcc3322);
        }

        // State ownership toggle (built non-house buildings)
        if (b.built && b.type !== 'house' && b.type !== 'townhall' && !b.faction) {
            const label = b.isPublic ? '🏛 State  (toggle)' : '🏠 Private  (toggle)';
            const col   = b.isPublic ? 0x1a3040 : 0x2a2018;
            this._infBtn(ox + pad, oy + H - 34, W - pad * 2 - 4, 20, label, col, () => {
                b.isPublic = !b.isPublic;
                this.updateUI();
            });
        }

        // Townhall: show archon + tithe
        if (b.type === 'townhall' && b.built) {
            const archon = this.scene.units.find(u => u.isArchon && u.hp > 0);
            if (archon) {
                this._infTxt(ox + pad, oy + 34,
                    `Archon: ${archon.name}`, { fontSize: '10px', color: '#ffdd88' });
                this._infPhenotype(ox + pad, oy + 46, archon.phenotype);
                this._infTxt(ox + pad + 32, oy + 47,
                    this._attrLine(archon.attributes), { fontSize: '8px', color: '#9a8860' });
            } else {
                this._infTxt(ox + pad, oy + 34, 'No Archon', { fontSize: '10px', color: '#884422' });
            }
            const rate = this.scene.titheRate ?? 10;
            this._infTxt(ox + pad, oy + 60, `Tithe: ${rate}%  (firstfruits auto)`,
                { fontSize: '9px', color: '#7a6030' });
        }
    }

    // Draw 3 tiny phenotype swatches (skin / hair / eye) at (x, y)
    _infPhenotype(x, y, p) {
        if (!p) return;
        const g = this._inf(this.scene.add.graphics().setDepth(22));
        const colors = [p.skinHex, p.hairHex, p.eyeHex];
        colors.forEach((c, i) => {
            g.fillStyle(c, 1).fillCircle(x + i * 9, y + 4, 3.5);
            g.lineStyle(0.5, 0x000000, 0.3).strokeCircle(x + i * 9, y + 4, 3.5);
        });
    }

    // Compact attribute string: two highest attrs highlighted
    _attrLine(a) {
        if (!a) return '';
        const entries = [['STR',a.str],['DEX',a.dex],['CON',a.con],['INT',a.int],['AGI',a.agi],['WIL',a.wil]];
        entries.sort((x,y) => y[1]-x[1]);
        return entries.slice(0,2).map(([k,v]) => `${k}${v}`).join(' ');
    }

    _renderOikosInfo(b, ox, oy, W, H, pad) {
        const allRes = this.scene.units.filter(u => u.homeBldgId === b.id && !u.isEnemy && u.hp > 0);
        const adults   = allRes.filter(u => u.age >= 2);
        const youth    = allRes.filter(u => u.age === 1);
        const children = allRes.filter(u => u.age === 0);

        const patriarch = adults.find(u => u.isArchon) ?? adults.find(u => u.gender === 'male') ?? adults[0];
        const familyName = b.type === 'townhall'
            ? (patriarch ? `Archon: ${patriarch.name}` : 'Town Hall')
            : (patriarch ? `Oikos of ${patriarch.name}` : `House #${b.id}`);

        this._infTxt(ox + pad, oy + 4, familyName, { fontSize: '11px', color: '#c8a030' });
        if (BLDG[b.type]?.desc) {
            this._infTxt(ox + pad, oy + 14, BLDG[b.type].desc, { fontSize: '8px', color: '#aaaaaa' });
        }
        this._infTxt(ox + W - pad - 22, oy + 6, `${allRes.length}/${BLDG[b.type]?.capacity ?? '?'}`,
            { fontSize: '10px', color: '#6a5c40' });

        const div = this._inf(this.scene.add.graphics().setDepth(22));
        div.lineStyle(1, 0x5a4820, 0.5).lineBetween(ox + pad, oy + 24, ox + W - pad, oy + 24);

        // Pair couples
        let ry = oy + 27;
        const seen = new Set();
        const coupleRows = [];
        for (const u of adults) {
            if (seen.has(u.id)) continue;
            seen.add(u.id);
            const spouse = u.spouseId ? adults.find(s => s.id === u.spouseId && !seen.has(s.id)) : null;
            if (spouse) seen.add(spouse.id);
            coupleRows.push(spouse ? [u, spouse] : [u]);
        }

        const resIds = new Set(allRes.map(u => u.id));
        const heirCandidates = allRes.filter(u =>
            (u.fatherId && resIds.has(u.fatherId)) || (u.motherId && resIds.has(u.motherId)));
        const heir = heirCandidates.length
            ? heirCandidates.reduce((a, c) => c.age > a.age ? c : a) : null;

        const rowH = 20;
        const drawMember = (u, indent) => {
            const gIcon = u.gender === 'female' ? '♀' : '♂';
            const gCol  = u.gender === 'female' ? '#cc88aa' : '#88aacc';
            const isHeir = u === heir;
            const nameStr = (u.name ?? '?').slice(0, 8) + (isHeir ? '★' : '');
            const nameCol = isHeir ? '#ffdd88' : '#c4b88a';

            this._infTxt(ox + pad + indent, ry, gIcon, { fontSize: '10px', color: gCol });
            this._infTxt(ox + pad + indent + 9, ry, nameStr, { fontSize: '10px', color: nameCol });
            this._infPhenotype(ox + W - pad - 30, ry, u.phenotype);

            // Attributes on second micro-line
            const attrStr = this._attrLine(u.attributes);
            const burning = Object.entries(u.passions ?? {}).find(([,v]) => v === 'burning');
            const passStr = burning ? `♥${burning[0].slice(0,5)}` : '';
            this._infTxt(ox + pad + indent + 9, ry + 9,
                `${attrStr}  ${passStr}`,
                { fontSize: '8px', color: '#7a6850' });

            ry += rowH;
        };

        for (const pair of coupleRows) {
            drawMember(pair[0], 0);
            if (pair[1]) drawMember(pair[1], 4); // slight indent for spouse
        }

        // Youth & children
        const minors = [...youth, ...children];
        if (minors.length) {
            const childDiv = this._inf(this.scene.add.graphics().setDepth(22));
            childDiv.lineStyle(1, 0x3a3020, 0.4).lineBetween(ox + pad, ry, ox + W - pad, ry);
            ry += 3;
            for (const u of minors) {
                const tag = u.age === 0 ? 'child' : 'youth';
                const fa = this.scene.units.find(p => p.id === u.fatherId);
                const mo = this.scene.units.find(p => p.id === u.motherId);
                const lin = fa || mo ? ` (${[fa?.name?.slice(0,5), mo?.name?.slice(0,4)].filter(Boolean).join('·')})` : '';
                this._infTxt(ox + pad + 6, ry, `↳ ${u.name?.slice(0,8) ?? '?'} ${tag}${lin}`,
                    { fontSize: '9px', color: '#9a8060' });
                this._infPhenotype(ox + W - pad - 30, ry, u.phenotype);
                ry += 12;
            }
        }

        // Inventory + appliances
        ry += 4;
        const div2 = this._inf(this.scene.add.graphics().setDepth(22));
        div2.lineStyle(1, 0x5a4820, 0.4).lineBetween(ox + pad, ry, ox + W - pad, ry);
        ry += 4;
        const inv = b.inventory ?? {};
        const invEntries = Object.entries(inv).filter(([, v]) => v > 0);
        const invStr = invEntries.length
            ? invEntries.map(([r, v]) => `${v}${r.slice(0,4)}`).join(' ')
            : 'empty';
        this._infTxt(ox + pad, ry, `📦 ${invStr}`, { fontSize: '9px', color: invEntries.length ? '#aac890' : '#4a4030' });
        ry += 12;
        const slotLine = (b.applianceItems ?? []).length
            ? b.applianceItems.map(a => a.label ?? a).join(', ')
            : 'no appliances';
        this._infTxt(ox + pad, ry, `[${slotLine}]`, { fontSize: '9px', color: '#5a6840' });
    }

    _renderUnitInfo(sel, ox, oy, W, H, pad) {
        if (sel.length === 1) {
            const u   = sel[0];
            const nm  = UNIT_NAMES[u.type] ?? u.type;
            const vet = u.vetLevel >= 1 ? VET_LEVELS[u.vetLevel - 1].label + ' ' : '';
            this._infTxt(ox + pad, oy + 5, `${vet}${nm}`,
                { fontSize: '12px', color: '#c8a030' });
            this._infTxt(ox + pad, oy + 18, u.name ?? '',
                { fontSize: '10px', color: '#7a7060' });
            this._infBar(ox + pad, oy + 31, W - pad * 2 - 4, 5,
                u.hp / u.maxHp,
                u.hp / u.maxHp > 0.5 ? 0x44cc44 : u.hp / u.maxHp > 0.25 ? 0xddaa22 : 0xcc3311);
            this._infTxt(ox + pad, oy + 38, `HP ${u.hp}/${u.maxHp}`,
                { fontSize: '9px', color: '#666655' });

            if (u.type === 'worker') {
                const role = u.role ? u.role[0].toUpperCase() + u.role.slice(1) : 'Idle';
                this._infTxt(ox + pad, oy + 50, `Role: ${role}`,
                    { fontSize: '10px', color: '#aaaacc' });

                // Phenotype swatches + height
                this._infPhenotype(ox + pad, oy + 63, u.phenotype);
                const htPct = u.phenotype ? Math.round((u.phenotype.heightScale - 0.6) / 0.8 * 100) : 50;
                this._infTxt(ox + pad + 32, oy + 63, `ht ${htPct}%`,
                    { fontSize: '8px', color: '#6a5840' });

                // All 6 attributes
                const a = u.attributes;
                if (a) {
                    this._infTxt(ox + pad, oy + 76,
                        `STR${a.str} DEX${a.dex} CON${a.con}`,
                        { fontSize: '9px', color: '#9a8860' });
                    this._infTxt(ox + pad, oy + 86,
                        `INT${a.int} AGI${a.agi} WIL${a.wil}`,
                        { fontSize: '9px', color: '#9a8860' });
                }

                // Passions
                const burning = Object.entries(u.passions ?? {}).find(([,v]) => v === 'burning');
                const interested = Object.entries(u.passions ?? {}).filter(([,v]) => v === 'interested').map(([k]) => k);
                if (burning) this._infTxt(ox + pad, oy + 97, `♥ ${burning[0]}`, { fontSize: '9px', color: '#c8603a' });
                if (interested.length) this._infTxt(ox + pad, oy + 107,
                    `~ ${interested.map(s=>s.slice(0,5)).join(', ')}`, { fontSize: '8px', color: '#7a7060' });

                // Skills with level > 1
                const trainedSkills = Object.entries(u.skills ?? {}).filter(([,v]) => v.level > 1);
                if (trainedSkills.length) {
                    let sy = oy + 118;
                    const div = this._inf(this.scene.add.graphics().setDepth(22));
                    div.lineStyle(1, 0x3a3020, 0.4).lineBetween(ox + pad, sy - 1, ox + W - pad, sy - 1);
                    trainedSkills.sort((a,b) => b[1].level - a[1].level).slice(0, 4).forEach(([k, v]) => {
                        const stars = '★'.repeat(Math.min(v.level - 1, 4));
                        this._infTxt(ox + pad, sy, `${k.slice(0,8)} ${stars}`,
                            { fontSize: '8px', color: '#7a9060' });
                        sy += 10;
                    });
                }

                // Lineage
                const fa = u.fatherId ? this.scene.units.find(p => p.id === u.fatherId) : null;
                const mo = u.motherId ? this.scene.units.find(p => p.id === u.motherId) : null;
                const spouse = u.spouseId ? this.scene.units.find(p => p.id === u.spouseId) : null;
                const myChildren = this.scene.units.filter(c => c.fatherId === u.id || c.motherId === u.id);

                let ly = oy + 160;
                if (spouse) {
                    const sIcon = spouse.gender === 'female' ? '♀' : '♂';
                    this._infTxt(ox + pad, ly, `${sIcon} ${spouse.name?.slice(0,10) ?? '?'}`,
                        { fontSize: '9px', color: '#c8a870' });
                    ly += 11;
                }
                if (fa || mo) {
                    const lin = [fa?.name?.slice(0,7), mo?.name?.slice(0,7)].filter(Boolean).join(' & ');
                    this._infTxt(ox + pad, ly, `↑ ${lin}`, { fontSize: '8px', color: '#6a5840' });
                    ly += 10;
                }
                if (myChildren.length) {
                    this._infTxt(ox + pad, ly,
                        `↓ ${myChildren.map(c => c.name?.slice(0,5) ?? '?').slice(0,3).join(', ')}`,
                        { fontSize: '8px', color: '#6a7850' });
                }
            } else {
                this._infTxt(ox + pad, oy + 50, `Atk:${u.atk}  Spd:${u.speed}`,
                    { fontSize: '10px', color: '#aaaacc' });
            }
        } else {
            this._infTxt(ox + pad, oy + 5, `${sel.length} units selected`,
                { fontSize: '10px', color: '#c8a030' });
            const tally = {};
            sel.forEach(u => {
                const lbl = u.type === 'worker' && u.role ? u.role : (UNIT_NAMES[u.type] ?? u.type);
                tally[lbl] = (tally[lbl] ?? 0) + 1;
            });
            let ty = oy + 20;
            Object.entries(tally).forEach(([t, c]) => {
                this._infTxt(ox + pad, ty, `${c}×  ${t}`,
                    { fontSize: '10px', color: '#9a9077' });
                ty += 13;
            });
        }
    }

    _renderNodeInfo(ox, oy, W, H, pad) {
        const n = this.scene.selectedNode;
        const label = n.type.replace(/_/g, ' ');
        this._infTxt(ox + pad, oy + 6, label, { fontSize: '12px', color: '#c8a030' });
        this._infTxt(ox + pad, oy + 20, `Stock: ${n.stock}`, { fontSize: '10px', color: '#9a9077' });
        const res = n.resource ?? n.type;
        this._infTxt(ox + pad, oy + 32, `Yields: ${res}`, { fontSize: '10px', color: '#7a9060' });
        this._infBtn(ox + pad, oy + 46, W - pad * 2 - 4, 26, 'Send workers', 0x2a4022, () => {
            if (this.scene.selIds.size > 0) this.scene.orderWorkersToNode(n);
        });
        this._infBtn(ox + pad, oy + 76, W - pad * 2 - 4, 22, 'Close  ✕', 0x221a10, () => {
            this.scene.selectedNode = null; this.updateUI();
        });
    }

    _renderIdleInfo(ox, oy, W, H, pad) {
        this._infTxt(ox + pad, oy + 6, 'No selection',
            { fontSize: '10px', color: '#4a4030' });

        // Show expanded resources
        const sm = this.scene.storageMax ?? {};
        const r  = this.scene.resources  ?? {};
        const extras = [
            { k: 'planks',      icon: '🪵→' },
            { k: 'stoneBlocks', icon: '🧱→' },
            { k: 'sticks',      icon: '🪃' },
            { k: 'stones',      icon: '🪨' },
            { k: 'wool',        icon: '🧶' },
            { k: 'meat',        icon: '🥩' },
            { k: 'sausages',    icon: '🌭' },
            { k: 'wheat',       icon: '🌿' },
            { k: 'flour',       icon: '⚙→' },
            { k: 'olives',      icon: '🫒' },
            { k: 'seeds',       icon: '🌱' },
            { k: 'hide',        icon: '🐾' },
            { k: 'ore',         icon: '🔩' },
        ];
        let ty = oy + 20;
        extras.forEach(({ k, icon }) => {
            if ((sm[k] ?? 0) > 0) {
                this._infTxt(ox + pad, ty, `${icon} ${r[k] ?? 0}/${sm[k]}`,
                    { fontSize: '10px', color: '#7a7060' });
                ty += 13;
            }
        });
    }

    // ─── Actions Zone ────────────────────────────────────────────────────────

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

    _renderActionsZone() {
        this._clearTabs();
        if (this._actionPanel) { this._actionPanel.destroy(); this._actionPanel = null; }

        const { PANEL_H, KEY_H, TAB_H, panelY, INFO_W, MM_W, ACT_W } = this.L;
        const zx = INFO_W + MM_W;
        const zy = panelY + KEY_H;

        const sel  = this.scene.units.filter(u => u.selected && !u.isEnemy);
        const bldg = this.scene.selectedBuilding;

        let items = [];
        let showTabs = false;

        if (bldg) {
            items = this._buildingActionItems(bldg);
        } else if (sel.length > 0) {
            items = this._unitActionItems(sel);
        } else {
            // Nothing selected — show build menu
            showTabs = true;
            items = this._buildMenuItems();
            items.push({ label: 'All', color: 0x223318, callback: () => {
                this.scene.units.filter(u => !u.isEnemy).forEach(u => this.scene.selectUnit(u.id, true));
            }});
        }

        const MAT_H   = showTabs ? 18 : 0;
        const tabsY   = zy + MAT_H;
        const panelY2 = showTabs ? zy + MAT_H + TAB_H : zy;
        const panelH  = PANEL_H - KEY_H - (showTabs ? MAT_H + TAB_H : 0);

        if (showTabs) {
            this._renderMaterialToggle(zx, zy, ACT_W, MAT_H);
            this._renderCategoryTabs(zx, tabsY, ACT_W, TAB_H);
        }

        this._actionPanel = new UIPanel(this.scene, zx, panelY2, ACT_W, panelH);
        this._actionPanel.setItems(items);
    }

    _buildingActionItems(b) {
        const items = [];
        const def = BLDG[b.type];
        const s = this.scene;
        const afford = (cost) => s.economyManager.afford(cost);

        const close = () => { s.selectedBuilding = null; this.updateUI(); };

        if (!b.built) {
            items.push({ label: 'Cancel Build', color: 0x443322, callback: () => { s.demolishBuilding(b); } });
            items.push({ label: '✕ Close', color: 0x2a1c10, callback: close });
            return items;
        }

        // Type-specific actions
        if (b.type === 'gate') {
            items.push({ label: b.isOpen ? 'Close Gate' : 'Open Gate', color: 0x442200, callback: () => {
                b.isOpen = !b.isOpen; s.redrawBuilding(b); this.updateUI();
            }});
        }

        if (b.type === 'barracks') {
            const train = (type, cost, label) => {
                const can = afford(cost);
                items.push({ label, sublabel: Object.entries(cost).map(([r,n])=>`${n}${r[0]}`).join(' '),
                    color: can ? 0x4a3820 : 0x2a1c10, dimmed: !can, callback: () => {
                        if (!can) return;
                        s.economyManager.spend(cost);
                        const cx = (b.tx+b.size/2)*TILE, cy = MAP_OY+(b.ty+b.size/2)*TILE;
                        s.spawnUnit(type, cx+Phaser.Math.Between(-16,16), cy+Phaser.Math.Between(-8,8), false);
                        this.updateUI();
                    }});
            };
            train('clubman',  { food: 3 },           'Clubman');
            train('spearman', { food: 5, stone: 1 },  'Spearman');
        }

        if (b.type === 'archery') {
            const train = (type, cost, label) => {
                const can = afford(cost);
                items.push({ label, sublabel: Object.entries(cost).map(([r,n])=>`${n}${r[0]}`).join(' '),
                    color: can ? 0x2a4030 : 0x2a1c10, dimmed: !can, callback: () => {
                        if (!can) return;
                        s.economyManager.spend(cost);
                        const cx = (b.tx+b.size/2)*TILE, cy = MAP_OY+(b.ty+b.size/2)*TILE;
                        s.spawnUnit(type, cx+Phaser.Math.Between(-16,16), cy+Phaser.Math.Between(-8,8), false);
                        this.updateUI();
                    }});
            };
            train('slinger', { food: 3 },          'Slinger');
            train('archer',  { food: 5, wood: 1 }, 'Archer');
        }

        if (b.type === 'stable') {
            const can = afford({ food: 8, wood: 2 });
            items.push({ label: 'Cavalry', sublabel: '8f 2w', color: can ? 0x4a3010 : 0x2a1c10, dimmed: !can, callback: () => {
                if (!can) return;
                s.economyManager.spend({ food: 8, wood: 2 });
                const cx = (b.tx+b.size/2)*TILE, cy = MAP_OY+(b.ty+b.size/2)*TILE;
                s.spawnUnit('cavalry', cx, cy, false);
                this.updateUI();
            }});
        }

        if (b.type === 'townhall') {
            const can = afford({ wheat: 5 });
            items.push({ label: 'Train Scout', sublabel: '5w', color: can ? 0x334455 : 0x2a1c10, dimmed: !can, callback: () => {
                if (!can) { this.showPhaseMessage('Not enough wheat!', 0xff4444); return; }
                s.resources.wheat -= 5;
                const cx = (b.tx+b.size/2)*TILE, cy = MAP_OY+(b.ty+b.size/2)*TILE;
                s.spawnUnit('scout', cx, cy, false);
                this.updateUI();
            }});
            const rate = s.titheRate ?? 10;
            items.push({ label: `Tithe –  ${rate}%`, color: 0x332211, callback: () => {
                s.titheRate = Math.max(0, (s.titheRate ?? 10) - 5); this.updateUI();
            }});
            items.push({ label: `Tithe +  ${rate}%`, color: 0x223311, callback: () => {
                s.titheRate = Math.min(40, (s.titheRate ?? 10) + 5); this.updateUI();
            }});
            items.push({ label: 'New Game', color: 0x3a1111, callback: () => {
                s.clearSave();
                s.scene.restart();
            }});
        }

        if (b.type === 'pasture' && ((b.males ?? 0) + (b.females ?? 0)) >= 1) {
            items.push({ label: 'Slaughter Sheep', color: 0x661111, callback: () => {
                s._slaughterSheep(b); this.updateUI();
            }});
        }

        if (b.type === 'temple') {
            const c = { ares: 'athena', athena: 'apollo', apollo: 'ares' };
            items.push({ label: `Deity: ${(b.deity ?? 'ares').toUpperCase()}`, color: 0x442266, callback: () => {
                b.deity = c[b.deity ?? 'ares']; this.updateUI();
            }});
        }

        if (b.type === 'garden') {
            const crops = { lentils: 'Lentils', garlic: 'Garlic', onions: 'Onions' };
            const c = { lentils: 'garlic', garlic: 'onions', onions: 'lentils' };
            items.push({ label: `Crop: ${crops[b.cropType ?? 'lentils']}`, color: 0x336633, callback: () => {
                b.cropType = c[b.cropType ?? 'lentils']; this.updateUI();
            }});
        }

        // Assign workers button for production buildings
        if (b.type !== 'house' && b.type !== 'wall' && b.type !== 'palisade') {
            items.push({ label: 'Assign Workers', color: 0x334422, callback: () => {
                s.orderWorkersToBuilding(b); this.updateUI();
            }});
        }

        items.push({ label: 'Demolish', color: 0x551111, callback: () => { s.demolishBuilding(b); } });
        items.push({ label: '✕ Close',  color: 0x2a1c10, callback: close });
        return items;
    }

    _unitActionItems(sel) {
        const items = [];
        const s = this.scene;
        const workers  = sel.filter(u => u.type === 'worker' && u.age >= 2);
        const military = sel.filter(u => u.type !== 'worker');
        const scouts   = sel.filter(u => u.type === 'scout');

        if (workers.length > 0 && military.length === 0) {
            // Pure worker selection — role assignment
            const ROLES = [
                { role: 'farmer',     label: 'Farm',    color: 0x336622 },
                { role: 'forager',    label: 'Forage',  color: 0x2a4a22 },
                { role: 'woodcutter', label: 'Lumber',  color: 0x5a3a18 },
                { role: 'miner',      label: 'Mine',    color: 0x444444 },
                { role: 'builder',    label: 'Build',   color: 0x554422 },
                { role: 'shepherd',   label: 'Herd',    color: 0x445533 },
                { role: 'hunter',     label: 'Hunt',    color: 0x553322 },
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
            items.push({ label: 'Recall Home', color: 0x223344, callback: () => {
                workers.forEach(u => {
                    const home = s.buildings.find(b => b.id === u.homeBldgId);
                    if (home) u.moveTo = { x: (home.tx+home.size/2)*TILE, y: MAP_OY+(home.ty+home.size/2)*TILE };
                    u.taskType = null; u.targetNode = null;
                });
                s.deselect(); this.updateUI();
            }});
        } else if (military.length > 0 || scouts.length > 0) {
            // Military / scout selection — formation + combat commands
            const fmItems = FM_TYPES.map((type, i) => ({
                label: FM_LABELS[i],
                color: s.fmType === type ? 0x336688 : 0x1e2c3a,
                active: s.fmType === type,
                callback: () => {
                    s.fmType = type;
                    const ax = sel.reduce((acc, u) => acc + u.x, 0) / sel.length;
                    const ay = sel.reduce((acc, u) => acc + u.y, 0) / sel.length;
                    s.moveSelectedTo(ax, ay);
                    this.updateUI();
                },
            }));
            items.push(...fmItems);

            if (scouts.length > 0) {
                items.push({ label: 'Explore', color: 0x3a2a50, callback: () => {
                    scouts.forEach(u => { u.role = 'scouting'; });
                    s.deselect(); this.updateUI();
                }});
            }

            // Garrison nearest watchtower
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
        } else {
            // Mixed or children — just move commands
            const fmItems = FM_TYPES.map((type, i) => ({
                label: FM_LABELS[i], color: s.fmType === type ? 0x336688 : 0x1e2c3a, active: s.fmType === type,
                callback: () => { s.fmType = type; this.updateUI(); },
            }));
            items.push(...fmItems);
        }

        items.push({ label: 'Select All', color: 0x223318, callback: () => {
            s.units.filter(u => !u.isEnemy).forEach(u => s.selectUnit(u.id, true));
            this.updateUI();
        }});
        items.push({ label: '✕ Clear', color: 0x2a1c10, callback: () => {
            s.bldgType = null; s.roadMode = false;
            s.deselect(); s.hoverGfx?.clear(); this.updateUI();
        }});
        return items;
    }

    _renderMaterialToggle(x, y, w, h) {
        const mat  = this.scene.bldgMaterial ?? 'wood';
        const half = Math.floor(w / 2);
        [['wood', '🪵 Wood', x], ['stone', '🧱 Stone', x + half]].forEach(([m, label, bx]) => {
            const active = mat === m;
            const bg = this._tab(this.scene.add.graphics().setDepth(22));
            bg.fillStyle(active ? 0x4a3018 : 0x1a1208, active ? 0.95 : 0.7)
              .fillRect(bx, y, half - 1, h - 1);
            if (active) bg.lineStyle(1, 0xc8a030, 0.7).strokeRect(bx, y, half - 1, h - 1);
            this._tab(this.scene.add.text(bx + half / 2, y + h / 2, label, {
                fontFamily: 'monospace', fontSize: '9px',
                color: active ? '#e8d090' : '#5a4a28',
            }).setOrigin(0.5).setDepth(22));
            this._tab(this.scene.add.zone(bx + half / 2, y + h / 2, half - 1, h - 1)
                .setInteractive().setDepth(23))
                .on('pointerdown', () => { this.scene.bldgMaterial = m; this.updateUI(); });
        });
    }

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
            const txt = this._tab(this.scene.add.text(tx + tabW / 2, y + h / 2, label, {
                fontFamily: 'monospace', fontSize: '11px',
                color: active ? '#e8d8a0' : '#6a5a3a',
            }).setOrigin(0.5).setDepth(22));

            const z = this._tab(this.scene.add.zone(tx + tabW / 2, y + h / 2, tabW - 1, h - 1)
                .setInteractive().setDepth(23));
            z.on('pointerdown', () => {
                this.scene.buildCat = cat; this.updateUI();
            });
        });
    }

    _buildMenuItems() {
        const mat  = this.scene.bldgMaterial ?? 'wood';
        const bldgs = BLDG_CATS[this.scene.buildCat] ?? [];
        const items = bldgs.map(type => {
            const def      = BLDG[type];
            const cost     = computeBuildCost(type, mat);
            const canBuy   = !Object.keys(cost).length || this.scene.economyManager.afford(cost);
            const isActive = this.scene.bldgType === type;
            const costStr  = Object.keys(cost).length
                ? Object.entries(cost).map(([r, n]) => `${n}${r[0]}`).join(' ')
                : null;
            return {
                label: def.label,
                sublabel: costStr,
                desc: def.desc,
                color: isActive ? 0x4a6070 : (def.color > 0 ? Math.max(0, (def.color & 0xfefefe) >> 1) : 0x2a1e0e),
                dimmed: !canBuy,
                active: isActive,
                callback: () => {
                    this.scene.bldgType = isActive ? null : type;
                    this.scene.roadMode = false;
                    this.scene.hoverGfx?.clear();
                    this.updateUI();
                },
            };
        });

        items.push({
            label: 'Road',
            sublabel: '1s',
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
    }

    // ─── Float / Phase messages ──────────────────────────────────────────────

    showFloatText(x, y, text, color) {
        const txt = this.scene._w(this.scene.add.text(x, y, text, {
            fontSize: '11px', color, fontFamily: 'monospace',
            stroke: '#000000', strokeThickness: 2,
        }).setOrigin(0.5).setDepth(50));
        this.scene.tweens.add({
            targets: txt, y: y - 24, alpha: 0, duration: 900,
            onComplete: () => txt.destroy(),
        });
    }

    showCaravanOffer(offer) {
        if (this._caravanModal) return; // already showing
        const { W, H } = this.L;
        const mw = Math.min(300, W - 40), mh = 130;
        const mx = (W - mw) / 2, my = (H - mh) / 2 - 30;
        const objs = [];

        const bg = this._ui(this.scene.add.rectangle(mx + mw/2, my + mh/2, mw, mh, 0x1a1408, 0.95).setDepth(20).setStrokeStyle(2, 0xddaa44));
        objs.push(bg);

        const title = this._ui(this.scene.add.text(mx + mw/2, my + 14, '🛒 Merchants arrive!', { fontSize: '13px', color: '#ffdd88', fontStyle: 'bold' }).setOrigin(0.5, 0).setDepth(20));
        objs.push(title);

        const offerText = this._ui(this.scene.add.text(mx + mw/2, my + 40, offer.label, { fontSize: '13px', color: '#ffffff' }).setOrigin(0.5, 0).setDepth(20));
        objs.push(offerText);

        const closeAll = () => { objs.forEach(o => o.destroy()); this._caravanModal = null; };

        const canAfford = Object.entries(offer.give).every(([r, n]) => (this.scene.resources[r] ?? 0) >= n);
        const acceptCol = canAfford ? 0x336622 : 0x443322;
        const acceptBg = this._ui(this.scene.add.rectangle(mx + mw/2 - 45, my + 88, 80, 28, acceptCol, 1).setDepth(20).setInteractive());
        const acceptTxt = this._ui(this.scene.add.text(mx + mw/2 - 45, my + 88, 'Accept', { fontSize: '12px', color: canAfford ? '#aaffaa' : '#888866' }).setOrigin(0.5).setDepth(21));
        objs.push(acceptBg, acceptTxt);

        acceptBg.on('pointerup', () => {
            if (!canAfford) return;
            Object.entries(offer.give).forEach(([r, n]) => this.scene.resources[r] -= n);
            Object.entries(offer.receive).forEach(([r, n]) => {
                this.scene.resources[r] = (this.scene.resources[r] ?? 0) + n;
            });
            this.scene.updateUI();
            this.showPhaseMessage('Trade accepted!', 0x88ee88);
            closeAll();
        });

        const declineBg = this._ui(this.scene.add.rectangle(mx + mw/2 + 45, my + 88, 80, 28, 0x442222, 1).setDepth(20).setInteractive());
        const declineTxt = this._ui(this.scene.add.text(mx + mw/2 + 45, my + 88, 'Decline', { fontSize: '12px', color: '#ffaaaa' }).setOrigin(0.5).setDepth(21));
        objs.push(declineBg, declineTxt);
        declineBg.on('pointerup', closeAll);

        // Auto-dismiss after 15s
        this.scene.time.delayedCall(15000, () => { if (this._caravanModal) closeAll(); });
        this._caravanModal = objs;
    }

    showPhaseMessage(text, color) {
        this.scene.phaseMsg
            .setText(text)
            .setColor('#' + color.toString(16).padStart(6, '0'))
            .setAlpha(1);
        this.scene.tweens.add({
            targets: this.scene.phaseMsg, alpha: 0, delay: 2800, duration: 600,
        });
    }
}
