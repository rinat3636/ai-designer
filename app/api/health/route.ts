import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    uptime_ms: Math.floor(process.uptime() * 1000),
    timestamp: new Date().toISOString(),
  });
}
