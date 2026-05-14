/**
 * UIPanel — drag-scrollable button grid for the actions zone.
 * A persistent input zone handles both taps (fire callback) and drag (scroll).
 * Content objects are recreated on each scroll update; the zone persists.
 */
export default class UIPanel {
    constructor(scene, x, y, w, h) {
        this.scene = scene;
        this.x = x; this.y = y; this.w = w; this.h = h;
        this._scrollY  = 0;
        this._items    = [];
        this._content  = [];
        this._hovIdx   = -1;
        this._ds       = { on: false, startY: 0, startScroll: 0, moved: false };
        this._zone     = this._initZone();
    }

    _initZone() {
        const { x, y, w, h } = this;
        const z = this.scene.add.zone(x + w / 2, y + h / 2, w, h)
            .setInteractive({ cursor: 'pointer' }).setDepth(24);
        this.scene.cameras.main.ignore(z);
        const ds = this._ds;

        z.on('pointerdown', (ptr) => {
            ds.on = true;
            ds.startY = ptr.y;
            ds.startScroll = this._scrollY;
            ds.moved = false;
            ds.right = ptr.button === 2;
        });
        z.on('pointermove', (ptr) => {
            if (ds.on) {
                if (Math.abs(ptr.y - ds.startY) > 6) ds.moved = true;
                if (ds.moved) {
                    this._scrollY = Math.max(0, Math.min(this._maxScroll(),
                        ds.startScroll - (ptr.y - ds.startY)));
                    this._hovIdx = -1;
                    this._renderContent();
                    return;
                }
            }
            const item = this._hitItem(ptr.x, ptr.y);
            const idx  = item ? this._items.indexOf(item) : -1;
            if (idx !== this._hovIdx) { this._hovIdx = idx; this._renderContent(); }
        });
        z.on('pointerout', () => {
            if (this._hovIdx !== -1) { this._hovIdx = -1; this._renderContent(); }
        });
        z.on('pointerup', (ptr) => {
            if (ds.on && !ds.moved) {
                const item = this._hitItem(ptr.x, ptr.y);
                if (item && !item.dimmed) {
                    if (ds.right && item.rightCallback) item.rightCallback();
                    else if (!ds.right) item.callback();
                }
            }
            ds.on = false; ds.right = false;
        });
        z.on('pointerupoutside', () => { ds.on = false; this._hovIdx = -1; this._renderContent(); });
        return z;
    }

    setItems(items) {
        this._items = items;
        this._scrollY = Math.min(this._scrollY, Math.max(0, this._maxScroll()));
        this._renderContent();
    }

    _sz()   { return Math.max(36, Math.floor((this.h - 3 * 4) / 3)); }
    _cols() { const sz = this._sz(); return Math.max(3, Math.floor((this.w - 3) / (sz + 3))); }

    _maxScroll() {
        const sz = this._sz(), gap = 3, cols = this._cols();
        const rows = Math.ceil(this._items.length / cols);
        return Math.max(0, rows * (sz + gap) + gap - this.h);
    }

    _hitItem(px, py) {
        const gap = 3, sz = this._sz(), cols = this._cols();
        const lx = px - (this.x + gap);
        const ly = py - (this.y + gap) + this._scrollY;
        if (lx < 0 || ly < 0) return null;
        const col = Math.floor(lx / (sz + gap));
        const row = Math.floor(ly / (sz + gap));
        if (col < 0 || col >= cols) return null;
        if (lx - col * (sz + gap) >= sz) return null;
        if (ly - row * (sz + gap) >= sz) return null;
        return this._items[row * cols + col] ?? null;
    }

