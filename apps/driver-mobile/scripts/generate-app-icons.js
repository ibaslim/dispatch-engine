/* eslint-disable no-console */
/**
 * Regenerates every launcher / splash / notification asset from a single master
 * artwork (`assets/logo-master.png`, 1024x1024 RGBA on transparency).
 *
 * Run on demand — this is NOT wired into prebuild or a postinstall hook:
 *
 *   node scripts/generate-app-icons.js      (or: npm run icons)
 *
 * Deliberately dependency-free (no sharp/jimp): it decodes and encodes PNG with
 * `zlib` alone. sharp is a native module that would have to compile per platform
 * for a script that runs maybe twice a year, and the only operations needed are
 * crop, box-downscale and flatten.
 *
 * Two things it handles that a manual export usually gets wrong:
 *  - It re-centres on the artwork's alpha bounding box. The master's mark sits
 *    off-centre (bbox 569x460 at 246,252), so scaling the raw square would push
 *    the truck up and right inside every icon mask.
 *  - It downsamples with *premultiplied* alpha. Averaging straight RGBA pulls the
 *    invisible black of fully-transparent pixels into the edges, which shows up
 *    as a dark fringe around the mark at small sizes.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.join(__dirname, '..');
const MASTER = path.join(ROOT, 'assets', 'logo-master.png');

// ---------------------------------------------------------------- PNG codec

function decodePng(file) {
  const buf = fs.readFileSync(file);
  let off = 8;
  const idat = [];
  let width, height, depth, colorType;

  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    if (type === 'IHDR') {
      width = buf.readUInt32BE(off + 8);
      height = buf.readUInt32BE(off + 12);
      depth = buf[off + 16];
      colorType = buf[off + 17];
    } else if (type === 'IDAT') {
      idat.push(buf.slice(off + 8, off + 8 + len));
    }
    off += 12 + len;
  }

  if (depth !== 8 || (colorType !== 6 && colorType !== 2)) {
    throw new Error(
      `${path.basename(file)}: need 8-bit RGB or RGBA, got depth ${depth} / colour type ${colorType}`,
    );
  }

  const channels = colorType === 6 ? 4 : 3;
  const stride = width * channels;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const out = Buffer.alloc(height * stride);
  let pos = 0;

  // Undo the per-scanline filters (PNG spec 9.2).
  for (let y = 0; y < height; y++) {
    const filter = raw[pos++];
    const line = raw.slice(pos, pos + stride);
    pos += stride;
    const cur = out.slice(y * stride, (y + 1) * stride);
    const prev = y > 0 ? out.slice((y - 1) * stride, y * stride) : Buffer.alloc(stride);

    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? cur[x - channels] : 0;
      const b = prev[x];
      const c = x >= channels ? prev[x - channels] : 0;
      let v = line[x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      cur[x] = v & 0xff;
    }
  }

  // Normalise to RGBA so the rest of the script has one shape to deal with.
  if (channels === 3) {
    const rgba = Buffer.alloc(width * height * 4);
    for (let i = 0, j = 0; i < width * height; i++, j += 3) {
      rgba[i * 4] = out[j];
      rgba[i * 4 + 1] = out[j + 1];
      rgba[i * 4 + 2] = out[j + 2];
      rgba[i * 4 + 3] = 255;
    }
    return { width, height, data: rgba };
  }
  return { width, height, data: out };
}

function chunk(type, payload) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(payload.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), payload]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body) >>> 0);
  return Buffer.concat([len, body, crc]);
}

let CRC_TABLE;
function crc32(buf) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c;
    }
  }
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return c ^ -1;
}

/** @param alpha keep the alpha channel (colour type 6) or write opaque RGB (type 2). */
function encodePng({ width, height, data }, alpha) {
  const channels = alpha ? 4 : 3;
  const stride = width * channels;
  const raw = Buffer.alloc(height * (stride + 1));

  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const src = (y * width + x) * 4;
      const dst = y * (stride + 1) + 1 + x * channels;
      raw[dst] = data[src];
      raw[dst + 1] = data[src + 1];
      raw[dst + 2] = data[src + 2];
      if (alpha) raw[dst + 3] = data[src + 3];
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = alpha ? 6 : 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ------------------------------------------------------------- image tools

/** Tightest box containing pixels above `threshold` alpha. */
function alphaBounds(img, threshold = 8) {
  let x0 = img.width;
  let y0 = img.height;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      if (img.data[(y * img.width + x) * 4 + 3] >= threshold) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  if (x1 < 0) throw new Error('logo-master.png is fully transparent');
  return { x: x0, y: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
}

function crop(img, box) {
  const data = Buffer.alloc(box.width * box.height * 4);
  for (let y = 0; y < box.height; y++) {
    img.data.copy(
      data,
      y * box.width * 4,
      ((box.y + y) * img.width + box.x) * 4,
      ((box.y + y) * img.width + box.x + box.width) * 4,
    );
  }
  return { width: box.width, height: box.height, data };
}

/** Box-filter resample in premultiplied alpha (see file header for why). */
function resize(img, width, height) {
  const data = Buffer.alloc(width * height * 4);
  const sx = img.width / width;
  const sy = img.height / height;

  for (let y = 0; y < height; y++) {
    const y0 = Math.floor(y * sy);
    const y1 = Math.max(y0 + 1, Math.min(img.height, Math.ceil((y + 1) * sy)));
    for (let x = 0; x < width; x++) {
      const x0 = Math.floor(x * sx);
      const x1 = Math.max(x0 + 1, Math.min(img.width, Math.ceil((x + 1) * sx)));
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let n = 0;
      for (let yy = y0; yy < y1; yy++) {
        for (let xx = x0; xx < x1; xx++) {
          const i = (yy * img.width + xx) * 4;
          const al = img.data[i + 3] / 255;
          r += img.data[i] * al;
          g += img.data[i + 1] * al;
          b += img.data[i + 2] * al;
          a += img.data[i + 3];
          n++;
        }
      }
      const o = (y * width + x) * 4;
      const avgA = a / n;
      const un = avgA > 0 ? 255 / avgA : 0;
      data[o] = Math.min(255, Math.round((r / n) * un));
      data[o + 1] = Math.min(255, Math.round((g / n) * un));
      data[o + 2] = Math.min(255, Math.round((b / n) * un));
      data[o + 3] = Math.round(avgA);
    }
  }
  return { width, height, data };
}

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

/**
 * Places `mark` centred on a `size` x `size` canvas.
 *
 * @param fraction  share of the canvas the mark's longest side occupies.
 * @param background hex fill, or null to keep transparency.
 * @param mono      recolour every pixel white, keeping alpha (Android tints
 *                  small icons and themed icons itself; any colour we bake in is
 *                  discarded, and non-white pixels only muddy the mask).
 */
function compose(mark, { size, fraction, background = null, mono = false }) {
  const scale = (size * fraction) / Math.max(mark.width, mark.height);
  const w = Math.max(1, Math.round(mark.width * scale));
  const h = Math.max(1, Math.round(mark.height * scale));
  const small = resize(mark, w, h);

  const data = Buffer.alloc(size * size * 4);
  if (background) {
    const [br, bg, bb] = hexToRgb(background);
    for (let i = 0; i < size * size; i++) {
      data[i * 4] = br;
      data[i * 4 + 1] = bg;
      data[i * 4 + 2] = bb;
      data[i * 4 + 3] = 255;
    }
  }

  const ox = Math.round((size - w) / 2);
  const oy = Math.round((size - h) / 2);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const s = (y * w + x) * 4;
      const d = ((oy + y) * size + ox + x) * 4;
      const a = small.data[s + 3] / 255;
      if (a === 0) continue;
      const [sr, sg, sb] = mono ? [255, 255, 255] : [small.data[s], small.data[s + 1], small.data[s + 2]];
      if (background) {
        data[d] = Math.round(sr * a + data[d] * (1 - a));
        data[d + 1] = Math.round(sg * a + data[d + 1] * (1 - a));
        data[d + 2] = Math.round(sb * a + data[d + 2] * (1 - a));
        data[d + 3] = 255;
      } else {
        data[d] = sr;
        data[d + 1] = sg;
        data[d + 2] = sb;
        data[d + 3] = small.data[s + 3];
      }
    }
  }
  return { width: size, height: size, data };
}

