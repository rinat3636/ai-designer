import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";
import {
  generateDesigns,
  editDesigns,
  resolveTemplateFromText,
  callChatCompletion,
  extractJson,
  type Brief,
  type Concept,
  type ChatMessage,
  type DesignGenerationInput,
} from "@/lib/llm";
import { getViewBoxForTemplate, parseUserSize } from "@/lib/design";
import { saveSvg, readLocalSvg, readLocalImageSize } from "@/lib/storage";
import { buildMemorySnapshot, rememberGenerationFacts, recordEditOutcome } from "@/lib/memory";

export const maxDuration = 300;

const UPLOAD_TEMPLATE_ID = "upload";

const EDIT_KEYWORDS =
  /(сделай|сделайте|измени|измените|поменяй|поменяйте|замени|замените|добавь|добавьте|убери|удали|передвинь|сдвинь|переделай|переделайте|обнови|обновите|отредактируй|отредактируйте|исправь|исправьте|уменьш|увелич|крупнее|меньше|ярче|темнее|светлее|контраст|насыщ|размер|шрифт|текст|цвет|фон|background|change|make|edit|red|blue|green|yellow|black|white|красн|син|зел[её]н|желт|черн|бел|оранж|розов|фиолет|коричн|сер|голуб|бирюз)/i;

function looksLikeEdit(text: string, hasFiles: boolean): boolean {
  if (hasFiles) return true;
  if (!text) return false;
  return EDIT_KEYWORDS.test(text);
}

function mergeHistory(existing: any, additions: ChatMessage[]): any[] {
  const base = Array.isArray(existing) ? existing : [];
  return [
    ...base,
    ...additions.map((m) => ({ ...m, at: new Date().toISOString() })),
  ].slice(-50);
}

