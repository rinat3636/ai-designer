import { NextResponse } from "next/server";
import { requireAdmin, adminForbidden } from "@/lib/admin";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return adminForbidden();

  const [users, generations, templates, plans, logs, promocodes] = await Promise.all([
    prisma.user.count(),
    prisma.generation.count(),
    prisma.template.count(),
    prisma.subscriptionPlan.count(),
    prisma.adminLog.count(),
    prisma.promoCode.count(),
  ]);

  return NextResponse.json({ users, generations, templates, plans, logs, promocodes });
}
