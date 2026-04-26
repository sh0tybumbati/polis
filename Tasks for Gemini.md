# Tasks for Gemini

Branch off `main`, open a PR per task. Keep each PR focused — one task per PR.
Repo path: `/data/data/com.termux/files/home/projects/polis`

---

## ✅ Completed (Dev2 — merged)

- **Workshop XP** — skill XP gained in process phase via workProgress timer ✅
- **Building `desc` fields** — all BLDG entries have a short description ✅
- **Outdoor flag audit** — reviewed all buildings; olive_press wrongly flagged outdoor (fixed post-merge) ✅
- **Cost balance pass** — granary, mill, bakery, archery costs adjusted ✅
- **Role restore speedup** — immediate restore after self-supply deposit ✅ (depositPrivate guard added post-merge)
- **Minimap colors** — now uses `BLDG[b.type]?.color` directly ✅

### Feedback on Dev2
- `olive_press: outdoor: true` — wrong. An olive press is an enclosed stone structure like a mill. Fixed post-merge.
- Role restore had no `_depositPrivate` guard so it fired on night home deposits too. Fixed post-merge.
- `watchtower materialQty 4→2` — too cheap for a tower that grants fog vision and garrison slots. Should be at least 4–6.

---

## New Tasks

### 7. Fix watchtower build cost

**File:** `js/config/gameConstants.js`

The watchtower `materialQty` was reduced to 2 in Dev2 — restore it to at least 5. It has fog vision radius, ranged attack, and garrison slots, so it should be more expensive than a wall (stone: 2) and comparable to a palisade segment.

Suggested: `cost: { stone: 3 }, materialQty: 5`

---

### 8. Show building `desc` in the build menu tooltip

**File:** `js/scenes/UIManager.js`

The `desc` field now exists on every BLDG entry. Display it in the build menu when the player hovers over (or selects) a building option.

Find `_buildMenuItems` and the build panel render in `UIManager.js`. Below the building label and cost string, render the `desc` in a smaller font (around 8–9px), colour `#bbbbbb`, wrapping if needed. Look at how `showFloatText` or existing label rendering works for font size reference.

Do NOT invent a hover system — just show the desc as a static subtitle line under the building name in the existing list layout.

---

### 9. `desc` field shown in left info panel for selected buildings

**File:** `js/scenes/UIManager.js`

When a built building is selected and its info appears in the left panel, add a line showing `BLDG[b.type]?.desc` beneath the building label. Same style as task 8: ~8px, `#aaaaaa`.

Find the section in `_renderBuildingInfo` (or equivalent) that renders the building name and add the desc line directly below it.

---

### 10. Child name display above unit sprite

**File:** `js/scenes/UnitManager.js`

Workers already have a `name` field (set in `spawnUnit`). Children (age 0 and 1) currently have no visible label.

Add a floating name label above child sprites. Use Phaser's `add.text` with font size 7, colour `#ffeecc`, depth 7, origin `(0.5, 1)`. Attach it to `u.nameLabel` on the unit object and update its position each tick in the main update loop (same place `u.gfx.setPosition` is called). Destroy it when the unit dies.

Only show for age < 2 units (children/youth). Adult workers don't need it — there are too many on screen.

---

### 11. Seasonal farm visual (crop rows change colour by season)

**File:** `js/scenes/MapManager.js` and/or `js/scenes/BuildingManager.js`

There's a `season` value on `scene` (or derivable from `scene.day` — check `WorldManager` for how seasons work). Farm tiles currently draw static green. Make the farm graphic colour shift:
- Spring: bright green `0x66cc44`
- Summer: golden `0xc8a832`  
- Autumn: brown-gold `0x997722`
- Winter: pale `0xccccaa`

Find where farm buildings are drawn (look for `b.type === 'farm'` in `BuildingManager.js` or `redrawBuilding`). Apply the seasonal tint to the crop rectangle. Trigger a redraw of all farms at season change — check how `collectFirstFruits` or `endNight` is called in `WorldManager` to find a good hook point.
