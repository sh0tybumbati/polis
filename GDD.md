# Polis — Game Design Document (V25)

> A high-automation, dynastic Greek city-builder. Manage living families, build a lasting civilization, and defend it through the night.

---

## Vision

Polis is an **Oikos-first** city-builder set in classical Greece. The core unit of gameplay is not the individual worker or the generic building — it is the **family estate (Oikos)**. Players manage dynasties of named, genetically-distinct individuals who work, breed, inherit property, and die. The economy evolves organically from family-level barter to state-controlled coinage. Combat is a consequence of prosperity, not the point of it.

The game sits between *Dwarf Fortress* (individual simulation depth) and *Caesar III* (city-flow automation) with a tight mobile-first interface.

---

## The Oikos (Family Estate)

The Oikos is a **composite entity**: a root 2×2 domicile plus attached rooms, stalls, and farm plots — all treated as one selectable unit.

### Domain Plot
- The City Planner reserves an **8×8 tile grid** for each family.
- No other family can build inside this domain. It grows organically over generations.
- Clicking *any* child structure (stall, farm, expansion) selects the **Root Domicile** and opens the Family Menu.

### Modular Expansion
- New rooms are **1×2 drag-expansions** attached to the domicile wall.
- Each room adds: `+capacity`, `+1 internal appliance slot`.
- Families auto-repair their home if `condition < 80%`, using their private material stash.

### Internal Appliances
Each appliance slot can hold one of:

| Appliance | Effect |
|---|---|
| Loom | Family member can weave wool → cloth at home |
| Brick Oven | Family member can bake bread without a central bakery |
| Meat Hook | Cures meat to extend spoilage timer |
| Distaff | Spins wool → thread (input for Loom) |
| Beds | Increases rest quality → `willpower` regeneration |

Appliances are requested autonomously when a family member has sufficient skill and an empty slot.

---

## Genealogy & Genetics

Every villager is a persistent individual. There are no anonymous workers.

### Core Attributes (1–10)

| Attribute | Primary effect |
|---|---|
| **Strength** | Carry capacity bonus |
| **Dexterity** | Craft speed, ranged accuracy |
| **Constitution** | Base HP pool |
| **Intelligence** | Skill XP gain rate |
| **Agility** | Movement speed |
| **Willpower** | Morale, routing resistance, passion stamina |

Attributes improve through use; they atrophy during prolonged idleness.

### Skills (1–10)
*Spear, Sword, Bow, Bake, Butcher, Mill, Tan, Smelt, Forge, Animal Trap, Farming, Woodcutting, Mining, Masonry.*

Skill gain is modified by the unit's **Aptitude** for that skill:

| Aptitude | XP rate | Other |
|---|---|---|
| No Interest | ×1.0 | — |
| Interested | ×1.5 | Reduced Willpower decay |
| Burning Passion | ×2.5 | Willpower may regenerate *while working* |

Each unit is born with 1 Burning Passion and 2 Interested skills (random, inheritable tendency).

### Phenotype Blending
Physical traits are inherited via midpoint math with a mutation jitter:

```
child_value = (parent1_value + parent2_value) / 2  ±  mutation
```

Traits: skin tone (hex), eye color, hair color, height scale.

**Rare traits (<1% chance):**
- Albinism
- Gigantism / Dwarfism
- Twin birth
- Prodigy: one skill starts at +3 with Burning Passion

### Succession & Inheritance
On death:
1. Eldest living child inherits the Oikos (home + appliances).
2. If no children: nearest sibling (same fatherId or motherId).
3. If no kin alive: estate reverts to **Public** (player-controlled).

---

## Economy: Barter → Coinage

### Relative Utility Barter
Trade value is dynamic, not fixed:

```
trade_value = base_price × (1 + 1 / current_stock)
```

A family with 0 meat values it far more than one with 50. This creates natural supply-and-demand without a player-managed price screen.

**Kinship Gifting:** Families with high social affinity may gift surplus goods, creating social debts rather than formal exchange records.

### Commercial Tiers

| Tier | Building | Mechanic |
|---|---|---|
| 1 | Home Stall (1×1 porch) | Neighbourhood bartering; surplus threshold set by owner |
| 2 | Market Square (2×1 slots) | Families rent stalls; Merchant Porter sub-task moves goods from home to market |
| 3 | Mint | Indexes barter ratios into fixed **Copper Coinage**; unlocks the Bronze Age |

---

## Logistics & Production

