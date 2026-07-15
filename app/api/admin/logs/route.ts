import { NextResponse } from "next/server";
import { requireAdmin, adminForbidden } from "@/lib/admin";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return adminForbidden();

  const logs = await prisma.adminLog.findMany({
    orderBy: { createdAt: "desc" },
    include: { user: { select: { email: true } } },
    take: 200,
  });

  return NextResponse.json({ logs });
}
