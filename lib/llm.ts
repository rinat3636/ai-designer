import { prisma } from "@/lib/prisma";
import { placeholderSVG } from "./design";

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

async function callChatCompletionRaw(
  systemPrompt: string,
  messages: ChatMessage[],
  maxTokens = 4096,
  jsonMode = false
): Promise<string | null> {
  const cfg = getApiConfig();
  if (!cfg) return null;

  try {
    const body: any = {
      model: cfg.model,
      messages: [{ role: "system", content: systemPrompt }, ...messages],
      max_tokens: maxTokens,
      reasoning_effort: "low",
    };
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
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("Chat completion error", res.status, text.slice(0, 500));
      return null;
    }

    const data = (await res.json()) as ChatCompletionResponse;
    const choice = data.choices?.[0];
    console.log("Chat completion usage:", JSON.stringify(data.usage), "finish_reason:", choice?.finish_reason);
    return choice?.message?.content?.trim() || null;
  } catch (e) {
    console.error("callChatCompletionRaw error", e);
    return null;
  }
}

async function callChatCompletion(
  systemPrompt: string,
  userPrompt: string,
  maxTokens = 4096,
  jsonMode = false
): Promise<string | null> {
  return callChatCompletionRaw(systemPrompt, [{ role: "user", content: userPrompt }], maxTokens, jsonMode);
}

