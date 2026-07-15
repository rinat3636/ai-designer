import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { generateConcepts, type Brief } from "@/lib/llm";

export async function POST(request: NextRequest) {
  const user = await getSession();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const brief = body.brief as Brief;
    if (!brief || !brief.companyName || !brief.businessDesc) {
      return NextResponse.json({ error: "Brief is incomplete" }, { status: 400 });
    }

    const concepts = await generateConcepts(brief);
    return NextResponse.json({ concepts });
  } catch (error) {
    console.error("Concepts API error", error);
    return NextResponse.json({ error: "Failed to generate concepts" }, { status: 500 });
  }
}
