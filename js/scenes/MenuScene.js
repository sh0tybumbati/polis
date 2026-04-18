class MenuScene extends Phaser.Scene {
  constructor() { super({ key: 'MenuScene' }); }

  create() {
    const W = this.scale.width, H = this.scale.height;

    // Background
    this.add.rectangle(W / 2, H / 2, W, H, 0x060c06);

    // Decorative dots
    const gfx = this.add.graphics();
    gfx.fillStyle(0x1a2a1a);
    for (let i = 0; i < 80; i++) {
      gfx.fillRect(
        Phaser.Math.Between(0, W),
        Phaser.Math.Between(0, H),
        Phaser.Math.Between(1, 3),
        Phaser.Math.Between(1, 3)
      );
    }

    // Title
    this.add.text(W / 2, H / 2 - 90, 'POLIS', {
      fontSize: '56px', color: '#c8a030', fontFamily: 'monospace',
      stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5);

    this.add.text(W / 2, H / 2 - 30, 'Defend the city-state', {
      fontSize: '16px', color: '#7a9a6a', fontFamily: 'monospace',
    }).setOrigin(0.5);

    // Season info
    this.add.text(W / 2, H / 2 + 10, '3 seasons · build by day · hold the line at night', {
      fontSize: '12px', color: '#556655', fontFamily: 'monospace',
    }).setOrigin(0.5);

    // Start button
    const btn = this.add.text(W / 2, H / 2 + 65, '[ BEGIN ]', {
      fontSize: '26px', color: '#dddddd', fontFamily: 'monospace',
      stroke: '#000000', strokeThickness: 2,
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    btn.on('pointerover', () => btn.setColor('#c8a030'));
    btn.on('pointerout',  () => btn.setColor('#dddddd'));
    btn.on('pointerdown', () => {
      this.cameras.main.fadeOut(300, 0, 0, 0);
      this.cameras.main.once('camerafadeoutcomplete', () => {
        this.scene.start('GameScene');
      });
    });

    // Controls hint
    this.add.text(W / 2, H - 18, 'Click to select  •  Shift+click multiselect  •  Right-click to move  •  A select all  •  ESC cancel', {
      fontSize: '10px', color: '#334433', fontFamily: 'monospace',
    }).setOrigin(0.5);
  }
}
