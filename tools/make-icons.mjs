import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) c = CRC_TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePng(size, rgba) {
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function blank(size) {
  return Buffer.alloc(size * size * 4);
}

function gradient(size, top, bottom) {
  const buffer = blank(size);
  for (let y = 0; y < size; y += 1) {
    const t = y / (size - 1);
    const r = Math.round(top[0] + (bottom[0] - top[0]) * t);
    const g = Math.round(top[1] + (bottom[1] - top[1]) * t);
    const b = Math.round(top[2] + (bottom[2] - top[2]) * t);
    for (let x = 0; x < size; x += 1) {
      const i = (y * size + x) * 4;
      buffer[i] = r;
      buffer[i + 1] = g;
      buffer[i + 2] = b;
      buffer[i + 3] = 255;
    }
  }
  return buffer;
}

function coverage(px, py, x, y, w, h, r) {
  const samples = 4;
  let hits = 0;
  for (let sy = 0; sy < samples; sy += 1) {
    for (let sx = 0; sx < samples; sx += 1) {
      const fx = px + (sx + 0.5) / samples;
      const fy = py + (sy + 0.5) / samples;
      if (fx < x || fx > x + w || fy < y || fy > y + h) continue;
      const cx = Math.min(Math.max(fx, x + r), x + w - r);
      const cy = Math.min(Math.max(fy, y + r), y + h - r);
      const dx = fx - cx;
      const dy = fy - cy;
      if (dx * dx + dy * dy <= r * r) hits += 1;
    }
  }
  return hits / (samples * samples);
}

function drawBar(buffer, size, x, y, w, h, color, alpha) {
  const r = h / 2;
  const x0 = Math.max(0, Math.floor(x) - 2);
  const x1 = Math.min(size, Math.ceil(x + w) + 2);
  const y0 = Math.max(0, Math.floor(y) - 2);
  const y1 = Math.min(size, Math.ceil(y + h) + 2);

  for (let py = y0; py < y1; py += 1) {
    for (let px = x0; px < x1; px += 1) {
      const a = coverage(px, py, x, y, w, h, r) * alpha;
      if (a <= 0) continue;
      const i = (py * size + px) * 4;
      const dstA = buffer[i + 3] / 255;
      const outA = a + dstA * (1 - a);
      for (let c = 0; c < 3; c += 1) {
        buffer[i + c] = Math.round(
          outA === 0 ? 0 : (color[c] * a + buffer[i + c] * dstA * (1 - a)) / outA
        );
      }
      buffer[i + 3] = Math.round(outA * 255);
    }
  }
}

const PAPER = [250, 249, 247];
const INK_TOP = [30, 30, 38];
const INK_BOTTOM = [12, 12, 16];

function drawMark(buffer, size, color, scale = 1) {
  const u = (size / 1024) * scale;
  const bars = [
    { w: 486, h: 116, alpha: 1 },
    { w: 372, h: 74, alpha: 0.42 },
    { w: 256, h: 74, alpha: 0.24 },
  ];
  const gap = 62 * u;
  const total = bars.reduce((sum, b) => sum + b.h * u, 0) + gap * (bars.length - 1);

  const left = (size - bars[0].w * u) / 2;
  let top = (size - total) / 2;

  for (const bar of bars) {
    drawBar(buffer, size, left, top, bar.w * u, bar.h * u, color, bar.alpha);
    top += bar.h * u + gap;
  }
}

function write(path, buffer, size) {
  writeFileSync(path, encodePng(size, buffer));
  console.log('wrote', path);
}

{
  const size = 1024;
  const b = gradient(size, INK_TOP, INK_BOTTOM);
  drawMark(b, size, PAPER);
  write('assets/images/icon.png', b, size);
}
{
  const size = 1024;
  const b = blank(size);
  drawMark(b, size, PAPER, 0.62);
  write('assets/images/android-icon-foreground.png', b, size);
}
{
  const size = 1024;
  write('assets/images/android-icon-background.png', gradient(size, INK_TOP, INK_BOTTOM), size);
}
{
  const size = 1024;
  const b = blank(size);
  drawMark(b, size, [255, 255, 255], 0.62);
  write('assets/images/android-icon-monochrome.png', b, size);
}
{
  const size = 512;
  const b = blank(size);
  drawMark(b, size, PAPER);
  write('assets/images/splash-icon.png', b, size);
}
{
  const size = 64;
  const b = gradient(size, INK_TOP, INK_BOTTOM);
  drawMark(b, size, PAPER);
  write('assets/images/favicon.png', b, size);
}
