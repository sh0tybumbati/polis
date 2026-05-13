import { renderShapes, res } from '../engine/renderShapes.js';
import { UNITS } from '../content/units/index.js';

// ── When-condition presets ────────────────────────────────────────────────────
// whenKey → { label, fn (for live preview), js (for export) }
const WHEN_PRESETS = {
    always:      { label: 'always',      fn: null,                                         js: null },
    age0:        { label: 'age:0',       fn: v => v.age === 0,                             js: 'v => v.age === 0' },
    age1:        { label: 'age:1',       fn: v => v.age === 1,                             js: 'v => v.age === 1' },
    age2:        { label: 'age:2+',      fn: v => v.age >= 2,                              js: 'v => v.age >= 2' },
    selected:    { label: 'selected',    fn: v => v.selected,                              js: 'v => v.selected' },
    'sel+age0':  { label: 'sel+age0',   fn: v => v.selected && v.age === 0,               js: 'v => v.selected && v.age === 0' },
    'sel+age1':  { label: 'sel+age1',   fn: v => v.selected && v.age === 1,               js: 'v => v.selected && v.age === 1' },
    'sel+age2':  { label: 'sel+age2',   fn: v => v.selected && v.age >= 2,                js: 'v => v.selected && v.age >= 2' },
    hasRole:     { label: 'hasRole',     fn: v => v.hasRole,                               js: 'v => v.hasRole' },
    hasCarry:    { label: 'hasCarry',    fn: v => v.hasCarry,                              js: 'v => v.hasCarry' },
    working:     { label: 'working',     fn: v => v.working,                               js: 'v => v.working' },
    isArchon:    { label: 'isArchon',    fn: v => v.isArchon,                              js: 'v => v.isArchon' },
    procure:     { label: 'procure',     fn: v => v.hasRole && v.subrole === 'procure',    js: "v => v.hasRole && v.subrole === 'procure'" },
    process:     { label: 'process',     fn: v => v.hasRole && v.subrole === 'process',    js: "v => v.hasRole && v.subrole === 'process'" },
};
const WHEN_KEYS = Object.keys(WHEN_PRESETS);

const PALETTE = [
    0xccccaa, 0xffdd44, 0x66dd44, 0xee4466,
    0x9999bb, 0xf0ece0, 0xdd8833, 0xffaa22,
    0x111111, 0x444444, 0x888888, 0xdddddd,
    0xaa7733, 0xcc9944, 0xffdd88, 0xffaa44,
    0x88cc44, 0xdd5533, 0xddcc66, 0xaaaadd,
    0xeeddcc, 0xcc8855, 0x55aa55, 0xaa8844,
    0xffdd00, 0xaa8800, 0x44aaff, 0xff8844,
    0x4488ff, 0xff4444, 0x44ff88, 0xffffff,
];

const VAR_FILLS = ['$bodyCol', '$roleCol', '$carryCol', '$workBarCol'];

export default class SpriteEditorScene extends Phaser.Scene {
    constructor() { super({ key: 'SpriteEditorScene' }); }

    create() {
        const W = this.scale.width;
        const H = this.scale.height;
        this.W = W; this.H = H;

        // Layout constants
        this.SCALE  = Math.min(7, Math.floor(H / 80));
        this.CW     = Math.min(Math.floor(W * 0.52), 360);   // canvas column width
        this.PW     = W - this.CW - 4;                        // property column width
        this.CX     = Math.floor(this.CW / 2);                // canvas center x
        this.CY     = Math.floor(H / 2);                      // canvas center y
        this.PX     = this.CW + 4;                            // property panel left edge

        // Editor state
        this.entityId    = 'worker';
        this.currentLod  = 2;
        this.shapes      = [];
        this.selIdx      = -1;
        this.newType     = 'circle';
        this.newFill     = 0xccccaa;
        this.newAlpha    = 1.0;
        this.newWhenKey  = 'always';
        this.showVarMenu = false;

        // Preview vars resolved into $varName shape fields during live render.
        // Extend this as sprites grow more complex.
        this.pv = {
            bodyCol: 0xccccaa,
        };

        // Drag + scroll state
        this._drag = null;  // { idx, ox, oy }
        this._listScroll = 0;

        // Graphics layers
        this.bgGfx   = this.add.graphics();
        this.gridGfx = this.add.graphics();
        this.shpGfx  = this.add.graphics();
        this.selGfx  = this.add.graphics();
        this.uiGfx   = this.add.graphics();

        // UI element containers (destroyed + rebuilt on refresh)
        this._uiObjs = [];

        this._loadEntity();
        this._buildInput();
        this._redraw();
    }

