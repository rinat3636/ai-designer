import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const brand = await prisma.brandSettings.findUnique({
    where: { userId: user.id },
  });

  return NextResponse.json({ brand });
}

export async function PUT(request: NextRequest) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await request.json();
    const brand = await prisma.brandSettings.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        companyName: body.companyName || null,
        businessDesc: body.businessDesc || null,
        website: body.website || null,
        phone: body.phone || null,
        telegram: body.telegram || null,
        email: body.email || null,
        address: body.address || null,
        logoUrl: body.logoUrl || null,
        colors: body.colors || [],
        fonts: body.fonts || [],
        targetAudience: body.targetAudience || null,
        style: body.style || null,
      },
      update: {
        companyName: body.companyName ?? undefined,
        businessDesc: body.businessDesc ?? undefined,
        website: body.website ?? undefined,
        phone: body.phone ?? undefined,
        telegram: body.telegram ?? undefined,
        email: body.email ?? undefined,
        address: body.address ?? undefined,
        logoUrl: body.logoUrl ?? undefined,
        colors: body.colors ?? undefined,
        fonts: body.fonts ?? undefined,
        targetAudience: body.targetAudience ?? undefined,
        style: body.style ?? undefined,
      },
    });

    return NextResponse.json({ brand });
  } catch (error) {
    console.error("Brand update error", error);
    return NextResponse.json({ error: "Failed to save brand settings" }, { status: 500 });
  }
}
