# Graph Report - .  (2026-05-26)

## Corpus Check
- 177 files · ~434,672 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 978 nodes · 1651 edges · 63 communities (26 shown, 37 thin omitted)
- Extraction: 98% EXTRACTED · 2% INFERRED · 0% AMBIGUOUS · INFERRED: 28 edges (avg confidence: 0.84)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Unit Worker AI|Unit Worker AI]]
- [[_COMMUNITY_Construct Manager|Construct Manager]]
- [[_COMMUNITY_Asset & Config Loading|Asset & Config Loading]]
- [[_COMMUNITY_Design Documents|Design Documents]]
- [[_COMMUNITY_Game Scene Orchestration|Game Scene Orchestration]]
- [[_COMMUNITY_Materials & Constructs Catalog|Materials & Constructs Catalog]]
- [[_COMMUNITY_Biome & Tile Data|Biome & Tile Data]]
- [[_COMMUNITY_World Manager & Dynastic Logic|World Manager & Dynastic Logic]]
- [[_COMMUNITY_Zone Manager|Zone Manager]]
- [[_COMMUNITY_UI Manager|UI Manager]]
- [[_COMMUNITY_Game Constants|Game Constants]]
- [[_COMMUNITY_Item Definitions|Item Definitions]]
- [[_COMMUNITY_Animals & Pasture|Animals & Pasture]]
- [[_COMMUNITY_Building Definitions|Building Definitions]]
- [[_COMMUNITY_Job Scoring (Crafts)|Job Scoring (Crafts)]]
- [[_COMMUNITY_Traits & Unit Info Panel|Traits & Unit Info Panel]]
- [[_COMMUNITY_Multiplayer Server|Multiplayer Server]]
- [[_COMMUNITY_Economy Manager|Economy Manager]]
- [[_COMMUNITY_Military Unit Types|Military Unit Types]]
- [[_COMMUNITY_Unit Manager & Succession|Unit Manager & Succession]]
- [[_COMMUNITY_Genetics & Phenotype Blending|Genetics & Phenotype Blending]]
- [[_COMMUNITY_Chunk Map Generation|Chunk Map Generation]]
- [[_COMMUNITY_Changelog & GDD Concepts|Changelog & GDD Concepts]]
- [[_COMMUNITY_Sprite Editor Scene|Sprite Editor Scene]]
- [[_COMMUNITY_Job Scoring (Food Production)|Job Scoring (Food Production)]]
- [[_COMMUNITY_Unit Movement|Unit Movement]]
- [[_COMMUNITY_Map Manager|Map Manager]]
- [[_COMMUNITY_Server Dependencies|Server Dependencies]]
- [[_COMMUNITY_Jobs & Unit Needs|Jobs & Unit Needs]]
- [[_COMMUNITY_Render Shapes Engine|Render Shapes Engine]]
- [[_COMMUNITY_UI Panel|UI Panel]]
- [[_COMMUNITY_Unit Renderer|Unit Renderer]]
- [[_COMMUNITY_Items & UI Modals|Items & UI Modals]]
- [[_COMMUNITY_Game State Manager|Game State Manager]]
- [[_COMMUNITY_Unit Combat & Formations|Unit Combat & Formations]]
- [[_COMMUNITY_Pathfinder|Pathfinder]]
- [[_COMMUNITY_Game Logger|Game Logger]]
- [[_COMMUNITY_Beads Metadata|Beads Metadata]]
- [[_COMMUNITY_Sprite Editor Assets|Sprite Editor Assets]]
- [[_COMMUNITY_Agent & Beads Workflow|Agent & Beads Workflow]]
- [[_COMMUNITY_Watchtower|Watchtower]]
- [[_COMMUNITY_Claude Settings & Hooks|Claude Settings & Hooks]]
- [[_COMMUNITY_Wildlife & Pasture Concepts|Wildlife & Pasture Concepts]]
- [[_COMMUNITY_Farm Building|Farm Building]]
- [[_COMMUNITY_Garden Building|Garden Building]]
- [[_COMMUNITY_Agora Building|Agora Building]]
- [[_COMMUNITY_Archery Grounds|Archery Grounds]]
- [[_COMMUNITY_Camp Building|Camp Building]]
- [[_COMMUNITY_Gate Building|Gate Building]]
- [[_COMMUNITY_House Building|House Building]]
- [[_COMMUNITY_Melee Grounds|Melee Grounds]]
- [[_COMMUNITY_Mine Building|Mine Building]]
- [[_COMMUNITY_Mounted Grounds|Mounted Grounds]]
- [[_COMMUNITY_Oracle Building|Oracle Building]]
- [[_COMMUNITY_Palisade Building|Palisade Building]]
- [[_COMMUNITY_Temple Building|Temple Building]]
- [[_COMMUNITY_Town Hall Building|Town Hall Building]]
- [[_COMMUNITY_Wall Building|Wall Building]]
- [[_COMMUNITY_Resource Physics & Growth|Resource Physics & Growth]]
- [[_COMMUNITY_Tech Stack & Entry Point|Tech Stack & Entry Point]]
- [[_COMMUNITY_Menu Sky Assets|Menu Sky Assets]]
- [[_COMMUNITY_Kepos Crops|Kepos Crops]]

