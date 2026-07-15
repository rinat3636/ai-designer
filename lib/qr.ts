import QRCode from "qrcode";
import { findElementById } from "./svg-edit";

// Replaces the <rect id="qr"> placeholder with a real, scannable QR code
// generated programmatically, positioned and sized to match the placeholder.
export async function injectQrCode(svg: string, url: string): Promise<string> {
  const loc = findElementById(svg, "qr");
  if (!loc) return svg;

  const placeholder = svg.slice(loc.start, loc.end);
  const num = (attr: string): number | null => {
    const m = placeholder.match(new RegExp(`\\b${attr}\\s*=\\s*"(-?[\\d.]+)"`));
    return m ? Number(m[1]) : null;
  };
  const x = num("x");
  const y = num("y");
  const width = num("width");
  const height = num("height");
  if (x === null || y === null || !width || !height) return svg;

  let matrix: { size: number; data: Uint8Array };
  try {
    const code = QRCode.create(url, { errorCorrectionLevel: "M" });
    matrix = { size: code.modules.size, data: code.modules.data as Uint8Array };
  } catch {
    return svg;
  }

  const side = Math.min(width, height);
  const quiet = 1;
  const total = matrix.size + quiet * 2;
  const cell = side / total;
  const offsetX = x + (width - side) / 2;
  const offsetY = y + (height - side) / 2;

  let d = "";
  for (let row = 0; row < matrix.size; row++) {
    for (let col = 0; col < matrix.size; col++) {
      if (matrix.data[row * matrix.size + col]) {
        const cx = (offsetX + (col + quiet) * cell).toFixed(2);
        const cy = (offsetY + (row + quiet) * cell).toFixed(2);
        d += `M${cx} ${cy}h${cell.toFixed(2)}v${cell.toFixed(2)}h-${cell.toFixed(2)}z`;
      }
    }
  }

  const qrGroup =
    `<g id="qr">` +
    `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="#ffffff"/>` +
    `<path d="${d}" fill="#000000"/>` +
    `</g>`;

  return svg.slice(0, loc.start) + qrGroup + svg.slice(loc.end);
}
