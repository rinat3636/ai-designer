import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { recordLike, recordDislike, recordEditOutcome, getProjectMemory } from "@/lib/memory";

export async function GET() {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const memory = await getProjectMemory(user.id);
    return NextResponse.json({ memory });
  } catch (error) {
    console.error("Memory GET error", error);
    return NextResponse.json({ error: "Failed to load memory" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!rateLimit(`memory:${user.id}`, 30, 60_000)) return rateLimitResponse();

  try {
    const body = await request.json();
    const { action, payload } = body;

    switch (action) {
      case "like":
      case "favorite": {
        await recordLike(user.id, payload);
        break;
      }
      case "dislike": {
        await recordDislike(user.id, payload.pattern, payload.reason);
        break;
      }
      case "edit": {
        await recordEditOutcome(user.id, payload);
        break;
      }
      case "revert": {
        await recordEditOutcome(user.id, { ...payload, outcome: "revert" });
        break;
      }
      case "winner": {
        await recordLike(user.id, { ...payload, reason: payload.reason || "winner in comparison" });
        break;
      }
      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Memory POST error", error);
    return NextResponse.json({ error: "Failed to record memory" }, { status: 500 });
  }
}
