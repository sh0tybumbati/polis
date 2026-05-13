import { TILE, MAP_OY, MAP_W } from '../../config/gameConstants.js';
import { MathUtils } from '../../utils/MathUtils.js';

export default {
    updateCombat(u, time, dt) {
        const enemies = this.scene.units.filter(e => e.isEnemy && e.hp > 0);
        let near = null, nd = Infinity;
        for (const e of enemies) {
            const d = Phaser.Math.Distance.Between(u.x, u.y, e.x, e.y);
            if (d < nd) { nd = d; near = e; }
        }

        if (this.scene.phase !== 'NIGHT' && this.scene.phase !== 'DAY') { u.isRouting = false; return; }

        const hpRatio = u.hp / u.maxHp;
        const heroNearby = this.scene.units.some(h => !h.isEnemy && h.isHero && h.hp > 0
            && Phaser.Math.Distance.Between(u.x, u.y, h.x, h.y) < 6 * TILE);

        const wil = u.attributes?.wil ?? 5;
        const routeThreshold = Math.max(0.05, 0.45 - wil * 0.04);
        if ((u.vetLevel ?? 0) === 0 && !heroNearby && hpRatio < routeThreshold && !u.isRouting) {
            u.isRouting = true;
            this.scene.uiManager.showFloatText(u.x, u.y - 18, 'routing!', '#ff8844');
            // Cascade
            this.scene.units.filter(f => !f.isEnemy && (f.vetLevel ?? 0) === 0 && !f.isRouting && f !== u && f.type !== 'worker'
                && Phaser.Math.Distance.Between(u.x, u.y, f.x, f.y) < 3 * TILE
                && f.hp / f.maxHp < 0.5
                && !this.scene.units.some(h => !h.isEnemy && h.isHero && h.hp > 0
                    && Phaser.Math.Distance.Between(f.x, f.y, h.x, h.y) < 6 * TILE)
            ).forEach(f => {
                f.isRouting = true;
                this.scene.uiManager.showFloatText(f.x, f.y - 18, 'routing!', '#ff8844');
            });
        }

        if (u.isRouting) {
            const home = this.scene.constructs.find(b => b.id === u.homeConstructId);
            const hx = home ? (home.tx + home.width / 2) * TILE : MAP_W / 2 * TILE;
            const hy = home ? MAP_OY + (home.ty + home.height / 2) * TILE : this.scene.MAP_BOTTOM - TILE * 4;
            const dh = Phaser.Math.Distance.Between(u.x, u.y, hx, hy);
            if (dh > 8) {
                const a = Math.atan2(hy - u.y, hx - u.x);
                u.x += Math.cos(a) * u.speed * 1.2 * dt;
                u.y += Math.sin(a) * u.speed * 1.2 * dt;
            } else {
                u.isRouting = false;
            }
            return;
        }

        if (!near) {
            // No enemy units — attack nearest enemy construct instead
            const eb = this.scene.constructs.filter(b => b.faction === 'enemy' && b.built && b.hp > 0);
            let nearConstruct = null, nbd = Infinity;
            for (const b of eb) {
                const bx = (b.tx + b.width / 2) * TILE, by = MAP_OY + (b.ty + b.height / 2) * TILE;
                const d = Phaser.Math.Distance.Between(u.x, u.y, bx, by);
                if (d < nbd) { nbd = d; nearConstruct = b; }
            }
            if (nearConstruct) {
                const bx = (nearConstruct.tx + nearConstruct.width / 2) * TILE;
                const by = MAP_OY + (nearConstruct.ty + nearConstruct.height / 2) * TILE;
                if (nbd < TILE * 1.5) {
                    if (time - u.lastAtk > 1200) {
                        u.lastAtk = time;
                        nearConstruct.hp = Math.max(0, nearConstruct.hp - u.atk);
                        this.scene.constructManager.redrawConstructBar(nearConstruct);
                        this.scene.uiManager.showFloatText(bx, by - 10, `-${u.atk}`, '#ffaa44');
                        if (nearConstruct.hp <= 0) this._destroyConstruct(nearConstruct);
                    }
                } else {
                    this.moveToward(u, bx, by, 10, dt);
                }
            }
            return;
        }

        const nearbyEnemies = enemies.filter(e => Phaser.Math.Distance.Between(u.x, u.y, e.x, e.y) <= u.range * 1.5);
        const quadrants = new Set(nearbyEnemies.map(e => {
            const a = Math.atan2(e.y - u.y, e.x - u.x);
            return Math.floor(((a + Math.PI) / (Math.PI / 2))) % 4;
        }));
        const flankMod = quadrants.size >= 2 ? 0.8 : 1.0;

        if (nd <= u.range + 4) {
            if (time - u.lastAtk > 1000) {
                const nTx = Math.floor(near.x/TILE), nTy = Math.floor((near.y-MAP_OY)/TILE);
                const cover = MathUtils.coverMod(this.scene.terrainData[nTy]?.[nTx] ?? 0);
                const highGround = u.taskType === 'garrison' ? 1.5 : 1.0;
                const dmg = Math.max(1, Math.round(u.atk * flankMod * MathUtils.counterMod(u.type, near.type) * cover * highGround));
                near.hp -= dmg; u.lastAtk = time;
                this.scene.uiManager.showFloatText(near.x, near.y - 14, `-${dmg}`, '#ff6666');
            }
        } else if (nd < 115) {
            const a = Phaser.Math.Angle.Between(u.x, u.y, near.x, near.y);
            u.x += Math.cos(a) * u.speed * 0.8 * dt;
            u.y += Math.sin(a) * u.speed * 0.8 * dt;
        }
    },

    moveSelectedTo(wx, wy) {
        const sel = this.scene.units.filter(u => u.selected && !u.isEnemy);
        if (!sel.length) return;
        this.applyFormation(wx, wy, Math.PI / 2, sel);
    },

    applyFormation(cx, cy, angle, sel) {
        if (!sel) sel = this.scene.units.filter(u => u.selected && !u.isEnemy);
        if (!sel.length) return;
        const positions = this.getFormationPositions(this.scene.fmType, cx, cy, sel.length, angle);

        if (this.scene.fmGfx) this.scene.fmGfx.destroy();
        this.scene.fmGfx = this.scene._w(this.scene.add.graphics().setDepth(5));
        this.scene.fmGfx.fillStyle(0xffdd44, 0.18);
        positions.forEach(p => this.scene.fmGfx.fillCircle(p.x, p.y, 9));

        if (positions.length > 1) {
            this.scene.fmGfx.lineStyle(1, 0xffdd44, 0.3);
            for (let i = 1; i < positions.length; i++)
                this.scene.fmGfx.lineBetween(positions[i-1].x, positions[i-1].y, positions[i].x, positions[i].y);
        }
        this.scene.tweens.add({ targets: this.scene.fmGfx, alpha: 0, delay: 2000, duration: 500 });

        sel.forEach((u, i) => {
            u.moveTo = positions[i];
            u.taskType = null; u.taskConstructId = null; u.targetNode = null;
        });
    },

    drawFmDragPreview(x1, y1, x2, y2) {
        const sel = this.scene.units.filter(u => u.selected && !u.isEnemy);
        if (!sel.length) return;

        if (this.scene.fmGfx) this.scene.fmGfx.destroy();
        this.scene.fmGfx = this.scene._w(this.scene.add.graphics().setDepth(5));

        const angle = Math.atan2(y2 - y1, x2 - x1);
        const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2;

        this.scene.fmGfx.lineStyle(2, 0xffdd44, 0.75).lineBetween(x1, y1, x2, y2);
        this.scene.fmGfx.fillStyle(0xffdd44, 0.9).fillCircle(x1, y1, 4).fillCircle(x2, y2, 4);

        const fwd = angle - Math.PI / 2;
        const aLen = 24;
        const ax = cx + Math.cos(fwd) * aLen, ay = cy + Math.sin(fwd) * aLen;
        this.scene.fmGfx.lineStyle(1, 0xffdd44, 0.45).lineBetween(cx, cy, ax, ay);
        this.scene.fmGfx.fillStyle(0xffdd44, 0.6)
            .fillTriangle(ax, ay,
                ax - Math.cos(fwd - 0.5) * 8, ay - Math.sin(fwd - 0.5) * 8,
                ax - Math.cos(fwd + 0.5) * 8, ay - Math.sin(fwd + 0.5) * 8);

        const positions = this.getFormationPositions(this.scene.fmType, cx, cy, sel.length, angle);
        this.scene.fmGfx.fillStyle(0xffdd44, 0.18);
        positions.forEach(p => this.scene.fmGfx.fillCircle(p.x, p.y, 9));
    },

    getFormationPositions(type, cx, cy, count, angle = Math.PI / 2) {
        switch (type) {
            case 'wedge':  return this._wedgePos(cx, cy, count, angle);
            case 'screen': return this._screenPos(cx, cy, count, angle);
            default:       return this._phalanxPos(cx, cy, count, angle);
        }
    },

    _phalanxPos(cx, cy, count, angle) {
        const sp = 36, half = (count - 1) * sp / 2;
        const ca = Math.cos(angle), sa = Math.sin(angle);
        return Array.from({ length: count }, (_, i) => {
            const t = -half + i * sp;
            return { x: cx + ca * t, y: cy + sa * t };
        });
    },

    _wedgePos(cx, cy, count, angle) {
        const ca = Math.cos(angle), sa = Math.sin(angle);
        const fa = Math.cos(angle - Math.PI / 2), fb = Math.sin(angle - Math.PI / 2);
        const pos = [{ x: cx, y: cy }];
        let rank = 1;
        while (pos.length < count) {
            const fwd = rank * 26, side = rank * 30;
            const bx = cx - fa * fwd, by = cy - fb * fwd;
            if (pos.length < count) pos.push({ x: bx + ca * side, y: by + sa * side });
            if (pos.length < count) pos.push({ x: bx - ca * side, y: by - sa * side });
            rank++;
        }
        return pos;
    },

    _screenPos(cx, cy, count, angle) {
        const sp = 50, half = (count - 1) * sp / 2;
        const ca = Math.cos(angle), sa = Math.sin(angle);
        const fa = Math.cos(angle - Math.PI / 2), fb = Math.sin(angle - Math.PI / 2);
        return Array.from({ length: count }, (_, i) => {
            const t = -half + i * sp;
            const off = (i % 2 === 0 ? 0 : 20);
            return { x: cx + ca * t - fa * off, y: cy + sa * t - fb * off };
        });
    },
};