### Localized Production (Building-to-Building)
Units do **not** pull from a global resource pool. Instead:
- Each building has an `inputBasket` and an `outputRack`.
- A unit checks its *assigned workplace's* basket; if empty, it queries the nearest assigned **Stockpile Yard UID**.
- The Strict Localism rule: units sleep only at `home_id` and deliver only to assigned stockpile yards.

### Cellular Production Team
Multi-worker buildings automatically divide roles:

| Role | Behaviour |
|---|---|
| **Procurer** | Fetches raw materials from stockpile yard into the input basket |
| **Processor** | Bench-locked; highest-skill unit; only works the craft |
| **Porter** | Moves finished goods from output rack to assigned stockpile yard |

Solo building: one worker rotates through all three roles (slower output).

### Heavy Logistics

| Tool | Capacity | Constraint |
|---|---|---|
| Leather Backpack | ×2 carry | Requires Leatherworks |
| Wooden Cart | ×8 carry | Road-only for full speed; ×0.5 speed on rough terrain |

---

## Environment & World

### Resource Physicality
Logs, sticks, and stones are **individual map entities**, not abstract counters. Land must be physically cleared before a foundation can be laid; cleared material is consumed by the build or moved to a stockpile yard.

### Asymptotic Growth
```
growth_next = current + (rate / current)
```
Growth slows as entities age but never stops. Yield = `floor(growth_variable)`.

### Two-Stage Tree Harvest
1. **Fell** — worker chops tree, leaving a stump; logs scatter as floor entities.
2. **Gather** — worker collects logs from the floor.
3. **Sapling** — stump grows a sapling over several days; matures to full tree.

### Scrub & Bush Regrowth
- Berry bushes enter a **dormant state** when depleted (not removed); regrow after ~2 days.
- Scrub spreads to adjacent tiles; grazing depletes it; scarcity soft-caps animal population.

---

## The City Planner

A builder unit reaching **5 stars** becomes a City Planner:
- Autonomously plans roads and building districts within explored territory.
- **Auto-zones**: separates Industrial (Tannery, Smelter, Mine) from Residential (Homes, Bakery, Butcher).
- Respects the 8×8 Oikos buffer for each family.
- **Relocation**: lays new foundation → deconstructs old → hauls materials → builds. Costs ×0.75 work, ~12% material loss.

---

## Starting Conditions

### The Tetrad
The game begins with **4 married couples** (8 adults) in 4 starter 2×2 homes with attached farms. This gives the Oikos system immediate content: pairing, inheritance, and expansion begin from turn one.

### Migration Petitions
Random families appear at the map border every N days. The player **Accepts** or **Rejects**:
- Accept → City Planner immediately ghosts a new residential plot in available domain space.
- Reject → family moves on; rejection builds a mild reputation penalty.

---

## Combat & Defense

Combat remains a consequence of prosperity. The enemy polis runs a full mirror economy simulation — the waves it sends reflect what it has actually trained and fed. Starvation weakens waves organically.

### Formations
| Formation | Shape | Strength | Weakness |
|---|---|---|---|
| Phalanx | Vertical line | High frontal HP | Weak flanks |
| Wedge | V-shape | Punches through center | Vulnerable if flanked |
| Screen | Wide sparse | Covers flanks, harasses | Low HP |

### Counter Triangle
Cavalry → Archers → Spearmen → Cavalry

### Unit Progression
Levy (Clubman/Slinger) → Mid (Spearman/Archer/Cavalry) → Elite (Hoplite/Toxotes/Peltast)

Upgrades require material chains: leather kit → Peltast; bronze kit → Hoplite/Toxotes.

---

## World Generation

### Current (Fixed Map)
80×128 tiles, four biome bands (heartland/scrubland/forest/badlands), one river with three fords, fog of war.

### Target (Chunk-Based Infinite)
- Chunk-based generation in biome regions; world grows as players explore.
- Minimap becomes a live region view; pans with exploration.
- Supports Migration Petitions arriving from off-screen.

---

## Visual Direction

- **Style**: Top-down, 32×32px tiles, earthy Greek palette
- **Colors**: Sandstone yellows, Aegean blues, olive greens; `#c8a030` gold UI accents
- **UI**: Dark panel with Greek-key border, square buttons, resolution-agnostic anchoring
- **LOD**: JS-shape engine — small shape groups cull at far zoom, leaving colored-square stand-ins for performance

---

## Tech Stack

| Layer | Tech |
|---|---|
| Rendering | Phaser 3 (CDN, no build step) |
| Game logic | Vanilla JS ES Modules, Manager pattern |
| State | Scene-owned arrays (`units`, `buildings`, `resNodes`) |
| Multiplayer (future) | Colyseus (Node.js) + @colyseus/schema |
