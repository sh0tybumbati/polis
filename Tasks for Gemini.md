# Tasks for Gemini

Branch off `main`, open a PR per task. Keep each PR focused — one task per PR.
Repo path: `/data/data/com.termux/files/home/projects/polis`

---

## 1. Add missing skill XP calls in workshop roles

**File:** `js/scenes/UnitManager.js`

Workshop workers (miller, baker, carpenter, mason, smelter, tanner, etc.) gain skill XP in `handleGatherTask` and `handleBuildTask` but NOT in `handleWorkshopTask`. When a worker completes a production batch (in the `process` phase when `tickProduction` fires), they should gain XP.

`_gainSkillXp(u, skillName)` already exists. The skill names match `V25_SKILLS` in `gameConstants.js`:
`'bake'`, `'mill'`, `'smelt'`, `'forge'`, `'tan'`, `'butcher'`, `'masonry'`, `'woodcutting'`

The `WORKSHOP_ROLES` getter in UnitManager maps role name → `{ building, input, output, carryQty }`.
Add a `skill` field to each entry in `WORKSHOP_ROLES`, then call `_gainSkillXp(u, def.skill)` at the end of the `process` phase when `b.inbox[def.input]` gets consumed (you can hook into the moment the inbox drops — or simply call it every tick the worker is in process, rate-limited by the existing `workProgress` pattern).

---

## 2. Add `label` descriptions to BLDG entries for tooltip use

**File:** `js/config/gameConstants.js`

Each entry in `BLDG` already has a `label` (e.g. `'🌾 Granary'`). Add a `desc` string field — one short sentence describing what the building does in-game. Example:

```js
granary: { label: '🌾 Granary', desc: 'Stores grain harvested from farms.', ... }
```

Write a `desc` for every building in `BLDG`. Keep each under 60 characters.
These will be displayed in the build menu tooltip later — just add the data for now, no UI changes needed.

---

## 3. Audit and fix `outdoor` flags on BLDG entries

**File:** `js/config/gameConstants.js`

Currently `outdoor: true` is set on: woodshed, stonepile, farm, garden, archery, pasture, palisade, watchtower, gate, wall.

Review every other building and check: does this building have an enclosed interior where a worker would realistically go inside? Buildings that should NOT have `outdoor: true` (and therefore have workers ghosted while working):
- mill, bakery, butcher, tannery, smelter, loom, carpenter, warehouse, granary, townhall, house, barracks, etc.

Buildings that arguably should have `outdoor: true` (workers stay visible):
- Any open-air structure not already listed

Add `outdoor: true` to any that are missing it. Do not add `outdoor: false` — absence means indoor (that's the default).

---

## 4. Normalise build costs across BLDG entries

**File:** `js/config/gameConstants.js`

Review all `cost` and `materialQty` values in `BLDG` for consistency. Rough guidelines:
- Small 1-tile structures (palisade, wall, gate): 2–4 total material
- Medium 2-tile buildings (woodshed, farm, garden): 5–8 total material  
- Large 2–3 tile buildings (granary, barracks, mill): 8–14 total material
- Fixed-material minimums (stone for mill ovens, etc.) should stay as-is in `cost`

Check for any buildings that have neither `cost` nor `materialQty` (effectively free) and give them a sensible cost. List every change you make in the PR description.

---

## 5. Add carpenter and mason to `WORKSHOP_ROLES` skill field + self-supply deposit check

**File:** `js/scenes/UnitManager.js`

When a carpenter (self-supplying as a woodcutter) or mason (self-supplying as a miner) deposits to the source building (`seekDeposit` → woodshed / stonepile), they should check if `_prevRole` is set and restore their original role after depositing, instead of waiting for `seekWorkshopTask` to notice stock exists.

Currently the restore check only happens in `seekWorkshopTask` (called every 2000ms). Move the check: after `handleDepositTask` completes and `u._prevRole !== null`, immediately call `seekWorkshopTask(u)` to restore the role without the delay.

---

## 6. Minimap color coverage for all building types

**File:** `js/scenes/MapManager.js`

In the minimap drawing section, some newer building types may be missing colour entries and show as a fallback grey. Audit the minimap render loop — find where building colours are assigned and ensure every type in `BLDG` has a colour. Use the `color` field already on each `BLDG` entry (`b.color`) — if the minimap isn't already using `b.color` directly, switch it to do so rather than a hardcoded switch/map.
