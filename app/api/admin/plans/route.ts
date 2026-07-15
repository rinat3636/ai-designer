import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, adminForbidden } from "@/lib/admin";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return adminForbidden();

  const plans = await prisma.subscriptionPlan.findMany({ orderBy: { displayOrder: "asc" } });
  return NextResponse.json({ plans });
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return adminForbidden();

  try {
    const body = await request.json();
    const plan = await prisma.subscriptionPlan.create({
      data: {
        slug: body.slug,
        name: body.name,
        description: body.description || "",
        priceMonthly: Number(body.priceMonthly) || 0,
        monthlyLimit: Number(body.monthlyLimit) || 0,
        features: body.features || [],
        isActive: typeof body.isActive === "boolean" ? body.isActive : true,
        displayOrder: Number(body.displayOrder) || 0,
      },
    });
    return NextResponse.json({ plan }, { status: 201 });
  } catch (error) {
    console.error("Admin plan create error", error);
    return NextResponse.json({ error: "Failed to create plan" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return adminForbidden();

  try {
    const body = await request.json();
    const { id, ...data } = body;
    if (!id) return NextResponse.json({ error: "Plan id required" }, { status: 400 });

    const plan = await prisma.subscriptionPlan.update({
      where: { id },
      data: {
        ...data,
        priceMonthly: typeof data.priceMonthly === "number" ? data.priceMonthly : undefined,
        monthlyLimit: typeof data.monthlyLimit === "number" ? data.monthlyLimit : undefined,
        displayOrder: typeof data.displayOrder === "number" ? data.displayOrder : undefined,
        features: Array.isArray(data.features) ? data.features : undefined,
        isActive: typeof data.isActive === "boolean" ? data.isActive : undefined,
      },
    });

    return NextResponse.json({ plan });
  } catch (error) {
    console.error("Admin plan update error", error);
    return NextResponse.json({ error: "Failed to update plan" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return adminForbidden();

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Plan id required" }, { status: 400 });

    await prisma.subscriptionPlan.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Admin plan delete error", error);
    return NextResponse.json({ error: "Failed to delete plan" }, { status: 500 });
  }
}
