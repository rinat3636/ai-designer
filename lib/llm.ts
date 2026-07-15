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
  choices?: { message?: { content?: string } }[];
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
  maxTokens = 4096
): Promise<string | null> {
  const cfg = getApiConfig();
  if (!cfg) return null;

  try {
    const res = await fetch(`${cfg.baseURL}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify({
        model: cfg.model,
        messages: [{ role: "system", content: systemPrompt }, ...messages],
        max_tokens: maxTokens,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("Chat completion error", res.status, text.slice(0, 500));
      return null;
    }

    const data = (await res.json()) as ChatCompletionResponse;
    return data.choices?.[0]?.message?.content?.trim() || null;
  } catch (e) {
    console.error("callChatCompletionRaw error", e);
    return null;
  }
}

async function callChatCompletion(
  systemPrompt: string,
  userPrompt: string,
  maxTokens = 4096
): Promise<string | null> {
  return callChatCompletionRaw(systemPrompt, [{ role: "user", content: userPrompt }], maxTokens);
}

export async function chatInterview(
  messages: ChatMessage[],
  template: InterviewTemplate,
  currentData: Record<string, any> = {}
): Promise<InterviewResult> {
  const cfg = getApiConfig();
  if (!cfg) {
    return fallbackInterview(template, currentData);
  }

  const fields = Array.isArray(template.fields)
    ? template.fields.map((f: any) => `- ${f.name} (${f.label}${f.required ? ", обязательно" : ""})`).join("\n")
    : "";

  const conceptHint = template.promptHints?.concept || "";
  const designHint = template.promptHints?.design || "";

  const systemPrompt = `Ты — профессиональный арт-директор и дизайнер. Веди диалог с клиентом, чтобы создать дизайн для типа "${template.name}" (${template.category}).

Твоя задача — по одному короткому профессиональному вопросу собрать всё необходимое. Прими любую информацию, которую клиент даёт сам, включая загруженные фото-референсы. Если клиент загружает изображение, прокомментируй, как его можно использовать, и задай уточняющий вопрос.

Не задавай все вопросы сразу — только один за раз. Когда информации достаточно (обычно после 3-6 вопросов), предложи 4-6 концепций дизайна.

Справка по типу дизайна:
- Описание: ${template.description || ""}
- Подсказка для концепций: ${conceptHint}
- Подсказка для макета: ${designHint}

Поля макета, которые нужно собрать (можно спрашивать неявно, через диалог):
${fields || "- нет специфических полей"}

В каждом ответе возвращай ТОЛЬКО JSON строго такого вида, без markdown:
{
  "message": "то, что ты говоришь клиенту (на русском, один вопрос или представление концепций)",
  "extractedData": {
    "businessDesc": "...",
    "companyName": "...",
    "targetAudience": "...",
    "style": "...",
    "colors": ["#hex", "#hex"],
    "logoUrl": "...",
    "referenceImages": ["url", "url"],
    "data": { "headline": "...", "subheadline": "..." }
  },
  "done": false,
  "analysis": null,
  "concepts": null
}

Когда готов предложить концепции, установи done: true и верни:
{
  "message": "Вот несколько концепций. Выберите подходящую:",
  "extractedData": { ... },
  "done": true,
  "analysis": "2-4 предложения анализа ниши",
  "concepts": [
    { "name": "...", "description": "...", "explanation": "...", "palette": ["#hex", ...], "recommendations": ["..."] }
  ]
}

Важно:
- colors может быть строкой или массивом hex.
- referenceImages — массив URL загруженных референсов.
- data — объект с полями макета (headline, subheadline и т.д.).
- Не показывай JSON клиенту, только message.

Текущие собранные данные: ${JSON.stringify(currentData)}`;

  const text = await callChatCompletionRaw(systemPrompt, messages, 4096);
  if (!text) return fallbackInterview(template, currentData);

  return await parseInterviewResponse(text, template, currentData);
}

async function parseInterviewResponse(
  text: string,
  template: InterviewTemplate,
  currentData: Record<string, any>
): Promise<InterviewResult> {
  const cleaned = text.replace(/```json|```/g, "").trim();
  const candidates = [cleaned, cleaned.replace(/\r?\n/g, "")];

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      const extractedData = { ...currentData, ...(parsed.extractedData || {}) };

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
    } catch {
      // try next candidate
    }
  }

  console.error("Interview parse error", text);
  return fallbackInterview(template, currentData);
}

async function fallbackInterview(
  template: InterviewTemplate,
  currentData: Record<string, any>
): Promise<InterviewResult> {
  if (!currentData.businessDesc && !currentData.companyName) {
    return {
      message: "Расскажите, пожалуйста, чем занимается ваша компания? Это поможет мне подобрать правильный стиль.",
      extractedData: currentData,
      done: false,
    };
  }

  const brief: Brief = {
    businessDesc: currentData.businessDesc || "",
    companyName: currentData.companyName || "",
    website: currentData.website || "",
    targetAudience: currentData.targetAudience || "",
    style: currentData.style || "",
    colors: Array.isArray(currentData.colors) ? currentData.colors : [],
    logoUrl: currentData.logoUrl || (currentData.referenceImages?.[0] || ""),
  };

  const conceptResult = await generateConcepts(brief, template);
  return {
    message: "Вот несколько концепций. Выберите подходящую:",
    extractedData: currentData,
    done: true,
    analysis: conceptResult.analysis,
    concepts: conceptResult.concepts,
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

  const text = await callChatCompletion(systemPrompt, userPrompt);
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
  const cleaned = text.replace(/```json|```/g, "").trim();
  const candidates = [cleaned, cleaned.replace(/\r?\n/g, "")];

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
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
    } catch {
      // try next candidate
    }
  }

  console.error("Concept parse error", text);
  return fallbackConcepts();
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

async function generateOneSvg(input: DesignGenerationInput, variantIndex: number): Promise<string | null> {
  if (!getApiConfig()) return null;

  const system =
    "You are an expert graphic designer. Generate a complete, valid SVG 1.1 design. Output raw SVG markup only, without markdown code fences, explanations or comments. Use only system fonts (sans-serif, serif, monospace). Keep text readable and inside the viewBox.";

  const userPrompt = buildDesignPrompt(input, variantIndex);

  const text = await callChatCompletion(system, userPrompt, 4096);
  if (!text) return null;

  const svgMatch = text.match(/<svg[\s\S]*?<\/svg>/i);
  if (!svgMatch) return null;
  let svg = svgMatch[0];
  // Ensure XML namespace if missing
  if (!svg.includes("xmlns=")) {
    svg = svg.replace(/<svg/i, '<svg xmlns="http://www.w3.org/2000/svg"');
  }
  return svg;
}

function buildDesignPrompt(input: DesignGenerationInput, variantIndex: number): string {
  const { brief, concept, data, template, viewBox } = input;
  const [w, h] = viewBox.split(" ").slice(2).map(Number);
  const orientation = w >= h ? "landscape" : "portrait";
  const styleHints = [
    "clean centered layout",
    "asymmetric composition with accent shape",
    "bold typographic hierarchy",
    "soft gradient background with geometric accents",
  ];
  const textBlocks = Object.entries(data)
    .filter(([, v]) => typeof v === "string" && v.trim())
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");

  const designHint = template.promptHints?.design
    ? `\n\nТип дизайна "${template.name}" (${template.category}). Специфические требования: ${template.promptHints.design}`
    : `\n\nTemplate: ${template.name} (${template.category}).`;
  const transparentNote = template.promptHints?.transparent
    ? "\n\nBackground must be transparent. Do NOT draw any background rectangle, gradient or fill behind the main design. Only the design elements on a transparent canvas."
    : "";

  return `Design a ${orientation} marketing graphic for a business.

Canvas: viewBox="${viewBox}".

Business: ${brief.companyName || ""} — ${brief.businessDesc || ""}. Target audience: ${brief.targetAudience || ""}.

Design concept "${concept.name}": ${concept.description}. Palette (use only these hex colors): ${concept.palette.join(", ")}.${designHint}${transparentNote}

Required text / data:
${textBlocks || "( create short marketing text in Russian )"}

Composition preference for this variant (#${variantIndex + 1}): ${styleHints[variantIndex % styleHints.length]}.

Return a single self-contained SVG with embedded styles. Use the concept colors as background gradients and accents. Add the business name and key text prominently. Do not include raster images.`;
}
