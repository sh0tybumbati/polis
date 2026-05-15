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
        const tex = this.textures.get('menu_bg');
        const tw = tex.getSourceImage().width;
        const th = tex.getSourceImage().height;
        // 1:1 source — cover-scale fills any aspect ratio cleanly
        const scale = Math.max(W / tw, H / th);
        this.add.image(W / 2, H / 2, 'menu_bg').setScale(scale);

        // Light vignette so buttons remain readable
        this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.28);
    }

    _drawButtons(W, H, hasSave) {
        const cx  = W / 2;
        const gap = Math.min(52, H * 0.08);
        const topY = H * 0.68;

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
