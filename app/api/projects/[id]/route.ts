import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";
import { editDesigns, type Brief, type Concept, type DesignGenerationInput } from "@/lib/llm";
import { getViewBoxForTemplate } from "@/lib/design";
import { saveSvg, removeGenerationFiles, readLocalSvg } from "@/lib/storage";
import { buildMemorySnapshot, recordEditOutcome } from "@/lib/memory";

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

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!rateLimit(`edit:${user.id}`, 10, 60_000)) return rateLimitResponse();

  const { id } = await params;
  const body = await request.json();
  const {
    instruction,
    selectedImageUrl,
    referenceImageUrls = [],
    messages: chatMessages = [],
    count = 2,
  } = body;

  if (!instruction) {
    return NextResponse.json({ error: "Missing instruction" }, { status: 400 });
  }

  const generation = await prisma.generation.findFirst({
    where: { id, userId: user.id },
    include: { images: true, template: true },
  });
  if (!generation) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const sourceUrl =
    selectedImageUrl || generation.images.find((i) => i.isSelected)?.url || generation.images[0]?.url;

  const refs = Array.isArray(referenceImageUrls) ? (referenceImageUrls as string[]) : [];
  const allSourceUrls = sourceUrl ? [sourceUrl, ...refs] : refs;

  let sourceSvg = "";
  for (const url of allSourceUrls) {
    const svg = readLocalSvg(url);
    if (svg) {
      sourceSvg = svg;
      break;
    }
  }

  const referenceImages = refs.filter((url) => !readLocalSvg(url));

  const brief = (generation.brief || {}) as Brief;
  const concept = (generation.concept || {}) as Concept;
  const data = (generation.data || {}) as Record<string, string>;

  const viewBox =
    typeof data.size === "string" && /^\d+x\d+$/.test(data.size)
      ? `0 0 ${data.size.split("x")[0]} ${data.size.split("x")[1]}`
      : getViewBoxForTemplate(generation.template.slug);

  const memory = await buildMemorySnapshot(user.id);

  const input: DesignGenerationInput = {
    brief,
    concept,
    data,
    template: {
      slug: generation.template.slug,
      name: generation.template.name,
      category: generation.template.category,
      promptHints: generation.template.promptHints as any,
    },
    viewBox,
    memory,
  };

  const history = Array.isArray(generation.chatHistory) ? (generation.chatHistory as any[]) : [];
  await prisma.generation.update({
    where: { id },
    data: {
      chatHistory: [...history, { role: "user", content: instruction, at: new Date().toISOString() }],
      status: "generating",
    },
  });

  try {
    const designs = await editDesigns(
      input,
      instruction,
      Math.max(1, Math.min(2, Number(count) || 2)),
      sourceSvg,
      referenceImages,
      chatMessages,
      undefined,
      memory
    );

    const special = designs.find((d) => d.chatReply || d.revert);
    if (special) {
      await prisma.generation.update({
        where: { id },
        data: {
          status: "completed",
          chatHistory: [
            ...history,
            { role: "user", content: instruction, at: new Date().toISOString() },
            { role: "assistant", content: special.chatReply, at: new Date().toISOString() },
          ],
        },
      });
      await recordEditOutcome(user.id, {
        instruction,
        outcome: "revert",
        generationId: generation.id,
      });
      return NextResponse.json({ assistantMessage: special.chatReply, revert: Boolean(special.revert) });
    }

    const clarification = designs.find((d) => d.clarificationQuestion);
    if (clarification) {
      await prisma.generation.update({
        where: { id },
        data: {
          status: "completed",
          chatHistory: [
            ...history,
            { role: "user", content: instruction, at: new Date().toISOString() },
            { role: "assistant", content: clarification.clarificationQuestion, at: new Date().toISOString() },
          ],
        },
      });
      return NextResponse.json({ clarificationQuestion: clarification.clarificationQuestion });
    }

    if (designs.length === 0 || !designs[0].svg) {
      await prisma.generation.update({ where: { id }, data: { status: "completed" } });
      return NextResponse.json(
        { error: "Сервис генерации временно перегружен. Попробуйте ещё раз." },
        { status: 503 }
      );
    }

    const createdImages = [];
    for (let i = 0; i < designs.length; i++) {
      const design = designs[i];
      const imageId = crypto.randomUUID();
      const url = saveSvg(generation.id, imageId, design.svg);
      const img = await prisma.generationImage.create({
        data: {
          generationId: generation.id,
          url,
          label: design.label || `Редактированный вариант ${i + 1}`,
          style: concept.name,
          format: "svg",
          metadata: { sourceImageUrl: sourceUrl, instruction, variantIndex: i, viewBox } as any,
        },
      });
      createdImages.push(img);
    }

    await recordEditOutcome(user.id, {
      instruction,
      outcome: "success",
      generationId: generation.id,
      imageUrl: createdImages[0]?.url,
    });

    await prisma.generation.update({
      where: { id },
      data: {
        status: "completed",
        chatHistory: [
          ...history,
          { role: "user", content: instruction, at: new Date().toISOString() },
          { role: "assistant", content: "Готово. Варианты сохранены.", at: new Date().toISOString() },
        ],
      },
    });

    return NextResponse.json({ images: createdImages });
  } catch (error) {
    console.error("Edit API error", error);
    await prisma.generation.update({ where: { id }, data: { status: "completed" } });
    return NextResponse.json({ error: "Edit failed" }, { status: 500 });
  }
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
