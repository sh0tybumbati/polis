import { TILE, MAP_OY } from '../../config/gameConstants.js';
const g = b => { const px = b.tx*TILE, py = MAP_OY+b.ty*TILE, s = b.size*TILE; return { px, py, s, cx: px+s/2, cy: py+s/2 }; };

export default {
    id: 'butcher',
    tick(b, delta, ctx) {
        const worker = ctx.workerAt(b, 'butcher');
        if (!worker) { b.cutsTimer = 0; b.sausageTimer = 0; return; }
        b.inbox = b.inbox ?? {};
        b.cutsTimer = (b.cutsTimer ?? 0) + delta;
        if (b.cutsTimer >= 8000 && (b.inbox.meat ?? 0) >= 2) {
            b.inbox.meat -= 2;
            b.inbox.cuts = (b.inbox.cuts ?? 0) + 3;
            b.cutsTimer = 0;
            ctx.gainXp(worker, 'butcher');
            ctx.floatText(b, '🥩 cuts', '#dd8866');
        }
        b.sausageTimer = (b.sausageTimer ?? 0) + delta;
        if (b.sausageTimer >= 12000 && (b.inbox.cuts ?? 0) >= 3 && ctx.hasStorageSpace('sausages')) {
            b.inbox.cuts -= 3;
            b.sausageTimer = 0;
            ctx.addResource('sausages', 2);
            ctx.gainXp(worker, 'butcher');
            ctx.floatText(b, '🌭 sausages', '#ffaa44');
        }
    },
    draw(gfx, b) {
        const { px, py, s, cx, cy } = g(b);
        gfx.fillStyle(0xddccbb).fillRect(px+4, py+6, s-8, s-10);
        gfx.lineStyle(2, 0xaa4433, 0.9).strokeRect(px+4, py+6, s-8, s-10);
        gfx.lineStyle(2, 0x885533, 0.9).lineBetween(px+10, py+8, px+10, py+s-10).lineBetween(cx, py+8, cx, py+s-10).lineBetween(px+s-10, py+8, px+s-10, py+s-10);
        gfx.fillStyle(0xaa3322, 0.7).fillRect(px+7, cy-6, 6, 14).fillRect(cx-3, cy-4, 6, 12).fillRect(px+s-13, cy-6, 6, 14);
        gfx.fillStyle(0x8a6644).fillRect(cx-12, py+s-18, 24, 10);
    },
};
