export const GAME_CONFIG = {
  type: Phaser.AUTO,
  backgroundColor: '#060c06',
  parent: 'game',
  scale: {
    mode: Phaser.Scale.RESIZE,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  render: {
    antialias: false,
  },
  input: {
    mouse: {
      preventDefaultDown: false,  // let pointerdown reach Phaser for all buttons
    },
  },
};
