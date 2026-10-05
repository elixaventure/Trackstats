// Make a batch of single-use Pro codes for one track, with printable QR cards.
//
//   npm run track-codes -- "Bacup MX"
//   npm run track-codes -- "Bacup MX" --count 5 --months 12
//
// Writes to promo-private/<track>/ (git-ignored, because this repo is public):
//   seed.sql   paste into the Supabase SQL Editor to make the codes live
//   codes.txt  the codes and claim links, to send by message
//   cards.pdf  A4 sheet of business-card-size QR cards to print and cut
//
// Each track is its own campaign: its codes work once each, a rider can claim
// one per track, and when they're gone there are no more for that track.
import { randomInt } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import QR from "qrcode";
import { chromium } from "playwright";

const APP_URL = "https://elixaventure.github.io/Trackstats";
// No 0/O, 1/I/L: codes get read off cards and typed.
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const track = args.find((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--"));
if (!track) {
  console.error('Usage: npm run track-codes -- "Track Name" [--count 5] [--months 12]');
  process.exit(1);
}
const count = Number(opt("count", 5));
const months = Number(opt("months", 12));
if (!(count >= 1 && count <= 200) || !(months >= 1 && months <= 120)) {
  console.error("--count must be 1-200 and --months 1-120.");
  process.exit(1);
}

const campaign = track.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const prefix = (track.split(/\s+/)[0].toUpperCase().replace(/[^A-Z0-9]/g, "") || "TRACK").slice(0, 8);
const shortName = track.split(/\s+/)[0];
const group = () => Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join("");
const codes = new Set();
while (codes.size < count) codes.add(`${prefix}-${group()}-${group()}`);
const list = [...codes];
const claimUrl = (c) => `${APP_URL}/redeem?code=${c}`;

const dir = path.resolve("promo-private", campaign);
fs.mkdirSync(dir, { recursive: true });

const sqlText = (s) => `'${s.replace(/'/g, "''")}'`;
fs.writeFileSync(path.join(dir, "seed.sql"), `-- ${track}: ${count} single-use codes, ${months} months of Pro each.
-- PRIVATE. Paste into the Supabase SQL Editor and press Run. Safe to run twice.
insert into public.promo_codes (code, campaign, pro_months) values
${list.map((c) => `  (${sqlText(c)}, ${sqlText(campaign)}, ${months})`).join(",\n")}
on conflict (code) do nothing;

-- Check: ${count} codes, none used yet.
select code, redeemed_at from public.promo_codes where campaign = ${sqlText(campaign)} order by code;
`);

fs.writeFileSync(path.join(dir, "codes.txt"), `TrackStats × ${track}: ${count} test rider codes (PRIVATE)
Each gives ${months} months of Pro. One use per code, one code per rider.

${list.map((c, i) => `${String(i + 1).padStart(2, "0")}  ${c}  ${claimUrl(c)}`).join("\n")}
`);

const logo = `<svg viewBox="0 0 512 512" class="logo"><rect width="512" height="512" rx="96" fill="#0b0d0c"/><rect x="72" y="104" width="368" height="304" rx="40" fill="#ffd21f"/><path d="M128 330 L224 236 L284 290 L392 170" fill="none" stroke="#0b0d0c" stroke-width="44" stroke-linecap="round" stroke-linejoin="round"/><path d="M332 166 H396 V230" fill="none" stroke="#0b0d0c" stroke-width="44" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const esc = (s) => s.replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[ch]);
const pad = (n) => String(n).padStart(2, "0");
const cards = await Promise.all(list.map(async (c, i) => {
  const qr = await QR.toString(claimUrl(c), { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#0b0d0c", light: "#ffffff" } });
  return `<div class="card"><div class="l">
    <div class="brand">${logo}<span>TrackStats</span></div>
    <div class="x">× ${esc(track)} · ${pad(i + 1)} of ${pad(count)}</div>
    <div class="big">Test rider<br><span>${months} months Pro free</span></div>
    <div class="code">${c}</div>
    <div class="fine">Prototype lap timer. Scan, sign up, time your laps at ${esc(shortName)}, tell us what breaks. One use only.</div>
  </div><div class="qr">${qr}</div></div>`;
}));
// FONT_CSS: a local stylesheet to use instead of Google Fonts (for offline renders).
const fontLink = process.env.FONT_CSS
  ? `<link rel="stylesheet" href="file://${path.resolve(process.env.FONT_CSS)}">`
  : `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow:wght@400;500&family=Barlow+Condensed:wght@700;800;900&display=block">`;
const html = `<!doctype html><html><head><meta charset="utf-8">${fontLink}<style>
@page { size: A4; margin: 13.5mm 20mm; }
body { margin: 0; font-family: "Barlow", Arial, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.sheet { display: grid; grid-template-columns: 85mm 85mm; grid-auto-rows: 54mm; }
.card { width: 85mm; height: 54mm; background: #0b0d0c; color: #f3f5ef; position: relative; display: grid; grid-template-columns: 1fr 26mm; gap: 3mm; padding: 4mm 4mm 3.5mm 4.5mm; box-sizing: border-box; outline: 0.2mm dashed #9aa49d; overflow: hidden; break-inside: avoid;
  background-image: radial-gradient(60mm 40mm at 110% -20%, rgba(255,210,31,0.16), transparent 60%); }
.l { display: flex; flex-direction: column; gap: 1mm; min-width: 0; }
.brand { display: flex; align-items: center; gap: 1.6mm; }
.logo { width: 6mm; height: 6mm; }
.brand span, .x, .big, .code { font-family: "Barlow Condensed", Arial, sans-serif; text-transform: uppercase; }
.brand span { font-weight: 900; font-size: 13pt; letter-spacing: 0.02em; }
.x { font-weight: 700; font-size: 8pt; letter-spacing: 0.14em; color: #ffd21f; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.big { font-weight: 900; font-size: 19pt; line-height: 0.88; margin-top: 1mm; }
.big span { font-size: 12.5pt; display: inline-block; background: #ffd21f; color: #0b0d0c; padding: 0.6mm 1.6mm 0; border-radius: 1.2mm; margin-top: 0.8mm; }
.code { font-weight: 800; font-size: 11pt; letter-spacing: 0.06em; margin-top: auto; text-transform: none; }
.fine { font-size: 5.8pt; line-height: 1.25; color: #9aa49d; }
.qr { align-self: center; background: #fff; border-radius: 1.6mm; padding: 1mm; }
.qr svg { width: 100%; height: auto; display: block; }
</style></head><body><div class="sheet">${cards.join("")}</div></body></html>`;
const htmlPath = path.join(dir, "cards.html");
fs.writeFileSync(htmlPath, html);

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(`file://${htmlPath}`);
await page.evaluate(() => document.fonts.ready);
const fontsOk = await page.evaluate(() => document.fonts.check('900 19pt "Barlow Condensed"'));
await page.pdf({ path: path.join(dir, "cards.pdf"), format: "A4", printBackground: true });
await browser.close();

console.log(`${track}: ${count} codes, ${months} months each, campaign "${campaign}".`);
console.log(`Files in ${path.relative(process.cwd(), dir)}/: seed.sql, codes.txt, cards.pdf`);
if (!fontsOk) console.log("Note: the card font didn't load, so the PDF uses Arial. Check your connection and run again.");
console.log("Next: paste seed.sql into the Supabase SQL Editor and press Run.");