    // ── Data loading ────────────────────────────────────────────────────────────

    _loadEntity() {
        const def = UNITS[this.entityId];
        if (!def?.shapes) { this.shapes = []; return; }
        const src = def.shapes[this.currentLod] ?? def.shapes[2] ?? [];
        this.shapes = src.map(s => ({ ...s }));
        this.selIdx = -1;
    }

    // ── Input ───────────────────────────────────────────────────────────────────

    _buildInput() {
        // Canvas pointer zone
        const zone = this.add.zone(0, 0, this.CW, this.H).setOrigin(0).setInteractive();

        zone.on('pointerdown', ptr => {
            const gx = Math.round((ptr.x - this.CX) / this.SCALE);
            const gy = Math.round((ptr.y - this.CY) / this.SCALE);
            // Hit-test shapes in reverse (topmost first)
            for (let i = this.shapes.length - 1; i >= 0; i--) {
                if (this._hitTest(this.shapes[i], gx, gy)) {
                    this.selIdx = i;
                    this._drag = { idx: i, ox: gx, oy: gy };
                    this._scrollListTo(i);
                    this._redraw();
                    return;
                }
            }
            // No hit → place new shape
            this.selIdx = -1;
            this._placeShape(gx, gy);
            this._drag = null;
            this._redraw();
        });

        zone.on('pointermove', ptr => {
            if (!this._drag) return;
            const gx = Math.round((ptr.x - this.CX) / this.SCALE);
            const gy = Math.round((ptr.y - this.CY) / this.SCALE);
            const dx = gx - this._drag.ox;
            const dy = gy - this._drag.oy;
            if (dx === 0 && dy === 0) return;
            this._moveShape(this._drag.idx, dx, dy);
            this._drag.ox = gx;
            this._drag.oy = gy;
            this._redraw();
        });

        zone.on('pointerup', () => { this._drag = null; });

        this.input.keyboard?.on('keydown-ESC', () => this.scene.stop());
        this.input.keyboard?.on('keydown-DELETE', () => { this._deleteSelected(); this._redraw(); });
        this.input.keyboard?.on('keydown-BACKSPACE', () => { this._deleteSelected(); this._redraw(); });
    }

    // ── Shape manipulation ──────────────────────────────────────────────────────

    _placeShape(gx, gy) {
        const s = { type: this.newType, fill: this.newFill, alpha: this.newAlpha, whenKey: this.newWhenKey };
        const wp = WHEN_PRESETS[this.newWhenKey];
        if (wp?.fn) s.when = wp.fn;
        switch (this.newType) {
            case 'circle':   Object.assign(s, { x: gx, y: gy, r: 5 }); break;
            case 'triangle': Object.assign(s, { x1: gx, y1: gy - 8, x2: gx - 6, y2: gy + 4, x3: gx + 6, y3: gy + 4 }); break;
            case 'rect':     Object.assign(s, { x: gx - 6, y: gy - 3, w: 12, h: 6 }); break;
            case 'line':     Object.assign(s, { x1: gx - 6, y1: gy, x2: gx + 6, y2: gy, stroke: { color: this.newFill, width: 1 } }); delete s.fill; break;
        }
        this.shapes.push(s);
        this.selIdx = this.shapes.length - 1;
    }

    _deleteSelected() {
        if (this.selIdx < 0 || this.selIdx >= this.shapes.length) return;
        this.shapes.splice(this.selIdx, 1);
        this.selIdx = Math.min(this.selIdx, this.shapes.length - 1);
    }

    _moveShape(idx, dx, dy) {
        const s = this.shapes[idx];
        // Only move shapes with fixed numeric coords (not $var references)
        const mv = (f, d) => { if (typeof s[f] === 'number') s[f] += d; };
        if (s.type === 'circle') { mv('x', dx); mv('y', dy); }
        else if (s.type === 'rect') { mv('x', dx); mv('y', dy); }
        else if (s.type === 'triangle' || s.type === 'line') {
            mv('x1', dx); mv('y1', dy); mv('x2', dx); mv('y2', dy);
            mv('x3', dx); mv('y3', dy);
        }
    }

