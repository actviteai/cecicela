'use strict';

/**
 * The brand assets: present, the sizes the stores ask for, font-free, and
 * every font this repository loads comes from Cloudflare's cdnjs.
 */

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const zlib = require('node:zlib');

const REPO = path.resolve(__dirname, '..');
const BRAND = path.join(REPO, 'brand');

/** Width, height, and RGBA pixels of a non-interlaced 8-bit RGBA PNG. */
function png(file) {
  const buf = fs.readFileSync(file);
  assert.equal(buf.toString('latin1', 1, 4), 'PNG', file);
  let at = 8;
  let ihdr;
  const idat = [];
  while (at < buf.length) {
    const len = buf.readUInt32BE(at);
    const type = buf.toString('latin1', at + 4, at + 8);
    const data = buf.subarray(at + 8, at + 8 + len);
    if (type === 'IHDR') ihdr = data;
    if (type === 'IDAT') idat.push(data);
    at += 12 + len;
  }
  const w = ihdr.readUInt32BE(0);
  const h = ihdr.readUInt32BE(4);
  return { w, h, depth: ihdr[8], color: ihdr[9], raw: zlib.inflateSync(Buffer.concat(idat)) };
}

/** Unfiltered RGBA rows (PNG filters 0-4). */
function pixels({ w, h, raw }) {
  const stride = w * 4;
  const out = Buffer.alloc(stride * h);
  for (let y = 0; y < h; y += 1) {
    const f = raw[y * (stride + 1)];
    for (let x = 0; x < stride; x += 1) {
      const a = x >= 4 ? out[y * stride + x - 4] : 0;
      const b = y > 0 ? out[(y - 1) * stride + x] : 0;
      const c = x >= 4 && y > 0 ? out[(y - 1) * stride + x - 4] : 0;
      const p = a + b - c;
      const pred = [0, a, b, Math.floor((a + b) / 2), Math.abs(p - a) <= Math.abs(p - b) && Math.abs(p - a) <= Math.abs(p - c) ? a : Math.abs(p - b) <= Math.abs(p - c) ? b : c][f];
      out[y * stride + x] = (raw[y * (stride + 1) + 1 + x] + pred) & 0xff;
    }
  }
  return out;
}

test('the SVG masters exist and carry no text or font, only paths', () => {
  for (const rel of ['seal.svg', 'seal-dark.svg', 'bust.svg', 'bust-dark.svg', 'outline-32.svg', 'seal-outline.svg', 'portrait/seal.svg', 'portrait/bust.svg', 'portrait/outline-32.svg']) {
    const svg = fs.readFileSync(path.join(BRAND, rel), 'utf8');
    assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="[\d ]+" role="img" aria-labelledby="[\w-]+"><title id=/, rel);
    assert.doesNotMatch(svg, /<text|font-family|@font-face|<style|class="/, `${rel} must not depend on a font or stylesheet`);
  }
  assert.match(fs.readFileSync(path.join(BRAND, 'seal.svg'), 'utf8'), /fill="#111111"/);
  assert.match(fs.readFileSync(path.join(BRAND, 'seal-dark.svg'), 'utf8'), /fill="#ffffff"/);
});

test('the PNG exports are the sizes the stores ask for', () => {
  const sizes = {
    'seal-1024.png': [1024, 1024], 'seal-512.png': [512, 512], 'seal-300.png': [300, 300], 'seal-216.png': [216, 216],
    'seal-192.png': [192, 192], 'seal-dark-1024.png': [1024, 1024], 'bust-64.png': [64, 64], 'outline-32.png': [32, 32],
    'avatar-1024.png': [1024, 1024], 'social-1280x640.png': [1280, 640],
  };
  for (const [rel, [w, h]] of Object.entries(sizes)) {
    const p = png(path.join(BRAND, 'png', rel));
    assert.deepEqual([p.w, p.h], [w, h], rel);
  }
});

test('the 32 px outline is white on transparent, and visible', () => {
  const p = png(path.join(BRAND, 'png', 'outline-32.png'));
  assert.equal(p.color, 6, 'RGBA');
  const px = pixels(p);
  let opaque = 0;
  let transparent = 0;
  for (let i = 0; i < px.length; i += 4) {
    const alpha = px[i + 3];
    if (alpha > 200) {
      opaque += 1;
      assert.ok(px[i] > 200 && px[i + 1] > 200 && px[i + 2] > 200, `pixel ${i / 4} is not white`);
    }
    if (alpha === 0) transparent += 1;
  }
  assert.ok(opaque > 32 * 32 * 0.2, `${opaque} solid pixels: too faint to read`);
  assert.ok(transparent > 32 * 32 * 0.2, `${transparent} clear pixels: the knockout is missing`);
});

test('the Microsoft 365 icons are the brand exports', () => {
  assert.deepEqual(fs.readFileSync(path.join(REPO, 'chat/m365/appPackage/color.png')), fs.readFileSync(path.join(BRAND, 'png/seal-192.png')));
  assert.deepEqual(fs.readFileSync(path.join(REPO, 'chat/m365/appPackage/outline.png')), fs.readFileSync(path.join(BRAND, 'png/outline-32.png')));
});

test('fonts come from Cloudflare: no tracked file loads Google Fonts', () => {
  const files = spawnSync('git', ['ls-files', '-z'], { cwd: REPO, encoding: 'utf8' }).stdout.split('\0').filter(Boolean)
    .filter((rel) => rel !== 'test/brand.test.js' && /\.(html|css|js|md|json|svg)$/.test(rel));
  const google = ['fonts.', 'googleapis.com'].join('');
  const hits = files.filter((rel) => {
    const text = fs.readFileSync(path.join(REPO, rel), 'utf8');
    return text.includes(google) || text.includes(['fonts.', 'gstatic.com'].join(''));
  });
  assert.deepEqual(hits, []);
  const banner = fs.readFileSync(path.join(BRAND, 'source', 'social-banner.html'), 'utf8');
  for (const href of banner.match(/href="https?:[^"]+"/g) || []) assert.match(href, /^href="https:\/\/cdnjs\.cloudflare\.com\//, href);
});
