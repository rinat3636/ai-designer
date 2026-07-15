import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let subscription = await prisma.subscription.findUnique({
    where: { userId: user.id },
    include: { plan: true },
  });

  if (!subscription) {
    const freePlan = await prisma.subscriptionPlan.findUnique({ where: { slug: "free" } });
    if (freePlan) {
      subscription = await prisma.subscription.create({
        data: { userId: user.id, planId: freePlan.id, isActive: true },
        include: { plan: true },
      });
    }
  }

  return NextResponse.json({ subscription });
}
