import fs from "fs";
import path from "path";
import { prisma } from "@/lib/prisma";
import { promptToPngDataUrl } from "./prompt-image";

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

type InterviewTemplate = {
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

async function callChatCompletionRaw(
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

  const timeoutMs = 90000;
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

async function callChatCompletion(
  systemPrompt: string,
  userPrompt: string | ChatContentPart[],
  maxTokens = 4096,
  jsonMode = false,
  signal?: AbortSignal,
  temperature?: number
): Promise<string | null> {
  return callChatCompletionRaw(systemPrompt, [{ role: "user", content: userPrompt }], maxTokens, jsonMode, signal, temperature);
}

export async function chatInterview(
  messages: ChatMessage[],
  template: InterviewTemplate,
  currentData: Record<string, any> = {}
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

currentData на данный момент: ${JSON.stringify(currentData)}`;

  const text = await callChatCompletionRaw(systemPrompt, messages, 4096, true);
  if (!text) return finishOrAsk(template, currentData, messages);

  const parsed = parseInterviewResponse(text, currentData);
  const result = parsed ? await finishOrAsk(template, currentData, messages, parsed) : null;
  if (result) return result;

  // If the model returned natural language, try to reformat via a second call.
  const repaired = await repairInterviewResponse(text, messages, template, currentData);
  if (repaired) {
    const repairedResult = await finishOrAsk(template, currentData, messages, repaired);
    if (repairedResult) return repairedResult;
  }

  return finishOrAsk(template, currentData, messages);
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
  candidate?: InterviewResult
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
  const conceptResult = await generateConcepts(brief, template);
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

function extractJson(text: string): string | null {
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
  template?: { slug: string; name: string; category: string; promptHints?: any } | null
): Promise<ConceptGenerationResult> {
  const promptConfig = await prisma.promptConfig.findUnique({
    where: { key: "conceptGeneration" },
  });
  let systemPrompt =
    promptConfig?.prompt ||
    `Ты — опытный арт-директор. Предложи 3 лаконичные концепции дизайна. Верни ТОЛЬКО JSON-объект вида:
{
  "analysis": "1-2 коротких предложения: что работает в нише и какая палитра/стиль подойдут.",
  "concepts": [
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
  const userPrompt = `Бриф клиента:
- Название: ${brief.companyName || "—"}
- Чем занимается: ${brief.businessDesc || "—"}
- Сайт: ${brief.website || "—"}
- Целевая аудитория: ${brief.targetAudience || "—"}
- Предпочитаемый стиль: ${brief.style || "—"}
- Фирменные цвета: ${brief.colors?.join(", ") || "—"}${templateLine}

Сначала проведи краткий анализ ниши, затем предложи концепции. Верни ТОЛЬКО JSON.`;

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
      const svg = await generateOneSvg(input, i);
      if (svg) return { svg, label: `Вариант ${i + 1}` };
      return null;
    } catch (e) {
      console.error(`Design variant ${i} error`, e);
      return null;
    }
  });

  const results = await Promise.all(promises);
  return results.filter((r): r is { svg: string; label: string; metadata?: any } => r !== null);
}

type EditParseResult = {
  updatedData: Record<string, string>;
  editSummary: string;
  responseToUser: string;
  clarificationQuestion?: string | null;
};

async function parseEditInstruction(
  input: DesignGenerationInput,
  instruction: string,
  messages: ChatMessage[] = []
): Promise<EditParseResult> {
  const system = `You are an AI design editor in a chat conversation. The user is editing an existing design of type "${input.template.name}" (${input.template.category}).

Your job:
1. Read the conversation history and the latest user request.
2. If the user replies with a number/short phrase ("3", "третий", "третий вариант"), resolve it using the assistant's previous multiple-choice options and act on it.
3. If the request is clear enough, output an updated design data object, an English SVG edit instruction, and a short Russian response.
4. Only ask a clarification question when the request is truly impossible to infer. Prefer to make a reasonable design choice and proceed rather than asking.

Output valid JSON with these fields:
- updatedData: object with the same keys as the current data but updated values. Set a value to "" to remove it. Add new keys only if they naturally fit the request (phone, address, qrUrl, website, discount, etc.).
- editSummary: a concise English instruction for the SVG generator describing the change to apply.
- responseToUser: a short, friendly Russian acknowledgement or the clarification question.
- clarificationQuestion: null if the request is clear, otherwise one short Russian question. If multiple-choice, keep the same numbering from the previous assistant message.`;

  const history = messages
    .slice(-10)
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${typeof m.content === "string" ? m.content : JSON.stringify(m.content)}`)
    .join("\n");

  const user = `Current data:\n${JSON.stringify(input.data, null, 2)}\n\nConversation history:\n${history || "(no previous messages)"}\n\nLatest user request: "${instruction}"\n\nOutput JSON only.`;

  const text = await callChatCompletion(system, user, 4096, true);
  const fallback: EditParseResult = {
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
    return {
      updatedData,
      editSummary: String(parsed.editSummary || instruction),
      responseToUser: String(parsed.responseToUser || "Готово."),
      clarificationQuestion: parsed.clarificationQuestion || undefined,
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
  signal?: AbortSignal
): Promise<{ svg: string; label: string; clarificationQuestion?: string }[]> {
  if (!getApiConfig()) return [];

  const parsed = await parseEditInstruction(input, instruction, messages);
  if (parsed.clarificationQuestion) {
    return [{ svg: "", label: "", clarificationQuestion: parsed.clarificationQuestion }];
  }

  const updatedInput: DesignGenerationInput = {
    ...input,
    data: parsed.updatedData,
    editNote: parsed.editSummary,
    sourceSvg,
    referenceImages,
  };

  return generateDesigns(updatedInput, count, signal);
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

export async function analyzeImage(imageUrl: string): Promise<ImageAnalysis> {
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
    return {
      text: String(parsed.text || ""),
      description: String(parsed.description || ""),
      colors: Array.isArray(parsed.colors) ? parsed.colors.map(String) : [],
      elements: Array.isArray(parsed.elements) ? parsed.elements.map(String) : [],
      style: String(parsed.style || ""),
      palette: Array.isArray(parsed.palette) ? parsed.palette.map(String) : [],
      composition: String(parsed.composition || ""),
      typography: String(parsed.typography || ""),
    };
  } catch {
    return { ...EMPTY_IMAGE_ANALYSIS };
  }
}

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
    ? `You are a precise SVG editor. The user provides a design and a single change request. Output ONLY the full updated SVG. Do not redesign, do not add/remove elements, and do not change text, layout, fonts, sizes, or positions unless the request explicitly says so. Keep the same viewBox. Output raw SVG 1.1 only, no markdown, no comments.`
    : `You are an expert SVG designer. Output one raw SVG 1.1. No markdown, no comments, no explanation. Use only sans-serif, serif or monospace. All text inside viewBox. Flat vector, no raster.

${DESIGN_QUALITY_RULES}`;

  const userPrompt = isEdit ? buildEditPrompt(input) : buildDesignPrompt(input);

  async function attempt(): Promise<string | null> {
    let text: string | null = null;
    const refs = (await Promise.all((input.referenceImages || []).map(imageUrlToBase64))).filter(
      (u): u is string => Boolean(u)
    );
    const useImagePrompt = process.env.USE_IMAGE_PROMPT !== "false";
    if (useImagePrompt && !isEdit && !input.sourceSvg) {
      const imageUrl = await promptToPngDataUrl(userPrompt, input.viewBox);
      const content: ChatContentPart[] = [{ type: "image_url", image_url: { url: imageUrl } }];
      if (refs.length) {
        content.push(...refs.map((url) => ({ type: "image_url" as const, image_url: { url } })));
      }
      text = await callChatCompletion(system, content, 12000, false, undefined, isEdit ? 0 : 0.7);
    } else if (refs.length) {
      const content: ChatContentPart[] = [
        { type: "text", text: userPrompt },
        ...refs.map((url) => ({ type: "image_url" as const, image_url: { url } })),
      ];
      text = await callChatCompletion(system, content, 12000, false, undefined, isEdit ? 0 : 0.7);
    } else {
      text = await callChatCompletion(system, userPrompt, 12000, false, undefined, isEdit ? 0 : 0.7);
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
    return svg;
  }

  // The upstream proxy occasionally returns 524/timeouts; retry once quickly.
  const first = await attempt();
  if (first) return first;
  console.warn(`Retrying generation for variant ${variantIndex + 1}`);
  return attempt();
}

const DESIGN_QUALITY_RULES = `DESIGN QUALITY RULES (mandatory):
1. Composition: logical and balanced layout, no chaotic placement, no large empty zones, no overlapping elements.
2. Visual hierarchy: headline \u2192 image/offer \u2192 CTA/button \u2192 contacts \u2192 logo. The most important element must dominate.
3. Alignment: consistent spacing, precise centering, follow an invisible modular grid.
4. Safe zones: keep all text and important elements inside a safe area of at least 4% of width/height from every edge.
5. Balance text, imagery and whitespace \u2014 generous breathing room, minimalist and modern.
6. Typography: modern fonts, readable sizes, comfortable line height and letter spacing; never squeeze text.
7. Color harmony: use the provided palette (or a niche-appropriate palette); limit to 2-4 dominant colors.
8. Contrast: all text must be clearly readable \u2014 never light-on-light or dark-on-dark.
9. Element sizing: logo, phone, website, QR code, buttons and images sized appropriately for their importance.
10. Contacts placed logically (bottom or corner), visible but not distracting.
11. Format-specific composition: logo \u2014 clean mark; banner \u2014 big headline; product card \u2014 product first; stories \u2014 vertical flow; business card \u2014 compact info blocks; certificate \u2014 formal symmetric layout.
12. SELF-CHECK before output: verify alignment, readability, no overlaps, safe zones respected, professional modern look. Fix any issue, then output the SVG.`;

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

  return `Create a ${role} for "${brief.companyName || template.name}".
Business: ${trunc(brief.businessDesc, 80) || "—"}. Concept: ${concept.name}. Style: ${trunc(brief.style || concept.name, 50)}. Palette: ${concept.palette.join(", ")}.
Template: ${template.name}.${designHint}${transparentNote}${referenceNote}
viewBox="${viewBox}" (${w}×${h}).${textBlocks ? "\n" + textBlocks : ""}
Output raw SVG only.`;
}

function buildEditPrompt(input: DesignGenerationInput): string {
  const { data, viewBox } = input;
  const hasImage = (input.referenceImages || []).length > 0;

  const textBlocks = Object.entries(data)
    .filter(([k, v]) => typeof v === "string" && v.trim() && k !== "editInstruction" && k !== "size")
    .map(([k, v]) => `${fieldLabel(k)}: ${v}`)
    .join("\n");

  let body = `Apply ONLY the requested change and return the full updated SVG. Keep the same viewBox "${viewBox}". Do not redesign, do not add or remove elements, and do not change text, layout, fonts, sizes, or positions unless the request explicitly says so.`;

  if (textBlocks) body += `\nText/content to keep exactly as-is:\n${textBlocks}`;
  if (input.sourceSvg) body += `\n\nCURRENT SVG TO EDIT:\n${input.sourceSvg}`;
  if (hasImage && !input.sourceSvg) body += `\n\nThe current design is shown in the attached image(s). Recreate it as an SVG faithfully: copy the exact visible text, layout, colors, and composition, then apply ONLY the requested change. Do not use generic placeholder text such as "Design Title" or "Subtitle" — use the real text from the image.`;

  body += `\n\nChange to apply: ${input.editNote}\n\nReturn the updated SVG only.`;
  return body;
}

