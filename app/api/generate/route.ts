import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { generateDesigns, type Brief, type Concept } from "@/lib/llm";
import { getViewBoxForTemplate, parseUserSize } from "@/lib/design";
import { saveSvg } from "@/lib/storage";

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const user = await getSession();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { templateId, brief, concept, data, count = 4 } = body;

    if (!templateId || !brief || !concept) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    // Subscription check
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
    const limit = subscription?.plan.monthlyLimit ?? 0;
    const used = subscription?.generationsUsedThisMonth ?? 0;
    if (limit > 0 && used >= limit) {
      return NextResponse.json(
        { error: "Monthly generation limit reached" },
        { status: 403 }
      );
    }

    const template = await prisma.template.findUnique({ where: { id: templateId } });
    if (!template) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }

    const generation = await prisma.generation.create({
      data: {
        userId: user.id,
        templateId: template.id,
        title: data.headline || data.productName || template.name,
        brief: brief as any,
        concept: concept as any,
        data: data || {},
        conceptName: concept.name,
        status: "generating",
        prompt: "",
      },
    });

    let viewBox = getViewBoxForTemplate(template.slug);
    const userSize = parseUserSize(data?.size || brief?.size);
    if (userSize) {
      viewBox = `0 0 ${userSize.width} ${userSize.height}`;
    }

    const designs = await generateDesigns(
      {
        brief: brief as Brief,
        concept: concept as Concept,
        data: data || {},
        template: {
          slug: template.slug,
          name: template.name,
          category: template.category,
          promptHints: template.promptHints as any,
        },
        viewBox,
      },
      Math.max(1, Math.min(2, Number(count) || 1))
    );

    if (designs.length === 0) {
      await prisma.generation.update({
        where: { id: generation.id },
        data: { status: "failed" },
      });
      return NextResponse.json({ error: "Generation failed" }, { status: 500 });
    }

    for (let i = 0; i < designs.length; i++) {
      const design = designs[i];
      const imageId = crypto.randomUUID();
      const url = saveSvg(generation.id, imageId, design.svg);
      await prisma.generationImage.create({
        data: {
          generationId: generation.id,
          url,
          label: design.label,
          style: concept.name,
          format: "svg",
          metadata: { variantIndex: i, viewBox } as any,
        },
      });
    }

    await prisma.generation.update({
      where: { id: generation.id },
      data: { status: "completed" },
    });

    if (subscription) {
      await prisma.subscription.update({
        where: { id: subscription.id },
        data: { generationsUsedThisMonth: { increment: 1 } },
      });
    }

    await prisma.adminLog.create({
      data: {
        action: "generation",
        userId: user.id,
        details: `Generated ${designs.length} images for template ${template.slug}`,
      },
    });

    const result = await prisma.generation.findUnique({
      where: { id: generation.id },
      include: { images: true, template: true },
    });

    return NextResponse.json({ generation: result });
  } catch (error) {
    console.error("Generate API error", error);
    return NextResponse.json({ error: "Generation failed" }, { status: 500 });
  }
}
