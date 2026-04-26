import farm       from './farm.js';
import mill       from './mill.js';
import bakery     from './bakery.js';
import butcher    from './butcher.js';
import tannery    from './tannery.js';
import smelter    from './smelter.js';
import blacksmith from './blacksmith.js';
import carpenter  from './carpenter.js';
import masons     from './masons.js';
import pasture    from './pasture.js';
import watchtower from './watchtower.js';
import olive_press from './olive_press.js';
import garden     from './garden.js';
import house      from './house.js';
import townhall   from './townhall.js';
import granary    from './granary.js';
import woodshed   from './woodshed.js';
import stonepile  from './stonepile.js';
import barracks   from './barracks.js';
import archery    from './archery.js';
import stable     from './stable.js';
import mine       from './mine.js';
import temple     from './temple.js';
import oracle     from './oracle.js';
import palisade   from './palisade.js';
import wall       from './wall.js';
import gate       from './gate.js';
import warehouse  from './warehouse.js';

const defs = [
    farm, mill, bakery, butcher, tannery, smelter, blacksmith,
    carpenter, masons, pasture, watchtower, olive_press, garden,
    house, townhall, granary, woodshed, stonepile,
    barracks, archery, stable, mine, temple, oracle,
    palisade, wall, gate, warehouse,
];

export const BUILDINGS = Object.fromEntries(defs.map(d => [d.id, d]));
