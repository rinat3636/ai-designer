import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, adminForbidden } from "@/lib/admin";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return adminForbidden();

  const templates = await prisma.template.findMany({ orderBy: [{ categoryKey: "asc" }, { displayOrder: "asc" }] });
  return NextResponse.json({ templates });
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return adminForbidden();

  try {
    const body = await request.json();
    const template = await prisma.template.create({
      data: {
        slug: body.slug,
        category: body.category,
        categoryKey: body.categoryKey,
        name: body.name,
        description: body.description || "",
        icon: body.icon || "",
        isActive: typeof body.isActive === "boolean" ? body.isActive : true,
        displayOrder: Number(body.displayOrder) || 0,
        fields: body.fields || [],
        promptHints: body.promptHints || null,
      },
    });
    return NextResponse.json({ template }, { status: 201 });
  } catch (error) {
    console.error("Admin template create error", error);
    return NextResponse.json({ error: "Failed to create template" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return adminForbidden();

  try {
    const body = await request.json();
    const { id, ...data } = body;
    if (!id) return NextResponse.json({ error: "Template id required" }, { status: 400 });

    const template = await prisma.template.update({
      where: { id },
      data: {
        ...data,
        displayOrder: typeof data.displayOrder === "number" ? data.displayOrder : undefined,
        isActive: typeof data.isActive === "boolean" ? data.isActive : undefined,
        fields: Array.isArray(data.fields) ? data.fields : undefined,
        promptHints: data.promptHints === null || data.promptHints === undefined ? undefined : data.promptHints,
      },
    });

    return NextResponse.json({ template });
  } catch (error) {
    console.error("Admin template update error", error);
    return NextResponse.json({ error: "Failed to update template" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const admin = await requireAdmin();
  if (!admin) return adminForbidden();

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Template id required" }, { status: 400 });

    await prisma.template.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Admin template delete error", error);
    return NextResponse.json({ error: "Failed to delete template" }, { status: 500 });
  }
}
