import berry_bush   from './berry_bush.js';
import small_tree   from './small_tree.js';
import large_tree   from './large_tree.js';
import small_boulder from './small_boulder.js';
import large_boulder from './large_boulder.js';
import wild_garden  from './wild_garden.js';
import olive_grove  from './olive_grove.js';
import scrub        from './scrub.js';
import ore_vein     from './ore_vein.js';
import grape_vine   from './grape_vine.js';
import wild_wheat   from './wild_wheat.js';
import fishing_spot from './fishing_spot.js';

const defs = [
    berry_bush, small_tree, large_tree,
    small_boulder, large_boulder,
    wild_garden, olive_grove,
    scrub, ore_vein,
    grape_vine, wild_wheat, fishing_spot,
];

export const NODES = Object.fromEntries(defs.map(d => [d.id, d]));
