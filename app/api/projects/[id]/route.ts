import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { removeGenerationFiles } from "@/lib/storage";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const generation = await prisma.generation.findFirst({
    where: { id, userId: user.id },
    include: { images: true, template: true },
  });

  if (!generation) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ generation });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await request.json();

  const existing = await prisma.generation.findFirst({
    where: { id, userId: user.id },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const generation = await prisma.generation.update({
    where: { id },
    data: {
      title: body.title ?? existing.title,
      isFavorite: body.isFavorite ?? existing.isFavorite,
    },
  });

  return NextResponse.json({ generation });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const existing = await prisma.generation.findFirst({
    where: { id, userId: user.id },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.generation.delete({ where: { id } });
  removeGenerationFiles(id);

  return NextResponse.json({ ok: true });
}
