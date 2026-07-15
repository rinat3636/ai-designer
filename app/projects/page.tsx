"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Heart, Trash2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import type { Generation, GenerationWithTemplate } from "@/types";

export default function ProjectsPage() {
  const [generations, setGenerations] = useState<GenerationWithTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/projects")
      .then((r) => r.json())
      .then((json) => {
        setGenerations(json.generations || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  async function toggleFavorite(g: Generation) {
    const next = !g.isFavorite;
    await fetch(`/api/projects/${g.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isFavorite: next }),
    });
    setGenerations((prev) =>
      prev.map((x) => (x.id === g.id ? { ...x, isFavorite: next } : x))
    );
  }

  async function deleteGeneration(id: string) {
    if (!confirm("Удалить генерацию?")) return;
    await fetch(`/api/projects/${id}`, { method: "DELETE" });
    setGenerations((prev) => prev.filter((g) => g.id !== id));
    toast("Генерация удалена");
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl p-4 py-8">
        <Skeleton className="h-8 w-48" />
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-64 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl p-4 py-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Личный кабинет</h1>
          <p className="text-muted-foreground">История генераций и избранное</p>
        </div>
        <Button asChild>
          <Link href="/create">
            <Sparkles className="mr-1 size-4" /> Создать
          </Link>
        </Button>
      </div>

      {generations.length === 0 ? (
        <div className="mt-12 text-center">
          <p className="text-muted-foreground">У вас пока нет генераций.</p>
          <Button asChild className="mt-4">
            <Link href="/create">Создать первый дизайн</Link>
          </Button>
        </div>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {generations.map((g) => (
            <Card key={g.id} className="flex flex-col">
              <CardContent className="flex-1 p-0">
                <Link href={`/projects/${g.id}`}>
                  <img
                    src={g.images[0]?.url || "/placeholder.svg"}
                    alt={g.title || "generation"}
                    className="aspect-video w-full rounded-t-xl bg-muted object-contain"
                  />
                </Link>
                <div className="p-4">
                  <h3 className="font-medium">{g.title || g.template?.name}</h3>
                  <p className="text-sm text-muted-foreground">{g.conceptName}</p>
                  <div className="mt-2 flex gap-2">
                    {g.isFavorite && <Badge variant="secondary">Избранное</Badge>}
                    <Badge variant="outline">{g.template?.category}</Badge>
                  </div>
                </div>
              </CardContent>
              <CardFooter className="flex justify-between border-t bg-muted/30 p-3">
                <Button variant="ghost" size="sm" onClick={() => toggleFavorite(g)}>
                  <Heart className={`size-4 ${g.isFavorite ? "fill-red-500 text-red-500" : ""}`} />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => deleteGeneration(g.id)}>
                  <Trash2 className="size-4" />
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
