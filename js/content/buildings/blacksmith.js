import { TILE, MAP_OY } from '../../config/gameConstants.js';
const g = b => { const px = b.tx*TILE, py = MAP_OY+b.ty*TILE, s = b.size*TILE; return { px, py, s, cx: px+s/2, cy: py+s/2 }; };

export default {
    id: 'blacksmith',
    tick(b, delta, ctx) {
        const smith = ctx.workerAt(b, 'smith');
        if (!smith) { b.forgeTimer = 0; return; }
        b.inbox = b.inbox ?? {};
        b.forgeTimer = (b.forgeTimer ?? 0) + delta;
        if (b.forgeTimer >= 15000 && (b.inbox.ingot ?? 0) >= 1
            && (ctx.resources.leather ?? 0) >= 1
            && (ctx.resources.bronzeKit ?? 0) < 10) {
            b.inbox.ingot--;
            ctx.resources.leather--;
            b.forgeTimer = 0;
            ctx.resources.bronzeKit = (ctx.resources.bronzeKit ?? 0) + 1;
            ctx.gainXp(smith, 'forge');
            ctx.floatText(b, '⚒ kit', '#ddaa44');
        }
    },
    draw(gfx, b) {
        const { px, py, s, cx, cy } = g(b);
        gfx.fillStyle(0x443344).fillRect(px+4, py+6, s-8, s-10);
        gfx.fillStyle(0x888899).fillRect(cx-10, cy-2, 20, 8);
        gfx.fillStyle(0x777788).fillRect(cx-6, cy+6, 12, 4);
        gfx.fillStyle(0x999aaa).fillRect(cx-12, cy-4, 5, 4);
        gfx.fillStyle(0xaa8844, 0.8).fillRect(cx+6, cy-8, 4, 10);
        gfx.fillStyle(0x888877, 0.9).fillRect(cx+4, cy-10, 8, 5);
    },
};
