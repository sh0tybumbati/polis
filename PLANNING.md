# Polis — Development Roadmap

## Milestone 0 — Skeleton (DONE)
- [x] Project structure (`index.html`, `js/`, `css/`, `server/`)
- [x] Phaser 3 via CDN, no build step
- [x] BootScene → MenuScene → GameScene flow
- [x] GDD written
- [x] Colyseus server skeleton

---

## Milestone 1 — Playable MVP (DONE)

### Map & World
- [x] Procedural tile map (grass/sand/rock, 25×18)
- [x] Tile hover highlight during building placement (ghost preview)

### Economy & Buildings
- [x] Resources: food, stone, wood
- [x] Farm, Barracks, Wall, Granary, Woodshed, Stone Pile, Archery Range, House
- [x] Building placement with ghost preview + auto-cancel after place
- [x] Cost deduction; resource carry-back system (workers physically haul to storeroom)
- [x] Demolish / cancel construction with resource recoup
- [x] Floor pile system — resources dropped on ground, workers collect later

### Units
- [x] Hoplite, Archer (player); Raider, Berserker, Veteran (enemy)
- [x] Worker with age stages: child (day 1) → youth (day 2) → adult (day 3+)
- [x] Building-specific worker cap; respawn queue per building
- [x] HP bar above unit; death fade-out

### Population & Upkeep
- [x] Houses hold 4, Townhall holds 6
- [x] Spawn requires 2 adults; lonely houses attract surplus adults over time
- [x] Food upkeep: 3 food/unit/day; starvation kills random units

### Combat
- [x] Auto-attack nearest enemy in range; 1s cooldown
- [x] Enemy waves at night (Day 10+); survive WIN_NIGHTS to win
- [x] Wave composition varies per night

### Formation System
- [x] Click/tap select, shift+click multiselect, box drag select
- [x] Formation presets: LINE (phalanx), WEDGE, SCREEN
- [x] A = select all, F = default formation, ESC = cancel/deselect

### UI
- [x] Resource display, day counter, phase pill, timer bar
- [x] Building info panel (tap with no selection): name, status, Cancel/Demolish button
- [x] Pinch-to-zoom, two-finger pan
- [x] 44px touch-friendly buttons

---

## Milestone 2 — World Depth  ← CURRENT

### Map Size
- [x] **Vast world** — fixed portrait world of 80×128 tiles; camera is a window into it, not a frame around it
- [x] Starting viewport shows only the player's heartland at the bottom; the rest must be explored north
- [x] Map scroll bounds enforced; camera clamps to world edges
- [x] Player polis spawns at bottom-centre; enemy polis at top-centre; four biome bands run south-to-north

### Minimap
- [x] Small fixed overlay (bottom-right corner, ~160×90px) showing the full world at a glance
- [x] Renders: terrain color, fog state (dark = unexplored, dim = seen, lit = current-vision), friendly units (blue dots), enemy units (red dots, only within currently-lit tiles), buildings (colored squares)
- [x] Click/tap on minimap pans main camera to that location
- [x] Minimap respects fog — enemy village region is black until a unit physically reaches it

### Terrain & Biomes
- [x] **Biome system** — four organic zones (heartland, scrubland, forest, badlands) with multi-octave noise borders: primary sweep ±13 tiles, peninsula-scale ±7 tiles, fine roughness ±3 tiles; tile types bleed across boundaries ~30% of the time for soft organic edges
- [x] Resource nodes cluster within appropriate biomes
- [x] **Tile movement modifiers** — movement speed multiplied per tile type (grass ×1.0, sand ×0.75, rock ×0.6, forest ×0.65, road ×1.45, desire path ×1.15); applied per-tick in `moveToward()` via `_tileSpd()`
- [x] **River** — one organic river running roughly east-west (horizontal) through mid-map; 3 ford crossing points; creates a natural strategic chokepoint between player and enemy territory

