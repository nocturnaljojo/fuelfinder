/**
 * FuelFinder — PWA Icon Generator
 * Creates PNG icons for the PWA manifest (no external deps beyond Node built-ins).
 * Run with: node scripts/generate-pwa-icons.mjs
 */

import { deflateSync }             from "zlib";
import { writeFileSync, mkdirSync } from "fs";
import { resolve, dirname }         from "path";
import { fileURLToPath }            from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC    = resolve(__dirname, "../public");

// ── CRC32 ──────────────────────────────────────────────────────
const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c;
}
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// ── PNG chunk helpers ───────────────────────────────────────────
function u32be(n) { const b = Buffer.allocUnsafe(4); b.writeUInt32BE(n); return b; }

function pngChunk(type, data) {
  const tBuf = Buffer.from(type, "ascii");
  return Buffer.concat([u32be(data.length), tBuf, data, u32be(crc32(Buffer.concat([tBuf, data])))]);
}

// ── Draw a fuel-drop teardrop shape ────────────────────────────
function makePNG(size, bgHex, acHex) {
  const hex = h => [parseInt(h.slice(1,3),16), parseInt(h.slice(3,5),16), parseInt(h.slice(5,7),16)];
  const BG  = hex(bgHex);
  const AC  = hex(acHex);

  const cx   = size / 2;
  const cy   = size * 0.56;         // circle centre (lower half)
  const r    = size * 0.31;         // circle radius
  const tipY = cy - r * 1.55;       // pointed top of teardrop

  const raw = [];
  for (let y = 0; y < size; y++) {
    raw.push(0); // PNG filter byte = None
    for (let x = 0; x < size; x++) {
      const dx = x - cx, dy = y - cy;
      const inCircle = dx * dx + dy * dy < r * r;
      const inTip    = y < cy && y > tipY &&
                       Math.abs(dx) < r * 0.82 * ((cy - y) / (cy - tipY)) * 0.9;
      const px = (inCircle || inTip) ? AC : BG;
      raw.push(...px);
    }
  }

  const sig  = Buffer.from([137,80,78,71,13,10,26,10]);
  const ihdr = pngChunk("IHDR", Buffer.concat([u32be(size), u32be(size), Buffer.from([8,2,0,0,0])]));
  const idat = pngChunk("IDAT", deflateSync(Buffer.from(raw)));
  const iend = pngChunk("IEND", Buffer.alloc(0));
  return Buffer.concat([sig, ihdr, idat, iend]);
}

// ── Generate icons ──────────────────────────────────────────────
mkdirSync(PUBLIC, { recursive: true });

const BG     = "#0f172a";   // app dark background
const ACCENT = "#3b82f6";   // app primary blue

const sizes = [
  { file: "pwa-192.png",         size: 192 },
  { file: "pwa-512.png",         size: 512 },
  { file: "apple-touch-icon.png", size: 180 },
];

for (const { file, size } of sizes) {
  writeFileSync(resolve(PUBLIC, file), makePNG(size, BG, ACCENT));
  console.log(`  ✓  public/${file}  (${size}×${size})`);
}

console.log("\n✅  PWA icons generated successfully.");
