import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Sparkles,
  Palette,
  ShoppingBag,
  Megaphone,
  Share2,
  PenTool,
  Monitor,
  Zap,
  Layers,
} from "lucide-react";

const categories = [
  { icon: ShoppingBag, title: "Маркетплейсы", desc: "Карточки, баннеры акций, обложки магазинов" },
  { icon: Megaphone, title: "Реклама", desc: "Баннеры, афиши, постеры, билборды" },
  { icon: Share2, title: "Соцсети", desc: "Посты, Stories, карусели, обложки" },
  { icon: PenTool, title: "Брендинг", desc: "Логотипы, визитки, сертификаты, флаеры" },
  { icon: Monitor, title: "Для сайта", desc: "Hero-баннеры, иконки, иллюстрации" },
];

const steps = [
  { icon: Layers, title: "1. Выберите тип", desc: "Категория и шаблон под вашу задачу" },
  { icon: Zap, title: "2. Ответьте на вопросы", desc: "ИИ сам проанализирует нишу и тренды" },
  { icon: Palette, title: "3. Получите макеты", desc: "4-8 вариантов в едином стиле" },
];

export default function HomePage() {
  return (
    <div className="flex flex-col">
      <section className="relative overflow-hidden border-b bg-background px-4 py-24 sm:py-32">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_right,var(--accent),transparent_40%)]" />
        <div className="mx-auto max-w-4xl text-center">
          <h1 className="font-heading text-4xl font-semibold tracking-tight sm:text-6xl">
            ИИ-дизайнер для вашего бизнеса
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
            Создавайте профессиональные рекламные материалы без сложных промптов. AI Designer
            сам анализирует нишу, предлагает концепции и генерирует готовые макеты.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Button asChild size="lg">
              <Link href="/create">Создать дизайн</Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link href="/pricing">Тарифы</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="px-4 py-20">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-center text-2xl font-semibold sm:text-3xl">Как это работает</h2>
          <div className="mt-10 grid gap-6 sm:grid-cols-3">
            {steps.map((s) => (
              <Card key={s.title} className="text-center">
                <CardContent className="flex flex-col items-center gap-3 pt-6">
                  <div className="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <s.icon className="size-6" />
                  </div>
                  <h3 className="font-medium">{s.title}</h3>
                  <p className="text-sm text-muted-foreground">{s.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-muted/30 px-4 py-20">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-center text-2xl font-semibold sm:text-3xl">Что можно создать</h2>
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {categories.map((c) => (
              <Card key={c.title}>
                <CardContent className="flex items-start gap-4 pt-6">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
                    <c.icon className="size-5" />
                  </div>
                  <div>
                    <h3 className="font-medium">{c.title}</h3>
                    <p className="text-sm text-muted-foreground">{c.desc}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 py-20 text-center">
        <div className="mx-auto max-w-2xl">
          <Sparkles className="mx-auto size-10 text-primary" />
          <h2 className="mt-4 text-2xl font-semibold sm:text-3xl">Готовы попробовать?</h2>
          <p className="mt-4 text-muted-foreground">
            Первые генерации бесплатно. Никаких сложных промптов — просто ответьте на вопросы.
          </p>
          <Button asChild size="lg" className="mt-8">
            <Link href="/create">Начать бесплатно</Link>
          </Button>
        </div>
      </section>
    </div>
  );
}
