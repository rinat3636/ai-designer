import fs from "fs";
import path from "path";
import { prisma } from "@/lib/prisma";
import { promptToPngDataUrl } from "./prompt-image";
import { memoryToPromptText, type MemorySnapshot } from "./memory";
import { applySvgOps, listElementIds, SvgOp } from "./svg-edit";
import { injectQrCode } from "./qr";

export type Concept = {
  name: string;
  description: string;
  explanation?: string;
  palette: string[];
  recommendations: string[];
};

export type ConceptGenerationResult = {
  concepts: Concept[];
  analysis?: string;
};

export type Brief = {
  businessDesc: string;
  companyName: string;
  website?: string;
  targetAudience?: string;
  style?: string;
  colors?: string[];
  logoUrl?: string;
  [key: string]: any;
};

export type ChatContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export type ChatMessage = {
  role: "user" | "assistant" | "system";
  content: string | ChatContentPart[];
};

export type InterviewResult = {
  message: string;
  extractedData: Record<string, any>;
  done: boolean;
  analysis?: string;
  concepts?: Concept[];
};

export type InterviewTemplate = {
  slug: string;
  name: string;
  category: string;
  description?: string | null;
  fields?: any;
  promptHints?: any;
};

type ChatCompletionResponse = {
  choices?: { message?: { content?: string }; finish_reason?: string }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number; [key: string]: any };
};

function getApiConfig() {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const baseURL = process.env.ANTHROPIC_BASE_URL;
  const model = process.env.ANTHROPIC_MODEL || "claude-fable-5";
  if (!apiKey || !baseURL) return null;
  return { apiKey, baseURL, model };
}

const MAX_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 1500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function callChatCompletionRaw(
  systemPrompt: string,
  messages: ChatMessage[],
  maxTokens = 4096,
  jsonMode = false,
  signal?: AbortSignal,
  temperature?: number
): Promise<string | null> {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (signal?.aborted) return null;
    if (attempt > 0) {
      await sleep(RETRY_BASE_DELAY_MS * 2 ** (attempt - 1));
      if (signal?.aborted) return null;
      console.warn(`Chat completion retry ${attempt + 1}/${MAX_ATTEMPTS}`);
    }
    const result = await callChatCompletionOnce(systemPrompt, messages, maxTokens, jsonMode, signal, temperature);
    if (result.ok) return result.text;
    if (!result.retryable) return null;
  }
  return null;
}

type ChatCompletionAttempt =
  | { ok: true; text: string | null; retryable?: undefined }
  | { ok: false; retryable: boolean; text?: undefined };

