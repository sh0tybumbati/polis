import { TILE, MAP_OY } from '../../config/gameConstants.js';
import { UNITS } from '../../content/units/index.js';

export default {
    _isUnitCulled(u) {
        // Enemy units only appear in tiles the player can currently see (vis=2).
        // Explored (vis=1) and unexplored (vis=0) tiles hide them completely.
        if (u.isEnemy) {
            const tx = Math.floor(u.x / TILE);
            const ty = Math.floor((u.y - MAP_OY) / TILE);
            if ((this.scene.visMap[ty]?.[tx] ?? 0) < 2) {
                u.gfx.setVisible(false);
                if (u.nameLabel) u.nameLabel.setVisible(false);
                return true;
            }
        }

        // Viewport culling: skip redraw for units outside the camera view.
        // Margin allows for large sprites and the selection oval to fade in cleanly.
        const wv = this.scene.cameras.main.worldView;
        const M  = 64;
        if (u.x < wv.left - M || u.x > wv.right  + M ||
            u.y < wv.top  - M || u.y > wv.bottom  + M) {
            u.gfx.setVisible(false);
            if (u.nameLabel) u.nameLabel.setVisible(false);
            return true;
        }

        u.gfx.setVisible(true);
        if (u.nameLabel) u.nameLabel.setVisible(true);
        return false;
    },

    _redrawSelections() {
        this.selGfx.clear();
        for (const u of this.scene.units) {
            if (!u.selected || u.hp <= 0 || !u.gfx.visible) continue;
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
            if (u.isEnemy || u.type !== 'worker' || (u.age ?? 2) < 2 || u.role || u.hp <= 0 || !u.gfx.visible) continue;
            const scale = this._ageScale(u.age ?? 2);
            this.idleGfx.lineStyle(1.5, 0xddcc44, alpha)
                .strokeEllipse(u.x, u.y + 7 * scale, 26 * scale, 11 * scale);
        }
    },

    // Instance-method version of the static ageScale (used internally by mixins).
    // The static UnitManager.ageScale is kept on the class for external callers.
    _ageScale(age) {
        if (age === 0) return 0.48;
        if (age === 1) return 0.72;
        return 1.0;
    },

    redrawUnit(u) {
        const age   = u.age ?? 2;
        const scale = this._ageScale(age);

        u.gfx.clear().setPosition(u.x, u.y);

        // Shadow ellipse — scales with unit size
        u.gfx.fillStyle(0x000000, 0.18)
             .fillEllipse(0, 9 * scale, 22 * scale, 7 * scale);

        // Sleeping ZZZ label — create/destroy on transition, bob each frame
        if (u.isSleeping && u.hp > 0) {
            if (!u._zzzLabel) {
                u._zzzLabel = this.scene._w(this.scene.add.text(u.x, u.y - 14, 'z z z', {
                    fontFamily: 'monospace', fontSize: '8px',
                    color: u._passedOut ? '#ff8866' : '#aabbff',
                    stroke: '#000000', strokeThickness: 1,
                }).setOrigin(0.5, 1).setDepth(7));
                u._zzzPhase = Math.random() * Math.PI * 2; // stagger units
            }
            u._zzzPhase = (u._zzzPhase ?? 0) + 0.04;
            const bob = Math.sin(u._zzzPhase) * 3;
            u._zzzLabel.setPosition(u.x, u.y - 14 + bob)
                       .setAlpha(0.55 + Math.sin(u._zzzPhase * 0.7) * 0.35)
                       .setVisible(true);
        } else if (u._zzzLabel) {
            u._zzzLabel.destroy(); u._zzzLabel = null;
        }

        const showLabel = age < 2 && !u.isEnemy && u.hp > 0;
        if (showLabel) {
            if (!u.nameLabel) {
                u.nameLabel = this.scene._w(this.scene.add.text(u.x, u.y - 12, u.name, {
                    fontSize: '7px', color: '#ffeecc', fontFamily: 'monospace',
                    stroke: '#000000', strokeThickness: 1,
                }).setOrigin(0.5, 1).setDepth(7));
            }
        } else if (u.nameLabel) {
            u.nameLabel.destroy(); u.nameLabel = null;
        }

        const zoom = this.scene.cameras.main.zoom;
        const lod  = zoom < 0.20 ? 0 : zoom < 0.50 ? 1 : zoom < 1.50 ? 2 : 3;
        UNITS[u.type]?.draw(u.gfx, u, { totalCarrying: u => this.totalCarrying(u), lod, ageScale: scale });

        // Task progress bar — shown above unit when actively working
        const TASK_MAX = {
            plant_grow: 3000, harvest_grow: 2000, plant: 6000,
            build: 25, repair: 25, deconstruct: 25,
            workshop: null, zone_workshop: null,
        };
        const hasMax = Object.prototype.hasOwnProperty.call(TASK_MAX, u.taskType);
        if (hasMax && (u.workProgress ?? 0) > 0 && u.hp > 0) {
            const maxVal = TASK_MAX[u.taskType];
            const fraction = maxVal !== null
                ? Math.min(1, u.workProgress / maxVal)
                : null;
            const bw = 20 * scale, bh = 2.5 * scale;
            const bx = -bw / 2, by = -16 * scale;
            u.gfx.fillStyle(0x000000, 0.45).fillRect(bx - 0.5, by - 0.5, bw + 1, bh + 1);
            u.gfx.fillStyle(0x334455, 0.7).fillRect(bx, by, bw, bh);
            if (fraction !== null) {
                u.gfx.fillStyle(0x55ddaa, 1.0).fillRect(bx, by, bw * fraction, bh);
            } else {
                // Indeterminate — animated stripe
                const phase = (Date.now() % 1200) / 1200;
                u.gfx.fillStyle(0x55ddaa, 0.8).fillRect(bx + bw * phase - 4, by, 6, bh);
            }
        }
    },
};
