"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Heart, Trash2, RefreshCw, Download, Send, Wand2 } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { downloadSvg, downloadRaster, getViewBoxSize } from "@/lib/client-image";
import { getViewBoxForTemplate } from "@/lib/design";
import type { Generation } from "@/types";
import type { GenerationImage } from "@prisma/client";

type ChatMsg = { role: "user" | "assistant"; content: string };

export function ResultGallery({
  generation,
  onRegenerate,
}: {
  generation: Generation;
  onRegenerate?: () => void;
}) {
  const router = useRouter();
  const [isFavorite, setIsFavorite] = useState(generation.isFavorite);
  const [images, setImages] = useState<GenerationImage[]>(generation.images || []);
  const [selected, setSelected] = useState<GenerationImage | null>(images[0] || null);

  const [format, setFormat] = useState<"svg" | "png" | "jpg">("png");
  const [width, setWidth] = useState<string>("");
  const [height, setHeight] = useState<string>("");

  const [editMessages, setEditMessages] = useState<ChatMsg[]>([]);
  const [editInput, setEditInput] = useState("");
  const [editLoading, setEditLoading] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setImages(generation.images || []);
    setSelected(generation.images?.[0] || null);
  }, [generation.images]);

  useEffect(() => {
    if (!selected) return;
    const baseViewBox = generation.template?.slug
      ? getViewBoxForTemplate(generation.template.slug)
      : undefined;
    const baseSize = baseViewBox ? getViewBoxSize(`<svg viewBox="${baseViewBox}"/>`) : null;
    setWidth(String(baseSize?.width || 1024));
    setHeight(String(baseSize?.height || 1024));

    fetch(selected.url)
      .then((r) => r.text())
      .then((svg) => {
        const size = getViewBoxSize(svg);
        if (size) {
          setWidth(String(size.width));
          setHeight(String(size.height));
        }
      })
      .catch(() => {});
  }, [selected, generation.template?.slug]);

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [editMessages, editLoading]);

  async function toggleFavorite() {
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
    const ok = confirm("Удалить генерацию?");
    if (!ok) return;
    await fetch(`/api/projects/${generation.id}`, { method: "DELETE" });
    router.push("/projects");
    router.refresh();
  }

  async function handleDownload() {
    if (!selected) return;
    const name = `design-${generation.title || generation.template?.name || generation.id}`;

    try {
      if (format === "svg") {
        await downloadSvg(selected.url, `${name}.svg`);
      } else {
        const w = Number(width) || undefined;
        const h = Number(height) || undefined;
        const mime = format === "png" ? "image/png" : "image/jpeg";
        await downloadRaster(selected.url, `${name}.${format}`, mime, w, h);
      }
      toast("Скачивание началось");
    } catch (e) {
      console.error(e);
      toast.error("Не удалось скачать");
    }
  }

  function applyPreset(preset: string) {
    const parts = preset.split("x");
    if (parts.length === 2) {
      setWidth(parts[0]);
      setHeight(parts[1]);
    }
  }

  async function sendEdit() {
    const text = editInput.trim();
    if (!text || !selected) return;
    setEditMessages((prev) => [...prev, { role: "user", content: text }]);
    setEditInput("");
    setEditLoading(true);

    try {
      const res = await fetch(`/api/projects/${generation.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruction: text, selectedImageUrl: selected.url, count: 2 }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);

      if (json.clarificationQuestion) {
        setEditMessages((prev) => [...prev, { role: "assistant", content: json.clarificationQuestion }]);
      } else {
        const newImages = (json.images || []) as GenerationImage[];
        if (newImages.length > 0) {
          setImages((prev) => [...prev, ...newImages]);
          setSelected(newImages[0]);
          toast("Варианты отредактированы");
        }
        setEditMessages((prev) => [...prev, { role: "assistant", content: "Готово. Новые варианты добавлены ниже." }]);
      }
    } catch (e: any) {
      toast.error(e.message || "Не удалось отредактировать");
      setEditMessages((prev) => [...prev, { role: "assistant", content: "Ошибка: " + (e.message || "повторите позже") }]);
    } finally {
      setEditLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{generation.title || generation.template?.name}</h1>
          <p className="text-sm text-muted-foreground">Концепция: {generation.conceptName}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={toggleFavorite}>
            <Heart className={`mr-1 size-4 ${isFavorite ? "fill-red-500 text-red-500" : ""}`} />
            {isFavorite ? "В избранном" : "В избранное"}
          </Button>
          {onRegenerate && (
            <Button variant="outline" size="sm" onClick={onRegenerate}>
              <RefreshCw className="mr-1 size-4" />
              Новые варианты
            </Button>
          )}
          <Button variant="outline" size="sm" asChild>
            <Link href="/projects">Все проекты</Link>
          </Button>
          <Button variant="destructive" size="sm" onClick={deleteGeneration}>
            <Trash2 className="mr-1 size-4" />
            Удалить
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            {selected ? (
              <img
                src={selected.url}
                alt={selected.label || "result"}
                className="mx-auto max-h-[70vh] w-full object-contain"
              />
            ) : (
              <div className="flex h-96 items-center justify-center text-muted-foreground">
                Нет изображений
              </div>
            )}
          </CardContent>
          <CardFooter className="flex flex-col gap-4 border-t bg-muted/30 p-4">
            <div className="flex w-full flex-wrap items-end gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-muted-foreground">Формат</label>
                <Select value={format} onValueChange={(v) => setFormat(v as any)}>
                  <SelectTrigger className="w-28">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="svg">SVG</SelectItem>
                    <SelectItem value="png">PNG</SelectItem>
                    <SelectItem value="jpg">JPG</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {format !== "svg" && (
                <>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-muted-foreground">Ширина, px</label>
                    <Input
                      type="number"
                      min={1}
                      max={10000}
                      value={width}
                      onChange={(e) => setWidth(e.target.value)}
                      className="w-28"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-muted-foreground">Высота, px</label>
                    <Input
                      type="number"
                      min={1}
                      max={10000}
                      value={height}
                      onChange={(e) => setHeight(e.target.value)}
                      className="w-28"
                    />
                  </div>
                  <div className="flex flex-wrap gap-1 pb-1">
                    {["1080x1080", "1080x1920", "1200x630", "1920x1080", "1024x1024"].map((preset) => (
                      <Button
                        key={preset}
                        variant="outline"
                        size="sm"
                        type="button"
                        onClick={() => applyPreset(preset)}
                      >
                        {preset}
                      </Button>
                    ))}
                  </div>
                </>
              )}

              <Button className="ml-auto" onClick={handleDownload}>
                <Download className="mr-1 size-4" /> Скачать
              </Button>
            </div>
          </CardFooter>
        </Card>

        <div className="space-y-3">
          <h3 className="text-sm font-medium">Варианты</h3>
          {images.map((img) => (
            <button
              key={img.id}
              onClick={() => setSelected(img)}
              className={`flex w-full items-center gap-3 rounded-lg border p-2 text-left transition hover:bg-accent ${
                selected?.id === img.id ? "ring-2 ring-primary" : ""
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
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Правки через чат</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div
            ref={chatScrollRef}
            className="h-48 space-y-3 overflow-y-auto rounded-lg border bg-muted/30 p-3"
          >
            {editMessages.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Напишите, что хотите изменить, например: «Передвинь логотип выше» или «Сделай фон темнее».
              </p>
            )}
            {editMessages.map((m, i) => (
              <div
                key={i}
                className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
                    m.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-foreground"
                  }`}
                >
                  {m.content}
                </div>
              </div>
            ))}
            {editLoading && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Wand2 className="size-4 animate-pulse" />
                ИИ редактирует…
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <Textarea
              value={editInput}
              onChange={(e) => setEditInput(e.target.value)}
              placeholder="Напишите правку…"
              rows={2}
              className="min-h-0 flex-1 resize-none"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  sendEdit();
                }
              }}
            />
            <Button
              type="button"
              disabled={editLoading || !editInput.trim()}
              onClick={sendEdit}
            >
              <Send className="mr-1 size-4" />
              Отправить
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
