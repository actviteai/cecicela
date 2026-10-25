'use strict';

/**
 * A minimal PNG encoder (RGBA, no filtering) for placeholder icons, so the
 * Microsoft 365 package is valid before the brand seal exists. Replace the
 * placeholders with the exports from brand/ before any store submission.
 */

const zlib = require('zlib');

const TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** pixel(x, y) -> [r, g, b, a] */
function encode(width, height, pixel) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (width * 4 + 1)] = 0;
    for (let x = 0; x < width; x += 1) {
      const [r, g, b, a] = pixel(x, y);
      const at = y * (width * 4 + 1) + 1 + x * 4;
      raw[at] = r;
      raw[at + 1] = g;
      raw[at + 2] = b;
      raw[at + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** A seal-shaped placeholder: a double ring. Color on a solid tile, or white outline on transparent. */
function sealPlaceholder(size, { outline = false } = {}) {
  const c = (size - 1) / 2;
  return encode(size, size, (x, y) => {
    const d = Math.hypot(x - c, y - c) / (size / 2);
    const ring = (d > 0.78 && d < 0.9) || (d > 0.6 && d < 0.66);
    if (outline) return ring ? [255, 255, 255, 255] : [0, 0, 0, 0];
    return ring ? [242, 233, 216, 255] : [27, 42, 65, 255];
  });
}

module.exports = { encode, sealPlaceholder };
