import deer    from './deer.js';
import sheep   from './sheep.js';
import critter from './critter.js';
import boar    from './boar.js';
import aurochs from './aurochs.js';
import wolf    from './wolf.js';

const defs = [deer, sheep, critter, boar, aurochs, wolf];

export const ANIMALS = Object.fromEntries(defs.map(d => [d.id, d]));