    _nudge(field, delta) {
        if (this.selIdx < 0) return;
        const s = this.shapes[this.selIdx];
        if (typeof s[field] === 'number') s[field] = Math.round((s[field] + delta) * 10) / 10;
        this._redraw();
    }

    _hitTest(s, gx, gy) {
        const v = this.pv;
        const PAD = 4;
        switch (s.type) {
            case 'circle': {
                const cx = res(s.x, v), cy = res(s.y, v), r = res(s.r, v);
                return Math.hypot(gx - cx, gy - cy) <= r + PAD;
            }
            case 'triangle': {
                const xs = [res(s.x1,v), res(s.x2,v), res(s.x3,v)];
                const ys = [res(s.y1,v), res(s.y2,v), res(s.y3,v)];
                return gx >= Math.min(...xs) - PAD && gx <= Math.max(...xs) + PAD
                    && gy >= Math.min(...ys) - PAD && gy <= Math.max(...ys) + PAD;
            }
            case 'rect': {
                const rx = res(s.x,v), ry = res(s.y,v);
                return gx >= rx - PAD && gx <= rx + res(s.w,v) + PAD
                    && gy >= ry - PAD && gy <= ry + res(s.h,v) + PAD;
            }
            case 'line': {
                const mx = (res(s.x1,v) + res(s.x2,v)) / 2;
                const my = (res(s.y1,v) + res(s.y2,v)) / 2;
                return Math.hypot(gx - mx, gy - my) <= 8 + PAD;
            }
        }
        return false;
    }

    // ── Rendering ───────────────────────────────────────────────────────────────

    _redraw() {
        this._drawBackground();
        this._drawGrid();
        this._drawShapes();
        this._drawSelectionHandle();
        this._buildUI();
    }

    _drawBackground() {
        this.bgGfx.clear();
        this.bgGfx.fillStyle(0x0a0e0a).fillRect(0, 0, this.W, this.H);
        this.bgGfx.fillStyle(0x101810).fillRect(0, 0, this.CW, this.H);
        this.bgGfx.fillStyle(0x0c100c).fillRect(this.PX, 0, this.PW, this.H);
        this.bgGfx.lineStyle(1, 0x223322).lineBetween(this.CW, 0, this.CW, this.H);
    }

    _drawGrid() {
        this.gridGfx.clear();
        const SC = this.SCALE;
        const CX = this.CX, CY = this.CY;
        // Minor grid (every 1 game px)
        this.gridGfx.lineStyle(0.5, 0x1a221a, 0.4);
        for (let gx = -20; gx <= 20; gx++) {
            const sx = CX + gx * SC;
            if (sx < 0 || sx > this.CW) continue;
            this.gridGfx.lineBetween(sx, 0, sx, this.H);
        }
        for (let gy = -20; gy <= 20; gy++) {
            const sy = CY + gy * SC;
            if (sy < 0 || sy > this.H) continue;
            this.gridGfx.lineBetween(0, sy, this.CW, sy);
        }
        // Origin crosshair
        this.gridGfx.lineStyle(1, 0x335533, 0.8)
            .lineBetween(CX, 0, CX, this.H)
            .lineBetween(0, CY, this.CW, CY);
        // Origin dot
        this.gridGfx.fillStyle(0x44aa44, 0.9).fillCircle(CX, CY, 2);
    }

    _drawShapes() {
        this.shpGfx.clear();
        this.shpGfx.setPosition(this.CX, this.CY);
        // Shadow ellipse
        this.shpGfx.fillStyle(0x000000, 0.2).fillEllipse(0, 9 * this.SCALE, 22 * this.SCALE, 7 * this.SCALE);
        renderShapes(this.shpGfx, this.shapes, this.pv, { scale: this.SCALE });
    }