async function ensureUploadTemplate() {
  await prisma.template.upsert({
    where: { id: UPLOAD_TEMPLATE_ID },
    update: {},
    create: {
      id: UPLOAD_TEMPLATE_ID,
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

async function getOrCreateSubscription(userId: string) {
  let subscription = await prisma.subscription.findUnique({
    where: { userId },
    include: { plan: true },
  });
  if (!subscription) {
    const freePlan = await prisma.subscriptionPlan.findUnique({ where: { slug: "free" } });
    if (freePlan) {
      subscription = await prisma.subscription.create({
        data: { userId, planId: freePlan.id, isActive: true },
        include: { plan: true },
      });
    }
  }
  return subscription;
}

async function extractBrief(
  template: { slug: string; name: string; category: string; description?: string | null; promptHints?: any; fields?: any },
  message: string,
  memory: any
): Promise<{ brief: Brief; concept: Concept; data: Record<string, string> }> {
  const promptHints = template.promptHints || {};
  const fields = Array.isArray(template.fields)
    ? template.fields.map((f: any) => `${f.name}: ${f.label}${f.required ? " (required)" : ""}`).join("\n")
    : "";
  const system = `You extract a concise design brief from the user's request. Design type: "${template.name}" (${template.category}).
${template.description ? `Description: ${template.description}\n` : ""}${promptHints.concept ? `Concept hint: ${promptHints.concept}\n` : ""}${promptHints.design ? `Design hint: ${promptHints.design}\n` : ""}${fields ? `Known fields:\n${fields}\n` : ""}
Return ONLY a JSON object:
{
  "businessDesc": "what the business does (infer from request)",
  "companyName": "",
  "style": "short style, e.g. minimalism, modern, luxury",
  "colors": ["#hex"],
  "size": "WIDTHxHEIGHT or null",
  "data": { "headline": "", "subheadline": "", "phone": "", "website": "", ... },
  "concept": {
    "name": "1-2 words",
    "description": "1 sentence",
    "explanation": "1 sentence why it fits",
    "palette": ["#hex", "#hex", "#hex", "#hex"],
    "recommendations": ["short tip"]
  }
}
Infer reasonable defaults for anything not specified. Do not ask questions. Keep data values short and relevant to the template.`;
  const user = `${memory ? `Known client preferences (use, do not ask again):\n${JSON.stringify(memory)}\n\n` : ""}User request: "${message}"\n\nExtracted JSON:`;
  const text = await callChatCompletion(system, user, 2048, true);
  let parsed: any = {};
  if (text) {
    const jsonStr = extractJson(text);
    if (jsonStr) {
      try {
        parsed = JSON.parse(jsonStr);
      } catch {}
    }
  }
  const concept: Concept = parsed.concept || {
    name: "На основе запроса",
    description: "Сгенерировать дизайн по описанию пользователя",
    explanation: "Подходит под краткое описание клиента",
    palette: parsed.colors || ["#2563eb", "#f8fafc", "#0f172a"],
    recommendations: ["Сохранить стиль и палитру", "Добавить контакты если известны"],
  };
  const brief: Brief = {
    businessDesc: parsed.businessDesc || message,
    companyName: parsed.companyName || "",
    website: parsed.website || "",
    targetAudience: "",
    style: parsed.style || concept.name,
    colors: Array.isArray(parsed.colors) ? parsed.colors : concept.palette,
  };
  const data: Record<string, string> = typeof parsed.data === "object" ? parsed.data : {};
  if (parsed.size) data.size = parsed.size;
  return { brief, concept, data };
}

async function generateFromRequest(
  userId: string,
  template: { id: string; slug: string; name: string; category: string; description?: string | null; promptHints?: any; fields?: any },
  message: string,
  files: string[],
  memory: any
) {
  const templates = await prisma.template.findMany({ where: { isActive: true } });
  const candidate = templates.find((t) => t.id === template.id);
  if (!candidate) throw new Error("Template not found");

  const { brief, concept, data } = await extractBrief(candidate, message, memory);
  const rawRefs = files;

  let sourceSvg = "";
  const nonSvgRefs: string[] = [];
  for (const url of rawRefs) {
    const svg = readLocalSvg(url);
    if (svg && !sourceSvg) sourceSvg = svg;
    else nonSvgRefs.push(url);
  }

  const isEdit = rawRefs.length > 0 && sourceSvg;

  let viewBox = getViewBoxForTemplate(candidate.slug);
  const userSize = parseUserSize(data?.size || brief?.size);
  if (userSize) {
    viewBox = `0 0 ${userSize.width} ${userSize.height}`;
  } else if (!isEdit && nonSvgRefs.length > 0) {
    const dims = await readLocalImageSize(nonSvgRefs[0]);
    if (dims) viewBox = `0 0 ${dims.width} ${dims.height}`;
  }

  const generation = await prisma.generation.create({
    data: {
      userId,
      templateId: candidate.id,
      title: data.headline || data.productName || candidate.name,
      brief: brief as any,
      concept: concept as any,
      data: { ...(data || {}), referenceImageUrls: rawRefs, editNote: isEdit ? message : "" } as any,
      chatHistory: [{ role: "user", content: message, at: new Date().toISOString() }] as any,
      conceptName: concept.name,
      status: "generating",
      prompt: "",
    },
  });

  const designs = await generateDesigns(
    {
      brief,
      concept,
      data,
      template: {
        slug: candidate.slug,
        name: candidate.name,
        category: candidate.category,
        promptHints: candidate.promptHints as any,
      },
      viewBox,
      editNote: isEdit ? message : undefined,
      sourceSvg: sourceSvg || undefined,
      referenceImages: nonSvgRefs,
      memory,
    },
    1
  );

  if (designs.length === 0) {
    await prisma.generation.update({ where: { id: generation.id }, data: { status: "failed" } });
    throw new Error("Сервис генерации временно перегружен. Попробуйте ещё раз.");
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

  await prisma.generation.update({ where: { id: generation.id }, data: { status: "completed" } });
  await rememberGenerationFacts(userId, brief, data, concept.name, rawRefs);

  const result = await prisma.generation.findUnique({
    where: { id: generation.id },
    include: { images: true, template: true },
  });

  return { message: "Готово! Вот получившийся вариант.", generation: result };
}

async function editFromRequest(
  userId: string,
  generation: any,
  message: string,
  files: string[],
  memory: any
) {
  const sourceUrl =
    generation.images.find((i: any) => i.isSelected)?.url || generation.images[0]?.url;
  if (!sourceUrl) throw new Error("No source image");

  const refs = files;
  const allSourceUrls = sourceUrl ? [sourceUrl, ...refs] : refs;

  let sourceSvg = "";
  for (const url of allSourceUrls) {
    const svg = readLocalSvg(url);
    if (svg) {
      sourceSvg = svg;
      break;
    }
  }

  const referenceImages = refs.filter((url: string) => !readLocalSvg(url));
  const brief = (generation.brief || {}) as Brief;
  const concept = (generation.concept || {}) as Concept;
  const data = (generation.data || {}) as Record<string, string>;
  const viewBox =
    typeof data.size === "string" && /^\d+x\d+$/.test(data.size)
      ? `0 0 ${data.size.split("x")[0]} ${data.size.split("x")[1]}`
      : getViewBoxForTemplate(generation.template.slug);

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

  const designs = await editDesigns(input, message, 2, sourceSvg, referenceImages, [], undefined, memory);

  const special = designs.find((d) => d.chatReply || d.revert);
  if (special) {
    await recordEditOutcome(userId, { instruction: message, outcome: "revert", generationId: generation.id });
    return { message: special.chatReply || "Вернул предыдущий вариант.", generation: null };
  }

  const clarification = designs.find((d) => d.clarificationQuestion);
  if (clarification) {
    return { message: clarification.clarificationQuestion, generation: null };
  }

  if (designs.length === 0 || !designs[0].svg) {
    throw new Error("Сервис генерации временно перегружен. Попробуйте ещё раз.");
  }

  for (let i = 0; i < designs.length; i++) {
    const design = designs[i];
    const imageId = crypto.randomUUID();
    const url = saveSvg(generation.id, imageId, design.svg);
    await prisma.generationImage.create({
      data: {
        generationId: generation.id,
        url,
        label: design.label || `Редактированный вариант ${i + 1}`,
        style: concept.name,
        format: "svg",
        metadata: { sourceImageUrl: sourceUrl, instruction: message, variantIndex: i, viewBox } as any,
      },
    });
  }

  await recordEditOutcome(userId, { instruction: message, outcome: "success", generationId: generation.id });

  const result = await prisma.generation.findUnique({
    where: { id: generation.id },
    include: { images: true, template: true },
  });

  return { message: "Готово. Новые варианты добавлены.", generation: result };
}

async function answerQuestion(
  userId: string,
  generation: any,
  message: string,
  memory: any
): Promise<string> {
  const history: ChatMessage[] =
    Array.isArray(generation?.chatHistory) ? (generation.chatHistory as ChatMessage[]) : [];
  const context = generation
    ? `Current design: ${generation.template.name}. Project brief: ${JSON.stringify(generation.brief)}`
    : "No current design yet.";
  const system = `You are a helpful design assistant. Answer the user's question briefly and concretely in Russian. Do not change the design unless explicitly asked.\n\n${context}${memory ? `\n\nKnown client preferences:\n${JSON.stringify(memory)}` : ""}`;
  const { callChatCompletionRaw } = await import("@/lib/llm");
  const text = await callChatCompletionRaw(system, [...history.slice(-6), { role: "user", content: message }], 1024, false);
  return text || "Я не понял вопрос. Попробуйте переформулировать.";
}

export async function POST(request: NextRequest) {
  const user = await getSession();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!rateLimit(`chat:${user.id}`, 10, 60_000)) return rateLimitResponse();

  try {
    const body = await request.json();
    const { projectId, message = "", files = [] } = body as {
      projectId?: string;
      message?: string;
      files?: string[];
    };
    let text = (message || "").trim();
    const uploadedFiles = Array.isArray(files) ? (files as string[]) : [];
    if (uploadedFiles.length > 0 && !text) {
      text = "Сохрани макет и примени небольшие улучшения";
    }

    const subscription = await getOrCreateSubscription(user.id);
    const limit = subscription?.plan.monthlyLimit ?? 0;
    const used = subscription?.generationsUsedThisMonth ?? 0;
    if (limit > 0 && used >= limit) {
      return NextResponse.json({ error: "Monthly generation limit reached" }, { status: 403 });
    }

    const memory = await buildMemorySnapshot(user.id);

    if (projectId) {
      const generation = await prisma.generation.findFirst({
        where: { id: projectId, userId: user.id },
        include: { images: true, template: true },
      });
      if (!generation) return NextResponse.json({ error: "Not found" }, { status: 404 });

      if (looksLikeEdit(text, uploadedFiles.length > 0)) {
        const result = await editFromRequest(user.id, generation, text, uploadedFiles, memory);
        await prisma.generation.update({
          where: { id: generation.id },
          data: {
            chatHistory: mergeHistory(generation.chatHistory, [
              { role: "user", content: text || "" },
              { role: "assistant", content: result.message || "" },
            ]) as any,
            status: "completed",
          },
        });
        return NextResponse.json(result);
      }

      const answer = await answerQuestion(user.id, generation, text, memory);
      await prisma.generation.update({
        where: { id: generation.id },
        data: {
          chatHistory: mergeHistory(generation.chatHistory, [
            { role: "user", content: text || "" },
            { role: "assistant", content: answer || "" },
          ]) as any,
        },
      });
      return NextResponse.json({ message: answer, generation: null });
    }

    // New design from uploaded image (edit own file)
    if (uploadedFiles.length > 0) {
      await ensureUploadTemplate();
      return NextResponse.json(
        await generateFromRequest(user.id, { id: UPLOAD_TEMPLATE_ID, slug: "custom-upload", name: "Редактировать свой макет", category: "Редактор" }, text || "Сохрани макет и примени небольшие улучшения", uploadedFiles, memory)
      );
    }

    // New design from text
    const activeTemplates = await prisma.template.findMany({ where: { isActive: true } });
    const resolution = await resolveTemplateFromText(
      text,
      activeTemplates.map((t) => ({ id: t.id, slug: t.slug, name: t.name, category: t.category, description: t.description }))
    );
    if (!resolution.templateId) {
      return NextResponse.json({
        message:
          "Не удалось определить тип дизайна. Уточните, что хотите создать: логотип, баннер, визитку, сертификат, пост и т.д.",
      });
    }
    const template = activeTemplates.find((t) => t.id === resolution.templateId);
    if (!template) return NextResponse.json({ error: "Template not found" }, { status: 404 });

    return NextResponse.json(await generateFromRequest(user.id, template, text, [], memory));
  } catch (error: any) {
    console.error("Chat API error", error);
    return NextResponse.json(
      { error: error.message || "Chat processing failed" },
      { status: 500 }
    );
  }
}