async function callChatCompletionOnce(
  systemPrompt: string,
  messages: ChatMessage[],
  maxTokens = 4096,
  jsonMode = false,
  signal?: AbortSignal,
  temperature?: number
): Promise<ChatCompletionAttempt> {
  const cfg = getApiConfig();
  if (!cfg) return { ok: false, retryable: false };

  const timeoutMs = Math.max(90000, maxTokens * 20);
  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => timeoutController.abort("timeout"), timeoutMs);

  let combinedSignal: AbortSignal | undefined = timeoutController.signal;
  if (signal) {
    const linked = new AbortController();
    linked.signal.addEventListener("abort", () => timeoutController.abort(linked.signal.reason));
    signal.addEventListener("abort", () => linked.abort(signal.reason));
    combinedSignal = linked.signal;
  }

  try {
    const body: any = {
      model: cfg.model,
      messages: [{ role: "system", content: systemPrompt }, ...messages],
      max_tokens: maxTokens,
      reasoning_effort: "low",
    };
    if (typeof temperature === "number") {
      body.temperature = temperature;
    }
    if (jsonMode) {
      body.response_format = { type: "json_object" };
    }

    const res = await fetch(`${cfg.baseURL}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: combinedSignal,
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("Chat completion error", res.status, text.slice(0, 500));
      const retryable = res.status >= 500 || res.status === 429 || res.status === 408;
      return { ok: false, retryable };
    }

    const data = (await res.json()) as ChatCompletionResponse;
    const choice = data.choices?.[0];
    console.log("Chat completion usage:", JSON.stringify(data.usage), "finish_reason:", choice?.finish_reason);
    return { ok: true, text: choice?.message?.content?.trim() || null };
  } catch (e) {
    console.error("callChatCompletionRaw error", e);
    // Network errors and timeouts are retryable; an external abort is not.
    return { ok: false, retryable: !signal?.aborted };
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function callChatCompletion(
  systemPrompt: string,
  userPrompt: string | ChatContentPart[],
  maxTokens = 4096,
  jsonMode = false,
  signal?: AbortSignal,
  temperature?: number
): Promise<string | null> {
  return callChatCompletionRaw(systemPrompt, [{ role: "user", content: userPrompt }], maxTokens, jsonMode, signal, temperature);
}

export type ProjectMemorySnapshot = MemorySnapshot;

export async function chatInterview(
  messages: ChatMessage[],
  template: InterviewTemplate,
  currentData: Record<string, any> = {},
  memory?: MemorySnapshot | null
): Promise<InterviewResult> {
  const cfg = getApiConfig();
  if (!cfg) {
    return {
      message: "Настройте API-ключ, чтобы продолжить.",
      extractedData: currentData,
      done: false,
    };
  }

  const fields = Array.isArray(template.fields)
    ? template.fields.map((f: any) => `- ${f.name} (${f.label}${f.required ? ", обязательно" : ""})`).join("\n")
    : "";

  const conceptHint = template.promptHints?.concept || "";
  const designHint = template.promptHints?.design || "";

  const systemPrompt = `Ты — профессиональный дизайнер-консультант. Общайся с клиентом естественно, по-человечески, на русском языке. Цель — создать дизайн "${template.name}" (${template.category}), который клиенту нужен.

Как вести диалог:
1. Не задавай обязательных вопросов. Клиент сам пишет, что хочет. Твоя задача — слушать, уточнять только если непонятно, и собирать данные из его сообщений.
2. Прими любую информацию: текст, размеры, цвета, стиль, фото-референсы, пожелания. Если клиент приложил фото, коротко прокомментируй, что увидел, и спроси, как именно использовать (стиль, палитра, композиция, не копировать).
3. Поддерживай контекст — не повторяйся, не теряй уже сказанное, отвечай по существу.
4. Рекомендуй: предлагай цвета, стиль, размещение, размер, телефон, QR, скидку — как опытный дизайнер.
5. Когда клиент пишет «сгенерируй», «давай», «готово» или данных достаточно — сразу предложи 4-6 концепций с анализом ниши и заверши диалог.

Справка по типу дизайна:
- Описание: ${template.description || "—"}
- Подсказка для концепций: ${conceptHint || "—"}
- Подсказка для макета: ${designHint || "—"}

Поля макета (заполнять неявно из сообщений клиента):
${fields || "- нет специфических полей"}

В каждом ответе возвращай ТОЛЬКО JSON, без markdown и текста вне JSON:
{
  "message": "ответ клиенту на русском: подтверждение, рекомендация, короткий вопрос для уточнения или представление концепций",
  "extractedData": {
    "businessDesc": "чем занимается компания",
    "companyName": "название",
    "targetAudience": "аудитория",
    "style": "стиль",
    "colors": ["#hex", "#hex"],
    "size": "1200x630",
    "logoUrl": "",
    "referenceImages": ["url", "url"],
    "data": { "headline": "", "subheadline": "", "size": "1200x630" }
  },
  "done": false,
  "analysis": null,
  "concepts": null
}

Если клиент просит размер (например, 1200x630, 1080x1920, A4), сохрани его в extractedData.size и extractedData.data.size.

Когда готов предложить концепции, установи done: true:
{
  "message": "Вот несколько концепций. Выберите подходящую:",
  "extractedData": { ... },
  "done": true,
  "analysis": "2-4 предложения анализа ниши и стиля",
  "concepts": [
    { "name": "1-2 слова", "description": "1-2 предложения", "explanation": "почему подходит именно этому бизнесу", "palette": ["#hex", "#hex", "#hex", "#hex", "#hex"], "recommendations": ["...", "..."] }
  ]
}

ВАЖНО: JSON должен быть валидным. Сохраняй уже собранные данные из currentData. Если клиент дал информацию — обязательно перенеси её в extractedData. Не задавай похожие вопросы подряд.

currentData на данный момент: ${JSON.stringify(currentData)}${
    memory ? `\n\nПамять о клиенте из прошлых проектов (используй её, НЕ задавай повторно вопросы о нише, названии, стиле, контактах и предпочтениях, если они уже известны):\n${memoryToPromptText(memory)}` : ""
  }`;

  const text = await callChatCompletionRaw(systemPrompt, messages, 4096, true);
  if (!text) return finishOrAsk(template, currentData, messages, undefined, memory);

  const parsed = parseInterviewResponse(text, currentData);
  const result = parsed ? await finishOrAsk(template, currentData, messages, parsed, memory) : null;
  if (result) return result;

  // If the model returned natural language, try to reformat via a second call.
  const repaired = await repairInterviewResponse(text, messages, template, currentData);
  if (repaired) {
    const repairedResult = await finishOrAsk(template, currentData, messages, repaired, memory);
    if (repairedResult) return repairedResult;
  }

  return finishOrAsk(template, currentData, messages, undefined, memory);
}

function hasEnoughData(data: Record<string, any>): boolean {
  return (
    Boolean(data.businessDesc?.trim()) &&
    (Boolean(data.companyName?.trim()) ||
      Boolean(data.style?.trim()) ||
      (Array.isArray(data.colors) && data.colors.length > 0) ||
      Boolean(data.size))
  );
}

async function finishOrAsk(
  template: InterviewTemplate,
  currentData: Record<string, any>,
  messages: ChatMessage[],
  candidate?: InterviewResult,
  memory?: MemorySnapshot | null
): Promise<InterviewResult> {
  const data = { ...(candidate?.extractedData || currentData) };

  // Try to pull the last user message into the data so we don't lose answers
  // when the model fails to return proper JSON.
  const lastUser = messages
    .slice()
    .reverse()
    .find((m) => m.role === "user");
  const lastUserText = extractTextFromMessage(lastUser);
  if (lastUserText) {
    const size = extractSizeFromText(lastUserText);
    if (size) {
      data.size = size;
      if (!data.data || typeof data.data !== "object") data.data = {};
      data.data.size = size;
    }
    const words = lastUserText.split(/\s+/).filter(Boolean);
    if (!data.companyName && words.length <= 3 && words.some((w) => /^[A-ZА-ЯЁ]/.test(w))) {
      data.companyName = lastUserText;
    } else if (!data.businessDesc) {
      data.businessDesc = lastUserText;
    } else if (!data.style && !data.colors?.length) {
      data.style = lastUserText;
    } else if (!data.targetAudience) {
      data.targetAudience = lastUserText;
    }
  }

  if (!hasEnoughData(data)) {
    return {
      message:
        candidate?.message?.trim() ||
        "Принял. Расскажите, что считаете важным (сфера, название, стиль, цвета, размер, контакты), или напишите «готово», и я подготовлю концепции.",
      extractedData: data,
      done: false,
    };
  }

  const brief = buildBrief(data);
  const conceptResult = await generateConcepts(brief, template, memory);
  const result: InterviewResult = {
    message: "Вот несколько концепций. Выберите подходящую:",
    extractedData: data,
    done: true,
    analysis: conceptResult.analysis,
    concepts: conceptResult.concepts,
  };
  enrichConcepts(result);
  return result;
}

export function extractJson(text: string): string | null {
  text = text.replace(/```json|```/g, "").trim();

  // Try to find the largest balanced { ... } or [ ... ] block.
  const startObj = text.indexOf("{");
  const startArr = text.indexOf("[");

  if (startObj === -1 && startArr === -1) return null;

  const start = startObj === -1 ? startArr : startArr === -1 ? startObj : Math.min(startObj, startArr);
  const isArray = text[start] === "[";
  const openChar = isArray ? "[" : "{";
  const closeChar = isArray ? "]" : "}";

  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === openChar) depth++;
    if (text[i] === closeChar) depth--;
    if (depth === 0) return text.slice(start, i + 1);
  }

  return null;
}

function parseInterviewResponse(text: string, currentData: Record<string, any>): InterviewResult | null {
  const jsonStr = extractJson(text);
  if (!jsonStr) return null;

  try {
    const parsed = JSON.parse(jsonStr);
    const extractedData = { ...currentData, ...(parsed.extractedData || {}) };
    normalizeColors(extractedData);
    normalizeImages(extractedData);

    const result: InterviewResult = {
      message: String(parsed.message || ""),
      extractedData,
      done: Boolean(parsed.done),
    };

    if (result.done) {
      result.analysis = typeof parsed.analysis === "string" ? parsed.analysis : undefined;
      result.concepts = Array.isArray(parsed.concepts)
        ? parsed.concepts.slice(0, 6).map((c: any) => ({
            name: String(c.name || "Концепция"),
            description: String(c.description || ""),
            explanation: typeof c.explanation === "string" ? c.explanation : undefined,
            palette: Array.isArray(c.palette) ? c.palette.map(String) : ["#2563eb", "#f8fafc", "#0f172a"],
            recommendations: Array.isArray(c.recommendations) ? c.recommendations.map(String) : [],
          }))
        : undefined;
    }

    return result;
  } catch (e) {
    console.error("Interview parse error", text, e);
    return null;
  }
}

async function repairInterviewResponse(
  rawAssistantText: string,
  messages: ChatMessage[],
  template: InterviewTemplate,
  currentData: Record<string, any>
): Promise<InterviewResult | null> {
  const system = `The assistant is conducting a design interview and should have returned only JSON, but returned natural language. Convert the assistant's message to a proper JSON object following this schema:
{
  "message": "a short professional Russian question or concept presentation based on the assistant text",
  "extractedData": { "businessDesc": "...", "companyName": "...", "targetAudience": "...", "style": "...", "colors": ["#hex"], "logoUrl": "", "referenceImages": ["url"], "data": {} },
  "done": false,
  "analysis": null,
  "concepts": null
}
If the conversation contains enough info to propose concepts, set done: true, include analysis and 4-6 concepts. Use template: ${template.name} (${template.category}).`;

  const repairMessages: ChatMessage[] = [
    ...messages,
    { role: "assistant", content: rawAssistantText },
    { role: "user", content: "Return the response as valid JSON only." },
  ];

  const text = await callChatCompletionRaw(system, repairMessages, 4096, true);
  if (!text) return null;
  return parseInterviewResponse(text, currentData);
}

function normalizeColors(data: Record<string, any>) {
  if (data.colors == null) return;
  if (typeof data.colors === "string") {
    data.colors = data.colors
      .split(/[,;]/)
      .map((c: string) => c.trim())
      .filter(Boolean);
  }
  if (Array.isArray(data.colors)) {
    data.colors = data.colors.map(String).filter((c: string) => c.length > 0);
  }
}

function normalizeImages(data: Record<string, any>) {
  if (!Array.isArray(data.referenceImages)) {
    data.referenceImages = [];
  } else {
    data.referenceImages = data.referenceImages.map(String);
  }
}

function enrichConcepts(result: InterviewResult) {
  if (!result.concepts || result.concepts.length === 0) return;

  const baseColors = Array.isArray(result.extractedData.colors) ? result.extractedData.colors.map(String) : [];
  const neutrals = ["#0f172a", "#f8fafc", "#94a3b8", "#64748b", "#cbd5e1"];

  result.concepts = result.concepts.map((c, i) => {
    let palette = Array.isArray(c.palette) && c.palette.length > 0 ? c.palette.map(String) : [];
    const fallbackPalette = ["#2563eb", "#f8fafc", "#0f172a"];
    // If palette looks like the default placeholder, rebuild from extracted colors.
    if (
      palette.length === 0 ||
      (palette.length === fallbackPalette.length && palette.every((v, idx) => v === fallbackPalette[idx]))
    ) {
      const rotated = [...baseColors.slice(i % baseColors.length), ...baseColors.slice(0, i % baseColors.length)];
      palette = [...rotated, ...neutrals].slice(0, 5);
      if (palette.length < 3) {
        palette = ["#2563eb", "#0f172a", "#f8fafc", "#94a3b8", "#64748b"];
      }
    }

    const recommendations =
      Array.isArray(c.recommendations) && c.recommendations.length > 0
        ? c.recommendations.map(String)
        : ["Сохранить читаемость в малых размерах", "Использовать фирменные цвета", "Адаптировать под соцсети и печать"];

    return {
      ...c,
      palette,
      recommendations,
      explanation: c.explanation || c.description,
    };
  });
}

function extractSizeFromText(text: string): string {
  const match = text.match(/(\d{2,4})\s?[x×]\s?(\d{2,4})/i);
  return match ? `${match[1]}x${match[2]}` : "";
}

function extractTextFromMessage(message?: ChatMessage): string {
  if (!message) return "";
  if (typeof message.content === "string") return message.content;
  const parts = message.content as ChatContentPart[];
  const textPart = parts.find((p) => p.type === "text");
  return textPart?.type === "text" ? textPart.text : "";
}

function buildBrief(data: Record<string, any>): Brief {
  const colors = Array.isArray(data.colors) ? data.colors.map(String) : [];
  return {
    businessDesc: data.businessDesc || "",
    companyName: data.companyName || "",
    website: data.website || "",
    targetAudience: data.targetAudience || "",
    style: data.style || "",
    colors,
    logoUrl: data.logoUrl || data.referenceImages?.[0] || "",
  };
}

export async function generateConcepts(
  brief: Brief,
  template?: { slug: string; name: string; category: string; promptHints?: any } | null,
  memory?: MemorySnapshot | null
): Promise<ConceptGenerationResult> {
  const showAnalysis = process.env.NEXT_PUBLIC_SHOW_NICHE_ANALYSIS === "true";
  const promptConfig = await prisma.promptConfig.findUnique({
    where: { key: "conceptGeneration" },
  });
  let systemPrompt =
    promptConfig?.prompt ||
    `Ты — опытный арт-директор. Предложи 3 лаконичные концепции дизайна. Верни ТОЛЬКО JSON-объект вида:
{
${showAnalysis ? `  "analysis": "1-2 коротких предложения: что работает в нише и какая палитра/стиль подойдут.",\n` : ""}  "concepts": [
    {
      "name": "1-2 слова",
      "description": "1 предложение",
      "explanation": "1 предложение, почему подходит этому бизнесу",
      "palette": ["#hex", "#hex", "#hex"],
      "recommendations": ["...", "..."]
    }
  ]
}

Не пиши рассуждения. Без markdown, без текста вне JSON.`;

  const templateConceptHint = template?.promptHints?.concept;
  if (templateConceptHint) {
    systemPrompt += `\n\nУточнение для типа дизайна "${template.name}": ${templateConceptHint}`;
  }

  const templateLine = template
    ? `\n- Тип дизайна: ${template.name} (${template.category})`
    : "";
  const userPrompt = `${memory ? `${memoryToPromptText(memory)}\n\n` : ""}Бриф клиента:
- Название: ${brief.companyName || "—"}
- Чем занимается: ${brief.businessDesc || "—"}
- Сайт: ${brief.website || "—"}
- Целевая аудитория: ${brief.targetAudience || "—"}
- Предпочитаемый стиль: ${brief.style || "—"}
- Фирменные цвета: ${brief.colors?.join(", ") || "—"}${templateLine}

${showAnalysis ? "Сначала проведи краткий анализ ниши, затем " : ""}Предложи концепции. Верни ТОЛЬКО JSON.`;

  const text = await callChatCompletion(systemPrompt, userPrompt, 2500, true, undefined, 0.5);
  if (text) {
    try {
      return parseConcepts(text);
    } catch (e) {
      console.error("Concept parse error", e);
    }
  }

  return fallbackConcepts();
}

function parseConcepts(text: string): ConceptGenerationResult {
  const jsonStr = extractJson(text);
  if (!jsonStr) throw new Error("No JSON found");

  const parsed = JSON.parse(jsonStr);
  const concepts = Array.isArray(parsed.concepts) ? parsed.concepts : parsed;
  if (!Array.isArray(concepts)) throw new Error("invalid concepts");
  return {
    analysis: typeof parsed.analysis === "string" ? parsed.analysis : undefined,
    concepts: concepts.slice(0, 6).map((c: any) => ({
      name: String(c.name || "Концепция"),
      description: String(c.description || ""),
      explanation: typeof c.explanation === "string" ? c.explanation : undefined,
      palette: Array.isArray(c.palette) ? c.palette.map(String) : ["#2563eb", "#f8fafc", "#0f172a"],
      recommendations: Array.isArray(c.recommendations) ? c.recommendations.map(String) : [],
    })),
  };
}

function fallbackConcepts(): ConceptGenerationResult {
  return {
    analysis: "Для данного бизнеса подойдут чистые современные стили с контрастной типографикой и сдержанной палитрой, которая передаёт профессионализм.",
    concepts: [
      {
        name: "Минимализм",
        description: "Чистый современный стиль с акцентом на типографику.",
        explanation: "Минимализм универсален для большинства ниш: он выглядит профессионально и не отвлекает от сути предложения.",
        palette: ["#0f172a", "#f8fafc", "#64748b", "#e2e8f0", "#3b82f6"],
        recommendations: ["Много воздуха", "Минимум цветов", "Современные шрифты"],
      },
      {
        name: "Премиум",
        description: "Темные цвета и акценты для премиального позиционирования.",
        explanation: "Тёмная палитра с золотыми/металлическими акцентами ассоциируется с высоким качеством и статусом.",
        palette: ["#1a1a1a", "#d4af37", "#f5f5f5", "#8a8a8a", "#111111"],
        recommendations: ["Используйте шрифты с засечками", "Металлические детали", "Низкая контрастность"],
      },
      {
        name: "Современный",
        description: "Градиенты, стекло и объем для современного digital-стиля.",
        explanation: "Яркие градиенты и объёмные формы хорошо работают для digital-продуктов и молодой аудитории.",
        palette: ["#6366f1", "#ec4899", "#06b6d4", "#f0f9ff", "#1e293b"],
        recommendations: ["Яркие градиенты", "Эффект стекла", "Крупные формы"],
      },
      {
        name: "Яркий продающий",
        description: "Максимальный акцент на акциях и выгоде.",
        explanation: "Контрастные цвета и крупная типографика быстро привлекают внимание и стимулируют к действию.",
        palette: ["#ef4444", "#facc15", "#ffffff", "#1f2937", "#22c55e"],
        recommendations: ["Крупные проценты", "Контрастные кнопки", "Эмоциональные слова"],
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Natural-language template resolution
// ---------------------------------------------------------------------------

export type TemplateCandidate = {
  id: string;
  slug: string;
  name: string;
  category: string;
  description?: string | null;
};

export type TemplateResolution = {
  templateId: string | null;
  slug: string | null;
  size: string | null;
};

const TEMPLATE_KEYWORDS: [RegExp, string][] = [
  [/stories|сторис|сториз|история|1080\s?[x×]\s?1920/i, "social-stories"],
  [/карусел/i, "social-carousel"],
  [/пост|post/i, "social-post"],
  [/обложк.*(сообществ|групп|вк|vk)|сообществ/i, "social-community-cover"],
  [/обложк.*магазин|шапк.*магазин/i, "marketplace-shop-cover"],
  [/инфографик/i, "marketplace-infographic"],
  [/карточк.*товар|товарн.*карточк|маркетплейс|wildberries|ozon|вайлдберриз|озон/i, "marketplace-product-card"],
  [/промо.?баннер.*(маркетплейс|магазин)/i, "marketplace-promo-banner"],
  [/билборд|billboard|наружн/i, "ad-billboard"],
  [/постер|плакат|афиш/i, "ad-poster"],
  [/визитк/i, "branding-business-card"],
  [/сертификат.*подароч|подарочн.*сертификат/i, "branding-gift-certificate"],
  [/сертификат|диплом|грамот/i, "branding-certificate"],
  [/флаер|листовк/i, "branding-flyer"],
  [/логотип|лого\b|logo/i, "branding-logo"],
  [/иконк|icons/i, "site-icons"],
  [/иллюстрац/i, "site-illustrations"],
  [/hero|геро|главн.*баннер.*сайт|шапк.*сайт/i, "site-hero-banner"],
  [/баннер.*сайт|сайт.*баннер/i, "site-promo-banner"],
  [/баннер|banner|реклам/i, "ad-banner"],
];

export async function resolveTemplateFromText(
  message: string,
  templates: TemplateCandidate[]
): Promise<TemplateResolution> {
  const size = extractSizeFromText(message) || null;

  for (const [pattern, slug] of TEMPLATE_KEYWORDS) {
    if (pattern.test(message)) {
      const template = templates.find((t) => t.slug === slug);
      if (template) return { templateId: template.id, slug: template.slug, size };
    }
  }

  const cfg = getApiConfig();
  if (!cfg) return { templateId: null, slug: null, size };

  const list = templates
    .map((t) => `- ${t.slug}: ${t.name} (${t.category})${t.description ? ` — ${t.description}` : ""}`)
    .join("\n");

  const system = `Ты определяешь тип дизайна по сообщению клиента. Доступные шаблоны:
${list}

Верни ТОЛЬКО JSON: {"slug": "точный slug из списка или null, если не уверен", "size": "ШИРИНАxВЫСОТА или null"}`;

  const text = await callChatCompletion(system, `Сообщение клиента: "${message}"`, 256, true, undefined, 0);
  if (!text) return { templateId: null, slug: null, size };

  try {
    const jsonStr = extractJson(text);
    if (!jsonStr) return { templateId: null, slug: null, size };
    const parsed = JSON.parse(jsonStr);
    const slug = typeof parsed.slug === "string" ? parsed.slug : null;
    const template = slug ? templates.find((t) => t.slug === slug) : undefined;
    const parsedSize = typeof parsed.size === "string" ? extractSizeFromText(parsed.size) : "";
    return {
      templateId: template?.id || null,
      slug: template?.slug || null,
      size: size || parsedSize || null,
    };
  } catch {
    return { templateId: null, slug: null, size };
  }
}

// ---------------------------------------------------------------------------
// Image / design generation via SVG output
// ---------------------------------------------------------------------------

export type DesignGenerationInput = {
  brief: Brief;
  concept: Concept;
  data: Record<string, string>;
  template: { slug: string; name: string; category: string; promptHints?: any };
  viewBox: string;
  editNote?: string;
  sourceSvg?: string;
  referenceImages?: string[];
  referenceStyle?: string;
  memory?: MemorySnapshot;
};

export async function generateDesigns(
  input: DesignGenerationInput,
  count = 4,
  signal?: AbortSignal
): Promise<{ svg: string; label: string; metadata?: any }[]> {
  if (signal?.aborted) return [];

  const variants = Array.from({ length: count }, (_, i) => i);
  const promises = variants.map(async (i): Promise<{ svg: string; label: string; metadata?: any } | null> => {
    if (signal?.aborted) return null;
    try {
      let svg = await generateOneSvg(input, i);
      if (!svg) return null;
      if (!input.editNote && process.env.VISUAL_REVIEW !== "false") {
        const fix = await visualReviewSvg(svg);
        if (fix && !signal?.aborted) {
          const fixed = await generateOneSvg({ ...input, sourceSvg: svg, editNote: fix }, i);
          if (fixed) svg = fixed;
        }
      }
      const qrUrl = input.data.qrUrl || input.brief.qrUrl;
      if (qrUrl && typeof qrUrl === "string" && svg.includes('id="qr"')) {
        svg = await injectQrCode(svg, qrUrl);
      }
      return { svg, label: `Вариант ${i + 1}` };
    } catch (e) {
      console.error(`Design variant ${i} error`, e);
      return null;
    }
  });

  const results = await Promise.all(promises);
  return results.filter((r): r is { svg: string; label: string; metadata?: any } => r !== null);
}

type EditParseResult = {
  intent: "edit" | "chat" | "revert";
  updatedData: Record<string, string>;
  editSummary: string;
  responseToUser: string;
  clarificationQuestion?: string | null;
  textReplacements?: { from: string; to: string }[];
  plan?: string[];
};

// Named style presets: vague wishes are translated into concrete,
// repeatable design rules instead of free interpretation.
const STYLE_PRESETS: [RegExp, string][] = [
  [/как у apple|эпп?л|айфон/i, "Apple-like style: pure white or near-black background, one accent color max, SF-like sans-serif, extreme whitespace (>40%), thin weights, small centered text, no decorative elements, no gradients except subtle ones."],
  [/дороже|премиаль|люкс|богаче/i, "Premium style: deep dark background (#0a0a0a-#1a1a1a), gold/champagne accents (#d4af37, #c9b037), serif headline font, generous letter-spacing, thin dividers, symmetric composition, no bright saturated colors."],
  [/современнее|моднее|стильнее|трендов/i, "Modern style: bold oversized headline, tight line-height, high contrast, one vivid accent color, asymmetric grid, generous whitespace, geometric shapes, sans-serif only."],
  [/минимализ|проще|чище|лаконич/i, "Minimalist style: max 2 colors + neutral, remove all decorative elements, increase whitespace, single focal point, thin sans-serif, no borders or shadows."],
  [/ярче|сочнее|веселее|игрив/i, "Vibrant style: saturated complementary colors, bold rounded shapes, playful oversized typography, dynamic diagonal composition, high energy."],
  [/менее ярк|приглуш|спокойнее|мягче/i, "Muted style: desaturate palette by 40-60%, pastel or earth tones, soft contrast, calm balanced composition, lighter font weights."],
];

export function matchStylePreset(text: string): string | null {
  for (const [pattern, rules] of STYLE_PRESETS) {
    if (pattern.test(text)) return rules;
  }
  return null;
}

const EDIT_KEYWORDS =
  /(сделай|сделайте|измени|измените|поменяй|поменяйте|замени|замените|добавь|добавьте|убери|удали|передвинь|сдвинь|переделай|переделайте|обнови|обновите|отредактируй|отредактируйте|исправь|исправьте|уменьш|увелич|крупнее|меньше|ярче|темнее|светлее|контраст|насыщ|размер|шрифт|текст|цвет|фон|background|change|make|edit|red|blue|green|yellow|black|white|красн|син|зел[её]н|желт|черн|бел|оранж|розов|фиолет|коричн|сер|голуб|бирюз)/i;

async function parseEditInstruction(
  input: DesignGenerationInput,
  instruction: string,
  messages: ChatMessage[] = [],
  memory?: MemorySnapshot,
  referenceImages?: string[]
): Promise<EditParseResult> {
  const system = `You are a smart AI designer-assistant in a chat conversation. The user is working on a design of type "${input.template.name}" (${input.template.category}). You understand natural, informal speech — the user never has to use special commands.

First classify the latest user message into an intent:
- "edit" — the user wants any change to the current design, even vaguely worded ("сделай современнее", "мне кажется, пустовато", "хочу, чтобы выглядело дороже", "сделай как у Apple", "передвинь немного вправо"). Translate the vague wish into a concrete professional design change. If the user sends their own prompt, analyze it, improve it if needed, and merge it with any other requests in the message.
- "revert" — the user wants to undo the last change and return to how it was ("верни как было", "отмени", "нет, предыдущий был лучше").
- "chat" — the user asks a question or wants advice (design, marketing, branding, colors, fonts, composition, how the service works) without requesting a change. Answer helpfully and concretely in responseToUser. Never refuse with canned phrases; if you can understand the question, help. When useful, proactively suggest 1-2 specific improvements to the current design and briefly explain why.
- If the user attached any images (reference screenshots) or used words like "зелёный", "красный", "фон", "окно", "цвет", "сделай", "поменяй" — classify as "edit", not "chat".

Additional rules:
1. Use the full conversation history; references like "он", "этот вариант", "тот телефон" refer to the currently selected design and earlier messages.
2. If the user replies with a number/short phrase ("3", "третий", "третий вариант"), resolve it using the assistant's previous multiple-choice options and act on it.
3. Only ask a clarification question when the request is truly impossible to infer. Prefer to make a reasonable professional design choice and proceed rather than asking. For very vague aesthetic requests ("сделай красиво"), either proceed with a concrete professional improvement or offer 2-3 numbered concrete options in the clarification question.
4. If the user only changes literal text content that is visible in the design (phone number, website, address, company name, a label), also output textReplacements — exact old visible string → exact new string — so the change can be applied without regenerating the design.
5. For complex multi-part requests, also output plan — an ordered list of 2-4 short Russian steps you will apply — and make editSummary cover all of them.

Output valid JSON with these fields:
- intent: "edit", "chat" or "revert".
- updatedData: (for edit) object with the same keys as the current data but updated values. Set a value to "" to remove it. Add new keys only if they naturally fit the request (phone, address, qrUrl, website, discount, etc.).
- editSummary: (for edit) a concise English instruction for the SVG generator describing the concrete change to apply.
- responseToUser: a short, friendly Russian reply — for chat, the full helpful answer; for edit, a brief acknowledgement of what you are changing.
- clarificationQuestion: null if the request is clear, otherwise one short Russian question. If multiple-choice, keep the same numbering from the previous assistant message.
- textReplacements: (optional, only for pure text swaps) array of { "from": "exact old visible text", "to": "new text" }.
- plan: (optional, only for complex multi-part edits) array of 2-4 short Russian step descriptions.`;

  const history = messages
    .slice(-10)
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${typeof m.content === "string" ? m.content : JSON.stringify(m.content)}`)
    .join("\n");

  const imageNote =
    referenceImages && referenceImages.length > 0
      ? `The user attached ${referenceImages.length} reference image(s). Treat the message as an edit request and apply the change to the current design using the attached image(s) as reference.`
      : "";

  const user = `${memory ? `${memoryToPromptText(memory)}\n\n` : ""}Current data:\n${JSON.stringify(input.data, null, 2)}\n\nConversation history:\n${history || "(no previous messages)"}${imageNote ? `\n\n${imageNote}` : ""}\n\nLatest user request: "${instruction}"\n\nOutput JSON only.`;

  const text = await callChatCompletion(system, user, 4096, true);
  const fallback: EditParseResult = {
    intent: "edit",
    updatedData: { ...input.data, editInstruction: instruction },
    editSummary: instruction,
    responseToUser: "Понял, применяю правку.",
  };

  if (!text) return fallback;

  try {
    const json = extractJson(text);
    if (!json) return fallback;
    const parsed = JSON.parse(json);
    const updatedData: Record<string, string> = {};
    for (const [k, v] of Object.entries({ ...input.data, ...(parsed.updatedData || {}) })) {
      if (v === null || v === undefined) continue;
      const str = String(v).trim();
      if (str === "" && k !== "editInstruction") continue;
      updatedData[k] = str;
    }
    const intent =
      parsed.intent === "chat" || parsed.intent === "revert" ? parsed.intent : "edit";
    const textReplacements = Array.isArray(parsed.textReplacements)
      ? parsed.textReplacements
          .filter((r: unknown): r is { from: string; to: string } => {
            const rep = r as { from?: unknown; to?: unknown };
            return typeof rep?.from === "string" && rep.from.length > 0 && typeof rep?.to === "string";
          })
          .map((r: { from: string; to: string }) => ({ from: r.from, to: r.to }))
      : undefined;
    const plan: string[] | undefined = Array.isArray(parsed.plan) ? parsed.plan.map(String).slice(0, 4) : undefined;
    let responseToUser = String(parsed.responseToUser || "Готово.");
    if (plan?.length && intent === "edit") {
      responseToUser += "\nПлан: " + plan.map((s: string, i: number) => `${i + 1}) ${s}`).join(" ");
    }
    return {
      intent,
      updatedData,
      editSummary: String(parsed.editSummary || instruction),
      responseToUser,
      clarificationQuestion: parsed.clarificationQuestion || undefined,
      textReplacements,
      plan,
    };
  } catch {
    return fallback;
  }
}