    _drawSelectionHandle() {
        this.selGfx.clear();
        if (this.selIdx < 0 || this.selIdx >= this.shapes.length) return;
        const s = this.shapes[this.selIdx];
        const v = this.pv;
        const SC = this.SCALE;
        const CX = this.CX, CY = this.CY;

        this.selGfx.lineStyle(1, 0x88ffaa, 0.9);
        switch (s.type) {
            case 'circle': {
                const sx = CX + res(s.x,v)*SC, sy = CY + res(s.y,v)*SC, sr = res(s.r,v)*SC;
                this.selGfx.strokeCircle(sx, sy, sr + 3);
                this.selGfx.fillStyle(0x88ffaa, 0.8).fillCircle(sx + sr + 3, sy, 3);
                break;
            }
            case 'triangle': {
                const pts = [[s.x1,s.y1],[s.x2,s.y2],[s.x3,s.y3]];
                for (const [px, py] of pts) {
                    if (typeof px === 'number')
                        this.selGfx.fillStyle(0x88ffaa, 0.8).fillCircle(CX+px*SC, CY+py*SC, 3);
                }
                const minX = Math.min(res(s.x1,v),res(s.x2,v),res(s.x3,v));
                const minY = Math.min(res(s.y1,v),res(s.y2,v),res(s.y3,v));
                const maxX = Math.max(res(s.x1,v),res(s.x2,v),res(s.x3,v));
                const maxY = Math.max(res(s.y1,v),res(s.y2,v),res(s.y3,v));
                this.selGfx.strokeRect(CX+minX*SC-3, CY+minY*SC-3, (maxX-minX)*SC+6, (maxY-minY)*SC+6);
                break;
            }
            case 'rect': {
                const rx = CX+res(s.x,v)*SC, ry = CY+res(s.y,v)*SC;
                this.selGfx.strokeRect(rx-3, ry-3, res(s.w,v)*SC+6, res(s.h,v)*SC+6);
                this.selGfx.fillStyle(0x88ffaa, 0.8)
                    .fillCircle(rx+res(s.w,v)*SC+3, ry+res(s.h,v)*SC+3, 3);
                break;
            }
        }
    }

    // ── UI construct ─────────────────────────────────────────────────────────────

