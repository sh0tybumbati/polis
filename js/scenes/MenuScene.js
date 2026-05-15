import { SCENE_KEYS } from '../config/sceneKeys.js';

export default class MenuScene extends Phaser.Scene {
    constructor() {
        super({ key: SCENE_KEYS.MENU });
    }

    preload() {
        this.load.image('menu_bg', 'assets/images/background_splash.png');
    }

    create() {
        const W = this.scale.width, H = this.scale.height;
        const hasSave = !!localStorage.getItem('epochs_save');

        this._drawBackground(W, H);
        this._drawTitle(W, H);
        this._drawButtons(W, H, hasSave);
        this._drawFooter(W, H);

        this.input.keyboard?.on('keydown-N', () => this._startNew());
        this.input.keyboard?.on('keydown-SPACE', () => hasSave ? this._continue() : this._startNew());
        if (hasSave) {
            this.input.keyboard?.on('keydown-C', () => this._continue());
            this.input.keyboard?.on('keydown-ENTER', () => this._continue());
        }
    }

    _startNew() {
        localStorage.removeItem('epochs_save');
        this.scene.start(SCENE_KEYS.GAME);
    }

    _continue() {
        this.scene.start(SCENE_KEYS.GAME);
    }

    _drawBackground(W, H) {
        // Full-screen background image, cover-scaled
        const tex = this.textures.get('menu_bg');
        const tw = tex.getSourceImage().width;
        const th = tex.getSourceImage().height;
        const scale = Math.max(W / tw, H / th);
        const bg = this.add.image(W / 2, H / 2, 'menu_bg')
            .setScale(scale);

        // Blur FX (Phaser 3.60+ WebGL feature — no-ops silently in Canvas renderer)
        if (bg.preFX) {
            bg.preFX.addBlur(0, 2, 2, 0.5);
        }

        // Dark vignette overlay to make text readable
        this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.42);

        // Warm sunrise glow concentrated at the horizon (lower-centre)
        const g = this.add.graphics();
        for (let i = 5; i >= 0; i--) {
            const r = Math.max(W, H) * (0.18 + i * 0.16);
            g.fillStyle(0x7a4010, (5 - i) * 0.022).fillCircle(W / 2, H * 0.55, r);
        }
    }

    _drawTitle(W, H) {
        const cy = H * 0.28;

        // Soft glow halo
        const glow = this.add.graphics();
        for (let i = 5; i >= 0; i--) {
            glow.fillStyle(0xc87020, 0.018 - i * 0.001)
                .fillEllipse(W / 2, cy, 620 + i * 60, 140 + i * 30);
        }

        const fontSize = Math.min(80, Math.floor(W * 0.14));
        const subSize  = Math.max(16, Math.floor(fontSize * 0.28));

        // Drop shadow layer
        this.add.text(W / 2 + 3, cy + 5, 'EPOCHS:', {
            fontFamily: 'Georgia, "Times New Roman", serif',
            fontSize: fontSize + 'px',
            color: '#000000',
        }).setOrigin(0.5).setAlpha(0.45);

        // Main gold title — two lines to match the image typography
        this.add.text(W / 2, cy - fontSize * 0.3, 'EPOCHS:', {
            fontFamily: 'Georgia, "Times New Roman", serif',
            fontSize: fontSize + 'px',
            color: '#d4aa40',
            stroke: '#1a0e00',
            strokeThickness: 3,
            shadow: { offsetX: 0, offsetY: 2, color: '#7a4400', blur: 14, fill: true },
        }).setOrigin(0.5);

        this.add.text(W / 2, cy + fontSize * 0.42, 'THE DAWN', {
            fontFamily: 'Georgia, "Times New Roman", serif',
            fontSize: fontSize + 'px',
            color: '#d4aa40',
            stroke: '#1a0e00',
            strokeThickness: 3,
            shadow: { offsetX: 0, offsetY: 2, color: '#7a4400', blur: 14, fill: true },
        }).setOrigin(0.5);

        // Thin horizontal rule under title
        const g = this.add.graphics();
        const ry = cy + fontSize * 1.1;
        const rw = Math.min(340, W * 0.52);
        g.lineStyle(1, 0xc8a030, 0.45).lineBetween(W / 2 - rw / 2, ry, W / 2 + rw / 2, ry);
        g.fillStyle(0xd4aa40, 0.6).fillCircle(W / 2, ry, 2.5);
        g.fillStyle(0xc8a030, 0.35).fillCircle(W / 2 - rw / 2, ry, 1.5);
        g.fillStyle(0xc8a030, 0.35).fillCircle(W / 2 + rw / 2, ry, 1.5);
    }

    _drawButtons(W, H, hasSave) {
        const cx  = W / 2;
        const gap = Math.min(52, H * 0.08);
        const topY = H * 0.56;

        const buttons = [
            hasSave
                ? { label: 'LOAD GAME',   cb: () => this._continue(),  active: true  }
                : { label: 'LOAD GAME',   cb: null,                     active: false },
            { label: 'START GAME',        cb: () => this._startNew(),   active: true  },
            { label: 'SETTINGS',          cb: null,                     active: false },
            { label: 'CREDITS',           cb: null,                     active: false },
        ];

        buttons.forEach((btn, i) => {
            this._makeTextButton(cx, topY + i * gap, btn);
        });
    }

    _makeTextButton(cx, cy, { label, cb, active }) {
        const color   = active ? '#e8d898' : '#5a4a30';
        const hovered = '#ffffff';

        const txt = this.add.text(cx, cy, label, {
            fontFamily: 'Georgia, "Times New Roman", serif',
            fontSize:   '22px',
            color,
            letterSpacing: 4,
        }).setOrigin(0.5);

        if (!active || !cb) return;

        // Hover underline graphic
        const ug = this.add.graphics().setAlpha(0);
        const uw = txt.width + 12;
        ug.lineStyle(1, 0xd4aa40, 0.8).lineBetween(cx - uw / 2, cy + 16, cx + uw / 2, cy + 16);

        const zone = this.add.zone(cx, cy, Math.max(txt.width + 40, 200), 40).setInteractive({ cursor: 'pointer' });
        zone.on('pointerover',  () => { txt.setColor(hovered); ug.setAlpha(1); });
        zone.on('pointerout',   () => { txt.setColor(color);   ug.setAlpha(0); });
        zone.on('pointerdown',  cb);
    }

    _drawFooter(W, H) {
        this.add.text(W / 2, H - 24, 'PRESS ANY BUTTON TO CONTINUE', {
            fontFamily: 'Georgia, "Times New Roman", serif',
            fontSize:   '11px',
            color:      '#8a7050',
            letterSpacing: 3,
        }).setOrigin(0.5);
    }
}
