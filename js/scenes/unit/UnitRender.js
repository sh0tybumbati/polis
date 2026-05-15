import { TILE, MAP_OY } from '../../config/gameConstants.js';
import { UNITS } from '../../content/units/index.js';

export default {
    _isUnitCulled(u) {
        // Enemy units only appear in tiles the player can currently see (vis=2).
        if (u.isEnemy) {
            const tx = Math.floor(u.x / TILE);
            const ty = Math.floor((u.y - MAP_OY) / TILE);
            if ((this.scene.visMap[ty]?.[tx] ?? 0) < 2) {
                u._visible = false;
                if (u.nameLabel) u.nameLabel.setVisible(false);
                if (u._zzzLabel) u._zzzLabel.setVisible(false);
                return true;
            }
        }

        // Viewport culling with margin for large sprites / selection oval.
        const wv = this.scene.cameras.main.worldView;
        const M  = 64;
        if (u.x < wv.left - M || u.x > wv.right  + M ||
            u.y < wv.top  - M || u.y > wv.bottom  + M) {
            u._visible = false;
            if (u.nameLabel) u.nameLabel.setVisible(false);
            if (u._zzzLabel) u._zzzLabel.setVisible(false);
            return true;
        }

        u._visible = true;
        if (u.nameLabel) u.nameLabel.setVisible(true);
        return false;
    },

    // Single shared Graphics pass — clears once and draws every visible unit.
    _redrawAllUnits() {
        const gfx = this.scene.unitsGfx;
        gfx.clear();
        for (const u of this.scene.units) {
            const alpha = u._alpha ?? 1;
            if (alpha <= 0.01) continue;
            // Draw dying units regardless of visibility; skip non-visible alive units.
            if (!u._dying && !u._visible) continue;
            this._drawUnit(gfx, u, alpha);
        }
    },

    _drawUnit(gfx, u, alpha = 1) {
        const age   = u.age ?? 2;
        const scale = this._ageScale(age);
        const ox = u.x, oy = u.y;

        // Shadow ellipse
        gfx.fillStyle(0x000000, 0.18 * alpha)
           .fillEllipse(ox, oy + 9 * scale, 22 * scale, 7 * scale);

        // ZZZ label — still a separate Text object, just positioned here
        if (u.isSleeping && u.hp > 0) {
            if (!u._zzzLabel) {
                u._zzzLabel = this.scene._w(this.scene.add.text(0, 0, 'Zzz', {
                    fontFamily: 'Georgia, serif', fontSize: '11px',
                    color: u._passedOut ? '#ff8866' : '#aaccff',
                    stroke: '#000000', strokeThickness: 2,
                }).setOrigin(0.5, 1).setDepth(8));
                u._zzzPhase = Math.random() * Math.PI * 2;
            }
            u._zzzPhase = (u._zzzPhase ?? 0) + 0.04;
            const bob = Math.sin(u._zzzPhase) * 3;
            const yOff = u.isInside ? -(TILE * 1.5) : -18;
            u._zzzLabel.setPosition(ox + 6, oy + yOff + bob)
                       .setAlpha((0.7 + Math.sin(u._zzzPhase * 0.7) * 0.25) * alpha)
                       .setVisible(true);
        } else if (u._zzzLabel) {
            u._zzzLabel.destroy(); u._zzzLabel = null;
        }

        // Name label for young units
        const showLabel = (age < 2) && !u.isEnemy && u.hp > 0;
        if (showLabel) {
            if (!u.nameLabel) {
                u.nameLabel = this.scene._w(this.scene.add.text(ox, oy - 12, u.name, {
                    fontSize: '7px', color: '#ffeecc', fontFamily: 'monospace',
                    stroke: '#000000', strokeThickness: 1,
                }).setOrigin(0.5, 1).setDepth(7));
            }
            u.nameLabel.setPosition(ox, oy - 12).setAlpha(alpha);
        } else if (u.nameLabel) {
            u.nameLabel.destroy(); u.nameLabel = null;
        }

        const zoom = this.scene.cameras.main.zoom;
        const lod  = zoom < 0.20 ? 0 : zoom < 0.50 ? 1 : zoom < 1.50 ? 2 : 3;
        UNITS[u.type]?.draw(gfx, u, {
            totalCarrying: u => this.totalCarrying(u),
            lod, ageScale: scale, ox, oy,
        });

        this._drawProgressBar(gfx, u, scale, ox, oy, alpha);
    },

    _redrawSelections() {
        this.selGfx.clear();
        for (const u of this.scene.units) {
            if (!u.selected || u.hp <= 0 || !u._visible) continue;
            const scale = this._ageScale(u.age ?? 2);
            const w = 22 * scale, h = 9 * scale;
            this.selGfx.fillStyle(0x44dd55, 0.28).fillEllipse(u.x, u.y + 7 * scale, w, h);
            this.selGfx.lineStyle(1, 0x55ff66, 0.75).strokeEllipse(u.x, u.y + 7 * scale, w, h);
        }
    },

    _redrawIdlePulse(time) {
        this.idleGfx.clear();
        const alpha = 0.15 + 0.22 * Math.abs(Math.sin(time * 0.0018));
        for (const u of this.scene.units) {
            if (u.isEnemy || u.type !== 'worker' || (u.age ?? 2) < 2 || u.role || u.hp <= 0 || !u._visible) continue;
            const scale = this._ageScale(u.age ?? 2);
            this.idleGfx.lineStyle(1.5, 0xddcc44, alpha)
                .strokeEllipse(u.x, u.y + 7 * scale, 26 * scale, 11 * scale);
        }
    },

    _ageScale(age) {
        if (age === 0) return 0.48;
        if (age === 1) return 0.72;
        return 1.0;
    },

    // Kept for compatibility — individual redraws now route through _redrawAllUnits.
    // Called at spawn and on forced state changes before the next full-batch pass.
    redrawUnit(u) { /* no-op; rendering happens in _redrawAllUnits each frame */ },

    _drawProgressBar(gfx, u, scale, ox, oy, alpha = 1) {
        if (u.hp <= 0 || u.isSleeping) return;

        let fraction = null;
        let show = false;

        const n = u.targetNode;
        if (n && (u.workProgress ?? 0) > 0) {
            const isTree = n.type === 'small_tree' || n.type === 'large_tree';
            if (isTree && !n.felled && n.fellWork !== undefined) {
                const max = n.type === 'large_tree' ? 5.0 : 5.0;
                fraction = Math.min(1, 1 - n.fellWork / max);
            } else {
                const threshold = isTree ? 2.0 : (n.type === 'berry_bush' ? 1.0 : 3.0);
                fraction = Math.min(1, u.workProgress / threshold);
            }
            show = true;
        }

        if (!show) {
            const TASK_MAX = {
                plant_grow: 1.0, harvest_grow: 2.0, plant: 6.0,
                build: 25, repair: 25, deconstruct: 25,
            };
            if (Object.prototype.hasOwnProperty.call(TASK_MAX, u.taskType) && (u.workProgress ?? 0) > 0) {
                fraction = Math.min(1, u.workProgress / TASK_MAX[u.taskType]);
                show = true;
            } else if ((u.taskType === 'workshop' || u.taskType === 'zone_workshop') && (u.workProgress ?? 0) > 0) {
                fraction = null;
                show = true;
            }
        }

        if (!show) return;

        const bw = 20 * scale, bh = 2.5 * scale;
        const bx = ox - bw / 2, by = oy - 16 * scale;
        gfx.fillStyle(0x000000, 0.45 * alpha).fillRect(bx - 0.5, by - 0.5, bw + 1, bh + 1);
        gfx.fillStyle(0x334455, 0.7 * alpha).fillRect(bx, by, bw, bh);
        if (fraction !== null) {
            gfx.fillStyle(0x55ddaa, alpha).fillRect(bx, by, bw * fraction, bh);
        } else {
            const phase = (Date.now() % 1200) / 1200;
            gfx.fillStyle(0x55ddaa, 0.8 * alpha).fillRect(bx + bw * phase - 4, by, 6, bh);
        }
    },
};
