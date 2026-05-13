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
import presser    from './presser.js';
import weaver     from './weaver.js';
import brewer     from './brewer.js';
import tanner     from './tanner.js';
import smelter    from './smelter.js';
import smith      from './smith.js';
import carpenter  from './carpenter.js';
import mason      from './mason.js';
import merchant   from './merchant.js';

const defs = [builder, farmer, forager, woodcutter, miner, shepherd, hunter,
               miller, baker, butcher, presser, weaver, brewer, tanner, smelter, smith,
               carpenter, mason, merchant];

export const JOBS = Object.fromEntries(defs.map(d => [d.id, d]));
// WORKSHOP_JOBS: any job with input→output processing (construct optional — zone appliances count)
export const WORKSHOP_JOBS = Object.fromEntries(defs.filter(d => d.input && d.output).map(d => [d.id, d]));
