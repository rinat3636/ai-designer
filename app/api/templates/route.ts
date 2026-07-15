import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const templates = await prisma.template.findMany({
    where: { isActive: true },
    orderBy: [{ categoryKey: "asc" }, { displayOrder: "asc" }],
  });

  return NextResponse.json({ templates });
}
