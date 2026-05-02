export const GAME_CONFIG = {
  type: Phaser.AUTO,
  backgroundColor: '#060c06',
  parent: 'game',
  scale: {
    mode: Phaser.Scale.FIT,
    width: 480,
    height: 854,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  render: {
    antialias: false,
  },
};
