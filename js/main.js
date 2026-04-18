// Canvas covers the physical screen; the world (128×80 tiles) is larger — camera scrolls over it.
const game = new Phaser.Game({
  type: Phaser.AUTO,
  backgroundColor: '#060c06',
  parent: 'game',
  scene: [BootScene, MenuScene, GameScene],
  scale: {
    mode: Phaser.Scale.NONE,
    width:  SCREEN_W,
    height: SCREEN_H,
  },
  render: { antialias: true },
});
