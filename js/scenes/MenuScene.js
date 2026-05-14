import { SCENE_KEYS } from '../config/sceneKeys.js';

const C = {
    bg:       0x080604,
    panel:    0x130e06,
    gold:     0xc8a030,
    goldDim:  0x6a5010,
    text:     0xd4c8a8,
    textDim:  0x4a4030,
    btnHov:   0x1e1810,
    red:      0x662222,
    green:    0x1a3318,
    blue:     0x1a2840,
    disabled: 0x1a1610,
};

export default class MenuScene extends Phaser.Scene {
    constructor() {
        super({ key: SCENE_KEYS.MENU });
    }

    create() {
        const W = this.scale.width, H = this.scale.height;
        const hasSave = !!localStorage.getItem('polis_save');

        this._drawBackground(W, H);
        this._drawTitle(W, H);
        this._drawButtons(W, H, hasSave);
        this._drawFooter(W, H);

        // Keyboard shortcut: N = new game, C/Enter = continue (if save)
        this.input.keyboard?.on('keydown-N', () => this._startNew());
        if (hasSave) {
            this.input.keyboard?.on('keydown-C', () => this._continue());
            this.input.keyboard?.on('keydown-ENTER', () => this._continue());
        }
        this.input.keyboard?.on('keydown-ESC', () => this._startNew());
    }

    _startNew() {
        localStorage.removeItem('polis_save');
        this.scene.start(SCENE_KEYS.GAME);
    }

    _continue() {
        this.scene.start(SCENE_KEYS.GAME);
    }

    // ─── Background ───────────────────────────────────────────────────────────

    _drawBackground(W, H) {
        // Base fill
        this.add.rectangle(W / 2, H / 2, W, H, C.bg, 1);

        // Subtle radial vignette: dark corners, slightly lighter centre
        const g = this.add.graphics();
        for (let i = 6; i >= 0; i--) {
            const r = Math.max(W, H) * (0.35 + i * 0.12);
            g.fillStyle(0x1a1208, (6 - i) * 0.04).fillCircle(W / 2, H * 0.42, r);
        }

        // Scattered dim stars
        g.fillStyle(0xf0d890, 0.18);
        const rng = (n) => Math.floor(Math.random() * n);
        Phaser.Math.RND.sow(['polis-menu']);
        for (let i = 0; i < 60; i++) {
            const sx = Phaser.Math.RND.integerInRange(0, W);
            const sy = Phaser.Math.RND.integerInRange(0, Math.floor(H * 0.7));
            const sz = Phaser.Math.RND.realInRange(0.5, 1.8);
            g.fillRect(sx, sy, sz, sz);
        }

        // Greek-key top and bottom borders
        this._drawKeyBorder(g, 0, 0, W, 8);
        this._drawKeyBorder(g, 0, H - 8, W, 8);
    }

    _drawKeyBorder(g, x, y, w, h) {
        g.fillStyle(C.gold, 0.85).fillRect(x, y, w, h);
        g.fillStyle(C.bg, 0.88);
        const u = h;
        for (let i = 0; i * u * 4 < w; i++) {
            const ox = x + i * u * 4;
            g.fillRect(ox + u,     y,                       u, Math.ceil(h * 0.55));
            g.fillRect(ox + u * 2, y + Math.floor(h * 0.45), u, Math.ceil(h * 0.55));
        }
        g.fillStyle(0xf0cc60, 0.5).fillRect(x, y, w, 1);
    }

    // ─── Title ────────────────────────────────────────────────────────────────