## God Nodes (most connected - your core abstractions)
1. `ConstructManager` - 59 edges
2. `GameScene` - 46 edges
3. `UIManager` - 33 edges
4. `tickWorker()` - 33 edges
5. `ZoneManager` - 32 edges
6. `WorldManager` - 31 edges
7. `UnitManager` - 26 edges
8. `EconomyManager` - 22 edges
9. `ChunkManager` - 20 edges
10. `SpriteEditorScene` - 20 edges

## Surprising Connections (you probably didn't know these)
- `Background Splash: Greek Temple at Dawn (Title Screen)` --conceptually_related_to--> `Civilization Selection (Sumeria vs Ancient Greece)`  [INFERRED]
  assets/images/background_splash.png → GDD.md
- `Infinite Chunk-Based Map System` --semantically_similar_to--> `Milestone 11: Procedural World (Chunk-Based Generation)`  [INFERRED] [semantically similar]
  CHANGELOG.md → PLANNING.md
- `MenuScene Visual Redesign` --references--> `Menu Sun: Glowing Yellow-White Orb`  [INFERRED]
  CHANGELOG.md → assets/images/menu/sun.png
- `White Pixel Technique (Single-Texture GPU Batching)` --semantically_similar_to--> `Blitter-Based Fog Rendering`  [INFERRED] [semantically similar]
  docs/render-optimization.md → CHANGELOG.md
- `Menu Foreground: Ziggurat and Greek Temple at Horizon` --conceptually_related_to--> `Civilization Selection (Sumeria vs Ancient Greece)`  [INFERRED]
  assets/images/menu/foreground.png → GDD.md

## Hyperedges (group relationships)
- **MenuScene Layered Visual Composition (Sky, Sun, Sunrays, Foreground, Constellations)** — img_menu_sky, img_menu_sun, img_menu_sunrays, img_menu_foreground, img_menu_constellations, changelog_menu_visual_redesign [INFERRED 0.85]
- **Freeform Building Triad (Walls + Furniture + Zones → Buildings)** — gdd_wall_system, gdd_furniture_appliances, gdd_zone_layers, gdd_estate_oikos, docs_freeform_building_system [EXTRACTED 1.00]
- **Render Optimization Pass (Blitter Fog + RenderTexture Chunks + Shared Unit Graphics)** — docs_render_p2_fog_blitter, docs_render_p3_rendertexture, docs_render_p4_shared_graphics, changelog_shared_unit_graphics, changelog_blitter_fog, changelog_rendertexture_chunks [EXTRACTED 1.00]

## Communities (63 total, 37 thin omitted)

### Community 0 - "Unit Worker AI"
Cohesion: 0.06
Nodes (55): _autoPlaceWorkshop(), _canAccessConstruct(), _DEPOSIT_ROUTES, _depositRoutes(), _dequeueTask(), _doProcessTick(), _FETCH_SOURCES, _fetchSources() (+47 more)

### Community 2 - "Asset & Config Loading"
Cohesion: 0.06
Nodes (14): AssetManager, GAME_CONFIG, SCENE_KEYS, game, BootScene, CIVS, CivSelectScene, EndScene (+6 more)

### Community 3 - "Design Documents"
Cohesion: 0.05
Nodes (47): Blitter-Based Fog Rendering, Food Chain Buildings (Mill, Bakery, Butcher), Infinite Chunk-Based Map System, RenderTexture Chunk Terrain Baking, Single Shared Unit Graphics Batch, Build Menu Structure (Civil, Industry, Military, Furnish, Zones, Debug), Freeform Building System Design Spec, Grow Zones (BFS-Connected Crop Assignment) (+39 more)

### Community 5 - "Materials & Constructs Catalog"
Cohesion: 0.07
Nodes (24): MATERIAL_COLORS, MATERIAL_LABELS, CONSTRUCT_CATS, CROPS, SLOT_POS, InputManager, ITEM_COL, ZONE_STYLE (+16 more)

### Community 6 - "Biome & Tile Data"
Cohesion: 0.09
Nodes (9): BIOME_A, BIOME_B, TILE_A, TILE_B, defs, NODES, tickEnemy(), tickEnemyWorker() (+1 more)

### Community 10 - "Game Constants"
Cohesion: 0.11
Nodes (22): APPLIANCE_DEF, CONSTRUCT_VOLUME, _EYE, FM_LABELS, FM_TYPES, GREEK_FAMILY_NAMES, GREEK_NAMES_F, GREEK_NAMES_M (+14 more)

### Community 12 - "Animals & Pasture"
Cohesion: 0.11
Nodes (5): ANIMALS, defs, draw(), g(), NatureManager

### Community 15 - "Traits & Unit Info Panel"
Cohesion: 0.17
Nodes (22): TRAITS, computeBuildCost(), _attrLine(), _infPhenotype(), _renderConstructDetailInfo(), _renderConstructInfo(), _renderConstructInventory(), _renderConstructQueue() (+14 more)

