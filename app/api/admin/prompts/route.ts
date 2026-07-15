import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, adminForbidden } from "@/lib/admin";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return adminForbidden();

  const prompts = await prisma.promptConfig.findMany({ orderBy: { key: "asc" } });
  return NextResponse.json({ prompts });
}

export async function PUT(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return adminForbidden();

  try {
    const body = await request.json();
    const { key, prompt, description } = body;
    if (!key) return NextResponse.json({ error: "Prompt key required" }, { status: 400 });

    const updated = await prisma.promptConfig.upsert({
      where: { key },
      update: { prompt, description },
      create: { key, prompt, description },
    });

    return NextResponse.json({ prompt: updated });
  } catch (error) {
    console.error("Admin prompt update error", error);
    return NextResponse.json({ error: "Failed to update prompt" }, { status: 500 });
  }
}
