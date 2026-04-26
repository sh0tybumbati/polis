# Tasks for Gemini

Branch off `main`, open a PR per task. Keep each PR focused — one task per PR.
Repo path: `/data/data/com.termux/files/home/projects/polis`

---

## ✅ Completed (all merged)

- Workshop XP, building descs, outdoor flags, cost balance, role restore, minimap colors (Dev2)
- Watchtower cost fix, desc in build menu + info panel, child name labels, seasonal farm colours, farm.js created (tasks 7–11)

### Standing feedback rules
- Never use `outdoor: true` on enclosed stone buildings (mill, olive press, bakery, etc.)
- Always guard `_depositPrivate` before acting on private vs. public deposit paths
- Always exclude Phaser object references from `_serUnit` / save data
- One PR per task — no bundling

---

## New Tasks

### 12. Resource node respawn

**Files:** `js/scenes/WorldManager.js`, `js/config/gameConstants.js`

Depleted resource nodes (`n.stock <= 0`) never come back. Add a respawn system:

- Add a `respawnDays` value to each entry in `NODE_DEF` in `gameConstants.js`:
  - `berry_bush`: 3, `wild_garden`: 4, `olive_grove`: 5
  - `small_tree`: 6, `large_tree`: 10
  - `small_boulder`: 12, `large_boulder`: 20, `ore_vein`: 25
  - `scrub`: 4

- In `WorldManager.js`, add a method `tickNodeRespawn()` called from `endNight()`. It iterates `this.scene.resNodes`, and for each node where `n.stock <= 0`:
  - Increment `n.respawnTimer = (n.respawnTimer ?? 0) + 1`
  - When `n.respawnTimer >= NODE_DEF[n.type]?.respawnDays ?? 999`, reset: `n.stock = NODE_DEF[n.type].stock`, `n.respawnTimer = 0`, then call `this.scene.mapManager.redrawNode(n)` and show float text `'🌱 regrown'` above the node via `this.scene.uiManager.showFloatText(n.x, n.y - 12, '🌱 regrown', '#88cc44')`.

- `large_tree` and `large_boulder` nodes should NOT respawn (omit them or set `respawnDays: 0` to disable).

---

### 13. Season name in HUD

**File:** `js/scenes/UIManager.js`, `js/config/gameConstants.js`

The HUD shows `☀ D3` or `🌙 N3`. Add a season label next to it.

- Add to `gameConstants.js`:
  ```js
  export const SEASONS = ['Spring', 'Summer', 'Autumn', 'Winter'];
  export const SEASON_DAYS = 8; // days per season
  ```
- In `UIManager.js`, import `SEASONS` and `SEASON_DAYS`. In the `updateHUD()` method (where `dayInfo.setText(...)` is called, around line 224), compute:
  ```js
  const seasonIdx = Math.floor((this.scene.day - 1) / SEASON_DAYS) % 4;
  const seasonName = SEASONS[seasonIdx];
  ```
  Append the season to the day text: `☀ D3  Spring` (or `🌙 N3  Spring`). Keep it short — no extra UI objects needed, just extend the existing `dayInfo` text string.

---

### 14. Paved road placement tool

**Files:** `js/scenes/UIManager.js`, `js/scenes/MapManager.js`, `js/scenes/GameScene.js`

Players should be able to place paved roads (`ROAD_PAVED`) by clicking tiles. Cost: 1 stone per tile.

**Game state:** Add `this.roadMode = false` to `GameScene.js` initial state.

