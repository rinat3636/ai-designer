import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import sharp from "sharp";
import { getSession } from "@/lib/auth";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { sanitizeSvg } from "@/lib/sanitize";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

const ALLOWED_EXT: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/svg+xml": ".svg",
};

export async function POST(request: Request) {
  const user = await getSession();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!rateLimit(`upload:${user.id}`, 20, 60_000)) return rateLimitResponse();

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "Файл слишком большой (максимум 10 МБ)" }, { status: 413 });
    }

    const bytes = await file.arrayBuffer();
    let buffer = Buffer.from(bytes);

    const isSvg =
      file.type === "image/svg+xml" || buffer.subarray(0, 512).toString("utf-8").includes("<svg");

    let ext: string;
    if (isSvg) {
      ext = ".svg";
      buffer = Buffer.from(sanitizeSvg(buffer.toString("utf-8")), "utf-8");
    } else {
      // Validate raster content with sharp, not just the declared mime type.
      let format: string | undefined;
      try {
        format = (await sharp(buffer).metadata()).format;
      } catch {
        format = undefined;
      }
      const formatToMime: Record<string, string> = {
        png: "image/png",
        jpeg: "image/jpeg",
        webp: "image/webp",
      };
      const mime = format ? formatToMime[format] : undefined;
      if (!mime || !ALLOWED_EXT[mime]) {
        return NextResponse.json(
          { error: "Недопустимый формат файла. Разрешены: PNG, JPG, WEBP, SVG" },
          { status: 415 }
        );
      }
      ext = ALLOWED_EXT[mime];
    }

    const fileName = `${randomUUID()}${ext}`;
    const dir = path.join(process.cwd(), "public", "uploads");
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, fileName), buffer);

    let width = 0;
    let height = 0;
    try {
      const metadata = await sharp(buffer).metadata();
      width = metadata.width || 0;
      height = metadata.height || 0;
    } catch {
      // ignore
    }

    return NextResponse.json({ url: `/uploads/${fileName}`, width, height });
  } catch (e: any) {
    console.error("Upload error", e);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