    _buildUI() {
        // Destroy previous UI objects
        for (const o of this._uiObjs) o.destroy();
        this._uiObjs = [];
        this.uiGfx.clear();

        const add = o => { this._uiObjs.push(o); return o; };
        const fs  = n  => `${Math.round(n * Math.min(1.4, Math.max(1, this.W / 420)))}px`;

        const txt = (x, y, str, style) => add(this.add.text(x, y, str, {
            fontFamily: 'monospace', color: '#aaaaaa', ...style }).setDepth(10));

        const btn = (x, y, w, h, label, col, cb, active = false) => {
            const g = this.add.graphics().setDepth(9);
            g.fillStyle(active ? 0x2a4428 : col, 1).fillRect(x, y, w, h);
            g.lineStyle(1, active ? 0x44aa44 : 0x334433).strokeRect(x, y, w, h);
            const t = this.add.text(x + w/2, y + h/2, label, {
                fontFamily: 'monospace', fontSize: fs(10), color: active ? '#88ff88' : '#aaccaa',
            }).setOrigin(0.5).setDepth(10);
            const zone = this.add.zone(x, y, w, h).setOrigin(0).setInteractive().setDepth(11);
            zone.on('pointerdown', cb);
            zone.on('pointerover', () => { g.clear(); g.fillStyle(0x1a3020).fillRect(x,y,w,h); g.lineStyle(1,0x44cc44).strokeRect(x,y,w,h); });
            zone.on('pointerout',  () => { g.clear(); g.fillStyle(active?0x2a4428:col).fillRect(x,y,w,h); g.lineStyle(1,active?0x44aa44:0x334433).strokeRect(x,y,w,h); });
            add(g); add(t); add(zone);
            return zone;
        };

        const PX = this.PX + 6;
        const PW = this.PW - 10;
        let py = 6;

        // ── Entity + close ──────────────────────────────────────────────────────
        txt(PX, py + 3, `✏ ${this.entityId}`, { fontSize: fs(11), color: '#c8a030' });
        btn(PX + PW - 40, py, 40, 22, '✕ back', 0x221111, () => this.scene.stop());
        py += 28;

        // ── LoD tabs ────────────────────────────────────────────────────────────
        txt(PX, py + 3, 'LoD:', { fontSize: fs(9), color: '#668866' });
        const lodLabels = ['0:map','1:far','2:std','3:hi'];
        lodLabels.forEach((l, i) => {
            btn(PX + 36 + i * 44, py, 40, 22, l, 0x111811, () => {
                this.currentLod = i; this._loadEntity(); this._redraw();
            }, this.currentLod === i);
        });
        py += 28;

        // ── Shape type ──────────────────────────────────────────────────────────
        txt(PX, py + 3, 'New shape:', { fontSize: fs(9), color: '#668866' });
        [['○','circle'], ['△','triangle'], ['□','rect'], ['—','line']].forEach(([icon, tp], i) => {
            btn(PX + i * 38, py + 16, 34, 24, icon, 0x111811, () => { this.newType = tp; this._redraw(); }, this.newType === tp);
        });
        py += 46;

        // ── Color palette ────────────────────────────────────────────────────────
        txt(PX, py, 'Fill color:', { fontSize: fs(9), color: '#668866' });
        py += 14;

        // Variable fill buttons
        VAR_FILLS.forEach((vf, i) => {
            const short = vf.replace('$','$').slice(0,9);
            btn(PX + i * Math.floor(PW/4), py, Math.floor(PW/4)-2, 18, short, 0x111811, () => {
                this.newFill = vf;
                if (this.selIdx >= 0) { this.shapes[this.selIdx].fill = vf; }
                this._redraw();
            }, this.newFill === vf);
        });
        py += 22;

        // Fixed color swatches (4 per row)
        const SW = Math.floor(PW / 8) - 1;
        PALETTE.forEach((col, i) => {
            const sx = PX + (i % 8) * (SW + 1);
            const sy = py + Math.floor(i / 8) * (SW + 1);
            this.uiGfx.fillStyle(col).fillRect(sx, sy, SW, SW);
            if (this.newFill === col) this.uiGfx.lineStyle(2, 0xffffff).strokeRect(sx-1, sy-1, SW+2, SW+2);
            const zone = this.add.zone(sx, sy, SW, SW).setOrigin(0).setInteractive().setDepth(11);
            zone.on('pointerdown', () => {
                this.newFill = col;
                if (this.selIdx >= 0) { this.shapes[this.selIdx].fill = col; }
                this._redraw();
            });
            add(zone);
        });
        py += Math.ceil(PALETTE.length / 8) * (SW + 1) + 4;

        // ── Alpha ───────────────────────────────────────────────────────────────
        txt(PX, py + 3, 'Alpha:', { fontSize: fs(9), color: '#668866' });
        const alphaVal = this.selIdx >= 0 ? (this.shapes[this.selIdx].alpha ?? 1) : this.newAlpha;
        btn(PX + 42,  py, 22, 22, '−', 0x111811, () => { this.newAlpha = Math.max(0, Math.round((this.newAlpha - 0.1)*10)/10); if (this.selIdx>=0) this.shapes[this.selIdx].alpha = this.newAlpha; this._redraw(); });
        txt(PX + 66, py + 4, alphaVal.toFixed(1), { fontSize: fs(10), color: '#cccccc' });
        btn(PX + 88,  py, 22, 22, '+', 0x111811, () => { this.newAlpha = Math.min(1, Math.round((this.newAlpha + 0.1)*10)/10); if (this.selIdx>=0) this.shapes[this.selIdx].alpha = this.newAlpha; this._redraw(); });
        py += 28;

        // ── When condition ──────────────────────────────────────────────────────
        txt(PX, py + 3, 'When:', { fontSize: fs(9), color: '#668866' });
        const wk = this.selIdx >= 0 ? (this.shapes[this.selIdx].whenKey ?? 'always') : this.newWhenKey;
        const wi = WHEN_KEYS.indexOf(wk);
        btn(PX + 40, py, 22, 22, '◀', 0x111811, () => {
            const nk = WHEN_KEYS[(wi + WHEN_KEYS.length - 1) % WHEN_KEYS.length];
            this.newWhenKey = nk;
            if (this.selIdx >= 0) { const s = this.shapes[this.selIdx]; s.whenKey = nk; s.when = WHEN_PRESETS[nk]?.fn ?? null; }
            this._redraw();
        });
        txt(PX + 64, py + 4, WHEN_PRESETS[wk]?.label ?? wk, { fontSize: fs(9), color: '#aaddaa' });
        btn(PX + 118, py, 22, 22, '▶', 0x111811, () => {
            const nk = WHEN_KEYS[(wi + 1) % WHEN_KEYS.length];
            this.newWhenKey = nk;
            if (this.selIdx >= 0) { const s = this.shapes[this.selIdx]; s.whenKey = nk; s.when = WHEN_PRESETS[nk]?.fn ?? null; }
            this._redraw();
        });
        py += 28;

        // ── Shape properties ─────────────────────────────────────────────────────
        this.uiGfx.lineStyle(1, 0x223322, 0.6).lineBetween(PX, py, PX+PW, py); py += 6;
        if (this.selIdx >= 0 && this.selIdx < this.shapes.length) {
            const s = this.shapes[this.selIdx];
            txt(PX, py, `#${this.selIdx} — ${s.type}`, { fontSize: fs(9), color: '#c8a030' });
            py += 14;

            const propRow = (label, field, step = 1) => {
                const val = s[field];
                const isVar = typeof val === 'string';
                txt(PX, py + 3, label, { fontSize: fs(8), color: '#668866' });
                if (isVar) {
                    txt(PX + 26, py + 3, val, { fontSize: fs(8), color: '#6688cc' });
                } else {
                    btn(PX + 26, py, 20, 20, '−', 0x111811, () => { this._nudge(field, -step); });
                    txt(PX + 48, py + 3, String(val ?? 0), { fontSize: fs(9), color: '#ddddaa' });
                    btn(PX + 70, py, 20, 20, '+', 0x111811, () => { this._nudge(field, step); });
                }
                py += 24;
            };

            switch (s.type) {
                case 'circle':
                    propRow('X:', 'x'); propRow('Y:', 'y'); propRow('R:', 'r');
                    break;
                case 'rect':
                    propRow('X:', 'x'); propRow('Y:', 'y'); propRow('W:', 'w'); propRow('H:', 'h');
                    break;
                case 'triangle':
                case 'line':
                    propRow('X1:', 'x1'); propRow('Y1:', 'y1');
                    propRow('X2:', 'x2'); propRow('Y2:', 'y2');
                    if (s.type === 'triangle') { propRow('X3:', 'x3'); propRow('Y3:', 'y3'); }
                    break;
            }

            // Stroke toggle
            const hasSt = !!s.stroke;
            btn(PX, py, 60, 20, hasSt ? '⊘ stroke' : '+ stroke', 0x111811, () => {
                if (hasSt) { delete s.stroke; } else { s.stroke = { color: this.newFill, width: 1, alpha: 1 }; }
                this._redraw();
            }, hasSt);
            if (hasSt) {
                txt(PX + 64, py + 3, `w:`, { fontSize: fs(8), color: '#668866' });
                btn(PX + 78, py, 20, 20, '−', 0x111811, () => { s.stroke.width = Math.max(0.5, Math.round((s.stroke.width - 0.5)*2)/2); this._redraw(); });
                txt(PX + 100, py + 3, String(s.stroke.width ?? 1), { fontSize: fs(9), color: '#ddddaa' });
                btn(PX + 116, py, 20, 20, '+', 0x111811, () => { s.stroke.width = Math.round((s.stroke.width + 0.5)*2)/2; this._redraw(); });
            }
            py += 24;

            btn(PX, py, PW, 22, '🗑 Delete shape', 0x331111, () => { this._deleteSelected(); this._redraw(); });
            py += 28;
        } else {
            txt(PX, py + 3, 'Tap canvas to place shape', { fontSize: fs(9), color: '#446644' });
            py += 20;
        }

        // ── Preview skin color ───────────────────────────────────────────────────
        this.uiGfx.lineStyle(1, 0x223322, 0.6).lineBetween(PX, py, PX+PW, py); py += 6;
        txt(PX, py + 3, 'Skin ($bodyCol):', { fontSize: fs(9), color: '#668866' });
        py += 16;
        // Show a subset of skin-relevant swatches
        const skinTones = [0xccccaa, 0xc8a878, 0xb8945e, 0xa87848, 0xd4b888, 0x9a6840, 0xc09060];
        skinTones.forEach((col, i) => {
            const sw = Math.floor(PW / skinTones.length) - 1;
            const sx = PX + i * (sw + 1);
            this.uiGfx.fillStyle(col).fillRect(sx, py, sw, 18);
            if (this.pv.bodyCol === col) this.uiGfx.lineStyle(2, 0xffffff).strokeRect(sx-1, py-1, sw+2, 20);
            const zone = this.add.zone(sx, py, sw, 18).setOrigin(0).setInteractive().setDepth(11);
            zone.on('pointerdown', () => { this.pv.bodyCol = col; this._redraw(); });
            add(zone);
        });
        py += 26;

        // ── Export ──────────────────────────────────────────────────────────────
        this.uiGfx.lineStyle(1, 0x223322, 0.6).lineBetween(PX, py, PX+PW, py); py += 8;
        btn(PX, py, PW, 26, '📋 Export shapes JS', 0x112011, () => this._showExport());
        py += 32;

        // ── Shape list ──────────────────────────────────────────────────────────
        this._buildShapeList(PX, py, PW, this.H - py - 4, { txt, btn, add, fs });
    }

