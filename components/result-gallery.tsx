"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Heart, Trash2, RefreshCw, FileImage, Image as ImageIcon } from "lucide-react";
import { downloadSvg, downloadRaster } from "@/lib/client-image";
import type { Generation } from "@/types";
import type { GenerationImage } from "@prisma/client";

export function ResultGallery({ generation, onRegenerate }: { generation: Generation; onRegenerate?: () => void }) {
  const router = useRouter();
  const [isFavorite, setIsFavorite] = useState(generation.isFavorite);
  const [selected, setSelected] = useState<GenerationImage | null>(generation.images[0] || null);

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

  async function handleDownload(format: "svg" | "png" | "jpg") {
    if (!selected) return;
    const name = `design-${generation.title || generation.template?.name || generation.id}`;
    try {
      if (format === "svg") {
        await downloadSvg(selected.url, `${name}.svg`);
      } else {
        await downloadRaster(selected.url, `${name}.${format}`, format === "png" ? "image/png" : "image/jpeg");
      }
      toast("Скачивание началось");
    } catch (e) {
      console.error(e);
      toast.error("Не удалось скачать");
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
          <CardFooter className="flex flex-wrap gap-2 border-t bg-muted/30">
            <Button size="sm" onClick={() => handleDownload("svg")}>
              <FileImage className="mr-1 size-4" /> SVG
            </Button>
            <Button size="sm" variant="secondary" onClick={() => handleDownload("png")}>
              <ImageIcon className="mr-1 size-4" /> PNG
            </Button>
            <Button size="sm" variant="secondary" onClick={() => handleDownload("jpg")}>
              <ImageIcon className="mr-1 size-4" /> JPG
            </Button>
          </CardFooter>
        </Card>

        <div className="space-y-3">
          <h3 className="text-sm font-medium">Варианты</h3>
          {generation.images.map((img) => (
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
    </div>
  );
}
