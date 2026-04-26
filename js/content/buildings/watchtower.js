import { TILE, MAP_OY } from '../../config/gameConstants.js';
const g = b => { const px = b.tx*TILE, py = MAP_OY+b.ty*TILE, s = b.size*TILE; return { px, py, s, cx: px+s/2 }; };
const RANGED = new Set(['archer','slinger','toxotes','scout']);

export default {
    id: 'watchtower',
    tick(b, delta, ctx) {
        const garrison = ctx.units.filter(u =>
            !u.isEnemy && u.hp > 0 && u.taskType === 'garrison' && u.taskBldgId === b.id);
        const ranged = garrison.filter(u => RANGED.has(u.type));
        if (!ranged.length) return;

        b._shooterIdx = ((b._shooterIdx ?? 0) + 1) % ranged.length;
        const shooter = ranged[b._shooterIdx];
        const effectiveRange = shooter.range + 2 * TILE;
        const fireMs = ranged.length >= 2 ? 1800 : 3000;

        b.shotTimer = (b.shotTimer ?? 0) + delta;
        if (b.shotTimer < fireMs) return;

        const cx = (b.tx + 0.5) * TILE, cy = MAP_OY + (b.ty + 0.5) * TILE;
        const target = ctx.units.find(u =>
            u.isEnemy && u.hp > 0 &&
            Phaser.Math.Distance.Between(u.x, u.y, cx, cy) <= effectiveRange);
        if (!target) return;

        b.shotTimer = 0;
        const hitChance = ranged.length >= 2 ? 0.95 : 0.70;
        if (Math.random() > hitChance) return;

        const dmg = shooter.atk ?? 2;
        target.hp -= dmg;
        ctx.floatTextAt(target.x, target.y - 12, `-${dmg}`, '#ffaa44');
        const gfx = ctx.addGraphics();
        gfx.lineStyle(1.5, 0xffcc66, 0.9).lineBetween(cx, cy, target.x, target.y);
        ctx.tween({ targets: gfx, alpha: 0, duration: 250, onComplete: () => gfx.destroy() });
    },
    draw(gfx, b) {
        const { px, py, s, cx } = g(b);
        gfx.fillStyle(0x7a7060).fillRect(px+4, py+8, s-8, s-10);
        gfx.fillStyle(0x9a9080).fillRect(px+2, py+4, s-4, 6);
        gfx.lineStyle(1, 0x555544, 0.8).lineBetween(cx, py+10, cx, py+s-2);
        gfx.fillStyle(0xaaa090).fillRect(px+2, py, 6, 6).fillRect(px+s-8, py, 6, 6);
        gfx.fillStyle(0x222018).fillRect(px+s/2-1, py+5, 2, 4);
    },
};
