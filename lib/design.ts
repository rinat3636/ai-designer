import { DesignGenerationInput } from "./llm";

export function getViewBoxForTemplate(slug: string): string {
  if (slug.includes("stories") || slug.includes("site-icons")) return "0 0 1080 1920";
  if (slug.includes("billboard") || slug.includes("hero") || slug.includes("site-promo")) return "0 0 1920 1080";
  if (slug.includes("carousel") || slug.includes("post")) return "0 0 1080 1080";
  if (slug.includes("business-card")) return "0 0 1050 600";
  if (slug.includes("logo")) return "0 0 1024 1024";
  if (slug.includes("shop-cover") || slug.includes("community-cover")) return "0 0 1920 640";
  return "0 0 1024 1024";
}

export function placeholderSVG(input: DesignGenerationInput, variantIndex = 0): string {
  const { brief, concept, data, template, viewBox } = input;
  const [, , w, h] = viewBox.split(" ").map(Number);
  const colors = concept.palette.length >= 3 ? concept.palette : ["#2563eb", "#f8fafc", "#0f172a"];
  const [c1, c2, c3, c4] = [
    colors[0],
    colors[1] || "#ffffff",
    colors[2] || colors[0],
    colors[3] || "#000000",
  ];

  const headline = String(data.headline || data.productName || brief.companyName || template.name);
  const subheadline = String(data.subheadline || data.productDesc || brief.businessDesc || concept.name);
  const discount = data.discount || data.oldPrice || "";
  const cta = data.buttonText || "Подробнее";

  const seed = variantIndex * 137;
  const rand = (n: number) => Math.abs((Math.sin(seed + n) * 10000) % 1);

  const accentX = 50 + rand(1) * (w - 400);
  const accentY = 80 + rand(2) * (h - 400);
  const accentRot = Math.floor(rand(3) * 360);
  const textAligns = ["start", "middle", "end"];
  const align = textAligns[variantIndex % 3];
  const tx = align === "start" ? 80 : align === "end" ? w - 80 : w / 2;

  const gradientId = `grad-${variantIndex}`;
  const defs = `
    <defs>
      <linearGradient id="${gradientId}" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${c1}" />
        <stop offset="100%" stop-color="${c2}" />
      </linearGradient>
      <filter id="shadow-${variantIndex}" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="8" stdDeviation="10" flood-color="${c4}" flood-opacity="0.15" />
      </filter>
    </defs>
  `;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="${w}" height="${h}">
  ${defs}
  <rect width="${w}" height="${h}" fill="url(#${gradientId})" />
  <g transform="rotate(${accentRot} ${w / 2} ${h / 2})" opacity="0.08">
    <circle cx="${accentX}" cy="${accentY}" r="${Math.min(w, h) * 0.35}" fill="${c3}" />
    <rect x="${accentX - 100}" y="${accentY - 100}" width="${Math.min(w, h) * 0.5}" height="${Math.min(w, h) * 0.5}" fill="${c4}" />
  </g>
  ${discount ? `<circle cx="${w - 140}" cy="140" r="90" fill="${c4}" filter="url(#shadow-${variantIndex})" />
  <text x="${w - 140}" y="150" text-anchor="middle" fill="${c2}" font-size="42" font-family="sans-serif" font-weight="700" dominant-baseline="middle">${escapeXml(discount)}</text>` : ""}
  <text x="${tx}" y="${h * 0.38}" text-anchor="${align === "middle" ? "middle" : align}" fill="${c4}" font-size="${Math.min(w, h) * 0.085}" font-family="sans-serif" font-weight="800">${escapeXml(headline.slice(0, 40))}</text>
  <text x="${tx}" y="${h * 0.55}" text-anchor="${align === "middle" ? "middle" : align}" fill="${c4}" opacity="0.85" font-size="${Math.min(w, h) * 0.04}" font-family="sans-serif">${escapeXml(subheadline.slice(0, 80))}</text>
  <rect x="${tx - (align === "middle" ? 120 : 0)}" y="${h * 0.68}" width="240" height="64" rx="32" fill="${c4}" filter="url(#shadow-${variantIndex})" />
  <text x="${tx + (align === "middle" ? 0 : 120)}" y="${h * 0.68 + 42}" text-anchor="middle" fill="${c2}" font-size="28" font-family="sans-serif" font-weight="600">${escapeXml(cta)}</text>
  ${brief.companyName ? `<text x="${w / 2}" y="${h - 60}" text-anchor="middle" fill="${c4}" opacity="0.6" font-size="24" font-family="sans-serif">${escapeXml(brief.companyName)}</text>` : ""}
</svg>`;
}

function escapeXml(text: string): string {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