**UIManager:** In the actions zone, add a "🛤 Road" toggle button alongside the existing material toggle. When active, `this.scene.roadMode = true`; when inactive, `false`. The button should visually toggle (highlight when active). Place it in `_renderActionsZone` — find that method and add it as a small button row. When `roadMode` is true, the build cursor should be disabled (don't start building placement).

**GameScene input:** In the map click handler (find where `pointerdown` is handled on the map), check `if (this.roadMode)`: get tile coords from click position (`tx = Math.floor(wx / TILE)`, `ty = Math.floor((wy - MAP_OY) / TILE)`), check `this.roadMap[ty]?.[tx] === ROAD_NONE`, deduct 1 stone from `this.resources.stone`, set `this.roadMap[ty][tx] = ROAD_PAVED`, call `this.mapManager.drawDesirePath(tx, ty)`.

**MapManager:** The `drawDesirePath` method already handles `ROAD_PAVED` visuals (colour `0x9a8870`, slightly larger fill). No changes needed there.

---

### 15. Idle worker pulse indicator

**File:** `js/scenes/UnitManager.js`

Workers with no role (`u.role === null`) and age ≥ 2 are idle and wasting capacity. Make them visually distinct with a slow yellow pulse on their sprite.

In `redrawUnit`, after drawing the worker body: if `u.role === null && u.age >= 2 && !u.isEnemy`, draw a small yellow circle/ring around the unit:
```js
gfx.lineStyle(1, 0xddcc22, 0.5 + 0.4 * Math.sin(Date.now() / 400))
   .strokeCircle(0, 0, 12);
```
This uses `Date.now()` for the pulse — no extra state needed. The ring disappears automatically when a role is assigned.

---

### 16. Building construction progress bar

**File:** `js/scenes/BuildingManager.js`

Buildings under construction (`b.built === false`) currently show no progress feedback. Add a progress bar above the building footprint while it's being built.

In `redrawBuilding` (or a dedicated `_drawConstructionOverlay` called from it), when `!b.built && b.buildWork !== undefined`:
- The bar should span the full building width minus a small margin
- Background: dark `0x333322`; fill: `0x88aa44`
- Progress = `1 - b.buildWork / BUILD_WORK[b.type]` (clamp 0–1)
- Position it a few pixels above the top of the building tile
- `BUILD_WORK` is already exported from `gameConstants.js` — import it in `BuildingManager.js` if not already present (check the existing imports)

---

### 17. Fog reveal from all built player buildings

**File:** `js/scenes/MapManager.js`

Currently only watchtowers have `fogRadius` in their BLDG entry and are handled in `revealFog`. Other player buildings reveal no fog, so building inside unexplored territory doesn't clear the black.

In `revealFog()` in MapManager (the method that iterates buildings and units to update `visMap`), for player buildings without an explicit `fogRadius`, add a small default reveal radius of 3 tiles. Buildings with an explicit `fogRadius` already work correctly — this just handles the fallback.

Find the line that reads `const r = BLDG[b.type]?.fogRadius ?? 10;` and change `?? 10` to `?? 3`.

(The `10` default was intended only for watchtowers but accidentally applied to all buildings. The fix is one character.)

---

### 18. Census panel — population list

**Files:** `js/scenes/UIManager.js`

Add a "👥 Census" view to the left info panel, shown when no unit or building is selected. Currently the empty-selection state shows basic resource/population stats. Replace or augment it with a scrollable population list.

Find `_renderIdleInfo` (or the method that runs when nothing is selected). Below the existing resource summary, add a section listing every living worker grouped by role. Format:

```
👥 12 citizens
Farmer  ×3
Miller  ×2
Baker   ×1
Idle    ×4
...
```

Use `this.scene.units.filter(u => !u.isEnemy && u.type === 'worker' && u.hp > 0)`. Group by `u.role ?? 'Idle'`. Sort by count descending. Render each line as a small text (9px, `#9a9077`). Cap at 10 lines to avoid overflow.

---

### 19. Tithepending + wagepending display in building panel

**File:** `js/scenes/UIManager.js`

Buildings that are producing have `b.tithePending` (first-fruits owed to the commons at dawn) and `b.wagePending` (wages owed to workers at night). These are invisible to the player right now.

In `_renderBuildingInfo`, find where `📦 ${invStr}` is rendered (around line 475). Below the inventory line, add two more lines if the values are non-zero:

- If any entries in `b.tithePending` are > 0: show `🌾 tithe: X res` in colour `#c8a030`
- If any entries in `b.wagePending` are > 0: count total wage units and show `💰 wages: X` in colour `#aac870`

Both lines should be omitted (no blank space) when their respective objects are empty or all-zero.

---

### 20. Worker nutrition bar in unit panel

**File:** `js/scenes/UIManager.js`

Workers have `u.dailyNutrition` (0.0–1.0+, how well-fed they are today). It's used for the global average but never shown per-unit.

In `_renderUnitInfo`, find where the HP bar is drawn (around line 492). Below the HP line, add a second small bar for nutrition:
- Use `_infBar` with width matching the HP bar
- Colour: green `0x44aa44` if `> 0.7`, yellow `0xddaa22` if `> 0.3`, red `0xcc3311` if lower
- Label: `FED ${Math.round(u.dailyNutrition * 100)}%` at 9px, `#666655`
- Value is `Math.min(1, u.dailyNutrition ?? 0)`

Shift all content below the HP section down by ~14px to make room.

---

### 21. Auto-save indicator

**File:** `js/scenes/UIManager.js`, `js/scenes/GameScene.js`

The game auto-saves silently. Players don't know when it saved. Add a brief "💾 saved" flash in the HUD.

In `GameScene.js`, find `_saveGame()`. After the successful `localStorage.setItem` call, call `this.uiManager.showSaveFlash?.()`.

In `UIManager.js`, add `showSaveFlash()`: create a temporary text object `'💾 saved'` at the top-right of the screen (near the day counter), colour `#88cc88`, font 9px, depth 25, that fades out over 1.5 seconds using `this.scene.tweens.add({ targets: txt, alpha: 0, duration: 1500, onComplete: () => txt.destroy() })`. Don't add it to `_ui()` cleanup — the tween destroys it.

---

### 22. Per-building `isPublic` shown clearly in info panel

**File:** `js/scenes/UIManager.js`

The `isPublic` toggle button exists in the building info panel but there's no clear label showing the current ownership status to the player. Public buildings pay state wages; private buildings don't.

In `_renderBuildingInfo`, near the top of the panel (after the building label and desc), add a small ownership badge:
- If `b.isPublic`: show `[STATE]` in colour `#c8a030`  
- If `!b.isPublic` and not a house: show `[PRIVATE]` in colour `#6a5840`
- Houses: skip (they're always private, no need to label)

Font 8px. Position it on the right side of the same line as the building label, right-aligned. Use `setOrigin(1, 0)` on the text object so it's flush with the right edge of the panel.
