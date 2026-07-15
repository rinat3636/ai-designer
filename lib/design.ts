export function parseUserSize(sizeInput: string | undefined): { width: number; height: number } | null {
  if (!sizeInput) return null;
  const clean = sizeInput.replace(/\s/g, "").toLowerCase();
  const match = clean.match(/^(\d+)[x×](\d+)$/);
  if (!match) return null;
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!width || !height || width > 10000 || height > 10000) return null;
  return { width, height };
}

export function getViewBoxForTemplate(slug: string): string {
  if (slug.includes("stories") || slug.includes("site-icons")) return "0 0 1080 1920";
  if (slug.includes("billboard") || slug.includes("hero") || slug.includes("site-promo")) return "0 0 1920 1080";
  if (slug.includes("carousel") || slug.includes("post")) return "0 0 1080 1080";
  if (slug.includes("business-card")) return "0 0 1050 600";
  if (slug.includes("logo")) return "0 0 1024 1024";
  if (slug.includes("shop-cover") || slug.includes("community-cover")) return "0 0 1920 640";
  return "0 0 1024 1024";
}
