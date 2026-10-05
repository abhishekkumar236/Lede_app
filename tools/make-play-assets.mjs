import { writeFileSync } from "node:fs";
import { deflateSync } from "node:zlib";

const CRC = (() => {
    const t = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++)
            c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        t[n] = c;
    }
    return t;
})();
const crc32 = (b) => {
    let c = 0xffffffff;
    for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
};
function encodePng(w, h, rgba) {
    const stride = w * 4,
        raw = Buffer.alloc((stride + 1) * h);
    for (let y = 0; y < h; y++) {
        raw[y * (stride + 1)] = 0;
        rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
    }
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(w, 0);
    ihdr.writeUInt32BE(h, 4);
    ihdr[8] = 8;
    ihdr[9] = 6;
    return Buffer.concat([
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
        chunk("IHDR", ihdr),
        chunk("IDAT", deflateSync(raw, { level: 9 })),
        chunk("IEND", Buffer.alloc(0)),
    ]);
}
function gradient(w, h, top, bottom) {
    const b = Buffer.alloc(w * h * 4);
    for (let y = 0; y < h; y++) {
        const t = y / (h - 1);
        const r = Math.round(top[0] + (bottom[0] - top[0]) * t);
        const g = Math.round(top[1] + (bottom[1] - top[1]) * t);
        const bl = Math.round(top[2] + (bottom[2] - top[2]) * t);
        for (let x = 0; x < w; x++) {
            const i = (y * w + x) * 4;
            b[i] = r;
            b[i + 1] = g;
            b[i + 2] = bl;
            b[i + 3] = 255;
        }
    }
    return b;
}
function cover(px, py, x, y, w, h, r) {
    const s = 4;
    let hit = 0;
    for (let sy = 0; sy < s; sy++)
        for (let sx = 0; sx < s; sx++) {
            const fx = px + (sx + 0.5) / s,
                fy = py + (sy + 0.5) / s;
            if (fx < x || fx > x + w || fy < y || fy > y + h) continue;
            const cx = Math.min(Math.max(fx, x + r), x + w - r),
                cy = Math.min(Math.max(fy, y + r), y + h - r);
            if ((fx - cx) ** 2 + (fy - cy) ** 2 <= r * r) hit++;
        }
    return hit / (s * s);
}
function bar(buf, W, x, y, w, h, color, alpha) {
    const r = h / 2;
    for (
        let py = Math.max(0, (y - 2) | 0);
        py < Math.min(buf.length / (W * 4), y + h + 2);
        py++
    )
        for (
            let px = Math.max(0, (x - 2) | 0);
            px < Math.min(W, x + w + 2);
            px++
        ) {
            const a = cover(px, py, x, y, w, h, r) * alpha;
            if (a <= 0) continue;
            const i = (py * W + px) * 4;
            for (let c = 0; c < 3; c++)
                buf[i + c] = Math.round(color[c] * a + buf[i + c] * (1 - a));
            buf[i + 3] = 255;
        }
}
const PAPER = [250, 249, 247],
    TOP = [30, 30, 38],
    BOTTOM = [12, 12, 16];

function mark(buf, W, H, unit, cx, cy) {
    const bars = [
        { w: 486, h: 116, a: 1 },
        { w: 372, h: 74, a: 0.42 },
        { w: 256, h: 74, a: 0.24 },
    ];
    const gap = 62 * unit;
    const total = bars.reduce((s, b) => s + b.h * unit, 0) + gap * 2;
    let top = cy - total / 2;
    const left = cx - (bars[0].w * unit) / 2;
    for (const b of bars) {
        bar(buf, W, left, top, b.w * unit, b.h * unit, PAPER, b.a);
        top += b.h * unit + gap;
    }
}

{
    // Play store icon: exactly 512x512, no transparency
    const S = 512,
        b = gradient(S, S, TOP, BOTTOM);
    mark(b, S, S, S / 1024, S / 2, S / 2);
    writeFileSync("assets/play/store-icon-512.png", encodePng(S, S, b));
    console.log("wrote assets/play/store-icon-512.png  (512x512)");
}
{
    // Feature graphic: exactly 1024x500
    const W = 1024,
        H = 500,
        b = gradient(W, H, TOP, BOTTOM);
    mark(b, W, H, 0.42, W * 0.5, H * 0.5);
    writeFileSync("assets/play/feature-graphic.png", encodePng(W, H, b));
    console.log("wrote assets/play/feature-graphic.png  (1024x500)");
}
