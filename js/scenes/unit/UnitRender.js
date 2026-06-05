import { TILE, MAP_OY } from '../../config/gameConstants.js';
import { UNITS } from '../../content/units/index.js';
import { THEME } from '../../ui/UIKit.js';

export default {
    _isUnitCulled(u) {
        // Enemy units only appear in tiles the player can currently see (vis=2).
        if (u.isEnemy) {
            const tx = Math.floor(u.x / TILE);
            const ty = Math.floor((u.y - MAP_OY) / TILE);
            if ((this.scene.visMap.get(`${tx},${ty}`) ?? 0) < 2) {
                u._visible = false;
                if (u.nameLabel) u.nameLabel.setVisible(false);
                if (u._zzzLabel) u._zzzLabel.setVisible(false);
                if (u._needLabel) u._needLabel.setVisible(false);
                if (u._mbLabel) u._mbLabel.setVisible(false);
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
            if (u._needLabel) u._needLabel.setVisible(false);
            if (u._mbLabel) u._mbLabel.setVisible(false);
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

        const isSleepingDown = u.isSleeping && (u.isInside || !!u._sleepConstructId);
        const isCorpse = !!u._corpse;

        // Shadow ellipse — skip when lying down (worker.js draws its own horizontal shadow)
        if (!isSleepingDown && !isCorpse) {
            gfx.fillStyle(0x000000, 0.18 * alpha)
               .fillEllipse(ox, oy + 9 * scale, 22 * scale, 7 * scale);
        }

        // ZZZ label — still a separate Text object, just positioned here
        if (u.isSleeping && u.hp > 0 && this.scene.showNeeds !== false) {
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

        // Need indicator — highest-priority critical need when awake
        const needIcon = !u.isSleeping && u.hp > 0 && !u.isEnemy && this.scene.showNeeds !== false ? this._getNeedIcon(u) : null;
        if (needIcon) {
            if (!u._needLabel || u._needLabel.text !== needIcon) {
                if (u._needLabel) { u._needLabel.destroy(); u._needLabel = null; }
                u._needLabel = this.scene._w(this.scene.add.text(0, 0, needIcon, {
                    fontSize: '13px', stroke: '#000000', strokeThickness: 2,
                }).setOrigin(0.5, 1).setDepth(8));
                u._needPhase = Math.random() * Math.PI * 2;
            }
            u._needPhase = (u._needPhase ?? 0) + 0.05;
            const bob = Math.sin(u._needPhase) * 2;
            u._needLabel.setPosition(ox - 6, oy - 20 + bob)
                        .setAlpha((0.85 + Math.sin(u._needPhase * 0.6) * 0.1) * alpha)
                        .setVisible(true);
        } else if (u._needLabel) {
            u._needLabel.destroy(); u._needLabel = null;
        }

        // Mental break indicator — persistent 💔 while unit is in a mental break
        const showMbLabel = u.taskType === 'mental_break' && !u.isSleeping && u.hp > 0 && !u.isEnemy && this.scene.showNeeds !== false;
        if (showMbLabel) {
            if (!u._mbLabel) {
                u._mbLabel = this.scene._w(this.scene.add.text(0, 0, '💔', {
                    fontSize: '13px', stroke: '#000000', strokeThickness: 2,
                }).setOrigin(0.5, 1).setDepth(8));
                u._mbPhase = Math.random() * Math.PI * 2;
            }
            u._mbPhase = (u._mbPhase ?? 0) + 0.05;
            const mbBob = Math.sin(u._mbPhase) * 2;
            u._mbLabel.setPosition(ox + 6, oy - 20 + mbBob)
                      .setAlpha((0.85 + Math.sin(u._mbPhase * 0.6) * 0.1) * alpha)
                      .setVisible(true);
        } else if (u._mbLabel) {
            u._mbLabel.destroy(); u._mbLabel = null;
        }

        // Name label for young units
        const showLabel = (age < 2) && !u.isEnemy && u.hp > 0;
        if (showLabel) {
            if (!u.nameLabel) {
                u.nameLabel = this.scene._w(this.scene.add.text(ox, oy - 12, u.name, {
                    fontSize: '9px', color: '#ffeecc', fontFamily: THEME.fontMono,
                    stroke: '#000000', strokeThickness: 1,
                }).setOrigin(0.5, 1).setDepth(7));
            }
            u.nameLabel.setPosition(ox, oy - 12).setAlpha(alpha);
        } else if (u.nameLabel) {
            u.nameLabel.destroy(); u.nameLabel = null;
        }

        const zoom = this.scene.cameras.main.zoom;
        const lod  = zoom < 0.20 ? 0 : zoom < 0.50 ? 1 : zoom < 1.50 ? 2 : 3;

        const isMoving  = !!(u.moveTo || u.currentPath);
        const isWorking = !u.isSleeping && u.hp > 0 && (u.workProgress ?? 0) > 0;
        if (isMoving || isWorking) {
            // Gait cadence scales with actual speed so a unit easing in/out doesn't churn its legs.
            const sp = Math.hypot(u.vx ?? 0, u.vy ?? 0);
            const moveFrac = isWorking ? 1 : Math.max(0.25, u.speed ? Math.min(1, sp / u.speed) : 1);
            u._walkPhase = (u._walkPhase ?? 0) + (isWorking ? 0.10 : 0.14 * moveFrac);
        } else {
            u._walkPhase = ((u._walkPhase ?? 0) * 0.80);
        }

        // Derive facing from position delta — persists when unit stops
        const _fdx = u.x - (u._prevX ?? u.x);
        const _fdy = u.y - (u._prevY ?? u.y);
        if (_fdx * _fdx + _fdy * _fdy > 0.09) {
            if      (_fdy < -Math.abs(_fdx) * 0.5)  u._facing = 'north';
            else if (_fdy >  Math.abs(_fdx) * 0.5)  u._facing = 'south';
            else if (_fdx >= 0)                      u._facing = 'east';
            else                                     u._facing = 'west';
        }
        u._prevX = u.x;
        u._prevY = u.y;

        const htScale = u.phenotype?.heightScale ?? 1.0;
        // Dim units sleeping inside a structure (they're behind the tent canvas)
        const drawAlpha = isSleepingDown && u.isInside ? alpha * 0.70 : alpha;
        UNITS[u.type]?.draw(gfx, u, {
            totalCarrying: u => this.totalCarrying(u),
            lod, ageScale: scale * htScale, walkPhase: u._walkPhase,
            isMoving, isWorking, facing: u._facing ?? 'south', alpha: drawAlpha, ox, oy,
            isSleeping: isSleepingDown,
            isCorpse,
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
        // Highlight a selected edge construct (wall/gate/door/fence) along its border.
        const sc = this.scene.selectedConstruct;
        if (sc && sc.placement === 'edge') {
            const x = sc.col * TILE, y = MAP_OY + sc.row * TILE;
            this.selGfx.lineStyle(3, 0x66ddff, 0.9);
            if (sc.isH) this.selGfx.lineBetween(x, y, x + TILE, y);
            else        this.selGfx.lineBetween(x, y, x, y + TILE);
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

    _getNeedIcon(u) {
        const n = u.needs;
        if (!n) return null;
        if ((u._grief ?? 0) > 0.4) return '🕯';
        if ((n.food ?? 1) < 0.12) return '🍖';
        if ((n.rest ?? 1) < 0.12) return '😴';
        if ((n.social ?? 1) < 0.10) return '💬';
        if ((n.joy ?? 1) < 0.10) return '😞';
        if ((u.mood ?? 1) < 0.25) return '💢';
        return null;
    },

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
                build: 12, repair: 25, deconstruct: 25,
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
