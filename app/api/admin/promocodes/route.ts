import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, adminForbidden } from "@/lib/admin";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return adminForbidden();

  const promocodes = await prisma.promoCode.findMany({ orderBy: { createdAt: "desc" } });
  return NextResponse.json({ promocodes });
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return adminForbidden();

  try {
    const body = await request.json();
    const promocode = await prisma.promoCode.create({
      data: {
        code: body.code,
        maxUses: body.maxUses ? Number(body.maxUses) : null,
        bonusGenerations: Number(body.bonusGenerations) || 0,
        upgradePlanTo: body.upgradePlanTo || null,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
      },
    });
    return NextResponse.json({ promocode }, { status: 201 });
  } catch (error) {
    console.error("Admin promocode create error", error);
    return NextResponse.json({ error: "Failed to create promocode" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return adminForbidden();

  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get("code");
    if (!code) return NextResponse.json({ error: "Code required" }, { status: 400 });

    await prisma.promoCode.delete({ where: { code } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Admin promocode delete error", error);
    return NextResponse.json({ error: "Failed to delete promocode" }, { status: 500 });
  }
}