### Roads & Desire Paths
- [x] **`trafficMap[y][x]`** — incremented each time a unit steps on a tile; decays each day
- [x] **Desire paths** emerge automatically: traffic > 120 → worn-path visual + ×1.15 speed; drop back to bare if traffic decays below threshold
- [x] **Buildable paved roads** — costs 1 stone; ×1.45 speed; distinct visual; drag-paintable in road tool mode
- [x] Road tool in build toolbar; works on any non-building, non-water tile

### Fog of War
- [x] **No starting vision** — entire map begins black; player starts blind even in the heartland
- [x] Each unit projects a vision radius updated every tick: workers 3 tiles (dim to 6), soldiers 5 tiles (dim to 10)
- [x] Three vision states per tile:
  - **Black** (never seen) — terrain, units, buildings completely hidden
  - **Dimmed** (seen but not currently lit) — terrain and *player* buildings visible; enemy units/buildings not updated
  - **Lit** (currently in a unit's radius) — everything visible
- [x] `visMap[y][x]` stores state (0/1/2); recomputed each frame from all living friendly units
- [x] Fog rendered as a dark overlay (depth 8) on the world camera; minimap mirrors fog state
- [x] Player buildings grant a large (radius 10) permanent lit circle while built
- [ ] Watch Tower (Milestone 3) adds a large static lit radius even with no units nearby

### Enemy Village (Mirror Sim — groundwork only)
- [x] Enemy polis pre-placed in Badlands during world gen (buildings exist, visible once fog cleared)
- [x] Enemy workers active from day 1 with full economy sim (gather resources, eat, respawn)
- [x] Enemy village buildings act as HP pools; destroying them degrades enemy production
- [x] Full mirror economy simulation (pulled forward from MS3)

### Gender System

Gender is a single field (`gender: 'male' | 'female'`) assigned at spawn (50/50 random) that threads through people, soldiers, workers, wild animals, and pastured sheep alike. It affects reproduction and housing logic but never combat stats.

#### People & Workers
- [x] All workers and soldiers get a `gender` field at spawn (50/50 random); starting pair is hardcoded male + female
- [x] **House pairing** — a house can only spawn a new child if at least one adult male and one adult female resident are present; attraction logic only moves the missing gender from surplus buildings
- [x] Gender shown as a tiny dot (blue = male, rose = female) just to the right of the HP bar on all units

#### Pastured Sheep
- [x] Each tamed sheep in a pasture gets a `gender` field (`b.males` / `b.females` counts)
- [x] **Pastures work like houses** — shepherd prefers to tame the missing sex when seeding; tamed adults enter at their wild gender
- [x] **Pasture breeding** — once per day at dawn, each female in a fed pen with ≥1 male has a 40% chance to produce a lamb; lambs mature in 2 days with random gender
- [x] **Shepherd feeds at dawn** — shepherd's first task is to carry food (1 per sheep) to each unfed pasture; pens that weren't fed cannot breed
- [x] Both sexes produce wool and meat
- [x] **Shepherd priority order**: (1) feed pens → (2) transfer from full pen to underpopulated pen → (3) shear wild sheep → (4) tame wild → (5) slaughter surplus
- [x] Shepherd culls extra males first, preserving at least one per pen
- [x] **Hungry-day death** — two consecutive unfed days kills a pasture sheep (grace rule parity with people)

#### Wild Animals
- [x] All wild deer and sheep get a `gender` field at spawn/edge-entry
- [x] Male deer are scale 1.1, have antlers drawn, and flee radius –0.5 tiles vs females; both yield the same meat
- [x] Wild sheep have a subtle gender dot on the head (blue/rose)
- [x] Mating check at dawn: a female within 5 tiles of a male of the same species, both having eaten today → 40% chance of offspring

### Living Ecosystem

#### Scrub Vegetation
- [x] **Scrub nodes** — sparse olive-green shrub clusters in heartland/scrubland; animal-only forage (`resource: null`), 35 placed at world-gen
- [x] **Slow spread** — 15% chance per day to seed adjacent tile; new scrubs start dormant (1 day); capped at 50 nodes
- [x] **Grazing depletes scrub** — animals decrement `stock` on arrival; at 0 the node enters a 3-day dormant (bare dirt) state before regrowing
- [x] Scrubs drawn as small olive-green clusters; depleted scrubs shown as bare dirt patch

#### Berry Bush Spread & Regrowth
- [x] **Berry bushes never disappear** — when stock hits 0 the bush enters a dormant state (bare visual, cannot be harvested); stock replenishes fully after ~2 days, then it can be harvested again
- [x] **Bushes spread** — each day transition, each bush at > 50% stock has a ~10% chance to seed a new bush on a random adjacent grass or scrubland tile (not rock, water, sand, building, or existing node)
- [x] New bush starts dormant (0 stock) and takes ~2 days to reach full stock before it becomes harvestable
- [x] Global cap: ~30 berry bushes on the map at once; spread halts if cap is reached

#### Tree Growth & Saplings
- [x] **Saplings** — when a tree node is fully harvested (stock reaches 0) it is not removed; instead it becomes a sapling with a multi-day regrowth timer (small_tree: 3 days, large_tree: 5 days)
- [x] Sapling is drawn as a tiny green dot; it cannot be harvested; after the timer it restores to full stock and normal appearance
- [x] **Natural seeding** — each day transition, every tree (not sapling) has a ~12% chance to drop a sapling on a random adjacent forest or grass tile (not water, rock, sand, building, or existing node); the sapling matures normally
- [x] Seeding is capped: no more than one new sapling per tree per day; global tree node cap ~60 to prevent runaway forestation

#### Wildlife Foraging
- [x] **Deer and sheep must eat 3 scrub portions per day** — tracked via `ateToday` counter reset at each dawn
- [x] If an animal ends the day having eaten < 3: it becomes **hungry** (faded tint); two consecutive hungry days = death
- [x] Animals actively path toward the nearest scrub node when hungry; scrub is animal-only forage (workers cannot harvest it)
- [x] Scrub scarcity naturally soft-caps animal population — no hard cap needed

#### Wildlife Reproduction & Edge Entry
- [x] **No pre-spawned populations** — animals enter from N/E/W map edges every ~90s (1–2 deer or 1 sheep) while below cap
- [x] Edge entry: spawns at N row 8, or random y on E/W edges in the middle 60% of map height; gender assigned on entry
- [x] **Mating / reproduction** — male+female pair in proximity → offspring after time; not yet implemented
- [x] Population self-regulates through scrub availability; overpopulation collapses when scrubs are stripped
- [x] Tamed pasture sheep use the gender-based pasture breeding + shepherd feeding system above; the old `SHEEP_WOOL_MS` fixed timer is replaced entirely

---

## Milestone 3 — Combat Depth & Living World

### Enemy Village — Full Mirror Simulation
- [x] Enemy polis runs the same economic tick loop as the player: workers gather, population grows, food upkeep applies, buildings are placed by an AI build-order
- [x] **AI build order** — enemy follows a loose priority sequence (farm → barracks → archery → house) based on resource thresholds, same rules as player economy
- [x] Wave composition is no longer scripted — it reflects what the enemy has actually trained; starvation or raiding can weaken or delay waves organically
- [x] Enemy workers and soldiers pathfind and behave using the same unit system; enemy soldiers patrol during day and march south at night
- [x] Enemy village rebuilds destroyed structures using its own workers and resources
- [x] Player can observe enemy activity once fog is cleared in that region
- [ ] **Enemy scout** appears ~20s before each night; killing it reveals full wave composition as a UI flash

### Economy Depth — Food Chains & Daily Life

#### Time of Day
- [ ] The DAY phase is divided into six sub-periods tracked as a 0–1 value within the day timer: **dawn → morning → midday → afternoon → dusk → night**
- [ ] Villagers receive an internal "reminder" signal at morning, midday, and dusk — they finish their current task first, then respond (loose in practice, not a hard interrupt)
- [ ] At dusk, villagers head home to sleep; during the NIGHT (combat) phase they are at their house and do not work — guards are the exception (later feature)
- [ ] Scouts and long-range workers can carry portable rations (sandwiches) and stay out for multiple days without returning to base to eat

#### Food Taxonomy

Three tiers of food; each tier requires the player to have built and operated the preceding tier's building before the next one unlocks (minimum throughput gate, not just placement).

**Tier 0 — Raw** (stored in granary/food store; villagers must eat 3× per day — morning, midday, dusk)
- Wheat — harvested from farms (1 storage slot each)
- Berries — foraged from berry bushes (1 slot each)
- Raw meat — from hunting or slaughtering pasture animals (1 slot each)

**Tier 1 — Ingredients / Processed** (stored in granary; more units per slot, enabling Tier 2 recipes)
- Flour — 4 flour = 1 storage slot; produced at Mill from wheat (1 wheat → 2 flour)
- Cuts — 4 cuts = 1 storage slot; produced at Butcher from raw meat (1 meat → 4 cuts)
- Vegetables (onions, carrots) — 1 slot each; discovered in the wild then grown in veggie gardens; can be eaten directly once per day as a refined food, or used as a recipe ingredient
- Olive oil — 4 units = 1 slot; pressed at Olive Press from olives grown in a grove; used as a cooking ingredient (later)

**Tier 2 — Finished Meals** (stored at the establishment that makes them, limited stock; villagers eat once per day at the shop with an attendant — no self-service)
- **Bread** — 4 flour → 1 bread loaf; made at Bakery; feeds 1 person 1 day; stored at Bakery (limited stock)
- **Pie** — 4 flour + 2 berries → 3 pies; made at Bakery; each pie feeds 1 person 1 day; stored at Bakery
- **Sausage** — 4 cuts → 1 large sausage; made and sold at Butcher; feeds 1 person 1 day; stored at Butcher

**Tier 3 — Combination Meals** (made at Cookhouse from Tier 2 goods; portable)
- **Sandwich** — 1 bread loaf + 1 sausage → 3 sandwiches; each feeds 1 person 1 day; storable at Cookhouse; **can be carried by scouts and explorers** for multi-day trips away from base

#### Fallback: The Foodhaus

When a villager cannot reach a shop with an attendant (queue too long, shop unstocked, no shop built yet), they fall back to the **Foodhaus** — a basic communal kitchen where raw food is self-prepared and eaten on the spot. Rules:

- Villagers bring their own raw food from the granary and prepare it themselves; no attendant required
- Preparing raw food at the Foodhaus takes 3× as long as being served at a specialist shop (one full eating event per visit, so still 3 visits/day)
- The Foodhaus has limited workstation slots — when multiple villagers fall back simultaneously it creates a queue, bottlenecking the whole settlement's daily routine
- This is not a comfortable fallback; it is the pressure that motivates building out the proper food chain
- The Foodhaus exists from the start (it is the basic starting community kitchen); specialist shops layer on top of it over time

#### Buildings

**Foodhaus** *(available from game start — no unlock required)*
- Communal fallback kitchen; handles raw food preparation when specialist shops are unavailable or overwhelmed
- Limited workstation slots (e.g., 2–4); becomes a visible bottleneck under food-chain collapse
- Workers can also be assigned here as a permanent role to slightly speed up raw food prep, but it never matches specialist chain throughput

**Mill** *(prep building — unlocks after farm has produced 15 wheat total)*
- Worker grinds wheat into flour (1 wheat → 2 flour)
- Output stored in granary as Tier 1 ingredient

**Bakery** *(establishment — unlocks after Mill has processed 10 wheat)*
- Workers divide roles: producing (wheat→bread, flour+berry→pie), stocking shelves, serving customers
- More workers = faster production and shorter queue times; fewer workers = they rotate all tasks themselves
- Holds a limited stock of bread and pie (e.g., 8 units total); player needs multiple bakeries for a large population
- Auto-decides recipe based on available ingredients; player can override per-bakery

**Butcher** *(prep + establishment — unlocks after 5 raw meat ever collected)*
- Worker breaks down raw meat into cuts (1 meat → 4 cuts), then makes sausages (4 cuts → 1 sausage)
- Sells sausages directly to villagers; also supplies Cookhouse
- Holds a limited stock of sausages; multiple butchers needed for large populations

**Cookhouse** *(Tier 3 establishment — unlocks after Bakery and Butcher are both operational)*
- Fetches bread from Bakery and sausages from Butcher: if Cookhouse has more workers than the supplier it picks up; if supplier has more workers it delivers; on a tie Cookhouse picks up
- Makes sandwiches (1 bread + 1 sausage → 3 sandwiches); stores them on-site
- Sandwiches are the only carriable meal — issued to scouts, soldiers, and explorers for multi-day deployments

#### Shop Worker Model
- Each establishment has worker slots; any villager adult can be assigned
- Tasks auto-divide: with 1 worker they do everything sequentially; with 2+ they specialise (producer, stocker, server)
- With no attendant worker present, the shop cannot serve customers regardless of stock
- Shops are a major sink for adult workers — a well-fed large city needs several of each type running in parallel

#### Storage Rules
- Granary (food store) holds raw + Tier 1 ingredients only; their slot costs apply toward the granary capacity cap
- Finished meals (Tier 2 and 3) are stored at the establishment and do NOT count toward granary cap
- Sandwich inventory carried by a unit is tracked per-unit (not in any building)
- Having multiple shops of the same type expands finished-meal capacity linearly

#### Veggie Gardens & Groves *(discovered resources)*
- Wild vegetables (onions, carrots) and grove plants (olives) exist in the world but cannot be farmed until discovered
- A scout physically finds and carries back one specimen; once it is stored in a food store, the corresponding building unlocks (Veggie Garden for onions/carrots; Olive Grove for olives)
- **Veggie Garden** — grows onions and carrots; one day per harvest cycle; seeds auto-saved for the next batch; multiple crop types can share one garden (player sets planting priority)
- **Olive Grove** — slower-growing tree crop (3 days first harvest, 2 days subsequent); produces olives → pressed at Olive Press into olive oil
- Raw vegetables can be eaten directly once per day (same as Tier 2 refined); olive oil is an ingredient only

#### Building Unlock Gates
| Building | Unlocks after |
|---|---|
| Mill | Farm has harvested 15 wheat |
| Bakery | Mill has processed 10 wheat |
| Butcher | 5 raw meat total ever collected |
| Cookhouse | Bakery AND Butcher are both built and have produced at least 1 output |
| Veggie Garden | 1 wild vegetable specimen returned and stored |
| Olive Grove | 1 wild olive specimen returned and stored |
| Olive Press | Olive Grove has produced 5 olives |

#### Enemy Economy Parity
- [ ] The enemy polis is subject to all the same food-chain constraints as the player — the enemy AI must build mills, bakeries, butchers, and a foodhaus; its soldiers and workers follow the same daily eating schedule and will bottleneck at the foodhaus if the chain is underdeveloped
- [ ] Destroying enemy food infrastructure (mill, bakery, butcher) degrades the enemy's food efficiency, forcing its population back to raw Foodhaus eating — slowing worker output and soldier training
- [ ] Enemy AI build-order is extended to include food chain buildings at the appropriate unlock thresholds, prioritising the chain that matches its available raw resources

#### Material Chains *(same pattern, implemented in later milestones)*
- **Wood**: Logs → Sawmill (1 log → 3 planks) → Carpenter (planks → furniture, tools, components)
- **Stone**: Raw stone → Stonemason (1 stone → 2 blocks) → Builder's Yard (blocks → fortifications, paved areas)
- **Metal** *(later era)*: Ore → Smelter (ore → ingots) → Blacksmith (ingots → weapons, tools, armour)
- Same unlock-gate rule applies: must have built and operated the preceding building in the chain

### Counter-Unit Triangle
- [ ] **Cavalry** — fast (×1.6 speed), high damage vs archers, weak to spearmen (hoplites get +50% atk vs cavalry)
- [ ] **Spearman** (renamed/upgraded Hoplite variant) — bonus vs cavalry, average vs everything else
- [ ] Rock-paper-scissors clearly communicated in UI (unit tooltip shows strengths/weaknesses)

### Unit Experience
- [ ] Units surviving 2+ nights gain *Veteran* status: +1 HP, +10% speed, gold shield icon
- [ ] Veteran units are irreplaceable (no respawn queue when they die); loss feels meaningful
- [ ] Optional: named veteran units (procedural Greek names)

### Morale & Routing
- [ ] Units below 25% HP attempt to flee toward home building
- [ ] Flanked units (enemies attacking from 2+ sides simultaneously) get –20% attack
- [ ] Units near a Hero unit (see below) are immune to routing
- [ ] Rout creates a cascade: fleeing units trigger nearby units to check morale

### Defensive Structures
- [ ] **Watch Tower** — costs stone+wood; auto-fires arrows at range 5 tiles; reveals fog in radius 6
- [ ] **Wall Gate** — placed in a wall segment; manually open/close; workers can pass when open, enemies cannot; seals automatically at nightfall
- [ ] **Palisade** (cheap wooden wall) — cheaper than stone wall, burns if fire mechanic added later

### Terrain Advantages (combat)
- [ ] Forest tiles: archers in forest get cover (–20% incoming ranged damage)
- [ ] High-ground tiles: archers gain +8 range when stationary
- [ ] River fords: only passable at designated ford tiles; creates natural chokepoints

---

## Milestone 4 — Strategic Layer

### Day Phase Agency
- [ ] **Scouting** — send a fast unit east before nightfall to reveal the enemy wave composition
- [ ] **Idle worker alerts** — pulsing indicator on idle adult workers; tap to assign
- [ ] **Pre-wave intel flash** — 10s before night, text overlay shows incoming unit types if enemy scout was killed
- [ ] **Repair** — workers can repair damaged (but not destroyed) buildings at half build cost

### Hero Unit
- [ ] One named hero spawns at game start (procedural Greek name, e.g. *Lysander*)
- [ ] Hero levels up each night survived: gains HP, area morale aura, unique ability at level 3
- [ ] Hero death = immediate morale collapse for nearby units; loss condition if no survivors remain
- [ ] Persists between runs (Milestone 4 generational carry)

### Food as Strategic Pressure
- [ ] **Shortage state** — when food < upkeep: workers operate at 70% gather speed, no new training allowed; death only triggers after 2 consecutive days short
- [ ] **Surplus bonus** — food > 2× upkeep: +10% worker speed (well-fed bonus)
- [ ] **Trade caravan** (random event, every ~8 days): merchant passes through; can sell excess stone/wood for food

---

## Milestone 5 — Multiplayer

- [ ] Colyseus server: server-authoritative unit movement + combat
- [ ] Client sends commands (move, build, train), server resolves
- [ ] Room lobby (host creates, others join via code)
- [ ] 2-player co-op: shared map, split flanks
- [ ] Sync: unit HP, positions, phase transitions, enemy village state
- [ ] Reconnection handling
- [ ] Deploy: GitHub Pages + Render

---

## Milestone 6 — Era Progression

- [ ] Persian Wars arc: Thermopylae-style last stand scenarios
- [ ] War Elephant enemy (large, slow, high HP, damages buildings on contact)
- [ ] Siege Workshop: catapult unit that targets buildings
- [ ] Generational carry: one building bonus or veteran unit persists between runs
- [ ] 4-city-state league mode: each player is a different Greek polis with a unique unit bonus

---

## Stretch / Future

- [ ] Greek pottery visual theme (red-figure aesthetic)
- [ ] Map editor
- [ ] Procedural enemy general with personality (aggressive / flanking / siege)
- [ ] Oracle building: reveals next wave composition before timer ends
- [ ] Fire mechanic: flaming arrows, burning buildings, bucket-brigade workers
- [ ] Naval flank: enemy ships land on the south coast (new attack vector)