    _buildShapeList(px, py, pw, availH, { txt, btn, add, fs }) {
        const ROW_H    = 24;
        const maxVis   = Math.max(1, Math.floor((availH - 30) / ROW_H)); // reserve 30px for header
        const total    = this.shapes.length;
        const scroll   = Math.max(0, Math.min(this._listScroll, Math.max(0, total - maxVis)));
        this._listScroll = scroll;

        // Header row: label + scroll controls + add button
        this.uiGfx.lineStyle(1, 0x223322, 0.6).lineBetween(px, py, px+pw, py); py += 6;

        const needScroll = total > maxVis;
        const headerLabelW = pw - (needScroll ? 68 : 46);
        txt(px, py + 3, `Shapes (${total})`, { fontSize: fs(9), color: '#668866' });
        btn(px + pw - 44, py, 42, 20, '+ Add', 0x112211, () => {
            this._placeShape(0, 0); this._listScroll = Math.max(0, this.shapes.length - maxVis); this._redraw();
        });
        if (needScroll) {
            btn(px + pw - 90, py, 22, 20, '▲', 0x111811, () => { this._listScroll = Math.max(0, scroll - 1); this._redraw(); }, scroll === 0);
            btn(px + pw - 66, py, 22, 20, '▼', 0x111811, () => { this._listScroll = Math.min(total - maxVis, scroll + 1); this._redraw(); }, scroll >= total - maxVis);
        }
        py += 26;

        // Scroll zone for swipe on mobile
        if (total > 0) {
            const scrollZone = this.add.zone(px, py, pw, maxVis * ROW_H).setOrigin(0).setInteractive();
            let swipeStartY = 0;
            scrollZone.on('pointerdown', p => { swipeStartY = p.y; });
            scrollZone.on('pointerup',   p => {
                const dy = swipeStartY - p.y;
                if (Math.abs(dy) > 12) {
                    this._listScroll = Math.max(0, Math.min(total - maxVis, scroll + (dy > 0 ? 1 : -1)));
                    this._redraw();
                }
            });
            add(scrollZone);
        }

        // Background for the list area
        this.uiGfx.fillStyle(0x0a0e0a, 0.6).fillRect(px, py, pw, maxVis * ROW_H);

        // Rows
        const visEnd = Math.min(scroll + maxVis, total);
        for (let i = scroll; i < visEnd; i++) {
            const s    = this.shapes[i];
            const ry   = py + (i - scroll) * ROW_H;
            const isSel = i === this.selIdx;

            // Row background
            this.uiGfx.fillStyle(isSel ? 0x1a3020 : (i % 2 === 0 ? 0x0e130e : 0x0b100b))
                .fillRect(px, ry, pw, ROW_H - 1);
            if (isSel) this.uiGfx.lineStyle(1, 0x44aa44).strokeRect(px, ry, pw, ROW_H - 1);

            // Color swatch
            const fillCol = typeof s.fill === 'number' ? s.fill : (s.stroke?.color ?? 0x444444);
            this.uiGfx.fillStyle(fillCol).fillRect(px + 2, ry + 5, 12, 12);
            this.uiGfx.lineStyle(0.5, 0x334433).strokeRect(px + 2, ry + 5, 12, 12);

            // Label: #N type / when
            const typeIcon = { circle:'○', triangle:'△', rect:'□', line:'—' }[s.type] ?? s.type[0];
            const whenShort = (s.whenKey ?? 'always').slice(0, 8);
            const label = `#${i} ${typeIcon} ${whenShort}`;
            txt(px + 18, ry + 5, label, { fontSize: fs(9), color: isSel ? '#88ffaa' : '#99aa99' });

            // Delete button
            btn(px + pw - 22, ry + 2, 20, 20, '×', 0x221111, () => {
                this.shapes.splice(i, 1);
                if (this.selIdx >= this.shapes.length) this.selIdx = this.shapes.length - 1;
                this._redraw();
            });

            // Tap row to select
            const rowZone = this.add.zone(px, ry, pw - 24, ROW_H).setOrigin(0).setInteractive().setDepth(11);
            rowZone.on('pointerdown', () => { this.selIdx = i; this._redraw(); });
            add(rowZone);
        }

        // Empty state hint
        if (total === 0) {
            txt(px + 4, py + 8, 'No shapes — tap canvas to add', { fontSize: fs(8), color: '#446644' });
        }
    }

