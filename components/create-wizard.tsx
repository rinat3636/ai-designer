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
} from "lucide-react";
import type { Template, Brand, Generation, Concept, Brief } from "@/types";
import type { GenerationImage } from "@prisma/client";
import { downloadSvg, downloadRaster, getViewBoxSize } from "@/lib/client-image";
import { getViewBoxForTemplate } from "@/lib/design";

type ChatContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

type ChatMessage = {
  role: "user" | "assistant";
  content: string | ChatContentPart[];
};

type WizardMode = "select" | "interview" | "concepts" | "generating" | "result";

export function CreateWizard({
  templates,
}: {
  templates: Template[];
  brand: Brand | null;
}) {
  const [mode, setMode] = useState<WizardMode>("select");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
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
  const [isFavorite, setIsFavorite] = useState(false);
  const [downloadFormat, setDownloadFormat] = useState<"svg" | "png" | "jpg">("png");
  const [downloadWidth, setDownloadWidth] = useState<string>("");
  const [downloadHeight, setDownloadHeight] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  const template = useMemo(
    () => templates.find((t) => t.id === selectedTemplateId) || null,
    [selectedTemplateId, templates]
  );

  const categories = useMemo(() => {
    const map = new Map<string, Template[]>();
    for (const t of templates) {
      const list = map.get(t.categoryKey) || [];
      list.push(t);
      map.set(t.categoryKey, list);
    }
    return map;
  }, [templates]);

  useEffect(() => {
    if (selectedTemplateId && mode === "select") {
      setMessages([]);
      setCurrentData({});
      setInputText("");
      setSelectedImages([]);
      setEditMessages([]);
      setEditInput("");
      setMode("interview");
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

  async function uploadFile(file: File): Promise<string | null> {
    setUploading(true);
    setError("");
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      return json.url;
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
    const url = await uploadFile(file);
    if (url) {
      if (mode === "result") {
        setEditInput((prev) => (prev ? prev + " " : "") + url);
      } else {
        setSelectedImages((prev) => [...prev, url]);
      }
    }
    e.target.value = "";
  }

  async function sendMessage() {
    const text = inputText.trim();
    if ((!text && selectedImages.length === 0) || !template) return;

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

  async function sendEditInstruction(instruction: string, addToChat = true) {
    if (!generation || !selectedResultImage) return;
    if (addToChat) {
      setEditMessages((prev) => [...prev, { role: "user", content: instruction }]);
    }
    setEditInput("");
    setLoading(true);
    setError("");

    try {
      const res = await fetch(`/api/projects/${generation.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instruction,
          selectedImageUrl: selectedResultImage.url,
          count: 2,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);

      if (json.clarificationQuestion) {
        setEditMessages((prev) => [...prev, { role: "assistant", content: json.clarificationQuestion }]);
      } else {
        const newImages = (json.images || []) as GenerationImage[];
        if (newImages.length > 0) {
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
    if (!text) return;
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
    if (mode === "interview") {
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
  const activeSend = isResult ? sendEdit : sendMessage;
  const inputPlaceholder =
    mode === "select"
      ? "Сначала выберите тип дизайна…"
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
    const url = await uploadFile(file);
    if (url) {
      if (mode === "result") {
        setEditInput((prev) => (prev ? prev + " " : "") + url);
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
            <h3 className="font-medium">{isResult ? "Правки" : "Чат с ИИ-дизайнером"}</h3>
          </div>
          {template && !isResult && <span className="text-xs text-muted-foreground">{template.name}</span>}
        </div>

        <div ref={chatScrollRef} className="flex-1 space-y-4 overflow-y-auto p-3">
          {activeMessages.length === 0 && !isResult && (
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
          {loading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Wand2 className="size-4 animate-pulse" />
              {isResult ? "ИИ редактирует…" : "ИИ печатает…"}
            </div>
          )}
        </div>

        <div className="space-y-2 border-t p-3">
          {!isResult && selectedImages.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {selectedImages.map((url) => (
                <div key={url} className="relative">
                  <img src={url} alt="Референс" className="h-14 w-14 rounded-lg border object-cover" />
                  <button
                    type="button"
                    onClick={() => setSelectedImages((prev) => prev.filter((u) => u !== url))}
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
            >
              <Paperclip className="size-4" />
            </Button>
            <Textarea
              value={activeInput}
              onChange={(e) => setActiveInput(e.target.value)}
              placeholder={inputPlaceholder}
              rows={1}
              className="min-h-0 flex-1 resize-none"
              onKeyDown={handleChatKeyDown}
              disabled={mode === "select" || loading}
            />
            <Button
              type="button"
              disabled={mode === "select" || loading || !activeInput.trim()}
              onClick={activeSend}
            >
              <Send className="mr-1 size-4" />
              Отправить
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
          <h1 className="text-2xl font-semibold">Выберите тип дизайна</h1>
          <p className="text-muted-foreground">После выбора начнётся диалог с ИИ-дизайнером</p>
        </div>
        <div className="space-y-8">
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
                    <CardContent className="flex items-start gap-4 pt-6">
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
    return (
      <div className="flex h-full flex-col gap-4 overflow-y-auto p-1">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <div className="flex-1">
            <Card className="overflow-hidden">
              <CardContent className="flex min-h-[50vh] items-center justify-center bg-muted/20 p-4">
                {selectedResultImage ? (
                  <img
                    src={selectedResultImage.url}
                    alt={selectedResultImage.label || "result"}
                    className="max-h-[70vh] w-full object-contain"
                  />
                ) : (
                  <div className="text-muted-foreground">Нет изображений</div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="flex w-full shrink-0 flex-col gap-3 sm:w-64 lg:w-72">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Быстрые действия</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button className="w-full" onClick={handleDownload} disabled={!selectedResultImage}>
                  <Download className="mr-2 size-4" /> Скачать
                </Button>
                <Button variant="outline" className="w-full" onClick={handleRegenerate} disabled={!selectedConcept}>
                  <RefreshCw className="mr-2 size-4" /> Новые варианты
                </Button>
                <Button variant="outline" className="w-full" onClick={handleCreateSimilar} disabled={!selectedResultImage}>
                  <Plus className="mr-2 size-4" /> Создать похожий
                </Button>
                <Button variant="outline" className="w-full" onClick={toggleFavorite}>
                  <Heart className={`mr-2 size-4 ${isFavorite ? "fill-red-500 text-red-500" : ""}`} />
                  {isFavorite ? "В избранном" : "В избранное"}
                </Button>
              </CardContent>
            </Card>

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
                      <Button key={preset} variant="outline" size="sm" type="button" onClick={() => applyPreset(preset)}>
                        {preset}
                      </Button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Варианты</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {resultImages.map((img) => (
                  <button
                    key={img.id}
                    onClick={() => setSelectedResultImage(img)}
                    className={`flex w-full items-center gap-3 rounded-lg border p-2 text-left transition hover:bg-accent ${
                      selectedResultImage?.id === img.id ? "ring-2 ring-primary" : ""
                    }`}
                  >
                    <img src={img.url} alt={img.label || "variant"} className="size-16 rounded bg-muted object-contain" />
                    <div className="flex-1">
                      <p className="text-sm font-medium">{img.label}</p>
                      {img.isSelected && <Badge variant="secondary">Выбран</Badge>}
                    </div>
                  </button>
                ))}
              </CardContent>
            </Card>

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={handleBack}>
                <ArrowLeft className="mr-1 size-4" /> Назад
              </Button>
              <Button variant="destructive" className="flex-1" onClick={deleteGeneration}>
                <Trash2 className="mr-1 size-4" /> Удалить
              </Button>
            </div>
            <Button asChild variant="outline" className="w-full">
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
    <div className="flex h-[calc(100vh-4rem)] flex-col gap-4 p-4">
      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}
      <div className="grid flex-1 min-h-0 grid-cols-1 gap-4 md:grid-cols-[360px_1fr]">
        <div className="order-2 flex min-h-0 flex-col md:order-1">
          {ChatPanel()}
        </div>
        <div className="order-1 min-h-0 overflow-hidden rounded-xl border bg-card shadow-sm md:order-2">
          <div className="h-full overflow-y-auto p-4">
            {MainPanel()}
          </div>
        </div>
      </div>
    </div>
  );
}
