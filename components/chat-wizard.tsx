"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  Wand2,
  Send,
  Download,
  RefreshCw,
  Heart,
  Plus,
  MessageSquare,
  FileImage,
  X,
  Maximize2,
  PanelLeft,
  PanelLeftClose,
} from "lucide-react";
import type { Template, Brand, Generation } from "@/types";
import type { GenerationImage } from "@prisma/client";
import { downloadSvg, downloadRaster, getViewBoxSize } from "@/lib/client-image";

const SCALE_TARGETS = [
  { label: "1080x1080", size: "1080x1080" },
  { label: "Stories 1080x1920", size: "1080x1920" },
  { label: "1200x630", size: "1200x630" },
  { label: "1920x1080", size: "1920x1080" },
];

type ChatContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

type ChatMessage = {
  role: "user" | "assistant";
  content: string | ChatContentPart[];
  result?: {
    generationId: string;
    images: GenerationImage[];
    selectedImageId: string;
  };
};

export function ChatWizard({
  templates,
  brand,
}: {
  templates: Template[];
  brand: Brand | null;
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [selectedImages, setSelectedImages] = useState<string[]>([]);

  const [generation, setGeneration] = useState<Generation | null>(null);
  const [selectedResultImage, setSelectedResultImage] = useState<GenerationImage | null>(null);

  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const [downloadFormat, setDownloadFormat] = useState<"svg" | "png" | "jpg">("png");
  const [downloadWidth, setDownloadWidth] = useState<string>("");
  const [downloadHeight, setDownloadHeight] = useState<string>("");

  const chatScrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    try {
      const raw = localStorage.getItem("ai-designer-chat");
      if (!raw) {
        setMessages([{ role: "assistant", content: "Здравствуйте! Что вы хотите сделать?" }]);
        return;
      }
      const saved = JSON.parse(raw);
      if (saved.generationId) {
        fetch(`/api/projects/${saved.generationId}`)
          .then((r) => (r.ok ? r.json() : null))
          .then((json) => {
            if (json?.generation) {
              setGeneration(json.generation);
              const sel =
                json.generation.images.find((img: any) => img.id === saved.selectedImageId) ||
                json.generation.images[0] ||
                null;
              setSelectedResultImage(sel);
            }
            setMessages(saved.messages || [{ role: "assistant", content: "Здравствуйте! Что вы хотите сделать?" }]);
          })
          .catch(() => {
            setMessages(saved.messages || [{ role: "assistant", content: "Здравствуйте! Что вы хотите сделать?" }]);
          });
      } else {
        setMessages(saved.messages || [{ role: "assistant", content: "Здравствуйте! Что вы хотите сделать?" }]);
        setInputText(saved.inputText || "");
        setSelectedImages(saved.selectedImages || []);
      }
    } catch {
      setMessages([{ role: "assistant", content: "Здравствуйте! Что вы хотите сделать?" }]);
    }
  }, []);

  useEffect(() => {
    const payload = {
      messages,
      inputText,
      selectedImages,
      generationId: generation?.id || null,
      selectedImageId: selectedResultImage?.id || null,
    };
    try {
      localStorage.setItem("ai-designer-chat", JSON.stringify(payload));
    } catch {}
  }, [messages, inputText, selectedImages, generation, selectedResultImage]);

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
    setMessages([{ role: "assistant", content: "Здравствуйте! Что вы хотите сделать?" }]);
    setInputText("");
    setSelectedImages([]);
    setGeneration(null);
    setSelectedResultImage(null);
    setLoading(false);
    setError("");
    toast("Новый чат начат");
  }

  async function sendChat(messageText?: string, extraFiles?: string[], templateId?: string) {
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
      } else if (templateId) {
        body.templateId = templateId;
      }

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
        throw new Error(json.error || json.message || "Ошибка обработки");
      }

      if (json.generation) {
        setGeneration(json.generation);
        const sel = json.generation.images?.[0] || null;
        setSelectedResultImage(sel);
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: json.message || "Готово!",
            result: {
              generationId: json.generation.id,
              images: json.generation.images || [],
              selectedImageId: sel?.id,
            },
          },
        ]);
      } else if (json.message) {
        setMessages((prev) => [...prev, { role: "assistant", content: json.message }]);
      } else {
        throw new Error("Неожиданный ответ сервера");
      }
    } catch (e: any) {
      setError(e.message || "Ошибка");
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Ошибка: " + (e.message || "повторите позже") },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function handleSend() {
    sendChat();
  }

  async function handleAction(action: string, customTemplateId?: string) {
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
    await sendChat(text, [], customTemplateId);
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

  function selectResultImage(img: GenerationImage) {
    setSelectedResultImage(img);
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (last?.role === "assistant" && last.result) {
        return [...prev.slice(0, -1), { ...last, result: { ...last.result, selectedImageId: img.id } }];
      }
      return prev;
    });
  }

  function DownloadPanel({ className }: { className?: string }) {
    return (
      <div className={`space-y-3 ${className || ""}`}>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={downloadFormat} onValueChange={(v) => setDownloadFormat(v as any)}>
            <SelectTrigger className="w-24">
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
              <Input
                type="number"
                min={1}
                max={10000}
                value={downloadWidth}
                onChange={(e) => setDownloadWidth(e.target.value)}
                className="w-24"
                placeholder="Ширина"
              />
              <Input
                type="number"
                min={1}
                max={10000}
                value={downloadHeight}
                onChange={(e) => setDownloadHeight(e.target.value)}
                className="w-24"
                placeholder="Высота"
              />
            </>
          )}
        </div>
        <div className="flex flex-wrap gap-1">
          {SCALE_TARGETS.map(({ label, size }) => (
            <Button key={size} variant="outline" size="sm" type="button" onClick={() => applyPreset(size)}>
              {label}
            </Button>
          ))}
        </div>
        <Button onClick={handleDownload} className="w-full sm:w-auto">
          <Download className="mr-1 size-4" /> Скачать
        </Button>
      </div>
    );
  }

  function ResultControls() {
    if (!generation) return null;
    return (
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
    );
  }

  function ResultCard({ msg }: { msg: ChatMessage }) {
    const images = msg.result?.images || [];
    const selected = images.find((i) => i.id === msg.result?.selectedImageId) || images[0];
    if (!selected) return null;
    return (
      <div className="my-2 rounded-xl border bg-card p-3 shadow-sm">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">Результат</span>
          <Button variant="ghost" size="icon" className="size-7" onClick={() => setPreviewImageUrl(selected.url)}>
            <Maximize2 className="size-4" />
          </Button>
        </div>
        <img
          src={selected.url}
          alt={selected.label || "result"}
          className="mb-3 max-h-[60vh] w-full cursor-zoom-in rounded-lg border object-contain"
          onClick={() => setPreviewImageUrl(selected.url)}
        />
        {images.length > 1 && (
          <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
            {images.map((img) => (
              <button
                key={img.id}
                onClick={() => selectResultImage(img)}
                className={`shrink-0 rounded-lg border p-1 ${selected.id === img.id ? "ring-2 ring-primary" : ""}`}
              >
                <img src={img.url} alt={img.label || "variant"} className="size-16 rounded object-contain" />
              </button>
            ))}
          </div>
        )}
        <ResultControls />
        <div className="mt-3 rounded-lg border bg-muted/30 p-3">
          <DownloadPanel />
        </div>
      </div>
    );
  }

  function Sidebar({ mobile }: { mobile?: boolean }) {
    const content = (
      <div className="flex h-full flex-col gap-3 p-4">
        <div className="flex items-center justify-between md:hidden">
          <h2 className="text-lg font-semibold">Режимы</h2>
          <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(false)}>
            <PanelLeftClose className="size-5" />
          </Button>
        </div>

        <Button variant="outline" className="justify-start gap-2" onClick={resetWorkspace}>
          <Plus className="size-4" /> Новый чат
        </Button>

        <div className="mt-2 space-y-2">
          <p className="text-xs font-semibold uppercase text-muted-foreground">Создать дизайн</p>
          <div className="grid grid-cols-1 gap-2">
            {Array.from(categories.entries()).map(([cat, items]) => (
              <Button
                key={cat}
                variant="ghost"
                className="justify-start text-sm"
                onClick={() => {
                  setInputText(`Создай ${items[0]?.name.toLowerCase() || cat}`);
                  setSidebarOpen(false);
                }}
              >
                {items[0]?.category || cat}
              </Button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase text-muted-foreground">Редактор</p>
          <Button variant="ghost" className="w-full justify-start text-sm" onClick={() => fileInputRef.current?.click()}>
            <FileImage className="mr-2 size-4" /> Редактировать свой макет
          </Button>
        </div>

        <div className="mt-auto space-y-2">
          <Button variant="ghost" className="w-full justify-start text-sm" onClick={() => router.push("/projects")}>
            Мои проекты
          </Button>
          {brand?.companyName && (
            <p className="truncate text-xs text-muted-foreground">{brand.companyName}</p>
          )}
        </div>
      </div>
    );

    if (mobile) {
      return (
        <div
          className={`fixed inset-y-0 left-0 z-40 w-64 transform border-r bg-background transition-transform duration-200 ${
            sidebarOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          {content}
        </div>
      );
    }

    return (
      <div className="hidden h-full w-64 shrink-0 flex-col border-r bg-background md:flex overflow-y-auto">
        {content}
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-4rem)] max-w-7xl flex-row overflow-hidden">
      <Sidebar />
      <Sidebar mobile />
      {sidebarOpen && (
        <div className="fixed inset-0 z-30 bg-black/20 md:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <div
        className="relative flex flex-1 flex-col bg-card transition-colors"
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        {dragOver && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-primary/10">
            <p className="text-sm font-medium text-primary">Отпустите файл для загрузки</p>
          </div>
        )}

        <div className="flex items-center justify-between border-b p-3">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setSidebarOpen(true)}>
              <PanelLeft className="size-5" />
            </Button>
            <MessageSquare className="size-4 text-primary" />
            <h3 className="font-medium">Чат с ИИ-дизайнером</h3>
          </div>
          <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" onClick={resetWorkspace} disabled={loading}>
            <Plus className="size-3" />
            <span className="hidden sm:inline">Новый чат</span>
          </Button>
        </div>

        <div ref={chatScrollRef} className="flex-1 space-y-4 overflow-y-auto p-3">
          {messages.length === 0 && (
            <div className="flex justify-start">
              <div className="max-w-[90%] rounded-xl bg-muted px-3 py-2 text-sm text-foreground">
                Здравствуйте! Что вы хотите сделать?
                <div className="mt-2 flex flex-wrap gap-2">
                  {Array.from(categories.entries()).slice(0, 4).map(([cat, items]) => (
                    <Button
                      key={cat}
                      variant="outline"
                      size="sm"
                      onClick={() => setInputText(`Создай ${items[0]?.name.toLowerCase() || cat}`)}
                    >
                      {items[0]?.category || cat}
                    </Button>
                  ))}
                  <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                    <FileImage className="mr-1 size-4" /> Свой макет
                  </Button>
                </div>
              </div>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i}>
              <div className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[90%] rounded-xl px-3 py-2 text-sm ${
                    m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted text-foreground"
                  }`}
                >
                  {renderMessageContent(m.content)}
                </div>
              </div>
              {m.role === "assistant" && m.result && <ResultCard msg={m} />}
            </div>
          ))}
          {loading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Wand2 className="size-4 animate-pulse" />
              {generation ? "ИИ редактирует…" : "ИИ генерирует…"}
            </div>
          )}
          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
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
              placeholder={
                generation
                  ? "Напишите правку, например: «Сделай фон красным»…"
                  : "Что вы хотите создать? Например: «Логотип для кофейни»…"
              }
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

      {previewImageUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setPreviewImageUrl(null)}>
          <div className="relative max-h-full max-w-full">
            <img src={previewImageUrl} alt="Предпросмотр" className="max-h-[90vh] max-w-full rounded-lg object-contain" />
            <Button
              variant="ghost"
              size="icon"
              className="absolute -right-3 -top-3 rounded-full bg-background text-foreground"
              onClick={() => setPreviewImageUrl(null)}
            >
              <X className="size-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