    _scrollListTo(idx) {
        // Ensure idx is visible in the list; we don't know maxVis here so use a rough estimate
        const ROW_H  = 24;
        const approxVis = Math.max(1, Math.floor((this.H * 0.25) / ROW_H));
        if (idx < this._listScroll) this._listScroll = idx;
        else if (idx >= this._listScroll + approxVis) this._listScroll = idx - approxVis + 1;
    }

    // ── Export ──────────────────────────────────────────────────────────────────

    _showExport() {
        const js = this._generateJS();

        // Remove existing export overlay
        if (this._exportOverlay) {
            for (const o of this._exportOverlay) o.destroy?.();
        }

        const W = this.W, H = this.H;
        const overlayBg = this.add.graphics().setDepth(20);
        overlayBg.fillStyle(0x0a120a, 0.95).fillRect(0, 0, W, H);

        const title = this.add.text(W/2, 12, '📋 Exported Shape Data — copy and paste into worker.js', {
            fontFamily: 'monospace', fontSize: '10px', color: '#88cc88',
        }).setOrigin(0.5, 0).setDepth(21);

        // Use a DOM textarea for easy copy
        const ta = document.createElement('textarea');
        ta.value = js;
        ta.style.cssText = `position:absolute;left:10px;top:34px;width:${W-20}px;height:${H-80}px;background:#0c180c;color:#aaddaa;font-family:monospace;font-size:11px;border:1px solid #334433;padding:8px;box-sizing:border-box;resize:none;`;
        document.getElementById('game').appendChild(ta);
        ta.focus(); ta.select();

        const closeBtn = this.add.text(W/2, H - 30, '[ Close ]', {
            fontFamily: 'monospace', fontSize: '13px', color: '#cc8844', backgroundColor: '#1a1008', padding: { x: 12, y: 6 },
        }).setOrigin(0.5).setDepth(21).setInteractive();
        closeBtn.on('pointerdown', () => {
            ta.remove();
            for (const o of this._exportOverlay) o.destroy?.();
            this._exportOverlay = null;
        });

        this._exportOverlay = [overlayBg, title, closeBtn, { destroy: () => ta.remove() }];
    }

