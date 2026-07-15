"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import * as Icons from "lucide-react";
import { ArrowLeft, ArrowRight, Wand2, Sparkles, FileImage } from "lucide-react";
import { ResultGallery } from "./result-gallery";
import type { Template, Brand, Generation, Concept, Brief } from "@/types";

type FieldDef = { name: string; label: string; type: string; required?: boolean };

type WizardField = FieldDef & { options?: string[]; placeholder?: string };

export function CreateWizard({
  templates,
  brand,
}: {
  templates: Template[];
  brand: Brand | null;
}) {
  const [step, setStep] = useState(0);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [brief, setBrief] = useState<Brief>(() => ({
    companyName: brand?.companyName || "",
    businessDesc: brand?.businessDesc || "",
    website: brand?.website || "",
    targetAudience: brand?.targetAudience || "",
    style: brand?.style || "",
    colors: Array.isArray(brand?.colors) ? (brand?.colors as string[]) : undefined,
    logoUrl: brand?.logoUrl || "",
  }));
  const [briefStep, setBriefStep] = useState(0);
  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [analysis, setAnalysis] = useState<string>("");
  const [selectedConcept, setSelectedConcept] = useState<Concept | null>(null);
  const [data, setData] = useState<Record<string, string>>({});
  const [dataStep, setDataStep] = useState(0);
  const [generation, setGeneration] = useState<Generation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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

  const fields = useMemo<FieldDef[]>(() => {
    if (!template) return [];
    const f = template.fields as any;
    if (Array.isArray(f)) return f;
    return [];
  }, [template]);

  const briefFields = useMemo<WizardField[]>(() => {
    const items: WizardField[] = [
      {
        name: "businessDesc",
        label: "Чем занимается компания?",
        type: "textarea",
        required: true,
        placeholder: "Например, интернет-магазин дизайнерской мебели",
      },
      { name: "companyName", label: "Название компании", type: "text", required: true },
      { name: "targetAudience", label: "Целевая аудитория", type: "text" },
      { name: "website", label: "Сайт", type: "url" },
      {
        name: "style",
        label: "Предпочитаемый стиль",
        type: "select",
        options: ["Минимализм", "Премиум", "Современный", "Яркий продающий", "Корпоративный"],
      },
      {
        name: "colors",
        label: "Фирменные цвета (через запятую)",
        type: "text",
        placeholder: "#2563eb, #f8fafc",
      },
      { name: "logoUrl", label: "URL логотипа (опционально)", type: "url" },
    ];
    return items;
  }, []);

  async function generateConcepts() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/concepts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brief, templateId: template?.id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error);
      setAnalysis(json.analysis || "");
      setConcepts(json.concepts || []);
    } catch (e: any) {
      setError(e.message || "Ошибка генерации концепций");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (step === 2) {
      generateConcepts();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  function iconFor(name?: string) {
    const Icon = name ? (Icons as any)[name] || FileImage : FileImage;
    return Icon ? <Icon className="size-6" /> : <FileImage className="size-6" />;
  }

  function brandDefault(name: string) {
    if (name === "companyName" || name === "headline") return brand?.companyName || brief.companyName || "";
    if (name === "website") return brand?.website || brief.website || "";
    if (name === "phone") return brand?.phone || "";
    if (name === "telegram") return brand?.telegram || "";
    if (name === "email") return brand?.email || "";
    if (name === "address") return brand?.address || "";
    if (name === "buttonText") return "Подробнее";
    if (name === "discount") return "";
    if (name === "subheadline" || name === "productDesc" || name === "features") return brief.businessDesc || "";
    if (name === "productName") return brief.companyName || "";
    if (name === "price" || name === "oldPrice") return "";
    if (name === "style") return brief.style || "";
    return "";
  }

  function computeDataDefaults() {
    const defaults: Record<string, string> = {};
    for (const f of fields) {
      defaults[f.name] = brandDefault(f.name);
    }
    return defaults;
  }

  async function generate(finalData: Record<string, string>) {
    if (!template || !selectedConcept) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateId: template.id,
          brief,
          concept: selectedConcept,
          data: finalData,
          count: 4,
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
      setStep(5);
      toast.success("Макеты готовы!");
    } catch (e: any) {
      setError(e.message || "Ошибка генерации");
    } finally {
      setLoading(false);
    }
  }

  function restart() {
    setStep(0);
    setSelectedTemplateId("");
    setBriefStep(0);
    setDataStep(0);
    setConcepts([]);
    setAnalysis("");
    setSelectedConcept(null);
    setData({});
    setGeneration(null);
    setError("");
  }

  function currentBriefRequiredFilled() {
    const f = briefFields[briefStep];
    if (!f) return true;
    if (!f.required) return true;
    const value = brief[f.name as keyof Brief];
    if (f.name === "colors") {
      return Array.isArray(value) && value.length > 0;
    }
    return typeof value === "string" ? value.trim().length > 0 : false;
  }

  function currentDataRequiredFilled() {
    const f = fields[dataStep];
    if (!f) return true;
    if (!f.required) return true;
    const value = data[f.name];
    return typeof value === "string" ? value.trim().length > 0 : false;
  }

  function nextDisabled() {
    if (loading) return true;
    if (step === 0) return !template;
    if (step === 1) return !currentBriefRequiredFilled();
    if (step === 2) return !selectedConcept;
    if (step === 3) return !currentDataRequiredFilled();
    return false;
  }

  function handleNext() {
    if (step === 0) {
      setBriefStep(0);
      setStep(1);
      return;
    }

    if (step === 1) {
      if (briefStep < briefFields.length - 1) {
        setBriefStep(briefStep + 1);
        return;
      }
      setStep(2);
      return;
    }

    if (step === 2) {
      setDataStep(0);
      setData(computeDataDefaults());
      setStep(3);
      return;
    }

    if (step === 3) {
      if (dataStep < fields.length - 1) {
        setDataStep(dataStep + 1);
        return;
      }
      const finalData = { ...computeDataDefaults(), ...data };
      setData(finalData);
      setStep(4);
      generate(finalData);
      return;
    }
  }

  function handleBack() {
    if (step === 1) {
      if (briefStep > 0) {
        setBriefStep(briefStep - 1);
        return;
      }
      setStep(0);
      return;
    }

    if (step === 3) {
      if (dataStep > 0) {
        setDataStep(dataStep - 1);
        return;
      }
      setStep(2);
      return;
    }

    if (step === 5) {
      // Returning to results does not make sense to edit; just go home.
      restart();
      return;
    }

    setStep(Math.max(0, step - 1));
  }

  function renderField(
    f: WizardField,
    value: string,
    onChange: (val: string) => void
  ) {
    if (f.type === "textarea") {
      return (
        <Textarea
          id={f.name}
          value={value}
          placeholder={f.placeholder || ""}
          onChange={(e) => onChange(e.target.value)}
          rows={4}
        />
      );
    }

    if (f.type === "select" && f.options) {
      return (
        <Select value={value || undefined} onValueChange={(v) => onChange(v || "")}>
          <SelectTrigger id={f.name}>
            <SelectValue placeholder="Выберите стиль" />
          </SelectTrigger>
          <SelectContent>
            {f.options.map((o) => (
              <SelectItem key={o} value={o}>
                {o}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }

    return (
      <Input
        id={f.name}
        type={f.type || "text"}
        value={value}
        placeholder={f.placeholder || ""}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }

  function renderBriefStep() {
    const f = briefFields[briefStep];
    if (!f) return null;

    const value =
      f.name === "colors"
        ? Array.isArray(brief.colors)
          ? brief.colors.join(", ")
          : ""
        : (brief[f.name as keyof Brief] as string) || "";

    function update(val: string) {
      if (f.name === "colors") {
        setBrief({
          ...brief,
          colors: val.split(/[,;]/).map((c) => c.trim()).filter(Boolean),
        });
      } else {
        setBrief({ ...brief, [f.name]: val });
      }
    }

    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">{f.label}</h1>
          <p className="text-muted-foreground">
            Вопрос {briefStep + 1} из {briefFields.length}
          </p>
        </div>
        <Card>
          <CardContent className="space-y-4 pt-6">
            <div className="space-y-2">
              <Label htmlFor={f.name}>
                {f.label} {f.required && <span className="text-destructive">*</span>}
              </Label>
              {renderField(f, value, update)}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  function renderDataStep() {
    if (fields.length === 0) {
      return (
        <div className="mx-auto max-w-2xl space-y-6 text-center">
          <h1 className="text-2xl font-semibold">Детали макета</h1>
          <p className="text-muted-foreground">Для этого шаблона не нужно заполнять дополнительные данные.</p>
          <p className="text-muted-foreground">Нажмите «Сгенерировать», чтобы продолжить.</p>
        </div>
      );
    }

    const f = fields[dataStep];
    if (!f) return null;

    const value = data[f.name] ?? "";

    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">{f.label}</h1>
          <p className="text-muted-foreground">
            {dataStep + 1} из {fields.length}
          </p>
        </div>
        <Card>
          <CardContent className="space-y-4 pt-6">
            <div className="space-y-2">
              <Label htmlFor={f.name}>
                {f.label} {f.required && <span className="text-destructive">*</span>}
              </Label>
              {f.type === "textarea" ? (
                <Textarea
                  id={f.name}
                  value={value}
                  onChange={(e) => setData({ ...data, [f.name]: e.target.value })}
                  rows={4}
                />
              ) : (
                <Input
                  id={f.name}
                  type={f.type || "text"}
                  value={value}
                  onChange={(e) => setData({ ...data, [f.name]: e.target.value })}
                />
              )}
            </div>
          </CardContent>
        </Card>
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
              <p className="text-muted-foreground">Выберите шаблон, который ближе всего к вашей задаче</p>
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
        return renderBriefStep();

      case 2:
        if (loading) {
          return (
            <div className="space-y-6 text-center">
              <Wand2 className="mx-auto size-10 animate-pulse text-primary" />
              <h2 className="text-2xl font-semibold">Анализируем нишу и генерируем концепции</h2>
              <div className="mx-auto max-w-md space-y-3">
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-24 w-full" />
                <Skeleton className="h-24 w-full" />
              </div>
            </div>
          );
        }
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

      case 3:
        return renderDataStep();

      case 4:
        return (
          <div className="space-y-6 text-center">
            <Sparkles className="mx-auto size-12 animate-pulse text-primary" />
            <h2 className="text-2xl font-semibold">Генерируем макеты</h2>
            <p className="text-muted-foreground">Это может занять до одной минуты</p>
            <Progress value={33} className="mx-auto max-w-md" />
          </div>
        );

      case 5:
        if (generation) {
          return <ResultGallery generation={generation} onRegenerate={() => { setStep(4); generate(data); }} />;
        }
        return null;

      default:
        return null;
    }
  }

  const nextLabel =
    step === 0 ? "Начать" :
    step === 1 ? (briefStep < briefFields.length - 1 ? "Далее" : "Продолжить") :
    step === 2 ? "Далее" :
    step === 3 ? (fields.length > 0 && dataStep < fields.length - 1 ? "Далее" : "Сгенерировать") :
    "Далее";

  return (
    <div className="mx-auto max-w-6xl p-4 py-8">
      {error && (
        <div className="mb-4 rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          {error}
        </div>
      )}
      {renderStep()}

      {step < 5 && (
        <div className="mt-8 flex items-center justify-between">
          <Button variant="outline" onClick={handleBack} disabled={step === 0 || loading}>
            <ArrowLeft className="mr-1 size-4" /> Назад
          </Button>
          {step === 4 ? (
            <Button disabled>
              <Sparkles className="mr-1 size-4 animate-spin" /> Генерация...
            </Button>
          ) : (
            <Button onClick={handleNext} disabled={nextDisabled()}>
              {step === 3 && fields.length > 0 && dataStep === fields.length - 1 ? (
                <>
                  <Sparkles className="mr-1 size-4" /> Сгенерировать
                </>
              ) : (
                <>
                  {nextLabel} <ArrowRight className="ml-1 size-4" />
                </>
              )}
            </Button>
          )}
        </div>
      )}

      {step === 5 && (
        <div className="mt-8 flex justify-center gap-3">
          <Button variant="outline" onClick={restart}>
            Создать новый дизайн
          </Button>
          <Button asChild>
            <Link href="/projects">В личный кабинет</Link>
          </Button>
        </div>
      )}
    </div>
  );
}