// ----------------------------------------------------------------- outputs

const ICON_BG = '#ffffff';

/**
 * `fraction` values are not taste — they are the mask each asset is drawn into:
 *  - 0.62 adaptive foreground: Android's safe zone is the centre 66% (72dp of
 *    108dp); anything outside can be clipped by an OEM mask.
 *  - 0.72 legacy/iOS icon: iOS applies a superellipse mask and no padding of its
 *    own, so the mark needs its own breathing room.
 *  - 0.86 splash: expo-splash-screen scales the whole image to `imageWidth`.
 *  - 0.92 notification: Android already insets the 24dp small-icon slot.
 */
const TARGETS = [
  { file: 'assets/icon.png', size: 1024, fraction: 0.72, background: ICON_BG },
  { file: 'assets/adaptive-icon.png', size: 1024, fraction: 0.62 },
  { file: 'assets/adaptive-icon-monochrome.png', size: 1024, fraction: 0.58, mono: true },
  { file: 'assets/splash-icon.png', size: 1024, fraction: 0.86 },
  { file: 'assets/favicon.png', size: 196, fraction: 0.8, background: ICON_BG },
];

/** Android small-icon densities: 24dp at mdpi -> xxxhdpi. */
const NOTIFICATION_DENSITIES = [
  ['mdpi', 24],
  ['hdpi', 36],
  ['xhdpi', 48],
  ['xxhdpi', 72],
  ['xxxhdpi', 96],
];

function write(relative, img, alpha) {
  const out = path.join(ROOT, relative);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, encodePng(img, alpha));
  console.log(
    `  ${relative.padEnd(52)} ${img.width}x${img.height} ${alpha ? 'RGBA' : 'RGB '}`,
  );
}

function main() {
  if (!fs.existsSync(MASTER)) {
    console.error(`Missing ${path.relative(ROOT, MASTER)} — expected 1024x1024 RGBA on transparency.`);
    process.exit(1);
  }

  const master = decodePng(MASTER);
  const box = alphaBounds(master);
  const mark = crop(master, box);
  console.log(
    `logo-master.png ${master.width}x${master.height} — mark bounds ${box.width}x${box.height} at ${box.x},${box.y}\n`,
  );

  for (const t of TARGETS) {
    write(t.file, compose(mark, t), !t.background);
  }

  for (const [density, size] of NOTIFICATION_DENSITIES) {
    write(
      `assets/notification/drawable-${density}/ic_notification.png`,
      compose(mark, { size, fraction: 0.92, mono: true }),
      true,
    );
  }

  console.log('\nNative assets changed — run `npx expo prebuild --clean` then `npx expo run:android`.');
}

main();