export async function editDesigns(
  input: DesignGenerationInput,
  instruction: string,
  count = 2,
  sourceSvg?: string,
  referenceImages?: string[],
  messages: ChatMessage[] = [],
  signal?: AbortSignal,
  memory?: MemorySnapshot
): Promise<{ svg: string; label: string; clarificationQuestion?: string; chatReply?: string; revert?: boolean }[]> {
  if (!getApiConfig()) return [];

  const parsed = await parseEditInstruction(input, instruction, messages, memory, referenceImages);

  // If the user attached reference images or clearly asks for a change, do not
  // let the classifier fall back to a generic "chat" response.
  if (
    parsed.intent === "chat" &&
    ((referenceImages && referenceImages.length > 0) || EDIT_KEYWORDS.test(instruction))
  ) {
    parsed.intent = "edit";
    parsed.editSummary = instruction;
    parsed.responseToUser = "Понял, применяю правку.";
    parsed.clarificationQuestion = null;
  }

  if (parsed.intent === "revert") {
    return [{ svg: "", label: "", revert: true, chatReply: parsed.responseToUser || "Вернул предыдущий вариант." }];
  }
  if (parsed.intent === "chat") {
    return [{ svg: "", label: "", chatReply: parsed.responseToUser }];
  }
  if (parsed.clarificationQuestion) {
    return [{ svg: "", label: "", clarificationQuestion: parsed.clarificationQuestion }];
  }

  const presetRules = matchStylePreset(instruction);

  // Pure text swaps (phone, website, address, name) are applied directly to the
  // source SVG without regenerating the whole design.
  if (sourceSvg && parsed.textReplacements?.length) {
    const escaped = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    let updated = sourceSvg;
    let applied = 0;
    for (const { from, to } of parsed.textReplacements) {
      for (const [needle, replacement] of [[from, to], [escaped(from), escaped(to)]] as const) {
        if (needle && updated.includes(needle)) {
          updated = updated.split(needle).join(replacement);
          applied++;
          break;
        }
      }
    }
    if (applied === parsed.textReplacements.length) {
      return [{ svg: updated, label: "Точечная правка текста" }];
    }
  }

  // Diff-based edit: when the source SVG has stable ids, ask the model for a
  // small list of operations instead of a full regeneration. The untouched
  // parts of the document remain byte-identical.
  if (sourceSvg && !presetRules && listElementIds(sourceSvg).length > 0) {
    const diffed = await diffEditSvg(sourceSvg, parsed.editSummary, signal);
    if (diffed) {
      return [{ svg: diffed, label: "Точечная правка" }];
    }
  }

  const updatedInput: DesignGenerationInput = {
    ...input,
    data: parsed.updatedData,
    editNote: presetRules ? `${parsed.editSummary}\nStyle rules to apply: ${presetRules}` : parsed.editSummary,
    sourceSvg,
    referenceImages,
    memory,
  };

  return generateDesigns(updatedInput, count, signal);
}