    _renderContent() {
        this._content.forEach(o => o.destroy());
        this._content = [];
        const { x, y, w, h } = this;
        const gap = 3, sz = this._sz(), cols = this._cols();
        const fz  = Math.max(10, Math.floor(sz * 0.20)) + 'px';
        const sfz = Math.max(8,  Math.floor(sz * 0.16)) + 'px';
        const add = obj => { this.scene.cameras.main.ignore(obj); this._content.push(obj); return obj; };

        this._items.forEach((item, idx) => {
            const col = idx % cols;
            const row = Math.floor(idx / cols);
            const bx  = x + gap + col * (sz + gap);
            const by  = y + gap + row * (sz + gap) - this._scrollY;

            if (by + sz <= y || by >= y + h) return; // culled outside panel

            const visY  = Math.max(by, y);
            const visH  = Math.min(by + sz, y + h) - visY;
            const isHov = idx === this._hovIdx && !item.dimmed;
            const bg = add(this.scene.add.graphics().setDepth(22));
            bg.fillStyle(item.color ?? 0x2a3040, item.dimmed ? 0.35 : 0.88)
              .fillRect(bx, visY, sz, visH);
            if (item.active) {
                bg.lineStyle(2, 0xffdd44, 0.9).strokeRect(bx + 1, by + 1, sz - 2, sz - 2);
            } else {
                bg.lineStyle(1, 0xc8a030, 0.22).strokeRect(bx, by, sz, sz);
            }
            if (isHov) {
                const hg = add(this.scene.add.graphics().setDepth(23));
                hg.fillStyle(0xffffff, 0.13).fillRect(bx, visY, sz, visH);
            }

            // Only render text if enough of the button is visible
            if (visH < sz * 0.35) return;
            const lblY = item.sublabel ? by + sz * 0.28 : by + sz * 0.5;
            add(this.scene.add.text(bx + sz / 2, lblY, item.label, {
                fontFamily: 'monospace', fontSize: fz,
                color: item.dimmed ? '#554433' : '#d4c8a8',
                align: 'center', wordWrap: { width: sz - 4 },
            }).setOrigin(0.5).setDepth(22));

            if (item.sublabel && visH > sz * 0.6) {
                add(this.scene.add.text(bx + sz / 2, by + sz * 0.72, item.sublabel, {
                    fontFamily: 'monospace', fontSize: sfz,
                    color: item.dimmed ? '#443322' : '#aa9966',
                    align: 'center', wordWrap: { width: sz - 6 },
                }).setOrigin(0.5).setDepth(22));
            }

            // Material badge: small dot + label in top-right corner
            if (item.matLabel && item.matColor != null && visH >= sz * 0.5) {
                const dot = add(this.scene.add.graphics().setDepth(23));
                dot.fillStyle(item.matColor, 0.9).fillCircle(bx + sz - 7, by + 7, 4);
                add(this.scene.add.text(bx + sz - 12, by + 2, item.matLabel, {
                    fontFamily: 'monospace', fontSize: '7px', color: '#ccbbaa',
                }).setOrigin(1, 0).setDepth(23));
            }
            // Right-click hint chevron when picker available
            if (item.rightCallback && visH >= sz * 0.5) {
                add(this.scene.add.text(bx + sz - 3, by + sz - 3, '▾', {
                    fontFamily: 'monospace', fontSize: '8px', color: '#887755',
                }).setOrigin(1, 1).setDepth(23));
            }
        });

        // Scrollbar thumb
        const ms = this._maxScroll();
        if (ms > 0) {
            const tH     = h - 8;
            const thumbH = Math.max(16, Math.round(h * h / (h + ms)));
            const thumbY = y + 4 + Math.round((tH - thumbH) * this._scrollY / ms);
            const sg = add(this.scene.add.graphics().setDepth(23));
            sg.fillStyle(0x3a2e18, 0.5).fillRect(x + w - 5, y + 4, 3, tH);
            sg.fillStyle(0xc8a030, 0.7).fillRect(x + w - 5, thumbY, 3, thumbH);
        }
    }

    destroy() {
        this._content.forEach(o => o.destroy());
        this._content = [];
        this._zone.destroy();
    }
}
