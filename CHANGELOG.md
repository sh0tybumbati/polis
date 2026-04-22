# Changelog

## [Unreleased]

### Added
- **Three-meal food system** — food upkeep now fires 3× during each DAY phase (at 25%, 50%, 75% elapsed) consuming 1 food per unit per meal instead of 3 at dawn; starvation now deals 1 HP damage per missed meal rather than instant-killing the unit, giving players a brief window to recover
- **Mill building** — auto-processes 2 wheat → 3 flour every 10s; stores wheat (cap 40) and flour (cap 30); provides an efficient grain processing chain
- **Bakery building** — auto-processes 2 flour → 3 food every 12s with a "🍞 bread" float text; makes wheat farming more food-efficient than raw grain deposit
- **Butcher building** — auto-processes 1 meat → 3 food every 8s with a "🥩 cuts" float text; hunters now carry `meat` resource and deposit it at the butcher for 3× food value, or fall back to 1:1 food if no butcher is built
- **Wheat from farms** — farms produce a bonus wheat yield at dawn (~15% of crop); wheat is stored only when a mill exists (storage cap 0 otherwise, so no waste before mill is built)
- **Meat resource** — hunters haul `meat` from deer carcasses; shepherds deposit slaughter proceeds as direct food (convenient path); the butcher chain triples hunting yield
- **New resources in UI** — wheat 🌿, flour 🌾→, and meat 🥩 shown in topbar alongside wool when any storage capacity exists
- **New building visuals** — mill (millstone with grooves and hopper), bakery (arched oven with fire glow), butcher (hanging meat rack with counter)
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
- **GUI Rework** — implemented a major interface overhaul with a bottom-docked control panel and contextual sidebars. The minimap is now centered within this panel, flanked by contextual action buttons on the left and movement/selection controls on the right.
- **Context-Aware Sidebars** — the left sidebar automatically shifts content based on selection: showing building category tabs ([E]conomy, [R]esource, [C]ivic, [D]efense) when no one is selected, specific unit actions (like "RECALL" for workers or "DISMISS" for soldiers), and detailed building info/actions when a structure is selected.
- **Mobile-Friendly UI** — reduced the size of navigation tabs and organized building options into a 2-column grid to maximize vertical space and improve usability on small screens.
- **Selection Management** — added "ALL" (select all units) and "✕" (deselect) buttons directly to the bottom panel for faster army management.