// Asks the model for a minimal set of operations on identified elements.
// Returns the patched SVG, or null when a full regeneration is needed.
async function diffEditSvg(sourceSvg: string, editSummary: string, signal?: AbortSignal): Promise<string | null> {
  if (sourceSvg.length > 60000) return null;
  const system = `You are a precise SVG patch generator. Given an SVG document and a change request, output the SMALLEST set of operations that applies the change. Every operation targets an element by its id attribute.

Return valid JSON only: {"feasible": true, "ops": [...]} or {"feasible": false} when the change cannot be expressed as element operations (e.g. it requires adding new elements or a redesign).

Each op is one of:
- {"id": "elementId", "attr": "attributeName", "value": "newValue"} — set/replace one attribute (fill, font-size, x, y, transform, opacity, width, height, ...). To move an element, prefer adjusting transform="translate(dx,dy)" or its x/y.
- {"id": "elementId", "text": "new text"} — replace the text content of a <text>/<tspan> element.
- {"id": "elementId", "remove": true} — remove the element.

Rules: only reference ids that exist in the document; never invent ids; keep changes minimal; if in doubt, return {"feasible": false}.`;

  const user = `SVG document:\n${sourceSvg}\n\nChange request: ${editSummary}\n\nJSON only.`;
  const text = await callChatCompletion(system, user, 2048, true, signal, 0);
  if (!text) return null;
  try {
    const jsonStr = extractJson(text);
    if (!jsonStr) return null;
    const parsed = JSON.parse(jsonStr);
    if (!parsed.feasible || !Array.isArray(parsed.ops) || parsed.ops.length === 0) return null;
    const ops: SvgOp[] = parsed.ops
      .filter((o: unknown): o is SvgOp => {
        const op = o as SvgOp;
        return typeof op?.id === "string" && op.id.length > 0;
      })
      .slice(0, 20);
    if (ops.length === 0) return null;
    const result = applySvgOps(sourceSvg, ops);
    if (!result || !passesQualityCheck(result)) return null;
    return result;
  } catch {
    return null;
  }
}

