# Changelog

## [Unreleased]

### Added
- **Scrub vegetation** — sparse olive-green scrub nodes scattered across heartland and scrubland biomes; animals-only forage (workers cannot harvest), depletes to bare dirt on grazing and regrows over 3 days, spreads to adjacent tiles at 15% chance per day (capped at 50 nodes)
- **Wildlife foraging** — deer and wild sheep actively seek the nearest scrub node when hungry (`ateToday < 3`); two consecutive unfed days causes the animal to die, naturally soft-capping population to scrub availability
- **Edge entry spawning** — deer and wild sheep no longer pre-spawn at world start; instead small groups wander in from the N, E, and W map edges every ~90 seconds as long as population is below cap, giving the world a living arrival feel
- **Hunger visuals** — hungry deer render with a faded brown tint; hungry wild sheep render semi-transparent, making struggling animals visible at a glance
- **Gender-aware pasture system** — pastured sheep are now tracked as males, females, and lambs; dawn breeding requires a fed pen with ≥1 male and ≥1 female (40% chance per female), lambs mature in 2 days with random gender assignment
- **Shepherd feeding priority** — shepherds now carry food from stores to each pasture each day (`fedToday` flag); unfed pens don't breed, making food supply a direct lever on herd growth
- **Shepherd pen transfers** — shepherds move one adult from an overcrowded pen to an underpopulated one, automatically balancing the herd across multiple pastures
- **Gender-preferential culling** — surplus males are slaughtered before females when a pasture is at capacity, preserving breeding pairs
- **Wild sheep gender seeding** — shepherds prefer to tame a male when a pasture has none, helping seed balanced breeding pairs; tamed adults enter the pen at their wild gender rather than as lambs
- **Enemy mirror economy** — the enemy polis now runs a full economic simulation: workers gather stone, wood, and food from shared world nodes, a separate resource pool (`enemyRes`) tracks their stockpiles, and food upkeep applies at dawn with starvation killing units just like the player
- **Enemy AI build order** — each dawn the enemy evaluates its resources and places new farms, barracks, archery ranges, and houses near its village when thresholds are met (farm → barracks → archery → house priority)
- **Enemy military production** — barracks and archery ranges continuously train hoplites and archers from `enemyRes.food`; soldiers patrol the village during the day and march south to attack at night, then drift back at dawn
- **Enemy worker respawn** — enemy workers tied to the townhall re-queue on death and respawn after the standard delay, keeping the enemy economy running even under attack
- **Berry bush dormant state** — harvested berry bushes no longer disappear; they enter a bare, faded dormant state and fully replenish after ~2 days, giving food sources long-term persistence
- **Berry bush spreading** — each dawn, any bush at >50% stock has a 10% chance to seed a new dormant bush on an adjacent grass or scrubland tile (capped at 30 bushes total)
- **Tree saplings** — fully harvested trees become a tiny green sapling rather than vanishing; small trees regrow in 3 days, large trees in 5 days
- **Natural tree seeding** — each dawn, living (non-sapling) trees have a 12% chance to seed a sapling on an adjacent forest or grass tile (capped at 60 tree nodes total)
