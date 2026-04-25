import { SCENE_KEYS } from '../config/sceneKeys.js';

export default class EndScene extends Phaser.Scene {
    constructor() {
        super({ key: SCENE_KEYS.END });
    }

    init(data) {
        this.outcome = data.outcome ?? 'lose'; // 'win' | 'lose'
        this.reason  = data.reason  ?? '';
        this.days    = data.days    ?? 0;
    }

    create() {
        const { width, height } = this.scale;
        const cx = width / 2, cy = height / 2;
        const win = this.outcome === 'win';

        // Background
        this.add.rectangle(cx, cy, width, height, win ? 0x0a1a0a : 0x1a0a0a);

        // Title
        this.add.text(cx, cy - 90, win ? 'VICTORY' : 'DEFEAT', {
            fontSize: '52px', color: win ? '#ddaa44' : '#cc4422',
            fontFamily: 'monospace', fontStyle: 'bold',
        }).setOrigin(0.5);

        // Subtitle
        if (this.reason) {
            this.add.text(cx, cy - 30, this.reason, {
                fontSize: '18px', color: '#cccccc', fontFamily: 'monospace',
            }).setOrigin(0.5);
        }

        // Days survived
        this.add.text(cx, cy + 10, `Day ${this.days} reached`, {
            fontSize: '16px', color: '#aaaaaa', fontFamily: 'monospace',
        }).setOrigin(0.5);

        // Restart button
        const btn = this.add.text(cx, cy + 70, '[ Play Again ]', {
            fontSize: '22px', color: '#ffffff', fontFamily: 'monospace',
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });

        btn.on('pointerover',  () => btn.setColor('#ffdd88'));
        btn.on('pointerout',   () => btn.setColor('#ffffff'));
        btn.on('pointerdown',  () => this.scene.start(SCENE_KEYS.GAME));

        this.input.keyboard?.on('keydown-SPACE', () => this.scene.start(SCENE_KEYS.GAME));
        this.input.keyboard?.on('keydown-ENTER', () => this.scene.start(SCENE_KEYS.GAME));

        // Fade in
        this.cameras.main.fadeIn(600, 0, 0, 0);
    }
}
