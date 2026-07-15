import sharp from "sharp";

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function wrapLine(line: string, maxChars: number): string[] {
  if (line.length <= maxChars) return [line];
  const words = line.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if ((current + " " + word).trim().length > maxChars) {
      if (current) lines.push(current.trim());
      current = word.length > maxChars ? word.slice(0, maxChars) : word;
    } else {
      current = current ? current + " " + word : word;
    }
  }
  if (current) lines.push(current.trim());
  return lines;
}

export async function promptToPngDataUrl(
  prompt: string,
  viewBox: string
): Promise<string> {
  const parts = viewBox.split(/\s+/).map(Number);
  const vw = parts[2] || 1024;
  const vh = parts[3] || 1024;

  // Pick canvas shape based on output aspect ratio. Avoid a square canvas
  // because tests showed 800×800 was much slower/more expensive; a landscape
  // or portrait 800×600/600×800 canvas reads reliably and cheaply.
  let W = 800;
  let H = 600;
  if (vh > vw * 1.2) {
    W = 600;
    H = 800;
  }

  const padding = 24;
  // Compute a font size that lets the full prompt fit vertically.
  let fontSize = Math.max(16, Math.min(26, Math.floor((H - padding * 2) / 24)));

  const rawLines = prompt.split("\n");
  const charWidth = fontSize * 0.55; // rough average for Liberation Sans
  const maxCharsPerLine = Math.max(30, Math.floor((W - padding * 2) / charWidth));

  let lines: string[] = [];
  for (const line of rawLines) {
    const wrapped = wrapLine(line, maxCharsPerLine);
    lines.push(...wrapped);
  }

  // Shrink font if there are too many lines.
  while (lines.length * (fontSize + 8) > H - padding * 2 && fontSize > 12) {
    fontSize -= 1;
    const newMaxChars = Math.max(30, Math.floor((W - padding * 2) / (fontSize * 0.55)));
    lines = [];
    for (const line of rawLines) {
      lines.push(...wrapLine(line, newMaxChars));
    }
  }

  const lineHeight = fontSize + 8;
  const startY = padding + fontSize;
  const textEls = lines
    .map(
      (l, i) =>
        `<text x="${padding}" y="${startY + i * lineHeight}" font-family="Liberation Sans, DejaVu Sans, sans-serif" font-size="${fontSize}" fill="#0f172a">${escapeXml(l)}</text>`
    )
    .join("");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <rect width="${W}" height="${H}" fill="#f8fafc"/>
    ${textEls}
  </svg>`;

  const png = await sharp(Buffer.from(svg), { density: 72 }).png().toBuffer();
  const b64 = png.toString("base64");
  return `data:image/png;base64,${b64}`;
}
