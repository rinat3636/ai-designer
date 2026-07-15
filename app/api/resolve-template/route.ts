import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { resolveTemplateFromText } from "@/lib/llm";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const user = await getSession();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const message = typeof body.message === "string" ? body.message.trim() : "";
    if (!message) {
      return NextResponse.json({ error: "Missing message" }, { status: 400 });
    }

    const templates = await prisma.template.findMany({
      where: { isActive: true },
      select: { id: true, slug: true, name: true, category: true, description: true },
      orderBy: { displayOrder: "asc" },
    });

    const result = await resolveTemplateFromText(message, templates);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Resolve template API error", error);
    return NextResponse.json({ error: "Resolve failed" }, { status: 500 });
  }
}
