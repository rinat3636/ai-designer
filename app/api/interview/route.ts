import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";
import { chatInterview } from "@/lib/llm";

export const maxDuration = 120;

export async function POST(request: NextRequest) {
  const user = await getSession();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!rateLimit(`interview:${user.id}`, 30, 60_000)) return rateLimitResponse();

  try {
    const body = await request.json();
    const { messages, templateId, currentData } = body;

    if (!templateId || !Array.isArray(messages)) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    const template = await prisma.template.findUnique({
      where: { id: templateId },
    });

    if (!template) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    const memory = await prisma.projectMemory.findUnique({ where: { userId: user.id } });
    const result = await chatInterview(messages, template, currentData || {}, memory);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Interview API error", error);
    return NextResponse.json({ error: "Interview failed" }, { status: 500 });
  }
}
