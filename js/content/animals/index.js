import deer    from './deer.js';
import sheep   from './sheep.js';
import critter from './critter.js';

const defs = [deer, sheep, critter];

export const ANIMALS = Object.fromEntries(defs.map(d => [d.id, d]));
