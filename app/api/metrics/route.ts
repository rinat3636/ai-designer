import { NextResponse } from "next/server";
import { register } from "@/lib/metrics";

export const dynamic = "force-dynamic";

export async function GET() {
  const metrics = await register.metrics();
  return new NextResponse(metrics, {
    headers: { "Content-Type": register.contentType },
  });
}
