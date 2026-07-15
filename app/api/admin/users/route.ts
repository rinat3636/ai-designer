import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, adminForbidden } from "@/lib/admin";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return adminForbidden();

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      subscription: { include: { plan: true } },
      _count: { select: { generations: true } },
    },
    take: 200,
  });

  return NextResponse.json({ users });
}

export async function PATCH(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return adminForbidden();

  try {
    const body = await request.json();
    const { id, role, planId } = body;
    if (!id) return NextResponse.json({ error: "User id required" }, { status: 400 });

    await prisma.user.update({
      where: { id },
      data: {
        role: role ?? undefined,
      },
    });

    if (planId) {
      const existing = await prisma.subscription.findUnique({ where: { userId: id } });
      if (existing) {
        await prisma.subscription.update({
          where: { userId: id },
          data: { planId, isActive: true },
        });
      } else {
        await prisma.subscription.create({
          data: { userId: id, planId, isActive: true },
        });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Admin user update error", error);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}
