// Builds the responsive images from the sources kept in _src/ (out of git):
//   _src/insta/  the company's own Instagram posts, at the resolution Instagram serves (photographs by the company)
//   _src/odoo/   the four visuals that only exist on the current site (crushed ice, dry ice, gourmet bags, ice slab)
// Run with `npm run images`. Output: public/img/*, content/images.manifest.json.
// A picture is only cropped and resized (never enlarged, never retouched) and re-encoded as AVIF + WebP.
import { mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import sharp from 'sharp';

const root = resolve(import.meta.dirname, '..');
const insta = (date) => resolve(root, '_src/insta', `${date}.jpg`);
const odoo = (name) => resolve(root, '_src/odoo', name);
const out = (p) => resolve(root, 'public', p);

/** id → source, optional crop [left, top, width, height] as fractions of the source, focal point for object-position */
const IMAGES = {
  // clear ice in the sun, on the blue paper
  'cube-sun': { file: insta('2026-03-05_21-30-52_UTC'), focal: '46% 52%' },
  'ball-sun': { file: insta('2026-03-10_20-00-25_UTC'), focal: '50% 55%' },
  'stick-sun': { file: insta('2026-09-13_17-00-46_UTC_3'), crop: [0.02, 0, 0.53, 1], focal: '50% 26%' },
  'cube-pure': { file: insta('2026-09-13_17-00-46_UTC_1'), crop: [0.0, 0.04, 0.6, 0.96], focal: '40% 50%' },
  // at the bar, on black
  'cube-tongs': { file: insta('2026-06-11_18-14-31_UTC'), focal: '50% 40%' },
  'cube-whisky': { file: insta('2026-03-13_17-01-51_UTC'), focal: '50% 40%' },
  'cube-glove': { file: insta('2026-03-19_22-30-44_UTC'), focal: '62% 50%' },
  'cube-served': { file: insta('2026-06-02_19-00-46_UTC'), focal: '50% 55%' },
  'stick-bar': { file: insta('2026-06-09_17-34-22_UTC'), focal: '50% 42%' },
  'ball-whisky': { file: insta('2026-06-28_22-21-51_UTC'), focal: '50% 55%' },
  // made to measure
  'rose-tongs': { file: insta('2026-03-17_20-00-15_UTC'), focal: '50% 36%' },
  'rose-pour': { file: insta('2026-07-08_18-25-05_UTC_1'), focal: '50% 50%' },
  'rose-glass': { file: insta('2026-07-08_18-25-05_UTC_2'), focal: '50% 45%' },
  'berry': { file: insta('2026-08-15_10-29-24_UTC_1'), focal: '50% 40%' },
  'berry-top': { file: insta('2026-08-15_10-29-24_UTC_2'), focal: '50% 45%' },
  'white-rose': { file: insta('2026-08-29_13-28-22_UTC_1'), focal: '50% 42%' },
  'white-rose-pour': { file: insta('2026-08-29_13-28-22_UTC_2'), focal: '50% 42%' },
  // the signature
  'stamp-press': { file: insta('2026-08-04_19-23-47_UTC'), focal: '50% 55%' },
  'stamp-set': { file: insta('2026-09-13_17-00-46_UTC_1'), focal: '55% 55%' },
  'stamp-cube': { file: insta('2026-09-13_17-00-46_UTC_2'), focal: '50% 55%' },
  // events (Instagram band only)
  'event-block': { file: insta('2026-09-05_18-49-55_UTC_2'), focal: '50% 45%' },
  // for the service
  'gourmet-bags': { file: odoo('gourmet-bags.png'), focal: '50% 55%' },
  'crushed': { file: odoo('crushed-ice.jpg'), focal: '50% 60%' },
  'dry-pile': { file: odoo('dry-ice-pile.png'), focal: '50% 60%' },
  'slab': { file: odoo('ice-slab.jpg'), focal: '50% 62%' },
};
const WIDTHS = [420, 760, 1200, 1700];

// `node scripts/images.mjs cube-pure stick-sun` rebuilds only those pictures (the others and their manifest entries are kept)
const only = process.argv.slice(2);
const manifest = only.length ? JSON.parse(await readFile(resolve(root, 'content/images.manifest.json'), 'utf8')) : {};
await mkdir(out('img'), { recursive: true });
// a full run starts from an empty folder, so the build only ships what is shown
for (const f of await readdir(out('img'))) if (/\.(avif|webp)$/.test(f) && (!only.length || only.some((id) => f.startsWith(`${id}-`)))) await rm(out(`img/${f}`));

for (const [id, cfg] of Object.entries(IMAGES)) {
  if (only.length && !only.includes(id)) continue;
  const meta = await sharp(cfg.file).metadata();
  let region = null;
  if (cfg.crop) {
    const [l, t, w, h] = cfg.crop;
    region = { left: Math.round(l * meta.width), top: Math.round(t * meta.height), width: Math.round(w * meta.width), height: Math.round(h * meta.height) };
    region.width = Math.min(region.width, meta.width - region.left); region.height = Math.min(region.height, meta.height - region.top);
  }
  const width = region ? region.width : meta.width, height = region ? region.height : meta.height;
  const base = () => (region ? sharp(cfg.file).extract(region) : sharp(cfg.file));
  const widths = [...new Set(WIDTHS.map((w) => Math.min(w, width)))].sort((a, b) => a - b);
  for (const w of widths) {
    await base().resize({ width: w, withoutEnlargement: true }).avif({ quality: 56, effort: 5 }).toFile(out(`img/${id}-${w}.avif`));
    await base().resize({ width: w, withoutEnlargement: true }).webp({ quality: 82 }).toFile(out(`img/${id}-${w}.webp`));
  }
  // the colour of the backdrop along the edges of the picture: lets a section take the same paper
  const { data } = await base().resize(24, 24, { fit: 'fill' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const px = (x, y) => [0, 1, 2].map((c) => data[(y * 24 + x) * 3 + c]);
  const hex = (rgb) => '#' + rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
  const avg = (pts) => hex([0, 1, 2].map((c) => pts.reduce((s, p) => s + p[c], 0) / pts.length));
  manifest[id] = { w: width, h: height, widths, focal: cfg.focal, top: avg([px(2, 1), px(12, 1), px(21, 1)]), left: avg([px(1, 4), px(1, 12)]) };
  console.log(id.padEnd(18), `${width}x${height}`, widths.join(', '), manifest[id].top);
}
manifest.logo = { w: 640, h: 485 };
await writeFile(resolve(root, 'content/images.manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

// social share image 1200x630: the clear cube in the sun, logo on the left
const logo = await sharp(out('brand/logo.webp')).resize({ height: 250 }).toBuffer();
const bg = await sharp(IMAGES['cube-sun'].file).resize(1200, 1200).extract({ left: 0, top: 300, width: 1200, height: 630 }).toBuffer();
const veil = Buffer.from('<svg width="1200" height="630"><defs><linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="#a9d9f3" stop-opacity="0.96"/><stop offset="0.42" stop-color="#a9d9f3" stop-opacity="0.7"/><stop offset="0.7" stop-color="#a9d9f3" stop-opacity="0"/></linearGradient></defs><rect width="1200" height="630" fill="url(#g)"/></svg>');
await sharp(bg).composite([{ input: veil }, { input: logo, left: 80, top: 190 }]).jpeg({ quality: 84, mozjpeg: true }).toFile(out('img/og.jpg'));
console.log('og'.padEnd(18), 'ok');
