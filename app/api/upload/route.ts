import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const originalName = file.name || "upload";
    const ext = path.extname(originalName) || ".png";
    const safeExt = ext.replace(/[^a-zA-Z0-9.]/g, "");
    const fileName = `${randomUUID()}${safeExt}`;

    const dir = path.join(process.cwd(), "public", "uploads");
    await mkdir(dir, { recursive: true });

    const filePath = path.join(dir, fileName);
    await writeFile(filePath, buffer);

    return NextResponse.json({ url: `/uploads/${fileName}` });
  } catch (e: any) {
    console.error("Upload error", e);
    return NextResponse.json({ error: e.message || "Upload failed" }, { status: 500 });
  }
}