export async function chatInterview(
  messages: ChatMessage[],
  template: InterviewTemplate,
  currentData: Record<string, any> = {}
): Promise<InterviewResult> {
  const cfg = getApiConfig();
  if (!cfg) {
    return heuristicInterview(template, currentData, messages);
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
  if (!text) return heuristicInterview(template, currentData, messages);

  const result = parseInterviewResponse(text, currentData);
  if (result) {
    if (result.done) enrichConcepts(result);
    return result;
  }

  // If the model returned natural language, try to reformat via a second call.
  const repaired = await repairInterviewResponse(text, messages, template, currentData);
  if (repaired) {
    if (repaired.done) enrichConcepts(repaired);
    return repaired;
  }

  return heuristicInterview(template, currentData, messages);
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

async function heuristicInterview(
  template: InterviewTemplate,
  currentData: Record<string, any>,
  messages: ChatMessage[]
): Promise<InterviewResult> {
  const lastUser = messages
    .slice()
    .reverse()
    .find((m) => m.role === "user");
  const lastUserText = extractTextFromMessage(lastUser);

  // Try to understand the latest answer.
  const updated = { ...currentData };
  const size = extractSizeFromText(lastUserText);
  if (size) {
    updated.size = size;
    if (!updated.data || typeof updated.data !== "object") updated.data = {};
    updated.data.size = size;
  }
  if (lastUserText && !updated.businessDesc) {
    updated.businessDesc = lastUserText;
  } else if (lastUserText && !updated.companyName) {
    updated.companyName = lastUserText;
  } else if (lastUserText && !updated.targetAudience) {
    updated.targetAudience = lastUserText;
  } else if (lastUserText && !updated.style) {
    updated.style = lastUserText;
  }

  if (!updated.businessDesc) {
    return {
      message: "Расскажите, пожалуйста, чем занимается ваша компания? Это поможет подобрать правильный стиль.",
      extractedData: updated,
      done: false,
    };
  }
  if (!updated.companyName) {
    return {
      message: "Как называется компания?",
      extractedData: updated,
      done: false,
    };
  }
  if (!updated.targetAudience) {
    return {
      message: "Кто ваша целевая аудитория?",
      extractedData: updated,
      done: false,
    };
  }
  if (!updated.style && !updated.colors?.length) {
    return {
      message: "Есть ли пожелания по стилю или фирменным цветам?",
      extractedData: updated,
      done: false,
    };
  }

  const brief = buildBrief(updated);
  const conceptResult = await generateConcepts(brief, template);
  return {
    message: "Вот несколько концепций. Выберите подходящую:",
    extractedData: updated,
    done: true,
    analysis: conceptResult.analysis,
    concepts: conceptResult.concepts,
  };
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
    `Ты — опытный арт-директор и маркетолог. Проанализируй нишу клиента и предложи 4-6 концепций дизайна.

Верни ТОЛЬКО JSON-объект вида:
{
  "analysis": "2-4 предложения: что работает в нише, какая палитра/стиль подойдут, почему.",
  "concepts": [
    {
      "name": "1-2 слова",
      "description": "1-2 предложения",
      "explanation": "1-2 предложения, почему эта концепция подходит конкретно для этого бизнеса/аудитории",
      "palette": ["#hex", "#hex", "#hex", "#hex", "#hex"],
      "recommendations": ["...", "...", "..."]
    }
  ]
}

Без markdown, без пояснений вне JSON.`;

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

  const text = await callChatCompletion(systemPrompt, userPrompt, 4096, true);
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
// Image / design generation via SVG output
// ---------------------------------------------------------------------------

export type DesignGenerationInput = {
  brief: Brief;
  concept: Concept;
  data: Record<string, string>;
  template: { slug: string; name: string; category: string; promptHints?: any };
  viewBox: string;
  editNote?: string;
};

export async function generateDesigns(
  input: DesignGenerationInput,
  count = 4,
  signal?: AbortSignal
): Promise<{ svg: string; label: string; metadata?: any }[]> {
  if (signal?.aborted) return [];

  const variants = Array.from({ length: count }, (_, i) => i);
  const promises = variants.map(async (i) => {
    if (signal?.aborted) return { svg: placeholderSVG(input, i), label: `Вариант ${i + 1}`, metadata: { aborted: true } };
    try {
      const svg = await generateOneSvg(input, i);
      if (svg) return { svg, label: `Вариант ${i + 1}` };
      return { svg: placeholderSVG(input, i), label: `Вариант ${i + 1}` };
    } catch (e) {
      console.error(`Design variant ${i} error`, e);
      return { svg: placeholderSVG(input, i), label: `Вариант ${i + 1}` };
    }
  });

  return Promise.all(promises);
}

type EditParseResult = {
  updatedData: Record<string, string>;
  editSummary: string;
  responseToUser: string;
  clarificationQuestion?: string | null;
};

async function parseEditInstruction(
  input: DesignGenerationInput,
  instruction: string
): Promise<EditParseResult> {
  const system = `You are an AI design editor. The user wants to change an existing design.
Analyze the request and output valid JSON with these fields:
- updatedData: object with the same keys as the current data but updated values. Set a value to "" to remove it. Add new keys only if they naturally fit the request (phone, address, qrUrl, website, discount, etc.).
- editSummary: a concise English instruction for the SVG generator describing the change to apply.
- responseToUser: a short, friendly Russian acknowledgement of the change or the clarification question.
- clarificationQuestion: null if the request is clear, otherwise one short multiple-choice or open question in Russian to clarify the intent.

Current design type: "${input.template.name}" (${input.template.category}).`;

  const user = `Current data:\n${JSON.stringify(input.data, null, 2)}\n\nUser request: "${instruction}"\n\nOutput JSON only.`;

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
  signal?: AbortSignal
): Promise<{ svg: string; label: string; clarificationQuestion?: string }[]> {
  if (!getApiConfig()) return [];

  const parsed = await parseEditInstruction(input, instruction);
  if (parsed.clarificationQuestion) {
    return [{ svg: "", label: "", clarificationQuestion: parsed.clarificationQuestion }];
  }

  const updatedInput: DesignGenerationInput = {
    ...input,
    data: parsed.updatedData,
    editNote: parsed.editSummary,
  };

  return generateDesigns(updatedInput, count, signal);
}

async function generateOneSvg(input: DesignGenerationInput, variantIndex: number): Promise<string | null> {
  if (!getApiConfig()) return null;

  const system = `You are an expert SVG designer. Output one raw SVG 1.1. No markdown, no comments, no explanation. Use only sans-serif, serif or monospace. All text inside viewBox. Flat vector, no raster. Balanced, readable, high contrast, professional.`;

  const userPrompt = buildDesignPrompt(input);
  // Claude reasoning models need a large token budget: internal reasoning consumes
  // most of the budget, so we request plenty of room for the actual SVG output.
  const text = await callChatCompletion(system, userPrompt, 16000);
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

  return `Create a ${role} for "${brief.companyName || template.name}".
Business: ${trunc(brief.businessDesc, 80) || "—"}. Concept: ${concept.name}. Style: ${trunc(brief.style || concept.name, 50)}. Palette: ${concept.palette.join(", ")}.
Template: ${template.name}.${designHint}${transparentNote}
viewBox="${viewBox}" (${w}×${h}).${textBlocks ? "\n" + textBlocks : ""}
${input.editNote ? `Edit: ${input.editNote}\n` : ""}Output raw SVG only.`;
}