export type ImageAnalysis = {
  text: string;
  description: string;
  colors: string[];
  elements: string[];
  style: string;
  palette: string[];
  composition: string;
  typography: string;
};

const EMPTY_IMAGE_ANALYSIS: ImageAnalysis = {
  text: "",
  description: "",
  colors: [],
  elements: [],
  style: "",
  palette: [],
  composition: "",
  typography: "",
};

const imageAnalysisCache = new Map<string, ImageAnalysis>();

export async function analyzeImage(imageUrl: string): Promise<ImageAnalysis> {
  const cached = imageAnalysisCache.get(imageUrl);
  if (cached) return cached;
  const b64 = await imageUrlToBase64(imageUrl);
  if (!b64) {
    return { ...EMPTY_IMAGE_ANALYSIS };
  }

  const system = `You are analyzing a design image. Extract the following and return valid JSON only:
{
  "text": "all visible text exactly as it appears, separated by \\n",
  "description": "short description of layout, style and main visual elements",
  "colors": ["#hex", "#hex"],
  "elements": ["element 1", "element 2"],
  "style": "overall design style in a few words (e.g. minimalist, retro, corporate, playful)",
  "palette": ["#hex", "#hex", "#hex", "#hex", "#hex"],
  "composition": "short description of the layout structure: grid, alignment, focal point, whitespace",
  "typography": "short description of the fonts: serif/sans-serif, weight, case, mood"
}
Be precise with text. Do not invent text that is not visible.`;

  const content: ChatContentPart[] = [
    { type: "text", text: "Extract all visible text, dominant colors, style, palette, composition and typography, and describe the design. Return JSON only." },
    { type: "image_url", image_url: { url: b64 } },
  ];

  const text = await callChatCompletion(system, content, 2048, true, undefined, 0);
  if (!text) return { ...EMPTY_IMAGE_ANALYSIS };

  const jsonStr = extractJson(text);
  if (!jsonStr) return { ...EMPTY_IMAGE_ANALYSIS };

  try {
    const parsed = JSON.parse(jsonStr);
    const analysis: ImageAnalysis = {
      text: String(parsed.text || ""),
      description: String(parsed.description || ""),
      colors: Array.isArray(parsed.colors) ? parsed.colors.map(String) : [],
      elements: Array.isArray(parsed.elements) ? parsed.elements.map(String) : [],
      style: String(parsed.style || ""),
      palette: Array.isArray(parsed.palette) ? parsed.palette.map(String) : [],
      composition: String(parsed.composition || ""),
      typography: String(parsed.typography || ""),
    };
    if (imageAnalysisCache.size > 500) imageAnalysisCache.clear();
    imageAnalysisCache.set(imageUrl, analysis);
    return analysis;
  } catch {
    return { ...EMPTY_IMAGE_ANALYSIS };
  }
}

