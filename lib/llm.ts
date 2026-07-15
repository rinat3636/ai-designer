import { Anthropic } from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { placeholderSVG } from "./design";

export type Concept = {
  name: string;
  description: string;
  palette: string[];
  recommendations: string[];
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

function getAnthropicClient() {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  return new Anthropic({
    apiKey: key,
    baseURL: process.env.ANTHROPIC_BASE_URL || undefined,
  });
}

export async function generateConcepts(brief: Brief): Promise<Concept[]> {
  const promptConfig = await prisma.promptConfig.findUnique({
    where: { key: "conceptGeneration" },
  });
  const systemPrompt =
    promptConfig?.prompt ||
    `Ты — опытный арт-директор и маркетолог. На основе брифа клиента придумай 4-6 концепций дизайна. Для каждой концепции дай: название (1-2 слова), краткое описание (1-2 предложения), палитра из 5 hex-кодов, 3 рекомендации по стилю. Верни ТОЛЬКО JSON-объект со свойством "concepts" — массив объектов {name, description, palette, recommendations}. Без markdown, без пояснений.`;

  const userPrompt = `Бриф клиента:
- Название: ${brief.companyName || "—"}
- Чем занимается: ${brief.businessDesc || "—"}
- Сайт: ${brief.website || "—"}
- Целевая аудитория: ${brief.targetAudience || "—"}
- Предпочитаемый стиль: ${brief.style || "—"}
- Фирменные цвета: ${brief.colors?.join(", ") || "—"}

Сгенерируй концепции. Верни ТОЛЬКО JSON.`;

  const anthropic = getAnthropicClient();
  if (anthropic) {
    try {
      const res = await anthropic.messages.create({
        model: process.env.ANTHROPIC_MODEL || "claude-fable-5",
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      });
      const text = (res.content[0] as any)?.text || "";
      return parseConcepts(text);
    } catch (e) {
      console.error("Anthropic concepts error", e);
    }
  }

  return fallbackConcepts();
}

function parseConcepts(text: string): Concept[] {
  const cleaned = text.replace(/```json|```/g, "").trim();
  try {
    const parsed = JSON.parse(cleaned);
    const concepts = Array.isArray(parsed.concepts) ? parsed.concepts : parsed;
    if (!Array.isArray(concepts)) throw new Error("invalid concepts");
    return concepts.slice(0, 6).map((c: any) => ({
      name: String(c.name || "Концепция"),
      description: String(c.description || ""),
      palette: Array.isArray(c.palette) ? c.palette.map(String) : ["#2563eb", "#f8fafc", "#0f172a"],
      recommendations: Array.isArray(c.recommendations) ? c.recommendations.map(String) : [],
    }));
  } catch (e) {
    console.error("Concept parse error", e, text);
    return fallbackConcepts();
  }
}

function fallbackConcepts(): Concept[] {
  return [
    {
      name: "Минимализм",
      description: "Чистый современный стиль с акцентом на типографику.",
      palette: ["#0f172a", "#f8fafc", "#64748b", "#e2e8f0", "#3b82f6"],
      recommendations: ["Много воздуха", "Минимум цветов", "Современные шрифты"],
    },
    {
      name: "Премиум",
      description: "Темные цвета и акценты для премиального позиционирования.",
      palette: ["#1a1a1a", "#d4af37", "#f5f5f5", "#8a8a8a", "#111111"],
      recommendations: ["Используйте шрифты с засечками", "Металлические детали", "Низкая контрастность"],
    },
    {
      name: "Современный",
      description: "Градиенты, стекло и объем для современного digital-стиля.",
      palette: ["#6366f1", "#ec4899", "#06b6d4", "#f0f9ff", "#1e293b"],
      recommendations: ["Яркие градиенты", "Эффект стекла", "Крупные формы"],
    },
    {
      name: "Яркий продающий",
      description: "Максимальный акцент на акциях и выгоде.",
      palette: ["#ef4444", "#facc15", "#ffffff", "#1f2937", "#22c55e"],
      recommendations: ["Крупные проценты", "Контрастные кнопки", "Эмоциональные слова"],
    },
  ];
}

// ---------------------------------------------------------------------------
// Image / design generation via SVG output
// ---------------------------------------------------------------------------

export type DesignGenerationInput = {
  brief: Brief;
  concept: Concept;
  data: Record<string, string>;
  template: { slug: string; name: string; category: string };
  viewBox: string;
};

export async function generateDesigns(
  input: DesignGenerationInput,
  count = 4,
  signal?: AbortSignal
): Promise<{ svg: string; label: string; metadata?: any }[]> {
  const anthropic = getAnthropicClient();
  const results: { svg: string; label: string; metadata?: any }[] = [];

  for (let i = 0; i < count; i++) {
    if (signal?.aborted) break;
    try {
      if (anthropic) {
        const svg = await generateOneSvg(anthropic, input, i);
        if (svg) {
          results.push({ svg, label: `Вариант ${i + 1}` });
          continue;
        }
      }
      results.push({ svg: placeholderSVG(input, i), label: `Вариант ${i + 1}` });
    } catch (e) {
      console.error(`Design variant ${i} error`, e);
      results.push({ svg: placeholderSVG(input, i), label: `Вариант ${i + 1}` });
    }
  }

  return results;
}

async function generateOneSvg(
  client: Anthropic,
  input: DesignGenerationInput,
  variantIndex: number
): Promise<string | null> {
  const system =
    "You are an expert graphic designer. Generate a complete, valid SVG 1.1 design. Output raw SVG markup only, without markdown code fences, explanations or comments. Use only system fonts (sans-serif, serif, monospace). Keep text readable and inside the viewBox.";

  const userPrompt = buildDesignPrompt(input, variantIndex);

  const res = await client.messages.create({
    model: process.env.ANTHROPIC_MODEL || "claude-fable-5",
    max_tokens: 4096,
    system,
    messages: [{ role: "user", content: userPrompt }],
  });

  const text = (res.content[0] as any)?.text || "";
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
  const orientation = (w >= h ? "landscape" : "portrait");
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

  return `Design a ${orientation} marketing graphic for a business.

Canvas: viewBox="${viewBox}".

Business: ${brief.companyName || ""} — ${brief.businessDesc || ""}. Target audience: ${brief.targetAudience || ""}.

Design concept "${concept.name}": ${concept.description}. Palette (use only these hex colors): ${concept.palette.join(", ")}.

Required text / data:
${textBlocks || "( create short marketing text in Russian )"}

Template: ${template.name} (${template.category}).

Composition preference for this variant (#${variantIndex + 1}): ${styleHints[variantIndex % styleHints.length]}.

Return a single self-contained SVG with embedded styles. Use the concept colors as background gradients and accents. Add the business name and key text prominently. Do not include raster images.`;
}
