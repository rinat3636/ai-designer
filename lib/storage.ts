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