const MAX_IMAGE_DIMENSION = 1024;

async function imageUrlToBase64(url: string): Promise<string | null> {
  try {
    if (url.startsWith("data:")) return url;
    let buffer: Buffer;
    if (url.startsWith("http")) {
      const res = await fetch(url);
      if (!res.ok) return null;
      buffer = Buffer.from(await res.arrayBuffer());
    } else if (url.startsWith("/")) {
      const filePath = path.join(process.cwd(), "public", url);
      buffer = fs.readFileSync(filePath);
    } else {
      return null;
    }

    // Resize large images to reduce vision-token cost and model latency.
    try {
      const { default: sharp } = await import("sharp");
      const resized = await sharp(buffer)
        .resize(MAX_IMAGE_DIMENSION, MAX_IMAGE_DIMENSION, { fit: "inside" })
        .png({ compressionLevel: 9 })
        .toBuffer();
      buffer = resized;
    } catch {
      // keep original if sharp fails
    }

    const ext = path.extname(url.split("?")[0]).toLowerCase();
    let mime = "image/png";
    if (ext === ".jpg" || ext === ".jpeg") mime = "image/jpeg";
    if (ext === ".webp") mime = "image/webp";
    if (ext === ".gif") mime = "image/gif";
    return `data:${mime};base64,${buffer.toString("base64")}`;
  } catch (e) {
    console.warn("Failed to convert image to base64", url, e);
    return null;
  }
}

