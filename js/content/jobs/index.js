import builder    from './builder.js';
import farmer     from './farmer.js';
import forager    from './forager.js';
import woodcutter from './woodcutter.js';
import miner      from './miner.js';
import shepherd   from './shepherd.js';
import hunter     from './hunter.js';
import miller     from './miller.js';
import baker      from './baker.js';
import butcher    from './butcher.js';
import tanner     from './tanner.js';
import smelter    from './smelter.js';
import smith      from './smith.js';
import carpenter  from './carpenter.js';
import mason      from './mason.js';

const defs = [builder, farmer, forager, woodcutter, miner, shepherd, hunter,
               miller, baker, butcher, tanner, smelter, smith, carpenter, mason];

export const JOBS = Object.fromEntries(defs.map(d => [d.id, d]));
export const WORKSHOP_JOBS = Object.fromEntries(defs.filter(d => d.building).map(d => [d.id, d]));
