"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import * as Icons from "lucide-react";
import { ArrowLeft, Wand2, Sparkles, FileImage, Paperclip, Send } from "lucide-react";
import { ResultGallery } from "./result-gallery";
import type { Template, Brand, Generation, Concept, Brief } from "@/types";

type ChatContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

type ChatMessage = {
  role: "user" | "assistant";
  content: string | ChatContentPart[];
};

export function CreateWizard({
  templates,
}: {
  templates: Template[];
  brand: Brand | null;
}) {
  const [step, setStep] = useState(0);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentData, setCurrentData] = useState<Record<string, any>>({});
  const [inputText, setInputText] = useState("");
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [analysis, setAnalysis] = useState<string>("");
  const [selectedConcept, setSelectedConcept] = useState<Concept | null>(null);
  const [generation, setGeneration] = useState<Generation | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

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

  // Автопереход после выбора шаблона
  useEffect(() => {
    if (selectedTemplateId && step === 0) {
      setMessages([]);
      setCurrentData({});
      setInputText("");
      setSelectedImages([]);
      setStep(1);
    }
  }, [selectedTemplateId, step]);

  // Автопрокрутка чата вниз
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  // Автопереход к генерации после выбора концепции
  useEffect(() => {
    if (selectedConcept && step === 2) {
      generate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedConcept, step]);

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
        setStep(2);
      }
    } catch (e: any) {
      setError(e.message || "Ошибка интервью");
    } finally {
      setLoading(false);
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError("");
    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setSelectedImages((prev) => [...prev, json.url]);
    } catch (e: any) {
      setError(e.message || "Ошибка загрузки файла");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  async function generate() {
    if (!template || !selectedConcept) return;

    const brief = buildBrief();
    const data = (currentData.data || {}) as Record<string, string>;

    setLoading(true);
    setError("");
    setStep(3);

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
      setStep(4);
      toast.success("Макеты готовы!");
    } catch (e: any) {
      setError(e.message || "Ошибка генерации");
      setStep(2);
    } finally {
      setLoading(false);
    }
  }

  function restart() {
    setStep(0);
    setSelectedTemplateId("");
    setMessages([]);
    setCurrentData({});
    setInputText("");
    setSelectedImages([]);
    setConcepts([]);
    setAnalysis("");
    setSelectedConcept(null);
    setGeneration(null);
    setError("");
  }

  function handleBack() {
    if (step === 1) {
      setStep(0);
      setMessages([]);
      setCurrentData({});
      setInputText("");
      setSelectedImages([]);
      return;
    }
    if (step === 2) {
      setStep(1);
      return;
    }
    if (step === 4) {
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

  function renderInterviewStep() {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        <div className="text-center">
          <h1 className="text-2xl font-semibold">Диалог с ИИ-дизайнером</h1>
          <p className="text-muted-foreground">
            Отвечайте текстом или прикрепляйте фото-референсы. ИИ задаст нужные вопросы по одному.
          </p>
        </div>

        <Card className="flex h-[55vh] flex-col">
          <CardContent className="flex flex-1 flex-col gap-4 overflow-hidden p-4">
            <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto pr-2">
              {messages.length === 0 && (
                <div className="text-center text-sm text-muted-foreground">
                  Напишите первое сообщение, например: «Нужен логотип для кофейни в стиле минимализма».
                </div>
              )}
              {messages.map((m, i) => (
                <div
                  key={i}
                  className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[85%] rounded-xl px-4 py-3 text-sm ${
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
                  ИИ печатает…
                </div>
              )}
            </div>

            {selectedImages.length > 0 && (
              <div className="flex flex-wrap gap-2 border-t pt-2">
                {selectedImages.map((url) => (
                  <div key={url} className="relative">
                    <img
                      src={url}
                      alt="Референс"
                      className="h-16 w-16 rounded-lg border object-cover"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setSelectedImages((prev) => prev.filter((u) => u !== url))
                      }
                      className="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full bg-destructive text-xs text-white"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-2 border-t pt-3">
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
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
              >
                <Paperclip className="size-4" />
              </Button>
              <Textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Ваш ответ…"
                rows={2}
                className="min-h-0 flex-1 resize-none"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                  }
                }}
              />
              <Button
                type="button"
                disabled={loading || (!inputText.trim() && selectedImages.length === 0)}
                onClick={sendMessage}
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

  function renderConceptsStep() {
    return (
      <div className="space-y-6">
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
                {c.explanation && (
                  <p className="text-sm text-muted-foreground">{c.explanation}</p>
                )}
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

  function renderStep() {
    switch (step) {
      case 0:
        return (
          <div className="space-y-6">
            <div className="text-center">
              <h1 className="text-2xl font-semibold">Выберите тип дизайна</h1>
              <p className="text-muted-foreground">
                После выбора начнётся диалог с ИИ-дизайнером
              </p>
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

      case 1:
        return renderInterviewStep();

      case 2:
        if (loading) {
          return (
            <div className="space-y-6 text-center">
              <Wand2 className="mx-auto size-10 animate-pulse text-primary" />
              <h2 className="text-2xl font-semibold">Готовим концепции</h2>
              <div className="mx-auto max-w-md space-y-3">
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-24 w-full" />
              </div>
            </div>
          );
        }
        return renderConceptsStep();

      case 3:
        return (
          <div className="space-y-6 text-center">
            <Sparkles className="mx-auto size-12 animate-pulse text-primary" />
            <h2 className="text-2xl font-semibold">Генерируем макеты</h2>
            <p className="text-muted-foreground">Это может занять до одной минуты</p>
            <Progress value={33} className="mx-auto max-w-md" />
          </div>
        );

      case 4:
        if (generation) {
          return <ResultGallery generation={generation} onRegenerate={() => { setStep(2); generate(); }} />;
        }
        return null;

      default:
        return null;
    }
  }

  function renderBottomControls() {
    if (step === 0 || step === 3) return null;

    if (step === 4) {
      return (
        <div className="mt-8 flex justify-center gap-3">
          <Button variant="outline" onClick={restart}>
            Создать новый дизайн
          </Button>
          <Button asChild>
            <Link href="/projects">В личный кабинет</Link>
          </Button>
        </div>
      );
    }

    return (
      <div className="mt-8 flex items-center justify-between">
        <Button variant="outline" onClick={handleBack} disabled={loading}>
          <ArrowLeft className="mr-1 size-4" /> Назад
        </Button>
        <div />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl p-4 py-8">
      {error && (
        <div className="mb-4 rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}
      {renderStep()}
      {renderBottomControls()}
    </div>
  );
}