async function generateOneSvg(input: DesignGenerationInput, variantIndex: number): Promise<string | null> {
  if (!getApiConfig()) return null;

  const isEdit = Boolean(input.editNote && (input.sourceSvg || (input.referenceImages || []).length > 0));

  const system = isEdit
    ? `You are a precise SVG editor. The user provides a design and a single change request. Output ONLY the full updated SVG. Do not redesign, do not add/remove elements, and do not change text, layout, fonts, sizes, or positions unless the request explicitly says so. Keep the same viewBox. Preserve existing id attributes on elements. Output raw SVG 1.1 only, no markdown, no comments.`
    : `You are an expert SVG designer. Output one raw SVG 1.1. No markdown, no comments, no explanation. Use only sans-serif, serif or monospace. All text inside viewBox. Flat vector, no raster.

${STABLE_IDS_RULE}

${DESIGN_QUALITY_RULES}`;

  const userPrompt = isEdit ? buildEditPrompt(input) : buildDesignPrompt(input);
  const maxTokens = isEdit ? 10000 : 12000;

  async function attempt(): Promise<string | null> {
    let text: string | null = null;
    const refs = (await Promise.all((input.referenceImages || []).map(imageUrlToBase64))).filter(
      (u): u is string => Boolean(u)
    );
    const useImagePrompt = process.env.USE_IMAGE_PROMPT === "true";
    if (useImagePrompt && !isEdit && !input.sourceSvg) {
      const imageUrl = await promptToPngDataUrl(userPrompt, input.viewBox);
      const content: ChatContentPart[] = [{ type: "image_url", image_url: { url: imageUrl } }];
      if (refs.length) {
        content.push(...refs.map((url) => ({ type: "image_url" as const, image_url: { url } })));
      }
      text = await callChatCompletion(system, content, maxTokens, false, undefined, isEdit ? 0 : 0.7);
    } else if (refs.length) {
      const content: ChatContentPart[] = [
        { type: "text", text: userPrompt },
        ...refs.map((url) => ({ type: "image_url" as const, image_url: { url } })),
      ];
      text = await callChatCompletion(system, content, maxTokens, false, undefined, isEdit ? 0 : 0.7);
    } else {
      text = await callChatCompletion(system, userPrompt, maxTokens, false, undefined, isEdit ? 0 : 0.7);
    }
    if (!text) return null;

    const svgMatch = text.match(/<svg[\s\S]*?<\/svg>/i);
    if (!svgMatch) {
      console.warn(`No SVG found in design response #${variantIndex + 1}`);
      return null;
    }
    let svg = svgMatch[0];
    if (!svg.includes("xmlns=")) {
      svg = svg.replace(/<svg/i, '<svg xmlns="http://www.w3.org/2000/svg"');
    }
    if (!passesQualityCheck(svg, `variant ${variantIndex + 1}`)) {
      console.warn(`Design #${variantIndex + 1} failed quality check. SVG:\n${svg.slice(0, 1000)}`);
      return null;
    }
    return svg;
  }

  // The upstream proxy occasionally returns 524/timeouts; retry once quickly.
  const first = await attempt();
  if (first) return first;
  console.warn(`Retrying generation for variant ${variantIndex + 1}`);
  return attempt();
}

// Renders the SVG to PNG and asks the model to visually verify it. Returns a
// concise fix instruction if a real problem is found, otherwise null.
async function visualReviewSvg(svg: string): Promise<string | null> {
  try {
    const { default: sharp } = await import("sharp");
    const png = await sharp(Buffer.from(svg)).resize(768, 768, { fit: "inside" }).png().toBuffer();
    const dataUrl = `data:image/png;base64,${png.toString("base64")}`;

    const system = `You are a strict design QA reviewer. Look at the rendered design and check ONLY for real defects: unreadable text (too small or poor contrast), overlapping elements, text or elements cut off at the edges, a stretched/distorted logo, obviously broken layout. Ignore taste and style. Return valid JSON only: {"ok": true} if the design has no defects, or {"ok": false, "fix": "one concise English instruction describing exactly what to fix"} if it does.`;

    const content: ChatContentPart[] = [
      { type: "text", text: "Review this design for defects. JSON only." },
      { type: "image_url", image_url: { url: dataUrl } },
    ];
    const text = await callChatCompletion(system, content, 512, true, undefined, 0);
    if (!text) return null;
    const jsonStr = extractJson(text);
    if (!jsonStr) return null;
    const parsed = JSON.parse(jsonStr);
    if (parsed.ok === false && typeof parsed.fix === "string" && parsed.fix.trim()) {
      return parsed.fix.trim();
    }
    return null;
  } catch (e) {
    console.warn("Visual review failed", e);
    return null;
  }
}

function passesQualityCheck(svg: string, label = "svg"): boolean {
  if (!/viewBox\s*=\s*"[\d\s.,-]+"/i.test(svg)) {
    console.warn(`Quality fail (${label}): missing viewBox`);
    return false;
  }
  if (/\bNaN\b|undefined/.test(svg)) {
    console.warn(`Quality fail (${label}): NaN/undefined`);
    return false;
  }
  for (const tag of ["g", "defs", "text", "tspan", "svg"]) {
    const open = (svg.match(new RegExp(`<${tag}[\\s>]`, "gi")) || []).length;
    const close = (svg.match(new RegExp(`</${tag}>`, "gi")) || []).length;
    const selfClosed = (svg.match(new RegExp(`<${tag}[^>]*/>`, "gi")) || []).length;
    if (open !== close + selfClosed) {
      console.warn(`Quality fail (${label}): unbalanced <${tag}> (open=${open}, close=${close}, selfClosed=${selfClosed})`);
      return false;
    }
  }
  if (!passesContrastCheck(svg)) {
    console.warn(`Quality fail (${label}): contrast`);
    return false;
  }
  if (!passesBoundsCheck(svg)) {
    console.warn(`Quality fail (${label}): bounds`);
    return false;
  }
  return true;
}

