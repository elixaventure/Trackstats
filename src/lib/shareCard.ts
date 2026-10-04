import { makeProjector } from "@/domain/geo";
import type { LngLatAlt } from "@/domain/types";

export interface ShareCardData {
  headline: string;
  time: string;
  delta: string | null;
  route: string;
  bike: string;
  number: string;
  rider: string;
  date: string;
  outline: LngLatAlt[];
  appName: string;
}

const W = 1080;
const H = 1350;

/** Draws the result card to a canvas (1080×1350, the 4:5 social format) and returns a PNG blob. */
export async function renderShareCard(d: ShareCardData): Promise<Blob> {
  await Promise.all([
    document.fonts.load('900 200px "Big Shoulders Display"'),
    document.fonts.load('700 100px "IBM Plex Mono"'),
    document.fonts.load('600 40px "Archivo"'),
  ]).catch(() => undefined);
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d")!;

  g.fillStyle = "#0b0d0c";
  g.fillRect(0, 0, W, H);
  // Route outline as a large, faint backdrop.
  drawOutline(g, d.outline, 120, 420, 840, 620, "rgba(255,210,31,0.22)", 14);

  g.fillStyle = "#ffd21f";
  g.fillRect(0, 0, W, 16);
  g.fillStyle = "#ffd21f";
  g.font = '700 40px "IBM Plex Mono", monospace';
  g.fillText(d.headline.toUpperCase(), 80, 150);

  g.fillStyle = "#f3f5ef";
  g.font = '700 230px "IBM Plex Mono", monospace';
  fitText(g, d.time, 80, 400, W - 160);

  if (d.delta) {
    g.fillStyle = "#3ddc84";
    g.font = '700 110px "IBM Plex Mono", monospace';
    g.fillText(d.delta, 80, 540);
  }

  g.fillStyle = "#f3f5ef";
  g.font = '900 120px "Big Shoulders Display", Impact, sans-serif';
  fitText(g, d.route.toUpperCase(), 80, 1080, W - 160);
  g.fillStyle = "#a1aaa3";
  g.font = '600 46px "Archivo", sans-serif';
  g.fillText(`${d.rider}  ·  ${d.bike}`, 80, 1150);
  g.font = '600 36px "IBM Plex Mono", monospace';
  g.fillText(d.date, 80, 1210);

  // Number plate.
  const plateW = 260, plateH = 170, px = W - 80 - plateW, py = 1170 - plateH - 150;
  g.fillStyle = "#ffd21f";
  roundRect(g, px, py, plateW, plateH, 22);
  g.fillStyle = "#111";
  g.font = '900 140px "Big Shoulders Display", Impact, sans-serif';
  g.textAlign = "center";
  g.fillText(`#${d.number}`, px + plateW / 2, py + 135);
  g.textAlign = "left";

  g.fillStyle = "#ffd21f";
  g.font = '900 52px "Big Shoulders Display", Impact, sans-serif';
  g.fillText(d.appName.toUpperCase(), 80, H - 60);

  return new Promise((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error("Canvas export failed"))), "image/png"));
}

function fitText(g: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number) {
  const m = g.measureText(text).width;
  if (m <= maxW) { g.fillText(text, x, y); return; }
  g.save();
  g.translate(x, y);
  g.scale(maxW / m, maxW / m);
  g.fillText(text, 0, 0);
  g.restore();
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
  g.fill();
}

function drawOutline(g: CanvasRenderingContext2D, line: LngLatAlt[], x: number, y: number, w: number, h: number, color: string, width: number) {
  if (line.length < 2) return;
  const proj = makeProjector(line[0]![1], line[0]![0]);
  const pts = line.map((p) => proj.toXy(p[1], p[0]));
  const minX = Math.min(...pts.map((p) => p.x)), maxX = Math.max(...pts.map((p) => p.x));
  const minY = Math.min(...pts.map((p) => p.y)), maxY = Math.max(...pts.map((p) => p.y));
  const s = Math.min(w / (maxX - minX || 1), h / (maxY - minY || 1));
  const ox = x + (w - (maxX - minX) * s) / 2, oy = y + (h - (maxY - minY) * s) / 2;
  g.strokeStyle = color;
  g.lineWidth = width;
  g.lineJoin = "round";
  g.lineCap = "round";
  g.beginPath();
  pts.forEach((p, i) => {
    const px = ox + (p.x - minX) * s, py = oy + (maxY - p.y) * s;
    if (i) g.lineTo(px, py); else g.moveTo(px, py);
  });
  g.stroke();
}
