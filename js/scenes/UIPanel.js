/**
 * UIPanel — a self-contained paginated button grid.
 *
 * Usage:
 *   const panel = new UIPanel(scene, x, y, w, h, { cols: 3 });
 *   panel.setItems([{ label, sublabel, color, active, dimmed, callback }]);
 *   panel.destroy();
 */
export default class UIPanel {
    constructor(scene, x, y, w, h, opts = {}) {
        this.scene   = scene;
        this.x = x; this.y = y; this.w = w; this.h = h;
        this.cols    = opts.cols ?? 3;
        this.navH    = 20;
        this._page   = 0;
        this._items  = [];
        this._objs   = [];  // all Phaser objects owned by this panel
    }

    setItems(items) {
        this._items = items;
        this._page  = Math.min(this._page, Math.max(0, Math.ceil(items.length / this._pageSize()) - 1));
        this._render();
    }

    _pageSize() {
        const { h, navH, cols } = this;
        const btnH = this._btnH();
        const rows = Math.max(1, Math.floor((h - navH) / (btnH + 3)));
        return cols * rows;
    }

    _btnH() { return Math.max(32, Math.floor((this.h - this.navH) / 3) - 3); }

    _render() {
        this._destroy();
        const { x, y, w, h, cols, navH } = this;
        const gap  = 3;
        const btnH = this._btnH();
        const btnW = Math.floor((w - gap * (cols + 1)) / cols);
        const rows = Math.max(1, Math.floor((h - navH) / (btnH + gap)));
        const pageSize = cols * rows;
        const page = this._page;
        const visible = this._items.slice(page * pageSize, (page + 1) * pageSize);

        visible.forEach((item, idx) => {
            const col = idx % cols;
            const row = Math.floor(idx / cols);
            const bx = x + gap + col * (btnW + gap);
            const by = y + gap + row * (btnH + gap);

            const bg = this._ui(this.scene.add.graphics().setDepth(22));
            bg.fillStyle(item.color ?? 0x2a3040, item.dimmed ? 0.35 : 0.88)
              .fillRect(bx, by, btnW, btnH);
            if (item.active) {
                bg.lineStyle(2, 0xffdd44, 0.9).strokeRect(bx + 1, by + 1, btnW - 2, btnH - 2);
            } else {
                bg.lineStyle(1, 0xc8a030, 0.22).strokeRect(bx, by, btnW, btnH);
            }

            const fz   = btnW < 56 ? '8px' : '9px';
            const lblY = item.sublabel ? by + btnH * 0.36 : by + btnH * 0.5;
            const lbl  = this._ui(this.scene.add.text(bx + btnW / 2, lblY, item.label, {
                fontFamily: 'monospace', fontSize: fz,
                color: item.dimmed ? '#554433' : '#d4c8a8',
                align: 'center', wordWrap: { width: btnW - 4 },
            }).setOrigin(0.5).setDepth(22));

            if (item.sublabel) {
                const sub = this._ui(this.scene.add.text(bx + btnW / 2, by + btnH * 0.68, item.sublabel, {
                    fontFamily: 'monospace', fontSize: '7px',
                    color: item.dimmed ? '#443322' : '#887755', align: 'center',
                }).setOrigin(0.5).setDepth(22));
            }

            const zone = this._ui(this.scene.add.zone(bx + btnW / 2, by + btnH / 2, btnW, btnH)
                .setInteractive().setDepth(23));
            zone.on('pointerdown', item.callback);
        });

        // Navigation row
        const totalPages = Math.ceil(this._items.length / pageSize);
        if (totalPages > 1) {
            const ny = y + h - navH + 4;
            const dotSpacing = 14;
            const dotsW = totalPages * dotSpacing;
            const dotX0 = x + w / 2 - dotsW / 2 + 7;

            for (let p = 0; p < totalPages; p++) {
                const dx = dotX0 + p * dotSpacing;
                const dot = this._ui(this.scene.add.graphics().setDepth(22));
                dot.fillStyle(p === page ? 0xc8a030 : 0x4a4030)
                   .fillCircle(dx, ny + 7, p === page ? 4 : 3);
                const dz = this._ui(this.scene.add.zone(dx, ny + 7, 18, 18).setInteractive().setDepth(23));
                dz.on('pointerdown', () => { this._page = p; this._render(); });
            }

            if (page > 0) {
                const prev = this._ui(this.scene.add.text(x + 4, ny + 7, '◀', {
                    fontFamily: 'monospace', fontSize: '12px', color: '#c8a030',
                }).setOrigin(0, 0.5).setInteractive().setDepth(22));
                prev.on('pointerdown', () => { this._page--; this._render(); });
            }
            if (page < totalPages - 1) {
                const nxt = this._ui(this.scene.add.text(x + w - 4, ny + 7, '▶', {
                    fontFamily: 'monospace', fontSize: '12px', color: '#c8a030',
                }).setOrigin(1, 0.5).setInteractive().setDepth(22));
                nxt.on('pointerdown', () => { this._page++; this._render(); });
            }
        }
    }

    _ui(obj) {
        this.scene.cameras.main.ignore(obj);
        this._objs.push(obj);
        return obj;
    }

    _destroy() {
        this._objs.forEach(o => o.destroy());
        this._objs = [];
    }

    destroy() { this._destroy(); }
}
