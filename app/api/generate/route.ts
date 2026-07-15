import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";
import { generateDesigns, analyzeImage, type Brief, type Concept } from "@/lib/llm";
import { getViewBoxForTemplate, parseUserSize } from "@/lib/design";
import { saveSvg, readLocalSvg, readLocalImageSize } from "@/lib/storage";

export const maxDuration = 300;

export async function POST(request: NextRequest) {
  const user = await getSession();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!rateLimit(`generate:${user.id}`, 10, 60_000)) return rateLimitResponse();

  try {
    const body = await request.json();
    const {
      templateId,
      brief,
      concept,
      data,
      referenceImageUrls = [],
      editNote,
      count = 4,
    } = body;

    if (!templateId || !brief || !concept) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    const rawRefs = Array.isArray(referenceImageUrls) ? (referenceImageUrls as string[]) : [];

    let sourceSvg = "";
    const nonSvgRefs: string[] = [];
    for (const url of rawRefs) {
      const svg = readLocalSvg(url);
      if (svg && !sourceSvg) {
        sourceSvg = svg;
      } else {
        nonSvgRefs.push(url);
      }
    }

    // When editing from a raster image, analyze it to extract visible text and
    // elements so the generator can reproduce the design faithfully.
    let enrichedBrief = brief as Brief;
    let enrichedData = (data || {}) as Record<string, string>;
    let referenceStyle = "";
    if (editNote && !sourceSvg && nonSvgRefs.length > 0) {
      try {
        const analysis = await analyzeImage(nonSvgRefs[0]);
        const text = analysis.text || analysis.description || "";
        if (text) {
          enrichedData = { ...enrichedData, extractedText: text };
          if (analysis.composition) {
            enrichedData = { ...enrichedData, layoutDescription: analysis.composition };
          }
          if (!enrichedBrief.businessDesc?.trim()) {
            enrichedBrief = { ...enrichedBrief, businessDesc: analysis.description || "Загруженный макет" };
          }
          if (analysis.colors?.length && !enrichedBrief.colors?.length) {
            enrichedBrief = { ...enrichedBrief, colors: analysis.colors };
          }
        }
      } catch (e) {
        console.warn("Image analysis failed", e);
      }
    } else if (!editNote && nonSvgRefs.length > 0) {
      // Reference image for a fresh generation: extract style, palette,
      // composition and typography so the model matches the reference mood.
      try {
        const analysis = await analyzeImage(nonSvgRefs[0]);
        const styleParts: string[] = [];
        if (analysis.style) styleParts.push(`style: ${analysis.style}`);
        if (analysis.palette.length) styleParts.push(`palette: ${analysis.palette.join(", ")}`);
        if (analysis.composition) styleParts.push(`composition: ${analysis.composition}`);
        if (analysis.typography) styleParts.push(`typography: ${analysis.typography}`);
        referenceStyle = styleParts.join("; ");
        if (analysis.style && !enrichedBrief.style?.trim()) {
          enrichedBrief = { ...enrichedBrief, style: analysis.style };
        }
        const refColors = analysis.palette.length ? analysis.palette : analysis.colors;
        if (refColors.length && !enrichedBrief.colors?.length) {
          enrichedBrief = { ...enrichedBrief, colors: refColors };
        }
      } catch (e) {
        console.warn("Reference analysis failed", e);
      }
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

    // Support the virtual "upload your own" template by creating a generic record on demand.
    if (templateId === "upload") {
      await prisma.template.upsert({
        where: { id: "upload" },
        update: {},
        create: {
          id: "upload",
          slug: "custom-upload",
          category: "Редактор",
          categoryKey: "editor",
          name: "Редактировать свой макет",
          description: "Загруженный пользователем макет",
          isActive: true,
          displayOrder: -1,
          promptHints: {},
        },
      });
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
        data: { ...(data || {}), referenceImageUrls: rawRefs, editNote: editNote || "" },
        conceptName: concept.name,
        status: "generating",
        prompt: "",
      },
    });

    let viewBox = getViewBoxForTemplate(template.slug);
    const userSize = parseUserSize(data?.size || brief?.size);
    if (userSize) {
      viewBox = `0 0 ${userSize.width} ${userSize.height}`;
    } else if (editNote && !sourceSvg && nonSvgRefs.length > 0) {
      // Editing an uploaded raster: keep the original image dimensions.
      const dims = await readLocalImageSize(nonSvgRefs[0]);
      if (dims) viewBox = `0 0 ${dims.width} ${dims.height}`;
    }

    const designs = await generateDesigns(
      {
        brief: enrichedBrief,
        concept: concept as Concept,
        data: enrichedData,
        template: {
          slug: template.slug,
          name: template.name,
          category: template.category,
          promptHints: template.promptHints as any,
        },
        viewBox,
        editNote: editNote || undefined,
        sourceSvg: sourceSvg || undefined,
        referenceImages: nonSvgRefs,
        referenceStyle: referenceStyle || undefined,
      },
      Math.max(1, Math.min(2, Number(count) || 1))
    );

    if (designs.length === 0) {
      await prisma.generation.update({
        where: { id: generation.id },
        data: { status: "failed" },
      });
      return NextResponse.json(
        { error: "Сервис генерации временно перегружен. Попробуйте ещё раз." },
        { status: 503 }
      );
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

    // Persist project memory so future dialogs don't re-ask known facts.
    const memoryData = {
      niche: (brief as Brief).businessDesc || undefined,
      companyName: (brief as Brief).companyName || undefined,
      style: (brief as Brief).style || (concept as Concept).name || undefined,
      palette: ((concept as Concept).palette || []) as any,
      contacts: {
        phone: (data?.phone as string) || undefined,
        website: (data?.website as string) || (brief as Brief).website || undefined,
        address: (data?.address as string) || undefined,
      } as any,
      files: rawRefs as any,
    };
    await prisma.projectMemory.upsert({
      where: { userId: user.id },
      update: memoryData,
      create: { userId: user.id, ...memoryData },
    });

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
