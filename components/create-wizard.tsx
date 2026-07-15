"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import * as Icons from "lucide-react";
import {
  ArrowLeft,
  Wand2,
  Sparkles,
  FileImage,
  Paperclip,
  Send,
  Download,
  RefreshCw,
  Plus,
  Heart,
  Trash2,
  MessageSquare,
  Upload,
} from "lucide-react";
import type { Template, Brand, Generation, Concept, Brief } from "@/types";
import type { GenerationImage } from "@prisma/client";
import { downloadSvg, downloadRaster, getViewBoxSize } from "@/lib/client-image";
import { getViewBoxForTemplate } from "@/lib/design";

const EDIT_KEYWORDS =
  /(сделай|сделайте|измени|измените|поменяй|поменяйте|замени|замените|добавь|добавьте|убери|удали|передвинь|сдвинь|переделай|переделайте|обнови|обновите|отредактируй|отредактируйте|исправь|исправьте|уменьш|увелич|крупнее|меньше|ярче|темнее|светлее|контраст|насыщ|размер|шрифт|текст|цвет|фон|background|change|make|edit|red|blue|green|yellow|black|white|красн|син|зел[её]н|желт|черн|бел|оранж|розов|фиолет|коричн|сер|голуб|бирюз)/i;

function looksLikeEdit(text: string, hasImages: boolean): boolean {
  if (!text || !hasImages) return false;
  return EDIT_KEYWORDS.test(text);
}

function extractSize(text: string): string {
  const match = text.match(/(\d{2,4})\s?[x×]\s?(\d{2,4})/i);
  return match ? `${match[1]}x${match[2]}` : "";
}

const UPLOAD_TEMPLATE_ID = "upload";
const WORKSPACE_STORAGE_KEY = "ai-designer-workspace";
const SCALE_TARGETS: { label: string; match: RegExp }[] = [
  { label: "Баннер", match: /баннер|banner|hero/i },
  { label: "Визитка", match: /визитк|business/i },
  { label: "Пост", match: /пост|post/i },
  { label: "Stories", match: /stories|сторис/i },
  { label: "Листовка", match: /листовк|флаер|flyer/i },
];
const UPLOAD_TEMPLATE: Template = {
  id: UPLOAD_TEMPLATE_ID,
  slug: "custom-upload",
  category: "Редактор",
  categoryKey: "editor",
  name: "Редактировать свой макет",
  description: "Загрузите готовый логотип, сертификат или другой макет, и ИИ внесёт правки, сохранив оригинал.",
  icon: "Upload",
  fields: [],
  promptHints: {},
  isActive: true,
  displayOrder: -1,
  createdAt: new Date(),
  updatedAt: new Date(),
} as unknown as Template;

type ChatContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

type ChatMessage = {
  role: "user" | "assistant";
  content: string | ChatContentPart[];
};

type WizardMode = "select" | "upload-edit" | "interview" | "concepts" | "generating" | "result";