    _generateJS() {
        const lines = ['['];
        for (const s of this.shapes) {
            const parts = [`    { type: '${s.type}'`];
            // Geometry
            const geoFields = {
                circle: ['x','y','r'],
                triangle: ['x1','y1','x2','y2','x3','y3'],
                rect: ['x','y','w','h'],
                line: ['x1','y1','x2','y2'],
            }[s.type] ?? [];
            for (const f of geoFields) {
                if (s[f] !== undefined) {
                    const v = s[f];
                    parts.push(`${f}: ${typeof v === 'string' ? `'${v}'` : v}`);
                }
            }
            // Fill
            if (s.fill !== undefined) {
                const f = s.fill;
                parts.push(`fill: ${typeof f === 'string' ? `'${f}'` : `0x${f.toString(16).padStart(6,'0')}`}`);
            }
            // Alpha
            if (s.alpha !== undefined && s.alpha !== 1) parts.push(`alpha: ${s.alpha}`);
            // Stroke
            if (s.stroke) {
                const st = s.stroke;
                const sc = `0x${(st.color??0xffffff).toString(16).padStart(6,'0')}`;
                parts.push(`stroke: { color: ${sc}, width: ${st.width??1}${st.alpha && st.alpha !== 1 ? `, alpha: ${st.alpha}` : ''} }`);
            }
            // When
            const wk = s.whenKey ?? 'always';
            const wjs = WHEN_PRESETS[wk]?.js;
            if (wjs) parts.push(`when: ${wjs}, whenKey: '${wk}'`);
            else if (s.whenKey && s.whenKey !== 'always') parts.push(`whenKey: '${wk}'`);

            lines.push(parts.join(', ') + ' },');
        }
        lines.push(']');
        return lines.join('\n');
    }
}
