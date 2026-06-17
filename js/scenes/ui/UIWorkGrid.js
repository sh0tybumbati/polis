import { THEME } from '../../ui/UIKit.js';

// RimWorld-style Work tab: a matrix of every worker (rows) × work type (columns).
// Each cell shows that colonist's per-job priority from u.taskPriorities (the same
// store pickRole consumes) and cycles —→1→2→3→4→Off→— on tap. 'haul' is a real
// work type here, gating loose-item hauling in UnitWorker.seekGroundItem.
const WORK_COLS = [
    { id: 'farmer',     ic: '🌾' },
    { id: 'forager',    ic: '🍄' },
    { id: 'woodcutter', ic: '🪵' },
    { id: 'miner',      ic: '⛏' },
    { id: 'builder',    ic: '🔨' },
    { id: 'shepherd',   ic: '🐑' },
    { id: 'hunter',     ic: '🏹' },
    { id: 'haul',       ic: '📦' },
];

const CYCLE   = [undefined, 1, 2, 3, 4, 0];
const stLabel = v => v === 0 ? '×' : (v >= 1 && v <= 4) ? `${v}` : '—';
const stColor = v => v === 0 ? 0x4a2020 : v === 1 ? 0x3a6a2a : v === 2 ? 0x315a36
                  : v === 3 ? 0x2a3a4a : v === 4 ? 0x3a2a4a : 0x241e14;

export default {
    _renderWorkGrid(x, y, w, h) {
        const s   = this.scene;
        const pad = 6;
        const workers = s.units
            .filter(u => !u.isEnemy && u.hp > 0 && u.type === 'worker' && u.age >= 2)
            .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));

        const HDR_H = 26;
        const nameW = Math.floor(w * 0.30);
        const colW  = Math.floor((w - nameW - pad) / WORK_COLS.length);
        const colX  = i => x + nameW + i * colW;

        // Header: column icons
        const hg = this._tab(s.add.graphics().setDepth(21));
        hg.fillStyle(0x0e1420, 0.9).fillRect(x, y, w, HDR_H);
        hg.lineStyle(1, 0x3a2e18, 0.5).lineBetween(x, y + HDR_H, x + w, y + HDR_H);
        this._tab(s.add.text(x + pad, y + HDR_H / 2, 'Work — tap to cycle', {
            fontFamily: THEME.fontMono, fontSize: '8px', color: '#7a6a4a',
        }).setOrigin(0, 0.5).setDepth(22));
        WORK_COLS.forEach((c, i) => {
            this._tab(s.add.text(colX(i) + colW / 2, y + HDR_H / 2, c.ic, {
                fontFamily: THEME.fontMono, fontSize: '11px',
            }).setOrigin(0.5).setDepth(22));
        });

        // Rows (paginated, reusing _censusPage)
        const ROW_H   = 18;
        const avail   = h - HDR_H;
        const perPage = Math.max(1, Math.floor(avail / ROW_H));
        const pages   = Math.ceil(workers.length / perPage) || 1;
        this._censusPage = Math.max(0, Math.min(this._censusPage ?? 0, pages - 1));
        const paged = workers.slice(this._censusPage * perPage, (this._censusPage + 1) * perPage);

        paged.forEach((u, ri) => {
            const ry = y + HDR_H + ri * ROW_H;
            if (ri > 0) {
                const sg = this._tab(s.add.graphics().setDepth(21));
                sg.lineStyle(1, 0x2a2218, 0.4).lineBetween(x, ry, x + w, ry);
            }
            // Name (click pans to the colonist)
            const nm = this._tab(s.add.text(x + pad, ry + ROW_H / 2, (u.name ?? '?').slice(0, 9), {
                fontFamily: THEME.fontMono, fontSize: '9px', color: '#d4c8a8',
            }).setOrigin(0, 0.5).setDepth(22).setInteractive({ cursor: 'pointer' }));
            nm.on('pointerdown', () => {
                s.cameras.main.pan(u.x, u.y, 250, 'Sine.easeInOut');
                s.selectUnit?.(u.id, false); this.updateUI();
            });
            // Priority cells
            WORK_COLS.forEach((c, ci) => {
                const cur = u.taskPriorities?.[c.id];
                const cx = colX(ci), cyy = ry + 1, cw = colW - 2, chh = ROW_H - 2;
                const g = this._tab(s.add.graphics().setDepth(22));
                g.fillStyle(stColor(cur), 0.9).fillRect(cx, cyy, cw, chh);
                g.lineStyle(1, 0x000000, 0.3).strokeRect(cx, cyy, cw, chh);
                this._tab(s.add.text(cx + cw / 2, cyy + chh / 2, stLabel(cur), {
                    fontFamily: THEME.fontMono, fontSize: '9px',
                    color: cur === 0 ? '#cc8888' : cur ? '#e8e0c0' : '#6a5e44',
                }).setOrigin(0.5).setDepth(23));
                const z = this._tab(s.add.zone(cx + cw / 2, cyy + chh / 2, cw, chh)
                    .setInteractive({ cursor: 'pointer' }).setDepth(24));
                z.on('pointerdown', () => {
                    const next = CYCLE[(CYCLE.findIndex(v => v === cur) + 1) % CYCLE.length];
                    if (!u.taskPriorities) u.taskPriorities = {};
                    if (next === undefined) delete u.taskPriorities[c.id];
                    else u.taskPriorities[c.id] = next;
                    this.updateUI();
                });
            });
        });

        // Page arrows (top-right) when needed
        if (pages > 1) {
            if (this._censusPage > 0) {
                const pb = this._tab(s.add.text(x + w - 30, y + HDR_H / 2, '◂', {
                    fontFamily: THEME.fontMono, fontSize: '13px', color: '#9a8858',
                }).setOrigin(0.5).setDepth(23).setInteractive({ cursor: 'pointer' }));
                pb.on('pointerdown', () => { this._censusPage--; this.updateUI(); });
            }
            if (this._censusPage < pages - 1) {
                const nb = this._tab(s.add.text(x + w - 14, y + HDR_H / 2, '▸', {
                    fontFamily: THEME.fontMono, fontSize: '13px', color: '#9a8858',
                }).setOrigin(0.5).setDepth(23).setInteractive({ cursor: 'pointer' }));
                nb.on('pointerdown', () => { this._censusPage++; this.updateUI(); });
            }
        }
    },
};