export function CreateWizard({
  templates,
}: {
  templates: Template[];
  brand: Brand | null;
}) {
  const [mode, setMode] = useState<WizardMode>("select");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [showTemplates, setShowTemplates] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentData, setCurrentData] = useState<Record<string, any>>({});
  const [inputText, setInputText] = useState("");
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [analysis, setAnalysis] = useState<string>("");
  const [selectedConcept, setSelectedConcept] = useState<Concept | null>(null);
  const [generation, setGeneration] = useState<Generation | null>(null);
  const [resultImages, setResultImages] = useState<GenerationImage[]>([]);
  const [selectedResultImage, setSelectedResultImage] = useState<GenerationImage | null>(null);
  const [editMessages, setEditMessages] = useState<ChatMessage[]>([]);
  const [editInput, setEditInput] = useState("");
  const [editImages, setEditImages] = useState<string[]>([]);
  const [isFavorite, setIsFavorite] = useState(false);
  const [downloadFormat, setDownloadFormat] = useState<"svg" | "png" | "jpg">("png");
  const [downloadWidth, setDownloadWidth] = useState<string>("");
  const [downloadHeight, setDownloadHeight] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [compareOpen, setCompareOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [lastRecommendation, setLastRecommendation] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const selectionHistoryRef = useRef<GenerationImage[]>([]);
  const restoredRef = useRef(false);
  const recommendedForRef = useRef<string>("");
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLTextAreaElement>(null);

  const template = useMemo(() => {
    if (selectedTemplateId === UPLOAD_TEMPLATE_ID) return UPLOAD_TEMPLATE;
    return templates.find((t) => t.id === selectedTemplateId) || null;
  }, [selectedTemplateId, templates]);

  const categories = useMemo(() => {
    const map = new Map<string, Template[]>();
    for (const t of templates) {
      const list = map.get(t.categoryKey) || [];
      list.push(t);
      map.set(t.categoryKey, list);
    }
    return map;
  }, [templates]);

  // Autosave: restore the last session so an accidentally closed tab
  // continues from where the user left off.
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    try {
      const raw = localStorage.getItem(WORKSPACE_STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (saved.generationId) {
        fetch(`/api/projects/${saved.generationId}`)
          .then((r) => (r.ok ? r.json() : null))
          .then((json) => {
            if (json?.generation) {
              setGeneration(json.generation);
              setMode("result");
              recommendedForRef.current = json.generation.id;
              toast("Продолжаем с последнего места");
            }
          })
          .catch(() => {});
      } else if (["interview", "upload-edit", "concepts"].includes(saved.mode)) {
        setSelectedTemplateId(saved.selectedTemplateId || "");
        setMessages(saved.messages || []);
        setCurrentData(saved.currentData || {});
        setConcepts(saved.concepts || []);
        setAnalysis(saved.analysis || "");
        setMode(saved.mode);
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (!restoredRef.current) return;
    try {
      localStorage.setItem(
        WORKSPACE_STORAGE_KEY,
        JSON.stringify({
          mode,
          selectedTemplateId,
          messages,
          currentData,
          concepts,
          analysis,
          generationId: generation?.id || null,
        })
      );
    } catch {}
  }, [mode, selectedTemplateId, messages, currentData, concepts, analysis, generation]);

  // Proactive review: after a generation the assistant analyzes the result
  // and suggests improvements the user can apply with one click.
  useEffect(() => {
    if (mode !== "result" || !generation || recommendedForRef.current === generation.id) return;
    recommendedForRef.current = generation.id;
    fetch(`/api/projects/${generation.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        instruction:
          "Проанализируй текущий дизайн как эксперт и дай максимум 2 конкретные рекомендации по улучшению (например: увеличить заголовок, перенести QR-код). Коротко, списком. Это вопрос-консультация, ничего не меняй.",
        selectedImageUrl: generation.images?.[0]?.url,
        messages: [],
        count: 1,
      }),
    })
      .then((r) => r.json())
      .then((json) => {
        if (json.assistantMessage) {
          setEditMessages((prev) => [...prev, { role: "assistant", content: json.assistantMessage }]);
          setLastRecommendation(json.assistantMessage);
        }
      })
      .catch(() => {});
  }, [mode, generation]);

  useEffect(() => {
    if (selectedTemplateId && mode === "select") {
      setMessages([]);
      setCurrentData({});
      setInputText("");
      setSelectedImages([]);
      setEditMessages([]);
      setEditInput("");
      if (selectedTemplateId === UPLOAD_TEMPLATE_ID) {
        setMode("upload-edit");
      } else {
        setMode("interview");
      }
    }
  }, [selectedTemplateId, mode]);

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [messages, editMessages, loading]);

  useEffect(() => {
    if (selectedConcept && mode === "concepts") {
      generate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedConcept, mode]);

  useEffect(() => {
    if (generation) {
      setResultImages(generation.images || []);
      setSelectedResultImage(generation.images?.[0] || null);
      setIsFavorite(generation.isFavorite || false);
      setEditMessages([]);
      setEditInput("");
      setEditImages([]);
    }
  }, [generation]);

  useEffect(() => {
    if (!selectedResultImage || !generation?.template?.slug) return;
    const baseViewBox = getViewBoxForTemplate(generation.template.slug);
    const baseSize = getViewBoxSize(`<svg viewBox="${baseViewBox}"/>`);
    setDownloadWidth(String(baseSize?.width || 1024));
    setDownloadHeight(String(baseSize?.height || 1024));

    fetch(selectedResultImage.url)
      .then((r) => r.text())
      .then((svg) => {
        const size = getViewBoxSize(svg);
        if (size) {
          setDownloadWidth(String(size.width));
          setDownloadHeight(String(size.height));
        }
      })
      .catch(() => {});
  }, [selectedResultImage, generation?.template?.slug]);

  function iconFor(name?: string) {
    const Icon = name ? (Icons as any)[name] || FileImage : FileImage;
    return Icon ? <Icon className="size-6" /> : <FileImage className="size-6" />;
  }

  function buildBrief(): Brief {
    const colors = Array.isArray(currentData.colors)
      ? currentData.colors
      : typeof currentData.colors === "string"
      ? currentData.colors
          .split(/[,;]/)
          .map((c: string) => c.trim())
          .filter(Boolean)
      : [];
    return {
      businessDesc: currentData.businessDesc || "",
      companyName: currentData.companyName || "",
      website: currentData.website || "",
      targetAudience: currentData.targetAudience || "",
      style: currentData.style || "",
      colors,
      logoUrl: currentData.logoUrl || currentData.referenceImages?.[0] || "",
    };
  }

  async function uploadFile(file: File): Promise<{ url: string; width: number; height: number } | null> {
    setUploading(true);
    setError("");
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      return { url: json.url, width: json.width || 0, height: json.height || 0 };
    } catch (e: any) {
      setError(e.message || "Ошибка загрузки файла");
      return null;
    } finally {
      setUploading(false);
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const result = await uploadFile(file);
    if (result) {
      const { url, width, height } = result;
      if (width > 0 && height > 0) {
        setCurrentData((prev) => ({ ...prev, size: `${width}x${height}` }));
      }
      if (mode === "result") {
        setEditImages((prev) => [...prev, url]);
      } else {
        setSelectedImages((prev) => [...prev, url]);
      }
    }
    e.target.value = "";
  }

  async function startFromText(text: string) {
    if (!text) return;
      setLoading(true);
      setError("");
      try {
        const res = await fetch("/api/resolve-template", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: text }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error);
        const resolved = templates.find((t) => t.id === json.templateId);
        if (!resolved) {
          setError("Не удалось определить тип дизайна. Выберите его из списка или опишите точнее.");
          return;
        }

        const nextData: Record<string, any> = json.size
          ? { size: json.size, data: { size: json.size } }
          : {};
        const userMessage: ChatMessage = { role: "user", content: text };
        setSelectedTemplateId(resolved.id);
        setMode("interview");
        setCurrentData(nextData);
        setMessages([userMessage]);
        setInputText("");

        const interviewRes = await fetch("/api/interview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            templateId: resolved.id,
            messages: [userMessage],
            currentData: nextData,
          }),
        });
        const interviewJson = await interviewRes.json();
        if (!interviewRes.ok) throw new Error(interviewJson.error);

        setCurrentData((prev) => ({ ...prev, ...(interviewJson.extractedData || {}) }));
        setMessages((prev) => [...prev, { role: "assistant", content: interviewJson.message }]);
        if (interviewJson.done) {
          setAnalysis(interviewJson.analysis || "");
          setConcepts(interviewJson.concepts || []);
          setMode("concepts");
        }
      } catch (e: any) {
        setError(e.message || "Ошибка определения шаблона");
      } finally {
        setLoading(false);
      }
  }

  async function sendMessage() {
    const text = inputText.trim();

    // On the first screen, resolve the template from free-form text:
    // "сделай Stories для кофейни" selects the right template automatically.
    if (mode === "select") {
      await startFromText(text);
      return;
    }

    if ((!text && selectedImages.length === 0) || !template) return;

    // In the upload-edit mode, always edit the uploaded image directly.
    if (mode === "upload-edit" && selectedImages.length > 0) {
      const instruction = text || "Сохрани макет и примени небольшие улучшения";
      const editContent: ChatContentPart[] = [
        { type: "text", text: instruction },
        ...selectedImages.map((url) => ({ type: "image_url" as const, image_url: { url } })),
      ];
      setMessages((prev) => [...prev, { role: "user", content: editContent }]);
      return generateFromImage(instruction, selectedImages);
    }

    // If the user uploaded an image and the message looks like an edit request,
    // bypass the interview and generate a new SVG based on the uploaded design.
    if (looksLikeEdit(text, selectedImages.length > 0)) {
      const editContent: ChatContentPart[] = [
        { type: "text", text },
        ...selectedImages.map((url) => ({ type: "image_url" as const, image_url: { url } })),
      ];
      setMessages((prev) => [...prev, { role: "user", content: editContent }]);
      return generateFromImage(text, selectedImages);
    }

    const content: string | ChatContentPart[] =
      selectedImages.length > 0
        ? [
            { type: "text" as const, text: text || "Вот референс(ы):" },
            ...selectedImages.map((url) => ({
              type: "image_url" as const,
              image_url: { url },
            })),
          ]
        : text;

    const userMessage: ChatMessage = { role: "user", content };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInputText("");
    setSelectedImages([]);
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/interview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateId: template.id,
          messages: newMessages,
          currentData,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);

      setCurrentData((prev) => ({ ...prev, ...(json.extractedData || {}) }));
      setMessages((prev) => [...prev, { role: "assistant", content: json.message }]);

      if (json.done) {
        setAnalysis(json.analysis || "");
        setConcepts(json.concepts || []);
        setMode("concepts");
      }
    } catch (e: any) {
      setError(e.message || "Ошибка интервью");
    } finally {
      setLoading(false);
    }
  }

  async function generate() {
    if (!template || !selectedConcept) return;

    const brief = buildBrief();
    const data = (currentData.data || {}) as Record<string, string>;

    setLoading(true);
    setError("");
    setMode("generating");

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateId: template.id,
          brief,
          concept: selectedConcept,
          data,
          count: 1,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        if (res.status === 403) {
          toast.error(json.error || "Лимит генераций исчерпан. Перейдите на другой тариф.");
        }
        throw new Error(json.error);
      }
      setGeneration(json.generation);
      setMode("result");
      toast.success("Макеты готовы!");
    } catch (e: any) {
      setError(e.message || "Ошибка генерации");
      setMode("concepts");
    } finally {
      setLoading(false);
    }
  }

  async function generateFromImage(editInstruction: string, images: string[]) {
    if (!template) return;

    const brief: Brief = {
      businessDesc: currentData.businessDesc || "Загруженный пользователем макет",
      companyName: currentData.companyName || "",
      website: currentData.website || "",
      targetAudience: currentData.targetAudience || "",
      style: currentData.style || "",
      colors: Array.isArray(currentData.colors) ? currentData.colors : [],
      logoUrl: images[0] || "",
    };

    // Leave size empty unless explicitly requested so the server can keep
    // the uploaded image's original dimensions.
    const size = extractSize(editInstruction) || currentData.size || "";
    const data: Record<string, string> = {
      ...(currentData.data || {}),
      size,
      editInstruction,
    };

    const concept: Concept = {
      name: "На основе загруженного макета",
      description: "Сгенерировать SVG на основе загруженного изображения с учётом правки пользователя",
      explanation: "ИИ повторяет загруженный макет и применяет запрошенное изменение.",
      palette: brief.colors?.length ? brief.colors : ["#2563eb", "#f8fafc", "#0f172a"],
      recommendations: ["Сохранить композицию и текст с загруженного изображения", "Применить только запрошенное изменение"],
    };

    setInputText("");
    setSelectedImages([]);
    setLoading(true);
    setError("");
    setMode("generating");

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateId: template.id,
          brief,
          concept,
          data,
          referenceImageUrls: images,
          editNote: editInstruction,
          count: 1,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        if (res.status === 403) {
          toast.error(json.error || "Лимит генераций исчерпан. Перейдите на другой тариф.");
        }
        throw new Error(json.error);
      }
      setGeneration(json.generation);
      setMode("result");
      toast.success("Макет на основе изображения готов!");
    } catch (e: any) {
      setError(e.message || "Ошибка генерации по изображению");
      setMode(mode === "upload-edit" ? "upload-edit" : "interview");
    } finally {
      setLoading(false);
    }
  }

  async function sendEditInstruction(instruction: string, addToChat = true) {
    if (!generation || !selectedResultImage) return;
    const images = editImages;
    const userContent = [instruction, ...images].filter(Boolean).join("\n");
    const nextMessages: ChatMessage[] = addToChat
      ? [...editMessages, { role: "user", content: userContent }]
      : editMessages;
    if (addToChat) {
      setEditMessages(nextMessages);
    }
    setEditInput("");
    setEditImages([]);
    setLoading(true);
    setError("");

    try {
      const res = await fetch(`/api/projects/${generation.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instruction,
          selectedImageUrl: selectedResultImage.url,
          referenceImageUrls: images,
          messages: nextMessages,
          count: 2,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);

      if (json.revert) {
        const previous = selectionHistoryRef.current.pop();
        if (previous) {
          setSelectedResultImage(previous);
        }
        setEditMessages((prev) => [...prev, { role: "assistant", content: json.assistantMessage || "Вернул предыдущий вариант." }]);
      } else if (json.assistantMessage) {
        setEditMessages((prev) => [...prev, { role: "assistant", content: json.assistantMessage }]);
      } else if (json.clarificationQuestion) {
        setEditMessages((prev) => [...prev, { role: "assistant", content: json.clarificationQuestion }]);
      } else {
        const newImages = (json.images || []) as GenerationImage[];
        if (newImages.length > 0) {
          if (selectedResultImage) selectionHistoryRef.current.push(selectedResultImage);
          setResultImages((prev) => [...prev, ...newImages]);
          setSelectedResultImage(newImages[0]);
          toast("Варианты отредактированы");
        }
        setEditMessages((prev) => [...prev, { role: "assistant", content: "Готово. Новые варианты добавлены." }]);
      }
    } catch (e: any) {
      setError(e.message || "Не удалось отредактировать");
      setEditMessages((prev) => [...prev, { role: "assistant", content: "Ошибка: " + (e.message || "повторите позже") }]);
    } finally {
      setLoading(false);
    }
  }

  function sendEdit() {
    const text = editInput.trim();
    if (!text && editImages.length === 0) return;
    sendEditInstruction(text, true);
  }

  async function handleDownload() {
    if (!selectedResultImage || !generation) return;
    const name = `design-${generation.title || generation.template?.name || generation.id}`;
    try {
      if (downloadFormat === "svg") {
        await downloadSvg(selectedResultImage.url, `${name}.svg`);
      } else {
        const w = Number(downloadWidth) || undefined;
        const h = Number(downloadHeight) || undefined;
        const mime = downloadFormat === "png" ? "image/png" : "image/jpeg";
        await downloadRaster(selectedResultImage.url, `${name}.${downloadFormat}`, mime, w, h);
      }
      toast("Скачивание началось");
    } catch {
      toast.error("Не удалось скачать");
    }
  }

  function applyPreset(preset: string) {
    const parts = preset.split("x");
    if (parts.length === 2) {
      setDownloadWidth(parts[0]);
      setDownloadHeight(parts[1]);
    }
  }

  function handleRegenerate() {
    if (!template || !selectedConcept) return;
    generate();
  }

  function handleCreateSimilar() {
    sendEditInstruction("Сделай похожий вариант с небольшими отличиями", true);
  }

  function applyRecommendation() {
    if (!lastRecommendation) return;
    setLastRecommendation("");
    sendEditInstruction(`Примени эти рекомендации к текущему дизайну, сохранив всё остальное: ${lastRecommendation}`, true);
  }

  // One-click scaling: create a banner/business card/post/stories/flyer
  // in the same style as the finished design.
  async function handleScaleTo(target: Template) {
    if (!generation || !selectedResultImage) return;
    const brief = buildBrief();
    const concept: Concept =
      selectedConcept ||
      (generation.concept as unknown as Concept | null) || {
        name: "В том же стиле",
        description: "Повторить стиль готового дизайна в новом формате",
        palette: [],
        recommendations: ["Сохранить стиль, цвета и типографику референса"],
      };
    setLoading(true);
    setError("");
    setMode("generating");
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateId: target.id,
          brief,
          concept,
          data: { ...(currentData.data || {}) },
          referenceImageUrls: [selectedResultImage.url],
          editNote: `Создай ${target.name} в том же стиле, что и референс: те же цвета, шрифты и характер.`,
          count: 1,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setSelectedTemplateId(target.id);
      setGeneration(json.generation);
      setMode("result");
      toast.success(`${target.name} в том же стиле готов!`);
    } catch (e: any) {
      setError(e.message || "Ошибка генерации");
      setMode("result");
    } finally {
      setLoading(false);
    }
  }

  function handleEditFocus() {
    chatInputRef.current?.focus();
    chatScrollRef.current?.scrollTo({ top: chatScrollRef.current.scrollHeight, behavior: "smooth" });
  }

  async function toggleFavorite() {
    if (!generation) return;
    const next = !isFavorite;
    setIsFavorite(next);
    await fetch(`/api/projects/${generation.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isFavorite: next }),
    });
    toast(next ? "Добавлено в избранное" : "Убрано из избранного");
  }

  async function deleteGeneration() {
    if (!generation) return;
    const ok = confirm("Удалить генерацию?");
    if (!ok) return;
    await fetch(`/api/projects/${generation.id}`, { method: "DELETE" });
    restart();
  }

  function restart() {
    setMode("select");
    setSelectedTemplateId("");
    setMessages([]);
    setCurrentData({});
    setInputText("");
    setSelectedImages([]);
    setConcepts([]);
    setAnalysis("");
    setSelectedConcept(null);
    setGeneration(null);
    setResultImages([]);
    setSelectedResultImage(null);
    setEditMessages([]);
    setEditInput("");
    setError("");
  }

  function handleBack() {
    if (mode === "interview" || mode === "upload-edit") {
      setMode("select");
      setMessages([]);
      setCurrentData({});
      setInputText("");
      setSelectedImages([]);
    } else if (mode === "concepts") {
      setMode("interview");
    } else if (mode === "result") {
      restart();
    }
  }

  function renderMessageContent(content: string | ChatContentPart[]) {
    if (typeof content === "string") {
      return <p className="whitespace-pre-wrap text-sm leading-relaxed">{content}</p>;
    }
    return (
      <div className="space-y-2">
        {content.map((part, i) =>
          part.type === "text" ? (
            <p key={i} className="whitespace-pre-wrap text-sm leading-relaxed">
              {part.text}
            </p>
          ) : (
            <img
              key={i}
              src={part.image_url.url}
              alt="Референс"
              className="max-h-40 rounded-lg border object-cover"
            />
          )
        )}
      </div>
    );
  }

  const isResult = mode === "result";
  const activeMessages = isResult ? editMessages : messages;
  const activeInput = isResult ? editInput : inputText;
  const setActiveInput = isResult ? setEditInput : setInputText;
  const activeImages = isResult ? editImages : selectedImages;
  const setActiveImages = isResult ? setEditImages : setSelectedImages;
  const activeSend = isResult ? sendEdit : sendMessage;
  const inputPlaceholder =
    mode === "select"
      ? "Опишите, что нужно, например: «Сделай Stories для кофейни»…"
      : mode === "upload-edit"
      ? "Загрузите макет и напишите правку, например: «Сделай фон красным»…"
      : isResult
      ? "Напишите правку, например: «Сделай фон темнее»…"
      : "Ваш ответ…";

  function handleChatKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      activeSend();
    }
  }

  function onDragOver(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(true);
  }
  function onDragLeave() {
    setDragOver(false);
  }
  async function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    const result = await uploadFile(file);
    if (result) {
      const { url, width, height } = result;
      if (width > 0 && height > 0) {
        setCurrentData((prev) => ({ ...prev, size: `${width}x${height}` }));
      }
      if (mode === "result") {
        setEditImages((prev) => [...prev, url]);
      } else {
        setSelectedImages((prev) => [...prev, url]);
      }
    }
  }

  function ChatPanel() {
    return (
      <div
        className={`relative flex h-full min-h-0 flex-col rounded-xl border bg-card shadow-sm transition-colors ${
          dragOver ? "border-primary ring-2 ring-primary/20" : ""
        }`}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        {dragOver && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-primary/10">
            <p className="text-sm font-medium text-primary">Отпустите файл для загрузки</p>
          </div>
        )}
        <div className="flex items-center justify-between border-b p-3">
          <div className="flex items-center gap-2">
            <MessageSquare className="size-4 text-primary" />
            <h3 className="font-medium">{isResult ? "Правки" : mode === "upload-edit" ? "Редактор макета" : "Чат с ИИ-дизайнером"}</h3>
          </div>
          {template && !isResult && <span className="text-xs text-muted-foreground">{template.name}</span>}
        </div>

        <div ref={chatScrollRef} className="flex-1 space-y-4 overflow-y-auto p-3">
          {activeMessages.length === 0 && mode === "select" && (
            <div className="space-y-3">
              <div className="flex justify-start">
                <div className="max-w-[90%] rounded-xl bg-muted px-3 py-2 text-sm text-foreground">
                  Здравствуйте! Что вы хотите создать сегодня? Выберите вариант или просто опишите задачу своими словами.
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {["Логотип", "Баннер", "Карточка товара", "Инфографика", "Визитка"].map((label) => (
                  <Button
                    key={label}
                    type="button"
                    variant="outline"
                    className="h-11 justify-start text-sm"
                    disabled={loading}
                    onClick={() => startFromText(`Нужен ${label.toLowerCase()}`)}
                  >
                    {label}
                  </Button>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  className="h-11 justify-start text-sm"
                  disabled={loading}
                  onClick={() => setShowTemplates(true)}
                >
                  Другое
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="col-span-2 h-11 justify-start text-sm"
                  disabled={loading}
                  onClick={() => setSelectedTemplateId(UPLOAD_TEMPLATE_ID)}
                >
                  <Upload className="mr-2 size-4" /> Редактировать свой макет
                </Button>
              </div>
            </div>
          )}
          {activeMessages.length === 0 && mode === "upload-edit" && (
            <div className="text-center text-sm text-muted-foreground">
              Загрузите макет (логотип, сертификат и т.д.) и напишите, что изменить, например: «Сделай фон красным».
            </div>
          )}
          {activeMessages.length === 0 && mode === "interview" && (
            <div className="text-center text-sm text-muted-foreground">
              Напишите первое сообщение, например: «Нужен логотип для кофейни в стиле минимализма».
            </div>
          )}
          {activeMessages.length === 0 && isResult && (
            <div className="text-center text-sm text-muted-foreground">
              Макеты готовы. Пишите, что хотите изменить, например: «Передвинь логотип выше».
            </div>
          )}
          {activeMessages.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[90%] rounded-xl px-3 py-2 text-sm ${
                  m.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-foreground"
                }`}
              >
                {renderMessageContent(m.content)}
              </div>
            </div>
          ))}
          {isResult && lastRecommendation && !loading && (
            <div className="flex justify-start">
              <Button size="sm" onClick={applyRecommendation}>
                <Wand2 className="mr-1 size-4" /> Исправить
              </Button>
            </div>
          )}
          {loading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Wand2 className="size-4 animate-pulse" />
              {isResult ? "ИИ редактирует…" : mode === "upload-edit" ? "ИИ редактирует макет…" : "ИИ печатает…"}
            </div>
          )}
        </div>

        <div className="space-y-2 border-t p-3">
          {activeImages.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {activeImages.map((url) => (
                <div key={url} className="relative">
                  <img src={url} alt="Референс" className="h-16 w-16 rounded-lg border object-cover md:h-14 md:w-14" />
                  <button
                    type="button"
                    onClick={() => setActiveImages((prev) => prev.filter((u) => u !== url))}
                    className="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full bg-destructive text-xs text-white"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <input
              type="file"
              accept="image/*"
              className="hidden"
              ref={fileInputRef}
              onChange={handleFileUpload}
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              disabled={uploading || mode === "select"}
              onClick={() => fileInputRef.current?.click()}
              title="Прикрепить файл"
              className="h-11 w-11 shrink-0 md:h-10 md:w-10"
            >
              <Paperclip className="size-5 md:size-4" />
            </Button>
            <Textarea
              ref={chatInputRef}
              value={activeInput}
              onChange={(e) => setActiveInput(e.target.value)}
              placeholder={inputPlaceholder}
              rows={1}
              className="min-h-[44px] flex-1 resize-none text-base md:text-sm"
              onKeyDown={handleChatKeyDown}
              disabled={loading}
            />
            <Button
              type="button"
              disabled={loading || (!activeInput.trim() && activeImages.length === 0)}
              onClick={activeSend}
              className="h-11 shrink-0 px-4 text-base md:h-10 md:px-3 md:text-sm"
            >
              <Send className="mr-1 size-5 md:size-4" />
              <span className="hidden sm:inline">Отправить</span>
              <span className="sm:hidden">OK</span>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  function TemplateSelection() {
    return (
      <div className="space-y-6 overflow-y-auto p-1">
        <div className="text-center">
          <h1 className="text-2xl font-semibold">Что хотите сделать?</h1>
          <p className="text-muted-foreground">Редактируйте свой макет или создайте новый дизайн с помощью ИИ</p>
        </div>
        {!showTemplates ? (
          <div className="mx-auto grid max-w-2xl gap-4">
            <Card
              onClick={() => setSelectedTemplateId(UPLOAD_TEMPLATE_ID)}
              className={`cursor-pointer transition hover:border-primary ${
                selectedTemplateId === UPLOAD_TEMPLATE_ID ? "ring-2 ring-primary" : ""
              }`}
            >
              <CardContent className="flex flex-col items-start gap-4 pt-6 sm:flex-row sm:items-start">
                <div className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Upload className="size-6" />
                </div>
                <div>
                  <CardTitle>Редактировать свой макет</CardTitle>
                  <CardDescription>Загрузите логотип, сертификат или другой файл, и ИИ внесёт правки, сохранив оригинал.</CardDescription>
                </div>
              </CardContent>
            </Card>
            <Card
              onClick={() => setShowTemplates(true)}
              className="cursor-pointer transition hover:border-primary"
            >
              <CardContent className="flex flex-col items-start gap-4 pt-6 sm:flex-row sm:items-start">
                <div className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Wand2 className="size-6" />
                </div>
                <div>
                  <CardTitle>Сгенерировать новый дизайн</CardTitle>
                  <CardDescription>Выберите тип дизайна или просто опишите задачу в чате — ИИ подберёт шаблон сам.</CardDescription>
                </div>
              </CardContent>
            </Card>
          </div>
        ) : (
        <div className="space-y-8">
          <Button variant="ghost" size="sm" onClick={() => setShowTemplates(false)}>
            <ArrowLeft className="mr-1 size-4" /> Назад
          </Button>
          {Array.from(categories.entries()).map(([catKey, items]) => (
            <div key={catKey}>
              <h2 className="mb-3 text-lg font-medium">{items[0]?.category}</h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((t) => (
                  <Card
                    key={t.id}
                    onClick={() => setSelectedTemplateId(t.id)}
                    className={`cursor-pointer transition hover:border-primary ${
                      selectedTemplateId === t.id ? "ring-2 ring-primary" : ""
                    }`}
                  >
                    <CardContent className="flex flex-col items-start gap-4 pt-6 sm:flex-row sm:items-start">
                      <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        {iconFor(t.icon || undefined)}
                      </div>
                      <div>
                        <CardTitle>{t.name}</CardTitle>
                        <CardDescription>{t.description}</CardDescription>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
        )}
      </div>
    );
  }

  function InterviewPlaceholder() {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
        <MessageSquare className="size-12 text-muted-foreground" />
        <h2 className="text-2xl font-semibold">Диалог с ИИ-дизайнером</h2>
        <p className="max-w-md text-muted-foreground">
          Отвечайте текстом или перетащите фото-референс в чат. ИИ задаст нужные вопросы и предложит концепции.
        </p>
      </div>
    );
  }

  function UploadEditPlaceholder() {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
        <Upload className="size-12 text-muted-foreground" />
        <h2 className="text-2xl font-semibold">Редактор макета</h2>
        <p className="max-w-md text-muted-foreground">
          Загрузите свой логотип, сертификат или другой макет в чат слева и напишите, что нужно изменить. ИИ сохранит оригинал и внесёт правку.
        </p>
      </div>
    );
  }

  function ConceptsPanel() {
    return (
      <div className="space-y-6 overflow-y-auto p-1">
        {analysis && (
          <Card className="border-primary/20 bg-primary/5">
            <CardHeader>
              <CardTitle className="text-base">Анализ ниши</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm leading-relaxed">{analysis}</p>
            </CardContent>
          </Card>
        )}
        <div className="text-center">
          <h1 className="text-2xl font-semibold">Выберите концепцию</h1>
          <p className="text-muted-foreground">{concepts.length} вариантов на основе вашей ниши</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {concepts.map((c) => (
            <Card
              key={c.name}
              onClick={() => setSelectedConcept(c)}
              className={`cursor-pointer transition hover:border-primary ${
                selectedConcept?.name === c.name ? "ring-2 ring-primary" : ""
              }`}
            >
              <CardHeader>
                <CardTitle>{c.name}</CardTitle>
                <CardDescription>{c.description}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {c.explanation && <p className="text-sm text-muted-foreground">{c.explanation}</p>}
                <div className="flex gap-2">
                  {c.palette.map((color) => (
                    <span
                      key={color}
                      className="size-6 rounded-full border"
                      style={{ backgroundColor: color }}
                      title={color}
                    />
                  ))}
                </div>
                <ul className="space-y-1 text-sm text-muted-foreground">
                  {c.recommendations.slice(0, 3).map((r, i) => (
                    <li key={i}>• {r}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  function GeneratingPanel() {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-6 text-center">
        <Sparkles className="size-12 animate-pulse text-primary" />
        <div>
          <h2 className="text-2xl font-semibold">Генерируем макеты</h2>
          <p className="text-muted-foreground">Это может занять до одной минуты</p>
        </div>
        <Progress value={50} className="w-full max-w-md" />
      </div>
    );
  }

  function ResultWorkspace() {
    if (!generation) return null;
    const scaleTargets = SCALE_TARGETS.flatMap(({ label, match }) => {
      const t = templates.find(
        (tpl) => tpl.id !== generation.templateId && (match.test(tpl.name) || match.test(tpl.slug))
      );
      return t ? [{ label, template: t }] : [];
    });
    const selectedIndex = resultImages.findIndex((i) => i.id === selectedResultImage?.id);
    const compareImage =
      selectionHistoryRef.current[selectionHistoryRef.current.length - 1] ||
      (selectedIndex > 0 ? resultImages[selectedIndex - 1] : null);
    return (
      <div className="flex h-full flex-col gap-4 overflow-y-auto p-1">
        {fullscreen && selectedResultImage && (
          <div
            className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/90 p-4"
            onClick={() => setFullscreen(false)}
          >
            <img
              src={selectedResultImage.url}
              alt={selectedResultImage.label || "result"}
              className="max-h-[85vh] max-w-full object-contain"
            />
            <Button variant="secondary" className="mt-4" onClick={() => setFullscreen(false)}>
              Закрыть
            </Button>
          </div>
        )}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <div className="flex-1">
            <Card className="overflow-hidden">
              <CardContent className="flex min-h-[30vh] items-center justify-center bg-muted/20 p-2 md:min-h-[50vh] md:p-4">
                {compareOpen && compareImage && selectedResultImage ? (
                  <div className="grid w-full grid-cols-2 gap-2">
                    {[compareImage, selectedResultImage].map((img, idx) => (
                      <div key={img.id + idx} className="flex flex-col items-center gap-2">
                        <p className="text-xs text-muted-foreground">{idx === 0 ? "Предыдущий" : "Текущий"}</p>
                        <img src={img.url} alt={img.label || "variant"} className="max-h-[40vh] w-full object-contain md:max-h-[60vh]" />
                        <Button
                          size="sm"
                          variant={idx === 1 ? "default" : "outline"}
                          onClick={() => {
                            setSelectedResultImage(img);
                            setCompareOpen(false);
                            toast("Вариант выбран — дальнейшие правки применяются к нему");
                          }}
                        >
                          Выбрать победителя
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : selectedResultImage ? (
                  <img
                    src={selectedResultImage.url}
                    alt={selectedResultImage.label || "result"}
                    className="max-h-[45vh] w-full cursor-zoom-in object-contain md:max-h-[70vh]"
                    onClick={() => setFullscreen(true)}
                  />
                ) : (
                  <div className="text-muted-foreground">Нет изображений</div>
                )}
              </CardContent>
            </Card>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
              <Button className="h-11 text-sm" onClick={handleEditFocus} disabled={!selectedResultImage}>
                <MessageSquare className="mr-1 size-4" /> Изменить
              </Button>
              <Button className="h-11 text-sm" onClick={handleDownload} disabled={!selectedResultImage}>
                <Download className="mr-1 size-4" /> Скачать
              </Button>
              <Button variant="outline" className="h-11 text-sm" onClick={handleCreateSimilar} disabled={!selectedResultImage}>
                <Plus className="mr-1 size-4" /> Похожий
              </Button>
              <Button
                variant={compareOpen ? "default" : "outline"}
                className="h-11 text-sm"
                onClick={() => setCompareOpen((v) => !v)}
                disabled={!compareImage}
              >
                <RefreshCw className="mr-1 size-4" /> Сравнить
              </Button>
              <Button variant="outline" className="h-11 text-sm" onClick={toggleFavorite}>
                <Heart className={`mr-1 size-4 ${isFavorite ? "fill-red-500 text-red-500" : ""}`} /> Лучший
              </Button>
            </div>
          </div>

          <div className="flex w-full shrink-0 flex-col gap-3 sm:w-64 lg:w-72">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Ещё</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-2 sm:grid-cols-1">
                <Button variant="outline" className="h-12 w-full text-base sm:h-10 sm:text-sm" onClick={handleRegenerate} disabled={!selectedConcept}>
                  <RefreshCw className="mr-2 size-5 sm:size-4" /> Новые варианты
                </Button>
              </CardContent>
            </Card>

            {scaleTargets.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Создать в этом же стиле</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-2 sm:grid-cols-1">
                  {scaleTargets.map(({ label, template: t }) => (
                    <Button
                      key={t.id}
                      variant="outline"
                      className="h-12 w-full text-base sm:h-10 sm:text-sm"
                      disabled={loading || !selectedResultImage}
                      onClick={() => handleScaleTo(t)}
                    >
                      <Plus className="mr-2 size-5 sm:size-4" /> {label}
                    </Button>
                  ))}
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Формат и размер</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Select value={downloadFormat} onValueChange={(v) => setDownloadFormat(v as any)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="svg">SVG</SelectItem>
                    <SelectItem value="png">PNG</SelectItem>
                    <SelectItem value="jpg">JPG</SelectItem>
                  </SelectContent>
                </Select>
                {downloadFormat !== "svg" && (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-muted-foreground">Ширина</label>
                      <Input
                        type="number"
                        min={1}
                        max={10000}
                        value={downloadWidth}
                        onChange={(e) => setDownloadWidth(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground">Высота</label>
                      <Input
                        type="number"
                        min={1}
                        max={10000}
                        value={downloadHeight}
                        onChange={(e) => setDownloadHeight(e.target.value)}
                      />
                    </div>
                  </div>
                )}
                {downloadFormat !== "svg" && (
                  <div className="flex flex-wrap gap-1">
                    {["1080x1080", "1080x1920", "1200x630", "1920x1080", "1024x1024"].map((preset) => (
                      <Button key={preset} variant="outline" size="sm" type="button" className="h-9 text-sm sm:h-8 sm:text-xs" onClick={() => applyPreset(preset)}>
                        {preset}
                      </Button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">История версий</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {resultImages.map((img, idx) => (
                  <button
                    key={img.id}
                    onClick={() => setSelectedResultImage(img)}
                    className={`flex w-full items-center gap-3 rounded-lg border p-2 text-left transition hover:bg-accent ${
                      selectedResultImage?.id === img.id ? "ring-2 ring-primary" : ""
                    }`}
                  >
                    <img src={img.url} alt={img.label || "variant"} className="size-20 rounded bg-muted object-contain sm:size-16" />
                    <div className="flex-1">
                      <p className="text-sm font-medium">Версия {idx + 1}</p>
                      {img.label && <p className="text-xs text-muted-foreground">{img.label}</p>}
                      {selectedResultImage?.id === img.id && <Badge variant="secondary">Текущая</Badge>}
                    </div>
                  </button>
                ))}
              </CardContent>
            </Card>

            <div className="flex gap-2">
              <Button variant="outline" className="h-12 flex-1 text-base sm:h-10 sm:text-sm" onClick={handleBack}>
                <ArrowLeft className="mr-1 size-5 sm:size-4" /> Назад
              </Button>
              <Button variant="destructive" className="h-12 flex-1 text-base sm:h-10 sm:text-sm" onClick={deleteGeneration}>
                <Trash2 className="mr-1 size-5 sm:size-4" /> Удалить
              </Button>
            </div>
            <Button asChild variant="outline" className="h-12 w-full text-base sm:h-10 sm:text-sm">
              <Link href="/projects">В личный кабинет</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  function MainPanel() {
    switch (mode) {
      case "select":
        return TemplateSelection();
      case "interview":
        return InterviewPlaceholder();
      case "upload-edit":
        return UploadEditPlaceholder();
      case "concepts":
        if (loading && concepts.length === 0) {
          return (
            <div className="flex h-full flex-col items-center justify-center gap-4">
              <Wand2 className="size-10 animate-pulse text-primary" />
              <h2 className="text-2xl font-semibold">Готовим концепции</h2>
              <div className="w-full max-w-md space-y-3">
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-24 w-full" />
              </div>
            </div>
          );
        }
        return ConceptsPanel();
      case "generating":
        return GeneratingPanel();
      case "result":
        return ResultWorkspace();
      default:
        return null;
    }
  }

  return (
    <div className="flex h-[100dvh] flex-col gap-2 p-2 md:h-[calc(100vh-4rem)] md:gap-4 md:p-4">
      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}
      <div className="flex flex-1 min-h-0 flex-col gap-2 md:grid md:grid-cols-[360px_1fr] md:gap-4">
        <div className="order-1 flex h-[45%] min-h-0 flex-col md:h-full">
          {ChatPanel()}
        </div>
        <div className="order-2 min-h-0 flex-1 overflow-hidden rounded-xl border bg-card shadow-sm md:h-full">
          <div className="h-full overflow-y-auto p-2 md:p-4">
            {MainPanel()}
          </div>
        </div>
      </div>
    </div>
  );
}
