import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";
import { generateConcepts, type Brief } from "@/lib/llm";

export async function POST(request: NextRequest) {
  const user = await getSession();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!rateLimit(`concepts:${user.id}`, 10, 60_000)) return rateLimitResponse();

  try {
    const body = await request.json();
    const brief = body.brief as Brief;
    if (!brief || !brief.companyName || !brief.businessDesc) {
      return NextResponse.json({ error: "Brief is incomplete" }, { status: 400 });
    }

    let template = null;
    if (body.templateId) {
      template = await prisma.template.findUnique({ where: { id: body.templateId } });
    }

    const result = await generateConcepts(brief, template);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Concepts API error", error);
    return NextResponse.json({ error: "Failed to generate concepts" }, { status: 500 });
  }
}
