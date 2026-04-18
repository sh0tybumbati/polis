# Polis — Game Design Document

> A Pyramida-inspired RTS set in classical Greece. Build your city-state by day. Hold the line at night.

---

## Concept

You control a Greek city-state (polis) over a series of seasons. Each season has two phases:

- **Build Phase** — gather resources, construct buildings, train and position troops
- **Wave Phase** — a threat arrives from the east; hold the gate or fall

The game progresses through 3+ seasons per run, with growing threats each wave. The core differentiator from a standard tower-defense is the **formation system**: units don't fight automatically — you place them in tactical formations (phalanx, wedge, skirmisher screen) before and during battle.

---

## Influences

| Game | What we borrow |
|---|---|
| **Pyramida** (Sokpop) | Day/night survival loop, resource→build→defend rhythm, wave-based goal |
| **The Hot Gates GDD** | Greek city-state setting, phalanx mechanics, era progression, Greek pottery aesthetic |
| **Into the Breach** | Small-scale tactical positioning with high stakes per unit |

---

## Core Loop

```
Season start
  → Build Phase (timer)
      → Place farms, barracks, walls
      → Train hoplites
      → Position units in formation
  → Wave Phase
      → Raiders/Persians/rival polis attacks from east
      → Units auto-attack in range; player adjusts formation in real-time
      → All enemies defeated → season complete
      → Any enemy reaches the gate → GAME OVER
  → Season end rewards (bonus resources, new building unlocks)
  → Next season
```

---

## Formations

Formations are the mechanical heart of the game. Right-click to set a formation target:

| Formation | Shape | Strengths | Weaknesses |
|---|---|---|---|
| **Phalanx** | Vertical line | High frontal HP, slows enemy advance | Weak flanks, slow |
| **Wedge** | V-shape | Punches through weak center | Vulnerable if flanked |
| **Skirmisher Screen** | Wide sparse line | Covers flanks, harasses | Low HP, retreats easily |
| **Tortoise** | Tight box | Resists ranged attacks | Very slow movement |

Multiplayer: each player controls one flank or one unit type. Co-op phalanx coordination is the core social mechanic.

---

## Progression

### Season Tiers

| Seasons | Tier | Scale | Building Unlocks |
|---|---|---|---|
| 1–3 | Village | 5–15 units, small raids | Farm, Barracks, Wall |
| 4–7 | Polis | 20–40 units, rival city-states | Agora, Temple, Gymnasium |
| 8–12 | Hegemony | 100+ units (formation blocks), Persian Wars | Harbor, Siege Workshop, Oracle |

### Building Tree (MVP Tier 1)

- **Farm** (2×2) — produces +2 food per season
- **Barracks** (2×2) — enables hoplite training
- **Wall** (1×1) — blocks enemy movement

---

## Units

### Player

| Unit | HP | ATK | Speed | Cost | Formation role |
|---|---|---|---|---|---|
| Hoplite | 4 | 1 | Medium | 3 food | Phalanx line |
| Archer (S2) | 2 | 1 ranged | Fast | 4 food | Skirmisher screen |
| Cavalry (S3) | 5 | 2 | Fast | 8 food | Flanking wedge |

### Enemy (Season 1)

| Unit | HP | ATK | Speed | Behavior |
|---|---|---|---|---|
| Raider | 3 | 1 | Fast | March left, attack nearest |
| Berserker (S2) | 5 | 2 | Medium | Charge highest-HP target |
| War Elephant (S3) | 12 | 3 | Slow | Trample formation, area damage |

---

## Resources

| Resource | Source | Used for |
|---|---|---|
| Food | Farm (+2/season), base harvest | Train units |
| Stone | Season bonus, Quarry | Build structures |
| Gold (S2+) | Agora, trade routes | Hire mercenaries, upgrades |

---

## Win/Lose Conditions

- **Win**: Survive all seasons of the current era (3 seasons in MVP)
- **Lose**: Any enemy unit reaches the gate (left edge of map)
- **Future**: Era victory conditions (build Wonder, defeat rival polis, survive Persian invasion)

---

## Visual Direction

- **Style**: Top-down, 32×32 pixel tiles, gameboy-influenced palette
- **Color palette**: Earthy greens, sandstone yellows, Aegean blue accents
- **UI**: Dark navy panels, gold (`#c8a030`) accents, monospace font
- **Animations**: Minimal — flash on hit, fade on death, screen shake for large impacts

---

## Multiplayer (Phase 2)

- 2–4 players, co-op default
- Each player controls a different unit type or map flank
- Shared resource pool OR separate city-states in a league
- Colyseus rooms with server-authoritative state
- Reconnection support

---

## Tech Stack

| Layer | Tech |
|---|---|
| Client rendering | Phaser 3 (CDN, no build step) |
| Game logic (SP) | Phaser scene classes, vanilla JS |
| Multiplayer server | Colyseus (Node.js) |
| State sync | @colyseus/schema |
| Hosting | GitHub Pages (client) + Render/Railway (server) |
