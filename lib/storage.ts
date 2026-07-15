import fs from "fs";
import path from "path";

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
