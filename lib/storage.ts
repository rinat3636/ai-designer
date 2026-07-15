import fs from "fs";
import path from "path";
import sharp from "sharp";

export function saveSvg(generationId: string, imageId: string, svg: string): string {
  const dir = path.join(process.cwd(), "public", "generated", generationId);
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, `${imageId}.svg`);
  fs.writeFileSync(filePath, svg, "utf-8");
  return `/generated/${generationId}/${imageId}.svg`;
}

export function removeGenerationFiles(generationId: string) {
  const dir = path.join(process.cwd(), "public", "generated", generationId);
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

export async function readLocalImageSize(url: string): Promise<{ width: number; height: number } | null> {
  if (!url || (!url.startsWith("/generated/") && !url.startsWith("/uploads/"))) return null;
  try {
    const meta = await sharp(path.join(process.cwd(), "public", url)).metadata();
    if (meta.width && meta.height) return { width: meta.width, height: meta.height };
    return null;
  } catch (e) {
    console.warn("Failed to read image size", url, e);
    return null;
  }
}

export function readLocalSvg(url: string): string | null {
  if (!url || (!url.startsWith("/generated/") && !url.startsWith("/uploads/"))) return null;
  try {
    const filePath = path.join(process.cwd(), "public", url);
    const content = fs.readFileSync(filePath, "utf-8");
    return content.includes("<svg") ? content : null;
  } catch (e) {
    console.error("Failed to read local SVG", url, e);
    return null;
  }
}
