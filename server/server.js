/**
 * Polis — Colyseus multiplayer server (skeleton)
 * Run: node server.js
 * Clients connect to ws://localhost:2567
 */

const http     = require('http');
const express  = require('express');
const { Server, Room } = require('colyseus');
const { Schema, type, MapSchema } = require('@colyseus/schema');

// ─── State schemas ────────────────────────────────────────────────────────────

class UnitState extends Schema {}
type('number')(UnitState.prototype, 'x');
type('number')(UnitState.prototype, 'y');
type('number')(UnitState.prototype, 'hp');
type('string')(UnitState.prototype, 'unitType');
type('boolean')(UnitState.prototype, 'isEnemy');
type('string')(UnitState.prototype, 'ownerId');

class PolisState extends Schema {}
type({ map: () => UnitState })(PolisState.prototype, 'units');
type('number')(PolisState.prototype, 'season');
type('string')(PolisState.prototype, 'phase');
type('number')(PolisState.prototype, 'timerMs');

// ─── Game Room ────────────────────────────────────────────────────────────────

class PolisRoom extends Room {
  maxClients = 4;

  onCreate(options) {
    this.setState(new PolisState({
      units: new MapSchema(),
      season: 1,
      phase: 'BUILD',
      timerMs: 50000,
    }));

    this.onMessage('move', (client, data) => {
      // { unitIds: [], targetX, targetY }
      // TODO: validate ownership, calculate formation slots, broadcast
      console.log(`[move] client=${client.sessionId}`, data);
    });

    this.onMessage('placeBuilding', (client, data) => {
      // { type, tx, ty }
      console.log(`[building] client=${client.sessionId}`, data);
    });

    this.onMessage('trainUnit', (client, data) => {
      // { type }
      console.log(`[train] client=${client.sessionId}`, data);
    });

    // Game loop — tick every 100ms
    this.clock.setInterval(() => this.tick(), 100);

    console.log('PolisRoom created:', this.roomId);
  }

  tick() {
    if (this.state.phase === 'BUILD') {
      this.state.timerMs -= 100;
      if (this.state.timerMs <= 0) {
        this.state.phase = 'COMBAT';
        this.broadcast('phaseChange', { phase: 'COMBAT', season: this.state.season });
      }
    }
    // TODO: server-authoritative unit movement + combat
  }

  onJoin(client, options) {
    console.log(`${client.sessionId} joined. Players: ${this.clients.length}`);
    client.send('welcome', { sessionId: client.sessionId, season: this.state.season });
  }

  onLeave(client) {
    console.log(`${client.sessionId} left.`);
  }

  onDispose() {
    console.log('PolisRoom disposed:', this.roomId);
  }
}

// ─── Server setup ─────────────────────────────────────────────────────────────

const app    = express();
const server = http.createServer(app);
const gameServer = new Server({ server });

gameServer.define('polis', PolisRoom);

// Serve static client files (optional, for single-server deploys)
app.use(express.static('../'));

const PORT = process.env.PORT || 8080;
gameServer.listen(PORT).then(() => {
  console.log(`Polis server listening on ws://localhost:${PORT}`);
  console.log(`Colyseus monitor: http://localhost:${PORT}/colyseus`);
});