    _drawTitle(W, H) {
        const cy = H * 0.30;

        // Glowing halo behind title
        const glow = this.add.graphics();
        for (let i = 4; i >= 0; i--) {
            glow.fillStyle(0xc8a030, 0.04 - i * 0.005).fillEllipse(W / 2, cy - 10, 340 + i * 40, 80 + i * 20);
        }

        // Main title
        this.add.text(W / 2, cy, 'POLIS', {
            fontFamily: 'Georgia, "Times New Roman", serif',
            fontSize:   Math.min(72, Math.floor(W * 0.16)) + 'px',
            color:      '#c8a030',
            stroke:     '#000000',
            strokeThickness: 6,
            shadow:     { offsetX: 0, offsetY: 3, color: '#000000', blur: 8, fill: true },
        }).setOrigin(0.5);

        // Subtitle
        this.add.text(W / 2, cy + Math.min(72, Math.floor(W * 0.16)) * 0.65, 'Build · Grow · Endure', {
            fontFamily: 'monospace',
            fontSize:   Math.min(14, Math.floor(W * 0.032)) + 'px',
            color:      '#7a6530',
            letterSpacing: 4,
        }).setOrigin(0.5);

        // Decorative horizontal rule
        const g = this.add.graphics();
        const ry = cy + Math.min(72, Math.floor(W * 0.16)) * 0.9;
        const rw = Math.min(280, W * 0.55);
        g.lineStyle(1, C.gold, 0.35).lineBetween(W / 2 - rw / 2, ry, W / 2 + rw / 2, ry);
        g.fillStyle(C.gold, 0.6).fillCircle(W / 2, ry, 2);
        g.fillStyle(C.gold, 0.35).fillCircle(W / 2 - rw / 2, ry, 1.5);
        g.fillStyle(C.gold, 0.35).fillCircle(W / 2 + rw / 2, ry, 1.5);
    }

    // ─── Buttons ──────────────────────────────────────────────────────────────

    _drawButtons(W, H, hasSave) {
        const BW = Math.min(240, W * 0.55);
        const BH = 44;
        const gap = 14;
        const cx  = W / 2;
        const topY = H * 0.54;

        const buttons = [
            hasSave
                ? { label: 'Continue',   sub: 'Resume saved city',    col: C.green,    cb: () => this._continue(),  key: '[C]' }
                : { label: 'Continue',   sub: 'No save found',        col: C.disabled, cb: null,                    key: null  },
            { label: 'New Game',     sub: 'Start from scratch',   col: C.red,      cb: () => this._startNew(), key: '[N]' },
            { label: 'Multiplayer',  sub: 'Coming soon',          col: C.disabled, cb: null,                   key: null  },
        ];

        buttons.forEach((btn, i) => {
            const by = topY + i * (BH + gap);
            this._makeButton(cx - BW / 2, by, BW, BH, btn);
        });
    }

    _makeButton(x, y, w, h, { label, sub, col, cb, key }) {
        const disabled = !cb;
        const g = this.add.graphics();
        g.fillStyle(col, disabled ? 0.5 : 0.88).fillRect(x, y, w, h);
        g.lineStyle(1, disabled ? C.goldDim : C.gold, disabled ? 0.2 : 0.55).strokeRect(x, y, w, h);

        // Inner highlight line
        if (!disabled) g.lineStyle(1, 0xffffff, 0.05).lineBetween(x + 1, y + 1, x + w - 1, y + 1);

        const hov = this.add.graphics().setAlpha(0);
        hov.fillStyle(0xffffff, 0.10).fillRect(x, y, w, h);

        // Label
        this.add.text(x + w / 2, y + h / 2 - 5, label, {
            fontFamily: 'monospace',
            fontSize:   '15px',
            color:      disabled ? '#3a3020' : '#d4c8a8',
        }).setOrigin(0.5);

        // Sublabel
        this.add.text(x + w / 2, y + h / 2 + 10, sub, {
            fontFamily: 'monospace',
            fontSize:   '9px',
            color:      disabled ? '#2a2218' : '#7a6a50',
        }).setOrigin(0.5);

        // Keyboard hint (right-aligned)
        if (key) {
            this.add.text(x + w - 6, y + h / 2, key, {
                fontFamily: 'monospace', fontSize: '8px', color: '#5a4a28',
            }).setOrigin(1, 0.5);
        }

        if (!disabled) {
            const zone = this.add.zone(x + w / 2, y + h / 2, w, h)
                .setInteractive({ cursor: 'pointer' });
            zone.on('pointerover',  () => hov.setAlpha(1));
            zone.on('pointerout',   () => hov.setAlpha(0));
            zone.on('pointerdown',  cb);
        }
    }

    // ─── Footer ───────────────────────────────────────────────────────────────

    _drawFooter(W, H) {
        this.add.text(W / 2, H - 16, 'v0.1 alpha  ·  polis game', {
            fontFamily: 'monospace', fontSize: '9px', color: '#3a3020',
        }).setOrigin(0.5);
    }
}
