"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  ArrowLeft,
  Wand2,
  Upload,
  Send,
  Download,
  RefreshCw,
  Heart,
  Plus,
  MessageSquare,
  FileImage,
  Trash2,
} from "lucide-react";
import type { Template, Brand, Generation, Concept, Brief } from "@/types";
import type { GenerationImage } from "@prisma/client";
import { downloadSvg, downloadRaster, getViewBoxSize } from "@/lib/client-image";
import { getViewBoxForTemplate } from "@/lib/design";

const UPLOAD_TEMPLATE_ID = "upload";

const SCALE_TARGETS = [
  { label: "1080x1080", size: "1080x1080" },
  { label: "Stories 1080x1920", size: "1080x1920" },
  { label: "1200x630", size: "1200x630" },
  { label: "1920x1080", size: "1920x1080" },
];

type WizardMode = "select" | "upload-edit" | "generating" | "result";

type ChatContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

type ChatMessage = {
  role: "user" | "assistant";
  content: string | ChatContentPart[];
};

export function ChatWizard({
  templates,
  brand,
}: {
  templates: Template[];
  brand: Brand | null;
}) {
  const [mode, setMode] = useState<WizardMode>("select");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [showTemplates, setShowTemplates] = useState(false);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [selectedImages, setSelectedImages] = useState<string[]>([]);

  const [generation, setGeneration] = useState<Generation | null>(null);
  const [selectedResultImage, setSelectedResultImage] = useState<GenerationImage | null>(null);

  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);

  const [downloadFormat, setDownloadFormat] = useState<"svg" | "png" | "jpg">("png");
  const [downloadWidth, setDownloadWidth] = useState<string>("");
  const [downloadHeight, setDownloadHeight] = useState<string>("");

  const chatScrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const template = useMemo(() => {
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

  // Autosave / restore
  useEffect(() => {
    try {
      const raw = localStorage.getItem("ai-designer-chat");
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (saved.generationId) {
        fetch(`/api/projects/${saved.generationId}`)
          .then((r) => (r.ok ? r.json() : null))
          .then((json) => {
            if (json?.generation) {
              setGeneration(json.generation);
              setSelectedResultImage(
                json.generation.images.find((img: any) => img.id === saved.selectedImageId) ||
                  json.generation.images[0] ||
                  null
              );
              setMode("result");
              setMessages(saved.messages || []);
            }
          })
          .catch(() => {});
      } else if (saved.mode) {
        setMode(saved.mode);
        setSelectedTemplateId(saved.selectedTemplateId || "");
        setMessages(saved.messages || []);
        setInputText(saved.inputText || "");
        setSelectedImages(saved.selectedImages || []);
      }
    } catch {}
  }, []);

  useEffect(() => {
    const payload = {
      mode,
      selectedTemplateId,
      messages,
      inputText,
      selectedImages,
      generationId: generation?.id || null,
      selectedImageId: selectedResultImage?.id || null,
    };
    try {
      localStorage.setItem("ai-designer-chat", JSON.stringify(payload));
    } catch {}
  }, [mode, selectedTemplateId, messages, inputText, selectedImages, generation, selectedResultImage]);

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  useEffect(() => {
    if (generation?.images) {
      if (!selectedResultImage || !generation.images.find((i) => i.id === selectedResultImage.id)) {
        setSelectedResultImage(generation.images[0] || null);
      }
    }
  }, [generation, selectedResultImage]);

  useEffect(() => {
    if (!selectedResultImage) return;
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
  }, [selectedResultImage]);

  async function safeJson(res: Response): Promise<any> {
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch {
      const isHtml = text.trim().toLowerCase().startsWith("<!doctype") || text.trim().startsWith("<");
      if (isHtml || res.status >= 500) {
        throw new Error("Сервис генерации временно недоступен. Попробуйте ещё раз через несколько секунд.");
      }
      throw new Error(text?.slice(0, 120) || `Сервис временно недоступен (HTTP ${res.status}). Попробуйте ещё раз.`);
    }
  }

  async function uploadFile(file: File): Promise<{ url: string; width: number; height: number } | null> {
    setUploading(true);
    setError("");
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const json = await safeJson(res);
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
    if (result) setSelectedImages((prev) => [...prev, result.url]);
    e.target.value = "";
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
    if (result) setSelectedImages((prev) => [...prev, result.url]);
  }

  function resetWorkspace() {
    try {
      localStorage.removeItem("ai-designer-chat");
    } catch {}
    setMode("select");
    setSelectedTemplateId("");
    setShowTemplates(false);
    setMessages([]);
    setInputText("");
    setSelectedImages([]);
    setGeneration(null);
    setSelectedResultImage(null);
    setLoading(false);
    setError("");
    toast("Новый чат начат");
  }

  async function sendChat(messageText?: string, extraFiles?: string[]) {
    const text = (messageText !== undefined ? messageText : inputText).trim();
    const files = extraFiles !== undefined ? extraFiles : selectedImages;
    if (!text && files.length === 0) return;

    const userContent: string | ChatContentPart[] =
      files.length > 0
        ? [
            { type: "text" as const, text: text || "Вот файл(ы):" },
            ...files.map((url) => ({ type: "image_url" as const, image_url: { url } })),
          ]
        : text;

    const userMessage: ChatMessage = { role: "user", content: userContent };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setInputText("");
    setSelectedImages([]);
    setLoading(true);
    setError("");

    try {
      const body: any = {
        message: text || (files.length ? "Сохрани макет и примени небольшие улучшения" : ""),
        files,
      };
      if (generation) {
        body.projectId = generation.id;
      } else if (selectedTemplateId && selectedTemplateId !== UPLOAD_TEMPLATE_ID) {
        body.templateId = selectedTemplateId;
      }

      setMode("generating");
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await safeJson(res);
      if (!res.ok) {
        if (res.status === 403) {
          toast.error(json.error || "Лимит генераций исчерпан. Перейдите на другой тариф.");
        }
        throw new Error(json.error || "Ошибка обработки");
      }

      if (json.generation) {
        setGeneration(json.generation);
        setSelectedResultImage(json.generation.images?.[0] || null);
        setMode("result");
        toast.success(json.message || "Готово!");
        setMessages((prev) => [...prev, { role: "assistant", content: json.message || "Готово!" }]);
      } else if (json.message) {
        setMessages((prev) => [...prev, { role: "assistant", content: json.message }]);
        setMode(generation ? "result" : mode === "upload-edit" ? "upload-edit" : "select");
      } else {
        throw new Error("Неожиданный ответ сервера");
      }
    } catch (e: any) {
      setError(e.message || "Ошибка");
      setMode(generation ? "result" : mode === "upload-edit" ? "upload-edit" : "select");
      setMessages((prev) => [...prev, { role: "assistant", content: "Ошибка: " + (e.message || "повторите позже") }]);
    } finally {
      setLoading(false);
    }
  }

  function handleSend() {
    sendChat();
  }

  async function handleAction(action: string) {
    let text = "";
    if (action === "regenerate") text = "Сделай новые варианты этого дизайна, сохранив стиль и суть.";
    if (action === "similar") text = "Создай похожий вариант с небольшими отличиями.";
    if (action === "favorite") {
      if (!generation) return;
      const next = !generation.isFavorite;
      await fetch(`/api/projects/${generation.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isFavorite: next }),
      });
      setGeneration((prev) => (prev ? { ...prev, isFavorite: next } : prev));
      toast(next ? "Добавлено в избранное" : "Убрано из избранного");
      return;
    }
    await sendChat(text, []);
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
    } catch (e) {
      console.error(e);
      toast.error("Не удалось скачать");
    }
  }

  function applyPreset(size: string) {
    const [w, h] = size.split("x");
    setDownloadWidth(w);
    setDownloadHeight(h);
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

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function StartScreen() {
    return (
      <div className="space-y-6 overflow-y-auto p-1">
        <div className="text-center">
          <h1 className="text-2xl font-semibold">Что хотите сделать?</h1>
          <p className="text-muted-foreground">Редактируйте свой макет или создайте новый дизайн с помощью ИИ</p>
        </div>
        {!showTemplates ? (
          <div className="mx-auto grid max-w-2xl gap-4">
            <Card
              onClick={() => {
                setSelectedTemplateId(UPLOAD_TEMPLATE_ID);
                setMode("upload-edit");
                setMessages([]);
              }}
              className="cursor-pointer transition hover:border-primary"
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
                  <CardDescription>Выберите тип дизайна или просто опишите задачу в чате.</CardDescription>
                </div>
              </CardContent>
            </Card>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {["Логотип", "Баннер", "Карточка товара", "Визитка", "Сертификат", "Пост"].map((label) => (
                <Button
                  key={label}
                  type="button"
                  variant="outline"
                  className="h-11 justify-start text-sm"
                  disabled={loading}
                  onClick={() => {
                    setInputText(`Нужен ${label.toLowerCase()}`);
                    setMode("select");
                  }}
                >
                  {label}
                </Button>
              ))}
            </div>
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
                      onClick={() => {
                        setSelectedTemplateId(t.id);
                        setShowTemplates(false);
                        setMode("select");
                        setInputText(`Нужен ${t.name.toLowerCase()}`);
                      }}
                      className="cursor-pointer transition hover:border-primary"
                    >
                      <CardContent className="flex flex-col items-start gap-4 pt-6 sm:flex-row sm:items-start">
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

  function ChatPanel() {
    const placeholder =
      mode === "upload-edit"
        ? "Загрузите макет и напишите правку, например: «Сделай фон красным»…"
        : mode === "result"
        ? "Напишите правку, например: «Передвинь логотип выше»…"
        : "Опишите, что нужно, например: «Сделай логотип для кофейны»…";

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
            <h3 className="font-medium">Чат с ИИ-дизайнером</h3>
          </div>
          <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={resetWorkspace} disabled={loading}>
            <Plus className="size-3" />
            Новый чат
          </Button>
        </div>

        <div ref={chatScrollRef} className="flex-1 space-y-4 overflow-y-auto p-3">
          {messages.length === 0 && mode === "select" && !showTemplates && (
            <div className="space-y-3">
              <div className="flex justify-start">
                <div className="max-w-[90%] rounded-xl bg-muted px-3 py-2 text-sm text-foreground">
                  Здравствуйте! Что вы хотите создать? Выберите вариант или просто опишите задачу.
                </div>
              </div>
            </div>
          )}
          {messages.length === 0 && mode === "upload-edit" && (
            <div className="text-center text-sm text-muted-foreground">
              Загрузите макет и напишите, что изменить, например: «Сделай фон красным».
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[90%] rounded-xl px-3 py-2 text-sm ${
                  m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
                }`}
              >
                {renderMessageContent(m.content)}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Wand2 className="size-4 animate-pulse" />
              {mode === "result" || mode === "upload-edit" ? "ИИ редактирует…" : "ИИ генерирует…"}
            </div>
          )}
        </div>

        <div className="space-y-2 border-t p-3">
          {selectedImages.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {selectedImages.map((url, i) => (
                <div key={i} className="relative">
                  <img src={url} alt="" className="size-16 rounded-lg border object-cover" />
                  <button
                    className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-destructive text-xs text-destructive-foreground"
                    onClick={() => setSelectedImages((prev) => prev.filter((_, idx) => idx !== i))}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="flex items-end gap-2">
            <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileUpload} accept="image/*" />
            <Button type="button" variant="ghost" size="icon" className="shrink-0" onClick={() => fileInputRef.current?.click()} disabled={loading || uploading}>
              <FileImage className="size-5" />
            </Button>
            <Textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder={placeholder}
              rows={1}
              className="min-h-[44px] flex-1 resize-none text-base md:text-sm"
              onKeyDown={handleKeyDown}
              disabled={loading}
            />
            <Button
              type="button"
              disabled={loading || (!inputText.trim() && selectedImages.length === 0)}
              onClick={handleSend}
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

  function ResultPanel() {
    if (!generation || !selectedResultImage) return null;
    const images = generation.images || [];
    return (
      <div className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto p-1">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold">{generation.title || generation.template?.name}</h2>
            <p className="text-sm text-muted-foreground">{generation.conceptName}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => handleAction("favorite")}>
              <Heart className={`mr-1 size-4 ${generation.isFavorite ? "fill-red-500 text-red-500" : ""}`} />
              {generation.isFavorite ? "В избранном" : "В избранное"}
            </Button>
            <Button variant="outline" size="sm" onClick={() => handleAction("regenerate")}>
              <RefreshCw className="mr-1 size-4" /> Новые варианты
            </Button>
            <Button variant="outline" size="sm" onClick={() => handleAction("similar")}>
              <Wand2 className="mr-1 size-4" /> Похожий
            </Button>
          </div>
        </div>

        <Card className="overflow-hidden">
          <CardContent className="flex items-center justify-center p-0">
            <img
              src={selectedResultImage.url}
              alt={selectedResultImage.label || "result"}
              className="max-h-[60vh] w-full object-contain"
            />
          </CardContent>
        </Card>

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {images.map((img) => (
            <button
              key={img.id}
              onClick={() => setSelectedResultImage(img)}
              className={`flex items-center gap-3 rounded-lg border p-2 text-left transition hover:bg-accent ${
                selectedResultImage.id === img.id ? "ring-2 ring-primary" : ""
              }`}
            >
              <img src={img.url} alt={img.label || "variant"} className="size-16 rounded bg-muted object-contain" />
              <div className="flex-1">
                <p className="text-sm font-medium">{img.label}</p>
                {img.isSelected && <Badge variant="secondary">Выбран</Badge>}
              </div>
            </button>
          ))}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Скачать</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-3">
              <Select value={downloadFormat} onValueChange={(v) => setDownloadFormat(v as any)}>
                <SelectTrigger className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="svg">SVG</SelectItem>
                  <SelectItem value="png">PNG</SelectItem>
                  <SelectItem value="jpg">JPG</SelectItem>
                </SelectContent>
              </Select>
              {downloadFormat !== "svg" && (
                <>
                  <Input type="number" min={1} max={10000} value={downloadWidth} onChange={(e) => setDownloadWidth(e.target.value)} className="w-28" placeholder="Ширина" />
                  <Input type="number" min={1} max={10000} value={downloadHeight} onChange={(e) => setDownloadHeight(e.target.value)} className="w-28" placeholder="Высота" />
                </>
              )}
              <div className="flex flex-wrap gap-1">
                {SCALE_TARGETS.map(({ label, size }) => (
                  <Button key={size} variant="outline" size="sm" type="button" onClick={() => applyPreset(size)}>
                    {label}
                  </Button>
                ))}
              </div>
            </div>
            <Button onClick={handleDownload}>
              <Download className="mr-1 size-4" /> Скачать
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (mode === "generating") {
    return (
      <div className="flex h-[80vh] flex-col items-center justify-center gap-4 text-center">
        <Wand2 className="size-12 animate-pulse text-primary" />
        <p className="text-lg font-medium">ИИ работает над макетом…</p>
        <p className="text-sm text-muted-foreground">Это может занять до 2 минут</p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-4rem)] max-w-7xl flex-col gap-4 p-3 md:flex-row">
      <div className="flex h-[45vh] flex-col gap-4 md:h-full md:w-1/2 lg:w-5/12">
        {(mode === "select" || mode === "upload-edit") && (
          <div className="flex-1 overflow-hidden rounded-xl border bg-card p-4 shadow-sm">
            <StartScreen />
          </div>
        )}
        <div className={`${mode === "result" ? "flex-1" : "h-[50%] min-h-[12rem]"}`}>
          <ChatPanel />
        </div>
      </div>
      <div className="flex h-[50vh] flex-col md:h-full md:flex-1">
        {mode === "result" && generation ? (
          <ResultPanel />
        ) : (
          <div className="flex h-full flex-col items-center justify-center rounded-xl border bg-card text-center text-muted-foreground shadow-sm">
            <Wand2 className="mb-3 size-12" />
            <p className="text-lg font-medium">Здесь появится результат</p>
            <p className="text-sm">Начните чат слева или выберите «Редактировать свой макет»</p>
          </div>
        )}
      </div>
    </div>
  );
}