function hexToRgb(hex: string): [number, number, number] | null {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (h.length !== 6 || /[^0-9a-f]/i.test(h)) return null;
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function luminance(rgb: [number, number, number]): number {
  const [r, g, b] = rgb.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// Rejects designs where text color is nearly identical to a solid full-bleed
// background (light-on-light / dark-on-dark). Lenient: skips gradients and
// designs without a detectable background.
function passesContrastCheck(svg: string): boolean {
  const bgMatch = svg.match(/<rect[^>]*\bfill="(#[0-9a-f]{3,6})"[^>]*>/i);
  if (!bgMatch) return true;
  const bg = hexToRgb(bgMatch[1]);
  if (!bg) return true;
  const bgLum = luminance(bg);
  const textFills = [...svg.matchAll(/<text[^>]*\bfill="(#[0-9a-f]{3,6})"/gi)].map((m) => m[1]);
  for (const fill of textFills) {
    const rgb = hexToRgb(fill);
    if (!rgb) continue;
    const ratio = (Math.max(bgLum, luminance(rgb)) + 0.05) / (Math.min(bgLum, luminance(rgb)) + 0.05);
    if (ratio < 1.5) return false;
  }
  return true;
}

// Rejects designs where text coordinates fall outside the viewBox.
function passesBoundsCheck(svg: string): boolean {
  const vb = svg.match(/viewBox\s*=\s*"([\d\s.,-]+)"/i);
  if (!vb) return true;
  const parts = vb[1].trim().split(/[\s,]+/).map(Number);
  if (parts.length !== 4 || parts.some(isNaN)) return true;
  const [minX, minY, w, h] = parts;
  for (const m of svg.matchAll(/<text[^>]*\bx="(-?[\d.]+)"[^>]*\by="(-?[\d.]+)"/gi)) {
    const x = Number(m[1]);
    const y = Number(m[2]);
    if (x < minX - 1 || x > minX + w + 1 || y < minY - 1 || y > minY + h + 1) return false;
  }
  return true;
}

const STABLE_IDS_RULE = `STABLE IDS (mandatory): assign stable id attributes to key elements so they can be edited individually later: id="background" (full-bleed background), id="logo", id="headline", id="subheadline", id="phone", id="website", id="address", id="email", id="cta", id="qr". Wrap multi-shape elements (like a logo) in <g id="...">. If a QR code is required, output ONLY a single placeholder <rect id="qr" x="..." y="..." width="..." height="..." fill="#ffffff"/> — the real QR code is inserted programmatically.`;

const DESIGN_QUALITY_RULES = `DESIGN QUALITY RULES (mandatory) — the result must look professional, beautiful and "rich":
1. Visual impact: create a polished, premium-looking design. Avoid flat/boring layouts; use tasteful gradients, subtle shadows, layered shapes and a clear focal point where appropriate, while staying vector-based.
2. Composition: logical and balanced layout, no chaotic placement, no large empty zones, no overlapping elements.
3. Visual hierarchy: headline \u2192 image/offer \u2192 CTA/button \u2192 contacts \u2192 logo. The most important element must dominate.
4. Alignment: consistent spacing, precise centering, follow an invisible modular grid.
5. Safe zones: keep all text and important elements inside a safe area of at least 4% of width/height from every edge.
6. Balance text, imagery and whitespace \u2014 generous breathing room, but not empty.
7. Typography: modern, readable fonts, comfortable line height and letter spacing; never squeeze text. Use 2-3 font sizes max.
8. Color harmony: use the provided palette (or a niche-appropriate palette); limit to 2-4 dominant colors, with accents for CTAs.
9. Contrast: all text must be clearly readable \u2014 never light-on-light or dark-on-dark.
10. Element sizing: logo, phone, website, QR code, buttons and images sized appropriately for their importance.
11. Contacts placed logically (bottom or corner), visible but not distracting.
12. Format-specific composition: logo \u2014 clean memorable mark; banner \u2014 bold headline; product card \u2014 product first; stories \u2014 vertical flow; business card \u2014 compact info blocks; certificate \u2014 formal symmetric layout.
13. SELF-CHECK before output: verify alignment, readability, contrast, no overlaps, safe zones respected, professional modern premium look. Fix any issue, then output the SVG.`;

const LABELS: Record<string, string> = {
  headline: "Headline",
  subheadline: "Subheadline",
  productName: "Product",
  phone: "Phone",
  address: "Address",
  website: "Website",
  email: "Email",
  telegram: "Telegram",
  discount: "Discount",
  cta: "CTA",
  qrUrl: "QR",
  logoUrl: "Logo",
  extractedText: "Exact visible text (reproduce verbatim)",
  layoutDescription: "Original layout (preserve)",
};

function fieldLabel(key: string): string {
  return LABELS[key] || key;
}

function trunc(s: string | undefined, n: number): string {
  if (!s) return "";
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

function buildDesignPrompt(input: DesignGenerationInput): string {
  const { brief, concept, data, template, viewBox } = input;
  const [w, h] = viewBox.split(" ").slice(2).map(Number);

  const isTransparent =
    template.slug.includes("logo") ||
    template.slug.includes("icons") ||
    template.promptHints?.transparent === true;

  const textBlocks = Object.entries(data)
    .filter(([k, v]) => typeof v === "string" && v.trim() && k !== "editInstruction" && k !== "size")
    .map(([k, v]) => `${fieldLabel(k)}: ${v}`)
    .join("\n");

  const designHint = template.promptHints?.design ? ` ${String(template.promptHints.design).slice(0, 120)}` : "";
  const transparentNote = isTransparent ? " Transparent bg, no bg rect, no shadows/3D." : "";

  const role = template.slug.includes("logo")
    ? "logo mark"
    : template.slug.includes("icons")
    ? "UI icon set"
    : template.slug.includes("business-card")
    ? "business card"
    : template.slug.includes("certificate")
    ? "certificate"
    : "marketing graphic";

  const referenceNote = input.referenceStyle
    ? `\nReference style (match the mood, palette and typography of the user's reference, but do NOT copy its exact layout): ${trunc(input.referenceStyle, 400)}`
    : "";

  const preset = matchStylePreset(`${brief.style || ""} ${data.editInstruction || ""}`);
  const presetNote = preset ? `\nStyle rules: ${preset}` : "";

  const memoryNote = input.memory ? `\n${memoryToPromptText(input.memory)}` : "";

  return `Create a visually stunning, professional, modern ${role} for "${brief.companyName || template.name}".
Business: ${trunc(brief.businessDesc, 120) || "—"}. Concept: ${concept.name}. Style: ${trunc(brief.style || concept.name, 80)}. Palette: ${concept.palette.join(", ")}.
Template: ${template.name}.${designHint}${transparentNote}${referenceNote}${presetNote}${memoryNote}
viewBox="${viewBox}" (${w}×${h}).${textBlocks ? "\n" + textBlocks : ""}
Make it look rich and premium. Output raw SVG only.`;
}

function buildEditPrompt(input: DesignGenerationInput): string {
  const { data, viewBox } = input;
  const hasImage = (input.referenceImages || []).length > 0;

  const textBlocks = Object.entries(data)
    .filter(([k, v]) => typeof v === "string" && v.trim() && k !== "editInstruction" && k !== "size")
    .map(([k, v]) => `${fieldLabel(k)}: ${v}`)
    .join("\n");

  let body = `Apply ONLY the requested change and return the full updated SVG. Keep the same viewBox "${viewBox}".

PRESERVATION RULES (mandatory):
- Keep the original text exactly as-is: do not rewrite, translate, rephrase or stylize it.
- Preserve the original fonts, font sizes, font weights and text colors.
- Preserve the original layout, positions, spacing, alignment and composition.
- Preserve all logos, marks, frames, borders and decorative details.
- Do NOT redesign, do NOT add or remove elements, and do NOT change text, layout, fonts, sizes, positions or colors unless the request explicitly says so.
- If the request is only about color/background, change ONLY that; keep everything else identical.`;

  if (textBlocks) body += `\nText/content to keep exactly as-is:\n${textBlocks}`;
  if (input.sourceSvg) {
    body += `\n\nCURRENT SVG TO EDIT (keep every element unless the change explicitly targets it):\n${input.sourceSvg}`;
  } else if (hasImage) {
    body += `\n\nThe current design is shown in the attached image(s). First faithfully recreate it as an SVG: copy the exact visible text, layout, colors, and composition. Then apply ONLY the requested change. Do not use generic placeholder text such as "Design Title" or "Subtitle" — use the real text from the image.`;
  }
  if (input.memory) body += `\n\nUser preferences and history (follow them, avoid repeating past mistakes):\n${memoryToPromptText(input.memory)}`;

  body += `\n\nChange to apply: ${input.editNote}\n\nReturn the updated SVG only.`;
  return body;
}