### Community 16 - "Multiplayer Server"
Cohesion: 0.09
Nodes (16): app, counts, express, gameServer, http, limit, LOG_RING, PolisRoom (+8 more)

### Community 20 - "Genetics & Phenotype Blending"
Cohesion: 0.15
Nodes (14): ARCHON_BUILD_ORDER, blendAttributes(), blendPassions(), blendPhenotype(), blendTraits(), emptySkills(), _pick(), pickName() (+6 more)

### Community 22 - "Changelog & GDD Concepts"
Cohesion: 0.15
Nodes (17): Enemy Polis Mirror Economy Simulation, MenuScene Visual Redesign, Survival Mode Open-Ended City Builder, Ancient Greece Civilization (Classical Civic Management), Civilization Selection (Sumeria vs Ancient Greece), Epochs: The Dawn Game Design Document, Shared Simulation Engine (Both Civilizations), Sumeria Civilization (Bronze Age Survival) (+9 more)

### Community 24 - "Job Scoring (Food Production)"
Cohesion: 0.24
Nodes (8): score(), score(), score(), score(), score(), score(), score(), workshopScore()

### Community 25 - "Unit Movement"
Cohesion: 0.20
Nodes (8): TILE_SPD, canUnitCarryMore(), _destroyConstruct(), getUnitCarryVolume(), getUnitCarryWeight(), getUnitMaxVolume(), getUnitMaxWeight(), moveToward()

### Community 27 - "Server Dependencies"
Cohesion: 0.15
Nodes (12): dependencies, colyseus, express, description, devDependencies, nodemon, main, name (+4 more)

### Community 28 - "Jobs & Unit Needs"
Cohesion: 0.20
Nodes (4): JOBS, WORKSHOP_JOBS, assignVocation(), tickChild()

### Community 29 - "Render Shapes Engine"
Cohesion: 0.24
Nodes (5): renderShapes(), res(), SC, draw(), SHAPES

### Community 31 - "Unit Renderer"
Cohesion: 0.33
Nodes (7): _ageScale(), _drawProgressBar(), _drawUnit(), _getNeedIcon(), _redrawAllUnits(), _redrawIdlePulse(), _redrawSelections()

### Community 32 - "Items & UI Modals"
Cohesion: 0.25
Nodes (3): ITEMS, floatText(), showFloatText()

### Community 34 - "Unit Combat & Formations"
Cohesion: 0.39
Nodes (7): applyFormation(), drawFmDragPreview(), getFormationPositions(), moveSelectedTo(), _phalanxPos(), _screenPos(), _wedgePos()

### Community 37 - "Beads Metadata"
Cohesion: 0.33
Nodes (5): backend, database, dolt_database, dolt_mode, project_id

### Community 38 - "Sprite Editor Assets"
Cohesion: 0.33
Nodes (5): PALETTE, VAR_FILLS, WHEN_KEYS, WHEN_PRESETS, UNITS

### Community 39 - "Agent & Beads Workflow"
Cohesion: 0.40
Nodes (5): Beads Issue Tracking Workflow, Non-Interactive Shell Command Rules, Mandatory Session Completion Workflow, Beads Configuration (config.yaml), Beads Issue Tracker (AI-Native CLI Tool)

### Community 40 - "Watchtower"
Cohesion: 0.50
Nodes (3): draw(), g(), RANGED

### Community 41 - "Claude Settings & Hooks"
Cohesion: 0.50
Nodes (3): hooks, PreCompact, SessionStart

### Community 42 - "Wildlife & Pasture Concepts"
Cohesion: 0.50
Nodes (4): Gender-Aware Pasture System, Scrub Vegetation and Wildlife Foraging, Pasture and Shepherd System, Wildlife System (Deer and Wild Sheep)

## Knowledge Gaps
- **103 isolated node(s):** `database`, `backend`, `dolt_mode`, `dolt_database`, `project_id` (+98 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **37 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `ConstructManager` connect `Construct Manager` to `Game Constants`?**
  _High betweenness centrality (0.091) - this node is a cross-community bridge._
- **Why does `GameScene` connect `Game Scene Orchestration` to `Asset & Config Loading`?**
  _High betweenness centrality (0.074) - this node is a cross-community bridge._
- **Why does `ZoneManager` connect `Zone Manager` to `Materials & Constructs Catalog`?**
  _High betweenness centrality (0.053) - this node is a cross-community bridge._
- **What connects `database`, `backend`, `dolt_mode` to the rest of the system?**
  _105 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Unit Worker AI` be split into smaller, more focused modules?**
  _Cohesion score 0.060285563194077206 - nodes in this community are weakly interconnected._
- **Should `Construct Manager` be split into smaller, more focused modules?**
  _Cohesion score 0.07130333138515488 - nodes in this community are weakly interconnected._
- **Should `Asset & Config Loading` be split into smaller, more focused modules?**
  _Cohesion score 0.06207482993197279 - nodes in this community are weakly interconnected._